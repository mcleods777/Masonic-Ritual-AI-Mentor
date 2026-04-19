/**
 * render-gemini-audio.ts — Render a ritual line to Opus bytes via Gemini
 * TTS, caching results locally so re-runs (or resumed runs after a quota
 * hit) don't re-burn API calls.
 *
 * Used by build-mram-from-dialogue.ts --with-audio to bake audio into
 * .mram files at build time. Keeping this module separate keeps the
 * build script's CLI concerns apart from the audio pipeline concerns,
 * and lets tests exercise the rendering logic without interactive
 * passphrase prompts.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
import { spawn } from "node:child_process";

// ============================================================
// Config
// ============================================================

/**
 * Models tried in order. Same chain as src/app/api/tts/gemini/route.ts.
 * Overridable via GEMINI_TTS_MODELS env var (comma-separated).
 */
const DEFAULT_MODELS = [
  "gemini-3.1-flash-tts-preview",
  "gemini-2.5-flash-preview-tts",
  "gemini-2.5-pro-preview-tts",
];

/** Opus encoding target — 32 kbps mono is transparent for speech. */
const OPUS_BITRATE = "32k";

/** Cache directory. Honor XDG_CACHE_HOME if set. */
const CACHE_DIR = path.join(
  process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache"),
  "masonic-mram-audio",
);

/** Cache format version. Bump when we change the Opus encoding params
 *  so old cached entries miss instead of replaying stale audio. */
const CACHE_KEY_VERSION = "v1";

// ============================================================
// Types
// ============================================================

export interface RenderOptions {
  /** Gemini API key. Required. */
  apiKey: string;
  /** Models to try, in order. Defaults to DEFAULT_MODELS (env-overridable). */
  models?: string[];
  /** Override cache dir, for tests. */
  cacheDir?: string;
  /** Progress callback: fires once per line. */
  onProgress?: (event: RenderProgress) => void;
  /** Quota-exhaustion handler. Default: sleep until midnight PT. */
  onAllModelsExhausted?: () => Promise<void>;
}

export interface RenderProgress {
  status: "cache-hit" | "rendered" | "waiting-for-quota-reset";
  model?: string;
  cacheKey: string;
  bytesOut?: number;
  waitUntil?: Date;
}

// ============================================================
// Public API
// ============================================================

/**
 * Render a single (text, style, voice) combination to Opus bytes.
 * Returns the raw Opus binary. Callers base64-encode for .mram embedding.
 *
 * Caches to ~/.cache/masonic-mram-audio/{sha256}.opus so re-runs skip the
 * Gemini API entirely. Safe to interrupt with Ctrl-C and resume — each
 * line's cache entry lands atomically or not at all.
 */
export async function renderLineAudio(
  text: string,
  style: string | undefined,
  voice: string,
  options: RenderOptions,
): Promise<Buffer> {
  const cacheDir = options.cacheDir ?? CACHE_DIR;
  fs.mkdirSync(cacheDir, { recursive: true });

  const cacheKey = computeCacheKey(text, style, voice);
  const cachePath = path.join(cacheDir, `${cacheKey}.opus`);

  if (fs.existsSync(cachePath)) {
    options.onProgress?.({ status: "cache-hit", cacheKey });
    return fs.readFileSync(cachePath);
  }

  const models = options.models ?? readModelsFromEnv() ?? DEFAULT_MODELS;
  const waitHandler = options.onAllModelsExhausted ?? sleepUntilMidnightPT;

  // Retry loop: try each model, on all-models-429 wait for quota reset
  // and go around again. Callers can cap this with their own timeout.
  while (true) {
    try {
      const { wav, model } = await callGeminiWithFallback(
        text,
        style,
        voice,
        models,
        options.apiKey,
      );
      const opus = await encodeWavToOpus(wav);

      // Atomic write: stage to .tmp then rename. Prevents corrupt cache
      // entries if the script is killed mid-write.
      const tmpPath = `${cachePath}.tmp`;
      fs.writeFileSync(tmpPath, opus);
      fs.renameSync(tmpPath, cachePath);

      options.onProgress?.({
        status: "rendered",
        model,
        cacheKey,
        bytesOut: opus.length,
      });
      return opus;
    } catch (err) {
      if (err instanceof AllModelsQuotaExhausted) {
        const waitUntil = nextMidnightPT();
        options.onProgress?.({
          status: "waiting-for-quota-reset",
          cacheKey,
          waitUntil,
        });
        await waitHandler();
        continue; // retry from the top with fresh quota
      }
      throw err;
    }
  }
}

/**
 * Delete a specific cache entry by its cacheKey. Returns true if the
 * file existed and was removed, false if it wasn't there. Used by the
 * build script on the abort path to remove a just-rendered fallback-tier
 * entry so a re-run after quota reset produces a uniform premium bake
 * instead of a silent cache-hit on the degraded bytes.
 */
export function deleteCacheEntry(cacheKey: string, cacheDir?: string): boolean {
  const dir = cacheDir ?? CACHE_DIR;
  const cachePath = path.join(dir, `${cacheKey}.opus`);
  if (fs.existsSync(cachePath)) {
    fs.unlinkSync(cachePath);
    return true;
  }
  return false;
}

// ============================================================
// Gemini API call with 3-model fallback
// ============================================================

class AllModelsQuotaExhausted extends Error {
  constructor(public attempted: string[]) {
    super(`All ${attempted.length} Gemini models returned 429: ${attempted.join(", ")}`);
  }
}

async function callGeminiWithFallback(
  text: string,
  style: string | undefined,
  voice: string,
  models: string[],
  apiKey: string,
): Promise<{ wav: Buffer; model: string }> {
  const prompt = style ? `[${style}] ${text}` : text;
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voice },
        },
      },
    },
  });

  const attempted: string[] = [];
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    if (resp.status === 429 || resp.status === 404) {
      attempted.push(model);
      continue;
    }

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Gemini ${model} returned ${resp.status}: ${errText.slice(0, 300)}`);
    }

    const wav = await consumeSseToWav(resp);
    return { wav, model };
  }

  throw new AllModelsQuotaExhausted(attempted);
}

/**
 * Read the SSE stream server-side, accumulate PCM bytes, wrap in a WAV
 * header with the correct dataSize. Mirrors the logic in
 * src/app/api/tts/gemini/route.ts (server-side buffering — see PR #54).
 */
async function consumeSseToWav(resp: Response): Promise<Buffer> {
  const reader = resp.body?.getReader();
  if (!reader) throw new Error("Gemini returned 200 but no response body");

  const decoder = new TextDecoder();
  let sseBuffer = "";
  const pcmChunks: Buffer[] = [];
  let mimeType = "audio/L16;codec=pcm;rate=24000";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    sseBuffer += decoder.decode(value, { stream: true });

    const events = sseBuffer.split(/\r?\n\r?\n/);
    sseBuffer = events.pop() || "";

    for (const event of events) {
      const dataLine = event.split(/\r?\n/).find((l) => /^data:\s*/.test(l));
      if (!dataLine) continue;
      const jsonStr = dataLine.replace(/^data:\s*/, "").trim();
      if (!jsonStr || jsonStr === "[DONE]") continue;

      try {
        const parsed = JSON.parse(jsonStr);
        const part = parsed?.candidates?.[0]?.content?.parts?.[0];
        const b64 = part?.inlineData?.data;
        if (!b64) continue;
        if (part?.inlineData?.mimeType) mimeType = part.inlineData.mimeType;
        pcmChunks.push(Buffer.from(b64, "base64"));
      } catch {
        // Malformed SSE event — skip.
      }
    }
  }

  if (pcmChunks.length === 0) {
    throw new Error("Gemini SSE stream returned no audio chunks");
  }

  const pcm = Buffer.concat(pcmChunks);
  const sampleRate = parseSampleRate(mimeType);
  const header = buildWavHeader(sampleRate, 1, 16, pcm.length);
  return Buffer.concat([header, pcm]);
}

// ============================================================
// Opus encoding via ffmpeg
// ============================================================

/**
 * Encode WAV bytes to Opus (32 kbps mono) by shelling out to ffmpeg.
 * Requires ffmpeg in PATH. The encoder reads WAV from stdin and writes
 * Opus-in-Ogg to stdout so nothing touches disk between WAV and Opus.
 */
async function encodeWavToOpus(wav: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel", "error",
      "-f", "wav",
      "-i", "pipe:0",
      "-c:a", "libopus",
      "-b:a", OPUS_BITRATE,
      "-ac", "1", // force mono
      "-f", "ogg",
      "pipe:1",
    ]);

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    proc.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
    proc.stderr.on("data", (chunk) => stderrChunks.push(chunk));

    proc.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error(
          "ffmpeg not found in PATH. Install it:\n" +
            "  macOS:  brew install ffmpeg\n" +
            "  Ubuntu: sudo apt install ffmpeg\n" +
            "  Windows: winget install ffmpeg",
        ));
      } else {
        reject(err);
      }
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        const stderr = Buffer.concat(stderrChunks).toString("utf-8").trim();
        reject(new Error(`ffmpeg exited ${code}: ${stderr}`));
        return;
      }
      resolve(Buffer.concat(stdoutChunks));
    });

    proc.stdin.write(wav);
    proc.stdin.end();
  });
}

// ============================================================
// Cache key + WAV helpers
// ============================================================

function computeCacheKey(text: string, style: string | undefined, voice: string): string {
  const material = `${CACHE_KEY_VERSION}\x00${text}\x00${style ?? ""}\x00${voice}`;
  return crypto.createHash("sha256").update(material).digest("hex");
}

function readModelsFromEnv(): string[] | null {
  const env = process.env.GEMINI_TTS_MODELS?.trim();
  if (!env) return null;
  const parsed = env.split(",").map((s) => s.trim()).filter(Boolean);
  return parsed.length > 0 ? parsed : null;
}

function parseSampleRate(mimeType: string): number {
  const m = /rate=(\d+)/.exec(mimeType);
  if (m) {
    const rate = parseInt(m[1], 10);
    if (Number.isFinite(rate) && rate > 0) return rate;
  }
  return 24000;
}

function buildWavHeader(
  sampleRate: number,
  channels: number,
  bitsPerSample: number,
  dataSize: number,
): Buffer {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataSize, 40);
  return header;
}

// ============================================================
// Quota-reset wait (midnight Pacific Time)
// ============================================================

function nextMidnightPT(): Date {
  // Pacific Time is UTC-7 during DST (March-November) and UTC-8 otherwise.
  // Daily quota reset per Google AI Studio. We compute "next 00:00 Los
  // Angeles time" using Intl.DateTimeFormat for correctness across DST.
  const now = new Date();
  const ptFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = ptFormatter.formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value);
  const day = Number(parts.find((p) => p.type === "day")!.value);
  // Construct "tomorrow 00:00 PT" as a UTC timestamp. We reconstruct by
  // asking "what UTC time is 00:00 PT on day+1?" via a round-trip through
  // the formatter. Simpler: build an ISO string with an offset.
  const offsetHours = getPTOffsetHours(now);
  const tomorrow = new Date(Date.UTC(year, month - 1, day + 1, offsetHours, 0, 0));
  return tomorrow;
}

function getPTOffsetHours(at: Date): number {
  // Returns 7 (PDT) or 8 (PST). Good enough for the quota-reset use case
  // — we don't need sub-hour precision on a daily reset.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    timeZoneName: "short",
  });
  const tz = fmt.formatToParts(at).find((p) => p.type === "timeZoneName")?.value;
  return tz === "PDT" ? 7 : 8;
}

async function sleepUntilMidnightPT(): Promise<void> {
  const until = nextMidnightPT();
  const ms = until.getTime() - Date.now();
  if (ms <= 0) return;
  await new Promise((r) => setTimeout(r, ms + 30_000)); // +30s slack
}
