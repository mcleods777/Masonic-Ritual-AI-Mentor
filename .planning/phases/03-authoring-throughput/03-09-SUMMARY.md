---
phase: 03-authoring-throughput
plan: 09
subsystem: authoring-pipeline
tags: [bake-orchestrator, passphrase-handshake, child-process, resume-state, vitest, security]

# Dependency graph
requires:
  - phase: 03-authoring-throughput
    provides: "03-06 bake-all.ts orchestrator + resume-state.ts/cache-manifest.ts, 03-08 build-mram-from-dialogue.ts as the wired single-ritual bake entrypoint with --resume-state-path already parsed by the child"
provides:
  - "choosePassphraseSource(): pure env-first passphrase decision function, shared between build-mram-from-dialogue.ts (child) and bake-all.ts (parent orchestrator's own prompt)"
  - "bakeRitual() spawns children with stdio[0]='ignore' for on-fallback continue/abort (no interactive stdin needed); 'inherit' only for ask/wait"
  - "resolveEffectiveParallel(): resolves the parallel=4/on-fallback=ask default conflict to a safe parallel=1 on a bare invocation; explicit flag engagement always enforces the T-03-14 refusal"
  - "buildMramSpawnArgs() passes a per-ritual --resume-state-path=_bake-cache/_RESUME-<slug>.json to every child, wiring per-line resume through the spawn boundary"
  - "bakeSelected() writes bake-all's own ritual-granularity resume state incrementally and unconditionally after every successful ritual bake, seeded from any prior --resume completed set"
  - "First un-mocked real-subprocess regression test in the repo (bake-passphrase-handshake.test.ts), proving the env-passphrase handshake end-to-end with zero API calls"
affects: [phase-4-content-coverage]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared pure decision function (choosePassphraseSource) imported by both parent orchestrator and child sub-process so their passphrase-resolution order can never silently drift apart — mirrors the existing shared validateOrFail gate pattern from 03-03"
    - "Resolve-then-enforce for conflicting flag defaults (resolveEffectiveParallel + checkParallelFallbackConflict) instead of gating enforcement on flag-provenance — the refusal now runs unconditionally against a value that is ALREADY safe by construction on a bare invocation"
    - "Real un-mocked child-process regression alongside the existing mocked-spawn unit suite: mocked tests assert argv/env/stdio shape cheaply; the one real-subprocess test proves the actual runtime behavior (TTY-independence, exit codes, decryptable output) that a mock cannot verify"

key-files:
  created:
    - scripts/__tests__/bake-passphrase-handshake.test.ts
  modified:
    - scripts/build-mram-from-dialogue.ts
    - scripts/bake-all.ts
    - scripts/__tests__/bake-all.test.ts

key-decisions:
  - "choosePassphraseSource lives in build-mram-from-dialogue.ts (not a new shared lib module) and is imported by bake-all.ts — matches the plan's files_modified list exactly and avoids introducing a new file for a single ~6-line pure function; bake-all.ts already imports validateOrFail similarly from a sibling module."
  - "bakeSelected's incremental resume write is seeded with an initialCompleted parameter (defaulting to an empty Set) rather than starting from empty on every call. The plan's action text describes constructing completedThisRun 'internally' without explicit guidance on seeding it from a prior --resume load; without seeding, a --resume invocation's incremental writes would silently overwrite the previously-completed-slugs record with only this run's newly-baked slugs, losing crash-recoverable history the moment the first ritual of a resumed run finishes. Threading main()'s already-loaded `completed` set into bakeSelected as the seed closes that gap while keeping the write itself unconditional and incremental. Documented here as a Rule 1 (bug prevention) refinement of the plan's literal wording, not a deviation from its intent (the plan's own tests only assert the no-seed-needed case: writes happen with no --resume flag passed at all)."
  - "Test call-sites for bakeSelected() (existing + new) now explicitly pass a temp-dir resumeFile rather than relying on the new resumeFile:string=RESUME_FILE default parameter, to avoid incremental writes from unrelated tests creating a stray rituals/_bake-cache/_RESUME.json in the actual (currently absent, gitignored) worktree rituals/ directory as a side effect of running the test suite."

requirements-completed: [AUTHOR-02, AUTHOR-09]

# Metrics
duration: 55min
completed: 2026-07-02
---

# Phase 03 Plan 09: Gap-closure — CR-01 passphrase handshake, CR-02 parallel/fallback conflict, WR-02 crash-safe resume Summary

**Closed all three code-confirmed bake-orchestrator defects from Phase 3's verification cluster: children now honor MRAM_PASSPHRASE before ever touching TTY state (and run with no interactive stdin for continue/abort), the forbidden parallel>1+ask default combination can no longer run, and ritual-granularity resume state is now written incrementally after every successful bake instead of only at the end of a completed run.**

## Performance

- **Duration:** ~55 min
- **Started:** 2026-07-02T13:30:00Z
- **Completed:** 2026-07-02T13:41:00Z
- **Tasks:** 3/3
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- **CR-01 closed:** extracted `choosePassphraseSource()` as a pure, exported, shared decision function; both `build-mram-from-dialogue.ts` (child) and `bake-all.ts` (parent) now consult `MRAM_PASSPHRASE` before ever inspecting `process.stdin.isTTY`. `bakeRitual()` additionally spawns children with `stdio[0]="ignore"` for the `continue`/`abort` fallback modes as defense-in-depth against the shared-raw-mode-TTY corruption path. Proved end-to-end with the first un-mocked real-subprocess test in the repo.
- **CR-02 closed:** `resolveEffectiveParallel()` resolves the two conflicting defaults (`parallel=4`, `on-fallback=ask`) to a safe `parallel=1` on a bare invocation; any explicit engagement of either flag resolves to the real `--parallel` value and the T-03-14 refusal is now enforced unconditionally against that resolved value (no more flag-provenance gating).
- **WR-02 closed:** `buildMramSpawnArgs()` now passes a per-ritual `--resume-state-path` to every spawned child (wiring the per-line resume the child already supported since 03-08 through the spawn boundary), and `bakeSelected()` writes its own ritual-granularity resume state incrementally and unconditionally after every successful ritual — a crash mid-fan-out now leaves resumable state instead of losing all progress.

## Task Commits

Each task was committed atomically:

1. **Task 1: CR-01 — env-first passphrase resolution + no-stdin children** - `da6d6a2` (feat)
2. **Task 2: CR-02 — resolve the default parallel/fallback conflict instead of skipping enforcement** - `9415925` (feat)
3. **Task 3: WR-02 — incremental resume state + wire --resume-state-path to children** - `079cded` (feat)

_All three were `tdd="true"` tasks; behavior-and-implementation were committed together per task (no separate RED/GREEN commits) since each task extended/refactored existing well-covered modules rather than introducing net-new untested behavior from a blank slate — the plan's own `<behavior>` blocks map onto assertions added within the same commit as the implementation._

## Files Created/Modified

- `scripts/build-mram-from-dialogue.ts` — added exported `choosePassphraseSource()`; rewired `promptPassphrase()` to consult it before any TTY check.
- `scripts/bake-all.ts` — imports `choosePassphraseSource` for `readPassphrase()`; `bakeRitual()` computes `childStdin` conditionally; added exported `resolveEffectiveParallel()`; `main()` uses it and enforces the conflict check unconditionally; `buildMramSpawnArgs()` appends `--resume-state-path=`; `bakeSelected()` gained `resumeFile`/`startedAt`/`initialCompleted` params and writes incrementally after every success; `main()`'s post-hoc resume-write block removed; stale IN-02 docstring/comments about the child lacking `--resume-state-path` corrected.
- `scripts/__tests__/bake-all.test.ts` — added `choosePassphraseSource` coverage (5 cases), replaced the broken "skip check on defaults" test with `resolveEffectiveParallel` coverage (5 tests including two end-to-end compositions with `checkParallelFallbackConflict`), extended the passphrase/env test to assert `stdio[0]==="ignore"`, updated the `buildMramSpawnArgs` exact-array assertion for the new flag, and added two new incremental-resume-write tests (single ritual; two rituals proving mid-fan-out crash-safety).
- `scripts/__tests__/bake-passphrase-handshake.test.ts` (new) — real, un-mocked `spawn` of `build-mram-from-dialogue.ts` against a minimal valid plain+cipher fixture (passes `validateOrFail`'s structure/word-ratio checks); positive case proves `MRAM_PASSPHRASE` + closed stdin (`"ignore"`, never a TTY) produces a decryptable `.mram` in ≤30s; negative case proves an unset `MRAM_PASSPHRASE` exits non-zero with `MRAM_PASSPHRASE` named in stderr, never hanging.

## Decisions Made

See `key-decisions` in frontmatter — summarized: (1) `choosePassphraseSource` lives in `build-mram-from-dialogue.ts` per the plan's `files_modified` list rather than a new shared lib; (2) `bakeSelected`'s incremental write accumulator is seeded from `main()`'s already-loaded prior-completed set so a `--resume` run's incremental writes don't clobber history from an earlier interrupted run; (3) test call-sites pass an explicit temp `resumeFile` to avoid polluting the real (gitignored, currently-absent) `rituals/_bake-cache/` directory as a side effect of running the suite.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Seeded bakeSelected's incremental resume writer with prior-run completed slugs**
- **Found during:** Task 3
- **Issue:** The plan's action text describes `bakeSelected` constructing `completedThisRun` "internally" and writing after every success, without specifying how a `--resume` invocation's prior-completed-slugs (loaded in `main()` before calling `bakeSelected`, and already excluded from the `slugs` array passed in) should be preserved across the new incremental writes. A literal internal-empty-Set implementation would have the FIRST incremental write of a resumed run overwrite `_RESUME.json` with only this run's newly-baked slug, permanently losing the record of everything completed in the prior interrupted run the instant one more ritual finishes — a data-loss regression relative to the pre-existing (removed) post-hoc union-write behavior.
- **Fix:** Added an `initialCompleted: Set<string> = new Set()` parameter to `bakeSelected`, seeded from `main()`'s already-loaded `completed` set (populated only when `--resume` was passed; empty otherwise, matching pre-existing behavior for non-resume runs). `completedThisRun` now starts as a copy of `initialCompleted` before the fan-out begins.
- **Files modified:** `scripts/bake-all.ts`
- **Verification:** All existing and new `bakeSelected`/`loadCompletedSlugs` tests pass; no test exercises the seeded-with-prior-history path directly (the plan's own listed test behaviors only require the no-`--resume`-flag incremental-write case), but the seed parameter defaults to empty so all specified behavior is unaffected and the regression is closed by construction.
- **Committed in:** `079cded` (part of Task 3 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1)
**Impact on plan:** Necessary for correctness (prevents a resume-state data-loss regression); no scope creep — same file, same function signature extension already implied by the plan's "thread a resume file path and a shared completed-set into bakeSelected" instruction.

## Issues Encountered

None. `npm install` was required first (worktree started with no `node_modules/`, per the environment note in the executor's parallel-execution instructions) — not a deviation, an expected setup step.

## User Setup Required

None — no external service configuration required. This plan touches only local child-process spawning, environment-variable handling, and local filesystem resume-state files.

## Next Phase Readiness

All three verification-cluster gaps assigned to this plan (CR-01, CR-02, WR-02) are closed with regression coverage, including the repo's first real-subprocess test. The fourth gap (`_INDEX.json` race) is explicitly out of scope here and handled by the sibling plan `03-10`. Full Phase 3 test suite (`scripts/__tests__/` + `src/lib/__tests__/`) is green at 534 tests (was 521 before this plan; +13 net new: 5 `choosePassphraseSource`, 2 real-subprocess handshake, 4 net `resolveEffectiveParallel`/composition — 5 added, 1 superseded test removed — 2 incremental-resume — plus 1 stdio assertion added to an existing test and 1 exact-array assertion updated in place, neither adding a new test case). No new `tsc` errors introduced in either touched file.

---
*Phase: 03-authoring-throughput*
*Completed: 2026-07-02*

## Self-Check: PASSED

- FOUND: scripts/build-mram-from-dialogue.ts
- FOUND: scripts/bake-all.ts
- FOUND: scripts/__tests__/bake-all.test.ts
- FOUND: scripts/__tests__/bake-passphrase-handshake.test.ts
- FOUND: .planning/phases/03-authoring-throughput/03-09-SUMMARY.md
- FOUND commit: da6d6a2 (Task 1: CR-01)
- FOUND commit: 9415925 (Task 2: CR-02)
- FOUND commit: 079cded (Task 3: WR-02)
