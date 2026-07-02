import { describe, it, expect } from "vitest";
import { validatePair, validateParsedPair } from "../author-validation";
import type { DialogueDocument } from "../dialogue-format";

// Minimal single-line dialogue fixture builder. Both plain and cipher
// sources use the same section/speaker/action shape so structureOk stays
// true unless a test deliberately varies speaker/isAction to probe the
// structure-mismatch checks.
function makeSource(speaker: string, text: string, isAction = false): string {
  const body = isAction ? `[${text}]` : text;
  return `# Test Ritual\n\n## I. Opening\n\n${speaker}: ${body}\n`;
}

function pairIssues(
  plainSpeaker: string,
  plainText: string,
  cipherSpeaker: string,
  cipherText: string,
  opts: { plainAction?: boolean; cipherAction?: boolean } = {},
) {
  const plainSrc = makeSource(plainSpeaker, plainText, opts.plainAction ?? false);
  const cipherSrc = makeSource(
    cipherSpeaker,
    cipherText,
    opts.cipherAction ?? false,
  );
  return validatePair(plainSrc, cipherSrc);
}

describe("validatePair — bake-band word-count hard-fail (AUTHOR-05 D-08)", () => {
  it("flags a 2.5x word-ratio pair as severity:error, kind:ratio-outlier with [D-08 bake-band]", () => {
    // plain=10 words, cipher=4 words -> ratio 2.5
    const plainText = "one two three four five six seven eight nine ten";
    const cipherText = "un deux trois quatre";
    const result = pairIssues("WM", plainText, "WM", cipherText);

    const bakeBandIssue = result.lineIssues.find(
      (i) =>
        i.severity === "error" &&
        i.kind === "ratio-outlier" &&
        i.message.includes("[D-08 bake-band]"),
    );
    expect(bakeBandIssue).toBeDefined();
  });

  it("does NOT flag ratio exactly 2.0 (strict comparison, boundary passes)", () => {
    // plain=4 words, cipher=2 words -> ratio 2.0 exactly
    const plainText = "one two three four";
    const cipherText = "un deux";
    const result = pairIssues("WM", plainText, "WM", cipherText);

    const bakeBandIssue = result.lineIssues.find(
      (i) => i.kind === "ratio-outlier" && i.message.includes("[D-08 bake-band]"),
    );
    expect(bakeBandIssue).toBeUndefined();
  });

  it("does NOT flag ratio exactly 0.5 (strict comparison, boundary passes)", () => {
    // plain=2 words, cipher=4 words -> ratio 0.5 exactly
    const plainText = "one two";
    const cipherText = "un deux trois quatre";
    const result = pairIssues("WM", plainText, "WM", cipherText);

    const bakeBandIssue = result.lineIssues.find(
      (i) => i.kind === "ratio-outlier" && i.message.includes("[D-08 bake-band]"),
    );
    expect(bakeBandIssue).toBeUndefined();
  });

  it("exempts cipherWords === 0 lines from the band check", () => {
    // Empty cipher text -> cipherWords = 0, guarded by `cipherWords >= 1`.
    // The dialogue-format parser cannot itself produce a "line" node with
    // empty text (SPEAKER_RE requires >=1 char after the colon), so this
    // case is exercised directly against validateParsedPair with hand-built
    // documents. (Still produces a separate empty-text error, which is
    // expected — the band check specifically must not ALSO fire.)
    const plain: DialogueDocument = {
      title: "Test",
      preamble: [],
      warnings: [],
      nodes: [
        { kind: "section", id: "opening", title: "Opening", lineNo: 1 },
        {
          kind: "line",
          speaker: "WM",
          text: "something meaningful here",
          isAction: false,
          lineNo: 2,
        },
      ],
    };
    const cipher: DialogueDocument = {
      title: "Test",
      preamble: [],
      warnings: [],
      nodes: [
        { kind: "section", id: "opening", title: "Opening", lineNo: 1 },
        { kind: "line", speaker: "WM", text: "", isAction: false, lineNo: 2 },
      ],
    };
    const result = validateParsedPair(plain, cipher);

    const bakeBandIssue = result.lineIssues.find(
      (i) => i.kind === "ratio-outlier" && i.message.includes("[D-08 bake-band]"),
    );
    expect(bakeBandIssue).toBeUndefined();

    const emptyTextIssue = result.lineIssues.find(
      (i) => i.severity === "error" && i.kind === "empty-text",
    );
    expect(emptyTextIssue).toBeDefined();
  });

  it("leaves the pre-existing char-ratio severity:warning check unchanged", () => {
    // plain length >= 20 chars, cipher much shorter by character count ->
    // triggers the original softer warning (kind: ratio-outlier, severity:
    // warning). Word ratio also happens to be out of band here, which is
    // fine — both checks are additive, not mutually exclusive.
    const plainText = "This is a test line about something";
    const cipherText = "x";
    const result = pairIssues("WM", plainText, "WM", cipherText);

    const charWarning = result.lineIssues.find(
      (i) =>
        i.severity === "warning" &&
        i.kind === "ratio-outlier" &&
        i.message.includes("cipher is much shorter"),
    );
    expect(charWarning).toBeDefined();
  });
});

describe("validatePair — pre-existing structural error paths (regression lock)", () => {
  it("flags a speaker mismatch as severity:error, kind:structure-speaker", () => {
    const result = pairIssues("WM", "Same text.", "SW", "Same text.");

    const speakerIssue = result.lineIssues.find(
      (i) => i.severity === "error" && i.kind === "structure-speaker",
    );
    expect(speakerIssue).toBeDefined();
  });

  it("flags an action-tag mismatch as severity:error, kind:structure-action", () => {
    const result = pairIssues("WM", "Do the thing.", "WM", "Do the thing.", {
      plainAction: true,
      cipherAction: false,
    });

    const actionIssue = result.lineIssues.find(
      (i) => i.severity === "error" && i.kind === "structure-action",
    );
    expect(actionIssue).toBeDefined();
  });
});
