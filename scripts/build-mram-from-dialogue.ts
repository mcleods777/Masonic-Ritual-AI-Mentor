#!/usr/bin/env npx tsx
/**
 * build-mram-from-dialogue.ts — Build a .mram encrypted ritual file from
 * a pair of dialogue markdown files (plain + cipher).
 *
 * This is the successor to scripts/build-mram.ts. The old script parsed a
 * single paired-format markdown file where every spoken line appeared twice
 * (cipher, then plain) with narrator cues mixed in. The new dialogue format
 * splits plain and cipher into two parallel files with no narrator, and is
 * parsed by src/lib/dialogue-format.ts.
 *
 * Output is a standard MRAMDocument binary, byte-compatible with the
 * decryptMRAM() path in src/lib/mram-format.ts — no app changes required.
 *
 * Usage:
 *   npx tsx scripts/build-mram-from-dialogue.ts \
 *     <plain.md> <cipher.md> <output.mram> [--with-audio] \
 *     [--on-fallback=ask|continue|abort|wait] \
 *     [--verify-audio] [--no-short-line-stt] \
 *     [--resume-state-path=<file>]
 *
 * With --with-audio: render every spoken line to Opus via Gemini TTS
 * using the canonical GEMINI_ROLE_VOICES cast, embed the audio bytes
 * inside the encrypted .mram payload. On-device playback skips the API
 * entirely. Requires ffmpeg in PATH and GOOGLE_GEMINI_API_KEY env var.
 *
 * --on-fallback controls what happens the FIRST time the preferred
 * Gemini model (3.1-flash) hits its daily quota and the bake falls
 * back to a lower-quality tier (2.5-flash or 2.5-pro). Mixing tiers
 * mid-ritual produces audibly inconsistent voice quality line-to-line,
 * so the default ("ask") pauses and prompts you to keep going or
 * abort and retry after midnight PT for a uniform premium bake.
 *   ask      — prompt once on first fallback (default, interactive)
 *   continue — silently continue, just log a warning (good for CI)
 *   abort    — exit with code 2 on first fallback, cache preserved
 *
 * D-01 (AUTHOR-04): every line gets baked audio — there is no more
 * "hard-skip below N chars" bucket. Lines shorter than SHORT_LINE_MAX_CHARS
 * (default 11) route through a Gemini instructional-padding prompt first
 * (see the gemini-tts-speakas-short-line-instructional-prompt memory
 * skill); if that padded render fails the D-03 validation gates
 * (duration-anomaly + STT round-trip), it falls back to Google Cloud TTS
 * with the raw line text (D-02). If BOTH engines fail, the bake REFUSES
 * (non-zero exit, line identified) rather than silently dropping audio.
 *
 * --verify-audio: run the AUTHOR-07 STT round-trip gate on every
 * freshly-rendered line (not just short ones). A failing line fails the
 * bake. Short-line padded-Gemini renders always run this check
 * regardless of --verify-audio (D-03) — pass --no-short-line-stt to
 * disable that default (PROVISIONAL, see 03-08-SUMMARY.md).
 *
 * --resume-state-path=<file>: persist per-line completion progress so an
 * interrupted bake can skip re-validating (though not re-caching — the
 * content cache already does that for free) lines that already finished.
 *
 * The passphrase is read interactively with echo disabled. It is NEVER
 * accepted on the command line (that would leak it to shell history and
 * `ps -ef` output).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { parseDialogue } from "../src/lib/dialogue-format";
import { buildFromDialogue } from "../src/lib/dialogue-to-mram";
import type { MRAMDocument } from "../src/lib/mram-format";
import { GEMINI_ROLE_VOICES, getGeminiVoiceForRole } from "../src/lib/tts-cloud";
import {
  renderLineAudio,
  deleteCacheEntry,
  computeCacheKey,
  CACHE_DIR,
  DEFAULT_MODELS,
  readModelsFromEnv,
} from "./render-gemini-audio";
import {
  buildPreamble,
  validateVoiceCast,
  type VoiceCastFile,
} from "../src/lib/voice-cast";
import { googleTtsBakeCall } from "./lib/google-tts";
import { verifyLineAudio } from "./lib/stt-verify";
import {
  computeMedianSecPerChar,
  isDurationAnomaly,
  type DurationSample,
} from "./lib/bake-math";
import { validateOrFail } from "./lib/validate-or-fail";
import {
  readResumeState,
  writeResumeStateAtomic,
  type ResumeState,
} from "./lib/resume-state";

// ============================================================
// Encryption (Node crypto — binary layout matches Web Crypto
// decryptMRAM in src/lib/mram-format.ts)
// ============================================================

const MAGIC = Buffer.from("MRAM", "ascii");
// v3 binary header. Old v1 and v2 files still decode fine (new fields
// are all optional). v3 adds metadata.voiceCast + metadata.audioFormat
// + MRAMLine.audio. Written always now, regardless of --with-audio,
// so the header byte always matches the latest schema.
const FORMAT_VERSION = 3;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const PBKDF2_ITERATIONS = 310_000;

export function encryptMRAMNode(doc: MRAMDocument, passphrase: string): Buffer {
  // Compute SHA-256 over JSON.stringify(lines) — matches mram-format.ts
  const linesJson = JSON.stringify(doc.lines);
  doc.metadata.checksum = crypto
    .createHash("sha256")
    .update(linesJson)
    .digest("hex");

  const jsonBytes = Buffer.from(JSON.stringify(doc), "utf-8");
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);

  const key = crypto.pbkdf2Sync(
    passphrase,
    salt,
    PBKDF2_ITERATIONS,
    32,
    "sha256",
  );

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(jsonBytes), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Layout: MAGIC | VERSION | SALT | IV | CIPHERTEXT | AUTH_TAG
  // Web Crypto's AES-GCM appends auth tag to ciphertext automatically;
  // we concatenate for parity so the browser decrypts the whole blob.
  return Buffer.concat([
    MAGIC,
    Buffer.from([FORMAT_VERSION]),
    salt,
    iv,
    encrypted,
    authTag,
  ]);
}

// ============================================================
// Short-line routing constants (AUTHOR-04, D-01/D-02/D-04)
// ============================================================

/**
 * Lines strictly shorter than this many characters route through the
 * D-02 Gemini-padded → Google-fallback path instead of a normal render.
 * This REPLACES the old hard-skip-below-N-chars threshold (D-01 removed
 * hard-skipping entirely — short lines still get baked audio, just via
 * a different route). Tune via SHORT_LINE_MAX_CHARS env var.
 */
export const SHORT_LINE_MAX_CHARS = Number(
  process.env.SHORT_LINE_MAX_CHARS ?? "11",
);

/**
 * Documented default Google Cloud TTS voice for roles with no pinned
 * VoiceCastRole.googleVoice (D-04). Flagged in bake output so Shannon
 * can pin a closer per-role match later.
 */
export const GOOGLE_FALLBACK_DEFAULT_VOICE = "en-US-Neural2-D";

/** AUTHOR-06 warm-up window (Pitfall 5) — see runDurationAnomalyGate. */
export const ANOMALY_WARMUP_SAMPLES = 30;

/**
 * Build the Gemini instructional-padding prompt for a short line (D-02).
 * Per the gemini-tts-speakas-short-line-instructional-prompt memory
 * skill: the padding text is an INSTRUCTION, never additional speakable
 * prose — Gemini's "Say only X: Y" framing constrains spoken output to
 * just the target utterance while giving the model enough token length
 * to avoid the text-token-regression failure mode short content triggers.
 */
export function buildShortLinePrompt(text: string): string {
  return `Say only these exact words, nothing else: ${text}`;
}

/** premium = rendered on the preferred (first-choice) Gemini model.
 *  Everything else — a lower Gemini tier OR the Google engine — is
 *  "fallback" for the D-08 keep-and-upgrade bake manifest. */
export function classifyTier(
  model: string,
  preferredModel: string,
): "premium" | "fallback" {
  return model === preferredModel ? "premium" : "fallback";
}

/** Resolve the Google Cloud TTS voice for a role: pinned sidecar value
 *  (D-04) or the documented default (D-02). */
export function resolveGoogleVoice(
  voiceCast: VoiceCastFile | undefined,
  role: string,
): string {
  return voiceCast?.roles[role]?.googleVoice ?? GOOGLE_FALLBACK_DEFAULT_VOICE;
}

// ============================================================
// Duration measurement (AUTHOR-06) via ffprobe
// ============================================================

/**
 * Compute the duration in milliseconds of an Opus/Ogg buffer via
 * ffprobe — already a hard runtime dependency of this pipeline
 * (encodeWavToOpus in render-gemini-audio.ts already shells out to
 * ffmpeg). Applied uniformly to both Gemini-rendered and Google-rendered
 * audio: render-gemini-audio.ts's public API returns only the final
 * encoded Opus bytes, not the intermediate PCM sample count, and that
 * module is out of this plan's files_modified scope — probing the
 * already-encoded output avoids changing its contract.
 */
export function getOpusDurationMs(opusBuffer: Buffer): number {
  const tmpPath = path.join(
    os.tmpdir(),
    `bake-duration-probe-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.opus`,
  );
  fs.writeFileSync(tmpPath, opusBuffer);
  try {
    const out = execFileSync(
      "ffprobe",
      [
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        tmpPath,
      ],
      { encoding: "utf-8" },
    );
    const seconds = parseFloat(out.trim());
    return Number.isFinite(seconds) ? Math.round(seconds * 1000) : 0;
  } finally {
    fs.unlinkSync(tmpPath);
  }
}

/**
 * AUTHOR-06 duration-anomaly gate. Judges `durationMs`/`charCount`
 * against the median of samples collected so far THIS RUN — using the
 * median as it stood BEFORE this line (Pitfall 5: a sample shouldn't be
 * judged against a median that already includes itself). Requires at
 * least ANOMALY_WARMUP_SAMPLES PRIOR samples before the check activates;
 * during warm-up it logs and always passes. The current line's sample is
 * always appended afterward so later lines benefit from it.
 */
export function runDurationAnomalyGate(
  durationMs: number,
  charCount: number,
  durationSamples: DurationSample[],
): { tripped: boolean; detail: string } {
  const priorCount = durationSamples.length;
  let tripped = false;
  let detail = "";

  if (priorCount >= ANOMALY_WARMUP_SAMPLES) {
    const median = computeMedianSecPerChar(durationSamples);
    if (isDurationAnomaly({ durationMs, charCount }, median)) {
      tripped = true;
      const secPerChar = charCount > 0 ? durationMs / 1000 / charCount : 0;
      detail = `this line=${secPerChar.toFixed(4)}s/char vs ritual median=${median.toFixed(4)}s/char (band 0.3x-3.0x)`;
    }
  } else {
    console.error(
      `  [AUTHOR-06] sample too small — skipping anomaly check (${priorCount}/${ANOMALY_WARMUP_SAMPLES} warm-up samples)`,
    );
  }

  durationSamples.push({ durationMs, charCount });
  return { tripped, detail };
}

/**
 * AUTHOR-07 STT round-trip gate. Policy: any missed/inserted word fails.
 * No-ops (never trips) when `groqApiKey` is absent — the caller has
 * already warned once at bake start that STT verification is
 * unavailable.
 */
export async function runSttGate(
  audio: Buffer,
  expectedText: string,
  groqApiKey: string | undefined,
): Promise<{ tripped: boolean; detail: string }> {
  if (!groqApiKey) return { tripped: false, detail: "" };
  const verify = await verifyLineAudio({ audio, expectedText, apiKey: groqApiKey });
  if (verify.ok) return { tripped: false, detail: "" };
  return {
    tripped: true,
    detail: `STT round-trip mismatch: missed=[${verify.missed.join(", ")}] inserted=[${verify.inserted.join(", ")}] transcript="${verify.transcript}"`,
  };
}

// ============================================================
// Tier-aware bake manifest (D-08) — rituals/_bake-cache/_INDEX.json
// ============================================================

/** Shape consumed by scripts/preview-bake.ts's handleIndexJson. */
export interface BakeIndexEntry {
  cacheKey: string;
  model: string;
  ritualSlug: string;
  lineId: string | number;
  byteLen: number;
  durationMs: number;
  createdAt: string;
  tier: "premium" | "fallback";
}

export function readBakeIndex(cacheDir: string): BakeIndexEntry[] {
  const indexPath = path.join(cacheDir, "_INDEX.json");
  if (!fs.existsSync(indexPath)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function writeBakeIndexAtomic(cacheDir: string, entries: BakeIndexEntry[]): void {
  fs.mkdirSync(cacheDir, { recursive: true });
  const indexPath = path.join(cacheDir, "_INDEX.json");
  const tmp = `${indexPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(entries, null, 2));
  fs.renameSync(tmp, indexPath);
}

/**
 * Upsert a single bake-manifest entry keyed by (ritualSlug, lineId,
 * cacheKey). Re-reads + re-writes the whole file each call — fine at
 * ritual scale (hundreds of lines); atomic per write via tmp+rename.
 */
export function upsertBakeIndexEntry(cacheDir: string, entry: BakeIndexEntry): void {
  const entries = readBakeIndex(cacheDir);
  const idx = entries.findIndex(
    (e) =>
      e.ritualSlug === entry.ritualSlug &&
      String(e.lineId) === String(entry.lineId) &&
      e.cacheKey === entry.cacheKey,
  );
  if (idx >= 0) entries[idx] = entry;
  else entries.push(entry);
  writeBakeIndexAtomic(cacheDir, entries);
}

// ============================================================
// Line render result + resume-state cache lookup
// ============================================================

export interface LineRenderResult {
  opus: Buffer;
  model: string; // Gemini model id, or "google:<voice>" (D-02 provenance)
  cacheKey: string;
  fromCache: boolean;
  /** Present only when freshly rendered (gates already ran on it). */
  durationMs?: number;
}

/**
 * Direct on-disk cache lookup for a line already marked complete in a
 * prior (interrupted) run's --resume-state-path file. Tries every model
 * in the chain (covers a kept fallback-tier entry, D-08) and, for short
 * lines, the Google-tier key too. Returns null if nothing is found on
 * disk, in which case the caller falls through to a normal render (which
 * re-runs the D-03/AUTHOR-06/07 gates — self-healing if the cache was
 * cleared between runs).
 */
export function tryReadCompletedLineFromCache(opts: {
  cacheDir: string;
  isShort: boolean;
  cleanText: string;
  style: string | undefined;
  voice: string;
  preamble: string;
  modelChain: string[];
  googleVoice: string;
}): { opus: Buffer; model: string; cacheKey: string } | null {
  const text = opts.isShort ? buildShortLinePrompt(opts.cleanText) : opts.cleanText;
  const style = opts.isShort ? undefined : opts.style;
  const preamble = opts.isShort ? "" : opts.preamble;

  for (const model of opts.modelChain) {
    const cacheKey = computeCacheKey(text, style, opts.voice, model, preamble);
    const p = path.join(opts.cacheDir, `${cacheKey}.opus`);
    if (fs.existsSync(p)) {
      return { opus: fs.readFileSync(p), model, cacheKey };
    }
  }

  if (opts.isShort) {
    const googleModel = `google:${opts.googleVoice}`;
    const cacheKey = computeCacheKey(opts.cleanText, undefined, opts.googleVoice, googleModel, "");
    const p = path.join(opts.cacheDir, `${cacheKey}.opus`);
    if (fs.existsSync(p)) {
      return { opus: fs.readFileSync(p), model: googleModel, cacheKey };
    }
  }

  return null;
}

// ============================================================
// Per-line render + gate pipelines
// ============================================================

/**
 * Short-line (< SHORT_LINE_MAX_CHARS) render path (D-01/D-02/D-03).
 * Tries Gemini via the instructional-padding prompt first. A fresh
 * padded render is validated by the AUTHOR-06 duration-anomaly gate and
 * (unless `noShortLineStt`) the AUTHOR-07 STT round-trip gate. On gate
 * failure — or if Gemini couldn't produce audio at all — falls back to
 * Google Cloud TTS with the RAW line text (no padding, no preamble;
 * Pitfall 4). If Google also fails (or its key is absent), throws so the
 * bake refuses rather than silently dropping the line (D-01).
 */
export async function renderShortLineWithGates(opts: {
  cleanText: string;
  voice: string;
  googleVoice: string;
  apiKeys: string[];
  models: string[];
  cacheDir: string;
  groqApiKey: string | undefined;
  googleApiKey: string | undefined;
  noShortLineStt: boolean;
  durationSamples: DurationSample[];
}): Promise<LineRenderResult> {
  const paddedText = buildShortLinePrompt(opts.cleanText);
  let geminiError: Error | undefined;
  let geminiHit: { opus: Buffer; model: string; cacheKey: string; fromCache: boolean } | null = null;

  try {
    let fromCache = false;
    let capturedModel = "";
    let capturedKey = "";
    const opus = await renderLineAudio(
      paddedText,
      undefined,
      opts.voice,
      {
        apiKeys: opts.apiKeys,
        models: opts.models,
        cacheDir: opts.cacheDir,
        onProgress: (event) => {
          if (event.status === "cache-hit") {
            fromCache = true;
            capturedKey = event.cacheKey;
          } else if (event.status === "rendered") {
            capturedModel = event.model ?? opts.models[0];
            capturedKey = event.cacheKey;
          }
        },
      },
      "",
    );
    geminiHit = { opus, model: capturedModel || opts.models[0], cacheKey: capturedKey, fromCache };
  } catch (err) {
    geminiError = err as Error;
  }

  if (geminiHit) {
    if (geminiHit.fromCache) {
      // Cache only ever holds gate-passed padded-prompt audio — gate
      // failures are deleted below before falling back to Google — so a
      // cache hit here is trusted without re-running STT/duration.
      return { ...geminiHit };
    }

    const durationMs = getOpusDurationMs(geminiHit.opus);
    const durationGate = runDurationAnomalyGate(durationMs, opts.cleanText.length, opts.durationSamples);

    let gateTripped = durationGate.tripped;
    let gateDetail = durationGate.detail;

    if (!gateTripped && !opts.noShortLineStt) {
      const sttGate = await runSttGate(geminiHit.opus, opts.cleanText, opts.groqApiKey);
      if (sttGate.tripped) {
        gateTripped = true;
        gateDetail = sttGate.detail;
      }
    }

    if (!gateTripped) {
      return { ...geminiHit, durationMs };
    }

    // Gate failure means WRONG content, not merely lower-quality content
    // — unlike D-08 keep-and-upgrade (which never deletes a successful
    // lower-tier render), this entry must be removed so a future run
    // doesn't cache-hit invalid audio.
    deleteCacheEntry(geminiHit.cacheKey, opts.cacheDir);
    geminiError = new Error(`padded-Gemini render failed validation: ${gateDetail}`);
  }

  // D-02: Gemini path failed (render error or gate failure) — fall back
  // to Google Cloud TTS with the RAW line text (no padding, no preamble).
  if (!opts.googleApiKey) {
    throw new Error(
      `both engines unavailable for "${opts.cleanText}": Gemini failed (${geminiError?.message ?? "unknown error"}) and GOOGLE_CLOUD_TTS_API_KEY is not set for the D-02 fallback`,
    );
  }

  let googleOpus: Buffer;
  try {
    googleOpus = await googleTtsBakeCall(opts.cleanText, opts.googleVoice, opts.googleApiKey);
  } catch (googleErr) {
    throw new Error(
      `both engines failed for "${opts.cleanText}": Gemini (${geminiError?.message ?? "unknown error"}), Google (${(googleErr as Error).message})`,
    );
  }

  const googleModel = `google:${opts.googleVoice}`;
  const googleCacheKey = computeCacheKey(opts.cleanText, undefined, opts.googleVoice, googleModel, "");
  fs.mkdirSync(opts.cacheDir, { recursive: true });
  const googleCachePath = path.join(opts.cacheDir, `${googleCacheKey}.opus`);
  const tmp = `${googleCachePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, googleOpus);
  fs.renameSync(tmp, googleCachePath);

  const googleDurationMs = getOpusDurationMs(googleOpus);
  opts.durationSamples.push({ durationMs: googleDurationMs, charCount: opts.cleanText.length });

  return {
    opus: googleOpus,
    model: googleModel,
    cacheKey: googleCacheKey,
    fromCache: false,
    durationMs: googleDurationMs,
  };
}

/**
 * Normal-line (>= SHORT_LINE_MAX_CHARS) render path. Gated by
 * AUTHOR-06 (duration anomaly, always) and AUTHOR-07 (--verify-audio,
 * opt-in) on freshly-rendered lines only — cache hits were already
 * validated when first rendered. No fallback engine exists for normal
 * lines (D-02 only covers short lines): a gate failure here refuses the
 * whole bake, naming the line, per D-01.
 */
export async function renderNormalLineWithGates(opts: {
  cleanText: string;
  style: string | undefined;
  voice: string;
  preamble: string;
  apiKeys: string[];
  models: string[];
  cacheDir: string;
  verifyAudio: boolean;
  groqApiKey: string | undefined;
  durationSamples: DurationSample[];
}): Promise<LineRenderResult> {
  let fromCache = false;
  let capturedModel = "";
  let capturedKey = "";
  const opus = await renderLineAudio(
    opts.cleanText,
    opts.style,
    opts.voice,
    {
      apiKeys: opts.apiKeys,
      models: opts.models,
      cacheDir: opts.cacheDir,
      onProgress: (event) => {
        if (event.status === "cache-hit") {
          fromCache = true;
          capturedKey = event.cacheKey;
        } else if (event.status === "rendered") {
          capturedModel = event.model ?? opts.models[0];
          capturedKey = event.cacheKey;
        }
      },
    },
    opts.preamble,
  );
  capturedModel = capturedModel || opts.models[0];

  if (fromCache) {
    return { opus, model: capturedModel, cacheKey: capturedKey, fromCache: true };
  }

  const durationMs = getOpusDurationMs(opus);
  const durationGate = runDurationAnomalyGate(durationMs, opts.cleanText.length, opts.durationSamples);
  if (durationGate.tripped) {
    throw new Error(
      `duration-anomaly gate failed (AUTHOR-06): ${durationGate.detail}. No fallback engine exists for lines >= ${SHORT_LINE_MAX_CHARS} chars (D-01/D-02 only cover short lines) — fix the source line or investigate the render manually.`,
    );
  }

  if (opts.verifyAudio) {
    const sttGate = await runSttGate(opus, opts.cleanText, opts.groqApiKey);
    if (sttGate.tripped) {
      throw new Error(`--verify-audio gate failed (AUTHOR-07): ${sttGate.detail}`);
    }
  }

  return { opus, model: capturedModel, cacheKey: capturedKey, fromCache: false, durationMs };
}

// ============================================================
// CLI
// ============================================================

/**
 * Pure decision function (CR-01): choose where the passphrase comes from
 * WITHOUT touching stdin/TTY state, so it's trivially unit-testable and so
 * callers can make the decision exactly once, before any raw-mode setup.
 *
 * Rule order: a non-empty `envPass` string ALWAYS wins and is returned
 * immediately, regardless of `isTTY` — this is what lets a spawned child
 * honor MRAM_PASSPHRASE even when it inherits a TTY stdin (the CR-01
 * defect this function closes). Only when there is no usable env value
 * do we fall through to interactive TTY prompting, or finally an error
 * when neither is available.
 */
export function choosePassphraseSource(
  envPass: string | undefined,
  isTTY: boolean,
): { kind: "env"; value: string } | { kind: "tty" } | { kind: "error" } {
  if (envPass) return { kind: "env", value: envPass };
  if (isTTY) return { kind: "tty" };
  return { kind: "error" };
}

/**
 * Read a passphrase from stdin without echoing it to the terminal.
 * CR-01: consults MRAM_PASSPHRASE via choosePassphraseSource() FIRST,
 * before ever inspecting process.stdin.isTTY or entering raw mode — this
 * is what lets a spawned child honor an already-collected passphrase even
 * when its stdin happens to be a TTY (e.g. inherited from a parent running
 * interactively), instead of re-prompting on a shared raw-mode terminal
 * and silently encrypting under a garbled passphrase.
 */
async function promptPassphrase(): Promise<string> {
  const source = choosePassphraseSource(
    process.env.MRAM_PASSPHRASE,
    !!process.stdin.isTTY,
  );
  if (source.kind === "env") return source.value;
  if (source.kind === "error") {
    throw new Error(
      "stdin is not a TTY and MRAM_PASSPHRASE env var is not set. " +
        "Run interactively or set MRAM_PASSPHRASE.",
    );
  }

  process.stderr.write("Enter passphrase for .mram file: ");
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf-8");

  return new Promise((resolve, reject) => {
    let passphrase = "";
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        const code = ch.charCodeAt(0);
        if (code === 13 || code === 10) {
          // Enter
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener("data", onData);
          process.stderr.write("\n");
          resolve(passphrase);
          return;
        }
        if (code === 3) {
          // Ctrl-C
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener("data", onData);
          process.stderr.write("\n");
          reject(new Error("Interrupted"));
          return;
        }
        if (code === 127 || code === 8) {
          // Backspace / Delete
          passphrase = passphrase.slice(0, -1);
          continue;
        }
        if (code < 32) continue; // ignore other control chars
        passphrase += ch;
      }
    };
    process.stdin.on("data", onData);
  });
}

type FallbackMode = "ask" | "continue" | "abort" | "wait";

function parseFallbackMode(args: string[]): FallbackMode {
  const flag = args.find((a) => a.startsWith("--on-fallback="));
  if (!flag) return "ask";
  const value = flag.slice("--on-fallback=".length);
  if (
    value === "ask" ||
    value === "continue" ||
    value === "abort" ||
    value === "wait"
  ) {
    return value;
  }
  throw new Error(
    `Invalid --on-fallback=${value}. Must be one of: ask, continue, abort, wait.`,
  );
}

function parseResumeStatePath(args: string[]): string | undefined {
  const flag = args.find((a) => a.startsWith("--resume-state-path="));
  return flag ? flag.slice("--resume-state-path=".length) : undefined;
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const withAudio = rawArgs.includes("--with-audio");
  const fallbackMode = parseFallbackMode(rawArgs);
  const verifyAudio = rawArgs.includes("--verify-audio");
  const noShortLineStt = rawArgs.includes("--no-short-line-stt");
  const resumeStatePath = parseResumeStatePath(rawArgs);
  const positional = rawArgs.filter((a) => !a.startsWith("--"));

  if (positional.length !== 3) {
    console.error(
      "Usage: npx tsx scripts/build-mram-from-dialogue.ts " +
        "<plain.md> <cipher.md> <output.mram> [--with-audio] " +
        "[--on-fallback=ask|continue|abort|wait] [--verify-audio] " +
        "[--no-short-line-stt] [--resume-state-path=<file>]",
    );
    console.error(
      "Passphrase is read interactively (no echo) or from MRAM_PASSPHRASE env var.",
    );
    console.error(
      "--with-audio: render every line to Opus via Gemini TTS, embed in .mram.",
    );
    console.error(
      "  Requires ffmpeg in PATH and GOOGLE_GEMINI_API_KEY env var.",
    );
    console.error(
      "  Every line gets baked audio (D-01) — lines shorter than " +
        `${SHORT_LINE_MAX_CHARS} chars route through a Gemini instructional-`,
    );
    console.error(
      "  padding prompt first, falling back to Google Cloud TTS on gate " +
        "failure (D-02). Requires GOOGLE_CLOUD_TTS_API_KEY for the fallback.",
    );
    console.error("--on-fallback modes:");
    console.error(
      "  ask (default): prompt once if 3.1-flash quota exhausts mid-bake",
    );
    console.error(
      "  continue: keep going silently on the fallback tier (mixed quality)",
    );
    console.error(
      "  abort: exit with code 2 on first fallback (strict premium)",
    );
    console.error(
      "  wait: lock to preferred model only; if daily quota hits, sleep",
    );
    console.error(
      "        until midnight PT and auto-resume. Best for overnight bakes.",
    );
    console.error(
      "--verify-audio: run an STT round-trip check (AUTHOR-07) on every " +
        "freshly-rendered line; a mismatch fails the bake for that line.",
    );
    console.error(
      "--no-short-line-stt: disable the DEFAULT-ON STT round-trip check " +
        "that otherwise always runs on short-line (<" +
        `${SHORT_LINE_MAX_CHARS} char) padded-Gemini renders (D-03,`,
    );
    console.error(
      "  PROVISIONAL — Shannon was AFK when this default was set; this " +
        "flag downgrades to duration-only validation for short lines).",
    );
    console.error(
      "--resume-state-path=<file>: persist per-line bake progress so an " +
        "interrupted run can skip re-validating already-completed lines.",
    );
    console.error(
      "Requires GOOGLE_CLOUD_TTS_API_KEY (short-line fallback) and " +
        "GROQ_API_KEY (STT verification) for a full-featured --with-audio bake.",
    );
    process.exit(1);
  }

  const [plainPath, cipherPath, outputPath] = positional;

  if (
    withAudio &&
    !process.env.GOOGLE_GEMINI_API_KEY &&
    !process.env.GOOGLE_GEMINI_API_KEYS
  ) {
    console.error(
      "Error: --with-audio requires GOOGLE_GEMINI_API_KEY (single) or GOOGLE_GEMINI_API_KEYS (comma-separated pool) env var.",
    );
    process.exit(1);
  }

  if (!fs.existsSync(plainPath)) {
    console.error(`Error: plain file not found: ${plainPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(cipherPath)) {
    console.error(`Error: cipher file not found: ${cipherPath}`);
    process.exit(1);
  }

  // AUTHOR-05 D-08: shared validator gate — refuse corrupted pairs before
  // any further work (passphrase prompt, parsing, and definitely before
  // any API call). Belt-and-suspenders with scripts/bake-all.ts's own
  // pre-flight call to this SAME shared function (scripts/lib/
  // validate-or-fail.ts) — the gate cannot silently drift between the
  // orchestrator and this per-ritual sub-process.
  validateOrFail(plainPath, cipherPath);

  const passphrase = await promptPassphrase();
  if (!passphrase) {
    console.error("Error: passphrase cannot be empty.");
    process.exit(1);
  }

  console.error(`Reading ${plainPath}...`);
  const plain = parseDialogue(fs.readFileSync(plainPath, "utf-8"));
  console.error(`Reading ${cipherPath}...`);
  const cipher = parseDialogue(fs.readFileSync(cipherPath, "utf-8"));

  // Refuse to build if either file has unparseable content inside a section.
  // A silent drop would be a data-loss bug — fail loud instead.
  for (const [name, doc] of [
    ["plain", plain],
    ["cipher", cipher],
  ] as const) {
    if (doc.warnings.length > 0) {
      console.error(`\nError: ${name} file has ${doc.warnings.length} unparseable line(s):`);
      for (const w of doc.warnings.slice(0, 5)) {
        console.error(`  line ${w.lineNo}: ${JSON.stringify(w.line)}`);
      }
      if (doc.warnings.length > 5) {
        console.error(`  ... and ${doc.warnings.length - 5} more`);
      }
      console.error("Fix these lines or `npx tsx scripts/validate-rituals.ts` for details.");
      process.exit(1);
    }
  }

  // Derive BuildOptions from the plain dialogue's YAML frontmatter.
  // Required fields: jurisdiction, degree, ceremony. Refuse to build if
  // any are missing — the old code hardcoded these, which meant building
  // any ritual other than EA opening silently mislabeled the metadata.
  //
  // The cipher dialogue file does NOT carry its own frontmatter by design
  // (simpler authoring, no lockstep risk). If a cipher file accidentally
  // has frontmatter, we warn but don't fail — the plain file's metadata
  // is authoritative.
  if (cipher.metadata && Object.keys(cipher.metadata).length > 0) {
    console.error(
      `Warning: cipher file has frontmatter — ignored. Metadata lives in the plain file only.`,
    );
  }
  const metadata = plain.metadata;
  if (!metadata) {
    console.error(`Error: plain dialogue file has no frontmatter block.`);
    console.error(
      `Add a YAML frontmatter at the top of ${plainPath}:\n\n` +
        `---\n` +
        `jurisdiction: Grand Lodge of Iowa\n` +
        `degree: Entered Apprentice\n` +
        `ceremony: Opening on the First Degree\n` +
        `---\n`,
    );
    process.exit(1);
  }
  const missingFields: string[] = [];
  if (!metadata.jurisdiction) missingFields.push("jurisdiction");
  if (!metadata.degree) missingFields.push("degree");
  if (!metadata.ceremony) missingFields.push("ceremony");
  if (missingFields.length > 0) {
    console.error(
      `Error: plain dialogue frontmatter is missing required field(s): ${missingFields.join(", ")}`,
    );
    process.exit(1);
  }

  // Optional: ingest per-line styles from `{prefix}-styles.json` sidecar.
  // Looks for a file next to the plain dialogue; absent → build without styles.
  let stylesPayload: import("../src/lib/styles").StylesFile | undefined;
  const stylesInferred = plainPath.replace(/-dialogue\.md$/, "-styles.json");
  if (fs.existsSync(stylesInferred)) {
    try {
      const raw = fs.readFileSync(stylesInferred, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === 1 && Array.isArray(parsed.styles)) {
        stylesPayload = parsed;
        console.error(`Reading ${stylesInferred}... (${parsed.styles.length} style entries)`);
      } else {
        console.error(`Warning: ${stylesInferred} present but malformed (expected version:1 + styles:[]). Skipping.`);
      }
    } catch (err) {
      console.error(`Warning: failed to read ${stylesInferred}: ${(err as Error).message}. Skipping.`);
    }
  }

  // Optional: ingest voice-cast director's-notes preamble from
  // `{prefix}-voice-cast.json` sidecar. Only consumed when --with-audio
  // is set (preamble is a bake-time quality boost; runtime playback
  // keeps the lightweight single-tag format).
  let voiceCast: VoiceCastFile | undefined;
  const voiceCastInferred = plainPath.replace(/-dialogue\.md$/, "-voice-cast.json");
  if (fs.existsSync(voiceCastInferred)) {
    try {
      const raw = fs.readFileSync(voiceCastInferred, "utf-8");
      const parsed = JSON.parse(raw);
      const validated = validateVoiceCast(parsed);
      if (validated.ok) {
        voiceCast = validated.value;
        const roleCount = Object.keys(voiceCast.roles).length;
        console.error(
          `Reading ${voiceCastInferred}... (${roleCount} role card(s)${voiceCast.scene ? " + scene" : ""})`,
        );
      } else {
        console.error(
          `Warning: ${voiceCastInferred}: ${validated.error}. Skipping preamble.`,
        );
      }
    } catch (err) {
      console.error(
        `Warning: failed to read ${voiceCastInferred}: ${(err as Error).message}. Skipping preamble.`,
      );
    }
  }

  console.error("Pairing and building MRAMDocument...");
  const { doc, report } = await buildFromDialogue(plain, cipher, {
    jurisdiction: metadata.jurisdiction!,
    degree: metadata.degree!,
    ceremony: metadata.ceremony!,
    styles: stylesPayload,
  });

  if (stylesPayload) {
    console.error(`  Styles applied: ${report.applied}`);
    if (report.dropped.length > 0) {
      console.error(`  Styles dropped: ${report.dropped.length}`);
      for (const d of report.dropped) {
        console.error(`    - ${d.reason}: "${d.style}" (lineHash=${d.lineHash.slice(0, 12)}…)`);
      }
    }
  }

  console.error(`  Sections: ${doc.sections.length}`);
  console.error(`  Lines:    ${doc.lines.length}`);
  console.error(`  Roles:    ${Object.keys(doc.roles).join(", ")}`);

  if (withAudio) {
    const ritualSlug = path.basename(plainPath).replace(/-dialogue\.md$/, "");
    await bakeAudioIntoDoc(doc, fallbackMode, voiceCast, {
      verifyAudio,
      noShortLineStt,
      resumeStatePath,
      ritualSlug,
    });
  }

  console.error("Encrypting...");
  const encrypted = encryptMRAMNode(doc, passphrase);

  // Atomic write: stage to a temp file, then rename. Prevents a corrupt
  // output if the process is killed mid-write (Ctrl-C, OOM, disk full).
  // POSIX rename within the same filesystem is atomic.
  const tmpPath = outputPath + ".tmp";
  fs.writeFileSync(tmpPath, encrypted);
  fs.renameSync(tmpPath, outputPath);
  console.error(`Wrote ${encrypted.length} bytes to ${outputPath}`);
  console.error(`Checksum: ${doc.metadata.checksum}`);
  console.error("Done.");
}

// ============================================================
// Audio bake pipeline (--with-audio)
// ============================================================

/**
 * Render Opus audio for every spoken line in the doc and embed as
 * base64 on MRAMLine.audio. Captures the voice cast in metadata so
 * the client can match (role → voice) at playback time. Cached per-line
 * at rituals/_bake-cache/ so re-runs and resumed runs after quota
 * hits don't re-burn API calls.
 */
async function bakeAudioIntoDoc(
  doc: MRAMDocument,
  fallbackMode: FallbackMode,
  voiceCast: VoiceCastFile | undefined,
  options: {
    verifyAudio: boolean;
    noShortLineStt: boolean;
    resumeStatePath?: string;
    ritualSlug: string;
  },
): Promise<void> {
  const { verifyAudio, noShortLineStt, resumeStatePath, ritualSlug } = options;

  // Pool of API keys. Prefer GOOGLE_GEMINI_API_KEYS (comma-separated)
  // when set — the render loop rotates through keys on 429, effectively
  // multiplying the daily preview-model quota by pool size. Falls back
  // to the legacy singular env var for backwards compatibility.
  const apiKeys: string[] = (() => {
    const plural = process.env.GOOGLE_GEMINI_API_KEYS?.trim();
    if (plural) {
      const keys = plural
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (keys.length === 0) {
        throw new Error(
          "GOOGLE_GEMINI_API_KEYS is set but contains no non-empty entries.",
        );
      }
      return keys;
    }
    const singular = process.env.GOOGLE_GEMINI_API_KEY?.trim();
    if (singular) return [singular];
    throw new Error(
      "No API key configured (set GOOGLE_GEMINI_API_KEY or GOOGLE_GEMINI_API_KEYS).",
    );
  })();

  // D-02 fallback engine key. Absence doesn't fail the whole bake up
  // front (a ritual with no short lines never needs it) but any short
  // line whose Gemini padded render fails validation WILL refuse the
  // bake without it — warn loudly now so that's not a surprise mid-run.
  const googleApiKey = process.env.GOOGLE_CLOUD_TTS_API_KEY?.trim();
  if (!googleApiKey) {
    console.error(
      `⚠  GOOGLE_CLOUD_TTS_API_KEY is not set. Short-line Google fallback (D-02) is unavailable —`,
    );
    console.error(
      `   any line under ${SHORT_LINE_MAX_CHARS} chars whose Gemini padded render fails validation will refuse the bake.`,
    );
  }

  // D-03 STT gate key. Absence doesn't fail the bake — the gate simply
  // no-ops (duration-anomaly gate still runs) — but warn since D-03's
  // default-on short-line STT check is silently skipped without it.
  const groqApiKey = process.env.GROQ_API_KEY?.trim();
  if (!groqApiKey) {
    console.error(
      `⚠  GROQ_API_KEY is not set. STT round-trip verification (AUTHOR-07, D-03) is unavailable —`,
    );
    console.error(
      `   --verify-audio and the default-on short-line STT check will be skipped (duration-anomaly gate still runs).`,
    );
  }

  // Snapshot the canonical voice cast so playback knows exactly which
  // voices were used at bake time. If the app's GEMINI_ROLE_VOICES map
  // changes later (voice swap, new model), the audio stays tied to the
  // voices it was rendered with — client falls through to network path
  // only for roles where the voice doesn't match anymore.
  doc.metadata.voiceCast = { ...GEMINI_ROLE_VOICES };
  doc.metadata.audioFormat = "opus-32k-mono";

  // Precompute each role's preamble once. Every spoken line for that
  // role uses the same preamble, so we'd otherwise rebuild the same
  // string 50+ times. Cache is cheap and avoids per-line string churn.
  const preambleByRole: Record<string, string> = {};
  const rolesWithPreamble: string[] = [];
  if (voiceCast) {
    for (const role of Object.keys(voiceCast.roles)) {
      const preamble = buildPreamble(voiceCast, role);
      if (preamble) {
        preambleByRole[role] = preamble;
        rolesWithPreamble.push(role);
      }
    }
  }

  // Short-utterance preamble skip. Gemini TTS's classifier can mis-route
  // very short transcripts surrounded by long director's-notes preamble
  // as "respond to the instructions in text" instead of "generate audio
  // for the transcript." Observed on lines like "Of an Entered
  // Apprentice." (25 chars) — three retries all returned empty audio
  // streams because the preamble:content ratio was ~16:1.
  //
  // Short catechism lines ("So mote it be.", "In the East.", "B.", "O.")
  // don't benefit from character pinning anyway — there's not enough
  // audio to carry the direction. Fall back to the lightweight
  // [style] text format for anything under the threshold.
  //
  // Configurable via VOICE_CAST_MIN_LINE_CHARS env var so the user can
  // tune without a code change. Default 40 chars covers the catechism
  // section of Masonic rituals while keeping every full-sentence line
  // on the premium preamble path. UNCHANGED by D-01 — this is a
  // different threshold than the short-line routing below.
  const MIN_PREAMBLE_LINE_CHARS = Number(
    process.env.VOICE_CAST_MIN_LINE_CHARS ?? "40",
  );

  // Preferred model is the first entry of the fallback chain — either
  // the env override (GEMINI_TTS_MODELS, first comma-separated value)
  // or the hardcoded 3.1-flash default. Any rendered line that used a
  // different model is a quality-drop event worth surfacing.
  const preferredModel =
    process.env.GEMINI_TTS_MODELS?.split(",")[0]?.trim() ||
    "gemini-3.1-flash-tts-preview";

  // Wait mode locks renderLineAudio to the preferred model only by
  // passing models: [preferredModel]. When that single model's quota
  // exhausts, callGeminiWithFallback throws AllModelsQuotaExhausted,
  // which renderLineAudio's existing catch triggers the
  // sleep-until-midnight-PT waitHandler. After the sleep, the outer
  // retry loop tries the same model again — now with fresh quota.
  // Net effect: the bake blocks until quota resets and then continues,
  // never degrading to the lower tier. Good for overnight bakes.
  const modelsForWaitMode: string[] | undefined =
    fallbackMode === "wait" ? [preferredModel] : undefined;
  const modelChain = modelsForWaitMode ?? readModelsFromEnv() ?? DEFAULT_MODELS;

  const spokenLines = doc.lines.filter((l) => l.role && l.plain.trim().length > 0);
  const total = spokenLines.length;

  console.error(`\nBaking audio for ${total} spoken lines...`);
  console.error(`  Cache: ${CACHE_DIR} (safe to interrupt + resume)`);
  console.error(`  Preferred model: ${preferredModel}`);
  if (fallbackMode === "wait") {
    console.error(`  Fallback chain: NONE — wait mode locks to preferred only`);
  } else {
    console.error(`  Fallback chain: 3.1-flash → 2.5-flash → 2.5-pro`);
  }
  const retryBackoff = process.env.GEMINI_RETRY_BACKOFF_MS?.trim() || "5000,30000,90000,180000";
  const retryHuman = retryBackoff
    .split(",")
    .map((ms) => `${Math.round(Number(ms) / 1000)}s`)
    .join(", ");
  console.error(
    `  Per-model retry backoff: ${retryHuman} (total ~${Math.round(retryBackoff.split(",").reduce((a, b) => a + Number(b), 0) / 1000)}s before falling to next tier)`,
  );
  if (fallbackMode === "wait") {
    console.error(
      `  On preferred-model exhaustion: sleep until midnight PT, auto-resume`,
    );
    console.error(
      `  (walk away / go to bed — no prompt fires, no degradation, premium-only)`,
    );
  } else {
    console.error(
      `  On all-models-429: sleep until midnight PT, auto-resume`,
    );
    console.error(
      `  On quality-tier drop: ${fallbackMode} (--on-fallback=${fallbackMode})`,
    );
  }
  if (rolesWithPreamble.length > 0) {
    const shortLines = spokenLines.filter(
      (l) => l.plain.trim().length < MIN_PREAMBLE_LINE_CHARS,
    ).length;
    console.error(
      `  Voice-cast preamble: ${rolesWithPreamble.length} role(s) — ${rolesWithPreamble.join(", ")}`,
    );
    if (shortLines > 0) {
      console.error(
        `  Short-line skip: ${shortLines} line(s) under ${MIN_PREAMBLE_LINE_CHARS} chars will use [style] text without preamble`,
      );
      console.error(
        `  (tune VOICE_CAST_MIN_LINE_CHARS env var to change the threshold)`,
      );
    }
  } else if (voiceCast) {
    console.error(`  Voice-cast loaded but contained no usable role cards.`);
  } else {
    console.error(
      `  Voice-cast: none (drop a {slug}-voice-cast.json next to the dialogue for richer delivery)`,
    );
  }
  console.error(
    `  Short lines (<${SHORT_LINE_MAX_CHARS} chars): Gemini instructional-padding first, Google Cloud TTS fallback on gate failure (D-01/D-02 — never skipped)`,
  );
  console.error(
    verifyAudio
      ? `  --verify-audio: ON — STT round-trip runs on every freshly-rendered line`
      : `  --verify-audio: off (pass --verify-audio to gate every line, not just short ones)`,
  );
  console.error(
    noShortLineStt
      ? `  Short-line STT gate: DISABLED via --no-short-line-stt (duration-anomaly gate still runs)`
      : `  Short-line STT gate: ON by default (D-03, PROVISIONAL)`,
  );

  // Resume state (per-line progress, --resume-state-path). Reading is
  // best-effort: a state file for a DIFFERENT ritual is ignored, not an
  // error — guards against accidentally reusing another ritual's state.
  let resumeState: ResumeState | null = null;
  const completedLineIds = new Set<string>();
  if (resumeStatePath) {
    const loaded = readResumeState(resumeStatePath);
    if (loaded && loaded.ritual === ritualSlug) {
      resumeState = loaded;
      for (const id of loaded.completedLineIds) completedLineIds.add(id);
      console.error(
        `  Resume state: ${completedLineIds.size} line(s) already completed in a prior run — cache-only lookup, gates skipped for those.`,
      );
    } else if (loaded) {
      console.error(
        `  Resume state at ${resumeStatePath} is for a different ritual ("${loaded.ritual}") — ignoring, starting fresh.`,
      );
    }
  }
  const persistResumeState = () => {
    if (!resumeStatePath) return;
    writeResumeStateAtomic(resumeStatePath, {
      ritual: ritualSlug,
      completedLineIds: Array.from(completedLineIds),
      inFlightLineIds: [],
      startedAt: resumeState?.startedAt ?? Date.now(),
    });
  };

  // Pre-bake cache scan. D-01: no more "too-short" bucket — short lines
  // are classified as cached/to-render against their PADDED Gemini
  // prompt cache key, same as normal lines against their own key.
  let preCached = 0;
  let preToRender = 0;
  for (const line of spokenLines) {
    const cleanText = line.plain.trim();
    const isShort = cleanText.length < SHORT_LINE_MAX_CHARS;
    const voice = getGeminiVoiceForRole(line.role);
    const text = isShort ? buildShortLinePrompt(cleanText) : cleanText;
    const style = isShort ? undefined : line.style;
    const preamble = !isShort && cleanText.length >= MIN_PREAMBLE_LINE_CHARS
      ? preambleByRole[line.role] ?? ""
      : "";
    const cacheKey = computeCacheKey(text, style, voice, modelChain[0], preamble);
    const cached = fs.existsSync(path.join(CACHE_DIR, `${cacheKey}.opus`));
    if (cached) preCached++;
    else preToRender++;
  }
  const preCachedPct = total > 0 ? Math.round((preCached / total) * 100) : 0;
  console.error(
    `  Cache status: ${preCached}/${total} already cached (${preCachedPct}%), ${preToRender} to render fresh`,
  );
  if (preCached > 0 && preToRender === 0) {
    console.error(
      `  Fully cached — this bake will re-emit the same audio with zero API calls.`,
    );
  }
  console.error("");

  const startTime = Date.now();
  let rendered = 0;
  let cacheHits = 0;
  let totalBytes = 0;
  // Tally of which models/engines actually served each line. Populated
  // only on fresh renders (cache hits don't report provenance). "google:
  // <voice>" entries show up here alongside Gemini model ids (D-02
  // provenance is honest per engine).
  const modelTally: Record<string, number> = {};
  // Lines whose FINAL render used a non-preferred tier (a lower Gemini
  // model OR the Google engine). Kept for the end-of-run summary. D-08:
  // these stay cached, never deleted, for later premium upgrade.
  const fallbackTierLines: { id: number; role: string; text: string; model: string }[] = [];
  // Set once the user has made a go/no-go call on a GEMINI quality-tier
  // drop, so we don't prompt (or log the warning banner) repeatedly.
  // Google-engine (D-02) fallback lines never trigger this prompt — a
  // non-Gemini voice on a short line is the documented worst case, not
  // an unexpected quality regression needing a decision.
  let fallbackResolved = false;

  // Rolling median duration-sample pool for AUTHOR-06's anomaly gate.
  // Populated only from freshly-rendered lines this run (matches the
  // plan's "collect DurationSample per rendered line" wording) — see
  // runDurationAnomalyGate for the 30-sample warm-up window logic.
  const durationSamples: DurationSample[] = [];

  const warnedMissingGoogleVoice = new Set<string>();

  for (const line of spokenLines) {
    const cleanText = line.plain.trim();
    const isShort = cleanText.length < SHORT_LINE_MAX_CHARS;
    const voice = getGeminiVoiceForRole(line.role);
    const preamble = !isShort && cleanText.length >= MIN_PREAMBLE_LINE_CHARS
      ? preambleByRole[line.role] ?? ""
      : "";
    const googleVoice = resolveGoogleVoice(voiceCast, line.role);

    if (
      isShort &&
      !voiceCast?.roles[line.role]?.googleVoice &&
      !warnedMissingGoogleVoice.has(line.role)
    ) {
      warnedMissingGoogleVoice.add(line.role);
      process.stderr.write("\r" + " ".repeat(80) + "\r");
      console.error(
        `  ⚠  role "${line.role}" has no pinned googleVoice in the voice-cast sidecar — Google fallback (if needed) uses the default (${GOOGLE_FALLBACK_DEFAULT_VOICE}).`,
      );
    }

    const done = spokenLines.indexOf(line) + 1;
    const pct = Math.floor((done / total) * 100);
    const alreadyCompleted = completedLineIds.has(String(line.id));

    try {
      let result: LineRenderResult | null = null;

      if (alreadyCompleted) {
        const hit = tryReadCompletedLineFromCache({
          cacheDir: CACHE_DIR,
          isShort,
          cleanText,
          style: line.style,
          voice,
          preamble,
          modelChain,
          googleVoice,
        });
        if (hit) result = { ...hit, fromCache: true };
      }

      if (!result) {
        result = isShort
          ? await renderShortLineWithGates({
              cleanText,
              voice,
              googleVoice,
              apiKeys,
              models: modelChain,
              cacheDir: CACHE_DIR,
              groqApiKey,
              googleApiKey,
              noShortLineStt,
              durationSamples,
            })
          : await renderNormalLineWithGates({
              cleanText,
              style: line.style,
              voice,
              preamble,
              apiKeys,
              models: modelChain,
              cacheDir: CACHE_DIR,
              verifyAudio,
              groqApiKey,
              durationSamples,
            });
      }

      line.audio = result.opus.toString("base64");
      const statusLabel = result.fromCache ? "cache" : result.model;

      if (result.fromCache) {
        cacheHits++;
      } else {
        rendered++;
        totalBytes += result.opus.length;
        modelTally[result.model] = (modelTally[result.model] ?? 0) + 1;

        upsertBakeIndexEntry(CACHE_DIR, {
          cacheKey: result.cacheKey,
          model: result.model,
          ritualSlug,
          lineId: line.id,
          byteLen: result.opus.length,
          durationMs: result.durationMs ?? getOpusDurationMs(result.opus),
          createdAt: new Date().toISOString(),
          tier: classifyTier(result.model, preferredModel),
        });

        if (result.model !== preferredModel) {
          fallbackTierLines.push({ id: line.id, role: line.role, text: cleanText, model: result.model });
        }
      }

      completedLineIds.add(String(line.id));
      persistResumeState();

      // Quality-tier drop detection (Gemini fallback models only — see
      // fallbackResolved comment above). Google-engine lines (D-02) are
      // excluded: that fallback is expected, documented behavior, not a
      // decision point.
      if (
        !result.fromCache &&
        result.model !== preferredModel &&
        !result.model.startsWith("google:") &&
        !fallbackResolved
      ) {
        // Clear the in-progress line so the banner reads cleanly.
        process.stderr.write("\r" + " ".repeat(80) + "\r");
        console.error("");
        console.error(
          `⚠  Quality-tier drop detected at line ${line.id} (${line.role}).`,
        );
        console.error(`   Preferred: ${preferredModel}`);
        console.error(`   Served by: ${result.model}`);
        console.error(
          `   The preferred model's daily quota is exhausted. Remaining lines`,
        );
        console.error(
          `   will continue on fallback tiers until you abort + retry after`,
        );
        console.error(`   midnight PT for a uniform premium bake.`);
        console.error("");

        // Shared abort handler. D-08 keep-and-upgrade: fallback-tier
        // renders are NEVER deleted here — they stay cached under their
        // own modelId-qualified key so a re-run after quota reset can
        // upgrade just those lines to the preferred model (the preferred-
        // model cache LOOKUP key is different, so it naturally misses and
        // re-renders — no explicit deletion needed for that to work).
        const handleAbort = (reason: string) => {
          const renderedOnPremium = modelTally[preferredModel] ?? 0;
          // Cache hits may be either premium-tier entries from prior
          // runs OR any tier (the cache key doesn't record provenance).
          // We count them separately so the user sees the total
          // preserved work, not just what rendered fresh this run.
          const preservedTotal = renderedOnPremium + cacheHits;
          console.error(reason);
          if (preservedTotal > 0) {
            const parts: string[] = [];
            if (renderedOnPremium > 0)
              parts.push(`${renderedOnPremium} rendered on ${preferredModel} this run`);
            if (cacheHits > 0)
              parts.push(`${cacheHits} cache hit(s) from prior run(s)`);
            console.error(`   ${preservedTotal} line(s) preserved (${parts.join(", ")}).`);
            console.error(
              `   Re-run after midnight PT — cached lines skip the API, only line`,
            );
            console.error(
              `   ${line.id} onward renders fresh on the preferred tier.`,
            );
          } else {
            console.error(
              `   No lines rendered this run before the tier drop. Re-run after`,
            );
            console.error(
              `   midnight PT to start fresh on the preferred model.`,
            );
          }
          console.error(
            `   (This run's fallback-tier render for line ${line.id} is KEPT (D-08 keep-`,
          );
          console.error(
            `   and-upgrade) — a re-run on the preferred model upgrades it automatically.)`,
          );
          console.error("");
          process.exit(2);
        };

        if (fallbackMode === "abort") {
          handleAbort(
            `   --on-fallback=abort set. Halting now.`,
          );
        }

        if (fallbackMode === "ask") {
          const choice = await promptFallbackChoice();
          if (choice === "abort") {
            handleAbort(`   Aborting for a uniform premium bake.`);
          }
          console.error(
            `   Continuing with mixed-tier bake. Will not prompt again this run.`,
          );
          console.error(
            `   (The fallback-tier cache entry for line ${line.id} is kept (D-08) — a`,
          );
          console.error(
            `   later re-bake upgrades it to the preferred model automatically.)`,
          );
          console.error("");
        } else {
          // continue mode
          console.error(
            `   --on-fallback=continue set. Proceeding silently on fallback tier.`,
          );
          console.error("");
        }

        fallbackResolved = true;
      }

      const elapsed = (Date.now() - startTime) / 1000;
      const eta = elapsed > 0 && done > 0 ? Math.ceil((elapsed / done) * (total - done)) : 0;
      process.stderr.write(
        `\r  [${done.toString().padStart(3)}/${total}] ${pct.toString().padStart(3)}% ` +
          `${line.role.padEnd(10)} (${statusLabel.padEnd(30)}) ` +
          `ETA ${etaFormat(eta)}       `,
      );
    } catch (err) {
      // D-01: no more catch-and-skip. Any render/gate failure that
      // survives the short-line Google fallback (or, for normal lines,
      // has no fallback available at all) is fatal — the bake refuses
      // rather than silently dropping a line. Cache is preserved either
      // way (successful renders that came before this line stay on
      // disk), so a fixed re-run resumes cheaply.
      process.stderr.write("\r" + " ".repeat(80) + "\r");
      console.error(
        `\n\nError rendering line ${line.id} (${line.role}): ${(err as Error).message}`,
      );
      console.error("The cache is preserved — fix the issue and re-run to resume.");
      throw err;
    }
  }
  process.stderr.write("\n\n");

  console.error("Audio bake complete:");
  console.error(`  Rendered via API:  ${rendered}`);
  if (Object.keys(modelTally).length > 0) {
    console.error(`    Per-model/engine breakdown:`);
    const sorted = Object.entries(modelTally).sort((a, b) => b[1] - a[1]);
    for (const [model, count] of sorted) {
      const tier = model === preferredModel ? "(preferred)" : "(fallback)";
      console.error(
        `      ${model.padEnd(35)} ${count.toString().padStart(3)} lines  ${tier}`,
      );
    }
  }
  console.error(`  Cache hits:        ${cacheHits}`);
  if (fallbackTierLines.length > 0) {
    console.error(
      `  Fallback-tier (kept, D-08 keep-and-upgrade): ${fallbackTierLines.length} line(s)`,
    );
    for (const r of fallbackTierLines.slice(0, 10)) {
      console.error(
        `    id=${r.id} ${r.role}: "${r.text.slice(0, 40)}${r.text.length > 40 ? "…" : ""}" — ${r.model}`,
      );
    }
    if (fallbackTierLines.length > 10) {
      console.error(`    … and ${fallbackTierLines.length - 10} more`);
    }
  }
  console.error(
    `  Bytes added (pre-encrypt):  ${(totalBytes / 1024 / 1024).toFixed(2)} MB Opus`,
  );
  console.error(`  Voice cast: ${Object.entries(doc.metadata.voiceCast)
    .map(([role, voice]) => `${role}=${voice}`)
    .join(", ")}`);
  console.error("");
}

/**
 * One-shot y/N prompt for the quality-drop confirmation. Uses raw-mode
 * stdin (same pattern as promptPassphrase) so a single keystroke decides
 * without needing Enter. In non-TTY environments (piped stdin, CI) this
 * defaults to abort — running on fallback quality silently isn't what
 * a user wanted when they picked the default.
 */
async function promptFallbackChoice(): Promise<"continue" | "abort"> {
  if (!process.stdin.isTTY) {
    console.error(
      `   stdin is not a TTY — defaulting to abort. Re-run with --on-fallback=continue`,
    );
    console.error(`   to keep going on the fallback tier in non-interactive environments.`);
    return "abort";
  }

  process.stderr.write(`   Continue with lower-quality fallback? [y/N] `);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf-8");

  return new Promise((resolve) => {
    const onData = (chunk: string) => {
      const ch = chunk[0] ?? "";
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
      process.stderr.write(ch + "\n");
      resolve(ch === "y" || ch === "Y" ? "continue" : "abort");
    };
    process.stdin.on("data", onData);
  });
}

function etaFormat(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m${s.toString().padStart(2, "0")}s`;
}

// Only run CLI when executed directly, not when imported
if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
