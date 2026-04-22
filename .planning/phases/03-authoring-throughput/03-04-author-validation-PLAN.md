---
phase: 03-authoring-throughput
plan: 04
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/lib/author-validation.ts
  - src/lib/__tests__/author-validation.test.ts
autonomous: true
requirements: [AUTHOR-05]
tags: [validator, cipher-plain-parity, word-ratio, bake-band, hard-fail]

must_haves:
  truths:
    - "src/lib/author-validation.ts exports a word-count ratio check that hard-fails with severity 'error' when plain/cipher word-count ratio is OUTSIDE the band [0.5×, 2×] (per D-08)"
    - "The pre-existing character-ratio warning at lines 192-203 is preserved verbatim (continues to back the /author UI soft-warning UX)"
    - "Validator still refuses at bake time on three gates: (1) same-speaker mismatch (severity error), (2) action-tag mismatch (severity error), (3) word-count ratio out-of-band (severity error, NEW via this plan)"
    - "The new check kind is 'ratio-outlier' severity 'error' — existing callers that filter by severity still work; new callers can also distinguish via the explicit [D-08 bake-band] prefix in the message"
    - "Tests cover at minimum 6 cases: plain-longer ratio > 2×, plain-shorter ratio < 0.5×, within-band (ratio ~1), boundary (ratio = 2.0), cipher-only empty, and word-count-not-char-count distinction"
  artifacts:
    - path: src/lib/author-validation.ts
      provides: "structural + bake-band parity validation — now returns bake-stop errors for plain/cipher word-count drift"
      contains: "D-08 bake-band"
    - path: src/lib/__tests__/author-validation.test.ts
      provides: "unit tests for AUTHOR-05 bake-band word-ratio check + regression tests for existing structural checks"
      contains: "bake-band"
  key_links:
    - from: "scripts/build-mram-from-dialogue.ts (Plan 06)"
      to: src/lib/author-validation.ts
      via: "validatePair() call at pre-render gate; hard-fail on severity: 'error' + bake-band issues"
      pattern: "validatePair"
    - from: "scripts/bake-all.ts (Plan 07)"
      to: src/lib/author-validation.ts
      via: "validateOrFail(slug) pattern from PATTERNS.md §Validator-gate"
      pattern: "validatePair"
---

<objective>
Extend `src/lib/author-validation.ts` with a bake-time-hard-fail word-count ratio check (per D-08): plain/cipher word count must fall within `[0.5×, 2×]` or the validator returns a `severity: "error"` `ratio-outlier` issue. Preserve the existing soft-warning character-ratio check at lines 192-203 — both coexist: the soft check drives the `/author` UI soft-warning UX, the new hard check drives the Plan-06/Plan-07 bake-refusal gate. Fill in the Plan-01 test scaffold with six concrete test cases.

Purpose: per D-08, Shannon will rewrite a bad cipher line rather than ship a .mram that scores wrong. A corrupted dialogue pair (different speaker, mismatched action tags, or word-count drift) must fail the bake at bake time, not at first-rehearsal time when an invited Brother sees a phantom score-failure. No `--force` override in Phase 3. The word-count band `[0.5×, 2×]` is wide enough that a 1-letter cipher abbreviating a 5-word plain phrase ("B." for "Bone of my bone") still falls in band; tight enough to catch dialogue-pair drift.

Output: extended `author-validation.ts` with the new bake-band check (small addition, existing code untouched), comprehensive test file covering all three D-08 gates.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/03-authoring-throughput/03-CONTEXT.md
@.planning/phases/03-authoring-throughput/03-RESEARCH.md
@.planning/phases/03-authoring-throughput/03-PATTERNS.md
@.planning/phases/03-authoring-throughput/03-VALIDATION.md
@.planning/phases/03-authoring-throughput/03-01-SUMMARY.md
@src/lib/author-validation.ts
@src/lib/dialogue-format.ts
@src/lib/__tests__/author-validation.test.ts
@src/lib/__tests__/dialogue-format.test.ts

<interfaces>
<!-- Existing author-validation.ts surface (preserved verbatim). -->

```typescript
export interface PairLineIssue {
  index: number;
  severity: "error" | "warning";
  kind:
    | "structure-speaker"
    | "structure-kind"
    | "structure-action"
    | "structure-cue"
    | "unknown-role"
    | "empty-text"
    | "ratio-outlier";
  message: string;
}

export interface PairValidationResult {
  structureOk: boolean;
  plainWarnings: DialogueWarning[];
  cipherWarnings: DialogueWarning[];
  lineIssues: PairLineIssue[];
  counts: { plainNodes; cipherNodes; sections; spokenLines; actionLines; cues };
  firstDivergence?: { index; plain; cipher };
}

export function validatePair(plainSource: string, cipherSource: string): PairValidationResult;
export function validateParsedPair(plain: DialogueDocument, cipher: DialogueDocument): PairValidationResult;
```

Existing soft character-ratio check (lines 192-203; verbatim — must stay intact):
```typescript
const ratio = c.text.length / Math.max(p.text.length, 1);
if (p.text.length >= 20 && (ratio > 1.0 || ratio < 0.05)) {
  lineIssues.push({
    index: i,
    severity: "warning",
    kind: "ratio-outlier",
    message:
      ratio > 1.0
        ? `cipher is longer than plain (${c.text.length} vs ${p.text.length} chars) — unusual for a cipher`
        : `cipher is much shorter than expected (${(ratio * 100).toFixed(0)}% of plain length)`,
  });
}
```

New D-08 bake-band check (to be inserted IMMEDIATELY AFTER the existing character-ratio check, inside the same `if (p.kind === "line" && c.kind === "line")` block, inside the `if (!p.isAction)` / `spokenLines` branch — so action lines and empty lines don't trigger it):
```typescript
// AUTHOR-05 D-08: bake-time word-count band check — harder threshold
// that hard-fails the bake. The character-ratio check above is the
// softer /author UI warning; this is the bake-stop gate. Word count
// better captures meaning-drift than character count (e.g., "B." (1 char,
// 1 word) for "Bone of my bone" (15 char, 4 words) → plain/cipher word
// ratio = 4, outside [0.5×, 2×] band → correctly refuses to bake).
// Band [0.5×, 2×]: wide enough for single-letter ciphers of short
// 3-4-word plain phrases (ratio 3-4 trips — by design); tight enough
// to catch "different sentence entirely" drift.
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

Callsite filter pattern (used by Plan 06 and Plan 07):
```typescript
const errors = result.lineIssues.filter((i) => i.severity === "error");
if (errors.length > 0 || !result.structureOk) process.exit(1);
```
No `kind: "bake-ratio-outlier"` added — the severity-filter is already the bake-vs-UI-warning discriminator. The `[D-08 bake-band]` message prefix is for human-readable logs, not programmatic filtering.

Dialogue parser reference (src/lib/dialogue-format.ts): `parseDialogue(source)` returns `{ nodes: DialogueNode[], warnings: DialogueWarning[] }`. `DialogueNode.kind === "line"` nodes carry `{ speaker, isAction, text }`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add D-08 bake-band word-count check to author-validation.ts + fill test scaffold</name>
  <files>
    src/lib/author-validation.ts,
    src/lib/__tests__/author-validation.test.ts
  </files>
  <read_first>
    src/lib/author-validation.ts (lines 1-223 full file — confirm existing structure-check and character-ratio blocks to insert after),
    src/lib/dialogue-format.ts (top of file — confirm `parseDialogue` + `DialogueDocument` + `DialogueNode` shapes for test fixture construction),
    src/lib/__tests__/dialogue-format.test.ts (existing analog — shows how to construct DialogueDocument test fixtures directly OR via parseDialogue from markdown source),
    .planning/phases/03-authoring-throughput/03-PATTERNS.md §src/lib/author-validation.ts (exact block to insert + pattern to preserve),
    .planning/phases/03-authoring-throughput/03-CONTEXT.md §D-08 (three gates, [0.5×, 2×] band, no --force),
    .planning/phases/03-authoring-throughput/03-RESEARCH.md §Pattern / AUTHOR-05 (validator integration),
    src/lib/__tests__/author-validation.test.ts (Wave 0 scaffold from Plan 01 — `it.todo` markers to replace).
  </read_first>
  <behavior>
    - Test 1: dialogue pair with speaker mismatch (plain: "WM" / cipher: "SW") → `validatePair` returns a lineIssue with `severity: "error"`, `kind: "structure-speaker"`.
    - Test 2: dialogue pair with action-tag mismatch (plain spoken line / cipher action line `[rises]`) → `validatePair` returns a lineIssue with `severity: "error"`, `kind: "structure-action"` OR `"structure-kind"`.
    - Test 3 (AUTHOR-05 bake-band hard-fail, high end): plain: "Bone of my bone and flesh of my flesh" (9 words) / cipher: "B." (1 word). wordRatio = 9. > 2.0. Returns `severity: "error"` + `kind: "ratio-outlier"` + message containing "[D-08 bake-band]".
    - Test 4 (AUTHOR-05 bake-band hard-fail, low end): plain: "Yes" (1 word) / cipher: "I agree completely with the proposition" (6 words). wordRatio = 1/6 ≈ 0.17. < 0.5. Returns `severity: "error"`, `kind: "ratio-outlier"`, message containing "[D-08 bake-band]".
    - Test 5 (within band, no error): plain: "Brethren of the lodge" (4 words) / cipher: "Brn. of lodge" (3 words). wordRatio = 4/3 ≈ 1.33. In band [0.5, 2]. No error-severity ratio-outlier. (May still trigger a warning-severity char-ratio if char-ratio crosses the old threshold — that's fine, test only asserts no NEW error.)
    - Test 6 (boundary, ratio exactly 2.0 is IN band — `> 2.0` is strict, not `>= 2.0`): plain: "one two three four" (4 words) / cipher: "one two" (2 words). wordRatio = 2.0. No error. Boundary test: `> 2.0` means 2.01 fails, 2.0 passes.
    - Test 7 (word-count NOT character-count — the explicit distinction): plain: "aaaaa" (1 word, 5 chars) / cipher: "bbbbbbbbbb" (1 word, 10 chars). wordRatio = 1/1 = 1.0. In band. No D-08 bake-band error (even though char ratio is 2:1). Confirms the new check is word-count, not character-count.
    - Test 8 (regression): the existing soft character-ratio WARNING still fires for the scenarios it used to fire for (plain.length >= 20 AND charRatio > 1.0 or < 0.05). Assert severity === "warning" for one such case.
    - Test 9: a fully-matched good pair (same speakers, same actions, word ratio ~1:1) returns `structureOk: true` and no `severity: "error"` issues.
    - Test 10 (cipher word count = 0, plain has words): division-by-zero guard. `cipherWords >= 1` guard in the new block prevents it firing. Assert no ratio-outlier error (existing empty-text check fires instead as severity="error" with kind="empty-text").
  </behavior>
  <action>
**Step 1 — Edit `src/lib/author-validation.ts`.** Locate the existing character-ratio block at lines 192-203 (the `const ratio = c.text.length / Math.max(p.text.length, 1); if (p.text.length >= 20 && ...)` block inside the `spokenLines` branch). Preserve it verbatim. INSERT the new D-08 bake-band block IMMEDIATELY AFTER it (still inside the `if (!p.isAction) { spokenLines++; ... }` branch, still inside the `if (p.kind === "line" && c.kind === "line")` block):

```typescript
        const ratio = c.text.length / Math.max(p.text.length, 1);
        if (p.text.length >= 20 && (ratio > 1.0 || ratio < 0.05)) {
          lineIssues.push({
            index: i,
            severity: "warning",
            kind: "ratio-outlier",
            message:
              ratio > 1.0
                ? `cipher is longer than plain (${c.text.length} vs ${p.text.length} chars) — unusual for a cipher`
                : `cipher is much shorter than expected (${(ratio * 100).toFixed(0)}% of plain length)`,
          });
        }

        // AUTHOR-05 D-08: bake-time word-count band check — harder threshold
        // that hard-fails the bake. The character-ratio check above is the
        // softer /author UI warning; this is the bake-stop gate. Word count
        // better captures meaning-drift than character count (e.g., "B." (1
        // word) for "Bone of my bone" (4 words) → ratio = 4, outside band).
        // Band [0.5×, 2×]: wide enough for single-letter ciphers of short
        // 3-4-word plain phrases (those DO trip, by design — Shannon must
        // then decide if the cipher is legitimate ultra-abbreviation or
        // drift); tight enough to catch "different sentence entirely" drift.
        // Callers (build-mram-from-dialogue.ts, bake-all.ts) filter by
        // severity === "error"; no separate kind needed.
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

**Step 2 — fill in `src/lib/__tests__/author-validation.test.ts`** (replacing Plan-01 `it.todo` stubs). Keep the `@vitest-environment node` pragma. Use `parseDialogue` to construct DialogueDocument fixtures from markdown source strings (matches how the /author UI calls the validator):

```typescript
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { validatePair } from "../author-validation";

// Helpers: build dialogue markdown for a single spoken line pair.
// Format follows src/lib/dialogue-format.ts: speaker on its own line then
// a blank, then the text, then blank. For tests we use sections to ensure
// parse succeeds even for minimal inputs.
function dialogueSource(speaker: string, text: string, isAction = false): string {
  // Minimal parseable dialogue with a section wrapper; format matches
  // rituals/*-dialogue.md in the repo.
  const body = isAction ? `${speaker}: [${text}]` : `${speaker}: ${text}`;
  return `## Section 1\n\n${body}\n`;
}

describe("author-validation cipher/plain parity (AUTHOR-05 D-08)", () => {
  describe("structural checks (preserved behavior)", () => {
    it("hard-fails on speaker mismatch", () => {
      const plain  = dialogueSource("WM", "Brethren, we are now about to...");
      const cipher = dialogueSource("SW", "Brn., we r now abt to...");
      const result = validatePair(plain, cipher);
      const speakerErrors = result.lineIssues.filter(
        (i) => i.kind === "structure-speaker" && i.severity === "error",
      );
      expect(speakerErrors.length).toBeGreaterThanOrEqual(1);
    });

    it("hard-fails on action-tag mismatch (one side is action, other is spoken)", () => {
      const plain  = dialogueSource("WM", "rises", true);  // action
      const cipher = dialogueSource("WM", "rises", false); // spoken
      const result = validatePair(plain, cipher);
      const actionErrors = result.lineIssues.filter(
        (i) => (i.kind === "structure-action" || i.kind === "structure-kind") && i.severity === "error",
      );
      expect(actionErrors.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("bake-band word-count ratio (NEW, D-08)", () => {
    it("hard-fails when cipher is drastically shorter than plain (wordRatio > 2×)", () => {
      // plain 9 words / cipher 1 word = ratio 9 → outside [0.5, 2]
      const plain  = dialogueSource("WM", "Bone of my bone and flesh of my flesh always");
      const cipher = dialogueSource("WM", "B.");
      const result = validatePair(plain, cipher);
      const bakeErrors = result.lineIssues.filter(
        (i) =>
          i.severity === "error" &&
          i.kind === "ratio-outlier" &&
          i.message.includes("[D-08 bake-band]"),
      );
      expect(bakeErrors.length).toBeGreaterThanOrEqual(1);
      expect(bakeErrors[0]!.message).toMatch(/ratio=9\.00×/);
    });

    it("hard-fails when cipher is drastically LONGER than plain (wordRatio < 0.5×)", () => {
      // plain 1 word / cipher 6 words = ratio 0.17 → outside [0.5, 2]
      const plain  = dialogueSource("WM", "Yes");
      const cipher = dialogueSource("WM", "I agree completely with the proposition");
      const result = validatePair(plain, cipher);
      const bakeErrors = result.lineIssues.filter(
        (i) =>
          i.severity === "error" &&
          i.kind === "ratio-outlier" &&
          i.message.includes("[D-08 bake-band]"),
      );
      expect(bakeErrors.length).toBeGreaterThanOrEqual(1);
    });

    it("accepts within-band ratios (plain 4 words / cipher 3 words = 1.33)", () => {
      const plain  = dialogueSource("WM", "Brethren of the lodge");
      const cipher = dialogueSource("WM", "Brn. of lodge");
      const result = validatePair(plain, cipher);
      const bakeErrors = result.lineIssues.filter(
        (i) =>
          i.severity === "error" &&
          i.kind === "ratio-outlier" &&
          i.message.includes("[D-08 bake-band]"),
      );
      expect(bakeErrors.length).toBe(0);
    });

    it("accepts boundary ratio of exactly 2.0 (strict > 2.0 threshold)", () => {
      // plain 4 words / cipher 2 words = 2.0 exactly → IN band
      const plain  = dialogueSource("WM", "one two three four");
      const cipher = dialogueSource("WM", "one two");
      const result = validatePair(plain, cipher);
      const bakeErrors = result.lineIssues.filter(
        (i) =>
          i.severity === "error" &&
          i.kind === "ratio-outlier" &&
          i.message.includes("[D-08 bake-band]"),
      );
      expect(bakeErrors.length).toBe(0);
    });

    it("uses WORD count not CHAR count (same-word-count but 2× char ratio is fine)", () => {
      // Both single words. char ratio 5:10 = 2, but word ratio = 1.0 → IN band.
      const plain  = dialogueSource("WM", "aaaaa");
      const cipher = dialogueSource("WM", "bbbbbbbbbb");
      const result = validatePair(plain, cipher);
      const bakeErrors = result.lineIssues.filter(
        (i) =>
          i.severity === "error" &&
          i.kind === "ratio-outlier" &&
          i.message.includes("[D-08 bake-band]"),
      );
      expect(bakeErrors.length).toBe(0);
    });

    it("preserves the existing character-ratio WARNING (severity=warning unchanged)", () => {
      // Construct a pair that triggers the existing char-ratio warning
      // (p.text.length >= 20 AND charRatio > 1.0) but not the word-ratio error.
      // plain: 25 chars, 4 words. cipher: 35 chars, 4 words. char-ratio=1.4 → warning.
      const plain  = dialogueSource("WM", "The Worshipful Master says");   // 25 chars, 4 words
      const cipher = dialogueSource("WM", "The Worshipful Master says indeed today");  // 39 chars, 6 words
      const result = validatePair(plain, cipher);
      // Word ratio 4/6 = 0.67 → IN band. So no error.
      const bakeErrors = result.lineIssues.filter(
        (i) => i.severity === "error" && i.kind === "ratio-outlier",
      );
      expect(bakeErrors.length).toBe(0);
      // But a char-ratio warning may still fire (that's fine — we don't assert on it).
    });
  });

  describe("well-formed pair (no issues)", () => {
    it("returns structureOk=true + no error-severity issues", () => {
      const plain  = dialogueSource("WM", "Brethren of the lodge assembled");  // 5 words
      const cipher = dialogueSource("WM", "Brn. of the lodge");  // 4 words, ratio 5/4=1.25 IN band
      const result = validatePair(plain, cipher);
      expect(result.structureOk).toBe(true);
      const errors = result.lineIssues.filter((i) => i.severity === "error");
      expect(errors).toEqual([]);
    });
  });

  describe("empty cipher guard", () => {
    it("does not throw division-by-zero; fires empty-text error instead", () => {
      const plain  = dialogueSource("WM", "some text");
      const cipher = dialogueSource("WM", "");
      // Should not throw; existing empty-text path handles it.
      expect(() => validatePair(plain, cipher)).not.toThrow();
      const result = validatePair(plain, cipher);
      // The new D-08 block is guarded by `cipherWords >= 1` — no bake-band error fires.
      const bakeErrors = result.lineIssues.filter(
        (i) =>
          i.severity === "error" &&
          i.kind === "ratio-outlier" &&
          i.message.includes("[D-08 bake-band]"),
      );
      expect(bakeErrors.length).toBe(0);
      // Existing empty-text check should fire.
      const emptyErrors = result.lineIssues.filter((i) => i.kind === "empty-text");
      expect(emptyErrors.length).toBeGreaterThanOrEqual(1);
    });
  });
});
```

**NOTE on fixture construction:** If `parseDialogue` requires specific markdown formatting, the `dialogueSource()` helper may need tuning. The executor should read `src/lib/dialogue-format.ts` to confirm the minimal parseable shape. If `parseDialogue` needs more than `## Section + speaker: text`, use the actual format the `/author` UI feeds in — grep `src/app/author/page.tsx` for example inputs, or copy a small snippet from `rituals/<any>-dialogue.md` and `rituals/<any>-dialogue-cipher.md` and substitute in only the line text for each test case.

Commit: `author-05: add D-08 bake-band word-ratio hard-fail to author-validation`
  </action>
  <verify>
    <automated>npx vitest run --no-coverage src/lib/__tests__/author-validation.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep "D-08 bake-band" src/lib/author-validation.ts` returns ≥ 1 match (new check inserted).
    - `grep -c "severity: \"warning\"" src/lib/author-validation.ts` returns ≥ 1 (existing char-ratio warning preserved).
    - `grep "wordRatio" src/lib/author-validation.ts` returns ≥ 2 (declaration + condition).
    - The band constants `0.5` and `2.0` both appear: `grep -cE "(0\.5|2\.0)" src/lib/author-validation.ts | awk '$1 >= 2 { print; }' | wc -l` returns 1 (at least 2 matches across the file).
    - Test file has no `.todo` remaining: `grep -c "it.todo(" src/lib/__tests__/author-validation.test.ts` returns 0.
    - `npx vitest run --no-coverage src/lib/__tests__/author-validation.test.ts` exits 0 with 10+ tests passing.
    - `npm run build` exits 0.
    - Full test suite green: `npx vitest run --no-coverage` exits 0.
    - The existing soft character-ratio warning still fires in the author UI analog (the "preserves the existing character-ratio WARNING" test case proves this).
  </acceptance_criteria>
  <done>
    `author-validation.ts` hard-fails bakes on plain/cipher word-count drift outside [0.5×, 2×]; the existing soft character-ratio warning is preserved for the /author UI; full unit test coverage with 10+ passing cases; Plan 06 and Plan 07 can call `validatePair()` and filter by `severity === "error"` for the bake-refusal gate.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Dialogue author (Shannon) → ritual content (rituals/*-dialogue.md, *-dialogue-cipher.md) | cipher/plain drift is a quiet data-integrity failure; validator is the only gate before the bake ships to invited users |
| Validator output → bake pipeline (Plan 06 + Plan 07) | a severity-"error" ratio-outlier MUST exit the bake non-zero; no --force override in Phase 3 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-04 | Tampering | cipher/plain drift ships silently to invited Brothers → phantom scoring failures | mitigate | D-08 three-gate validator (same speaker, same action tags, word-count [0.5×, 2×] band) hard-fails the bake at severity "error". No --force override in Phase 3 (rejected per CONTEXT.md §Deferred Ideas). Orchestrator exits non-zero; bake refuses to produce a .mram that would score wrong. |
| T-03-04b | Data Integrity | false-positive hard-fail on legitimate ultra-short ciphers ("B.", "O.", "A." for 3-5 word plain phrases) | accept | By design — per CONTEXT.md §D-08 rationale, "wide enough that a 1-letter cipher abbreviating a 5-word phrase ('B.' for 'Bone of my bone') still falls in band on real ritual content; tight enough to catch drift." Shannon reviews validator output during bake and either (a) rewrites the cipher to stay in band (legitimate ultra-abbreviation can use "Bo." for "Bone of my bone" = ratio 4) or (b) decides to accept the refuse-to-bake and carry the line as runtime TTS. No --force per D-08. |
| T-03-04c | Confused Deputy | Plan 06 (build-mram) or Plan 07 (bake-all) ignores the error-severity issues and bakes anyway | mitigate | Both Plan 06 and Plan 07 explicitly filter `.severity === "error"` and exit non-zero; PATTERNS.md §Shared Patterns §Validator-gate is the canonical snippet. The current plan's `<success_criteria>` includes callsite specification. |
</threat_model>

<verification>
- `npx vitest run --no-coverage src/lib/__tests__/author-validation.test.ts` — 10+ tests pass.
- `npx vitest run --no-coverage` (full suite) — no regression in /author UI unit tests or any other consumer of `validatePair`.
- `npm run build` — TypeScript compile clean.
- Grep assertions (see acceptance_criteria) confirm the new block is present and the old warning is preserved.
</verification>

<success_criteria>
- `src/lib/author-validation.ts` hard-fails with `severity: "error"` + `kind: "ratio-outlier"` + `[D-08 bake-band]` message prefix when plain/cipher word-count ratio is outside [0.5×, 2×].
- Existing soft character-ratio warning (at lines 192-203) is preserved verbatim; /author UI soft-warning UX unchanged.
- `src/lib/__tests__/author-validation.test.ts` covers: speaker mismatch, action mismatch, both ends of the word-ratio band, within-band acceptance, exact-boundary acceptance, word-vs-char distinction, warning preservation, well-formed pair, and empty-cipher guard.
- Plan 06 and Plan 07 can `import { validatePair } from "../src/lib/author-validation"` and filter by `severity === "error"` to decide whether to abort the bake.
</success_criteria>

<output>
After completion, create `.planning/phases/03-authoring-throughput/03-04-SUMMARY.md` documenting:
- Exact line-range added to `src/lib/author-validation.ts`
- Test count breakdown (structural / bake-band / regression / edge cases)
- Sample validator output on a deliberately-corrupted pair (include the `[D-08 bake-band]` message text)
- Confirmation that the existing warning path still fires for one canonical /author UI case
- Commit SHA
</output>
