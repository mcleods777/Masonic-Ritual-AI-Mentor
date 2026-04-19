import type { NextConfig } from "next";

// Security headers. CSP is intentionally permissive on scripts/styles
// ('unsafe-inline' + 'unsafe-eval') because Next.js App Router hydration
// and Tailwind JIT both need inline execution. Tightening to nonce-based
// CSP requires threading nonces through every Server Component, which is
// not worth the ceremony at pilot scale. The non-negotiable pieces
// (frame-ancestors, object-src, base-uri, form-action) are all locked.
// connect-src allows our paid AI upstreams so fetch() calls don't break.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  // fonts.googleapis.com hosts the @font-face stylesheet for Cinzel +
  // Cormorant Garamond. Without it the layout falls back to system serifs
  // and the Masonic visual identity is lost on every page.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob:",
  // fonts.gstatic.com is where the actual .woff2 binaries live.
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://api.mistral.ai https://generativelanguage.googleapis.com https://texttospeech.googleapis.com https://api.resend.com",
  "media-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
];

const nextConfig: NextConfig = {
  turbopack: {},
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
