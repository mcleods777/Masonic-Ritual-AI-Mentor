---
phase: 2
slug: safety-floor
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-21
---

# Phase 2 — Validation Strategy

> Per-phase validation contract. Phase 2 is test-heavy relative to Phase 1 — every new module and every new behavior gets an automated test. Only manual surface is a cron smoke test (curl against preview with CRON_SECRET).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.2 |
| **Config file** | `vitest.config.ts` (existing, unchanged) |
| **Quick run command** | `npm run test:run` |
| **Full suite command** | `npm run test:run` |
| **ESLint command** | `npx eslint .` — required gate after D-10 PII rule lands |
| **Estimated runtime** | ~10-15 seconds (vitest) + ~5-10 seconds (eslint) |

---

## Sampling Rate

- **After every task commit:** `npm run test:run` (full suite — vitest is fast enough)
- **After every plan merge:** `npm run build && npm run test:run && npx eslint .` all green
- **Before verification:** same, plus manual cron smoke test on preview deploy (see Manual-Only below)
- **Max feedback latency:** ~30 seconds combined (vitest + eslint)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | SAFETY-01 | T-2-01 (PII in logs) | `emit(AuditRecord)` writes `[AUDIT] {json}` to stdout; union types prevent body keys | unit | `npm run test:run -- src/lib/__tests__/audit-log.test.ts` | ❌ W0 | ⬜ |
| 2-01-02 | 01 | 1 | SAFETY-01 | T-2-01 | ESLint rule fires on banned-key object literal passed to `emit()` | lint fixture | `npx eslint src/lib/__tests__/fixtures/banned-emit.ts` → expect failure | ❌ W0 | ⬜ |
| 2-01-03 | 01 | 1 | SAFETY-01 | T-2-01 | `src/lib/pricing.ts` lookup returns known price per model-id; unknown returns 0 + warning | unit | `npm run test:run -- src/lib/__tests__/pricing.test.ts` | ❌ W0 | ⬜ |
| 2-02-01 | 02 | 2 | SAFETY-02 | T-2-02 (surprise bill) | `rateLimit('paid:hour:${userKey}', 60, 3_600_000)` allows 60 then rejects; IP fallback when no userKey | unit | `npm run test:run -- src/lib/__tests__/rate-limit.test.ts` | ❌ W0 (new or extend) | ⬜ |
| 2-02-02 | 02 | 2 | SAFETY-02, SAFETY-03 | T-2-02 | `/api/tts/gemini` returns 429 after 60th call in 1h window | route unit | `npm run test:run -- src/app/api/tts/gemini/__tests__/rate-limit.test.ts` | ❌ W0 | ⬜ |
| 2-02-03 | 02 | 2 | SAFETY-03 | T-2-02 | Daily cap enforced: `/api/transcribe` returns 429 after 300th call in 24h | route unit | covered in transcribe `__tests__/` | ❌ W0 | ⬜ |
| 2-05-01 | 05 | 3 | SAFETY-05 | T-2-03 (leaked-secret replay) | `signClientToken(userKey)` round-trips via `verifyClientToken`; wrong audience returns null | unit | `npm run test:run -- src/lib/__tests__/client-token.test.ts` | ❌ W0 | ⬜ |
| 2-05-02 | 05 | 3 | SAFETY-05 | T-2-03 | `POST /api/auth/client-token` issues token only when session cookie valid + same-origin | route unit | `npm run test:run -- src/app/api/auth/client-token/__tests__/` | ❌ W0 | ⬜ |
| 2-09-01 | 09 | 4 | SAFETY-09 | T-2-04 (middleware bypass) | Paid route returns 401 when middleware would pass but no Bearer present (direct route invocation) | route unit | per-route `__tests__/` | ❌ W0 | ⬜ |
| 2-09-02 | 09 | 4 | MIDDLEWARE (regression) | T-2-05 | Middleware still excludes `.mram` (Phase 1 HYGIENE-06 invariant) + NEW: verifies Bearer on `/api/*` | unit | extend `src/__tests__/middleware.test.ts` | ✅ Extend | ⬜ |
| 2-08-01 | 08 | 4 | SAFETY-08 | T-2-06 (runaway cost) | Paid route returns 503 + `{error: 'paid_disabled', fallback: ...}` when `RITUAL_EMERGENCY_DISABLE_PAID=true` | route unit | per-route `__tests__/` + one env-var unit | ❌ W0 | ⬜ |
| 2-08-02 | 08 | 4 | SAFETY-08 | — | Client flips `degradedMode` state on 503 + `paid_disabled`; banner renders | component unit | `npm run test:run -- src/components/__tests__/DegradedModeBanner.test.tsx` | ❌ W0 | ⬜ |
| 2-04-01 | 04 | 5 | SAFETY-04 | T-2-07 (unauth cron) | Cron `GET` returns 401 when `Authorization: Bearer ${CRON_SECRET}` missing/wrong | route unit | `npm run test:run -- src/app/api/cron/spend-alert/__tests__/auth.test.ts` | ❌ W0 | ⬜ |
| 2-04-02 | 04 | 5 | SAFETY-04 | — | Cron calls `resend.emails.send` with idempotencyKey when spend-tally exceeds thresholds | route unit (mocked Resend) | `npm run test:run -- src/app/api/cron/spend-alert/__tests__/alert.test.ts` | ❌ W0 | ⬜ |
| 2-04-03 | 04 | 5 | SAFETY-04 | — | `spend-tally.ts` accumulates per-user + aggregate correctly; clears day bucket on read-and-clear | unit | `npm run test:run -- src/lib/__tests__/spend-tally.test.ts` | ❌ W0 | ⬜ |
| 2-04-04 | 04 | 5 | SAFETY-04 | — | `scripts/lookup-hashed-user.ts` reverse-resolves a given hash from `LODGE_ALLOWLIST` | script unit | `npm run test:run -- scripts/__tests__/lookup-hashed-user.test.ts` or thin inline | ❌ W0 | ⬜ |
| 2-06-01 | 06 | 6 | SAFETY-06 | T-2-06 | `RehearsalMode` stops auto-advance after 200 steps | component unit (jsdom + fake timers) | `npm run test:run -- src/components/__tests__/rehearsal-mode-ceiling.test.tsx` | ❌ W0 | ⬜ |
| 2-06-02 | 06 | 6 | SAFETY-06 | T-2-06 | `/api/rehearsal-feedback` returns 429 after 300 calls in 5-min per hashed-user | route unit | rehearsal-feedback `__tests__/` | ❌ W0 | ⬜ |
| 2-07-01 | 07 | 6 | SAFETY-07 | — (low-risk) | `keepScreenAwake` releases wake lock after 30 min no interaction (fake timers) | unit | `npm run test:run -- src/lib/__tests__/screen-wake-lock.test.ts` | ❌ W0 | ⬜ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Sampling continuity:** 19 automated tasks, 0 consecutive manual tasks. Far more rigorous than Phase 1 — Nyquist target trivially met.

---

## Wave 0 Requirements

Before any task in Phase 2 lands, these scaffolding items must exist or be created as part of the first plan of the first wave. No separate "Wave 0" plan — each creating plan includes its own fixture/stub setup:

- [ ] `src/lib/__tests__/audit-log.test.ts` (created by SAFETY-01 plan)
- [ ] `src/lib/__tests__/rate-limit.test.ts` — may exist; if not, SAFETY-02 plan creates it
- [ ] `src/lib/__tests__/client-token.test.ts` OR extension of `src/lib/__tests__/auth.test.ts` (SAFETY-05 plan)
- [ ] `src/lib/__tests__/pricing.test.ts` (SAFETY-01 plan, small)
- [ ] `src/lib/__tests__/spend-tally.test.ts` (SAFETY-04 plan)
- [ ] `src/lib/__tests__/screen-wake-lock.test.ts` (SAFETY-07 plan)
- [ ] `src/lib/__tests__/fixtures/banned-emit.ts` — ESLint fixture file (SAFETY-01 plan)
- [ ] `src/app/api/cron/spend-alert/__tests__/` — new dir (SAFETY-04 plan)
- [ ] `src/app/api/auth/client-token/__tests__/` — new dir (SAFETY-05 plan)
- [ ] `src/app/api/tts/gemini/__tests__/` — new dir (SAFETY-02/03/08/09 plans)
- [ ] `src/app/api/rehearsal-feedback/__tests__/` — new dir (SAFETY-06/08/09 plans)
- [ ] `src/app/api/transcribe/__tests__/` — new dir (SAFETY-03/08/09 plans)
- [ ] `src/components/__tests__/rehearsal-mode-ceiling.test.tsx` (SAFETY-06 plan)
- [ ] `src/components/__tests__/DegradedModeBanner.test.tsx` (SAFETY-08 plan)

Framework install: none required. vitest 4.1.2 + jsdom 29.0.1 already present.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Vercel cron actually fires at 02:00 UTC on preview | SAFETY-04 | Vercel cron timing only observable by waiting for it; no automated way to "trigger" the scheduler from code | After Phase 2 merges to preview, wait for next 02:00 UTC window; confirm cron invocation appears in Vercel logs; confirm Resend email arrives (or absence of email if spend < threshold — both are valid outcomes) |
| Resend email arrival in Shannon's inbox | SAFETY-04 | Depends on Shannon's email deliverability, DNS, Private Relay handling | During cron smoke test, confirm email arrives within ~1 min of cron fire |
| Kill switch end-to-end flip on preview | SAFETY-08 | Exercises env-var propagation + redeploy cycle | `vercel env update RITUAL_EMERGENCY_DISABLE_PAID preview --value true --yes`; redeploy; `curl -H ...` any paid route; expect 503; flip back |
| Client-token refresh timer survives tab backgrounding | SAFETY-05 | Hard to test in jsdom reliably; document as known limitation | Open preview in Safari, leave tab backgrounded >60 min, resume, confirm next API call succeeds (no 401 from expired token) |

*Manual verifications tracked in `02-VERIFICATION.md` during execution.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify (19/19) or documented manual path (4/4)
- [x] Sampling continuity: no 3 consecutive manual tasks (Phase 2 is 19 automated in a row)
- [x] Wave 0 covers all MISSING references (each creating plan includes its own fixtures)
- [x] No watch-mode flags in gate commands
- [x] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter — flipped to `true` after all 19 automated tests pass + 4 manual smoke tests complete
- [ ] `wave_0_complete: true` — flipped after all W0 test/fixture files are created during execution

**Approval:** pending — will flip to `nyquist_compliant: true` when Phase 2 executes and all test files land green.
