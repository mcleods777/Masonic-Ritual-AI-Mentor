"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import type { RitualSectionWithCipher } from "@/lib/storage";
import { ROLE_DISPLAY_NAMES, cleanRitualText } from "@/lib/document-parser";
import { compareTexts, type ComparisonResult } from "@/lib/text-comparison";
import { getRoleIcon } from "./MasonicIcons";
import {
  createWebSpeechEngine,
  createWhisperEngine,
  isWebSpeechAvailable,
  isMediaRecorderAvailable,
  type STTEngine,
  type STTProvider,
} from "@/lib/speech-to-text";
import {
  speak,
  speakAsRole,
  assignVoicesToRoles,
  stopSpeaking,
  isTTSAvailable,
  getLastTTSError,
  clearLastTTSError,
  type RoleVoiceProfile,
} from "@/lib/text-to-speech";
import { playGavelKnocks, countGavelMarks } from "@/lib/gavel-sound";
import { VOXTRAL_ROLE_OPTIONS } from "@/lib/tts-cloud";
import DiffDisplay from "./DiffDisplay";
import {
  saveSession,
  buildPerformanceContext,
  type PracticeSession,
  type LineScore,
} from "@/lib/performance-history";

interface RehearsalModeProps {
  sections: RitualSectionWithCipher[];
  documentId?: string;
  documentTitle?: string;
}

type RehearsalState =
  | "setup"         // Picking a role
  | "ready"         // Role picked, ready to start
  | "ai-speaking"   // AI is reading another officer's line
  | "user-turn"     // Waiting for user to recite
  | "listening"     // User is speaking (STT active)
  | "transcribing"  // Whisper: recording done, waiting for server transcript
  | "auto-checking" // Browser STT auto-stopped — compute comparison
  | "checking"      // Showing accuracy for user's line
  | "complete";     // Rehearsal finished

interface LineResult {
  sectionIndex: number;
  accuracy: number;
  comparison: ComparisonResult;
}

export default function RehearsalMode({ sections, documentId, documentTitle }: RehearsalModeProps) {
  // Setup state
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [rehearsalState, setRehearsalState] = useState<RehearsalState>("setup");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [currentComparison, setCurrentComparison] = useState<ComparisonResult | null>(null);
  const [lineResults, setLineResults] = useState<LineResult[]>([]);
  const [sttError, setSttError] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<"voice" | "type">("voice");
  const [sttProvider, setSTTProvider] = useState<STTProvider>("whisper");
  const [aiCoaching, setAiCoaching] = useState(true);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const [isSpeakingFeedback, setIsSpeakingFeedback] = useState(false);
  const [feedbackVoice, setFeedbackVoice] = useState<string>("Narrator");
  const [ttsToast, setTtsToast] = useState<string | null>(null);
  const [autoStop, setAutoStop] = useState(true);

  const engineRef = useRef<STTEngine | null>(null);
  const sttProviderRef = useRef<STTProvider>(sttProvider);
  sttProviderRef.current = sttProvider;
  const transcriptRef = useRef<string>("");
  transcriptRef.current = transcript;
  const voiceMapRef = useRef<Map<string, RoleVoiceProfile>>(new Map());
  const cancelledRef = useRef(false);
  const advanceGenRef = useRef(0); // generation counter to prevent overlapping advanceToLine chains
  const scriptContainerRef = useRef<HTMLDivElement>(null);
  const startListeningRef = useRef<() => void>(() => {});
  const stopListeningRef = useRef<() => void>(() => { });
  const autoStopRef = useRef(autoStop);
  autoStopRef.current = autoStop;
  const sessionStartRef = useRef<string>(new Date().toISOString());
  const perfContextRef = useRef<string>("");

  // Load performance context on mount for AI feedback
  useEffect(() => {
    buildPerformanceContext()
      .then((ctx) => { perfContextRef.current = ctx; })
      .catch(console.error);
  }, []);

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

  // Track whether the user is manually scrolling — suppress auto-scroll if so
  const userScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const container = scriptContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      userScrollingRef.current = true;
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      // Re-enable auto-scroll after 5 seconds of no manual scrolling
      scrollTimeoutRef.current = setTimeout(() => {
        userScrollingRef.current = false;
      }, 5000);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  // Scroll current line into view (only if user isn't manually scrolling)
  useEffect(() => {
    if (userScrollingRef.current) return;
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
    sessionStartRef.current = new Date().toISOString();
    setCurrentIndex(0);
    setLineResults([]);
    setRehearsalState("ready");
    // Advance will be triggered by effect
  }, []);

  // Internal advance — walks through lines with a generation guard.
  // Only the matching generation is allowed to continue; a new call
  // to advanceToLine() bumps the generation so any old chain exits.
  const advanceInternal = useCallback(async (index: number, gen: number) => {
    if (cancelledRef.current || index >= sections.length) {
      setRehearsalState("complete");
      return;
    }

    const stale = () => cancelledRef.current || gen !== advanceGenRef.current;

    setCurrentIndex(index);
    setTranscript("");
    setCurrentComparison(null);
    setSttError(null);

    const section = sections[index];

    // Check for gavel marks and play knock sounds (use MRAM field first)
    const gavelCount = section.gavels > 0 ? section.gavels : countGavelMarks(section.text);
    if (gavelCount > 0 && !stale()) {
      await playGavelKnocks(gavelCount);
    }

    if (stale()) return;

    if (section.speaker === selectedRole) {
      // It's the user's turn — auto-start listening (hands-free)
      setRehearsalState("listening");
      // Small delay so the UI updates before mic activates
      setTimeout(() => {
        if (!cancelledRef.current) startListeningRef.current();
      }, 400);
      return;
    } else if (section.speaker) {
      // AI reads this line
      setRehearsalState("ai-speaking");

      const cleanText = cleanRitualText(section.text);
      if (cleanText) {
        let spoken = false;
        for (let attempt = 0; attempt < 2 && !spoken; attempt++) {
          if (stale()) return;
          try {
            await speakAsRole(cleanText, section.speaker, voiceMapRef.current);
            spoken = true;
            // Check if a fallback was used (primary engine failed but browser worked)
            const fallbackMsg = getLastTTSError();
            if (fallbackMsg) {
              setTtsToast(fallbackMsg + " — using browser voice as fallback");
              clearLastTTSError();
              setTimeout(() => setTtsToast(null), 5000);
            }
          } catch (err) {
            // Don't retry if this was an intentional abort
            if (err instanceof DOMException && err.name === "AbortError") return;
            console.warn(
              `TTS failed for line ${index} (${section.speaker}), attempt ${attempt + 1}:`,
              err
            );
            if (attempt === 0) {
              await new Promise((r) => setTimeout(r, 1000));
            } else {
              await new Promise((r) => setTimeout(r, 1500));
            }
          }
        }
      }

      if (!stale()) {
        // Small gap between lines to avoid hammering the TTS API
        await new Promise((r) => setTimeout(r, 150));
        // Auto-advance to next line (same generation — not a new entry)
        advanceInternal(index + 1, gen);
      }
    } else {
      // No speaker (stage direction, etc.) — brief pause then skip
      await new Promise((r) => setTimeout(r, 150));
      if (!stale()) {
        advanceInternal(index + 1, gen);
      }
    }
  }, [sections, selectedRole]);

  // Public entry point — bumps generation to cancel any running chain
  const advanceToLine = useCallback((index: number) => {
    stopSpeaking();
    const gen = ++advanceGenRef.current;
    advanceInternal(index, gen);
  }, [advanceInternal]);

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
        // Whisper: the final transcript update triggers the "transcribing" → "checking"
        // effect. No state change needed here — the effect handles the transition.
      };

      engine.onError = (error) => {
        setSttError(error);
        setRehearsalState("user-turn");
      };

      engine.onEnd = () => {
        // Browser engine: auto-stopped after silence — trigger accuracy check
        if (provider === "browser" && transcriptRef.current) {
          engineRef.current = null;
          setRehearsalState("auto-checking");
        }
        // Whisper engine: recording stopped, transcript delivered via onResult
      };

      engine.onSilence = () => {
        if (!autoStopRef.current) return;
        stopListeningRef.current();
      };

      engine.start();
      setRehearsalState("listening");
    } catch (err) {
      setSttError(err instanceof Error ? err.message : "Failed to start speech recognition");
    }
  }, []);

  // Keep ref in sync so advanceToLine can call it without circular deps
  startListeningRef.current = startListening;

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
  stopListeningRef.current = stopListening;

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

  // Browser STT auto-stopped after silence — compute comparison and show results.
  useEffect(() => {
    if (rehearsalState === "auto-checking" && transcript && currentSection) {
      const cleanRef = cleanRitualText(currentSection.text);
      const result = compareTexts(transcript, cleanRef);
      setCurrentComparison(result);
      setLineResults((prev) => [
        ...prev,
        { sectionIndex: currentIndex, accuracy: result.accuracy, comparison: result },
      ]);
      setRehearsalState("checking");
    } else if (rehearsalState === "auto-checking") {
      // No transcript captured — go back to user-turn
      setRehearsalState("user-turn");
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
    stopSpeaking();
    setIsSpeakingFeedback(false);
    setAiFeedback(null);
    advanceToLine(currentIndex + 1);
  }, [advanceToLine, currentIndex]);

  // Retry the current line — remove last result and auto-start listening
  const retryCurrentLine = useCallback(() => {
    stopSpeaking();
    setIsSpeakingFeedback(false);
    setAiFeedback(null);
    setCurrentComparison(null);
    setTranscript("");
    setLineResults((prev) => prev.slice(0, -1));
    setRehearsalState("listening");
    setTimeout(() => {
      if (!cancelledRef.current) startListeningRef.current();
    }, 400);
  }, []);

  // Fetch AI coaching feedback and speak it aloud
  const fetchAndSpeakFeedback = useCallback(
    async (comparison: ComparisonResult) => {
      if (!aiCoaching || !isTTSAvailable()) return;

      try {
        const res = await fetch("/api/rehearsal-feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accuracy: comparison.accuracy,
            wrongWords: comparison.wrongWords,
            missingWords: comparison.missingWords,
            troubleSpots: comparison.troubleSpots,
            lineNumber: lineResults.length + 1,
            totalLines: userLineCount,
            performanceContext: perfContextRef.current,
          }),
        });

        if (!res.ok) return;

        // Stream the response — show text as it arrives, then speak once complete
        const reader = res.body?.getReader();
        if (!reader) return;
        const decoder = new TextDecoder();
        let feedback = "";
        while (true) {
          const { done, value } = await reader.read();
          if (cancelledRef.current) { reader.cancel(); return; }
          if (done) break;
          feedback += decoder.decode(value, { stream: true });
          setAiFeedback(feedback);
        }
        if (!feedback.trim()) return;

        setIsSpeakingFeedback(true);
        await speakAsRole(feedback, feedbackVoice, voiceMapRef.current);
      } catch {
        // Non-critical — silently skip if feedback fails
      } finally {
        setIsSpeakingFeedback(false);
      }
    },
    [aiCoaching, feedbackVoice, lineResults.length, userLineCount]
  );

  // Trigger AI coaching feedback when a line is checked
  useEffect(() => {
    if (rehearsalState === "checking" && currentComparison && aiCoaching) {
      fetchAndSpeakFeedback(currentComparison);
    }
  }, [rehearsalState, currentComparison, aiCoaching, fetchAndSpeakFeedback]);

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
    setAiFeedback(null);
    setIsSpeakingFeedback(false);
  }, []);

  // Restart rehearsal
  const restartRehearsal = useCallback(() => {
    setLineResults([]);
    setCurrentComparison(null);
    setTranscript("");
    setAiFeedback(null);
    setIsSpeakingFeedback(false);
    startRehearsal();
  }, [startRehearsal]);

  // Jump to any line — speaks the clicked line first, then continues rehearsal.
  const jumpToLine = useCallback(
    async (index: number) => {
      if (index < 0 || index >= sections.length) return;

      // Stop everything in-flight
      const gen = ++advanceGenRef.current;
      cancelledRef.current = false;
      stopSpeaking();
      if (engineRef.current) {
        engineRef.current.stop();
        engineRef.current = null;
      }
      setAiFeedback(null);
      setIsSpeakingFeedback(false);
      setTranscript("");
      setCurrentComparison(null);
      setSttError(null);
      setCurrentIndex(index);

      const section = sections[index];
      const stale = () => cancelledRef.current || gen !== advanceGenRef.current;

      // Play gavel knocks if present
      const gavelCount = section.gavels > 0 ? section.gavels : countGavelMarks(section.text);
      if (gavelCount > 0 && !stale()) {
        await playGavelKnocks(gavelCount);
      }
      if (stale()) return;

      // Speak the clicked line (even stage directions / narrator)
      const cleanText = cleanRitualText(section.text);
      if (cleanText && section.speaker) {
        setRehearsalState("ai-speaking");
        try {
          await speakAsRole(cleanText, section.speaker, voiceMapRef.current);
        } catch {
          /* ignore */
        }
      }

      if (stale()) return;

      // Now continue rehearsal from the next line using advanceToLine
      // (which bumps generation, killing this chain's gen — that's fine)
      advanceToLine(index + 1);
    },
    [sections, advanceToLine],
  );

  // Click-to-speak: tap the current line's text to re-hear it (one-shot).
  // Non-current lines are handled by jumpToLine on the outer div.
  const handleCurrentLineSpeak = useCallback(
    async (index: number, e: React.MouseEvent) => {
      e.stopPropagation();
      const section = sections[index];
      if (!section) return;

      // Kill any running advanceInternal chain (bumps generation + stops audio)
      ++advanceGenRef.current;
      cancelledRef.current = true;
      stopSpeaking();

      // Clear the "AI speaking" overlay so it doesn't stick
      if (rehearsalState === "ai-speaking") {
        setRehearsalState("user-turn");
      }

      const cleanText = cleanRitualText(section.text);
      if (!cleanText) return;

      if (section.speaker) {
        try {
          await speakAsRole(cleanText, section.speaker, voiceMapRef.current);
        } catch {
          try { await speak(cleanText); } catch { /* ignore */ }
        }
      } else {
        try { await speak(cleanText); } catch { /* ignore */ }
      }
    },
    [rehearsalState, sections],
  );

  // Save session to performance history when rehearsal completes
  useEffect(() => {
    if (rehearsalState !== "complete" || lineResults.length === 0) return;
    if (!documentId) return;

    const degree = sections[0]?.degree || "Unknown";
    const duration = Math.round(
      (Date.now() - new Date(sessionStartRef.current).getTime()) / 1000
    );

    // Collect all trouble spots across lines
    const allTroubleSpots = new Map<string, number>();
    for (const r of lineResults) {
      for (const word of r.comparison.troubleSpots) {
        allTroubleSpots.set(word, (allTroubleSpots.get(word) || 0) + 1);
      }
    }
    const topTroubleSpots = [...allTroubleSpots.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([w]) => w);

    const sessionId = crypto.randomUUID();
    const session: PracticeSession = {
      id: sessionId,
      documentId,
      documentTitle: documentTitle || "Unknown",
      mode: "rehearsal",
      role: selectedRole,
      degree,
      sectionName: null,
      overallAccuracy,
      linesAttempted: lineResults.length,
      linesNailed: lineResults.filter((r) => r.accuracy >= 90).length,
      troubleSpots: topTroubleSpots,
      startedAt: sessionStartRef.current,
      duration,
    };

    const lineScores: LineScore[] = lineResults.map((r, i) => ({
      id: `${sessionId}-line-${i}`,
      sessionId,
      sectionName: sections[r.sectionIndex]?.sectionName || "Unknown",
      lineIndex: r.sectionIndex,
      accuracy: r.accuracy,
      wrongWords: r.comparison.wrongWords,
      missingWords: r.comparison.missingWords,
      troubleSpots: r.comparison.troubleSpots,
      timestamp: new Date().toISOString(),
    }));

    saveSession(session, lineScores).catch(console.error);
  }, [rehearsalState, lineResults, documentId, documentTitle, sections, selectedRole, overallAccuracy]);

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

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {availableRoles.map((role) => {
              const lineCount = sections.filter((s) => s.speaker === role).length;
              const Icon = getRoleIcon(role);
              return (
                <button
                  key={role}
                  onClick={() => setSelectedRole(role)}
                  className={`
                    flex items-start gap-4 text-left px-5 py-5 rounded-xl border-2 transition-all relative overflow-hidden group
                    ${selectedRole === role
                      ? "border-amber-500 bg-amber-500/10 text-amber-200 shadow-[0_0_15px_rgba(245,158,11,0.15)]"
                      : "border-zinc-800 bg-zinc-900 hover:border-amber-600/50 hover:bg-zinc-800 text-zinc-300"
                    }
                  `}
                >
                  {/* Icon Area */}
                  <div className={`
                    p-3 rounded-lg flex-shrink-0 transition-colors
                    ${selectedRole === role ? "bg-amber-500" : "bg-zinc-800 group-hover:bg-amber-900/40 text-zinc-400 group-hover:text-amber-500"}
                  `}>
                    {Icon ? (
                      <Icon className={`w-8 h-8 ${selectedRole === role ? "text-zinc-900" : ""}`} />
                    ) : (
                      <div className="w-8 h-8 flex items-center justify-center font-serif text-xl opacity-50">
                        {role.charAt(0)}
                      </div>
                    )}
                  </div>

                  {/* Text Area */}
                  <div>
                    <span className="font-serif font-bold tracking-wider text-lg block">{role}</span>
                    <span className="block text-sm text-zinc-400 mt-1 font-medium">
                      {getRoleDisplayName(role)}
                    </span>
                    <span className="block text-xs text-zinc-600 mt-1 uppercase tracking-widest font-semibold">
                      {lineCount} Line{lineCount !== 1 ? "s" : ""}
                    </span>
                  </div>
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
                    className={`px-4 py-2 text-xs font-medium transition-colors ${sttProvider === "browser"
                      ? "bg-amber-600 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                      }`}
                  >
                    Browser
                  </button>
                  <button
                    onClick={() => setSTTProvider("whisper")}
                    className={`px-4 py-2 text-xs font-medium transition-colors ${sttProvider === "whisper"
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

              {/* AI Coaching toggle */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-500 uppercase tracking-wide">AI Coach:</span>
                <button
                  onClick={() => setAiCoaching(!aiCoaching)}
                  className={`
                    relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                    ${aiCoaching ? "bg-amber-600" : "bg-zinc-700"}
                  `}
                >
                  <span
                    className={`
                      inline-block h-4 w-4 rounded-full bg-white transition-transform
                      ${aiCoaching ? "translate-x-6" : "translate-x-1"}
                    `}
                  />
                </button>
                <span className="text-xs text-zinc-600">
                  {aiCoaching
                    ? "AI gives spoken feedback after each line"
                    : "No AI feedback between lines"}
                </span>
              </div>

              {/* Feedback voice selector */}
              {aiCoaching && (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-500 uppercase tracking-wide">Feedback Voice:</span>
                  <select
                    value={feedbackVoice}
                    onChange={(e) => setFeedbackVoice(e.target.value)}
                    className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-300 text-xs focus:outline-none focus:border-amber-500 cursor-pointer"
                  >
                    {VOXTRAL_ROLE_OPTIONS.filter((o) => o.value).map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Auto-stop toggle */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-500 uppercase tracking-wide">Auto-Stop:</span>
                <button
                  onClick={() => setAutoStop(!autoStop)}
                  className={`
                    relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                    ${autoStop ? "bg-amber-600" : "bg-zinc-700"}
                  `}
                >
                  <span
                    className={`
                      inline-block h-4 w-4 rounded-full bg-white transition-transform
                      ${autoStop ? "translate-x-6" : "translate-x-1"}
                    `}
                  />
                </button>
                <span className="text-xs text-zinc-600">
                  {autoStop
                    ? "Auto-submits after 3s of silence"
                    : "Manual — press Done Speaking to submit"}
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
              <p className={`text-3xl font-bold ${overallAccuracy >= 85 ? "text-green-400" :
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
                    <span className={`text-lg font-bold w-12 text-right ${result.accuracy >= 90 ? "text-green-400" :
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

          <div className="flex flex-wrap gap-3">
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
            <Link
              href="/progress"
              className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              View Progress
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Active rehearsal (ai-speaking, user-turn, listening, transcribing, checking)
  return (
    <div className="space-y-4">
      {/* TTS fallback toast */}
      {ttsToast && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 flex items-center justify-between">
          <p className="text-amber-400 text-xs">{ttsToast}</p>
          <button
            onClick={() => setTtsToast(null)}
            className="text-amber-500/50 hover:text-amber-400 ml-3"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
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

      {/* Script view — simple scrollable list */}
      <div
        ref={scriptContainerRef}
        className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 max-h-60 overflow-y-auto"
      >
        {sections.map((section, i) => {
          const isPast = i < currentIndex;
          const isCurrent = i === currentIndex;
          const isUserSection = section.speaker === selectedRole;
          const gavels = section.gavels > 0 ? section.gavels : countGavelMarks(section.text);
          const cleanText = cleanRitualText(section.text);
          const displayText = section.cipherText || cleanText;

          return (
            <div
              key={section.id}
              id={`rehearsal-line-${i}`}
              onClick={() => !isCurrent && jumpToLine(i)}
              className={`
                flex gap-3 px-3 py-2 rounded-lg mb-1 transition-all
                ${!isCurrent ? "cursor-pointer hover:bg-white/5" : ""}
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
                {isCurrent && isUserSection && rehearsalState !== "checking" ? (
                  <span className="italic text-amber-400/70">[ Your line — recite from memory ]</span>
                ) : displayText ? (
                  <span
                    className={`inline rounded transition-colors ${isCurrent ? "cursor-pointer hover:bg-white/5" : ""}`}
                    onClick={isCurrent ? (e) => handleCurrentLineSpeak(i, e) : undefined}
                    title={isCurrent ? "Click to hear this line again" : undefined}
                  >
                    {displayText}
                  </span>
                ) : (
                  <span className="italic text-zinc-600">[stage direction]</span>
                )}
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

            {/* Navigation buttons */}
            <div className="flex justify-center items-center gap-3">
              <button
                onClick={() => jumpToLine(currentIndex - 1)}
                disabled={currentIndex === 0}
                className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-200 rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
              <button
                onClick={() => jumpToLine(currentIndex + 1)}
                disabled={currentIndex >= sections.length - 1}
                className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-200 rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
              >
                Next
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* User's turn — waiting to start (auto-listens in voice mode) */}
        {rehearsalState === "user-turn" && currentSection && (
          <div className="space-y-4">
            <div className="text-center">
              <span className="inline-block px-3 py-1 bg-amber-500/20 text-amber-400 rounded-full text-sm font-semibold mb-3">
                YOUR TURN — {selectedRole}
              </span>
              <p className="text-zinc-400 text-sm">
                {inputMode === "voice"
                  ? "Mic activating — recite your line from memory..."
                  : "Recite your line from memory. You can speak or type."}
              </p>
            </div>

            <div className="flex justify-center gap-3">
              {inputMode !== "voice" && (
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
              )}
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
            {autoStop && (
              <p className="text-xs text-zinc-500 text-center">
                Will auto-submit after 3 seconds of silence
              </p>
            )}

            {transcript && (
              <div className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
                <p className="text-zinc-300 text-sm italic">{transcript}</p>
              </div>
            )}

            <div className="flex flex-col items-center gap-2">
              <button
                onClick={stopListening}
                className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2 animate-pulse"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
                Done Speaking
              </button>
              {sttProvider === "whisper" && (
                <p className="text-xs text-zinc-500">
                  Auto-stops when you go silent, or tap the button above
                </p>
              )}
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

                {/* AI Coach feedback */}
                {aiCoaching && (
                  <div className="p-3 bg-amber-900/20 rounded-lg border border-amber-700/30">
                    {aiFeedback ? (
                      <div className="flex items-start gap-2">
                        {isSpeakingFeedback && (
                          <div className="flex gap-0.5 items-center pt-1 flex-shrink-0">
                            <div className="w-1 h-3 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                            <div className="w-1 h-4 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                            <div className="w-1 h-3 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                          </div>
                        )}
                        <p className="text-sm text-amber-200/90 italic">{aiFeedback}</p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-amber-400/60">
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <span className="text-xs">AI Coach is thinking...</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex justify-center gap-3">
                  <button
                    onClick={retryCurrentLine}
                    disabled={aiCoaching && (!aiFeedback || isSpeakingFeedback)}
                    className="px-6 py-3 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-200 rounded-lg font-semibold transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Retry Line
                  </button>
                  <button
                    onClick={continueAfterCheck}
                    disabled={aiCoaching && (!aiFeedback || isSpeakingFeedback)}
                    className="px-8 py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-colors flex items-center gap-2"
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
