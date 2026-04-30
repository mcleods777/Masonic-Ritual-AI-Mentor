---
phase: 04-content-coverage
plan: 02
subsystem: content-tracking-ledger
tags: [content-tracking, checklist, ledger, parseable-markdown, phase-4]

# Dependency graph
requires:
  - phase: 03-authoring-throughput
    provides: "scripts/lib/ shared-utils pattern (bake-math.ts + resume-state.ts established the pure-function + test file convention this parser follows)"
  - phase: 04-content-coverage
    provides: "Plan 04-01 landed verify-mram.ts v3 + verify-content.ts release gate; Plan 04-02 is the ledger layer that Wave 1 content plans update"
provides:
  - ".planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md — 22-row ledger across 5 groups (EA, FC, MM, Installation, Officer Lectures); single source of truth for Phase 4 content progress; rows mutated by Plans 04-03..07 and gate-checked by Plan 04-08"
  - "scripts/lib/content-checklist.ts — strict parser (parseChecklist + validateChecklistShape + exported types/constants); rejects any status cell outside the StatusCell union; throws with line-number context on uppercase [X], column reshuffle, malformed rows"
  - "scripts/__tests__/content-checklist.test.ts — 6 shape-invariant tests; 5 in-memory fixtures exercise the parser's failure modes, 1 round-trip pins the real on-disk file's shape"
affects: [04-03-ea-rebake, 04-04-fc-authoring-bake, 04-05-mm-authoring-bake, 04-06-installation-authoring-bake, 04-07-lectures-authoring-bake, 04-08-phase-release-verification]

# Tech tracking
tech-stack:
  added: []  # No new deps — hand-rolled pure regex/string-split parser per Phase 3 convention
  patterns:
    - "Pure-function parser in scripts/lib/ (matches bake-math.ts + resume-state.ts Phase 3 precedent): no fs, no process — callers read the file and pass the string"
    - "Strict StatusCell union (only 4 legal values) with line-number context in throw messages — validates Shannon's hand edits over weeks rather than silently drifting"
    - "Descope-via-em-dash protocol encoded in the checklist's Aggregate section, preserving 04-02 parser contract without requiring parser extension for Plan 04-07"
    - "Test 6 round-trip pattern: in-memory fixture tests exercise failure modes; on-disk round-trip test pins the real file's shape so Plans 04-03..07 can't silently corrupt the ledger"

key-files:
  created:
    - "scripts/lib/content-checklist.ts (283 LOC) — parseChecklist + validateChecklistShape; StatusCell = '[ ]' | '[~]' | '[x]' | '—'; throws InvalidStatusCell / ColumnHeaderMismatch / MalformedTable / MalformedRow"
    - "scripts/__tests__/content-checklist.test.ts (299 LOC) — 6 tests covering valid parse, uppercase [X] rejection with line-number context, duplicate-slug detection, missing-group detection, column-swap rejection, on-disk round-trip"
    - ".planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md (77 LOC) — 22 seed rows: 4 EA (pre-populated with [x] for existing v2-cache files awaiting v3 re-bake) + 4 FC + 4 MM + 1 Installation + 9 Lectures"
    - ".planning/phases/04-content-coverage/04-02-SUMMARY.md — this file"
  modified: []

key-decisions:
  - "Parser rejects strikethrough syntax and any status cell outside the 4-value StatusCell union — Plan 04-07's descope UX was deliberately designed around the em-dash cell + notes column so no parser extension is needed"
  - "Hand-rolled regex/string-split parser over pulling in a markdown lib (e.g., remark) — matches Phase 3's deliberate preference for narrow hand-rolled parsers across sibling scripts"
  - "9 lecture rows seeded even though CONTENT-05 minimum is 4 — Plan 04-07 Task 1 lets Shannon descope rows via the em-dash protocol; seeding the max keeps all options open without a parser change"
  - "Test 6 round-trip against real on-disk file (not just fixtures) — catches accidental corruption by Plans 04-03..07's row mutations at commit time, which the in-memory fixture tests cannot do"
  - "EA rows pre-populated with [x] for drafted/cipher/voice-cast/styles — those files exist on disk from Phase 3 work; only the bake/scrub/verify/shipped columns are [ ] pending the v3-cache re-bake in Plan 04-03"
  - "Groups outside EXPECTED_GROUPS (e.g., the ## Aggregate footer) silently end the current table rather than throwing — keeps the checklist human-editable with narrative sections alongside the machine-readable tables"

requirements-completed: []  # Plan 04-02 is tracking infrastructure only. The Plan's frontmatter lists CONTENT-01..05 under `requirements:` but those requirements are about actual content being baked + shipped, not about having a tracking file. Plans 04-03..08 are the ones that flip those completion bits in REQUIREMENTS.md as rituals actually ship.
requirements-tracking-enabled: [CONTENT-01, CONTENT-02, CONTENT-03, CONTENT-04, CONTENT-05]  # what this plan DID enable: per-ritual progress tracking for these 5 requirements

# Metrics
duration: 6min
completed: 2026-04-23
---

# Phase 4 Plan 02: Content Checklist Ledger Summary

**A hand-editable, parser-validated 22-row markdown ledger at `04-CONTENT-CHECKLIST.md` tracks every Phase 4 ritual through 8 pipeline columns (drafted plain → cipher → voice-cast → styles → baked → scrubbed → verified → shipped), backed by a strict parser at `scripts/lib/content-checklist.ts` that rejects anything outside the `StatusCell = "[ ]" | "[~]" | "[x]" | "—"` union — giving Shannon a resumable ledger across ~4-8 weeks of solo content labor.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-04-24T01:30:04Z
- **Completed:** 2026-04-24T01:35:50Z
- **Tasks:** 2/2 completed (both TDD per plan's `tdd="true"` frontmatter)
- **Files created:** 3 (parser + test file + checklist markdown) + 1 SUMMARY
- **Files modified:** 0

## Accomplishments

- **The ledger now exists.** Plans 04-03..07 have a single committed Markdown file to update as they move rituals through the pipeline. Plan 04-08 has a specific gate to audit (`all rows shipped = [x]` or `—` with descope reason).
- **Parser contract locked.** `StatusCell = "[ ]" | "[~]" | "[x]" | "—"` with strict rejection of any other value (uppercase `[X]`, strikethrough, ASCII hyphen, etc.) — throws with line-number context so Shannon's typos surface in vitest at commit time.
- **Descope protocol encoded in-file.** Plan 04-07's em-dash-plus-notes-column descope UX is documented directly in the checklist's Aggregate section, preserving the parser contract without requiring parser extension.
- **Shape invariants tested.** 5 in-memory fixture tests exercise the parser's failure modes (valid parse, uppercase `[X]` rejection with line-number context, duplicate-slug detection, missing-group detection, column-swap rejection). 1 round-trip test pins the real on-disk file's shape so mutations by Plans 04-03..07 can't silently corrupt the ledger.
- **CONTENT-01..05 traceability established.** Every ritual slug from `04-RESEARCH.md` §Ritual Taxonomy has a row in the checklist, keyed by the same slug convention as `scripts/bake-all.ts:getAllRituals()` so lookup from the Wave 1 plans is mechanical.

## Task Commits

Each task was committed atomically on branch `gsd/phase-4-content-coverage`:

1. **Task 1: Parser + shape-invariant vitest scaffold** — `a8f3412` (feat)
   - `scripts/lib/content-checklist.ts` (283 LOC): parseChecklist + validateChecklistShape + exported types/constants
   - `scripts/__tests__/content-checklist.test.ts` (299 LOC): 5 fixture tests GREEN + 1 skipped round-trip
   - Suite: 537 pass + 1 skipped (538)

2. **Task 2: Seed checklist + enable round-trip** — `4d121a1` (feat)
   - `.planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md` (77 LOC): 22 seed rows
   - `scripts/__tests__/content-checklist.test.ts`: Test 6 flipped from `it.skip` to `it`
   - Suite: 538/538 passing

## Files Created/Modified

### Created

- **`scripts/lib/content-checklist.ts`** (283 LOC) — pure parser. Exports:
  - `type StatusCell = "[ ]" | "[~]" | "[x]" | "—"` — only legal status-cell values
  - `interface ChecklistRow` — 8 status fields + `group` + `slug` + `notes`
  - `const EXPECTED_GROUPS` — 5 group names the parser recognizes (`EA`, `FC`, `MM`, `Installation`, `Officer Lectures`)
  - `const REQUIRED_COLUMN_HEADERS` — 10 column headers in strict order
  - `parseChecklist(sourceMd: string): ChecklistRow[]` — throws `InvalidStatusCell` / `ColumnHeaderMismatch` / `MalformedTable` / `MalformedRow` with line-number context
  - `validateChecklistShape(rows): {ok, errors}` — asserts all 5 groups present, no duplicate slugs, EA has the 4 expected slugs

  Design: hand-rolled regex + string-split; no third-party markdown dependency (matches Phase 3 convention). Unknown `##` headings (like `## Aggregate`) silently end the current table rather than throwing, keeping the file human-editable alongside the machine-readable tables.

- **`scripts/__tests__/content-checklist.test.ts`** (299 LOC) — 6 tests:
  1. Valid fixture parses to ≥14 rows spanning all 5 groups; `validateChecklistShape(rows).ok === true`
  2. `[X]` (uppercase) in a status cell throws `InvalidStatusCell` with `[X]` and `line N` in the error message
  3. Duplicate `fc-opening` slug → `validateChecklistShape` returns `ok: false` with `duplicate slug: fc-opening` in errors
  4. Missing `## Officer Lectures` section → `validateChecklistShape` returns `ok: false` with `missing group: Officer Lectures` in errors
  5. Column header with `baked` and `scrubbed` swapped → throws `ColumnHeaderMismatch`
  6. Round-trip against real on-disk `04-CONTENT-CHECKLIST.md` → `ok: true`, `errors: []`, `rows.length >= 18`

- **`.planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md`** (77 LOC) — 22 seed rows:
  - 4 EA (existing v2-cache files — drafted/cipher/voice-cast/styles all `[x]`; bake/scrub/verify/shipped all `[ ]` pending Plan 04-03 v3 re-bake)
  - 4 FC (all cells `[ ]`; styles column `—` — lectures don't typically need styles overrides)
  - 4 MM (all cells `[ ]`; styles column `—`)
  - 1 Installation (all cells `[ ]`; styles column `—`)
  - 9 Officer Lectures (max scope; Plan 04-07 Task 1 descopes to Shannon's lodge's core set)

  Header narrative documents the parser contract + edit protocol inline so Shannon's future-self (editing this file weeks from now) sees the constraints without having to re-read the plan.

### Modified

None.

## Key Technical Decisions

### Strict 4-value StatusCell union — no strikethrough support

The `StatusCell = "[ ]" | "[~]" | "[x]" | "—"` union is the hard contract. Plan 04-07's descope UX was designed AROUND this constraint (em-dash cells across all 8 status columns + a `descoped: post-v1 — <reason>` notes entry) specifically to avoid requiring a parser extension. Strikethrough syntax (`~~slug~~` or strikethrough-wrapped rows) would either break the parser or force a parser-level special-case for a markdown feature that adds no value beyond what the em-dash cell already provides. The ruleset stays narrow; Shannon's edits stay validated.

### Hand-rolled regex + string-split over a markdown lib

Phase 3's sibling scripts deliberately avoided pulling in `remark` or similar for narrow parse targets. The checklist schema is small (one `##` heading type, one pipe-delimited table shape, 10 known columns) — a 50-line hand-rolled parser is clearer than a 500-line dependency tree. Follows the precedent set by `scripts/lib/bake-math.ts` and `scripts/lib/resume-state.ts` in Phase 3 Plan 06.

### 9 lecture rows in the seed set — full max, Shannon descopes later

The plan's frontmatter artifact requirement said `min_lines: 60` for the checklist and RESEARCH.md §Ritual Taxonomy lists 9 officer lectures as the full set. Seeding all 9 means Plan 04-07 Task 1's scope decision is purely a descope operation (row → em-dash + notes) rather than adding-rows-is-OK-but-removing-rows-needs-a-plan-change. The parser doesn't care: descoped rows pass `validateChecklistShape` identically to active rows.

### Test 6 is a round-trip against disk, not another fixture

Tests 1-5 exercise the parser's failure modes against in-memory strings. Test 6 is architecturally distinct: it reads the actual committed `04-CONTENT-CHECKLIST.md` and asserts the parser accepts it. That's what makes it useful to Plans 04-03..07 — their edits to the checklist will run through Test 6 on every vitest run, catching typos / stray strikethrough / column drift at commit time rather than at Plan 04-08's release gate (by which point weeks of labor might have been recorded against a corrupted ledger).

### EA rows pre-populated as `[x]` for drafted/voice-cast/styles columns

Those files already exist on disk from Phase 3 work. Plan 04-03 is a re-bake under v3 cache semantics, not a fresh author; the ledger should reflect that starting state accurately so Plan 04-03's checklist update is only the bake/scrub/verify/shipped columns, not drafted/voice-cast/styles.

### Unknown `##` headings silently end the current table

The `## Aggregate` footer is narrative, not a 6th group. Rather than whitelist-throw on every non-`EXPECTED_GROUPS` heading, the parser just ends the current table and resumes looking for the next known group heading. Keeps the checklist human-editable while preserving the strict shape test for known groups.

## Deviations from Plan

### Auto-fixed Issues

None.

### None Required

- No architectural deviations.
- No authentication gates.
- No new dependencies.
- No new test framework (vitest 4.x already covers `scripts/**/*.test.{ts,tsx}` from Phase 3 Plan 01).
- No pre-existing bugs discovered in this plan's surface.

### Deferred Items

None.

## Test Results

- **Before plan:** 532 passed (Phase 4 Plan 01 baseline, 45 test files)
- **After plan:** **538 passed** (46 test files; +6 net — one new test file with 6 tests)
- **New tests:**
  - `scripts/__tests__/content-checklist.test.ts`: 6 tests (5 fixture + 1 round-trip)
- **Test 2 (Task 1 intermediate):** 537 pass + 1 skipped (Test 6 pending Task 2 file seed)
- **Test 2 (Task 2 final):** 538 pass (Test 6 enabled and GREEN against real on-disk file)
- **TypeScript errors:** unchanged from Phase 4 Plan 01 baseline of 21 (this plan's files are clean — errors are in `src/lib/__tests__/dev-guard.test.ts`, `rotate-mram.test.ts`, `screen-wake-lock.test.ts`, `voice-export-import.test.ts`, none of which this plan touches)

## Smoke Test Result

- `npx tsx -e "..." ` direct import of `parseChecklist` on the real on-disk file:
  ```
  rows: 22
  validate: {"ok":true,"errors":[]}
  groups: [ 'EA', 'FC', 'MM', 'Installation', 'Officer Lectures' ]
  ```
- Row count 22 confirms 4 EA + 4 FC + 4 MM + 1 Installation + 9 Lectures = 22.
- `validate.ok === true` confirms all shape invariants pass (5 groups present, no duplicate slugs, EA has exactly the 4 expected slugs).

## Self-Check: PASSED

- `scripts/lib/content-checklist.ts` exists ✓
- `scripts/__tests__/content-checklist.test.ts` exists ✓
- `.planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md` exists ✓
- `.planning/phases/04-content-coverage/04-02-SUMMARY.md` exists (this file) ✓
- Commit `a8f3412` present in git log ✓
- Commit `4d121a1` present in git log ✓
- `scripts/lib/content-checklist.ts` exports the documented API surface (`parseChecklist`, `validateChecklistShape`, `StatusCell`, `ChecklistRow`, `EXPECTED_GROUPS`, `REQUIRED_COLUMN_HEADERS`) ✓
- Full vitest suite: 538/538 passing ✓
- Round-trip test against real on-disk file: GREEN ✓
- No `.mram`, ritual-source, or secret files committed ✓
- Branch still `gsd/phase-4-content-coverage` (not touched main) ✓
