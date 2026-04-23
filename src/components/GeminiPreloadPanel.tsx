"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getTTSEngine } from "@/lib/text-to-speech";
import {
  preloadGeminiRitual,
  countCachedGeminiLines,
  type PrefetchProgress,
} from "@/lib/tts-cloud";
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
  // Pre-existing cache state surfaced on mount so mode-switches (Listen ↔
  // Rehearsal) don't make the user think their preload was thrown away.
  // The IndexedDB cache is persistent; only the panel's own useState was lost.
  const [cachedSummary, setCachedSummary] = useState<{
    cached: number;
    total: number;
  } | null>(null);
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

  // Probe IndexedDB on mount (and when sections change) to reflect what's
  // actually cached. If every spoken line is already cached, jump straight
  // to the "done" state so switching modes doesn't reset the UI.
  useEffect(() => {
    if (currentEngine !== "gemini") return;
    if (preloadState === "running") return;
    let cancelled = false;
    (async () => {
      const lines = sections
        .filter((s) => s.speaker && cleanRitualText(s.text).length > 0)
        .map((s) => ({
          text: cleanRitualText(s.text),
          role: s.speaker,
          style: s.style,
        }));
      const summary = await countCachedGeminiLines(lines);
      if (cancelled) return;
      setCachedSummary(summary);
      if (summary.total > 0 && summary.cached === summary.total) {
        setPreloadState("done");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sections, currentEngine, preloadState]);

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

    done
      .then(() => {
        setPreloadState((curr) => (curr === "aborted" ? "aborted" : "done"));
      })
      .catch(() => {
        setPreloadState("aborted");
      })
      .finally(() => {
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
            Gemini audio preload <span className="text-xs font-normal text-zinc-500">(optional)</span>
          </div>
          <div className="text-xs text-zinc-500 mt-0.5">
            Streaming playback is fast out of the box — no action needed. Preload pre-renders the entire ritual into local cache up front if you want truly zero-latency playback (~2-3 min, cached lines are free on replay).
          </div>
        </div>
        {preloadState === "idle" && (
          <div className="flex items-center gap-2 whitespace-nowrap">
            {cachedSummary && cachedSummary.cached > 0 && cachedSummary.cached < cachedSummary.total && (
              <span className="text-xs text-zinc-400">
                {cachedSummary.cached} / {cachedSummary.total} already cached
              </span>
            )}
            <button
              onClick={startPreload}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-amber-300 rounded-md text-sm font-medium transition-colors"
            >
              {cachedSummary && cachedSummary.cached > 0 && cachedSummary.cached < cachedSummary.total
                ? "Resume preload"
                : "Preload audio"}
            </button>
          </div>
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
