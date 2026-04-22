/**
 * Middleware tests.
 *
 * Three layers of invariant live here:
 *   1. HYGIENE-06: `.mram` exclusion in config.matcher — keeps encrypted
 *      ritual binaries untouched by auth / CORS / redirect logic.
 *   2. SAFETY-05 / SAFETY-09 (Phase 2, Plan 05): client-token verification
 *      on /api/* (except /api/auth/*), CORS preflight exposes
 *      Authorization in Access-Control-Allow-Headers, and /api/auth/*
 *      carve-outs stay intact so the bootstrap chain isn't broken.
 *   3. SAFETY-09 defense-in-depth ladder (Phase 2, Plan 09): BOTH
 *      shared-secret AND client-token required on /api/* — neither one
 *      alone is sufficient (D-14 layered auth). Threat register T-2-04
 *      (middleware-bypass) and T-2-05 (matcher regression) mitigations
 *      are asserted here alongside the earlier layers.
 *
 * See .planning/phases/01-pre-invite-hygiene/01-RESEARCH.md Pitfall 2 +
 * .planning/phases/02-safety-floor/02-CONTEXT.md D-14 +
 * .planning/phases/02-safety-floor/02-09-PLAN.md threat_model.
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

describe("SAFETY-09 defense-in-depth middleware regressions", () => {
  /**
   * SAFETY-09 explicitly asserts the FULL middleware ladder holds:
   *
   *   (a) Middleware rejects /api/* (non-auth) without a client-token
   *       Bearer → 401 client_token_invalid. (Threat T-2-04: middleware
   *       bypass prevention at the perimeter.)
   *   (b) Middleware allows /api/* when BOTH shared-secret AND a valid
   *       client-token are present — both are required per CONTEXT D-14;
   *       defense in depth against a leaked shared-secret alone.
   *   (c) /api/auth/client-token stays carved out so the bootstrap POST
   *       can mint the initial token.
   *   (d) CORS preflight still exposes Authorization so browsers don't
   *       strip it cross-origin.
   *   (e) Phase 1 HYGIENE-06 `.mram` matcher exclusion still holds
   *       (Threat T-2-05: matcher regression can't silently expose
   *       encrypted ritual binaries).
   *
   * Most of (a)-(d) are already exercised by the SAFETY-05 describe
   * above; this block ADDS the SAFETY-09-specific case that neither
   * one-of-two secret alone is sufficient and re-asserts the ladder
   * invariant for threat-register visibility (see plan threat_model
   * T-2-04, T-2-05, T-2-24).
   */

  let originalSecret: string | undefined;
  let originalSharedSecret: string | undefined;

  beforeEach(() => {
    originalSecret = process.env.JWT_SECRET;
    originalSharedSecret = process.env.RITUAL_CLIENT_SECRET;
    process.env.JWT_SECRET = GOOD_SECRET;
    process.env.RITUAL_CLIENT_SECRET = "shared-secret-test-aaaaaaaaaaaaaaaa";
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
    if (originalSharedSecret === undefined)
      delete process.env.RITUAL_CLIENT_SECRET;
    else process.env.RITUAL_CLIENT_SECRET = originalSharedSecret;
  });

  function makeFullyAuthedApiRequest(
    pathname: string,
    extraHeaders: Record<string, string>,
  ): NextRequest {
    return new NextRequest(new URL(`http://localhost:3000${pathname}`), {
      method: "POST",
      headers: {
        "x-client-secret": "shared-secret-test-aaaaaaaaaaaaaaaa",
        ...extraHeaders,
      },
    });
  }

  it("rejects /api/tts/gemini when shared-secret present but client-token absent (client_token_invalid)", async () => {
    // Even with a valid X-Client-Secret (SAFETY-05 "leaked shared-secret"
    // threat model), the middleware must still demand a Bearer. This is
    // the layered-auth invariant D-14 — the shared-secret alone is not
    // sufficient to reach paid routes.
    const res = await middleware(
      makeFullyAuthedApiRequest("/api/tts/gemini", {}),
    );
    expect(res).not.toBeUndefined();
    expect(res!.status).toBe(401);
    const body = await res!.json();
    expect(body).toEqual({ error: "client_token_invalid" });
  });

  it("rejects /api/tts/gemini when client-token present but shared-secret wrong", async () => {
    // Symmetric check: a valid Bearer alone isn't sufficient either —
    // the shared-secret gate still fires. Order in middleware.ts is
    // shared-secret FIRST, so a wrong secret never reaches the Bearer
    // check. Body shape is {error:"Unauthorized"} from the shared-secret
    // gate (not client_token_invalid).
    const clientTok = await signClientToken("u0123456789abcdef");
    const res = await middleware(
      new NextRequest(new URL("http://localhost:3000/api/tts/gemini"), {
        method: "POST",
        headers: {
          "x-client-secret": "WRONG-SECRET",
          authorization: `Bearer ${clientTok}`,
        },
      }),
    );
    expect(res).not.toBeUndefined();
    expect(res!.status).toBe(401);
    const body = await res!.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("passes /api/tts/gemini when BOTH shared-secret AND valid client-token are present (D-14 layered auth)", async () => {
    const clientTok = await signClientToken("u9876543210abcdef");
    const res = await middleware(
      makeFullyAuthedApiRequest("/api/tts/gemini", {
        authorization: `Bearer ${clientTok}`,
      }),
    );
    // Middleware either returns undefined (pass-through) or a NextResponse
    // with a non-401 status — we just assert no early-exit 401.
    if (res) {
      expect(res.status).not.toBe(401);
    }
  });

  it("/api/auth/client-token bootstrap carve-out preserved (SAFETY-09 regression for Plan 05)", async () => {
    // The mint route is NEVER supposed to require a Bearer — that's the
    // bootstrap endpoint. SAFETY-09 re-asserts: the client-token gate
    // must continue to skip /api/auth/*.
    const res = await middleware(
      new NextRequest(new URL("http://localhost:3000/api/auth/client-token"), {
        method: "POST",
        headers: {},
      }),
    );
    if (res) {
      if (res.status === 401) {
        const body = await res.clone().json();
        expect(body.error).not.toBe("client_token_invalid");
      }
    }
  });

  it("CORS preflight Access-Control-Allow-Headers includes Authorization (SAFETY-09 regression)", async () => {
    const res = await middleware(
      new NextRequest(new URL("http://localhost:3000/api/tts/gemini"), {
        method: "OPTIONS",
        headers: {
          origin: "https://masonic-ritual-ai-mentor.vercel.app",
          "access-control-request-method": "POST",
        },
      }),
    );
    expect(res).not.toBeUndefined();
    expect(res!.status).toBe(204);
    const allowHeaders = res!.headers.get("access-control-allow-headers");
    expect(allowHeaders).not.toBeNull();
    expect(allowHeaders!.toLowerCase()).toContain("authorization");
  });

  it("Phase 1 HYGIENE-06 regression: matcher still excludes .mram paths", () => {
    // Re-asserts the HYGIENE-06 invariant at the SAFETY-09 boundary.
    // Original coverage lives in the "middleware matcher — .mram
    // exclusion" describe above; this is a belt-and-suspenders assertion
    // to anchor the T-2-05 threat-register mitigation in the SAFETY-09
    // describe so a future editor removing the HYGIENE-06 describe can't
    // silently drop the regression.
    const matcherString = config.matcher[0];
    const matcher = new RegExp("^" + matcherString + "$");
    expect(matcher.test("/foo.mram")).toBe(false);
    expect(matcher.test("/deeply/nested/ritual.mram")).toBe(false);
  });
});
