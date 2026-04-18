/**
 * Gemini 3.1 Flash TTS audio-tag validation and helpers.
 *
 * Gemini 3.1 Flash TTS takes natural-language "audio tags" inline in the
 * text, bracket-wrapped, to steer expressive delivery:
 *
 *   [gravely] You will say I, your name, and repeat after me: ...
 *   I will always hail, [slowly] forever conceal, [pause] and never reveal
 *
 * 200+ tags are documented (emotional states, pacing, delivery styles).
 * The Suggest Styles author tool constrains Claude's suggestions to a
 * narrow set: lowercase, single word or short phrase, hyphen and space
 * allowed, max 30 chars. This rejects multi-word emotional descriptions
 * ("grave, binding oath") that the tag model can't interpret.
 *
 * See: https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-tts-preview
 */

/**
 * Single source of truth for style tag validation. Import this in any
 * author code path that saves a style, and in the dialogue-to-mram
 * ingestion path that reads `{ritual}-styles.json`.
 */
export const STYLE_TAG_PATTERN = /^[a-z][a-z -]{0,30}$/;

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
