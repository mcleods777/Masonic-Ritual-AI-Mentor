/**
 * dev-guard.ts — shared dev-only guard (AUTHOR D-15).
 *
 * Single source of truth for "this code only runs in local development."
 * Both src/app/author/page.tsx (Ritual Author tool) and
 * scripts/preview-bake.ts (Phase 3 cache-scrubber server) call into this
 * module before exposing any editor or cache surface. Extracted from what
 * used to be an inline process.env.NODE_ENV check in /author/page.tsx:220.
 *
 * Two flavors so the call site can pick the ergonomics it needs:
 *   - isDev()         — boolean, non-throwing; React components use this
 *                       to render a "tool disabled" banner gracefully.
 *   - assertDevOnly() — throwing; Node scripts call this at module load
 *                       so a production invocation fails fast instead of
 *                       silently serving dev surface.
 *
 * No dependencies, no module state. Pure stdlib.
 */

/** Returns true when NODE_ENV is not "production" (dev, test, or unset). */
export function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

/** Throw if running in production. Safe to call at module load time. */
export function assertDevOnly(): void {
  if (!isDev()) {
    throw new Error(
      "[DEV-GUARD] refusing to run in production (NODE_ENV=production). " +
        "This module is dev-only.",
    );
  }
}
