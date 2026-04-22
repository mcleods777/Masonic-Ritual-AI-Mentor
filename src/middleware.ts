import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  SESSION_COOKIE_NAME,
  isAuthConfigured,
  verifyClientToken,
  verifySessionToken,
} from "@/lib/auth";

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

/**
 * Paths that never require a pilot session cookie. These must remain
 * reachable to unauthenticated users so the sign-in flow can complete.
 * Static assets (/_next/*, /manifest.json, icons) are excluded from the
 * middleware matcher entirely; these are the paths that DO match the
 * matcher but still pass through without auth.
 */
function isPilotPublicPath(pathname: string): boolean {
  if (pathname === "/signin") return true;
  if (pathname.startsWith("/api/auth/")) return true;
  if (pathname === "/manifest.json") return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Root redirect (existing behavior).
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/landing.html", request.url));
  }

  // API route protection (existing).
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
          "Access-Control-Allow-Headers":
            "Content-Type, X-Client-Secret, Authorization",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // Shared-secret check for /api/* (skip /api/auth/*). If unset server-side,
    // skip (dev / misconfigured deploy stays functional).
    if (!pathname.startsWith("/api/auth/")) {
      const expected = process.env.RITUAL_CLIENT_SECRET;
      if (expected) {
        const provided = request.headers.get("x-client-secret");
        if (provided !== expected) {
          return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 },
          );
        }
      }
    }

    // SAFETY-05 / SAFETY-09 / D-14: client-token verification on /api/*
    // (except /api/auth/*). Defense in depth — each paid-route handler also
    // re-verifies via src/lib/paid-route-guard.ts#applyPaidRouteGuards, so a
    // future Next.js middleware-skip quirk cannot bypass paid-route auth.
    // Skipped entirely when JWT_SECRET is unset (local dev / misconfigured
    // deploy stays open) and when the shared-secret check is gated off.
    if (
      isAuthConfigured() &&
      !pathname.startsWith("/api/auth/") &&
      request.method !== "OPTIONS"
    ) {
      const authHeader = request.headers.get("authorization");
      const bearer = authHeader?.startsWith("Bearer ")
        ? authHeader.slice(7)
        : undefined;
      const tokenPayload = await verifyClientToken(bearer);
      if (!tokenPayload) {
        return NextResponse.json(
          { error: "client_token_invalid" },
          { status: 401 },
        );
      }
    }

    // CORS origin allowlist. Browsers send Origin on cross-origin fetches.
    // If Origin is present but not allowed, reject. (Server-to-server calls
    // without Origin pass the shared-secret gate above instead.)
    if (origin && !isAllowedOrigin(origin)) {
      return NextResponse.json(
        { error: "Forbidden origin" },
        { status: 403 },
      );
    }

    // Pass through with CORS headers if origin allowed.
    if (origin) {
      const res = NextResponse.next();
      res.headers.set("Access-Control-Allow-Origin", origin);
      // Fall through to pilot auth check below for /api/auth/* or leave
      // this response as the final one for other API paths.
      if (!pathname.startsWith("/api/auth/")) {
        return res;
      }
    }
  }

  // Pilot auth gate. Only active when JWT_SECRET is configured; this way
  // local dev (without secrets set) stays open and the middleware is a
  // no-op. In production on Vercel, JWT_SECRET is set and the gate is on.
  if (isAuthConfigured() && !isPilotPublicPath(pathname)) {
    const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const session = await verifySessionToken(cookie);
    if (!session) {
      const signInUrl = new URL("/signin", request.url);
      return NextResponse.redirect(signInUrl);
    }
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     *   - _next/static (build output)
     *   - _next/image (image optimization)
     *   - favicon, apple-touch icons, manifest icons
     *   - static files with extensions (.png, .jpg, .svg, .ico, .txt, .woff2, .mram, .webmanifest)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|apple-touch-icon|icon-|.*\\.(?:png|jpg|jpeg|svg|ico|txt|woff2|mram|webmanifest)).*)",
  ],
};
