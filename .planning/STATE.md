# State: Masonic Ritual AI Mentor — v1 Invited-Lodge Milestone

**Last updated:** 2026-04-20 (Phase 1 planned, 7 plans ready to execute)

## Project Reference

**Core Value:** A Masonic officer can reliably rehearse their ritual parts — at any hour, with no other brother available — and come out of the session more confident that their memorization is accurate to their lodge's working.

**Current Focus:** Ship the v1 invited-lodge milestone: harden and extend the shipping pilot so Shannon can personally invite 1-3 outside lodges' officers without exposure to surprise AI bills, LLM hallucinations against authoritative ritual text, or an inability to revoke access cleanly.

**Project type:** Brownfield — the pilot already ships and is in daily use by Shannon.

## Current Position

**Milestone:** v1 invited-lodge
**Phase:** Phase 1 planned (7 plans, wave 1–7 serial chain)
**Plan:** 7 PLAN.md files ready
**Status:** Ready to execute — awaiting `/gsd-execute-phase 1`
**Progress:** 0/7 phases complete

```
[░░░░░░░░░░░░░░░░░░░░] 0% (0/7 phases)
```

**Next action:** `/gsd-execute-phase 1` to run plans in D-19 order (noindex → matcher test → landing audit → rotation runbook → iPhone verify → AI SDK codemod → package cleanup).

## Phase Map

| # | Phase | Requirements | Status |
|---|-------|--------------|--------|
| 1 | Pre-invite Hygiene | HYGIENE-01..07 (7) | Planned (7 plans) |
| 2 | Safety Floor | SAFETY-01..09 (9) | Not started |
| 3 | Authoring Throughput | AUTHOR-01..10 (10) | Not started |
| 4 | Content Coverage | CONTENT-01..07 (7) | Not started |
| 5 | Coach Quality Lift | COACH-01..12 (12) | Not started |
| 6 | Admin Substrate & Distribution | ADMIN-01..07 (7) | Not started |
| 7 | Onboarding Polish | ONBOARD-01..05 (5) | Not started |

## Performance Metrics

**Requirements coverage:** 57/57 mapped (100%)
**Phases planned:** 0/7
**Plans executed:** 0
**Plans verified:** 0

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

**Last significant action:** Phase 1 planned via `/gsd-plan-phase 1` on 2026-04-20. Research surfaced two CONTEXT.md corrections (codemod command syntax, matcher case-sensitivity) + a pattern-mapping correction (test path convention) — all resolved via AskUserQuestion before planning. 7 PLAN.md files created + plan-checker revision loop closed at iteration 2 (1 blocker + 3 warnings → 0 issues). VALIDATION.md and PATTERNS.md also created.

**Resumption cue:** Next agent should run `/gsd-execute-phase 1` to execute plans in D-19 order. Plans are strictly serial (wave 1–7 chain).

**Critical context for next agent:**
1. Brownfield milestone — do NOT re-build existing pilot capability (see PROJECT.md Validated)
2. Phase 1 task order locked: 03 noindex → 06 matcher test → 04 landing audit → 07 runbook → 05 iPhone → 02 AI SDK codemod → 01 package cleanup. See 01-CONTEXT.md §D-19.
3. One commit per HYGIENE-XX: `hygiene-NN: imperative` (overrides Conventional-Commits per D-20).
4. Three plans are `autonomous: false` — HYGIENE-04 (human audit), HYGIENE-05 (Shannon iPhone), HYGIENE-07 (Vercel preview rehearsal). Executor must pause for Shannon on these.
5. Research findings worth carrying: (a) codebase has zero AI SDK imports → HYGIENE-02 codemod is effectively a package.json version bump; (b) current matcher is case-sensitive on .mram extension — tests stay on lowercase paths only; (c) rotation runbook uses `vercel env update` (atomic) not rm+add except for preview-branch (CLI v51.x limitation).

---
*State initialized: 2026-04-20 after roadmap creation*
*Phase 1 context gathered: 2026-04-20*
*Phase 1 planned: 2026-04-20 (7 plans, verification passed iteration 2)*
