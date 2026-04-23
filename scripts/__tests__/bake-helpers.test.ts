// @vitest-environment node
/**
 * Wave 0 scaffold for AUTHOR-06 pure math helpers extracted into
 * scripts/lib/bake-helpers.ts (computeMedianSecPerChar, isDurationAnomaly,
 * wordDiff). Implemented by Plan 06 (03-06). These are load-bearing
 * functions (ritual-median + >3×/<0.3× anomaly + STT word-diff) — unit
 * regression coverage replaces "run-a-bake-to-see" validation.
 */
import { describe, it } from "vitest";

describe("computeMedianSecPerChar (AUTHOR-06 D-10 Pitfall 6)", () => {
  it.todo("returns correct median for odd-length sample set (Plan 06)");
  it.todo("returns correct median for even-length sample set (average of two middles)");
  it.todo("handles charCount=0 without dividing by zero");
});

describe("isDurationAnomaly (AUTHOR-06 D-10)", () => {
  it.todo("ratio <0.3× of median triggers anomaly (Plan 06)");
  it.todo("ratio >3× of median triggers anomaly");
  it.todo("ratio within [0.3, 3] band does not trigger anomaly");
  it.todo("exact 3.0× is NOT anomalous (strict > threshold)");
  it.todo("exact 0.3× is NOT anomalous (strict < threshold)");
});

describe("wordDiff (AUTHOR-07 D-11)", () => {
  it.todo("returns empty missed + inserted for identical strings (Plan 06)");
  it.todo("identifies missed words (in expected, not in actual)");
  it.todo("identifies inserted words (in actual, not in expected)");
  it.todo("is case-insensitive (whisper output vs authored text)");
});
