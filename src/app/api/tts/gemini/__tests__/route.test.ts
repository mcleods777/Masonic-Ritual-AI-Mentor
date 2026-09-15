// @vitest-environment node
/**
 * Route-level integration tests for POST /api/tts/gemini (SAFETY-03).
 *
 * Covers the four behaviors the SAFETY-03 plan calls out for the
 * "representative triad" that exercises the hardest paid-route case
 * (Gemini uses per-audio-token pricing via the SSE stream):
 *
 *   1. Happy path: guard passes → upstream fetch succeeds → audit record
 *      emitted via console.log("[AUDIT]", ...) with kind:"tts" +
 *      route:"/api/tts/gemini".
 *   2. Rate-limit: 60 successful POSTs are allowed; the 61st returns 429
 *      with a Retry-After header.
 *   3. Kill-switch: when RITUAL_EMERGENCY_DISABLE_PAID="true", POST
 *      returns 503 + {error:"paid_disabled", fallback:"pre-baked"}.
 *   4. No emit on upstream error: when Gemini returns 5xx, the route
 *      returns an error and [AUDIT] is NEVER logged.
 *
 * Uses signClientToken from @/lib/auth to authorise requests (the
 * paid-route-guard verifies tokenPayload.sub after Plan 05).
 */

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../route";
import { signClientToken } from "@/lib/auth";
import { __resetRateLimitForTests } from "@/lib/rate-limit";
import { __resetSpendTallyForTests } from "@/lib/spend-tally";

const GOOD_SECRET = "test-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"; // 44 chars

/**
 * Encode one valid Gemini SSE response chunk carrying 1 kB of PCM.
 * Google streams `data: {"candidates":[{"content":{"parts":[{"inlineData":
 * {"mimeType":"audio/L16;codec=pcm;rate=24000","data":"<b64>"}}]}}]}\n\n`
 * and the route concatenates one or more of these into a WAV.
 */
function geminiSseBody(pcmBytes: number): Uint8Array {
  const pcm = Buffer.alloc(pcmBytes, 0x01);
  const audioB64 = pcm.toString("base64");
  const payload = JSON.stringify({
    candidates: [
      {
        content: {
          parts: [
            {
              inlineData: {
                mimeType: "audio/L16;codec=pcm;rate=24000",
                data: audioB64,
              },
            },
          ],
        },
      },
    ],
  });
  const body = `data: ${payload}\n\n`;
  return new TextEncoder().encode(body);
}

function okGeminiResponse(pcmBytes = 1024): Response {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(geminiSseBody(pcmBytes));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

async function makeAuthedRequest(opts: {
  hashedUser: string;
  body: unknown;
}): Promise<NextRequest> {
  const token = await signClientToken(opts.hashedUser);
  return new NextRequest(
    new URL("http://localhost:3000/api/tts/gemini"),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(opts.body),
    },
  );
}

describe("POST /api/tts/gemini (SAFETY-03 guard + audit)", () => {
  let originalSecret: string | undefined;
  let originalApiKey: string | undefined;
  let logSpy: ReturnType<typeof vi.spyOn> | null = null;
  let fetchSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    originalSecret = process.env.JWT_SECRET;
    originalApiKey = process.env.GOOGLE_GEMINI_API_KEY;
    process.env.JWT_SECRET = GOOD_SECRET;
    process.env.GOOGLE_GEMINI_API_KEY = "test-gemini-key";
    __resetRateLimitForTests();
    __resetSpendTallyForTests();
  });

  afterEach(() => {
    delete process.env.RITUAL_EMERGENCY_DISABLE_PAID;
    process.env.JWT_SECRET = originalSecret;
    process.env.GOOGLE_GEMINI_API_KEY = originalApiKey;
    __resetRateLimitForTests();
    __resetSpendTallyForTests();
    logSpy?.mockRestore();
    fetchSpy?.mockRestore();
    logSpy = null;
    fetchSpy = null;
  });

  it("happy path: returns audio + emits [AUDIT] with kind:tts + route:/api/tts/gemini + 16-hex hashedUser", async () => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(okGeminiResponse());

    const req = await makeAuthedRequest({
      hashedUser: "abcdef0123456789",
      body: { text: "The lodge is duly opened.", voice: "Alnilam" },
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const contentType = res.headers.get("Content-Type");
    expect(contentType).toBe("audio/wav");

    // Find the [AUDIT] log call.
    const auditCalls = logSpy.mock.calls.filter((c) => c[0] === "[AUDIT]");
    expect(auditCalls.length).toBe(1);
    const record = JSON.parse(auditCalls[0][1] as string);
    expect(record.kind).toBe("tts");
    expect(record.route).toBe("/api/tts/gemini");
    expect(record.hashedUser).toBe("abcdef0123456789");
    expect(typeof record.promptHash).toBe("string");
    expect(record.promptHash).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof record.completionHash).toBe("string");
    expect(record.completionHash).toMatch(/^[0-9a-f]{64}$/);
    expect(record.charCount).toBe("The lodge is duly opened.".length);
    expect(record.voice).toBe("Alnilam");
    expect(typeof record.model).toBe("string");
    expect(record.model.startsWith("gemini-")).toBe(true);
    expect(typeof record.latencyMs).toBe("number");
    expect(typeof record.estimatedCostUSD).toBe("number");
  });

  it("rate-limit: 60 successful POSTs allowed, 61st returns 429 + Retry-After", async () => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => okGeminiResponse(512));

    const hashedUser = "ratelimituser111"; // 16-hex sub claim
    for (let i = 0; i < 60; i++) {
      const req = await makeAuthedRequest({
        hashedUser,
        body: { text: `line ${i}`, voice: "Alnilam" },
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
    }

    const over = await makeAuthedRequest({
      hashedUser,
      body: { text: "too many", voice: "Alnilam" },
    });
    const overRes = await POST(over);
    expect(overRes.status).toBe(429);
    expect(overRes.headers.get("Retry-After")).not.toBeNull();
    const body = await overRes.json();
    expect(body).toEqual({ error: "rate_limited" });
  });

  it("kill-switch: 503 + {error:'paid_disabled', fallback:'pre-baked'} when env flag is literal 'true'", async () => {
    process.env.RITUAL_EMERGENCY_DISABLE_PAID = "true";
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    // fetch should NEVER be called — guard denies before upstream fetch.
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => {
        throw new Error("fetch must not be called when kill-switch is on");
      });

    const req = await makeAuthedRequest({
      hashedUser: "killswitch222222",
      body: { text: "suppressed", voice: "Alnilam" },
    });
    const res = await POST(req);

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ error: "paid_disabled", fallback: "pre-baked" });
    expect(fetchSpy).not.toHaveBeenCalled();

    // No audit emitted on denied request.
    const auditCalls = logSpy.mock.calls.filter((c) => c[0] === "[AUDIT]");
    expect(auditCalls.length).toBe(0);
  });

  it("no emit on upstream error (5xx): route surfaces the error and [AUDIT] is never logged", async () => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    // Spy on console.error too, since the route logs upstream failures.
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("boom", {
        status: 502,
        headers: { "Content-Type": "text/plain" },
      }),
    );

    const req = await makeAuthedRequest({
      hashedUser: "errorpath3333333",
      body: { text: "will error", voice: "Alnilam" },
    });
    const res = await POST(req);

    expect(res.status).toBe(502);
    const auditCalls = logSpy.mock.calls.filter((c) => c[0] === "[AUDIT]");
    expect(auditCalls.length).toBe(0);
  });
});
