export interface DurationSample {
  durationMs: number;
  charCount: number;
}

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

export function isDurationAnomaly(
  line: DurationSample,
  ritualMedian: number,
  thresholds: { min: number; max: number } = { min: 0.3, max: 3.0 },
): boolean {
  if (ritualMedian === 0 || line.charCount === 0) return false; // insufficient sample
  const ratio = line.durationMs / 1000 / line.charCount / ritualMedian;
  return ratio > thresholds.max || ratio < thresholds.min;
}

export function wordDiff(
  expected: string,
  actual: string,
): { missed: string[]; inserted: string[] } {
  const norm = (s: string) => s.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const expWords = norm(expected);
  const actWords = norm(actual);
  const actSet = new Set(actWords);
  const expSet = new Set(expWords);
  return {
    missed: expWords.filter((w) => !actSet.has(w)),
    inserted: actWords.filter((w) => !expSet.has(w)),
  };
}
