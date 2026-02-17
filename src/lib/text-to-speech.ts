/**
 * Text-to-speech engine using the Web Speech Synthesis API.
 * Speaks corrections and coaching feedback aloud to the user.
 */

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

/**
 * Check if TTS is available in this browser
 */
export function isTTSAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return "speechSynthesis" in window;
}

/**
 * Get available voices, preferring English voices
 */
export function getVoices(): SpeechSynthesisVoice[] {
  if (!isTTSAvailable()) return [];
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
 * Pick the best default voice
 */
function getBestVoice(preferredName?: string): SpeechSynthesisVoice | null {
  const voices = getVoices();
  if (voices.length === 0) return null;

  // If a preferred voice is specified, try to find it
  if (preferredName) {
    const preferred = voices.find((v) => v.name === preferredName);
    if (preferred) return preferred;
  }

  // Prefer specific high-quality voices if available
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

  // Fall back to first English voice
  return voices[0] || null;
}

/**
 * Speak the given text aloud
 */
export function speak(
  text: string,
  options: TTSOptions = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!isTTSAvailable()) {
      reject(new Error("Text-to-speech is not available in this browser"));
      return;
    }

    // Cancel any ongoing speech
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
        resolve(); // Don't treat cancellation as an error
      } else {
        reject(new Error(`Speech synthesis error: ${event.error}`));
      }
    };

    speechSynthesis.speak(utterance);
  });
}

/**
 * Stop any ongoing speech
 */
export function stopSpeaking(): void {
  if (isTTSAvailable()) {
    speechSynthesis.cancel();
  }
}

/**
 * Check if currently speaking
 */
export function isSpeaking(): boolean {
  if (!isTTSAvailable()) return false;
  return speechSynthesis.speaking;
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
