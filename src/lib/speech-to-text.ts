/**
 * Speech-to-text engines.
 *
 * Two providers:
 *   1. Web Speech API  — free, real-time interim results, browser-native
 *   2. Groq Whisper    — higher accuracy, Masonic vocabulary hints,
 *                        requires GROQ_API_KEY on the server
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
  /** Called when silence is detected for the configured duration. */
  onSilence: (() => void) | null;
}

export type STTProvider = "browser" | "whisper";

// ============================================================
// Availability checks
// ============================================================

export function isWebSpeechAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return "SpeechRecognition" in window || "webkitSpeechRecognition" in window;
}

export function isMediaRecorderAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return "MediaRecorder" in window && "mediaDevices" in navigator;
}

// ============================================================
// Web Speech API engine (works in Chrome, Edge, Safari)
// ============================================================

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

  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let hasSpoken = false;

  const BROWSER_SILENCE_MS = 3000;

  function resetSilenceTimer() {
    if (silenceTimer) clearTimeout(silenceTimer);
    if (!hasSpoken) return;
    silenceTimer = setTimeout(() => {
      if (listening && hasSpoken) {
        engine.onSilence?.();
      }
    }, BROWSER_SILENCE_MS);
  }

  const engine: STTEngine = {
    onResult: null,
    onError: null,
    onEnd: null,
    onSilence: null,

    start() {
      if (listening) return;
      try {
        hasSpoken = false;
        recognition.start();
        listening = true;
      } catch {
        // Recognition may already be started
      }
    },

    stop() {
      if (!listening) return;
      if (silenceTimer) clearTimeout(silenceTimer);
      recognition.stop();
      listening = false;
    },

    isListening() {
      return listening;
    },
  };

  recognition.onresult = (event: any) => {
    if (!engine.onResult) return;

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

    const combined = finalTranscript + interimTranscript;
    if (combined.trim().length > 0) {
      hasSpoken = true;
      resetSilenceTimer();
    }

    engine.onResult({
      transcript: combined,
      isFinal: interimTranscript.length === 0 && finalTranscript.length > 0,
      confidence:
        event.results.length > 0
          ? event.results[event.results.length - 1][0].confidence
          : 0,
    });
  };

  recognition.onerror = (event: any) => {
    if (event.error === "no-speech") return;
    if (event.error === "aborted") return;
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

// ============================================================
// Groq Whisper engine (MediaRecorder → server → Groq API)
// ============================================================

export function createWhisperEngine(): STTEngine {
  if (typeof window === "undefined") {
    throw new Error("Whisper engine is only available in the browser");
  }

  if (!isMediaRecorderAvailable()) {
    throw new Error("MediaRecorder is not supported in this browser.");
  }

  let listening = false;
  let mediaRecorder: MediaRecorder | null = null;
  let audioChunks: Blob[] = [];
  let stream: MediaStream | null = null;
  let audioContext: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let silenceRafId: number | null = null;
  let lastSoundTime = 0;
  let hasRecordedSound = false;

  const WHISPER_SILENCE_MS = 3000;
  const SILENCE_THRESHOLD = 15; // RMS threshold (0-255 scale)

  function startSilenceDetection(mediaStream: MediaStream) {
    audioContext = new AudioContext();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    const source = audioContext.createMediaStreamSource(mediaStream);
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.fftSize);
    lastSoundTime = Date.now();

    function checkAudioLevel() {
      if (!analyser || !listening) return;
      analyser.getByteTimeDomainData(dataArray);

      // Calculate RMS
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const val = (dataArray[i] - 128) / 128;
        sum += val * val;
      }
      const rms = Math.sqrt(sum / dataArray.length) * 255;

      if (rms > SILENCE_THRESHOLD) {
        lastSoundTime = Date.now();
        hasRecordedSound = true;
      }

      if (hasRecordedSound && Date.now() - lastSoundTime > WHISPER_SILENCE_MS) {
        engine.onSilence?.();
        return; // Stop monitoring
      }

      silenceRafId = requestAnimationFrame(checkAudioLevel);
    }

    silenceRafId = requestAnimationFrame(checkAudioLevel);
  }

  function stopSilenceDetection() {
    if (silenceRafId != null) {
      cancelAnimationFrame(silenceRafId);
      silenceRafId = null;
    }
    if (audioContext) {
      audioContext.close().catch(() => {});
      audioContext = null;
    }
    analyser = null;
    hasRecordedSound = false;
  }

  const engine: STTEngine = {
    onResult: null,
    onError: null,
    onEnd: null,
    onSilence: null,

    async start() {
      if (listening) return;

      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // Pick a supported MIME type
        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/webm")
            ? "audio/webm"
            : "audio/mp4";

        mediaRecorder = new MediaRecorder(stream, { mimeType });
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunks.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          // Clean up audio monitoring and release mic
          stopSilenceDetection();
          stream?.getTracks().forEach((t) => t.stop());
          stream = null;

          if (audioChunks.length === 0) {
            engine.onEnd?.();
            return;
          }

          const audioBlob = new Blob(audioChunks, { type: mimeType });
          audioChunks = [];

          // Send to our server-side transcription route
          try {
            const formData = new FormData();
            formData.append("audio", audioBlob, "recording.webm");

            const response = await fetch("/api/transcribe", {
              method: "POST",
              body: formData,
            });

            if (!response.ok) {
              const err = await response.json().catch(() => ({ error: response.statusText }));
              engine.onError?.(err.error || "Transcription failed");
              engine.onEnd?.();
              return;
            }

            const { transcript } = await response.json();

            if (transcript) {
              engine.onResult?.({
                transcript,
                isFinal: true,
                confidence: 1.0,
              });
            }
          } catch (err) {
            engine.onError?.(
              err instanceof Error ? err.message : "Failed to transcribe audio"
            );
          }

          engine.onEnd?.();
        };

        mediaRecorder.onerror = () => {
          listening = false;
          stream?.getTracks().forEach((t) => t.stop());
          stream = null;
          engine.onError?.("Recording failed");
          engine.onEnd?.();
        };

        mediaRecorder.start();
        listening = true;
        startSilenceDetection(stream);
      } catch (err) {
        listening = false;
        stream?.getTracks().forEach((t) => t.stop());
        stream = null;
        engine.onError?.(
          err instanceof Error ? err.message : "Failed to access microphone"
        );
      }
    },

    stop() {
      if (!listening) return;
      listening = false;
      stopSilenceDetection();
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }
    },

    isListening() {
      return listening;
    },
  };

  return engine;
}
