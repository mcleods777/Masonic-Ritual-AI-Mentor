---
phase: 03-authoring-throughput
plan: 03
subsystem: dev-guard
tags: [dev-only, guard, author-page, refactor, shared-module, author-08]

# Dependency graph
requires:
  - phase: 03-authoring-throughput
    plan: 01
    provides: Wave 0 dev-guard.test.ts scaffold (it.todo stubs) + vitest test runner config
provides:
  - src/lib/dev-guard.ts as single source of truth for "this code only runs in development"
  - isDev() — non-throwing boolean check for React components that gracefully render a disabled banner
  - assertDevOnly() — throwing guard with [DEV-GUARD] prefix for Node scripts that should refuse to start in production
  - 8 unit tests covering development/test/production/unset NODE_ENV states for both functions
  - /author/page.tsx rewired to use shared dev-guard (inline NODE_ENV check removed; banner byte-identical)
affects: [03-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared dev-only guard module: two-flavor API (non-throwing isDev for UI, throwing assertDevOnly for scripts)"
    - "NODE_ENV env-var testing convention: describe-scope savedEnv + afterEach restore + @vitest-environment node pragma"
    - "Byte-identical JSX banner preservation during refactor (className, whitespace, text verbatim)"

key-files:
  created:
    - src/lib/dev-guard.ts
  modified:
    - src/lib/__tests__/dev-guard.test.ts
    - src/app/author/page.tsx

key-decisions:
  - "Used `@/lib/dev-guard` alias import (confirmed lines 29-30 of author/page.tsx already use `@/lib/...` pattern for dialogue-to-mram and mram-format imports)."
  - "Module-level NODE_ENV read kept OUT of dev-guard.ts — both functions read `process.env.NODE_ENV` at call time so tests can mutate the env-var between runs without needing module-reload tricks."
  - "Error message literal string kept as `[DEV-GUARD] refusing to run in production (NODE_ENV=production). This module is dev-only.` to match plan's PATTERNS.md §Guard API spec AND satisfy both test regex assertions (/DEV-GUARD/ + /NODE_ENV=production/)."

patterns-established:
  - "Any future dev-only code path should import from `@/lib/dev-guard` rather than rolling its own `process.env.NODE_ENV` check"
  - "Plan 08 (preview-bake.ts) has `assertDevOnly()` available to call at module load — it is now the single spec for prod-refusal semantics"

requirements-completed: [AUTHOR-08]

# Metrics
duration: ~8min
completed: 2026-04-23
---

# Phase 3 Plan 03: Dev-Guard Extraction Summary

**Created `src/lib/dev-guard.ts` as the single source of truth for dev-only refusal semantics (D-15). Exports two complementary functions: `isDev()` (non-throwing boolean — used by React components to render a disabled banner) and `assertDevOnly()` (throws with `[DEV-GUARD]` prefix in production — used by Node scripts to refuse to start). Refactored `src/app/author/page.tsx` to import `isDev()` instead of carrying its own inline `process.env.NODE_ENV === "production"` check; banner JSX preserved byte-for-byte. Plan 08's preview-bake.ts now has a ready-to-import `assertDevOnly()` at module load.**

## Performance

- **Duration:** ~8 min (fully local work; 2 atomic commits; one full `npm run build` + one full vitest run between commits)
- **Started:** 2026-04-23T17:31:24Z
- **Completed:** 2026-04-23T18:13:23Z (wall-clock window includes build reruns)
- **Tasks:** 2/2
- **Files created:** 1 (`src/lib/dev-guard.ts`, 33 lines)
- **Files modified:** 2 (`src/lib/__tests__/dev-guard.test.ts`, `src/app/author/page.tsx`)

## Accomplishments

- **`src/lib/dev-guard.ts` created** (33 lines):
  - `isDev()` — returns `process.env.NODE_ENV !== "production"`. Treats dev, test, and unset NODE_ENV all as "this is a dev environment, serve the surface."
  - `assertDevOnly()` — if `!isDev()`, throws `Error("[DEV-GUARD] refusing to run in production (NODE_ENV=production). This module is dev-only.")`. Safe to call at module load.
  - No module-level `process.env` read; functions call `process.env.NODE_ENV` at call time (tests can mutate env between cases without reload).
  - Pure stdlib, zero dependencies, no module state — importable from both React client code (`src/app/`) and Node scripts (`scripts/`).
- **`src/lib/__tests__/dev-guard.test.ts` filled** (49 lines, replacing 4 `it.todo` stubs with 8 real tests):
  - 4 tests on `isDev()`: returns `true` for `development`, `test`, unset; returns `false` for `production`.
  - 4 tests on `assertDevOnly()`: throws with `/DEV-GUARD/` AND `/NODE_ENV=production/` regex match in production; does NOT throw in development, test, or unset.
  - `@vitest-environment node` pragma preserved from Plan 01 scaffold.
  - NODE_ENV state restoration handled by describe-scope `savedEnv` + `afterEach` reset.
- **`src/app/author/page.tsx` refactored** (3 lines removed, 2 added, net -1):
  - Added `import { isDev } from "@/lib/dev-guard";` (alphabetically placed between `dialogue-to-mram` and `mram-format` imports).
  - Removed `const isProduction = process.env.NODE_ENV === "production";` line.
  - Changed `if (isProduction) {` to `if (!isDev()) {`.
  - Banner `<div>/<h1>/<p>` JSX preserved byte-for-byte (className, whitespace, text content all unchanged).

## Final dev-guard.ts API Surface

```typescript
// src/lib/dev-guard.ts
export function isDev(): boolean;
export function assertDevOnly(): void;  // throws Error when NODE_ENV === "production"
```

Error message produced by `assertDevOnly()` in production:
```
[DEV-GUARD] refusing to run in production (NODE_ENV=production). This module is dev-only.
```

## NODE_ENV Behavior Matrix

| NODE_ENV value | `isDev()` returns | `assertDevOnly()` behavior |
|----------------|-------------------|----------------------------|
| `"development"` | `true` | no-op |
| `"test"`        | `true` | no-op |
| `undefined` (unset) | `true` | no-op |
| `"production"`  | `false` | throws `Error("[DEV-GUARD] ...")` |

All four rows covered by two test cases each — 8 tests total.

## Banner Byte-Identity Verification

**Pre-refactor (removed):**
```typescript
const isProduction = process.env.NODE_ENV === "production";

if (isProduction) {
  return (
    <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-6 text-red-200">
      <h1 className="text-xl font-semibold mb-2">Author tool disabled</h1>
      <p className="text-sm">
        The ritual review and correction tool only runs in local development.
        It edits plaintext ritual files on disk and is never served from a
        production build.
      </p>
    </div>
  );
}
```

**Post-refactor:**
```typescript
if (!isDev()) {
  return (
    <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-6 text-red-200">
      <h1 className="text-xl font-semibold mb-2">Author tool disabled</h1>
      <p className="text-sm">
        The ritual review and correction tool only runs in local development.
        It edits plaintext ritual files on disk and is never served from a
        production build.
      </p>
    </div>
  );
}
```

Delta: 1 deleted line (`const isProduction = ...`); 1 changed line (`if (isProduction)` → `if (!isDev())`). The JSX block — `<div>` through `</div>` — is byte-identical pre/post, as verified by grep counts:
- `grep -c "Author tool disabled" src/app/author/page.tsx` → `1`
- `grep -c "The ritual review and correction tool only runs in local development" src/app/author/page.tsx` → `1`
- `grep -c "It edits plaintext ritual files on disk" src/app/author/page.tsx` → `1`
- `grep -c "isProduction" src/app/author/page.tsx` → `0`

This matters because T-03-02c (threat model) accepts the risk of "future engineer deletes the guard" by relying on code review + grep-based prod-deployment smoke tests that look for the banner string. Keeping the banner string identical means those smoke tests continue to trigger correctly.

## Test Results

- **dev-guard.test.ts only:** `npx vitest run --no-coverage src/lib/__tests__/dev-guard.test.ts` — 8 passed / 0 failed / 0 todo.
- **Full vitest suite (post-Task-2):** 38 files passed + 5 skipped = 43 total, 422 passed + 54 todo = 476 tests. Zero failures. Vs Plan 02 baseline (414 passed + 58 todo = 472): +8 tests from dev-guard, -4 todos from filling the scaffold. Net +8 passes, -4 todos.
- **Build (`npm run build`):** exits 0. Next.js compile clean; the `@/lib/dev-guard` alias resolves correctly in the App Router tree.
- **TSC (`npx tsc --noEmit`):** pre-existing errors in unrelated files (`src/lib/__tests__/screen-wake-lock.test.ts`, `src/lib/__tests__/voice-export-import.test.ts`) exist on the clean tree before any Plan 03 changes. Verified by `git stash` round-trip: identical error set. Zero errors mention `dev-guard` or `/author/page.tsx`. Out of scope per executor deviation-rules scope boundary.

## Threat Model Mitigation Verification

| Threat ID | Status after Plan 03 |
|-----------|----------------------|
| T-03-02 (Info Disclosure — `/author` page in production) | **Mitigated.** Component returns the "Author tool disabled" banner when `isDev()` returns false. All 4 NODE_ENV states test-covered. |
| T-03-02b (Info Disclosure — preview-bake in production, Plan 08) | **Primitive ready.** `assertDevOnly()` exists, throws with searchable `[DEV-GUARD]` prefix. Plan 08 will wire the call at module load. Not yet active (Plan 08 not landed). |
| T-03-02c (Tampering — future engineer deletes the guard) | **Accept-level defenses intact.** Banner string preserved byte-identical; test file covers all 4 NODE_ENV states; code review + branch protection on main as primary defenses. |

## Task Commits

Each task committed atomically on `gsd/phase-3-authoring-throughput`:

1. **Task 1: Create src/lib/dev-guard.ts + fill Plan-01 test scaffold** — `4eda2b4`
   (`author-08: extract dev-guard.ts shared dev-only guard (D-15)`)
2. **Task 2: Refactor src/app/author/page.tsx to use isDev()** — `a61a47d`
   (`author-08: wire /author/page.tsx to shared dev-guard (D-15)`)

## Deviations from Plan

None — plan executed exactly as written. Both tasks' action blocks applied verbatim; all acceptance criteria pass; no auto-fixes required; no blockers hit; branch `gsd/phase-3-authoring-throughput` held stable throughout.

## Issues Encountered

**Pre-existing transient flakiness in `src/lib/__tests__/auth.test.ts`** — one run surfaced a single failure in a tampered-token test. Re-running the same suite immediately produced 422/422 passing with identical code. Not caused by dev-guard changes (verified on `git stash`'d clean tree — same test passed in isolation). Logged here for completeness; not a deviation since no Plan 03 file was involved.

## User Setup Required

None — all changes are local repo code + tests. The refactor is behaviorally invisible in dev (both pre and post, `isDev()` returns true and the page renders normally); in a `NODE_ENV=production npm start` run, both pre and post show the byte-identical "Author tool disabled" banner.

## Next Phase Readiness

- **Plan 04 (author-validation bake-band, D-08):** unblocked. No dependency on this plan.
- **Plans 05-07:** unblocked.
- **Plan 08 (preview-bake.ts):** unblocked and now has `assertDevOnly()` ready to import at module load. The D-15 single-source-of-truth invariant is established — preview-bake's `assertDevOnly()` call will use the same primitive `/author/page.tsx`'s `isDev()` check already uses.
- **No blockers** for any downstream plan.

## Self-Check: PASSED

- Files claimed created (1): `src/lib/dev-guard.ts` — FOUND (33 lines, both exports present, `[DEV-GUARD]` literal present).
- Files claimed modified (2):
  - `src/lib/__tests__/dev-guard.test.ts` — FOUND (49 lines, 8 real tests, 0 `it.todo` stubs remaining).
  - `src/app/author/page.tsx` — FOUND (import added at line 30; inline `isProduction` check removed at line 220; banner JSX byte-identical).
- Commits claimed:
  - `4eda2b4` — FOUND on `gsd/phase-3-authoring-throughput` (Task 1).
  - `a61a47d` — FOUND on `gsd/phase-3-authoring-throughput` (Task 2).
- Verification commands:
  - `npx vitest run --no-coverage src/lib/__tests__/dev-guard.test.ts` → 8 passed / 0 failed / 0 todo.
  - `npx vitest run --no-coverage` (full suite) → 422 passed + 54 todo, 0 failed.
  - `npm run build` → exit 0, `/author` route compiled successfully.
  - `grep -c "isProduction" src/app/author/page.tsx` → `0`.
  - `grep -c "isDev" src/app/author/page.tsx` → `2`.
  - `grep "Author tool disabled" src/app/author/page.tsx | wc -l` → `1`.
  - `grep -q "\[DEV-GUARD\]" src/lib/dev-guard.ts` → match.
  - `grep -cE "^export function (isDev|assertDevOnly)" src/lib/dev-guard.ts` → `2`.

---
*Phase: 03-authoring-throughput*
*Completed: 2026-04-23*
