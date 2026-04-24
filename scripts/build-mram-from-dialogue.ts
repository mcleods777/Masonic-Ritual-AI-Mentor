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
 *     [--on-fallback=ask|continue|abort]
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
 * --verify-audio          (AUTHOR-07 D-11) Pipe each rendered line's Opus
 *                         through Groq Whisper and print a word-diff
 *                         roll-up at the end. Default off. Warn-only
 *                         (never fails the bake). Threshold controlled
 *                         by VERIFY_AUDIO_DIFF_THRESHOLD env (default 2).
 *
 * The passphrase is read interactively with echo disabled. It is NEVER
 * accepted on the command line (that would leak it to shell history and
 * `ps -ef` output).
 */

import * as fs from "node:fs";
import * as crypto from "node:crypto";
import { parseBuffer } from "music-metadata";
import { parseDialogue } from "../src/lib/dialogue-format";
import { buildFromDialogue } from "../src/lib/dialogue-to-mram";
import type { MRAMDocument } from "../src/lib/mram-format";
import {
  GEMINI_ROLE_VOICES,
  getGeminiVoiceForRole,
  getGoogleVoiceForRole,
} from "../src/lib/tts-cloud";
import { validateOrFail } from "./lib/validate-or-fail";
import {
  renderLineAudio,
  deleteCacheEntry,
  isLineCached,
  PersistentTextTokenRegression,
} from "./render-gemini-audio";
import {
  buildPreamble,
  validateVoiceCast,
  type VoiceCastFile,
} from "../src/lib/voice-cast";
import { hashLineText, isValidSpeakAs } from "../src/lib/styles";
import {
  type ResumeState,
  readResumeState,
  writeResumeStateAtomic,
} from "./lib/resume-state";
import {
  computeMedianSecPerChar as computeMedianSecPerCharExtracted,
  isDurationAnomaly,
  wordDiff,
  type DurationSample,
} from "./lib/bake-math";

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
// Phase 3 bake-time gates (AUTHOR-04 / AUTHOR-05 / AUTHOR-06 / AUTHOR-07)
// ============================================================
//
// Pre-render validator gate (AUTHOR-05 D-08) now lives in
// scripts/lib/validate-or-fail.ts and is imported as validateOrFail.
// The same shared function is used by the orchestrator (scripts/bake-all.ts)
// so the two gates cannot silently drift (HI-01 in 03-REVIEW.md).

/**
 * Direct Google Cloud TTS REST call for the short-line bake path (AUTHOR-04 D-09).
 * Bypasses /api/tts/google because there is no dev server during an offline
 * bake; uses GOOGLE_CLOUD_TTS_API_KEY from .env (set in Phase 2 deployment).
 *
 * CRITICAL: sends only {text, voiceName, languageCode}. NO preamble, NO style,
 * NO voice-cast scene — Pitfall 4 in RESEARCH.md §Common Pitfalls flags the
 * voice-cast-scene-leaks-into-audio failure mode; the short-line engine must
 * stay isolated from it.
 *
 * Returns native Opus-in-Ogg (audioEncoding: "OGG_OPUS") byte-compatible
 * with Gemini+ffmpeg output (Assumption A3). No ffmpeg transcode for short-
 * line audio.
 */
async function googleTtsBakeCall(
  text: string,
  voiceName: string,
  languageCode: string = "en-US",
): Promise<{ opusBytes: Buffer; durationMs: number }> {
  const apiKey = process.env.GOOGLE_CLOUD_TTS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "[AUTHOR-04] GOOGLE_CLOUD_TTS_API_KEY required for short-line bake route. " +
        "Set it in .env, or set MIN_BAKE_LINE_CHARS=999 to disable the short-line " +
        "route (will re-introduce the pre-Phase-3 hard-skip behavior).",
    );
  }
  const res = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text }, // text only; NO preamble, NO style (Pitfall 4)
        voice: { languageCode, name: voiceName },
        audioConfig: { audioEncoding: "OGG_OPUS" },
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    // T-03-05 mitigation: redact any `?key=…` that might leak into the
    // error surface before throwing.
    const redacted = body.replace(/[?&]key=[^&"'\s]*/g, "?key=REDACTED");
    throw new Error(
      `[AUTHOR-04] google tts ${res.status}: ${redacted.slice(0, 500)}`,
    );
  }
  const json = (await res.json()) as { audioContent: string };
  const opusBytes = Buffer.from(json.audioContent, "base64");
  const meta = await parseBuffer(opusBytes, { mimeType: "audio/ogg" });
  const durationMs = Math.round((meta.format.duration ?? 0) * 1000);
  return { opusBytes, durationMs };
}

// ============================================================
// AUTHOR-06 D-10: audio-duration anomaly detector
// ============================================================
//
// Per-ritual rolling median sec-per-char; hard-fails on >3.0× or <0.3×
// the median. Pitfall 6: skip check for the first 30 samples (median
// is unstable below that). D-10 explicitly rejects auto-evict — the
// failing cache entry stays, surfaced in the error message so the user
// can rm it and investigate (don't mask recurring failures).
//
// Historical failure this catches (`gemini-tts-voice-cast-scene-leaks-into-
// audio` skill): a Gemini TTS bake leaked the voice-cast preamble into
// the rendered audio, producing ~30s of audio for a ~5s expected line.
// >3× median triggers on exactly this pattern.
interface AnomalyCheckState {
  samples: DurationSample[];
  medianSecPerChar: number | null;
}

function newAnomalyState(): AnomalyCheckState {
  return { samples: [], medianSecPerChar: null };
}

// Thin wrapper over the extracted pure helper — keeps the local name stable
// while delegating the ordering + median arithmetic to bake-math (unit-tested
// separately in scripts/__tests__/bake-helpers.test.ts).
function computeMedianSecPerChar(samples: DurationSample[]): number {
  return computeMedianSecPerCharExtracted(samples);
}

function addAndCheckAnomaly(
  state: AnomalyCheckState,
  lineId: number,
  durationMs: number,
  charCount: number,
): void {
  state.samples.push({ durationMs, charCount });
  // Pitfall 6: insufficient sample — median unstable below 30 data points.
  if (state.samples.length < 30) return;
  state.medianSecPerChar = computeMedianSecPerChar(state.samples);
  const thisSample: DurationSample = { durationMs, charCount };
  if (!isDurationAnomaly(thisSample, state.medianSecPerChar)) return;
  const thisRatio = (durationMs / 1000) / Math.max(charCount, 1);
  const r = thisRatio / state.medianSecPerChar;
  // Error preserves the same structured-message shape (callers grep for
  // the "[AUTHOR-06 D-10]" prefix + ratio=N× token). Strict > 3.0 / < 0.3
  // comparisons match isDurationAnomaly's band semantics — boundary
  // values pass (see bake-math.ts + bake-helpers.test.ts).
  if (r > 3.0 || r < 0.3) {
    throw new Error(
      `[AUTHOR-06 D-10] duration anomaly on line ${lineId}: ` +
        `durationMs=${durationMs}, charCount=${charCount}, ` +
        `ritualMedianSecPerChar=${state.medianSecPerChar.toFixed(4)}, ` +
        `ratio=${r.toFixed(2)}× (allowed band: [0.3×, 3×]). ` +
        `Likely voice-cast scene leak (>3×) or cropped output (<0.3×). ` +
        `Manually rm rituals/_bake-cache/{cacheKey}.opus for this line, ` +
        `verify the dialogue text, and re-run.`,
    );
  }
}

// ============================================================
// AUTHOR-07 D-11: optional --verify-audio STT round-trip
// ============================================================
//
// Opt-in flag (default off). Pipes each rendered Opus through Groq
// Whisper directly (bypassing /api/transcribe since the bake has no
// dev server) and prints a word-diff roll-up at the end. Warn-only:
// never hard-fails the bake — Whisper itself mis-transcribes
// occasionally, so surfacing for review beats false-positive blocking.
// Default threshold: "diff > 2 words" (env-overridable via
// VERIFY_AUDIO_DIFF_THRESHOLD).
const VERIFY_AUDIO_DIFF_THRESHOLD = Number(
  process.env.VERIFY_AUDIO_DIFF_THRESHOLD ?? "2",
);

interface VerifyAudioEntry {
  lineId: number;
  role: string;
  expected: string;
  transcript: string;
  wordDiffCount: number;
}

async function verifyAudioRoundTrip(
  opusBytes: Buffer,
  expectedText: string,
): Promise<{ transcript: string; wordDiffCount: number }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(
      "[AUTHOR-07] --verify-audio requires GROQ_API_KEY set in .env",
    );
  }
  const form = new FormData();
  // Copy into a fresh non-shared ArrayBuffer so the Uint8Array satisfies
  // DOM's strict BlobPart typing (Node Buffer's ArrayBufferLike union
  // includes SharedArrayBuffer which Blob rejects).
  const opusCopy = new Uint8Array(opusBytes.byteLength);
  opusCopy.set(opusBytes);
  const opusBlob = new Blob([opusCopy], { type: "audio/ogg" });
  form.append("file", opusBlob, "line.opus");
  form.append("model", "whisper-large-v3");
  form.append("response_format", "json");
  const res = await fetch(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    },
  );
  if (!res.ok) {
    throw new Error(
      `[AUTHOR-07] groq whisper ${res.status}: ${(await res.text()).slice(0, 200)}`,
    );
  }
  const { text: transcript } = (await res.json()) as { text: string };
  // wordDiff is unit-tested in scripts/__tests__/bake-helpers.test.ts —
  // regression coverage for the case-insensitive set-diff arithmetic.
  const { missed, inserted } = wordDiff(expectedText, transcript);
  return { transcript, wordDiffCount: missed.length + inserted.length };
}

// ============================================================
// CLI
// ============================================================

/**
 * Read a passphrase from stdin without echoing it to the terminal.
 * Falls back to environment variable MRAM_PASSPHRASE if stdin is not a TTY
 * (e.g., in automation) so CI pipelines can still build without a TTY,
 * while interactive use never leaks the passphrase to scrollback or history.
 */
async function promptPassphrase(): Promise<string> {
  if (!process.stdin.isTTY) {
    const envPass = process.env.MRAM_PASSPHRASE;
    if (envPass) return envPass;
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

async function main() {
  const rawArgs = process.argv.slice(2);
  const withAudio = rawArgs.includes("--with-audio");
  // AUTHOR-07 D-11: opt-in STT round-trip verify flag (warn-only, default off).
  const verifyAudio = rawArgs.includes("--verify-audio");

  // AUTHOR-02 D-06: line-level resume state. When --resume-state-path +
  // --ritual-slug are both set (typically by the bake-all.ts orchestrator,
  // Plan 07), this script writes _RESUME.json atomically before AND after
  // every rendered line. --skip-line-ids lets the orchestrator skip lines
  // already completed in a prior interrupted run. When none of these are
  // set, behavior is pre-D-06 (no resume side effects).
  const argValue = (flag: string): string | undefined => {
    const idx = rawArgs.indexOf(flag);
    if (idx < 0 || idx + 1 >= rawArgs.length) return undefined;
    const next = rawArgs[idx + 1];
    if (!next || next.startsWith("--")) return undefined;
    return next;
  };
  const resumeStatePath = argValue("--resume-state-path");
  const ritualSlugArg = argValue("--ritual-slug");
  const skipLineIdsArg = argValue("--skip-line-ids");
  const skipLineIds = new Set(
    (skipLineIdsArg ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

  const fallbackMode = parseFallbackMode(rawArgs);
  // Filter positional args to exclude --flag tokens AND the value-consuming
  // args that follow --resume-state-path / --ritual-slug / --skip-line-ids.
  const valueConsumingFlags = new Set([
    "--resume-state-path",
    "--ritual-slug",
    "--skip-line-ids",
  ]);
  const positional: string[] = [];
  for (let i = 0; i < rawArgs.length; i++) {
    const a = rawArgs[i]!;
    if (a.startsWith("--")) {
      if (valueConsumingFlags.has(a)) i++; // consume the value that follows
      continue;
    }
    positional.push(a);
  }

  if (positional.length !== 3) {
    console.error(
      "Usage: npx tsx scripts/build-mram-from-dialogue.ts " +
        "<plain.md> <cipher.md> <output.mram> [--with-audio] " +
        "[--on-fallback=ask|continue|abort|wait]",
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

  // AUTHOR-05 D-08: run the cipher/plain parity validator BEFORE any API
  // activity, passphrase prompt, or other expensive work. Any severity-error
  // issue (including D-08 bake-band word-ratio outliers from Plan 04) exits
  // non-zero. Prevents shipping an .mram with cipher/plain drift to invited
  // Brothers (T-03-04 mitigation).
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
    // Build the speakAs-by-lineId map from the styles payload (if any).
    // This enables bake-time prompt-vs-display separation for lines whose
    // ritually-correct plain text is too short or too stochastic to bake
    // reliably. The map stays local to the bake — never written to .mram.
    const speakAsByLineId = new Map<number, string>();
    if (stylesPayload) {
      const speakAsByHash = new Map<string, string>();
      for (const entry of stylesPayload.styles) {
        if (entry.speakAs && isValidSpeakAs(entry.speakAs)) {
          speakAsByHash.set(entry.lineHash, entry.speakAs);
        } else if (entry.speakAs) {
          console.error(
            `Warning: invalid speakAs for lineHash ${entry.lineHash.slice(0, 12)}… (dropped)`,
          );
        }
      }
      if (speakAsByHash.size > 0) {
        for (const line of doc.lines) {
          if (!line.plain || !line.role) continue;
          const hash = await hashLineText(line.plain);
          const sa = speakAsByHash.get(hash);
          if (sa) speakAsByLineId.set(line.id, sa);
        }
        console.error(
          `  speakAs overrides: ${speakAsByLineId.size} line(s) will bake on instructional prompts`,
        );
      }
    }
    await bakeAudioIntoDoc(
      doc,
      fallbackMode,
      voiceCast,
      speakAsByLineId,
      verifyAudio,
      { resumeStatePath, ritualSlug: ritualSlugArg, skipLineIds },
    );
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
 * at ~/.cache/masonic-mram-audio so re-runs and resumed runs after quota
 * hits don't re-burn API calls.
 */
/**
 * Line-level resume-state options (AUTHOR-02 D-06). All three fields are
 * optional; when `resumeStatePath` is undefined the bake runs with no
 * resume side effects (pre-D-06 behavior).
 */
interface ResumeOptions {
  /** Path where _RESUME.json is written (e.g. rituals/_bake-cache/_RESUME.json). */
  resumeStatePath?: string | undefined;
  /** Ritual slug identifying this bake — guards against mixed-ritual resume. */
  ritualSlug?: string | undefined;
  /** Line IDs (strings) to skip entirely — already completed in a prior run. */
  skipLineIds?: Set<string>;
}

async function bakeAudioIntoDoc(
  doc: MRAMDocument,
  fallbackMode: FallbackMode,
  voiceCast: VoiceCastFile | undefined,
  speakAsByLineId: Map<number, string> = new Map(),
  verifyAudio: boolean = false,
  resumeOpts: ResumeOptions = {},
): Promise<void> {
  const { resumeStatePath, ritualSlug, skipLineIds = new Set<string>() } =
    resumeOpts;
  // Resolve the text that gets sent to Gemini TTS for a given line.
  // When a speakAs override is registered for this line, it takes the
  // place of `line.plain` as the prompt text, the cache-key text, and
  // the hard-skip / preamble threshold input. When no override is set,
  // behavior is identical to the pre-speakAs path.
  const bakeTextFor = (line: { id: number; plain: string }): string => {
    const override = speakAsByLineId.get(line.id);
    return (override ?? line.plain).trim();
  };
  // Lines with a speakAs override skip the voice-cast preamble: the
  // instructional prompt is already explicit ("Say only X") and the
  // additional role-card preamble tends to confuse Gemini into speaking
  // the preamble content or ignoring the instruction.
  const hasSpeakAs = (lineId: number) => speakAsByLineId.has(lineId);
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
  // on the premium preamble path.
  const MIN_PREAMBLE_LINE_CHARS = Number(
    process.env.VOICE_CAST_MIN_LINE_CHARS ?? "40",
  );

  // Hard-skip threshold: ultra-short lines ("B.", "O.", "A.") never
  // generate reliable audio from Gemini TTS regardless of prompt shape.
  // Rather than burn the full ~5-min retry budget per line just to
  // conclude it can't be baked, skip them outright at pre-scan time.
  // The .mram ships without embedded audio for these lines, and the
  // runtime TTS path handles them at rehearsal (same behavior as every
  // line had before bake-in existed). Cost: a handful of API calls per
  // Brother per rehearsal, well within free-tier runtime budget.
  //
  // Tune via MIN_BAKE_LINE_CHARS env var (default 5 chars — catches
  // single-letter spelling of Masonic passwords like "B.", "O.", "A."
  // while still baking anything sentence-like including "Satisfied.").
  const MIN_BAKE_LINE_CHARS = Number(
    process.env.MIN_BAKE_LINE_CHARS ?? "5",
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

  const spokenLines = doc.lines.filter((l) => l.role && l.plain.trim().length > 0);
  const total = spokenLines.length;

  console.error(`\nBaking audio for ${total} spoken lines...`);
  console.error(`  Cache: ~/.cache/masonic-mram-audio/ (safe to interrupt + resume)`);
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

  // Pre-bake cache scan. AUTHOR-04 D-09: short lines (< MIN_BAKE_LINE_CHARS)
  // are no longer hard-skipped — they route to Google Cloud TTS at bake time
  // via googleTtsBakeCall(). Every shipped .mram now ships audio for every
  // spoken line. Tune via MIN_BAKE_LINE_CHARS env var.
  let preCached = 0;
  let preToRender = 0;
  const preShortLineGoogle: { id: number; role: string; text: string }[] = [];
  for (const line of spokenLines) {
    const bakeText = bakeTextFor(line);
    if (bakeText.length < MIN_BAKE_LINE_CHARS) {
      // AUTHOR-04 D-09: count into Google short-line route, not hard-skip.
      preShortLineGoogle.push({ id: line.id, role: line.role, text: bakeText });
      continue;
    }
    const voice = getGeminiVoiceForRole(line.role);
    const preamble =
      !hasSpeakAs(line.id) && bakeText.length >= MIN_PREAMBLE_LINE_CHARS
        ? preambleByRole[line.role] ?? ""
        : "";
    if (isLineCached(bakeText, line.style, voice, preamble)) {
      preCached++;
    } else {
      preToRender++;
    }
  }
  const preCachedPct = total > 0 ? Math.round((preCached / total) * 100) : 0;
  console.error(
    `  Cache status: ${preCached}/${total} already cached (${preCachedPct}%), ${preToRender} to render fresh, ${preShortLineGoogle.length} short-line → Google TTS`,
  );
  if (preShortLineGoogle.length > 0) {
    console.error(
      `  Short-line route (D-09, <${MIN_BAKE_LINE_CHARS} chars, Google Cloud TTS): ${preShortLineGoogle.length} line(s)`,
    );
    for (const s of preShortLineGoogle.slice(0, 5)) {
      console.error(
        `    id=${s.id} ${s.role}: "${s.text}" (${s.text.length} chars)`,
      );
    }
    if (preShortLineGoogle.length > 5) {
      console.error(`    … and ${preShortLineGoogle.length - 5} more`);
    }
  }
  if (preCached > 0 && preToRender === 0 && preShortLineGoogle.length === 0) {
    console.error(
      `  Fully cached — this bake will re-emit the same audio with zero API calls.`,
    );
  }
  console.error("");

  const startTime = Date.now();
  let rendered = 0;
  let cacheHits = 0;
  // Lines that text-token-regressed across every retry and every model
  // in the chain. Not a bake-killing error — these stay un-embedded in
  // the .mram, and the runtime TTS path handles them at rehearsal time.
  const regressedLines: { id: number; role: string; text: string }[] = [];
  let totalBytes = 0;
  // Tally of which models actually served each line. Populated only on
  // `rendered` events (cache hits don't report a model since the cached
  // file has no provenance). Prints at the end as a quality breakdown.
  const modelTally: Record<string, number> = {};
  // Set once the user has made a go/no-go call on fallback, so we don't
  // prompt (or log the warning banner) repeatedly for every subsequent
  // fallback line. A single decision covers the rest of the run.
  let fallbackResolved = false;

  // AUTHOR-04 D-09: short lines (<MIN_BAKE_LINE_CHARS) were hard-skipped
  // pre-Phase-3; now they route to Google Cloud TTS at bake time. Track
  // which lineIds are short-routed so the main loop branches at the top
  // of each iteration.
  const shortLineIds = new Set(preShortLineGoogle.map((s) => s.id));
  let shortLineRendered = 0;
  let shortLineBytes = 0;

  // AUTHOR-06 D-10: per-ritual rolling median sec-per-char + >3×/<0.3×
  // anomaly check. Fed by both Gemini and Google short-line paths; first
  // 30 samples skip the check (Pitfall 6).
  const anomalyState = newAnomalyState();

  // AUTHOR-07 D-11: per-line verify-audio entries (only populated when
  // --verify-audio is set). Printed as a roll-up at the end of the bake.
  const verifyEntries: VerifyAudioEntry[] = [];

  // AUTHOR-02 D-06: line-level resume state. When resumeStatePath +
  // ritualSlug are both set (typically the bake-all.ts orchestrator),
  // the bake writes _RESUME.json atomically before AND after every
  // rendered line. When unset, markLineInFlight / markLineCompleted
  // short-circuit — pre-D-06 behavior.
  const resumeActive = Boolean(resumeStatePath && ritualSlug);
  let resumeState: ResumeState | null = null;
  if (resumeActive && resumeStatePath && ritualSlug) {
    const existing = readResumeState(resumeStatePath);
    if (existing && existing.ritual === ritualSlug) {
      resumeState = existing;
    } else {
      // No state, or state was for a different ritual → fresh start for
      // THIS ritual. Plan 07's orchestrator is responsible for any
      // cross-ritual mismatch refusal BEFORE spawning this process.
      resumeState = {
        ritual: ritualSlug,
        completedLineIds: [],
        inFlightLineIds: [],
        startedAt: Date.now(),
      };
      writeResumeStateAtomic(resumeStatePath, resumeState);
    }
  }
  const markLineInFlight = (lineId: string): void => {
    if (!resumeState || !resumeStatePath) return;
    if (!resumeState.inFlightLineIds.includes(lineId)) {
      resumeState.inFlightLineIds.push(lineId);
      writeResumeStateAtomic(resumeStatePath, resumeState);
    }
  };
  const markLineCompleted = (lineId: string): void => {
    if (!resumeState || !resumeStatePath) return;
    resumeState.inFlightLineIds = resumeState.inFlightLineIds.filter(
      (id) => id !== lineId,
    );
    if (!resumeState.completedLineIds.includes(lineId)) {
      resumeState.completedLineIds.push(lineId);
    }
    writeResumeStateAtomic(resumeStatePath, resumeState);
  };

  for (const line of spokenLines) {
    const voice = getGeminiVoiceForRole(line.role);
    const cleanText = bakeTextFor(line);
    const lineIdStr = String(line.id);
    let statusLabel = "";
    let thisLineModel: string | undefined;
    // Cache key for this line's render, captured from the onProgress
    // event. Needed on the abort path: renderLineAudio has already
    // written the fallback-tier bytes to disk by the time we detect
    // the tier drop, so aborting without deleting this entry would
    // leave a single degraded line cached that silently hits on re-run.
    let thisLineCacheKey: string | undefined;

    // AUTHOR-02 D-06: skip lines already completed in a prior run
    // (orchestrator passes --skip-line-ids=<completedLineIds>). No
    // render, no embed, no anomaly mutation, no state write — the
    // prior run's bytes are still in the cache and the orchestrator
    // is the source of truth for completedLineIds.
    if (skipLineIds.has(lineIdStr)) {
      continue;
    }

    // AUTHOR-04 D-09: short-line Google TTS branch. Short lines (< MIN_BAKE_LINE_CHARS)
    // call Google Cloud TTS REST directly and embed the OGG_OPUS bytes the
    // same way as the Gemini path. NO preamble, NO style directive, NO voice-
    // cast scene in the call body (Pitfall 4 — voice-cast scene leak).
    if (shortLineIds.has(line.id)) {
      // AUTHOR-02 D-06: mark in-flight BEFORE the render. If the process
      // crashes mid-render, the orchestrator sees lineId in
      // inFlightLineIds (not completedLineIds) and retries this line.
      markLineInFlight(lineIdStr);
      try {
        const googleVoice = getGoogleVoiceForRole(line.role);
        const { opusBytes, durationMs } = await googleTtsBakeCall(
          cleanText,
          googleVoice.name,
        );
        // AUTHOR-06 D-10: feed the short-line duration into the same
        // per-ritual rolling median as Gemini lines. Short lines will
        // likely be in the first 30 samples (Pitfall 6 → skip), but they
        // still help build the median for subsequent Gemini lines.
        addAndCheckAnomaly(anomalyState, line.id, durationMs, cleanText.length);
        // AUTHOR-07 D-11: optional STT round-trip (warn-only, same
        // contract as Gemini path).
        if (verifyAudio) {
          try {
            const { transcript, wordDiffCount } = await verifyAudioRoundTrip(
              opusBytes,
              cleanText,
            );
            verifyEntries.push({
              lineId: line.id,
              role: line.role,
              expected: cleanText,
              transcript,
              wordDiffCount,
            });
          } catch (err) {
            console.error(
              `\n[AUTHOR-07] verify-audio failed on line ${line.id}: ${(err as Error).message}`,
            );
          }
        }
        // Embed: same mechanism as Gemini path (line.audio = base64 Opus).
        line.audio = opusBytes.toString("base64");
        shortLineRendered++;
        shortLineBytes += opusBytes.length;
        totalBytes += opusBytes.length;
        // AUTHOR-02 D-06: move lineId from inFlightLineIds to
        // completedLineIds; atomic write so a crash after this line
        // leaves a consistent resume target.
        markLineCompleted(lineIdStr);
        const done = spokenLines.indexOf(line) + 1;
        const pct = Math.floor((done / total) * 100);
        process.stderr.write(
          `\r  [${done.toString().padStart(3)}/${total}] ${pct.toString().padStart(3)}% ` +
            `${line.role.padEnd(10)} (${"google-short".padEnd(30)}) ` +
            `${opusBytes.length.toString().padStart(6)}B         `,
        );
      } catch (err) {
        console.error(
          `\n[AUTHOR-04] short-line bake failed for line ${line.id} (${line.role}): ${(err as Error).message}`,
        );
        // Short-line failure: bake CAN continue — this line stays un-embedded,
        // runtime TTS handles at rehearsal. Flag for summary so it's visible.
        // NOTE: don't call markLineCompleted — lineId stays in
        // inFlightLineIds so the orchestrator retries it next time.
        regressedLines.push({ id: line.id, role: line.role, text: cleanText });
      }
      continue;
    }

    // Skip the preamble for utterances too short to carry character
    // direction — the preamble:content ratio confuses Gemini's
    // classifier and causes empty-audio-stream regressions.
    // Also skip when speakAs is set: the instructional prompt is already
    // explicit, and layering the role preamble on top tends to make
    // Gemini speak the preamble instead of following the instruction.
    const preamble =
      !hasSpeakAs(line.id) && cleanText.length >= MIN_PREAMBLE_LINE_CHARS
        ? preambleByRole[line.role] ?? ""
        : "";

    // AUTHOR-02 D-06: mark in-flight BEFORE the render. A crash during
    // renderLineAudio leaves lineId in inFlightLineIds (not
    // completedLineIds); the orchestrator re-dispatches it on resume.
    markLineInFlight(lineIdStr);

    try {
      const opus = await renderLineAudio(
        cleanText,
        line.style,
        voice,
        {
        apiKeys,
        ...(modelsForWaitMode ? { models: modelsForWaitMode } : {}),
        onProgress: (event) => {
          if (event.status === "cache-hit") {
            cacheHits++;
            statusLabel = "cache";
          } else if (event.status === "rendered") {
            rendered++;
            statusLabel = event.model ?? "rendered";
            totalBytes += event.bytesOut ?? 0;
            thisLineModel = event.model;
            thisLineCacheKey = event.cacheKey;
            const key = event.model ?? "unknown";
            modelTally[key] = (modelTally[key] ?? 0) + 1;
          } else if (event.status === "waiting-for-quota-reset") {
            const waitHrs = event.waitUntil
              ? Math.ceil((event.waitUntil.getTime() - Date.now()) / 3_600_000)
              : 0;
            // Clear the progress line before printing the multi-line
            // banner so it doesn't get visually glued to the progress bar.
            process.stderr.write("\r" + " ".repeat(80) + "\r");
            console.error(
              `\n⏸  All Gemini models quota-exhausted. Sleeping ~${waitHrs}h until midnight PT.`,
            );
            console.error(
              `   Cache is preserved. You can Ctrl-C and restart later instead of waiting.\n`,
            );
          }
        },
      },
        preamble,
      );

      line.audio = opus.toString("base64");

      // AUTHOR-06 D-10: duration-anomaly check on the rendered Opus.
      // parseBuffer decodes the Ogg container header for the duration
      // without transcoding. First 30 samples per ritual skip the check
      // (Pitfall 6 — median unstable below that threshold).
      const geminiMeta = await parseBuffer(opus, { mimeType: "audio/ogg" });
      const geminiDurationMs = Math.round(
        (geminiMeta.format.duration ?? 0) * 1000,
      );
      addAndCheckAnomaly(
        anomalyState,
        line.id,
        geminiDurationMs,
        cleanText.length,
      );

      // AUTHOR-07 D-11: optional STT round-trip. Warn-only: errors and
      // mismatches never hard-fail the bake; roll-up printed at the end.
      if (verifyAudio) {
        try {
          const { transcript, wordDiffCount } = await verifyAudioRoundTrip(
            opus,
            cleanText,
          );
          verifyEntries.push({
            lineId: line.id,
            role: line.role,
            expected: cleanText,
            transcript,
            wordDiffCount,
          });
        } catch (err) {
          console.error(
            `\n[AUTHOR-07] verify-audio failed on line ${line.id}: ${(err as Error).message}`,
          );
        }
      }

      // AUTHOR-02 D-06: line fully rendered + embedded + verified — move
      // lineId from inFlightLineIds to completedLineIds. Atomic write so
      // a crash after this point leaves a recoverable resume target.
      markLineCompleted(lineIdStr);

      // Quality-drop detection: this line was served by something other
      // than the preferred model. If we haven't already resolved the
      // fallback decision for this run, do it now (log warning + maybe
      // prompt). After resolution, subsequent fallback lines are silent
      // — they still tally but don't interrupt the progress bar.
      if (
        thisLineModel &&
        thisLineModel !== preferredModel &&
        !fallbackResolved
      ) {
        // Clear the in-progress line so the banner reads cleanly.
        process.stderr.write("\r" + " ".repeat(80) + "\r");
        console.error("");
        console.error(
          `⚠  Quality-tier drop detected at line ${line.id} (${line.role}).`,
        );
        console.error(`   Preferred: ${preferredModel}`);
        console.error(`   Served by: ${thisLineModel}`);
        console.error(
          `   The preferred model's daily quota is exhausted. Remaining lines`,
        );
        console.error(
          `   will continue on fallback tiers until you abort + retry after`,
        );
        console.error(`   midnight PT for a uniform premium bake.`);
        console.error("");

        // Shared abort handler. Renders at the fallback tier have
        // already been written to the cache by renderLineAudio — if we
        // exit without deleting THIS line's entry, a re-run after quota
        // reset will cache-hit the degraded bytes and never re-render
        // on the preferred model. Delete it so the re-run produces a
        // uniform premium bake.
        const handleAbort = (reason: string) => {
          const renderedOnPremium = modelTally[preferredModel] ?? 0;
          // Cache hits may be either premium-tier entries from prior
          // runs OR any tier (the cache key doesn't record provenance).
          // We count them separately so the user sees the total
          // preserved work, not just what rendered fresh this run.
          const preservedTotal = renderedOnPremium + cacheHits;
          const deleted = thisLineCacheKey
            ? deleteCacheEntry(thisLineCacheKey)
            : false;
          console.error(reason);
          if (deleted) {
            console.error(
              `   Removed the just-rendered fallback-tier cache entry for line ${line.id}.`,
            );
          }
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
            `   (The fallback-tier cache entry for line ${line.id} is kept — re-runs`,
          );
          console.error(
            `   will cache-hit it. Delete ~/.cache/masonic-mram-audio/ to force full`,
          );
          console.error(`   re-render later.)`);
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

      const done = spokenLines.indexOf(line) + 1;
      const pct = Math.floor((done / total) * 100);
      const elapsed = (Date.now() - startTime) / 1000;
      const eta = elapsed > 0 && done > 0 ? Math.ceil((elapsed / done) * (total - done)) : 0;
      process.stderr.write(
        `\r  [${done.toString().padStart(3)}/${total}] ${pct.toString().padStart(3)}% ` +
          `${line.role.padEnd(10)} (${statusLabel.padEnd(30)}) ` +
          `ETA ${etaFormat(eta)}       `,
      );
    } catch (err) {
      // Text-token regression on a too-short line — don't bail the
      // whole bake, just leave this line without embedded audio. The
      // runtime TTS path will handle it per-rehearsal (which is what
      // used to happen for EVERY line before bake-in existed). We
      // track these so the final summary shows them, and the user can
      // decide whether to edit the source line or accept the small
      // runtime API cost.
      if (err instanceof PersistentTextTokenRegression) {
        process.stderr.write("\r" + " ".repeat(80) + "\r");
        console.error(
          `\n  ⚠  Line ${line.id} (${line.role}) "${cleanText.slice(0, 50)}${cleanText.length > 50 ? "…" : ""}"`,
        );
        console.error(
          `     Gemini returned text tokens instead of audio across all retries.`,
        );
        console.error(
          `     This line is too short for reliable generation (${cleanText.length} chars).`,
        );
        console.error(
          `     Skipping bake for this line — runtime TTS will handle it at rehearsal.\n`,
        );
        regressedLines.push({ id: line.id, role: line.role, text: cleanText });
        continue; // next line, don't set line.audio, don't re-throw
      }
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
    console.error(`    Per-model breakdown:`);
    const sorted = Object.entries(modelTally).sort((a, b) => b[1] - a[1]);
    for (const [model, count] of sorted) {
      const tier = model === preferredModel ? "(preferred)" : "(fallback)";
      console.error(
        `      ${model.padEnd(35)} ${count.toString().padStart(3)} lines  ${tier}`,
      );
    }
  }
  console.error(`  Cache hits:        ${cacheHits}`);
  if (shortLineRendered > 0) {
    console.error(
      `  Google TTS short-line (D-09):  ${shortLineRendered} line(s), ${(shortLineBytes / 1024).toFixed(1)} KB`,
    );
  }
  if (regressedLines.length > 0) {
    console.error(
      `  Skipped (text-token regression, will hit runtime TTS): ${regressedLines.length} line(s)`,
    );
    for (const r of regressedLines.slice(0, 10)) {
      console.error(
        `    id=${r.id} ${r.role}: "${r.text.slice(0, 40)}${r.text.length > 40 ? "…" : ""}" (${r.text.length} chars)`,
      );
    }
    if (regressedLines.length > 10) {
      console.error(`    … and ${regressedLines.length - 10} more`);
    }
  }
  console.error(
    `  Bytes added (pre-encrypt):  ${(totalBytes / 1024 / 1024).toFixed(2)} MB Opus`,
  );
  console.error(`  Voice cast: ${Object.entries(doc.metadata.voiceCast)
    .map(([role, voice]) => `${role}=${voice}`)
    .join(", ")}`);
  console.error("");

  // AUTHOR-07 D-11: --verify-audio roll-up. Warn-only — prints even when
  // every line matches, so Shannon sees the flag's doing its job; flags
  // the worst 3 diffs when any exceed the threshold (N=2 by default).
  if (verifyAudio && verifyEntries.length > 0) {
    const flagged = verifyEntries.filter(
      (e) => e.wordDiffCount > VERIFY_AUDIO_DIFF_THRESHOLD,
    );
    console.error(`[AUTHOR-07] --verify-audio summary:`);
    console.error(`  Lines checked: ${verifyEntries.length}`);
    console.error(
      `  Lines with word-diff > ${VERIFY_AUDIO_DIFF_THRESHOLD}: ${flagged.length}`,
    );
    if (flagged.length > 0) {
      const worst = [...flagged]
        .sort((a, b) => b.wordDiffCount - a.wordDiffCount)
        .slice(0, 3);
      console.error(`  Worst 3 (warn-only; bake still proceeded):`);
      for (const e of worst) {
        console.error(
          `    line ${e.lineId} (${e.role}) diff=${e.wordDiffCount}`,
        );
        console.error(
          `      expected: "${e.expected.slice(0, 80)}${e.expected.length > 80 ? "…" : ""}"`,
        );
        console.error(
          `      got:      "${e.transcript.slice(0, 80)}${e.transcript.length > 80 ? "…" : ""}"`,
        );
      }
    }
    console.error("");
  }
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
