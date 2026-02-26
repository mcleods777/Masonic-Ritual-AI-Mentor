"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { RitualSectionWithCipher } from "@/lib/storage";
import { ROLE_DISPLAY_NAMES, cleanRitualText } from "@/lib/document-parser";
import {
  speak,
  speakAsRole,
  assignVoicesToRoles,
  stopSpeaking,
  isTTSAvailable,
  type RoleVoiceProfile,
} from "@/lib/text-to-speech";
import { playGavelKnocks, countGavelMarks } from "@/lib/gavel-sound";
import RitualScriptDisplay from "./RitualScriptDisplay";

interface ListenModeProps {
  sections: RitualSectionWithCipher[];
}

type PlayState = "idle" | "playing" | "paused" | "finished";

export default function ListenMode({ sections }: ListenModeProps) {
  const [playState, setPlayState] = useState<PlayState>("idle");
  const [currentIndex, setCurrentIndex] = useState(0);
  const cancelledRef = useRef(false);
  const pausedRef = useRef(false);
  const resumeRef = useRef<(() => void) | null>(null);
  const voiceMapRef = useRef<Map<string, RoleVoiceProfile>>(new Map());

  // Extract unique roles
  const availableRoles = useMemo(() => {
    const roles = new Set<string>();
    for (const section of sections) {
      if (section.speaker) roles.add(section.speaker);
    }
    return Array.from(roles);
  }, [sections]);

  // Build voice map
  useEffect(() => {
    if (availableRoles.length > 0) {
      voiceMapRef.current = assignVoicesToRoles(availableRoles);
    }
  }, [availableRoles]);

  // Get display name for a role
  const getRoleDisplayName = useCallback((role: string): string => {
    return ROLE_DISPLAY_NAMES[role] || role;
  }, []);

  // Walk through every line, speaking each one
  const playFrom = useCallback(
    async (startIndex: number) => {
      cancelledRef.current = false;
      pausedRef.current = false;
      setPlayState("playing");

      for (let i = startIndex; i < sections.length; i++) {
        if (cancelledRef.current) return;

        // Handle pause — wait until resumed
        if (pausedRef.current) {
          setPlayState("paused");
          await new Promise<void>((resolve) => {
            resumeRef.current = resolve;
          });
          if (cancelledRef.current) return;
          setPlayState("playing");
        }

        setCurrentIndex(i);
        const section = sections[i];

        // Play gavel knocks if present (use MRAM field first, then parse from text)
        const gavelCount = section.gavels > 0 ? section.gavels : countGavelMarks(section.text);
        if (gavelCount > 0 && !cancelledRef.current) {
          await playGavelKnocks(gavelCount);
        }
        if (cancelledRef.current) return;

        // Speak the line if it has a speaker
        if (section.speaker) {
          const cleanText = cleanRitualText(section.text);
          if (cleanText) {
            try {
              await speakAsRole(cleanText, section.speaker, voiceMapRef.current);
            } catch (err) {
              console.warn(`TTS failed for line ${i} (${section.speaker}):`, err);
              // Brief pause so we don't zip through the script on repeated failures
              await new Promise((r) => setTimeout(r, 800));
            }
          }
        }
        // Lines with no speaker (stage directions) get a brief pause
        else {
          await new Promise((r) => setTimeout(r, 600));
        }
      }

      if (!cancelledRef.current) {
        setPlayState("finished");
      }
    },
    [sections]
  );

  const handlePlay = useCallback(() => {
    if (playState === "paused") {
      // Resume
      pausedRef.current = false;
      if (resumeRef.current) {
        resumeRef.current();
        resumeRef.current = null;
      }
    } else {
      // Start fresh or replay
      playFrom(playState === "finished" ? 0 : currentIndex);
    }
  }, [playState, playFrom, currentIndex]);

  const handlePause = useCallback(() => {
    pausedRef.current = true;
    stopSpeaking();
  }, []);

  const handleStop = useCallback(() => {
    cancelledRef.current = true;
    pausedRef.current = false;
    stopSpeaking();
    if (resumeRef.current) {
      resumeRef.current();
      resumeRef.current = null;
    }
    setPlayState("idle");
    setCurrentIndex(0);
  }, []);

  /* -------------------------------------------------------------- */
  /*  Click-to-play: tap any line bar to hear it                     */
  /* -------------------------------------------------------------- */
  const handleLineClick = useCallback(
    async (index: number) => {
      const section = sections[index];
      if (!section) return;

      if (playState === "idle" || playState === "finished") {
        // One-shot: speak just this line
        stopSpeaking();
        setCurrentIndex(index);
        const gavelCount = section.gavels > 0 ? section.gavels : countGavelMarks(section.text);
        if (gavelCount > 0) await playGavelKnocks(gavelCount);
        if (section.speaker) {
          const cleanText = cleanRitualText(section.text);
          if (cleanText) {
            try {
              await speakAsRole(cleanText, section.speaker, voiceMapRef.current);
            } catch {
              /* ignore */
            }
          }
        }
      } else if (playState === "playing" || playState === "paused") {
        // Jump playback to this line and continue from here
        cancelledRef.current = true;
        stopSpeaking();
        if (resumeRef.current) {
          resumeRef.current();
          resumeRef.current = null;
        }
        // Small delay to let the current playback stop cleanly
        await new Promise((r) => setTimeout(r, 100));
        playFrom(index);
      }
    },
    [playState, sections, playFrom],
  );

  /* -------------------------------------------------------------- */
  /*  Click-to-speak: tap any individual word to hear it             */
  /* -------------------------------------------------------------- */
  const handleWordClick = useCallback(
    async (word: string, role: string | null) => {
      stopSpeaking();
      if (role) {
        try {
          await speakAsRole(word, role, voiceMapRef.current);
        } catch {
          await speak(word);
        }
      } else {
        await speak(word);
      }
    },
    [],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      if (resumeRef.current) {
        resumeRef.current();
      }
      stopSpeaking();
    };
  }, []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-200">
              Listen Mode
            </h2>
            <p className="text-sm text-zinc-500 mt-1">
              Sit back and listen to the full ceremony read aloud, each officer in a distinct voice.
              Tap any line to hear it, or tap a single word.
            </p>
          </div>
          {!isTTSAvailable() && (
            <p className="text-xs text-red-400 max-w-xs text-right">
              Text-to-speech is not available in this browser.
            </p>
          )}
        </div>

        {/* Roles legend */}
        <div className="flex flex-wrap gap-2 mb-4">
          {availableRoles.map((role) => (
            <span
              key={role}
              className="px-2.5 py-1 bg-zinc-800 rounded-md text-xs text-zinc-400 border border-zinc-700"
            >
              <span className="font-semibold text-zinc-300">{role}</span>
              <span className="text-zinc-600 ml-1">{getRoleDisplayName(role)}</span>
            </span>
          ))}
        </div>

        {/* Transport controls */}
        <div className="flex items-center gap-3">
          {playState === "playing" ? (
            <button
              onClick={handlePause}
              className="px-6 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-semibold transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
              Pause
            </button>
          ) : (
            <button
              onClick={handlePlay}
              className="px-6 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-semibold transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              {playState === "idle"
                ? "Play Ceremony"
                : playState === "paused"
                  ? "Resume"
                  : "Play Again"}
            </button>
          )}

          {(playState === "playing" || playState === "paused") && (
            <button
              onClick={handleStop}
              className="px-5 py-3 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
              Stop
            </button>
          )}

          {/* Status text */}
          <span className="text-sm text-zinc-500 ml-auto">
            {playState === "playing" && (
              <span className="flex items-center gap-2">
                <span className="flex gap-0.5">
                  <span className="w-1 h-4 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1 h-5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1 h-3 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </span>
                Line {currentIndex + 1} of {sections.length}
              </span>
            )}
            {playState === "paused" && `Paused at line ${currentIndex + 1} of ${sections.length}`}
            {playState === "finished" && "Ceremony complete"}
            {playState === "idle" && `${sections.length} lines total`}
          </span>
        </div>

        {/* Progress bar */}
        {(playState === "playing" || playState === "paused") && (
          <div className="w-full bg-zinc-800 rounded-full h-1.5 mt-4">
            <div
              className="bg-amber-500 h-1.5 rounded-full transition-all duration-300"
              style={{
                width: `${((currentIndex + 1) / sections.length) * 100}%`,
              }}
            />
          </div>
        )}
      </div>

      {/* Ritual Reel — the new premium script display */}
      <RitualScriptDisplay
        sections={sections}
        currentIndex={currentIndex}
        isActive={playState !== "idle"}
        onLineClick={handleLineClick}
        onWordClick={handleWordClick}
        lineIdPrefix="listen-line"
        maxHeight="32rem"
      />
    </div>
  );
}
