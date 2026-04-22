// @vitest-environment node
/**
 * SAFETY-09 defense-in-depth regression test for POST /api/tts/gemini.
 *
 * Proves that direct invocation of POST() (simulating a future Next.js
 * middleware-skip quirk — e.g., matcher regression excluding the route, or
 * a server action that bypasses middleware) is still blocked by the route's
 * own `applyPaidRouteGuards → verifyClientToken` call. Middleware is the
 * perimeter; this test proves the route is its own perimeter too.
 *
 * Invariant (per CONTEXT D-14 + REQUIREMENTS SAFETY-09):
 *   Each paid-route handler rejects invocation WITHOUT a valid Bearer even
 *   when middleware is hypothetically bypassed, returning
 *   401 + {error:"client_token_invalid"} at the route level.
 *
 * If this test ever fails: a paid route can be reached without a valid
 * Bearer. Immediate incident — flip the kill switch per
 * docs/runbooks/KILL-SWITCH.md while investigating.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { __resetRateLimitForTests } from "@/lib/rate-limit";
import { __resetSpendTallyForTests } from "@/lib/spend-tally";
import { signClientToken, signSessionToken } from "@/lib/auth";
import { POST } from "../route";

const GOOD_SECRET = "test-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"; // 44 chars

function makeRequest(
  headers: Record<string, string>,
  body: Record<string, unknown>,
): NextRequest {
  return new NextRequest(new URL("https://test.local/api/tts/gemini"), {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("SAFETY-09 tts/gemini defense-in-depth", () => {
  let originalSecret: string | undefined;
  let originalApiKey: string | undefined;

  beforeEach(() => {
    originalSecret = process.env.JWT_SECRET;
    originalApiKey = process.env.GOOGLE_GEMINI_API_KEY;
    process.env.JWT_SECRET = GOOD_SECRET;
    process.env.GOOGLE_GEMINI_API_KEY = "test-gemini-key";
    delete process.env.RITUAL_EMERGENCY_DISABLE_PAID;
    __resetRateLimitForTests();
    __resetSpendTallyForTests();
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
    if (originalApiKey === undefined) delete process.env.GOOGLE_GEMINI_API_KEY;
    else process.env.GOOGLE_GEMINI_API_KEY = originalApiKey;
    __resetRateLimitForTests();
    __resetSpendTallyForTests();
    vi.restoreAllMocks();
  });

  it("rejects direct invocation with NO Authorization header (401 + client_token_invalid)", async () => {
    const req = makeRequest({}, { text: "test", voice: "Alnilam" });
    const resp = await POST(req);
    expect(resp.status).toBe(401);
    const body = await resp.json();
    expect(body).toEqual({ error: "client_token_invalid" });
  });

  it("rejects invalid Bearer token (random 32-char string) → 401", async () => {
    const req = makeRequest(
      { authorization: "Bearer not-a-valid-jwt-token-garbage-xyz" },
      { text: "test", voice: "Alnilam" },
    );
    const resp = await POST(req);
    expect(resp.status).toBe(401);
    const body = await resp.json();
    expect(body).toEqual({ error: "client_token_invalid" });
  });

  it("rejects cross-audience token (session token presented as Bearer) → 401", async () => {
    // A session token (aud: "pilot-session") must NOT be accepted where a
    // client-token (aud: "client-token") is required — jose rejects the
    // audience mismatch.
    const sessionToken = await signSessionToken("brother@example.com");
    const req = makeRequest(
      { authorization: `Bearer ${sessionToken}` },
      { text: "test", voice: "Alnilam" },
    );
    const resp = await POST(req);
    expect(resp.status).toBe(401);
    const body = await resp.json();
    expect(body).toEqual({ error: "client_token_invalid" });
  });

  it("passes the guard with a valid client-token Bearer (no client_token_invalid)", async () => {
    // Mock the upstream so the test doesn't actually hit Gemini.
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      // Minimal Gemini SSE frame that the route will accept.
      const pcm = Buffer.alloc(256, 0x01);
      const payload = JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: "audio/L16;codec=pcm;rate=24000",
                    data: pcm.toString("base64"),
                  },
                },
              ],
            },
          },
        ],
      });
      const body = `data: ${payload}\n\n`;
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(body));
            controller.close();
          },
        }),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      );
    });
    // Silence [AUDIT] log during the assertion.
    vi.spyOn(console, "log").mockImplementation(() => {});
    const clientToken = await signClientToken("abc0123456789def");
    const req = makeRequest(
      { authorization: `Bearer ${clientToken}` },
      { text: "test", voice: "Alnilam" },
    );
    const resp = await POST(req);
    // The guard must have passed — we may get 200 (success) or another non-401
    // status, but NEVER 401 client_token_invalid.
    if (resp.status === 401) {
      const body = await resp.json();
      expect(body.error).not.toBe("client_token_invalid");
    }
    expect(resp.status).not.toBe(401);
  });
});
