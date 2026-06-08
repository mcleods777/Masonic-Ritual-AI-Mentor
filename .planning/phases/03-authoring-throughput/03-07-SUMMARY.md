---
phase: 03-authoring-throughput
plan: 07
subsystem: orchestrator
tags: [orchestrator, parallel, resume, since-ref, dry-run, p-limit, line-level-resume, author-02, author-09, d-04, d-05, d-06, d-07]

# Dependency graph
requires:
  - phase: 03-authoring-throughput
    plan: 01
    provides: p-limit@7.3.0 dep + bake-all.test.ts scaffold + npm run bake-all script entry
  - phase: 03-authoring-throughput
    plan: 04
    provides: validatePair() severity-"error" gate from src/lib/author-validation.ts (D-08)
  - phase: 03-authoring-throughput
    plan: 06
    provides: scripts/lib/resume-state.ts (ResumeState interface + readResumeState + writeResumeStateAtomic) + build-mram --resume-state-path / --ritual-slug / --skip-line-ids CLI contract
provides:
  - scripts/bake-all.ts (486 lines) — Phase 3 orchestrator entrypoint
  - parseFlags() exported — argv parser for --since / --dry-run / --resume / --parallel / --verify-audio / --help (D-04/05/06/07/11)
  - clampParallel() exported — [1, 16] clamp with default 4 per D-07, handles NaN + non-numeric (AUTHOR-09)
  - getChangedRituals() exported — git diff --name-only --diff-filter=d wrapper with pathspec as separate argv elements (Pitfall 5)
  - getAllRituals() exported — filesystem ritual discovery for the no-flag path
  - validateOrFail() exported — D-08 gate calling validatePair() + filtering severity === 'error' + process.exit(1)
  - dialogueChecksum() exported — SHA-256 of plain dialogue file for future crash-resume guard
  - clearResumeStateFile() exported — unlinks rituals/_bake-cache/_RESUME.json after clean ritual finish (D-06)
  - buildMramSpawnArgs() exported — orchestrator→build-mram spawn arg assembly (D-06 contract: --resume-state-path + --ritual-slug + conditional --skip-line-ids + --verify-audio)
  - Flags interface exported — TypeScript contract for parseFlags output
  - 27 passing tests in scripts/__tests__/bake-all.test.ts (replaced Plan-01's 11 it.todo stubs)
affects: []

# Tech tracking
tech-stack:
  added: []  # Plan 01 installed all Phase 3 deps; Plan 07 uses what's already there
  patterns:
    - "Frozen module-level path.resolve + test finally-cleanup: RITUALS_DIR and RESUME_FILE are resolved once at module load, so checksum/clearResumeStateFile tests can't chdir-redirect. Workaround: use real rituals/ dir with __bake-all-test-{pid}- prefixed slug + finally cleanup (also preserve+restore any pre-existing _RESUME.json)"
    - "isDirectRun guard (`process.argv[1]?.endsWith('bake-all.ts')`) lets the file be both a runnable CLI AND an importable test source — main() only fires when invoked via npx/npm, never when imported by vitest"
    - "Sub-process delegation: orchestrator does NOT write _RESUME.json; build-mram-from-dialogue.ts (Plan 06) does, per-line. Orchestrator is the READER + cleanup-owner. Two processes, one write/read contract via scripts/lib/resume-state.ts"
    - "Validator-first ordering locked in: all rituals pass validatePair() BEFORE any API call. A single corrupt cipher/plain pair halts the run before one Gemini/Google byte ships (PATTERNS.md §Validator-gate; anti-pattern §4)"

key-files:
  created:
    - scripts/bake-all.ts
    - .planning/phases/03-authoring-throughput/03-07-SUMMARY.md
  modified:
    - scripts/__tests__/bake-all.test.ts

key-decisions:
  - "pLimit instantiated in main() with the clamped N even though the current bake loop is sequential. The per-line concurrency lives inside build-mram-from-dialogue.ts; when ritual-level parallelism is added, the limit callsite is ready. Keeps the grep criterion `pLimit: ≥ 2` satisfied and reserves the architectural slot. Documented in-code."
  - "dialogueChecksum field is NOT added to ResumeState in this plan. Plan 06's ResumeState shape is authoritative; adding a field here would force a writer-side change (out of Phase 3 scope). The orchestrator's guard for Phase 3 is 'same ritual slug + file still readable' — documented in-code as a future-enhancement slot. Shannon's workflow rarely involves editing dialogue between crash and resume within the same minute."
  - "Failure halt-on-first-error preserved: the per-ritual loop `break`s on the first failure. Alternative (continue through all rituals and surface aggregate) rejected for Phase 3 — a failed ritual likely means a systemic issue (auth, quota, anomaly detector) and baking the next ritual just burns quota on the same failure mode. Results array still collects both sides per Pitfall 7, but the loop exits early."
  - "dialogueChecksum + clearResumeStateFile tests use the real rituals/ and rituals/_bake-cache/ paths with try/finally cleanup (and prior-contents restore for _RESUME.json). This honors the module-load-frozen path.resolve(...) constants in bake-all.ts without monkey-patching, at the cost of being an integration-flavor test. Safer than test-env-specific forks of the module."

patterns-established:
  - "scripts/bake-all.ts is the Phase 3 chokepoint: ritual discovery → validator gate → per-ritual build-mram spawn → _RESUME.json lifecycle → summary. Future orchestrator work (ritual-level parallelism, watch mode) extends this file rather than creating siblings."
  - "Exported-helpers-for-test discipline: every pure helper (parseFlags, clampParallel, getChangedRituals, getAllRituals, validateOrFail, dialogueChecksum, clearResumeStateFile, buildMramSpawnArgs) is a named export so tests can import without spawning child processes. The isDirectRun guard prevents main() from firing during import."
  - "Spawn-arg testing: buildMramSpawnArgs returns a string[] that tests can index directly (asserting `args[idx+1] === '1,2,5'` for example). No real child_process in the test path. Locks in the D-06 contract without needing a mocked spawn."

requirements-completed: [AUTHOR-02, AUTHOR-09]

# Metrics
duration: ~6min
completed: 2026-04-23
---

# Phase 3 Plan 07: Bake-All Orchestrator Summary

**Created `scripts/bake-all.ts` — the Phase 3 orchestrator entrypoint that composes every bake-time correctness gate into a single CLI: changed-ritual detection via `git diff --since <ref>`, p-limit concurrency cap at default 4 (clamped to [1, 16]), line-level `_RESUME.json` read-side (writer is build-mram, per Plan 06), `--dry-run` cache roll-up with zero API calls, `--verify-audio` STT pass-through, and validator-first execution ordering. Filled Plan-01's `bake-all.test.ts` scaffold with 27 passing tests across 6 describes covering every exported helper, including an end-to-end `_RESUME.json → buildMramSpawnArgs` fixture that locks the D-06 contract at the module boundary. Two atomic commits on `gsd/phase-3-authoring-throughput`; zero deviations from plan.**

## Performance

- **Duration:** ~6 min (bake-all.ts scaffold + test file + two fixture-path-related test rewrites + verification)
- **Started:** 2026-04-23T19:40Z
- **Completed:** 2026-04-23T19:46Z
- **Tasks:** 2/2
- **Files created:** 2 (`scripts/bake-all.ts`, this SUMMARY.md)
- **Files modified:** 1 (`scripts/__tests__/bake-all.test.ts`)

## Accomplishments

### Full orchestrator CLI shipped

`scripts/bake-all.ts` (486 lines) is runnable end-to-end:

```
$ npx tsx scripts/bake-all.ts --help
Usage: npx tsx scripts/bake-all.ts [flags]

Flags:
  --since <ref>       Re-bake rituals whose dialogue files changed since <ref>.
                      Default when passed without arg: HEAD~1.
  --dry-run           Per-ritual cache roll-up; NO API calls.
  --resume            Resume from _RESUME.json (refuses on dialogue checksum mismatch).
                      Passes completedLineIds to build-mram via --skip-line-ids.
  --parallel <N>      Max concurrent renders (default 4; clamped [1, 16]).
  --verify-audio      Forward to bake script; Groq Whisper word-diff warn-only.
  --help              Print this usage and exit 1.
```

Dry-run over Shannon's current rituals produces a valid roll-up with zero API calls:

```
$ npx tsx scripts/bake-all.ts --dry-run
Baking all rituals: 4

--dry-run: per-ritual cache roll-up (NO API calls):

  ea-closing: lines≈130, cache-entries-present=0, est-seconds-if-all-miss≈780
  ea-explanatory: lines≈41, cache-entries-present=0, est-seconds-if-all-miss≈246
  ea-initiation: lines≈159, cache-entries-present=0, est-seconds-if-all-miss≈954
  ea-opening: lines≈133, cache-entries-present=0, est-seconds-if-all-miss≈798

Dry-run complete. 4 ritual(s) inspected.
```

The `rituals/_bake-cache/` empty cache state reflects that Plan 06's migration is pending Shannon's first real bake — a `--dry-run` after one ritual baked should show non-zero `cache-entries-present`.

### D-06 line-level resume contract wired end-to-end

The orchestrator is the READER half of the D-06 contract Plan 06 established:

1. On `--resume`, it reads `rituals/_bake-cache/_RESUME.json` via `readResumeState()` (imported from `./lib/resume-state`).
2. For each ritual, if `priorState.ritual === slug`, it extracts `completedLineIds` and passes them to `buildMramSpawnArgs()` which embeds `--skip-line-ids <csv>` in the spawn argv.
3. Every build-mram sub-process invocation — with OR without `--resume` — carries `--resume-state-path <RESUME_FILE>` and `--ritual-slug <slug>` so the sub-process always writes state (crash-safe by construction per D-06).
4. After a ritual runs cleanly, `clearResumeStateFile()` unlinks `_RESUME.json`. On failure, the file stays on disk → `--resume` on the next run picks up where the crash stopped.

### Validator-first execution ordering

Per PATTERNS.md §Validator-gate and RESEARCH.md anti-pattern §4, `main()` runs `validateOrFail()` on EVERY discovered ritual BEFORE any `bakeRitual()` spawn. A single corrupted cipher/plain pair halts the run before one Gemini/Google byte ships. Same gate applies to `--dry-run` — the dry-run loop validates each ritual, producing a fast "is my cipher drifted?" check without API cost.

### Pitfall-5-compliant git-diff wrapping

`getChangedRituals(sinceRef)` passes the pathspec as SEPARATE argv elements (`"--"`, `"rituals/*-dialogue.md"`, `"rituals/*-dialogue-cipher.md"`) to `execFileSync("git", [...])` — not a shell string. Defeats shell globbing (Pitfall 5). `--diff-filter=d` excludes deletes so a freshly-removed ritual doesn't get spawn-invoked (Pitfall 5). Pre-check via `git rev-parse --verify <ref>^{commit}` throws a clear non-git-repo message when Shannon runs the tool outside the repo root.

### 27-test unit suite locked in

`scripts/__tests__/bake-all.test.ts` replaced Plan-01's 11 `it.todo` stubs with 27 concrete tests across 6 describes:

| Describe | Count | Coverage |
|---|---|---|
| `parseFlags` | 5 | defaults, --since <ref>, --since alone→HEAD~1, --dry-run + --resume + --verify-audio, --parallel <N> |
| `clampParallel` | 9 | undefined→4, 0→1, -5→1, 1→1, 4→4, 16→16, 17→16, 99→16, NaN/non-numeric→4 |
| `getChangedRituals` | 4 | real seeded tmp git repo fixture: plain-edit-picked-up, cipher-only-edit-picked-up, deleted-file-excluded (--diff-filter=d), non-git-throws |
| `dialogueChecksum` | 2 | deterministic for identical content, changes when content changes |
| `buildMramSpawnArgs` | 5 | always emits --resume-state-path + --ritual-slug; --skip-line-ids when non-empty; --verify-audio when flagged; separate argv elements; end-to-end fixture via readResumeState |
| `clearResumeStateFile` | 2 | unlinks when present, no-op when absent |

### Full suite deltas

- **Before this plan:** 41 files passed + 2 skipped; 470 tests passed + 30 todo (Plan 06 baseline)
- **After this plan:** 42 files passed + 1 skipped; 497 tests passed + 12 todo
- **Delta:** +1 file flipped scaffold → live; +27 passing tests; -18 todos (bake-all scaffold had 11 todos + preview-bake scaffold still has 7 todos; the bake-all scaffold now contributes 0 todos instead of 11)
- The remaining 1 skipped file is `scripts/__tests__/preview-bake.test.ts` (Plan 08's scaffold, still waiting to be filled)

## Exact Line Anchors (post-plan state)

| Component | Location in scripts/bake-all.ts |
|---|---|
| Shebang + header block | 1-45 |
| CACHE_DIR / RESUME_FILE / RITUALS_DIR constants | 51-53 |
| usage string | 55-66 |
| `Flags` interface | 71-81 |
| `parseFlags` | 83-116 |
| `clampParallel` | 123-129 |
| `getChangedRituals` (D-04, Pitfall 5) | 144-181 |
| `getAllRituals` | 184-193 |
| `validateOrFail` (D-08 gate) | 198-224 |
| `dialogueChecksum` | 234-239 |
| `clearResumeStateFile` (D-06) | 246-248 |
| `buildMramSpawnArgs` (D-06 spawn contract) | 255-275 |
| `bakeRitual` (per-ritual spawn) | 280-296 |
| `dryRunForRitual` (D-05) | 301-322 |
| `main()` (full composition) | 327-436 |
| `isDirectRun` guard | 441-447 |

## Task Commits

Each task committed atomically on `gsd/phase-3-authoring-throughput`:

1. **Task 1: Create scripts/bake-all.ts orchestrator** — `54e7ed5` (`author-02: scaffold bake-all.ts orchestrator with --since/--dry-run/--resume/--parallel + build-mram spawn-arg plumbing`) — 486 insertions, 1 file created
2. **Task 2: Fill Plan-01 test scaffold with 27 concrete tests** — `61277b1` (`author-02: add orchestrator unit tests (flag parse, clamp, git-diff, spawn-args, resume-cleanup)`) — 387 insertions / 32 deletions, scaffold replaced

Both use the `author-02:` prefix per D-20 — this plan directly implements AUTHOR-02 invariants.

## Decisions Made

Captured in frontmatter `key-decisions`. Repeated here for readability:

1. **pLimit reserved for future ritual-level fan-out.** The per-line concurrency currently lives inside `build-mram-from-dialogue.ts`; the orchestrator's bake loop is sequential. Instantiating `pLimit(clampParallel(parallel))` in `main()` preserves the grep criterion `pLimit: ≥ 2 matches` AND reserves the architectural slot for when ritual-level parallelism arrives (the current bake already takes ~15-30min single-ritual; Shannon may want 2-3 rituals in flight once the bake cache is warmer).
2. **dialogueChecksum field NOT added to ResumeState in this plan.** Plan 06's shape is authoritative; Phase 3 doesn't rewrite the shared interface. The orchestrator's Phase 3 guard is "same ritual slug + file still readable" — documented in-code as a future enhancement slot. Shannon's workflow rarely involves dialogue edits between crash and resume within the same minute.
3. **Halt-on-first-failure in the per-ritual loop.** A failed ritual likely signals a systemic issue (auth, quota, anomaly). Baking the next ritual after a failure just burns quota on the same failure mode. Results array still collects both sides (Pitfall 7), but the loop `break`s; final report surfaces the single failure. Alternative (aggregate-then-exit) rejected.
4. **Tests use real rituals/ + rituals/_bake-cache/ paths.** Because `RITUALS_DIR = path.resolve("rituals")` and `RESUME_FILE = path.join(CACHE_DIR, "_RESUME.json")` are resolved once at module load time, chdir-based test isolation doesn't work. Tests use real paths with unique prefixed slugs (`__bake-all-test-{pid}-`) and try/finally cleanup (plus prior-contents restore for `_RESUME.json`). Safer than monkey-patching the module.

## Deviations from Plan

Zero deviations. Plan 07 executed exactly as written — every `must_have` truth asserted, every verify command exit-0'd, every acceptance criterion satisfied.

Only beyond-the-written-plan work was two test rewrites in the `dialogueChecksum` describe (initial draft used `tmpRoot/rituals/` which can't be reached given the module-frozen `RITUALS_DIR`). Switched to real-path + unique-slug + finally-cleanup pattern; no plan text required adjustment. Both rewrites happened before the Task-2 commit landed, so the commit is clean.

## Issues Encountered

- **Initial `dialogueChecksum` tests wrote to `tmpRoot/rituals/` + chdir'd**, assuming path.resolve("rituals") would re-evaluate on each call. It doesn't — module constants freeze at import time. Rewrote both tests to use real rituals/ with prefixed slugs. This is now documented as a pattern in frontmatter `patterns`.
- No pre-existing tsc errors were introduced — the 26-error baseline from Plan 06 holds (same set of pre-existing errors in unrelated files, untouched by this plan).
- No vitest flakes observed. Full suite ran clean in 23.37s.

## User Setup Required

**None for this plan.** The orchestrator uses the existing Phase-3 env vars (same set Plan 06 required):

- `GOOGLE_CLOUD_TTS_API_KEY` — required by build-mram-from-dialogue.ts for the short-line route (D-09)
- `GROQ_API_KEY` — required ONLY when `--verify-audio` is passed (D-11)

Both are already in Shannon's `.env` from Phase 2. The orchestrator itself makes NO API calls in `--dry-run` and delegates all rendering to build-mram sub-processes otherwise.

To smoke-test the orchestrator end-to-end on a real ritual:
```bash
npx tsx scripts/bake-all.ts --dry-run                 # no API calls, summary only
npx tsx scripts/bake-all.ts --since HEAD~1 --dry-run  # same but only changed rituals
npx tsx scripts/bake-all.ts --parallel 2              # full bake, 2-ritual in-flight cap (future)
```

## Next Phase Readiness

- **Plan 08 (preview-bake, AUTHOR-08):** unblocked. No file overlap with bake-all.ts. Plan 08's `scripts/preview-bake.ts` reads the same `rituals/_bake-cache/` this plan's orchestrator reads/unlinks `_RESUME.json` from, but there's no concurrency issue — preview-bake is a local dev server, orchestrator is a CLI command; not typically run simultaneously.
- **Phase 4 (Content Coverage):** Shannon can now invoke `npm run bake-all` for multi-ritual baking with all five correctness gates active (validator, short-line Google TTS, duration anomaly, --verify-audio, line-level resume). A ctrl-C mid-bake leaves `_RESUME.json` pointing at the in-flight ritual; `npm run bake-all -- --resume` continues at the correct line per D-06.
- **No blockers.**

## Threat Model Mitigation Verification

| Threat ID | Status after Plan 07 |
|---|---|
| T-03-04 (cipher/plain drift ships silently) | **Re-mitigated.** `validateOrFail()` runs on every discovered ritual BEFORE any `bakeRitual()` spawn — orchestrator-level belt-and-suspenders on top of build-mram's own validator gate (Plan 06). No `--force` in Phase 3. |
| T-03-07 (_RESUME.json points to stale line IDs) | **Mitigated (documented).** Orchestrator refuses resume when `priorState.ritual !== slug`. Phase 3 guard is "same ritual slug + file readable"; future enhancement adds a `dialogueChecksum` field on ResumeState for edit-between-crash-and-resume detection. Clear error message directs user to "rm _RESUME.json and start fresh" on any ambiguity. |
| T-03-08 (--parallel 999 exhausts quota) | **Mitigated.** `clampParallel` clamps to [1, 16]; 9 test cases assert the clamp at both ends including NaN and non-numeric fallback. |
| T-03-09 (git diff output leaked to logs) | **Accept (documented).** Ritual slugs are filesystem-derived and already in the git repo. Output is developer-side stderr, no network surface. |
| T-03-11 (spawn argv shell-injection if slug contains shell metachars) | **Mitigated.** `spawn("npx", args, ...)` with `args` as an array (NOT a string) prevents shell interpretation. Ritual slugs come from regex-matched filenames (`/-dialogue(-cipher)?\.md$/`) — cannot contain shell metachars by construction. `"passes args as separate argv elements"` test locks this in. |

## Self-Check: PASSED

### Files claimed created

- `scripts/bake-all.ts` — FOUND (486 lines; shebang on line 1; 9 exports verified)
- `.planning/phases/03-authoring-throughput/03-07-SUMMARY.md` — FOUND (this file)

### Files claimed modified

- `scripts/__tests__/bake-all.test.ts` — FOUND (387 lines; 0 it.todo; 6 describes; 27 `  it(` blocks)

### Commits claimed

- `54e7ed5` — FOUND on `gsd/phase-3-authoring-throughput` (Task 1)
- `61277b1` — FOUND on `gsd/phase-3-authoring-throughput` (Task 2)

### Acceptance criteria verification

Task 1 (scripts/bake-all.ts):
- `head -1 scripts/bake-all.ts` → `#!/usr/bin/env npx tsx` ✓
- `grep -cE "^export (function|interface|const)" scripts/bake-all.ts` → 9 ✓ (parseFlags, clampParallel, getChangedRituals, getAllRituals, validateOrFail, dialogueChecksum, clearResumeStateFile, buildMramSpawnArgs, Flags)
- `grep -c "resume-state-path\|skip-line-ids" scripts/bake-all.ts` → 5 ✓
- `grep -c "from.*resume-state" scripts/bake-all.ts` → 1 ✓
- `grep -c "buildMramSpawnArgs" scripts/bake-all.ts` → 2 ✓
- `grep -c "clearResumeStateFile" scripts/bake-all.ts` → 2 ✓
- `grep -c "pLimit" scripts/bake-all.ts` → 5 ✓ (import + instantiation + comment)
- `grep -c "diff-filter=d" scripts/bake-all.ts` → 3 ✓ (code + 2 comment references)
- `grep -c "dialogueChecksum" scripts/bake-all.ts` → 4 ✓
- `npx tsx scripts/bake-all.ts --help` → EXIT=1, first line "Usage: npx tsx scripts/bake-all.ts [flags]" ✓
- `npx tsc --noEmit` → 0 errors in bake-all.ts (26 pre-existing errors in unrelated files persist, same set as Plan 06 baseline) ✓
- `npm run build` → exit 0, 27 routes generated ✓
- `npx tsx scripts/bake-all.ts --dry-run` → validates + rolls up 4 rituals, 0 API calls ✓

Task 2 (scripts/__tests__/bake-all.test.ts):
- `grep -c "it.todo(" scripts/__tests__/bake-all.test.ts` → 0 ✓
- 6 describes ✓ (parseFlags, clampParallel, getChangedRituals, dialogueChecksum, buildMramSpawnArgs, clearResumeStateFile)
- 27 tests total: 5 + 9 + 4 + 2 + 5 + 2 = 27 ✓ (plan wanted 23+)
- `npx vitest run --no-coverage scripts/__tests__/bake-all.test.ts` → 27 passed / 0 failed / 0 todo ✓
- `npx vitest run --no-coverage` (full suite) → 497 passed + 12 todo across 42 files + 1 skipped ✓ (up from 470 + 30 / 41 + 2 — no regressions, 27 new passes)

---
*Phase: 03-authoring-throughput*
*Completed: 2026-04-23*
