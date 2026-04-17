/**
 * Magic-link verify endpoint.
 *
 * Flow:
 *   1. Read ?t= from query string
 *   2. Verify it as a magic-link JWT (checks signature, expiry, audience)
 *   3. On success: mint a session JWT, set it as an httpOnly cookie,
 *      redirect to /
 *   4. On failure: redirect to /signin?error=invalid-link
 *
 * All failure modes collapse to one error. Brothers should not learn
 * which specific validation failed.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  signSessionToken,
  verifyMagicLinkToken,
} from "@/lib/auth";
import { hashEmail } from "@/lib/user-id";
import { logServerEvent } from "@/lib/posthog-server";
import {
  TELEMETRY_OPTOUT_COOKIE,
  isOptedOutFromCookieValue,
} from "@/lib/telemetry-consent";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t");
  const optedOut = isOptedOutFromCookieValue(
    req.cookies.get(TELEMETRY_OPTOUT_COOKIE)?.value,
  );

  const failureRedirect = () =>
    NextResponse.redirect(new URL("/signin?error=invalid-link", req.url));

  if (!token) {
    await logServerEvent({
      distinctId: "anonymous",
      name: "auth.sign_in.failed",
      props: { error_type: "validation" },
      optedOut,
    });
    return failureRedirect();
  }

  const payload = await verifyMagicLinkToken(token);
  if (!payload) {
    await logServerEvent({
      distinctId: "anonymous",
      name: "auth.sign_in.failed",
      props: { error_type: "auth" },
      optedOut,
    });
    return failureRedirect();
  }

  const sessionToken = await signSessionToken(payload.email);

  await logServerEvent({
    distinctId: hashEmail(payload.email),
    name: "auth.sign_in.succeeded",
    optedOut,
  });

  const res = NextResponse.redirect(new URL("/", req.url));
  res.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}
