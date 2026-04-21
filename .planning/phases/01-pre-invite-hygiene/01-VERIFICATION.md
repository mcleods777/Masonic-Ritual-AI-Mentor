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

## HYGIENE-07 — Shared-secret rotation runbook (Plan 04 — pending)

*(filled in when Plan 04 completes)*

---

## HYGIENE-05 — iPhone + iCloud Private Relay magic-link verification (Plan 05 — pending)

*(filled in when Plan 05 completes)*

---

## HYGIENE-02 — AI SDK v6 codemod (Plan 06 — pending)

*(filled in when Plan 06 completes)*

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
