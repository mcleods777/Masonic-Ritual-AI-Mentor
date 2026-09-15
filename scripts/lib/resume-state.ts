/**
 * scripts/lib/resume-state.ts — shared resume-state types + atomic helpers.
 *
 * Ported verbatim from the abandoned branch `gsd/phase-3-authoring-throughput`
 * (`git show 58eb551:scripts/lib/resume-state.ts`) per 03-06-PLAN.md Task 1 —
 * this module has no known issues and no fixes are required.
 *
 * Written by a future line-level bake writer (per-line, atomic writes).
 * Read by scripts/bake-all.ts (this plan) to know which work completed in
 * a prior interrupted run. NOTE: as of this plan, scripts/build-mram-from-
 * dialogue.ts does not yet write per-line ResumeState (no --skip-line-ids /
 * --resume-state-path flags exist on current main — see 03-06-SUMMARY.md
 * "Deviations"), so scripts/bake-all.ts's own --resume flag currently
 * operates at RITUAL granularity, reusing this same atomic file format with
 * `completedLineIds` repurposed to hold completed ritual slugs. The type
 * and functions below are otherwise untouched so a future per-line writer
 * can adopt this exact contract without a breaking change.
 */

import * as fs from "node:fs";
import * as path from "node:path";

export interface ResumeState {
  /** Slug of the ritual currently being baked. Guards against mixed-ritual resume. */
  ritual: string;
  /** Line IDs (in order of completion) that have been fully rendered + embedded. */
  completedLineIds: string[];
  /** Line IDs that started rendering but did not complete. Re-tried on resume. */
  inFlightLineIds: string[];
  /** Unix ms timestamp — when the current bake invocation started. */
  startedAt: number;
}

/**
 * Read _RESUME.json from `filePath`. Returns null when the file doesn't
 * exist OR when it's malformed (caller can then re-init from scratch).
 */
export function readResumeState(filePath: string): ResumeState | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    if (
      typeof raw !== "object" ||
      raw === null ||
      typeof (raw as { ritual?: unknown }).ritual !== "string" ||
      !Array.isArray((raw as { completedLineIds?: unknown }).completedLineIds) ||
      !Array.isArray((raw as { inFlightLineIds?: unknown }).inFlightLineIds) ||
      typeof (raw as { startedAt?: unknown }).startedAt !== "number"
    ) {
      return null;
    }
    return raw as ResumeState;
  } catch {
    return null;
  }
}

/**
 * Write `state` to `filePath` atomically via tmp+rename (RESEARCH Pattern 6).
 * A crash mid-write leaves EITHER the old file intact OR the new file
 * fully written — never a truncated file. `fs.renameSync` is atomic on
 * POSIX within the same directory; the tmp path is co-located for that
 * reason. Creates `dirname(filePath)` recursively if missing.
 */
export function writeResumeStateAtomic(
  filePath: string,
  state: ResumeState,
): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, filePath);
}
