/**
 * Paid-route guard helper (SAFETY-02, SAFETY-03, SAFETY-08, SAFETY-09).
 *
 * Consolidates the preconditions every paid route needs before doing
 * upstream AI work:
 *
 *   1. RITUAL_EMERGENCY_DISABLE_PAID kill switch (SAFETY-08, D-16/D-17)
 *   2. Client-token verification (SAFETY-05/09, D-14)
 *   3. Per-user + per-route rate-limit buckets (SAFETY-02, SAFETY-03,
 *      D-01/D-02/D-03) keyed off tokenPayload.sub (canonical hashedUser)
 *
 * Each of the 9 paid routes (7 TTS + transcribe + rehearsal-feedback)
 * starts with:
 *
 *   const guard = await applyPaidRouteGuards(request, { routeName: "tts:gemini" });
 *   if (guard.kind === "deny") return guard.response;
 *   const { hashedUser } = guard;
 *
 * The guard reads only headers, never the request body — so transcribe
 * (formData) and feedback (JSON) both route through the same helper
 * without needing to parse the body twice.
 *
 * Defense-in-depth ordering (D-14): middleware verifies the Bearer
 * client-token at the perimeter on /api/* (except /api/auth/*). This
 * guard RE-VERIFIES at the route level so a future Next.js quirk that
 * skips middleware cannot bypass paid-route auth. Middleware is perimeter;
 * route-level is the last line.
 *
 * After Plan 05, hashedUser is sourced from `tokenPayload.sub` (the same
 * hash minted by POST /api/auth/client-token, which uses
 * hashedUserFromEmail(session.email)). This removes cookie-vs-IP drift
 * risk — the guard no longer re-derives; it trusts the signed claim.
 * Kill-switch fires BEFORE the client-token check so operators can cut
 * the paid surface without needing a valid token.
 *
 * Pilot-scale pragmatism: rate-limit state is in-memory and resets on
 * cold start (same caveat as rate-limit.ts). Acceptable at pilot scale;
 * SAFETY-v2-01 documents the durable-store swap path.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { rateLimit } from "./rate-limit";
import { verifyClientToken } from "./auth";

export type PaidRouteName =
  | "tts:gemini"
  | "tts:elevenlabs"
  | "tts:google"
  | "tts:deepgram"
  | "tts:kokoro"
  | "tts:voxtral"
  | "tts:engines"
  | "transcribe"
  | "feedback";

export interface PaidRouteGuardAllow {
  kind: "allow";
  hashedUser: string;
  userKey: string;
}

export interface PaidRouteGuardDeny {
  kind: "deny";
  response: NextResponse;
}

export type PaidRouteGuardResult = PaidRouteGuardAllow | PaidRouteGuardDeny;

// D-01: 60 calls/hour per user, aggregate across all paid routes.
const PER_USER_HOUR_LIMIT = 60;
const HOUR_MS = 60 * 60 * 1000;

// D-02: 300 calls/day per user, aggregate across all paid routes.
const PER_USER_DAY_LIMIT = 300;
const DAY_MS = 24 * 60 * 60 * 1000;

// D-03: 100 calls/hour per route per user (belt-and-suspenders; catches
// one-route misbehavior when the per-user aggregate is still healthy).
const PER_ROUTE_HOUR_LIMIT = 100;

/**
 * Body shapes per D-17:
 *   - /api/tts/*       → { error: "paid_disabled", fallback: "pre-baked" }
 *   - /api/rehearsal-feedback (routeName "feedback")
 *                      → { error: "paid_disabled", fallback: "diff-only" }
 *   - /api/transcribe  → { error: "paid_disabled" }  (no fallback field)
 */
function killSwitchBody(
  routeName: PaidRouteName,
): { error: "paid_disabled"; fallback?: "pre-baked" | "diff-only" } {
  if (routeName.startsWith("tts:")) {
    return { error: "paid_disabled", fallback: "pre-baked" };
  }
  if (routeName === "feedback") {
    return { error: "paid_disabled", fallback: "diff-only" };
  }
  return { error: "paid_disabled" };
}

function rateLimitedResponse(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: "rate_limited" },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) },
    },
  );
}

/**
 * Run every precondition required before a paid-route handler may touch
 * an upstream AI provider. Returns either:
 *   - { kind: "allow", hashedUser, userKey } — caller proceeds; uses
 *     hashedUser for audit emit; userKey is a named alias (same value)
 *     callers can use to compose additional rate-limit keys if needed.
 *   - { kind: "deny", response } — caller should `return response`
 *     immediately; the response is a fully-formed NextResponse
 *     (503 kill-switch, 401 client-token-invalid, or 429 rate-limited).
 *
 * Behavior:
 *   1. Kill switch — `RITUAL_EMERGENCY_DISABLE_PAID === "true"` (strict
 *      string equality per RESEARCH Assumption A5; "1", "yes", "TRUE" do
 *      NOT flip the switch). Fires FIRST so operators can cut the paid
 *      surface without a valid client-token.
 *   2. Client-token verification (SAFETY-05/09, D-14) — Authorization
 *      header must carry `Bearer <token>` with audience "client-token".
 *      Missing/invalid → 401 `{error:"client_token_invalid"}`. Middleware
 *      already enforces this on /api/*; the route-level re-check is
 *      belt-and-suspenders against a future middleware-skip quirk.
 *   3. Rate-limit buckets — per-user hour (60) → per-user day (300) →
 *      per-route hour (100). Keyed off tokenPayload.sub (canonical
 *      hashedUser from the client-token mint). First failing bucket
 *      short-circuits with 429.
 */
export async function applyPaidRouteGuards(
  request: NextRequest,
  opts: { routeName: PaidRouteName },
): Promise<PaidRouteGuardResult> {
  // 1. Kill switch (D-16/D-17, strict string equality per A5).
  if (process.env.RITUAL_EMERGENCY_DISABLE_PAID === "true") {
    return {
      kind: "deny",
      response: NextResponse.json(killSwitchBody(opts.routeName), {
        status: 503,
      }),
    };
  }

  // 2. Client-token verification (SAFETY-05/09, D-14 defense-in-depth).
  //    Middleware already enforces on /api/*; route-level re-check is
  //    belt-and-suspenders against a future Next.js middleware-skip quirk.
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : undefined;
  const tokenPayload = await verifyClientToken(bearer);
  if (!tokenPayload) {
    return {
      kind: "deny",
      response: NextResponse.json(
        { error: "client_token_invalid" },
        { status: 401 },
      ),
    };
  }

  // 3. userKey = tokenPayload.sub (canonical hashedUser from mint). Mint
  //    side (POST /api/auth/client-token) computes
  //    sha256(session.email).slice(0,16), so both sides agree without
  //    re-derivation and there's no cookie-vs-IP drift.
  const hashedUser = tokenPayload.sub;
  const userKey = hashedUser;

  // 4. Rate-limit buckets (D-01/D-02/D-03), checked in priority order.
  const hourCheck = rateLimit(
    `paid:hour:${userKey}`,
    PER_USER_HOUR_LIMIT,
    HOUR_MS,
  );
  if (!hourCheck.allowed) {
    return {
      kind: "deny",
      response: rateLimitedResponse(hourCheck.retryAfterSeconds),
    };
  }

  const dayCheck = rateLimit(
    `paid:day:${userKey}`,
    PER_USER_DAY_LIMIT,
    DAY_MS,
  );
  if (!dayCheck.allowed) {
    return {
      kind: "deny",
      response: rateLimitedResponse(dayCheck.retryAfterSeconds),
    };
  }

  const routeCheck = rateLimit(
    `${opts.routeName}:hour:${userKey}`,
    PER_ROUTE_HOUR_LIMIT,
    HOUR_MS,
  );
  if (!routeCheck.allowed) {
    return {
      kind: "deny",
      response: rateLimitedResponse(routeCheck.retryAfterSeconds),
    };
  }

  return { kind: "allow", hashedUser, userKey };
}
