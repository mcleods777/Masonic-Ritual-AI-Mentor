/**
 * scripts/lib/bake-math.ts — pure math helpers for the bake-time gates.
 *
 * Extracted out of scripts/build-mram-from-dialogue.ts so the D-10
 * duration-anomaly math and the D-11 word-diff can be unit-tested
 * independently of a real bake invocation. Both helpers are load-bearing:
 *
 *   - computeMedianSecPerChar + isDurationAnomaly catch the
 *     `gemini-tts-voice-cast-scene-leaks-into-audio` historical failure
 *     pattern (AUTHOR-06 D-10). A regression in the ratio arithmetic
 *     would silently ship pathological durations.
 *   - wordDiff powers AUTHOR-07 D-11 (--verify-audio) roll-up. A
 *     regression in the set-diff arithmetic would either under-flag
 *     (false negatives on Whisper mismatches) or over-flag (false
 *     positives that train Shannon to ignore the signal).
 *
 * Pure functions only. No fs, no process, no logging. Safe to import
 * from tests without mocking.
 */

export interface DurationSample {
  durationMs: number;
  charCount: number;
}

/**
 * Median sec-per-char across samples. Samples with charCount=0 are
 * dropped (their ratio would be undefined). Returns 0 on empty input
 * OR when all samples were dropped. Caller must guard the 0 case
 * (isDurationAnomaly treats a 0 median as "insufficient sample").
 *
 * AUTHOR-06 D-10 Pitfall 6: the detector in build-mram only consults
 * this function once samples.length >= 30 — below that, the median
 * is unstable enough to produce false positives on real ritual bakes.
 * The 0-guards here are correctness belts-and-suspenders for any
 * future direct caller.
 */
export function computeMedianSecPerChar(samples: DurationSample[]): number {
  if (samples.length === 0) return 0;
  const secPerChar = samples
    .filter((s) => s.charCount > 0)
    .map((s) => s.durationMs / 1000 / s.charCount)
    .sort((a, b) => a - b);
  if (secPerChar.length === 0) return 0;
  const mid = Math.floor(secPerChar.length / 2);
  return secPerChar.length % 2 === 0
    ? (secPerChar[mid - 1]! + secPerChar[mid]!) / 2
    : secPerChar[mid]!;
}

/**
 * AUTHOR-06 D-10: a line is anomalous iff its sec-per-char ratio falls
 * STRICTLY outside the [0.3×, 3×] band around the per-ritual median.
 * Boundary values (ratio=3.0 or ratio=0.3 exactly) DO NOT trigger —
 * the strict > and < comparisons keep edge-case lines in band.
 *
 * Returns false when either `ritualMedian` is 0 (sample too small per
 * Pitfall 6) or `line.charCount` is 0 (would divide by zero). These
 * guards mean callers can always invoke without pre-checking.
 */
export function isDurationAnomaly(
  line: DurationSample,
  ritualMedian: number,
  thresholds: { min: number; max: number } = { min: 0.3, max: 3.0 },
): boolean {
  if (ritualMedian === 0 || line.charCount === 0) return false;
  const lineSecPerChar = line.durationMs / 1000 / line.charCount;
  const ratio = lineSecPerChar / ritualMedian;
  return ratio > thresholds.max || ratio < thresholds.min;
}

/**
 * AUTHOR-07 D-11: case-insensitive word-level diff for --verify-audio.
 * Returns `{missed, inserted}` — words present in `expected` but not
 * `actual` (missed), and words in `actual` but not `expected` (inserted).
 *
 * Tokenizer: `.toLowerCase().trim().split(/\s+/).filter(Boolean)`.
 * Whitespace-collapsing + case-folding absorbs the noise Whisper
 * normally introduces (extra spaces, capitalization) without flagging
 * it as a diff; real word drops / hallucinations surface as array
 * entries. Set-based so duplicate words don't double-count.
 */
export function wordDiff(
  expected: string,
  actual: string,
): { missed: string[]; inserted: string[] } {
  const norm = (s: string): string[] =>
    s.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const expWords = norm(expected);
  const actWords = norm(actual);
  const expSet = new Set(expWords);
  const actSet = new Set(actWords);
  const missed = expWords.filter((w) => !actSet.has(w));
  const inserted = actWords.filter((w) => !expSet.has(w));
  return { missed, inserted };
}
