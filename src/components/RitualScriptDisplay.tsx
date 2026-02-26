"use client";

import { useRef, useEffect, useCallback } from "react";
import type { RitualSectionWithCipher } from "@/lib/storage";
import { cleanRitualText } from "@/lib/document-parser";
import { countGavelMarks } from "@/lib/gavel-sound";

/* ------------------------------------------------------------------ */
/*  Role → colour (hex).  Inline styles avoid Tailwind purge issues.  */
/* ------------------------------------------------------------------ */

const ROLE_COLORS: Record<string, string> = {
  WM:     "#f59e0b", // amber-500
  SW:     "#0ea5e9", // sky-500
  JW:     "#14b8a6", // teal-500
  SD:     "#10b981", // emerald-500
  JD:     "#8b5cf6", // violet-500
  Chap:   "#6366f1", // indigo-500
  Tyl:    "#f43f5e", // rose-500
  Sec:    "#94a3b8", // slate-400
  Trs:    "#84cc16", // lime-500
  ALL:    "#d4d4d8", // zinc-300
  PRAYER: "#fbbf24", // amber-400
};

const DEFAULT_COLOR = "#71717a"; // zinc-500

function getRoleColor(role: string | null): string {
  if (!role) return DEFAULT_COLOR;
  return ROLE_COLORS[role] || DEFAULT_COLOR;
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface RitualScriptDisplayProps {
  sections: RitualSectionWithCipher[];
  currentIndex: number;
  /** Whether the reel is "live" (playing / rehearsing). */
  isActive: boolean;
  /** Rehearsal-mode: which role the user is practicing. */
  selectedRole?: string | null;
  /** Hide text on the current user-line (rehearsal "recite from memory"). */
  hideCurrentUserLine?: boolean;
  /** Fired when any line bar is clicked. */
  onLineClick?: (index: number) => void;
  /** Fired when a single word is clicked. */
  onWordClick?: (word: string, role: string | null) => void;
  /** DOM-id prefix so Listen / Rehearsal don't collide. */
  lineIdPrefix?: string;
  /** CSS max-height for the scrollable viewport. */
  maxHeight?: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function RitualScriptDisplay({
  sections,
  currentIndex,
  isActive,
  selectedRole,
  hideCurrentUserLine = false,
  onLineClick,
  onWordClick,
  lineIdPrefix = "ritual-line",
  maxHeight = "32rem",
}: RitualScriptDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  /* ---- auto-scroll current line to centre ---- */
  useEffect(() => {
    const el = document.getElementById(`${lineIdPrefix}-${currentIndex}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentIndex, lineIdPrefix]);

  /* ---- callbacks ---- */
  const handleLineClick = useCallback(
    (index: number) => onLineClick?.(index),
    [onLineClick],
  );

  const handleWordClick = useCallback(
    (word: string, role: string | null, e: React.MouseEvent) => {
      e.stopPropagation();
      onWordClick?.(word, role);
    },
    [onWordClick],
  );

  /* ---- render ---- */
  return (
    <div className="relative rounded-xl overflow-hidden">
      {/* Top gradient — slot-machine viewport edge */}
      <div
        className="absolute top-0 left-0 right-0 h-14 z-10 pointer-events-none"
        style={{ background: "linear-gradient(to bottom, #09090b, transparent)" }}
      />
      {/* Bottom gradient */}
      <div
        className="absolute bottom-0 left-0 right-0 h-14 z-10 pointer-events-none"
        style={{ background: "linear-gradient(to top, #09090b, transparent)" }}
      />

      {/* Scrollable reel */}
      <div
        ref={containerRef}
        className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-10 overflow-y-auto scroll-smooth"
        style={{ maxHeight }}
      >
        <div className="space-y-2.5">
          {sections.map((section, i) => {
            const isPast    = i < currentIndex && isActive;
            const isCurrent = i === currentIndex && isActive;
            const isFuture  = i > currentIndex && isActive;

            const isUserLine = !!(selectedRole && section.speaker === selectedRole);
            const roleColor  = getRoleColor(section.speaker);
            // In rehearsal mode AI lines show blue when current
            const isAiLineCurrent = isCurrent && !!selectedRole && !isUserLine;
            const color = isAiLineCurrent ? "#3b82f6" : roleColor;

            const gavels = section.gavels > 0
              ? section.gavels
              : countGavelMarks(section.text);
            const cleanText   = cleanRitualText(section.text);
            const displayText =
              section.cipherText && section.cipherText !== section.text
                ? section.cipherText
                : cleanText;

            const shouldHideText = isCurrent && isUserLine && hideCurrentUserLine;

            // Split into segments (words + whitespace) for per-word click
            const segments = displayText.split(/(\s+)/);

            return (
              <div
                key={section.id}
                id={`${lineIdPrefix}-${i}`}
                onClick={() => handleLineClick(i)}
                className={`
                  group relative flex overflow-hidden rounded-xl cursor-pointer
                  transition-all duration-500 ease-out
                  ${isCurrent ? "ritual-line-active" : ""}
                  ${isPast ? "opacity-30 scale-[0.97]" : ""}
                  ${isFuture ? "opacity-60 hover:opacity-90" : ""}
                  ${!isActive ? "hover:opacity-100" : ""}
                `}
                style={{
                  background: isCurrent
                    ? `linear-gradient(135deg, ${color}14, ${color}0a, transparent 70%)`
                    : isPast
                      ? "rgba(24,24,27,0.5)"
                      : "rgba(39,39,42,0.35)",
                  boxShadow: isCurrent
                    ? `0 0 40px ${color}18, 0 4px 24px rgba(0,0,0,0.35)`
                    : "none",
                  outline: isCurrent ? `1px solid ${color}35` : "1px solid transparent",
                }}
              >
                {/* Left accent bar */}
                <div
                  className={`w-1.5 flex-shrink-0 self-stretch transition-all duration-500 ${
                    isCurrent ? "ritual-glow-pulse" : ""
                  }`}
                  style={{
                    background: isCurrent
                      ? color
                      : isPast
                        ? "#3f3f46"
                        : "#52525b",
                  }}
                />

                {/* Content */}
                <div
                  className={`flex items-start gap-4 flex-1 px-5 transition-all duration-500 ${
                    isCurrent ? "py-5" : "py-3.5"
                  }`}
                >
                  {/* Role badge */}
                  <div className="flex-shrink-0 pt-0.5">
                    {section.speaker ? (
                      <span
                        className="inline-flex items-center justify-center min-w-[3.5rem] px-3 py-2 rounded-lg text-xs font-bold tracking-wide transition-all duration-300"
                        style={{
                          background: isCurrent ? `${color}25` : "rgba(39,39,42,0.8)",
                          color: isCurrent ? color : "#a1a1aa",
                          boxShadow: isCurrent
                            ? `0 0 0 1px ${color}40`
                            : "0 0 0 1px #3f3f46",
                        }}
                      >
                        {section.speaker}
                      </span>
                    ) : (
                      <span className="inline-flex items-center justify-center min-w-[3.5rem] px-3 py-2 rounded-lg text-xs text-zinc-600 bg-zinc-800/50 ring-1 ring-zinc-800">
                        ---
                      </span>
                    )}
                  </div>

                  {/* Text body */}
                  <div className="flex-1 min-w-0 pt-0.5">
                    {/* Gavel dots */}
                    {gavels > 0 && (
                      <div
                        className="flex gap-1.5 mb-2"
                        title={`${gavels} gavel knock${gavels !== 1 ? "s" : ""}`}
                      >
                        {Array.from({ length: gavels }).map((_, g) => (
                          <span
                            key={g}
                            className="inline-block w-2.5 h-2.5 rounded-full transition-colors duration-300"
                            style={{
                              background: isCurrent ? "#eab308" : "#854d0e80",
                            }}
                          />
                        ))}
                      </div>
                    )}

                    {/* Line text — each word individually clickable */}
                    <div
                      className="leading-relaxed"
                      style={{
                        fontSize: isCurrent ? "1rem" : "0.925rem",
                        color: isCurrent
                          ? color
                          : isPast
                            ? "#52525b"
                            : "#a1a1aa",
                        transition: "font-size 0.3s, color 0.3s",
                      }}
                    >
                      {shouldHideText ? (
                        <span className="italic" style={{ color: `${color}90` }}>
                          [ Your line &mdash; recite from memory ]
                        </span>
                      ) : displayText ? (
                        <span className="inline">
                          {segments.map((seg, wi) => {
                            // Whitespace — pass through
                            if (/^\s+$/.test(seg)) {
                              return <span key={wi}>{seg}</span>;
                            }
                            return (
                              <span
                                key={wi}
                                onClick={(e) =>
                                  handleWordClick(seg, section.speaker, e)
                                }
                                className="
                                  inline-block cursor-pointer rounded px-0.5 -mx-0.5
                                  transition-all duration-150
                                  hover:bg-white/10 hover:scale-105
                                  active:scale-95 active:bg-white/20
                                "
                              >
                                {seg}
                              </span>
                            );
                          })}
                        </span>
                      ) : (
                        <span className="italic text-zinc-600">
                          [stage direction]
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right side — playing indicator / hover play icon */}
                  <div className="flex-shrink-0 flex items-center pt-1.5">
                    {isCurrent && isActive ? (
                      <div className="flex gap-0.5 items-end h-5">
                        {[60, 100, 40, 80].map((h, j) => (
                          <span
                            key={j}
                            className="w-1 rounded-full animate-bounce"
                            style={{
                              height: `${h}%`,
                              background: color,
                              animationDelay: `${j * 150}ms`,
                            }}
                          />
                        ))}
                      </div>
                    ) : (
                      <svg
                        className="w-5 h-5 opacity-0 group-hover:opacity-50 transition-opacity duration-200"
                        fill="#71717a"
                        viewBox="0 0 24 24"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
