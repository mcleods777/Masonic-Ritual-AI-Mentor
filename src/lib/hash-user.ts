/**
 * Hashed-user helpers (SAFETY-05 + SAFETY-04).
 *
 * The canonical user identifier in audit logs, rate-limit keys, and client-
 * token subject claims is `sha256(email.trim().toLowerCase()).slice(0, 16)` —
 * a 16-hex-char prefix that is irreversible by brute force for typical
 * emails yet stable across sessions.
 *
 * This module centralizes the hash so that every call site agrees byte-for-
 * byte. Drift between the mint side (POST /api/auth/client-token) and the
 * lookup side (scripts/lookup-hashed-user.ts) would break the operator
 * runbook — any change here must satisfy hash-user.test.ts.
 *
 * Edge-runtime-safe: uses Node `crypto` under the Node runtime only. The
 * mint route `/api/auth/client-token` runs on Node; middleware does NOT
 * call this module (it reads `tokenPayload.sub` from the already-minted
 * client-token, never rehashes).
 *
 * History: Phase 2 Plan 05 introduces the module with hashedUserFromEmail;
 * Plan 04 extends it with `findEmailByHashedUser` for the reverse-lookup
 * CLI (D-06c). The 16-char prefix matches paid-route-guard.ts's internal
 * hashedUserFromEmail so the guard's internal helper can also be swapped
 * to import from here without drift.
 *
 * NOTE: src/lib/paid-route-guard.ts does NOT import this module — after
 * Plan 05 the guard reads the hash directly from `tokenPayload.sub`
 * instead of re-hashing a session email. The mint-side (client-token
 * route) and the lookup-side (this CLI) MUST agree on the formula; a
 * drift breaks the entire SAFETY-04 alert reverse-lookup promise.
 */

import crypto from "node:crypto";

/**
 * Compute the 16-hex-char sha256 prefix of a normalized email address.
 *
 * Normalization:
 *   - trim whitespace
 *   - lowercase
 *
 * Both must happen before hashing so that "Brother.One@Example.com" and
 * "  brother.one@example.com  " collapse to the same hash. The same
 * normalization runs at sign-in (auth.ts signSessionToken lowercases the
 * email into the session JWT), so the client-token's `sub` claim and any
 * reverse-lookup CLI agree on the input string.
 */
export function hashedUserFromEmail(email: string): string {
  return crypto
    .createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("hex")
    .slice(0, 16);
}

/**
 * Scan a comma-separated allowlist and return the lowercased email whose
 * 16-hex hash matches `targetHash`. Returns null if no entry matches.
 *
 * Used by scripts/lookup-hashed-user.ts (SAFETY-04 D-06c) to reverse-
 * resolve a hashedUser seen in a spike-alert email back to the real
 * pilot address.
 *
 * Case-insensitive on `targetHash` (hex is canonically lowercase, but
 * operators may paste uppercase from email clients that rewrite casing).
 * Blank CSV entries and surrounding whitespace are tolerated.
 */
export function findEmailByHashedUser(
  allowlistCsv: string,
  targetHash: string,
): string | null {
  const needle = targetHash.toLowerCase();
  const emails = allowlistCsv
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  for (const email of emails) {
    if (hashedUserFromEmail(email) === needle) {
      return email.toLowerCase();
    }
  }
  return null;
}
