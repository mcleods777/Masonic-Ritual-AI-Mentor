/**
 * Pure routing decisions for the rehearsal state machine.
 *
 * Contains two pure functions extracted from RehearsalMode.tsx so they can
 * be unit-tested without rendering a React component:
 *
 *   - decideLineAction: on each line transition, decide whether to listen
 *     for the user's recitation, speak the line via TTS, or silently advance
 *   - planComparisonAction: after the user recites, decide whether to
 *     auto-advance (perfect or near-perfect line) or show the judging screen
 *
 * The component imports these and wires their results to state transitions.
 */

import { cleanRitualText } from "./document-parser";

export type LineAction = "user-turn" | "ai-speaks" | "silent-advance";

export interface RehearsalSectionInput {
  speaker: string | null;
  text: string;
}

/**
 * Decide what the rehearsal loop should do with the given section.
 *
 * Rules:
 *   1. If the line has no speakable text (empty, whitespace-only, or
 *      purely action markup), it's a silent row — stage directions,
 *      structural cues, or speaker-performed actions. Advance with a
 *      brief pause so the UI doesn't stall.
 *
 *   2. Otherwise, if the speaker matches the user's selected role, it's
 *      the user's line — enter listening mode.
 *
 *   3. Otherwise, if the speaker is set, the AI reads the line.
 *
 *   4. Defensive default: advance silently on unexpected input.
 */
export function decideLineAction(
  section: RehearsalSectionInput,
  selectedRole: string | null,
): LineAction {
  const hasSpeakableText = cleanRitualText(section.text).length > 0;

  if (!hasSpeakableText) return "silent-advance";
  if (selectedRole !== null && section.speaker === selectedRole) return "user-turn";
  if (section.speaker) return "ai-speaks";
  return "silent-advance";
}

// ============================================================
// Comparison action planner (post-recitation routing)
// ============================================================

/**
 * Default threshold for auto-advancing a perfectly-recited line. 95% was
 * chosen because the `compareTexts` pipeline normalizes punctuation, casing,
 * and filler words, so clean recitations hit 100%. The phonetic and fuzzy
 * layers cap at 80%+, so 95% catches one-word minor fuzz (e.g., "worshipfull"
 * vs "worshipful") without letting real errors slip through. See
 * ~/.gstack/projects/.../ceo-plans/2026-04-11-post-pr33-*.md Open Question 1.
 */
export const DEFAULT_AUTO_ADVANCE_THRESHOLD = 95;

/**
 * Default beat duration (ms) for the auto-advance visual confirmation before
 * advancing to the next line. 300ms is the minimum perceivable duration that
 * still feels responsive — long enough that "I saw the checkmark" registers,
 * short enough that the AI's next line follows tightly.
 */
export const DEFAULT_AUTO_ADVANCE_BEAT_MS = 300;

export type ComparisonAction =
  | { kind: "auto-advance"; nextIndex: number; beatMs: number }
  | { kind: "judge" };

/**
 * Decide what to do after the user finishes reciting a line and the
 * comparison pipeline has produced an accuracy score.
 *
 * - accuracy >= threshold → "auto-advance" with the next line index and
 *   the beat duration. The caller schedules a setTimeout and advances after
 *   the beat (with the standard cancel pattern).
 * - accuracy < threshold → "judge" — show the judging screen with diff and
 *   retry (the existing behavior).
 *
 * Defensive handling of NaN/undefined: if `accuracy` is not a finite number,
 * route to "judge" (same as "imperfect"). This prevents a broken comparison
 * from silently auto-advancing through a rehearsal.
 */
export function planComparisonAction(
  accuracy: number,
  currentIndex: number,
  threshold: number = DEFAULT_AUTO_ADVANCE_THRESHOLD,
  beatMs: number = DEFAULT_AUTO_ADVANCE_BEAT_MS,
): ComparisonAction {
  if (!Number.isFinite(accuracy)) return { kind: "judge" };
  if (accuracy >= threshold) {
    return { kind: "auto-advance", nextIndex: currentIndex + 1, beatMs };
  }
  return { kind: "judge" };
}
