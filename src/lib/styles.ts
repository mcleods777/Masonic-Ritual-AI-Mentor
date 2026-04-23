/**
 * Gemini 3.1 Flash TTS audio-tag validation and helpers.
 *
 * Gemini 3.1 Flash TTS takes natural-language "audio tags" inline in the
 * text, bracket-wrapped, to steer expressive delivery:
 *
 *   [gravely] You will say I, your name, and repeat after me: ...
 *   I will always hail, [slowly] forever conceal, [pause] and never reveal
 *
 * 200+ tags are documented (emotional states, pacing, delivery styles),
 * but Google's own guidance is that any single-word-or-short-phrase
 * descriptor inside brackets works — `[sarcastically, one painfully
 * slow word at a time]` is a valid (and effective) direction. The old
 * regex only accepted single-word lowercase tags (~5% of Gemini's
 * expressive surface area); this relaxed version allows multi-clause
 * directive styles like "solemnly, with slight tremor" while still
 * rejecting anything that could break the bracket prompt format
 * (newlines, other brackets, quotes, backticks, semicolons).
 *
 * See: https://ai.google.dev/gemini-api/docs/speech-generation
 */

/**
 * Single source of truth for style tag validation. Import this in any
 * author code path that saves a style, and in the dialogue-to-mram
 * ingestion path that reads `{ritual}-styles.json`.
 *
 * Allowed: lowercase letters, spaces, commas, hyphens, apostrophes.
 * Must start with a lowercase letter. Max 80 chars — comfortably fits
 * "reverent, with a long pause before the final phrase" (50 chars)
 * and similar multi-clause directives.
 *
 * Rejected: uppercase (prevents ALL-CAPS SHOUTING tokens sneaking in),
 * digits, underscores, brackets, quotes, newlines, any other punctuation.
 */
export const STYLE_TAG_PATTERN = /^[a-z][a-z ,'-]{0,79}$/;

/**
 * Validate a style tag against STYLE_TAG_PATTERN. Returns true if the
 * tag is acceptable for Gemini TTS.
 */
export function isValidStyleTag(tag: unknown): tag is string {
  return typeof tag === "string" && STYLE_TAG_PATTERN.test(tag);
}

/**
 * Curated whitelist of audio tags appropriate for Masonic ritual. Not
 * exhaustive — Gemini accepts arbitrary single-word descriptive tags,
 * but these are the ones the Suggest Styles LLM prompt is anchored on.
 *
 * Categories:
 *   - Emotional/tonal: gravely, reverently, solemnly, warmly, sternly, etc.
 *   - Pacing: slowly, neutrally (default), fast (rarely)
 *   - Intensity: hushed, whispers, authoritative
 *
 * Excluded on purpose: [laughs], [sighs], non-speech sounds. These are
 * in Gemini's tag set but never belong in ritual recitation.
 */
export const RITUAL_STYLE_WHITELIST = [
  "neutral",
  "solemnly",
  "gravely",
  "reverently",
  "hushed",
  "whispers",
  "authoritative",
  "warmly",
  "sternly",
  "commanding",
  "prayerful",
  "formal",
  "measured",
  "slowly",
  "deliberate",
  "brotherly",
  "welcoming",
  "tentative",
  "questioning",
  "binding",
] as const;

/**
 * Styles-file schema — the shape of `{ritual}-styles.json` on disk.
 *
 * Keys are content-hashed (sha256 of the line's plain text) rather than
 * line IDs, so inserting/deleting dialogue lines doesn't orphan suffix
 * styles. A text edit to a line invalidates its style (different hash,
 * treated as a new line that needs a fresh suggestion).
 */
export interface StylesFile {
  version: 1;
  styles: {
    /** sha256 hex of the line's plain text */
    lineHash: string;
    /** The audio tag to prepend, e.g. "gravely" */
    style: string;
  }[];
}

/**
 * Compute the content hash used as a styles key.
 * Uses Web Crypto on both browser and Node (via globalThis.crypto).
 */
export async function hashLineText(plain: string): Promise<string> {
  const bytes = new TextEncoder().encode(plain);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
