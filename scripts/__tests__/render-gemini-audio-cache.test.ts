// @vitest-environment node
/**
 * Wave 0 scaffold for AUTHOR-01 cache key v3 bump + modelId + migration.
 * Implemented by Plan 05 (03-05).
 *
 * Three invariants:
 *   1. CACHE_KEY_VERSION === "v3" (bumped from "v2" per D-02).
 *   2. computeCacheKey(text, style, voice, modelId, preamble) includes modelId
 *      in the sha256 material — two different modelIds produce different keys.
 *   3. Legacy-cache migration is one-shot: if NEW_CACHE_DIR has any .opus,
 *      migration skips. Otherwise it fs.cp's from ~/.cache/masonic-mram-audio/.
 */
import { describe, it } from "vitest";

describe("render-gemini-audio cache key v3 (AUTHOR-01 D-02)", () => {
  it.todo("CACHE_KEY_VERSION === 'v3' (Plan 05)");
  it.todo("computeCacheKey includes modelId in material — changing modelId changes key");
  it.todo("computeCacheKey is stable for identical inputs (deterministic)");
});

describe("render-gemini-audio legacy cache migration (AUTHOR-01 D-01)", () => {
  it.todo("one-shot: skips if NEW_CACHE_DIR already has a .opus file (Plan 05)");
  it.todo("copies from OLD_CACHE_DIR when NEW is empty; old location preserved");
  it.todo("no-ops when OLD_CACHE_DIR does not exist");
});
