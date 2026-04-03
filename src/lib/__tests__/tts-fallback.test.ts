import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getLastTTSError,
  clearLastTTSError,
  getTTSEngine,
  setTTSEngine,
} from "../text-to-speech";

describe("TTS error tracking", () => {
  beforeEach(() => {
    clearLastTTSError();
  });

  it("starts with no error", () => {
    expect(getLastTTSError()).toBeNull();
  });

  it("clearLastTTSError resets to null", () => {
    clearLastTTSError();
    expect(getLastTTSError()).toBeNull();
  });
});

describe("TTS engine selection", () => {
  // Mock localStorage
  beforeEach(() => {
    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
    });
  });

  it("defaults to voxtral", () => {
    expect(getTTSEngine()).toBe("voxtral");
  });

  it("persists engine selection", () => {
    setTTSEngine("voxtral");
    expect(getTTSEngine()).toBe("voxtral");
    expect(localStorage.getItem("tts-engine")).toBe("voxtral");
  });

  it("round-trips all engine names", () => {
    const engines = [
      "browser",
      "elevenlabs",
      "google-cloud",
      "deepgram",
      "kokoro",
      "voxtral",
    ] as const;

    for (const engine of engines) {
      setTTSEngine(engine);
      expect(getTTSEngine()).toBe(engine);
    }
  });
});
