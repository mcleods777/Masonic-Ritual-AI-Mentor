---
phase: 1
slug: pre-invite-hygiene
status: in_progress
created: 2026-04-21
verifier_status: human_needed
verifier_score: 5/7 verified, 2/7 deferred-human
verifier_verdict_date: 2026-04-20
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

## HYGIENE-01 — Dead-package removal

**Plan:** 01-01-package-cleanup-PLAN.md
**Commit:** b82aefe
**Status:** ✓ VERIFIED

Evidence:
- Pre-flight grep for imports of `natural`, `uuid`, `@ai-sdk/react` across `src/`, `scripts/`, `public/`: **zero matches** (confirms all four packages were truly dead)
- `npm uninstall natural uuid @ai-sdk/react @types/uuid` executed
- `npm ls natural @ai-sdk/react @types/uuid`: all three reported "(empty)" / not installed directly. `npm ls uuid` shows `uuid@10.0.0` now only as a transitive dep of `resend@6.11.0 → svix@1.90.0` (expected — our direct dep removed)
- `package.json` dependencies reduced by 3 entries (removed: `natural`, `uuid`, `@ai-sdk/react`); devDependencies reduced by 1 entry (removed: `@types/uuid`)
- 81 packages removed overall (4 direct + 77 transitive) per `npm uninstall` output
- Retained: `ai@^6.0.168`, `@ai-sdk/anthropic@^3.0.71` (per CONTEXT D-14 — for Phase 5 COACH-02)
- `npm run build`: exit 0 (bundle no longer includes these packages' code paths)
- `npm run test:run`: exit 0 — 257/257 tests passing, no regressions
- `git diff HEAD~1 HEAD --name-only`: only `package.json` + `package-lock.json` — zero source changes

---

**Phase 1 done gate** (per CONTEXT D-21):
- [x] All 7 HYGIENE-XX above show ✓ VERIFIED (code-side) — manual items (HYGIENE-05, HYGIENE-07) remain ⏸ DEFERRED
- [x] `npm run build` green on final tree
- [x] `npm run test:run` green on final tree
- [ ] Shannon's iPhone test recorded in HYGIENE-05 — DEFERRED
- [ ] Runbook rehearsed on preview deploy (HYGIENE-07) — DEFERRED

---

## Verifier Final Verdict

**Verifier:** Claude (gsd-verifier)
**Verified:** 2026-04-20
**Status:** `human_needed`
**Score:** 5/7 success criteria VERIFIED automated + 2/7 DEFERRED to Shannon manual; 0/7 FAILED
**Re-verification:** No (initial phase verification)

### Decision rationale

Every code-side must-have has been independently re-verified against the actual codebase (not just trusted from SUMMARY claims). All automated checks pass. Two items — HYGIENE-05 (iPhone + iCloud Private Relay round-trip) and the HYGIENE-07 rehearsal leg — are documented-deferred manual tasks that Shannon chose on 2026-04-21 to execute at the Phase 1 close gate alongside outside-lodge invitation prep. These are NOT failures: the code work is done, the preconditions for manual testing exist, and the deferral is documented with full checklists in this VERIFICATION.md.

Per CONTEXT D-21, Phase 1 done-gate explicitly includes "Shannon's iPhone check." Strict reading of the gate means the phase cannot flip to `complete` until Shannon finishes the two deferred items. This matches `human_needed` — automated work passes; awaiting human verification — rather than `gaps_found` (which would imply something was built wrong).

### Per–success-criterion verdict

| # | Success Criterion (from ROADMAP Phase 1) | Verdict | Evidence |
|---|------------------------------------------|---------|----------|
| 1 | `npm ls` shows no `natural`/`uuid`/`@ai-sdk/react`/`@types/uuid`; production bundle no longer ships their code | ✓ PASS | `package.json` contains none of the four names (lines 13-24, 25-39). `npm ls natural uuid @ai-sdk/react @types/uuid` → only `uuid@10.0.0` appears, strictly as a transitive of `resend@6.11.0 → svix@1.90.0` (expected, documented). `npm run build` exits 0. |
| 2 | `ai` SDK idioms aligned with v6 conventions across codebase (codemod run clean) | ✓ PASS | `package.json` line 15: `"ai": "^6.0.168"`; line 14: `"@ai-sdk/anthropic": "^3.0.71"`. Grep for `from "ai"` / `from "@ai-sdk/*"` in src/, scripts/, public/ → zero matches (no source to transform; version bump is the effective change). |
| 3 | `X-Robots-Tag: noindex` in all app-route response headers + `public/landing.html` contains zero real ritual text | ✓ PASS (code); preview-curl DEFERRED | `next.config.ts` line 35: `{ key: "X-Robots-Tag", value: "noindex, nofollow" }` in `SECURITY_HEADERS` applied to `source: "/:path*"`. `public/landing.html` line 6: `<meta name="robots" content="noindex, nofollow">`. Grep blocklist (officer codes, obligation vocab, cipher punctuation, working-specific phrases) against landing.html → zero matches. Preview-deploy `curl -I` header confirmation rolls up with HYGIENE-05 preview session. |
| 4 | Shannon has completed a live magic-link sign-in on iPhone behind iCloud Private Relay | ⏸ DEFERRED-HUMAN | No code involved — pure manual test. 7-step deferral checklist live in HYGIENE-05 section. Shannon chose 2026-04-21 to batch with HYGIENE-07 rehearsal at Phase 1 close gate. |
| 5 | A test exists that fails if `.mram` routes are added back to the middleware matcher | ✓ PASS | `src/__tests__/middleware.test.ts` — 54 lines, imports `config` by name from `../middleware`, constructs `new RegExp("^" + matcherString + "$")`, and asserts `.mram` paths (flat / nested / hyphenated) return `false`. Includes a positive-match sanity case so the negatives aren't vacuous. Test is part of the 257/257 green suite. Inverse-check: `src/middleware.ts` line 134 still contains `mram` in the extension alternation — if removed, the test fails. |
| 6 | A written shared-secret rotation runbook exists + has been rehearsed in staging at least once | ⏸ PARTIAL — runbook ✓; rehearsal DEFERRED-HUMAN | `docs/runbooks/SECRET-ROTATION.md` exists, 234 lines, covers both `RITUAL_CLIENT_SECRET` and `JWT_SECRET`, uses atomic `vercel env update` (production path), documents CLI v51.x `env rm+add` limitation (preview path), JWT → session-invalidation callout present. Rehearsal leg (end-to-end execution on Vercel preview) is the deferred piece. 6-step deferral checklist live in HYGIENE-07 section. |

### Per–requirement-ID trace

All 7 HYGIENE-XX are explicitly claimed by a PLAN's `requirements:` frontmatter (one per plan). REQUIREMENTS.md maps each to Phase 1 with "Pending" status. No orphan IDs.

| Requirement | Source Plan | Commit | Verifier status | Codebase evidence |
|-------------|-------------|--------|-----------------|-------------------|
| HYGIENE-01 | Plan 07 (01-01-package-cleanup-PLAN.md) | b82aefe | ✓ SATISFIED | `package.json` lines 13-24, 25-39 — four names absent; `@ai-sdk/anthropic`/`ai` retained. |
| HYGIENE-02 | Plan 06 (01-02-ai-sdk-codemod-PLAN.md) | 005dc82 | ✓ SATISFIED | `package.json` line 14: `"@ai-sdk/anthropic": "^3.0.71"`; line 15: `"ai": "^6.0.168"`. |
| HYGIENE-03 | Plan 01 (01-03-noindex-PLAN.md) | 2135496 | ✓ SATISFIED (code) | `next.config.ts:35`, `public/landing.html:6`. |
| HYGIENE-04 | Plan 03 (01-04-landing-audit-PLAN.md) | 2b68c72 | ✓ SATISFIED | 4-pattern grep blocklist returns zero matches against `public/landing.html`. |
| HYGIENE-05 | Plan 05 (01-05-iphone-verify-PLAN.md) | 47a0f78 | ⏸ DEFERRED-HUMAN | No code; manual test deferred by Shannon 2026-04-21. |
| HYGIENE-06 | Plan 02 (01-06-matcher-test-PLAN.md) | 9cfbb3a | ✓ SATISFIED | `src/__tests__/middleware.test.ts` (54 lines) + `src/middleware.ts:134` still contains `mram` in alternation. Full suite 257/257. |
| HYGIENE-07 | Plan 04 (01-07-rotation-runbook-PLAN.md) | 66b4d93 | ⏸ PARTIAL (runbook satisfied; rehearsal DEFERRED-HUMAN) | `docs/runbooks/SECRET-ROTATION.md` (234 lines) satisfies the write; rehearsal deferred by Shannon 2026-04-21. |

### Cross-reference: actual codebase + commands run by verifier

Commands executed as part of this verification (all on the current tree, not re-read from SUMMARY claims):

- `npm run build` → `✓ Compiled successfully in 9.5s`, exit 0
- `npm run test:run` → `Test Files 16 passed (16) / Tests 257 passed (257)`, exit 0
- `npm ls natural uuid @ai-sdk/react @types/uuid` → only `uuid@10.0.0` listed, strictly transitive via `resend → svix` (expected + documented)
- Grep `from "natural|uuid|@ai-sdk/react"` in `src/`, `scripts/`, `public/` → zero matches
- Grep for ritual vocab (WM/SW/JW/obligation/cable-tow/…) in `public/landing.html` → zero matches
- `git log --oneline -14` → 7 `hygiene-NN:` commits + 6 `docs(01-NN):` commits present (Plan 05 HYGIENE-05 has no separate docs commit because its evidence is entirely in-VERIFICATION.md; the deferral note rides on the `hygiene-05:` commit itself — verifier confirmed against history)

Files independently inspected (not inferred from SUMMARY.md):

- `package.json` — dependency/devDependency lists
- `next.config.ts` — SECURITY_HEADERS + headers() function
- `public/landing.html` (head + full-file grep blocklist)
- `src/middleware.ts` — matcher regex unchanged, `.mram` in alternation
- `src/__tests__/middleware.test.ts` — regression test body + assertion count
- `docs/runbooks/SECRET-ROTATION.md` — line count + `vercel env update` coverage + both secrets referenced

### Notes on the two deferrals

**These are not gaps.** They are explicit human-verification items tracked in this document with 6-7 step closure checklists. The executor(s) cannot close them; Shannon must:

1. **HYGIENE-05:** 2-3 min of Shannon's time on an iPhone with iCloud Private Relay enabled — record outcome in HYGIENE-05 checklist, flip ⏸ → ✓.
2. **HYGIENE-07 rehearsal:** 15-30 min of Shannon's time driving the runbook end-to-end against a Vercel preview deploy — record runbook gaps (if any), apply fixes as `hygiene-07: incorporate rehearsal fixes`, record rehearsal date + preview URL, flip ⏸ → ✓.

Both are expected at the same Shannon sweep immediately before sending the first outside-lodge invitation. Shannon has full agency on timing.

### Recommended next-step routing

- **Do not mark Phase 1 `complete` yet.** Frontmatter `status` stays `in_progress` until Shannon finishes both ⏸ items. This is deliberate — the single signal preventing accidental outside-lodge invitation before manual verification.
- **Phase 2 (Safety Floor) planning is NOT blocked.** Phase 2 depends on Phase 1 per ROADMAP, but the dependency is code-side (HYGIENE-01 + HYGIENE-02) and those are ✓ VERIFIED. Shannon can begin Phase 2 planning in parallel with his manual sweep; only invitation-to-outside-lodges is blocked on the two deferrals.
- **When Shannon finishes both manual items:**
  1. Edit HYGIENE-05 and HYGIENE-07 sections above: flip ⏸ → ✓, add timestamps/iOS version/preview URL.
  2. Check the two remaining boxes in the "Phase 1 done gate" checklist.
  3. Flip frontmatter `status: in_progress` → `status: complete`.
  4. Commit as `docs(phase-1): close phase 1 done gate after shannon manual verification`.
  5. Phase 1 is then officially complete and outside-lodge invitations are unblocked.
- **If the iPhone test fails** (Private-Relay delivery doesn't work end-to-end), file a separate issue and DO NOT close Phase 1 — this is real regression risk, not a paperwork step.
- **If the rehearsal surfaces runbook gaps** (e.g., CLI version skew, missing step), apply fixes and re-commit as `hygiene-07: incorporate rehearsal fixes` before flipping ⏸ → ✓.
