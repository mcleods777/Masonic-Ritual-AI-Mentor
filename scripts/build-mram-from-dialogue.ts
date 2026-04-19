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
 *     <plain.md> <cipher.md> <output.mram> [--with-audio]
 *
 * With --with-audio: render every spoken line to Opus via Gemini TTS
 * using the canonical GEMINI_ROLE_VOICES cast, embed the audio bytes
 * inside the encrypted .mram payload. On-device playback skips the API
 * entirely. Requires ffmpeg in PATH and GOOGLE_GEMINI_API_KEY env var.
 *
 * The passphrase is read interactively with echo disabled. It is NEVER
 * accepted on the command line (that would leak it to shell history and
 * `ps -ef` output).
 */

import * as fs from "node:fs";
import * as crypto from "node:crypto";
import { parseDialogue } from "../src/lib/dialogue-format";
import { buildFromDialogue } from "../src/lib/dialogue-to-mram";
import type { MRAMDocument } from "../src/lib/mram-format";
import { GEMINI_ROLE_VOICES, getGeminiVoiceForRole } from "../src/lib/tts-cloud";
import { renderLineAudio } from "./render-gemini-audio";

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

async function main() {
  const rawArgs = process.argv.slice(2);
  const withAudio = rawArgs.includes("--with-audio");
  const positional = rawArgs.filter((a) => !a.startsWith("--"));

  if (positional.length !== 3) {
    console.error(
      "Usage: npx tsx scripts/build-mram-from-dialogue.ts " +
        "<plain.md> <cipher.md> <output.mram> [--with-audio]",
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
    process.exit(1);
  }

  const [plainPath, cipherPath, outputPath] = positional;

  if (withAudio && !process.env.GOOGLE_GEMINI_API_KEY) {
    console.error("Error: --with-audio requires GOOGLE_GEMINI_API_KEY env var.");
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
    await bakeAudioIntoDoc(doc);
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
async function bakeAudioIntoDoc(doc: MRAMDocument): Promise<void> {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY!;

  // Snapshot the canonical voice cast so playback knows exactly which
  // voices were used at bake time. If the app's GEMINI_ROLE_VOICES map
  // changes later (voice swap, new model), the audio stays tied to the
  // voices it was rendered with — client falls through to network path
  // only for roles where the voice doesn't match anymore.
  doc.metadata.voiceCast = { ...GEMINI_ROLE_VOICES };
  doc.metadata.audioFormat = "opus-32k-mono";

  const spokenLines = doc.lines.filter((l) => l.role && l.plain.trim().length > 0);
  const total = spokenLines.length;

  console.error(`\nBaking audio for ${total} spoken lines...`);
  console.error(`  Cache: ~/.cache/masonic-mram-audio/ (safe to interrupt + resume)`);
  console.error(`  Fallback chain: 3.1-flash → 2.5-flash → 2.5-pro`);
  console.error(`  On all-models-429: sleep until midnight PT, auto-resume\n`);

  const startTime = Date.now();
  let rendered = 0;
  let cacheHits = 0;
  let totalBytes = 0;

  for (const line of spokenLines) {
    const voice = getGeminiVoiceForRole(line.role);
    const cleanText = line.plain.trim();
    let statusLabel = "";

    try {
      const opus = await renderLineAudio(cleanText, line.style, voice, {
        apiKey,
        onProgress: (event) => {
          if (event.status === "cache-hit") {
            cacheHits++;
            statusLabel = "cache";
          } else if (event.status === "rendered") {
            rendered++;
            statusLabel = event.model ?? "rendered";
            totalBytes += event.bytesOut ?? 0;
          } else if (event.status === "waiting-for-quota-reset") {
            const waitHrs = event.waitUntil
              ? Math.ceil((event.waitUntil.getTime() - Date.now()) / 3_600_000)
              : 0;
            console.error(
              `\n⏸  All Gemini models quota-exhausted. Sleeping ~${waitHrs}h until midnight PT.`,
            );
            console.error(
              `   Cache is preserved. You can Ctrl-C and restart later instead of waiting.\n`,
            );
          }
        },
      });

      line.audio = opus.toString("base64");

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
  console.error(`  Cache hits:        ${cacheHits}`);
  console.error(
    `  Bytes added (pre-encrypt):  ${(totalBytes / 1024 / 1024).toFixed(2)} MB Opus`,
  );
  console.error(`  Voice cast: ${Object.entries(doc.metadata.voiceCast)
    .map(([role, voice]) => `${role}=${voice}`)
    .join(", ")}`);
  console.error("");
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
