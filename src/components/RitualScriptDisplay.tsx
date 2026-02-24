"use client";

import { useRef, useCallback } from "react";
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
/*  3D Wheel configuration                                             */
/* ------------------------------------------------------------------ */

const VISIBLE_RANGE = 4;   // render ±4 lines from centre
const ANGLE_STEP   = 18;   // degrees between lines on the cylinder
const RADIUS       = 280;  // cylinder radius in px

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
  /** CSS max-height for the wheel viewport. */
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

  // When not yet active, centre on index 0
  const centerIndex = Math.max(0, currentIndex);

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

  /* ---- determine visible line window ---- */
  const visibleIndices: number[] = [];
  for (let i = centerIndex - VISIBLE_RANGE; i <= centerIndex + VISIBLE_RANGE; i++) {
    if (i >= 0 && i < sections.length) {
      visibleIndices.push(i);
    }
  }

  /* ---- render ---- */
  return (
    <div className="relative rounded-xl overflow-hidden">
      {/* Top gradient — wheel edge fade */}
      <div
        className="absolute top-0 left-0 right-0 h-20 z-10 pointer-events-none"
        style={{ background: "linear-gradient(to bottom, #09090b 8%, transparent)" }}
      />
      {/* Bottom gradient */}
      <div
        className="absolute bottom-0 left-0 right-0 h-20 z-10 pointer-events-none"
        style={{ background: "linear-gradient(to top, #09090b 8%, transparent)" }}
      />

      {/* Centre pointer — the "flapper" indicator */}
      <div
        className="absolute left-0 top-0 bottom-0 z-20 pointer-events-none flex items-center"
      >
        <div
          style={{
            width: "4px",
            height: "50px",
            background: "linear-gradient(to bottom, transparent, #f59e0b, transparent)",
            borderRadius: "2px",
            boxShadow: "0 0 10px #f59e0b50",
          }}
        />
      </div>

      {/* 3D Wheel viewport */}
      <div
        ref={containerRef}
        className="bg-zinc-900 border border-zinc-800 rounded-xl"
        style={{
          height: maxHeight,
          perspective: "1200px",
          perspectiveOrigin: "center center",
        }}
      >
        {/* 3D scene — items positioned on a vertical cylinder */}
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            transformStyle: "preserve-3d",
          }}
        >
          {visibleIndices.map((i) => {
            const offset    = i - centerIndex;
            const absOffset = Math.abs(offset);
            const angle = -offset * ANGLE_STEP;

            const section   = sections[i];
            const isPast    = i < currentIndex && isActive;
            const isCurrent = i === currentIndex && isActive;
            const isFuture  = i > currentIndex && isActive;

            const isUserLine = !!(selectedRole && section.speaker === selectedRole);
            const roleColor  = getRoleColor(section.speaker);
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
            const segments = displayText.split(/(\s+)/);

            // Opacity: current line is full, others fade with distance
            let itemOpacity: number;
            if (isCurrent) {
              itemOpacity = 1;
            } else if (isPast) {
              itemOpacity = Math.max(0.08, 0.4 - absOffset * 0.08);
            } else if (isFuture) {
              itemOpacity = Math.max(0.1, 0.75 - absOffset * 0.16);
            } else {
              itemOpacity = Math.max(0.12, 0.85 - absOffset * 0.18);
            }

            return (
              <div
                key={section.id}
                id={`${lineIdPrefix}-${i}`}
                onClick={() => handleLineClick(i)}
                className="ritual-wheel-item cursor-pointer"
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "0.5rem",
                  right: "0.5rem",
                  transform: `translateY(-50%) rotateX(${angle}deg) translateZ(${RADIUS}px)`,
                  backfaceVisibility: "hidden",
                  opacity: itemOpacity,
                  zIndex: VISIBLE_RANGE - absOffset + 1,
                  transition:
                    "transform 0.7s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.5s ease-out",
                  willChange: "transform, opacity",
                }}
              >
                {/* Line card — compact */}
                <div
                  className={`
                    group relative flex overflow-hidden rounded-lg
                    ${isCurrent ? "ritual-line-active" : ""}
                  `}
                  style={{
                    background: isCurrent
                      ? `linear-gradient(135deg, ${color}14, ${color}0a, transparent 70%)`
                      : isPast
                        ? "rgba(24,24,27,0.5)"
                        : "rgba(39,39,42,0.35)",
                    boxShadow: isCurrent
                      ? `0 0 30px ${color}15, 0 2px 16px rgba(0,0,0,0.3)`
                      : "none",
                    outline: isCurrent ? `1px solid ${color}35` : "1px solid transparent",
                  }}
                >
                  {/* Left accent bar */}
                  <div
                    className={`w-1 flex-shrink-0 self-stretch transition-all duration-500 ${
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

                  {/* Content — tight layout */}
                  <div
                    className={`flex items-center gap-2.5 flex-1 px-3 ${
                      isCurrent ? "py-2.5" : "py-1.5"
                    }`}
                  >
                    {/* Role badge — compact */}
                    <div className="flex-shrink-0">
                      {section.speaker ? (
                        <span
                          className="inline-flex items-center justify-center min-w-[2.5rem] px-2 py-1 rounded-md text-[0.65rem] font-bold tracking-wide transition-all duration-300"
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
                        <span className="inline-flex items-center justify-center min-w-[2.5rem] px-2 py-1 rounded-md text-[0.65rem] text-zinc-600 bg-zinc-800/50 ring-1 ring-zinc-800">
                          ---
                        </span>
                      )}
                    </div>

                    {/* Gavel dots — inline beside badge */}
                    {gavels > 0 && (
                      <div
                        className="flex gap-1 flex-shrink-0"
                        title={`${gavels} gavel knock${gavels !== 1 ? "s" : ""}`}
                      >
                        {Array.from({ length: gavels }).map((_, g) => (
                          <span
                            key={g}
                            className="inline-block w-2 h-2 rounded-full transition-colors duration-300"
                            style={{
                              background: isCurrent ? "#eab308" : "#854d0e80",
                            }}
                          />
                        ))}
                      </div>
                    )}

                    {/* Line text */}
                    <div
                      className="flex-1 min-w-0"
                      style={{
                        fontSize: isCurrent ? "0.8rem" : "0.75rem",
                        lineHeight: "1.4",
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
                          [ Your line — recite from memory ]
                        </span>
                      ) : displayText ? (
                        <span className="inline">
                          {segments.map((seg, wi) => {
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

                    {/* Right side — playing indicator */}
                    <div className="flex-shrink-0 flex items-center">
                      {isCurrent && isActive ? (
                        <div className="flex gap-0.5 items-end h-4">
                          {[60, 100, 40, 80].map((h, j) => (
                            <span
                              key={j}
                              className="w-0.5 rounded-full animate-bounce"
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
                          className="w-4 h-4 opacity-0 group-hover:opacity-50 transition-opacity duration-200"
                          fill="#71717a"
                          viewBox="0 0 24 24"
                        >
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      )}
                    </div>
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
