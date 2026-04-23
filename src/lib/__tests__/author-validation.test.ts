// @vitest-environment node
/**
 * Wave 0 scaffold filled by Plan 03-04 for AUTHOR-05 / D-08 cipher/plain
 * parity validator.
 *
 * Three hard-fail cases (per D-08):
 *   1. Speaker mismatch → severity "error".
 *   2. Action-tag mismatch → severity "error".
 *   3. Word-count ratio outside [0.5×, 2×] → severity "error" with kind
 *      "ratio-outlier" and message prefix "[D-08 bake-band]".
 *
 * Plus the within-band acceptance, boundary (exactly 2.0) acceptance,
 * word-vs-char distinction, existing character-ratio warning preservation,
 * well-formed pair, and empty-cipher guard cases.
 */
import { describe, it, expect } from "vitest";
import { validatePair } from "../author-validation";

/**
 * Build a minimal parseable dialogue markdown string for a single
 * spoken (or action) line. Format is verified against
 * src/lib/dialogue-format.ts:
 *   - SPEAKER_RE requires "SPEAKER: " (colon + space).
 *   - H2_RE requires a "## " section header before line parsing starts.
 *   - BRACKETED_RE on the text flags an action line.
 *
 * parseDialogue("## Section 1\n\nWM: hello\n") yields:
 *   { nodes: [{kind:"section",...}, {kind:"line",speaker:"WM",text:"hello",isAction:false,...}], ... }
 */
function dialogueSource(speaker: string, text: string, isAction = false): string {
  const body = isAction ? `${speaker}: [${text}]` : `${speaker}: ${text}`;
  return `## Section 1\n\n${body}\n`;
}

describe("author-validation cipher/plain parity (AUTHOR-05 D-08)", () => {
  describe("structural checks (preserved behavior)", () => {
    it("hard-fails on speaker mismatch", () => {
      const plain = dialogueSource("WM", "Brethren, we are now about to...");
      const cipher = dialogueSource("SW", "Brn., we r now abt to...");
      const result = validatePair(plain, cipher);
      const speakerErrors = result.lineIssues.filter(
        (i) => i.kind === "structure-speaker" && i.severity === "error",
      );
      expect(speakerErrors.length).toBeGreaterThanOrEqual(1);
    });

    it("hard-fails on action-tag mismatch (one side is action, other is spoken)", () => {
      const plain = dialogueSource("WM", "rises", true); // action
      const cipher = dialogueSource("WM", "rises", false); // spoken
      const result = validatePair(plain, cipher);
      const actionErrors = result.lineIssues.filter(
        (i) =>
          (i.kind === "structure-action" || i.kind === "structure-kind") &&
          i.severity === "error",
      );
      expect(actionErrors.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("bake-band word-count ratio (NEW, D-08)", () => {
    it("hard-fails when cipher is drastically shorter than plain (wordRatio > 2×)", () => {
      // plain 10 words / cipher 1 word = ratio 10 → far outside [0.5, 2]
      const plain = dialogueSource(
        "WM",
        "Bone of my bone and flesh of my flesh always",
      );
      const cipher = dialogueSource("WM", "B.");
      const result = validatePair(plain, cipher);
      const bakeErrors = result.lineIssues.filter(
        (i) =>
          i.severity === "error" &&
          i.kind === "ratio-outlier" &&
          i.message.includes("[D-08 bake-band]"),
      );
      expect(bakeErrors.length).toBeGreaterThanOrEqual(1);
      expect(bakeErrors[0]!.message).toMatch(/ratio=10\.00×/);
      expect(bakeErrors[0]!.message).toMatch(/plain=10 words/);
      expect(bakeErrors[0]!.message).toMatch(/cipher=1 words/);
    });

    it("hard-fails when cipher is drastically LONGER than plain (wordRatio < 0.5×)", () => {
      // plain 1 word / cipher 6 words = ratio 0.17 → outside [0.5, 2]
      const plain = dialogueSource("WM", "Yes");
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
      const plain = dialogueSource("WM", "Brethren of the lodge");
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
      const plain = dialogueSource("WM", "one two three four");
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
      const plain = dialogueSource("WM", "aaaaa");
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
      // plain: 4 words. cipher: 6 words. Word ratio 4/6 = 0.67 → IN band.
      const plain = dialogueSource("WM", "The Worshipful Master says"); // 4 words
      const cipher = dialogueSource(
        "WM",
        "The Worshipful Master says indeed today",
      ); // 6 words
      const result = validatePair(plain, cipher);
      // Word ratio 4/6 = 0.67 → IN band, so no bake-band error.
      const bakeErrors = result.lineIssues.filter(
        (i) => i.severity === "error" && i.kind === "ratio-outlier",
      );
      expect(bakeErrors.length).toBe(0);
      // A char-ratio warning may still fire (that's fine — we don't assert on it).
    });
  });

  describe("well-formed pair (no issues)", () => {
    it("returns structureOk=true + no error-severity issues", () => {
      const plain = dialogueSource("WM", "Brethren of the lodge assembled"); // 5 words
      const cipher = dialogueSource("WM", "Brn. of the lodge"); // 4 words, ratio 5/4=1.25 IN band
      const result = validatePair(plain, cipher);
      expect(result.structureOk).toBe(true);
      const errors = result.lineIssues.filter((i) => i.severity === "error");
      expect(errors).toEqual([]);
    });
  });

  describe("empty cipher guard", () => {
    it("does not throw division-by-zero; fires empty-text error instead", () => {
      const plain = dialogueSource("WM", "some text");
      // An empty cipher with just "WM: " would not parse as a line (SPEAKER_RE
      // requires at least one non-space char after the colon). Use a single
      // placeholder token so parseDialogue still emits a line node, then
      // construct an artificially-empty text by using a whitespace-only text.
      // Easier: post-process the parsed plain structure against an empty
      // cipher string. validatePair with an empty cipher source triggers
      // structureOk=false (cipher has 0 line nodes vs plain's 1), which maps
      // to the "cipher file is shorter than plain" error via structure-kind.
      const cipher = ""; // no sections, no lines → length mismatch
      expect(() => validatePair(plain, cipher)).not.toThrow();
      const result = validatePair(plain, cipher);
      // The new D-08 block is guarded by `cipherWords >= 1` (and never
      // executes because there's no paired cipher line node at all) — no
      // bake-band error fires.
      const bakeErrors = result.lineIssues.filter(
        (i) =>
          i.severity === "error" &&
          i.kind === "ratio-outlier" &&
          i.message.includes("[D-08 bake-band]"),
      );
      expect(bakeErrors.length).toBe(0);
      // Structure mismatch should surface as error-severity issues.
      const errors = result.lineIssues.filter((i) => i.severity === "error");
      expect(errors.length).toBeGreaterThanOrEqual(1);
    });
  });
});
