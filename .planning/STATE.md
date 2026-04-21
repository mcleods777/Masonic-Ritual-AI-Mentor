# State: Masonic Ritual AI Mentor — v1 Invited-Lodge Milestone

**Last updated:** 2026-04-21 (Phase 2 planned; 9 plans ready to execute)

## Project Reference

**Core Value:** A Masonic officer can reliably rehearse their ritual parts — at any hour, with no other brother available — and come out of the session more confident that their memorization is accurate to their lodge's working.

**Current Focus:** Ship the v1 invited-lodge milestone: harden and extend the shipping pilot so Shannon can personally invite 1-3 outside lodges' officers without exposure to surprise AI bills, LLM hallucinations against authoritative ritual text, or an inability to revoke access cleanly.

**Project type:** Brownfield — the pilot already ships and is in daily use by Shannon.

## Current Position

**Milestone:** v1 invited-lodge
**Phase:** Phase 2 planned (9 plans across 8 waves)
**Plan:** 9 PLAN.md files ready
**Status:** Phase 1 code-complete + 2 UAT pending; Phase 2 ready for `/gsd-execute-phase 2`
**Progress:** 1/7 phases complete

```
[██░░░░░░░░░░░░░░░░░░] 14% (1/7 phases)
```

**Next action:** `/gsd-execute-phase 2` to run 9 plans in wave order (W1: 01 audit-log infra → W2: 02 rate-limit + paid-route-guard → W3: 05 client-token → W4: 08 kill-switch UX → W5: 03 wire guard into 9 paid routes → W6: 09 defense-in-depth tests → W7: 04 cron + Resend + lookup CLI → W8: 06 session ceiling + 07 wake-lock parallel). Per CONTEXT D-21, create a new `gsd/phase-2-safety-floor` branch from the current `gsd/phase-1-pre-invite-hygiene` tip before code changes. The 2 deferred Phase 1 UAT items remain open (do not block Phase 2 execution).

## Phase Map

| # | Phase | Requirements | Status |
|---|-------|--------------|--------|
| 1 | Pre-invite Hygiene | HYGIENE-01..07 (7) | ✓ Complete (UAT pending) |
| 2 | Safety Floor | SAFETY-01..09 (9) | Not started |
| 3 | Authoring Throughput | AUTHOR-01..10 (10) | Not started |
| 4 | Content Coverage | CONTENT-01..07 (7) | Not started |
| 5 | Coach Quality Lift | COACH-01..12 (12) | Not started |
| 6 | Admin Substrate & Distribution | ADMIN-01..07 (7) | Not started |
| 7 | Onboarding Polish | ONBOARD-01..05 (5) | Not started |

## Performance Metrics

**Requirements coverage:** 57/57 mapped (100%)
**Phases planned:** 1/7
**Plans executed:** 7/7 Phase 1
**Plans verified:** 5/7 verified + 2/7 deferred-human (HYGIENE-05, HYGIENE-07 rehearsal)

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

- Confirm Shannon-specific authoring bottleneck ordering inside Phase 3 during plan phase (line-level regen vs batch orchestrator vs preview-bake)
- Freeze the gold-eval rubric ("stake my name on it" / "meh" / "wrong" + qualitative axes) as Phase 5 Task 1 artifact before any variant tuning
- Decide whether Haiku 4.5 earns a production variant slot (assume "maybe" until Phase 5 eval measures it)
- Revisit "does strong revocation need to ship earlier" based on the specific outside lodges in Shannon's invite queue (currently placed in Phase 6)

### Blockers

None.

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

**Last significant action:** Phase 1 executed via `/gsd-execute-phase 1` on 2026-04-21. All 7 HYGIENE plans landed on branch `gsd/phase-1-pre-invite-hygiene` (13 commits: 7 `hygiene-NN:` + 5 `docs(01-NN):` metadata + 1 `test(01):` UAT). Verifier returned `human_needed` — 5/7 ✓ VERIFIED (HYGIENE-01, 02, 03, 04, 06), 2/7 ⏸ DEFERRED (HYGIENE-05 iPhone test, HYGIENE-07 runbook rehearsal). Shannon approved phase close on 2026-04-21. `01-HUMAN-UAT.md` tracks the 2 deferred items.

**Resumption cue:** Next action: `/gsd-discuss-phase 2` to begin Phase 2 (Safety Floor — SAFETY-01..09). The 2 deferred UAT items run at Shannon's pacing; they do NOT block Phase 2 planning or execution, but MUST close before outside-lodge invitations.

**Critical context for next agent:**
1. Brownfield milestone — do NOT re-build existing pilot capability (see PROJECT.md Validated)
2. Phase 2 (Safety Floor) introduces paid-route rate limiting, audit log, budget caps, emergency kill switch. Dependency: Phase 2 benefits from HYGIENE-02's AI SDK v6 bump (commit 005dc82) but does not require rewriting `/api/rehearsal-feedback` — that's Phase 5 COACH-02.
3. Pending Phase 1 manual verification (both in `01-HUMAN-UAT.md`):
   - HYGIENE-05: Shannon iPhone + iCloud Private Relay magic-link test (~2-3 min)
   - HYGIENE-07: Rotation runbook rehearsal on Vercel preview (~15-30 min)
4. Phase 1 left on branch `gsd/phase-1-pre-invite-hygiene` — decide merge-to-main strategy before Phase 2 OR create a fresh `gsd/phase-2-safety-floor` branch from main (Phase 1 commits travel via merge).
5. Research findings from Phase 1 worth carrying forward: (a) codebase had zero AI SDK imports at Phase 1 start — Phase 5 COACH-02 will be the first consumer of v6 idioms; (b) current matcher is case-sensitive on .mram extension; (c) rotation runbook uses `vercel env update` atomically except for preview-branch (CLI v51.x limitation).

---
*State initialized: 2026-04-20 after roadmap creation*
*Phase 1 context gathered: 2026-04-20*
*Phase 1 planned: 2026-04-20 (7 plans, verification passed iteration 2)*
*Phase 1 executed: 2026-04-21 (7/7 plans landed, 5/7 verified + 2/7 deferred-human)*
*Phase 2 context gathered: 2026-04-21*
*Phase 2 planned: 2026-04-21 (9 plans, 8 waves, checker iteration 2 passed)*
