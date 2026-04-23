// @vitest-environment node
/**
 * SAFETY-09 defense-in-depth regression test for POST /api/transcribe.
 *
 * Proves that direct invocation of POST() (simulating a future Next.js
 * middleware-skip quirk) is still blocked by the route's own
 * `applyPaidRouteGuards → verifyClientToken` call. Middleware is the
 * perimeter; this test proves the route is its own perimeter too.
 *
 * Transcribe is the representative formData-body shape for the triad
 * (tts/gemini JSON + transcribe formData + rehearsal-feedback JSON). The
 * guard reads only headers/Bearer — the formData body is never parsed in
 * the deny paths, so the invariant holds identically for this body shape.
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

function makeFormDataRequest(
  headers: Record<string, string>,
): NextRequest {
  const form = new FormData();
  const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/webm" });
  form.append("audio", blob, "recording.webm");
  return new NextRequest(new URL("https://test.local/api/transcribe"), {
    method: "POST",
    headers, // do NOT set content-type — formData sets the multipart boundary
    body: form,
  });
}

describe("SAFETY-09 transcribe defense-in-depth", () => {
  let originalSecret: string | undefined;
  let originalApiKey: string | undefined;

  beforeEach(() => {
    originalSecret = process.env.JWT_SECRET;
    originalApiKey = process.env.GROQ_API_KEY;
    process.env.JWT_SECRET = GOOD_SECRET;
    process.env.GROQ_API_KEY = "test-groq-key";
    delete process.env.RITUAL_EMERGENCY_DISABLE_PAID;
    __resetRateLimitForTests();
    __resetSpendTallyForTests();
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
    if (originalApiKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalApiKey;
    __resetRateLimitForTests();
    __resetSpendTallyForTests();
    vi.restoreAllMocks();
  });

  it("rejects direct invocation with NO Authorization header (401 + client_token_invalid)", async () => {
    const req = makeFormDataRequest({});
    const resp = await POST(req);
    expect(resp.status).toBe(401);
    const body = await resp.json();
    expect(body).toEqual({ error: "client_token_invalid" });
  });

  it("rejects invalid Bearer token → 401", async () => {
    const req = makeFormDataRequest({
      authorization: "Bearer not-a-valid-jwt-token-garbage-xyz",
    });
    const resp = await POST(req);
    expect(resp.status).toBe(401);
    const body = await resp.json();
    expect(body).toEqual({ error: "client_token_invalid" });
  });

  it("rejects cross-audience token (session token presented as Bearer) → 401", async () => {
    const sessionToken = await signSessionToken("brother@example.com");
    const req = makeFormDataRequest({
      authorization: `Bearer ${sessionToken}`,
    });
    const resp = await POST(req);
    expect(resp.status).toBe(401);
    const body = await resp.json();
    expect(body).toEqual({ error: "client_token_invalid" });
  });

  it("passes the guard with a valid client-token Bearer (no client_token_invalid)", async () => {
    // Mock the upstream Groq Whisper call so the test doesn't hit it.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ text: "mock transcript" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.spyOn(console, "log").mockImplementation(() => {});
    const clientToken = await signClientToken("stt0123456789abcd");
    const req = makeFormDataRequest({
      authorization: `Bearer ${clientToken}`,
    });
    const resp = await POST(req);
    // Guard must have passed — either 200 with the transcript or some
    // other non-401 status, but NEVER 401 client_token_invalid.
    if (resp.status === 401) {
      const body = await resp.json();
      expect(body.error).not.toBe("client_token_invalid");
    }
    expect(resp.status).not.toBe(401);
  });
});
