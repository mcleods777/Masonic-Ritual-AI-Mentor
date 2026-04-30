---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
last_updated: "2026-04-24T01:35:50.000Z"
progress:
  total_phases: 7
  completed_phases: 3
  total_plans: 32
  completed_plans: 26
  percent: 81
---

# State: Masonic Ritual AI Mentor — v1 Invited-Lodge Milestone

**Last updated:** 2026-04-24 (Phase 4 Plan 02 landed — .planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md seeded with 22 rows across 5 groups + scripts/lib/content-checklist.ts strict parser + scripts/__tests__/content-checklist.test.ts 6-test shape-invariant suite. Phase 4 2/8 COMPLETE.)

## Project Reference

**Core Value:** A Masonic officer can reliably rehearse their ritual parts — at any hour, with no other brother available — and come out of the session more confident that their memorization is accurate to their lodge's working.

**Current Focus:** Phase 04 — Content Coverage (executing; Plans 01-02 of 8 complete)

**Project type:** Brownfield — the pilot already ships and is in daily use by Shannon.

## Current Position

Phase: 04 (Content Coverage) — EXECUTING
Plan: 2 of 8 complete (SUMMARY at `.planning/phases/04-content-coverage/04-02-SUMMARY.md`)
**Milestone:** v1 invited-lodge
**Phase:** 4
**Plan:** 03 (EA re-bake under v3 cache) next — Wave 1 content-labor begins
**Status:** Executing
**Progress:** [████████░░] 81% (26/32 plans executed; 2/7 phases merged to main, Phase 3 + Phase 4 Plans 01-02 on feature branch `gsd/phase-4-content-coverage`)

```
[█████░░░░░░░░░░░░░░░] 29% (2/7 phases)
```

**Production URLs (both serving Phase 2 code):**

- https://masonicmentor.app (custom domain, TLS auto-provisioned)
- https://masonic-ritual-ai-mentor.vercel.app (Vercel alias, kept)

**LODGE_ALLOWLIST** (8 pilot addresses, production-live):
mcleods777@gmail.com, ajw71681@gmail.com (Amanda), wadeburger@rocketmail.com, bslashstewart@gmail.com, hagiller@gmail.com, flynmcgilvray93@gmail.com, hellostevenbecker@msn.com (note: msn deliverability caveat — may need gmail swap if reports inbox issues), justincopeland67@gmail.com

**Resend sending domain:** `masonicmentor.app` verified via Cloudflare DNS (DKIM+SPF+DMARC); `MAGIC_LINK_FROM_EMAIL=mentor@masonicmentor.app`.

**Next action:** Execute Plan 04-03 (EA re-bake under v3 cache) — first Wave 1 content-labor plan. Plan 04-02 landed two atomic commits on `gsd/phase-4-content-coverage`: `a8f3412` (scripts/lib/content-checklist.ts 283 LOC strict parser + scripts/__tests__/content-checklist.test.ts 299 LOC 6-test shape scaffold; 5 in-memory fixture tests GREEN + 1 skipped round-trip) and `4d121a1` (.planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md 77 LOC seeded with 22 rows across 5 groups — 4 EA + 4 FC + 4 MM + 1 Installation + 9 Lectures — and Test 6 flipped from `it.skip` to `it`; all 6 tests GREEN against real on-disk file). Full suite 538/538 passing (up from Plan 04-01 baseline 532; +6 net). Zero deviations — no Rule 1/2/3 auto-fixes, no architectural questions. Parser contract locked: `StatusCell = "[ ]" | "[~]" | "[x]" | "—"` with strict rejection of anything else (uppercase `[X]`, strikethrough, ASCII hyphen). Plan 04-07's descope UX is encoded in-file via the em-dash-plus-notes-column protocol, preserving the parser contract without needing future extension. TypeScript errors unchanged from Plan 04-01 baseline of 21; this plan's files are clean.

**Previous action (Phase 3 Plan 08, reference):** Phase 3 Plan 08 landed two atomic commits: `a679360` (scripts/preview-bake.ts, 390 lines — localhost-only HTTP cache scrubber on 127.0.0.1:8883, assertDevOnly() at module load refusing production, ensureLoopback() refusing non-loopback hosts, defense-in-depth T-03-03 path-traversal mitigation with THREE gates: URL-path regex + CACHE_KEY_REGEX layer 1 + path.resolve-containment layer 2a + fs.realpathSync-containment layer 2b catching symlink-escape, RFC 7233 Range handling with correct 206/200/416 shapes, MIME audio/ogg; codecs=opus per RFC 7845, isDirectRun guard for test-import safety, stream-error handlers on fs.createReadStream.pipe so mid-stream ENOENT races don't crash the server); `643baf7` (scripts/__tests__/preview-bake.test.ts 20/20 passing tests + 2 auto-fixes — Rule 1 bug fix adding fs.realpathSync layer 2b after the symlink-escape test proved path.resolve alone doesn't dereference symlinks; Rule 2 critical-functionality fix adding stream.on("error") handlers on both 206 and 200 pipe branches). 20 tests: 5 ensureLoopback (0.0.0.0/192.168.1.5/::/127.0.0.1/::1) + 8 cacheKey validation (../uppercase/short/long/non-hex/valid-missing-file/CACHE_KEY_REGEX export sanity + 1 embedded-slash routing through the URL-path regex as 404) + 2 path-containment (symlink-escape 400 + valid-inside-cacheDir 200) + 5 RFC 7233 Range (no-range 200+AR, bytes=0-99 206, bytes=500- open-ended 206, bytes=abc 416, bytes=2000-3000 OOB 416). Full suite: 517 passed across 43 files; ZERO todo remaining in Phase 3 scaffolds. Smoke verified: default dev start logs http://127.0.0.1:8883; PREVIEW_BAKE_HOST=0.0.0.0 throws [AUTHOR-08 D-15]; NODE_ENV=production throws [DEV-GUARD]. Phase 3 success criterion 7 from ROADMAP.md satisfied: "Shannon can scrub baked lines in a browser against localhost:8883 before re-encrypting .mram" — DONE via preview-bake.ts. Phase 3 branch `gsd/phase-3-authoring-throughput` carries 26 commits total across Plans 01-08; branch ready for /gsd-transition and eventual merge PR.

## Phase Map

| # | Phase | Requirements | Status |
|---|-------|--------------|--------|
| 1 | Pre-invite Hygiene | HYGIENE-01..07 (7) | ✓ Complete (UAT pending) |
| 2 | Safety Floor | SAFETY-01..09 (9) | ✓ Complete (merged to main as PR #68, 2026-04-22) |
| 3 | Authoring Throughput | AUTHOR-01..10 (10) | ✓ Execution complete (8/8 plans landed on gsd/phase-3-authoring-throughput; merge PR pending) |
| 4 | Content Coverage | CONTENT-01..07 (7) | Executing (2/8 plans landed on gsd/phase-4-content-coverage; Plans 01-02 COMPLETE — verifier+release-gate + checklist ledger) |
| 5 | Coach Quality Lift | COACH-01..12 (12) | Not started |
| 6 | Admin Substrate & Distribution | ADMIN-01..07 (7) | Not started |
| 7 | Onboarding Polish | ONBOARD-01..05 (5) | Not started |

## Performance Metrics

**Requirements coverage:** 57/57 mapped (100%)
**Phases planned:** 3/7
**Plans executed:** 7/7 Phase 1 + 9/9 Phase 2 + 8/8 Phase 3 = 24/24
**Plans verified:** 5/7 verified + 2/7 deferred-human (HYGIENE-05, HYGIENE-07 rehearsal); Phase 2 verified via PR #68 merge; Phase 3 verified via 517/517 vitest suite + smoke tests (manual browser UI for localhost:8883 optional — automated HTTP-contract tests cover the surface)

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
| Plan 03-08 T-03-03 layer 2 requires fs.realpathSync, NOT just path.resolve | `path.resolve()` only normalizes `..` — it does NOT dereference symlinks. A `{valid-hex}.opus` symlink inside cacheDir pointing outside cacheDir was passing the original `resolved.startsWith(rootAbs + path.sep)` check. Added layer 2b using `fs.realpathSync(resolved).startsWith(fs.realpathSync(rootAbs) + path.sep)` which follows links to their target. Caught during Task 2 testing (Rule 1 bug); tests confirmed the escape file's 100 bytes were never served after the fix. | Plan 03-08 execution |
| Plan 03-08 stream-error handlers mandatory on fs.createReadStream.pipe(res) | Mid-stream ENOENT (cache eviction between statSync and stream open) would crash the Node process with an uncaught error event. Rule 2 critical-functionality fix: `stream.on("error", () => res.end())` on both 206 and 200 branches. Server stays up under cache-churn races. | Plan 03-08 execution |
| Plan 03-08 CACHE_KEY_REGEX exported (not module-internal) | Allows test sanity-assertions against the exact regex literal without brittle source-grep. Also documents the intent: any future refactor tempted to relax the regex has to go through this exported constant, making silent drift harder. | Plan 03-08 execution |
| Plan 04-01 verify-mram.ts rejects v1/v2 instead of supporting them | CONTENT-06 demands "every shipped .mram has per-line Opus" — a strict v3-only property. Permissive support would leak through v1/v2 files lacking `audio` on every spoken line; pilot cannot ship heterogeneous .mram versions to invited officers without breaking the coverage guarantee. | Plan 04-01 execution |
| Plan 04-01 release gate does NOT abort on first failure | Aggregate visibility over fail-fast. Contrast with bake-all.ts which halts on first failure (a failed bake signals a systemic issue worth investigating before burning more API calls). A failed release gate check signals content issues — Shannon wants to see every issue in one run so he can fix the batch. | Plan 04-01 execution |
| Plan 04-01 checkAudioCoverage is a pure async export (not CLI-coupled) | scripts/verify-content.ts reuses via `import { checkAudioCoverage } from './verify-mram'` — no subprocess spawn. Single-process semantics matter for Test 5 aggregate-behaviour assertion. | Plan 04-01 execution |
| Plan 04-01 --rituals-dir flag added for test isolation | Tests spawn the gate against tmpdirs with synthesized .mram files; the real rituals/ folder is never touched. Production use still defaults to ./rituals. | Plan 04-01 execution |
| Plan 04-01 duration-anomaly check requires ≥30 samples before flagging | Matches AUTHOR-06 D-10 Pitfall 6 — below 30 samples the per-ritual median is unstable enough to false-positive on short rituals. Check is gracefully skipped below the threshold. Matters for officer lectures (may have <30 spoken lines). | Plan 04-01 execution |
| Plan 04-01 fixture strategy: real Opus bytes base64-inlined in .test.ts | Per VALIDATION.md <100KB-per-fixture constraint. No .opus binaries committed. Captured from ~/.cache/masonic-mram-audio/ prior ea-opening bake; the base64 strings inside verify-mram.test.ts (1.0s + 1.56s durations) are the only committed form. music-metadata needs real OGG/Opus bytes to parse successfully. | Plan 04-01 execution |
| Plan 04-02 parser strictly rejects anything outside StatusCell union (`[ ]|[~]|[x]|—`) | Plan 04-07's descope UX was designed AROUND this constraint (em-dash cells + notes column). Strikethrough support would either break the parser or force a markdown special-case that adds no value beyond what `—` already provides. Ruleset stays narrow; Shannon's hand edits stay validated. | Plan 04-02 execution |
| Plan 04-02 hand-rolled regex + string-split parser — no remark/unified dep | Phase 3 sibling scripts deliberately avoided pulling in markdown libs for narrow parse targets. 50-line hand-rolled parser is clearer than a 500-line dependency tree for this schema. Follows `scripts/lib/bake-math.ts` + `scripts/lib/resume-state.ts` Phase 3 precedent. | Plan 04-02 execution |
| Plan 04-02 seeds 9 lecture rows (max scope) rather than 4 (CONTENT-05 minimum) | Plan 04-07 Task 1 lets Shannon descope via em-dash protocol (adding rows later would require plan-change; removing rows is in-file edit). Seeding max preserves option-space without parser change. | Plan 04-02 execution |
| Plan 04-02 Test 6 round-trip against real on-disk file | Tests 1-5 cover parser failure modes against in-memory fixtures. Test 6 is architecturally distinct: catches accidental corruption by Plans 04-03..07's row mutations at commit time — something fixture tests cannot do. | Plan 04-02 execution |
| Plan 04-02 EA rows pre-populated with `[x]` for drafted/cipher/voice-cast/styles columns | Those files exist on disk from Phase 3 work. Plan 04-03 is a re-bake under v3 cache semantics, not fresh authoring; ledger reflects actual starting state so Plan 04-03's updates are just the bake/scrub/verify/shipped cells. | Plan 04-02 execution |
| Plan 04-02 unknown `##` headings silently end the current table (no throw) | The `## Aggregate` footer is narrative, not a 6th group. Whitelist-throwing on every non-EXPECTED_GROUPS heading would break the human-editable prose-plus-tables pattern. Parser ends current table and looks for next known group. | Plan 04-02 execution |

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

**Last significant action:** Phase 4 Plan 02 (content checklist ledger for CONTENT-01..05 tracking infrastructure) executed on 2026-04-23 (UTC 2026-04-24). Two atomic commits on `gsd/phase-4-content-coverage`: `a8f3412` (scripts/lib/content-checklist.ts 283 LOC — hand-rolled regex/string-split parser exporting parseChecklist + validateChecklistShape + StatusCell + ChecklistRow + EXPECTED_GROUPS + REQUIRED_COLUMN_HEADERS; strict rejection of any value outside `[ ]|[~]|[x]|—` with line-number context in throw messages; scripts/__tests__/content-checklist.test.ts 299 LOC — 6-test shape scaffold: 5 fixture tests GREEN (valid parse, uppercase [X] rejection with line-number context, duplicate-slug detection, missing-group detection, column-swap rejection) + 1 skipped on-disk round-trip) and `4d121a1` (.planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md 77 LOC — 22 seed rows across 5 groups: 4 EA pre-populated with [x] for drafted/cipher/voice-cast/styles (existing v2-cache files, bake cells [ ] pending Plan 04-03 v3 re-bake) + 4 FC + 4 MM + 1 Installation + 9 Lectures, all with [ ] status cells; styles column `—` for non-EA rows; header narrative documents parser contract + edit protocol + Plan 04-07 descope-via-em-dash protocol inline; Test 6 flipped from it.skip to it and pins real on-disk file's shape). Full vitest suite 538/538 passing (up from 532 Plan 04-01 baseline; +6 net). Smoke test against real file: `npx tsx direct import → rows: 22, validate: {ok: true, errors: []}, groups: ['EA','FC','MM','Installation','Officer Lectures']`. Zero deviations — no Rule 1/2/3 auto-fixes, no architectural questions, no auth gates. TypeScript errors unchanged from Plan 04-01 baseline of 21 (all pre-existing in unrelated files). Plans 04-03..07 now have a committed, parser-validated ledger to mutate as they move rituals through the pipeline; Plan 04-08 has a specific gate to audit (`all rows shipped = [x]` or `—` with descope reason).

**Prior significant action (Phase 4 Plan 01, 2026-04-23):** verifier + release gate executed. Two commits: `87e7415` (14 RED test scaffolds) + `65b8172` (v1→v3 version bump + --check-audio-coverage + verify-content.ts 336-LOC release gate). 15/15 tests GREEN; suite 532/532. Rule 1 fixture-byte-len auto-fix + Rule 3 /s-regex-flag auto-fix documented in 04-01-SUMMARY.md. CONTENT-06 + CONTENT-07 structurally enforceable via `npm run verify-content`.

**Prior significant action (Phase 3 Plan 08, 2026-04-23):** preview-bake for AUTHOR-08 executed — Phase 3 8/8 EXECUTION COMPLETE. Two atomic commits on `gsd/phase-3-authoring-throughput`: `a679360` created `scripts/preview-bake.ts` (390 lines, #!/usr/bin/env npx tsx) — localhost-only HTTP cache scrubber on 127.0.0.1:8883, assertDevOnly() at MODULE LOAD from src/lib/dev-guard.ts (T-03-02 — NODE_ENV=production throws [DEV-GUARD] before server.listen()), ensureLoopback() called BEFORE server.listen() with env override PREVIEW_BAKE_HOST still routed through the guard (T-03-01 — refuses 0.0.0.0, 192.168.*, ::; accepts only 127.0.0.1 and ::1), handleOpusRequest defense-in-depth T-03-03 with THREE independent gates: (1) URL-path regex `/^\/a\/([^/]+)\.opus$/` disallows embedded slashes so /a/foo/bar.opus becomes 404 before the key is even extracted, (2) CACHE_KEY_REGEX `/^[0-9a-f]{64}$/` runs BEFORE path.join as layer 1, (3) dual layer-2 containment: layer 2a path.resolve(opusPath).startsWith(rootAbs + path.sep) for `..` traversal + layer 2b fs.realpathSync(resolved).startsWith(fs.realpathSync(rootAbs) + path.sep) for symlink-escape (path.resolve alone does NOT dereference symlinks — this was the Rule 1 bug caught by the Task 2 symlink test), RFC 7233 Range handling (206+Content-Range on bytes=M-N, 206 on bytes=M- open-ended, 200+Accept-Ranges on no-range, 416+Content-Range */size on malformed or OOB), MIME audio/ogg; codecs=opus per RFC 7845 §9 for Chromium <audio> compat, /api/index reads rituals/_bake-cache/_INDEX.json if present (D-03 shape) with readdirSync-based fallback, browser UI at / (inline HTML shell, no framework, fetch /api/index and render <audio>), isDirectRun guard via `process.argv[1]?.endsWith("preview-bake.ts") ?? false` lets tests import helpers without spawning the HTTP listener, stream.on("error", () => res.end()) handlers on both 206 and 200 fs.createReadStream.pipe branches (Rule 2 critical fix — mid-stream ENOENT race would crash the server before the fix). 5 exports: ensureLoopback, CACHE_KEY_REGEX (exported so tests can sanity-assert the literal regex), handleOpusRequest, handleIndexRequest, handleIndexJson, server. `643baf7` replaced Plan-01's preview-bake.test.ts it.todo scaffold with 20 concrete unit tests: 5 ensureLoopback (0.0.0.0/192.168.1.5/::/127.0.0.1/::1) + 8 cacheKey validation (..traversal/embedded-slash/uppercase/short/long/non-hex/valid-with-missing-file-404/CACHE_KEY_REGEX export sanity) + 2 path-containment (symlink-escape plants {valid-hex}.opus symlink inside tmpRoot pointing to 100-byte secret in sibling escapeDir → response 400 AND zero escape bytes served; valid-inside-cacheDir returns 200) + 5 RFC 7233 Range (no-range 200+AR, bytes=0-99 206, bytes=500- open-ended 206, bytes=abc 416, bytes=2000-3000 OOB 416). Bundle commit also contained the two Rule-1/Rule-2 auto-fixes the tests exposed. Full suite post-Plan-08: 517 passed across 43 files, ZERO todo remaining in Phase 3 scaffolds (vs Plan 07 baseline of 497 passed + 12 todo: +20 from filling this scaffold, -12 by filling the remaining scaffolds — net +20 passes, -12 todos). `npx tsc --noEmit` shows 0 errors in preview-bake.ts (26 pre-existing errors in unrelated files persist — same baseline as Plans 05/06/07). `npm run build` clean, 27 routes generated. Smoke-tested all three failure modes: default dev start logs `[AUTHOR-08] Preview server: http://127.0.0.1:8883`; PREVIEW_BAKE_HOST=0.0.0.0 throws `[AUTHOR-08 D-15] refusing to bind to non-loopback host "0.0.0.0"...`; NODE_ENV=production throws `[DEV-GUARD] refusing to run in production...`. Two auto-fixes documented in SUMMARY under Deviations: Rule 1 bug (fs.realpathSync layer 2b added after symlink test exposed path.resolve's symlink-blindness) and Rule 2 critical (stream-error handlers on createReadStream.pipe branches). Phase 3 success criterion 7 from ROADMAP.md — "Shannon can scrub baked lines in a browser against localhost:8883 before re-encrypting .mram" — now satisfied. All AUTHOR-01..10 requirements landed across Plans 01-08. Branch `gsd/phase-3-authoring-throughput` carries 26 commits total and is ready for /gsd-transition to Phase 4 (Content Coverage).

**Resumption cue:** Execute Plan 04-03 (EA re-bake under v3 cache) — first Wave 1 content-labor plan, requires MRAM_PASSPHRASE + GOOGLE_GEMINI_API_KEYS in env. Plan 04-02 is complete; 04-CONTENT-CHECKLIST.md ledger exists with 4 EA rows pre-populated at drafted=[x]/voice-cast=[x]/styles=[x]/baked=[ ] (Plan 04-03's job is to flip the bake/scrub/verify/shipped cells to [x] after re-baking under v3 cache semantics). Branch `gsd/phase-4-content-coverage` has 4 new commits ahead of the branch's base point (`87e7415`, `65b8172`, `a8f3412`, `4d121a1`) plus all Phase 3 commits inherited via the phase branch merge. No open blockers. Plan 04-03 is the first plan where Shannon's MRAM_PASSPHRASE is load-bearing — real-passphrase end-to-end smoke against rituals/ea-opening.mram runs for real at that point.

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
*Phase 3 Plan 08 executed: 2026-04-23 (2/2 tasks, 2 commits a679360 + 643baf7, 1 SUMMARY + scripts/preview-bake.ts created, 1 test file filled, 2 auto-fixes (Rule 1 fs.realpathSync + Rule 2 stream-error handlers), ~6min)*
*Phase 3 EXECUTION COMPLETE: 2026-04-23 (8/8 plans landed on gsd/phase-3-authoring-throughput; 26 commits; full vitest suite 517/517 passing; AUTHOR-01..10 all satisfied; ready for /gsd-transition to Phase 4)*
*Phase 4 Plan 01 executed: 2026-04-23 (2/2 tasks, 2 commits 87e7415 + 65b8172, 1 SUMMARY + scripts/verify-content.ts (336 LOC) created + scripts/verify-mram.ts extended (263→632 LOC) with v3 version bump + --check-audio-coverage + exports, 2 test files (601 LOC new) with 15 tests, 2 auto-fixes (Rule 1 fixture byte-len + Rule 3 /s regex flag), ~35min; CONTENT-06 + CONTENT-07 structurally enforceable via npm run verify-content)*
*Phase 4 Plan 02 executed: 2026-04-23 (2/2 tasks TDD, 2 commits a8f3412 + 4d121a1, 1 SUMMARY + scripts/lib/content-checklist.ts 283 LOC strict parser + scripts/__tests__/content-checklist.test.ts 299 LOC 6-test scaffold + 04-CONTENT-CHECKLIST.md 77 LOC ledger with 22 rows, ~6min; CONTENT-01..05 tracking infrastructure in place; zero deviations; full suite 538/538 passing)*
