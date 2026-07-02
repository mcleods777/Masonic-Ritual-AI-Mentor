---
phase: 03-authoring-throughput
plan: 10
subsystem: authoring-pipeline
tags: [concurrency, filesystem-atomicity, cache-manifest, vitest, gap-closure]

# Dependency graph
requires:
  - phase: 03-authoring-throughput
    provides: "bake-all.ts orchestrator (--parallel fan-out), build-mram-from-dialogue.ts D-08 tier-aware _INDEX.json manifest, preview-bake.ts scrubber (03-08/03-09)"
provides:
  - "Per-slug _INDEX.<slug>.json shard writer (upsertBakeIndexEntry) — each build-mram child is the exclusive writer of its own shard, eliminating the CR-03 cross-process race by construction"
  - "Shard-merging reader (readBakeIndex) returning the union of legacy _INDEX.json + all shards, deduped by (ritualSlug,lineId,cacheKey) with shard entries winning"
  - "Parent-owned, race-free post-wave consolidation (consolidateBakeIndex) called from bake-all.ts's main() after a clean wave"
  - "preview-bake.ts handleIndexJson reading the merged view so fallback-tier entries surface even before consolidation"
  - "Concurrency regression suite (bake-index-shard.test.ts) proving no lost provenance under interleaved writers"
affects: [04-content-coverage]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Exclusive-shard-per-writer instead of locking: eliminate a cross-process read-modify-write race by giving each concurrent writer its own file, rather than adding a lock around a shared file"
    - "Parent-owned post-fan-out consolidation: a single-process, race-free step that runs strictly after all children have exited, folding sharded state back into one canonical artifact"
    - "Merge-on-read with precedence: readers always see the union of a consolidated file + not-yet-consolidated shards, so no data is invisible between waves"

key-files:
  created:
    - scripts/__tests__/bake-index-shard.test.ts
  modified:
    - scripts/build-mram-from-dialogue.ts
    - scripts/bake-all.ts
    - scripts/preview-bake.ts
    - scripts/__tests__/build-mram-short-line.test.ts

key-decisions:
  - "Per-slug shard files (_INDEX.<slug>.json) instead of file locking or a lock-free CRDT merge — matches the existing one-ritual-per-child design (bake-all spawns exactly one child per ritual), so contention is eliminated by construction rather than coordinated at runtime"
  - "consolidateBakeIndex lives in build-mram-from-dialogue.ts (co-located with readBakeIndex/upsertBakeIndexEntry) and is imported into bake-all.ts — no circular import since build-mram-from-dialogue.ts never imports bake-all.ts, and bake-all.ts already imports choosePassphraseSource from the same module"
  - "Consolidation failure is non-fatal (logged warning, bake still exits 0) — shards remain on disk and readBakeIndex still merges them, so a permissions error during consolidation cannot lose D-08 provenance"
  - "preview-bake.ts now imports readBakeIndex directly from build-mram-from-dialogue.ts rather than re-implementing the merge locally — single source of truth for the merge/dedup logic"

requirements-completed: [AUTHOR-06, AUTHOR-09]

# Metrics
duration: 25min
completed: 2026-07-02
---

# Phase 03 Plan 10: CR-03 Gap Closure — Per-Slug Index Shards Summary

**Closed the CR-03 lost-update race on `rituals/_bake-cache/_INDEX.json` by giving each parallel bake child an exclusive per-slug shard, merging shards on read, and consolidating them race-free in the parent after a clean wave.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-07-02
- **Tasks:** 2/2 completed
- **Files modified:** 4 modified, 1 created

## Accomplishments

- `upsertBakeIndexEntry` now writes exclusively to `_INDEX.<sanitized-slug>.json`, never the shared `_INDEX.json` — since `bake-all.ts` spawns exactly one child process per ritual, each child is the sole writer of its own shard and the cross-process read-modify-write race is eliminated by construction, not by locking.
- `readBakeIndex` merges the legacy/consolidated `_INDEX.json` with every `_INDEX.<slug>.json` shard present in the cache dir, deduped by `(ritualSlug, lineId, cacheKey)` with shard entries taking precedence over a same-key legacy entry. Malformed shards are tolerated (skipped, not thrown).
- `bake-all.ts`'s `main()` calls the new exported `consolidateBakeIndex(cacheDir)` after `bakeSelected` resolves with zero failures — this runs in the single parent process strictly after every child has exited, so it's race-free. It writes the merged union to `_INDEX.json` and removes every shard. A consolidation failure is caught, logged as a warning, and does not fail the bake (shards remain and readers keep merging them).
- `preview-bake.ts`'s `handleIndexJson` now reads the merged view (imported `readBakeIndex` from `build-mram-from-dialogue.ts`) instead of only the legacy `_INDEX.json`, so a fallback-tier entry from a still-running or crashed parallel bake is visible in the scrubber before consolidation runs. The existing malformed/no-data-anywhere fallback to directory listing is preserved.
- New `scripts/__tests__/bake-index-shard.test.ts` proves the fix: an interleaved-writer test for two different slugs (would have dropped one entry under the old shared-file implementation), same-slug upsert idempotency, fallback-tier survival across shards, and four consolidation tests (full union written, shards removed, idempotent re-run, shard-wins-over-legacy on a later write after a prior consolidation).

## Task Commits

Each task was committed atomically:

1. **Task 1: Shard _INDEX writes per slug + merge on read + parent consolidation** - `f8a6adc` (feat)
2. **Task 2: Concurrency regression test — no lost provenance under interleaved writers** - `e9f4aa7` (test)

_Note: task order here is feat-then-test rather than TDD's test-then-feat because this is an `autonomous` (non-`tdd`) plan; Task 1 carries `tdd="true"` at the task level but its own `<verify>` step already required the full behavior to exist and pass, and Task 2 is a dedicated, separately-scoped regression suite per the plan's task breakdown._

## Files Created/Modified

- `scripts/build-mram-from-dialogue.ts` - Added `bakeIndexShardPath`, `sanitizeIndexShardSlug`, `mergeBakeIndexEntries`, `listIndexShardFiles`, and `consolidateBakeIndex`; rewrote `readBakeIndex` to merge legacy + shards and `upsertBakeIndexEntry` to write only to its slug's shard
- `scripts/bake-all.ts` - Imports `consolidateBakeIndex`; calls it after a clean `bakeSelected` wave, before the success message, with a try/catch that warns (never fails the bake) on consolidation error
- `scripts/preview-bake.ts` - `handleIndexJson` now reads the merged view via imported `readBakeIndex` instead of parsing only `_INDEX.json` directly
- `scripts/__tests__/build-mram-short-line.test.ts` - Updated the "writes atomically" assertion to expect the per-slug shard path (`_INDEX.ea-opening.json`) instead of the legacy shared `_INDEX.json`
- `scripts/__tests__/bake-index-shard.test.ts` (new) - Interleaved-writer no-loss test, same-slug idempotency, fallback-tier survival, and four consolidation tests, all against `fs.mkdtempSync` temp dirs

## Decisions Made

- Per-slug shard files chosen over file locking (matches the existing one-ritual-per-child architecture; no new locking primitive needed) — see key-decisions in frontmatter for full rationale.
- `consolidateBakeIndex` placed in `build-mram-from-dialogue.ts` (co-located with the other index helpers) and imported into `bake-all.ts`, avoiding any circular import since the dependency direction (`bake-all.ts` → `build-mram-from-dialogue.ts`) already existed via `choosePassphraseSource`.
- Consolidation failures are non-fatal by design — the whole point of the shard architecture is that losing the consolidation step never loses data, only defers the "single canonical file" convenience.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed self-introduced null-byte corruption in a template-literal separator**
- **Found during:** Task 1 verification (acceptance-criteria greps unexpectedly returned nothing)
- **Issue:** While writing `bakeIndexEntryKey`'s dedup-key builder, an intended ` ` escape sequence was transmitted through the Edit tool's JSON parameter encoding as an actual literal NUL byte (0x00) rather than the two-character source text ` `. This silently corrupted `scripts/build-mram-from-dialogue.ts` on disk — the file still parsed and ran correctly (Node/V8 handles embedded NULs in string literals fine), but the byte made local `grep`/`ugrep` treat the file as binary and skip pattern matches, which is how the acceptance-criteria verification caught it before it could reach a commit.
- **Fix:** Replaced the dedup-key separator with a plain readable `::` string (safe because ritual slugs are restricted to `[a-z0-9-]`, `lineId` values are stringified numbers/simple strings, and `cacheKey` values are hex — none can contain `::`). Verified zero NUL bytes remain in any touched file via a byte-level scan.
- **Files modified:** scripts/build-mram-from-dialogue.ts
- **Verification:** `python3` byte-scan confirmed 0 null bytes across all 5 touched files; `grep` acceptance-criteria checks then matched as expected; full test suite re-run green after the fix.
- **Committed in:** f8a6adc (part of Task 1 commit — the corruption was caught and fixed before committing, so no separate remediation commit was needed)

---

**Total deviations:** 1 auto-fixed (1 bug, self-introduced and self-caught during verification, not present in any prior commit)
**Impact on plan:** No scope creep; the underlying CR-03 fix itself required no deviation from the plan's described design (per-slug shards, merge-on-read, parent consolidation) — Option 1 from the code review was implemented as specified.

## Issues Encountered

None beyond the self-caught deviation above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CR-03 is closed: `bake-all.ts --parallel N` can now run with confidence that no D-08 fallback-tier provenance is silently dropped by a lost concurrent index write.
- Full Phase 3 suite (`scripts/__tests__/` + `src/lib/__tests__/`) is green: 39 test files, 542 tests passing.
- `npx tsc --noEmit` shows zero NEW errors in the three touched scripts (compared against the pre-existing unrelated errors tracked in deferred-items.md).
- No blockers for Phase 4 (Content Coverage) — this gap-closure plan only touches the authoring pipeline's index-manifest concurrency, not any content or coverage surface.

---
*Phase: 03-authoring-throughput*
*Completed: 2026-07-02*

## Self-Check: PASSED

All created/modified files verified present on disk (scripts/build-mram-from-dialogue.ts, scripts/bake-all.ts, scripts/preview-bake.ts, scripts/__tests__/build-mram-short-line.test.ts, scripts/__tests__/bake-index-shard.test.ts, this SUMMARY.md). All 3 commit hashes (f8a6adc, e9f4aa7, 95854d3) verified present in git log.
