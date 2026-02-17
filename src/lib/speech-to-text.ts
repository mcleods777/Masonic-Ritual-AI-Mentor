/**
 * Speech-to-text engine using the Web Speech API.
 * Designed with a provider interface so Whisper-Web or cloud STT
 * can be swapped in later.
 */

export interface STTResult {
  transcript: string;
  isFinal: boolean;
  confidence: number;
}

export interface STTEngine {
  start(): void;
  stop(): void;
  isListening(): boolean;
  onResult: ((result: STTResult) => void) | null;
  onError: ((error: string) => void) | null;
  onEnd: (() => void) | null;
}

/**
 * Check if the Web Speech API is available in this browser
 */
export function isWebSpeechAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return "SpeechRecognition" in window || "webkitSpeechRecognition" in window;
}

/**
 * Web Speech API implementation (works in Chrome, Edge, Safari)
 */
export function createWebSpeechEngine(): STTEngine {
  if (typeof window === "undefined") {
    throw new Error("Web Speech API is only available in the browser");
  }

  const SpeechRecognition =
    (window as unknown as Record<string, unknown>).SpeechRecognition ||
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition;

  if (!SpeechRecognition) {
    throw new Error(
      "Web Speech API is not supported in this browser. Please use Chrome, Edge, or Safari."
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognition: any = new (SpeechRecognition as any)();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  recognition.maxAlternatives = 1;

  let listening = false;

  const engine: STTEngine = {
    onResult: null,
    onError: null,
    onEnd: null,

    start() {
      if (listening) return;
      try {
        recognition.start();
        listening = true;
      } catch {
        // Recognition may already be started
      }
    },

    stop() {
      if (!listening) return;
      recognition.stop();
      listening = false;
    },

    isListening() {
      return listening;
    },
  };

  recognition.onresult = (event: any) => {
    if (!engine.onResult) return;

    // Collect all results into a full transcript
    let finalTranscript = "";
    let interimTranscript = "";

    for (let i = 0; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        finalTranscript += result[0].transcript;
      } else {
        interimTranscript += result[0].transcript;
      }
    }

    // Send the complete transcript (final + interim)
    engine.onResult({
      transcript: finalTranscript + interimTranscript,
      isFinal: interimTranscript.length === 0 && finalTranscript.length > 0,
      confidence:
        event.results.length > 0
          ? event.results[event.results.length - 1][0].confidence
          : 0,
    });
  };

  recognition.onerror = (event: any) => {
    if (event.error === "no-speech") return; // Ignore no-speech errors
    if (event.error === "aborted") return; // Ignore intentional stops
    listening = false;
    engine.onError?.(
      `Speech recognition error: ${event.error}. ${event.message || ""}`
    );
  };

  recognition.onend = () => {
    listening = false;
    engine.onEnd?.();
  };

  return engine;
}
