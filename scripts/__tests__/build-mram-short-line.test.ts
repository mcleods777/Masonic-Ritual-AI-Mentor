/**
 * Tests for scripts/build-mram-from-dialogue.ts's short-line routing
 * (AUTHOR-04 D-01/D-02/D-04), duration-anomaly gate (AUTHOR-06), STT
 * round-trip gate (AUTHOR-07/D-03), and the D-08 tier-aware bake
 * manifest (_INDEX.json).
 *
 * External TTS/STT calls (Gemini render, Google Cloud TTS, Groq STT)
 * are mocked — no real API keys, no real ritual content. Duration
 * measurement (getOpusDurationMs) shells out to the REAL ffprobe binary
 * (a hard runtime dependency of this pipeline, confirmed present on this
 * dev machine) against small SYNTHETIC silent Opus fixtures generated
 * once via ffmpeg's lavfi anullsrc — mocking node:child_process's
 * execFileSync for this one module proved unreliable under Vitest's SSR
 * module graph for non-entry files that import a Node builtin (verified
 * via isolated repro during this plan's implementation), so real
 * ffprobe/ffmpeg calls against synthetic audio are used instead. Cache/
 * index writes go to a per-test temp directory, never rituals/_bake-cache/.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

// ------------------------------------------------------------
// Mocks — set up BEFORE importing the module under test so its
// top-level imports bind to these.
// ------------------------------------------------------------

const renderLineAudioMock = vi.fn();
const deleteCacheEntryMock = vi.fn();
vi.mock("../render-gemini-audio", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../render-gemini-audio")>();
  return {
    ...actual,
    renderLineAudio: (...args: unknown[]) => renderLineAudioMock(...args),
    deleteCacheEntry: (...args: unknown[]) => deleteCacheEntryMock(...args),
  };
});

const googleTtsBakeCallMock = vi.fn();
vi.mock("../lib/google-tts", () => ({
  googleTtsBakeCall: (...args: unknown[]) => googleTtsBakeCallMock(...args),
}));

const verifyLineAudioMock = vi.fn();
vi.mock("../lib/stt-verify", () => ({
  verifyLineAudio: (...args: unknown[]) => verifyLineAudioMock(...args),
}));

import {
  buildShortLinePrompt,
  classifyTier,
  resolveGoogleVoice,
  getOpusDurationMs,
  runDurationAnomalyGate,
  runSttGate,
  readBakeIndex,
  upsertBakeIndexEntry,
  tryReadCompletedLineFromCache,
  renderShortLineWithGates,
  renderNormalLineWithGates,
  SHORT_LINE_MAX_CHARS,
  GOOGLE_FALLBACK_DEFAULT_VOICE,
  type BakeIndexEntry,
} from "../build-mram-from-dialogue";
import { computeCacheKey, DEFAULT_MODELS } from "../render-gemini-audio";
import type { DurationSample } from "../lib/bake-math";

// ------------------------------------------------------------
// Synthetic audio fixtures (real ffmpeg-generated silence — not ritual
// content, not real speech; just controllable-duration Opus bytes for
// exercising the duration-anomaly gate deterministically).
// ------------------------------------------------------------

function generateSilentOpus(seconds: number): Buffer {
  const tmp = path.join(os.tmpdir(), `bake-test-fixture-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.opus`);
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "lavfi", "-i", `anullsrc=r=24000:cl=mono`,
    "-t", String(seconds),
    "-c:a", "libopus", "-b:a", "32k",
    tmp,
  ]);
  const buf = fs.readFileSync(tmp);
  fs.unlinkSync(tmp);
  return buf;
}

let shortOpus: Buffer; // ~100ms — used wherever gate outcome doesn't matter
let anomalousOpus: Buffer; // ~3s — used to trip the duration-anomaly gate

beforeAll(() => {
  shortOpus = generateSilentOpus(0.1);
  anomalousOpus = generateSilentOpus(3);
});

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bake-short-line-test-"));
  renderLineAudioMock.mockReset();
  deleteCacheEntryMock.mockReset();
  googleTtsBakeCallMock.mockReset();
  verifyLineAudioMock.mockReset();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function fakeOpus(label: string): Buffer {
  // Only valid for CACHE-HIT scenarios (never passed through ffprobe).
  return Buffer.from(`FAKE-OPUS-${label}`);
}

const PREFERRED_MODEL = DEFAULT_MODELS[0];
const FALLBACK_MODEL = DEFAULT_MODELS[1];

// ------------------------------------------------------------
// Pure helpers
// ------------------------------------------------------------

describe("buildShortLinePrompt", () => {
  it("wraps the target text in an instructional 'Say only' prompt (never additional speakable prose)", () => {
    expect(buildShortLinePrompt("B.")).toBe("Say only these exact words, nothing else: B.");
  });
});

describe("classifyTier", () => {
  it("classifies the preferred model as premium", () => {
    expect(classifyTier(PREFERRED_MODEL, PREFERRED_MODEL)).toBe("premium");
  });
  it("classifies any other Gemini model as fallback", () => {
    expect(classifyTier(FALLBACK_MODEL, PREFERRED_MODEL)).toBe("fallback");
  });
  it("classifies a google: engine model as fallback", () => {
    expect(classifyTier("google:en-US-Neural2-D", PREFERRED_MODEL)).toBe("fallback");
  });
});

describe("resolveGoogleVoice (D-04)", () => {
  it("returns the pinned googleVoice when present", () => {
    const voiceCast = { version: 1 as const, roles: { WM: { googleVoice: "en-US-Studio-Q" } } };
    expect(resolveGoogleVoice(voiceCast, "WM")).toBe("en-US-Studio-Q");
  });
  it("falls back to GOOGLE_FALLBACK_DEFAULT_VOICE when unpinned", () => {
    const voiceCast = { version: 1 as const, roles: { WM: {} } };
    expect(resolveGoogleVoice(voiceCast, "WM")).toBe(GOOGLE_FALLBACK_DEFAULT_VOICE);
  });
  it("falls back to the default when voiceCast is undefined", () => {
    expect(resolveGoogleVoice(undefined, "WM")).toBe(GOOGLE_FALLBACK_DEFAULT_VOICE);
  });
});

describe("getOpusDurationMs", () => {
  it("returns a duration close to the real ffprobe-measured length of a fixture", () => {
    const ms = getOpusDurationMs(shortOpus);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThan(1000); // ~100ms fixture, generous upper bound
  });

  it("cleans up its own temp probe file", () => {
    const before = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith("bake-duration-probe-"));
    getOpusDurationMs(shortOpus);
    const after = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith("bake-duration-probe-"));
    expect(after.length).toBe(before.length);
  });
});

// ------------------------------------------------------------
// AUTHOR-06 duration-anomaly gate (30-sample warm-up window)
// ------------------------------------------------------------

describe("runDurationAnomalyGate (AUTHOR-06, Pitfall 5 warm-up window)", () => {
  it("skips the check with 29 prior samples and logs the warm-up message", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const samples: DurationSample[] = Array.from({ length: 29 }, () => ({ durationMs: 100, charCount: 5 }));
    const result = runDurationAnomalyGate(10_000, 5, samples); // wildly anomalous duration
    expect(result.tripped).toBe(false);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("sample too small — skipping anomaly check"));
    expect(samples.length).toBe(30); // current sample still appended
    errSpy.mockRestore();
  });

  it("trips the gate with 30 prior samples when the current line is a 4x+ outlier", () => {
    // 30 prior samples at 100ms/5chars => 0.02 sec/char median.
    const samples: DurationSample[] = Array.from({ length: 30 }, () => ({ durationMs: 100, charCount: 5 }));
    // This line: 1000ms / 5 chars = 0.2 sec/char = 10x median — well past 3.0x band.
    const result = runDurationAnomalyGate(1000, 5, samples);
    expect(result.tripped).toBe(true);
    expect(result.detail).toContain("median");
  });

  it("does not trip for a line within the normal band", () => {
    const samples: DurationSample[] = Array.from({ length: 30 }, () => ({ durationMs: 100, charCount: 5 }));
    const result = runDurationAnomalyGate(110, 5, samples); // 1.1x median
    expect(result.tripped).toBe(false);
  });
});

// ------------------------------------------------------------
// AUTHOR-07 / D-03 STT round-trip gate
// ------------------------------------------------------------

describe("runSttGate (AUTHOR-07)", () => {
  it("no-ops (never trips) when groqApiKey is absent", async () => {
    const result = await runSttGate(shortOpus, "So mote it be.", undefined);
    expect(result.tripped).toBe(false);
    expect(verifyLineAudioMock).not.toHaveBeenCalled();
  });

  it("passes when verifyLineAudio reports ok:true", async () => {
    verifyLineAudioMock.mockResolvedValue({ ok: true, missed: [], inserted: [], transcript: "so mote it be" });
    const result = await runSttGate(shortOpus, "So mote it be.", "groq-key");
    expect(result.tripped).toBe(false);
  });

  it("trips when verifyLineAudio reports ok:false, with missed/inserted in the detail", async () => {
    verifyLineAudioMock.mockResolvedValue({
      ok: false,
      missed: ["bee"],
      inserted: ["dee"],
      transcript: "dee",
    });
    const result = await runSttGate(shortOpus, "Bee.", "groq-key");
    expect(result.tripped).toBe(true);
    expect(result.detail).toContain("bee");
    expect(result.detail).toContain("dee");
  });
});

// ------------------------------------------------------------
// D-08 tier-aware bake manifest (_INDEX.json)
// ------------------------------------------------------------

describe("readBakeIndex / upsertBakeIndexEntry (D-08 bake manifest)", () => {
  function entry(overrides: Partial<BakeIndexEntry> = {}): BakeIndexEntry {
    return {
      cacheKey: "abc123",
      model: PREFERRED_MODEL,
      ritualSlug: "ea-opening",
      lineId: 42,
      byteLen: 1000,
      durationMs: 500,
      createdAt: new Date().toISOString(),
      tier: "premium",
      ...overrides,
    };
  }

  it("returns an empty array when no _INDEX.json exists", () => {
    expect(readBakeIndex(tmpDir)).toEqual([]);
  });

  it("round-trips a written entry, including tier:'fallback'", () => {
    upsertBakeIndexEntry(tmpDir, entry({ tier: "fallback", model: "google:en-US-Neural2-D" }));
    const index = readBakeIndex(tmpDir);
    expect(index).toHaveLength(1);
    expect(index[0].tier).toBe("fallback");
    expect(index[0].model).toBe("google:en-US-Neural2-D");
  });

  it("updates in place (same ritualSlug/lineId/cacheKey) rather than duplicating", () => {
    upsertBakeIndexEntry(tmpDir, entry({ byteLen: 1000 }));
    upsertBakeIndexEntry(tmpDir, entry({ byteLen: 2000 }));
    const index = readBakeIndex(tmpDir);
    expect(index).toHaveLength(1);
    expect(index[0].byteLen).toBe(2000);
  });

  it("appends a distinct entry for a different lineId", () => {
    upsertBakeIndexEntry(tmpDir, entry({ lineId: 1 }));
    upsertBakeIndexEntry(tmpDir, entry({ lineId: 2 }));
    expect(readBakeIndex(tmpDir)).toHaveLength(2);
  });

  it("writes atomically — no leftover .tmp file (CR-03: to a per-slug shard, not the shared _INDEX.json)", () => {
    upsertBakeIndexEntry(tmpDir, entry());
    const files = fs.readdirSync(tmpDir);
    expect(files.some((f) => f.endsWith(".tmp"))).toBe(false);
    expect(files).toContain("_INDEX.ea-opening.json");
    expect(files).not.toContain("_INDEX.json");
  });
});

// ------------------------------------------------------------
// --resume-state-path cache lookup
// ------------------------------------------------------------

describe("tryReadCompletedLineFromCache (--resume-state-path)", () => {
  it("returns null when nothing is cached on disk", () => {
    const hit = tryReadCompletedLineFromCache({
      cacheDir: tmpDir,
      isShort: false,
      cleanText: "So mote it be.",
      style: undefined,
      voice: "Charon",
      preamble: "",
      modelChain: DEFAULT_MODELS,
      googleVoice: GOOGLE_FALLBACK_DEFAULT_VOICE,
    });
    expect(hit).toBeNull();
  });

  it("finds a normal-line premium-tier entry already on disk", () => {
    const key = computeCacheKey("So mote it be.", undefined, "Charon", PREFERRED_MODEL, "");
    fs.writeFileSync(path.join(tmpDir, `${key}.opus`), fakeOpus("premium"));
    const hit = tryReadCompletedLineFromCache({
      cacheDir: tmpDir,
      isShort: false,
      cleanText: "So mote it be.",
      style: undefined,
      voice: "Charon",
      preamble: "",
      modelChain: DEFAULT_MODELS,
      googleVoice: GOOGLE_FALLBACK_DEFAULT_VOICE,
    });
    expect(hit).not.toBeNull();
    expect(hit!.model).toBe(PREFERRED_MODEL);
    expect(hit!.opus.toString()).toBe(fakeOpus("premium").toString());
  });

  it("finds a short-line padded-Gemini entry keyed on the instructional prompt", () => {
    const padded = buildShortLinePrompt("B.");
    const key = computeCacheKey(padded, undefined, "Charon", PREFERRED_MODEL, "");
    fs.writeFileSync(path.join(tmpDir, `${key}.opus`), fakeOpus("padded"));
    const hit = tryReadCompletedLineFromCache({
      cacheDir: tmpDir,
      isShort: true,
      cleanText: "B.",
      style: undefined,
      voice: "Charon",
      preamble: "",
      modelChain: DEFAULT_MODELS,
      googleVoice: GOOGLE_FALLBACK_DEFAULT_VOICE,
    });
    expect(hit).not.toBeNull();
    expect(hit!.model).toBe(PREFERRED_MODEL);
  });

  it("falls back to the Google-tier entry for a short line when no Gemini entry exists", () => {
    const googleModel = `google:${GOOGLE_FALLBACK_DEFAULT_VOICE}`;
    const key = computeCacheKey("B.", undefined, GOOGLE_FALLBACK_DEFAULT_VOICE, googleModel, "");
    fs.writeFileSync(path.join(tmpDir, `${key}.opus`), fakeOpus("google"));
    const hit = tryReadCompletedLineFromCache({
      cacheDir: tmpDir,
      isShort: true,
      cleanText: "B.",
      style: undefined,
      voice: "Charon",
      preamble: "",
      modelChain: DEFAULT_MODELS,
      googleVoice: GOOGLE_FALLBACK_DEFAULT_VOICE,
    });
    expect(hit).not.toBeNull();
    expect(hit!.model).toBe(googleModel);
  });
});

// ------------------------------------------------------------
// Short-line render + gate pipeline (D-01/D-02/D-03/D-04)
// ------------------------------------------------------------

function mockRenderLineAudioOnce(opts: { status: "rendered" | "cache-hit"; model?: string; opus: Buffer; cacheKey?: string }) {
  renderLineAudioMock.mockImplementationOnce(async (_text, _style, _voice, options) => {
    options.onProgress?.({
      status: opts.status,
      model: opts.model,
      cacheKey: opts.cacheKey ?? "fake-cache-key",
      bytesOut: opts.opus.length,
    });
    return opts.opus;
  });
}

describe("renderShortLineWithGates (D-01/D-02/D-03) — 5-char line routing", () => {
  const baseOpts = () => ({
    cleanText: "B.",
    voice: "Charon",
    googleVoice: "en-US-Neural2-D",
    apiKeys: ["key1"],
    models: DEFAULT_MODELS,
    cacheDir: tmpDir,
    groqApiKey: undefined as string | undefined,
    googleApiKey: "google-key" as string | undefined,
    noShortLineStt: true, // isolate duration-gate-only scenarios by default
    durationSamples: [] as DurationSample[],
  });

  it("routes Gemini-padded first: renderLineAudio is called with the instructional prompt, no preamble", async () => {
    mockRenderLineAudioOnce({ status: "rendered", model: PREFERRED_MODEL, opus: shortOpus });
    const result = await renderShortLineWithGates(baseOpts());

    expect(renderLineAudioMock).toHaveBeenCalledTimes(1);
    const [text, style, voice, , preamble] = renderLineAudioMock.mock.calls[0];
    expect(text).toBe(buildShortLinePrompt("B."));
    expect(style).toBeUndefined();
    expect(voice).toBe("Charon");
    expect(preamble).toBe("");
    expect(result.model).toBe(PREFERRED_MODEL);
    expect(googleTtsBakeCallMock).not.toHaveBeenCalled();
  });

  it("trusts a cache hit without re-running gates", async () => {
    mockRenderLineAudioOnce({ status: "cache-hit", opus: fakeOpus("cached") });
    const opts = baseOpts();
    opts.noShortLineStt = false;
    opts.groqApiKey = "groq-key";
    const result = await renderShortLineWithGates(opts);
    expect(result.fromCache).toBe(true);
    expect(verifyLineAudioMock).not.toHaveBeenCalled();
  });

  it("on gate failure (duration anomaly), deletes the Gemini cache entry and falls back to googleTtsBakeCall with the RAW text (no preamble/padding)", async () => {
    mockRenderLineAudioOnce({
      status: "rendered",
      model: PREFERRED_MODEL,
      opus: anomalousOpus, // ~3s for a 2-char line — way outside the band
      cacheKey: "gemini-cache-key-123",
    });
    googleTtsBakeCallMock.mockResolvedValue(shortOpus);

    const opts = baseOpts();
    opts.durationSamples = Array.from({ length: 30 }, () => ({ durationMs: 20, charCount: 2 }));

    const result = await renderShortLineWithGates(opts);

    expect(deleteCacheEntryMock).toHaveBeenCalledWith("gemini-cache-key-123", tmpDir);
    expect(googleTtsBakeCallMock).toHaveBeenCalledTimes(1);
    const [gText, gVoice, gKey] = googleTtsBakeCallMock.mock.calls[0];
    expect(gText).toBe("B."); // raw text, not the padded prompt (Pitfall 4)
    expect(gVoice).toBe("en-US-Neural2-D");
    expect(gKey).toBe("google-key");

    expect(result.model).toBe("google:en-US-Neural2-D");
    expect(result.model.startsWith("google:")).toBe(true);
    expect(result.fromCache).toBe(false);

    // Google-path cache write uses a modelId beginning "google:" in the v3 key.
    const expectedKey = computeCacheKey("B.", undefined, "en-US-Neural2-D", "google:en-US-Neural2-D", "");
    expect(result.cacheKey).toBe(expectedKey);
    expect(fs.existsSync(path.join(tmpDir, `${expectedKey}.opus`))).toBe(true);
  });

  it("on STT gate failure, falls back to Google with the raw expected text", async () => {
    mockRenderLineAudioOnce({ status: "rendered", model: PREFERRED_MODEL, opus: shortOpus });
    verifyLineAudioMock.mockResolvedValue({ ok: false, missed: ["b"], inserted: ["d"], transcript: "dee" });
    googleTtsBakeCallMock.mockResolvedValue(shortOpus);

    const opts = baseOpts();
    opts.noShortLineStt = false;
    opts.groqApiKey = "groq-key";

    const result = await renderShortLineWithGates(opts);
    expect(verifyLineAudioMock).toHaveBeenCalledTimes(1);
    expect(googleTtsBakeCallMock).toHaveBeenCalledWith("B.", "en-US-Neural2-D", "google-key");
    expect(result.model).toBe("google:en-US-Neural2-D");
  });

  it("refuses (throws, naming the line) when both engines fail", async () => {
    renderLineAudioMock.mockRejectedValueOnce(new Error("text-token regression"));
    googleTtsBakeCallMock.mockRejectedValueOnce(new Error("Google TTS 500"));

    let caught: Error | undefined;
    try {
      await renderShortLineWithGates(baseOpts());
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).toBeDefined();
    expect(caught!.message).toMatch(/B\./);
    expect(caught!.message).toMatch(/both engines failed/i);
  });

  it("refuses immediately (no Google attempt) when GOOGLE_CLOUD_TTS_API_KEY is absent and Gemini fails", async () => {
    renderLineAudioMock.mockRejectedValueOnce(new Error("text-token regression"));
    const opts = baseOpts();
    opts.googleApiKey = undefined;

    await expect(renderShortLineWithGates(opts)).rejects.toThrow(/GOOGLE_CLOUD_TTS_API_KEY/);
    expect(googleTtsBakeCallMock).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------------------
// Normal-line render + gate pipeline (AUTHOR-06 / AUTHOR-07)
// ------------------------------------------------------------

describe("renderNormalLineWithGates (AUTHOR-06/07) — lines >= SHORT_LINE_MAX_CHARS", () => {
  const LONG_TEXT = "The Worshipful Master will now open the Lodge in due form.";

  it("fixture sanity: LONG_TEXT is at/above SHORT_LINE_MAX_CHARS", () => {
    expect(LONG_TEXT.length).toBeGreaterThanOrEqual(SHORT_LINE_MAX_CHARS);
  });

  const baseOpts = () => ({
    cleanText: LONG_TEXT,
    style: undefined as string | undefined,
    voice: "Charon",
    preamble: "",
    apiKeys: ["key1"],
    models: DEFAULT_MODELS,
    cacheDir: tmpDir,
    verifyAudio: false,
    groqApiKey: undefined as string | undefined,
    durationSamples: [] as DurationSample[],
  });

  it("skips gates entirely on a cache hit", async () => {
    mockRenderLineAudioOnce({ status: "cache-hit", opus: fakeOpus("cached") });
    const opts = baseOpts();
    opts.verifyAudio = true;
    opts.groqApiKey = "groq-key";
    const result = await renderNormalLineWithGates(opts);
    expect(result.fromCache).toBe(true);
    expect(verifyLineAudioMock).not.toHaveBeenCalled();
  });

  it("--verify-audio: an ok:true verifyLineAudio result passes", async () => {
    mockRenderLineAudioOnce({ status: "rendered", model: PREFERRED_MODEL, opus: shortOpus });
    verifyLineAudioMock.mockResolvedValue({ ok: true, missed: [], inserted: [], transcript: LONG_TEXT.toLowerCase() });
    const opts = baseOpts();
    opts.verifyAudio = true;
    opts.groqApiKey = "groq-key";
    const result = await renderNormalLineWithGates(opts);
    expect(result.fromCache).toBe(false);
    expect(result.model).toBe(PREFERRED_MODEL);
  });

  it("--verify-audio: a mocked non-ok verifyLineAudio result fails the bake, naming the mismatch", async () => {
    mockRenderLineAudioOnce({ status: "rendered", model: PREFERRED_MODEL, opus: shortOpus });
    verifyLineAudioMock.mockResolvedValue({
      ok: false,
      missed: ["lodge"],
      inserted: ["meeting"],
      transcript: "the worshipful master will now open the meeting in due form",
    });
    const opts = baseOpts();
    opts.verifyAudio = true;
    opts.groqApiKey = "groq-key";

    let caught: Error | undefined;
    try {
      await renderNormalLineWithGates(opts);
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).toBeDefined();
    expect(caught!.message).toMatch(/verify-audio/i);
    expect(caught!.message).toMatch(/lodge/);
  });

  it("does not run --verify-audio when the flag is off", async () => {
    mockRenderLineAudioOnce({ status: "rendered", model: PREFERRED_MODEL, opus: shortOpus });
    const opts = baseOpts();
    opts.verifyAudio = false;
    opts.groqApiKey = "groq-key";
    await renderNormalLineWithGates(opts);
    expect(verifyLineAudioMock).not.toHaveBeenCalled();
  });

  it("30+ prior samples: a duration-anomaly-outlier normal line fails the bake with no fallback engine available", async () => {
    mockRenderLineAudioOnce({ status: "rendered", model: PREFERRED_MODEL, opus: anomalousOpus });
    const opts = baseOpts();
    // 30 prior samples at 200ms for ~60 chars => ~0.0033 sec/char median.
    // anomalousOpus (~3000ms) for the same ~60-char text => ~0.05 sec/char,
    // a >10x outlier — well past the 3.0x band.
    opts.durationSamples = Array.from({ length: 30 }, () => ({ durationMs: 200, charCount: LONG_TEXT.length }));
    await expect(renderNormalLineWithGates(opts)).rejects.toThrow(/duration-anomaly/);
  });
});
