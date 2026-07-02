/**
 * Framework-agnostic dev-only guard.
 *
 * `src/app/api/author/_guard.ts` gates Next.js `Request`-based routes; a
 * standalone node script (e.g. `scripts/preview-bake.ts`) has no `Request`
 * object to inspect, so this module provides the same "never run in
 * production" invariant without any framework dependency.
 */

export function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function assertDevOnly(): void {
  if (!isDev()) {
    throw new Error(
      "[DEV-GUARD] refusing to run in production (NODE_ENV=production). This module is dev-only.",
    );
  }
}
