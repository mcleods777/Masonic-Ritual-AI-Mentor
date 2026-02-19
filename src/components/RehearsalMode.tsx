"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { RitualSectionWithCipher } from "@/lib/storage";
import { ROLE_DISPLAY_NAMES, cleanRitualText } from "@/lib/document-parser";
import { compareTexts, type ComparisonResult } from "@/lib/text-comparison";
import {
  createWebSpeechEngine,
  createWhisperEngine,
  isWebSpeechAvailable,
  isMediaRecorderAvailable,
  type STTEngine,
  type STTProvider,
} from "@/lib/speech-to-text";
import {
  speakAsRole,
  assignVoicesToRoles,
  stopSpeaking,
  isTTSAvailable,
  type RoleVoiceProfile,
} from "@/lib/text-to-speech";
import { playGavelKnocks, countGavelMarks } from "@/lib/gavel-sound";
import DiffDisplay from "./DiffDisplay";

interface RehearsalModeProps {
  sections: RitualSectionWithCipher[];
}

type RehearsalState =
  | "setup"         // Picking a role
  | "ready"         // Role picked, ready to start
  | "ai-speaking"   // AI is reading another officer's line
  | "user-turn"     // Waiting for user to recite
  | "listening"     // User is speaking (STT active)
  | "transcribing"  // Whisper: recording done, waiting for server transcript
  | "checking"      // Showing accuracy for user's line
  | "complete";     // Rehearsal finished

interface LineResult {
  sectionIndex: number;
  accuracy: number;
  comparison: ComparisonResult;
}

export default function RehearsalMode({ sections }: RehearsalModeProps) {
  // Setup state
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [rehearsalState, setRehearsalState] = useState<RehearsalState>("setup");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [currentComparison, setCurrentComparison] = useState<ComparisonResult | null>(null);
  const [lineResults, setLineResults] = useState<LineResult[]>([]);
  const [sttError, setSttError] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<"voice" | "type">("voice");
  const [sttProvider, setSTTProvider] = useState<STTProvider>("browser");

  const engineRef = useRef<STTEngine | null>(null);
  const sttProviderRef = useRef<STTProvider>(sttProvider);
  sttProviderRef.current = sttProvider;
  const voiceMapRef = useRef<Map<string, RoleVoiceProfile>>(new Map());
  const cancelledRef = useRef(false);
  const scriptContainerRef = useRef<HTMLDivElement>(null);

  // Extract unique roles from sections (only those with speaker lines)
  const availableRoles = useMemo(() => {
    const roles = new Set<string>();
    for (const section of sections) {
      if (section.speaker) {
        roles.add(section.speaker);
      }
    }
    return Array.from(roles);
  }, [sections]);

  // Build voice map when roles are known
  useEffect(() => {
    if (availableRoles.length > 0) {
      voiceMapRef.current = assignVoicesToRoles(availableRoles);
    }
  }, [availableRoles]);

  // Scroll current line into view
  useEffect(() => {
    const el = document.getElementById(`rehearsal-line-${currentIndex}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentIndex]);

  const currentSection = sections[currentIndex] || null;
  const isUserLine = currentSection?.speaker === selectedRole;

  // Count how many of the user's lines exist in this ceremony
  const userLineCount = useMemo(() => {
    if (!selectedRole) return 0;
    return sections.filter((s) => s.speaker === selectedRole).length;
  }, [sections, selectedRole]);

  // Overall accuracy across all user lines
  const overallAccuracy = useMemo(() => {
    if (lineResults.length === 0) return 0;
    const total = lineResults.reduce((sum, r) => sum + r.accuracy, 0);
    return Math.round(total / lineResults.length);
  }, [lineResults]);

  // Get display name for a role
  const getRoleDisplayName = useCallback((role: string): string => {
    return ROLE_DISPLAY_NAMES[role] || role;
  }, []);

  // Start the rehearsal — begin advancing through sections
  const startRehearsal = useCallback(() => {
    cancelledRef.current = false;
    setCurrentIndex(0);
    setLineResults([]);
    setRehearsalState("ready");
    // Advance will be triggered by effect
  }, []);

  // Advance to next line and handle AI speaking vs user turn
  const advanceToLine = useCallback(async (index: number) => {
    if (cancelledRef.current || index >= sections.length) {
      setRehearsalState("complete");
      return;
    }

    setCurrentIndex(index);
    setTranscript("");
    setCurrentComparison(null);
    setSttError(null);

    const section = sections[index];

    // Check for gavel marks and play knock sounds (use MRAM field first)
    const gavelCount = section.gavels > 0 ? section.gavels : countGavelMarks(section.text);
    if (gavelCount > 0 && !cancelledRef.current) {
      await playGavelKnocks(gavelCount);
    }

    if (cancelledRef.current) return;

    if (section.speaker === selectedRole) {
      // It's the user's turn
      setRehearsalState("user-turn");
    } else if (section.speaker) {
      // AI reads this line
      setRehearsalState("ai-speaking");

      try {
        const cleanText = cleanRitualText(section.text);
        if (cleanText) {
          await speakAsRole(cleanText, section.speaker, voiceMapRef.current);
        }
      } catch (err) {
        console.warn(`TTS failed for line ${index} (${section.speaker}):`, err);
        // Brief pause so we don't zip through the script on repeated failures
        await new Promise((r) => setTimeout(r, 800));
      }

      if (!cancelledRef.current) {
        // Auto-advance to next line after speaking
        advanceToLine(index + 1);
      }
    } else {
      // No speaker (stage direction, etc.) — skip
      advanceToLine(index + 1);
    }
  }, [sections, selectedRole]);

  // Trigger first advance when rehearsal starts
  useEffect(() => {
    if (rehearsalState === "ready") {
      advanceToLine(0);
    }
  }, [rehearsalState, advanceToLine]);

  // Start listening (voice input) — uses either Web Speech or Whisper engine
  const startListening = useCallback(() => {
    const provider = sttProviderRef.current;

    if (provider === "browser" && !isWebSpeechAvailable()) {
      setSttError("Speech recognition not available. Use Chrome, Edge, or Safari.");
      return;
    }
    if (provider === "whisper" && !isMediaRecorderAvailable()) {
      setSttError("MediaRecorder not available in this browser.");
      return;
    }

    setSttError(null);
    setTranscript("");

    try {
      const engine = provider === "whisper"
        ? createWhisperEngine()
        : createWebSpeechEngine();

      engineRef.current = engine;

      engine.onResult = (result) => {
        setTranscript(result.transcript);
        // Whisper returns a single final result after transcription completes.
        // Automatically move to checking state.
        if (provider === "whisper" && result.isFinal) {
          setRehearsalState("listening"); // briefly show transcript before check runs
        }
      };

      engine.onError = (error) => {
        setSttError(error);
        setRehearsalState("user-turn");
      };

      engine.onEnd = () => {
        // Browser engine: may auto-stop after silence (no action needed)
        // Whisper engine: recording stopped, transcript delivered via onResult
      };

      engine.start();
      setRehearsalState("listening");
    } catch (err) {
      setSttError(err instanceof Error ? err.message : "Failed to start speech recognition");
    }
  }, []);

  // Stop listening and check accuracy
  const stopListening = useCallback(() => {
    const provider = sttProviderRef.current;

    if (engineRef.current) {
      engineRef.current.stop();
    }

    if (provider === "whisper") {
      // Whisper: recording stopped, now waiting for server transcription.
      // The engine's onResult callback will fire once the transcript arrives.
      // We show a "transcribing" spinner in the meantime.
      setRehearsalState("transcribing");
    } else {
      // Browser STT: transcript is already available in state
      engineRef.current = null;
      if (transcript && currentSection) {
        const cleanRef = cleanRitualText(currentSection.text);
        const result = compareTexts(transcript, cleanRef);
        setCurrentComparison(result);
        setLineResults((prev) => [
          ...prev,
          { sectionIndex: currentIndex, accuracy: result.accuracy, comparison: result },
        ]);
      }
      setRehearsalState("checking");
    }
  }, [transcript, currentSection, currentIndex]);

  // When Whisper finishes transcribing, the transcript state updates.
  // This effect detects that and moves from "transcribing" → "checking".
  useEffect(() => {
    if (rehearsalState === "transcribing" && transcript && currentSection) {
      engineRef.current = null;
      const cleanRef = cleanRitualText(currentSection.text);
      const result = compareTexts(transcript, cleanRef);
      setCurrentComparison(result);
      setLineResults((prev) => [
        ...prev,
        { sectionIndex: currentIndex, accuracy: result.accuracy, comparison: result },
      ]);
      setRehearsalState("checking");
    }
  }, [rehearsalState, transcript, currentSection, currentIndex]);

  // Check typed input
  const handleCheckTyped = useCallback(() => {
    if (transcript && currentSection) {
      const cleanRef = cleanRitualText(currentSection.text);
      const result = compareTexts(transcript, cleanRef);
      setCurrentComparison(result);
      setLineResults((prev) => [
        ...prev,
        { sectionIndex: currentIndex, accuracy: result.accuracy, comparison: result },
      ]);
      setRehearsalState("checking");
    }
  }, [transcript, currentSection, currentIndex]);

  // Continue to next line after checking
  const continueAfterCheck = useCallback(() => {
    advanceToLine(currentIndex + 1);
  }, [advanceToLine, currentIndex]);

  // Skip user's line (they can't remember)
  const skipLine = useCallback(() => {
    if (currentSection) {
      setLineResults((prev) => [
        ...prev,
        {
          sectionIndex: currentIndex,
          accuracy: 0,
          comparison: {
            diffs: [],
            accuracy: 0,
            totalWords: 0,
            correctWords: 0,
            phoneticMatches: 0,
            fuzzyMatches: 0,
            wrongWords: 0,
            missingWords: currentSection.text.split(/\s+/).length,
            extraWords: 0,
            troubleSpots: [],
          },
        },
      ]);
    }
    advanceToLine(currentIndex + 1);
  }, [advanceToLine, currentIndex, currentSection]);

  // Stop/cancel the entire rehearsal
  const stopRehearsal = useCallback(() => {
    cancelledRef.current = true;
    stopSpeaking();
    if (engineRef.current) {
      engineRef.current.stop();
      engineRef.current = null;
    }
    setRehearsalState("setup");
    setCurrentIndex(0);
    setTranscript("");
    setCurrentComparison(null);
    setLineResults([]);
    setSttError(null);
  }, []);

  // Restart rehearsal
  const restartRehearsal = useCallback(() => {
    setLineResults([]);
    setCurrentComparison(null);
    setTranscript("");
    startRehearsal();
  }, [startRehearsal]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      if (engineRef.current) {
        engineRef.current.stop();
      }
      stopSpeaking();
    };
  }, []);

  // ============================================================
  // RENDER
  // ============================================================

  // Setup: pick a role
  if (rehearsalState === "setup") {
    return (
      <div className="space-y-6">
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <h2 className="text-lg font-semibold text-zinc-200 mb-2">
            Choose Your Role
          </h2>
          <p className="text-sm text-zinc-500 mb-6">
            Select the officer role you want to practice. The AI will read all
            other parts aloud with distinct voices, and pause when it&apos;s your
            turn to recite.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {availableRoles.map((role) => {
              const lineCount = sections.filter((s) => s.speaker === role).length;
              return (
                <button
                  key={role}
                  onClick={() => setSelectedRole(role)}
                  className={`
                    text-left px-5 py-4 rounded-lg border transition-all
                    ${
                      selectedRole === role
                        ? "border-amber-500 bg-amber-500/10 text-amber-200 ring-1 ring-amber-500/30"
                        : "border-zinc-700 hover:border-zinc-600 text-zinc-300 hover:text-zinc-200"
                    }
                  `}
                >
                  <span className="font-semibold text-base">{role}</span>
                  <span className="block text-sm text-zinc-500 mt-1">
                    {getRoleDisplayName(role)} &middot; {lineCount} line{lineCount !== 1 ? "s" : ""}
                  </span>
                </button>
              );
            })}
          </div>

          {selectedRole && (
            <div className="mt-6 space-y-4">
              {/* STT engine selector */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-500 uppercase tracking-wide">Voice Engine:</span>
                <div className="flex rounded-lg border border-zinc-700 overflow-hidden">
                  <button
                    onClick={() => setSTTProvider("browser")}
                    className={`px-4 py-2 text-xs font-medium transition-colors ${
                      sttProvider === "browser"
                        ? "bg-amber-600 text-white"
                        : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Browser
                  </button>
                  <button
                    onClick={() => setSTTProvider("whisper")}
                    className={`px-4 py-2 text-xs font-medium transition-colors ${
                      sttProvider === "whisper"
                        ? "bg-amber-600 text-white"
                        : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Whisper (Groq)
                  </button>
                </div>
                <span className="text-xs text-zinc-600">
                  {sttProvider === "whisper"
                    ? "Higher accuracy, Masonic vocabulary hints"
                    : "Free, real-time, browser-native"}
                </span>
              </div>

              <div className="flex items-center gap-4">
                <button
                  onClick={startRehearsal}
                  className="px-8 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-semibold transition-colors flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Start Rehearsal
                </button>
                {!isTTSAvailable() && (
                  <p className="text-xs text-red-400">
                    Text-to-speech is not available in this browser. AI lines will be shown but not spoken.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Completed rehearsal
  if (rehearsalState === "complete") {
    return (
      <div className="space-y-6">
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <h2 className="text-xl font-semibold text-zinc-200 mb-2">
            Rehearsal Complete
          </h2>
          <p className="text-zinc-400 mb-6">
            You practiced as <span className="text-amber-400 font-medium">{selectedRole}</span>{" "}
            ({getRoleDisplayName(selectedRole!)}).
          </p>

          {/* Overall score */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-zinc-800 rounded-lg p-4 text-center">
              <p className={`text-3xl font-bold ${
                overallAccuracy >= 85 ? "text-green-400" :
                overallAccuracy >= 70 ? "text-amber-400" :
                overallAccuracy >= 50 ? "text-orange-400" : "text-red-400"
              }`}>
                {overallAccuracy}%
              </p>
              <p className="text-xs text-zinc-500 mt-1">Overall Accuracy</p>
            </div>
            <div className="bg-zinc-800 rounded-lg p-4 text-center">
              <p className="text-3xl font-bold text-amber-400">{lineResults.length}</p>
              <p className="text-xs text-zinc-500 mt-1">Lines Practiced</p>
            </div>
            <div className="bg-zinc-800 rounded-lg p-4 text-center">
              <p className="text-3xl font-bold text-green-400">
                {lineResults.filter((r) => r.accuracy >= 90).length}
              </p>
              <p className="text-xs text-zinc-500 mt-1">Lines Nailed</p>
            </div>
          </div>

          {/* Per-line results */}
          {lineResults.length > 0 && (
            <div className="space-y-3 mb-6">
              <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wide">
                Line-by-line Results
              </h3>
              {lineResults.map((result, i) => {
                const section = sections[result.sectionIndex];
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-4 py-3 bg-zinc-800/50 rounded-lg"
                  >
                    <span className={`text-lg font-bold w-12 text-right ${
                      result.accuracy >= 90 ? "text-green-400" :
                      result.accuracy >= 70 ? "text-amber-400" :
                      result.accuracy >= 50 ? "text-orange-400" : "text-red-400"
                    }`}>
                      {result.accuracy}%
                    </span>
                    <span className="text-zinc-500">|</span>
                    <span className="text-zinc-300 text-sm truncate flex-1 font-mono">
                      {(section?.cipherText || cleanRitualText(section?.text || "")).slice(0, 80)}...
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={restartRehearsal}
              className="px-6 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium transition-colors"
            >
              Rehearse Again
            </button>
            <button
              onClick={stopRehearsal}
              className="px-6 py-3 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg font-medium transition-colors"
            >
              Change Role
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Active rehearsal (ai-speaking, user-turn, listening, checking)
  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-200">
            Rehearsal — <span className="text-amber-400">{selectedRole}</span>
          </h2>
          <p className="text-xs text-zinc-500">
            Line {currentIndex + 1} of {sections.length} &middot;{" "}
            {lineResults.length} of {userLineCount} of your lines practiced
          </p>
        </div>
        <button
          onClick={stopRehearsal}
          className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg text-sm transition-colors"
        >
          Stop
        </button>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-zinc-800 rounded-full h-2">
        <div
          className="bg-amber-500 h-2 rounded-full transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / sections.length) * 100}%` }}
        />
      </div>

      {/* Script view — shows a few lines of context */}
      <div
        ref={scriptContainerRef}
        className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 max-h-60 overflow-y-auto"
      >
        {sections.map((section, i) => {
          const isPast = i < currentIndex;
          const isCurrent = i === currentIndex;
          const isUserSection = section.speaker === selectedRole;
          // Use MRAM gavels field when available, fall back to parsing from text
          const gavels = section.gavels > 0 ? section.gavels : countGavelMarks(section.text);
          const cleanText = cleanRitualText(section.text);

          return (
            <div
              key={section.id}
              id={`rehearsal-line-${i}`}
              className={`
                flex gap-3 px-3 py-2 rounded-lg mb-1 transition-all
                ${isPast ? "opacity-30" : ""}
                ${isCurrent && isUserSection ? "bg-amber-500/10 border border-amber-500/30" : ""}
                ${isCurrent && !isUserSection ? "bg-blue-500/10 border border-blue-500/20" : ""}
                ${!isCurrent && !isPast ? "opacity-60" : ""}
              `}
            >
              <span
                className={`
                  text-xs font-mono font-bold w-10 flex-shrink-0 pt-0.5 text-right
                  ${isCurrent && isUserSection ? "text-amber-400" : ""}
                  ${isCurrent && !isUserSection ? "text-blue-400" : ""}
                  ${!isCurrent ? "text-zinc-600" : ""}
                `}
              >
                {section.speaker || "---"}
              </span>
              <span
                className={`
                  text-sm flex-1
                  ${isCurrent && isUserSection ? "text-amber-200" : ""}
                  ${isCurrent && !isUserSection ? "text-blue-200" : ""}
                  ${isPast ? "text-zinc-600" : "text-zinc-400"}
                `}
              >
                {gavels > 0 && (
                  <span className="inline-flex gap-0.5 mr-1.5 align-middle" title={`${gavels} gavel knock${gavels !== 1 ? "s" : ""}`}>
                    {Array.from({ length: gavels }).map((_, g) => (
                      <span key={g} className="inline-block w-2 h-2 rounded-full bg-yellow-600/70" />
                    ))}
                  </span>
                )}
                {isCurrent && isUserSection && rehearsalState !== "checking"
                  ? "[ Your line — recite from memory ]"
                  : (() => {
                      // Show cipher text in script view; fall back to clean plain text for non-MRAM docs
                      const displayText = (section.cipherText && section.cipherText !== section.text)
                        ? section.cipherText
                        : cleanText;
                      return displayText.slice(0, 120) +
                        (displayText.length > 120 ? "..." : "");
                    })()}
              </span>
            </div>
          );
        })}
      </div>

      {/* Active area */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
        {/* AI speaking */}
        {rehearsalState === "ai-speaking" && currentSection && (
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-3 text-blue-400">
              <div className="flex gap-1">
                <div className="w-1.5 h-6 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-1.5 h-8 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-1.5 h-5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                <div className="w-1.5 h-7 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "450ms" }} />
              </div>
              <span className="text-sm font-medium">
                {currentSection.speaker} ({getRoleDisplayName(currentSection.speaker!)}) is speaking...
              </span>
            </div>
            <p className="text-zinc-400 text-sm max-w-lg mx-auto font-mono">
              {currentSection.cipherText || cleanRitualText(currentSection.text)}
            </p>
          </div>
        )}

        {/* User's turn — waiting to start */}
        {rehearsalState === "user-turn" && currentSection && (
          <div className="space-y-4">
            <div className="text-center">
              <span className="inline-block px-3 py-1 bg-amber-500/20 text-amber-400 rounded-full text-sm font-semibold mb-3">
                YOUR TURN — {selectedRole}
              </span>
              <p className="text-zinc-400 text-sm">
                Recite your line from memory. You can speak or type.
              </p>
            </div>

            <div className="flex justify-center gap-3">
              <button
                onClick={() => {
                  setInputMode("voice");
                  startListening();
                }}
                className="px-6 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                </svg>
                Speak
              </button>
              <button
                onClick={() => {
                  setInputMode("type");
                  setTranscript("");
                }}
                className="px-6 py-3 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg font-medium transition-colors"
              >
                Type
              </button>
              <button
                onClick={skipLine}
                className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-lg font-medium transition-colors text-sm"
              >
                Skip
              </button>
            </div>

            {/* Type input area */}
            {inputMode === "type" && rehearsalState === "user-turn" && (
              <div>
                <textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder="Type your line from memory..."
                  className="w-full h-24 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500 resize-none"
                  autoFocus
                />
                <button
                  onClick={handleCheckTyped}
                  disabled={!transcript.trim()}
                  className="mt-2 px-6 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg font-medium transition-colors"
                >
                  Check My Line
                </button>
              </div>
            )}
          </div>
        )}

        {/* Listening */}
        {rehearsalState === "listening" && (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-3 text-amber-400">
              <div className="flex gap-1">
                <div className="w-1.5 h-6 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-1.5 h-8 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-1.5 h-5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                <div className="w-1.5 h-7 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: "450ms" }} />
                <div className="w-1.5 h-4 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: "600ms" }} />
              </div>
              <span className="text-sm font-medium">
                Listening — speak your line...
              </span>
            </div>

            {transcript && (
              <div className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
                <p className="text-zinc-300 text-sm italic">{transcript}</p>
              </div>
            )}

            <div className="flex justify-center">
              <button
                onClick={stopListening}
                className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2 animate-pulse"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
                Done Speaking
              </button>
            </div>
          </div>
        )}

        {/* Transcribing — Whisper processing audio */}
        {rehearsalState === "transcribing" && (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-3 text-purple-400">
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm font-medium">
                Transcribing with Whisper...
              </span>
            </div>
            <p className="text-xs text-zinc-500 text-center">
              Sending audio to Groq for high-accuracy transcription
            </p>
          </div>
        )}

        {/* Checking — showing accuracy */}
        {rehearsalState === "checking" && currentSection && (
          <div className="space-y-4">
            {currentComparison ? (
              <>
                <DiffDisplay result={currentComparison} />

                {/* Show reference text if they got it wrong */}
                {currentComparison.accuracy < 100 && (
                  <div className="p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
                    <p className="text-xs text-zinc-500 mb-1">Correct text:</p>
                    <p className="text-sm text-zinc-300">
                      {cleanRitualText(currentSection.text)}
                    </p>
                  </div>
                )}

                <div className="flex justify-center">
                  <button
                    onClick={continueAfterCheck}
                    className="px-8 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-semibold transition-colors flex items-center gap-2"
                  >
                    Continue
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center">
                <p className="text-zinc-400 text-sm mb-4">
                  No recitation captured. Try again or skip this line.
                </p>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={() => setRehearsalState("user-turn")}
                    className="px-6 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium transition-colors"
                  >
                    Try Again
                  </button>
                  <button
                    onClick={continueAfterCheck}
                    className="px-6 py-3 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg font-medium transition-colors"
                  >
                    Skip
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STT error */}
        {sttError && (
          <div className="mt-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
            {sttError}
          </div>
        )}
      </div>
    </div>
  );
}
