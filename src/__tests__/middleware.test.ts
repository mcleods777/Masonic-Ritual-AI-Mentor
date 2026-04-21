/**
 * Middleware tests.
 *
 * Two unrelated invariants live here:
 *   1. HYGIENE-06: `.mram` exclusion in config.matcher — keeps encrypted
 *      ritual binaries untouched by auth / CORS / redirect logic.
 *   2. SAFETY-05 / SAFETY-09 (Phase 2): client-token verification on
 *      /api/* (except /api/auth/*), CORS preflight exposes Authorization
 *      in Access-Control-Allow-Headers, and /api/auth/* carve-outs stay
 *      intact so the bootstrap chain isn't broken.
 *
 * See .planning/phases/01-pre-invite-hygiene/01-RESEARCH.md Pitfall 2 +
 * .planning/phases/02-safety-floor/02-CONTEXT.md D-14.
 */

// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { config, middleware } from "../middleware";
import { signClientToken, signSessionToken } from "@/lib/auth";

const GOOD_SECRET = "test-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"; // 44 chars

describe("middleware matcher — .mram exclusion (HYGIENE-06)", () => {
  // The matcher is a single path-to-regexp string that uses only JS-RegExp-
  // compatible features (character classes, alternation, negative lookahead,
  // escaped dots). Next anchors matcher patterns implicitly at start/end;
  // we replicate that with ^/$ anchors for equivalent behavior in Node.
  const matcherString = config.matcher[0];
  const matcher = new RegExp("^" + matcherString + "$");

  it("does NOT match /foo.mram (flat)", () => {
    expect(matcher.test("/foo.mram")).toBe(false);
  });

  it("does NOT match /deeply/nested/path/ritual.mram (nested)", () => {
    expect(matcher.test("/deeply/nested/path/ritual.mram")).toBe(false);
  });

  it("does NOT match /ea-degree.mram (hyphenated)", () => {
    expect(matcher.test("/ea-degree.mram")).toBe(false);
  });

  it("does NOT match /hyphen-name.mram (hyphenated second case)", () => {
    expect(matcher.test("/hyphen-name.mram")).toBe(false);
  });

  // Sanity: the matcher MUST still match regular app paths, otherwise the
  // negative assertions above are vacuous.
  it("still matches regular app paths (/practice, /api/tts/gemini)", () => {
    expect(matcher.test("/practice")).toBe(true);
    expect(matcher.test("/api/tts/gemini")).toBe(true);
  });

  // Bounds: other listed static extensions remain excluded.
  it("still excludes other listed static extensions", () => {
    expect(matcher.test("/logo.png")).toBe(false);
    expect(matcher.test("/manifest.webmanifest")).toBe(false);
  });
});

describe("middleware — client-token gate (SAFETY-05 / SAFETY-09)", () => {
  let originalSecret: string | undefined;
  let originalSharedSecret: string | undefined;

  beforeEach(() => {
    originalSecret = process.env.JWT_SECRET;
    originalSharedSecret = process.env.RITUAL_CLIENT_SECRET;
    process.env.JWT_SECRET = GOOD_SECRET;
    // Leave RITUAL_CLIENT_SECRET unset so the shared-secret check is a
    // no-op and we isolate the client-token gate behavior.
    delete process.env.RITUAL_CLIENT_SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
    if (originalSharedSecret === undefined)
      delete process.env.RITUAL_CLIENT_SECRET;
    else process.env.RITUAL_CLIENT_SECRET = originalSharedSecret;
  });

  function makeApiRequest(
    pathname: string,
    headers: Record<string, string> = {},
    method: string = "POST",
  ): NextRequest {
    return new NextRequest(new URL(`http://localhost:3000${pathname}`), {
      method,
      headers,
    });
  }

  it("blocks /api/tts/gemini with no Authorization header (401 + client_token_invalid)", async () => {
    const res = await middleware(makeApiRequest("/api/tts/gemini"));
    expect(res).not.toBeUndefined();
    expect(res!.status).toBe(401);
    const body = await res!.json();
    expect(body).toEqual({ error: "client_token_invalid" });
  });

  it("blocks /api/tts/gemini when Authorization carries a non-client-token", async () => {
    // A session token has the wrong audience — should be rejected.
    const sessionToken = await signSessionToken("brother.one@example.com");
    const res = await middleware(
      makeApiRequest("/api/tts/gemini", {
        authorization: `Bearer ${sessionToken}`,
      }),
    );
    expect(res).not.toBeUndefined();
    expect(res!.status).toBe(401);
  });

  it("passes /api/tts/gemini when Authorization carries a valid client-token", async () => {
    const clientTok = await signClientToken("u0123456789abcdef");
    const res = await middleware(
      makeApiRequest("/api/tts/gemini", {
        authorization: `Bearer ${clientTok}`,
      }),
    );
    // Middleware either returns undefined (pass-through) or a NextResponse.next
    // without a 401 status — we just assert no 401-client-token-invalid early exit.
    if (res) {
      expect(res.status).not.toBe(401);
    }
  });

  it("allows /api/auth/magic-link/request with no Authorization (carve-out preserved)", async () => {
    const res = await middleware(
      makeApiRequest("/api/auth/magic-link/request"),
    );
    if (res) {
      // Shared-secret/CORS/session flow may return something, but NOT a
      // 401 client_token_invalid — carve-out bypasses the client-token gate.
      if (res.status === 401) {
        const body = await res.clone().json();
        expect(body.error).not.toBe("client_token_invalid");
      }
    }
  });

  it("allows /api/auth/client-token bootstrap POST with no Authorization (carve-out)", async () => {
    const res = await middleware(makeApiRequest("/api/auth/client-token"));
    if (res) {
      if (res.status === 401) {
        const body = await res.clone().json();
        expect(body.error).not.toBe("client_token_invalid");
      }
    }
  });

  it("CORS preflight exposes Authorization in Access-Control-Allow-Headers", async () => {
    const res = await middleware(
      makeApiRequest(
        "/api/tts/gemini",
        {
          origin: "https://masonic-ritual-ai-mentor.vercel.app",
          "access-control-request-method": "POST",
        },
        "OPTIONS",
      ),
    );
    expect(res).not.toBeUndefined();
    expect(res!.status).toBe(204);
    const allowHeaders = res!.headers.get("Access-Control-Allow-Headers");
    expect(allowHeaders).not.toBeNull();
    expect(allowHeaders).toMatch(/Authorization/i);
  });
});
