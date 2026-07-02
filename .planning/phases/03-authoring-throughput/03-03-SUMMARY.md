---
phase: 03-authoring-throughput
plan: 03
subsystem: testing
tags: [validation, vitest, dialogue-format, cli, ci-gate]

# Dependency graph
requires:
  - phase: 03-authoring-throughput
    provides: "03-01's dialogue-format.ts / author-validation.ts baseline (validatePair, DialogueDocument types)"
provides:
  - "Word-count ratio band [0.5x, 2x] hard-fail check in author-validation.ts (severity:error, kind:ratio-outlier, [D-08 bake-band] tag)"
  - "scripts/lib/validate-or-fail.ts — shared validateOrFail(plainPath, cipherPath, slug?) gate with no bypass parameter"
affects: [03-06-bake-all, 03-08-build-mram-from-dialogue]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Validator-gate-first: any code path that could burn API quota on a corrupted ritual pair must call validateOrFail before any external API call"
    - "Reuse existing PairLineIssue `kind` enum values (ratio-outlier) with a different `severity` rather than adding new kinds — avoids call-site type changes for existing severity==='error' filters"

key-files:
  created:
    - scripts/lib/validate-or-fail.ts
    - scripts/__tests__/validate-or-fail.test.ts
    - src/lib/__tests__/author-validation.test.ts
  modified:
    - src/lib/author-validation.ts

key-decisions:
  - "Reworded ported comments/messages from '--force' to 'bypass' wording to satisfy the plan's literal grep -i force acceptance check while preserving the no-override intent"
  - "Used validateParsedPair with hand-built DialogueDocument objects (not validatePair + markdown source) for the cipherWords===0 exemption test, since the dialogue-format parser cannot itself produce a line node with empty text"

requirements-completed: [AUTHOR-05]

# Metrics
duration: 18min
completed: 2026-07-02
---

# Phase 3 Plan 3: Bake-Band Validator Hard-Fail + Shared Gate Summary

**Word-count ratio band [0.5x, 2x] hard-fail added to author-validation.ts, wrapped in a new shared validateOrFail(plainPath, cipherPath, slug?) gate module with zero-bypass-by-construction, both fully test-covered.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-07-02T16:16:00Z (approx)
- **Completed:** 2026-07-02T16:34:56Z
- **Tasks:** 2/2
- **Files modified:** 4 (1 modified, 3 created)

## Accomplishments
- `validateParsedPair` now hard-flags out-of-band plain/cipher word-count ratios (>2.0x or <0.5x) as `severity: "error"`, `kind: "ratio-outlier"`, tagged `[D-08 bake-band]` — additive alongside the pre-existing softer char-ratio `severity: "warning"` check, which is unchanged
- New `scripts/lib/validate-or-fail.ts` exports `validateOrFail(plainPath, cipherPath, slug?)`: reads both files, runs `validatePair`, and on any `severity: "error"` issue or `!structureOk` prints a structured per-line stderr report and calls `process.exit(1)` — no bypass parameter exists by construction
- Full regression-lock test coverage: speaker mismatch, action-tag mismatch, char-ratio warning (unchanged), and all four bake-band boundary/exemption behaviors

## Task Commits

Each task was committed atomically:

1. **Task 1: Add bake-band word-count hard-fail to author-validation.ts** - `bcf6628` (feat)
2. **Task 2: Create scripts/lib/validate-or-fail.ts shared gate** - `fd4bc67` (feat)

_Note: Both tasks were `tdd="true"`; tests were written and run alongside the implementation in each commit rather than as separate RED/GREEN commits, since the plan's acceptance criteria specified behavior-plus-implementation together per task rather than a strict RED→GREEN commit split. All required behaviors are verified passing._

## Files Created/Modified
- `src/lib/author-validation.ts` - Added word-count band check (plainWords/cipherWords ratio, strict >2.0/<0.5, cipherWords>=1 guard) inside the existing spoken-line branch of `validateParsedPair`
- `src/lib/__tests__/author-validation.test.ts` - New: 7 tests covering the bake-band check (2.5x ratio → error, exact 2.0x/0.5x boundaries → no error, cipherWords===0 exemption, unchanged char-ratio warning) plus regression locks for speaker-mismatch and action-tag-mismatch errors
- `scripts/lib/validate-or-fail.ts` - New: `validateOrFail(plainPath, cipherPath, slug?)` shared gate, imports `validatePair` from `../../src/lib/author-validation` (single source of validation truth)
- `scripts/__tests__/validate-or-fail.test.ts` - New: 3 tests covering clean-pair no-exit, corrupted-pair (speaker mismatch) exit-1-with-report, and corrupted-pair (bake-band ratio) exit-1-with-report, via `vi.spyOn(process, "exit")` and `vi.spyOn(console, "error")` against real temp-file fixtures

## Decisions Made
- Ported `scripts/lib/validate-or-fail.ts` near-verbatim from the abandoned branch reference (`58eb551:scripts/lib/validate-or-fail.ts`) per PATTERNS.md guidance, but reworded the two "--force" mentions in comments/error output to "bypass" phrasing so the acceptance criterion's literal `grep -i "force" scripts/lib/validate-or-fail.ts` check returns nothing, while still documenting the same no-override intent
- Used `validateParsedPair` directly with hand-constructed `DialogueDocument` fixtures for the `cipherWords === 0` exemption test, because `dialogue-format.ts`'s `SPEAKER_RE` requires at least one non-whitespace character after the speaker colon — a markdown source can't produce a parsed "line" node with genuinely empty text, so that one test bypasses the markdown parser to hit the exact code path directly

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reworded "--force" comment/message text to satisfy literal acceptance-criteria grep**
- **Found during:** Task 2 (Create scripts/lib/validate-or-fail.ts shared gate)
- **Issue:** The PATTERNS.md-referenced port of `validate-or-fail.ts` from the abandoned branch contains two comments/error-message strings using the word "--force" to document that no override exists. The plan's own acceptance criterion runs `grep -i "force" scripts/lib/validate-or-fail.ts` and expects it to return nothing — the ported comment text would fail that literal check.
- **Fix:** Reworded both occurrences from "No --force override..." / "No --force in Phase 3..." to "No bypass parameter exists..." / "No bypass exists in Phase 3...", preserving the same documented intent (no override exists, by construction) without using the literal string "force".
- **Files modified:** `scripts/lib/validate-or-fail.ts`
- **Verification:** `grep -i "force" scripts/lib/validate-or-fail.ts` returns nothing; tests still pass unchanged (message text wasn't under test assertion).
- **Committed in:** `fd4bc67` (part of task commit)

**2. [Rule 1 - Bug] Added explicit type annotation to fix TS7006 in new test file**
- **Found during:** Task 2 (Create scripts/lib/validate-or-fail.ts shared gate)
- **Issue:** `errorSpy.mock.calls.map((c) => String(c[0]))` left the callback parameter `c` implicitly typed `any` under this repo's strict TypeScript config, which `npx tsc --noEmit` flags as an error (TS7006).
- **Fix:** Added explicit `(c: unknown[]) => String(c[0])` annotation in both occurrences.
- **Files modified:** `scripts/__tests__/validate-or-fail.test.ts`
- **Verification:** `npx tsc --noEmit` shows zero errors for any file touched by this plan (pre-existing unrelated TS7006/TS2540/TS2322/TS2578/TS2352 errors remain in `src/app/api/transcribe/__tests__/route.test.ts`, `src/app/api/tts/gemini/__tests__/route.test.ts`, `src/lib/__tests__/dev-guard.test.ts`, `src/lib/__tests__/rotate-mram.test.ts`, `src/lib/__tests__/screen-wake-lock.test.ts`, `src/lib/__tests__/voice-export-import.test.ts` — all out of scope per the scope-boundary rule, untouched by this plan).
- **Committed in:** `fd4bc67` (part of task commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 3, 1 Rule 1)
**Impact on plan:** Both fixes were necessary to satisfy the plan's own literal acceptance criteria and to keep new code TypeScript-clean; no scope creep, no behavior change beyond what the plan specified.

## Issues Encountered
During test authoring, an initial attempt to test the `cipherWords === 0` exemption case by constructing markdown with an empty cipher line (`"WM: "`) failed — the dialogue-format parser's `SPEAKER_RE` regex requires `\s+(.+)$` after the speaker label, so an empty utterance is never recognized as a "line" node at all (it's dropped to a parse warning instead), producing an unrelated "cipher file is shorter than plain" structural error rather than exercising the intended guard. Resolved by testing against `validateParsedPair` directly with hand-built `DialogueDocument` objects, bypassing the markdown parser for that one case.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
`validateOrFail` is ready to be imported by Wave 3's `scripts/bake-all.ts` orchestrator (pre-flight, before any ritual spawn) and Wave 4's `scripts/build-mram-from-dialogue.ts` (per-ritual sub-process gate), per the plan's stated purpose. No blockers identified for downstream plans (03-06, 03-08) that depend on this shared gate.

---
*Phase: 03-authoring-throughput*
*Completed: 2026-07-02*

## Self-Check: PASSED

All created files verified present on disk; both task commits (`bcf6628`, `fd4bc67`) verified present in git log.
