---
phase: 02-safety-floor
plan: 09
subsystem: testing
tags: [defense-in-depth, middleware-bypass, route-level-verify, regression, vitest, safety-09]

# Dependency graph
requires:
  - phase: 02-safety-floor (Plan 05)
    provides: "paid-route-guard.ts extension with route-level `verifyClientToken` (D-14 defense-in-depth). Plan 09 authors the regression tests that prove this route-level re-verification fires when middleware is hypothetically bypassed. Also provides signClientToken/signSessionToken helpers for token-minting in the tests."
  - phase: 02-safety-floor (Plan 03)
    provides: "applyPaidRouteGuards wired into all 9 paid route handlers (7 TTS + transcribe + rehearsal-feedback). Plan 09 tests invoke POST() directly to prove the guard runs even when middleware never does."
  - phase: 01-pre-invite-hygiene
    provides: "middleware.test.ts HYGIENE-06 .mram regression harness (re-anchored here for T-2-05 visibility). D-11 test-file convention (src/**/__tests__/). D-20 commit convention (safety-NN: imperative)."
provides:
  - "src/app/api/tts/gemini/__tests__/defense-in-depth.test.ts — 4 it() blocks. Asserts the JSON-body paid route rejects direct POST() invocation without a valid Bearer (401 + `{error:'client_token_invalid'}`) for no-header / invalid-Bearer / cross-audience cases; passes the guard when a valid client-token is presented. Upstream Gemini SSE mocked."
  - "src/app/api/transcribe/__tests__/defense-in-depth.test.ts — 4 it() blocks. Same four assertions for the formData-body route shape. Upstream Groq Whisper mocked."
  - "src/app/api/rehearsal-feedback/__tests__/defense-in-depth.test.ts — 4 it() blocks. Same four assertions for the streaming-JSON route shape. Upstream Groq Llama SSE mocked."
  - "src/__tests__/middleware.test.ts — extended with a 6-test `SAFETY-09 defense-in-depth middleware regressions` describe. Adds the BOTH-required (shared-secret + client-token) layered-auth assertion, a symmetric wrong-shared-secret case, the Bearer-carve-out preservation for /api/auth/client-token, Authorization-in-CORS-preflight check, and a belt-and-suspenders re-anchor of the Phase 1 HYGIENE-06 .mram matcher regression inside the SAFETY-09 boundary."
affects: [phase-3-authoring, phase-5-coach, phase-6-admin, safety-v2-future]

# Tech tracking
tech-stack:
  added: []  # no new runtime/dev dependencies
  patterns:
    - "Direct POST() invocation as middleware-bypass simulation: calling the route handler function directly (as unit tests naturally do) skips Next.js middleware entirely. This is the test shape that proves route-level `applyPaidRouteGuards` is the last line of defense against any future matcher regression or server-action path that fails to invoke middleware."
    - "Four-assertion defense-in-depth contract per paid route: (no-auth → 401 client_token_invalid) + (invalid-Bearer → 401) + (cross-audience-token → 401) + (valid-Bearer → not-401). This quartet is what SAFETY-09 means in practice — any one failing assertion is a perimeter breach."
    - "Cross-audience assertion uses signSessionToken (aud='pilot-session') presented as a client-token Bearer — the jose jwtVerify audience-claim rejection is the invariant being regression-tested."
    - "SAFETY-09 describe in middleware.test.ts documents the full D-14 ladder (both-required / carve-out / CORS preflight / matcher regression) so the threat register (T-2-04, T-2-05, T-2-24) has a single visibility anchor. The regression can't silently regress because the describe block is the audit trail."

key-files:
  created:
    - src/app/api/tts/gemini/__tests__/defense-in-depth.test.ts
    - src/app/api/transcribe/__tests__/defense-in-depth.test.ts
    - src/app/api/rehearsal-feedback/__tests__/defense-in-depth.test.ts
  modified:
    - src/__tests__/middleware.test.ts

key-decisions:
  - "Test-only landing (no new production code). SAFETY-09's actual implementation is already in `src/lib/paid-route-guard.ts` (Plan 05 extension) and wired into all 9 paid routes (Plan 03). Plan 09 is the TDD RED-AND-GREEN-in-one-commit pattern per Plan 02's precedent for test-only additions: all 12 new route tests + 6 new middleware tests pass immediately because the invariant they guard already holds in production. The value is the REGRESSION seal: any future refactor that drops verifyClientToken from the guard, or removes the guard from a paid route, trips these tests at PR time."
  - "Added one symmetric ladder assertion not strictly in the plan: 'client-token present but shared-secret wrong → 401 Unauthorized' (the reverse of the plan's 'shared-secret present but client-token absent' case). Covers the belt-and-suspenders semantics fully — neither layer alone is sufficient. Marked as Rule 2 (security correctness) rather than scope creep."
  - "HYGIENE-06 .mram regression assertion re-anchored inside the SAFETY-09 describe as a belt-and-suspenders test (alongside the original describe at the top of the file). A future editor who refactors the HYGIENE-06 describe block away would still trip the SAFETY-09 describe's assertion — double anchor for the T-2-05 threat-register mitigation."
  - "tts/engines is NOT covered by a defense-in-depth test in this plan. Plan 09 scope spec is explicitly 'the three representative paid routes (tts/gemini, transcribe, rehearsal-feedback)'. engines is a GET dispatcher with zero upstream spend (Plan 03 Deviation 1 documented the option-b choice). It runs through applyPaidRouteGuards identically, so the invariant is transitive; adding a fourth test file would add no new shape coverage."

patterns-established:
  - "Defense-in-depth regression test shape: `// @vitest-environment node` pragma + direct `POST(new NextRequest(...))` invocation + four fixed assertions (no-auth / invalid / cross-audience / valid) per paid-route shape. Any future paid route added to the `PaidRouteName` union should ship with this same four-test-file pattern so the SAFETY-09 invariant expands with the surface."
  - "Cross-audience Bearer test idiom: mint a session token via `signSessionToken(email)` and present it in `Authorization: Bearer <token>` to exercise jose's audience-claim rejection. This idiom is the minimum test that proves the three JWT audiences (`pilot-magic-link`, `pilot-session`, `client-token`) are non-interchangeable at the route level."
  - "SAFETY-09 describe block as threat-register anchor: when a threat model references a mitigation (T-2-04, T-2-05, T-2-24), the test file has a describe block named after the threat ID. Future threat-model entries copy this shape — the describe block is the auditable regression guard."

requirements-completed: [SAFETY-09]

# Metrics
duration: ~5min
completed: 2026-04-21
---

# Phase 2 Plan 09: Defense-in-depth regression tests for paid-route perimeter

**12 route-level tests (gemini/transcribe/feedback × 4 assertions each) + 6 new middleware tests prove that the D-14 two-layer perimeter holds: even with middleware hypothetically bypassed, each paid route's own `applyPaidRouteGuards → verifyClientToken` call returns 401 `{error:"client_token_invalid"}` on missing, invalid, or cross-audience Bearers. SAFETY-09's role in the Phase 2 ladder is the regression seal — any future matcher regression or server-action path that skips middleware cannot silently expose a paid route, because these tests trip at PR time.**

## Performance

- **Duration:** ~5 min (PLAN_START 2026-04-21T18:31:38Z → last commit 2026-04-21T18:36:14Z plus this SUMMARY)
- **Started:** 2026-04-21T18:31:38Z
- **Completed:** 2026-04-21T18:36:14Z
- **Tasks:** 2 (both test-only per Plan 02 precedent)
- **Files created:** 3 (one `defense-in-depth.test.ts` per representative paid-route shape)
- **Files modified:** 1 (`src/__tests__/middleware.test.ts`)
- **Commits:** 2 (both `safety-09:`)
- **Test suite:** 368/368 green (+18 new vs 350 baseline from Plan 03 — 12 route DIDs + 6 new middleware SAFETY-09 regressions)

## Accomplishments

- **Three representative paid-route shapes now carry defense-in-depth regression tests.** The TTS JSON shape (gemini), the formData shape (transcribe), and the streaming-JSON shape with a burst counter (rehearsal-feedback) each get a `defense-in-depth.test.ts` with four assertions: (1) no Authorization → 401 `client_token_invalid`; (2) invalid Bearer (random 32-char garbage) → 401 `client_token_invalid`; (3) cross-audience token (session-token presented as Bearer) → 401 `client_token_invalid`; (4) valid client-token Bearer → NOT 401 (guard passes to the rate-limit / upstream path). Upstream providers (Gemini SSE / Groq Whisper / Groq Llama SSE) are mocked in the valid-Bearer case via `vi.spyOn(globalThis, "fetch")` so no real-provider traffic occurs. Each test uses `signClientToken` + `signSessionToken` from `@/lib/auth` (the same helpers Plan 05 shipped) for token minting.

- **Middleware test suite extended with a SAFETY-09 defense-in-depth ladder describe (6 new tests).** The existing "client-token gate (SAFETY-05 / SAFETY-09)" describe already covered the single-shot Bearer-required / cross-audience / bootstrap-carve-out / CORS-preflight cases. Plan 09's new `SAFETY-09 defense-in-depth middleware regressions` describe adds: (a) `/api/tts/gemini` with valid `X-Client-Secret` but NO Bearer → 401 `client_token_invalid` (shared-secret alone is never sufficient — the D-14 layered-auth invariant made explicit); (b) `/api/tts/gemini` with valid Bearer but WRONG shared-secret → 401 `Unauthorized` (the symmetric case, proves shared-secret gate fires before the Bearer gate); (c) BOTH valid → passes the ladder; (d) bootstrap carve-out preserved; (e) CORS preflight exposes `Authorization`; (f) Phase 1 HYGIENE-06 `.mram` matcher exclusion re-anchored inside SAFETY-09 for threat-register T-2-05 visibility.

- **Threat register T-2-04 (middleware-bypass), T-2-05 (matcher regression), T-2-24 (cross-audience token replay) now have auditable regression anchors.** The plan's `<threat_model>` assigns these three a `mitigate` disposition; before this plan, the mitigation was code-only (in `applyPaidRouteGuards`). After this plan, each mitigation has a named test block (`SAFETY-09 defense-in-depth` describe in three route test files + one middleware describe) so a future refactor that drops the mitigation trips a named regression at PR time. The describe-block name IS the threat ID audit trail.

- **Full test suite: 368/368 green (+18 from 350 baseline at Plan 03).** Build exits 0; `npx eslint` on all new / modified Plan 09 files exits clean. No regression in the 350 pre-existing Phase 2 tests — the SAFETY-09 layer is purely additive.

## Task Commits

Both tasks landed as single `safety-09:` commits (test-only, no RED/GREEN split needed since the implementation shipped in Plans 05 + 03 — Plan 02's Task 1 "test-landing against existing implementation" precedent).

1. **Task 1: defense-in-depth tests for tts/gemini + transcribe + rehearsal-feedback**
   - `8a5a67b` — `safety-09: add defense-in-depth route tests (gemini + transcribe + feedback)` — 404 insertions across 3 new test files. Each file imports the route's `POST` from `../route`, mints Bearers with `signClientToken` / `signSessionToken`, exercises the four defense-in-depth cases, and mocks upstream providers on the valid-Bearer path.

2. **Task 2: middleware test extension with SAFETY-09 regression ladder**
   - `17130c5` — `safety-09: extend middleware test with SAFETY-09 regression ladder` — 167 insertions / 6 deletions (header-doc rewrite + new describe block). Updates the test-file header docblock to document the three-layer invariant (HYGIENE-06 matcher + SAFETY-05 client-token gate + SAFETY-09 ladder) and cross-reference the threat register.

**Plan metadata:** this SUMMARY commit (pending).

_Per Phase 1 D-20 / Phase 2 commit convention: `safety-NN:` for requirement-scoped landing commits. Test-only additions with existing implementation follow Plan 02's precedent (single commit, no separate RED)._

## Files Created/Modified

### Created

- `src/app/api/tts/gemini/__tests__/defense-in-depth.test.ts` (139 lines) — 4 `it()` blocks covering no-auth / invalid-Bearer / cross-audience / valid-Bearer for the TTS JSON shape. Gemini SSE mocked with a minimal PCM chunk on the valid-Bearer path.
- `src/app/api/transcribe/__tests__/defense-in-depth.test.ts` (116 lines) — same 4 assertions for the formData body shape. Groq Whisper mocked with `{text: "mock transcript"}` on the valid-Bearer path. No `content-type` header set in the request so formData can set its own multipart boundary.
- `src/app/api/rehearsal-feedback/__tests__/defense-in-depth.test.ts` (149 lines) — same 4 assertions for the streaming-JSON shape. Groq Llama SSE mocked with one content chunk + `[DONE]` on the valid-Bearer path.

### Modified

- `src/__tests__/middleware.test.ts` — header docblock rewritten (three invariant layers documented); new `SAFETY-09 defense-in-depth middleware regressions` describe appended (6 new `it()` blocks). Existing 12 tests (6 HYGIENE-06 matcher + 6 client-token-gate from Plan 05) preserved unchanged. Total middleware test count: 12 → 18.

## Decisions Made

See frontmatter `key-decisions`. In short:

1. **Test-only landing, no RED/GREEN split.** The SAFETY-09 invariant's production implementation shipped in Plans 05 (middleware + guard extension) and 03 (per-route wiring). Plan 09 is the regression seal on that invariant; tests pass immediately because the invariant holds. Matches Plan 02 Task 1's "test-landing" precedent rather than the Plan 01 / 05 / 08 TDD-RED-then-GREEN pattern.

2. **Added one symmetric ladder assertion not literally in the plan.** Plan Task 2 spec's Test 3 asked for "BOTH shared-secret + valid client-token → pass" — I kept that and added the symmetric inverse "valid Bearer + WRONG shared-secret → 401 Unauthorized" to prove the shared-secret gate fires independently. Both cases together pin the both-required semantics fully (neither layer alone is sufficient in either direction). Logged under Deviations.

3. **HYGIENE-06 `.mram` regression re-anchored inside the SAFETY-09 describe.** The original "middleware matcher — .mram exclusion" describe at the top of the file is preserved verbatim; the SAFETY-09 describe additionally re-asserts `.mram` exclusion as a belt-and-suspenders anchor. A future editor removing the top-level describe would still trip the SAFETY-09 one — two-layer defense for the T-2-05 threat-register mitigation.

4. **tts/engines not covered by a defense-in-depth test.** Plan scope explicitly names "the three representative paid routes (tts/gemini, transcribe, rehearsal-feedback)"; engines is a zero-spend dispatcher (Plan 03 Deviation 1) that runs through `applyPaidRouteGuards` identically to the other TTS routes. Adding a fourth test file would add no new shape coverage — the invariant is transitive across the `PaidRouteName` union because the guard is the single enforcement point.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Security correctness] Added symmetric ladder assertion: valid Bearer + WRONG shared-secret → 401**

- **Found during:** Task 2 test authoring (middleware SAFETY-09 describe block).
- **Issue:** The plan's Task 2 `<behavior>` spec Test 3 asked for "BOTH shared-secret + valid client-token → pass" — but it did NOT include the symmetric inverse (valid Bearer + wrong shared-secret). Shipping only one side of the both-required semantics leaves a gap: a future refactor that reorders the gates (e.g., moves the Bearer check before shared-secret and accidentally weakens shared-secret validation) would pass the plan's Test 3 but leak through the inverse case. The D-14 invariant is fully stated as "neither layer alone is sufficient" — regression tests should cover both directions.
- **Fix:** Added a second `it()` block asserting that a valid `signClientToken(...)` Bearer combined with `x-client-secret: WRONG-SECRET` returns 401 `Unauthorized` (shared-secret gate fires; the Bearer check is never reached because middleware's gate ordering is shared-secret THEN Bearer). This pins the gate-ordering invariant as well as the both-required semantics.
- **Files modified:** `src/__tests__/middleware.test.ts` (one new `it()` block at ~line 242).
- **Verification:** 18/18 middleware tests green. The symmetric assertion passes; body shape `{error:"Unauthorized"}` distinct from `{error:"client_token_invalid"}` confirms the gate ordering is preserved.
- **Committed in:** `17130c5` (Task 2 commit).

### Scope-boundary out-of-scope (not fixed)

- **`.claude/skills/gstack/*` working-tree modifications and untracked files observed throughout execution.** Same pattern noted in Plan 01 / 02 / 03 / 05 / 08 SUMMARYs — the user's auto-sync claude config workflow per `/home/mcleods777/.claude/CLAUDE.md`. Per destructive-git prohibition + scope-boundary rules: did NOT revert, did NOT stage, did NOT commit them under Plan 09. They sync via SessionEnd auto-commit hook.
- **Pre-existing eslint problems in files untouched by this plan** — carried over from Plan 05 / 08 scope-boundary notes. Not touched by Plan 09; no new lint errors introduced by any of the 4 files this plan created / modified.

---

**Total deviations:** 1 auto-fixed (Rule 2 — security correctness / symmetric ladder assertion).
**Impact on plan:** Zero scope creep. The addition strengthens the D-14 invariant's regression coverage without altering the plan's stated intent. Inline test comment documents the symmetry rationale so a future maintainer doesn't "simplify" it back.

## Issues Encountered

1. **No implementation to build.** The SAFETY-09 production code (paid-route-guard's `verifyClientToken` step + per-route `applyPaidRouteGuards` wiring) shipped in Plans 05 and 03. Plan 09 is purely regression-test authorship. Followed Plan 02 Task 1's precedent (single `safety-NN:` commit per task, no TDD RED/GREEN split) rather than fabricating an artificial "make it fail first" loop. The plan's `tdd="true"` flag is best interpreted as "tests-land-first-and-stay-green-as-an-invariant-seal" in this context, not as a pattern that demands temporarily deleting the implementation to produce a RED state.

2. **No other issues.** The guard's body-agnostic design (only reads headers/Bearer) meant all three representative route shapes — JSON (gemini), formData (transcribe), streaming-JSON (rehearsal-feedback) — tested identically for the defense-in-depth assertions, with the only per-shape difference being the upstream-mock shape on the valid-Bearer case. No per-route fork needed. Plan 05's design anticipated this exactly.

## User Setup Required

None — no environment variables, no external services, no dashboard config. All tests use in-process mocks via `vi.spyOn(globalThis, "fetch")` and in-memory state reset via `__resetRateLimitForTests` + `__resetSpendTallyForTests` from `@/lib/rate-limit` + `@/lib/spend-tally`. `JWT_SECRET` is set to a test value in each `beforeEach` and restored in `afterEach` so no shared global state leaks between tests.

## Next Phase Readiness

**Ready for Wave 7+ plans to build on:**

- **Plan 04 (Wave 7: SAFETY-04 cron + Resend + lookup CLI)** — orthogonal to Plan 09. No code interaction. Plan 04's cron handler runs through its own `Bearer ${CRON_SECRET}` auth (not the client-token gate) so SAFETY-09's ladder doesn't apply to it.
- **Plans 06 + 07 (Wave 8: SAFETY-06 client ceiling + SAFETY-07 wake-lock inactivity)** — orthogonal to Plan 09. Those plans touch UI components (RehearsalMode.tsx, screen-wake-lock.ts), not the paid-route perimeter.
- **Phase 5 COACH-02 (rewrite rehearsal-feedback with generateObject)** — Plan 09's defense-in-depth test for rehearsal-feedback will keep tripping at PR time if COACH-02's rewrite accidentally drops the `applyPaidRouteGuards` call. The test's valid-Bearer assertion mocks the upstream generically (`okFeedbackResponse` equivalent), so a future migration from SSE-Groq to `generateObject`-based flow won't break the test — it only asserts the guard fires, not the upstream shape.
- **Phase 6 ADMIN-04 (revoked-session list)** — when stateful revocation lands, Plan 09's test pattern (direct POST + valid-Bearer-passes) extends naturally: a revoked session Bearer would shift to 401 at the guard, and a new test case (`it("rejects revoked-session Bearer → 401")`) would slot into each defense-in-depth.test.ts next to the existing three 401 cases.

**Concerns / follow-ups (not blockers):**

- **tts/engines has no defense-in-depth test** (noted in Decisions). If a future plan elects to add a paid-cost call to engines (unlikely — it's a metadata endpoint by design), a fourth defense-in-depth test file should land alongside that scope change. The `PaidRouteName` union already covers engines, so the guard transitively enforces the invariant; the missing file is regression-coverage, not security.
- **Pre-existing flake in `src/lib/__tests__/auth.test.ts > rejects a tampered token`** — noted in Plan 03 SUMMARY §Concerns. Probabilistic ~1-in-256 random-bit-flip failure unrelated to Plan 09 scope. Separate stability fix.
- **`.claude/skills/gstack/*` uncommitted working-tree state.** Same pattern noted in every Phase 2 SUMMARY. User's auto-sync workflow will resolve at SessionEnd.

## Self-Check: PASSED

All claimed files verified present via `[ -f ... ]`; both commit hashes (`8a5a67b`, `17130c5`) verified via `git log --oneline`. All plan acceptance criteria verified:

### Task 1 acceptance criteria

- Three new test files exist — ✓
- Each contains `client_token_invalid` literal — ✓ (8 occurrences per file)
- Each has ≥ 4 `it(` blocks — ✓ (exactly 4 per file)
- Each imports `POST` from sibling `../route` — ✓ (grep `from "../route"` returns 3)
- Each imports `signClientToken` + `signSessionToken` from `@/lib/auth` — ✓ (grep in each file returns match)
- `npm run test:run -- <all three paths>` exits 0 — ✓ (12/12 green in 605ms)

### Task 2 acceptance criteria

- `src/__tests__/middleware.test.ts` contains `SAFETY-09` literal — ✓ (11 occurrences)
- Tests contain `client_token_invalid` — ✓ (10 occurrences)
- Tests contain `/api/auth/client-token` carve-out — ✓ (5 occurrences)
- Tests contain `access-control-allow-headers` check — ✓ (5 case-insensitive occurrences)
- All middleware tests pass — ✓ (18/18 green)
- HYGIENE-06 `.mram` regression still green — ✓ (6 original matcher tests pass, plus a re-anchor assertion in the SAFETY-09 describe)

### Plan-level `<verification>` block

- `npm run test:run` full suite — ✓ (368/368 green in 9.70s)
- `npm run build` exits 0 — ✓ (Compiled successfully, 27/27 static pages generated)
- `npx eslint` on all new/modified Plan 09 files — ✓ (clean, no new errors; pre-existing errors in unrelated files unchanged)
- All 9 paid routes confirmed to have `applyPaidRouteGuards` call — ✓ (Plan 03 verification still holds; `grep -l "applyPaidRouteGuards" src/app/api/ -r | wc -l` returns 9)
- Phase 1 HYGIENE-06 regression test still passes — ✓ (6 original `.mram` matcher tests green + 1 re-anchor assertion in SAFETY-09 describe green)

### Plan-level `<success_criteria>` block

- Three representative paid-route shapes (TTS JSON / transcribe formData / feedback JSON) have defense-in-depth tests — ✓
- Each test covers no-auth / invalid-Bearer / cross-audience / valid-Bearer — ✓
- Middleware test suite covers full ladder (Bearer on /api/* / carve-out on /api/auth/* / Authorization in CORS preflight / HYGIENE-06 regression) — ✓
- Full Phase 2 test suite green after this plan — ✓ (368/368)

---
*Phase: 02-safety-floor*
*Completed: 2026-04-21*
