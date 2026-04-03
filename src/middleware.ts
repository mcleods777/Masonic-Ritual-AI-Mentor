import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Redirect the root URL to the Pretext landing page.
 * The landing page's "ENTER THE LODGE" button links to /home.
 */
export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/") {
    return NextResponse.redirect(new URL("/landing.html", request.url));
  }
}

export const config = {
  matcher: "/",
};
