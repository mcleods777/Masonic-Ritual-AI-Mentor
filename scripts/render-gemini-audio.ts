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
 *  or the prompt-assembly rules so old cached entries miss instead of
 *  replaying stale audio.
 *  - v1: initial (text, style, voice) → [style] text
 *  - v2: adds optional director's-notes preamble in the prompt.
 *        Cache key incorporates the preamble so changes in the
 *        voice-cast sidecar invalidate just the affected lines.
 */
const CACHE_KEY_VERSION = "v2";

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
 *
 * Optional `preamble` is the director's-notes block built by
 * voice-cast.ts. When provided, it's prepended to the prompt before
 * the `[style] text` segment AND hashed into the cache key so any
 * change to a role's character card invalidates just the lines that
 * role speaks.
 */
export async function renderLineAudio(
  text: string,
  style: string | undefined,
  voice: string,
  options: RenderOptions,
  preamble: string = "",
): Promise<Buffer> {
  const cacheDir = options.cacheDir ?? CACHE_DIR;
  fs.mkdirSync(cacheDir, { recursive: true });

  const cacheKey = computeCacheKey(text, style, voice, preamble);
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
        preamble,
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
      // PersistentTextTokenRegression is content-based — sleeping won't
      // help. Rethrow so the caller can skip this line and continue.
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

/**
 * Check if a given line is already cached without triggering an API
 * call. Mirrors the cache key computation in renderLineAudio so the
 * pre-bake cache scan reports accurately. The `preamble` argument
 * must match what the bake will actually pass at render time —
 * typically the per-role voice-cast preamble when the line is long
 * enough to use it, or empty string when the line is short or the
 * voice-cast is missing.
 */
export function isLineCached(
  text: string,
  style: string | undefined,
  voice: string,
  preamble: string = "",
  cacheDir?: string,
): boolean {
  const dir = cacheDir ?? CACHE_DIR;
  const cacheKey = computeCacheKey(text, style, voice, preamble);
  const cachePath = path.join(dir, `${cacheKey}.opus`);
  return fs.existsSync(cachePath);
}

// ============================================================
// Gemini API call with 3-model fallback
// ============================================================

class AllModelsQuotaExhausted extends Error {
  constructor(public attempted: string[]) {
    super(`All ${attempted.length} Gemini models returned 429: ${attempted.join(", ")}`);
  }
}

/**
 * Thrown when every model in the fallback chain exhausted its retries
 * specifically on EmptyAudioStreamError — the model returned 200 OK but
 * filled the stream with text tokens instead of audio tokens. This is
 * a content-based failure, not a quota issue: sleeping until midnight
 * PT won't fix it because the line will still trigger the same
 * regression on the next attempt.
 *
 * Typical cause: ultra-short transcripts ("B.", "O.", "So mote it be.")
 * that fall below Gemini's reliable-generation threshold. Caller should
 * skip embedding audio for this line and let the runtime TTS path
 * handle it per-rehearsal.
 */
export class PersistentTextTokenRegression extends Error {
  constructor(public attempted: string[]) {
    super(
      `All ${attempted.length} model(s) returned empty audio streams for this line: ${attempted.join(", ")}. ` +
        `Content is likely below Gemini's reliable-generation threshold — sleep won't help.`,
    );
  }
}

/**
 * Thrown by consumeSseToWav when the Gemini stream completed with no
 * audio chunks. This is the "text-token regression" Google documents —
 * the model returns a 200 OK but fills the SSE stream with text tokens
 * instead of audio tokens. Officially: retry. Treated as retryable on
 * the same model (NOT a tier-drop event) so we don't burn a fallback
 * on what's a transient model blip.
 */
class EmptyAudioStreamError extends Error {
  constructor() {
    super("Gemini SSE stream returned no audio chunks (text-token regression)");
  }
}

/**
 * Per-model retry schedule. Addresses two distinct failure modes:
 *   - 429 from the per-minute rate limiter (preview models are capped
 *     at ~10-15 req/min regardless of daily quota — clears in ~60s)
 *   - 500s and text-token regressions (Google's documented blip —
 *     retry is the official remediation)
 *
 * Schedule covers a full per-minute window reset cleanly. The old
 * 42s total was landing mid-window on heavily throttled runs; if the
 * bake is already saturating rate limits, the first two retries won't
 * clear, and the 30s final wait only gets you to ~42s elapsed before
 * falling through. The 90s and 180s tail now guarantee window reset
 * with margin.
 *
 * Total wait across four retries: ~5 min. Override with the env var
 * GEMINI_RETRY_BACKOFF_MS (comma-separated ms values) for tuning.
 *
 * After these attempts the model is treated as genuinely exhausted
 * and we fall through to the next tier (at which point --on-fallback
 * decides: prompt / continue / abort).
 */
const DEFAULT_RETRY_BACKOFF_MS = [5000, 30000, 90000, 180000];

function readRetryBackoff(): number[] {
  const env = process.env.GEMINI_RETRY_BACKOFF_MS?.trim();
  if (!env) return DEFAULT_RETRY_BACKOFF_MS;
  const parsed = env
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  return parsed.length > 0 ? parsed : DEFAULT_RETRY_BACKOFF_MS;
}

const PER_MODEL_RETRY_BACKOFF_MS = readRetryBackoff();

/**
 * Wait the given number of milliseconds, printing a single-line
 * countdown every 30 seconds so long waits (90s, 180s) don't look
 * like the script has frozen. The \r prefix keeps it on one line.
 */
async function sleepWithHeartbeat(ms: number, label: string): Promise<void> {
  const HEARTBEAT_MS = 30_000;
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const remaining = Math.min(HEARTBEAT_MS, end - Date.now());
    await new Promise((r) => setTimeout(r, remaining));
    const left = end - Date.now();
    if (left > 1000) {
      process.stderr.write(
        `\r  ${label} — ${Math.ceil(left / 1000)}s remaining...          `,
      );
    }
  }
  // Clear the heartbeat line so the next log doesn't overlap.
  process.stderr.write("\r" + " ".repeat(80) + "\r");
}

async function callGeminiWithFallback(
  text: string,
  style: string | undefined,
  voice: string,
  models: string[],
  apiKey: string,
  preamble: string = "",
): Promise<{ wav: Buffer; model: string }> {
  const inlineStyle = style ? `[${style}] ` : "";
  const prompt = `${preamble}${inlineStyle}${text}`;
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
  // Track whether every model's retries failed purely on text-token
  // regression vs at least one real quota/5xx/network failure. If it's
  // purely regression, sleeping until midnight PT won't help — the
  // content is what's triggering it, and the next attempt will regress
  // the same way. Caller should skip embedding audio for this line.
  let anyModelSawNonRegressionFailure = false;

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

    // Per-model retry loop. Try the request up to 4 times on this model
    // before giving up and falling through to the next tier. Covers:
    //   * 429 (per-minute rate limit, clears in ~60s)
    //   * 500/502/503 (transient Google-side issues)
    //   * 200 OK with empty audio stream (text-token regression)
    // 404 is NOT retried on the same model — it means the endpoint shape
    // is wrong (e.g., preview model only exposes streamGenerateContent;
    // retrying won't help).
    const MAX_ATTEMPTS = PER_MODEL_RETRY_BACKOFF_MS.length + 1;
    let exhausted = false;
    let thisModelSawNonRegressionFailure = false;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      let resp: Response;
      try {
        resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
      } catch (fetchErr) {
        // Network error — retry on same model if we have attempts left.
        thisModelSawNonRegressionFailure = true;
        if (attempt < MAX_ATTEMPTS - 1) {
          const waitMs = PER_MODEL_RETRY_BACKOFF_MS[attempt];
          process.stderr.write("\r" + " ".repeat(80) + "\r");
          console.error(
            `  ${model} network error: ${(fetchErr as Error).message}. Retrying in ${waitMs / 1000}s (${attempt + 2}/${MAX_ATTEMPTS})...`,
          );
          await sleepWithHeartbeat(waitMs, `waiting for ${model}`);
          continue;
        }
        // Final attempt network-failed — fall through to next tier.
        attempted.push(model);
        exhausted = true;
        break;
      }

      if (resp.status === 404) {
        // Endpoint shape mismatch. Never retryable on the same model —
        // fall through to the next tier immediately.
        thisModelSawNonRegressionFailure = true;
        attempted.push(model);
        exhausted = true;
        break;
      }

      // Retryable on same model: 429 (per-minute throttle) and 5xx.
      if (resp.status === 429 || resp.status >= 500) {
        thisModelSawNonRegressionFailure = true;
        if (attempt < MAX_ATTEMPTS - 1) {
          const waitMs = PER_MODEL_RETRY_BACKOFF_MS[attempt];
          process.stderr.write("\r" + " ".repeat(80) + "\r");
          console.error(
            `  ${model} returned ${resp.status}. Retrying in ${waitMs / 1000}s (${attempt + 2}/${MAX_ATTEMPTS})...`,
          );
          await sleepWithHeartbeat(waitMs, `waiting for ${model}`);
          continue;
        }
        // Exhausted retries on this model — fall through to next tier.
        attempted.push(model);
        exhausted = true;
        break;
      }

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Gemini ${model} returned ${resp.status}: ${errText.slice(0, 300)}`);
      }

      // 200 OK. Try to consume the stream. If it's empty (text-token
      // regression), retry the same model — it's a model-side blip,
      // not a quota issue.
      try {
        const wav = await consumeSseToWav(resp);
        return { wav, model };
      } catch (consumeErr) {
        if (consumeErr instanceof EmptyAudioStreamError) {
          // Deliberately do NOT set thisModelSawNonRegressionFailure here
          // — pure regression is what we're trying to distinguish.
          if (attempt < MAX_ATTEMPTS - 1) {
            const waitMs = PER_MODEL_RETRY_BACKOFF_MS[attempt];
            process.stderr.write("\r" + " ".repeat(80) + "\r");
            console.error(
              `  ${model} text-token regression (empty audio stream). Retrying in ${waitMs / 1000}s (${attempt + 2}/${MAX_ATTEMPTS})...`,
            );
            await new Promise((r) => setTimeout(r, waitMs));
            continue;
          }
          // Exhausted retries — fall through to next tier.
          attempted.push(model);
          exhausted = true;
          break;
        }
        // Other consumption errors (malformed SSE, missing body) —
        // not retryable, rethrow.
        throw consumeErr;
      }
    }

    if (thisModelSawNonRegressionFailure) {
      anyModelSawNonRegressionFailure = true;
    }

    // Only continue to the next model if this one was marked exhausted
    // inside the retry loop. (A successful return above already exited.)
    if (!exhausted) break;
  }

  // Distinguish the two failure modes so the caller can react correctly.
  // If ANY model hit a real quota/5xx/network failure, the overall
  // failure is plausibly quota-related — sleep until midnight PT makes
  // sense. If EVERY model only ever saw empty-stream responses, the
  // content itself is the problem and no amount of waiting fixes it.
  if (!anyModelSawNonRegressionFailure && attempted.length > 0) {
    throw new PersistentTextTokenRegression(attempted);
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
    throw new EmptyAudioStreamError();
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

function computeCacheKey(
  text: string,
  style: string | undefined,
  voice: string,
  preamble: string = "",
): string {
  const material = `${CACHE_KEY_VERSION}\x00${text}\x00${style ?? ""}\x00${voice}\x00${preamble}`;
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

  const plannedWakeUtc = new Date(until.getTime() + 30_000); // +30s slack
  const hoursToSleep = (ms + 30_000) / 3_600_000;

  const ptFmt = (d: Date) =>
    d.toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
      dateStyle: "short",
      timeStyle: "short",
    });

  process.stderr.write("\r" + " ".repeat(80) + "\r");
  console.error(
    `\n  Sleeping until quota reset. Planned wake: ${ptFmt(plannedWakeUtc)} PT (~${hoursToSleep.toFixed(1)}h from now).`,
  );
  console.error(
    `  IMPORTANT: keep this machine awake through the sleep — OS suspend will freeze the timer.`,
  );
  console.error(
    `    WSL/Windows: Settings → Power → 'Never' when plugged in, and keep Windows from sleeping.`,
  );
  console.error(
    `    macOS:       prefix the command with 'caffeinate -i'.`,
  );
  console.error(
    `    Linux:       systemd-inhibit --what=sleep npx tsx scripts/...\n`,
  );

  await new Promise((r) => setTimeout(r, ms + 30_000));

  // Drift check: if setTimeout returned MUCH later than scheduled, the
  // process was almost certainly suspended (laptop sleep, WSL VM pause).
  // Quota may not be fresh yet — worth flagging so the user doesn't
  // assume "we slept past midnight = quota is reset for sure."
  const actualWake = new Date();
  const driftMs = actualWake.getTime() - plannedWakeUtc.getTime();
  const DRIFT_THRESHOLD_MS = 10 * 60 * 1000; // 10 min

  if (driftMs > DRIFT_THRESHOLD_MS) {
    const driftMin = Math.round(driftMs / 60_000);
    console.error(
      `\n  ⚠  Wake time drift: ${driftMin} min late (planned ${ptFmt(plannedWakeUtc)} PT, actual ${ptFmt(actualWake)} PT).`,
    );
    console.error(
      `     The process was probably suspended during the sleep (OS/WSL).`,
    );
    console.error(
      `     Quota should still be reset since midnight PT has passed, but if the`,
    );
    console.error(
      `     first retry 429s, the script will sleep again for the next midnight.\n`,
    );
  } else {
    console.error(
      `\n  Woke at ${ptFmt(actualWake)} PT. Resuming bake on the preferred model.\n`,
    );
  }
}
