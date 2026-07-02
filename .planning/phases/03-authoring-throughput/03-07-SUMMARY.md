---
phase: 03-authoring-throughput
plan: 07
subsystem: authoring-pipeline
tags: [node-http, path-containment, http-range, dev-guard, vitest]

# Dependency graph
requires:
  - phase: 03-authoring-throughput
    plan: 01
    provides: src/lib/dev-guard.ts (isDev, assertDevOnly)
  - phase: 03-authoring-throughput
    plan: 02
    provides: CACHE_DIR relocated to rituals/_bake-cache (D-06), exported from render-gemini-audio.ts
provides:
  - scripts/preview-bake.ts — localhost-only (127.0.0.1:8883) node:http scrubber server for cached Opus renders, dev-only + loopback-only by construction
  - handleOpusRequest / handleIndexJson / handleIndexRequest / ensureLoopback / CACHE_KEY_REGEX exported for tests and future reuse
  - D-08 tier-aware /api/index response shape (tier passthrough) with directory-listing fallback for when the Wave 4 index-writer (03-08) hasn't run yet
  - Best-effort absorption of the existing informal rituals/{slug}-review.json per-line review workflow into the index response
  - scripts/__tests__/preview-bake.test.ts — 27-test containment/Range/index suite
affects: [03-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Three-layer path containment for content-addressed file serving: regex gate before path.join, path.resolve() startsWith containment, fs.realpathSync() symlink-escape containment"
    - "Dev-only + loopback-only standalone node:http script: assertDevOnly() at module load, ensureLoopback(host) before server.listen()"
    - "isDirectRun guard (process.argv[1]?.endsWith(...)) so importing a script's exports for tests never starts the HTTP listener"
    - "Best-effort sidecar merge: a missing or malformed adjunct JSON file (rituals/{slug}-review.json) must never fail the primary response — return null/omit, never throw"

key-files:
  created:
    - scripts/preview-bake.ts
    - scripts/__tests__/preview-bake.test.ts
  modified: []

key-decisions:
  - "Imported CACHE_DIR from scripts/render-gemini-audio.ts instead of re-deriving path.resolve('rituals/_bake-cache') a second time — the plan's read_first explicitly required this to avoid a second, potentially divergent, hardcoded path"
  - "handleIndexJson takes an explicit ritualsDir parameter (defaulting to path.dirname(cacheDir)) so tests can point review-file lookups at a temp dir independent of the cache-dir temp fixture"
  - "Review-file merge is keyed by String(lineId) against the review JSON's lines map (matching the observed rituals/*-review.json shape: {version, updatedAt, lines: {[lineId]: {status, note, audioHash, approvedAt, flaggedAt}}}) — read-only inspection of rituals/ea-opening-review.json confirmed this shape before implementing"
  - "[fallback] / approved / flagged badges added to the scrub-page HTML as small inline <span> elements rather than a larger UI rework — matches the plan's acceptance criterion ('a [fallback] badge in the HTML is sufficient')"
  - "Task 2's test suite could not follow a strict RED-then-GREEN sequence: the plan's own task ordering builds the server in Task 1 (committed first) and its test suite in Task 2 (committed second), so all 27 tests passed on first run against the already-correct Task 1 port. Documented under TDD Gate Compliance below rather than force-fitting an artificial failing state."

patterns-established:
  - "Content-addressed file server containment triple: regex → path.resolve → fs.realpathSync, each layer catching a different bypass class (malformed key / .. traversal / symlink escape)"

requirements-completed: [AUTHOR-08]

# Metrics
duration: 15min
completed: 2026-07-02
---

# Phase 3 Plan 7: Preview-Bake Scrubber Server Summary

**Ported the abandoned branch's audited `preview-bake.ts` (127.0.0.1:8883 node:http scrubber with 3-layer path containment and HTTP Range support) onto the current cache location and D-08 tier-aware index shape, absorbing Shannon's existing per-line review-JSON workflow into the index response.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-02T11:47:50-05:00 (first commit after prior wave)
- **Completed:** 2026-07-02T11:57:29-05:00
- **Tasks:** 2
- **Files modified:** 2 (both created)

## Accomplishments

- `scripts/preview-bake.ts` (524 lines) — standalone `node:http` server bound to `127.0.0.1:8883`, dev-only (`assertDevOnly()` at module load) and loopback-only (`ensureLoopback` refuses any host but `127.0.0.1`/`::1`) by construction
- Three independent path-containment layers preserved exactly from the audited reference: `CACHE_KEY_REGEX` gate before `path.join`, `path.resolve()` startsWith containment, `fs.realpathSync()` symlink-escape containment
- HTTP Range support: 206 partial content with `Content-Range`, 416 on malformed/out-of-bounds ranges, 200 + `Accept-Ranges` on full-body requests
- `CACHE_DIR` imported from `render-gemini-audio.ts` rather than re-derived — server can never drift from where the bake pipeline actually writes `.opus` files
- `/api/index` reads the D-08 tier-aware `_INDEX.json` shape when present (passes `tier: "premium" | "fallback"` through per entry) and falls back to a directory listing of the cache dir when the manifest writer (Wave 4, plan 03-08) hasn't run yet — verified Wave 3 has no hard dependency on 03-08
- Best-effort merge of `rituals/{slug}-review.json` (Shannon's existing informal per-line review workflow — inspected `rituals/ea-opening-review.json` and `rituals/ea-closing-review.json` to confirm the `{status, note, audioHash, approvedAt, flaggedAt}` shape) into the index response; a missing or malformed review file is silently omitted, never fails the index
- Scrub-page HTML shows `[fallback]`/`approved`/`flagged` badges per line when the corresponding data is present
- 27-test suite (`scripts/__tests__/preview-bake.test.ts`) covering all seven plan-required behavior groups plus tier-passthrough and review-merge cases; full repo suite (45 files, 491 tests) green

## Task Commits

Each task was committed atomically:

1. **Task 1: Port preview-bake.ts server with cache-location + tier-index updates** — `2a7fa62` (feat)
2. **Task 2: Port the 20-test containment/Range suite** — `afa54ae` (test)

**Plan metadata:** committed alongside this SUMMARY (worktree mode — orchestrator handles the shared-file metadata commit after merge)

## Files Created/Modified

- `scripts/preview-bake.ts` — new; the scrubber server. Exports `ensureLoopback`, `CACHE_KEY_REGEX`, `handleOpusRequest`, `handleIndexRequest`, `handleIndexJson`, `server` for tests/reuse
- `scripts/__tests__/preview-bake.test.ts` — new; 27 tests across `ensureLoopback`, production refusal, cacheKey validation (layer 1), path-containment/symlink-escape (layer 2), Range handling (RFC 7233), and `handleIndexJson` (directory fallback, tier passthrough, malformed-index fallback, review-merge present/malformed)

## Decisions Made

- Imported `CACHE_DIR` from `render-gemini-audio.ts` instead of hardcoding `path.resolve("rituals/_bake-cache")` a second time, per the plan's explicit instruction to avoid a second, potentially divergent, cache-path constant.
- `handleIndexJson`'s new third parameter (`ritualsDir`, defaulting to `path.dirname(cacheDir)`) keeps the review-file lookup testable independently of the cache-dir fixture while preserving the production default (`rituals/` is the parent of `rituals/_bake-cache/`).
- Review-file merge reads the real `rituals/ea-opening-review.json` / `rituals/ea-closing-review.json` shape (`{version, updatedAt, lines: {[lineId]: {status, note, audioHash, approvedAt, flaggedAt}}}`) confirmed by inspection per the plan's `read_first` instruction, rather than inventing a schema.
- Used the same `(process.env as Record<string, string | undefined>)` cast as the existing `src/lib/__tests__/dev-guard.test.ts` for the NODE_ENV-mutation test, matching established precedent and avoiding a new `tsc` finding of the same class already logged in `deferred-items.md`.

## Deviations from Plan

None — plan executed exactly as written. The TDD task-ordering note below documents an inherent characteristic of the plan's own task sequencing, not a deviation from it.

## TDD Gate Compliance

Task 2 carries `tdd="true"`, but the plan sequences the server implementation (Task 1, `<action>` only, no `<behavior>`) *before* its test suite (Task 2, files: `scripts/__tests__/preview-bake.test.ts` only — no implementation file in `files_modified`). There is no separate "write code to make failing tests pass" step for Task 2: the implementation under test is Task 1's already-committed, verbatim-audited port. Running the ported 27-test suite against that implementation produced 27/27 passing on the first run — this locks in (rather than drives) the containment guarantees, consistent with the plan's own framing ("The containment guarantees are locked by tests equivalent to the branch's audited suite"). Git log shows `feat(03-07)` at `2a7fa62` followed by `test(03-07)` at `afa54ae` — feat before test, the inverse of the standard RED→GREEN order — because the plan's task boundaries assign implementation and tests to different, sequentially-ordered tasks rather than pairing them within one task.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required. Manual UAT (starting the server and scrubbing a line in a browser) is explicitly deferred per the plan's own `<verification>` section: "Manual (human UAT, needs baked cache): `npx tsx scripts/preview-bake.ts`, open http://localhost:8883, scrub a line — deferred to phase HUMAN-UAT alongside the other real-bake items (Gemini key absent on this machine)."

## Next Phase Readiness

`scripts/preview-bake.ts` is ready to serve any cache entries written so far. Its `/api/index` fallback path means it works today (directory listing) even before Wave 4's `03-08` lands the `_INDEX.json` manifest writer; once that plan ships, the tier-aware fields and grouping will populate automatically with no changes needed here. No blockers for `03-08`.

---
*Phase: 03-authoring-throughput*
*Completed: 2026-07-02*

## Self-Check: PASSED

- FOUND: scripts/preview-bake.ts
- FOUND: scripts/__tests__/preview-bake.test.ts
- FOUND: .planning/phases/03-authoring-throughput/03-07-SUMMARY.md
- FOUND: 2a7fa62 (feat commit)
- FOUND: afa54ae (test commit)
- FOUND: ef27d4d (docs/SUMMARY commit)
