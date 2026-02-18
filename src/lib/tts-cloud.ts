/**
 * Cloud TTS engines — ElevenLabs and Google Cloud Text-to-Speech.
 *
 * Each engine calls its corresponding Next.js API route (which holds
 * the secret API key) and plays back the returned audio via an
 * HTMLAudioElement.
 */

// ============================================================
// Shared audio player
// ============================================================

let currentAudio: HTMLAudioElement | null = null;

/** Play an audio blob and resolve when it finishes. */
export function playAudioBlob(blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    stopCloudAudio();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio = audio;

    audio.onended = () => {
      URL.revokeObjectURL(url);
      currentAudio = null;
      resolve();
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      currentAudio = null;
      reject(new Error("Cloud TTS audio playback failed"));
    };

    audio.play().catch((err) => {
      URL.revokeObjectURL(url);
      currentAudio = null;
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
// Engine availability
// ============================================================

/** Check which cloud TTS engines are configured on the server. */
export async function fetchEngineAvailability(): Promise<{
  elevenlabs: boolean;
  google: boolean;
}> {
  try {
    const resp = await fetch("/api/tts/engines");
    if (!resp.ok) return { elevenlabs: false, google: false };
    return resp.json();
  } catch {
    return { elevenlabs: false, google: false };
  }
}
