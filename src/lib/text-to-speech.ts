/**
 * Text-to-speech — multi-engine support.
 *
 * Three engines:
 *   1. "browser"     — Web Speech Synthesis API (free, works offline)
 *   2. "elevenlabs"  — ElevenLabs cloud API (high-quality)
 *   3. "google-cloud" — Google Cloud TTS Neural2 (high-quality)
 *
 * The public API (speak, speakAsRole, stopSpeaking, etc.) stays the same.
 * Components don't need to know which engine is active — they just call
 * these functions and the current engine handles playback.
 */

import {
  speakElevenLabs,
  speakElevenLabsAsRole,
  speakGoogleCloud,
  speakGoogleCloudAsRole,
  stopCloudAudio,
  isCloudAudioPlaying,
} from "./tts-cloud";

// ============================================================
// Engine selection
// ============================================================

export type TTSEngineName = "browser" | "elevenlabs" | "google-cloud";

const TTS_ENGINE_STORAGE_KEY = "tts-engine";

let currentEngine: TTSEngineName = "browser";

// Restore persisted engine on module load (client only)
if (typeof window !== "undefined") {
  const stored = localStorage.getItem(TTS_ENGINE_STORAGE_KEY);
  if (stored === "elevenlabs" || stored === "google-cloud") {
    currentEngine = stored;
  }
}

/** Get the currently active TTS engine. */
export function getTTSEngine(): TTSEngineName {
  return currentEngine;
}

/** Set the active TTS engine. Persists to localStorage. */
export function setTTSEngine(engine: TTSEngineName): void {
  currentEngine = engine;
  if (typeof window !== "undefined") {
    localStorage.setItem(TTS_ENGINE_STORAGE_KEY, engine);
  }
}

// ============================================================
// Types (unchanged)
// ============================================================

export interface TTSOptions {
  rate?: number; // 0.1 - 10 (default 0.9 for ritual — slightly slow and clear)
  pitch?: number; // 0 - 2 (default 1)
  volume?: number; // 0 - 1 (default 1)
  voiceName?: string; // Specific voice name to use
}

const DEFAULT_OPTIONS: TTSOptions = {
  rate: 0.9,
  pitch: 1,
  volume: 1,
};

// ============================================================
// Role-based voice profiles (for the browser engine)
// ============================================================

/** Voice profile for a specific officer role */
export interface RoleVoiceProfile {
  pitch: number;
  rate: number;
  voiceName?: string;
}

/**
 * Default voice profiles per role — pitch and rate vary to distinguish speakers.
 * Pitch range: 0.7 (deep) to 1.3 (higher).
 * Rate range: 0.8 (slow/formal) to 1.0 (normal).
 */
const ROLE_VOICE_PROFILES: Record<string, RoleVoiceProfile> = {
  // Principal officers — deeper, more deliberate
  WM:        { pitch: 0.75, rate: 0.82 },
  'W.M.':    { pitch: 0.75, rate: 0.82 },
  'W. M.':   { pitch: 0.75, rate: 0.82 },
  SW:        { pitch: 0.88, rate: 0.87 },
  'S.W.':    { pitch: 0.88, rate: 0.87 },
  'S. W.':   { pitch: 0.88, rate: 0.87 },
  JW:        { pitch: 1.0,  rate: 0.87 },
  'J.W.':    { pitch: 1.0,  rate: 0.87 },
  'J. W.':   { pitch: 1.0,  rate: 0.87 },
  // Deacons — slightly higher, a bit quicker
  SD:        { pitch: 1.05, rate: 0.92 },
  'S.D.':    { pitch: 1.05, rate: 0.92 },
  'S. D.':   { pitch: 1.05, rate: 0.92 },
  JD:        { pitch: 1.15, rate: 0.92 },
  'J.D.':    { pitch: 1.15, rate: 0.92 },
  'J. D.':   { pitch: 1.15, rate: 0.92 },
  'S(orJ)D': { pitch: 1.1,  rate: 0.92 },
  'S/J D':   { pitch: 1.1,  rate: 0.92 },
  // Other officers
  'S/Sec':   { pitch: 0.95, rate: 0.95 },
  Sec:       { pitch: 0.95, rate: 0.95 },
  'Sec.':    { pitch: 0.95, rate: 0.95 },
  S:         { pitch: 0.95, rate: 0.95 },
  Tr:        { pitch: 0.92, rate: 0.90 },
  Treas:     { pitch: 0.92, rate: 0.90 },
  'Treas.':  { pitch: 0.92, rate: 0.90 },
  Ch:        { pitch: 0.80, rate: 0.78 },
  Chap:      { pitch: 0.80, rate: 0.78 },
  'Chap.':   { pitch: 0.80, rate: 0.78 },
  Marshal:   { pitch: 1.0,  rate: 0.90 },
  T:         { pitch: 1.20, rate: 0.90 },
  Tyler:     { pitch: 1.20, rate: 0.90 },
  Candidate: { pitch: 1.10, rate: 0.85 },
  // Group/other
  ALL:       { pitch: 0.95, rate: 0.80 },
  All:       { pitch: 0.95, rate: 0.80 },
  BR:        { pitch: 1.08, rate: 0.90 },
  Bro:       { pitch: 1.08, rate: 0.90 },
  'Bro.':    { pitch: 1.08, rate: 0.90 },
  'SW/WM':   { pitch: 0.82, rate: 0.85 },
};

/**
 * Get the voice profile for a given role.
 * Falls back to neutral defaults if the role isn't mapped.
 */
export function getVoiceForRole(role: string): RoleVoiceProfile {
  return ROLE_VOICE_PROFILES[role] || { pitch: 1.0, rate: 0.9 };
}

/**
 * Assign distinct voices from the available voice list to each role.
 * Spreads voices across roles for maximum variety.
 * (Only meaningful for the "browser" engine.)
 */
export function assignVoicesToRoles(roles: string[]): Map<string, RoleVoiceProfile> {
  const voices = getVoices();
  const map = new Map<string, RoleVoiceProfile>();

  for (let i = 0; i < roles.length; i++) {
    const role = roles[i];
    const profile = getVoiceForRole(role);

    // Spread available voices across roles
    if (voices.length > 0) {
      const voiceIndex = i % voices.length;
      map.set(role, { ...profile, voiceName: voices[voiceIndex].name });
    } else {
      map.set(role, profile);
    }
  }

  return map;
}

// ============================================================
// Browser Web Speech helpers
// ============================================================

/** Whether the native Web Speech Synthesis API is present. */
function isWebSpeechPresent(): boolean {
  if (typeof window === "undefined") return false;
  return "speechSynthesis" in window;
}

/**
 * Get available browser voices, preferring English voices
 */
export function getVoices(): SpeechSynthesisVoice[] {
  if (!isWebSpeechPresent()) return [];
  return speechSynthesis
    .getVoices()
    .filter((v) => v.lang.startsWith("en"))
    .sort((a, b) => {
      // Prefer local voices over remote for lower latency
      if (a.localService && !b.localService) return -1;
      if (!a.localService && b.localService) return 1;
      return a.name.localeCompare(b.name);
    });
}

/**
 * Pick the best default browser voice
 */
function getBestVoice(preferredName?: string): SpeechSynthesisVoice | null {
  const voices = getVoices();
  if (voices.length === 0) return null;

  if (preferredName) {
    const preferred = voices.find((v) => v.name === preferredName);
    if (preferred) return preferred;
  }

  const preferredVoices = [
    "Google UK English Male",
    "Google US English",
    "Daniel", // macOS
    "Alex", // macOS
    "Microsoft David", // Windows
  ];

  for (const name of preferredVoices) {
    const voice = voices.find((v) => v.name.includes(name));
    if (voice) return voice;
  }

  return voices[0] || null;
}

/** Speak using the browser Web Speech API. */
function speakBrowser(text: string, options: TTSOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!isWebSpeechPresent()) {
      reject(new Error("Text-to-speech is not available in this browser"));
      return;
    }

    speechSynthesis.cancel();

    const opts = { ...DEFAULT_OPTIONS, ...options };
    const utterance = new SpeechSynthesisUtterance(text);

    utterance.rate = opts.rate!;
    utterance.pitch = opts.pitch!;
    utterance.volume = opts.volume!;

    const voice = getBestVoice(opts.voiceName);
    if (voice) {
      utterance.voice = voice;
    }

    utterance.onend = () => resolve();
    utterance.onerror = (event) => {
      if (event.error === "canceled") {
        resolve();
      } else {
        reject(new Error(`Speech synthesis error: ${event.error}`));
      }
    };

    speechSynthesis.speak(utterance);
  });
}

// ============================================================
// Public API — routes to the active engine
// ============================================================

/**
 * Check if TTS is available.
 * Cloud engines are always "available" (the server call will fail gracefully
 * if the API key is missing). Browser engine needs the Web Speech API.
 */
export function isTTSAvailable(): boolean {
  if (typeof window === "undefined") return false;
  if (currentEngine !== "browser") return true;
  return isWebSpeechPresent();
}

/**
 * Speak the given text aloud using the current engine.
 */
export async function speak(
  text: string,
  options: TTSOptions = {}
): Promise<void> {
  switch (currentEngine) {
    case "elevenlabs":
      return speakElevenLabs(text);
    case "google-cloud":
      return speakGoogleCloud(text);
    default:
      return speakBrowser(text, options);
  }
}

/**
 * Speak text as a specific officer role using the current engine.
 * For browser, uses pitch/rate voice profiles.
 * For cloud engines, uses distinct voices per role.
 */
export function speakAsRole(
  text: string,
  role: string,
  voiceMap?: Map<string, RoleVoiceProfile>
): Promise<void> {
  switch (currentEngine) {
    case "elevenlabs":
      return speakElevenLabsAsRole(text, role);
    case "google-cloud":
      return speakGoogleCloudAsRole(text, role);
    default: {
      const profile = voiceMap?.get(role) || getVoiceForRole(role);
      return speakBrowser(text, {
        pitch: profile.pitch,
        rate: profile.rate,
        voiceName: profile.voiceName,
      });
    }
  }
}

/**
 * Stop any ongoing speech (works across all engines).
 */
export function stopSpeaking(): void {
  // Stop cloud audio
  stopCloudAudio();
  // Stop browser speech
  if (isWebSpeechPresent()) {
    speechSynthesis.cancel();
  }
}

/**
 * Check if currently speaking (any engine).
 */
export function isSpeaking(): boolean {
  if (isCloudAudioPlaying()) return true;
  if (isWebSpeechPresent()) return speechSynthesis.speaking;
  return false;
}

/**
 * Speak a correction with context:
 * "You said [wrong]. The correct words are: [right]"
 */
export async function speakCorrection(
  wrongWord: string,
  correctPhrase: string,
  options?: TTSOptions
): Promise<void> {
  const message = `You said "${wrongWord}". The correct words are: ${correctPhrase}`;
  await speak(message, options);
}

/**
 * Speak encouragement after a practice session
 */
export async function speakFeedback(
  accuracy: number,
  options?: TTSOptions
): Promise<void> {
  let message: string;

  if (accuracy >= 95) {
    message =
      "Excellent work, Brother. Your recitation is nearly perfect. Keep practicing and you will have it memorized in no time.";
  } else if (accuracy >= 85) {
    message =
      "Very good work. You have most of the words correct. Focus on the highlighted trouble spots and try again.";
  } else if (accuracy >= 70) {
    message =
      "Good effort. You are making solid progress. Review the sections marked in red and practice those parts specifically.";
  } else if (accuracy >= 50) {
    message =
      "Keep at it, Brother. Memorization takes time and repetition. Try working through smaller sections at a time.";
  } else {
    message =
      "No worries. Everyone starts somewhere. Try practicing a shorter section first, then build up to the full passage.";
  }

  await speak(message, options);
}
