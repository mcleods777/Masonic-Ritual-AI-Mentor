// @vitest-environment node
/**
 * Tests for scripts/lib/resume-state.ts (AUTHOR-02 D-06) +
 * scripts/lib/bake-math.ts (AUTHOR-06 D-10, AUTHOR-07 D-11 pure helpers).
 *
 * Scope: pure file-system unit tests for the shared ResumeState helpers
 * AND the pure math functions extracted out of build-mram-from-dialogue.ts
 * so they can regression-test independently of a real bake.
 *
 * Orchestrator-level behavior (ritual mismatch refusal, --skip-line-ids
 * propagation across spawns) is tested in scripts/__tests__/bake-all.test.ts
 * (Plan 07).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  readResumeState,
  writeResumeStateAtomic,
  type ResumeState,
} from "../lib/resume-state";

import {
  computeMedianSecPerChar,
  isDurationAnomaly,
  wordDiff,
  type DurationSample,
} from "../lib/bake-math";

let tmpRoot: string;
let stateFile: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "resume-state-test-"));
  stateFile = path.join(tmpRoot, "_RESUME.json");
});
afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    // ignore cleanup failures in tmp
  }
});

describe("writeResumeStateAtomic + readResumeState (AUTHOR-02 D-06)", () => {
  it("round-trips the full ResumeState shape losslessly", () => {
    const state: ResumeState = {
      ritual: "ea-opening",
      completedLineIds: ["1", "2", "3"],
      inFlightLineIds: ["4"],
      startedAt: 1_700_000_000_000,
    };
    writeResumeStateAtomic(stateFile, state);
    const read = readResumeState(stateFile);
    expect(read).toEqual(state);
  });

  it("readResumeState returns null when the file does not exist", () => {
    expect(readResumeState(stateFile)).toBeNull();
  });

  it("readResumeState returns null on malformed JSON (corruption tolerance)", () => {
    fs.writeFileSync(stateFile, "{not valid json");
    expect(readResumeState(stateFile)).toBeNull();
  });

  it("readResumeState returns null when schema does not match", () => {
    // Missing inFlightLineIds — the schema guard in readResumeState
    // returns null rather than the partial object.
    fs.writeFileSync(
      stateFile,
      JSON.stringify({ ritual: "x", completedLineIds: [], startedAt: 0 }),
    );
    expect(readResumeState(stateFile)).toBeNull();
  });

  it("atomic write: target file exists, no .tmp lingering after success", () => {
    const state: ResumeState = {
      ritual: "x",
      completedLineIds: [],
      inFlightLineIds: [],
      startedAt: Date.now(),
    };
    writeResumeStateAtomic(stateFile, state);
    const entries = fs.readdirSync(tmpRoot);
    expect(entries).toContain("_RESUME.json");
    expect(entries.filter((n) => n.endsWith(".tmp"))).toEqual([]);
  });

  it("atomic write: overwrites an existing state file cleanly", () => {
    const first: ResumeState = {
      ritual: "x",
      completedLineIds: ["1"],
      inFlightLineIds: [],
      startedAt: 1,
    };
    writeResumeStateAtomic(stateFile, first);

    const second: ResumeState = {
      ritual: "x",
      completedLineIds: ["1", "2"],
      inFlightLineIds: [],
      startedAt: 1,
    };
    writeResumeStateAtomic(stateFile, second);

    expect(readResumeState(stateFile)).toEqual(second);
    // Still no lingering tmp.
    expect(fs.readdirSync(tmpRoot).filter((n) => n.endsWith(".tmp"))).toEqual(
      [],
    );
  });

  it("creates the parent directory if missing (mkdirSync recursive)", () => {
    const nested = path.join(tmpRoot, "a", "b", "c", "_RESUME.json");
    const state: ResumeState = {
      ritual: "x",
      completedLineIds: [],
      inFlightLineIds: [],
      startedAt: 1,
    };
    writeResumeStateAtomic(nested, state);
    expect(fs.existsSync(nested)).toBe(true);
    expect(readResumeState(nested)).toEqual(state);
  });
});

// ---- D-10 / D-11 pure-math helpers (extracted to scripts/lib/bake-math.ts) ----

describe("computeMedianSecPerChar (AUTHOR-06 D-10)", () => {
  it("returns 0 on empty samples", () => {
    expect(computeMedianSecPerChar([])).toBe(0);
  });

  it("returns 0 when all samples have charCount=0", () => {
    expect(
      computeMedianSecPerChar([{ durationMs: 1000, charCount: 0 }]),
    ).toBe(0);
  });

  it("computes median for an odd sample count", () => {
    // durations 1s, 2s, 3s over 10 chars each → 0.1, 0.2, 0.3 s/char → median 0.2
    const samples: DurationSample[] = [
      { durationMs: 1000, charCount: 10 },
      { durationMs: 2000, charCount: 10 },
      { durationMs: 3000, charCount: 10 },
    ];
    expect(computeMedianSecPerChar(samples)).toBeCloseTo(0.2, 5);
  });

  it("computes median for an even sample count (average of two middles)", () => {
    // 0.1, 0.2, 0.3, 0.4 → median = (0.2 + 0.3) / 2 = 0.25
    const samples: DurationSample[] = [
      { durationMs: 1000, charCount: 10 },
      { durationMs: 2000, charCount: 10 },
      { durationMs: 3000, charCount: 10 },
      { durationMs: 4000, charCount: 10 },
    ];
    expect(computeMedianSecPerChar(samples)).toBeCloseTo(0.25, 5);
  });

  it("skips samples with charCount=0 but still medians the rest", () => {
    const samples: DurationSample[] = [
      { durationMs: 1000, charCount: 10 }, // 0.1
      { durationMs: 9999, charCount: 0 }, // dropped
      { durationMs: 3000, charCount: 10 }, // 0.3
    ];
    // After dropping charCount=0: [0.1, 0.3] → median 0.2
    expect(computeMedianSecPerChar(samples)).toBeCloseTo(0.2, 5);
  });
});

describe("isDurationAnomaly (AUTHOR-06 D-10 >3× or <0.3× ritual median)", () => {
  const median = 0.2; // sec/char

  it("returns false when ritualMedian is 0 (insufficient sample)", () => {
    expect(isDurationAnomaly({ durationMs: 9999, charCount: 1 }, 0)).toBe(
      false,
    );
  });

  it("returns false when line.charCount is 0", () => {
    expect(
      isDurationAnomaly({ durationMs: 9999, charCount: 0 }, median),
    ).toBe(false);
  });

  it("returns true when ratio > 3.0× (voice-cast-scene-leak pattern)", () => {
    // 0.8 s/char is 4× of 0.2 median
    expect(
      isDurationAnomaly({ durationMs: 8000, charCount: 10 }, median),
    ).toBe(true);
  });

  it("returns true when ratio < 0.3× (cropped/silent output)", () => {
    // 0.05 s/char is 0.25× of 0.2 median
    expect(
      isDurationAnomaly({ durationMs: 500, charCount: 10 }, median),
    ).toBe(true);
  });

  it("returns false when ratio is in-band (1.0× = median)", () => {
    expect(
      isDurationAnomaly({ durationMs: 2000, charCount: 10 }, median),
    ).toBe(false);
  });

  it("returns false at the upper boundary (exactly 3.0× does NOT trigger)", () => {
    // 0.6 s/char = exactly 3.0× of 0.2 → NOT an anomaly (strict >)
    expect(
      isDurationAnomaly({ durationMs: 6000, charCount: 10 }, median),
    ).toBe(false);
  });

  it("returns false at the lower boundary (exactly 0.3× does NOT trigger)", () => {
    // 0.06 s/char = exactly 0.3× of 0.2 → NOT an anomaly (strict <)
    expect(
      isDurationAnomaly({ durationMs: 600, charCount: 10 }, median),
    ).toBe(false);
  });
});

describe("wordDiff (AUTHOR-07 D-11 --verify-audio)", () => {
  it("returns empty arrays when expected === actual", () => {
    const r = wordDiff("so mote it be", "so mote it be");
    expect(r.missed).toEqual([]);
    expect(r.inserted).toEqual([]);
  });

  it("flags words missing from actual (model dropped words)", () => {
    const r = wordDiff("brethren let us commence", "brethren us commence");
    expect(r.missed).toEqual(["let"]);
    expect(r.inserted).toEqual([]);
  });

  it("flags words inserted by actual (model hallucinated words)", () => {
    const r = wordDiff("so mote it be", "so mote it truly be");
    expect(r.missed).toEqual([]);
    expect(r.inserted).toEqual(["truly"]);
  });

  it("is case-insensitive", () => {
    const r = wordDiff("SO Mote It Be", "so mote it be");
    expect(r.missed).toEqual([]);
    expect(r.inserted).toEqual([]);
  });

  it("handles whitespace variation (collapses multiple spaces)", () => {
    const r = wordDiff("so   mote  it be", "so mote it be");
    expect(r.missed).toEqual([]);
    expect(r.inserted).toEqual([]);
  });

  it("returns both missed and inserted when both diverge", () => {
    const r = wordDiff("brethren rise", "brother rose");
    expect(r.missed.sort()).toEqual(["brethren", "rise"].sort());
    expect(r.inserted.sort()).toEqual(["brother", "rose"].sort());
  });
});
