import { describe, it, expect } from "vitest";
import {
  STYLE_TAG_PATTERN,
  isValidStyleTag,
  RITUAL_STYLE_WHITELIST,
  hashLineText,
} from "../styles";

describe("STYLE_TAG_PATTERN — Gemini TTS audio tag validation", () => {
  it("accepts documented Gemini tags", () => {
    ["gravely", "reverently", "whispers", "slowly", "neutrally"].forEach((t) => {
      expect(STYLE_TAG_PATTERN.test(t)).toBe(true);
    });
  });

  it("accepts short phrases with space", () => {
    expect(STYLE_TAG_PATTERN.test("short pause")).toBe(true);
    expect(STYLE_TAG_PATTERN.test("low register")).toBe(true);
  });

  it("accepts hyphenated descriptors", () => {
    expect(STYLE_TAG_PATTERN.test("grand-fatherly")).toBe(true);
  });

  it("accepts multi-clause directive styles (Tier 1 relaxation)", () => {
    expect(STYLE_TAG_PATTERN.test("grave, binding oath")).toBe(true);
    expect(STYLE_TAG_PATTERN.test("solemnly, with slight tremor")).toBe(true);
    expect(STYLE_TAG_PATTERN.test("commanding, each word clipped")).toBe(true);
    expect(
      STYLE_TAG_PATTERN.test("reverent, with a long pause before the final phrase"),
    ).toBe(true);
  });

  it("accepts apostrophes (don't, won't, etc. in directive text)", () => {
    expect(STYLE_TAG_PATTERN.test("as if you don't quite believe it")).toBe(true);
  });

  it("rejects uppercase", () => {
    expect(STYLE_TAG_PATTERN.test("Gravely")).toBe(false);
    expect(STYLE_TAG_PATTERN.test("GRAVELY")).toBe(false);
  });

  it("rejects tags starting with space, comma, or hyphen", () => {
    expect(STYLE_TAG_PATTERN.test(" gravely")).toBe(false);
    expect(STYLE_TAG_PATTERN.test("-gravely")).toBe(false);
    expect(STYLE_TAG_PATTERN.test(",gravely")).toBe(false);
  });

  it("rejects tags longer than 80 chars", () => {
    expect(STYLE_TAG_PATTERN.test("a".repeat(80))).toBe(true);
    expect(STYLE_TAG_PATTERN.test("a".repeat(81))).toBe(false);
  });

  it("rejects empty string", () => {
    expect(STYLE_TAG_PATTERN.test("")).toBe(false);
  });

  it("rejects strings with digits or special chars that could break the bracket prompt", () => {
    expect(STYLE_TAG_PATTERN.test("grave1")).toBe(false);
    expect(STYLE_TAG_PATTERN.test("grave!")).toBe(false);
    expect(STYLE_TAG_PATTERN.test("grave_ly")).toBe(false);
    // Explicitly rejected: anything that could collide with bracket prompt
    // format (other brackets, quotes, semicolons, backticks, newlines).
    expect(STYLE_TAG_PATTERN.test("grave [with]")).toBe(false);
    expect(STYLE_TAG_PATTERN.test('grave "tone"')).toBe(false);
    expect(STYLE_TAG_PATTERN.test("grave;tone")).toBe(false);
    expect(STYLE_TAG_PATTERN.test("grave`tone")).toBe(false);
    expect(STYLE_TAG_PATTERN.test("grave\ntone")).toBe(false);
  });
});

describe("isValidStyleTag — type-narrowing validator", () => {
  it("returns true for valid string tags", () => {
    expect(isValidStyleTag("gravely")).toBe(true);
  });

  it("returns false for invalid string tags", () => {
    expect(isValidStyleTag("GRAVELY")).toBe(false);
  });

  it("returns false for non-strings", () => {
    expect(isValidStyleTag(null)).toBe(false);
    expect(isValidStyleTag(undefined)).toBe(false);
    expect(isValidStyleTag(42)).toBe(false);
    expect(isValidStyleTag({})).toBe(false);
  });
});

describe("RITUAL_STYLE_WHITELIST — curated Masonic tags", () => {
  it("every whitelist entry passes STYLE_TAG_PATTERN", () => {
    RITUAL_STYLE_WHITELIST.forEach((tag) => {
      expect(STYLE_TAG_PATTERN.test(tag)).toBe(true);
    });
  });

  it("contains the core emotional tags referenced in the design", () => {
    expect(RITUAL_STYLE_WHITELIST).toContain("gravely");
    expect(RITUAL_STYLE_WHITELIST).toContain("reverently");
    expect(RITUAL_STYLE_WHITELIST).toContain("warmly");
    expect(RITUAL_STYLE_WHITELIST).toContain("neutral");
  });

  it("excludes non-speech tags (laughs, sighs, etc.)", () => {
    expect(RITUAL_STYLE_WHITELIST).not.toContain("laughs");
    expect(RITUAL_STYLE_WHITELIST).not.toContain("sighs");
    expect(RITUAL_STYLE_WHITELIST).not.toContain("clears throat");
  });
});

describe("hashLineText — content-hashed style keys", () => {
  it("produces 64-char hex sha256", async () => {
    const h = await hashLineText("Hello, brethren.");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", async () => {
    const a = await hashLineText("You will say I, your name, and repeat after me...");
    const b = await hashLineText("You will say I, your name, and repeat after me...");
    expect(a).toBe(b);
  });

  it("distinguishes different text", async () => {
    const a = await hashLineText("Brother Senior Warden, have you anything further...");
    const b = await hashLineText("Brother Senior Warden, have you anything in the south...");
    expect(a).not.toBe(b);
  });

  it("is whitespace-sensitive (any text change invalidates the key)", async () => {
    const a = await hashLineText("So mote it be.");
    const b = await hashLineText("So mote it be. ");
    expect(a).not.toBe(b);
  });
});
