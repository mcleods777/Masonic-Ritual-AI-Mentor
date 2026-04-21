// @vitest-environment node
/**
 * Route-level integration tests for POST /api/rehearsal-feedback
 * (SAFETY-03 + SAFETY-06 server-side counter).
 *
 * Covers:
 *   1. Happy path: valid body + Bearer → 200 + streamed feedback text,
 *      and [AUDIT] logged with kind:"feedback" + route:
 *      "/api/rehearsal-feedback".
 *   2. Feedback-burst (SAFETY-06 server belt-and-suspenders): 301st call
 *      from the same hashedUser within a 5-min window → 429 with
 *      error:"feedback_burst" (distinct from the guard's generic
 *      rate_limited). This test uses routeName "feedback" which has a
 *      per-user-hour cap of 60 — the 5-min counter tripping BEFORE the
 *      hour cap would require >300 calls in the same hour (impossible
 *      under the 60/hr cap), so this test covers the shape by mocking a
 *      fresh 5-min bucket that fills to 300 and asserts the 301st
 *      response body is feedback_burst.
 *   3. Kill-switch: RITUAL_EMERGENCY_DISABLE_PAID="true" → 503 +
 *      {error:"paid_disabled", fallback:"diff-only"}.
 *
 * NOTE: Because the per-user-hour cap (60) is stricter than the 5-min
 * burst cap (300), the only way to isolate burst-counter behavior in a
 * unit test is to reset the rate-limit map between user-level calls and
 * inject many calls for the SAME hashed-user against the burst key.
 * The burst-counter test below does exactly that: it pre-seeds the
 * `feedback:5min:<hashedUser>` bucket up to its 300 limit via the
 * rateLimit helper directly, then makes one guarded call and asserts
 * that call returns feedback_burst. That exercises the counter-tripping
 * branch without fighting the hour cap.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../route";
import { signClientToken } from "@/lib/auth";
import { rateLimit, __resetRateLimitForTests } from "@/lib/rate-limit";
import { __resetSpendTallyForTests } from "@/lib/spend-tally";

const GOOD_SECRET = "test-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"; // 44 chars

/**
 * Build one Groq-style SSE response body delivering a short chunk of
 * feedback text followed by [DONE].
 */
function okFeedbackResponse(text: string): Response {
  const chunk = JSON.stringify({
    choices: [{ delta: { content: text } }],
  });
  const body = `data: ${chunk}\n\ndata: [DONE]\n\n`;
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(body));
        controller.close();
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    },
  );
}

async function makeAuthedRequest(opts: {
  hashedUser: string;
  body?: Record<string, unknown>;
}): Promise<NextRequest> {
  const token = await signClientToken(opts.hashedUser);
  const body = opts.body ?? {
    accuracy: 85,
    wrongWords: 3,
    missingWords: 1,
    troubleSpots: ["middle section"],
    lineNumber: 5,
    totalLines: 20,
  };
  return new NextRequest(
    new URL("http://localhost:3000/api/rehearsal-feedback"),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
}

async function consumeStream(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

describe("POST /api/rehearsal-feedback (SAFETY-03 + SAFETY-06)", () => {
  let originalSecret: string | undefined;
  let originalGroq: string | undefined;
  let originalMistral: string | undefined;
  let logSpy: ReturnType<typeof vi.spyOn> | null = null;
  let fetchSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    originalSecret = process.env.JWT_SECRET;
    originalGroq = process.env.GROQ_API_KEY;
    originalMistral = process.env.MISTRAL_API_KEY;
    process.env.JWT_SECRET = GOOD_SECRET;
    process.env.GROQ_API_KEY = "test-groq-key";
    __resetRateLimitForTests();
    __resetSpendTallyForTests();
  });

  afterEach(() => {
    delete process.env.RITUAL_EMERGENCY_DISABLE_PAID;
    process.env.JWT_SECRET = originalSecret;
    process.env.GROQ_API_KEY = originalGroq;
    process.env.MISTRAL_API_KEY = originalMistral;
    __resetRateLimitForTests();
    __resetSpendTallyForTests();
    logSpy?.mockRestore();
    fetchSpy?.mockRestore();
    logSpy = null;
    fetchSpy = null;
  });

  it("happy path: streams feedback + emits [AUDIT] with kind:feedback", async () => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(okFeedbackResponse("Nice work, Brother."));

    const req = await makeAuthedRequest({ hashedUser: "fb01abcd12345678" });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const text = await consumeStream(res);
    expect(text).toContain("Nice work, Brother.");

    const auditCalls = logSpy.mock.calls.filter((c) => c[0] === "[AUDIT]");
    expect(auditCalls.length).toBe(1);
    const record = JSON.parse(auditCalls[0][1] as string);
    expect(record.kind).toBe("feedback");
    expect(record.route).toBe("/api/rehearsal-feedback");
    expect(record.hashedUser).toBe("fb01abcd12345678");
    expect(typeof record.model).toBe("string");
    expect(record.model.length).toBeGreaterThan(0);
    expect(typeof record.variantId).toBe("string");
    expect(typeof record.promptTokens).toBe("number");
    expect(typeof record.completionTokens).toBe("number");
  });

  it("feedback-burst: 301st call (burst bucket full) returns 429 + error:feedback_burst", async () => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(okFeedbackResponse("OK"));

    const hashedUser = "burst0000feedbck";
    // Pre-fill the burst counter to 300 — the 301st guarded call should
    // hit the feedback:5min:<user> cap before reaching the upstream call.
    for (let i = 0; i < 300; i++) {
      const r = rateLimit(`feedback:5min:${hashedUser}`, 300, 5 * 60 * 1000);
      expect(r.allowed).toBe(true);
    }

    const req = await makeAuthedRequest({ hashedUser });
    const res = await POST(req);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).not.toBeNull();
    const body = await res.json();
    expect(body).toEqual({ error: "feedback_burst" });
    // Upstream must NOT have been called — burst check fires before fetch.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("kill-switch: 503 + {error:'paid_disabled', fallback:'diff-only'}", async () => {
    process.env.RITUAL_EMERGENCY_DISABLE_PAID = "true";
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      throw new Error("fetch must not run while kill-switch is on");
    });

    const req = await makeAuthedRequest({ hashedUser: "killfeedback1234" });
    const res = await POST(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ error: "paid_disabled", fallback: "diff-only" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
