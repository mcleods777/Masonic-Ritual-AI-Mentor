---
phase: 03-authoring-throughput
plan: 01
subsystem: testing
tags: [vitest, p-limit, fake-indexeddb, gitignore, pure-functions, dev-guard]

# Dependency graph
requires:
  - phase: 02-safety-floor
    provides: shipped safety floor (rate limiting, audit log, budget caps) as the stable base Phase 3 builds on
provides:
  - p-limit@^7.3.0 runtime dependency for future bake-orchestrator concurrency control
  - fake-indexeddb@^6.2.5 devDependency for future idb-schema.ts unit tests
  - vitest scripts/**/*.test.{ts,tsx} include glob
  - hardened .gitignore for rituals/_bake-cache/ (cache dir ignored, sentinel .gitignore not ignored, recursive rituals/**/*.json)
  - scripts/lib/bake-math.ts (computeMedianSecPerChar, isDurationAnomaly, wordDiff pure functions)
  - src/lib/dev-guard.ts (isDev, assertDevOnly framework-agnostic dev-only guard)
affects: [03-02, 03-03, 03-04, 03-05, 03-06, 03-07, 03-08, 03-09]

# Tech tracking
tech-stack:
  added: [p-limit@^7.3.0, fake-indexeddb@^6.2.5]
  patterns:
    - "Pure-function modules for math/diff logic — no fs/process/console imports, unit-testable in isolation"
    - "Framework-agnostic dev-guard (isDev/assertDevOnly) as the standalone-script counterpart to Next.js Request-based _guard.ts"

key-files:
  created:
    - scripts/lib/bake-math.ts
    - scripts/__tests__/bake-math.test.ts
    - src/lib/dev-guard.ts
    - src/lib/__tests__/dev-guard.test.ts
  modified:
    - package.json
    - package-lock.json
    - vitest.config.ts
    - .gitignore

key-decisions:
  - "Copied bake-math.ts and dev-guard.ts verbatim from PATTERNS.md reference (517-test-verified prior implementation on abandoned branch 58eb551), per plan instruction"
  - "Did not add .opus as a bare global .gitignore rule — scoped to rituals/_bake-cache/* per D-06, avoiding an over-broad ignore rule"
  - "Left *.mram.backup-* and .zip gitignore gaps unfixed (out of AUTHOR scope) — flagged below for Shannon"

patterns-established:
  - "Pure-function utility modules (bake-math.ts) stay free of I/O; threshold/sample-count policy lives in the caller, not the pure function"
  - "TDD RED/GREEN commit pairs for every new pure/guard module: test(03-01) commit first (failing), feat(03-01) commit second (passing)"

requirements-completed: [AUTHOR-01, AUTHOR-06, AUTHOR-07, AUTHOR-08]

# Metrics
duration: 12min
completed: 2026-07-02
---

# Phase 3 Plan 1: Authoring Throughput Foundation Summary

**Installed p-limit + fake-indexeddb, extended vitest to cover scripts/ tests, hardened .gitignore for the new in-repo bake cache, and shipped two pure/self-contained helper modules (bake-math.ts, dev-guard.ts) that Wave 2 plans depend on.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-02T16:20:05Z
- **Completed:** 2026-07-02T16:23:45Z
- **Tasks:** 3
- **Files modified:** 8 (4 created, 4 modified)

## Accomplishments
- Two pre-vetted dependencies (`p-limit@^7.3.0`, `fake-indexeddb@^6.2.5`) installed at pinned versions, both [OK] in the RESEARCH.md Package Legitimacy Audit
- `vitest.config.ts` now discovers `scripts/**/*.test.{ts,tsx}`, unblocking all future `scripts/` test files
- `.gitignore` hardened so `rituals/_bake-cache/*` (future Opus audio + nested JSON) can never be accidentally committed, while the cache directory's own `.gitignore` sentinel stays trackable
- `scripts/lib/bake-math.ts` ships three pure, fully unit-tested functions (`computeMedianSecPerChar`, `isDurationAnomaly`, `wordDiff`) with zero I/O
- `src/lib/dev-guard.ts` ships the framework-agnostic `isDev`/`assertDevOnly` guard that Wave 3's `preview-bake.ts` will call at module load

## Task Commits

Each task was committed atomically:

1. **Task 1: Install deps, extend vitest include, harden .gitignore** - `65d2abb` (chore)
2. **Task 2: Create scripts/lib/bake-math.ts pure helpers + tests** - `a721969` (test, RED) → `d3e0f77` (feat, GREEN)
3. **Task 3: Create src/lib/dev-guard.ts + tests** - `568ee10` (test, RED) → `bd7caef` (feat, GREEN)

**Plan metadata:** committed alongside this SUMMARY (worktree mode — orchestrator handles the shared-file metadata commit after merge)

_Note: TDD tasks (2, 3) each have two commits (test → feat); no refactor step was needed since both implementations were copied verbatim from the verified PATTERNS.md reference and passed on the first GREEN run._

## Files Created/Modified
- `scripts/lib/bake-math.ts` - Pure duration-anomaly and word-diff math (computeMedianSecPerChar, isDurationAnomaly, wordDiff)
- `scripts/__tests__/bake-math.test.ts` - 19 tests covering empty-array, insufficient-sample guard, band-boundary (strict >/<), and case-insensitive/whitespace-normalized wordDiff cases
- `src/lib/dev-guard.ts` - isDev()/assertDevOnly() framework-agnostic dev-only guard
- `src/lib/__tests__/dev-guard.test.ts` - 5 tests toggling NODE_ENV around each assertion, restored via afterEach
- `package.json` / `package-lock.json` - p-limit (dependency), fake-indexeddb (devDependency)
- `vitest.config.ts` - added `scripts/**/*.test.{ts,tsx}` to test include
- `.gitignore` - added `rituals/_bake-cache/*` + `!rituals/_bake-cache/.gitignore` + recursive `rituals/**/*.json`

## Decisions Made
- Followed the plan's explicit instruction to copy `bake-math.ts` and `dev-guard.ts` verbatim from the PATTERNS.md reference (sourced from the abandoned, 517-test-verified branch `58eb551`) rather than reimplementing from scratch — reduces risk of introducing new bugs in code with a proven track record.
- Scoped the `.opus` gitignore protection to `rituals/_bake-cache/*` only, per D-06, instead of a bare global `*.opus` rule that could hide legitimate future audio assets elsewhere in the repo.

## Deviations from Plan

None - plan executed exactly as written. `npm install` triggered a full dependency install (386 → 518 packages) because `node_modules` did not yet exist in this fresh worktree checkout — this is expected worktree behavior, not a plan deviation.

## Issues Encountered
None.

## Gitignore Gaps Flagged (Out of AUTHOR Scope)

Per the plan's Task 1 instruction, two pre-existing `.gitignore` gaps were noticed but intentionally left unfixed (not in AUTHOR-01/06/07/08 scope):
- No rule for `*.mram.backup-*` (backup files from `.mram` rotation could be committed)
- No rule for `.zip` (archive exports could be committed)

Flagging these for Shannon to decide whether they warrant a follow-up hygiene fix.

## TDD Gate Compliance

Both TDD tasks (2 and 3) followed the full RED → GREEN cycle:
- Task 2: `a721969` (test, RED — confirmed failing via unresolved import) → `d3e0f77` (feat, GREEN — 19/19 passing)
- Task 3: `568ee10` (test, RED — confirmed failing via unresolved import) → `bd7caef` (feat, GREEN — 5/5 passing)

No REFACTOR commits were needed; both implementations passed on the first GREEN run.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Foundation is in place for all four parallel Wave 2 plans (03-02..03-05 or equivalent): `p-limit` for the bake orchestrator's concurrency control, `fake-indexeddb` for `idb-schema.ts` tests, the vitest `scripts/` glob for any new script-level test files, the hardened `.gitignore` for cache writes, and both `bake-math.ts`/`dev-guard.ts` ready for import by downstream plans.
- Full repo test suite verified green: 38 test files, 433 tests passing (including the 24 new tests from this plan).
- No blockers.

---
*Phase: 03-authoring-throughput*
*Completed: 2026-07-02*

## Self-Check: PASSED

All 5 created/modified files confirmed present on disk; all 6 commit hashes (65d2abb, a721969, d3e0f77, 568ee10, bd7caef, 1452178) confirmed present in git log.
