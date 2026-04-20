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
  beforeEach(() => {
    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
    });
  });

  it("defaults to gemini", () => {
    expect(getTTSEngine()).toBe("gemini");
  });

  it("persists engine selection to tts-engine-v2", () => {
    setTTSEngine("voxtral");
    expect(getTTSEngine()).toBe("voxtral");
    expect(localStorage.getItem("tts-engine-v2")).toBe("voxtral");
  });

  it("round-trips all engine names", () => {
    const engines = [
      "browser",
      "elevenlabs",
      "google-cloud",
      "deepgram",
      "kokoro",
      "voxtral",
      "gemini",
    ] as const;

    for (const engine of engines) {
      setTTSEngine(engine);
      expect(getTTSEngine()).toBe(engine);
    }
  });

  // Regression for the 2026-04-20 UI-subtraction PR.
  // Users with an old "tts-engine" value set via the retired dropdown
  // must converge to the baked-Gemini default on next load. The
  // key-bump (tts-engine → tts-engine-v2) achieves that by simply
  // never reading the old key again.
  it("ignores stale values at the old tts-engine key on load", async () => {
    const store: Record<string, string> = { "tts-engine": "deepgram" };
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
    });

    vi.resetModules();
    const fresh = await import("../text-to-speech");
    expect(fresh.getTTSEngine()).toBe("gemini");
    expect(store["tts-engine"]).toBe("deepgram");
    expect(store["tts-engine-v2"]).toBeUndefined();
  });

  it("reads tts-engine-v2 on load if already set", async () => {
    const store: Record<string, string> = { "tts-engine-v2": "voxtral" };
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
    });

    vi.resetModules();
    const fresh = await import("../text-to-speech");
    expect(fresh.getTTSEngine()).toBe("voxtral");
  });
});
