---
status: partial
phase: 01-pre-invite-hygiene
source: [01-VERIFICATION.md]
started: 2026-04-21
updated: 2026-04-21
---

## Current Test

[awaiting Shannon manual verification — both items explicitly deferred on 2026-04-21 during execution; must complete before outside-lodge invitations]

## Tests

### 1. HYGIENE-05 — iPhone + iCloud Private Relay magic-link sign-in

**Requirement:** HYGIENE-05 — "Magic-link sign-in verified end-to-end on an iPhone behind iCloud Private Relay (regression guard)"

**Expected:** Shannon on iPhone with iCloud Private Relay enabled → navigate to production URL in Safari → submit email at `/signin` → magic-link email arrives at inbox → tap link in Mail app → land authenticated on the app (not redirect loop back to `/signin`)

**Result:** [pending]

**Checklist** (from `01-VERIFICATION.md` HYGIENE-05 §Deferral checklist):
- [ ] Confirm iCloud Private Relay enabled (Settings → Apple Account → iCloud → Private Relay = On)
- [ ] Navigate to production URL in Safari
- [ ] Submit email from `/signin`; confirm "check your inbox" response
- [ ] Magic-link email arrives at inbox (Resend delivery to Private-Relay-masked address)
- [ ] Tap link in Mail app — opens production URL with authenticated session
- [ ] Confirm landing on an authenticated page (not redirect loop back to `/signin`)
- [ ] Record timestamp + iOS version + outcome in `01-VERIFICATION.md`; flip ⏸ → ✓

**Estimated time:** 2-3 minutes

---

### 2. HYGIENE-07 — Secret-rotation runbook rehearsal on Vercel preview deploy

**Requirement:** HYGIENE-07 — "Shared-secret rotation runbook written and rehearsed in staging — Shannon has a practiced playbook before invitations begin"

**Expected:** Shannon follows `docs/runbooks/SECRET-ROTATION.md` §"Typical workflows — Rehearsal on preview deploy" end-to-end against a real Vercel preview deploy; every step executes as written; any gaps get fixed in a follow-up `hygiene-07: incorporate rehearsal fixes` commit; final outcome recorded in `01-VERIFICATION.md`

**Result:** [pending]

**Checklist** (from `01-VERIFICATION.md` HYGIENE-07 §Rehearsal checklist):
- [ ] Vercel CLI installed and authenticated on Shannon's machine
- [ ] Create rehearsal branch, push, observe preview URL
- [ ] Run the full production rotation steps against the preview
- [ ] Verify magic-link round-trip works on rotated preview
- [ ] Note any runbook gaps; apply fixes; re-commit as `hygiene-07: incorporate rehearsal fixes`
- [ ] Flip status from ⏸ to ✓ and record rehearsal date + preview URL used

**Estimated time:** 15-30 minutes

---

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps

*(none — automated verification found zero gaps; both pending items are explicit human-only verifications)*

## Notes

Both items were explicitly deferred by Shannon during execution on 2026-04-21:
- HYGIENE-05 iPhone test: chosen "Defer to Phase 1 close gate" when prompted
- HYGIENE-07 rehearsal: chosen "Defer rehearsal; commit runbook now" when prompted after runbook was written

Rationale for deferral: both tests require Shannon's hands-on time (physical device + Vercel CLI + preview deploy spawning + magic-link email round-trip), batched into a single Shannon-sweep rather than interrupting the execution chain. Code-side work (7/7 HYGIENE-XX plans) landed on branch `gsd/phase-1-pre-invite-hygiene` and verified.

**Phase 1 is code-complete but not Shannon-sign-off-complete.** The done-gate at `01-VERIFICATION.md` explicitly retains 2/5 boxes unchecked until these two items close. No outside-lodge invitations should be sent until both are ✓.
