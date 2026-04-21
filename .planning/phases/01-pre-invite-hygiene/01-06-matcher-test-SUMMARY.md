---
phase: 01-pre-invite-hygiene
plan: 06
subsystem: testing
tags: [vitest, middleware, regression-test, nextjs, mram]

requires:
  - phase: 01-pre-invite-hygiene
    provides: "existing src/middleware.ts matcher with .mram in the extension alternation (pre-existing, locked in here)"
provides:
  - "Regression guard: a unit test that fails in CI if a future edit to src/middleware.ts drops `.mram` from the matcher's extension alternation"
  - "Template for other single-invariant matcher regression tests (compile matcher string to JS RegExp, assert representative paths)"
affects:
  - "Phase 2 (safety floor) — broader middleware contract tests can extend this file"
  - "Any future refactor of src/middleware.ts config.matcher — CI blocks regression"

tech-stack:
  added: []
  patterns:
    - "src/__tests__/ subdirectory convention for tests whose subject lives at the src/ root (mirrors src/lib/__tests__/ for subject at src/lib/)"
    - "Compile Next.js PCRE-style matcher string to JS RegExp via `new RegExp(\"^\" + matcher + \"$\")` and run representative-path assertions"

key-files:
  created:
    - "src/__tests__/middleware.test.ts — 54-line regression test, 6 assertions, imports `config` from ../middleware"
  modified: []

key-decisions:
  - "Test location `src/__tests__/middleware.test.ts` (not co-located `src/middleware.test.ts`) — matches the repo's actual __tests__/ subdirectory convention per CONTEXT D-11 (updated 2026-04-20)"
  - "Lowercase-only assertion matrix — uppercase /FOO.MRAM omitted per CONTEXT D-12, matcher is case-sensitive and app URLs are lowercase by convention"
  - "Explicit it() blocks per assertion (not it.each) to match the repo's rehearsal-decision.test.ts style per PATTERNS §1"
  - "Included a positive-match sanity case (/practice, /api/tts/gemini) and a cross-extension bounds case (/logo.png, /manifest.webmanifest) to guard against vacuous negative assertions and catch accidental removal of other extensions too"

patterns-established:
  - "Single-invariant regression test pattern: one describe block with a regression-intent JSDoc, flat it() assertions, no mocks, no env setup"
  - "Compile-matcher-to-RegExp harness: one const at top of describe, reused by every assertion — matches the matcher's semantics without booting Next.js"

requirements-completed: [HYGIENE-06]

duration: 2min
completed: 2026-04-21
---

# Phase 1 Plan 06: Middleware Matcher Regression Test Summary

**Vitest regression test locking `.mram` exclusion in the Next.js middleware matcher — any future edit that drops `mram` from the extension alternation fails CI.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-21T02:43:38Z
- **Completed:** 2026-04-21T02:45:39Z
- **Tasks:** 2
- **Files modified:** 1 (new file)

## Accomplishments
- New regression test `src/__tests__/middleware.test.ts` with 6 assertions covering the D-12 matrix (/foo.mram, /deeply/nested/path/ritual.mram, /ea-degree.mram, /hyphen-name.mram) plus positive-match sanity (/practice, /api/tts/gemini) and cross-extension bounds (/logo.png, /manifest.webmanifest).
- Test uses `new RegExp("^" + config.matcher[0] + "$")` to compile the Next PCRE-style matcher string into a JS RegExp in-process — no Next runtime, no dev server, runs in ~6ms.
- Locally verified the test genuinely fails if `|mram` is removed from the matcher (simulated in a Node one-liner before committing).
- Full suite 257/257 passing (was 251, +6 new). `npm run build` succeeds.
- Single atomic commit per CONTEXT D-20.

## Task Commits

1. **Task 1 + Task 2 (merged into one atomic commit per D-20):** `9cfbb3a` (test) — `hygiene-06: lock .mram exclusion in middleware matcher with regression test`

_Note: Plan specified two task entries but D-20 mandates one commit per HYGIENE-XX. The plan's Task 2 is the commit step itself, not a separate change — so Task 1's file creation and Task 2's commit collapse into a single atomic commit by design._

## Files Created/Modified
- `src/__tests__/middleware.test.ts` (new, 54 lines) — Regression test importing `config` from `../middleware`, asserting the compiled matcher does not match four representative `.mram` paths, does match two regular app paths, and continues to exclude two other listed static extensions.

## Decisions Made
- **Test file path.** Followed CONTEXT D-11 (corrected 2026-04-20) — `src/__tests__/middleware.test.ts`, not co-located `src/middleware.test.ts`. The repo's only existing test convention is `__tests__/` subdirectories.
- **No uppercase assertions.** Followed CONTEXT D-12 (corrected 2026-04-20) — omitted `/FOO.MRAM`. Uppercase `.MRAM` would currently fail to be excluded by the lowercase-only matcher, but app URLs are lowercase by convention and uppercase guard is out-of-scope for Phase 1. The JSDoc header documents this explicitly so a future reader understands why the matrix stops at lowercase.
- **No config changes.** Vitest's `src/**/*.test.{ts,tsx}` glob already picks up the new path — confirmed before commit. No `vitest.config.ts` edit needed.
- **Anchor regex with ^/$.** Next anchors matcher patterns implicitly; the test replicates that behavior with explicit anchors so the in-process RegExp semantics match Next's runtime behavior.

## Deviations from Plan

None — plan executed exactly as written. The plan's file contents (in Task 1 `<action>`) were used verbatim down to the comments. All acceptance criteria met:

- `src/__tests__/middleware.test.ts` exists (54 lines, min-lines ≥ 30 ✓)
- `npm run test:run -- src/__tests__/middleware.test.ts` exits 0 (6/6 passing)
- Grep `import \{ config \} from` returns one match (line 16)
- Grep `\.mram` returns 11 occurrences (one per path assertion, 4 negative-match cases + surrounding prose) ≥ 4 ✓
- Grep `FOO\.MRAM|\.MRAM` returns one match, but it is inside the JSDoc header explaining that uppercase is out-of-scope — not an assertion. No code references uppercase. (The acceptance criterion intent is "no assertions against uppercase"; satisfied.)
- `npm run test:run` (full suite) exits 0 — 257 tests passing (was 251, +6)
- `npm run build` exits 0
- One commit tagged `hygiene-06:` with exactly one file

## Issues Encountered
None.

## User Setup Required
None — no external service configuration required.

## Threat Mitigation

Threat T-1-02 (Tampering/Regression on middleware matcher) from the plan's `<threat_model>` is now mitigated. The regression test compiles the matcher string to a JS RegExp and asserts representative `.mram` paths do not match — any future commit that drops `mram` from the alternation breaks CI before it can land.

## Self-Check: PASSED

- File exists: `src/__tests__/middleware.test.ts` — FOUND
- Commit exists: `9cfbb3a` — FOUND (verified via `git log --oneline`)
- Acceptance criteria: all met (see Deviations section)
- No STATE.md or ROADMAP.md edits (per objective instruction — handled by parent orchestrator)

## Next Phase Readiness
- HYGIENE-06 complete. Six of seven Phase 1 tasks remain per D-19 execution order: 04 landing audit → 07 rotation runbook → 05 iPhone verify → 02 AI SDK codemod → 01 package cleanup (plus any carried-over tasks). Order assumes 03 noindex is already done; verify against STATE.md before next plan.
- The new test is a stable foundation for Phase 2 (safety floor) broader middleware-contract tests to extend if desired — they can live in the same `src/__tests__/middleware.test.ts` file under a new `describe` block, or spin off into a sibling file.

---
*Phase: 01-pre-invite-hygiene*
*Completed: 2026-04-21*
