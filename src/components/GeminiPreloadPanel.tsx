"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getTTSEngine } from "@/lib/text-to-speech";
import { preloadGeminiRitual, type PrefetchProgress } from "@/lib/tts-cloud";
import { cleanRitualText } from "@/lib/document-parser";
import type { RitualSectionWithCipher } from "@/lib/storage";

/**
 * Gemini audio preload panel — pre-renders every spoken line in a ritual
 * into the IndexedDB audioCache so rehearsal / listen mode plays with
 * zero cold-start latency. Shown only when the user has Gemini selected
 * as their TTS engine (reactive — subscribes to the "tts-engine-changed"
 * CustomEvent dispatched by setTTSEngine).
 *
 * Safe to mount in both RehearsalMode and ListenMode — it's purely a
 * side-effect panel and doesn't interact with the surrounding playback.
 */
export default function GeminiPreloadPanel({
  sections,
}: {
  sections: RitualSectionWithCipher[];
}) {
  const [currentEngine, setCurrentEngine] = useState(() => getTTSEngine());
  const [preloadState, setPreloadState] = useState<
    "idle" | "running" | "done" | "aborted"
  >("idle");
  const [preloadProgress, setPreloadProgress] = useState<PrefetchProgress | null>(null);
  const abortRef = useRef<(() => void) | null>(null);

  // Keep engine selection reactive. setTTSEngine() dispatches the event.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (typeof detail === "string") {
        setCurrentEngine(detail as ReturnType<typeof getTTSEngine>);
      }
    };
    window.addEventListener("tts-engine-changed", handler);
    return () => window.removeEventListener("tts-engine-changed", handler);
  }, []);

  const startPreload = useCallback(() => {
    const spokenLines = sections
      .filter((s) => s.speaker && cleanRitualText(s.text).length > 0)
      .map((s) => ({
        text: cleanRitualText(s.text),
        role: s.speaker,
        style: s.style,
      }));

    setPreloadState("running");
    setPreloadProgress({ index: 0, total: spokenLines.length, result: "skipped" });

    const { abort, done } = preloadGeminiRitual(
      spokenLines,
      (p) => setPreloadProgress(p),
      250,
    );
    abortRef.current = abort;

    done.then(() => {
      setPreloadState((curr) => (curr === "aborted" ? "aborted" : "done"));
      abortRef.current = null;
    });
  }, [sections]);

  const cancelPreload = useCallback(() => {
    abortRef.current?.();
    setPreloadState("aborted");
  }, []);

  if (currentEngine !== "gemini") return null;

  return (
    <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div>
          <div className="text-sm font-semibold text-zinc-200">
            Gemini audio preload
          </div>
          <div className="text-xs text-zinc-500 mt-0.5">
            Pre-renders every line into the local cache so playback has zero latency. Takes ~2-3 minutes for a full ritual. Cached lines are free on replay.
          </div>
        </div>
        {preloadState === "idle" && (
          <button
            onClick={startPreload}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-amber-300 rounded-md text-sm font-medium transition-colors whitespace-nowrap"
          >
            Preload audio
          </button>
        )}
        {preloadState === "running" && (
          <button
            onClick={cancelPreload}
            className="px-4 py-2 bg-zinc-800 hover:bg-red-900 text-red-300 rounded-md text-sm font-medium transition-colors whitespace-nowrap"
          >
            Cancel
          </button>
        )}
        {preloadState === "done" && (
          <span className="px-3 py-1.5 bg-emerald-900/40 text-emerald-300 rounded-md text-xs font-medium">
            ✓ Cached
          </span>
        )}
        {preloadState === "aborted" && (
          <button
            onClick={startPreload}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-amber-300 rounded-md text-sm font-medium transition-colors whitespace-nowrap"
          >
            Resume preload
          </button>
        )}
      </div>
      {preloadProgress && preloadState === "running" && (
        <div className="mt-2">
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 transition-all"
              style={{
                width: `${Math.round(
                  (preloadProgress.index / Math.max(preloadProgress.total, 1)) * 100,
                )}%`,
              }}
            />
          </div>
          <div className="text-xs text-zinc-500 mt-1">
            {preloadProgress.index} / {preloadProgress.total} lines
          </div>
        </div>
      )}
    </div>
  );
}
