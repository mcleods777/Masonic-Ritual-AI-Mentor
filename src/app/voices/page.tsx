"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  saveVoice,
  listVoices,
  deleteVoice,
  assignVoiceRole,
  renameVoice,
  exportVoices,
  validateVoiceImport,
  importVoices,
  type LocalVoice,
} from "@/lib/voice-storage";
import { clearVoxtralVoicesCache, VOXTRAL_ROLE_OPTIONS } from "@/lib/tts-cloud";
import { normalizeAudio, encodeWav } from "@/lib/audio-utils";
import {
  ensureDefaultVoices,
  getDefaultVoiceNames,
  resetDefaultVoiceRoles,
} from "@/lib/default-voices";
import { fetchApi } from "@/lib/api-fetch";

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
  const [voiceRole, setVoiceRole] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const [testingVoiceId, setTestingVoiceId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [renamingVoiceId, setRenamingVoiceId] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micAudioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number>(0);

  // ============================================================
  // Load voices from IndexedDB
  // ============================================================

  const fetchVoices = useCallback(async () => {
    try {
      // Auto-load default voices on first visit
      await ensureDefaultVoices();
      const localVoices = await listVoices();
      // Sort: user voices (createdAt > 0) first, then defaults (createdAt === 0)
      setVoices(localVoices.sort((a, b) => {
        if (a.createdAt === 0 && b.createdAt !== 0) return 1;
        if (a.createdAt !== 0 && b.createdAt === 0) return -1;
        return b.createdAt - a.createdAt;
      }));
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
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [audioUrl]);

  // Mic level monitoring via AnalyserNode
  const startMicMonitor = (stream: MediaStream) => {
    try {
      if (micAudioCtxRef.current) {
        micAudioCtxRef.current.close().catch(() => {});
      }
      const ctx = new AudioContext();
      micAudioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(dataArray);
        // RMS level normalized to 0-1
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i] * dataArray[i];
        const rms = Math.sqrt(sum / dataArray.length) / 255;
        setMicLevel(rms);
        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // AudioContext not available, skip level monitoring
    }
  };

  const stopMicMonitor = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
    if (micAudioCtxRef.current) {
      micAudioCtxRef.current.close().catch(() => {});
      micAudioCtxRef.current = null;
    }
    setMicLevel(0);
    analyserRef.current = null;
  };

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
      startMicMonitor(stream);
      startTimeRef.current = Date.now();
      setDuration(0);
      setRecordingState("recording");

      // Auto-stop at 10 seconds — Voxtral only needs 2-3s for cloning,
      // but 10s gives room for quality. Longer recordings add latency.
      const MAX_DURATION_MS = 10000;
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
    stopMicMonitor();
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

      // Get mono channel (first channel) and normalize to -3dB peak
      const rawData = audioBuffer.getChannelData(0);
      const channelData = normalizeAudio(rawData, -3);

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
        role: voiceRole || undefined,
        createdAt: Date.now(),
      };

      await saveVoice(voice);
      clearVoxtralVoicesCache();

      setSuccess(
        `Voice "${voice.name}" saved! It will be used when you select Voxtral for TTS.`
      );
      setVoiceName("");
      setVoiceRole("");
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

  const startRename = (voice: LocalVoice) => {
    setRenamingVoiceId(voice.id);
    setRenameInput(voice.name);
    setError(null);
  };

  const cancelRename = () => {
    setRenamingVoiceId(null);
    setRenameInput("");
  };

  const saveRename = async (id: string) => {
    const trimmed = renameInput.trim();
    if (!trimmed) {
      setError("Voice name cannot be empty.");
      return;
    }
    setRenameSaving(true);
    try {
      await renameVoice(id, trimmed);
      clearVoxtralVoicesCache();
      await fetchVoices();
      setRenamingVoiceId(null);
      setRenameInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename voice");
    } finally {
      setRenameSaving(false);
    }
  };

  // ============================================================
  // Test voice playback
  // ============================================================

  const PREVIEW_TEXT =
    "Brother Senior Warden, proceed to satisfy yourself that all present are Masons.";

  const testVoice = async (voice: LocalVoice) => {
    if (testingVoiceId) return; // already playing
    setTestingVoiceId(voice.id);
    setError(null);

    try {
      const resp = await fetchApi("/api/tts/voxtral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: PREVIEW_TEXT,
          refAudio: voice.audioBase64,
        }),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({ error: resp.statusText }));
        throw new Error((data as { error?: string }).error || "TTS failed");
      }

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setTestingVoiceId(null);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        setTestingVoiceId(null);
      };
      await audio.play();
    } catch (err) {
      setError(
        `Voice test failed: ${err instanceof Error ? err.message : "unknown error"}`
      );
      setTestingVoiceId(null);
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

  // ============================================================
  // Export / Import handlers
  // ============================================================

  const handleExport = async () => {
    try {
      const json = await exportVoices();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const date = new Date().toISOString().slice(0, 10);
      const a = document.createElement("a");
      a.href = url;
      a.download = `masonic-voices-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setSuccess(`Exported ${voices.length} voice(s).`);
    } catch {
      setError("Failed to export voices.");
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setError(null);
    setSuccess(null);

    try {
      const text = await file.text();
      const result = validateVoiceImport(text);
      if (!result.valid) {
        setError(result.error);
        return;
      }

      const { imported, skipped } = await importVoices(result.voices, voices);
      clearVoxtralVoicesCache();
      await fetchVoices();
      setSuccess(
        `Imported ${imported} voice(s)${skipped > 0 ? `, skipped ${skipped} duplicate(s)` : ""}.`
      );
    } catch {
      setError("Failed to import voices.");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

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
            <strong>Tips:</strong> 3-5 seconds is ideal. Shorter recordings = faster TTS response.
            Speak in the tone you want for rehearsal. A quiet room helps cloning quality.
          </p>
        </div>

        {/* Recording UI */}
        <div className="flex flex-col items-center gap-4">
          {/* Duration / Status */}
          <div className="text-center">
            {recordingState === "recording" && (
              <div className="flex flex-col items-center gap-2">
                <div className="flex items-center gap-2 text-red-400">
                  <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-2xl font-mono tabular-nums">
                    {duration}s
                  </span>
                  <span className="text-sm text-zinc-500">
                    (aim for 3-10 seconds)
                  </span>
                </div>
                {/* Mic level bar */}
                <div className="w-48 h-2 bg-zinc-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-75 ${
                      micLevel > 0.7
                        ? "bg-red-500"
                        : micLevel > 0.3
                          ? "bg-amber-500"
                          : "bg-green-500"
                    }`}
                    style={{ width: `${Math.min(micLevel * 100, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-zinc-600">
                  {micLevel > 0.7
                    ? "Too loud — move back from mic"
                    : micLevel < 0.05
                      ? "No audio detected"
                      : "Level looks good"}
                </p>
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
              </p>
            </div>
            <div>
              <label
                htmlFor="voice-role"
                className="block text-sm font-medium text-zinc-300 mb-1.5"
              >
                Assign to Officer Role
              </label>
              <select
                id="voice-role"
                value={voiceRole}
                onChange={(e) => setVoiceRole(e.target.value)}
                className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-zinc-200 focus:outline-none focus:border-amber-500 cursor-pointer"
              >
                {VOXTRAL_ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-200">
            Your Voice Profiles
            <span className="text-sm font-normal text-zinc-500 ml-2">
              ({voices.length} voice{voices.length !== 1 ? "s" : ""})
            </span>
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                const { changed } = await resetDefaultVoiceRoles();
                clearVoxtralVoicesCache();
                await fetchVoices();
                setSuccess(
                  changed > 0
                    ? `Reset ${changed} default voice role${changed === 1 ? "" : "s"} to shipped defaults.`
                    : "Default voice roles already match shipped defaults.",
                );
              }}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-medium transition-colors"
              title="Reset default character voices to their shipped role assignments. Does not touch your recorded voices."
            >
              Reset Defaults
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {importing ? "Importing..." : "Import"}
            </button>
            {voices.length > 0 && (
              <button
                onClick={handleExport}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-medium transition-colors"
              >
                Export
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImportFile}
            />
          </div>
        </div>

        {voices.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-zinc-500 text-sm">
              Loading default voices... If this persists, try refreshing the page.
              You can also record your own samples above.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {voices.map((voice) => (
              <div
                key={voice.id}
                className="bg-zinc-800/50 rounded-lg p-4 space-y-3"
              >
                {/* Top row: name + rename + delete */}
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {renamingVoiceId === voice.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={renameInput}
                          onChange={(e) => setRenameInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              saveRename(voice.id);
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              cancelRename();
                            }
                          }}
                          autoFocus
                          disabled={renameSaving}
                          className="flex-1 min-w-0 px-3 py-1.5 bg-zinc-800 border border-amber-500 rounded-lg text-zinc-200 text-sm focus:outline-none disabled:opacity-50"
                          placeholder="Voice name"
                        />
                        <button
                          onClick={() => saveRename(voice.id)}
                          disabled={renameSaving || !renameInput.trim()}
                          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg text-xs font-medium transition-colors"
                        >
                          {renameSaving ? "Saving..." : "Save"}
                        </button>
                        <button
                          onClick={cancelRename}
                          disabled={renameSaving}
                          className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="text-zinc-200 font-medium truncate">
                          {voice.name}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {voice.duration}s &middot;{" "}
                          {new Date(voice.createdAt).toLocaleDateString()}
                        </p>
                      </>
                    )}
                  </div>
                  {renamingVoiceId !== voice.id && (
                    <div className="flex items-center flex-shrink-0">
                      <button
                        onClick={() => startRename(voice)}
                        className="p-2 text-zinc-600 hover:text-amber-400 transition-colors"
                        title="Rename voice"
                        aria-label={`Rename ${voice.name}`}
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(voice.id, voice.name)}
                        className="p-2 text-zinc-600 hover:text-red-400 transition-colors"
                        title="Delete voice"
                        aria-label={`Delete ${voice.name}`}
                      >
                        <svg
                          className="w-5 h-5"
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
                  )}
                </div>

                {/* Bottom row: role dropdown + play button */}
                <div className="flex items-center gap-2">
                  <select
                    value={voice.role || ""}
                    onChange={async (e) => {
                      const role = e.target.value || undefined;
                      await assignVoiceRole(voice.id, role);
                      clearVoxtralVoicesCache();
                      fetchVoices();
                    }}
                    className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-300 text-sm focus:outline-none focus:border-amber-500 cursor-pointer"
                  >
                    {VOXTRAL_ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => testVoice(voice)}
                    disabled={testingVoiceId !== null}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg text-sm font-medium transition-colors flex-shrink-0"
                    title="Preview this voice"
                  >
                    {testingVoiceId === voice.id ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                    {testingVoiceId === voice.id ? "Playing..." : "Test"}
                  </button>
                </div>
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
