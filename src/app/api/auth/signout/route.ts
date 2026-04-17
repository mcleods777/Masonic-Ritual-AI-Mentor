/**
 * Sign-out endpoint. Clears the pilot session cookie and redirects to
 * /signin. Accepts both GET (for easy links) and POST (for forms).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/auth";
import { hashEmail } from "@/lib/user-id";
import { logServerEvent } from "@/lib/posthog-server";
import {
  TELEMETRY_OPTOUT_COOKIE,
  isOptedOutFromCookieValue,
} from "@/lib/telemetry-consent";

export const runtime = "nodejs";

async function clearCookieAndRedirect(req: NextRequest) {
  const optedOut = isOptedOutFromCookieValue(
    req.cookies.get(TELEMETRY_OPTOUT_COOKIE)?.value,
  );
  const sessionCookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(sessionCookie);
  if (session?.email) {
    await logServerEvent({
      distinctId: hashEmail(session.email),
      name: "auth.sign_out",
      optedOut,
    });
  }

  const res = NextResponse.redirect(new URL("/signin?signed-out=1", req.url));
  res.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}

export async function GET(req: NextRequest) {
  return clearCookieAndRedirect(req);
}

export async function POST(req: NextRequest) {
  return clearCookieAndRedirect(req);
}
