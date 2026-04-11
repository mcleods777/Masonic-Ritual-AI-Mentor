/**
 * Pure routing decision for the rehearsal state machine.
 *
 * Given a section and the user's selected role, decide whether to:
 *   - listen for the user's recitation (user-turn)
 *   - speak the line via TTS (ai-speaks)
 *   - silently advance to the next line (silent-advance)
 *
 * This is extracted from RehearsalMode.tsx so it can be unit-tested without
 * rendering a React component. The component imports this and uses the
 * result to drive its state transitions.
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
