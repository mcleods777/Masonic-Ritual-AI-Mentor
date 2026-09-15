/**
 * Bake-side STT round-trip verifier (AUTHOR-07).
 *
 * Load-bearing for D-03's short-line validation gate: transcribes a
 * rendered audio buffer via a direct Groq Whisper call and word-diffs
 * the transcript against the expected line text.
 *
 * Direct call, not via /api/transcribe — that route requires a
 * client-token + authenticated session a standalone bake script cannot
 * obtain (see .planning/phases/03-authoring-throughput/03-RESEARCH.md
 * "Alternatives Considered").
 *
 * This module is policy-free: `ok` is strict (zero missed, zero
 * inserted words). The caller (scripts/build-mram-from-dialogue.ts,
 * Plan 08) decides tolerance policy — e.g. whether to retry, fall back
 * to a different engine, or accept a near-miss.
 */

import { wordDiff } from "./bake-math";

export type FetchLike = typeof fetch;

const GROQ_API_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

// copied from src/app/api/transcribe/route.ts — keep in sync
const MASONIC_PROMPT = [
  "Masonic Lodge ritual ceremony.",
  "Worshipful Master, Senior Warden, Junior Warden,",
  "Senior Deacon, Junior Deacon, Tyler, Tiler, Secretary, Treasurer.",
  "Cowans and eavesdroppers. Duly tiled.",
  "So mote it be. Holy Saints John at Jerusalem.",
  "Plumb, square, compasses, gavel, trestle board.",
  "Entered Apprentice, Fellow Craft, Master Mason.",
  "Obligation, due guard, sign, token, grip.",
  "Meridian height. Profane. Brethren.",
  "Lodge assembled. Purgation. Colloquy.",
].join(" ");

// copied from src/app/api/transcribe/route.ts — keep in sync
const GROQ_MODEL = "whisper-large-v3";

function redact(message: string, apiKey: string): string {
  return message.split(apiKey).join("REDACTED");
}

// wordDiff (bake-math.ts) is case-insensitive and whitespace-normalized
// but NOT punctuation-insensitive by design (it's a pure, generic
// word-set diff shared with the duration-anomaly/parity validators).
// STT transcripts routinely omit terminal punctuation ("i do" for
// "I do."), so this module strips common punctuation before handing
// both strings to wordDiff — the diff algorithm itself still lives
// entirely in bake-math.ts; this is pre-processing, not duplicated
// diff logic.
function stripPunctuation(s: string): string {
  return s.replace(/[.,!?;:'"()]/g, "");
}

/**
 * POST an audio buffer to the Groq Whisper endpoint, using the same
 * model name and MASONIC_PROMPT vocabulary hints as /api/transcribe.
 */
async function transcribeBuffer(
  audio: Buffer,
  apiKey: string,
  fetchImpl: FetchLike,
): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)]), "line.ogg");
  form.append("model", GROQ_MODEL);
  form.append("language", "en");
  form.append("prompt", MASONIC_PROMPT);
  form.append("response_format", "json");
  form.append("temperature", "0.0");

  const res = await fetchImpl(GROQ_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Groq Whisper ${res.status}: ${redact(body, apiKey).slice(0, 300)}`);
  }

  const json = (await res.json()) as { text?: string };
  return json.text ?? "";
}

export interface VerifyLineAudioOptions {
  audio: Buffer;
  expectedText: string;
  apiKey: string;
  fetchImpl?: FetchLike;
}

export interface VerifyLineAudioResult {
  ok: boolean;
  missed: string[];
  inserted: string[];
  transcript: string;
}

/**
 * Transcribe an audio buffer and word-diff it against expected text.
 * `ok` is strict — zero missed AND zero inserted words. Callers that
 * want tolerance (e.g. allow one inserted filler word) apply that
 * policy on top of the returned missed/inserted arrays.
 */
export async function verifyLineAudio(
  opts: VerifyLineAudioOptions,
): Promise<VerifyLineAudioResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const transcript = await transcribeBuffer(opts.audio, opts.apiKey, fetchImpl);
  const { missed, inserted } = wordDiff(
    stripPunctuation(opts.expectedText),
    stripPunctuation(transcript),
  );
  return {
    ok: missed.length === 0 && inserted.length === 0,
    missed,
    inserted,
    transcript,
  };
}
