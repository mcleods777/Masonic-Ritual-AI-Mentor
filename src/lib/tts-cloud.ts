/**
 * Cloud TTS engines — ElevenLabs, Google Cloud, Deepgram Aura-2, Kokoro, and Voxtral.
 *
 * Each engine calls its corresponding Next.js API route (which holds
 * the secret API key) and plays back the returned audio via an
 * HTMLAudioElement.
 */

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
      resp = await fetch("/api/tts/elevenlabs", {
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
      resp = await fetch("/api/tts/google", {
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
  JD:       "aura-2-perseus-en",  // Perseus — distinct
  "J.D.":   "aura-2-perseus-en",
  "J. D.":  "aura-2-perseus-en",
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
  Ch:       "aura-2-helios-en",   // Helios — resonant
  Chap:     "aura-2-helios-en",
  "Chap.":  "aura-2-helios-en",
  Marshal:  "aura-2-orpheus-en",
  T:        "aura-2-angus-en",    // Angus — distinctive accent
  Tyler:    "aura-2-angus-en",
  Candidate:"aura-2-arcas-en",
  ALL:      "aura-2-zeus-en",
  All:      "aura-2-zeus-en",
  BR:       "aura-2-orpheus-en",
  Bro:      "aura-2-orpheus-en",
  "Bro.":   "aura-2-orpheus-en",
  "SW/WM":      "aura-2-zeus-en",
  // Additional role aliases from ritual files
  Trs:          "aura-2-arcas-en",
  "WM/Chaplain":"aura-2-helios-en",
  Voucher:      "aura-2-orpheus-en",
  Vchr:         "aura-2-orpheus-en",
  Narrator:     "aura-2-orion-en",
  PRAYER:       "aura-2-helios-en",
  Prayer:       "aura-2-helios-en",
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
      resp = await fetch("/api/tts/deepgram", {
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
      resp = await fetch("/api/tts/kokoro", {
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
 * Voxtral voice management.
 *
 * The Mistral cloud API requires either a voice_id (UUID from the Voices API)
 * or ref_audio (base64 audio for one-off cloning). Preset names like
 * "casual_male" only work with self-hosted vLLM deployments.
 *
 * On first use we fetch saved voice profiles from /api/tts/voxtral/voices
 * and cache them. Each Masonic role is assigned to a voice by name pattern
 * matching, with round-robin distribution when fewer voices exist than roles.
 */

interface VoxtralVoice {
  id: string;
  name: string;
  gender?: string;
}

/** Cached voice profiles — fetched once per session. */
let voxtralVoicesCache: VoxtralVoice[] | null = null;
let voxtralVoicesFetchPromise: Promise<VoxtralVoice[]> | null = null;

/** Fetch and cache Voxtral voice profiles from the server. */
async function getVoxtralVoices(): Promise<VoxtralVoice[]> {
  if (voxtralVoicesCache) return voxtralVoicesCache;
  if (voxtralVoicesFetchPromise) return voxtralVoicesFetchPromise;

  voxtralVoicesFetchPromise = (async () => {
    try {
      const resp = await fetch("/api/tts/voxtral/voices");
      if (!resp.ok) return [];
      const data = (await resp.json()) as { voices: VoxtralVoice[] };
      voxtralVoicesCache = data.voices || [];
      return voxtralVoicesCache;
    } catch {
      return [];
    } finally {
      voxtralVoicesFetchPromise = null;
    }
  })();

  return voxtralVoicesFetchPromise;
}

/** Clear the voices cache (e.g. after creating new voices). */
export function clearVoxtralVoicesCache(): void {
  voxtralVoicesCache = null;
  voxtralVoicesFetchPromise = null;
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
  // Group 9: Candidate / Brother / Narrator
  ["Candidate", "BR", "Bro", "Bro.", "Voucher", "Vchr", "Narrator"],
];

/** Map a role to a group index (0-9). Returns -1 if not found. */
function roleToGroup(role: string): number {
  for (let i = 0; i < VOXTRAL_ROLE_GROUPS.length; i++) {
    if (VOXTRAL_ROLE_GROUPS[i].includes(role)) return i;
  }
  return -1;
}

/**
 * Get the voice UUID for a Masonic role.
 * Distributes available voices across role groups round-robin style.
 * Returns undefined if no voices are available.
 */
async function getVoxtralVoiceForRole(role: string): Promise<string | undefined> {
  const voices = await getVoxtralVoices();
  if (voices.length === 0) return undefined;

  const group = roleToGroup(role);
  const idx = group >= 0 ? group % voices.length : 0;
  return voices[idx].id;
}

/** Speak text using Voxtral TTS (with retry for transient errors). */
export async function speakVoxtral(
  text: string,
  voiceId?: string
): Promise<void> {
  const MAX_RETRIES = 2;
  const RETRY_DELAYS = [500, 1500];
  const signal = getTTSAbortSignal();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    let resp: Response;
    try {
      resp = await fetch("/api/tts/voxtral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          // Pass voiceId only if we have one — the server will attempt
          // to find a saved voice if neither voiceId nor refAudio is set
          ...(voiceId ? { voiceId } : {}),
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
      await playAudioBlob(await resp.blob());
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

/** Speak text as a Masonic officer role using Voxtral TTS. */
export async function speakVoxtralAsRole(
  text: string,
  role: string
): Promise<void> {
  const voiceId = await getVoxtralVoiceForRole(role);
  return speakVoxtral(text, voiceId);
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
}> {
  try {
    const resp = await fetch("/api/tts/engines");
    if (!resp.ok) return { elevenlabs: false, google: false, deepgram: false, kokoro: false, voxtral: false };
    return resp.json();
  } catch {
    return { elevenlabs: false, google: false, deepgram: false, kokoro: false, voxtral: false };
  }
}
