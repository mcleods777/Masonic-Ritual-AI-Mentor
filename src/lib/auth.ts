/**
 * Pilot authentication helpers.
 *
 * Magic-link email sign-in for the lodge pilot. Two JWT token types:
 *
 *   - Magic-link token: short-lived (10 min), sent to the Brother's email.
 *     Clicking the link exchanges this for a session token.
 *   - Session token: longer-lived (30 days), stored in an httpOnly cookie.
 *     Middleware verifies this on every protected request.
 *
 * Both are signed with HS256 using JWT_SECRET. The secret MUST be at least
 * 32 bytes of entropy. Rotating JWT_SECRET in Vercel invalidates every
 * outstanding magic-link and session in the jurisdiction within seconds —
 * the emergency kill-switch for lost devices.
 *
 * The allowlist (LODGE_ALLOWLIST) is a comma-separated env var of emails
 * in good standing. Non-allowlisted sign-in requests still return 200 to
 * prevent allowlist enumeration.
 */

import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE_NAME = "pilot-session";
export const MAGIC_LINK_TTL_SECONDS = 60 * 10; // 10 minutes
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

const MAGIC_LINK_AUDIENCE = "pilot-magic-link";
const SESSION_AUDIENCE = "pilot-session";
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
