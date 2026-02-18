"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getTTSEngine,
  setTTSEngine,
  stopSpeaking,
  type TTSEngineName,
} from "@/lib/text-to-speech";
import { fetchEngineAvailability } from "@/lib/tts-cloud";

interface EngineOption {
  value: TTSEngineName;
  label: string;
  description: string;
}

const ENGINE_OPTIONS: EngineOption[] = [
  {
    value: "browser",
    label: "Browser",
    description: "Built-in — free, works offline",
  },
  {
    value: "elevenlabs",
    label: "ElevenLabs",
    description: "Premium — natural, human-like",
  },
  {
    value: "google-cloud",
    label: "Google Cloud",
    description: "Premium — Neural2 voices",
  },
];

/**
 * Compact TTS engine selector.
 * Shows a dropdown to switch between Browser / ElevenLabs / Google Cloud TTS.
 * Cloud engines that aren't configured (no API key) are still shown but
 * marked as unavailable.
 */
export default function TTSEngineSelector() {
  const [selected, setSelected] = useState<TTSEngineName>("browser");
  const [availability, setAvailability] = useState<{
    elevenlabs: boolean;
    google: boolean;
  }>({ elevenlabs: false, google: false });
  const [loaded, setLoaded] = useState(false);

  // Load current engine + check server availability
  useEffect(() => {
    setSelected(getTTSEngine());
    fetchEngineAvailability().then((a) => {
      setAvailability(a);
      setLoaded(true);
    });
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const engine = e.target.value as TTSEngineName;
      stopSpeaking();
      setTTSEngine(engine);
      setSelected(engine);
    },
    []
  );

  const isAvailable = (engine: TTSEngineName): boolean => {
    if (engine === "browser") return true;
    if (engine === "elevenlabs") return availability.elevenlabs;
    if (engine === "google-cloud") return availability.google;
    return false;
  };

  if (!loaded) return null;

  return (
    <div className="flex items-center gap-2">
      {/* Speaker icon */}
      <svg
        className="w-4 h-4 text-zinc-500 flex-shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
        />
      </svg>

      <select
        value={selected}
        onChange={handleChange}
        className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-300 text-xs focus:outline-none focus:border-amber-500 cursor-pointer"
      >
        {ENGINE_OPTIONS.map((opt) => {
          const available = isAvailable(opt.value);
          return (
            <option
              key={opt.value}
              value={opt.value}
              disabled={!available}
            >
              {opt.label}
              {opt.value !== "browser" &&
                (available ? ` — ${opt.description}` : " — API key not set")}
            </option>
          );
        })}
      </select>
    </div>
  );
}
