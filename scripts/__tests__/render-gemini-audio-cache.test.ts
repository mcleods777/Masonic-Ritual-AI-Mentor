import * as path from "node:path";
import * as crypto from "node:crypto";
import { describe, it, expect } from "vitest";
import {
  computeCacheKey,
  DEFAULT_MODELS,
  CACHE_DIR,
} from "../render-gemini-audio";

describe("computeCacheKey — modelId in key material (D-07)", () => {
  it("produces different keys for the same text/style/voice/preamble when modelId differs", () => {
    const a = computeCacheKey(
      "So mote it be.",
      "reverent",
      "Charon",
      "gemini-3.1-flash-tts-preview",
      "preamble text",
    );
    const b = computeCacheKey(
      "So mote it be.",
      "reverent",
      "Charon",
      "gemini-2.5-flash-preview-tts",
      "preamble text",
    );
    expect(a).not.toBe(b);
  });

  it("produces the same key for identical inputs (deterministic)", () => {
    const a = computeCacheKey("Attend.", undefined, "Puck", "gemini-3.1-flash-tts-preview");
    const b = computeCacheKey("Attend.", undefined, "Puck", "gemini-3.1-flash-tts-preview");
    expect(a).toBe(b);
  });
});

describe("computeCacheKey — CACHE_KEY_VERSION v3 bump (D-07)", () => {
  it("differs from the old v2 key for identical (text, style, voice, preamble) inputs", () => {
    const text = "The Worshipful Master will now open the Lodge.";
    const style = "solemn";
    const voice = "Charon";
    const preamble = "You are addressing the assembled Brethren.";
    const modelId = "gemini-3.1-flash-tts-preview";

    // Old v2 material shape (scripts/render-gemini-audio.ts, pre-D-07):
    // `${CACHE_KEY_VERSION}\x00${text}\x00${style}\x00${voice}\x00${preamble}`
    // with CACHE_KEY_VERSION = "v2" and no modelId component.
    const oldV2Material = `v2\x00${text}\x00${style}\x00${voice}\x00${preamble}`;
    const oldV2Key = crypto.createHash("sha256").update(oldV2Material).digest("hex");

    const newV3Key = computeCacheKey(text, style, voice, modelId, preamble);

    expect(newV3Key).not.toBe(oldV2Key);
  });
});

describe("DEFAULT_MODELS — AUTHOR-03 regression guard", () => {
  it("keeps gemini-3.1-flash-tts-preview first in the fallback chain", () => {
    expect(DEFAULT_MODELS[0]).toBe("gemini-3.1-flash-tts-preview");
  });
});

describe("CACHE_DIR — relocated to rituals/_bake-cache (D-06)", () => {
  it("resolves to the absolute path of rituals/_bake-cache", () => {
    expect(CACHE_DIR).toBe(path.resolve("rituals/_bake-cache"));
  });
});
