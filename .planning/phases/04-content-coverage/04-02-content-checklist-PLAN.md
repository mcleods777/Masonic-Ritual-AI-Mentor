---
phase: 04-content-coverage
plan: 02
type: execute
wave: 0
depends_on: []
files_modified:
  - .planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md
  - scripts/lib/content-checklist.ts
  - scripts/__tests__/content-checklist.test.ts
autonomous: true
requirements: [CONTENT-01, CONTENT-02, CONTENT-03, CONTENT-04, CONTENT-05]
tags: [content-tracking, checklist, ledger, parseable-markdown]

must_haves:
  truths:
    - "`.planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md` exists with one section per ritual group (EA, FC, MM, Installation, Lectures) and one row per ritual slug"
    - "Each row tracks 8 columns: drafted (plain), drafted (cipher), voice-cast, styles, baked, scrubbed, verified, shipped"
    - "Status cell allowed values are constrained to `[ ]`, `[~]` (in progress), `[x]` (done), `—` (N/A) — any other value causes `content-checklist.test.ts` to fail"
    - "The markdown parses deterministically via `scripts/lib/content-checklist.ts:parseChecklist()` into `{group, slug, drafted_plain, drafted_cipher, voice_cast, styles, baked, scrubbed, verified, shipped, notes}[]`"
    - "Executor content plans (04-03 through 04-07) and the release-verification plan (04-08) can all be audited structurally by running `npx tsx -e 'import(\"./scripts/lib/content-checklist\").then(m => console.log(JSON.stringify(m.parseChecklist(...))))` — the checklist IS the ledger"
    - "The checklist uses the exact ritual slug convention enforced by `scripts/bake-all.ts:getAllRituals()` — `{slug}-dialogue.md` glob — so slug-to-row lookup is mechanical"
  artifacts:
    - path: ".planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md"
      provides: "Per-ritual readiness tracking; single source of truth for Phase 4 content progress"
      min_lines: 60
      contains: "EA (Entered Apprentice)|FC (Fellow Craft)|MM (Master Mason)|Installation|Officer Lectures"
    - path: "scripts/lib/content-checklist.ts"
      provides: "Typed parser: `parseChecklist(sourceMd: string): ChecklistRow[]`; `validateChecklistShape(rows): { ok: boolean; errors: string[] }`"
      min_lines: 80
    - path: "scripts/__tests__/content-checklist.test.ts"
      provides: "Shape-invariant tests: valid status cells, required columns present, no duplicate slugs, EA/FC/MM/Installation/Lectures groups all present"
      min_lines: 80
  key_links:
    - from: "04-CONTENT-CHECKLIST.md"
      to: "scripts/lib/content-checklist.ts:parseChecklist"
      via: "markdown table parse"
      pattern: "parseChecklist"
    - from: "plans 04-03 through 04-07"
      to: "04-CONTENT-CHECKLIST.md"
      via: "per-ritual row update as final task step"
      pattern: "04-CONTENT-CHECKLIST"
    - from: "plan 04-08"
      to: "04-CONTENT-CHECKLIST.md"
      via: "validation: all rows shipped=[x] before Phase 4 close"
      pattern: "all rows shipped"
---

<objective>
Create the Phase 4 content-readiness ledger: a parseable Markdown checklist at `.planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md` with one row per ritual slug, one column per pipeline step. Build a thin parser (`scripts/lib/content-checklist.ts`) and a vitest shape-invariant test so the checklist cannot silently drift into an unparseable state while Shannon is mid-authoring across multiple sessions over weeks.

Purpose: Phase 4 is Shannon-labor dominated (~52-66 solo hours across ~4-8 weeks of calendar time per RESEARCH.md §Cost + Effort Estimates). The labor is resumable only if there's a single source of truth for "which ritual is at which stage." The checklist IS the plan for Shannon's solo work — more load-bearing than any PLAN file during Wave 1. Wave 1 plans (04-03..07) update this file as their final per-ritual task; Plan 04-08 blocks on all rows showing `shipped=[x]`. A thin parser lets `/gsd-progress` and future scripts read status machine-readably.

Output: Checklist markdown seeded with all ritual slugs from RESEARCH.md §Ritual Taxonomy; typed parser module in `scripts/lib/`; vitest shape-invariant test.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/04-content-coverage/04-RESEARCH.md
@.planning/phases/04-content-coverage/04-VALIDATION.md

@scripts/bake-all.ts
@scripts/lib/bake-math.ts
@scripts/lib/resume-state.ts

<interfaces>
<!-- Sibling conventions from Phase 3 scripts/lib/ -->

From scripts/lib/resume-state.ts (Phase 3 Plan 06):
```typescript
// Established the scripts/lib/ pattern — pure, testable, node-env. Re-use import style:
export function readResumeState(path: string): ResumeState | null;
export function writeResumeStateAtomic(path: string, state: ResumeState): void;
```

From scripts/lib/bake-math.ts (Phase 3 Plan 06):
```typescript
// Pure helpers; module covers its own test file at scripts/__tests__/bake-math.test.ts
export function computeMedianSecPerChar(samples: Array<{chars: number; seconds: number}>): number;
```

From scripts/bake-all.ts:
```typescript
export function getAllRituals(): string[]; // ritual slug naming convention source of truth
```

Ritual slug convention (verified against existing EA files):
- EA: `ea-opening`, `ea-initiation`, `ea-explanatory`, `ea-closing`
- FC: `fc-opening`, `fc-passing`, `fc-middle-chamber-lecture`, `fc-closing`
- MM: `mm-opening`, `mm-raising`, `mm-hiramic-legend`, `mm-closing`
- Installation: `installation`
- Lectures: `lec-wm-charge`, `lec-sw-duties`, `lec-jw-duties`, `lec-secretary-duties`, `lec-treasurer-duties`, `lec-chaplain-duties`, `lec-deacons-duties`, `lec-stewards-duties`, `lec-tiler-duties`
</interfaces>
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Markdown file → parser | Shannon edits by hand; a typo in a status cell (`[X]` instead of `[x]`) must be caught by the parser, not silently treated as "not done" |
| Plan set → checklist | Plans 04-03..07 reference row identity by slug; slug drift would break the aggregate view — shape test pins this |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-04-07 | Tampering | 04-CONTENT-CHECKLIST.md (human edits) | mitigate | Parser strictly validates status cell values — only `[ ]`, `[~]`, `[x]`, `—` accepted; unknown values throw. Shape test runs in vitest suite so accidental commits regress. |
| T-04-08 | Integrity | duplicate slugs across groups | mitigate | Parser asserts `new Set(slugs).size === slugs.length`; test exercises this |
| T-04-09 | Integrity | group header drift | mitigate | Parser expects exactly 5 group headers (`EA`, `FC`, `MM`, `Installation`, `Officer Lectures`); test locks these constants |
| T-04-10 | Information Disclosure | ritual text in checklist | accept | Checklist is planning-layer; contains only slugs + status. No ritual content can leak through this file's schema |

**Severity:** all LOW. The checklist is a planning artifact — mitigations ensure machine-readability, not security.
</threat_model>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Build parser + vitest shape test before writing the checklist</name>
  <files>scripts/lib/content-checklist.ts, scripts/__tests__/content-checklist.test.ts</files>
  <behavior>
    `scripts/lib/content-checklist.ts` exports:
    ```typescript
    export type StatusCell = "[ ]" | "[~]" | "[x]" | "—";

    export interface ChecklistRow {
      group: "EA" | "FC" | "MM" | "Installation" | "Officer Lectures";
      slug: string;
      drafted_plain: StatusCell;
      drafted_cipher: StatusCell;
      voice_cast: StatusCell;
      styles: StatusCell;
      baked: StatusCell;
      scrubbed: StatusCell;
      verified: StatusCell;
      shipped: StatusCell;
      notes: string;
    }

    export const EXPECTED_GROUPS = ["EA", "FC", "MM", "Installation", "Officer Lectures"] as const;

    export const REQUIRED_COLUMN_HEADERS = [
      "slug", "drafted (plain)", "drafted (cipher)", "voice-cast",
      "styles", "baked", "scrubbed", "verified", "shipped", "notes"
    ] as const;

    export function parseChecklist(sourceMd: string): ChecklistRow[];
    export function validateChecklistShape(rows: ChecklistRow[]): { ok: boolean; errors: string[] };
    ```

    Parser contract:
    - Reads the markdown source, finds every `## {GroupName}` heading (must be one of `EXPECTED_GROUPS`; else throw `UnknownGroup`).
    - Under each group header, expects a markdown table starting with a pipe-delimited header row matching `REQUIRED_COLUMN_HEADERS` (order-sensitive; case-insensitive compare).
    - Parses each data row; every cell under status columns MUST match one of `[ ]`, `[~]`, `[x]`, `—` — else throw `InvalidStatusCell`.
    - Returns flat `ChecklistRow[]` across all groups.
    - `validateChecklistShape` asserts: (a) all 5 groups present, (b) no duplicate slugs, (c) each row has all 10 columns, (d) EA group has exactly the 4 EA slugs from RESEARCH.md §Ritual Taxonomy.

    Test scenarios (all RED before Task 2):
    1. `parseChecklist(sampleValidMd)` returns an array with ≥ 14 rows spanning all 5 groups. (`sampleValidMd` constructed in-test.)
    2. `parseChecklist(mdWithBadStatus)` where one cell is `[X]` (uppercase) throws `InvalidStatusCell` with line number.
    3. `parseChecklist(mdWithDuplicateSlug)` — `validateChecklistShape` returns `{ok: false, errors: [...contains "duplicate slug: fc-opening"]}`.
    4. `parseChecklist(mdMissingLecturesGroup)` — `validateChecklistShape` returns `{ok: false, errors: [...contains "missing group: Officer Lectures"]}`.
    5. `parseChecklist(mdWithColumnSwap)` where `baked` and `scrubbed` columns are swapped → throws `ColumnHeaderMismatch`.
    6. Round-trip: `parseChecklist(checklistFromDisk)` against the actual `.planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md` — once Task 2 creates it, this test runs against the real file and asserts `validateChecklistShape(rows).ok === true`. (Test 6 starts skipped/pending; Task 2 flips it on.)

    Commit prefix: `content-02: add content-checklist parser + shape-invariant vitest scaffold`
  </behavior>
  <action>
    Write `scripts/lib/content-checklist.ts` and `scripts/__tests__/content-checklist.test.ts`.

    Implementation notes:
    - Parser uses pure regex/string split — no third-party markdown lib. The target schema is narrow enough that hand-rolling is clearer than pulling in `remark` (which Phase 3 deliberately avoided for sibling parsers).
    - Header detection: `/^## ([^\n]+)$/gm` + trim; match against `EXPECTED_GROUPS`.
    - Table detection after a header: find the next line starting with `|`; split on `|`; trim; drop leading/trailing empties (markdown tables have empty first/last pipe-cells).
    - Separator row (`|---|---|`) detected and skipped.
    - Status cell regex: `/^\[ \]|\[~\]|\[x\]|—$/` (strict — rejects `[X]`, `[ x]`, etc.).
    - Column header comparison: lowercase + trim both sides.
    - For test 6 (round-trip), use `it.skip` initially; Task 2 comment notes "enable after Task 2 lands the file."
    - Tests run node-env (scripts/__tests__/ already wired in vitest.config.ts from Phase 3 Plan 01). 
    - Run `npx vitest run --no-coverage scripts/__tests__/content-checklist.test.ts` — Tests 1-5 fail RED, Test 6 skipped.
    - Commit prefix: `content-02: add content-checklist parser + shape-invariant vitest scaffold`
  </action>
  <verify>
    <automated>npx vitest run --no-coverage scripts/__tests__/content-checklist.test.ts 2>&1 | tail -20</automated>
  </verify>
  <done>
    `scripts/lib/content-checklist.ts` exports `parseChecklist`, `validateChecklistShape`, `ChecklistRow`, `StatusCell`, `EXPECTED_GROUPS`, `REQUIRED_COLUMN_HEADERS`. Tests 1-5 pass GREEN against in-test fixture strings; Test 6 marked `it.skip` with a TODO pointing at Task 2. Phase 3 vitest baseline (517) still green.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Seed `04-CONTENT-CHECKLIST.md` with all Phase 4 rituals + flip round-trip test</name>
  <files>.planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md, scripts/__tests__/content-checklist.test.ts</files>
  <behavior>
    Create `04-CONTENT-CHECKLIST.md` per the RESEARCH.md §Content-as-code tracking file shape:

    ```markdown
    # Phase 4: Content Coverage — Ritual Readiness Checklist

    **Updated:** <commit date>
    **Shipping target:** 18 rituals (4 EA re-bakes + 4 FC + 4 MM + 1 Installation + 5-9 Lectures)

    **Status legend:**
    - `[ ]` not started
    - `[~]` in progress
    - `[x]` done
    - `—` not applicable

    **Columns:** plain draft → cipher draft → voice-cast JSON → styles JSON (N/A for some short lectures) → first bake → scrub in preview-bake → `verify-content` green → shipped to pilot.

    > **Edit protocol:** update this file AT THE END of every ritual's pipeline step. Commit
    > with prefix `content-NN: {slug} {step}-complete` (e.g., `content-04: fc-opening baked`).
    > Rows in this file ARE the ledger; `.mram` files on disk are gitignored.

    ## EA

    | slug | drafted (plain) | drafted (cipher) | voice-cast | styles | baked | scrubbed | verified | shipped | notes |
    |------|-----------------|------------------|------------|--------|-------|----------|----------|---------|-------|
    | ea-opening | [x] | [x] | [x] | [x] | [ ] | [ ] | [ ] | [ ] | existing; needs v3-cache re-bake |
    | ea-initiation | [x] | [x] | [x] | [x] | [ ] | [ ] | [ ] | [ ] | existing; needs v3-cache re-bake |
    | ea-explanatory | [x] | [x] | [x] | [x] | [ ] | [ ] | [ ] | [ ] | existing; needs v3-cache re-bake |
    | ea-closing | [x] | [x] | [x] | [x] | [ ] | [ ] | [ ] | [ ] | existing; needs v3-cache re-bake |

    ## FC

    | slug | drafted (plain) | drafted (cipher) | voice-cast | styles | baked | scrubbed | verified | shipped | notes |
    |------|-----------------|------------------|------------|--------|-------|----------|----------|---------|-------|
    | fc-opening | [ ] | [ ] | [ ] | — | [ ] | [ ] | [ ] | [ ] | parallel to ea-opening structure |
    | fc-passing | [ ] | [ ] | [ ] | — | [ ] | [ ] | [ ] | [ ] | longest FC scene; winding stairs lecture embedded |
    | fc-middle-chamber-lecture | [ ] | [ ] | [ ] | — | [ ] | [ ] | [ ] | [ ] | standalone practice unit per EA precedent |
    | fc-closing | [ ] | [ ] | [ ] | — | [ ] | [ ] | [ ] | [ ] | parallel to ea-closing |

    ## MM

    | slug | drafted (plain) | drafted (cipher) | voice-cast | styles | baked | scrubbed | verified | shipped | notes |
    |------|-----------------|------------------|------------|--------|-------|----------|----------|---------|-------|
    | mm-opening | [ ] | [ ] | [ ] | — | [ ] | [ ] | [ ] | [ ] | |
    | mm-raising | [ ] | [ ] | [ ] | — | [ ] | [ ] | [ ] | [ ] | longest single ceremony; Hiramic legend embedded |
    | mm-hiramic-legend | [ ] | [ ] | [ ] | — | [ ] | [ ] | [ ] | [ ] | standalone practice unit; emotional content |
    | mm-closing | [ ] | [ ] | [ ] | — | [ ] | [ ] | [ ] | [ ] | |

    ## Installation

    | slug | drafted (plain) | drafted (cipher) | voice-cast | styles | baked | scrubbed | verified | shipped | notes |
    |------|-----------------|------------------|------------|--------|-------|----------|----------|---------|-------|
    | installation | [ ] | [ ] | [ ] | — | [ ] | [ ] | [ ] | [ ] | annual officer installation; single long ritual |

    ## Officer Lectures

    | slug | drafted (plain) | drafted (cipher) | voice-cast | styles | baked | scrubbed | verified | shipped | notes |
    |------|-----------------|------------------|------------|--------|-------|----------|----------|---------|-------|
    | lec-wm-charge | [ ] | [ ] | [ ] | — | [ ] | [ ] | [ ] | [ ] | Shannon's lodge: core |
    | lec-sw-duties | [ ] | [ ] | [ ] | — | [ ] | [ ] | [ ] | [ ] | core |
    | lec-jw-duties | [ ] | [ ] | [ ] | — | [ ] | [ ] | [ ] | [ ] | core |
    | lec-secretary-duties | [ ] | [ ] | [ ] | — | [ ] | [ ] | [ ] | [ ] | Shannon's lodge confirms which lectures are shipped |
    | lec-treasurer-duties | [ ] | [ ] | [ ] | — | [ ] | [ ] | [ ] | [ ] | |
    | lec-chaplain-duties | [ ] | [ ] | [ ] | — | [ ] | [ ] | [ ] | [ ] | |
    | lec-deacons-duties | [ ] | [ ] | [ ] | — | [ ] | [ ] | [ ] | [ ] | SD/JD may split into 2 files |
    | lec-stewards-duties | [ ] | [ ] | [ ] | — | [ ] | [ ] | [ ] | [ ] | SS/JS may split into 2 files |
    | lec-tiler-duties | [ ] | [ ] | [ ] | — | [ ] | [ ] | [ ] | [ ] | shortest; typically ~20 lines |

    ## Aggregate

    _This section is human-maintained; Plan 04-08 crosschecks it against parsed rows._

    - **Rituals planned:** 21 (4 EA + 4 FC + 4 MM + 1 Installation + 8 Lectures seed; lecture count finalizable during Wave 1)
    - **Shannon-lodge override:** remove lecture rows before Plan 04-07 ships if scope drops to 5-7. Use strikethrough + `— [removed from scope]` in the notes column to preserve audit trail.
    - **Plan 04-08 gate:** all rows `shipped = [x]` (or `[—]` + removed-from-scope note) before Phase 4 closes.
    ```

    Then in `scripts/__tests__/content-checklist.test.ts`: flip Test 6 from `it.skip` to `it`. Test reads the file at `.planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md`, parses, validates; asserts `ok === true` and ≥ 18 rows.

    Commit prefix: `content-02: seed 04-CONTENT-CHECKLIST.md + enable round-trip test`
  </action>
  <action>
    1. Write `.planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md` per the template above.
    2. Edit `scripts/__tests__/content-checklist.test.ts`: change `it.skip("round-trip against on-disk checklist", ...)` to `it("round-trip against on-disk checklist", ...)`. Implementation: `const md = readFileSync(".planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md", "utf8"); const rows = parseChecklist(md); const result = validateChecklistShape(rows); expect(result.ok).toBe(true); expect(rows.length).toBeGreaterThanOrEqual(18);`
    3. Run the test: `npx vitest run --no-coverage scripts/__tests__/content-checklist.test.ts` — all 6 tests pass.
    4. Full vitest suite green.
    5. TypeScript check clean.
    6. Commit prefix: `content-02: seed 04-CONTENT-CHECKLIST.md + enable round-trip test`
  </action>
  <verify>
    <automated>npx vitest run --no-coverage scripts/__tests__/content-checklist.test.ts && npx tsx -e "import('./scripts/lib/content-checklist.ts').then(async m => { const fs = await import('node:fs'); const md = fs.readFileSync('.planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md', 'utf8'); const rows = m.parseChecklist(md); console.log('rows:', rows.length); console.log('validate:', m.validateChecklistShape(rows)); });"</automated>
  </verify>
  <done>
    Checklist file exists with all 5 group headers, 18+ ritual rows, valid status cells, and all 10 columns. Parser round-trip test passes. Full vitest suite green.
  </done>
</task>

</tasks>

<verification>
- [ ] `04-CONTENT-CHECKLIST.md` committed to git (`.planning/` directory — NOT in `.gitignore`; always tracked)
- [ ] `scripts/lib/content-checklist.ts` exports the documented API surface
- [ ] `npx vitest run --no-coverage scripts/__tests__/content-checklist.test.ts` → all 6 tests pass
- [ ] Full vitest suite green (Phase 3 baseline 517 + new ~8-10 tests)
- [ ] The checklist's slug list matches RESEARCH.md §Ritual Taxonomy
- [ ] Plan 04-03 through 04-07 executors can grep `04-CONTENT-CHECKLIST.md` to find their target ritual row
</verification>

<success_criteria>
The checklist is the ledger. Wave 1 content plans (04-03..07) and the release plan (04-08) have a stable, parseable, committed file to update. Shannon can pause content work for any length of time and resume at the next `[ ]` cell without ambiguity about what's done.
</success_criteria>

<output>
After completion, create `.planning/phases/04-content-coverage/04-02-SUMMARY.md` recording:
- Files touched
- Test results (test count, Phase 3 baseline preserved)
- Commit SHAs
- Total seeded ritual row count (expected 21 — 4 EA + 4 FC + 4 MM + 1 Installation + 8 Lectures; Shannon reduces lecture count during Wave 1 as needed)
</output>
