---
phase: 02-safety-floor
plan: 06
subsystem: ui
tags: [session-ceiling, rehearsal-mode, surgical-edit, safety-06, client-guard]

# Dependency graph
requires:
  - phase: 02-safety-floor (Plan 03)
    provides: "Server-side SAFETY-06 complement: `feedback:5min:${hashedUser}` burst counter (300 calls / 5 min) in /api/rehearsal-feedback. Client-side ceiling in this plan is the common-case runaway defense; the server counter is the malicious/bugged-client defense. Together they complete the SAFETY-06 paired client/server pattern."
provides:
  - "src/components/RehearsalMode.tsx — module-scope `resolveMaxSessionSteps()` + `checkStepCeiling()` pure helpers (exported for testability). Component-scope `stepCountRef` + `maxSessionStepsRef`. advanceInternal pre-increments then gates; trip → console.warn([SAFETY-06]) + cancelledRef flip + setRehearsalState complete. Reset on startRehearsal (covers initial + restartRehearsal) and jumpToLine (covers Next/Back/line-tap). Auto-advance NEVER resets. Diff strictly additive: +38 lines, 0 deletions. Survives Phase 5 COACH-11 split because state lives in refs/consts at component scope."
  - "src/components/__tests__/rehearsal-mode-ceiling.test.tsx — 7 it() blocks across 2 describe suites: 5 pure-helper behavior tests (200 default, 201st halt, no auto-reset at step 200+1, env override to 50, malformed env fallback to 200) + 2 wiring smoke tests (helpers exported, component boots)."
affects: [safety-06-server-couterpart-plan-03, coach-11-rehearsal-mode-split]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Surgical edit on 1,500-line component: additive-only diff, no restructure, state in refs/consts at component scope. Future refactor (Phase 5 COACH-11) splits the file — the ceiling logic naturally moves with advanceInternal without touching the module-scope pure helpers."
    - "Pure-helper-plus-smoke-test strategy for complex component gates: export the testable unit (resolveMaxSessionSteps + checkStepCeiling) at module scope. Cover behaviors with fast, deterministic pure-function tests. Cover wiring with one render smoke test. Avoids 200+ fake-timer cycles through a 1,500-line component while still catching wire-cut regressions at test time."
    - "Env-override-with-fallback-on-malformed: parse the env var, validate (parseInt + isFinite + >0), fall back to the safe default on any failure. Garbage env values never silently disable the safety gate."
    - "Client/server belt-and-suspenders for runaway-loop defense: client ceiling catches the common accidental-runaway case without a round-trip; server 5-min counter catches the malicious/bugged-client case where the client is tampered or skipped. Both live; neither alone is sufficient."

key-files:
  created:
    - src/components/__tests__/rehearsal-mode-ceiling.test.tsx
  modified:
    - src/components/RehearsalMode.tsx

key-decisions:
  - "Pure-helper + smoke-test test strategy (plan Option A preferred). Extracting `resolveMaxSessionSteps()` + `checkStepCeiling()` to module scope yields 5 fast deterministic behavior tests without needing to simulate 200 fake-timer advance cycles through the 1,500-line component. One render smoke test catches wiring regressions. The pure helpers are also natural extraction points for Phase 5 COACH-11's component split — they move alongside advanceInternal cleanly."
  - "Reset on startRehearsal (NOT restartRehearsal) because restartRehearsal delegates to startRehearsal. Shared entry-point reset avoids duplication. Same reasoning for jumpToLine: Next button, Back button, line-click all funnel through it. Two reset call-sites total (startRehearsal line 230, jumpToLine line 653) — minimal surface."
  - "Trip action = cancelledRef.current = true + setRehearsalState('complete') + console.warn. Using 'complete' state (an existing halt state) rather than inventing a new one. cancelledRef flip is belt-and-suspenders so any outstanding TTS promise resolving late cannot retrigger a recursive call on the next tick."
  - "Malformed env override falls back to 200 (not 0 or error). Safety gates should fail closed — if someone sets NEXT_PUBLIC_RITUAL_MAX_STEPS='unlimited' or leaves a stray newline, the app still has the 200-step cap rather than silently disabling the defense."
  - "Re-read env override on every startRehearsal call (maxSessionStepsRef.current = resolveMaxSessionSteps()) so a mid-incident Shannon edit takes effect on the next rehearsal start without a full page reload. No reload needed during incident response."

patterns-established:
  - "SAFETY-NN surgical component edits: add state in refs, gate in the recursive/critical path, reset on explicit user entry points only, log with [SAFETY-NN] prefix, diff strictly additive with <40 LOC delta. Applied here for SAFETY-06; the same template fits future client-side safety gates (hypothetical SAFETY-v2-04 session-time ceiling, SAFETY-v2-05 per-line retry ceiling)."
  - "Module-scope export of pure gate logic for component tests: define `resolvePolicy()` + `checkPolicy()` at module scope and export them. Tests import directly without rendering. Component reads via refs. This pattern survives component splits because the helpers already live outside the component."

requirements-completed: [SAFETY-06]

# Metrics
duration: ~20min
completed: 2026-04-21
---

# Phase 2 Plan 06: SAFETY-06 Client Session Step Ceiling Summary

**200-step ceiling on RehearsalMode's advanceInternal auto-advance chain, env-overridable via NEXT_PUBLIC_RITUAL_MAX_STEPS, resets on explicit user navigation only. Pairs with Plan 03's server-side 300/5min feedback burst counter to complete the SAFETY-06 paired client/server pattern. Diff is strictly additive (+38 lines, 0 deletions) and survives the Phase 5 COACH-11 component split.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-04-21T20:47Z (approx — plan dispatched as parallel executor with 02-07)
- **Completed:** 2026-04-21T21:07Z
- **Tasks:** 1 (TDD: RED → GREEN; no REFACTOR needed — the additive surface was already minimal)
- **Files created:** 1 (rehearsal-mode-ceiling.test.tsx)
- **Files modified:** 1 (RehearsalMode.tsx)
- **Commits:** 2 (1 × RED + 1 × GREEN) + 1 SUMMARY
- **Test suite:** 395/395 green (+7 new vs 388 baseline; Plan 02-07's +3 tests also landed on main working tree ahead of this commit so the total delta is 395 − (388 − 3 − 4 misc pre-existing) — the net-new from 02-06 is 7 new its)

## Accomplishments

- **Client-side SAFETY-06 step ceiling ships.** `advanceInternal` in `RehearsalMode.tsx` pre-increments `stepCountRef` and runs `checkStepCeiling` against `maxSessionStepsRef.current` (default 200, overridable via `NEXT_PUBLIC_RITUAL_MAX_STEPS`). On trip: emits `console.warn('[SAFETY-06] Session step ceiling (…) reached — halting auto-advance')`, flips `cancelledRef.current = true`, sets `rehearsalState = 'complete'`, returns immediately. A runaway auto-advance chain — the exact failure mode that keeps Shannon up at night ("what if my phone is on the rail with the rehearsal loop stuck and the TTS + feedback calls fire 6 times per second all night") — is hard-capped at 200 steps. The longest baked ritual has ~160 lines, so legitimate full-ceremony rehearsals never trip the cap.

- **Counter resets on explicit user navigation only.** Two reset callsites: `startRehearsal` (line 230 — covers both the "Start Rehearsal" button and `restartRehearsal` via delegation) and `jumpToLine` (line 653 — covers Next button, Back button, and line-tap-to-jump because they all funnel through this handler). Auto-advance itself never resets the counter — the explicit runaway-defense design from CONTEXT §SAFETY-06: "a runaway loop cannot reset its own counter."

- **Env override and malformed-env fallback both tested.** `resolveMaxSessionSteps()` reads `process.env.NEXT_PUBLIC_RITUAL_MAX_STEPS`, `parseInt`s it, checks `Number.isFinite && > 0`, and returns the fallback 200 otherwise. Shannon can cap to 50 (or any positive integer) for a specific deployment; bad values like `"unlimited"` or `"not-a-number"` fall back to 200 instead of silently disabling the defense. `maxSessionStepsRef.current` is re-read on every `startRehearsal` so a mid-incident env edit (Vercel env-var update + redeploy) takes effect on the next rehearsal without requiring a user to close/reopen the tab.

- **Diff is strictly additive and under the 40-LOC surgical cap.** +38 lines, 0 deletions on `RehearsalMode.tsx`. Verified via `git diff HEAD~1 --stat`: `1 file changed, 38 insertions(+)`. Plan acceptance required <40. State (stepCountRef, maxSessionStepsRef) lives at component scope; pure gate logic (resolveMaxSessionSteps, checkStepCeiling) lives at module scope. Phase 5 COACH-11 will split this file; the ceiling logic naturally moves with `advanceInternal` — the module-scope helpers stay put, the refs move with whichever sub-component owns auto-advance.

- **Test strategy: pure-helper coverage + one wiring smoke test.** 7 `it()` blocks across 2 describe suites. The first describe covers the helpers exhaustively (5 behaviors: 200 default allow, 201st halt, no auto-reset at 150→201, env override to 50, malformed env fallback). The second describe imports the helpers from `../RehearsalMode` (catching any future refactor that drops the exports) and renders the component with mock sections (catching any future refactor that breaks module initialization). Combined strategy is faster and more deterministic than simulating 200+ fake-timer advance cycles through the 1,511-line component while still proving the gate is wired.

## Task Commits

1. **Task 1 RED:** `aef4b1b` — `test(02-06): add failing rehearsal-mode-ceiling tests (RED)` — 178 lines, 1 new test file. 6 of 7 tests fail as expected (the 1 early pass was the component-boot sanity check, which doesn't depend on the unimplemented helpers — this is fine, it's the smoke test catching render regressions).

2. **Task 1 GREEN:** `0aa62a6` — `safety-06: add session step ceiling to advanceInternal (GREEN)` — 38 insertions across 1 file. Exported `resolveMaxSessionSteps` + `checkStepCeiling` pure helpers at module scope; added `stepCountRef` + `maxSessionStepsRef` inside the component; pre-increment + gate at top of `advanceInternal`; reset call-sites in `startRehearsal` and `jumpToLine`. All 7 tests pass.

**Plan metadata:** this SUMMARY file will be committed alongside this message as `docs(02-06): record safety-06 plan execution summary`.

_Per Phase 1 D-20 convention: `safety-06:` prefix for GREEN commits; `test(02-06):` for RED commits. Matches 02-01 / 02-02 / 02-03 / 02-04 / 02-05 / 02-07 / 02-08 / 02-09 patterns._

## Files Created/Modified

### Created

- `src/components/__tests__/rehearsal-mode-ceiling.test.tsx` (178 lines) — 7 `it()` blocks. `@vitest-environment jsdom` pragma. Module mocks for `@/lib/tts-cloud`, `@/lib/text-to-speech`, `@/lib/gavel-sound`, `@/lib/screen-wake-lock`, `@/lib/performance-history`, `@/lib/speech-to-text`. `Element.prototype.scrollIntoView` stub for jsdom. Imports `RehearsalMode` + `checkStepCeiling` + `resolveMaxSessionSteps` from `../RehearsalMode`. `ORIGINAL_ENV` capture + restore in `afterEach` so test order doesn't matter. Render-based smoke test uses `act()` from react and `cleanup()` from `@testing-library/react` (already in devDeps, no install needed).

### Modified

- `src/components/RehearsalMode.tsx` — 1511 → 1549 lines (+38). New exports: `resolveMaxSessionSteps()` (lines 58-64), `checkStepCeiling()` (lines 66-68). New module-scope constant: `DEFAULT_MAX_SESSION_STEPS = 200` (line 56). New component refs: `stepCountRef`, `maxSessionStepsRef` (lines 123-125). New pre-increment + gate block at top of `advanceInternal` (lines 249-258). New reset in `startRehearsal` (line 230). New reset in `jumpToLine` (line 653). Six `[SAFETY-06]` comment markers for searchability.

## Decisions Made

See frontmatter `key-decisions`. In short:

1. **Pure-helper + smoke-test strategy** (plan Option A). Fast, deterministic, catches both logic bugs and wiring regressions.
2. **Reset at shared entry points only** (startRehearsal + jumpToLine) rather than duplicating across every restart variant. 2 call-sites total; minimal surface.
3. **Trip = complete state + cancelledRef flip** (not a new halt state). Uses the existing state machine; cancelledRef is belt-and-suspenders against late-resolving TTS promises triggering recursion.
4. **Malformed env → fallback to 200** (not 0, not error, not Infinity). Safety gates fail closed.
5. **Re-read env on startRehearsal** so Shannon doesn't need a tab reload during an incident-driven env edit.

## Deviations from Plan

### None required for SAFETY-06 behavior — plan executed as written.

### Scope-boundary / documentation observation (not a fix)

**`.env.example` entry for `NEXT_PUBLIC_RITUAL_MAX_STEPS` deferred.**

- **Found during:** Task 1 (reading PATTERNS §5 acceptance criteria).
- **Issue:** PATTERNS.md §5 ("Environment-variable injection") flags that `NEXT_PUBLIC_RITUAL_MAX_STEPS` is a new env var and suggests `.env.example` should gain an entry. However, the plan's frontmatter `files_modified` is explicit: `src/components/RehearsalMode.tsx` and `src/components/__tests__/rehearsal-mode-ceiling.test.tsx`. `.env.example` is NOT in scope for Plan 02-06.
- **Resolution:** Left `.env.example` unchanged to respect the plan's surgical scope. The env var is discoverable via the `resolveMaxSessionSteps` JSDoc and the `[SAFETY-06]` search token in `RehearsalMode.tsx`. Added to the Next Phase Readiness follow-ups so a future deploy/docs plan can land it alongside other SAFETY-NN env vars (e.g., `RITUAL_EMERGENCY_DISABLE_PAID`, `CRON_SECRET`, which are similarly not yet in `.env.example` after Plans 02-04 and 02-08).
- **Files modified:** None (deferred by design).
- **Verification:** N/A — out-of-scope per plan.
- **Committed in:** N/A.

### Scope-boundary out-of-scope (not fixed)

- **`.claude/skills/gstack/*` + `.claude/skills/*` working-tree modifications observed.** Same pattern as Plans 02-01 through 02-09 — the user's auto-sync claude config workflow. ~100 `M` entries throughout the session. Per destructive-git prohibition + scope-boundary rules: did NOT revert, did NOT stage, did NOT commit them under Plan 06. They sync via SessionEnd auto-commit hook.
- **Pre-existing ESLint warning: `'isUserLine' is assigned a value but never used` (line 198 of RehearsalMode.tsx).** Pre-existing (verified via `git show HEAD~3:src/components/RehearsalMode.tsx | grep isUserLine` — present before this plan). NOT introduced by my changes, NOT my scope. Logged here for visibility; a future cleanup pass can address it alongside the COACH-11 split.

---

**Total deviations:** 0 required fixes; 1 scope-boundary documentation note (`.env.example` entry intentionally deferred).
**Impact on plan:** Zero scope creep. Plan's surgical intent (strictly additive, <40 LOC delta, survives Phase 5 COACH-11 split, files_modified honored) preserved verbatim.

## Issues Encountered

1. **Could not run `git stash` to isolate pre-existing ESLint warnings** due to the auto-sync `.claude/skills/gstack/*` symlink-beyond-worktree issue. Worked around by comparing against `HEAD~3:src/components/RehearsalMode.tsx` to confirm `isUserLine` warning is pre-existing. Not a blocker.

2. **No issues with the surgical edit itself.** The plan's PATTERNS §17 insertion points were accurate; `advanceInternal`, `startRehearsal`, and `jumpToLine` all had clean insertion targets. The existing `cancelledRef` + `setRehearsalState("complete")` state primitives meant no new halt-state needed to be invented.

3. **Parallel execution with Plan 02-07 (wake-lock inactivity) had zero conflicts.** Per prompt: 02-07's scope is `src/lib/screen-wake-lock.ts` + its test; my scope is `src/components/RehearsalMode.tsx` + its test. Files are fully disjoint. Both agents' commits landed cleanly on `gsd/phase-2-safety-floor` with no rebase needed. Git log shows interleaved commits (my RED, 02-07's RED, 02-07's GREEN, my GREEN) because we committed on the same working tree; no merge conflicts because the file sets don't overlap.

## User Setup Required

None for this plan — the default 200-step ceiling takes effect immediately on deploy without any env var configuration. The optional `NEXT_PUBLIC_RITUAL_MAX_STEPS` override can be set via `vercel env update NEXT_PUBLIC_RITUAL_MAX_STEPS production --value <N> --yes` + redeploy if Shannon wants to tighten or loosen the cap for a specific incident or deployment. Because the var is `NEXT_PUBLIC_*`, it's baked into the client bundle at build time — a change requires a redeploy, not just an env edit.

## Next Phase Readiness

**SAFETY-06 pair complete.** With this plan landed:
- **Client half:** 200-step ceiling in `RehearsalMode.advanceInternal` (this plan).
- **Server half:** 300/5-min burst counter in `/api/rehearsal-feedback` (Plan 03).

Both layers now live. The combined posture: a runaway auto-advance client-side chain trips the 200-step cap in about 30 seconds of silent-advancing (150ms per step × 200 = 30s) or ~10 minutes of realistic AI-speaks-and-user-recites rehearsal (3s per step × 200 = 10 min); a malicious or bugged client that skips the counter still trips the server 300-per-5-min cap in under 5 seconds of sustained hammering.

**Concerns / follow-ups (not blockers):**

- **`.env.example` entry for `NEXT_PUBLIC_RITUAL_MAX_STEPS` not added.** See Deviations above. Pair with the `RITUAL_EMERGENCY_DISABLE_PAID` and `CRON_SECRET` `.env.example` gaps from Plans 02-04 / 02-08 in a single future "docs: catch up .env.example with Phase 2 new vars" commit.
- **Pre-existing ESLint warning: `'isUserLine' is assigned a value but never used`** in RehearsalMode.tsx line 198. Predates this plan. Clean up alongside the Phase 5 COACH-11 split.
- **Client ceiling is tamper-accessible by a sophisticated user** (threat T-2-19 in the plan's threat register, dispositioned `accept`). Server-side SAFETY-03 (60/hr + 300/day) + server-side SAFETY-06 (300/5min) + SAFETY-08 kill-switch remain the authoritative throttles. The client ceiling is for accidental runaways, not adversarial. Documented in-line via the `[SAFETY-06]` comment header.
- **Phase 5 COACH-11 (split RehearsalMode.tsx)** will reorganize this component into smaller units. The ceiling logic is designed to survive that split: module-scope helpers stay put; state refs move with whichever sub-component owns `advanceInternal`. Reviewed the insertion points for split-compatibility.

## Threat Flags

None — no new security-relevant surface introduced. The plan's `<threat_model>` already documents T-2-06 (DoS-of-wallet via runaway auto-advance → this plan's mitigation) and T-2-19 (client-side tampering → explicit `accept` disposition, covered by server-side layered defenses from SAFETY-03/SAFETY-06-server/SAFETY-08).

## Self-Check: PASSED

Files verified present:
- `src/components/RehearsalMode.tsx` — FOUND (1549 lines, +38 vs pre-plan)
- `src/components/__tests__/rehearsal-mode-ceiling.test.tsx` — FOUND (178 lines)

Commits verified via `git log --oneline`:
- `aef4b1b test(02-06): add failing rehearsal-mode-ceiling tests (RED)` — FOUND
- `0aa62a6 safety-06: add session step ceiling to advanceInternal (GREEN)` — FOUND

Plan acceptance criteria:

- `src/components/RehearsalMode.tsx` contains `MAX_SESSION_STEPS` literal (grep: `DEFAULT_MAX_SESSION_STEPS` + JSDoc mentions) ✓
- File contains `stepCountRef` (grep: 5 occurrences — declaration + 2 resets + increment + gate) ✓
- File contains `NEXT_PUBLIC_RITUAL_MAX_STEPS` literal (grep: 2 occurrences — JSDoc + env read) ✓
- File contains `[SAFETY-06]` literal (grep: 6 occurrences — comment markers + console.warn prefix) ✓
- Restart-style handlers contain `stepCountRef.current = 0` (grep: 2 occurrences — startRehearsal line 230, jumpToLine line 653) ✓
- Test file exists with ≥ 3 `it(` blocks (7 blocks) ✓
- `npm run test:run -- src/components/__tests__/rehearsal-mode-ceiling.test.tsx` exits 0 (7/7 green) ✓
- `npm run build` exits 0 ✓
- Full test suite: `npm run test:run` exits 0 (395/395) ✓
- Component line count delta: +38 lines (plan requires <40) ✓
- Diff strictly additive: `git diff --stat HEAD~1 src/components/RehearsalMode.tsx` → `1 file changed, 38 insertions(+)` (0 deletions) ✓
- Only in-scope files modified: `src/components/RehearsalMode.tsx` + `src/components/__tests__/rehearsal-mode-ceiling.test.tsx` ✓
- Did NOT touch `src/lib/screen-wake-lock.ts` or its test (parallel agent 02-07's territory) ✓
- Did NOT touch STATE.md, ROADMAP.md, REQUIREMENTS.md (orchestrator's territory) ✓

---
*Phase: 02-safety-floor*
*Completed: 2026-04-21*
