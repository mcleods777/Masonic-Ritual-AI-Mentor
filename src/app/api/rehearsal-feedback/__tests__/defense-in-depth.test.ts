// @vitest-environment node
/**
 * SAFETY-09 defense-in-depth regression test for POST /api/rehearsal-feedback.
 *
 * Proves that direct invocation of POST() (simulating a future Next.js
 * middleware-skip quirk) is still blocked by the route's own
 * `applyPaidRouteGuards → verifyClientToken` call. Middleware is the
 * perimeter; this test proves the route is its own perimeter too.
 *
 * Rehearsal-feedback is the third representative paid-route shape (JSON
 * body, streaming LLM response, SAFETY-06 server-side burst counter on top
 * of the guard). The guard only reads headers/Bearer, so the invariant
 * holds here the same as on the other two triad members.
 *
 * Invariant (per CONTEXT D-14 + REQUIREMENTS SAFETY-09):
 *   401 + {error:"client_token_invalid"} at the route level for every
 *   missing/invalid/cross-audience Bearer case.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { __resetRateLimitForTests } from "@/lib/rate-limit";
import { __resetSpendTallyForTests } from "@/lib/spend-tally";
import { signClientToken, signSessionToken } from "@/lib/auth";
import { POST } from "../route";

const GOOD_SECRET = "test-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"; // 44 chars

function makeRequest(headers: Record<string, string>): NextRequest {
  const body = {
    accuracy: 85,
    wrongWords: 3,
    missingWords: 1,
    troubleSpots: ["middle section"],
    lineNumber: 5,
    totalLines: 20,
  };
  return new NextRequest(
    new URL("https://test.local/api/rehearsal-feedback"),
    {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    },
  );
}

describe("SAFETY-09 rehearsal-feedback defense-in-depth", () => {
  let originalSecret: string | undefined;
  let originalGroq: string | undefined;
  let originalMistral: string | undefined;

  beforeEach(() => {
    originalSecret = process.env.JWT_SECRET;
    originalGroq = process.env.GROQ_API_KEY;
    originalMistral = process.env.MISTRAL_API_KEY;
    process.env.JWT_SECRET = GOOD_SECRET;
    process.env.GROQ_API_KEY = "test-groq-key";
    delete process.env.RITUAL_EMERGENCY_DISABLE_PAID;
    __resetRateLimitForTests();
    __resetSpendTallyForTests();
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
    if (originalGroq === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalGroq;
    if (originalMistral === undefined) delete process.env.MISTRAL_API_KEY;
    else process.env.MISTRAL_API_KEY = originalMistral;
    __resetRateLimitForTests();
    __resetSpendTallyForTests();
    vi.restoreAllMocks();
  });

  it("rejects direct invocation with NO Authorization header (401 + client_token_invalid)", async () => {
    const req = makeRequest({});
    const resp = await POST(req);
    expect(resp.status).toBe(401);
    const body = await resp.json();
    expect(body).toEqual({ error: "client_token_invalid" });
  });

  it("rejects invalid Bearer token → 401", async () => {
    const req = makeRequest({
      authorization: "Bearer not-a-valid-jwt-token-garbage-xyz",
    });
    const resp = await POST(req);
    expect(resp.status).toBe(401);
    const body = await resp.json();
    expect(body).toEqual({ error: "client_token_invalid" });
  });

  it("rejects cross-audience token (session token presented as Bearer) → 401", async () => {
    const sessionToken = await signSessionToken("brother@example.com");
    const req = makeRequest({
      authorization: `Bearer ${sessionToken}`,
    });
    const resp = await POST(req);
    expect(resp.status).toBe(401);
    const body = await resp.json();
    expect(body).toEqual({ error: "client_token_invalid" });
  });

  it("passes the guard with a valid client-token Bearer (no client_token_invalid)", async () => {
    // Mock upstream LLM (Groq) so the test doesn't hit it.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            const chunk = JSON.stringify({
              choices: [{ delta: { content: "Nice work." } }],
            });
            controller.enqueue(
              new TextEncoder().encode(`data: ${chunk}\n\ndata: [DONE]\n\n`),
            );
            controller.close();
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        },
      ),
    );
    vi.spyOn(console, "log").mockImplementation(() => {});
    const clientToken = await signClientToken("fb01abcd12345678");
    const req = makeRequest({
      authorization: `Bearer ${clientToken}`,
    });
    const resp = await POST(req);
    // Guard must have passed — either 200 with the feedback stream or
    // some other non-401 status, but NEVER 401 client_token_invalid.
    if (resp.status === 401) {
      const body = await resp.json();
      expect(body.error).not.toBe("client_token_invalid");
    }
    expect(resp.status).not.toBe(401);
  });
});
