/**
 * Text-to-speech — multi-engine support.
 *
 * Five engines:
 *   1. "browser"      — Web Speech Synthesis API (free, works offline)
 *   2. "elevenlabs"   — ElevenLabs cloud API (high-quality)
 *   3. "google-cloud" — Google Cloud TTS Neural2 (high-quality)
 *   4. "deepgram"     — Deepgram Aura-2 (fast, natural)
 *   5. "kokoro"       — Kokoro (self-hosted, free)
 *
 * The public API (speak, speakAsRole, stopSpeaking, etc.) stays the same.
 * Components don't need to know which engine is active — they just call
 * these functions and the current engine handles playback.
 */

import {
  speakElevenLabs,
  speakElevenLabsAsRole,
  getElevenLabsVoiceForRole,
  speakGoogleCloud,
  speakGoogleCloudAsRole,
  speakDeepgram,
  speakDeepgramAsRole,
  speakKokoro,
  speakKokoroAsRole,
  stopCloudAudio,
  isCloudAudioPlaying,
} from "./tts-cloud";

// ============================================================
// Engine selection
// ============================================================

export type TTSEngineName = "browser" | "elevenlabs" | "google-cloud" | "deepgram" | "kokoro";

const TTS_ENGINE_STORAGE_KEY = "tts-engine";

let currentEngine: TTSEngineName = "browser";

// Restore persisted engine on module load (client only)
if (typeof window !== "undefined") {
  const stored = localStorage.getItem(TTS_ENGINE_STORAGE_KEY);
  if (
    stored === "elevenlabs" ||
    stored === "google-cloud" ||
    stored === "deepgram" ||
    stored === "kokoro"
  ) {
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
  pitch: 0.7,
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
 * All pitches kept in the masculine range (0.5–0.8) so even Android/mobile
 * default voices sound like men. Officers are differentiated primarily by
 * rate and subtle pitch shifts within that range.
 */
const ROLE_VOICE_PROFILES: Record<string, RoleVoiceProfile> = {
  // Principal officers — deepest, most deliberate
  WM:        { pitch: 0.55, rate: 0.82 },
  'W.M.':    { pitch: 0.55, rate: 0.82 },
  'W. M.':   { pitch: 0.55, rate: 0.82 },
  SW:        { pitch: 0.62, rate: 0.87 },
  'S.W.':    { pitch: 0.62, rate: 0.87 },
  'S. W.':   { pitch: 0.62, rate: 0.87 },
  JW:        { pitch: 0.68, rate: 0.87 },
  'J.W.':    { pitch: 0.68, rate: 0.87 },
  'J. W.':   { pitch: 0.68, rate: 0.87 },
  // Deacons — slightly higher but still masculine, a bit quicker
  SD:        { pitch: 0.72, rate: 0.92 },
  'S.D.':    { pitch: 0.72, rate: 0.92 },
  'S. D.':   { pitch: 0.72, rate: 0.92 },
  JD:        { pitch: 0.78, rate: 0.92 },
  'J.D.':    { pitch: 0.78, rate: 0.92 },
  'J. D.':   { pitch: 0.78, rate: 0.92 },
  'S(orJ)D': { pitch: 0.75, rate: 0.92 },
  'S/J D':   { pitch: 0.75, rate: 0.92 },
  // Other officers
  'S/Sec':   { pitch: 0.70, rate: 0.95 },
  Sec:       { pitch: 0.70, rate: 0.95 },
  'Sec.':    { pitch: 0.70, rate: 0.95 },
  S:         { pitch: 0.70, rate: 0.95 },
  Tr:        { pitch: 0.65, rate: 0.90 },
  Treas:     { pitch: 0.65, rate: 0.90 },
  'Treas.':  { pitch: 0.65, rate: 0.90 },
  Ch:        { pitch: 0.50, rate: 0.78 },
  Chap:      { pitch: 0.50, rate: 0.78 },
  'Chap.':   { pitch: 0.50, rate: 0.78 },
  Marshal:   { pitch: 0.68, rate: 0.90 },
  T:         { pitch: 0.80, rate: 0.90 },
  Tyler:     { pitch: 0.80, rate: 0.90 },
  Candidate: { pitch: 0.75, rate: 0.85 },
  // Group/other
  ALL:       { pitch: 0.65, rate: 0.80 },
  All:       { pitch: 0.65, rate: 0.80 },
  BR:        { pitch: 0.72, rate: 0.90 },
  Bro:       { pitch: 0.72, rate: 0.90 },
  'Bro.':    { pitch: 0.72, rate: 0.90 },
  'SW/WM':       { pitch: 0.58, rate: 0.85 },
  // Additional role aliases from ritual files
  Trs:           { pitch: 0.65, rate: 0.90 },
  'WM/Chaplain': { pitch: 0.50, rate: 0.78 },
  Voucher:       { pitch: 0.72, rate: 0.90 },
  Vchr:          { pitch: 0.72, rate: 0.90 },
  Narrator:      { pitch: 0.68, rate: 0.92 },
  PRAYER:        { pitch: 0.50, rate: 0.78 },
  Prayer:        { pitch: 0.50, rate: 0.78 },
};

/**
 * Get the voice profile for a given role.
 * Falls back to neutral defaults if the role isn't mapped.
 */
export function getVoiceForRole(role: string): RoleVoiceProfile {
  return ROLE_VOICE_PROFILES[role] || { pitch: 0.7, rate: 0.9 };
}

/**
 * Known male voice names across platforms, ordered by preference.
 * We match substrings so "Microsoft David Desktop" matches "david".
 */
const MALE_VOICE_NAMES = [
  // Windows
  "david", "mark", "james", "george", "richard", "guy",
  // macOS / iOS
  "daniel", "alex", "fred", "ralph", "tom", "lee", "oliver", "aaron",
  "arthur", "brian", "charles", "edmund", "gordon", "reed", "rishi", "thomas",
  // Chrome / Android
  "google uk english male", "google us english",
  // Generic
  "male",
];

const FEMALE_VOICE_NAMES = [
  "female", "zira", "samantha", "victoria", "karen", "moira",
  "fiona", "susan", "kate", "tessa", "allison", "ava",
  "catherine", "grandma", "martha", "nicky", "serena",
  "jenny", "aria", "eva", "elsa", "hazel", "clara",
  "linda", "michelle", "sonia", "libby", "emily",
];

/**
 * Score a voice for "maleness" — higher is more likely male.
 * Returns -1 for known female, 0 for unknown, 1+ for likely male.
 */
function maleScore(voice: SpeechSynthesisVoice): number {
  const name = voice.name.toLowerCase();
  if (FEMALE_VOICE_NAMES.some((f) => name.includes(f))) return -1;
  for (let i = 0; i < MALE_VOICE_NAMES.length; i++) {
    if (name.includes(MALE_VOICE_NAMES[i])) return MALE_VOICE_NAMES.length - i;
  }
  return 0;
}

/**
 * Find the single best male voice available on this device.
 */
function findBestMaleVoice(): SpeechSynthesisVoice | null {
  const voices = getVoices();
  if (voices.length === 0) return null;

  let best: SpeechSynthesisVoice | null = null;
  let bestScore = -Infinity;

  for (const v of voices) {
    const s = maleScore(v);
    if (s > bestScore) {
      bestScore = s;
      best = v;
    }
  }

  return best;
}

/**
 * Assign voices to each role for browser TTS.
 * Uses a single male voice for all roles — pitch and rate variation
 * from the role profiles provides differentiation between officers.
 * (Only meaningful for the "browser" engine.)
 */
export function assignVoicesToRoles(roles: string[]): Map<string, RoleVoiceProfile> {
  const maleVoice = findBestMaleVoice();
  const map = new Map<string, RoleVoiceProfile>();

  for (const role of roles) {
    const profile = getVoiceForRole(role);
    if (maleVoice) {
      map.set(role, { ...profile, voiceName: maleVoice.name });
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
 * Pick the best default browser voice — prefers male voices for Masonic ritual.
 */
function getBestVoice(preferredName?: string): SpeechSynthesisVoice | null {
  const voices = getVoices();
  if (voices.length === 0) return null;

  if (preferredName) {
    const preferred = voices.find((v) => v.name === preferredName);
    if (preferred) return preferred;
  }

  // Use the same male-preference scoring as role assignment
  return findBestMaleVoice() || voices[0];
}

/** Speak using the browser Web Speech API. */
async function speakBrowser(text: string, options: TTSOptions = {}): Promise<void> {
  if (!isWebSpeechPresent()) {
    throw new Error("Text-to-speech is not available in this browser");
  }

  // Cancel any in-flight utterance and give the browser a moment to
  // fully tear it down.  Without this gap Chrome can overlap utterances.
  speechSynthesis.cancel();
  await new Promise((r) => setTimeout(r, 80));

  return new Promise((resolve, reject) => {
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
    case "deepgram":
      return speakDeepgram(text);
    case "kokoro":
      return speakKokoro(text);
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
  if (currentEngine === "elevenlabs") {
    const voiceId = getElevenLabsVoiceForRole(role);
    console.log(`[TTS] speakAsRole engine=elevenlabs role="${role}" voiceId=${voiceId} text="${text.substring(0, 30)}..."`);
  }
  switch (currentEngine) {
    case "elevenlabs":
      return speakElevenLabsAsRole(text, role);
    case "google-cloud":
      return speakGoogleCloudAsRole(text, role);
    case "deepgram":
      return speakDeepgramAsRole(text, role);
    case "kokoro":
      return speakKokoroAsRole(text, role);
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
