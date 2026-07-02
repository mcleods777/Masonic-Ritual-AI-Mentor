---
phase: 03-authoring-throughput
plan: 06
subsystem: cli-tooling
tags: [orchestrator, p-limit, content-hash, cli, spawn, vitest]

# Dependency graph
requires:
  - phase: 03-authoring-throughput
    provides: "03-03's scripts/lib/validate-or-fail.ts shared validator gate (validateOrFail(plainPath, cipherPath, slug?))"
provides:
  - "scripts/bake-all.ts — multi-ritual bake orchestrator: discovery, --changed-only/--since content-hash change detection, --dry-run, ritual-granularity --resume, --parallel N via p-limit, --on-fallback passthrough with parallel-conflict refusal"
  - "scripts/lib/cache-manifest.ts — content-hash change-detection manifest (hashFile, getChangedRituals, recordBaked) replacing the confirmed-broken git-diff approach"
  - "scripts/lib/resume-state.ts — atomic tmp+rename ResumeState read/write, ported verbatim from the abandoned branch"
affects: [03-07-preview-bake, phase-4-content-coverage]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Content-hash manifest (sha256 of file bytes) for change detection instead of git diff — required whenever the source files under detection are gitignored"
    - "Flag-touched gating: when two CLI flags share conflicting defaults, only enforce the conflict once the user has explicitly set one of them (parallelFlagPresent || onFallbackFlagPresent), otherwise a bare invocation would be refused for a combination the user never chose"
    - "Ritual-granularity resume via a repurposed per-line ResumeState contract (completedLineIds holds ritual slugs, not line IDs) — documented bridge until a future plan adds per-line resume plumbing to build-mram-from-dialogue.ts"
    - "pLimit-bounded fan-out with a shared abort flag for halt-on-first-failure under bounded concurrency: tasks not yet started when a sibling fails report 'not attempted' instead of spawning on top of a possibly-corrupted state"

key-files:
  created:
    - scripts/bake-all.ts
    - scripts/lib/cache-manifest.ts
    - scripts/lib/resume-state.ts
    - scripts/__tests__/bake-all.test.ts
    - scripts/__tests__/cache-manifest.test.ts
    - scripts/__tests__/resume-state.test.ts
  modified: []

key-decisions:
  - "buildMramSpawnArgs targets CURRENT main's build-mram-from-dialogue.ts argv contract (positional plain/cipher/output + --with-audio + --on-fallback=...), not the abandoned branch's --resume-state-path/--ritual-slug/--skip-line-ids flags, which do not exist on that file as of this plan (files_modified for 03-06 excludes it)"
  - "--resume operates at RITUAL granularity, not per-line, as a direct consequence of the above — the ported ResumeState/writeResumeStateAtomic contract is reused with completedLineIds repurposed to hold completed ritual slugs under a fixed '__bake-all__' ritual marker"
  - "checkParallelFallbackConflict only enforces the parallel>1-vs-ask/wait refusal when the user explicitly touched --parallel or --on-fallback: both flags default to values (4 and 'ask') that conflict with EACH OTHER, so unconditional enforcement would refuse a completely bare `bake-all.ts --dry-run` invocation for a combination nobody chose"
  - "Halt-on-first-failure adapted for bounded concurrency (pLimit): an in-memory abort flag is checked before each queued task starts; tasks already spawned when a sibling fails are allowed to finish, tasks not yet started report 'not attempted'"

requirements-completed: [AUTHOR-02, AUTHOR-09]

# Metrics
duration: 25min
completed: 2026-07-02
---

# Phase 3 Plan 6: Multi-Ritual Bake Orchestrator (bake-all.ts) Summary

**bake-all.ts orchestrator with p-limit-capped concurrent ritual spawns, content-hash `--changed-only` detection replacing the confirmed-broken git-diff approach, and a pre-flight validator gate that runs for every selected ritual before any spawn.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-02T16:47:00Z (approx, worktree branch check)
- **Completed:** 2026-07-02T17:06:00Z
- **Tasks:** 2/2
- **Files modified:** 6 (all created)

## Accomplishments

- `scripts/lib/resume-state.ts` ported verbatim from the abandoned branch (`58eb551:scripts/lib/resume-state.ts`) — atomic tmp+rename write, defensive typeof-checked read returning `null` on missing/malformed state
- `scripts/lib/cache-manifest.ts` — new content-hash manifest (`hashFile`/`getChangedRituals`/`recordBaked`) at `rituals/_bake-cache/_manifest.json` that replaces the abandoned branch's `git diff`-based change detection, which could never see gitignored dialogue files and silently returned "0 changed" forever
- `scripts/bake-all.ts` (675 lines) — multi-ritual orchestrator: slug discovery with regex-gated names, `--changed-only`/`--since` (deprecated alias, warns, ref ignored) selection, pre-flight validator gate for every selected ritual before any spawn, `--parallel N` via `p-limit` (clamp `[1,16]` default 4) with a shared-abort-flag halt-on-first-failure summary, `--on-fallback` passthrough refused when combined with `--parallel > 1` and an explicit `ask`/`wait`, `--dry-run` (zero spawns, zero API calls, validator still runs), ritual-granularity `--resume`, and a passphrase prompted once and passed to every child via `MRAM_PASSPHRASE` env only (never argv)
- 101/101 tests green in `scripts/__tests__/` (44 new in `bake-all.test.ts`, 22 new across the two Task 1 lib test files); full repo suite 528/528 green

## Task Commits

Task 1 followed the TDD RED → GREEN cycle (tdd="true"):

1. **Task 1 (RED): failing tests for resume-state and cache-manifest** - `82cc4a5` (test) — cache-manifest tests failed (module didn't exist yet); resume-state tests passed immediately since that module is a verified port, not new logic under test-first development
2. **Task 1 (GREEN): implement resume-state and cache-manifest libs** - `dc62759` (feat)
3. **Task 2: bake-all.ts multi-ritual orchestrator** - `3265f0b` (feat)
4. **Task 2 follow-up: extract `sinceDeprecationWarning` for direct test coverage** - `1d9b71c` (test) — small refinement discovered while confirming an acceptance criterion (see Deviations)

**Plan metadata:** committed separately by the orchestrator after this SUMMARY lands.

_Note: Task 1 is tdd="true"; Task 2 is type="auto" (not TDD-gated) but was still developed test-alongside._

## Files Created/Modified

- `scripts/lib/resume-state.ts` - `ResumeState` type + `readResumeState`/`writeResumeStateAtomic` (verbatim port, no changes needed)
- `scripts/lib/cache-manifest.ts` - `RitualManifestEntry` type + `hashFile`/`getChangedRituals`/`recordBaked`, no version-control tooling invocation anywhere
- `scripts/bake-all.ts` - the orchestrator CLI (see Accomplishments)
- `scripts/__tests__/resume-state.test.ts` - 13 tests (missing/malformed/wrong-typed reads, round-trip, tmp-file cleanup, parent-dir creation)
- `scripts/__tests__/cache-manifest.test.ts` - 12 tests (hashFile determinism, fresh/unedited/plain-edit/cipher-edit/never-recorded selection, atomic write, timestamp stamping, upsert isolation, no-git-repo safety)
- `scripts/__tests__/bake-all.test.ts` - 44 tests (clampParallel bounds, parallel/fallback conflict incl. flagged-gating, flag parsing, slug discovery + regex rejection, `--changed-only`/`--since` selection parity, spawn-argv shape, passphrase-never-in-argv, validator-before-spawn ordering via mocked `node:child_process`/`validate-or-fail`, halt-on-first-failure result shape, dry-run zero-spawn, ritual-granularity resume load)

## Decisions Made

See `key-decisions` in frontmatter. In prose:

1. **Spawn-argv contract follows current `main`, not the abandoned branch.** The abandoned branch's `bake-all.ts` assumed `build-mram-from-dialogue.ts` accepted `--resume-state-path`/`--ritual-slug`/`--skip-line-ids` flags. Reading the CURRENT file (per the plan's own `read_first` instruction) showed its argv contract is still `<plain.md> <cipher.md> <output.mram> [--with-audio] [--on-fallback=...]` with no per-line resume plumbing — because this plan's `files_modified` list does not include `build-mram-from-dialogue.ts`, that file was correctly left untouched. `buildMramSpawnArgs` therefore builds the CURRENT positional contract.

2. **`--resume` is ritual-granularity, not per-line**, as a direct consequence of decision 1. The ported `ResumeState` type (per-line shape: `completedLineIds`, `inFlightLineIds`) is reused as-is per the plan's locked interface, but `bake-all.ts` is the sole writer/reader of its own `_RESUME.json`, storing completed RITUAL SLUGS in `completedLineIds` under a fixed `ritual: "__bake-all__"` marker. This is documented in the module's top-of-file comment and in `loadCompletedSlugs`'s test coverage (including a test that a resume file written under a *different* `ritual` value — i.e., a hypothetical future per-line writer — is correctly ignored by bake-all's reader).

3. **`checkParallelFallbackConflict` requires an explicit flag touch.** Discovered while manually verifying the plan's own acceptance criterion — `npx tsx scripts/bake-all.ts --dry-run` (bare, no other flags) must exit 0, but the CLI's *defaults* are `--parallel 4` and `--on-fallback=ask`, which is exactly the combination the plan also says must be refused (`--parallel 4 --on-fallback=ask --dry-run` must exit 1). Enforcing the refusal unconditionally would make the bare-invocation acceptance criterion impossible to satisfy at the same time as the explicit-flags one. Resolved by tracking `parallelFlagPresent`/`onFallbackFlagPresent` and gating enforcement on the user having explicitly set at least one of the two flags — verified against both stated acceptance criteria via real `npx tsx scripts/bake-all.ts` invocations (see Deviations below for the reasoning trail).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Default `--parallel`/`--on-fallback` values conflict with each other by construction**

- **Found during:** Task 2, manual verification of the acceptance criterion `npx tsx scripts/bake-all.ts --dry-run` exits 0
- **Issue:** A literal reading of the plan's action text ("if parallel > 1 and on-fallback is ask or wait, print an error... and exit 1") applied unconditionally would refuse even a completely bare `bake-all.ts --dry-run` invocation, because the CLI's own defaults are `--parallel 4` (CONTEXT.md discretion (c)) and `--on-fallback=ask` (matching `build-mram-from-dialogue.ts`'s own default) — those two defaults conflict with EACH OTHER. This directly contradicted the plan's other stated acceptance criterion that bare `--dry-run` must exit 0.
- **Fix:** Added `parallelFlagPresent`/`onFallbackFlagPresent` tracking to `Flags` (parallel to the existing `sinceFlagPresent` pattern) and gated `checkParallelFallbackConflict`'s enforcement on `flags.parallelFlagPresent || flags.onFallbackFlagPresent`. Verified both stated CLI acceptance criteria hold simultaneously via real `npx tsx scripts/bake-all.ts` invocations (bare `--dry-run` → exit 0 "No rituals selected"; `--parallel 4 --on-fallback=ask --dry-run` → exit 1 naming both flags).
- **Files modified:** `scripts/bake-all.ts` (Flags interface, parseFlags, checkParallelFallbackConflict)
- **Commit:** `3265f0b` (introduced), `1d9b71c` (added direct test coverage for the `flagged` gating and the deprecation-warning content)

**2. [Rule 1 - Bug] `<verify><automated>` grep pattern matched the module's own explanatory comment**

- **Found during:** Task 1, running the plan's literal `<verify>` command for `cache-manifest.ts`
- **Issue:** `! grep -qE "execFileSync|spawn|\"git\"|'git'" scripts/lib/cache-manifest.ts` does not exclude comments (unlike the acceptance_criteria's separate `grep -v '^\s*//'`-filtered check). The module's own doc comment explaining "this module deliberately contains no `execFileSync`/`spawn`/`git` invocation" tripped the check by literally containing those words as prose.
- **Fix:** Reworded the doc comment to describe the same constraint without using the literal substrings `execFileSync`/`spawn` (kept `git` references only inside markdown backticks, which the pattern's `"git"`/`'git'` alternatives don't match).
- **Files modified:** `scripts/lib/cache-manifest.ts` (top-of-file comment only, no logic change)
- **Commit:** `dc62759`

## Known Stubs

None. `bake-all.ts` is fully wired against the real `validate-or-fail.ts`, `cache-manifest.ts`, and `resume-state.ts` modules with no mocked/placeholder call sites in production code (only the test suite mocks `node:child_process` and `../lib/validate-or-fail`, which is standard unit-test isolation, not a stub in shipped code).

## Environment Notes

- This worktree started with no `node_modules/` (per the parallel-execution setup notes) — ran `npm install` (517 packages) before any test execution.
- `rituals/` does not exist in this worktree (untracked content directory, correctly excluded per the environment notes). `getAllRituals`/dry-run/discovery all handle a missing `rituals/` dir gracefully (`fs.existsSync` guard → empty selection → "Nothing to bake." exit 0). Real multi-ritual behavior (discovery finding actual `*-dialogue.md` pairs, real spawns) is covered by fixture-based unit tests using temp dirs, not by exercising the real `rituals/` tree — consistent with the plan's own instruction to use temp-dir fixtures rather than real ritual content.
- `npx tsc --noEmit` on the full repo shows 17 lines of pre-existing errors in unrelated `src/` test files (already logged in `.planning/phases/03-authoring-throughput/deferred-items.md` by an earlier plan in this phase, and reconfirmed here as identical/out-of-scope). Zero errors in any file this plan touched.

## Next Steps

- A future plan that adds per-line resume plumbing to `build-mram-from-dialogue.ts` (`--resume-state-path`/`--skip-line-ids`) can upgrade `bake-all.ts`'s `--resume` from ritual granularity to per-line granularity by having the child process write the same `_RESUME.json` contract directly — `resume-state.ts`'s shape does not need to change.
- Phase 4 (Content Coverage) is the first real consumer of `bake-all.ts` against actual ritual content; that will be the first end-to-end exercise of the real `spawn("npx", [...])` path (this plan's tests mock `node:child_process` throughout).
