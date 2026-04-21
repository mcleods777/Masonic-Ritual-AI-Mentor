---
phase: 01-pre-invite-hygiene
plan: 07
subsystem: infra
tags: [secrets, rotation, vercel, runbook, jwt, ops-docs]

requires:
  - phase: 01-pre-invite-hygiene
    provides: "RITUAL_CLIENT_SECRET and JWT_SECRET already in use by src/middleware.ts (api gate) and src/lib/auth.ts (pilot-session cookies) — this plan documents how to rotate them without improvising"
provides:
  - "Canonical Markdown runbook at docs/runbooks/SECRET-ROTATION.md for rotating both RITUAL_CLIENT_SECRET and JWT_SECRET"
  - "New folder docs/runbooks/ — conventional home for Phase 1+ operational docs"
  - "Documented atomic `vercel env update` rotation path for production (no window-of-unset per D-05b)"
  - "Documented preview-branch rehearsal path with explicit CLI-v51.x rm+add limitation callout and Shannon-only-rehearsal mitigation"
  - "Expected-signal callout: JWT_SECRET rotation invalidates all live pilot-session cookies (D-02 — not a bug)"
affects:
  - "Phase 1 close gate — HYGIENE-07 rehearsal remains the single open item before outside-lodge invitations"
  - "Any future runbook in docs/runbooks/ — structural precedent set here"
  - "Any future rotation work — reuse this runbook verbatim; amend if CLI semantics change"

tech-stack:
  added: []
  patterns:
    - "docs/runbooks/ folder as the canonical location for rehearsed operational procedures"
    - "Runbook structure mirrors docs/BAKE-WORKFLOW.md: TL;DR → mechanism → typical workflows → troubleshooting → see also (per PATTERNS.md §2)"
    - "Bold-prefix em-dash callouts in troubleshooting instead of `> **Note:**` admonitions — matches BAKE-WORKFLOW.md voice"

key-files:
  created:
    - "docs/runbooks/SECRET-ROTATION.md — 234-line canonical rotation runbook, both secrets, production + preview-rehearsal paths, full troubleshooting tail"
  modified:
    - ".planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md — HYGIENE-07 placeholder replaced with runbook-landed/rehearsal-deferred entry; Phase 1 done-gate checklist untouched (rehearsal box stays unchecked)"

key-decisions:
  - "Defer the end-to-end Vercel preview rehearsal (plan Task 2) to the Phase 1 close gate — Shannon's explicit 2026-04-21 call. Rehearsal requires 15–30 min of hands-on Vercel CLI + preview-deploy + magic-link round-trip time and is being separated from the write-the-runbook work."
  - "Mark the HYGIENE-07 VERIFICATION.md entry with the ⏸ symbol and the phrase 'REHEARSAL DEFERRED' — not ✓ VERIFIED — because the runbook's operational value is unverified until rehearsed. False-positive marking would hide the open item from the Phase 1 verifier."
  - "Leave the Phase 1 done-gate line `[ ] Runbook rehearsed on preview deploy (HYGIENE-07)` unchecked. That single unchecked box is the Phase 1 verifier's signal that HYGIENE-07 is landed-but-not-rehearsed."
  - "No edits to the runbook body. Shannon accepted the pre-checkpoint version as-written; any changes land after rehearsal as a separate `hygiene-07: incorporate rehearsal fixes` commit."

patterns-established:
  - "Deferred-rehearsal pattern: write the runbook and land it atomically; mark VERIFICATION.md with a ⏸ open-item status; carry the rehearsal forward as a checklist in the same VERIFICATION.md entry; do not close the Phase 1 done gate until the rehearsal actually happens."
  - "Two-commit closeout for plans with deferred verification: (1) `hygiene-07: …` lands the artifact + updates VERIFICATION.md; (2) `docs(01-07): …` lands the SUMMARY. Keeps per-plan audit trail split cleanly between product-facing artifact and process documentation."

requirements-completed: [HYGIENE-07]

duration: 18min
completed: 2026-04-21
---

# Phase 1 Plan 07: Secret Rotation Runbook Summary

**Canonical Markdown rotation runbook for both RITUAL_CLIENT_SECRET and JWT_SECRET landed at `docs/runbooks/SECRET-ROTATION.md`; end-to-end Vercel preview rehearsal deferred (by Shannon's call) to the Phase 1 close gate.**

## Performance

- **Duration:** ~18 min (write + acceptance-criteria verify + commit) — excludes the deferred rehearsal time
- **Started:** 2026-04-21T02:56:00Z (approx — runbook authorship began before the checkpoint)
- **Completed:** 2026-04-21T03:02:13Z (continuation: VERIFICATION.md + commits + SUMMARY)
- **Tasks:** 2 of 3 executed (Task 1 done; Task 2 deferred; Task 3 done)
- **Files modified:** 2 (1 new, 1 edited)

## Accomplishments

- New `docs/runbooks/SECRET-ROTATION.md` (234 lines) covering rotation of both pilot-gating secrets (`RITUAL_CLIENT_SECRET` guarding `/api/*` in src/middleware.ts, `JWT_SECRET` signing `pilot-session` cookies via jose HS256 in src/lib/auth.ts).
- Production path uses atomic `vercel env update ... production --yes` — zero window-of-unset per CONTEXT D-05b.
- Preview-branch rehearsal path documents the exact asymmetry: Vercel CLI v51.x `env update` cannot scope to a single preview branch, so rotating a preview-branch-scoped secret requires `vercel env rm ... preview <branch> --yes` → `vercel env add ... preview <branch>`. Window-of-unset is explicitly named, and the Shannon-only-rehearsal mitigation is recorded at the point of action (not buried in troubleshooting) per the checker revision.
- JWT_SECRET rotation invalidates every live `pilot-session` cookie — called out as **expected signal, not bug** (D-02), with explicit instruction to send an out-of-band heads-up to invited lodges before a production rotation.
- Both known Vercel CLI footguns documented: trailing-newline capture (use `printf "%s"`, not `echo`, not `cat file | …`) and preview-branch-arg requirement (project memory: `vercel-cli-env-add-preview-branch-required`).
- Structure mirrors `docs/BAKE-WORKFLOW.md` per PATTERNS.md §2 — TL;DR → what gets rotated → expected-signal callout → prerequisites → typical workflows (production + rehearsal) → troubleshooting → see-also.
- VERIFICATION.md HYGIENE-07 entry transparently records the deferred-rehearsal status with a Phase-1-close-gate checklist the verifier can tick through later.

## Task Commits

1. **Task 1 (write runbook) + Task 3 (VERIFICATION.md update), merged into one atomic hygiene-07 commit per D-20:** `66b4d93` (docs) — `hygiene-07: add secret rotation runbook (rehearsal deferred to phase 1 close gate)`
2. **Plan metadata (this SUMMARY):** `docs(01-07): record hygiene-07 plan execution summary`

_Note: Task 2 (end-to-end rehearsal) was deferred by Shannon's explicit 2026-04-21 call — it is **not** cancelled; it is a Phase 1 close-gate requirement. The VERIFICATION.md entry carries a rehearsal checklist so the verifier can tick it off when the rehearsal actually happens._

## Files Created/Modified

- `docs/runbooks/SECRET-ROTATION.md` — new, 234 lines. Canonical rotation runbook. Sections (all H2): TL;DR, What gets rotated and why, Expected signal (JWT rotation invalidates live cookies), Prerequisites, Typical workflows (production rotation + rehearsal on preview deploy), Troubleshooting, See also.
- `.planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md` — edited. HYGIENE-07 placeholder replaced with a full evidence entry marked `⏸ RUNBOOK LANDED; REHEARSAL DEFERRED`, pointing at commit `66b4d93` and carrying a 6-item rehearsal checklist for the Phase 1 verifier. Phase 1 done-gate block (lines 87–92) intentionally untouched — the line `[ ] Runbook rehearsed on preview deploy (HYGIENE-07)` stays unchecked as the open-item signal.

## Decisions Made

- **Defer rehearsal, don't skip it.** Shannon's own words: "Defer rehearsal; commit runbook now." The rehearsal requires Shannon's hands-on time (Vercel CLI + preview deploy + magic-link round-trip, 15–30 min) and is being moved to the Phase 1 close gate so runbook authorship and rehearsal don't block each other mid-execution.
- **Use ⏸, not ✓, in VERIFICATION.md.** The runbook is written but unverified in live conditions. Marking it ✓ VERIFIED would be a false positive and would let the Phase 1 verifier close the phase without the rehearsal ever happening. ⏸ with an explicit rehearsal checklist is the correct open-item signal.
- **Rehearsal checklist lives inside the HYGIENE-07 VERIFICATION.md entry, not on a separate TODO doc.** Keeps the audit trail single-file-per-HYGIENE-XX and lets the Phase 1 verifier tick boxes in the same place where the evidence lives.
- **Do not modify the runbook body post-checkpoint.** The runbook passed every grep acceptance criterion from the plan and Shannon accepted it as-is. Any edits driven by the real rehearsal will land later as `hygiene-07: incorporate rehearsal fixes` in the same phase branch.

## Deviations from Plan

**1. [Process deviation, not a Rule 1–3 auto-fix] Task 2 (Shannon's end-to-end rehearsal) deferred to Phase 1 close gate**

- **Found during:** Continuation from checkpoint — Shannon's explicit call at 2026-04-21.
- **Issue:** The plan's original flow assumed inline rehearsal as a blocking checkpoint between Task 1 and Task 3. In practice the rehearsal requires 15–30 min of Shannon's hands-on time (Vercel CLI setup, create rehearsal branch, trigger preview deploy, rotate preview secrets, test magic-link round-trip, clean up) and he did not want to spend that mid-execution.
- **Fix:** Separated write-the-runbook from rehearse-the-runbook. The runbook is landed and auditable (commit `66b4d93`); the rehearsal is tracked as an open item in VERIFICATION.md's HYGIENE-07 entry with a 6-step checklist so the Phase 1 verifier (or Shannon himself) can complete and record it later. The Phase 1 done gate retains `[ ] Runbook rehearsed on preview deploy (HYGIENE-07)` as an unchecked box — the phase cannot close without the rehearsal.
- **Files modified:** `01-VERIFICATION.md` (HYGIENE-07 entry explicitly marked deferred, rehearsal checklist included).
- **Verification:** Phase 1 done-gate line remains unchecked; HYGIENE-07 entry uses ⏸ not ✓; SUMMARY flags the deferred rehearsal prominently for the next verifier run.
- **Committed in:** `66b4d93` (hygiene-07 commit) + this SUMMARY commit.

---

**Total deviations:** 1 process deviation (deferred verification, not an auto-fix under Rules 1–3).
**Impact on plan:** Runbook artifact is complete and correct per all grep acceptance criteria. The rehearsal — originally a blocking checkpoint inside Plan 07 — is carried forward as a Phase 1 close-gate item. No scope creep, no reduction in what must happen before outside invitations go out. The audit trail is split across two commits (artifact + SUMMARY) but the HYGIENE-07 requirement itself is tracked as a single open item until rehearsed.

## Issues Encountered

None during continuation execution. All acceptance criteria for Task 1's runbook content were verified green before the checkpoint; build and test suite remain green (`npm run build` exit 0; `npm run test:run` 257/257 at 2026-04-21T03:01:02Z) since this plan is docs-only.

## User Setup Required

None — docs-only change, no external service configuration required for what was committed in this plan. The **deferred rehearsal**, however, does require Shannon's Vercel CLI to be installed and authenticated (`vercel login`) before it can be executed. The rehearsal checklist in VERIFICATION.md HYGIENE-07 includes this as an explicit prerequisite.

## Hand-off Notes for Phase 1 Verifier

**Before closing Phase 1, the HYGIENE-07 rehearsal MUST happen.** Specifically:

1. Confirm `docs/runbooks/SECRET-ROTATION.md` exists and is at least as complete as commit `66b4d93`.
2. Follow the "Typical workflows — Rehearsal on preview deploy" section of the runbook end-to-end on a real Vercel preview.
3. If every step executes cleanly, flip the VERIFICATION.md HYGIENE-07 status from `⏸ RUNBOOK LANDED; REHEARSAL DEFERRED` to `✓ VERIFIED`, record the preview URL used and rehearsal date, and check the final box in the Phase 1 done-gate block (`[x] Runbook rehearsed on preview deploy (HYGIENE-07)`).
4. If steps fail, apply surgical runbook fixes (replace the failing step's wording only; don't rewrite), commit as `hygiene-07: incorporate rehearsal fixes`, and re-run just the fixed section of the rehearsal before marking ✓.

## Follow-up Work

- **Rehearsal** (described above) — tracked inline in VERIFICATION.md HYGIENE-07 checklist.
- **Possible `hygiene-07: incorporate rehearsal fixes` commit** — conditional on whether the live rehearsal surfaces runbook gaps. If it does, the fixes are surgical and land in the same phase branch.

## Threat Mitigation

Threats `T-1-04`, `T-1-04a`, `T-1-04b` from this plan's `<threat_model>` are **partially mitigated** — the rehearsed procedure is the mitigation, and the runbook is written but not yet rehearsed. Full mitigation is gated on the deferred rehearsal. `T-1-04c` (JWT_SECRET rotation invalidates live sessions) is correctly documented as accepted-signal behavior in the runbook.

## Self-Check: PASSED

- File exists: `docs/runbooks/SECRET-ROTATION.md` — FOUND (234 lines, tracked in commit `66b4d93`).
- File modified: `.planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md` — FOUND (HYGIENE-07 entry updated, Phase 1 done-gate line 92 still unchecked as intended).
- Commit exists: `66b4d93` — FOUND on branch `gsd/phase-1-pre-invite-hygiene` with subject `hygiene-07: add secret rotation runbook (rehearsal deferred to phase 1 close gate)`.
- HYGIENE-07 entry uses `⏸`, not `✓` — verified.
- Phase 1 done-gate checklist retains `[ ] Runbook rehearsed on preview deploy (HYGIENE-07)` — verified.
- `npm run build` exit 0 (2026-04-21T03:01:02Z run); `npm run test:run` 257/257 exit 0 (same run).
- No STATE.md or ROADMAP.md edits (per continuation-context instruction — handled by parent orchestrator).

## Next Phase Readiness

- HYGIENE-07 runbook landed; rehearsal is the one Phase 1 close-gate open item tied to this plan.
- Next plans in the D-19 execution order are HYGIENE-05 (iPhone + iCloud Private Relay magic-link verification), then HYGIENE-02 (AI SDK v6 codemod), then HYGIENE-01 (dead-package removal). None depend on the runbook rehearsal — they can proceed in parallel with the deferred rehearsal.
- `docs/runbooks/` is now an established folder; future ops runbooks (e.g. for Phase 2+) should land here using the same structural pattern.

---
*Phase: 01-pre-invite-hygiene*
*Completed: 2026-04-21*
