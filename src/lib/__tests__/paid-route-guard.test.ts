// @vitest-environment node
/**
 * Tests for src/lib/paid-route-guard.ts.
 *
 * Scope after Plan 05 (SAFETY-05/09 defense-in-depth):
 *   - Kill-switch (D-16/D-17): RITUAL_EMERGENCY_DISABLE_PAID="true" returns
 *     503 + per-route structured body BEFORE the client-token check, so
 *     operators can cut the paid surface without needing a valid token.
 *   - Client-token gate (D-14): missing / invalid / wrong-audience Bearer
 *     returns 401 + {error:"client_token_invalid"}. THIS IS THE NEW
 *     BEHAVIOR after Plan 05 — the guard no longer falls back to IP-derived
 *     userKeys for unauthenticated requests. Middleware blocks first, but
 *     the guard re-verifies at the route level as belt-and-suspenders.
 *   - Rate-limit buckets (D-01/D-02/D-03): per-user hour (60), per-user day
 *     (300), per-route hour (100). All three yield 429 + Retry-After.
 *     Per-user keys now come from tokenPayload.sub (canonical hashedUser),
 *     not a cookie/IP re-derivation.
 *   - Happy path: `applyPaidRouteGuards` returns
 *     {kind:"allow", hashedUser: sub, userKey: sub}.
 */

import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  applyPaidRouteGuards,
  type PaidRouteName,
} from "../paid-route-guard";
import { __resetRateLimitForTests } from "../rate-limit";
import { signClientToken, signSessionToken } from "../auth";

const GOOD_SECRET = "test-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"; // 44 chars

async function makeAuthedRequest(opts: {
  hashedUser?: string;
  bearer?: string;
  ip?: string;
}): Promise<NextRequest> {
  const headers: Record<string, string> = {};
  if (opts.bearer !== undefined) {
    headers["authorization"] = `Bearer ${opts.bearer}`;
  } else if (opts.hashedUser) {
    const token = await signClientToken(opts.hashedUser);
    headers["authorization"] = `Bearer ${token}`;
  }
  if (opts.ip) headers["x-vercel-forwarded-for"] = opts.ip;
  return new NextRequest(
    new URL("http://localhost:3000/api/tts/gemini"),
    { method: "POST", headers },
  );
}

function makeRequestWithoutBearer(opts: { ip?: string } = {}): NextRequest {
  const headers: Record<string, string> = {};
  if (opts.ip) headers["x-vercel-forwarded-for"] = opts.ip;
  return new NextRequest(
    new URL("http://localhost:3000/api/tts/gemini"),
    { method: "POST", headers },
  );
}

describe("applyPaidRouteGuards", () => {
  beforeEach(() => {
    __resetRateLimitForTests();
    process.env.JWT_SECRET = GOOD_SECRET;
  });

  afterEach(() => {
    delete process.env.RITUAL_EMERGENCY_DISABLE_PAID;
    __resetRateLimitForTests();
  });

  describe("kill-switch (D-16/D-17)", () => {
    it("returns 503 + {error:'paid_disabled', fallback:'pre-baked'} for TTS routes (before token check)", async () => {
      process.env.RITUAL_EMERGENCY_DISABLE_PAID = "true";
      // Deliberately no Bearer — kill-switch fires first, so the route
      // never reaches the client-token gate.
      const result = await applyPaidRouteGuards(
        makeRequestWithoutBearer({ ip: "1.1.1.1" }),
        { routeName: "tts:gemini" },
      );
      expect(result.kind).toBe("deny");
      if (result.kind !== "deny") return;
      expect(result.response.status).toBe(503);
      const body = await result.response.json();
      expect(body).toEqual({ error: "paid_disabled", fallback: "pre-baked" });
    });

    it("returns 503 + {error:'paid_disabled', fallback:'diff-only'} for feedback", async () => {
      process.env.RITUAL_EMERGENCY_DISABLE_PAID = "true";
      const result = await applyPaidRouteGuards(
        makeRequestWithoutBearer({ ip: "1.1.1.1" }),
        { routeName: "feedback" },
      );
      expect(result.kind).toBe("deny");
      if (result.kind !== "deny") return;
      expect(result.response.status).toBe(503);
      const body = await result.response.json();
      expect(body).toEqual({ error: "paid_disabled", fallback: "diff-only" });
    });

    it("returns 503 + {error:'paid_disabled'} (no fallback) for transcribe", async () => {
      process.env.RITUAL_EMERGENCY_DISABLE_PAID = "true";
      const result = await applyPaidRouteGuards(
        makeRequestWithoutBearer({ ip: "1.1.1.1" }),
        { routeName: "transcribe" },
      );
      expect(result.kind).toBe("deny");
      if (result.kind !== "deny") return;
      expect(result.response.status).toBe(503);
      const body = await result.response.json();
      expect(body).toEqual({ error: "paid_disabled" });
      expect("fallback" in body).toBe(false);
    });

    it("only the literal 'true' flips the switch (A5)", async () => {
      // With a valid client-token present, non-"true" values should fall
      // through to the allow path — same regression as before Plan 05.
      process.env.RITUAL_EMERGENCY_DISABLE_PAID = "1";
      let result = await applyPaidRouteGuards(
        await makeAuthedRequest({ hashedUser: "a111111111111111" }),
        { routeName: "tts:gemini" },
      );
      expect(result.kind).toBe("allow");

      __resetRateLimitForTests();
      process.env.RITUAL_EMERGENCY_DISABLE_PAID = "yes";
      result = await applyPaidRouteGuards(
        await makeAuthedRequest({ hashedUser: "b222222222222222" }),
        { routeName: "tts:gemini" },
      );
      expect(result.kind).toBe("allow");

      __resetRateLimitForTests();
      process.env.RITUAL_EMERGENCY_DISABLE_PAID = "TRUE";
      result = await applyPaidRouteGuards(
        await makeAuthedRequest({ hashedUser: "c333333333333333" }),
        { routeName: "tts:gemini" },
      );
      expect(result.kind).toBe("allow");
    });
  });

  describe("client-token gate (SAFETY-05/09, D-14 defense-in-depth)", () => {
    it("returns 401 + {error:'client_token_invalid'} when Authorization header is missing", async () => {
      const result = await applyPaidRouteGuards(
        makeRequestWithoutBearer({ ip: "10.0.0.1" }),
        { routeName: "tts:gemini" },
      );
      expect(result.kind).toBe("deny");
      if (result.kind !== "deny") return;
      expect(result.response.status).toBe(401);
      const body = await result.response.json();
      expect(body).toEqual({ error: "client_token_invalid" });
    });

    it("returns 401 when Authorization carries a session token (wrong audience)", async () => {
      const sessionToken = await signSessionToken("brother.one@example.com");
      const result = await applyPaidRouteGuards(
        await makeAuthedRequest({ bearer: sessionToken }),
        { routeName: "tts:gemini" },
      );
      expect(result.kind).toBe("deny");
      if (result.kind !== "deny") return;
      expect(result.response.status).toBe(401);
    });

    it("returns 401 for a malformed Bearer token", async () => {
      const result = await applyPaidRouteGuards(
        await makeAuthedRequest({ bearer: "not-a-token" }),
        { routeName: "tts:gemini" },
      );
      expect(result.kind).toBe("deny");
      if (result.kind !== "deny") return;
      expect(result.response.status).toBe(401);
    });

    it("allows with valid Bearer and uses tokenPayload.sub as hashedUser", async () => {
      const sub = "abcdef0123456789";
      const result = await applyPaidRouteGuards(
        await makeAuthedRequest({ hashedUser: sub }),
        { routeName: "tts:gemini" },
      );
      expect(result.kind).toBe("allow");
      if (result.kind !== "allow") return;
      expect(result.hashedUser).toBe(sub);
      expect(result.userKey).toBe(sub);
    });
  });

  describe("rate-limit buckets (D-01/D-02/D-03)", () => {
    it("per-user hour cap: 60 allowed, 61st returns 429 + Retry-After", async () => {
      const sub = "ratelimit1111111";
      for (let i = 0; i < 60; i++) {
        const r = await applyPaidRouteGuards(
          await makeAuthedRequest({ hashedUser: sub }),
          { routeName: "tts:gemini" },
        );
        expect(r.kind).toBe("allow");
      }
      const denied = await applyPaidRouteGuards(
        await makeAuthedRequest({ hashedUser: sub }),
        { routeName: "tts:gemini" },
      );
      expect(denied.kind).toBe("deny");
      if (denied.kind !== "deny") return;
      expect(denied.response.status).toBe(429);
      expect(denied.response.headers.get("Retry-After")).not.toBeNull();
    });

    it("per-route bucket structure: per-user aggregate is shared across routes + per-user independence holds", async () => {
      // (A) aggregate per-user cap across routes — 60 tts:gemini then 1
      // tts:elevenlabs from the same user → 429 on the 61st.
      const subA = "userforagg111111";
      for (let i = 0; i < 60; i++) {
        const r = await applyPaidRouteGuards(
          await makeAuthedRequest({ hashedUser: subA }),
          { routeName: "tts:gemini" },
        );
        expect(r.kind).toBe("allow");
      }
      const blocked = await applyPaidRouteGuards(
        await makeAuthedRequest({ hashedUser: subA }),
        { routeName: "tts:elevenlabs" },
      );
      expect(blocked.kind).toBe("deny");
      if (blocked.kind !== "deny") return;
      expect(blocked.response.status).toBe(429);

      // (B) per-user independence — fresh user hitting tts:gemini is allowed.
      __resetRateLimitForTests();
      const subB = "userforindep2222";
      const fresh = await applyPaidRouteGuards(
        await makeAuthedRequest({ hashedUser: subB }),
        { routeName: "tts:gemini" },
      );
      expect(fresh.kind).toBe("allow");
    });

    it("429 response body is {error:'rate_limited'} with Retry-After header", async () => {
      const sub = "ratelimit3333333";
      for (let i = 0; i < 60; i++) {
        await applyPaidRouteGuards(
          await makeAuthedRequest({ hashedUser: sub }),
          { routeName: "tts:gemini" },
        );
      }
      const denied = await applyPaidRouteGuards(
        await makeAuthedRequest({ hashedUser: sub }),
        { routeName: "tts:gemini" },
      );
      expect(denied.kind).toBe("deny");
      if (denied.kind !== "deny") return;
      expect(denied.response.status).toBe(429);
      const body = await denied.response.json();
      expect(body).toEqual({ error: "rate_limited" });
      const retryAfter = denied.response.headers.get("Retry-After");
      expect(retryAfter).not.toBeNull();
      expect(Number.isNaN(Number(retryAfter))).toBe(false);
    });
  });

  describe("happy path + supported route names", () => {
    it("happy path returns {kind:'allow', hashedUser: sub, userKey: sub}", async () => {
      const sub = "abcdef0123456789";
      const result = await applyPaidRouteGuards(
        await makeAuthedRequest({ hashedUser: sub }),
        { routeName: "feedback" },
      );
      expect(result.kind).toBe("allow");
      if (result.kind !== "allow") return;
      expect(result.hashedUser).toBe(sub);
      expect(result.userKey).toBe(sub);
    });

    it("accepts every PaidRouteName variant without throwing when a valid Bearer is present", async () => {
      const routes: PaidRouteName[] = [
        "tts:gemini",
        "tts:elevenlabs",
        "tts:google",
        "tts:deepgram",
        "tts:kokoro",
        "tts:voxtral",
        "tts:engines",
        "transcribe",
        "feedback",
      ];
      for (const routeName of routes) {
        __resetRateLimitForTests();
        const result = await applyPaidRouteGuards(
          await makeAuthedRequest({
            hashedUser: `user${routeName.slice(0, 12).padEnd(12, "x")}`,
          }),
          { routeName },
        );
        expect(result.kind).toBe("allow");
      }
    });
  });
});
