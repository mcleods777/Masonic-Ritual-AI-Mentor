// @vitest-environment node
/**
 * Wave 0 scaffold for AUTHOR-05 / D-08 cipher/plain parity validator.
 * Implemented by Plan 04 (03-04).
 *
 * Three hard-fail cases (per D-08):
 *   1. Speaker mismatch → severity "error".
 *   2. Action-tag mismatch → severity "error".
 *   3. Word-count ratio outside [0.5×, 2×] → severity "error" with kind "ratio-outlier".
 * Plus one soft-case: within-band word ratios do NOT raise an error.
 */
import { describe, it } from "vitest";

describe("author-validation cipher/plain parity (AUTHOR-05 D-08)", () => {
  it.todo("hard-fails on speaker mismatch (Plan 04)");
  it.todo("hard-fails on action-tag mismatch");
  it.todo("hard-fails on word-count ratio > 2×");
  it.todo("hard-fails on word-count ratio < 0.5×");
  it.todo("accepts matched speakers + actions + within-band word ratio");
  it.todo("bake-band check is word-count not character-count (explicit)");
});
