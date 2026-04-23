/**
 * Degraded-mode client-side store (SAFETY-08, D-18/D-19).
 *
 * Zero-dep useSyncExternalStore singleton. Chosen over React Context because
 * this state has exactly one writer (api-fetch.ts detecting 503 +
 * `{error:"paid_disabled"}`) and a handful of readers (DegradedModeBanner
 * today; any mode-specific inline notes we add later). Context would need a
 * provider wired into the root layout; zustand would add a dependency for a
 * thirty-line singleton. useSyncExternalStore is the React 19 primitive
 * (PATTERNS §Suggestion 3(a)) and is exactly what this needs.
 *
 * Semantics (D-18/D-19):
 *   - Default: off (no banner).
 *   - api-fetch flips on (true) the first time any paid route responds 503
 *     with `{error:"paid_disabled", ...}`. Per-response detection only — no
 *     dedicated health probe.
 *   - The banner (`src/components/DegradedModeBanner.tsx`) owns its own
 *     per-session dismiss state via `useState`. Dismissing hides the banner
 *     until the component remounts OR the store transitions false→true
 *     again (D-18 re-trigger). The store itself does NOT remember dismissal.
 *   - setDegradedMode is idempotent: setting to the same value twice in a
 *     row emits no listener notifications. Saves useless re-renders when
 *     every paid-route response confirms the same state.
 *
 * Test-only reset via __resetDegradedModeForTests for module-scope isolation
 * between test cases (same convention as rate-limit.ts / paid-route-guard.ts
 * / api-fetch.ts — see each module's header).
 */

let degraded = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of listeners) fn();
}

export function setDegradedMode(on: boolean): void {
  if (degraded === on) return;
  degraded = on;
  emit();
}

export function getDegradedMode(): boolean {
  return degraded;
}

export function subscribeDegradedMode(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Test-only: clear in-memory state and listeners between test cases. */
export function __resetDegradedModeForTests(): void {
  degraded = false;
  listeners.clear();
}
