---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
last_updated: "2026-04-23T16:58:36.233Z"
progress:
  total_phases: 7
  completed_phases: 2
  total_plans: 24
  completed_plans: 18
  percent: 75
---

# State: Masonic Ritual AI Mentor — v1 Invited-Lodge Milestone

**Last updated:** 2026-04-23 (Phase 3 Plan 02 landed — idb-schema extracted)

## Project Reference

**Core Value:** A Masonic officer can reliably rehearse their ritual parts — at any hour, with no other brother available — and come out of the session more confident that their memorization is accurate to their lodge's working.

**Current Focus:** Phase 03 — Authoring Throughput

**Project type:** Brownfield — the pilot already ships and is in daily use by Shannon.

## Current Position

Phase: 03 (Authoring Throughput) — EXECUTING
Plan: 3 of 8 (Plans 01 + 02 complete; SUMMARIES at `.planning/phases/03-authoring-throughput/03-01-SUMMARY.md` + `03-02-SUMMARY.md`)
**Milestone:** v1 invited-lodge
**Phase:** Phase 2 MERGED to main (PR #68 → merge commit `d2e02cc`, 2026-04-22)
**Plan:** Phase 2 9/9 complete; Phase 3 2/8 complete
**Status:** Executing Phase 03
**Progress:** [████████░░] 75%

```
[█████░░░░░░░░░░░░░░░] 29% (2/7 phases)
```

**Production URLs (both serving Phase 2 code):**

- https://masonicmentor.app (custom domain, TLS auto-provisioned)
- https://masonic-ritual-ai-mentor.vercel.app (Vercel alias, kept)

**LODGE_ALLOWLIST** (8 pilot addresses, production-live):
mcleods777@gmail.com, ajw71681@gmail.com (Amanda), wadeburger@rocketmail.com, bslashstewart@gmail.com, hagiller@gmail.com, flynmcgilvray93@gmail.com, hellostevenbecker@msn.com (note: msn deliverability caveat — may need gmail swap if reports inbox issues), justincopeland67@gmail.com

**Resend sending domain:** `masonicmentor.app` verified via Cloudflare DNS (DKIM+SPF+DMARC); `MAGIC_LINK_FROM_EMAIL=mentor@masonicmentor.app`.

**Next action:** Phase 3 Plan 03-03 (dev-guard extraction, D-15). Plan 03-02 landed on `gsd/phase-3-authoring-throughput` — `src/lib/idb-schema.ts` is now the single source of truth for DB_NAME, DB_VERSION=5, all 6 store constants, shared openDB(), and the PII-free FeedbackTrace interface. `storage.ts` and `voice-storage.ts` both import from it (lockstep dance gone). 414 tests passing, 0 regressions. Plans 03-08 can run; no blockers.

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
| Phase 3 gitignore uses glob form `rituals/_bake-cache/*` + `!rituals/_bake-cache/.gitignore` | Plain directory form would ignore the nested self-documenting .gitignore the same decision D-01 asks to track; glob form satisfies both layers of the belt-and-suspenders pattern | Plan 03-01 execution |
| Phase 3 vitest.config.ts include glob extended to `scripts/**/*.test.{ts,tsx}` | Plans 05-08 put their test scaffolds under `scripts/__tests__/`; without this entry, vitest silently filters them out even when passed as explicit file args | Plan 03-01 execution |
| `voice-storage.ts` re-exports `AUDIO_CACHE_STORE` after migration to `idb-schema.ts` | `src/lib/tts-cloud.ts:1036-1040` imports `AUDIO_CACHE_STORE` from voice-storage pre-D-16; preserving the re-export avoids a grep-and-replace across the codebase while D-16 still eliminates the inline constant. | Plan 03-02 execution |
| Plan 02 test case 3 (consumer parity) simplified to repeated-openDB() | Post-Task-2 both `storage.ts` and `voice-storage.ts` call the same `openDB()` — a storage-first-then-voice-first dance would be tautological. Repeated-open still proves the idempotent-upgrade invariant. | Plan 03-02 execution |

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

**Last significant action:** Phase 3 Plan 02 (idb-schema extraction, AUTHOR-10) executed on 2026-04-23. Two commits on `gsd/phase-3-authoring-throughput`: `43774bd` created `src/lib/idb-schema.ts` (single source of truth: DB_NAME, DB_VERSION=5, 6 store constants, `openDB()`, `FeedbackTrace` interface) and filled the Wave 0 `idb-schema.test.ts` scaffold with 5 passing tests (DB_VERSION constant, all-6-stores-alphabetical, repeated-open parity, v4→v5 data-preserving migration, FeedbackTrace PII-shape check); `a90ffe2` refactored `src/lib/storage.ts` and `src/lib/voice-storage.ts` to import from `./idb-schema` (removed ~120 lines of duplicated inline DB constants + inline openDB + obsolete lockstep comment). voice-storage re-exports `AUDIO_CACHE_STORE` to preserve the pre-D-16 import path used by `tts-cloud.ts`. Full suite: 414 passing + 58 todo; build clean; zero regressions. One Rule-3 deviation (reworded a comment to avoid literal `indexedDB.open(` grep false-positive) documented in `03-02-SUMMARY.md`.

**Resumption cue:** Next action: Plan 03-03 (dev-guard extraction, D-15). The Wave 0 scaffold `src/lib/__tests__/dev-guard.test.ts` is ready; Plan 03-03 will create `src/lib/dev-guard.ts` with `isDev()` / `assertDevOnly()` exports, then rewire `src/app/author/page.tsx:220-233` to use `isDev()`. No blockers.

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
*Phase 3 Plan 01 executed: 2026-04-23 (2/2 tasks, 2 commits, 8 files created, 4 modified, ~10min)*
*Phase 3 Plan 02 executed: 2026-04-23 (2/2 tasks, 2 commits, 1 file created, 3 modified, ~5min)*
