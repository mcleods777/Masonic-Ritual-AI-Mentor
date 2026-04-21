/**
 * Paid-route guard helper (SAFETY-02, SAFETY-03, SAFETY-08, SAFETY-09).
 *
 * Consolidates the preconditions every paid route needs before doing
 * upstream AI work:
 *
 *   1. RITUAL_EMERGENCY_DISABLE_PAID kill switch (SAFETY-08, D-16/D-17)
 *   2. Client-token verification (SAFETY-05/09 — added in Plan 05)
 *   3. Per-user + per-route rate-limit buckets (SAFETY-02, SAFETY-03,
 *      D-01/D-02/D-03)
 *   4. hashedUser derivation for audit-log emission (D-03)
 *
 * Each of the 9 paid routes (7 TTS + transcribe + rehearsal-feedback)
 * starts with:
 *
 *   const guard = await applyPaidRouteGuards(request, { routeName: "tts:gemini" });
 *   if (guard.kind === "deny") return guard.response;
 *   const { hashedUser } = guard;
 *
 * The guard reads only headers + cookies, never the request body — so
 * transcribe (formData) and feedback (JSON) both route through the same
 * helper without needing to parse the body twice.
 *
 * Wave 2 skeleton (this file): kill-switch + rate-limit + hashedUser
 * derivation only. Plan 05 (SAFETY-05/09) adds the requireClientToken gate
 * in the "client-token check" slot below. Plans 08/09 wire the helper into
 * the 9 paid route handlers.
 *
 * Pilot-scale pragmatism: rate-limit state is in-memory and resets on
 * cold start (same caveat as rate-limit.ts). Acceptable at pilot scale;
 * SAFETY-v2-01 documents the durable-store swap path.
 */

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { rateLimit, getClientIp } from "./rate-limit";
import { SESSION_COOKIE_NAME, verifySessionToken } from "./auth";

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

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function hashedUserFromEmail(email: string): string {
  return sha256Hex(email.trim().toLowerCase()).slice(0, 16);
}

function hashedUserFromIp(ip: string): string {
  // Namespace with "ip:" prefix so the IP-derived keyspace cannot collide
  // with an email-derived key that happens to hash to the same prefix.
  return sha256Hex(`ip:${ip}`).slice(0, 16);
}

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
 *     immediately; the response is a fully-formed NextResponse (503/429,
 *     later 401 once Plan 05 lands client-token).
 *
 * Wave 2 behavior:
 *   1. Kill switch — `RITUAL_EMERGENCY_DISABLE_PAID === "true"` (strict
 *      string equality per RESEARCH Assumption A5; "1", "yes", "TRUE" do
 *      NOT flip the switch).
 *   2. (reserved) Client-token verification — Plan 05 adds here.
 *   3. userKey derivation — valid session cookie → email-hash; otherwise
 *      IP-hash fallback (D-03).
 *   4. Rate-limit buckets — per-user hour (60) → per-user day (300) →
 *      per-route hour (100). First failing bucket short-circuits with 429.
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

  // 2. Client-token verification slot (Plan 05, SAFETY-05/09).
  // TODO(Plan 05): const tokenCheck = requireClientToken(request);
  //                if (!tokenCheck.ok) return { kind: "deny", response:
  //                  NextResponse.json({ error: "client_token_invalid" },
  //                    { status: 401 }) };

  // 3. userKey derivation (D-03).
  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(cookieValue);
  const hashedUser = session
    ? hashedUserFromEmail(session.email)
    : hashedUserFromIp(getClientIp(request));
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
