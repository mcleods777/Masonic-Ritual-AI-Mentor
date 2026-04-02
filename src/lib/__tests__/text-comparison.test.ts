import { describe, it, expect } from "vitest";
import { normalize, compareTexts } from "../text-comparison";

// ============================================================
// Layer 1: Normalization
// ============================================================

describe("normalize", () => {
  it("lowercases text", () => {
    expect(normalize("Brother Senior Warden")).toBe("brother senior warden");
  });

  it("expands contractions", () => {
    expect(normalize("don't")).toBe("do not");
    expect(normalize("it's")).toBe("it is");
    expect(normalize("won't")).toBe("will not");
  });

  it("removes filler words", () => {
    expect(normalize("um the uh lodge is uh open")).toBe("the lodge is open");
  });

  it("removes punctuation", () => {
    expect(normalize("Brethren, the lodge is open.")).toBe(
      "brethren the lodge is open"
    );
  });

  it("normalizes smart quotes to straight quotes", () => {
    expect(normalize("\u2018it\u2019s\u2019")).toContain("it is");
  });

  it("collapses whitespace", () => {
    expect(normalize("the   lodge   is   open")).toBe("the lodge is open");
  });

  it("handles empty string", () => {
    expect(normalize("")).toBe("");
  });

  it("handles string of only filler words", () => {
    expect(normalize("um uh er ah")).toBe("");
  });
});

// ============================================================
// Full comparison pipeline
// ============================================================

describe("compareTexts", () => {
  it("scores perfect recitation at 100%", () => {
    const ref = "Brother Senior Warden, proceed to satisfy yourself.";
    const spoken = "Brother Senior Warden proceed to satisfy yourself";
    const result = compareTexts(spoken, ref);
    expect(result.accuracy).toBe(100);
    expect(result.wrongWords).toBe(0);
    expect(result.missingWords).toBe(0);
  });

  it("scores completely wrong recitation near 0%", () => {
    const ref = "The lodge is open for the transaction of business.";
    const spoken = "abcdef ghijkl mnopqr stuvwx";
    const result = compareTexts(spoken, ref);
    expect(result.accuracy).toBeLessThan(20);
  });

  it("detects missing words", () => {
    const ref = "the lodge is now open";
    const spoken = "the lodge is open";
    const result = compareTexts(spoken, ref);
    expect(result.missingWords).toBeGreaterThan(0);
    expect(result.troubleSpots).toContain("now");
  });

  it("detects extra words", () => {
    const ref = "the lodge is open";
    const spoken = "the lodge is now open";
    const result = compareTexts(spoken, ref);
    expect(result.extraWords).toBeGreaterThan(0);
  });

  it("forgives phonetic near-matches (tiler/tyler)", () => {
    const ref = "the Tyler guards the door";
    const spoken = "the tiler guards the door";
    const result = compareTexts(spoken, ref);
    // Should score high — tiler/tyler are phonetically identical
    expect(result.accuracy).toBeGreaterThanOrEqual(80);
  });

  it("forgives minor fuzzy differences", () => {
    const ref = "worshipful master";
    const spoken = "worshipfull master";
    const result = compareTexts(spoken, ref);
    expect(result.accuracy).toBeGreaterThanOrEqual(80);
  });

  it("ignores punctuation differences", () => {
    const ref = "Brethren, the lodge is open!";
    const spoken = "brethren the lodge is open";
    const result = compareTexts(spoken, ref);
    expect(result.accuracy).toBe(100);
  });

  it("ignores filler words in spoken text", () => {
    const ref = "the lodge is open";
    const spoken = "um the uh lodge is uh open";
    const result = compareTexts(spoken, ref);
    expect(result.accuracy).toBe(100);
  });

  it("handles empty spoken text", () => {
    const ref = "the lodge is open";
    const result = compareTexts("", ref);
    expect(result.accuracy).toBe(0);
    expect(result.missingWords).toBeGreaterThan(0);
  });

  it("handles empty reference text", () => {
    const result = compareTexts("hello", "");
    expect(result.accuracy).toBe(0);
  });

  it("returns trouble spots for wrong words", () => {
    const ref = "proceed to satisfy yourself that all present are Masons";
    const spoken = "proceed to verify yourself that all present are members";
    const result = compareTexts(spoken, ref);
    expect(result.troubleSpots.length).toBeGreaterThan(0);
  });

  it("counts words correctly", () => {
    const ref = "one two three four five";
    const result = compareTexts("one two three four five", ref);
    expect(result.totalWords).toBe(5);
    expect(result.correctWords).toBe(5);
  });
});
