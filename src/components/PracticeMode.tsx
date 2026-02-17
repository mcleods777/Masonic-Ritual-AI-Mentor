"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { RitualSection } from "@/lib/document-parser";
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

interface PracticeModeProps {
  sections: RitualSection[];
}

type PracticeState = "idle" | "listening" | "reviewing";

export default function PracticeMode({ sections }: PracticeModeProps) {
  const [selectedSection, setSelectedSection] = useState<RitualSection | null>(
    null
  );
  const [practiceState, setPracticeState] = useState<PracticeState>("idle");
  const [transcript, setTranscript] = useState("");
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [sttError, setSttError] = useState<string | null>(null);
  const [showReference, setShowReference] = useState(false);
  const [isSpeakingCorrection, setIsSpeakingCorrection] = useState(false);

  const engineRef = useRef<STTEngine | null>(null);

  // Group sections by degree
  const sectionsByDegree = sections.reduce<Record<string, RitualSection[]>>(
    (acc, section) => {
      if (!acc[section.degree]) acc[section.degree] = [];
      acc[section.degree].push(section);
      return acc;
    },
    {}
  );

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

    // Run comparison if we have both transcript and reference
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
      // Speak the correct version of trouble spots
      if (comparison.troubleSpots.length > 0) {
        await speak(
          `Let me read the correct words for the parts you missed. ${selectedSection.text}`,
          { rate: 0.85 }
        );
      }
      await speakFeedback(comparison.accuracy);
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
                  key={section.id}
                  onClick={() => {
                    reset();
                    setSelectedSection(section);
                  }}
                  className={`
                    text-left px-4 py-3 rounded-lg border transition-all
                    ${
                      selectedSection?.id === section.id
                        ? "border-amber-500 bg-amber-500/10 text-amber-200"
                        : "border-zinc-700 hover:border-zinc-600 text-zinc-400 hover:text-zinc-300"
                    }
                  `}
                >
                  <span className="font-medium">{section.sectionName}</span>
                  {section.speaker && (
                    <span className="ml-2 text-xs text-zinc-500">
                      ({section.speaker})
                    </span>
                  )}
                  <span className="block text-xs text-zinc-600 mt-1">
                    {section.text.slice(0, 80)}...
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
            <h2 className="text-lg font-semibold text-zinc-200">
              {selectedSection.sectionName}
              {selectedSection.speaker && (
                <span className="text-amber-500 ml-2">
                  — {selectedSection.speaker}
                </span>
              )}
            </h2>
            <button
              onClick={() => setShowReference(!showReference)}
              className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {showReference ? "Hide" : "Show"} Reference Text
            </button>
          </div>

          {/* Reference text (collapsible) */}
          {showReference && (
            <div className="mb-4 p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
              <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">
                {selectedSection.text}
              </p>
            </div>
          )}

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
                    // Allow typing instead of speaking
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
