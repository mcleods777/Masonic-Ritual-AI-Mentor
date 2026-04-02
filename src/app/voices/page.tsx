"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ============================================================
// Types
// ============================================================

interface VoiceProfile {
  id: string;
  name: string;
  gender?: string;
  languages?: string[];
}

type RecordingState = "idle" | "recording" | "recorded" | "uploading";

// ============================================================
// Suggested phrases for recording samples
// ============================================================

const SAMPLE_PHRASES = [
  "Brethren, the lodge is now open for the transaction of business.",
  "Worshipful Master, the lodge is tyled.",
  "The Junior Warden's station is in the south.",
  "Let us offer our prayers to the Most High.",
  "I vouch for this brother, that he is worthy and well qualified.",
  "The minutes of the previous communication are as follows.",
  "So mote it be.",
];

// ============================================================
// Component
// ============================================================

export default function VoicesPage() {
  // Voice profiles from Mistral
  const [voices, setVoices] = useState<VoiceProfile[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(true);
  const [available, setAvailable] = useState(false);

  // Recording state
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [voiceName, setVoiceName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [phraseIdx, setPhraseIdx] = useState(0);

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  // ============================================================
  // Load voices + check availability
  // ============================================================

  const fetchVoices = useCallback(async () => {
    try {
      const resp = await fetch("/api/tts/voxtral/voices");
      if (!resp.ok) {
        setAvailable(false);
        return;
      }
      setAvailable(true);
      const data = (await resp.json()) as { voices: VoiceProfile[] };
      setVoices(data.voices || []);
    } catch {
      setAvailable(false);
    } finally {
      setLoadingVoices(false);
    }
  }, []);

  useEffect(() => {
    fetchVoices();
    // Pick a random phrase
    setPhraseIdx(Math.floor(Math.random() * SAMPLE_PHRASES.length));
  }, [fetchVoices]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [audioUrl]);

  // ============================================================
  // Recording controls
  // ============================================================

  const startRecording = async () => {
    setError(null);
    setSuccess(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setRecordingState("recorded");

        // Stop all tracks
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };

      recorder.start(250); // collect data every 250ms
      startTimeRef.current = Date.now();
      setDuration(0);
      setRecordingState("recording");

      // Update duration counter
      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 200);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not access microphone. Please allow microphone access."
      );
    }
  };

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
    mediaRecorderRef.current?.stop();
  };

  const discardRecording = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingState("idle");
    setDuration(0);
    // Pick a new phrase
    setPhraseIdx(Math.floor(Math.random() * SAMPLE_PHRASES.length));
  };

  // ============================================================
  // Upload to Mistral
  // ============================================================

  const uploadVoice = async () => {
    if (!audioBlob || !voiceName.trim()) {
      setError("Please enter a name for this voice.");
      return;
    }

    setError(null);
    setRecordingState("uploading");

    try {
      // Convert blob to base64 (chunk-safe for large recordings)
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          // result is "data:<mime>;base64,<data>" — strip the prefix
          const dataUrl = reader.result as string;
          resolve(dataUrl.split(",")[1]);
        };
        reader.readAsDataURL(audioBlob);
      });

      const resp = await fetch("/api/tts/voxtral/voices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: voiceName.trim(),
          sampleAudio: base64,
          sampleFilename: "recording.webm",
          gender: "male",
          languages: ["en"],
        }),
      });

      if (!resp.ok) {
        const data = (await resp.json()) as { error?: string };
        throw new Error(data.error || `Upload failed: ${resp.status}`);
      }

      const data = (await resp.json()) as { voice: VoiceProfile };
      setSuccess(
        `Voice "${data.voice.name}" created! It will be used for TTS playback.`
      );
      setVoiceName("");
      discardRecording();
      fetchVoices(); // refresh list
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setRecordingState("recorded");
    }
  };

  // ============================================================
  // Render
  // ============================================================

  if (loadingVoices) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!available) {
    return (
      <div className="space-y-6 py-8">
        <h1 className="text-3xl font-bold text-zinc-100">Custom Voices</h1>
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <p className="text-zinc-400">
            Voxtral (Mistral) is not configured. Add{" "}
            <code className="text-amber-400 bg-zinc-800 px-1.5 py-0.5 rounded text-sm">
              MISTRAL_API_KEY
            </code>{" "}
            to your environment variables to enable custom voice profiles.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 py-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-zinc-100">Custom Voices</h1>
        <p className="text-zinc-400 mt-2">
          Record your voice (or a brother&apos;s) to create custom Voxtral voice
          profiles. Each profile needs just 5-10 seconds of audio. The more
          voices you add, the more distinct each officer will sound during
          rehearsal.
        </p>
      </div>

      {/* Alerts */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-green-400 text-sm">
          {success}
        </div>
      )}

      {/* Recorder */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 space-y-6">
        <h2 className="text-lg font-semibold text-zinc-200">
          Record a Voice Sample
        </h2>

        {/* Suggested phrase */}
        <div className="bg-zinc-800/50 rounded-lg p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">
            Try reading this aloud
          </p>
          <p className="text-zinc-200 text-lg italic leading-relaxed">
            &ldquo;{SAMPLE_PHRASES[phraseIdx]}&rdquo;
          </p>
          <button
            onClick={() =>
              setPhraseIdx((phraseIdx + 1) % SAMPLE_PHRASES.length)
            }
            className="text-xs text-amber-500 hover:text-amber-400 mt-2 transition-colors"
          >
            Try a different phrase
          </button>
        </div>

        {/* Recording UI */}
        <div className="flex flex-col items-center gap-4">
          {/* Duration / Status */}
          <div className="text-center">
            {recordingState === "recording" && (
              <div className="flex items-center gap-2 text-red-400">
                <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                <span className="text-2xl font-mono tabular-nums">
                  {duration}s
                </span>
                <span className="text-sm text-zinc-500">
                  (aim for 5-10 seconds)
                </span>
              </div>
            )}
            {recordingState === "recorded" && (
              <p className="text-zinc-400 text-sm">
                Recorded {duration} seconds
              </p>
            )}
            {recordingState === "uploading" && (
              <div className="flex items-center gap-2 text-amber-400">
                <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                <span>Creating voice profile...</span>
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-3">
            {recordingState === "idle" && (
              <button
                onClick={startRecording}
                className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-medium transition-colors"
              >
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                </svg>
                Start Recording
              </button>
            )}

            {recordingState === "recording" && (
              <button
                onClick={stopRecording}
                className="flex items-center gap-2 px-6 py-3 bg-zinc-700 hover:bg-zinc-600 text-white rounded-xl font-medium transition-colors"
              >
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
                Stop Recording
              </button>
            )}

            {recordingState === "recorded" && (
              <>
                <button
                  onClick={discardRecording}
                  className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-sm font-medium transition-colors"
                >
                  Re-record
                </button>
              </>
            )}
          </div>

          {/* Playback preview */}
          {audioUrl && recordingState === "recorded" && (
            <audio controls src={audioUrl} className="w-full max-w-md mt-2" />
          )}
        </div>

        {/* Name + Save */}
        {recordingState === "recorded" && (
          <div className="border-t border-zinc-800 pt-6 space-y-4">
            <div>
              <label
                htmlFor="voice-name"
                className="block text-sm font-medium text-zinc-300 mb-1.5"
              >
                Voice Name
              </label>
              <input
                id="voice-name"
                type="text"
                value={voiceName}
                onChange={(e) => setVoiceName(e.target.value)}
                placeholder="e.g. Brother McLeod - WM"
                className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500 transition-colors"
              />
              <p className="text-xs text-zinc-500 mt-1.5">
                Tip: include the officer role so you can tell voices apart
                (e.g. &ldquo;John - Senior Warden&rdquo;)
              </p>
            </div>
            <button
              onClick={uploadVoice}
              disabled={!voiceName.trim()}
              className="w-full px-6 py-3 bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-xl font-medium transition-colors"
            >
              Save Voice Profile
            </button>
          </div>
        )}
      </div>

      {/* Existing voices */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
        <h2 className="text-lg font-semibold text-zinc-200 mb-4">
          Your Voice Profiles
          <span className="text-sm font-normal text-zinc-500 ml-2">
            ({voices.length} voice{voices.length !== 1 ? "s" : ""})
          </span>
        </h2>

        {voices.length === 0 ? (
          <p className="text-zinc-500 text-sm">
            No voice profiles yet. Record a sample above, or run the auto-setup
            to bootstrap voices from Deepgram.
          </p>
        ) : (
          <div className="space-y-2">
            {voices.map((voice) => (
              <div
                key={voice.id}
                className="flex items-center justify-between px-4 py-3 bg-zinc-800/50 rounded-lg"
              >
                <div>
                  <p className="text-zinc-200 font-medium">{voice.name}</p>
                  <p className="text-xs text-zinc-500">
                    {voice.gender || "male"} &middot;{" "}
                    {voice.languages?.join(", ") || "en"} &middot;{" "}
                    <span className="font-mono text-zinc-600">
                      {voice.id.slice(0, 8)}...
                    </span>
                  </p>
                </div>
                <div className="w-2 h-2 rounded-full bg-green-500/60" />
              </div>
            ))}
          </div>
        )}

        {voices.length > 0 && (
          <p className="text-xs text-zinc-500 mt-4">
            These voices are automatically distributed across officer roles
            during rehearsal. More voices = more distinct officers.
          </p>
        )}
      </div>
    </div>
  );
}
