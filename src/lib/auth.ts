/**
 * Pilot authentication helpers.
 *
 * Magic-link email sign-in for the lodge pilot. Three JWT token types,
 * each with a distinct `aud` claim so a stolen token of one kind cannot
 * be replayed as another (jose's jwtVerify rejects audience mismatch):
 *
 *   - Magic-link token (`aud: "pilot-magic-link"`) — short-lived (24h),
 *     sent to the Brother's email. Clicking the link exchanges this for
 *     a session token.
 *   - Session token (`aud: "pilot-session"`) — longer-lived (30 days),
 *     stored in an httpOnly cookie. Middleware verifies this on every
 *     protected non-API request.
 *   - Client-token (`aud: "client-token"`, SAFETY-05 D-11) — short-lived
 *     (1h), minted by POST /api/auth/client-token to a signed-in browser
 *     and attached as `Authorization: Bearer <token>` on every paid-route
 *     call. Defence in depth alongside the X-Client-Secret header: a
 *     leaked shared-secret alone is not sufficient to reach paid routes.
 *
 * Cross-audience invariant (exercised by auth.test.ts + client-token.test.ts):
 * verify<X>Token rejects every token whose audience is not exactly X.
 * Stolen cookies cannot become client-tokens; stolen magic-links cannot
 * become sessions; etc. Stateless — no server-side revocation list in
 * Phase 2 (ADMIN-04, Phase 6, adds that alongside the durable KV store).
 *
 * All are signed with HS256 using JWT_SECRET. The secret MUST be at least
 * 32 bytes of entropy. Rotating JWT_SECRET in Vercel invalidates every
 * outstanding magic-link, session, and client-token in the jurisdiction
 * within seconds — the emergency kill-switch for lost devices.
 *
 * The allowlist (LODGE_ALLOWLIST) is a comma-separated env var of emails
 * in good standing. Non-allowlisted sign-in requests still return 200 to
 * prevent allowlist enumeration.
 */

import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE_NAME = "pilot-session";
export const MAGIC_LINK_TTL_SECONDS = 60 * 60 * 24; // 24 hours
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
export const CLIENT_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour (SAFETY-05 D-11)

const MAGIC_LINK_AUDIENCE = "pilot-magic-link";
const SESSION_AUDIENCE = "pilot-session";
const CLIENT_TOKEN_AUDIENCE = "client-token";
const ISSUER = "masonic-ritual-mentor";

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "JWT_SECRET must be set to a random value of at least 32 characters",
    );
  }
  return new TextEncoder().encode(secret);
}

/** True when the pilot auth gate is configured and should run. */
export function isAuthConfigured(): boolean {
  return !!process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32;
}

/**
 * Case-insensitive check against the comma-separated LODGE_ALLOWLIST env
 * var. Whitespace around entries is tolerated.
 */
export function isEmailAllowed(email: string): boolean {
  const raw = process.env.LODGE_ALLOWLIST ?? "";
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(normalized);
}

/** Minimal RFC-5322-ish sanity check. Not a validator. */
export function looksLikeEmail(input: unknown): input is string {
  if (typeof input !== "string") return false;
  const trimmed = input.trim();
  if (trimmed.length < 3 || trimmed.length > 254) return false;
  // one @ with at least one char either side, at least one . in the domain
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/** Sign a magic-link token. Payload intentionally minimal. */
export async function signMagicLinkToken(email: string): Promise<string> {
  return new SignJWT({ email: email.trim().toLowerCase() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(MAGIC_LINK_AUDIENCE)
    .setExpirationTime(`${MAGIC_LINK_TTL_SECONDS}s`)
    .sign(getSecret());
}

/**
 * Verify a magic-link token. Returns the email on success, null on any
 * failure (expired, tampered, wrong audience, bad signature). Callers
 * should not distinguish failure modes to a user — all failures collapse
 * to "link is no longer valid."
 */
export async function verifyMagicLinkToken(
  token: string,
): Promise<{ email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: ISSUER,
      audience: MAGIC_LINK_AUDIENCE,
    });
    const email = payload.email;
    if (typeof email !== "string") return null;
    return { email };
  } catch {
    return null;
  }
}

/** Sign a session token for a verified email. */
export async function signSessionToken(email: string): Promise<string> {
  return new SignJWT({ email: email.trim().toLowerCase() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());
}

/**
 * Verify a session token. Edge-runtime safe (pure jose, no Node APIs).
 * Returns the email on success, null on any failure. Callers treat null
 * as "not signed in."
 */
export async function verifySessionToken(
  token: string | undefined,
): Promise<{ email: string } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: ISSUER,
      audience: SESSION_AUDIENCE,
    });
    const email = payload.email;
    if (typeof email !== "string") return null;
    return { email };
  } catch {
    return null;
  }
}

/**
 * Sign a 1h client-token (SAFETY-05, D-11/D-12).
 *
 * The caller (POST /api/auth/client-token) first authenticates the browser
 * via the pilot-session cookie, derives `hashedUser = sha256(email).slice(0,16)`,
 * and passes that here. The token rides along with every paid-route call as
 * `Authorization: Bearer <token>`, verified by middleware on /api/* (except
 * /api/auth/*) and re-verified route-level via paid-route-guard (D-14).
 *
 * Audience `client-token` is DISTINCT from `pilot-session`. A stolen
 * pilot-session cookie cannot be replayed as a client-token and vice versa
 * — jose's jwtVerify rejects audience mismatch, and the cross-audience
 * round-trip tests are the regression guard.
 *
 * Claims are stateless — no session ID — per D-11. Stateful revocation
 * arrives in Phase 6 ADMIN-04 alongside the durable KV store.
 */
export async function signClientToken(hashedUser: string): Promise<string> {
  return new SignJWT({ sub: hashedUser })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(CLIENT_TOKEN_AUDIENCE)
    .setExpirationTime(`${CLIENT_TOKEN_TTL_SECONDS}s`)
    .sign(getSecret());
}

/**
 * Verify a client-token. Edge-runtime safe (pure jose, no Node APIs) so
 * middleware (edge by default) can verify without a Node fallback. Returns
 * `{sub: hashedUser}` on success, null on any failure — callers treat null
 * as "refresh required" and respond 401 `{error:"client_token_invalid"}`.
 */
export async function verifyClientToken(
  token: string | undefined,
): Promise<{ sub: string } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: ISSUER,
      audience: CLIENT_TOKEN_AUDIENCE,
    });
    const sub = payload.sub;
    if (typeof sub !== "string") return null;
    return { sub };
  } catch {
    return null;
  }
}
