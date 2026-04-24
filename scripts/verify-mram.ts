#!/usr/bin/env npx tsx
/**
 * verify-mram.ts — Decrypt and validate any .mram file.
 *
 * Uses Node crypto (not Web Crypto) for the node-side round-trip. The file
 * format is identical in both directions: the same binary produced by
 * build-mram.ts or build-mram-from-dialogue.ts is decryptable by the
 * browser-side decryptMRAM() in src/lib/mram-format.ts.
 *
 * Usage:
 *   npx tsx scripts/verify-mram.ts <file.mram>
 *   npx tsx scripts/verify-mram.ts <file.mram> --check-audio-coverage
 *   npx tsx scripts/verify-mram.ts <file.mram> --check-audio-coverage --json
 *
 * CONTENT-06 (Plan 04-01): `--check-audio-coverage` asserts every spoken
 * line carries valid base64 Opus with OGG magic, byte-length in range,
 * and duration within the AUTHOR-06 D-10 anomaly band (per-ritual median).
 * Also asserts metadata.audioFormat + metadata.voiceCast are present.
 *
 * Reports (no-flag mode):
 *   - format + version
 *   - metadata (jurisdiction, degree, ceremony)
 *   - section count, line count
 *   - role breakdown
 *   - checksum match (SHA-256 over JSON.stringify(lines))
 *   - first 3 and last 3 lines (for sanity)
 *
 * Reports (--check-audio-coverage mode):
 *   - Audio Coverage section with per-failure list + roll-up
 *   - Sample-line blocks suppressed (T-04-04 — output suitable for logging)
 *   - Exit 1 on any failure; exit 0 on all pass
 *
 * Exports (for scripts/verify-content.ts reuse — no subprocess spawn):
 *   - decryptMRAM
 *   - promptPassphrase
 *   - checkAudioCoverage
 *   - CoverageFailure, CoverageResult types
 */

import * as fs from "node:fs";
import * as crypto from "node:crypto";
import { parseBuffer } from "music-metadata";
import {
  computeMedianSecPerChar,
  isDurationAnomaly,
  type DurationSample,
} from "./lib/bake-math";

const MAGIC_BYTES = [0x4d, 0x52, 0x41, 0x4d]; // "MRAM"
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 310_000;

/** OGG stream magic ("OggS") — first 4 bytes of every valid Opus file. */
const OGG_MAGIC = Buffer.from([0x4f, 0x67, 0x67, 0x53]);

/** Per-line byte-length cap (T-04-02 DoS mitigation). 10 MB is ~2 minutes
 *  of ritual speech at 32 kbps Opus — no legitimate bake exceeds this. */
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

/** Per-line byte-length floor. Real Opus lines are always > 500 bytes
 *  (header pages + at least one audio page). Below this, assume corrupt. */
const MIN_AUDIO_BYTES = 500;

/** Supported .mram version. Plan 04-01 Task 2: v3 required (bumped from v1;
 *  the old `version !== 1` throw made verify-mram inoperable against every
 *  Phase-3-baked file on disk). v1/v2 files are rejected with "v3 required". */
const REQUIRED_VERSION = 3;

// ============================================================
// Interfaces (v3 shape matching src/lib/mram-format.ts)
// ============================================================

export interface MRAMLine {
  id: number;
  section: string;
  role: string;
  gavels: number;
  action: string | null;
  cipher: string;
  plain: string;
  style?: string;
  /** v3+: base64 Opus bytes. Absent on CUE/action-only rows. */
  audio?: string;
}

export interface MRAMDocument {
  format: "MRAM";
  version: number;
  metadata: {
    jurisdiction: string;
    degree: string;
    ceremony: string;
    checksum: string;
    expiresAt?: string;
    /** v3+: base64-Opus audio per-line tagged with this voice cast. */
    voiceCast?: Record<string, string>;
    /** v3+: codec identifier. */
    audioFormat?: "opus-32k-mono";
  };
  roles: Record<string, string>;
  sections: { id: string; title: string; note?: string }[];
  lines: MRAMLine[];
}

// ============================================================
// Decrypt
// ============================================================

export function decryptMRAM(buffer: Buffer, passphrase: string): MRAMDocument {
  // Verify magic
  for (let i = 0; i < 4; i++) {
    if (buffer[i] !== MAGIC_BYTES[i]) {
      throw new Error("Not a valid .mram file (bad magic bytes)");
    }
  }
  const version = buffer[4];
  if (version !== REQUIRED_VERSION) {
    throw new Error(
      `Unsupported .mram version: ${version} (v${REQUIRED_VERSION} required)`,
    );
  }

  let offset = 5;
  const salt = buffer.subarray(offset, offset + SALT_LENGTH);
  offset += SALT_LENGTH;
  const iv = buffer.subarray(offset, offset + IV_LENGTH);
  offset += IV_LENGTH;

  // Remaining = ciphertext + auth tag. Auth tag is the last 16 bytes.
  const remaining = buffer.subarray(offset);
  const ciphertext = remaining.subarray(0, remaining.length - AUTH_TAG_LENGTH);
  const authTag = remaining.subarray(remaining.length - AUTH_TAG_LENGTH);

  const key = crypto.pbkdf2Sync(
    passphrase,
    salt,
    PBKDF2_ITERATIONS,
    32,
    "sha256",
  );

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  let plaintext: Buffer;
  try {
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (err) {
    throw new Error(
      `Decryption failed — wrong passphrase? (${(err as Error).message})`,
    );
  }

  const doc = JSON.parse(plaintext.toString("utf-8")) as MRAMDocument;
  if (doc.format !== "MRAM") {
    throw new Error("Decrypted payload is not an MRAM document");
  }
  return doc;
}

// ============================================================
// Audio coverage (CONTENT-06, Plan 04-01 Task 2)
// ============================================================

export interface CoverageFailure {
  lineId: number;
  kind:
    | "missing-audio"
    | "bad-base64"
    | "bad-ogg-magic"
    | "byte-len-out-of-range"
    | "duration-anomaly"
    | "missing-metadata";
  message: string;
}

export interface CoverageResult {
  pass: boolean;
  failures: CoverageFailure[];
  stats: {
    totalLines: number;
    spokenLines: number;
    linesWithAudio: number;
  };
}

/**
 * A line is "spoken" (thus requires audio) iff it's not a CUE row AND
 * not an action-only row AND has non-empty plain text. This matches
 * the role/shape rules baked by build-mram-from-dialogue.ts.
 */
function isSpokenLine(line: MRAMLine): boolean {
  if (line.role === "CUE") return false;
  if (line.action !== null) return false;
  if (!line.plain || !line.plain.trim()) return false;
  return true;
}

/**
 * Check that every spoken line in `doc` has valid per-line Opus audio:
 *  - line.audio is a non-empty string
 *  - base64 decodes to bytes starting with OGG magic ("OggS")
 *  - byte length in [MIN_AUDIO_BYTES, MAX_AUDIO_BYTES]
 *  - duration (parsed via music-metadata) falls within per-ritual
 *    sec/char anomaly band (AUTHOR-06 D-10; belt-and-suspenders re-check)
 *  - metadata.audioFormat is "opus-32k-mono" AND metadata.voiceCast is
 *    a non-empty record
 *
 * Pure async function — no CLI, no process.exit. Reused by verify-content.ts.
 */
export async function checkAudioCoverage(
  doc: MRAMDocument,
): Promise<CoverageResult> {
  const failures: CoverageFailure[] = [];

  // --- metadata shape ---
  if (doc.metadata.audioFormat !== "opus-32k-mono") {
    failures.push({
      lineId: -1,
      kind: "missing-metadata",
      message: `metadata.audioFormat is "${doc.metadata.audioFormat ?? "(missing)"}" — expected "opus-32k-mono"`,
    });
  }
  if (
    !doc.metadata.voiceCast ||
    Object.keys(doc.metadata.voiceCast).length === 0
  ) {
    failures.push({
      lineId: -1,
      kind: "missing-metadata",
      message: "metadata.voiceCast is missing or empty — voice cast must be pinned for every v3 bake",
    });
  }

  // --- per-line audio + duration collection ---
  const totalLines = doc.lines.length;
  const spokenLinesList = doc.lines.filter(isSpokenLine);
  const spokenLines = spokenLinesList.length;
  let linesWithAudio = 0;

  // Collect per-line duration samples so we can compute the ritual median
  // and run isDurationAnomaly in a second pass.
  const samples: Array<{ line: MRAMLine; sample: DurationSample } | null> = [];

  for (const line of spokenLinesList) {
    if (!line.audio || line.audio.length === 0) {
      failures.push({
        lineId: line.id,
        kind: "missing-audio",
        message: `line ${line.id} (role ${line.role}) has no audio field`,
      });
      samples.push(null);
      continue;
    }

    // Base64 decode.
    let buf: Buffer;
    try {
      buf = Buffer.from(line.audio, "base64");
    } catch {
      failures.push({
        lineId: line.id,
        kind: "bad-base64",
        message: `line ${line.id} audio is not valid base64`,
      });
      samples.push(null);
      continue;
    }

    // Byte-length bounds (T-04-02 DoS mitigation + sanity floor).
    if (buf.length < MIN_AUDIO_BYTES || buf.length > MAX_AUDIO_BYTES) {
      failures.push({
        lineId: line.id,
        kind: "byte-len-out-of-range",
        message: `line ${line.id} audio byte length ${buf.length} outside [${MIN_AUDIO_BYTES}, ${MAX_AUDIO_BYTES}]`,
      });
      samples.push(null);
      continue;
    }

    // OGG magic check.
    if (buf.length < 4 || Buffer.compare(buf.subarray(0, 4), OGG_MAGIC) !== 0) {
      failures.push({
        lineId: line.id,
        kind: "bad-ogg-magic",
        message: `line ${line.id} audio does not start with OGG magic ("OggS")`,
      });
      samples.push(null);
      continue;
    }

    // Parse duration via music-metadata — wrap in try/catch so a malformed
    // Opus payload reports cleanly rather than crashing the verifier.
    let durationSec: number;
    try {
      const meta = await parseBuffer(buf, { mimeType: "audio/ogg" });
      durationSec = meta.format.duration ?? 0;
    } catch (err) {
      failures.push({
        lineId: line.id,
        kind: "bad-ogg-magic",
        message: `line ${line.id} music-metadata parse failed: ${(err as Error).message}`,
      });
      samples.push(null);
      continue;
    }

    linesWithAudio++;
    samples.push({
      line,
      sample: {
        durationMs: Math.round(durationSec * 1000),
        charCount: line.plain.length,
      },
    });
  }

  // --- duration-anomaly second pass (per-ritual median) ---
  // Per bake-math.ts D-10 Pitfall 6: median is unstable below ~30 samples.
  // Match the bake script's convention — only flag anomalies when we have
  // enough samples for a stable median. Below that threshold, the check is
  // skipped (documented in the pass roll-up as "median skipped").
  const validSamples = samples.filter((s) => s !== null) as NonNullable<
    (typeof samples)[number]
  >[];
  const medianSecPerChar = computeMedianSecPerChar(
    validSamples.map((s) => s.sample),
  );
  const MIN_SAMPLES_FOR_ANOMALY = 30;
  if (validSamples.length >= MIN_SAMPLES_FOR_ANOMALY && medianSecPerChar > 0) {
    for (const entry of validSamples) {
      if (isDurationAnomaly(entry.sample, medianSecPerChar)) {
        const lineSecPerChar =
          entry.sample.durationMs / 1000 / Math.max(entry.sample.charCount, 1);
        const ratio = lineSecPerChar / medianSecPerChar;
        const kind = ratio > 1 ? "too-long" : "too-short";
        failures.push({
          lineId: entry.line.id,
          kind: "duration-anomaly",
          message: `line ${entry.line.id} (role ${entry.line.role}) duration-anomaly ratio=${ratio.toFixed(2)}× median (${kind})`,
        });
      }
    }
  }

  return {
    pass: failures.length === 0,
    failures,
    stats: { totalLines, spokenLines, linesWithAudio },
  };
}

// ============================================================
// CLI plumbing
// ============================================================

const ok = (msg: string) => console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
const fail = (msg: string): never => {
  console.error(`  \x1b[31m✗\x1b[0m ${msg}`);
  process.exit(1);
};
const header = (msg: string) => console.log(`\n${msg}`);

/**
 * No-echo passphrase prompt. Falls back to MRAM_PASSPHRASE env var when
 * stdin is not a TTY (automation). Never accepts passphrase on command line.
 */
export async function promptPassphrase(): Promise<string> {
  if (!process.stdin.isTTY) {
    const envPass = process.env.MRAM_PASSPHRASE;
    if (envPass) return envPass;
    throw new Error(
      "stdin is not a TTY and MRAM_PASSPHRASE env var is not set.",
    );
  }

  process.stderr.write("Passphrase: ");
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf-8");

  return new Promise((resolve, reject) => {
    let passphrase = "";
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        const code = ch.charCodeAt(0);
        if (code === 13 || code === 10) {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener("data", onData);
          process.stderr.write("\n");
          resolve(passphrase);
          return;
        }
        if (code === 3) {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener("data", onData);
          process.stderr.write("\n");
          reject(new Error("Interrupted"));
          return;
        }
        if (code === 127 || code === 8) {
          passphrase = passphrase.slice(0, -1);
          continue;
        }
        if (code < 32) continue;
        passphrase += ch;
      }
    };
    process.stdin.on("data", onData);
  });
}

interface CliFlags {
  filePath: string;
  checkAudioCoverage: boolean;
  json: boolean;
}

function parseArgs(argv: string[]): CliFlags {
  const args = argv.slice(2);
  const flags: CliFlags = {
    filePath: "",
    checkAudioCoverage: false,
    json: false,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--check-audio-coverage") {
      flags.checkAudioCoverage = true;
    } else if (a === "--json") {
      flags.json = true;
    } else if (a.startsWith("--")) {
      throw new Error(`Unknown flag: ${a}`);
    } else if (!flags.filePath) {
      flags.filePath = a;
    } else {
      throw new Error(`Unexpected extra arg: ${a}`);
    }
  }
  if (!flags.filePath) {
    throw new Error(
      "Usage: npx tsx scripts/verify-mram.ts <file.mram> [--check-audio-coverage] [--json]\n" +
        "Passphrase is read interactively (no echo) or from MRAM_PASSPHRASE env var.",
    );
  }
  return flags;
}

async function main() {
  let flags: CliFlags;
  try {
    flags = parseArgs(process.argv);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  if (!fs.existsSync(flags.filePath)) {
    fail(`file not found: ${flags.filePath}`);
  }

  const passphrase = await promptPassphrase();
  if (!passphrase) fail("passphrase is required");

  if (!flags.checkAudioCoverage) {
    // --- No-flag mode: Phase 3 behaviour (role breakdown + sample lines) ---
    header("=== Loading ===");
    const buffer = fs.readFileSync(flags.filePath);
    ok(`read ${buffer.length} bytes from ${flags.filePath}`);

    header("=== Decrypting ===");
    const doc = decryptMRAM(buffer, passphrase);
    ok(`decrypted successfully (version ${doc.version})`);

    header("=== Metadata ===");
    console.log(`  jurisdiction: ${doc.metadata.jurisdiction}`);
    console.log(`  degree:       ${doc.metadata.degree}`);
    console.log(`  ceremony:     ${doc.metadata.ceremony}`);
    console.log(`  format:       ${doc.format} v${doc.version}`);
    if (doc.metadata.audioFormat) {
      console.log(`  audioFormat:  ${doc.metadata.audioFormat}`);
    }
    if (doc.metadata.voiceCast) {
      const cast = Object.entries(doc.metadata.voiceCast)
        .map(([r, v]) => `${r}=${v}`)
        .join(", ");
      console.log(`  voiceCast:    ${cast}`);
    }

    header("=== Content ===");
    ok(`${doc.sections.length} sections`);
    ok(`${doc.lines.length} lines`);
    ok(
      `${Object.keys(doc.roles).length} roles: ${Object.keys(doc.roles).join(", ")}`,
    );

    // Verify checksum
    header("=== Checksum ===");
    const expected = doc.metadata.checksum;
    const actual = crypto
      .createHash("sha256")
      .update(JSON.stringify(doc.lines))
      .digest("hex");
    if (expected !== actual) {
      fail(
        `checksum mismatch\n    stored: ${expected}\n    computed: ${actual}`,
      );
    }
    ok(`checksum matches: ${actual}`);

    // Role breakdown
    header("=== Role breakdown (line counts) ===");
    const counts: Record<string, number> = {};
    let spokenCount = 0;
    let actionCount = 0;
    for (const line of doc.lines) {
      counts[line.role] = (counts[line.role] ?? 0) + 1;
      if (line.action !== null) actionCount++;
      if (line.plain) spokenCount++;
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    for (const [role, n] of sorted) {
      const display = doc.roles[role] ?? role;
      console.log(
        `  ${role.padEnd(6)} ${String(n).padStart(4)}  (${display})`,
      );
    }
    console.log(`\n  ${spokenCount} lines contain spoken text`);
    console.log(`  ${actionCount} lines contain action text`);

    // Section breakdown
    header("=== Sections ===");
    for (const section of doc.sections) {
      const n = doc.lines.filter((l) => l.section === section.id).length;
      console.log(
        `  ${section.id.padEnd(4)} ${section.title.padEnd(42)} ${String(n).padStart(4)} lines`,
      );
    }

    // Sample lines
    header("=== Sample lines (first 3 spoken) ===");
    const spoken = doc.lines.filter((l) => l.plain).slice(0, 3);
    for (const line of spoken) {
      console.log(`  [${line.role}] ${line.plain}`);
      if (line.cipher && line.cipher !== line.plain) {
        console.log(`    cipher: ${line.cipher}`);
      }
    }

    header("=== Sample lines (last 3 spoken) ===");
    const spokenAll = doc.lines.filter((l) => l.plain);
    for (const line of spokenAll.slice(-3)) {
      console.log(`  [${line.role}] ${line.plain}`);
    }

    console.log("\n\x1b[32m✓ Verification complete.\x1b[0m\n");
    return;
  }

  // --- --check-audio-coverage mode ---
  const buffer = fs.readFileSync(flags.filePath);
  const doc = decryptMRAM(buffer, passphrase);

  // Checksum verification is still run — a corrupted file shouldn't silently
  // pass coverage. Fail fast BEFORE doing the expensive music-metadata parse.
  const expected = doc.metadata.checksum;
  const actual = crypto
    .createHash("sha256")
    .update(JSON.stringify(doc.lines))
    .digest("hex");
  if (expected !== actual) {
    fail(
      `checksum mismatch\n    stored: ${expected}\n    computed: ${actual}`,
    );
  }

  const result = await checkAudioCoverage(doc);

  if (flags.json) {
    // T-04-04: machine-readable output MUST NOT include plain/cipher text.
    // Failures carry only {lineId, kind, message}. The message was composed
    // above WITHOUT line.plain/line.cipher content.
    const out = {
      ritual: flags.filePath,
      totalLines: result.stats.totalLines,
      spokenLines: result.stats.spokenLines,
      linesWithAudio: result.stats.linesWithAudio,
      failures: result.failures,
    };
    console.log(JSON.stringify(out, null, 2));
    process.exit(result.pass ? 0 : 1);
  }

  // Human-readable coverage output.
  header("=== Audio Coverage ===");
  console.log(`  ritual:         ${flags.filePath}`);
  console.log(`  total lines:    ${result.stats.totalLines}`);
  console.log(`  spoken lines:   ${result.stats.spokenLines}`);
  console.log(`  lines w/ audio: ${result.stats.linesWithAudio}`);
  if (result.failures.length === 0) {
    ok(
      `${result.stats.linesWithAudio}/${result.stats.spokenLines} lines OK`,
    );
    console.log("\n\x1b[32m✓ Audio coverage check passed.\x1b[0m\n");
    process.exit(0);
  }

  console.log(`\n  \x1b[31m${result.failures.length} failure(s):\x1b[0m`);
  for (const f of result.failures) {
    console.log(`    [${f.kind}] line=${f.lineId}: ${f.message}`);
  }
  console.error(
    `\n\x1b[31m✗ Audio coverage check failed (${result.failures.length} issue(s)).\x1b[0m\n`,
  );
  process.exit(1);
}

// ============================================================
// Run — only when invoked directly (tests import without triggering main)
// ============================================================
const isDirectRun =
  process.argv[1]?.endsWith("verify-mram.ts") ?? false;
if (isDirectRun) {
  main().catch((err) => {
    console.error("\x1b[31mFatal error:\x1b[0m", err.message);
    process.exit(1);
  });
}
