"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  saveVoice,
  listVoices,
  deleteVoice,
  type LocalVoice,
} from "@/lib/voice-storage";
import { clearVoxtralVoicesCache } from "@/lib/tts-cloud";

// ============================================================
// Types
// ============================================================

type RecordingState = "idle" | "recording" | "recorded" | "saving";

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
  // Voice profiles from local storage
  const [voices, setVoices] = useState<LocalVoice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(true);

  // Recording state
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>("audio/webm");
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
  // Load voices from IndexedDB
  // ============================================================

  const fetchVoices = useCallback(async () => {
    try {
      const localVoices = await listVoices();
      setVoices(localVoices.sort((a, b) => b.createdAt - a.createdAt));
    } catch {
      // IndexedDB not available
    } finally {
      setLoadingVoices(false);
    }
  }, []);

  useEffect(() => {
    fetchVoices();
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

      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4";

      setMimeType(mime);
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setRecordingState("recorded");

        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };

      recorder.start(250);
      startTimeRef.current = Date.now();
      setDuration(0);
      setRecordingState("recording");

      // Auto-stop at 15 seconds to keep file size reasonable for ref_audio
      const MAX_DURATION_MS = 15000;
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current;
        setDuration(Math.floor(elapsed / 1000));
        if (elapsed >= MAX_DURATION_MS) {
          stopRecording();
        }
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
    setPhraseIdx(Math.floor(Math.random() * SAMPLE_PHRASES.length));
  };

  // ============================================================
  // Save to IndexedDB
  // ============================================================

  /**
   * Convert a webm/opus audio blob to wav using the Web Audio API.
   * Mistral's ref_audio expects wav or mp3 — browsers record in webm.
   */
  const convertBlobToWavBase64 = async (blob: Blob): Promise<string> => {
    const audioContext = new AudioContext({ sampleRate: 16000 });
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      // Get mono channel (first channel)
      const channelData = audioBuffer.getChannelData(0);

      // Build WAV file
      const wavBuffer = encodeWav(channelData, 16000);

      // Convert to base64
      const bytes = new Uint8Array(wavBuffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    } finally {
      await audioContext.close();
    }
  };

  /** Encode raw PCM samples into a WAV file ArrayBuffer. */
  const encodeWav = (samples: Float32Array, sampleRate: number): ArrayBuffer => {
    const numChannels = 1;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const dataLength = samples.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);

    // RIFF header
    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + dataLength, true);
    writeString(view, 8, "WAVE");

    // fmt chunk
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true); // chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
    view.setUint16(32, numChannels * bytesPerSample, true);
    view.setUint16(34, bitsPerSample, true);

    // data chunk
    writeString(view, 36, "data");
    view.setUint32(40, dataLength, true);

    // Write PCM samples (float32 → int16)
    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }

    return buffer;
  };

  const writeString = (view: DataView, offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  const saveVoiceLocally = async () => {
    if (!audioBlob || !voiceName.trim()) {
      setError("Please enter a name for this voice.");
      return;
    }

    setError(null);
    setRecordingState("saving");

    try {
      // Convert webm recording to wav (Mistral expects wav/mp3 for ref_audio)
      const wavBase64 = await convertBlobToWavBase64(audioBlob);

      const voice: LocalVoice = {
        id: `voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: voiceName.trim(),
        audioBase64: wavBase64,
        mimeType: "audio/wav",
        duration,
        createdAt: Date.now(),
      };

      await saveVoice(voice);
      clearVoxtralVoicesCache();

      setSuccess(
        `Voice "${voice.name}" saved! It will be used when you select Voxtral for TTS.`
      );
      setVoiceName("");
      discardRecording();
      fetchVoices();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save voice");
      setRecordingState("recorded");
    }
  };

  // ============================================================
  // Delete a voice
  // ============================================================

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete voice "${name}"?`)) return;
    try {
      await deleteVoice(id);
      clearVoxtralVoicesCache();
      fetchVoices();
    } catch {
      setError("Failed to delete voice");
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

  return (
    <div className="space-y-8 py-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-zinc-100">Custom Voices</h1>
        <p className="text-zinc-400 mt-2">
          Record your voice (or a brother&apos;s) to create custom voice
          profiles for Voxtral TTS. Each recording needs just 3-10 seconds.
          Recordings stay on your device and are sent with each TTS request
          for real-time voice cloning.
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

        {/* Tips */}
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
          <p className="text-xs text-amber-400/80">
            <strong>Tips:</strong> 3-5 seconds is ideal (smaller file = faster TTS).
            Speak in the tone you want for rehearsal. A quiet room helps cloning quality.
          </p>
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
                  (aim for 3-10 seconds)
                </span>
              </div>
            )}
            {recordingState === "recorded" && (
              <p className="text-zinc-400 text-sm">
                Recorded {duration} seconds
              </p>
            )}
            {recordingState === "saving" && (
              <div className="flex items-center gap-2 text-amber-400">
                <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                <span>Saving voice...</span>
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
              <button
                onClick={discardRecording}
                className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-sm font-medium transition-colors"
              >
                Re-record
              </button>
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
              onClick={saveVoiceLocally}
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
            No voice profiles yet. Record a sample above to get started.
            Your recordings are stored locally on this device.
          </p>
        ) : (
          <div className="space-y-2">
            {voices.map((voice) => (
              <div
                key={voice.id}
                className="flex items-center justify-between px-4 py-3 bg-zinc-800/50 rounded-lg"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-zinc-200 font-medium truncate">
                    {voice.name}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {voice.duration}s &middot;{" "}
                    {new Date(voice.createdAt).toLocaleDateString()}
                    {voice.role && (
                      <span className="ml-1 text-amber-500/70">
                        &middot; {voice.role}
                      </span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(voice.id, voice.name)}
                  className="ml-3 p-1.5 text-zinc-600 hover:text-red-400 transition-colors flex-shrink-0"
                  title="Delete voice"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {voices.length > 0 && (
          <p className="text-xs text-zinc-500 mt-4">
            Voices are distributed across officer roles during rehearsal when
            Voxtral is selected as the TTS engine. More voices = more distinct
            officers. Recordings stay on this device.
          </p>
        )}
      </div>

      {/* Privacy note */}
      <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-green-500/10 flex-shrink-0 flex items-center justify-center">
            <svg
              className="w-4 h-4 text-green-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-200">
              Local Storage
            </h3>
            <p className="text-xs text-zinc-500 mt-1">
              Voice recordings are stored in your browser&apos;s IndexedDB. They
              are only sent to Mistral&apos;s API when generating speech during
              rehearsal. No voice data is permanently stored on any server.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
