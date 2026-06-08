---
phase: 03-authoring-throughput
plan: 02
subsystem: storage
tags: [indexeddb, schema, feedback-traces, dual-open-invariant, pii-safe, author-10]

# Dependency graph
requires:
  - phase: 03-authoring-throughput
    plan: 01
    provides: fake-indexeddb@6.2.5 dev dep + Wave 0 idb-schema.test.ts scaffold
provides:
  - src/lib/idb-schema.ts as single IndexedDB source of truth (DB_NAME, DB_VERSION=5, 6 store constants, openDB(), FeedbackTrace)
  - feedbackTraces object store (keyPath "id", indexes on documentId/timestamp/variantId) — ready for Phase 5 COACH-06 to write
  - FeedbackTrace interface (PII-free, hashes only) — importable at `@/lib/idb-schema`
  - dual-open invariant proven by test (opening twice yields identical 6-store set)
  - v4→v5 data-preserving migration proven by test (existing documents/sections/settings/voices/audioCache intact, feedbackTraces newly created)
affects: [03-03, 03-04, 03-05, 03-06, 03-07, 03-08, 05-COACH-06, 05-COACH-12]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "IndexedDB schema consolidation: one module owns DB_NAME/VERSION/stores/openDB, consumers import"
    - "fake-indexeddb dual-open invariant test using @vitest-environment jsdom + dynamic-import-per-test pattern"
    - "PII-free TypeScript interface convention extended to IDB (FeedbackTrace follows Phase 2 D-09/D-10 hashes-only shape)"

key-files:
  created:
    - src/lib/idb-schema.ts
  modified:
    - src/lib/storage.ts
    - src/lib/voice-storage.ts
    - src/lib/__tests__/idb-schema.test.ts

key-decisions:
  - "Preserved comment at src/lib/storage.ts header referencing idb-schema.ts (AUTHOR-10 D-16) so grep for 'indexedDB.open(' returns 0 — acceptance criterion text used literal indexedDB.open() in a comment, reworded to avoid false-positive grep match."
  - "Kept voice-storage.ts re-export of AUDIO_CACHE_STORE (required by src/lib/tts-cloud.ts:1036-1040 which imports it from voice-storage pre-D-16). No downstream grep-and-replace needed."
  - "Test case 3 (storage-first/voice-first parity) simplified to repeated-openDB() call — post-Task-2 both consumers call the same openDB(), so the invariant is proven by the shared module; the explicit two-consumer dance becomes trivial."

patterns-established:
  - "Single IndexedDB entry point convention — no module other than idb-schema.ts may call indexedDB.open() in this codebase"
  - "DB_VERSION bump is a single-file edit (D-16); Phase 5 COACH-06 adds v6 or writes to the existing v5 feedbackTraces store without further schema work"

requirements-completed: [AUTHOR-10]

# Metrics
duration: ~5min
completed: 2026-04-23
---

# Phase 3 Plan 02: idb-schema Extraction Summary

**Extracted `src/lib/idb-schema.ts` as the single source of truth for the client-side IndexedDB schema (DB_NAME, DB_VERSION=5, six store-name constants, shared `openDB()` with consolidated `onupgradeneeded`, and PII-free `FeedbackTrace` interface). Both `storage.ts` and `voice-storage.ts` now import from it — no more DB_VERSION lockstep dance. The new `feedbackTraces` store is Phase 5 COACH-06's write target; the interface contains hashes only, no prompt/completion/email/text/body keys.**

## Performance

- **Duration:** ~5 min (network-free, fully local work; 2 atomic commits)
- **Started:** 2026-04-23T16:43:17Z
- **Completed:** 2026-04-23T16:48:23Z
- **Tasks:** 2/2
- **Files created:** 1 (`src/lib/idb-schema.ts`)
- **Files modified:** 3 (`src/lib/storage.ts`, `src/lib/voice-storage.ts`, `src/lib/__tests__/idb-schema.test.ts`)

## Accomplishments

- **`src/lib/idb-schema.ts` created** (113 lines):
  - Exports `DB_NAME`, `DB_VERSION=5`, six store-name constants
    (`DOCUMENTS_STORE`, `SECTIONS_STORE`, `SETTINGS_STORE`, `VOICES_STORE`,
    `AUDIO_CACHE_STORE`, `FEEDBACK_TRACES_STORE`), `openDB()` function,
    `FeedbackTrace` interface.
  - One consolidated `onupgradeneeded` creates all 6 stores (additive migration
    from any prior version; D-17 `feedbackTraces` is the only net-new store
    between v4 and v5).
  - `FeedbackTrace` is PII-free: `id`, `documentId`, `sectionId`, `lineId`,
    `variantId`, `promptHash`, `completionHash`, `timestamp`, optional
    `ratingSignal` — no prompt/completion/email/text/body keys.
- **`src/lib/storage.ts` refactored**: ~60 lines removed (inline constants +
  inline openDB + obsolete lockstep comment), replaced with a 6-line
  `import { openDB, DOCUMENTS_STORE, SECTIONS_STORE, SETTINGS_STORE } from "./idb-schema"`.
  Every other line untouched.
- **`src/lib/voice-storage.ts` refactored**: ~60 lines removed (inline constants +
  inline openDB), replaced with import from `./idb-schema` plus a re-export of
  `AUDIO_CACHE_STORE` for downstream caller `src/lib/tts-cloud.ts:1036-1040`.
- **`src/lib/__tests__/idb-schema.test.ts` filled in**: 5 passing tests
  replacing 3 `it.todo()` stubs:
  1. `DB_VERSION === 5`
  2. `openDB()` returns DB with all 6 stores alphabetically
     (`audioCache`, `documents`, `feedbackTraces`, `sections`, `settings`, `voices`)
     and `db.version === 5`
  3. Repeated open returns identical store set (storage/voice-storage consumer parity)
  4. v4-on-disk upgrades to v5: sample doc in `documents` survives;
     `feedbackTraces` store is newly created and empty; all 6 stores present
  5. `FeedbackTrace` interface is hashes-only (compile-time `satisfies` check
     + runtime PII-key absence check)

## Final Object-Store List (v5)

| Store | keyPath | Indexes | First added |
|-------|---------|---------|-------------|
| `documents` | `id` | — | v1 |
| `sections` | `id` | `documentId`, `degree` | v1 |
| `settings` | `key` | — | v2 |
| `voices` | `id` | — | v3 |
| `audioCache` | `key` | `createdAt` | v4 |
| `feedbackTraces` | `id` | `documentId`, `timestamp`, `variantId` | **v5 (NEW)** |

## FeedbackTrace Interface Shape

```typescript
interface FeedbackTrace {
  id: string;              // randomUUID per trace (keyPath)
  documentId: string;      // .mram document ID
  sectionId: string;       // ritual section ID
  lineId: string;          // line within section
  variantId: string;       // "mentor-v1" | "roast-v1" | "terse-v1" | "coach-v1"
  promptHash: string;      // sha256
  completionHash: string;  // sha256
  timestamp: number;       // Date.now()
  ratingSignal?: "helpful" | "unhelpful" | null;
}
```

8 required fields + 1 optional. Zero PII keys.

## Test Results

- **idb-schema.test.ts only:** `npx vitest run --no-coverage src/lib/__tests__/idb-schema.test.ts` — 5 passed / 0 failed / 0 todo.
- **Full vitest suite (post-Task-2):** 37 files passed + 6 skipped = 43, 414 passed + 58 todo = 472 tests total. Zero failures. Zero regressions vs the Plan 01 baseline (409 passed + 61 todo → 414 passed + 58 todo; +5 tests from idb-schema, -3 todos from filling the scaffold).
- **Build (`npm run build`):** exits 0. Next.js compile clean.
- **TSC (`npx tsc --noEmit`):** 12 errors total, all pre-existing and unrelated to the files this plan touched (`src/app/api/transcribe/__tests__`, `src/lib/__tests__/rotate-mram.test.ts`, `screen-wake-lock.test.ts`, `voice-export-import.test.ts`, `.next/types/validator.ts`). Zero errors mentioning `idb-schema`, `storage.ts`, or `voice-storage.ts`. These pre-existing errors are out of scope per the executor deviation-rules scope boundary.

## Dual-Open Invariant Verification

Test 3 ("repeated open returns identical store set") proves the dual-open invariant: because both `storage.ts` and `voice-storage.ts` now import the same `openDB()` from `./idb-schema`, the invariant is structurally guaranteed (no two parallel `onupgradeneeded` handlers can diverge). The repeated-open test exercises the cache-hit second-open path.

## v4→v5 Migration Behavior Verified

Test 4 ("v4-on-disk opens as v5 without data loss") pre-seeds a v4 database manually (matching the pre-Phase-3 schema: documents, sections, settings, voices, audioCache), writes a sample `{id: "sample-doc", name: "test"}` into `documents`, closes, then opens via the new `openDB()`. Assertions verify:

- Sample doc is still readable (`{id: "sample-doc", name: "test"}`)
- `feedbackTraces` store now exists (`db.objectStoreNames.contains` returns true)
- `feedbackTraces` is empty (`getAll()` returns `[]`)
- All 6 stores present alphabetically

This is the exact threat model mitigation for T-03-02-03 (upgrade corrupts user data — Amanda + Shannon + 6 other pilot users have live v4 data).

## Task Commits

Each task committed atomically on `gsd/phase-3-authoring-throughput`:

1. **Task 1: Create src/lib/idb-schema.ts + fill test scaffold** — `43774bd`
   (`author-10: extract idb-schema.ts as single IndexedDB source of truth + dual-open test`)
2. **Task 2: Swap storage.ts + voice-storage.ts to import openDB from idb-schema** — `a90ffe2`
   (`author-10: wire storage.ts + voice-storage.ts to shared idb-schema openDB`)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reworded a comment in `src/lib/storage.ts` to avoid literal "indexedDB.open(" match**
- **Found during:** Task 2 verification (acceptance criteria grep)
- **Issue:** My first pass left a comment in `storage.ts` saying "This module no longer declares its own `indexedDB.open()`..." — that made `grep -c "indexedDB.open(" src/lib/storage.ts` return 1 instead of 0, failing the acceptance criterion literally even though the semantic behavior was correct (the call was gone, only the comment remained).
- **Fix:** Reworded the comment to "This module no longer opens the database directly or declares its own version constant" — preserves the explanatory intent without the literal substring.
- **Files modified:** `src/lib/storage.ts` (one comment block)
- **Verification:** `grep -c "indexedDB.open(" src/lib/storage.ts` now returns 0. Tests still green.
- **Committed in:** Task 2 commit `a90ffe2`

### Plan-Text Resolution (not a deviation)

The plan's test skeleton used `const { type FeedbackTrace } = await import("../idb-schema");` which is not valid TypeScript syntax (can't destructure a `type` out of a dynamic-import object expression — types don't exist at runtime and the dynamic import resolves to values only). Used the well-formed equivalent: a top-level `import type { FeedbackTrace } from "../idb-schema"` plus a `satisfies FeedbackTrace` expression inside the test. Net behavior is identical — both forms compile into the same compile-time type check plus runtime key-absence asserts. No impact on acceptance criteria.

---

**Total deviations:** 1 auto-fixed (Rule 3, one-line comment wording).
**Impact on plan:** None — acceptance criteria all satisfied; no scope creep.

## Issues Encountered

None. Branch `gsd/phase-3-authoring-throughput` held stable throughout; no external interference (unlike Plan 01's mid-flight branch-checkout incident). Both commits landed cleanly on the correct branch.

## User Setup Required

None — all changes are local repo code + tests. No database migration the user runs (the v4→v5 migration is automatic on next app open and is the subject of Test 4).

## Next Phase Readiness

- **Plan 03 (dev-guard, D-15):** unblocked. No dependency on this plan.
- **Plan 04 (author-validation bake-band, D-08):** unblocked. No dependency.
- **Plans 05-08:** all unblocked from Plan 01's scaffolding work.
- **Phase 5 COACH-06 (first real feedbackTrace writer):** can `import { FEEDBACK_TRACES_STORE, FeedbackTrace, openDB } from "@/lib/idb-schema"` today without any further schema work.
- **No blockers** for any downstream plan.

## Self-Check: PASSED

- Files claimed created (1): `src/lib/idb-schema.ts` — FOUND (verified via `Read` tool at commit `43774bd`).
- Files claimed modified (3):
  - `src/lib/storage.ts` — FOUND (verified via `grep` pattern checks).
  - `src/lib/voice-storage.ts` — FOUND.
  - `src/lib/__tests__/idb-schema.test.ts` — FOUND.
- Commits claimed:
  - `43774bd` — FOUND on `gsd/phase-3-authoring-throughput` (Task 1).
  - `a90ffe2` — FOUND on `gsd/phase-3-authoring-throughput` (Task 2).
- Verification commands:
  - `npx vitest run --no-coverage src/lib/__tests__/idb-schema.test.ts` → 5 passed / 0 failed.
  - `npx vitest run --no-coverage` (full suite) → 414 passed + 58 todo, 0 failed.
  - `npm run build` → exit 0.
  - All 9 acceptance-criteria grep checks pass (storage.ts: 0 `indexedDB.open(`, 0 `DB_VERSION`, ≥1 `./idb-schema` import; voice-storage.ts: same + `export { AUDIO_CACHE_STORE }`; 0 `MUST stay in lockstep` anywhere).

---
*Phase: 03-authoring-throughput*
*Completed: 2026-04-23*
