"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { RitualSectionWithCipher } from "@/lib/storage";
import { compareTexts, type ComparisonResult } from "@/lib/text-comparison";
import {
  createWebSpeechEngine,
  isWebSpeechAvailable,
  type STTEngine,
} from "@/lib/speech-to-text";
import {
  speak,
  speakFeedback,
  stopSpeaking,
  isTTSAvailable,
} from "@/lib/text-to-speech";
import DiffDisplay from "./DiffDisplay";
import {
  saveSession,
  type PracticeSession,
  type LineScore,
} from "@/lib/performance-history";

interface GroupedSection {
  sectionName: string;
  degree: string;
  text: string;        // Combined plain text of all lines
  cipherText: string;  // Combined cipher text of all lines
  speakers: string[];  // Unique speakers in this section
}

interface PracticeModeProps {
  sections: RitualSectionWithCipher[];
  documentId?: string;
  documentTitle?: string;
}

type PracticeState = "idle" | "listening" | "reviewing";

export default function PracticeMode({ sections, documentId, documentTitle }: PracticeModeProps) {
  const [selectedSection, setSelectedSection] = useState<GroupedSection | null>(
    null
  );
  const [practiceState, setPracticeState] = useState<PracticeState>("idle");
  const [transcript, setTranscript] = useState("");
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [sttError, setSttError] = useState<string | null>(null);
  const [showPlainText, setShowPlainText] = useState(false);
  const [isSpeakingCorrection, setIsSpeakingCorrection] = useState(false);

  const engineRef = useRef<STTEngine | null>(null);

  // Group individual lines into actual ritual sections, then group by degree
  const sectionsByDegree = useMemo(() => {
    // First, group lines by sectionName to create one entry per ritual section
    const groupedMap = new Map<string, GroupedSection>();
    for (const line of sections) {
      const key = `${line.degree}::${line.sectionName}`;
      const existing = groupedMap.get(key);
      if (existing) {
        existing.text += "\n" + line.text;
        existing.cipherText += "\n" + line.cipherText;
        if (line.speaker && !existing.speakers.includes(line.speaker)) {
          existing.speakers.push(line.speaker);
        }
      } else {
        groupedMap.set(key, {
          sectionName: line.sectionName,
          degree: line.degree,
          text: line.text,
          cipherText: line.cipherText,
          speakers: line.speaker ? [line.speaker] : [],
        });
      }
    }

    // Then group by degree for display
    const byDegree: Record<string, GroupedSection[]> = {};
    for (const group of groupedMap.values()) {
      if (!byDegree[group.degree]) byDegree[group.degree] = [];
      byDegree[group.degree].push(group);
    }
    return byDegree;
  }, [sections]);

  const startListening = useCallback(() => {
    if (!isWebSpeechAvailable()) {
      setSttError(
        "Speech recognition is not available. Please use Chrome, Edge, or Safari."
      );
      return;
    }

    setSttError(null);
    setTranscript("");
    setComparison(null);

    try {
      const engine = createWebSpeechEngine();
      engineRef.current = engine;

      engine.onResult = (result) => {
        setTranscript(result.transcript);
      };

      engine.onError = (error) => {
        setSttError(error);
        setPracticeState("idle");
      };

      engine.onEnd = () => {
        // Auto-restart if still in listening mode (browser may stop after silence)
        if (practiceState === "listening") {
          try {
            engine.start();
          } catch {
            // Ignore restart errors
          }
        }
      };

      engine.start();
      setPracticeState("listening");
    } catch (err) {
      setSttError(
        err instanceof Error ? err.message : "Failed to start speech recognition"
      );
    }
  }, [practiceState]);

  const stopListening = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.stop();
      engineRef.current = null;
    }
    setPracticeState("reviewing");

    // Compare against PLAIN text (never cipher)
    if (transcript && selectedSection) {
      const result = compareTexts(transcript, selectedSection.text);
      setComparison(result);
    }
  }, [transcript, selectedSection]);

  const handleCheck = useCallback(() => {
    if (transcript && selectedSection) {
      const result = compareTexts(transcript, selectedSection.text);
      setComparison(result);
      setPracticeState("reviewing");
    }
  }, [transcript, selectedSection]);

  const speakCorrections = useCallback(async () => {
    if (!comparison || !selectedSection || !isTTSAvailable()) return;

    setIsSpeakingCorrection(true);
    try {
      const diffs = comparison.diffs;
      const phrases: string[] = [];
      const CONTEXT = 3;

      let i = 0;
      while (i < diffs.length) {
        const d = diffs[i];
        if (d.type === "wrong" || d.type === "missing") {
          const errorStart = i;
          while (
            i < diffs.length &&
            (diffs[i].type === "wrong" || diffs[i].type === "missing" || diffs[i].type === "extra")
          ) {
            i++;
          }
          const errorEnd = i;

          const correctedWords = diffs
            .slice(errorStart, errorEnd)
            .filter((dd) => dd.type === "wrong" || dd.type === "missing")
            .map((dd) => dd.expected || dd.word);

          const before: string[] = [];
          for (let b = errorStart - 1; b >= Math.max(0, errorStart - CONTEXT); b--) {
            if (diffs[b].type === "correct" || diffs[b].type === "phonetic_match" || diffs[b].type === "fuzzy_match") {
              before.unshift(diffs[b].word);
            }
          }

          const after: string[] = [];
          for (let a = errorEnd; a < Math.min(diffs.length, errorEnd + CONTEXT); a++) {
            if (diffs[a].type === "correct" || diffs[a].type === "phonetic_match" || diffs[a].type === "fuzzy_match") {
              after.push(diffs[a].word);
            }
          }

          const phrase = [...before, ...correctedWords, ...after].join(" ");
          if (phrase.trim()) {
            phrases.push(phrase);
          }
        } else {
          i++;
        }
      }

      if (phrases.length > 0) {
        const intro =
          phrases.length === 1
            ? "Here is the correction."
            : `Here are ${phrases.length} corrections.`;
        const script = phrases
          .map((p, idx) => (phrases.length > 1 ? `Number ${idx + 1}. ${p}` : p))
          .join(". ... ");

        // Retry once on TTS failure
        let spoken = false;
        for (let attempt = 0; attempt < 2 && !spoken; attempt++) {
          try {
            await speak(`${intro} ... ${script}`, { rate: 0.85 });
            spoken = true;
          } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") return;
            console.warn(`Correction TTS failed, attempt ${attempt + 1}:`, err);
            if (attempt === 0) await new Promise((r) => setTimeout(r, 1000));
          }
        }

        // Small gap before feedback to avoid hammering the TTS API
        await new Promise((r) => setTimeout(r, 150));
      }

      // Retry feedback speech once on failure
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await speakFeedback(comparison.accuracy);
          break;
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
          console.warn(`Feedback TTS failed, attempt ${attempt + 1}:`, err);
          if (attempt === 0) await new Promise((r) => setTimeout(r, 1000));
        }
      }
    } finally {
      setIsSpeakingCorrection(false);
    }
  }, [comparison, selectedSection]);

  const reset = useCallback(() => {
    stopSpeaking();
    if (engineRef.current) {
      engineRef.current.stop();
      engineRef.current = null;
    }
    setPracticeState("idle");
    setTranscript("");
    setComparison(null);
    setSttError(null);
    setIsSpeakingCorrection(false);
  }, []);

  // Save solo practice session to performance history when comparison completes
  const lastSavedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!comparison || !selectedSection || !documentId) return;
    // Avoid double-saving the same comparison
    const key = `${selectedSection.sectionName}-${comparison.accuracy}-${Date.now()}`;
    if (lastSavedRef.current === key) return;
    lastSavedRef.current = key;

    const sessionId = crypto.randomUUID();
    const session: PracticeSession = {
      id: sessionId,
      documentId,
      documentTitle: documentTitle || "Unknown",
      mode: "solo",
      role: null,
      degree: selectedSection.degree,
      sectionName: selectedSection.sectionName,
      overallAccuracy: comparison.accuracy,
      linesAttempted: 1,
      linesNailed: comparison.accuracy >= 90 ? 1 : 0,
      troubleSpots: comparison.troubleSpots.slice(0, 10),
      startedAt: new Date().toISOString(),
      duration: 0,
    };

    const lineScore: LineScore = {
      id: `${sessionId}-line-0`,
      sessionId,
      sectionName: selectedSection.sectionName,
      lineIndex: 0,
      accuracy: comparison.accuracy,
      wrongWords: comparison.wrongWords,
      missingWords: comparison.missingWords,
      troubleSpots: comparison.troubleSpots,
      timestamp: new Date().toISOString(),
    };

    saveSession(session, [lineScore]).catch(console.error);
  }, [comparison, selectedSection, documentId, documentTitle]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (engineRef.current) {
        engineRef.current.stop();
      }
      stopSpeaking();
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Section Selector */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
        <h2 className="text-lg font-semibold text-zinc-200 mb-4">
          Select a Section to Practice
        </h2>

        {Object.entries(sectionsByDegree).map(([degree, degreeSections]) => (
          <div key={degree} className="mb-4">
            <h3 className="text-sm font-medium text-amber-500 uppercase tracking-wide mb-2">
              {degree}
            </h3>
            <div className="grid gap-2">
              {degreeSections.map((section) => (
                <button
                  key={`${section.degree}::${section.sectionName}`}
                  onClick={() => {
                    reset();
                    setSelectedSection(section);
                  }}
                  className={`
                    text-left px-4 py-3 rounded-lg border transition-all
                    ${selectedSection?.sectionName === section.sectionName && selectedSection?.degree === section.degree
                      ? "border-amber-500 bg-amber-500/10 text-amber-200"
                      : "border-zinc-700 hover:border-zinc-600 text-zinc-400 hover:text-zinc-300"
                    }
                  `}
                >
                  <span className="font-medium">{section.sectionName}</span>
                  {section.speakers.length > 0 && (
                    <span className="ml-2 inline-flex items-center gap-1.5 text-xs text-zinc-500">
                      ({section.speakers.join(", ")})
                    </span>
                  )}
                  {/* Show cipher text preview by default */}
                  <span className="block text-xs text-zinc-600 mt-1 font-mono">
                    {section.cipherText.slice(0, 80)}...
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Practice Area */}
      {selectedSection && (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-zinc-200 flex items-center gap-2">
              {selectedSection.sectionName}
              {selectedSection.speakers.length > 0 && (
                <span className="flex items-center gap-2 text-amber-500 ml-2">
                  — {selectedSection.speakers.join(", ")}
                </span>
              )}
            </h2>
            <button
              onClick={() => setShowPlainText(!showPlainText)}
              className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {showPlainText ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                )}
              </svg>
              {showPlainText ? "Show Cipher" : "Reveal Plain Text"}
            </button>
          </div>

          {/* Reference text — cipher by default, plain on toggle */}
          <div className="mb-4 p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
            <p className={`text-sm leading-relaxed whitespace-pre-wrap ${showPlainText ? "text-zinc-300" : "text-amber-200/80 font-mono"
              }`}>
              {showPlainText ? selectedSection.text : (selectedSection.cipherText || selectedSection.text)}
            </p>
            {!showPlainText && (
              <p className="text-xs text-zinc-600 mt-2 italic">
                Cipher text shown — tap &quot;Reveal Plain Text&quot; to see full text
              </p>
            )}
          </div>

          {/* Controls */}
          <div className="flex gap-3 mb-6">
            {practiceState === "idle" && (
              <>
                <button
                  onClick={startListening}
                  className="px-6 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                >
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                  </svg>
                  Start Reciting
                </button>
                <button
                  onClick={() => {
                    setPracticeState("reviewing");
                  }}
                  className="px-6 py-3 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg font-medium transition-colors"
                >
                  Type Instead
                </button>
              </>
            )}

            {practiceState === "listening" && (
              <button
                onClick={stopListening}
                className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2 animate-pulse"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
                Stop & Check
              </button>
            )}

            {practiceState === "reviewing" && (
              <>
                <button
                  onClick={reset}
                  className="px-6 py-3 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg font-medium transition-colors"
                >
                  Try Again
                </button>
                {comparison && isTTSAvailable() && !isSpeakingCorrection && (
                  <button
                    onClick={speakCorrections}
                    className="px-6 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                      />
                    </svg>
                    Hear Corrections
                  </button>
                )}
                {isSpeakingCorrection && (
                  <button
                    onClick={() => {
                      stopSpeaking();
                      setIsSpeakingCorrection(false);
                    }}
                    className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2 animate-pulse"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                    Stop Speaking
                  </button>
                )}
              </>
            )}
          </div>

          {/* Listening indicator */}
          {practiceState === "listening" && (
            <div className="mb-4">
              <div className="flex items-center gap-3 text-amber-400">
                <div className="flex gap-1">
                  <div className="w-1.5 h-6 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="w-1.5 h-8 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-1.5 h-5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  <div className="w-1.5 h-7 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: "450ms" }} />
                  <div className="w-1.5 h-4 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: "600ms" }} />
                </div>
                <span className="text-sm font-medium">
                  Listening — speak your ritual lines...
                </span>
              </div>
            </div>
          )}

          {/* Transcript display / text input */}
          {practiceState === "reviewing" && !comparison && (
            <div className="mb-4">
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="Type the ritual text from memory..."
                className="w-full h-32 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500 resize-none"
              />
              <button
                onClick={handleCheck}
                disabled={!transcript.trim()}
                className="mt-3 px-6 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg font-medium transition-colors"
              >
                Check My Work
              </button>
            </div>
          )}

          {/* Live transcript while listening */}
          {practiceState === "listening" && transcript && (
            <div className="mb-4 p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
              <p className="text-zinc-300 text-sm italic">{transcript}</p>
            </div>
          )}

          {/* Comparison results */}
          {comparison && <DiffDisplay result={comparison} />}

          {/* Error display */}
          {sttError && (
            <div className="mt-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
              {sttError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
