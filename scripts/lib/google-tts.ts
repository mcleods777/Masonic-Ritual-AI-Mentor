/**
 * Google Cloud TTS short-line fallback call (AUTHOR-04 D-02, Pitfall 4).
 *
 * Bake-time fallback engine for ultra-short lines that fail the Gemini
 * padded-prompt validation gate (see scripts/build-mram-from-dialogue.ts,
 * Plan 08). Ported from Shannon's working proof-of-concept experiment
 * (formerly test-google-line94.mjs, repo root — deleted once this module
 * and its tests were green; see 03-05-SUMMARY.md for the fold-then-delete
 * record).
 *
 * CRITICAL (Pitfall 4 — structural preamble-leak guard): this module has
 * NO import from the character/preamble sidecar module under src/lib
 * that builds Gemini director's-notes prompts (deliberately unnamed
 * here so its module-path string never appears in this file — see the
 * acceptance-criteria grep guard in the paired test file). Google Cloud
 * TTS has no preamble concept — it speaks whatever string reaches
 * `input.text` verbatim. Do NOT ever import buildPreamble/assemblePrompt
 * here; wire the raw line text straight through. The body-assertion
 * tests in scripts/__tests__/google-tts.test.ts are the second layer of
 * defense.
 */

export type FetchLike = typeof fetch;

/**
 * Call the Google Cloud TTS synthesize endpoint with the raw line text
 * ONLY (no preamble, no scene, no director's notes — see module header).
 *
 * @param text - The raw line text, sent verbatim as input.text.
 * @param voice - Google Cloud TTS voice name (e.g. "en-US-Neural2-D"),
 *   typically the role's pinned VoiceCastRole.googleVoice.
 * @param apiKey - GOOGLE_CLOUD_TTS_API_KEY.
 * @param fetchImpl - Injectable fetch, defaults to global fetch. Exists
 *   solely for testing.
 * @returns OGG_OPUS audio bytes, already decoded from base64 — no ffmpeg
 *   re-encode needed.
 */
export async function googleTtsBakeCall(
  text: string,
  voice: string,
  apiKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<Buffer> {
  const res = await fetchImpl(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text }, // raw line text ONLY — no preamble (Pitfall 4)
        voice: { languageCode: "en-US", name: voice },
        audioConfig: { audioEncoding: "OGG_OPUS" },
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    const redacted = body.replace(/[?&]key=[^&"'\s]*/g, "?key=REDACTED");
    throw new Error(`Google TTS ${res.status}: ${redacted.slice(0, 300)}`);
  }

  const json = (await res.json()) as { audioContent: string };
  return Buffer.from(json.audioContent, "base64"); // already OGG_OPUS
}
