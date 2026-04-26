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
 * Models tried in order. Pinned order (AUTHOR-03 D-12): 3.1-flash-tts-preview
 * is the highest-quality preview as of 2026-04. Older 2.5-* previews retained
 * as fallback for the quota-exhaustion wait path (per the
 * gemini-tts-preview-quota-and-fallback-chain skill). Env-overridable via
 * GEMINI_TTS_MODELS (comma-separated). Same chain as
 * src/app/api/tts/gemini/route.ts.
 */
export const DEFAULT_MODELS = [
  "gemini-3.1-flash-tts-preview",
  "gemini-2.5-flash-preview-tts",
  "gemini-2.5-pro-preview-tts",
];

/** Opus encoding target — 32 kbps mono is transparent for speech. */
const OPUS_BITRATE = "32k";

/**
 * Cache directory: per-repo, co-located with content (AUTHOR-01 D-01).
 * Was ~/.cache/masonic-mram-audio/ pre-Phase-3; moved under the repo so
 * the cache travels with the repo on machine moves. rituals/_bake-cache/
 * is gitignored (see repo-root .gitignore + nested rituals/_bake-cache/.gitignore).
 * Old location is retained as OLD_CACHE_DIR below; migrateLegacyCacheIfNeeded()
 * copies (not moves) any existing entries on first run.
 */
export const OLD_CACHE_DIR = path.join(
  process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache"),
  "masonic-mram-audio",
);
export const CACHE_DIR = path.resolve("rituals/_bake-cache");

/**
 * Cache format version. Bump when we change the Opus encoding params
 * or the cache-key material so old cached entries miss instead of
 * replaying stale audio.
 *   - v1: initial (text, style, voice) → [style] text
 *   - v2: adds optional director's-notes preamble in the prompt + key material.
 *   - v3: adds modelId to key material (AUTHOR-01 D-02). Eliminates silent
 *         stale hits where a v2-keyed entry rendered by gemini-2.5-pro gets
 *         served to a run asking for gemini-3.1-flash. First run after this
 *         bump re-bakes all entries.
 */
export const CACHE_KEY_VERSION = "v3";

// ============================================================
// Legacy-cache migration (AUTHOR-01 D-01)
// ============================================================

/**
 * One-shot migration from OLD_CACHE_DIR (~/.cache/masonic-mram-audio/)
 * into CACHE_DIR (rituals/_bake-cache/) — AUTHOR-01 D-01.
 *
 * fs.cp copies (does not move); old location preserved for rollback.
 * One-shot: if NEW already has any .opus entry the migration is a no-op.
 * Most migrated entries will miss on first lookup after the v3 bump
 * (CACHE_KEY_VERSION = "v3") and get re-rendered anyway — the migration
 * still saves any entry whose key happens to match under v3 (voice+style
 * +text+modelId combo that was latently equivalent to a v3 key).
 *
 * The `oldDir` param defaults to OLD_CACHE_DIR but tests inject a tmp
 * dir so they never touch the developer's real ~/.cache/masonic-mram-audio/.
 */
// One-shot guard implemented as a memoized promise rather than a boolean
// (ME-01 in 03-REVIEW.md): a check-then-set boolean has a concurrency
// race when renderLineAudio is called for two lines in parallel — both
// could pass the guard before either has finished, producing partial
// copies. A memoized Promise is re-entrant and concurrent-safe by
// construction: the first caller starts the migration; all subsequent
// callers (same tick OR later) await the SAME promise.
let migrationPromise: Promise<void> | null = null;

export function migrateLegacyCacheIfNeeded(
  cacheDir: string,
  oldDir: string = OLD_CACHE_DIR,
): Promise<void> {
  if (migrationPromise) return migrationPromise;
  migrationPromise = (async () => {
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    const hasAny = fs.readdirSync(cacheDir).some((f) => f.endsWith(".opus"));
    if (hasAny) return;
    if (!fs.existsSync(oldDir)) return;
    const files = fs.readdirSync(oldDir).filter((f) => f.endsWith(".opus"));
    if (files.length === 0) return;
    console.error(
      `[AUTHOR-01] migrating legacy cache ${oldDir} → ${cacheDir} ` +
        `(${files.length} entries; old location preserved for rollback)`,
    );
    await fs.promises.cp(oldDir, cacheDir, {
      recursive: true,
      filter: (src) => src === oldDir || src.endsWith(".opus"),
    });
    console.error(`[AUTHOR-01] migrated ${files.length} entries.`);
  })();
  return migrationPromise;
}

/** Test-only hook: reset the one-shot guard between tests. */
export function __resetMigrationFlagForTests(): void {
  migrationPromise = null;
}

// ============================================================
// Types
// ============================================================

export interface RenderOptions {
  /**
   * Gemini API keys, tried in order when one returns 429. Required,
   * must be non-empty. Pass a singleton array `[key]` for the legacy
   * single-key case. With multiple keys (e.g. one per GCP project),
   * the retry loop rotates through them before incurring a backoff
   * wait, effectively multiplying the daily quota by pool size.
   */
  apiKeys: string[];
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

  // AUTHOR-01 D-02: cache key now includes modelId. On lookup, probe each
  // model in the fallback chain; any pre-existing hit (against any model in
  // the chain) counts — we don't want to re-render just because a different
  // model produced the same audio previously. On a full miss, the render
  // loop writes under the actually-used model's key.
  const models = options.models ?? readModelsFromEnv() ?? DEFAULT_MODELS;
  const waitHandler = options.onAllModelsExhausted ?? sleepUntilMidnightPT;

  // Run legacy-cache migration once on the first cache read (AUTHOR-01 D-01).
  await migrateLegacyCacheIfNeeded(cacheDir);

  for (const probeModel of models) {
    const probeKey = computeCacheKey(text, style, voice, probeModel, preamble);
    const probePath = path.join(cacheDir, `${probeKey}.opus`);
    if (fs.existsSync(probePath)) {
      options.onProgress?.({ status: "cache-hit", cacheKey: probeKey });
      return fs.readFileSync(probePath);
    }
  }
  // No hit across any model in the chain — fall through to render loop.

  // Retry loop: try each model, on all-models-429 wait for quota reset
  // and go around again. Callers can cap this with their own timeout.
  while (true) {
    try {
      const { wav, model } = await callGeminiWithFallback(
        text,
        style,
        voice,
        models,
        options.apiKeys,
        preamble,
      );
      const opus = await encodeWavToOpus(wav);

      // Compute cache key under the model actually used (per D-02).
      const cacheKey = computeCacheKey(text, style, voice, model, preamble);
      const cachePath = path.join(cacheDir, `${cacheKey}.opus`);

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
        // The actual cacheKey isn't known yet (no model served this line)
        // — report the key under the preferred (first-chain) model for
        // progress observability. The final rendered key is emitted on
        // success above.
        const pendingKey = computeCacheKey(text, style, voice, models[0], preamble);
        options.onProgress?.({
          status: "waiting-for-quota-reset",
          cacheKey: pendingKey,
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
 * call. Mirrors the cache-lookup behavior in renderLineAudio (Option A):
 * probe each model in the fallback chain and return true on any hit.
 *
 * The `preamble` argument must match what the bake will actually pass
 * at render time — typically the per-role voice-cast preamble when the
 * line is long enough to use it, or empty string when the line is short
 * or the voice-cast is missing. Pre-Phase-3 this function took a single
 * cacheKey; post-Phase-3 (AUTHOR-01 D-02) it iterates the model chain
 * because the cache key includes modelId.
 */
export function isLineCached(
  text: string,
  style: string | undefined,
  voice: string,
  preamble: string = "",
  cacheDir?: string,
  models: string[] = readModelsFromEnv() ?? DEFAULT_MODELS,
): boolean {
  const dir = cacheDir ?? CACHE_DIR;
  for (const modelId of models) {
    const cacheKey = computeCacheKey(text, style, voice, modelId, preamble);
    const cachePath = path.join(dir, `${cacheKey}.opus`);
    if (fs.existsSync(cachePath)) return true;
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
  apiKeys: string[],
  preamble: string = "",
): Promise<{ wav: Buffer; model: string }> {
  if (apiKeys.length === 0) {
    throw new Error("callGeminiWithFallback: apiKeys is empty");
  }
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
    // Per-model retry loop structured as ROUNDS. Each round tries every
    // key in apiKeys once before any wait. Only when all keys in the
    // pool fail a round do we burn a backoff and retry. With a single
    // key this collapses back to the original per-attempt shape.
    //
    // Retryable within a round: 429 (per-project daily cap or per-minute
    // throttle), 5xx (transient Google), network errors, and 200-OK
    // empty-audio (text-token regression — might clear on a different
    // key/project). Non-retryable: 404 (endpoint shape mismatch — same
    // for every key) and other 4xx.
    const MAX_ROUNDS = PER_MODEL_RETRY_BACKOFF_MS.length + 1;
    let exhausted = false;
    let thisModelSawNonRegressionFailure = false;

    roundLoop: for (let round = 0; round < MAX_ROUNDS; round++) {
      for (let keyIdx = 0; keyIdx < apiKeys.length; keyIdx++) {
        const apiKey = apiKeys[keyIdx];
        const keyLabel =
          apiKeys.length > 1 ? ` [key ${keyIdx + 1}/${apiKeys.length}]` : "";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
        let resp: Response;
        try {
          resp = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          });
        } catch (fetchErr) {
          thisModelSawNonRegressionFailure = true;
          process.stderr.write("\r" + " ".repeat(80) + "\r");
          console.error(
            `  ${model}${keyLabel} network error: ${(fetchErr as Error).message}. Trying next key...`,
          );
          continue; // try next key
        }

        if (resp.status === 404) {
          // Endpoint shape mismatch — same for every key in the pool.
          // Fall through to the next model tier immediately.
          thisModelSawNonRegressionFailure = true;
          attempted.push(model);
          exhausted = true;
          break roundLoop;
        }

        if (resp.status === 429 || resp.status >= 500) {
          thisModelSawNonRegressionFailure = true;
          if (apiKeys.length > 1) {
            process.stderr.write("\r" + " ".repeat(80) + "\r");
            console.error(
              `  ${model}${keyLabel} returned ${resp.status}. Trying next key...`,
            );
          }
          continue; // try next key in this round
        }

        if (!resp.ok) {
          const errText = await resp.text();
          throw new Error(
            `Gemini ${model} returned ${resp.status}: ${errText.slice(0, 300)}`,
          );
        }

        // 200 OK. Consume the SSE stream. Empty stream = text-token
        // regression — rotate to next key (different project may not
        // regress) rather than immediately backing off.
        try {
          const wav = await consumeSseToWav(resp);
          return { wav, model };
        } catch (consumeErr) {
          if (consumeErr instanceof EmptyAudioStreamError) {
            // Pure regression — don't flip the non-regression flag.
            if (apiKeys.length > 1) {
              process.stderr.write("\r" + " ".repeat(80) + "\r");
              console.error(
                `  ${model}${keyLabel} text-token regression (empty audio stream). Trying next key...`,
              );
            }
            continue; // try next key
          }
          // Malformed SSE or missing body — not retryable, rethrow.
          throw consumeErr;
        }
      }

      // Every key in the pool failed this round. Backoff and try the
      // whole pool again — per-minute windows may clear, or a sibling
      // project's quota may refill faster than the one that 429'd.
      if (round < MAX_ROUNDS - 1) {
        const waitMs = PER_MODEL_RETRY_BACKOFF_MS[round];
        process.stderr.write("\r" + " ".repeat(80) + "\r");
        const poolLabel =
          apiKeys.length > 1
            ? `all ${apiKeys.length} keys failed`
            : `failed`;
        console.error(
          `  ${model}: ${poolLabel}. Retrying round ${round + 2}/${MAX_ROUNDS} in ${waitMs / 1000}s...`,
        );
        await sleepWithHeartbeat(waitMs, `waiting for ${model}`);
      } else {
        // Final round failed — fall through to the next model tier.
        attempted.push(model);
        exhausted = true;
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

  // Catch effectively-empty responses too: Gemini sometimes returns a
  // tiny PCM payload (a few hundred bytes ≈ <100ms of audio) for inputs
  // it can't render properly. The SSE stream isn't empty so the stricter
  // length === 0 check above doesn't fire, but the resulting Opus has
  // 0ms duration after parse and triggers D-10 hard-fail. Treat those
  // the same as EmptyAudioStreamError so the surrounding retry loop
  // rotates keys instead of caching the defect.
  const pcm = Buffer.concat(pcmChunks);
  const sampleRate = parseSampleRate(mimeType);
  // 100ms threshold: 24kHz mono 16-bit = 24000 samples/sec × 0.1 × 2 bytes
  // ≈ 4800 bytes. Even the shortest legitimate Masonic line ("So mote it
  // be" ≈ 800ms) produces ≥ 38400 bytes, so the threshold has 8× headroom.
  const minBytes = Math.floor(sampleRate * 0.1 * 2);
  if (pcm.length < minBytes) {
    throw new EmptyAudioStreamError();
  }

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

/**
 * Canonical cache key computation. Exported so external tools
 * (invalidate-mram-cache.ts, diagnostic scripts) produce IDENTICAL
 * keys to the bake path — any drift between the two would mean the
 * invalidation tool misses the entry or deletes the wrong one.
 * Keep this in sync with any cache-layout changes; bump
 * CACHE_KEY_VERSION on structural changes.
 */
export function computeCacheKey(
  text: string,
  style: string | undefined,
  voice: string,
  modelId: string, // NEW (AUTHOR-01 D-02)
  preamble: string = "",
): string {
  // Key material order: version | text | style | voice | modelId | preamble.
  // modelId is between voice and preamble so voice+style+text equivalence alone
  // doesn't produce equal keys across different Gemini model revs.
  const material =
    `${CACHE_KEY_VERSION}\x00${text}\x00${style ?? ""}\x00${voice}\x00${modelId}\x00${preamble}`;
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
