/**
 * Client-token issuance endpoint (SAFETY-05, D-11/D-12).
 *
 * POST only. Gates in order:
 *   1. Origin header — when present, must match ALLOWED_ORIGIN_SUFFIXES or
 *      `*.vercel.app`; absent Origin (same-origin non-fetch paths) passes.
 *      Rationale: a browser fetch from an allowed page always sends Origin;
 *      a manual curl from Shannon's laptop for runbook verification won't.
 *      We accept the latter because the pilot-session cookie (gate 2)
 *      would have to leak out of the httpOnly cookie anyway.
 *   2. pilot-session cookie — must verify via existing verifySessionToken.
 *      Failure returns 401 `{error:"Not signed in"}`; the magic-link flow
 *      handles the redirect back to /signin at the middleware layer.
 *
 * Response: `{token, expiresIn: 3600}`. The token is a 1h jose HS256 JWT
 * with `sub = hashedUserFromEmail(session.email)`, `aud = "client-token"`,
 * `iss = "masonic-ritual-mentor"`. The client (src/lib/api-fetch.ts)
 * attaches it as `Authorization: Bearer <token>` on every paid-route call.
 *
 * Middleware carve-out: this endpoint lives under /api/auth/ which is the
 * existing skip-shared-secret + (after Plan 05) skip-client-token path
 * (see src/middleware.ts isPilotPublicPath). Renaming it breaks the
 * bootstrap chain — api-fetch.ts would try to attach a client-token to
 * fetch a client-token.
 *
 * Origin list is duplicated from src/middleware.ts lines 13-31 rather
 * than extracting to src/lib/origin.ts — Phase 2 PATTERNS §5 accepts the
 * duplication for scope control; a future plan may consolidate.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  SESSION_COOKIE_NAME,
  CLIENT_TOKEN_TTL_SECONDS,
  signClientToken,
  verifySessionToken,
} from "@/lib/auth";
import { hashedUserFromEmail } from "@/lib/hash-user";

export const runtime = "nodejs";

const ALLOWED_ORIGIN_SUFFIXES = [
  "masonic-ritual-ai-mentor.vercel.app",
  "localhost:3000",
  "localhost:3001",
  "127.0.0.1:3000",
];

function isAllowedOrigin(origin: string | null): boolean {
  // Absent Origin (same-origin non-fetch paths) is allowed — the session
  // cookie is the authority that actually gates issuance.
  if (!origin) return true;
  try {
    const { host } = new URL(origin);
    return (
      ALLOWED_ORIGIN_SUFFIXES.some((s) => host === s) ||
      host.endsWith(".vercel.app")
    );
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  // 1. Origin check (D-12).
  const origin = req.headers.get("origin");
  if (!isAllowedOrigin(origin)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  }

  // 2. Pilot-session cookie gate (D-12).
  const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(cookie);
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // 3. Mint the 1h client-token with hashedUser subject.
  const hashedUser = hashedUserFromEmail(session.email);
  const token = await signClientToken(hashedUser);

  return NextResponse.json({ token, expiresIn: CLIENT_TOKEN_TTL_SECONDS });
}
