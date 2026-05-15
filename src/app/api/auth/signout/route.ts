/**
 * Sign-out endpoint. Clears the pilot session cookie and redirects to
 * /signin. Accepts both GET (for easy links) and POST (for forms).
 */

import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { finalizeSession } from "@/lib/login-tracking";

export const runtime = "nodejs";

async function clearCookieAndRedirect(req: NextRequest) {
  const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(cookie);
  if (session) {
    await finalizeSession(session.email);
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
