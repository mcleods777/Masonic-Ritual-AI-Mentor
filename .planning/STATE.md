---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
last_updated: "2026-09-02T20:21:48-05:00"
progress:
  total_phases: 7
  completed_phases: 3
  total_plans: 26
  completed_plans: 26
  percent: 43
---

# State: Masonic Ritual AI Mentor — v1 Invited-Lodge Milestone

**Last updated:** 2026-09-02 (repository stabilization and evidence reconciliation)

## Project Reference

**Core Value:** A Masonic officer can reliably rehearse their ritual parts — at any hour, with no other brother available — and come out of the session more confident that their memorization is accurate to their lodge's working.

**Current Focus:** Stabilize current `main`, close deferred UAT, then reimplement one clean Phase 4 vertical slice

**Project type:** Brownfield — the pilot already ships and is in daily use by Shannon.

## Current Position

**Milestone:** v1 invited-lodge
**Code-verified phases:** 1, 2, and 3
**Human verification:** still open; code-complete does not mean invite-ready
**Repository state:** current `main` is backed up remotely; local tracked changes are not yet committed
**Next action:** finish the stabilization checkpoint, add a complete private-tree guard and standalone TypeScript gate, then implement one clean Phase 4 manifest/diagnostics slice from current `main`. Do not merge or cherry-pick `gsd/phase4`.

## Phase Map

| # | Phase | Requirements | Status |
|---|-------|--------------|--------|
| 1 | Pre-invite Hygiene | HYGIENE-01..07 (7) | Code complete; 2 human UAT pending |
| 2 | Safety Floor | SAFETY-01..09 (9) | Code complete; 4/8 human UAT blocked |
| 3 | Authoring Throughput | AUTHOR-01..10 (10) | Code complete; 4 human UAT pending |
| 4 | Content Coverage | CONTENT-01..07 (7) | Not started on current `main` |
| 5 | Coach Quality Lift | COACH-01..12 (12) | Not started |
| 6 | Admin Substrate & Distribution | ADMIN-01..07 (7) | Not started |
| 7 | Onboarding Polish | ONBOARD-01..05 (5) | Not started |

## Performance Metrics

**Requirements coverage:** 57/57 mapped (100%)
**Plans executed:** 26 across Phases 1-3
**Phase 2 automated verification:** 9/9 requirements; 614-test current repository suite passes
**Phase 3 automated verification:** 11/11 must-haves; 614-test current repository suite passes
**Repository gates (2026-09-02):** lint 0 errors / 108 warnings; production build passes; standalone `tsc --noEmit` has 12 test-only typing errors

## Accumulated Context

### Decisions

| Decision | Rationale | Source |
|----------|-----------|--------|
| 7-phase structure honoring REQUIREMENTS.md categories | Categories already imply natural delivery boundaries; research suggested 5-phase but instructions directed category-driven | Roadmapping 2026-04-20 |
| Phase 3 (Authoring) before Phase 4 (Content) | Content work is Shannon-hours; bake cache + validators must exist before re-baking 5+ rituals is practical | Roadmapping 2026-04-20 |
| Phase 2 (Safety) before Phase 5 (Coach) | Coach phase iterates hard on feedback route; per-user caps must exist first | Research ARCHITECTURE.md + roadmapping |
| AUTHOR-10 (idb-schema extract) in Phase 3 | Phase 5 COACH-06 feedbackTraces store needs the schema module first; treated as a Phase 3 prerequisite for Phase 5 | Roadmapping 2026-04-20 |
| COACH-11 (RehearsalMode split) treated as prereq, not polish | PITFALLS + research both flag the 1,511-line monolith as a regression risk for any feedback-route work | Roadmapping 2026-04-20 |
| `mentor-v1` is the default variant; `roast-v1` is hidden A/B-only | Research convergence: roast persona appears to BE the quality gap | Research SUMMARY.md |
| Defer Upstash/Redis migration | Pilot scale (≤10 lodges) doesn't justify; in-memory with documented swap path | Research STACK.md |
| Reject third-party LLM body-observability for v1 | Langfuse/Helicone/LangSmith ingest full prompt+completion — even 1-2 expected ritual words violates the client-only data plane invariant | Research ARCHITECTURE.md |

### Open Questions / Todos

- Freeze the gold-eval rubric ("stake my name on it" / "meh" / "wrong" + qualitative axes) as Phase 5 Task 1 artifact before any variant tuning.
- Revisit whether strong revocation must ship before Phase 6 based on the specific outside lodges in Shannon's invite queue.
- Reassess model variants during Phase 5 eval; do not reserve a production slot without measured evidence.

### Deferred Human UAT

**Phase 1 (2):** iPhone + iCloud Private Relay magic-link verification; secret-rotation runbook rehearsal on a Vercel preview.

**Phase 2 (4 blocked):** observe the 02:00 UTC cron and Resend delivery; verify client-token refresh after a Safari tab is backgrounded over 60 minutes; force a live runaway auto-advance to its ceiling; observe wake-lock release after 30 minutes idle on a real device.

**Phase 3 (4 pending):** confirm a one-line edit re-bakes in under one minute; bake five rituals in parallel without babysitting; scrub baked audio through `localhost:8883`; confirm the EA rebake restores all 32 previously skipped short lines.

### Readiness Blockers

- Standalone `tsc --noEmit` reports 12 test-only typing errors; production build typecheck passes.
- `rituals/` has extension-specific ignores but no complete directory guard; Git still reports private-tree content.
- Phase 4's old branch is contaminated by a large unrelated tooling divergence and must not be merged or cherry-picked.

### Requirements Currently Validated (pre-v1, shipped pilot)

- Encrypted `.mram` delivery format (AES-256-GCM + PBKDF2) — shipped
- Client-side ritual data plane (IndexedDB at-rest encryption) — shipped
- Rehearsal engine with word-level diff scoring — shipped
- Multi-engine TTS dispatcher (Gemini default + 6 others) — shipped
- Magic-link auth + `LODGE_ALLOWLIST` gate + shared-secret header — shipped
- Offline authoring pipeline (`scripts/build-mram-from-dialogue.ts`) — shipped
- Per-session performance history — shipped
- Voice management / cloning — shipped

(Full list in PROJECT.md → Validated section.)

## Session Continuity

**Last significant action (2026-09-02):** Resumed the project from the live `main` branch; ran the full quality baseline; obtained a paid Fable 5.1 plan review; removed all lint errors without changing the documented rehearsal behavior; and reconciled Phase 2/3 planning status against their verification artifacts.

**Verified current gates:**

- `npm run test:run`: 614/614 pass.
- `npm run lint`: 0 errors, 108 warnings.
- `npm run build`: pass.
- `npx tsc --noEmit`: 12 test-only typing errors remain.

**Resumption cue:** Complete the stabilization checkpoint without overwriting the pre-existing tracked changes. Then add a whole-tree `rituals/` guard plus a deterministic staged-file check, fix the 12 standalone TypeScript test errors, and begin a clean Phase 4 manifest/diagnostics slice on a fresh branch from current `main`.

**Branch rule:** Treat `gsd/phase4` as read-only reference material. Do not merge or cherry-pick it; its product work is mixed with a large unrelated tooling divergence.

**Approval boundary:** Do not push, merge, deploy, delete, or rewrite history without Shannon's explicit approval.

---
*State reconciled against Phase 2 and Phase 3 verification artifacts: 2026-09-02*
