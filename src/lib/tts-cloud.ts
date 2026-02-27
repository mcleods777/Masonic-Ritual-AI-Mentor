/**
 * Cloud TTS engines — ElevenLabs, Google Cloud, Deepgram Aura-2, and Kokoro.
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

/** Stop whatever cloud audio is currently playing. */
export function stopCloudAudio(): void {
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
  // Principal officers
  WM:       "pNInz6obpgDQGcFmaJgB", // Adam — deep, authoritative
  "W.M.":   "pNInz6obpgDQGcFmaJgB",
  "W. M.":  "pNInz6obpgDQGcFmaJgB",
  SW:       "TxGEqnHWrfWFTfGW9XjX", // Josh — clear, measured
  "S.W.":   "TxGEqnHWrfWFTfGW9XjX",
  "S. W.":  "TxGEqnHWrfWFTfGW9XjX",
  JW:       "VR6AewLTigWG4xSOukaG", // Arnold — crisp
  "J.W.":   "VR6AewLTigWG4xSOukaG",
  "J. W.":  "VR6AewLTigWG4xSOukaG",
  // Deacons
  SD:       "ErXwobaYiN019PkySvjV", // Antoni — warm
  "S.D.":   "ErXwobaYiN019PkySvjV",
  "S. D.":  "ErXwobaYiN019PkySvjV",
  JD:       "yoZ06aMxZJJ28mfd3POQ", // Sam — raspy
  "J.D.":   "yoZ06aMxZJJ28mfd3POQ",
  "J. D.":  "yoZ06aMxZJJ28mfd3POQ",
  "S(orJ)D":"ErXwobaYiN019PkySvjV",
  "S/J D":  "ErXwobaYiN019PkySvjV",
  // Other officers
  "S/Sec":  "TxGEqnHWrfWFTfGW9XjX",
  Sec:      "TxGEqnHWrfWFTfGW9XjX",
  "Sec.":   "TxGEqnHWrfWFTfGW9XjX",
  S:        "TxGEqnHWrfWFTfGW9XjX",
  Tr:       "VR6AewLTigWG4xSOukaG",
  Treas:    "VR6AewLTigWG4xSOukaG",
  "Treas.": "VR6AewLTigWG4xSOukaG",
  Ch:       "pNInz6obpgDQGcFmaJgB",
  Chap:     "pNInz6obpgDQGcFmaJgB",
  "Chap.":  "pNInz6obpgDQGcFmaJgB",
  Marshal:  "ErXwobaYiN019PkySvjV",
  T:        "yoZ06aMxZJJ28mfd3POQ",
  Tyler:    "yoZ06aMxZJJ28mfd3POQ",
  Candidate:"VR6AewLTigWG4xSOukaG",
  ALL:      "pNInz6obpgDQGcFmaJgB",
  All:      "pNInz6obpgDQGcFmaJgB",
  BR:       "ErXwobaYiN019PkySvjV",
  Bro:      "ErXwobaYiN019PkySvjV",
  "Bro.":   "ErXwobaYiN019PkySvjV",
  "SW/WM":  "pNInz6obpgDQGcFmaJgB",
};

const ELEVENLABS_DEFAULT_VOICE = "pNInz6obpgDQGcFmaJgB"; // Adam

export function getElevenLabsVoiceForRole(role: string): string {
  return ELEVENLABS_ROLE_VOICES[role] || ELEVENLABS_DEFAULT_VOICE;
}

/** Speak text using ElevenLabs. */
export async function speakElevenLabs(
  text: string,
  voiceId?: string
): Promise<void> {
  const resp = await fetch("/api/tts/elevenlabs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      voiceId: voiceId || ELEVENLABS_DEFAULT_VOICE,
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error((err as { error?: string }).error || "ElevenLabs TTS failed");
  }

  await playAudioBlob(await resp.blob());
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
  "SW/WM":  { name: "en-US-Neural2-D", pitch: -1.5, rate: 0.90 },
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

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const resp = await fetch("/api/tts/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        voiceName: voiceName ?? GOOGLE_DEFAULT_VOICE.name,
        pitch: pitch ?? GOOGLE_DEFAULT_VOICE.pitch,
        speakingRate: speakingRate ?? GOOGLE_DEFAULT_VOICE.rate,
      }),
    });

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
  "SW/WM":  "aura-2-zeus-en",
};

const DEEPGRAM_DEFAULT_VOICE = "aura-2-orion-en";

export function getDeepgramVoiceForRole(role: string): string {
  return DEEPGRAM_ROLE_VOICES[role] || DEEPGRAM_DEFAULT_VOICE;
}

/** Speak text using Deepgram Aura-2. */
export async function speakDeepgram(
  text: string,
  model?: string
): Promise<void> {
  const resp = await fetch("/api/tts/deepgram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      model: model || DEEPGRAM_DEFAULT_VOICE,
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error((err as { error?: string }).error || "Deepgram TTS failed");
  }

  await playAudioBlob(await resp.blob());
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

/** Speak text using Kokoro TTS. */
export async function speakKokoro(
  text: string,
  voice?: string,
  speed?: number
): Promise<void> {
  const resp = await fetch("/api/tts/kokoro", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      voice: voice ?? KOKORO_DEFAULT_VOICE.voice,
      speed: speed ?? KOKORO_DEFAULT_VOICE.speed,
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error((err as { error?: string }).error || "Kokoro TTS failed");
  }

  await playAudioBlob(await resp.blob());
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
// Engine availability
// ============================================================

/** Check which cloud TTS engines are configured on the server. */
export async function fetchEngineAvailability(): Promise<{
  elevenlabs: boolean;
  google: boolean;
  deepgram: boolean;
  kokoro: boolean;
}> {
  try {
    const resp = await fetch("/api/tts/engines");
    if (!resp.ok) return { elevenlabs: false, google: false, deepgram: false, kokoro: false };
    return resp.json();
  } catch {
    return { elevenlabs: false, google: false, deepgram: false, kokoro: false };
  }
}
