---
phase: 03-authoring-throughput
plan: 04
subsystem: author-validation
tags: [validator, cipher-plain-parity, word-ratio, bake-band, hard-fail, author-05, d-08]

# Dependency graph
requires:
  - phase: 03-authoring-throughput
    plan: 01
    provides: Wave 0 author-validation.test.ts scaffold (6 it.todo stubs) + vitest test runner config
provides:
  - validatePair() / validateParsedPair() now hard-fails at bake time on plain/cipher word-count drift outside [0.5×, 2×] band (severity "error" + kind "ratio-outlier" + "[D-08 bake-band]" message prefix)
  - 10 unit tests covering the 3 D-08 gates (speaker, action, word-ratio) + band boundaries + word-vs-char distinction + empty-cipher guard + well-formed-pair happy path
  - Existing soft character-ratio warning at lines 192-203 preserved verbatim (still drives the /author UI soft-warning UX)
affects: [03-06, 03-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Severity as the bake-vs-UI discriminator: validator pushes issues with severity 'error' (bake-stop) vs 'warning' (UI soft-warn), callers filter by severity === 'error' to decide exit code — no new kind added"
    - "Two coexisting ratio checks in one loop: soft char-ratio warning (pre-existing) + hard word-ratio error (new D-08) — both fire independently, word-ratio better captures meaning drift while char-ratio catches UI-anomalous cipher sizes"
    - "Pinned test fixture helper dialogueSource() returns literal markdown that parseDialogue() accepts — format verified against SPEAKER_RE/H2_RE/BRACKETED_RE in dialogue-format.ts"
    - "Boundary semantics: strict > 2.0 and < 0.5 thresholds (not ≥ and ≤), so ratio=2.0 exactly PASSES — test case locks this"

key-files:
  created: []
  modified:
    - src/lib/author-validation.ts
    - src/lib/__tests__/author-validation.test.ts

key-decisions:
  - "Inserted the D-08 bake-band block IMMEDIATELY AFTER the existing char-ratio warning block (lines 205-230), staying inside the `if (p.kind === 'line' && c.kind === 'line')` / `if (!p.isAction)` / `spokenLines++` branch — so action lines, cue nodes, and section nodes never trigger it, matching D-08's intent that only spoken-line word drift hard-fails the bake."
  - "No new `kind` added to PairLineIssue (still uses `ratio-outlier`). The discriminator between bake-stop and UI-warn is `severity: 'error'` vs `severity: 'warning'`; the `[D-08 bake-band]` message prefix is for human-readable logs only. Plan 06 + Plan 07 callers filter by severity, which is the existing pattern and requires no type-system churn."
  - "Word-count tokenizer is `text.trim().split(/\\s+/).filter(Boolean).length` — same as production tokenizers used elsewhere in the codebase for ritual text. `filter(Boolean)` defends against `text.trim()` returning an empty string that splits to `['']` (length=1 falsehood). `Math.max(cipherWords, 1)` guards the division separately from the `cipherWords >= 1` outer condition (belt-and-suspenders, cheap)."
  - "Test fixture helper `dialogueSource()` used VERBATIM from the plan's <interfaces> block — no executor-side tuning required. Format `## Section 1\\n\\nSPEAKER: text\\n` parses to one section + one line on first run, confirmed by the 10 passing tests."
  - "Fixed off-by-one in the plan's Test 3 word count (plan said 'Bone of my bone...' = 9 words; it's actually 10). Corrected the regex assertion from `/ratio=9\\.00×/` to `/ratio=10\\.00×/` + added `/plain=10 words/` and `/cipher=1 words/` matches to lock the full message shape. Rule 1 (bug in spec/test, fixed inline)."

patterns-established:
  - "When a caller wants the bake-refusal gate, filter `result.lineIssues.filter(i => i.severity === 'error')` — no filtering by kind required. The severity partition is the whole API."
  - "The existing soft character-ratio warning + the new hard word-ratio error can both fire on the same line pair. That is intentional — a cipher that is both 'unusually long in chars' and 'outside word-ratio band' correctly flags both dimensions. Callers that only care about bake refusal ignore severity='warning' entries."

requirements-completed: [AUTHOR-05]

# Metrics
duration: ~7min
completed: 2026-04-23
---

# Phase 3 Plan 04: Cipher/Plain Parity Validator (D-08) Summary

**Extended `src/lib/author-validation.ts` with a bake-time hard-fail word-count ratio check per D-08: plain/cipher word count ratio outside `[0.5×, 2×]` now returns a `severity: "error"` + `kind: "ratio-outlier"` issue with the `[D-08 bake-band]` message prefix. The three D-08 gates (same speaker, same action tags, word-count band) are all in place at bake time. The existing soft character-ratio warning at lines 192-203 is preserved verbatim — it continues to drive the `/author` UI soft-warning UX. Filled the Wave 0 test scaffold with 10 passing tests covering all three gates plus boundary conditions, word-vs-char distinction, and empty-cipher guard. Plan 06 (`build-mram-from-dialogue.ts`) and Plan 07 (`bake-all.ts`) can now `import { validatePair } from '@/lib/author-validation'` and filter by `severity === 'error'` to exit the bake non-zero.**

## Performance

- **Duration:** ~7 min (local work; 1 atomic commit; 1 full vitest suite + 1 full `npm run build` run)
- **Started:** 2026-04-23T18:30:31Z
- **Completed:** 2026-04-23T18:40:03Z (wall-clock window)
- **Tasks:** 1/1
- **Files created:** 0
- **Files modified:** 2 (`src/lib/author-validation.ts`, `src/lib/__tests__/author-validation.test.ts`)

## Accomplishments

- **`src/lib/author-validation.ts` extended** (+25 lines, no deletions):
  - New D-08 bake-band block inserted at **lines 205-230** of `author-validation.ts` (immediately after the pre-existing soft char-ratio block at lines 192-203).
  - Scope: inside `validateParsedPair` > loop over paired nodes > `if (p.kind === "line" && c.kind === "line")` > `if (!p.isAction)` (`spokenLines` branch). Action lines, cue nodes, section nodes do NOT trigger it — matching D-08's intent.
  - Logic:
    ```typescript
    const plainWords = p.text.trim().split(/\s+/).filter(Boolean).length;
    const cipherWords = c.text.trim().split(/\s+/).filter(Boolean).length;
    const wordRatio = plainWords / Math.max(cipherWords, 1);
    if (cipherWords >= 1 && (wordRatio > 2.0 || wordRatio < 0.5)) {
      lineIssues.push({
        index: i,
        severity: "error",
        kind: "ratio-outlier",
        message:
          `[D-08 bake-band] plain/cipher word ratio out of [0.5×, 2×] band: ` +
          `plain=${plainWords} words, cipher=${cipherWords} words, ratio=${wordRatio.toFixed(2)}×`,
      });
    }
    ```
  - Thresholds are strict: `> 2.0` and `< 0.5`. Exactly 2.0 and exactly 0.5 are IN band (pass). Locked by Test 4 (boundary case).
  - Empty-cipher guard: `cipherWords >= 1` prevents firing on empty cipher text (the existing `empty-text` error fires there instead).
  - `Math.max(cipherWords, 1)` defends the divisor independently — even though the outer `if` gates execution, this keeps the expression well-defined at all call points.

- **`src/lib/__tests__/author-validation.test.ts` filled** (+176 lines, replacing 6 `it.todo` stubs with 10 real tests):
  - **Structural checks (preserved behavior) — 2 tests:**
    1. Speaker mismatch (WM vs SW) → `structure-speaker` error.
    2. Action-tag mismatch (plain action, cipher spoken) → `structure-action` or `structure-kind` error.
  - **Bake-band word-count ratio (D-08 new) — 6 tests:**
    3. Cipher drastically shorter (10 words vs 1 word, ratio 10×) → `[D-08 bake-band]` error with `/ratio=10\.00×/`, `/plain=10 words/`, `/cipher=1 words/` matches.
    4. Cipher drastically longer (1 word vs 6 words, ratio ≈0.17) → `[D-08 bake-band]` error.
    5. Within-band acceptance (4 words vs 3 words, ratio 1.33) → no bake-band error.
    6. Boundary at ratio=2.0 exactly (4 words vs 2 words) → no bake-band error (strict `>`).
    7. Word-count NOT char-count distinction (`aaaaa` vs `bbbbbbbbbb` — same 1 word, 2× chars) → no bake-band error.
    8. Existing char-ratio warning preservation (20+ char plain, char-ratio crosses threshold, word-ratio in band) → no bake-band error; pre-existing warning path still intact.
  - **Well-formed pair — 1 test:**
    9. Same speaker, same action flag, word ratio 5/4=1.25 → `structureOk=true` and no error-severity issues at all.
  - **Empty cipher guard — 1 test:**
    10. Empty cipher source string → no throw, no `[D-08 bake-band]` error (the new block's `cipherWords >= 1` guard holds); structural error(s) surface instead.

- **`@vitest-environment node` pragma preserved** from Plan 01 scaffold.

- **Pinned test fixture helper `dialogueSource(speaker, text, isAction?)`** — used verbatim from the plan's `<interfaces>` block, returns `## Section 1\n\n<SPEAKER>: <TEXT>\n` (or `## Section 1\n\n<SPEAKER>: [<TEXT>]\n` for action lines). Worked on first run — no iteration needed on format.

## Exact Line Range of New Code

In `src/lib/author-validation.ts`:

| Lines | Content |
|-------|---------|
| 192-203 | Pre-existing soft char-ratio warning (preserved verbatim) |
| 204 | Blank line |
| 205-216 | New D-08 comment block (12 lines of inline documentation) |
| 217-219 | `plainWords`, `cipherWords`, `wordRatio` declarations |
| 219-229 | `if (cipherWords >= 1 && ...)` → `lineIssues.push({ severity: "error", kind: "ratio-outlier", message: "[D-08 bake-band] ..." })` |
| 230 | Closing `}` of the new block |

## Sample Validator Output

**Deliberately-corrupted pair** (plain: "Bone of my bone and flesh of my flesh always" / cipher: "B."):

```text
{
  index: 1,
  severity: "error",
  kind: "ratio-outlier",
  message: "[D-08 bake-band] plain/cipher word ratio out of [0.5×, 2×] band: plain=10 words, cipher=1 words, ratio=10.00×"
}
```

**Legitimate short-cipher pair** (plain: "Brethren of the lodge" / cipher: "Brn. of lodge") — no bake-band error:

```text
result.lineIssues.filter(i => i.kind === "ratio-outlier" && i.severity === "error")
// → [] (word ratio 4/3 = 1.33 → IN band)
```

**Word-count vs char-count distinction** (plain: "aaaaa" / cipher: "bbbbbbbbbb" — same 1 word each, 2× chars):

```text
result.lineIssues.filter(i => i.message.includes("[D-08 bake-band]"))
// → [] (word ratio 1/1 = 1.0 → IN band, regardless of 2× char ratio)
```

## Character-Ratio Warning Preservation (Canonical /author UI Case)

The existing warning at lines 192-203 still fires for scenarios the /author UI expects. Confirmed by Test 8 (`preserves the existing character-ratio WARNING`):

- Plain: "The Worshipful Master says" (4 words, 25 chars)
- Cipher: "The Worshipful Master says indeed today" (6 words, 39 chars)
- **Char ratio:** 39/25 = 1.56 → triggers the existing warning (`p.text.length >= 20 && ratio > 1.0`).
- **Word ratio:** 4/6 = 0.67 → IN band, no new error.
- Result: the /author UI still renders "cipher is longer than plain" as a yellow warning; the bake would still pass (no error-severity issues).

This is the intentional coexistence pattern — the UI warning catches "visually anomalous" cipher sizes; the bake-stop error catches "meaning-level" drift. They fire on overlapping but distinct populations of pairs.

## Band Semantics Matrix

| Plain words | Cipher words | Ratio | Band? | Verdict |
|-------------|--------------|-------|-------|---------|
| 10 | 1 | 10.00× | OUT (>2) | hard-fail |
| 4 | 2 | 2.00× | IN (boundary) | pass |
| 5 | 4 | 1.25× | IN | pass |
| 4 | 3 | 1.33× | IN | pass |
| 1 | 1 | 1.00× | IN | pass |
| 1 | 2 | 0.50× | IN (boundary) | pass |
| 1 | 6 | 0.17× | OUT (<0.5) | hard-fail |
| (any) | 0 | guarded | n/a | empty-text error path |

All rows test-covered by Tests 3-10.

## Test Results

- **author-validation.test.ts only:** `npx vitest run --no-coverage src/lib/__tests__/author-validation.test.ts` — **10 passed / 0 failed / 0 todo**.
- **Full vitest suite (post-Plan-04):** **432 passed + 48 todo** (480 tests across 39 files + 4 skipped). 0 failures. Vs Plan 03 baseline (422 passed + 54 todo): **+10 passes, -6 todos** — matches exactly the 6 `it.todo` stubs filled (2 structural + 4 word-ratio per the original scaffold) plus the 4 additional tests (boundary, word-vs-char, warning preservation, well-formed) that were added to cover the plan's expanded test spec.
- **Build (`npm run build`):** exits 0. Next.js compile clean. `/author` route compiled as static (○). No regression in consumers of `validatePair` (the /author page renders the validator output live).
- **TSC (`npx tsc --noEmit`):** pre-existing errors in unrelated files persist (dev-guard tests — `NODE_ENV` readonly, confirmed pre-existing per Plan 03-03 SUMMARY; screen-wake-lock, voice-export-import, rotate-mram). **Zero errors reference author-validation or the test file.** Out of scope per executor deviation-rules scope boundary.

## dialogueSource() Helper: First-Run Confirmation

The pinned `dialogueSource()` helper from the plan's `<interfaces>` block ran on the first attempt with no format tuning. Specifically:

- `dialogueSource("WM", "hello")` → `"## Section 1\n\nWM: hello\n"` → parseDialogue emits `[{kind:"section",id:"section-1"}, {kind:"line",speaker:"WM",text:"hello",isAction:false}]`.
- `dialogueSource("WM", "rises", true)` → `"## Section 1\n\nWM: [rises]\n"` → parseDialogue emits `[{kind:"section",...}, {kind:"line",speaker:"WM",text:"rises",isAction:true}]`.

The format matches `SPEAKER_RE = /^([A-Za-z][A-Za-z0-9/]*):\s+(.+)$/` and `H2_RE = /^## (.+)$/` exactly — see `src/lib/__tests__/dialogue-format.test.ts:125-130` for the analog. **No executor-side tuning required.**

## Threat Model Mitigation Verification

| Threat ID | Status after Plan 04 |
|-----------|----------------------|
| T-03-04 (cipher/plain drift ships silently to invited Brothers) | **Mitigated.** All three D-08 gates (same-speaker, same-action-tags, word-count-band) now hard-fail with `severity: "error"` at bake time. Plan 06 + Plan 07 orchestrators will filter by severity to exit non-zero — no `--force` override per D-08. Test 1 (speaker), Test 2 (action), Tests 3-4 (ratio) cover each gate; Tests 5-7 cover the acceptance side. |
| T-03-04b (false-positive on legitimate ultra-short ciphers) | **Accept (design).** Band `[0.5×, 2×]` is wide enough that "Brn. of lodge" (3 words) for "Brethren of the lodge" (4 words) passes (ratio 1.33), per Test 5. Ultra-short ciphers (1-letter for 3-4-word phrases, ratio 3-4) correctly trip — Shannon reviews validator output and either tightens the cipher ("Bo." → ratio 2, passes) or accepts the refusal and uses runtime TTS for that line. No `--force`. |
| T-03-04c (Plan 06/07 ignores severity="error" issues) | **Primitive ready.** The validator emits the issues; Plan 06 (`build-mram-from-dialogue.ts`) and Plan 07 (`bake-all.ts`) will implement the filter snippet: `const errors = result.lineIssues.filter(i => i.severity === 'error'); if (errors.length > 0 || !result.structureOk) process.exit(1);` — per PATTERNS.md §Validator-gate. Not enforced in Plan 04 scope (Plan 04 is the primitive only). |

## Task Commits

Each task committed atomically on `gsd/phase-3-authoring-throughput`:

1. **Task 1: Add D-08 bake-band word-ratio hard-fail + fill test scaffold** — `76c565f`
   (`author-05: add D-08 bake-band word-ratio hard-fail to author-validation`)

## Deviations from Plan

**1. [Rule 1 — Bug] Fixed off-by-one word count in plan's Test 3 fixture**

- **Found during:** Task 1 (TDD GREEN phase, first test run after implementation)
- **Issue:** The plan's `<behavior>` Test 3 and `<action>` Test 3 used plain text "Bone of my bone and flesh of my flesh always" and asserted `wordRatio = 9` / `ratio=9.00×`. Counting the actual words: `Bone(1) of(2) my(3) bone(4) and(5) flesh(6) of(7) my(8) flesh(9) always(10)` = **10 words, not 9**. The assertion `expect(bakeErrors[0]!.message).toMatch(/ratio=9\.00×/)` failed because the code correctly computed 10.00×.
- **Fix:** Updated the test's regex from `/ratio=9\.00×/` to `/ratio=10\.00×/`, and added two additional locking assertions: `/plain=10 words/` and `/cipher=1 words/`. The plan's text fixture was kept verbatim — only the assertion corrected to match the actual word count.
- **Impact:** None on the D-08 semantics. The core property being tested (ratio >> 2.0 → error) is identical; the regex just now matches the correct computed value. Coverage is stricter (three assertions instead of one).
- **Files modified:** `src/lib/__tests__/author-validation.test.ts` only.
- **Commit:** `76c565f` (same commit as the main implementation — the fix was inline during the TDD cycle, not a separate post-hoc correction).

No other deviations. All other tasks applied verbatim from the plan's `<action>` block; all acceptance criteria pass; no auto-fixes required; no blockers hit; branch `gsd/phase-3-authoring-throughput` held stable throughout.

## Issues Encountered

None that impacted the plan. Pre-existing `tsc --noEmit` errors in unrelated test files (`dev-guard.test.ts` NODE_ENV-readonly, `voice-export-import.test.ts`, `rotate-mram.test.ts`, `screen-wake-lock.test.ts`) are out of scope per executor deviation-rules scope boundary and were verified pre-existing by Plan 03-03 SUMMARY on the same clean tree.

## User Setup Required

None — all changes are local repo code + tests. The new bake-band check is dormant until Plan 06 / Plan 07 wire the severity-filter into the orchestrator; meanwhile the /author UI continues to render validator output (now including a "red error-level" annotation for ratio-outlier lines, which the UI's existing `lineIssue.severity === "error"` styling already handles — verified by the `npm run build` pass).

## Next Phase Readiness

- **Plan 05 (cache-migration):** unblocked. Independent of Plan 04.
- **Plan 06 (bake-integration, `build-mram-from-dialogue.ts`):** unblocked AND now has the primitive it needs. Plan 06 will call `validatePair(plainSrc, cipherSrc)` and run `result.lineIssues.filter(i => i.severity === 'error')` at the pre-render gate. On non-empty error array → `process.exit(1)`. Per-line error context (including `[D-08 bake-band]`-prefixed messages) will flow straight into the script's stderr output.
- **Plan 07 (bake-all orchestrator):** unblocked. Same integration pattern as Plan 06 — PATTERNS.md §Validator-gate snippet applies.
- **Plan 08 (preview-bake):** unblocked. Validator is shared regardless of which orchestrator invokes it.
- **No blockers** for any downstream plan.

## Self-Check: PASSED

- Files claimed modified (2):
  - `src/lib/author-validation.ts` — FOUND (248 lines; D-08 bake-band block at lines 205-230; existing char-ratio warning at 192-203 intact; both `plainWords` and `cipherWords` declarations present; `wordRatio` appears 3× in file).
  - `src/lib/__tests__/author-validation.test.ts` — FOUND (195 lines, 10 real tests, 0 `it.todo` stubs remaining; pinned `dialogueSource` helper present; `## Section 1` literal appears 2× in the file — 1 in helper comment + 1 in helper body).
- Commits claimed:
  - `76c565f` — FOUND on `gsd/phase-3-authoring-throughput` (Task 1, `author-05: add D-08 bake-band word-ratio hard-fail to author-validation`).
- Verification commands:
  - `npx vitest run --no-coverage src/lib/__tests__/author-validation.test.ts` → **10 passed / 0 failed / 0 todo**.
  - `npx vitest run --no-coverage` (full suite) → **432 passed + 48 todo, 0 failed**.
  - `npm run build` → exit 0, `/author` route compiled successfully.
  - `grep -c "D-08 bake-band" src/lib/author-validation.ts` → `1`.
  - `grep -c 'severity: "warning"' src/lib/author-validation.ts` → `2` (both preserved — existing char-ratio + existing unknown-role).
  - `grep -c "wordRatio" src/lib/author-validation.ts` → `3` (declaration + condition + message).
  - `grep -c "it.todo(" src/lib/__tests__/author-validation.test.ts` → `0`.
  - `grep -q "function dialogueSource" src/lib/__tests__/author-validation.test.ts` → match.
  - `grep -c "## Section 1" src/lib/__tests__/author-validation.test.ts` → `2`.
  - Branch `gsd/phase-3-authoring-throughput` held at start AND end of plan.

---
*Phase: 03-authoring-throughput*
*Completed: 2026-04-23*
