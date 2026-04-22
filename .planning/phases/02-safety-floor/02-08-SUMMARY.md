---
phase: 02-safety-floor
plan: 08
subsystem: ui + api
tags: [kill-switch, degraded-mode, banner, runbook, useSyncExternalStore, react-19, vitest]

# Dependency graph
requires:
  - phase: 02-safety-floor (Plan 02)
    provides: "paid-route-guard kill-switch emitter. RITUAL_EMERGENCY_DISABLE_PAID=true causes applyPaidRouteGuards to return 503 + {error:'paid_disabled', fallback:<per-route>} — the response shape Plan 08's client detector keys off."
  - phase: 02-safety-floor (Plan 05)
    provides: "src/lib/api-fetch.ts post-Plan-05 shape (Bearer attach + proactive refresh + 401-retry). Plan 08 extends it by appending a 503 detection branch AFTER the 401 retry, touching no existing logic."
  - phase: 01-pre-invite-hygiene
    provides: "src/components/PilotBanner.tsx (amber-950/80 Tailwind ribbon shape — PATTERNS §10 analog) + docs/runbooks/SECRET-ROTATION.md (PATTERNS §8 runbook structure — verbatim analog for KILL-SWITCH.md)."
provides:
  - "src/lib/degraded-mode-store.ts — zero-dep useSyncExternalStore singleton (PATTERNS §Suggestion 3(a)). Exports setDegradedMode, getDegradedMode, subscribeDegradedMode, __resetDegradedModeForTests. One writer (api-fetch), many readers. Idempotent setter short-circuits on no-op writes; emit() notifies all subscribed listeners on true transitions."
  - "src/components/DegradedModeBanner.tsx — 'use client' React 19 component. Subscribes to the store via useSyncExternalStore with () => false SSR snapshot (no hydration flicker). Renders amber ribbon with D-18 soft copy ('Live AI is paused — using pre-baked audio and word-diff scoring. Contact Shannon for questions.') + Dismiss button. role='status' for a11y. Dismiss semantics per D-18: dismissable per-session via component-local useState; re-opens on any subsequent false→true store transition via derive-during-render pattern (not useEffect+setState cascade — avoids the react-hooks/set-state-in-effect anti-pattern)."
  - "src/lib/api-fetch.ts — extended with 503 + {error:'paid_disabled'} detection branch AFTER the 401 retry block and BEFORE the final return. Clones the response, parses JSON, flips setDegradedMode(true) only when body.error === 'paid_disabled' exactly. Generic upstream 503 (HTML body, missing error, or different error code) does NOT flip the flag. Per-response detection only (D-19); no dedicated health probe."
  - "src/app/layout.tsx — DegradedModeBanner mounted next to PilotBanner so both banners stack naturally when both fire (kill-switch during pilot window = two stacked ribbons)."
  - "docs/runbooks/KILL-SWITCH.md — canonical runbook for flipping RITUAL_EMERGENCY_DISABLE_PAID during a cost-runaway incident. TL;DR + What-it-does + Prerequisites + Flip + Verify (curl recipes for all three paid-route classes) + User-experience + Flip back + Known caveats (Hobby-plan cron drift per D-05 post-research / rate-limit cold-start per RESEARCH §Pitfall 4 / cron no-retry per §Pitfall 2 / spend-tally warm-container per D-06b) + Troubleshooting + See also."
  - "docs/runbooks/SECRET-ROTATION.md — cross-link (one-line addition per D-20) to KILL-SWITCH.md in the See-also section."
affects: [safety-09, phase-2-follow-up, phase-6-admin-ux]

# Tech tracking
tech-stack:
  added: []  # no new runtime/dev dependencies — useSyncExternalStore is a React 19 primitive already in scope
  patterns:
    - "Zero-dep module-scope singleton with useSyncExternalStore — PATTERNS §Suggestion 3(a) realized. One writer + many readers + idempotent setter + test-only reset export mirrors rate-limit.ts / paid-route-guard.ts / api-fetch.ts conventions. Any future client-side global flag (e.g., transient 'offline', 'read-only', future ADMIN-04 revoked-session states) copies this shape rather than introducing Context or a state library."
    - "Derive-during-render dismiss semantics (React 19 idiom). Instead of useEffect+setState to clear dismissal on store transition false→true, reset the local state during render when the store value invalidates it. Avoids the react-hooks/set-state-in-effect lint violation AND the extra render cycle. Stateless dismiss-reconciliation between store transitions is the pattern."
    - "Second operational runbook in docs/runbooks/ — establishes that PATTERNS §8 runbook structure (TL;DR → What → Prereqs → Do → Verify → Rollback → Caveats → Troubleshoot → See also) is the canonical shape. Future incident classes (e.g., revocation flush, provider-swap) will copy this structure."

key-files:
  created:
    - src/lib/degraded-mode-store.ts
    - src/components/DegradedModeBanner.tsx
    - src/lib/__tests__/degraded-mode-store.test.ts
    - src/components/__tests__/DegradedModeBanner.test.tsx
    - docs/runbooks/KILL-SWITCH.md
  modified:
    - src/lib/api-fetch.ts
    - src/lib/__tests__/api-fetch.test.ts
    - src/app/layout.tsx
    - docs/runbooks/SECRET-ROTATION.md

key-decisions:
  - "useSyncExternalStore singleton over React Context or Zustand. Context would require wrapping the root layout in a provider (one more thing to drop from server-component status); Zustand would add a runtime dependency for a thirty-line module. useSyncExternalStore is the React 19 primitive and is exactly what a one-writer, many-readers, in-memory flag wants — PATTERNS §Suggestion 3(a)."
  - "Dismiss semantics implemented via derive-during-render pattern, NOT useEffect+setState. Plan's original code suggested a simpler on/off dismiss flag, but that would not re-open the banner on a subsequent false→true store transition (D-18 re-trigger requirement). The derive-during-render pattern gets D-18 behavior without the useEffect cascading-render anti-pattern the react-hooks linter flags."
  - "SSR snapshot is () => false — the server never emits the banner on first HTML. On the client, useSyncExternalStore subscribes and re-renders only if the store has flipped since bootstrap. This avoids a flash-of-banner during hydration on servers where the store happens to be true (impossible in practice because the store is per-tab client-side, but the SSR snapshot makes that guarantee structural)."
  - "503 detection branch appended AFTER the 401 retry block in api-fetch.ts. Placing it before would mean a 503 with paid_disabled + an expired client-token (concurrent conditions) would flip the banner before the 401-retry attempt resolved, leaking degraded-mode UX even when auth-retry would have succeeded. After the retry, the response is final; degradation reflects reality."
  - "Generic 503 (HTML body, JSON without 'error', or error code other than 'paid_disabled') deliberately does NOT flip the flag. Upstream provider outages are not the kill switch; mislabeling them as such would cause the banner to fire on unrelated provider incidents and train Past Masters to ignore it. The string comparison on body.error === 'paid_disabled' is exact by design."

patterns-established:
  - "Zero-dep client-side shared state via useSyncExternalStore — module-scope variable, typed listener Set, emit() on writes, idempotent setter, test-only reset. Future Phase 2+ client flags (read-only mode, invited-user session snapshots, any ephemeral per-tab state) copy this shape."
  - "Banner-shape reuse — any app-wide ribbon (PilotBanner / DegradedModeBanner today; future ADMIN-08 maintenance banner if needed) uses the same amber-950/80 + border-amber-800 + text-amber-100 Tailwind chord, role='status', thin ribbon dimensions. Mounting sibling to PilotBanner in the layout means multi-banner stacking is free."
  - "Canonical runbook shape in docs/runbooks/ — TL;DR → What → Prereqs → Do → Verify → Rollback → Caveats → Troubleshoot → See also. Every future incident runbook copies this skeleton. Cross-linking from the See-also sections of sibling runbooks makes the runbook-set self-navigating."

requirements-completed: [SAFETY-08]

# Metrics
duration: ~6min
completed: 2026-04-21
---

# Phase 2 Plan 08: Client degraded-mode UX + KILL-SWITCH.md runbook

**Ships SAFETY-08 client half (useSyncExternalStore degraded-mode singleton + DegradedModeBanner with D-18 soft copy + api-fetch.ts 503 detection) plus docs/runbooks/KILL-SWITCH.md canonical runbook. When Shannon flips RITUAL_EMERGENCY_DISABLE_PAID at 3am during a cost incident, invited Past Masters see 'Live AI is paused — using pre-baked audio and word-diff scoring' instead of ERROR walls; the runbook makes the flip itself muscle-memory.**

## Performance

- **Duration:** ~6 min (first commit 2026-04-21T13:52:14Z → last commit 2026-04-21T13:58:20Z, plus this SUMMARY session)
- **Tasks:** 2 (Task 1 TDD: RED → GREEN + minor refactor inside the GREEN commit; Task 2 runbook-only)
- **Files created:** 5 (store, banner, store test, banner test, KILL-SWITCH.md)
- **Files modified:** 4 (api-fetch + api-fetch test, layout, SECRET-ROTATION.md)
- **Commits:** 3 (1 × RED + 2 × GREEN — `test(02-08):` + two `safety-08:`)
- **Test suite:** 340/340 green (+14 new: 6 store + 4 banner + 4 api-fetch SAFETY-08 cases)

## Accomplishments

- **Zero-dep degraded-mode store landed via useSyncExternalStore.** `src/lib/degraded-mode-store.ts` (58 lines) exposes `setDegradedMode(on: boolean)` — the single writer from api-fetch — and `getDegradedMode()` + `subscribeDegradedMode(fn)` for React readers. Setter is idempotent (no-op writes skip the emit() loop). Listener Set uses typed `() => void` callbacks. `__resetDegradedModeForTests` follows the rate-limit.ts / paid-route-guard.ts / api-fetch.ts convention for module-scope isolation between test cases. Six store unit tests cover default-off, on-transition, subscriber notification, idempotent no-op, unsubscribe cleanup, and reset-between-tests.

- **DegradedModeBanner ships with D-18 soft copy and re-trigger semantics.** `src/components/DegradedModeBanner.tsx` (88 lines, `"use client"`) subscribes to the store via `useSyncExternalStore(subscribeDegradedMode, getDegradedMode, () => false)` — the SSR snapshot `() => false` guarantees no server-side banner in first HTML (no hydration flicker). Renders `role="status"` amber ribbon (amber-950/80 bg, border-amber-800, text-amber-100 — PATTERNS §10 shape verbatim from PilotBanner) with literal copy "Live AI is paused — using pre-baked audio and word-diff scoring. Contact Shannon for questions." Dismiss button sets a component-local `dismissedAt` state. D-18 re-trigger via derive-during-render: when the store transitions to false, `dismissedAt` is reset during render, so the next false→true store transition re-opens the banner. Four banner tests: hidden when store off, role=status when on, dismiss hides current, D-18 re-open on subsequent flip.

- **api-fetch.ts detects 503 + paid_disabled and flips the store (D-19 per-response only).** Extended AFTER the existing 401 retry logic and BEFORE the final `return resp` in `src/lib/api-fetch.ts`. Clones the response, parses JSON, and flips `setDegradedMode(true)` iff `body.error === "paid_disabled"` (exact string match). A generic 503 with HTML body falls through silently (try/catch swallows JSON parse errors). A 503 with JSON body but no `error` field, or `error` = any value other than `"paid_disabled"`, does NOT flip the flag. 200 responses do not touch the store. Four new SAFETY-08 api-fetch tests: 503+paid_disabled flips, 200 no-op, generic 503 no-op, alt-error-code 503 no-op. Full api-fetch test suite 11/11 green — all Plan 05 lifecycle behaviors (Bearer attach / proactive refresh / 401 retry / bootstrap fallback) preserved unchanged.

- **layout.tsx mounts DegradedModeBanner next to PilotBanner.** Single import + single JSX insertion in `src/app/layout.tsx`. Both banners now stack naturally in the body — if the kill switch flips during the invited-pilot window, a Past Master sees the amber pilot banner + the amber degraded-mode banner together, stacked top-to-bottom. No layout regressions; PilotBanner's existing tests unchanged.

- **docs/runbooks/KILL-SWITCH.md is the canonical runbook (PATTERNS §8 shape).** 218-line runbook covers the full flip/verify/flip-back cycle. TL;DR section (3 bash blocks). What-it-does section enumerates all three 503 body shapes (`/api/tts/*` → `{fallback:"pre-baked"}`, `/api/rehearsal-feedback` → `{fallback:"diff-only"}`, `/api/transcribe` → `{error:"paid_disabled"}` without fallback). Prerequisites + Flip + Verify (curl recipes for all three paid-route classes) + User-experience + Flip back. Known-caveats section covers all four operational gotchas from plan frontmatter + RESEARCH: Hobby-plan cron drift (D-05 post-research — "02:00-02:59 UTC window" on Hobby vs per-minute on Pro), rate-limit cold-start (RESEARCH §Pitfall 4 — "for sustained distributed attack, flip kill switch"), Vercel cron no-retry (RESEARCH §Pitfall 2 — "Resend down at 02:00 means no alert that day"), spend-tally warm-container (D-06b — "totals are a floor, not a ceiling"). Troubleshooting section covers env-var-didn't-propagate, banner-not-appearing, flip-back-didn't-restore. See-also links to SECRET-ROTATION.md + PHASE-2-DEPLOY-CHECKLIST.md + paid-route-guard.ts + api-fetch.ts + the phase CONTEXT.md locked decisions.

- **SECRET-ROTATION.md cross-links back to KILL-SWITCH.md (D-20).** One-line addition in the See-also section: "`docs/runbooks/KILL-SWITCH.md` — flipping `RITUAL_EMERGENCY_DISABLE_PAID` to pause every paid route app-wide (different incident class from secret rotation)". The two operational runbooks now link bidirectionally; on-call navigates between them without a lookup table.

- **Test suite: 340/340 green.** +14 new tests (6 store + 4 banner + 4 api-fetch SAFETY-08 cases). Full build exits 0; no TS errors; no import-order or lint violations in new/modified files.

## Task Commits

Each task followed TDD per plan frontmatter (`autonomous: true`, tasks had `tdd="true"`).

1. **Task 1: Create degraded-mode-store + DegradedModeBanner + wire into api-fetch and layout**
   - `c5b4a51` — `test(02-08): add failing degraded-mode + banner + api-fetch 503 tests (RED)` — 3 test files (store, banner, extended api-fetch), 309 insertions, all failing as expected (production modules didn't exist).
   - `053e8a4` — `safety-08: client degraded-mode store + banner + api-fetch 503 detection` (GREEN) — store + banner + api-fetch extension + layout wiring, 190 insertions across 5 files, +5 insertions in the banner test file to match the final dismiss-semantics implementation.

2. **Task 2: Write docs/runbooks/KILL-SWITCH.md + cross-link from SECRET-ROTATION.md**
   - `9ec204b` — `safety-08: add KILL-SWITCH.md runbook + cross-link from SECRET-ROTATION.md` — 218-line new runbook + 1-line SECRET-ROTATION.md cross-link. No code changes; full suite still 340/340.

**Plan metadata:** will be committed alongside this SUMMARY as `docs(02-08): record safety-08 plan execution summary` (convention matching 02-01 / 02-02 / 02-05 SUMMARY commits).

_Per Phase 1 D-20 convention: `safety-08:` for requirement-scoped GREEN commits, `test(02-08):` for the RED commit._

## Files Created/Modified

### Created

- `src/lib/degraded-mode-store.ts` (58 lines) — zero-dep useSyncExternalStore singleton. Exports `setDegradedMode`, `getDegradedMode`, `subscribeDegradedMode`, `__resetDegradedModeForTests`. Header comment documents D-18/D-19 semantics and the rationale for useSyncExternalStore over Context/Zustand.
- `src/components/DegradedModeBanner.tsx` (88 lines, `"use client"`) — derive-during-render dismiss pattern, `role="status"` a11y, amber ribbon shape matching PilotBanner, SSR snapshot `() => false`.
- `src/lib/__tests__/degraded-mode-store.test.ts` (104 lines) — 6 `it(` blocks covering default-off, transition-emits, multiple-subscribers, idempotent no-op, unsubscribe-cleanup, reset-between-tests.
- `src/components/__tests__/DegradedModeBanner.test.tsx` (59 lines extended to cover final dismiss shape) — 4 `it(` blocks covering store-off→null, store-on→role=status+copy, Dismiss button→hidden, D-18 re-trigger on false→true.
- `docs/runbooks/KILL-SWITCH.md` (218 lines) — full PATTERNS §8 runbook.

### Modified

- `src/lib/api-fetch.ts` — 26-line addition: new import of `setDegradedMode` from `./degraded-mode-store`, new 503+paid_disabled detection block after the 401 retry and before the final return. Existing logic unchanged.
- `src/lib/__tests__/api-fetch.test.ts` — 146 lines added to cover the new SAFETY-08 branch (vi.mock the store, assert setDegradedMode called/not called per status+body). Pre-existing 7 api-fetch tests preserved.
- `src/app/layout.tsx` — 2 lines: one import, one JSX insertion next to `<PilotBanner />`.
- `docs/runbooks/SECRET-ROTATION.md` — 1 line added to the See-also section pointing at KILL-SWITCH.md.

## Decisions Made

See frontmatter `key-decisions`. In short:

1. **useSyncExternalStore singleton over Context/Zustand.** React 19 primitive, zero-dep, exactly one writer + many readers, no provider wrapping, no runtime bundle cost. PATTERNS §Suggestion 3(a) realized.
2. **Derive-during-render dismiss pattern for D-18 re-trigger.** Avoids useEffect+setState cascading render flagged by react-hooks linter. `dismissedAt` resets during render when `on === false`, so the next false→true store transition re-opens the banner automatically.
3. **SSR snapshot `() => false`.** Guarantees no banner on first server-rendered HTML — no hydration flicker.
4. **503 detection appended AFTER the 401 retry in api-fetch.ts.** Ensures the retry's final resolved response is what's inspected for paid_disabled; prevents false-positive degraded-mode UX on concurrent 401+503 conditions.
5. **Exact string match on `body.error === "paid_disabled"`.** Generic 503s (HTML body, different error code, missing error field) do NOT flip the flag. Protects the banner from training Past Masters to ignore it on unrelated upstream provider outages.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Correctness] Dismiss semantics via derive-during-render (not useEffect+setState)**

- **Found during:** Task 1 GREEN implementation + banner test execution.
- **Issue:** The plan's suggested banner code (`<action>` section) used a simple `useState(false)` for dismissal. That would hide the banner on Dismiss click BUT would not re-open on a subsequent false→true store transition (because `dismissed` never resets). D-18 requires the banner reappear on any subsequent paid_disabled response. The naive fix (useEffect listening for store transition and calling setDismissed(false)) triggers the react-hooks/set-state-in-effect anti-pattern AND the react-hooks lint rule; it also produces an extra render cycle.
- **Fix:** Implemented derive-during-render dismiss: `dismissedAt` is cleared during render when `on === false` (React 19 idiom — safe because setState during render bails out when value is unchanged). This gets D-18 re-trigger behavior without useEffect, without the extra render, and without the lint violation. Header comment documents the pattern for future maintainers.
- **Files modified:** `src/components/DegradedModeBanner.tsx` (+10 lines for the pattern), `src/components/__tests__/DegradedModeBanner.test.tsx` (test-4 re-trigger assertion amended to match the implementation).
- **Verification:** 4/4 banner tests green, including the D-18 re-trigger test. `npm run build` clean (no react-hooks lint warnings on the new component).
- **Committed in:** `053e8a4` (Task 1 GREEN commit; the 5-line extension to the test file is part of the same commit).

### Scope-boundary out-of-scope (not fixed)

- Pre-existing eslint problems in files untouched by this plan — carried over from Plan 05's scope-boundary note (practice/page.tsx, SignInForm.tsx, speech-to-text.ts, storage.ts, tts-cloud.ts, PerformanceTracker.tsx, TTSEngineSelector.tsx, MasonicIcons.tsx, default-voices.ts, voices/page.tsx, RehearsalMode.tsx, Plan 01 banned-emit.ts PII fixture). Not touched by Plan 08.
- `.claude/skills/*` working-tree modifications observed throughout — user's auto-sync claude config workflow. Not staged, not committed under Plan 08. Will sync via SessionEnd hook.

---

**Total deviations:** 1 auto-fixed (Rule 2 — correctness / D-18 re-trigger semantics).
**Impact on plan:** Zero scope creep. The deviation is strictly a more-correct implementation of D-18's requirement than the plan's inline snippet suggested; header comment documents the pattern so a future maintainer doesn't "simplify" it back.

## Issues Encountered

1. **Previous executor session interrupted by usage limit before SUMMARY was written.** All three implementation commits (`c5b4a51`, `053e8a4`, `9ec204b`) landed in the prior session; this continuation session's only work is verification + SUMMARY authorship. Verified via `git log --oneline -5`, `ls` of all created/modified files, `grep` for every acceptance-criterion literal, `npm run test:run` (340/340), and `npm run build` (exits 0).

## User Setup Required

None for Plan 08 runtime behavior itself. The runbook documents operational user-setup for the kill-switch flip — that's a Shannon-during-incident action, not a setup-before-launch action:

- `RITUAL_EMERGENCY_DISABLE_PAID` env var in Vercel production — flip to `"true"` during a cost incident; flip back to `"false"` (or remove entirely) when contained. KILL-SWITCH.md is the muscle-memory recipe. Already documented in `.env.example` + `docs/runbooks/PHASE-2-DEPLOY-CHECKLIST.md` from Plan 02; Plan 08 does not change its provisioning.

Pilot walkthrough note: a Past Master seeing the degraded-mode banner during the invited-pilot window may ask "what does 'Live AI is paused' mean?" — the answer lives in the banner copy itself ("using pre-baked audio and word-diff scoring") and in Shannon's Contact-Shannon escape hatch. No additional UX docs required for the pilot launch.

## Next Phase Readiness

**Ready for Wave 5+ plans to consume:**

- **Plan 03 (Wave 5: SAFETY-03 per-route wiring)** — the 9 paid-route handlers import `applyPaidRouteGuards` from `@/lib/paid-route-guard` and return its 503 response on `kind: "deny"`. Plan 08's api-fetch detection keys off exactly that 503 shape; Plan 03 does not need to know about the client-side detector, the contract is the 503 body.
- **Plan 09 (Wave 6: SAFETY-09 per-route client-token defense)** — orthogonal to Plan 08. No code interaction.
- **Plan 04 (Wave 7: SAFETY-04 cron + Resend + lookup CLI)** — KILL-SWITCH.md's cron-no-retry caveat references Plan 04's cron. If Plan 04 documents cron-failure observability (e.g., "spot-check vercel logs | grep CRON"), the KILL-SWITCH.md caveat's guidance still holds; no cross-plan revision needed.
- **Phase 6 ADMIN-04 (revoked-session UX)** — future admin work that adds a 'revoked' client state can copy Plan 08's useSyncExternalStore pattern exactly (new store module, new banner mounted next to DegradedModeBanner in layout.tsx, api-fetch adds a new detection branch for the revoked-session 401 body shape).

**Concerns / follow-ups (not blockers):**

- **Manual smoke verification pending.** The plan's `<verification>` section calls out a manual smoke: "flip env var on preview deploy; curl paid route; expect 503 + body; flip back." This is the VALIDATION Manual-Only task — not a release blocker, but Shannon should run it once before the pilot goes live to confirm the runbook recipe is reproducible on the actual Vercel preview environment (not just the unit-test mocks).
- **Banner copy A/B not considered.** The soft copy "Live AI is paused — using pre-baked audio and word-diff scoring. Contact Shannon for questions." is final per D-18 but has never been seen by a Past Master in a real degraded session. If pilot feedback surfaces confusion about the copy, the banner is a one-line edit in `DegradedModeBanner.tsx`; trivial to iterate.
- **`.claude/skills/gstack/*` untracked/modified files remain in the working tree.** Same pattern noted in Plan 01 / 02 / 05 SUMMARYs — the user's auto-sync config workflow. Not staged, not committed under Plan 08.

## Self-Check: PASSED

All claimed files verified present via Read tool; all 3 commit hashes verified via `git log --oneline`:

- `c5b4a51` — RED commit exists (309 insertions across 3 test files).
- `053e8a4` — GREEN Task 1 commit exists (190 insertions across 5 files: store, banner, api-fetch, layout, banner test).
- `9ec204b` — Task 2 commit exists (219 insertions: KILL-SWITCH.md + SECRET-ROTATION.md cross-link).

All plan must_haves verified:

- `DegradedModeBanner` renders soft copy "Live AI is paused — using pre-baked audio and word-diff scoring" — grep of literal confirmed in `DegradedModeBanner.tsx`.
- `api-fetch.ts` detects 503 + `error: 'paid_disabled'` — grep of `"paid_disabled"`, `setDegradedMode`, `resp.status === 503` confirmed.
- useSyncExternalStore singleton per PATTERNS §Suggestion 3(a) — confirmed in store + banner file headers.
- Dismissable per-session + re-opens on subsequent paid_disabled response (D-18) — implemented via derive-during-render; test 4 in `DegradedModeBanner.test.tsx` asserts this behavior.
- Kill-switch activation already in Plan 02's paid-route-guard; Plan 08 adds ONLY client detection + UX + runbook — confirmed; paid-route-guard unchanged in this plan.
- `docs/runbooks/KILL-SWITCH.md` exists with flip + verify + flip-back + Hobby-plan caveat + cold-start caveat + cron-no-retry caveat — all 10 required sections present (TL;DR, What, Prerequisites, Flip, Verify, User experience, Flip back, Known caveats, Troubleshooting, See also), all 4 caveats present (Hobby / rate-limit cold-start / cron no-retry / spend-tally warm-container bonus), all required literals grep-confirmed.
- `docs/runbooks/SECRET-ROTATION.md` has See-also link to KILL-SWITCH.md — grep-confirmed at line 229.

All plan artifact paths/contains checks:

- `src/components/DegradedModeBanner.tsx` contains "Live AI is paused" — grep confirmed.
- `src/lib/degraded-mode-store.ts` contains "useSyncExternalStore" reference (in header docblock) — grep confirmed; actual primitive is called from the banner component which imports from this store.
- `docs/runbooks/KILL-SWITCH.md` contains "RITUAL_EMERGENCY_DISABLE_PAID" — grep confirmed (20+ occurrences).

All plan key_links verified:

- `DegradedModeBanner.tsx` imports from `@/lib/degraded-mode-store` — grep confirmed.
- `api-fetch.ts` imports `setDegradedMode` from `./degraded-mode-store` — grep confirmed.
- `layout.tsx` imports + mounts `<DegradedModeBanner />` next to `<PilotBanner />` — grep confirmed (line 6 import, line 46 JSX).

Automation:

- `npm run test:run` — 340/340 passed in 9.36s.
- `npm run build` — "Compiled successfully in 6.7s" + "Generating static pages using 3 workers (27/27) in 370ms"; exits 0.

---
*Phase: 02-safety-floor*
*Completed: 2026-04-21*
