---
phase: 1
slug: pre-invite-hygiene
status: in_progress
created: 2026-04-21
---

# Phase 1 Verification Log

One evidence entry per HYGIENE-XX as each plan completes. Entries are append-only during phase execution.

---

## HYGIENE-03 — App-wide noindex + landing meta

**Plan:** 01-03-noindex-PLAN.md
**Commit:** 2135496
**Status:** ✓ CODE LANDED (automated); preview-deploy curl check pending Phase 1 close gate

Evidence:
- `next.config.ts` line 35: `{ key: "X-Robots-Tag", value: "noindex, nofollow" },` appended to `SECURITY_HEADERS` array
- `public/landing.html` line 6: `<meta name="robots" content="noindex, nofollow">` inserted in `<head>`
- `npm run build` exit 0 (Plan 01 verification)
- `npm run test:run` exit 0, 251/251 suite green (Plan 01 verification)

Manual verification deferred to Phase 1 close gate: `curl -I https://<preview>.vercel.app/` must return `x-robots-tag: noindex, nofollow` header.

---

## HYGIENE-06 — Middleware matcher regression test

**Plan:** 01-06-matcher-test-PLAN.md
**Commit:** 9cfbb3a
**Status:** ✓ VERIFIED

Evidence:
- `src/__tests__/middleware.test.ts` created (54 lines, 6 assertions)
- Asserts `.mram` paths NOT matched: `/foo.mram`, `/deeply/nested/path/ritual.mram`, `/ea-degree.mram`, `/hyphen-name.mram`
- Positive-match sanity case included (non-.mram path SHOULD match)
- `npm run test:run src/__tests__/middleware.test.ts` exit 0 — 6/6 assertions green
- Full suite: 257/257 tests passing (was 251, +6 new from this file)

---

## HYGIENE-04 — Landing.html ritual-text audit

**Plan:** 01-04-landing-audit-PLAN.md
**Commit:** (this plan's hygiene-04 commit)
**Status:** ✓ VERIFIED — audit clean, zero redactions required

Evidence:
- Automated grep sweep (4 patterns) against `public/landing.html` (623 lines): **zero matches**
  - Pattern 1 — officer role codes and titles: 0 hits
  - Pattern 2 — obligation/work vocabulary: 0 hits
  - Pattern 3 — cipher-style punctuation: 0 hits (all semicolons are CSS)
  - Pattern 4 — working-specific title phrases: 0 hits
- Positive control — `MASONIC`: 3 hits (heading, fallback, JS constant); broader Masonic marketing vocabulary: 16 hits (all in CTA, paragraph copy, and canvas graphic comments — no ritual mechanics); degree-family lexicon (EA/FC/MM terminology): 0 hits
- Shannon performed human sign-off 2026-04-21; no redactions requested
- `public/landing.html` content summary: 3D canvas with heading "MASONIC RITUAL MENTOR", CTA "ENTER THE LODGE", four marketing paragraphs, pillar graphics labeled J (Jachin) and B (Boaz) — all marketing-safe Masonic vocabulary, no ritual text

---

## HYGIENE-07 — Shared-secret rotation runbook

**Plan:** 01-07-rotation-runbook-PLAN.md
**Commit:** 66b4d93
**Status:** ⏸ RUNBOOK LANDED; REHEARSAL DEFERRED to Phase 1 close gate

Evidence:
- `docs/runbooks/SECRET-ROTATION.md` created (new folder `docs/runbooks/`, 234 lines)
- Covers rotation of both `RITUAL_CLIENT_SECRET` and `JWT_SECRET` per CONTEXT D-01
- Production path uses atomic `vercel env update` per D-05b (no window-of-unset)
- Preview-branch path documents the CLI v51.x limitation that forces rm+add, explicit window-of-unset warning, and Shannon-only-rehearsal mitigation (per checker revision)
- JWT session-invalidation side effect (D-02) called out as expected behavior, not a bug
- Install check, rollback section, trailing-newline + preview-branch-arg footguns all documented
- Structure matches `docs/BAKE-WORKFLOW.md` analog per PATTERNS.md §2
- `npm run build` exit 0, `npm run test:run` 257/257 (docs-only change, no source impact)

**Rehearsal status (per D-04):** ⏸ DEFERRED — Shannon chose on 2026-04-21 to defer the end-to-end Vercel preview rehearsal. The runbook exists and is accurate to the best of pre-rehearsal knowledge, but has not been executed against a live preview deploy. **Phase 1 done-gate requires this rehearsal before inviting outside lodges** — it is open work, not closed.

Rehearsal checklist (to complete before Phase 1 close):
- [ ] Vercel CLI installed and authenticated on Shannon's machine
- [ ] Create rehearsal branch, push, observe preview URL
- [ ] Run the full production rotation steps against the preview
- [ ] Verify magic-link round-trip works on rotated preview
- [ ] Note any runbook gaps; apply fixes; re-commit as `hygiene-07: incorporate rehearsal fixes`
- [ ] Flip status above from ⏸ to ✓ and record rehearsal date + preview URL used

---

## HYGIENE-05 — iPhone + iCloud Private Relay magic-link verification

**Plan:** 01-05-iphone-verify-PLAN.md
**Commit:** (this plan's hygiene-05 commit)
**Status:** ⏸ DEFERRED to Phase 1 close gate — Shannon chose on 2026-04-21 to defer the manual device test

Evidence:
- No code changes — HYGIENE-05 is a pure Shannon manual test (request magic link from iPhone with iCloud Private Relay enabled, tap link from Mail, confirm authenticated session cookie lands)
- Plan 05 produced this deferral note + SUMMARY.md; no source files modified

**Rehearsal status (per plan):** ⏸ DEFERRED — to be executed alongside HYGIENE-07 runbook rehearsal at Phase 1 close, before inviting outside lodges.

Deferral checklist (to complete before Phase 1 close):
- [ ] Shannon on iPhone with iCloud Private Relay enabled (verify via Settings → Apple Account → iCloud → Private Relay = On)
- [ ] Navigate to the production URL in Safari
- [ ] Submit email from `/signin` — confirm "check your inbox" response
- [ ] Magic-link email arrives at Shannon's inbox (resend.com delivery to Private-Relay-masked address)
- [ ] Tap link in Mail app — opens production URL with authenticated session
- [ ] Confirm landing on an authenticated page (not redirect loop back to /signin)
- [ ] Record timestamp + iOS version + outcome in this VERIFICATION.md; flip status above from ⏸ to ✓

---

## HYGIENE-02 — AI SDK v6 codemod

**Plan:** 01-02-ai-sdk-codemod-PLAN.md
**Commit:** 005dc82
**Status:** ✓ VERIFIED

Evidence:
- Pre-flight grep for `from "ai"` / `from "@ai-sdk/*"` across `src/`, `scripts/`, `public/`: **zero matches** (confirms CONTEXT D-16b — codebase has no AI SDK imports)
- Codemod invocation: `npx --yes @ai-sdk/codemod@3.0.4 v6 src/ scripts/`
  - Output: `Starting v6 codemods...` → `v6 codemods complete.`
  - Zero source files modified (as expected per D-16b — codemod walked no source)
- Dependency bumps in `package.json`:
  - `ai`: `^6.0.86` → `^6.0.168` (current npm-latest at run time)
  - `@ai-sdk/anthropic`: `^3.0.44` → `^3.0.71` (current npm-latest at run time)
- `@ai-sdk/react` retained at `^3.0.88` — removal deferred to HYGIENE-01 (Plan 07)
- `npm run build`: exit 0 (Next.js 16.2.3 production build green; middleware-deprecation warning is pre-existing per RESEARCH Pitfall #7 and out of scope)
- `npm run test:run`: exit 0 — 257/257 tests passing (same count as HYGIENE-06 baseline; no test regressions)
- `git diff HEAD~1 HEAD --name-only` post-commit: ONLY `package.json` + `package-lock.json` — zero diff in `src/`, `scripts/`, or `public/` (matches D-16b expectation)
- Phase 5 (COACH-02) will be first consumer of v6 idioms when `/api/rehearsal-feedback` is rewritten; HYGIENE-02 puts the scaffolding in place ahead of that work

---

## HYGIENE-01 — Dead-package removal (Plan 07 — pending)

*(filled in when Plan 07 completes)*

---

**Phase 1 done gate** (per CONTEXT D-21):
- [ ] All 7 HYGIENE-XX above show ✓ VERIFIED (code) + any deferred manual checks confirmed
- [ ] `npm run build` green on final tree
- [ ] `npm run test:run` green on final tree
- [ ] Shannon's iPhone test recorded in HYGIENE-05
- [ ] Runbook rehearsed on preview deploy (HYGIENE-07)
