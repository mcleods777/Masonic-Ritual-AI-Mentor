"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { RitualSectionWithCipher } from "@/lib/storage";
import { ROLE_DISPLAY_NAMES, cleanRitualText } from "@/lib/document-parser";
import { getRoleIcon } from "./MasonicIcons";
import {
  speakAsRole,
  assignVoicesToRoles,
  stopSpeaking,
  isTTSAvailable,
  type RoleVoiceProfile,
} from "@/lib/text-to-speech";
import { playGavelKnocks, countGavelMarks, warmAudioContext } from "@/lib/gavel-sound";
import { preloadGeminiRitual } from "@/lib/tts-cloud";
import { keepScreenAwake, allowScreenSleep } from "@/lib/screen-wake-lock";

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
  const playGenRef = useRef(0); // generation counter to prevent overlapping playFrom loops
  const voiceMapRef = useRef<Map<string, RoleVoiceProfile>>(new Map());
  const scriptContainerRef = useRef<HTMLDivElement>(null);

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
    const el = document.getElementById(`listen-line-${currentIndex}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentIndex]);

  // Get display name for a role
  const getRoleDisplayName = useCallback((role: string): string => {
    return ROLE_DISPLAY_NAMES[role] || role;
  }, []);

  // Walk through every line, speaking each one
  const playFrom = useCallback(
    async (startIndex: number) => {
      // Bump generation so any previous playFrom loop will exit
      const gen = ++playGenRef.current;
      cancelledRef.current = false;
      pausedRef.current = false;
      setPlayState("playing");

      for (let i = startIndex; i < sections.length; i++) {
        if (cancelledRef.current || gen !== playGenRef.current) return;

        const stale = () => cancelledRef.current || gen !== playGenRef.current;

        // Handle pause — wait until resumed
        if (pausedRef.current) {
          setPlayState("paused");
          await new Promise<void>((resolve) => {
            resumeRef.current = resolve;
          });
          if (stale()) return;
          setPlayState("playing");
        }

        setCurrentIndex(i);
        const section = sections[i];

        // Play gavel knocks if present (use MRAM field first, then parse from text)
        const gavelCount = section.gavels > 0 ? section.gavels : countGavelMarks(section.text);
        if (gavelCount > 0 && !stale()) {
          await playGavelKnocks(gavelCount);
        }
        if (stale()) return;

        // Speak the line if it has a speaker (retry once on failure)
        if (section.speaker) {
          const cleanText = cleanRitualText(section.text);
          if (cleanText) {
            let spoken = false;
            for (let attempt = 0; attempt < 2 && !spoken; attempt++) {
              if (stale()) return;
              try {
                await speakAsRole(cleanText, section.speaker, voiceMapRef.current, section.style, section.audio);
                spoken = true;
              } catch (err) {
                // Don't retry if this was an intentional abort (user tapped a different line)
                if (err instanceof DOMException && err.name === "AbortError") return;
                console.warn(
                  `TTS failed for line ${i} (${section.speaker}), attempt ${attempt + 1}:`,
                  err
                );
                if (attempt === 0) {
                  // Wait before retry
                  await new Promise((r) => setTimeout(r, 1000));
                } else {
                  // Final failure — pause before advancing so user notices the skip
                  await new Promise((r) => setTimeout(r, 1500));
                }
              }
            }
          }
        }
        // Lines with no speaker (stage directions) get a brief pause
        else {
          await new Promise((r) => setTimeout(r, 600));
        }

        // Small gap between lines to avoid hammering the TTS API
        if (!stale() && i < sections.length - 1) {
          await new Promise((r) => setTimeout(r, 150));
        }
      }

      if (!cancelledRef.current && gen === playGenRef.current) {
        setPlayState("finished");
      }
    },
    [sections]
  );

  const handlePlay = useCallback(() => {
    warmAudioContext(); // Must happen during user gesture, not in useEffect
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

      // Unconditionally interrupt whatever is in flight. Bumping
      // playGenRef FIRST causes any earlier handleLineClick or playFrom
      // invocation to see stale on its next stale() check, so even if
      // its async IndexedDB / fetch work is still pending, it returns
      // before reaching playAudioBlob. Without this, two quick taps
      // could both race past the old single stopSpeaking() call and
      // end up with two audio blobs playing in sequence (briefly overlapping).
      const gen = ++playGenRef.current;
      cancelledRef.current = false;
      pausedRef.current = false;
      stopSpeaking();
      if (resumeRef.current) {
        resumeRef.current();
        resumeRef.current = null;
      }

      const stale = () => gen !== playGenRef.current || cancelledRef.current;

      // If full-ceremony playback was in progress, resume the loop from
      // this line. playFrom() bumps gen again which is harmless — our
      // gen still matches because we just set it.
      if (playState === "playing" || playState === "paused") {
        playFrom(index);
        return;
      }

      // One-shot from idle/finished. Transition to "playing" so the
      // Stop button renders (handleStop → cancelledRef + setPlayState
      // "idle" correctly cancels this branch via stale()).
      setPlayState("playing");
      setCurrentIndex(index);

      try {
        const gavelCount = section.gavels > 0 ? section.gavels : countGavelMarks(section.text);
        if (gavelCount > 0) {
          await playGavelKnocks(gavelCount);
        }
        if (stale()) return;

        if (section.speaker) {
          const cleanText = cleanRitualText(section.text);
          if (cleanText) {
            await speakAsRole(
              cleanText,
              section.speaker,
              voiceMapRef.current,
              section.style,
              section.audio,
            );
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Other errors: swallow for one-shot playback — the user can retry.
      } finally {
        // Only flip back to idle if we weren't superseded (another tap
        // or Stop button). Superseding paths own the next transition.
        if (!stale()) {
          setPlayState("idle");
        }
      }
    },
    [playState, sections, playFrom],
  );


  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      if (resumeRef.current) {
        resumeRef.current();
      }
      stopSpeaking();
      void allowScreenSleep();
    };
  }, []);

  // Keep the screen awake while the ritual is playing. Browsers release
  // the lock on tab-hide; the wake-lock module re-acquires on visible.
  useEffect(() => {
    if (playState === "playing") {
      void keepScreenAwake();
    } else {
      void allowScreenSleep();
    }
  }, [playState]);

  // Silent on-mount preload of any lines that lack baked audio. Fires
  // 2.5s after mount so it doesn't race with a user who immediately
  // taps play on line 1 (which would otherwise double-POST the same
  // cache key). preloadGeminiRitual internally skips cache hits, so
  // repeat mounts are cheap. Errors are swallowed end-to-end.
  useEffect(() => {
    let abortFn: (() => void) | null = null;
    let cancelled = false;

    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      try {
        const gapLines = sections
          .filter((s) => s.speaker && !s.audio && cleanRitualText(s.text).length > 0)
          .map((s) => ({
            text: cleanRitualText(s.text),
            role: s.speaker,
            style: s.style,
          }));
        if (gapLines.length === 0) return;
        const { abort } = preloadGeminiRitual(gapLines, undefined, 250);
        abortFn = abort;
      } catch (err) {
        console.warn("[tts-gap] silent preload setup failed", err);
      }
    }, 2500);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      if (abortFn) abortFn();
    };
  }, [sections]);

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
              Tap any line to hear it.
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
          {availableRoles.map((role) => {
            const Icon = getRoleIcon(role);
            return (
              <span
                key={role}
                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 rounded-md text-xs text-zinc-400 border border-zinc-700/50 shadow-sm"
              >
                {Icon && <Icon className="w-4 h-4 text-amber-500/80" />}
                <span className="font-serif font-bold tracking-wide text-zinc-300">{role}</span>
                <span className="text-zinc-500 ml-1">{getRoleDisplayName(role)}</span>
              </span>
            );
          })}
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

      {/* Script view — simple scrollable list */}
      <div
        ref={scriptContainerRef}
        className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 max-h-[28rem] overflow-y-auto"
      >
        {sections.map((section, i) => {
          const isPast = i < currentIndex && playState !== "idle";
          const isCurrent = i === currentIndex && playState !== "idle";
          const gavels = section.gavels > 0 ? section.gavels : countGavelMarks(section.text);
          const cleanText = cleanRitualText(section.text);
          const displayText = section.cipherText || cleanText;

          return (
            <div
              key={section.id}
              id={`listen-line-${i}`}
              onClick={() => handleLineClick(i)}
              className={`
                flex gap-3 px-3 py-2 rounded-lg mb-1 transition-all cursor-pointer
                hover:bg-white/5
                ${isPast ? "opacity-30" : ""}
                ${isCurrent ? "bg-amber-500/10 border border-amber-500/30" : ""}
              `}
            >
              <span
                className={`
                  text-xs font-mono font-bold w-10 flex-shrink-0 pt-0.5 text-right
                  ${isCurrent ? "text-amber-400" : "text-zinc-600"}
                `}
              >
                {section.speaker || "---"}
              </span>
              <span
                className={`
                  text-sm flex-1
                  ${isCurrent ? "text-amber-200" : ""}
                  ${isPast ? "text-zinc-600" : "text-zinc-400"}
                `}
              >
                {gavels > 0 && (
                  <span
                    className="inline-flex gap-0.5 mr-1.5 align-middle"
                    title={`${gavels} gavel knock${gavels !== 1 ? "s" : ""}`}
                  >
                    {Array.from({ length: gavels }).map((_, g) => (
                      <span
                        key={g}
                        className="inline-block w-2 h-2 rounded-full bg-yellow-600/70"
                      />
                    ))}
                  </span>
                )}
                {displayText ? (
                  <span>{displayText}</span>
                ) : (
                  <span className="italic text-zinc-600">[stage direction]</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
