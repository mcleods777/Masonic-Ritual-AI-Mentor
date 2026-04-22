---
phase: 02-safety-floor
verified: 2026-04-21T21:15:00Z
status: human_needed
score: 6/6 roadmap SCs verified; 9/9 SAFETY-NN requirements satisfied (code-level)
overrides_applied: 0
re_verification: null
human_verification:
  - test: "Vercel cron actually fires at 02:00 UTC on preview/production"
    expected: "Cron invocation appears in Vercel logs; if thresholds crossed, Resend email arrives within ~1 min"
    why_human: "Vercel cron timing is only observable by waiting for it; no automated way to trigger the scheduler"
  - test: "Resend email arrives in Shannon's inbox (deliverability end-to-end)"
    expected: "Email with top-5 spenders + lookup-CLI pointer + warm-container caveat appears in Shannon's inbox"
    why_human: "Depends on Shannon's email deliverability, DNS, iCloud Private Relay handling"
  - test: "Kill switch end-to-end flip on a preview deploy"
    expected: "After vercel env update RITUAL_EMERGENCY_DISABLE_PAID preview --value true + redeploy, curl any paid route returns 503 + {error:'paid_disabled', fallback:...}; degraded-mode banner appears in the app; flip back restores 200s"
    why_human: "Exercises env-var propagation + redeploy cycle; visual verification of banner"
  - test: "Client-token refresh timer survives tab backgrounding >60 min on Safari"
    expected: "Next paid-route call succeeds after tab backgrounded for >60 min (either proactive refresh fired on visibilitychange, or reactive 401 retry bootstrapped a fresh token)"
    why_human: "Background-tab setTimeout throttling behavior is hard to test in jsdom; documented as Plan 05 known limitation"
  - test: "Magic-link + client-token flow on a real iPhone behind iCloud Private Relay"
    expected: "Signed-in iPhone user can successfully invoke /api/tts/*, /api/transcribe, /api/rehearsal-feedback with Bearer token attached automatically by api-fetch"
    why_human: "Regression guard for HYGIENE-05 UAT pattern; verifies bootstrap works on mobile Safari + Private Relay"
  - test: "scripts/lookup-hashed-user.ts reverse-resolves a real hash from a production alert email"
    expected: "Given a hash from a Resend alert body, LODGE_ALLOWLIST=\"...\" npx tsx scripts/lookup-hashed-user.ts <hash> prints the matched email and exits 0"
    why_human: "Operator-in-the-loop smoke that the runbook's reverse-lookup flow is reproducible end-to-end with real env vars"
  - test: "Session step ceiling halts a real runaway auto-advance"
    expected: "In a live rehearsal, trigger a repeating auto-advance (e.g., force-enable silent mode through ritual end and let it cycle) — after 200 steps, rehearsalState flips to 'complete' and console shows [SAFETY-06] warning"
    why_human: "UI-level behavior; the unit tests cover the pure helpers + render smoke but not the live advance loop"
  - test: "Screen wake-lock releases after 30 min of no real user interaction on a real device"
    expected: "With a phone on the rehearsal rail and no touches for 30 min, screen wake-lock releases; [SAFETY-07] console.info line appears in dev tools"
    why_human: "Long wall-clock wait + real-device wakelock API; unit tests use fake timers"
---

# Phase 2: Safety Floor Verification Report

**Phase Goal:** No invited user can produce a surprise AI bill, no runaway loop can run uncapped overnight, and no compromise of the shared secret alone is sufficient to reach paid routes.

**Verified:** 2026-04-21T21:15:00Z
**Status:** human_needed
**Re-verification:** No — initial verification
**Branch:** `gsd/phase-2-safety-floor`

All 9 plans (02-01..02-09) landed on branch; all claimed artifacts exist; full test suite 395/395 green; `npm run build` exits 0; ESLint PII-guard fixture still trips. Every SAFETY-NN code-level requirement is satisfied and integration-tested at the unit level. Seven items require human UAT — all are environment-side (cron timing, email deliverability, real-device wakelock, env-var propagation) or visual UX that can't be asserted from grep/vitest.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every paid-route call appears in a PII-free structured audit log record `{hashedUser, route, promptHash, completionHash, estimated-cost, latency}` | VERIFIED (code); HUMAN needed for production log observation | `src/lib/audit-log.ts` exports typed `emit(AuditRecord)` (discriminated union TTS/STT/Feedback excludes `prompt|completion|email|text|body` at type level). ESLint `no-restricted-syntax` rule in `eslint.config.mjs` bans the same keys — fixture `src/lib/__tests__/fixtures/banned-emit.ts` trips with canonical error. All 8 spend-incurring paid routes call `emit(...)` inside their POST handlers (verified: 6 TTS + transcribe + feedback); tts/engines is the intentional option-b dispatcher with no upstream spend. Unit tests (audit-log 10, pricing 13, route integration tests 10) assert the record shape + spend-tally forwarding. |
| 2 | Every paid route (`/api/tts/*`, `/api/transcribe`, `/api/rehearsal-feedback`) returns 429 when same hashed user exceeds hourly or daily budget | VERIFIED | All 9 paid routes call `applyPaidRouteGuards(request, {routeName})` at top of POST (grep across `src/app/api/` returns 9 files). Guard enforces 60/hr + 300/day per-user aggregate + 100/hr per-route belt-and-suspenders — returns 429 + `Retry-After` header from first failing bucket. Route-level integration tests exercise the 60→61 deny (`rate-limit.test.ts` 22 tests; `paid-route-guard.test.ts` 13 tests; `tts/gemini/route.test.ts` + `transcribe/route.test.ts` happy-path-plus-429 cases). |
| 3 | A test invoking paid routes with a valid shared secret but no session JWT is rejected at the **route level**, not only in middleware | VERIFIED | `src/lib/paid-route-guard.ts` step 2 calls `verifyClientToken(bearer)` at the route level (independent of middleware). `src/app/api/tts/gemini/__tests__/defense-in-depth.test.ts`, `src/app/api/transcribe/__tests__/defense-in-depth.test.ts`, `src/app/api/rehearsal-feedback/__tests__/defense-in-depth.test.ts` each invoke POST directly (simulates middleware-bypass) and assert 4 cases: no-auth → 401, invalid Bearer → 401, cross-audience token → 401, valid token → passes. 12 defense-in-depth tests green. Middleware test suite adds a `SAFETY-09 defense-in-depth` describe with 6 tests including the symmetric "valid Bearer + wrong shared-secret → 401 Unauthorized" pinning the gate ordering. |
| 4 | When `RITUAL_EMERGENCY_DISABLE_PAID=true` and redeployed, every paid route returns static fallback and pre-baked audio still plays | VERIFIED (code); HUMAN needed for env-var propagation smoke | `paid-route-guard.ts` step 1 performs strict `=== "true"` env compare and returns 503 + per-route body (`{error:"paid_disabled", fallback:"pre-baked"}` for TTS; `fallback:"diff-only"` for feedback; bare `{error:"paid_disabled"}` for transcribe — matches D-17). `api-fetch.ts` detects 503+paid_disabled body and calls `setDegradedMode(true)`. `DegradedModeBanner` subscribes via `useSyncExternalStore` and renders D-18 soft copy. `app/layout.tsx` mounts `<DegradedModeBanner />` next to `<PilotBanner />`. 4 api-fetch tests cover 503+paid_disabled flip vs generic 503 no-op. 4 banner tests cover hidden-when-off, role=status, dismiss, D-18 re-trigger. `docs/runbooks/KILL-SWITCH.md` (218 lines) provides the flip/verify/flip-back playbook. Kill-switch flips BEFORE the client-token gate so operators can cut paid traffic without a valid token. Pre-baked audio fallback: client-side `MRAMLine.audio` (embedded base64 Opus) is played when TTS returns 503 — verified in code via D-17 contract shape, but actual client-side playback transition on a real degraded session is human UAT. |
| 5 | Runaway-loop simulation gets stopped client-side by the session step ceiling, with a server-side 429 belt-and-suspenders | VERIFIED | Client half: `src/components/RehearsalMode.tsx` has module-scope `resolveMaxSessionSteps()` + `checkStepCeiling()` helpers. `advanceInternal` pre-increments `stepCountRef` and on 201 (default 200) flips `cancelledRef` + `setRehearsalState("complete")` + logs `[SAFETY-06]`. Reset on `startRehearsal` + `jumpToLine` only — auto-advance never resets. 7 tests in `rehearsal-mode-ceiling.test.tsx` cover default, trip-at-201, no-reset on auto-advance, env override, malformed-env fallback, helper exports, component boot. Server half: `/api/rehearsal-feedback` uses `rateLimit(`feedback:5min:${hashedUser}`, 300, 5*60*1000)` fired AFTER guard allow and BEFORE upstream fetch — returns 429 `{error:"feedback_burst"}` on 301st call in 5 min. Rehearsal-feedback route test asserts burst counter fires. |
| 6 | Shannon receives a Resend alert email the same day total or per-user spend exceeds a configured threshold | VERIFIED (code); HUMAN needed for real cron timing + email deliverability | `vercel.json` registers `/api/cron/spend-alert` at `0 2 * * *`. `src/app/api/cron/spend-alert/route.ts` GET handler validates `Authorization: Bearer ${CRON_SECRET}` (exact-string compare), reads yesterday UTC day via `readAndClearSpendForDay()`, applies D-04 thresholds (aggregate > $10 OR any user > $3), and fires Resend with `idempotencyKey=spend-alert-${yesterday}` (24h dedup for at-least-once cron). Email body includes top-5 spenders + lookup-CLI pointer + warm-container caveat + kill-switch pointer. Unit tests (cron/spend-alert: 3 auth + 4 alert; spend-tally: 6) cover Bearer-auth, no-send-below-threshold, idempotencyKey, email body shape. Actual 02:00 UTC invocation and email delivery are human UAT. |

**Score:** 6/6 roadmap SCs verified at code level. 7 items carried to human UAT.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/audit-log.ts` | `emit(AuditRecord)` with typed union excluding PII keys | VERIFIED | 85 lines; exports `emit`, `TTSRecord`, `STTRecord`, `FeedbackRecord`, `AuditRecord` union. Synchronous; feeds `incrementSpendTally`. |
| `src/lib/pricing.ts` | 17-entry PRICING_TABLE + estimateCost() | VERIFIED | `grep -c "modelId:" src/lib/pricing.ts` would return ≥17; `pricing.test.ts` asserts `>= 17`. Discriminated-union kinds (`per-input-token`, `per-output-token`, `per-character`, `per-audio-minute`, `per-audio-token`, `self-hosted`). LOW-confidence notes on Mistral + Voxtral preserved. |
| `src/lib/spend-tally.ts` | in-memory UTC-day accumulator | VERIFIED | Exports `incrementSpendTally`, `readAndClearSpendForDay`, `__resetSpendTallyForTests`. 6 unit tests pass. |
| `src/lib/paid-route-guard.ts` | `applyPaidRouteGuards(req, {routeName})` → allow/deny | VERIFIED | 213 lines. Kill-switch → client-token verify → 3 rate-limit buckets, in that order. `PaidRouteName` union has 9 variants matching the 9 paid routes. |
| `src/lib/auth.ts` | +signClientToken / verifyClientToken | VERIFIED | `CLIENT_TOKEN_TTL_SECONDS = 60*60`, `CLIENT_TOKEN_AUDIENCE = "client-token"`, jose HS256 with audience/issuer claims. 9 client-token unit tests cover round-trip + cross-audience rejection + tamper + expiry + wrong-secret + malformed input. |
| `src/lib/api-fetch.ts` | Attach X-Client-Secret + Authorization: Bearer; proactive refresh; 503 detect | VERIFIED | 189 lines. `fetchApi` bootstraps client-token on first call, schedules 50-min refresh, visibilitychange listener, one-shot 401 retry on client_token_expired/invalid, flips setDegradedMode on 503+paid_disabled. 11 tests green. |
| `src/middleware.ts` | Verify Bearer on /api/* (except /api/auth/*) | VERIFIED | Lines 92-114: `isAuthConfigured()` + non-OPTIONS + non-`/api/auth/*` gate calls `verifyClientToken(bearer)` → 401 `client_token_invalid` on failure. Access-Control-Allow-Headers exposes `Authorization`. |
| `src/app/api/auth/client-token/route.ts` | POST endpoint — session cookie + Origin gated | VERIFIED | Origin allowlist + `*.vercel.app` + absent-Origin allowed; session cookie verify via `verifySessionToken`. Returns `{token, expiresIn: 3600}`. 6 route tests cover all 5 gating cases + absent-Origin. |
| `src/app/api/tts/{gemini,elevenlabs,google,deepgram,kokoro,voxtral,engines}/route.ts` | Guard + emit (engines = guard without emit by design) | VERIFIED | 7 routes × `applyPaidRouteGuards`; 6 emit AuditRecords (engines is intentional option-b dispatcher — documented in SUMMARY 02-03 deviation 1 + plan PATTERNS). |
| `src/app/api/transcribe/route.ts` | Guard + STT emit with 10-sec billing floor | VERIFIED | Guard at line 41; `Math.max(estimatedRawDurationMs, 10_000)` honors Groq 10-sec billing minimum; emit at line 117. |
| `src/app/api/rehearsal-feedback/route.ts` | Guard + 5-min burst counter + emit-in-finally | VERIFIED | Guard at line 102; `feedback:5min:${hashedUser}` counter at line 109 (300 calls / 5 min); emit at line 281 in ReadableStream finally. |
| `src/app/api/cron/spend-alert/route.ts` | GET Bearer-auth + read spend-tally + Resend + idempotencyKey | VERIFIED | 123 lines. See SC6 evidence above. |
| `vercel.json` | crons block registering `/api/cron/spend-alert` at `0 2 * * *` | VERIFIED | Minimal schema-pinned JSON; `node -e` parse succeeds. |
| `src/lib/hash-user.ts` | `hashedUserFromEmail` + `findEmailByHashedUser` shared helpers | VERIFIED | 3178-byte module. Plan 05 created with `hashedUserFromEmail`; Plan 04 extended additively with `findEmailByHashedUser`. Hash formula `sha256(email.trim().toLowerCase()).slice(0,16)` is single source of truth for mint-side (client-token route) + lookup-side (CLI). 7 unit tests pass. |
| `scripts/lookup-hashed-user.ts` | Executable reverse-lookup CLI | VERIFIED | `chmod +x`, shebang `#!/usr/bin/env npx tsx`, delegates to `hash-user.ts` helpers. |
| `src/components/RehearsalMode.tsx` | Session step ceiling on advanceInternal | VERIFIED | +38 lines strictly additive (plan required <40). `DEFAULT_MAX_SESSION_STEPS = 200`; env override via `NEXT_PUBLIC_RITUAL_MAX_STEPS` with malformed-fallback-to-200. |
| `src/lib/screen-wake-lock.ts` | 30-min inactivity auto-release | VERIFIED | +60 lines strictly additive (0 deletions). 4 DOM events reset the timer; `desired=false` on release blocks visibilitychange reacquire. |
| `src/components/DegradedModeBanner.tsx` | React banner subscribed to useSyncExternalStore | VERIFIED | 'use client', SSR snapshot `() => false`, derive-during-render dismiss, D-18 soft copy literal present. |
| `src/lib/degraded-mode-store.ts` | Zero-dep useSyncExternalStore singleton | VERIFIED | `setDegradedMode` / `getDegradedMode` / `subscribeDegradedMode` / `__resetDegradedModeForTests`. 6 unit tests pass. |
| `docs/runbooks/KILL-SWITCH.md` | Full runbook with flip/verify/flip-back + caveats | VERIFIED | 218 lines. TL;DR → What → Prereqs → Flip → Verify → User-experience → Flip back → Known caveats (Hobby drift + cold-start + cron no-retry + spend-tally warm-container) → Troubleshooting → See also. SECRET-ROTATION.md cross-links back. |
| `docs/runbooks/PHASE-2-DEPLOY-CHECKLIST.md` | Env-var provisioning + post-deploy smoke | VERIFIED | 78 lines covering CRON_SECRET + SPEND_ALERT_TO atomic provisioning + dashboard smoke. |
| `eslint.config.mjs` | no-restricted-syntax PII guard | VERIFIED | Rule targets `CallExpression[callee.name='emit'] ObjectExpression > Property[key.name=/^(prompt\|completion\|email\|text\|body)$/]`. Fixture `src/lib/__tests__/fixtures/banned-emit.ts` still trips on `npx eslint` invocation. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| Route handler POST | paid-route-guard | `applyPaidRouteGuards(req, {routeName})` destructure | VERIFIED | All 9 paid-route files import from `@/lib/paid-route-guard`; `grep -l "applyPaidRouteGuards" src/app/api/ -r` returns 9. |
| paid-route-guard | audit-log | `emit({...})` at route callsite (not inside guard) | VERIFIED | Guard returns hashedUser; routes emit directly. 6 TTS + transcribe + feedback = 8 emit callsites on successful upstream completion. |
| audit-log `emit()` | spend-tally | Synchronous `incrementSpendTally(hashedUser, cost)` | VERIFIED | Line 83 of audit-log.ts; spend-tally populated on every paid-route success → cron has real data to read. |
| spend-tally | cron spend-alert | `readAndClearSpendForDay(yesterday)` | VERIFIED | Cron route imports and calls the API; 4 alert tests mock the tally to assert end-to-end aggregate vs per-user threshold branching. |
| cron | Resend | `resend.emails.send({...}, {idempotencyKey: "spend-alert-${date}"})` | VERIFIED | Resend v6 options arg; MAGIC_LINK_FROM_EMAIL reused as `from`. |
| Middleware | paid-route-guard | Bearer check at perimeter THEN guard at route level (defense-in-depth) | VERIFIED | Middleware.ts lines 92-114 verify Bearer on /api/*; paid-route-guard step 2 re-verifies at route level. SAFETY-09 defense-in-depth tests (12 route + 6 middleware) pin this invariant. |
| Client (api-fetch) | /api/auth/client-token | POST bootstrap on first fetchApi call | VERIFIED | `/api/auth/client-token` lives under `/api/auth/*` middleware carve-out; api-fetch.ts bootstraps with `credentials: "include"` (no Authorization yet) to break the chicken-and-egg. |
| Client (api-fetch) | degraded-mode-store | `setDegradedMode(true)` on 503 + paid_disabled | VERIFIED | api-fetch.ts lines 168-178. |
| degraded-mode-store | DegradedModeBanner | `useSyncExternalStore(subscribeDegradedMode, getDegradedMode, () => false)` | VERIFIED | Banner.tsx subscribes; layout.tsx mounts `<DegradedModeBanner />` adjacent to `<PilotBanner />`. |
| RehearsalMode | session step ceiling helpers | Module-scope `resolveMaxSessionSteps` + `checkStepCeiling` | VERIFIED | Pre-increment + gate at top of advanceInternal (line 249-258); resets on startRehearsal (230) + jumpToLine (653). |
| RehearsalMode | /api/rehearsal-feedback | Server-side burst counter fires as belt-and-suspenders | VERIFIED | Route line 109 with `feedback:5min:<hashedUser>` key — independent of client ceiling; trips after 300 calls / 5 min regardless of client state. |
| screen-wake-lock | inactivity timer | `attachInactivityListener` (keydown/click/touchstart/pointerdown) + `resetInactivityTimer` with `desired=false` on trip | VERIFIED | keepScreenAwake() calls both; post-release keydown is a provable no-op (early-return on `!desired`). |
| scripts/lookup-hashed-user.ts | LODGE_ALLOWLIST | `findEmailByHashedUser` from shared hash-user.ts module | VERIFIED | CLI delegates to lib helper; mint-side and lookup-side both import `hashedUserFromEmail` from the same module → byte-for-byte agreement by construction. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| paid-route-guard | tokenPayload (hashedUser) | `verifyClientToken(bearer)` → jose jwtVerify → returns `{sub, aud, iss, exp, iat}` or null | Yes — real JWT claims from mint route | FLOWING |
| cron spend-alert | `{aggregate, perUser}` | `readAndClearSpendForDay(yesterday)` — reads day-scoped accumulator populated by every `emit()` call | Yes — populated by real paid-route success events via emit→incrementSpendTally | FLOWING |
| DegradedModeBanner | `on` | `useSyncExternalStore(subscribeDegradedMode, getDegradedMode)` — store flipped by api-fetch on 503+paid_disabled | Yes — real 503 responses from guard kill-switch flip the store | FLOWING |
| RehearsalMode advanceInternal | `stepCountRef.current` | Pre-incremented on each auto-advance entry; reset on startRehearsal + jumpToLine | Yes — real step count of the running rehearsal session | FLOWING |
| screen-wake-lock release | `inactivityTimer` | setTimeout armed on acquire + reset by DOM event listeners | Yes — real DOM event stream drives the timer | FLOWING |
| api-fetch | `clientToken` | Bootstrap POST to /api/auth/client-token returns real signed JWT | Yes — session-cookie-gated mint returns real token | FLOWING |
| Audit emit | `record.estimatedCostUSD` | `estimateCost(modelId, units, unitType)` against real PRICING_TABLE entries; modelId is the actually-served model (Gemini fallback chain respected) | Yes — cost is computed per served model, not first-attempt model | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite passes | `npm run test:run` | 395/395 passed in 10.42s (36 files) | PASS |
| Build compiles with no TS errors | `npm run build` | "✓ Compiled successfully in 6.1s" + 27 static pages generated | PASS |
| ESLint PII-guard fixture trips | `npx eslint src/lib/__tests__/fixtures/banned-emit.ts` | Exits 1 with "Audit records must not carry request/response bodies..." at line 17 col 3 | PASS |
| All 9 paid routes use applyPaidRouteGuards | `grep -l "applyPaidRouteGuards" src/app/api/ -r` | 9 route files + 3 test files | PASS |
| 8 spend-incurring routes emit AuditRecords | `grep -l "emit(" src/app/api/tts/*/route.ts src/app/api/transcribe/route.ts src/app/api/rehearsal-feedback/route.ts` | 8 files (6 TTS + transcribe + feedback; engines excluded per option-b) | PASS |
| vercel.json cron schedule parses | `node -e "require('./vercel.json').crons"` | `[{"path":"/api/cron/spend-alert","schedule":"0 2 * * *"}]` | PASS |
| lookup-hashed-user.ts is executable with shebang | `ls -la scripts/lookup-hashed-user.ts` + `head -1` | `-rwxr-xr-x`, `#!/usr/bin/env npx tsx` | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SAFETY-01 | 02-01 | Structured PII-free audit log records all paid-route calls with {hashedUser, route, promptHash, completionHash, estimated-cost, latency} | SATISFIED | `src/lib/audit-log.ts` + 8 emit() callsites; TS union + ESLint rule; 22 infra unit tests + 10 route integration tests |
| SAFETY-02 | 02-02 | Rate limiter applied to every paid route; userKey (hashed email) with fallback | SATISFIED (architectural note) | paid-route-guard composes `paid:hour:${userKey}` + `paid:day:${userKey}` + `${routeName}:hour:${userKey}` using tokenPayload.sub as userKey. Rate-limit.ts signature unchanged. The original "IP as fallback" per SAFETY-02 req text is architecturally unreachable for paid routes after SAFETY-05 — middleware + guard both require a valid Bearer (with email-derived sub) BEFORE rate-limit consulting. This is a strict improvement: paid routes cannot be hit with an IP-derived key because the Bearer gate returns 401 first. IP-fallback via `getClientIp` remains in use for the magic-link rate-limit. |
| SAFETY-03 | 02-03 | Per-user daily + hourly budget caps; 429 when exceeded | SATISFIED | 60/hr + 300/day + 100/hr-per-route buckets in applyPaidRouteGuards; 429 + Retry-After; integration tests on gemini + transcribe assert 60→61 deny |
| SAFETY-04 | 02-04 | Daily spend-spike Resend cron emails Shannon | SATISFIED (pending human cron + email UAT) | vercel.json cron + /api/cron/spend-alert GET handler + Resend idempotencyKey + spend-tally read-and-clear; 7 cron unit tests |
| SAFETY-05 | 02-05 | Short-lived 1h client-token JWT; api-fetch attaches Bearer; middleware verifies | SATISFIED | signClientToken/verifyClientToken (jose HS256, aud=client-token); POST /api/auth/client-token issues tokens; api-fetch bootstraps + attaches + refreshes; middleware gate verifies on /api/* except /api/auth/*. 22 SAFETY-05-specific tests. |
| SAFETY-06 | 02-06 + 02-03 | Session-level client ceiling + server-side per-session 429 belt-and-suspenders | SATISFIED | Client: 200-step ceiling in RehearsalMode.advanceInternal (env-overridable). Server: `feedback:5min:${hashedUser}` 300/5min counter in /api/rehearsal-feedback returning `{error:"feedback_burst"}`. 7 ceiling tests + 1 burst test. |
| SAFETY-07 | 02-07 | Wake-lock auto-releases after inactivity timeout | SATISFIED | 30-min threshold; keydown/click/touchstart/pointerdown reset; desired=false on release prevents visibilitychange reacquire. 6 tests with vi.useFakeTimers (first in repo). |
| SAFETY-08 | 02-08 | RITUAL_EMERGENCY_DISABLE_PAID flips entire paid surface to static fallback | SATISFIED (pending human env-propagation + visual UAT) | Guard returns 503+structured body per route; api-fetch detects and flips store; banner renders with D-18 copy + Dismiss + re-trigger on subsequent flip; KILL-SWITCH.md runbook covers flip/verify/flip-back. |
| SAFETY-09 | 02-09 + 02-05 | Paid-route handlers verify pilot session JWT directly (not relying solely on middleware) | SATISFIED | paid-route-guard step 2 calls verifyClientToken independently of middleware; 12 route-level defense-in-depth tests (no-auth / invalid / cross-audience / valid) + 6 middleware-level ladder tests (both-required symmetric + carve-out + CORS preflight + HYGIENE-06 re-anchor). |

**Orphaned requirements check:** REQUIREMENTS.md maps SAFETY-01..09 to Phase 2 (9 requirements). Every plan frontmatter declares `requirements-completed: [SAFETY-NN]`. No orphaned requirements; all 9 claimed and satisfied.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none found) | — | — | — | No TODO/FIXME/PLACEHOLDER/"coming soon" in new or modified Phase 2 files. No `return null`/`return []` stub bodies in handler paths. No hardcoded empty props at degraded-banner mount site. No empty onClick handlers. |
| `src/lib/__tests__/fixtures/banned-emit.ts` | 17 | Deliberate PII-guard regression fixture | Info | This is EXPECTED — the file exists to trip the ESLint rule at lint time. Covered in 02-01 SUMMARY as the canonical regression guard. |
| `src/components/RehearsalMode.tsx` | 198 | `'isUserLine' is assigned a value but never used` | Info | Pre-existing per Plan 06 SUMMARY Deviations (confirmed via `git show HEAD~3:...` before plan). Not introduced by Phase 2. Cleanup scheduled for Phase 5 COACH-11 split. |
| `src/lib/__tests__/auth.test.ts` > `rejects a tampered token` | n/a | Probabilistic ~1-in-256 random-bit-flip flake | Info | Pre-existing flake documented in 03, 07, 09 SUMMARYs. Not a Phase 2 regression. Full suite currently green on the verification run. |

### Cross-plan Integration Verification

These are the integration points called out in the verification brief — all confirmed operational:

1. **02-02 paid-route-guard composes with 02-05 client-token + 02-03 route wiring**: Guard step 2 calls verifyClientToken; after Plan 05 the cookie/IP fallback was removed and tokenPayload.sub is the canonical hashedUser. All 9 paid routes consume the guard via 3-line destructure (Plan 03). 12 defense-in-depth tests + 13 guard tests confirm the composed contract holds.
2. **02-01 audit-log + spend-tally feeds 02-04 cron**: `emit()` calls `incrementSpendTally(hashedUser, cost)` synchronously. Cron reads same tally via `readAndClearSpendForDay`. 02-03 is the first plan that calls emit() from runtime code; tally is populated by every paid-route success. Same-instance in-memory caveat documented in KILL-SWITCH.md.
3. **02-09 defense-in-depth tests reinforce 02-02 + 02-05**: Route-level tests invoke POST() directly (middleware-bypass simulation) and prove the guard enforces the invariant independently. Middleware tests add the symmetric "valid Bearer + wrong shared-secret → 401" to pin the gate ordering.
4. **02-08 kill-switch UX composes with 02-02 guard + 02-05 api-fetch**: Guard returns 503+paid_disabled from kill-switch; api-fetch detects and flips store; banner subscribes via useSyncExternalStore. Layout mounts banner. No fake data flowing anywhere — real 503 response drives real banner render.
5. **02-06 client ceiling + 02-03 server burst counter are independent belt-and-suspenders**: Client counter in RehearsalMode; server counter in /api/rehearsal-feedback. Neither depends on the other; either alone stops a runaway.
6. **02-04 CLI + 02-05 mint share a single hash source**: Both import `hashedUserFromEmail` from `src/lib/hash-user.ts` (Plan 05 created minimal; Plan 04 extended additively). Drift is structurally impossible — editing the shared helper would fail the unit tests.

### Human Verification Required

7 items require human UAT. All are environment-side, visual, or real-device:

1. **Vercel cron actually fires at 02:00 UTC** (SAFETY-04) — needs wall-clock wait on preview/production
2. **Resend email delivers to Shannon's inbox** (SAFETY-04) — DNS / deliverability / iCloud Private Relay
3. **Kill-switch end-to-end flip on a preview deploy** (SAFETY-08) — env-var propagation + redeploy + visual banner appearance
4. **Client-token refresh survives tab backgrounding >60 min on Safari** (SAFETY-05) — documented known limitation; reactive 401 retry is the safety net
5. **Magic-link + client-token on a real iPhone behind iCloud Private Relay** — regression analog to HYGIENE-05 UAT; verifies bootstrap works on mobile Safari
6. **`scripts/lookup-hashed-user.ts` reverse-resolves a real alert-email hash** — operator-in-the-loop smoke
7. **Session step ceiling halts a real runaway auto-advance** (SAFETY-06 client) — unit tests cover helpers but not a live advance loop
8. **Screen wake-lock releases after 30 min on a real device** (SAFETY-07) — long wall-clock wait + real wakelock API

### Gaps Summary

**No blocking gaps.** All 9 SAFETY-NN requirements are satisfied at the code level. All 6 ROADMAP Success Criteria are verified or covered by unit/integration tests + runbook evidence. Full test suite 395/395 green. Build green. ESLint PII-guard live.

**Nuances documented (not gaps):**

- **SAFETY-02 IP-fallback architecturally unreachable for paid routes after SAFETY-05.** The requirement text says "IP as fallback"; the current implementation uses tokenPayload.sub (canonical email-hash from the mint) and the Bearer gate rejects unauthenticated traffic at 401 BEFORE rate-limit is consulted. This is a strict improvement over the original IP-fallback design — IP-identified attackers cannot reach the rate-limit keyspace at all. `getClientIp` is preserved and still used by the magic-link rate-limit callsite. If Shannon wants the IP path preserved for paid routes as a fail-open behavior under a future "middleware off" scenario, that's a follow-up ticket, not a Phase 2 gap.
- **tts/engines is guarded but does not emit AuditRecord** (by design — it's a zero-cost metadata dispatcher per Plan 03 Deviation 1). The `grep -l "emit(" src/app/api/tts/*/route.ts | wc -l` returns 6 (not 7), but all 7 TTS routes use `applyPaidRouteGuards`. Documented in Plan 03 SUMMARY.
- **Pre-existing auth.test.ts tampered-token flake** (~1 in 256 cryptographic bit flip) — pre-existing; documented in 03, 07, 09 SUMMARYs. Full suite currently green.
- **`.env.example` entries for `NEXT_PUBLIC_RITUAL_MAX_STEPS`, `RITUAL_EMERGENCY_DISABLE_PAID`, `CRON_SECRET`, `SPEND_ALERT_TO` intentionally deferred per surgical plan scopes**. Documented in Plan 06/08 SUMMARIES. A future "docs: catch up .env.example with Phase 2 vars" commit is tracked as a non-blocking follow-up.

**Overall verdict:** Phase 2 is CODE-COMPLETE. 8 items carried to human UAT — none block further development, but all should close before the invited-lodge launch. Shannon (or an invited pilot Past Master) should walk through the degraded-mode UX, the kill-switch runbook, and a real 30-min-idle wake-lock release on a real device. Cron + Resend should be validated on the preview deployment before production.

---

*Verified: 2026-04-21T21:15:00Z*
*Verifier: Claude (sonnet, gsd-verifier)*
