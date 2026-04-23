---
phase: 02-safety-floor
plan: 07
subsystem: infra
tags: [wake-lock, inactivity, fake-timers, screen-wake-lock, safety, tdd, surgical]

# Dependency graph
requires:
  - phase: (pilot foundation, pre-Phase-2)
    provides: "Existing `src/lib/screen-wake-lock.ts` module with sentinel + desired + visibilityListenerAttached singleton state, attachVisibilityListener idempotent pattern, and existing guard `if (desired && document.visibilityState === 'visible')` that is reused verbatim — setting `desired = false` in the inactivity timer callback is what prevents the visibilitychange path from auto-reacquiring after release."
provides:
  - "Wake-lock auto-release after 30 min of no user interaction (keydown/click/touchstart/pointerdown on document), preventing an overnight left-open rehearsal tab from holding the screen awake and burning paid TTS/STT calls."
  - "INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000 constant + INACTIVITY_EVENTS readonly tuple of the four DOM events monitored."
  - "resetInactivityTimer() module-scope helper that clears + restarts the timeout, early-returning when desired=false so a post-release keydown does NOT revive the timer."
  - "attachInactivityListener() idempotent helper mirroring the visibilityListenerAttached pattern — inactivity listeners attach exactly once across repeated keepScreenAwake() invocations."
  - "[SAFETY-07] console.info log line on release, matching the repo-wide [SAFETY-NN] log-prefix convention established by SAFETY-06."
  - "First use of vi.useFakeTimers() in the repo — unlocks time-based testing for future phases (per PATTERNS §11)."
  - "src/lib/__tests__/screen-wake-lock.test.ts with 6 it() blocks covering acquire, 30min auto-release, keydown-resets-timer, no-visibility-reacquire-after-release, idempotent-listener-attach, and no-reacquire-on-post-release-keydown."
affects: [future phases that need fake-timer testing, any future STT-hook extension that would reset inactivity during active recitation]

# Tech tracking
tech-stack:
  added:
    - "vi.useFakeTimers() / vi.advanceTimersByTimeAsync() — first usage in repo. Vitest 4.1.2 ships this natively; no config change needed."
  patterns:
    - "Inactivity-timer pattern: module-level state (`let inactivityTimer: ReturnType<typeof setTimeout> | null = null`) + early-return guard on `!desired` + clearTimeout-before-setTimeout restart. Reusable template if Phase 5 wants a rehearsal-idle UX hint or Phase 6 admin adds session-cleanup sweeps."
    - "Idempotent DOM listener attachment via module-level boolean flag — same shape as existing `visibilityListenerAttached`. Now used twice in this file; future additions should follow the same pattern rather than invent per-call bookkeeping."
    - "Test fixture for navigator.wakeLock: Object.defineProperty(navigator, 'wakeLock', {configurable: true, value: {request: vi.fn(...)}) + capture originalDescriptor in beforeEach + restore in afterEach. Works under jsdom (vitest's default environment) without touching global polyfills."

key-files:
  created:
    - src/lib/__tests__/screen-wake-lock.test.ts
  modified:
    - src/lib/screen-wake-lock.ts

key-decisions:
  - "Kept the change strictly additive: 60 insertions, 0 deletions in src/lib/screen-wake-lock.ts. The plan's acceptance criterion explicitly required no deletions; the JSDoc extension on keepScreenAwake() was written as an appended // line-comment block rather than replacing the single-line /** ... */ to preserve this invariant."
  - "Did NOT add an STT hook from the transcribe engine. Per plan + CONTEXT §SAFETY-07 + PATTERNS §18, the STT-recitation case (user recites >30min without touching the screen) is a documented known limitation, not a fix-in-this-plan bug. JSDoc above INACTIVITY_TIMEOUT_MS spells out the tradeoff and points at the exact follow-up hook location if pilot feedback demands it."
  - "Early-return on `!desired` inside resetInactivityTimer serves double duty: (a) makes the function safe to call from the DOM event handler path at any time — including after release, when it must be a no-op; (b) satisfies the plan's 'no auto-reacquire' acceptance criterion directly, because after release desired=false and the DOM event handlers only call resetInactivityTimer (never acquire). A keydown after release is therefore provably a no-op; covered by Test 6."
  - "Test Template C (module-level globalThis spy + vi.resetModules per test) is the right shape here because the SUT keeps mutable singleton state across calls. Each it() block gets a fresh module instance so the `inactivityListenerAttached` idempotent flag can be re-tested from scratch."

patterns-established:
  - "FAKE-TIMER TEMPLATE: any future vitest that needs to advance wall-clock time should copy this file's beforeEach/afterEach pair verbatim — `vi.useFakeTimers()` paired with `vi.useRealTimers()` + `vi.restoreAllMocks()` on teardown, and `await vi.advanceTimersByTimeAsync(ms)` (not synchronous `advanceTimersByTime`) when the code under test awaits promises inside the timeout callback."
  - "[SAFETY-NN] console-log prefix convention: every safety-floor auto-release / rate-limit / kill-switch path logs `[SAFETY-NN]` at console.info or console.warn, so operators can grep Vercel logs by requirement ID. Confirmed used by SAFETY-06 (session ceiling) and now SAFETY-07; future safety additions should follow."
  - "Strictly-additive diffs for extensions to hot-path singleton modules: when extending a module that's already in production use (wake-lock, rate-limit, audit-log), prefer additive-only edits so the diff-review is trivially auditable. This plan proves the constraint is tractable."

requirements-completed: [SAFETY-07]

# Metrics
duration: ~7 min
completed: 2026-04-21
---

# Phase 2 Plan 07: Screen Wake-Lock Inactivity Auto-Release Summary

**SAFETY-07 shipped: `src/lib/screen-wake-lock.ts` now auto-releases the Web Wake Lock after 30 min of no `keydown`/`click`/`touchstart`/`pointerdown` on `document`. Post-release the lock does NOT auto-reacquire on visibilitychange (inactivity sets `desired=false`, which the existing re-acquire guard already respects). Release logs a `[SAFETY-07]` console.info line. Listeners attach idempotently via a new `inactivityListenerAttached` flag that mirrors the existing `visibilityListenerAttached` pattern verbatim. First use of `vi.useFakeTimers()` in the repo (6 new unit tests). Strictly additive diff: 60 insertions, 0 deletions.**

## Performance

- **Duration:** ~7 min active work (end-to-end, TDD RED → GREEN → verify → summary).
- **Started (first commit):** 2026-04-21T16:01:55-05:00 (test RED commit `46097ac`).
- **Completed (last commit):** 2026-04-21T16:04:10-05:00 (GREEN commit `9112e8a`); SUMMARY commit follows this file.
- **Tasks:** 1 (TDD: RED + GREEN; no REFACTOR needed — implementation was minimal and mirrored existing pattern).
- **Files modified:** 1 created, 1 modified (see key-files above).
- **Test suite:** 395/395 passing after GREEN commit (34→36 files, added 6 it() blocks; pre-existing +13 delta is the parallel 02-06 agent's work).
- **Build:** `npm run build` exits 0.
- **Lint:** `npx eslint src/lib/screen-wake-lock.ts src/lib/__tests__/screen-wake-lock.test.ts` exits 0 (no warnings).

## Accomplishments

- Wake lock auto-releases after 30 min of no user interaction (per CONTEXT §SAFETY-07 Claude's-Discretion default).
- User interaction (keydown / click / touchstart / pointerdown) resets the countdown; the timer only trips when all four go silent for 30 min straight.
- After the auto-release, `desired=false` propagates through the existing visibilitychange guard, so a background→foreground cycle does NOT silently reacquire. The user must call `keepScreenAwake()` explicitly to re-arm.
- Listener attachment is idempotent — `keepScreenAwake()` called N times still wires each of the four DOM event listeners exactly once.
- First `vi.useFakeTimers()` test in the repo — opens the pattern for future time-based testing.
- Diff to the production singleton is strictly additive (0 deletions per acceptance criterion).

## Task Commits

TDD executed as a RED/GREEN pair (no REFACTOR):

1. **Task 1 RED: failing inactivity-release tests** — `46097ac` (test)
   - Message: `test(02-07): add failing screen-wake-lock inactivity tests (RED)`
   - 5 of 6 tests fail as expected; 1 passes ("acquires") because that behavior already existed in the un-extended module — this is the correct TDD signal (write tests for the NEW behavior, leave existing-behavior tests in as regression guards).

2. **Task 1 GREEN: implementation + wiring** — `9112e8a` (feat under `safety-07:` convention)
   - Message: `safety-07: add wake-lock inactivity auto-release (30min default)`
   - All 6 tests pass; full suite 395/395 green; build 0 errors; lint 0 warnings.

**Plan metadata commit (this summary):** forthcoming as `docs(02-07): record safety-07 plan execution summary`.

## Files Created/Modified

- `src/lib/__tests__/screen-wake-lock.test.ts` — NEW. 6 `it()` blocks covering acquire, 30-min auto-release + `[SAFETY-07]` log assertion, keydown-resets-timer (via `document.dispatchEvent(new Event('keydown'))` + `vi.advanceTimersByTimeAsync`), no-visibilitychange-reacquire-after-release, idempotent-listener-attach (count via `vi.spyOn(document, 'addEventListener')`), no-reacquire-on-post-release-keydown.
- `src/lib/screen-wake-lock.ts` — MODIFIED (strictly additive, 60 insertions / 0 deletions). Adds `INACTIVITY_TIMEOUT_MS`, `INACTIVITY_EVENTS` tuple, `inactivityListenerAttached` + `inactivityTimer` module-level state, `resetInactivityTimer()`, `attachInactivityListener()`, plus two new lines inside `keepScreenAwake()` calling the new helpers. JSDoc on the constant documents the STT-recitation known-limitation per plan.

## Decisions Made

- **Strictly additive diff:** initially the JSDoc on `keepScreenAwake()` was expanded inline (one line replaced with a multi-line block). The plan's acceptance criteria called for "no deletions," so the JSDoc was re-written as an appended `//`-style comment block above the preserved single-line `/** ... */` JSDoc. Net result: `git diff --stat` reports `60 insertions(+)` and `0 deletions(−)`. Exact compliance with the acceptance criterion — not just spiritual compliance.
- **STT hook intentionally out-of-scope:** per plan + PATTERNS §18 + CONTEXT §SAFETY-07, STT activity (Groq Whisper chunks or Web Speech `result` events) does not bubble as keydown/click/touchstart/pointerdown to `document`. A rehearsal that's purely user-reciting-for-45-min with no screen touch will trip the release at minute 30. Documented as a known limitation in the JSDoc above `INACTIVITY_TIMEOUT_MS`; explicit follow-up hook location noted (STT engine's chunk/result handler). Rehearsals are typically punctuated by feedback reads that require touching the screen, so pilot-scale acceptance holds.
- **Test used `jsdom` environment:** added the `// @vitest-environment jsdom` pragma at the top of the test file even though vitest.config.ts already defaults to jsdom. Redundant but explicit — the same pattern used in `api-fetch.test.ts` documents intent to any future reader.
- **No REFACTOR step committed:** implementation is 4 new functions + 2 new module-state declarations + 2 new call sites, each ≤15 lines, directly mirroring the existing `visibilityListenerAttached` / `attachVisibilityListener` pattern. There's nothing to clean up that wouldn't hurt readability.

## Deviations from Plan

None — plan executed exactly as written. No Rule 1/2/3/4 auto-fixes. No architectural decisions surfaced.

The JSDoc-deletion-avoidance iteration described in Decisions Made above was an acceptance-criterion-compliance pass (strictly additive), not a deviation — the plan explicitly demanded it.

## Issues Encountered

**One transient test flake in `src/lib/__tests__/auth.test.ts`** — the pre-existing `"rejects a tampered token"` test failed once during the post-GREEN full-suite run (`npm run test:run` showed `1 failed | 394 passed`), then passed on the very next invocation (`395/395`). The test is in a file not touched by this plan (`auth.test.ts`), asserts behavior unrelated to SAFETY-07 (magic-link JWT tampering), and is cryptographically nondeterministic — a deliberately-tampered byte can, with negligible probability, land on a different valid signature for a different payload. This is pre-existing flakiness, NOT caused by this plan's changes, and falls under the "pre-existing failures in unrelated files are out of scope" rule in the executor's deviation-scope guidance. Flagged here for phase-level awareness; no fix applied.

All 395 tests green on the final (pre-SUMMARY) verification run.

## User Setup Required

None — SAFETY-07 is a pure client-side runtime behavior in `src/lib/screen-wake-lock.ts`. No env vars, no Vercel configuration, no external services, no database migrations. Rolls out with the next deploy.

## Next Phase Readiness

- SAFETY-07 complete; Phase 2 Safety Floor moves one plan closer to phase-close.
- Parallel 02-06 (RehearsalMode session ceiling) is running concurrently on a disjoint file surface (`src/components/RehearsalMode.tsx`). This plan touched nothing overlapping, so no merge risk.
- Fake-timer pattern is now available to future phases (Phase 3 AUTHOR might use it for baking-timeout tests; Phase 5 COACH might use it for feedback-debounce tests).
- No blockers. Build green, full suite green (395/395 after flake recovered), lint clean.

## Threat Flags

None new. SAFETY-07 mitigates **T-2-20 (DoS-of-wallet via overnight screen-awake TTS burn)** exactly as the plan's threat register specified:

| Threat ID | Category                        | Mitigation landed                                                                                |
| --------- | ------------------------------- | ------------------------------------------------------------------------------------------------ |
| T-2-20    | DoS-of-wallet                   | 30-min inactivity auto-release. Belt-and-suspenders with SAFETY-03 per-day cap (300 calls/24h ≈ $1-3 worst case). |
| T-2-21    | Availability (known limitation) | Accept — documented in JSDoc, pilot-scale acceptance per threat register disposition.            |

No new trust boundary, no new endpoint, no new secret, no new auth path. No threat surface added that is NOT already in the plan's threat register.

---
*Phase: 02-safety-floor*
*Completed: 2026-04-21*

## Self-Check: PASSED

**Created files verified:**
- FOUND: src/lib/__tests__/screen-wake-lock.test.ts

**Modified files verified:**
- FOUND: src/lib/screen-wake-lock.ts (contains INACTIVITY_TIMEOUT_MS, 30 * 60 * 1000, resetInactivityTimer, attachInactivityListener, [SAFETY-07], inactivityListenerAttached, keydown, click, touchstart, pointerdown — all 10 acceptance-criterion grep targets)

**Commits verified:**
- FOUND: 46097ac (Task 1 RED: `test(02-07): add failing screen-wake-lock inactivity tests (RED)`)
- FOUND: 9112e8a (Task 1 GREEN: `safety-07: add wake-lock inactivity auto-release (30min default)`)

**Verification gates:**
- `npm run test:run -- src/lib/__tests__/screen-wake-lock.test.ts` → 6 passed / 0 failed
- `npm run test:run` (full suite, final run) → 395 passed / 0 failed (after one transient flake in unrelated auth.test.ts that self-recovered on rerun)
- `npm run build` → exits 0, `✓ Compiled successfully`
- `npx eslint src/lib/screen-wake-lock.ts src/lib/__tests__/screen-wake-lock.test.ts` → exits 0, no warnings
- Diff verification: `git diff --stat src/lib/screen-wake-lock.ts` reports `60 insertions(+), 0 deletions(−)` — strictly additive per acceptance criterion
- Test file has 6 `it(` blocks (acceptance criterion: ≥ 5)
- No accidental deletions: `git diff --diff-filter=D --name-only HEAD~1 HEAD` returns empty
- Out-of-scope files confirmed untouched: parallel 02-06 agent's `src/components/RehearsalMode.tsx`, STATE.md, ROADMAP.md, REQUIREMENTS.md — git status shows no modifications by this agent to any of those paths

## TDD Gate Compliance

Plan 07 is a `type: execute` plan with `tdd="true"` on its single task. Gate sequence:

- **Task 1 RED:** commit `46097ac` message starts with `test(02-07):` — ✓ correct prefix; test file committed before any implementation changes; `npm run test:run` against the commit shows 5 of 6 tests failing — ✓ correct fail-fast signal (one test passes because it exercises pre-existing acquire behavior that's legitimately unchanged).
- **Task 1 GREEN:** commit `9112e8a` message starts with `safety-07:` (imperative feat form per Phase 1 D-20 / Phase 2 CONTEXT "Established Patterns §Commit convention") — ✓ correct prefix, lands after RED in the git log, and turns all 6 tests green.
- **REFACTOR:** skipped as unnecessary (implementation is already minimal and mirrors the existing `visibilityListenerAttached` pattern verbatim) — ✓ compliant with the "only commit REFACTOR if changes" rule.

Gate sequence correct: `test(...)` commit `46097ac` → `feat-style safety-07:` commit `9112e8a`. No warnings on TDD compliance.
