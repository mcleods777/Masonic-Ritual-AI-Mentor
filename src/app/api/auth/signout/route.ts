/**
 * Sign-out endpoint. Clears the pilot session cookie and redirects to
 * /signin. Accepts both GET (for easy links) and POST (for forms).
 */

import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth";

export const runtime = "nodejs";

function clearCookieAndRedirect(req: NextRequest) {
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
