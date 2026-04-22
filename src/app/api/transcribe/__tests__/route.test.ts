// @vitest-environment node
/**
 * Route-level integration tests for POST /api/transcribe (SAFETY-03).
 *
 * Representative route for the formData body shape. The guard must fire
 * BEFORE any body parsing (formData is the body and the guard only
 * reads headers/cookies).
 *
 * Covers:
 *   1. Happy path: valid audio + Bearer → 200 + {transcript}, and
 *      [AUDIT] is logged with kind:"stt" + route:"/api/transcribe".
 *   2. Rate-limit: 61st call from the same hashedUser → 429.
 *   3. No emit on upstream error: Groq Whisper 5xx → no [AUDIT] call.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../route";
import { signClientToken } from "@/lib/auth";
import { __resetRateLimitForTests } from "@/lib/rate-limit";
import { __resetSpendTallyForTests } from "@/lib/spend-tally";

const GOOD_SECRET = "test-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"; // 44 chars

function okWhisperResponse(transcript: string): Response {
  return new Response(JSON.stringify({ text: transcript }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function makeAuthedRequest(opts: {
  hashedUser: string;
  audio?: Blob;
}): Promise<NextRequest> {
  const token = await signClientToken(opts.hashedUser);
  const form = new FormData();
  const blob =
    opts.audio ?? new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/webm" });
  form.append("audio", blob, "recording.webm");
  return new NextRequest(
    new URL("http://localhost:3000/api/transcribe"),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
      },
      body: form,
    },
  );
}

describe("POST /api/transcribe (SAFETY-03 guard + audit)", () => {
  let originalSecret: string | undefined;
  let originalApiKey: string | undefined;
  let logSpy: ReturnType<typeof vi.spyOn> | null = null;
  let fetchSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    originalSecret = process.env.JWT_SECRET;
    originalApiKey = process.env.GROQ_API_KEY;
    process.env.JWT_SECRET = GOOD_SECRET;
    process.env.GROQ_API_KEY = "test-groq-key";
    __resetRateLimitForTests();
    __resetSpendTallyForTests();
  });

  afterEach(() => {
    delete process.env.RITUAL_EMERGENCY_DISABLE_PAID;
    process.env.JWT_SECRET = originalSecret;
    process.env.GROQ_API_KEY = originalApiKey;
    __resetRateLimitForTests();
    __resetSpendTallyForTests();
    logSpy?.mockRestore();
    fetchSpy?.mockRestore();
    logSpy = null;
    fetchSpy = null;
  });

  it("happy path: returns {transcript} and emits [AUDIT] with kind:stt + route:/api/transcribe", async () => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(okWhisperResponse("so mote it be"));

    const req = await makeAuthedRequest({ hashedUser: "stt01231234abcdef" });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { transcript: string };
    expect(body.transcript).toBe("so mote it be");

    const auditCalls = logSpy.mock.calls.filter((c) => c[0] === "[AUDIT]");
    expect(auditCalls.length).toBe(1);
    const record = JSON.parse(auditCalls[0][1] as string);
    expect(record.kind).toBe("stt");
    expect(record.route).toBe("/api/transcribe");
    expect(record.hashedUser).toBe("stt01231234abcdef");
    expect(record.model).toBe("groq-whisper-large-v3");
    expect(typeof record.durationMs).toBe("number");
    expect(typeof record.audioByteCount).toBe("number");
    expect(record.audioByteCount).toBeGreaterThan(0);
    expect(typeof record.estimatedCostUSD).toBe("number");
  });

  it("rate-limit: 61st call from same hashedUser returns 429", async () => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => okWhisperResponse("duly tiled"));

    const hashedUser = "sttrate11111abcd";
    for (let i = 0; i < 60; i++) {
      const req = await makeAuthedRequest({ hashedUser });
      const res = await POST(req);
      expect(res.status).toBe(200);
    }

    const over = await makeAuthedRequest({ hashedUser });
    const overRes = await POST(over);
    expect(overRes.status).toBe(429);
    expect(overRes.headers.get("Retry-After")).not.toBeNull();
  });

  it("no emit on upstream 5xx: [AUDIT] is never logged", async () => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response("boom", { status: 502, statusText: "Bad Gateway" }),
      );

    const req = await makeAuthedRequest({ hashedUser: "stterr123456789a" });
    const res = await POST(req);
    expect(res.status).toBe(502);
    const auditCalls = logSpy.mock.calls.filter((c) => c[0] === "[AUDIT]");
    expect(auditCalls.length).toBe(0);
  });
});
