import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Origins allowed to call the API. Preview deploys on Vercel match
 * *.vercel.app so we pattern-match the subdomain.
 */
const ALLOWED_ORIGIN_SUFFIXES = [
  "masonic-ritual-ai-mentor.vercel.app",
  "localhost:3000",
  "localhost:3001",
  "127.0.0.1:3000",
];

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  try {
    const { host } = new URL(origin);
    return (
      ALLOWED_ORIGIN_SUFFIXES.some((s) => host === s) ||
      host.endsWith(".vercel.app") // allow preview deploys
    );
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Root redirect (existing behavior).
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/landing.html", request.url));
  }

  // API route protection.
  if (pathname.startsWith("/api/")) {
    const origin = request.headers.get("origin");

    // CORS preflight — reject early if origin not allowed.
    if (request.method === "OPTIONS") {
      if (!isAllowedOrigin(origin)) {
        return new NextResponse(null, { status: 403 });
      }
      return new NextResponse(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin!,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Client-Secret",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // Shared-secret check. If unset server-side, skip (dev / misconfigured
    // deploy stays functional but logs a warning).
    const expected = process.env.RITUAL_CLIENT_SECRET;
    if (expected) {
      const provided = request.headers.get("x-client-secret");
      if (provided !== expected) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }
    }

    // CORS origin allowlist. Browsers send Origin on cross-origin fetches.
    // If Origin is present but not allowed, reject. (Server-to-server calls
    // without Origin pass the shared-secret gate above instead.)
    if (origin && !isAllowedOrigin(origin)) {
      return NextResponse.json(
        { error: "Forbidden origin" },
        { status: 403 }
      );
    }

    // Pass through with CORS headers if origin allowed.
    if (origin) {
      const res = NextResponse.next();
      res.headers.set("Access-Control-Allow-Origin", origin);
      return res;
    }
  }
}

export const config = {
  matcher: ["/", "/api/:path*"],
};
