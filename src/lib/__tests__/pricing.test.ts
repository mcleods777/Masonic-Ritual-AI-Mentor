// @vitest-environment node
/**
 * Tests for src/lib/pricing.ts (D-08 + D-06d + Pitfall 6).
 *
 * Covers:
 *   - estimateCost() returns correct USD amounts per unit-type for each
 *     PricingEntry.kind (per-audio-token, per-character, per-input-token,
 *     per-output-token, per-audio-minute, self-hosted).
 *   - Unknown model returns 0 and emits a `[PRICING]` console.warn.
 *   - Unit-type mismatch returns 0 and emits a `[PRICING]` console.warn.
 *   - Every entry in PRICING_TABLE carries a verified date (2026-04-21)
 *     and an https:// sourceUrl.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { PRICING_TABLE, estimateCost } from "../pricing";

describe("pricing — estimateCost", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("computes per-audio-token cost for gemini-3.1-flash-tts-preview", () => {
    // $20 / 1M tokens × 100 tokens = $0.002
    expect(estimateCost("gemini-3.1-flash-tts-preview", 100, "per-audio-token")).toBeCloseTo(
      (100 * 20) / 1_000_000,
      10,
    );
  });

  it("computes per-character cost for elevenlabs", () => {
    // $120 / 1M chars × 1000 chars = $0.12
    expect(estimateCost("elevenlabs", 1000, "per-character")).toBeCloseTo(
      (1000 * 120) / 1_000_000,
      10,
    );
  });

  it("computes per-input-token cost for groq llama input", () => {
    // $0.59 / 1M × 10_000 = $0.0059
    expect(
      estimateCost("groq-llama-3.3-70b-versatile-input", 10_000, "per-input-token"),
    ).toBeCloseTo((10_000 * 0.59) / 1_000_000, 10);
  });

  it("computes per-output-token cost for groq llama output", () => {
    // $0.79 / 1M × 10_000 = $0.0079
    expect(
      estimateCost("groq-llama-3.3-70b-versatile-output", 10_000, "per-output-token"),
    ).toBeCloseTo((10_000 * 0.79) / 1_000_000, 10);
  });

  it("computes per-audio-minute cost for groq whisper", () => {
    // $0.00185 / min × 10 min = $0.0185
    expect(estimateCost("groq-whisper-large-v3", 10, "per-audio-minute")).toBeCloseTo(
      10 * 0.00185,
      10,
    );
  });

  it("returns 0 for self-hosted kokoro regardless of unitType requested", () => {
    expect(estimateCost("kokoro", 5000, "per-character")).toBe(0);
    expect(estimateCost("kokoro", 5000, "per-audio-minute")).toBe(0);
  });

  it("returns 0 and console.warn for an unknown model", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cost = estimateCost("nonexistent-model", 100, "per-character");
    expect(cost).toBe(0);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const firstArg = warnSpy.mock.calls[0][0] as string;
    expect(firstArg).toContain("[PRICING]");
    expect(firstArg).toContain("nonexistent-model");
  });

  it("returns 0 and warns on unit-type mismatch", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    // elevenlabs is per-character; requesting per-audio-minute is a mismatch
    const cost = estimateCost("elevenlabs", 10, "per-audio-minute");
    expect(cost).toBe(0);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain("[PRICING]");
  });

  it("returns 0 when units is NaN, Infinity, or <= 0", () => {
    expect(estimateCost("elevenlabs", Number.NaN, "per-character")).toBe(0);
    expect(estimateCost("elevenlabs", Number.POSITIVE_INFINITY, "per-character")).toBe(0);
    expect(estimateCost("elevenlabs", 0, "per-character")).toBe(0);
    expect(estimateCost("elevenlabs", -10, "per-character")).toBe(0);
  });
});

describe("pricing — PRICING_TABLE shape", () => {
  it("has at least 17 entries", () => {
    expect(Object.keys(PRICING_TABLE).length).toBeGreaterThanOrEqual(17);
  });

  it("every entry has verified=2026-04-21 and an https:// sourceUrl", () => {
    for (const [modelId, entry] of Object.entries(PRICING_TABLE)) {
      expect(entry.verified, `entry ${modelId} verified`).toBe("2026-04-21");
      expect(entry.sourceUrl, `entry ${modelId} sourceUrl`).toMatch(/^https:\/\//);
    }
  });

  it("includes the critical model IDs referenced elsewhere in the app", () => {
    // Confidence anchors — these must exist for downstream paid-route plans
    // (SAFETY-03 onwards) to compute estimatedCostUSD.
    const required = [
      "gemini-3.1-flash-tts-preview",
      "gemini-2.5-flash-preview-tts",
      "gemini-2.5-pro-preview-tts",
      "groq-whisper-large-v3",
      "groq-llama-3.3-70b-versatile-input",
      "groq-llama-3.3-70b-versatile-output",
      "mistral-small-latest-input",
      "mistral-small-latest-output",
      "mistral-voxtral-mini-transcribe-v2",
      "mistral-voxtral-tts",
      "elevenlabs",
      "google-tts-neural2",
      "google-tts-chirp3-hd",
      "google-tts-studio",
      "deepgram-aura-2",
      "deepgram-aura-1",
      "kokoro",
    ];
    for (const id of required) {
      expect(PRICING_TABLE[id], `PRICING_TABLE[${id}]`).toBeDefined();
    }
  });

  it("flags LOW-confidence entries (Mistral + Voxtral TTS) in notes per D-06d", () => {
    // D-06d: Shannon reviews these before merge.
    expect(PRICING_TABLE["mistral-small-latest-input"].notes).toMatch(/LOW confidence/i);
    expect(PRICING_TABLE["mistral-small-latest-output"].notes).toMatch(/LOW confidence/i);
    expect(PRICING_TABLE["mistral-voxtral-tts"].notes).toMatch(/LOW confidence/i);
  });
});
