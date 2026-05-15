/**
 * Admin allowlist gate.
 *
 * Separate from LODGE_ALLOWLIST so being in the pilot does not imply
 * being able to see who else is in the pilot. ADMIN_ALLOWLIST is a
 * comma-separated list of emails permitted to view /admin. When unset,
 * no one is admin (the page redirects every visitor to /).
 *
 * Case-insensitive, whitespace-tolerant — matches isEmailAllowed().
 */

export function isAdminEmail(email: string): boolean {
  const raw = process.env.ADMIN_ALLOWLIST ?? "";
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(normalized);
}
