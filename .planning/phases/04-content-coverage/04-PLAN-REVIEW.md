---
phase: 04-content-coverage
iteration: 1
status: issues-found
severity_max: major
plans_checked: 8
reviewer: gsd-plan-checker
reviewed: 2026-04-23
---

# Phase 4 Plan Review — Iteration 1

> Goal-backward verification of the 8 Phase 4 plans against CONTENT-01..07 and the phase goal: "Every invited lodge's officer can rehearse EA, FC, MM, Installation, and the core officer lectures in Shannon's lodge's working, with pre-baked Opus audio for every line so a first-time rehearsal never requires live TTS."

## Per-plan verdict

| Plan | Wave | Requirements claimed | Verdict | Severity |
|------|------|----------------------|---------|----------|
| 04-01 verifier-release-gate | 0 | CONTENT-06, CONTENT-07 | issues-found | major |
| 04-02 content-checklist | 0 | CONTENT-01..05 | issues-found | major |
| 04-03 ea-rebake | 1 | CONTENT-01 | pass | info |
| 04-04 fc-authoring-bake | 1 | CONTENT-02 | pass | info |
| 04-05 mm-authoring-bake | 1 | CONTENT-03 | pass | info |
| 04-06 installation-authoring-bake | 1 | CONTENT-04 | pass | info |
| 04-07 lectures-authoring-bake | 1 | CONTENT-05 | issues-found | major |
| 04-08 phase-release-verification | 2 | CONTENT-01..07 | issues-found | minor |

**Aggregate:** All 7 CONTENT-* requirements are mapped to at least one plan's `requirements:` frontmatter. No requirement is orphaned. Wave structure is valid (no cycles, depends_on is consistent with declared waves). Phase goal is fully addressable by the plan set if the findings below are resolved.

## Requirement coverage matrix

| Req ID | Primary plan | Secondary / evidence | Mapped | Addresses goal |
|--------|--------------|----------------------|--------|----------------|
| CONTENT-01 (EA baked) | 04-03 | 04-08 aggregate | ✓ | ✓ |
| CONTENT-02 (FC baked) | 04-04 | 04-08 aggregate | ✓ | ✓ |
| CONTENT-03 (MM baked) | 04-05 | 04-08 aggregate | ✓ | ✓ |
| CONTENT-04 (Installation baked) | 04-06 | 04-08 aggregate | ✓ | ✓ |
| CONTENT-05 (Officer lectures baked) | 04-07 | 04-08 aggregate | ✓ | ✓ |
| CONTENT-06 (Per-line Opus verified) | 04-01 (verifier) | 04-03..07 per-ritual verify step; 04-08 aggregate | ✓ | ✓ |
| CONTENT-07 (Parity validator release gate) | 04-01 (release-gate) | 04-03..07 per-ritual; 04-08 aggregate | ✓ | ✓ |

## Files-modified disjointness check

Ritual source and `.mram` files are disjoint across the 5 Wave-1 content plans (04-03..07). Only shared file is `.planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md`, which every content plan appends/updates. This matches the plan-checker instruction ("append-only edits, not rewrites") — no structural violation. ✓

No plan proposes a GitHub Actions workflow for `rituals/*` files. ✓ Local-only release gate discipline preserved.

## Wave / dependency graph

- Wave 0: 04-01 (deps=[]), 04-02 (deps=[]) — runnable in parallel
- Wave 1: 04-03..07 (deps=[01, 02]) — runnable in parallel or in any Shannon-picked order once Wave 0 lands
- Wave 2: 04-08 (deps=[01, 02, 03, 04, 05, 06, 07]) — blocks on all Wave 0 + Wave 1

Graph is acyclic; declared waves match dependency closure. ✓

---

## Findings

### MAJOR — plan contract mismatch between 04-02 parser and 04-07 strikethrough

**Where:**
- `04-02-content-checklist-PLAN.md:131-155` (Task 1 parser contract — `StatusCell = "[ ]" | "[~]" | "[x]" | "—"`; parser throws `InvalidStatusCell` on anything else; header regex `/^## ([^\n]+)$/gm`)
- `04-07-lectures-authoring-bake-PLAN.md:216` (Task 2 instructs: "for each OUT-of-scope lecture row → prepend `~~` strikethrough")
- `04-07-lectures-authoring-bake-PLAN.md:277-284` (Task 4: "strikethrough row + notes column", then the hand-wave: "If descoping broke the parser, the parser is extended to accept strikethrough-wrapped rows as valid-but-removed")

**Issue:** The Plan 04-02 parser spec will throw when Plan 04-07 writes a strikethrough row like `| ~~lec-stewards-duties~~ | [ ] | ...`. The `~~slug~~` content will not match the slug extraction logic, AND the pipe layout inside a strikethrough-wrapped table row is markdown-visually valid but behaviorally undefined in the plan's hand-rolled parser.

Plan 04-07 acknowledges this with "If descoping broke the parser, the parser is extended..." — that is a TODO, not a plan. An executor in Plan 04-07 has no clear instruction for what to do if the round-trip test (04-02 Test 6) goes red after descoping.

Secondary inconsistency: Plan 04-02 line 275 mentions `[—]` as a valid status indicating "not applicable", but the `StatusCell` union in Task 1 (line 131) lists `—` (bare em-dash without brackets). The planner needs to pick one.

**Impact:** Plan 04-07 Task 4 verify step (`npx vitest run --no-coverage scripts/__tests__/content-checklist.test.ts`) will fail when any lecture is descoped via strikethrough. Plan 04-08 Task 1 re-runs the same test — also fails. Plan 04-08 cannot close Phase 4 unless the parser handles descoped rows OR the descope UX changes.

**Fix (one of):**
1. **Define scope-out protocol in 04-02.** Plan 04-02 adds a `ChecklistRow.scope: "in" | "out"` field and a parser rule: a row whose slug cell is wrapped in `~~...~~` parses as `scope: "out"` with `shipped: "—"` implied, and `validateChecklistShape` counts only `scope === "in"` rows for duplicate/group-presence checks. Plan 04-07 references the new parser behavior instead of the hand-wave.
2. **Change the descope UX in 04-07** to NOT use strikethrough; instead, set the whole row's status cells to `—` and use the notes column alone for the "removed from scope per Task-1 decision" annotation. Then the existing 04-02 parser works unchanged.

Recommendation: option 2 is simpler (no parser extension; no new scope field; no test changes in 04-02). Pick one and revise both plans.

### MAJOR — implicit v1→v3 interface bump in 04-01 left for executor inference

**Where:** `04-01-verifier-release-gate-PLAN.md` Task 2 action (line 252–320) and the interfaces block (line 98–131)

**Issue:** The current on-disk `scripts/verify-mram.ts:63` throws on any `version !== 1`. Every existing `.mram` in `rituals/` is version byte `0x03` (confirmed by inspecting `rituals/ea-opening.mram` header bytes: `4d52414d 03 ...`). This means the current verify-mram.ts is already non-functional against shipped files — Phase 3 never fixed the hardcoded `version !== 1` check.

Plan 04-01's Task 2 behavior contract is detailed but nowhere in the action text does it say "remove the `version !== 1` throw and accept v3". The local `MRAMDocument` / `MRAMMetadata` / `MRAMLine` interfaces in `scripts/verify-mram.ts:41-53` also don't declare `voiceCast`, `audioFormat`, or `audio` fields — Plan 04-01 alludes to extending the interface in `must_haves.artifacts.contains` but doesn't enumerate the interface diff in the action.

A diligent TDD executor will hit this the moment Test 5 (v2-era mram rejected with "v3+ required") runs — because Test 1 ("good v3 mram exits 0") will first fail with "Unsupported .mram version: 3". The executor will reverse-engineer the fix. But it is avoidable work and a planning-layer specificity gap.

**Fix:** Add an explicit subsection to 04-01 Task 2 action: "Bump the accepted version in `decryptMRAM`: replace `if (version !== 1)` with `if (version !== 3) throw new Error('Unsupported .mram version: ' + version + ' (v3 required)')`. Update the local `MRAMDocument` / `MRAMMetadata` / `MRAMLine` interfaces to match the v3 shape in `src/lib/mram-format.ts`: add `voiceCast?: Record<string,string>` and `audioFormat?: 'opus-32k-mono'` to metadata, `audio?: string` to MRAMLine. Preserve backward-compat: when `--check-audio-coverage` is NOT passed, v3 files should still print role breakdown etc. (existing Phase 3 behavior)."

### MAJOR — Plan 04-03 EA re-bake relies on a broken current verify-mram.ts

**Where:** `04-03-ea-rebake-PLAN.md` Task 1 Step 3 and Task 3 Step 1

**Issue:** Task 1 Step 3 says: "`npx tsx scripts/verify-mram.ts rituals/ea-opening.mram --check-audio-coverage` with exit 0" is a must_haves truth. But until Plan 04-01 Task 2 ships the interface + version bump (MAJOR finding above), the current verify-mram.ts THROWS on all existing v3 `.mram` files. The dependency `depends_on: [01, 02]` covers this on paper, but only if Plan 04-01 actually fixes the version throw — which is not spelled out.

This is a transitive consequence of the 04-01 finding, but it's worth flagging because Plan 04-03 is the first content plan to exercise the new verifier against real content. If 04-01 lands without the version fix, 04-03's Task 3 verify commands will all fail on the FIRST ritual.

**Fix:** Resolution of the 04-01 finding automatically resolves this. No 04-03 change needed beyond what 04-01 fixes produce.

### MAJOR — Plan 04-07 frontmatter lists 9 lectures as `files_modified`, but Task 1 makes scope a decision

**Where:** `04-07-lectures-authoring-bake-PLAN.md` frontmatter `files_modified:` (lines 7-43) declares 36 lecture source files (9 lectures × 4 files each — dialogue, cipher, voice-cast, mram), but Task 1 (line 148-178) presents four scope options ranging from 4 lectures to 11 (split deacons/stewards). If Shannon picks option-b (4 lectures), the frontmatter promises files that never get created.

**Issue:** Frontmatter `files_modified` becomes inaccurate depending on Task 1 outcome. Downstream orchestrators or audit tools relying on `files_modified` will diff against reality and flag phantom-missing files. This also contradicts the instruction "Any plan that hardcodes a specific lecture count for Plan 04-07 — RESEARCH.md said 5-9 depending on Shannon's lodge; the plan should treat the set as Shannon-provided rather than enumerated."

The plan partially treats the set as Shannon-provided (Task 1 decision), but freezes the enumeration in frontmatter. The gap: frontmatter was generated before Shannon's Task 1 decision.

**Impact:** Medium. Audit accuracy after Phase 4 close. Not an execution blocker.

**Fix:** Change `files_modified` frontmatter to a glob-pattern-style note:

```yaml
files_modified:
  - rituals/lec-{N lectures chosen in Task 1}-dialogue.md
  - rituals/lec-{N lectures chosen in Task 1}-dialogue-cipher.md
  - rituals/lec-{N lectures chosen in Task 1}-voice-cast.json
  - rituals/lec-{N lectures chosen in Task 1}.mram
  - .planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md
# Final list written to 04-07-SUMMARY.md after Task 1 decision.
```

Or keep the 9-entry enumeration with a header comment: `# MAX scope; Task 1 decision may reduce. SUMMARY records actual shipped set.`

### MINOR — Plan 04-08 Task 2 success criterion assumes ea-initiation available, but Plan 04-03 doesn't guarantee it

**Where:** `04-08-phase-release-verification-PLAN.md` Task 2 line 166-169 lists the dogfood set:
> 1. `ea-initiation.mram` — EA representative

`ea-initiation.mram` exists today as a v2-cache-baked file; Plan 04-03 re-bakes it. So by the time 04-08 runs, it'll be a fresh v3 `.mram`. OK. But the plan doesn't verify that assumption or specify "re-baked v3 from Plan 04-03" — it just names the file.

**Impact:** Low. The `depends_on: [03,...]` chain enforces this. Cosmetic.

**Fix:** Optional — Task 2's dogfood set could add "(post-04-03 v3 re-bake)" after each EA file for audit clarity.

### MINOR — Plan 04-08 Task 3 verify block duplicates itself

**Where:** `04-08-phase-release-verification-PLAN.md` line 292-294

The verify block has a partially-closed `<automated>` tag followed by a duplicate opening. Current (problematic) text:

```
<verify>
    <automated>grep -c "\[x\] \*\*CONTENT-0" .planning/REQUIREMENTS.md && grep -q "Phase 4 | Content Coverage | 8/8 | Complete\|Phase 4.*Complete" .planning/STATE.md && grep -q "\[x\] \*\*Phase 4" .planning/ROADMAP.md && test -f .planning/phases/04-content-coverage/04-08-SUMMARY.md && test -f .planning/phases/04-content-coverage/04-HUMAN-UAT.md && npx vitest run --no-coverage 2>&1 | tail -3  <verify>
    <automated>grep -c "\[x\] \*\*CONTENT-0" .planning/REQUIREMENTS.md && grep -q "Phase 4.*Complete" .planning/STATE.md && grep -q "\[x\] \*\*Phase 4" .planning/ROADMAP.md && test -f .planning/phases/04-content-coverage/04-08-SUMMARY.md && test -f .planning/phases/04-content-coverage/04-HUMAN-UAT.md && npx vitest run --no-coverage 2>&1 | tail -3</automated>
  </verify>
```

Two `<automated>` opens, one close — the first `<automated>` tag is never closed before the second opens, and an embedded `<verify>` appears inline. XML-parse-wise this is malformed.

**Impact:** An executor reading the plan may confuse which command to run; the gsd-sdk query `verify.plan-structure` will likely flag this as a task-completeness error.

**Fix:** Remove the duplicate. Pick one of the two commands (the shorter `Phase 4.*Complete` grep is the safer one since the exact STATE.md row format isn't pinned elsewhere).

### MINOR — Plan 04-03 `files_modified` includes `rituals/_bake-cache/` but 04-04..07 don't

**Where:** `04-03-ea-rebake-PLAN.md:9` lists `rituals/_bake-cache/`. Plans 04-04 through 04-07 also produce cache writes during bake but don't declare this dir.

**Impact:** Trivial inconsistency. `_bake-cache/` is a side-effect directory of every bake; it's gitignored, so audit impact is zero. Either add it everywhere for consistency or drop it from 04-03 for consistency.

**Fix:** Drop from 04-03 (easier). The cache is an implementation detail of bake-all, not a plan deliverable.

### INFO — Plan 04-01 Test 7 "existing Phase 3 behaviour preserved byte-identical" is a tight assertion

**Where:** `04-01-verifier-release-gate-PLAN.md` Task 1 Test 7

"Without `--check-audio-coverage`, existing Phase 3 behaviour (role breakdown, section table, first/last-3 sample) is preserved → output contains 'Role breakdown' and the existing '✓ Verification complete' sentinel."

Given the `version !== 1` bug noted above, the current Phase 3 behavior is "throws on real files." Test 7 needs to pin what the v3-accepting-but-no-flag behavior is — the existing sentinels (`Role breakdown`, `✓ Verification complete`) are the right pin, but "byte-identical" is overclaiming because the current state of the script doesn't work on v3 at all. Suggest the TDD test lock the sentinel strings only, not "byte-identical."

**Fix:** Change Test 7 language from "byte-identical" to "sentinel-identical — output includes 'Role breakdown' and '✓ Verification complete' strings; exact format drift OK as long as the fixture v3 file decrypts + prints role breakdown + prints section table + prints first/last 3 sample lines."

### INFO — Voice-cast reuse pattern is documented in prose, not enforced in plan

**Where:** Plan 04-04 `key_links` line 66-68; Plan 04-05 `key_links`; Plan 04-06 `key_links`; Plan 04-07 `key_links`. Each says role profiles reuse ea-initiation-voice-cast.json verbatim.

Per the instruction "voice-cast reuse pattern (EA role profiles reused across FC/MM/Installation) is consistent across plans — this is a cache-hit optimization per RESEARCH.md §Voice Casting," the pattern IS consistent across all 4 plans. ✓ However, no plan proposes a mechanical check that `fc-opening-voice-cast.json:roles.WM` deep-equals `ea-initiation-voice-cast.json:roles.WM`. If Shannon accidentally diverges (e.g., copy-pastes and edits a character), the deviation is only caught at scrub time when voices audibly drift.

**Impact:** Low. Scrub-time catch is the canonical safety net per Phase 3 discipline. A mechanical check would be nice-to-have but adds tooling scope.

**Fix (optional):** Consider a small test in Plan 04-02 (or 04-04 Task 5) that deep-compares role objects across voice-cast files and fails if any field drifts. Can defer to Phase 5 or later.

## What ISN'T an issue (actively verified)

- **Red flag 1 (CI gate):** No plan proposes a GitHub Actions workflow for `rituals/*`. ✓
- **Red flag 3 (Wave-1 disjointness):** Per-ritual files (dialogue, cipher, voice-cast, styles, mram) are fully disjoint across 04-03..07. Only shared artifact is `04-CONTENT-CHECKLIST.md`, which all content plans update via row updates (not rewrites). ✓
- **Red flag 4 (rival verifier):** Plan 04-01 EXTENDS `scripts/verify-mram.ts` with new flags AND creates a separate `scripts/verify-content.ts` release-gate ORCHESTRATOR that imports verify-mram (not a rival). The separation of concerns is sound — verify-mram stays the single-file verifier; verify-content is the multi-file release gate orchestrator. ✓
- **Phase goal achievability:** If the 8 plans land with the above fixes, an officer at an invited lodge can: log in at `masonicmentor.app`, download `ea-*.mram` + `fc-*.mram` + `mm-*.mram` + `installation.mram` + `lec-*.mram`, drag-drop each to `/practice`, enter the passphrase, and rehearse every spoken line with pre-baked Opus audio playback (no live TTS). CONTENT-01..07 all trace to this end state. ✓
- **Threat models:** Each plan has a STRIDE register with appropriate severities (LOW-MEDIUM) and mitigations that reuse Phase 3 tooling rather than inventing new primitives. ✓
- **Scope sanity:** Plans 04-01 (2 tasks), 04-02 (2 tasks), 04-03 (3 tasks), 04-04 (5 tasks), 04-05 (5 tasks), 04-06 (3 tasks), 04-07 (4 tasks), 04-08 (3 tasks). Plans 04-04 and 04-05 at 5 tasks each are on the borderline — normally this would be a warning, but calibrated for content-labor plans these are per-ritual checkpoints rather than parallel engineering work, and the calendar-weeks-long nature of content authoring means context pressure is per-task, not per-plan. ✓ (acceptable)

## Nyquist / engineering test coverage

Engineering surfaces (Plans 04-01, 04-02) both have explicit vitest scaffolds with RED-test-first discipline and `<automated>` verify commands. Test file plan:
- `scripts/__tests__/verify-mram.test.ts` — 7 tests (Plan 04-01)
- `scripts/__tests__/verify-content.test.ts` — 5 tests (Plan 04-01)
- `scripts/__tests__/content-checklist.test.ts` — 6 tests (Plan 04-02)

Content plans (04-03..07) are correctly exempted from unit-test coverage — the tests Shannon "runs" are (a) validator + verifier per ritual, (b) scrub-judgment in preview-bake. ✓

Wave 0 VALIDATION.md references match: tests are ready to produce RED before Wave 1 content labor begins. ✓

## Recommendation

**Status: issues-found. Returning to planner for iteration 2.**

Fix the 3 MAJOR findings:
1. **04-02 ↔ 04-07 descope contract** (pick option 1 parser extension OR option 2 UX simplification; recommend option 2)
2. **04-01 explicit v1→v3 version-throw + interface bump** (add to Task 2 action)
3. **04-07 frontmatter scope flexibility** (use glob-pattern or max-scope note)

The 2 MINOR findings (04-08 verify duplication, 04-03 `_bake-cache` listing) are quick cosmetic fixes worth catching in the same revision.

The INFO findings are optional polish; not blocking.

Once these land, Phase 4 plans should pass verification on iteration 2. The plan set is structurally sound — the findings above are specificity gaps rather than conceptual errors. Shannon will be able to execute against these plans and land Phase 4 with an invited WM able to rehearse every ritual end-to-end.

## PLAN CHECK COMPLETE — status: issues-found
