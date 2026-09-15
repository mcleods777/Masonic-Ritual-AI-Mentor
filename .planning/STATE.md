---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
last_updated: "2026-09-03T09:30:16-05:00"
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

**Current Focus:** Phase 4 — clean content diagnostics and release verification

**Project type:** Brownfield — the pilot already ships and is in daily use by Shannon.

## Current Position

**Milestone:** v1 invited-lodge
**Code-verified phases:** 1, 2, and 3
**Human verification:** still open; code-complete does not mean invite-ready
**Repository state:** Phase 4 work is isolated on `phase4/content-manifest-diagnostics`; the diagnostics slice is committed and the release-verifier slice is ready to checkpoint
**Next action:** checkpoint the verified v3 release gate, then run it locally against the four private `.mram` assets and restore a valid bake manifest before human audio scrubbing. Do not merge or cherry-pick `gsd/phase4`.

## Phase Map

| # | Phase | Requirements | Status |
|---|-------|--------------|--------|
| 1 | Pre-invite Hygiene | HYGIENE-01..07 (7) | Code complete; 2 human UAT pending |
| 2 | Safety Floor | SAFETY-01..09 (9) | Code complete; 4/8 human UAT blocked |
| 3 | Authoring Throughput | AUTHOR-01..10 (10) | Code complete; 4 human UAT pending |
| 4 | Content Coverage | CONTENT-01..07 (7) | In progress; diagnostics + sanitized v3 release gate complete |
| 5 | Coach Quality Lift | COACH-01..12 (12) | Not started |
| 6 | Admin Substrate & Distribution | ADMIN-01..07 (7) | Not started |
| 7 | Onboarding Polish | ONBOARD-01..05 (5) | Not started |

## Performance Metrics

**Requirements coverage:** 57/57 mapped (100%)
**Plans executed:** 26 across Phases 1-3
**Phase 2 automated verification:** 9/9 requirements; 615-test current repository suite passes
**Phase 3 automated verification:** 11/11 must-haves; 615-test current repository suite passes
**Repository gates (2026-09-03):** private-tree guard passes; standalone typecheck passes; lint 0 errors / 107 warnings; 643/643 tests pass; production build passes

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

### Remaining Readiness Risk

- Phase 4's old branch is contaminated by a large unrelated tooling divergence and must not be merged or cherry-picked.
- Local diagnostics detect 4 `.mram` assets but no `_bake-cache/_manifest.json`; baked-source currentness is therefore unverified.
- The v3 release gate is implemented, but it has not been run against the four real private `.mram` assets because no passphrase was accessed during this slice.
- No CONTENT-01..07 requirement is complete until the aggregate gate passes on the real assets, the bake manifest is restored/current, human audio scrubbing is complete, and actual content coverage is verified.

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

**Last significant action (2026-09-03):** Replaced the leaking v1-only verifier with a sanitized v3 binary/payload/audio verifier and aggregate `rituals/*.mram` release gate. Added fail-closed symlink, empty-document, checksum, metadata, Ogg/Opus, CLI-output, and passphrase-EOF coverage. Fable 5.1 returned GO with no blocking corrections; both explicit follow-ups were implemented.

**Verified current gates:**

- `npm run check:private-tree`: pass; an isolated-index probe confirms staged `rituals/` paths are rejected.
- `npm run typecheck`: pass.
- `npm run lint`: 0 errors, 107 warnings.
- `npm run test:run`: 643/643 pass.
- `npm run build`: pass.
- Aggregate-only local smoke: schema v1, manifest missing, 4 ritual assets detected, 0 recorded/current entries.

**Resumption cue:** Run `npm run verify:content` locally with the private passphrase (interactive or `MRAM_PASSPHRASE`), record only the sanitized aggregate result, then restore/validate `_bake-cache/_manifest.json` and proceed to human audio scrubbing. Use the old branch only as read-only design input.

**Branch rule:** Treat `gsd/phase4` as read-only reference material. Do not merge or cherry-pick it; its product work is mixed with a large unrelated tooling divergence.

**Approval boundary:** Do not push, merge, deploy, delete, or rewrite history without Shannon's explicit approval.

---
*State reconciled against Phase 2 and Phase 3 verification artifacts: 2026-09-02*
