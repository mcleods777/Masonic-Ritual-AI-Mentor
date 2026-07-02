---
phase: 03-authoring-throughput
plan: 04
subsystem: database
tags: [indexeddb, typescript, vitest, fake-indexeddb, schema-migration]

# Dependency graph
requires:
  - phase: 03-authoring-throughput (plan 01)
    provides: fake-indexeddb devDependency (^6.2.5) already installed
provides:
  - Single source of truth for the app's client-side IndexedDB schema (src/lib/idb-schema.ts)
  - DB_VERSION bumped 4 -> 5, purely additive, with a feedbackTraces store shell
  - Dual-open + v4->v5 migration-preservation test proving roadmap success criterion 6
affects: [phase-05-coach-quality-lift]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared IndexedDB schema module: openDB()/onupgradeneeded live in one file (idb-schema.ts), imported by every consumer, so onupgradeneeded's once-per-version-bump firing can't create a store-existence gap depending on which module opens the DB first"

key-files:
  created:
    - src/lib/idb-schema.ts
    - src/lib/__tests__/idb-schema.test.ts
  modified:
    - src/lib/storage.ts
    - src/lib/voice-storage.ts

key-decisions:
  - "Store constants (DOCUMENTS_STORE/SECTIONS_STORE/SETTINGS_STORE/VOICES_STORE/AUDIO_CACHE_STORE) moved to idb-schema.ts and imported, not re-declared, in storage.ts/voice-storage.ts — single definition per constant"
  - "AUDIO_CACHE_STORE still re-exported from voice-storage.ts (unchanged public surface) since tts-cloud.ts imports it from there"
  - "performance-history.ts's separate DB_VERSION=1 constant is a different IndexedDB database (masonic-performance, not masonic-ritual-mentor) and is correctly out of scope for this extraction — not touched"

requirements-completed: [AUTHOR-10]

# Metrics
duration: 6min
completed: 2026-07-02
---

# Phase 03 Plan 04: IndexedDB Schema Extraction Summary

**Extracted the duplicated `masonic-ritual-mentor` IndexedDB schema from storage.ts/voice-storage.ts into a single idb-schema.ts source of truth at DB_VERSION=5, adding the feedbackTraces shell for Phase 5 COACH-06, verified by a dual-open + v4→v5 migration-preservation test.**

## Performance

- **Duration:** 6 min (11:31:50 → 11:36:58, from first to last task commit)
- **Started:** 2026-07-02T11:31:50-05:00
- **Completed:** 2026-07-02T11:36:58-05:00
- **Tasks:** 3 completed
- **Files modified:** 4 (1 new schema module, 1 new test file, 2 refactored)

## Accomplishments
- `src/lib/idb-schema.ts` is now the single `onupgradeneeded` source of truth for the `masonic-ritual-mentor` database, imported by both `storage.ts` and `voice-storage.ts` — the "MUST stay in lockstep" comment-enforced duplication is gone
- `DB_VERSION` bumped 4 → 5, purely additive: `feedbackTraces` store shell (keyPath `id`, indexes `documentId`/`timestamp`/`variantId`) added for Phase 5 COACH-06 to consume, no existing store/index touched
- Dual-open invariant and v4→v5 data-preservation both proven by automated test using `fake-indexeddb`
- Zero behavior change for existing consumers — every exported function from `storage.ts`/`voice-storage.ts` keeps its exact signature; full pre-existing test suite (342 tests) stayed green throughout

## Task Commits

Each task was committed atomically:

1. **Task 1: Create src/lib/idb-schema.ts (port from 58eb551)** - `d98f2f2` (feat)
2. **Task 2: Refactor storage.ts and voice-storage.ts to import from idb-schema** - `1937d64` (refactor)
3. **Task 3: Dual-open + v4→v5 migration-preservation test** - `fb733b9` (test)

**Plan metadata:** committed separately after this SUMMARY (docs: complete plan)

## Files Created/Modified
- `src/lib/idb-schema.ts` - New module: `DB_NAME`, `DB_VERSION=5`, six store-name constants, `FeedbackTrace` interface, `openDB()` with `contains()`-guarded `onupgradeneeded`
- `src/lib/storage.ts` - Deleted local `DB_NAME`/`DB_VERSION`/`openDB()`/lockstep comment; imports `openDB`, `DOCUMENTS_STORE`, `SECTIONS_STORE`, `SETTINGS_STORE` from `./idb-schema`
- `src/lib/voice-storage.ts` - Deleted local `DB_NAME`/`DB_VERSION`/`openDB()`; imports `openDB`, `VOICES_STORE`, `AUDIO_CACHE_STORE` from `./idb-schema`; still re-exports `AUDIO_CACHE_STORE` for `tts-cloud.ts`
- `src/lib/__tests__/idb-schema.test.ts` - New: 3 tests covering dual-open (2 groups) and v4→v5 migration-preservation (1 group, 167 lines)

## Decisions Made
- Kept `AUDIO_CACHE_STORE` re-exported from `voice-storage.ts` (rather than requiring `tts-cloud.ts` to import directly from `idb-schema.ts`) to avoid any consumer-facing import-path change — confirmed via grep that `tts-cloud.ts` is the only external importer of that constant
- Confirmed `DOCUMENTS_STORE`/`SECTIONS_STORE`/`SETTINGS_STORE`/`VOICES_STORE` had zero external importers before this plan (grep-verified), so no re-export shim was needed for them
- Left `performance-history.ts`'s own `DB_VERSION = 1` untouched — it opens a completely separate database (`masonic-performance`), not `masonic-ritual-mentor`, so it is unrelated to AUTHOR-10's scope despite superficially matching the plan's literal verification grep pattern

## Deviations from Plan

### Auto-fixed Issues

None — no bugs, missing functionality, or blocking issues were encountered. Task 2's refactor required deleting `voice-storage.ts`'s local `openDB()` function body (not explicitly called out as a separate deletion step in the plan's action text, but directly implied by "delete the local ... openDB() ... add import") to avoid a duplicate-identifier conflict with the newly imported `openDB`; this was completed as part of Task 2 itself, not tracked as a separate deviation.

**Clarification (not a fix):** The plan's Task 2 verification command literally reads `grep -rn "DB_VERSION *= *[0-9]" src/lib/` and expects it to match only `idb-schema.ts`. In practice this also matches `src/lib/performance-history.ts:13` (`const DB_VERSION = 1`), which is a pre-existing, unrelated constant for a different IndexedDB database entirely. The plan's stated intent ("single onupgradeneeded source of truth" for the `masonic-ritual-mentor` DB) is fully met — this is a scope note, not a defect, and no code was changed for it.

---

**Total deviations:** 0 auto-fixed
**Impact on plan:** None — plan executed as written with one scope clarification documented above.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required. This is an internal refactor with a purely additive client-side schema bump; existing user devices (Shannon + Amanda in production) will transparently upgrade their local `masonic-ritual-mentor` database from v4 to v5 on next load, preserving all existing data.

## Known Stubs

`feedbackTraces` object store exists with no reader/writer yet — this is the intentional Phase 5 COACH-06 shell explicitly scoped by AUTHOR-10 and the plan's `must_haves.truths`, not an unintentional stub. No UI or code path references it in this phase. Phase 5 COACH-06 owns wiring the writer/reader.

## Next Phase Readiness
- AUTHOR-10 fully delivered: idb-schema.ts is production-ready and ships to real browsers on next deploy (this is the only Phase 3 change that reaches production, per the plan's own objective note)
- Phase 5 COACH-06 can now import `FeedbackTrace`, `FEEDBACK_TRACES_STORE`, and `openDB` from `src/lib/idb-schema.ts` directly — no further schema work needed to start writing feedback traces
- No blockers for the remaining Phase 3 plans (03-05 through 03-08)

---
*Phase: 03-authoring-throughput*
*Completed: 2026-07-02*
