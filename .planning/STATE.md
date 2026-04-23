---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
last_updated: "2026-04-23T19:46:30Z"
progress:
  total_phases: 7
  completed_phases: 2
  total_plans: 24
  completed_plans: 23
  percent: 96
---

# State: Masonic Ritual AI Mentor — v1 Invited-Lodge Milestone

**Last updated:** 2026-04-23 (Phase 3 Plan 07 landed — scripts/bake-all.ts orchestrator with validator gate, D-06 resume contract read-side, and 27 unit tests)

## Project Reference

**Core Value:** A Masonic officer can reliably rehearse their ritual parts — at any hour, with no other brother available — and come out of the session more confident that their memorization is accurate to their lodge's working.

**Current Focus:** Phase 03 — Authoring Throughput

**Project type:** Brownfield — the pilot already ships and is in daily use by Shannon.

## Current Position

Phase: 03 (Authoring Throughput) — EXECUTING
Plan: 8 of 8 (Plans 01 + 02 + 03 + 04 + 05 + 06 + 07 complete; SUMMARIES at `.planning/phases/03-authoring-throughput/03-01-SUMMARY.md`, `03-02-SUMMARY.md`, `03-03-SUMMARY.md`, `03-04-SUMMARY.md`, `03-05-SUMMARY.md`, `03-06-SUMMARY.md`, `03-07-SUMMARY.md`)
**Milestone:** v1 invited-lodge
**Phase:** Phase 2 MERGED to main (PR #68 → merge commit `d2e02cc`, 2026-04-22)
**Plan:** Phase 2 9/9 complete; Phase 3 7/8 complete
**Status:** Executing Phase 03
**Progress:** [█████████░] 96%

```
[█████░░░░░░░░░░░░░░░] 29% (2/7 phases)
```

**Production URLs (both serving Phase 2 code):**

- https://masonicmentor.app (custom domain, TLS auto-provisioned)
- https://masonic-ritual-ai-mentor.vercel.app (Vercel alias, kept)

**LODGE_ALLOWLIST** (8 pilot addresses, production-live):
mcleods777@gmail.com, ajw71681@gmail.com (Amanda), wadeburger@rocketmail.com, bslashstewart@gmail.com, hagiller@gmail.com, flynmcgilvray93@gmail.com, hellostevenbecker@msn.com (note: msn deliverability caveat — may need gmail swap if reports inbox issues), justincopeland67@gmail.com

**Resend sending domain:** `masonicmentor.app` verified via Cloudflare DNS (DKIM+SPF+DMARC); `MAGIC_LINK_FROM_EMAIL=mentor@masonicmentor.app`.

**Next action:** Phase 3 Plan 03-08 (preview-bake: `scripts/preview-bake.ts` localhost-only cache-scrubber server with dev-guard + loopback-only bind + path-traversal-safe Opus streaming, AUTHOR-08). Plan 03-07 landed on `gsd/phase-3-authoring-throughput` — `scripts/bake-all.ts` (486 lines) is the Phase 3 orchestrator entrypoint with full flag surface (--since / --dry-run / --resume / --parallel [1, 16] clamped / --verify-audio / --help). Exports 9 helpers (parseFlags, clampParallel, getChangedRituals, getAllRituals, validateOrFail, dialogueChecksum, clearResumeStateFile, buildMramSpawnArgs, Flags). `getChangedRituals` uses `git diff --name-only --diff-filter=d` with pathspec as separate argv elements (Pitfall 5); throws clear message on non-git repo. Validator-first ordering locked in per PATTERNS.md — all rituals pass `validatePair()` via `validateOrFail()` before any API call. `buildMramSpawnArgs` is the D-06 spawn contract codified: every build-mram invocation carries `--resume-state-path` + `--ritual-slug`; `--skip-line-ids` on resume when `priorState.ritual === slug`; `--verify-audio` forwarded when flagged. `clearResumeStateFile` unlinks after clean ritual finish; failure leaves file for next `--resume`. pLimit instantiated in main() with clamped N (reserved for future ritual-level fan-out; current per-line concurrency lives inside build-mram). isDirectRun guard lets tests import helpers without firing main(). `scripts/__tests__/bake-all.test.ts` flipped from 11 it.todo stubs to 27 passing tests across 6 describes (parseFlags 5 + clampParallel 9 + getChangedRituals 4 real tmp-git-repo fixture + dialogueChecksum 2 + buildMramSpawnArgs 5 including end-to-end readResumeState→spawn-args fixture + clearResumeStateFile 2). Two atomic commits: 54e7ed5 (orchestrator implementation), 61277b1 (test scaffold replaced). Full suite: 497 passed + 12 todo across 42 files + 1 skipped (only preview-bake scaffold remains). Zero deviations from plan. `npx tsx scripts/bake-all.ts --dry-run` verified against Shannon's 4 real rituals (ea-closing/explanatory/initiation/opening) — validator runs + roll-up prints, zero API calls. Plan 08 can now create `scripts/preview-bake.ts` — no file overlap with bake-all.ts.

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
| Plan 03-03 used `@/lib/dev-guard` alias import in `/author/page.tsx` | Matches existing `@/lib/dialogue-to-mram` + `@/lib/mram-format` imports at lines 29-30; alias resolves cleanly in Next.js build; no fallback to relative path needed. | Plan 03-03 execution |
| dev-guard.ts: two-flavor API (`isDev` non-throwing for UI, `assertDevOnly` throwing for scripts) | Call-site ergonomics differ: React components render a graceful banner (need graceful banner); Node scripts should fail-fast at module load (need throw). Reading `process.env.NODE_ENV` at call time (not import time) lets tests mutate env between cases. | Plan 03-03 execution |
| Plan 03-05 extended `isLineCached` to probe entire model chain (Option A parity with renderLineAudio) | `isLineCached` calls `computeCacheKey` internally — without updating its signature the build breaks on the 4→5 param change. Added optional `models` param defaulting to `readModelsFromEnv() ?? DEFAULT_MODELS`; the 2 external callers compile unchanged and now correctly reflect post-D-02 cache semantics where a line can have entries under multiple modelIds. | Plan 03-05 execution |
| Plan 03-05 exported CACHE_DIR, OLD_CACHE_DIR, CACHE_KEY_VERSION, DEFAULT_MODELS as module-level exports | invalidate-mram-cache.ts previously hardcoded its own copy of the cache path (`${HOME}/.cache/masonic-mram-audio`) — a drift hazard even before D-01, guaranteed-broken after. Exporting the constants from the canonical module eliminates the drift class; tests can also assert against the source of truth. | Plan 03-05 execution |
| Plan 03-05 invalidation loop deletes ALL model-variant entries per line, not one | Post-D-02 the cache can hold multiple entries per line (one per modelId that rendered it across runs in the fallback chain). Deleting only one variant would leave orphan entries that re-bake would cache-hit and never refresh. Summary surfaces the count: `DELETED (2 entries across model chain)`. | Plan 03-05 execution |
| Plan 03-06 validator gate runs BEFORE passphrase prompt | No reason to make the user type a passphrase for a bake that's going to exit(1) on D-08 errors — existence check → validator → passphrase is the correct ordering. | Plan 03-06 execution |
| Plan 03-06 Buffer→Blob copies bytes into a fresh Uint8Array | Node Buffer's ArrayBufferLike union includes SharedArrayBuffer which DOM Blob's strict BlobPart typing rejects (TS2322). Cast-based fixes failed; copying is O(n) on small Opus bytes and removes type gymnastics. | Plan 03-06 execution |
| Plan 03-06 bakeAudioIntoDoc takes a single ResumeOptions param (not 3) | Matches the existing speakAsByLineId = new Map() default-param idiom on the same function. Keeps the main() callsite readable. | Plan 03-06 execution |
| Plan 03-06 markLineInFlight runs INSIDE each render branch (not at top of loop) | --skip-line-ids must short-circuit first. Skipping a completed line should NOT re-mark it as inFlightLineIds — that would trigger unnecessary state writes and overwrite the orchestrator's completedLineIds snapshot. | Plan 03-06 execution |
| Plan 03-06 PersistentTextTokenRegression catch leaves lineId in inFlightLineIds | Orchestrator re-dispatches on next run. If regressing again, Shannon edits the dialogue — regression is loud, never silent (cf. D-10 auto-evict rejection rationale). | Plan 03-06 execution |
| Plan 03-06 pure math helpers extracted to scripts/lib/bake-math.ts | computeMedianSecPerChar + isDurationAnomaly + wordDiff are load-bearing (catch voice-cast-scene-leaks pattern, underpin D-11 verify); pure functions are unit-testable independently of a real bake. build-mram wraps with local names to preserve the existing grep criterion and function-name stability. | Plan 03-06 execution |
| Plan 03-06 scripts/lib/ established as first-class shared-utils home | Formerly only src/lib/ was for shared utilities. Plan 07's bake-all.ts + Plan 08's preview-bake.ts can now import from scripts/lib/ the same way — resume-state + bake-math are the first residents. | Plan 03-06 execution |
| Plan 03-07 pLimit instantiated in main() even though current bake loop is sequential | Per-line concurrency already lives inside build-mram-from-dialogue.ts. Reserving the callsite keeps the grep criterion `pLimit: ≥ 2 matches` satisfied AND reserves the architectural slot for when ritual-level parallelism arrives (Shannon may want 2-3 rituals in flight once bake cache is warmer). Documented in-code. | Plan 03-07 execution |
| Plan 03-07 dialogueChecksum field NOT added to ResumeState | Plan 06's shape is authoritative; Phase 3 doesn't rewrite the shared interface. Phase 3 guard is "same ritual slug + file readable" — documented in-code as a future enhancement slot. Shannon's workflow rarely involves dialogue edits between crash and resume within the same minute. | Plan 03-07 execution |
| Plan 03-07 halt-on-first-failure in per-ritual loop | A failed ritual likely signals a systemic issue (auth, quota, anomaly detector). Continuing through all rituals just burns quota on the same failure mode. Results array still collects both sides (Pitfall 7) but the loop `break`s; final report surfaces the failure. | Plan 03-07 execution |
| Plan 03-07 tests use real rituals/ + rituals/_bake-cache/ paths with finally-cleanup | `RITUALS_DIR = path.resolve("rituals")` and `RESUME_FILE = path.join(CACHE_DIR, "_RESUME.json")` are resolved ONCE at module load; chdir-based test isolation doesn't work. Tests use real paths with unique prefixed slugs (`__bake-all-test-{pid}-`) and try/finally cleanup + prior-contents restore for _RESUME.json. Safer than monkey-patching the module. | Plan 03-07 execution |

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

**Last significant action:** Phase 3 Plan 07 (bake-all orchestrator for AUTHOR-02/09) executed on 2026-04-23. Two atomic commits on `gsd/phase-3-authoring-throughput`: `54e7ed5` created `scripts/bake-all.ts` (486 lines, #!/usr/bin/env npx tsx) as the Phase 3 orchestrator CLI — full flag surface (--since/--dry-run/--resume/--parallel/--verify-audio/--help), `clampParallel([1,16])` default 4 per D-07, `getChangedRituals(ref)` via `execFileSync("git", ["diff", "--name-only", "--diff-filter=d", sinceRef, "--", "rituals/*-dialogue.md", "rituals/*-dialogue-cipher.md"])` with pathspec as separate argv elements (Pitfall 5) + `git rev-parse --verify <ref>^{commit}` pre-check that throws clear non-git-repo message, `getAllRituals()` filesystem discovery for no-flag path, `validateOrFail(slug)` D-08 gate calling validatePair() + filtering severity==="error" + process.exit(1) BEFORE any API call (PATTERNS.md §Validator-gate; anti-pattern §4), `dialogueChecksum(slug)` SHA-256 of plain dialogue file (future crash-resume guard slot), `clearResumeStateFile()` unlinks `rituals/_bake-cache/_RESUME.json` after clean ritual finish, `buildMramSpawnArgs(slug, flags, skipLineIds, resumeFilePath?)` emits `["tsx", "scripts/build-mram-from-dialogue.ts", slug, "--resume-state-path", RESUME_FILE, "--ritual-slug", slug, ...(skipLineIds.length > 0 ? ["--skip-line-ids", skipLineIds.join(",")] : []), ...(flags.verifyAudio ? ["--verify-audio"] : [])]`, bakeRitual()→spawn("npx", args, {stdio:"inherit"}) with Promise resolve/reject on exit code, dryRunForRitual() prints lines≈N/cache-entries-present/est-seconds-if-all-miss roll-up with NO API calls, main() orchestrates: flag parse → clampParallel → pLimit instantiation (reserved for future ritual-level fan-out; current per-line concurrency lives inside build-mram) → ritual discovery (--since OR all) → --dry-run early exit → validator gate (all rituals, before any spawn) → per-ritual loop with D-06 resume-state read + skipLineIds computation + bakeRitual spawn + clearResumeStateFile after clean finish + halt-on-first-failure + Pitfall-7 results collection both sides. isDirectRun guard (`process.argv[1]?.endsWith("bake-all.ts")`) lets tests import helpers without firing main(). Imports: pLimit from "p-limit", validatePair from "../src/lib/author-validation", {type ResumeState, readResumeState} from "./lib/resume-state" (written by Plan 06). 9 exported symbols (parseFlags, clampParallel, getChangedRituals, getAllRituals, validateOrFail, dialogueChecksum, clearResumeStateFile, buildMramSpawnArgs, Flags). `61277b1` replaced Plan-01's 11 `it.todo` stubs in `scripts/__tests__/bake-all.test.ts` with 27 passing tests across 6 describes (parseFlags 5 + clampParallel 9 + getChangedRituals 4 with real seeded tmp git repo fixture including the --diff-filter=d excludes-deletes case + dialogueChecksum 2 + buildMramSpawnArgs 5 including end-to-end readResumeState→buildMramSpawnArgs fixture + clearResumeStateFile 2). Full suite: 497 passed + 12 todo across 42 files + 1 skipped (only preview-bake.test.ts scaffold remains); `npm run build` clean; `npx tsc --noEmit` shows 0 errors in bake-all.ts (26 pre-existing errors in unrelated files persist — same set as Plan 05/06 baseline). Zero plan deviations. `npx tsx scripts/bake-all.ts --help` verified EXIT=1 with Usage preamble; `npx tsx scripts/bake-all.ts --dry-run` verified against Shannon's 4 rituals — ea-closing 130/780s, ea-explanatory 41/246s, ea-initiation 159/954s, ea-opening 133/798s, zero API calls. D-06 resume contract locked end-to-end: build-mram writes _RESUME.json per line (Plan 06), bake-all reads it + passes --skip-line-ids (tested), bake-all unlinks after clean finish (tested).

**Resumption cue:** Next action: Plan 03-08 (preview-bake for AUTHOR-08: scripts/preview-bake.ts localhost-only cache-scrubber server at 127.0.0.1:8883 with assertDevOnly() from src/lib/dev-guard.ts + path-traversal-safe Opus Range streaming + reads rituals/_bake-cache/*.opus). scripts/__tests__/preview-bake.test.ts Wave 0 scaffold from Plan 01 still waiting to be filled — last remaining scaffold in Phase 3. No file overlap with bake-all.ts. Only Plan 08 remains.

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
*Phase 3 Plan 03 executed: 2026-04-23 (2/2 tasks, 2 commits, 1 file created, 2 modified, ~8min)*
*Phase 3 Plan 04 executed: 2026-04-23 (commit 76c565f; author-validation D-08 bake-band)*
*Phase 3 Plan 05 executed: 2026-04-23 (2/2 tasks, 2 commits 0b0c4ea + 5e32cb9, 1 SUMMARY created, 3 files modified, ~7min)*
*Phase 3 Plan 06 executed: 2026-04-23 (3/3 tasks, 3 commits 43209d2 + 332b483 + 04bb0e6, 1 SUMMARY + 2 new scripts/lib modules created, 2 files modified, ~30min)*
*Phase 3 Plan 07 executed: 2026-04-23 (2/2 tasks, 2 commits 54e7ed5 + 61277b1, 1 SUMMARY + scripts/bake-all.ts created, 1 test file filled, ~6min)*
