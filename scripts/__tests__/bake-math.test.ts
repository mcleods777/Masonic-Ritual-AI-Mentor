import { describe, it, expect } from "vitest";
import {
  computeMedianSecPerChar,
  isDurationAnomaly,
  wordDiff,
  type DurationSample,
} from "../lib/bake-math";

describe("computeMedianSecPerChar", () => {
  it("returns 0 for an empty array", () => {
    expect(computeMedianSecPerChar([])).toBe(0);
  });

  it("returns the single sample's sec/char for a single sample", () => {
    const samples: DurationSample[] = [{ durationMs: 2000, charCount: 100 }];
    // 2000ms / 1000 / 100 chars = 0.02 sec/char
    expect(computeMedianSecPerChar(samples)).toBeCloseTo(0.02);
  });

  it("averages the two middle sec/char values for an even count after sorting", () => {
    const samples: DurationSample[] = [
      { durationMs: 4000, charCount: 100 }, // 0.04
      { durationMs: 1000, charCount: 100 }, // 0.01
      { durationMs: 2000, charCount: 100 }, // 0.02
      { durationMs: 3000, charCount: 100 }, // 0.03
    ];
    // sorted: 0.01, 0.02, 0.03, 0.04 -> mid avg (0.02+0.03)/2 = 0.025
    expect(computeMedianSecPerChar(samples)).toBeCloseTo(0.025);
  });

  it("filters out samples with charCount === 0 before computing", () => {
    const samples: DurationSample[] = [
      { durationMs: 1000, charCount: 0 },
      { durationMs: 2000, charCount: 100 }, // 0.02
    ];
    expect(computeMedianSecPerChar(samples)).toBeCloseTo(0.02);
  });

  it("returns 0 when all samples have charCount === 0", () => {
    const samples: DurationSample[] = [
      { durationMs: 1000, charCount: 0 },
      { durationMs: 2000, charCount: 0 },
    ];
    expect(computeMedianSecPerChar(samples)).toBe(0);
  });
});

describe("isDurationAnomaly", () => {
  it("returns false when ritualMedian === 0 (insufficient-sample guard)", () => {
    const line: DurationSample = { durationMs: 10000, charCount: 100 };
    expect(isDurationAnomaly(line, 0)).toBe(false);
  });

  it("returns false when line.charCount === 0 (insufficient-sample guard)", () => {
    const line: DurationSample = { durationMs: 10000, charCount: 0 };
    expect(isDurationAnomaly(line, 0.02)).toBe(false);
  });

  it("returns true when ratio exceeds thresholds.max (default 3.0)", () => {
    // ratio = (10000/1000/100) / 0.02 = 0.1 / 0.02 = 5.0 > 3.0
    const line: DurationSample = { durationMs: 10000, charCount: 100 };
    expect(isDurationAnomaly(line, 0.02)).toBe(true);
  });

  it("returns true when ratio is below thresholds.min (default 0.3)", () => {
    // ratio = (200/1000/100) / 0.02 = 0.002 / 0.02 = 0.1 < 0.3
    const line: DurationSample = { durationMs: 200, charCount: 100 };
    expect(isDurationAnomaly(line, 0.02)).toBe(true);
  });

  it("returns false inside the band", () => {
    // ratio = (2000/1000/100) / 0.02 = 0.02 / 0.02 = 1.0 (inside [0.3, 3.0])
    const line: DurationSample = { durationMs: 2000, charCount: 100 };
    expect(isDurationAnomaly(line, 0.02)).toBe(false);
  });

  it("does not trip at the exact boundary ratio of 3.0 (strict >)", () => {
    // ratio = (6000/1000/100) / 0.02 = 0.06 / 0.02 = 3.0 exactly
    const line: DurationSample = { durationMs: 6000, charCount: 100 };
    expect(isDurationAnomaly(line, 0.02)).toBe(false);
  });

  it("does not trip at the exact boundary ratio of 0.3 (strict <)", () => {
    // ratio = (600/1000/100) / 0.02 = 0.006 / 0.02 = 0.3 exactly
    const line: DurationSample = { durationMs: 600, charCount: 100 };
    expect(isDurationAnomaly(line, 0.02)).toBe(false);
  });

  it("respects custom thresholds", () => {
    // ratio = 1.5, custom max = 1.2 -> anomaly
    const line: DurationSample = { durationMs: 3000, charCount: 100 };
    expect(
      isDurationAnomaly(line, 0.02, { min: 0.3, max: 1.2 }),
    ).toBe(true);
  });
});

describe("wordDiff", () => {
  it("is case-insensitive", () => {
    const result = wordDiff("The Brother Speaks", "the brother speaks");
    expect(result.missed).toEqual([]);
    expect(result.inserted).toEqual([]);
  });

  it("is whitespace-normalized", () => {
    const result = wordDiff("hello   world", "hello world");
    expect(result.missed).toEqual([]);
    expect(result.inserted).toEqual([]);
  });

  it("reports missed words absent from actual", () => {
    const result = wordDiff("the worshipful master rises", "the master rises");
    expect(result.missed).toEqual(["worshipful"]);
    expect(result.inserted).toEqual([]);
  });

  it("reports inserted words absent from expected", () => {
    const result = wordDiff("the master rises", "the worshipful master rises");
    expect(result.missed).toEqual([]);
    expect(result.inserted).toEqual(["worshipful"]);
  });

  it("reports both missed and inserted words together", () => {
    const result = wordDiff("brethren assemble here", "brethren gather there");
    expect(result.missed).toEqual(["assemble", "here"]);
    expect(result.inserted).toEqual(["gather", "there"]);
  });

  it("handles empty strings", () => {
    const result = wordDiff("", "");
    expect(result.missed).toEqual([]);
    expect(result.inserted).toEqual([]);
  });
});
