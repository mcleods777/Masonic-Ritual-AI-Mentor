/**
 * Cloud TTS engines — ElevenLabs, Google Cloud, Deepgram Aura-2, Kokoro, and Voxtral.
 *
 * Each engine calls its corresponding Next.js API route (which holds
 * the secret API key) and plays back the returned audio via an
 * HTMLAudioElement.
 */

import { fetchApi } from "./api-fetch";

// ============================================================
// Shared audio player
// ============================================================

let currentAudio: HTMLAudioElement | null = null;
let currentResolve: (() => void) | null = null;
let currentAbort: AbortController | null = null;

/** Get a new AbortSignal for a TTS fetch. Aborts any previous in-flight fetch. */
export function getTTSAbortSignal(): AbortSignal {
  if (currentAbort) currentAbort.abort();
  currentAbort = new AbortController();
  return currentAbort.signal;
}

/** Play an audio blob and resolve when it finishes. */
export function playAudioBlob(blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    stopCloudAudio();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio = audio;
    currentResolve = resolve;

    audio.onended = () => {
      URL.revokeObjectURL(url);
      currentAudio = null;
      currentResolve = null;
      resolve();
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      currentAudio = null;
      currentResolve = null;
      reject(new Error("Cloud TTS audio playback failed"));
    };

    audio.play().catch((err) => {
      URL.revokeObjectURL(url);
      currentAudio = null;
      currentResolve = null;
      reject(err);
    });
  });
}

/** Stop whatever cloud audio is currently playing and abort in-flight fetches. */
export function stopCloudAudio(): void {
  // Abort any in-flight TTS fetch so it doesn't start playback after we stop
  if (currentAbort) {
    currentAbort.abort();
    currentAbort = null;
  }
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
  // Resolve the pending playAudioBlob promise so callers (e.g. the
  // playFrom loop) don't hang forever waiting for audio that was stopped.
  if (currentResolve) {
    currentResolve();
    currentResolve = null;
  }
}

/** Whether cloud audio is currently playing. */
export function isCloudAudioPlaying(): boolean {
  return currentAudio !== null && !currentAudio.paused;
}

// ============================================================
// ElevenLabs
// ============================================================

/**
 * ElevenLabs voice IDs for Masonic officer roles.
 * Uses the publicly-available premade voices so every account has them.
 */
const ELEVENLABS_ROLE_VOICES: Record<string, string> = {
  // Voices verified available on the account (all male):
  // Adam   (pNInz6obpgDQGcFmaJgB) — Dominant, Firm
  // Brian  (nPczCjzI2devNBz1zQrb) — Deep, Resonant, Comforting
  // George (JBFqnCBsd6RMkjVDRZzb) — Warm, British Storyteller
  // Eric   (cjVigY5qzO86Huf0OWal) — Smooth, Trustworthy
  // Chris  (iP95p4xoKVk53GoZ742B) — Charming, Down-to-Earth
  // Bill   (pqHfZKP75CvOlQylNhV4) — Wise, Mature
  // Charlie(IKne3meq5aSn9XLyUdCD) — Deep, Confident
  // Daniel (onwK4e9ZLuTAKqWW03F9) — Steady Broadcaster
  // Roger  (CwhRBWXzGAHq8TQ4Fs17) — Laid-Back, Resonant
  // Liam   (TX3LPaxmHKxFdv7VOQHJ) — Energetic
  // Harry  (SOYHLrjzK2X1ezoPC6cr) — Fierce Warrior
  // Callum (N2lVS1w4EtoT3dr4eOWO) — Husky
  // Will   (bIHbv24MWmeRgasZH58o) — Relaxed Optimist

  // Principal officers
  WM:       "pNInz6obpgDQGcFmaJgB", // Adam — dominant, firm
  "W.M.":   "pNInz6obpgDQGcFmaJgB",
  "W. M.":  "pNInz6obpgDQGcFmaJgB",
  SW:       "nPczCjzI2devNBz1zQrb", // Brian — deep, resonant
  "S.W.":   "nPczCjzI2devNBz1zQrb",
  "S. W.":  "nPczCjzI2devNBz1zQrb",
  JW:       "JBFqnCBsd6RMkjVDRZzb", // George — warm, British
  "J.W.":   "JBFqnCBsd6RMkjVDRZzb",
  "J. W.":  "JBFqnCBsd6RMkjVDRZzb",
  // Deacons
  SD:       "cjVigY5qzO86Huf0OWal", // Eric — smooth, trustworthy
  "S.D.":   "cjVigY5qzO86Huf0OWal",
  "S. D.":  "cjVigY5qzO86Huf0OWal",
  JD:       "iP95p4xoKVk53GoZ742B", // Chris — charming
  "J.D.":   "iP95p4xoKVk53GoZ742B",
  "J. D.":  "iP95p4xoKVk53GoZ742B",
  "S(orJ)D":"cjVigY5qzO86Huf0OWal",
  "S/J D":  "cjVigY5qzO86Huf0OWal",
  // Other officers
  "S/Sec":  "pqHfZKP75CvOlQylNhV4", // Bill — wise, mature
  Sec:      "pqHfZKP75CvOlQylNhV4",
  "Sec.":   "pqHfZKP75CvOlQylNhV4",
  S:        "pqHfZKP75CvOlQylNhV4",
  Tr:       "IKne3meq5aSn9XLyUdCD", // Charlie — deep, confident
  Treas:    "IKne3meq5aSn9XLyUdCD",
  "Treas.": "IKne3meq5aSn9XLyUdCD",
  Ch:       "onwK4e9ZLuTAKqWW03F9", // Daniel — steady broadcaster
  Chap:     "onwK4e9ZLuTAKqWW03F9",
  "Chap.":  "onwK4e9ZLuTAKqWW03F9",
  Marshal:  "TX3LPaxmHKxFdv7VOQHJ", // Liam — energetic
  T:        "CwhRBWXzGAHq8TQ4Fs17", // Roger — laid-back, resonant
  Tyler:    "CwhRBWXzGAHq8TQ4Fs17",
  Candidate:"N2lVS1w4EtoT3dr4eOWO", // Callum — husky
  ALL:      "pNInz6obpgDQGcFmaJgB", // Adam (WM leads unison)
  All:      "pNInz6obpgDQGcFmaJgB",
  BR:       "N2lVS1w4EtoT3dr4eOWO", // Callum
  Bro:      "N2lVS1w4EtoT3dr4eOWO",
  "Bro.":   "N2lVS1w4EtoT3dr4eOWO",
  "SW/WM":  "pNInz6obpgDQGcFmaJgB", // Adam
  // Additional role aliases
  Trs:      "IKne3meq5aSn9XLyUdCD", // Charlie
  "WM/Chaplain":"onwK4e9ZLuTAKqWW03F9", // Daniel
  Voucher:  "bIHbv24MWmeRgasZH58o", // Will — relaxed
  Vchr:     "bIHbv24MWmeRgasZH58o",
  Narrator: "SOYHLrjzK2X1ezoPC6cr", // Harry — commanding narrator
  PRAYER:   "onwK4e9ZLuTAKqWW03F9", // Daniel
  Prayer:   "onwK4e9ZLuTAKqWW03F9",
};

const ELEVENLABS_DEFAULT_VOICE = "pNInz6obpgDQGcFmaJgB"; // Adam

export function getElevenLabsVoiceForRole(role: string): string {
  return ELEVENLABS_ROLE_VOICES[role] || ELEVENLABS_DEFAULT_VOICE;
}

/** Speak text using ElevenLabs (with retry for transient errors). */
export async function speakElevenLabs(
  text: string,
  voiceId?: string
): Promise<void> {
  const MAX_RETRIES = 2;
  const RETRY_DELAYS = [500, 1500]; // ms backoff between retries
  const signal = getTTSAbortSignal();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Re-throw abort errors immediately — don't retry intentional cancellations
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    let resp: Response;
    try {
      resp = await fetchApi("/api/tts/elevenlabs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          voiceId: voiceId || ELEVENLABS_DEFAULT_VOICE,
        }),
        signal,
      });
    } catch (fetchErr) {
      // Abort errors should not be retried
      if (fetchErr instanceof DOMException && fetchErr.name === "AbortError") {
        throw fetchErr;
      }
      // Network error — retry if we can
      if (attempt < MAX_RETRIES) {
        console.warn(
          `ElevenLabs TTS network error, retrying in ${RETRY_DELAYS[attempt]}ms (attempt ${attempt + 1}/${MAX_RETRIES})...`
        );
        await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
        continue;
      }
      throw fetchErr;
    }

    if (resp.ok) {
      await playAudioBlob(await resp.blob());
      return;
    }

    // Retry on transient errors (429 rate limit, 500/503 server errors)
    const isRetryable = resp.status === 429 || resp.status >= 500;
    if (isRetryable && attempt < MAX_RETRIES) {
      console.warn(
        `ElevenLabs TTS returned ${resp.status}, retrying in ${RETRY_DELAYS[attempt]}ms (attempt ${attempt + 1}/${MAX_RETRIES})...`
      );
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
      continue;
    }

    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error((err as { error?: string }).error || "ElevenLabs TTS failed");
  }
}

/** Speak text as a Masonic officer role using ElevenLabs. */
export async function speakElevenLabsAsRole(
  text: string,
  role: string
): Promise<void> {
  return speakElevenLabs(text, getElevenLabsVoiceForRole(role));
}

// ============================================================
// Google Cloud Text-to-Speech
// ============================================================

interface GoogleVoiceProfile {
  name: string;
  pitch: number;
  rate: number;
}

/**
 * Google Cloud Neural2 voice mappings for Masonic officer roles.
 * Uses different voices + pitch offsets so each officer sounds distinct.
 */
const GOOGLE_ROLE_VOICES: Record<string, GoogleVoiceProfile> = {
  // Principal officers — deeper, more deliberate
  WM:       { name: "en-US-Neural2-D", pitch: -2.0, rate: 0.90 },
  "W.M.":   { name: "en-US-Neural2-D", pitch: -2.0, rate: 0.90 },
  "W. M.":  { name: "en-US-Neural2-D", pitch: -2.0, rate: 0.90 },
  SW:       { name: "en-US-Neural2-A", pitch: -1.0, rate: 0.93 },
  "S.W.":   { name: "en-US-Neural2-A", pitch: -1.0, rate: 0.93 },
  "S. W.":  { name: "en-US-Neural2-A", pitch: -1.0, rate: 0.93 },
  JW:       { name: "en-US-Neural2-J", pitch: 0.0,  rate: 0.93 },
  "J.W.":   { name: "en-US-Neural2-J", pitch: 0.0,  rate: 0.93 },
  "J. W.":  { name: "en-US-Neural2-J", pitch: 0.0,  rate: 0.93 },
  // Deacons — slightly brighter
  SD:       { name: "en-US-Neural2-I", pitch: 1.0,  rate: 0.97 },
  "S.D.":   { name: "en-US-Neural2-I", pitch: 1.0,  rate: 0.97 },
  "S. D.":  { name: "en-US-Neural2-I", pitch: 1.0,  rate: 0.97 },
  JD:       { name: "en-GB-Neural2-B", pitch: 0.0,  rate: 0.97 },
  "J.D.":   { name: "en-GB-Neural2-B", pitch: 0.0,  rate: 0.97 },
  "J. D.":  { name: "en-GB-Neural2-B", pitch: 0.0,  rate: 0.97 },
  "S(orJ)D":{ name: "en-US-Neural2-I", pitch: 0.5,  rate: 0.97 },
  "S/J D":  { name: "en-US-Neural2-I", pitch: 0.5,  rate: 0.97 },
  // Other officers
  "S/Sec":  { name: "en-US-Neural2-A", pitch: 0.0,  rate: 1.0 },
  Sec:      { name: "en-US-Neural2-A", pitch: 0.0,  rate: 1.0 },
  "Sec.":   { name: "en-US-Neural2-A", pitch: 0.0,  rate: 1.0 },
  S:        { name: "en-US-Neural2-A", pitch: 0.0,  rate: 1.0 },
  Tr:       { name: "en-US-Neural2-J", pitch: -1.0, rate: 0.95 },
  Treas:    { name: "en-US-Neural2-J", pitch: -1.0, rate: 0.95 },
  "Treas.": { name: "en-US-Neural2-J", pitch: -1.0, rate: 0.95 },
  Ch:       { name: "en-US-Neural2-D", pitch: -3.0, rate: 0.85 },
  Chap:     { name: "en-US-Neural2-D", pitch: -3.0, rate: 0.85 },
  "Chap.":  { name: "en-US-Neural2-D", pitch: -3.0, rate: 0.85 },
  Marshal:  { name: "en-US-Neural2-I", pitch: -1.0, rate: 0.95 },
  T:        { name: "en-GB-Neural2-B", pitch: 2.0,  rate: 1.0 },
  Tyler:    { name: "en-GB-Neural2-B", pitch: 2.0,  rate: 1.0 },
  Candidate:{ name: "en-US-Neural2-A", pitch: 1.0,  rate: 0.90 },
  ALL:      { name: "en-US-Neural2-D", pitch: -1.0, rate: 0.88 },
  All:      { name: "en-US-Neural2-D", pitch: -1.0, rate: 0.88 },
  BR:       { name: "en-US-Neural2-I", pitch: 0.0,  rate: 0.95 },
  Bro:      { name: "en-US-Neural2-I", pitch: 0.0,  rate: 0.95 },
  "Bro.":   { name: "en-US-Neural2-I", pitch: 0.0,  rate: 0.95 },
  "SW/WM":      { name: "en-US-Neural2-D", pitch: -1.5, rate: 0.90 },
  // Additional role aliases from ritual files
  Trs:          { name: "en-US-Neural2-J", pitch: -1.0, rate: 0.95 },
  "WM/Chaplain":{ name: "en-US-Neural2-D", pitch: -3.0, rate: 0.85 },
  Voucher:      { name: "en-US-Neural2-I", pitch: 0.0,  rate: 0.95 },
  Vchr:         { name: "en-US-Neural2-I", pitch: 0.0,  rate: 0.95 },
  Narrator:     { name: "en-US-Neural2-A", pitch: 0.0,  rate: 1.0 },
  PRAYER:       { name: "en-US-Neural2-D", pitch: -3.0, rate: 0.85 },
  Prayer:       { name: "en-US-Neural2-D", pitch: -3.0, rate: 0.85 },
};

const GOOGLE_DEFAULT_VOICE: GoogleVoiceProfile = {
  name: "en-US-Neural2-D",
  pitch: 0,
  rate: 1.0,
};

export function getGoogleVoiceForRole(role: string): GoogleVoiceProfile {
  return GOOGLE_ROLE_VOICES[role] || GOOGLE_DEFAULT_VOICE;
}

/** Speak text using Google Cloud TTS (with retry for transient errors). */
export async function speakGoogleCloud(
  text: string,
  voiceName?: string,
  pitch?: number,
  speakingRate?: number
): Promise<void> {
  const MAX_RETRIES = 2;
  const RETRY_DELAYS = [500, 1500]; // ms backoff between retries
  const signal = getTTSAbortSignal();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Re-throw abort errors immediately — don't retry intentional cancellations
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    let resp: Response;
    try {
      resp = await fetchApi("/api/tts/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          voiceName: voiceName ?? GOOGLE_DEFAULT_VOICE.name,
          pitch: pitch ?? GOOGLE_DEFAULT_VOICE.pitch,
          speakingRate: speakingRate ?? GOOGLE_DEFAULT_VOICE.rate,
        }),
        signal,
      });
    } catch (fetchErr) {
      // Abort errors should not be retried
      if (fetchErr instanceof DOMException && fetchErr.name === "AbortError") {
        throw fetchErr;
      }
      // Network error — retry if we can
      if (attempt < MAX_RETRIES) {
        console.warn(
          `Google TTS network error, retrying in ${RETRY_DELAYS[attempt]}ms (attempt ${attempt + 1}/${MAX_RETRIES})...`
        );
        await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
        continue;
      }
      throw fetchErr;
    }

    if (resp.ok) {
      await playAudioBlob(await resp.blob());
      return;
    }

    // Retry on transient errors (429 rate limit, 500/503 server errors)
    const isRetryable = resp.status === 429 || resp.status >= 500;
    if (isRetryable && attempt < MAX_RETRIES) {
      console.warn(
        `Google TTS returned ${resp.status}, retrying in ${RETRY_DELAYS[attempt]}ms (attempt ${attempt + 1}/${MAX_RETRIES})...`
      );
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
      continue;
    }

    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error((err as { error?: string }).error || "Google Cloud TTS failed");
  }
}

/** Speak text as a Masonic officer role using Google Cloud TTS. */
export async function speakGoogleCloudAsRole(
  text: string,
  role: string
): Promise<void> {
  const profile = getGoogleVoiceForRole(role);
  return speakGoogleCloud(text, profile.name, profile.pitch, profile.rate);
}

// ============================================================
// Deepgram Aura-2
// ============================================================

/**
 * Deepgram Aura-2 voice model IDs for Masonic officer roles.
 * Uses distinct Aura-2 voices so each officer sounds different.
 */
const DEEPGRAM_ROLE_VOICES: Record<string, string> = {
  // Principal officers — deeper, authoritative
  WM:       "aura-2-zeus-en",     // Zeus — commanding, deep
  "W.M.":   "aura-2-zeus-en",
  "W. M.":  "aura-2-zeus-en",
  SW:       "aura-2-orion-en",    // Orion — clear, steady
  "S.W.":   "aura-2-orion-en",
  "S. W.":  "aura-2-orion-en",
  JW:       "aura-2-arcas-en",    // Arcas — measured
  "J.W.":   "aura-2-arcas-en",
  "J. W.":  "aura-2-arcas-en",
  // Deacons
  SD:       "aura-2-orpheus-en",  // Orpheus — warm
  "S.D.":   "aura-2-orpheus-en",
  "S. D.":  "aura-2-orpheus-en",
  JD:       "aura-2-apollo-en",  // Perseus — distinct
  "J.D.":   "aura-2-apollo-en",
  "J. D.":  "aura-2-apollo-en",
  "S(orJ)D":"aura-2-orpheus-en",
  "S/J D":  "aura-2-orpheus-en",
  // Other officers
  "S/Sec":  "aura-2-orion-en",
  Sec:      "aura-2-orion-en",
  "Sec.":   "aura-2-orion-en",
  S:        "aura-2-orion-en",
  Tr:       "aura-2-arcas-en",
  Treas:    "aura-2-arcas-en",
  "Treas.": "aura-2-arcas-en",
  Ch:       "aura-2-hermes-en",   // Helios — resonant
  Chap:     "aura-2-hermes-en",
  "Chap.":  "aura-2-hermes-en",
  Marshal:  "aura-2-orpheus-en",
  T:        "aura-2-atlas-en",    // Angus — distinctive accent
  Tyler:    "aura-2-atlas-en",
  Candidate:"aura-2-arcas-en",
  ALL:      "aura-2-zeus-en",
  All:      "aura-2-zeus-en",
  BR:       "aura-2-orpheus-en",
  Bro:      "aura-2-orpheus-en",
  "Bro.":   "aura-2-orpheus-en",
  "SW/WM":      "aura-2-zeus-en",
  // Additional role aliases from ritual files
  Trs:          "aura-2-arcas-en",
  "WM/Chaplain":"aura-2-hermes-en",
  Voucher:      "aura-2-orpheus-en",
  Vchr:         "aura-2-orpheus-en",
  Narrator:     "aura-2-orion-en",
  PRAYER:       "aura-2-hermes-en",
  Prayer:       "aura-2-hermes-en",
};

const DEEPGRAM_DEFAULT_VOICE = "aura-2-orion-en";

export function getDeepgramVoiceForRole(role: string): string {
  return DEEPGRAM_ROLE_VOICES[role] || DEEPGRAM_DEFAULT_VOICE;
}

/** Speak text using Deepgram Aura-2 (with retry for transient errors). */
export async function speakDeepgram(
  text: string,
  model?: string
): Promise<void> {
  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [400, 1000, 2000];
  const signal = getTTSAbortSignal();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Re-throw abort errors immediately — don't retry intentional cancellations
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    let resp: Response;
    try {
      resp = await fetchApi("/api/tts/deepgram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          model: model || DEEPGRAM_DEFAULT_VOICE,
        }),
        signal,
      });
    } catch (fetchErr) {
      // Abort errors should not be retried
      if (fetchErr instanceof DOMException && fetchErr.name === "AbortError") {
        throw fetchErr;
      }
      // Network error — retry if we can
      if (attempt < MAX_RETRIES) {
        console.warn(
          `Deepgram TTS network error, retrying in ${RETRY_DELAYS[attempt]}ms (attempt ${attempt + 1}/${MAX_RETRIES})...`
        );
        await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
        continue;
      }
      throw fetchErr;
    }

    if (resp.ok) {
      await playAudioBlob(await resp.blob());
      return;
    }

    // Retry on transient errors (429 rate limit, 500/503 server errors)
    const isRetryable = resp.status === 429 || resp.status >= 500;
    if (isRetryable && attempt < MAX_RETRIES) {
      console.warn(
        `Deepgram TTS returned ${resp.status}, retrying in ${RETRY_DELAYS[attempt]}ms (attempt ${attempt + 1}/${MAX_RETRIES})...`
      );
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
      continue;
    }

    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error((err as { error?: string }).error || "Deepgram TTS failed");
  }
}

/** Speak text as a Masonic officer role using Deepgram Aura-2. */
export async function speakDeepgramAsRole(
  text: string,
  role: string
): Promise<void> {
  return speakDeepgram(text, getDeepgramVoiceForRole(role));
}

// ============================================================
// Kokoro (self-hosted, free)
// ============================================================

/**
 * Kokoro voice IDs for Masonic officer roles.
 * Uses a mix of American and British voices for variety.
 */
const KOKORO_ROLE_VOICES: Record<string, { voice: string; speed: number }> = {
  // Principal officers — deeper, deliberate
  WM:       { voice: "bm_george",  speed: 0.90 },   // British male — authoritative
  "W.M.":   { voice: "bm_george",  speed: 0.90 },
  "W. M.":  { voice: "bm_george",  speed: 0.90 },
  SW:       { voice: "am_adam",    speed: 0.93 },   // American male — steady
  "S.W.":   { voice: "am_adam",    speed: 0.93 },
  "S. W.":  { voice: "am_adam",    speed: 0.93 },
  JW:       { voice: "am_michael", speed: 0.93 },   // American male — clear
  "J.W.":   { voice: "am_michael", speed: 0.93 },
  "J. W.":  { voice: "am_michael", speed: 0.93 },
  // Deacons
  SD:       { voice: "bm_daniel",  speed: 0.97 },   // British male — warm
  "S.D.":   { voice: "bm_daniel",  speed: 0.97 },
  "S. D.":  { voice: "bm_daniel",  speed: 0.97 },
  JD:       { voice: "bm_lewis",   speed: 0.97 },   // British male — distinct
  "J.D.":   { voice: "bm_lewis",   speed: 0.97 },
  "J. D.":  { voice: "bm_lewis",   speed: 0.97 },
  "S(orJ)D":{ voice: "bm_daniel",  speed: 0.97 },
  "S/J D":  { voice: "bm_daniel",  speed: 0.97 },
  // Other officers
  "S/Sec":  { voice: "am_adam",    speed: 1.0 },
  Sec:      { voice: "am_adam",    speed: 1.0 },
  "Sec.":   { voice: "am_adam",    speed: 1.0 },
  S:        { voice: "am_adam",    speed: 1.0 },
  Tr:       { voice: "am_michael", speed: 0.95 },
  Treas:    { voice: "am_michael", speed: 0.95 },
  "Treas.": { voice: "am_michael", speed: 0.95 },
  Ch:       { voice: "bm_george",  speed: 0.85 },   // Chaplain — slowest, deepest
  Chap:     { voice: "bm_george",  speed: 0.85 },
  "Chap.":  { voice: "bm_george",  speed: 0.85 },
  Marshal:  { voice: "bm_daniel",  speed: 0.95 },
  T:        { voice: "bm_lewis",   speed: 1.0 },
  Tyler:    { voice: "bm_lewis",   speed: 1.0 },
  Candidate:{ voice: "am_adam",    speed: 0.90 },
  ALL:      { voice: "bm_george",  speed: 0.88 },
  All:      { voice: "bm_george",  speed: 0.88 },
  BR:       { voice: "bm_daniel",  speed: 0.95 },
  Bro:      { voice: "bm_daniel",  speed: 0.95 },
  "Bro.":   { voice: "bm_daniel",  speed: 0.95 },
  "SW/WM":  { voice: "bm_george",  speed: 0.90 },
};

const KOKORO_DEFAULT_VOICE = { voice: "am_adam", speed: 1.0 };

export function getKokoroVoiceForRole(role: string): { voice: string; speed: number } {
  return KOKORO_ROLE_VOICES[role] || KOKORO_DEFAULT_VOICE;
}

/** Speak text using Kokoro TTS (with retry for transient errors). */
export async function speakKokoro(
  text: string,
  voice?: string,
  speed?: number
): Promise<void> {
  const MAX_RETRIES = 2;
  const RETRY_DELAYS = [500, 1500]; // ms backoff between retries
  const signal = getTTSAbortSignal();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Re-throw abort errors immediately — don't retry intentional cancellations
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    let resp: Response;
    try {
      resp = await fetchApi("/api/tts/kokoro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          voice: voice ?? KOKORO_DEFAULT_VOICE.voice,
          speed: speed ?? KOKORO_DEFAULT_VOICE.speed,
        }),
        signal,
      });
    } catch (fetchErr) {
      // Abort errors should not be retried
      if (fetchErr instanceof DOMException && fetchErr.name === "AbortError") {
        throw fetchErr;
      }
      // Network error — retry if we can
      if (attempt < MAX_RETRIES) {
        console.warn(
          `Kokoro TTS network error, retrying in ${RETRY_DELAYS[attempt]}ms (attempt ${attempt + 1}/${MAX_RETRIES})...`
        );
        await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
        continue;
      }
      throw fetchErr;
    }

    if (resp.ok) {
      await playAudioBlob(await resp.blob());
      return;
    }

    // Retry on transient errors (429 rate limit, 500/503 server errors)
    const isRetryable = resp.status === 429 || resp.status >= 500;
    if (isRetryable && attempt < MAX_RETRIES) {
      console.warn(
        `Kokoro TTS returned ${resp.status}, retrying in ${RETRY_DELAYS[attempt]}ms (attempt ${attempt + 1}/${MAX_RETRIES})...`
      );
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
      continue;
    }

    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error((err as { error?: string }).error || "Kokoro TTS failed");
  }
}

/** Speak text as a Masonic officer role using Kokoro TTS. */
export async function speakKokoroAsRole(
  text: string,
  role: string
): Promise<void> {
  const profile = getKokoroVoiceForRole(role);
  return speakKokoro(text, profile.voice, profile.speed);
}

// ============================================================
// Voxtral (Mistral)
// ============================================================

/**
 * Voxtral voice management with local voice storage.
 *
 * Voice recordings are stored in the browser's IndexedDB (see voice-storage.ts)
 * and sent as ref_audio with each TTS request for zero-shot voice cloning.
 * This works on Mistral's free tier — no paid plan needed.
 *
 * Local voices are loaded once per session and distributed across Masonic
 * officer role groups round-robin style.
 */

import { listVoices, type LocalVoice } from "./voice-storage";
import { ensureDefaultVoices } from "./default-voices";

/** Cached local voice profiles — loaded once per session from IndexedDB. */
let localVoicesCache: LocalVoice[] | null = null;
let localVoicesFetchPromise: Promise<LocalVoice[]> | null = null;
let defaultsEnsured = false;

/** Load and cache local voices from IndexedDB. Ensures the 15 default Voxtral
 *  voices are present in IndexedDB on first read so the Voxtral fallback
 *  always has something to play. Defaults ship UNASSIGNED — they sit in the
 *  pool for round-robin selection until the user assigns one to a role. */
async function getLocalVoices(): Promise<LocalVoice[]> {
  if (localVoicesCache) return localVoicesCache;
  if (localVoicesFetchPromise) return localVoicesFetchPromise;

  localVoicesFetchPromise = (async () => {
    try {
      if (!defaultsEnsured) {
        await ensureDefaultVoices();
        defaultsEnsured = true;
      }
      const voices = await listVoices();
      localVoicesCache = voices;
      return voices;
    } catch {
      localVoicesCache = [];
      return [];
    } finally {
      localVoicesFetchPromise = null;
    }
  })();

  return localVoicesFetchPromise;
}

/** Clear the local voices cache (call after recording a new voice or changing roles). */
export function clearVoxtralVoicesCache(): void {
  localVoicesCache = null;
  localVoicesFetchPromise = null;
}

/**
 * Role groupings for voice assignment. Roles in the same group share a voice.
 * Groups are ordered by priority — earlier groups get voice assignment first.
 */
const VOXTRAL_ROLE_GROUPS: string[][] = [
  // Group 0: Worshipful Master
  ["WM", "W.M.", "W. M.", "ALL", "All", "SW/WM", "WM/Chaplain"],
  // Group 1: Senior Warden
  ["SW", "S.W.", "S. W."],
  // Group 2: Junior Warden
  ["JW", "J.W.", "J. W."],
  // Group 3: Senior Deacon
  ["SD", "S.D.", "S. D.", "S(orJ)D", "S/J D"],
  // Group 4: Junior Deacon
  ["JD", "J.D.", "J. D."],
  // Group 5: Secretary
  ["S/Sec", "Sec", "Sec.", "S"],
  // Group 6: Chaplain / Prayer
  ["Ch", "Chap", "Chap.", "PRAYER", "Prayer"],
  // Group 7: Treasurer
  ["Tr", "Treas", "Treas.", "Trs"],
  // Group 8: Marshal / Tyler
  ["Marshal", "T", "Tyler"],
  // Group 9: Candidate / Brother
  ["Candidate", "C", "BR", "Bro", "Bro.", "Voucher", "Vchr"],
  // Group 10: Stewards
  ["Steward", "SS", "JS"],
  // Group 11: Narrator
  ["Narrator"],
];

/** Map a role to a group index (0-9). Returns -1 if not found. */
export function roleToGroup(role: string): number {
  for (let i = 0; i < VOXTRAL_ROLE_GROUPS.length; i++) {
    if (VOXTRAL_ROLE_GROUPS[i].includes(role)) return i;
  }
  return -1;
}

// Note: per-role audio caching was removed because the stale cache caused
// voice role assignments to be silently ignored. The overhead of checking
// voices.filter() per TTS call is negligible vs the ~1s API call itself.

/** Human-readable role labels for the voice assignment UI. */
export const VOXTRAL_ROLE_OPTIONS = [
  { value: "", label: "Auto (round-robin)" },
  { value: "WM", label: "Worshipful Master" },
  { value: "SW", label: "Senior Warden" },
  { value: "JW", label: "Junior Warden" },
  { value: "SD", label: "Senior Deacon" },
  { value: "JD", label: "Junior Deacon" },
  { value: "Sec", label: "Secretary" },
  { value: "Chap", label: "Chaplain" },
  { value: "Treas", label: "Treasurer" },
  { value: "Marshal", label: "Marshal / Tyler" },
  { value: "Steward", label: "Steward" },
  { value: "Candidate", label: "Candidate / Brother" },
  { value: "Narrator", label: "Narrator" },
];

/**
 * Get the ref_audio base64 string for a Masonic role.
 * First checks for voices with explicit role assignments, then falls back
 * to round-robin distribution of unassigned voices.
 * Caches per-group to avoid redundant IndexedDB reads.
 */
async function getRefAudioForRole(role: string): Promise<string | undefined> {
  const voice = await getAssignedVoiceForRole(role);
  return voice?.audioBase64;
}

/**
 * Same resolution logic as getRefAudioForRole but returns the full voice
 * record (including the stable `id`) so callers can thread it into the
 * TTS cache key. Returns undefined when no voices exist at all.
 *
 * The id is essential for caching — hashing the ~100KB base64 audio blob
 * per TTS call would be slow, and the voice id is a permanent handle
 * that survives across sessions.
 */
export async function getAssignedVoiceForRole(
  role: string,
): Promise<LocalVoice | undefined> {
  const group = roleToGroup(role);
  const groupKey = group >= 0 ? group : 0;

  const voices = await getLocalVoices();
  if (voices.length === 0) return undefined;

  // Check for a voice explicitly assigned to this role group. Every voice
  // in storage is now user-recorded (default voices were removed) so the
  // first match wins.
  const rolesInGroup = group >= 0 ? VOXTRAL_ROLE_GROUPS[group] : [];
  const assigned = voices.find(
    (v) => v.role && rolesInGroup.includes(v.role),
  );

  if (assigned) return assigned;

  // Fallback: round-robin from unassigned voices (or all if none unassigned)
  const unassigned = voices.filter((v) => !v.role);
  const pool = unassigned.length > 0 ? unassigned : voices;
  const idx = groupKey % pool.length;
  return pool[idx];
}

/** Check if any local voices exist (for pre-flight UI checks). */
export async function hasLocalVoices(): Promise<boolean> {
  const voices = await getLocalVoices();
  return voices.length > 0;
}

/**
 * Resolve a user-recorded Voxtral voice for a role, if one exists.
 * Returns the ref_audio base64 for the assigned clone, or undefined
 * otherwise. Used by speakAsRole() to let a Brother's own recording
 * override the current engine (e.g. Gemini) on a per-role basis.
 *
 * The legacy default-voice exclusion (createdAt > 0) is gone because the
 * default-voice system was removed. Every voice in storage is now a
 * deliberate user recording, so any role assignment is treated as an
 * explicit "play my clone here" signal regardless of the active engine.
 */
export async function getUserRecordedRefAudioForRole(
  role: string
): Promise<string | undefined> {
  const group = roleToGroup(role);
  if (group < 0) return undefined;
  const rolesInGroup = VOXTRAL_ROLE_GROUPS[group];
  const voices = await getLocalVoices();
  const match = voices.find(
    (v) => v.role && rolesInGroup.includes(v.role)
  );
  return match?.audioBase64;
}

/**
 * Synchronous-style probe: does any user-recorded voice claim this role?
 * Used by the preload panel to skip lines that would be overridden to
 * Voxtral (no point burning Gemini API credits on audio we'll never play).
 */
export async function hasUserRecordedVoiceForRole(
  role: string
): Promise<boolean> {
  return (await getUserRecordedRefAudioForRole(role)) !== undefined;
}

/**
 * Build the cache key for a Voxtral rendering. The discriminator is the
 * voice's stable `id` (assigned at record/import time by voice-storage),
 * NOT the refAudio base64 itself — hashing ~100KB base64 per call would
 * be slow, and the voice id is a permanent handle for the clone config.
 *
 * KEY_VERSION is namespaced separately from geminiCacheKey so the two
 * key spaces never collide and bumping one doesn't invalidate the other.
 */
async function voxtralCacheKey(
  text: string,
  voiceId: string,
): Promise<string> {
  const KEY_VERSION = "voxtral-v1";
  const material = `${KEY_VERSION}\x00${text}\x00${voiceId}`;
  const bytes = new TextEncoder().encode(material);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Speak text using Voxtral TTS (with retry for transient errors).
 *
 * When `voiceId` is provided, the rendering goes through the IndexedDB
 * audio cache — cache hits play instantly without hitting the API, cache
 * misses call the API and write the result back to cache. When voiceId
 * is absent (feedback/correction speech that picks any available voice),
 * the cache is bypassed entirely — those calls aren't stable enough to
 * cache against.
 */
export async function speakVoxtral(
  text: string,
  refAudio?: string,
  voiceId?: string,
): Promise<void> {
  // Cache lookup: only when we have a stable voiceId. The cache key
  // hashes (text, voiceId) so any change to the underlying voice record
  // (user re-records, replaces) surfaces as a new id and a fresh miss.
  if (voiceId) {
    const cacheKey = await voxtralCacheKey(text, voiceId);
    const hit = await getCachedAudio(cacheKey);
    if (hit) {
      await playAudioBlob(base64ToBlob(hit.audioBase64, hit.mimeType));
      return;
    }
  }

  // If no refAudio provided (e.g. feedback/correction speech), use the
  // first available local voice so the request doesn't fail silently.
  if (!refAudio) {
    const voices = await getLocalVoices();
    if (voices.length > 0) {
      refAudio = voices[0].audioBase64;
    }
  }

  const MAX_RETRIES = 2;
  const RETRY_DELAYS = [500, 1500];
  const signal = getTTSAbortSignal();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    let resp: Response;
    try {
      resp = await fetchApi("/api/tts/voxtral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          ...(refAudio ? { refAudio } : {}),
        }),
        signal,
      });
    } catch (fetchErr) {
      if (fetchErr instanceof DOMException && fetchErr.name === "AbortError") {
        throw fetchErr;
      }
      if (attempt < MAX_RETRIES) {
        console.warn(
          `Voxtral TTS network error, retrying in ${RETRY_DELAYS[attempt]}ms (attempt ${attempt + 1}/${MAX_RETRIES})...`
        );
        await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
        continue;
      }
      throw fetchErr;
    }

    if (resp.ok) {
      const blob = await resp.blob();

      // Fire-and-forget cache write (only when we had a voiceId). Playback
      // doesn't wait on the write — the audio starts immediately, and
      // subsequent calls for the same (text, voiceId) will hit cache.
      if (voiceId) {
        void (async () => {
          try {
            const cacheKey = await voxtralCacheKey(text, voiceId);
            const audioBase64 = await blobToBase64(blob);
            await putCachedAudio({
              key: cacheKey,
              mimeType: blob.type || "audio/wav",
              audioBase64,
              createdAt: Date.now(),
            });
          } catch {
            // Silent — cache is optimization, audio already played.
          }
        })();
      }

      await playAudioBlob(blob);
      return;
    }

    const isRetryable = resp.status === 429 || resp.status >= 500;
    if (isRetryable && attempt < MAX_RETRIES) {
      console.warn(
        `Voxtral TTS returned ${resp.status}, retrying in ${RETRY_DELAYS[attempt]}ms (attempt ${attempt + 1}/${MAX_RETRIES})...`
      );
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
      continue;
    }

    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error((err as { error?: string }).error || "Voxtral TTS failed");
  }
}

/**
 * Speak text as a Masonic officer role using Voxtral TTS. Threads the
 * assigned voice's stable id through to speakVoxtral so cache reads and
 * writes fire for rehearsal-mode playback.
 */
export async function speakVoxtralAsRole(
  text: string,
  role: string
): Promise<void> {
  const voice = await getAssignedVoiceForRole(role);
  const refAudio = voice?.audioBase64;
  return speakVoxtral(text, refAudio, voice?.id);
}

// ============================================================
// Gemini 3.1 Flash TTS
// ============================================================

import {
  AUDIO_CACHE_STORE as _AUDIO_CACHE_STORE_UNUSED, // keep import hint
  getCachedAudio,
  putCachedAudio,
} from "./voice-storage";
// unused re-export suppression — store name stays in voice-storage public API
void _AUDIO_CACHE_STORE_UNUSED;

/**
 * Default Masonic-role → Gemini-voice mapping. All male voices (Masonry
 * is a men's fraternity — female voices are never appropriate for these
 * roles). Concrete voice names from Google's published roster for
 * gemini-3.1-flash-tts-preview. Verified male via
 * https://docs.cloud.google.com/text-to-speech/docs/gemini-tts — prior
 * mapping accidentally used Kore, Zephyr, Aoede, Callirrhoe which are
 * all female voices. Fixed here.
 */
export const GEMINI_ROLE_VOICES: Record<string, string> = {
  WM: "Alnilam",         // firm and strong — authority of the Master
  SW: "Charon",          // calm and professional — principal officer
  JW: "Enceladus",       // deeper, weighted — the JW speaks with authority of station, not jovially
  SD: "Algenib",         // gravelly — carries orders about, masculine
  JD: "Orus",            // firm and decisive — gate-keeper role
  Sec: "Iapetus",        // clear and articulate — fits the record-keeper
  Trs: "Schedar",        // measured, steady — the treasurer's disposition
  Ch: "Achird",          // friendly and approachable — prayers land warm
  Marshal: "Fenrir",     // excitable and dynamic — the enforcer / Tyler
  Steward: "Rasalgethi", // distinctive male voice — attendant role
  Candidate: "Zubenelgenubi", // distinctive male — the new brother
  Narrator: "Enceladus", // breathy and soft — scene-setter voice
};

/** Get the default Gemini voice for a Masonic role, or a neutral fallback. */
export function getGeminiVoiceForRole(role: string): string {
  // Try exact match first, then try group-based resolution for alias roles.
  if (GEMINI_ROLE_VOICES[role]) return GEMINI_ROLE_VOICES[role];
  const group = roleToGroup(role);
  if (group >= 0) {
    // Roles-to-group order must stay in sync with VOXTRAL_ROLE_GROUPS.
    // Mirror of GEMINI_ROLE_VOICES by group index. All male voices.
    // Groups 0-11 correspond to VOXTRAL_ROLE_GROUPS ordering.
    const groupDefaults = [
      "Alnilam", "Charon", "Enceladus", "Algenib", "Orus",
      "Iapetus", "Achird", "Schedar", "Fenrir",
      "Zubenelgenubi", "Rasalgethi", "Enceladus",
    ];
    return groupDefaults[group] ?? "Kore";
  }
  return "Kore";
}

/**
 * Content-addressed cache key for Gemini audio output.
 *
 * KEY_VERSION prefix lets us invalidate the cache when the server audio
 * format changes without clearing IndexedDB. Bump on any server-side
 * change that affects bytes (PCM → WAV wrapping, codec change, etc.).
 *
 *   v1: initial release — raw PCM bytes served as audio/mpeg (broken —
 *       browser played as garbled/robotic audio without WAV header)
 *   v2: server wraps PCM in 44-byte WAV/RIFF header → audio/wav
 *   v3: client patches the WAV header sizes to match the actual blob
 *       length (fixes ERR_REQUEST_RANGE_NOT_SATISFIABLE on Chromium when
 *       the streaming sentinel dataSize 0x7FFFFFFE was cached as-is and
 *       the audio element tried to range-fetch beyond the blob's true end)
 *   v4: server reverted from streamGenerateContent to batch generateContent
 *       — the streaming + chunked-transfer combo broke blob playback in
 *       Chromium even with patched WAV headers. v3 cache entries had
 *       client-patched headers but the batch flow produces different
 *       byte layouts, so invalidate.
 *   v5: preview TTS models 404 on batch generateContent — only the
 *       streamGenerateContent endpoint is exposed for them. Server now
 *       buffers the SSE stream into a complete WAV and returns it as a
 *       normal Content-Length response. Client gets a clean blob.
 */
async function geminiCacheKey(
  text: string,
  style: string | undefined,
  voice: string
): Promise<string> {
  const KEY_VERSION = "v5";
  const material = `${KEY_VERSION}\x00${text}\x00${style ?? ""}\x00${voice}`;
  const bytes = new TextEncoder().encode(material);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function base64ToBlob(b64: string, mimeType: string): Blob {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}

/**
 * Server streams audio with a sentinel WAV dataSize (0x7FFFFFFE ~= 2 GB)
 * because the total length isn't known when the header is written. Once we
 * have the full blob client-side, rewrite the RIFF chunk size (offset 4)
 * and data chunk size (offset 40) to the real byte counts. Without this
 * fix, browsers parse the inflated dataSize, issue Range requests beyond
 * the actual blob length, and fail with ERR_REQUEST_RANGE_NOT_SATISFIABLE
 * — observed on Chromium playback of blob: URLs.
 *
 * Safe no-op for non-WAV blobs (other engines, unknown formats).
 */
async function patchStreamingWavSize(blob: Blob): Promise<Blob> {
  const buffer = await blob.arrayBuffer();
  const totalBytes = buffer.byteLength;
  if (totalBytes < 44) return blob;

  const view = new DataView(buffer);
  // 0x52494646 = "RIFF" (big-endian read of magic bytes)
  // 0x57415645 = "WAVE"
  if (view.getUint32(0, false) !== 0x52494646) return blob;
  if (view.getUint32(8, false) !== 0x57415645) return blob;

  const dataSize = totalBytes - 44;
  const patched = new ArrayBuffer(totalBytes);
  new Uint8Array(patched).set(new Uint8Array(buffer));
  const pView = new DataView(patched);
  pView.setUint32(4, totalBytes - 8, true);  // RIFF chunk size
  pView.setUint32(40, dataSize, true);       // data chunk size

  return new Blob([patched], { type: blob.type || "audio/wav" });
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/**
 * Speak text using Google Gemini 3.1 Flash TTS.
 *
 * Per eng-review decisions:
 *   - 1A: Client-side IndexedDB cache (getCachedAudio / putCachedAudio)
 *   - 2A + 13A: Caller is responsible for Voxtral fallback + error banner UX
 *     on style-tagged lines. This function throws on failure; RehearsalMode
 *     catches and decides.
 *   - 3A: Server concatenates [style] text. Client sends separate params.
 */
export async function speakGemini(
  text: string,
  options: { style?: string; voice?: string; embeddedAudio?: string; role?: string } = {}
): Promise<void> {
  const voice = options.voice ?? "Kore";

  // Embedded-audio short-circuit: if the .mram had audio baked in for
  // this line at build time (v3+ format), play those bytes directly.
  // Zero API call, zero network roundtrip, instant playback. The audio
  // was rendered with a specific (voice, style) combo at build time —
  // callers only pass embeddedAudio when that combo still matches what
  // we're speaking now (see speakGeminiAsRole voice-cast match check).
  if (options.embeddedAudio) {
    await playAudioBlob(base64ToBlob(options.embeddedAudio, "audio/ogg"));
    return;
  }

  const cacheKey = await geminiCacheKey(text, options.style, voice);

  // Cache hit: play from IndexedDB, no network call.
  const hit = await getCachedAudio(cacheKey);
  if (hit) {
    await playAudioBlob(base64ToBlob(hit.audioBase64, hit.mimeType));
    return;
  }

  const signal = getTTSAbortSignal();
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");

  // Observability: baked audio is missing AND cache is cold, so we're
  // about to hit the live /api/tts/gemini route. That's a bake gap.
  // Users won't see anything (playback still proceeds), but you'll see
  // these in devtools when debugging why a user had latency spikes.
  console.warn("[tts-gap]", {
    role: options.role ?? null,
    voice,
    style: options.style ?? null,
    textPreview: text.slice(0, 60),
    reason: "no-baked-audio",
  });

  // Retry transient failures (429 rate-limit, 5xx). Mirrors the Voxtral
  // route's retry policy. Prevents mid-ritual fallback when Gemini
  // briefly throttles.
  const MAX_RETRIES = 2;
  const RETRY_DELAYS = [500, 1500];
  let resp: Response | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    try {
      resp = await fetchApi("/api/tts/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, style: options.style, voice }),
        signal,
      });
    } catch (fetchErr) {
      if (fetchErr instanceof DOMException && fetchErr.name === "AbortError") {
        throw fetchErr;
      }
      if (attempt < MAX_RETRIES) {
        console.warn(
          `Gemini TTS network error, retrying in ${RETRY_DELAYS[attempt]}ms (attempt ${attempt + 1}/${MAX_RETRIES})...`
        );
        await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
        continue;
      }
      throw fetchErr;
    }

    if (resp.ok) break;

    const isRetryable = resp.status === 429 || resp.status >= 500;
    if (isRetryable && attempt < MAX_RETRIES) {
      console.warn(
        `Gemini TTS returned ${resp.status}, retrying in ${RETRY_DELAYS[attempt]}ms (attempt ${attempt + 1}/${MAX_RETRIES})...`
      );
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
      continue;
    }

    const err = await resp.json().catch(() => ({ error: resp!.statusText }));
    throw new Error((err as { error?: string }).error || `Gemini TTS ${resp.status}`);
  }

  if (!resp || !resp.ok) {
    throw new Error("Gemini TTS failed after retries");
  }

  const rawBlob = await resp.blob();
  const blob = await patchStreamingWavSize(rawBlob);

  // Cache before playback so a re-request during the same rehearsal hits.
  // Fire-and-forget: the playback doesn't wait on the write.
  void (async () => {
    try {
      const audioBase64 = await blobToBase64(blob);
      await putCachedAudio({
        key: cacheKey,
        mimeType: blob.type || "audio/wav",
        audioBase64,
        createdAt: Date.now(),
      });
    } catch {
      // Silent — cache is optimization, audio already played.
    }
  })();

  await playAudioBlob(blob);
}

/** Speak text as a Masonic officer role using Gemini TTS with optional style. */
export async function speakGeminiAsRole(
  text: string,
  role: string,
  style?: string,
  embeddedAudio?: string,
): Promise<void> {
  return speakGemini(text, {
    voice: getGeminiVoiceForRole(role),
    style,
    embeddedAudio,
    role,
  });
}

/**
 * Prefetch and cache a single Gemini TTS rendering without playing it.
 * Cache hit: returns immediately. Cache miss: fetches, caches, returns.
 * Errors are swallowed — prefetch is best-effort; a failed prefetch just
 * means the user eats the cold-cache latency on that line.
 */
export async function prefetchGeminiLine(
  text: string,
  role: string,
  style?: string
): Promise<"hit" | "fetched" | "error"> {
  const voice = getGeminiVoiceForRole(role);
  const cacheKey = await geminiCacheKey(text, style, voice);

  const hit = await getCachedAudio(cacheKey);
  if (hit) return "hit";

  try {
    const resp = await fetchApi("/api/tts/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, style, voice }),
    });
    if (!resp.ok) return "error";
    const rawBlob = await resp.blob();
    const blob = await patchStreamingWavSize(rawBlob);
    const audioBase64 = await blobToBase64(blob);
    await putCachedAudio({
      key: cacheKey,
      mimeType: blob.type || "audio/wav",
      audioBase64,
      createdAt: Date.now(),
    });
    return "fetched";
  } catch {
    return "error";
  }
}

/**
 * Count how many spoken lines are already cached in IndexedDB. Lets the
 * preload panel show accurate state on mount (the cache is persistent
 * across React component lifecycles and mode switches, but the panel's
 * local useState is not). Skips lines without a speaker or empty text,
 * matching preloadGeminiRitual's own skip rules.
 */
export async function countCachedGeminiLines(
  lines: { text: string; role: string | null; style?: string }[]
): Promise<{ cached: number; total: number }> {
  let cached = 0;
  let total = 0;
  for (const line of lines) {
    if (!line.role || !line.text.trim()) continue;
    // Skip roles that will be played via a user-recorded Voxtral clone
    // — Gemini audio for those roles is never used.
    if (await hasUserRecordedVoiceForRole(line.role)) continue;
    total++;
    const voice = getGeminiVoiceForRole(line.role);
    const key = await geminiCacheKey(line.text, line.style, voice);
    const hit = await getCachedAudio(key);
    if (hit) cached++;
  }
  return { cached, total };
}

/**
 * Progress callback for batch prefetch. Called after each line finishes.
 */
export interface PrefetchProgress {
  index: number;
  total: number;
  result: "hit" | "fetched" | "error" | "skipped";
  aborted?: boolean;
}

/**
 * Preload Gemini audio for an entire ritual. Iterates lines serially
 * with a small delay between fetches to respect the paid-tier rate
 * limits. Cache hits are free and fast; only uncached lines actually
 * hit the network.
 *
 * Returns a controller that callers can abort() to stop the preload
 * (e.g. when the user starts rehearsing before the preload finishes).
 */
export function preloadGeminiRitual(
  lines: { text: string; role: string | null; style?: string }[],
  onProgress?: (p: PrefetchProgress) => void,
  delayMs: number = 250
): { abort: () => void; done: Promise<void> } {
  let aborted = false;
  const abort = () => {
    aborted = true;
  };

  const done = (async () => {
    for (let i = 0; i < lines.length; i++) {
      if (aborted) {
        onProgress?.({ index: i, total: lines.length, result: "skipped", aborted: true });
        return;
      }
      const line = lines[i];
      if (!line.role || !line.text.trim()) {
        onProgress?.({ index: i, total: lines.length, result: "skipped" });
        continue;
      }
      const result = await prefetchGeminiLine(line.text, line.role, line.style);
      onProgress?.({ index: i, total: lines.length, result });
      if (result === "fetched" && i < lines.length - 1) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  })();

  return { abort, done };
}

// ============================================================
// Voxtral prefetch — for custom voices assigned to roles
// ============================================================

/**
 * Prefetch and cache a single Voxtral rendering without playing it.
 * Mirrors prefetchGeminiLine: cache hit returns immediately, cache miss
 * fetches + caches. Errors are swallowed — prefetch is best-effort.
 */
export async function prefetchVoxtralLine(
  text: string,
  voiceId: string,
  refAudio: string,
): Promise<"hit" | "fetched" | "error"> {
  const cacheKey = await voxtralCacheKey(text, voiceId);

  const hit = await getCachedAudio(cacheKey);
  if (hit) return "hit";

  try {
    const resp = await fetchApi("/api/tts/voxtral", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, refAudio }),
    });
    if (!resp.ok) return "error";
    const blob = await resp.blob();
    const audioBase64 = await blobToBase64(blob);
    await putCachedAudio({
      key: cacheKey,
      mimeType: blob.type || "audio/wav",
      audioBase64,
      createdAt: Date.now(),
    });
    return "fetched";
  } catch {
    return "error";
  }
}

/**
 * Preload Voxtral audio for every line assigned to a given role, across
 * every loaded ritual. Lines are rendered in ceremony order (by
 * `line.order`) so the first lines the Brother will hear cache first —
 * eliminating the "rush path" where a user assigns a voice and
 * immediately starts rehearsing before prefetch completes.
 *
 * Serial with a small inter-request delay to respect Voxtral's per-IP
 * rate limits. A 150-line role takes roughly 2-4 minutes wall clock;
 * rehearsal normally reaches a specific role's first line well after
 * that window, so by the time the user gets there, cache is hot.
 *
 * Returns a controller mirroring preloadGeminiRitual. Callers can abort
 * if the user reassigns the role or leaves the Voices page.
 */
export function preloadVoxtralForRole(
  lines: { text: string; order: number }[],
  voiceId: string,
  refAudio: string,
  onProgress?: (p: PrefetchProgress) => void,
  delayMs: number = 300,
): { abort: () => void; done: Promise<void> } {
  let aborted = false;
  const abort = () => {
    aborted = true;
  };

  // Sort a copy so callers don't see side-effects on their input array.
  // Ceremony order matters: render line 1 before line 50 so the rush
  // path can only lose one line at worst (see README / BAKE-WORKFLOW).
  const ordered = [...lines].sort((a, b) => a.order - b.order);
  const total = ordered.length;

  const done = (async () => {
    for (let i = 0; i < total; i++) {
      if (aborted) {
        onProgress?.({ index: i, total, result: "skipped", aborted: true });
        return;
      }
      const line = ordered[i];
      if (!line.text.trim()) {
        onProgress?.({ index: i, total, result: "skipped" });
        continue;
      }
      const result = await prefetchVoxtralLine(line.text, voiceId, refAudio);
      onProgress?.({ index: i, total, result });
      if (result === "fetched" && i < total - 1) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  })();

  return { abort, done };
}

// ============================================================
// Engine availability
// ============================================================

/** Check which cloud TTS engines are configured on the server. */
export async function fetchEngineAvailability(): Promise<{
  elevenlabs: boolean;
  google: boolean;
  deepgram: boolean;
  kokoro: boolean;
  voxtral: boolean;
  gemini: boolean;
}> {
  const empty = { elevenlabs: false, google: false, deepgram: false, kokoro: false, voxtral: false, gemini: false };
  try {
    const resp = await fetchApi("/api/tts/engines");
    if (!resp.ok) return empty;
    return resp.json();
  } catch {
    return empty;
  }
}
