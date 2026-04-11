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
 *     <plain.md> <cipher.md> <output.mram>
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

// ============================================================
// Encryption (Node crypto — binary layout matches Web Crypto
// decryptMRAM in src/lib/mram-format.ts)
// ============================================================

const MAGIC = Buffer.from("MRAM", "ascii");
const FORMAT_VERSION = 1;
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
  const args = process.argv.slice(2);

  if (args.length < 3 || args.length > 3) {
    console.error(
      "Usage: npx tsx scripts/build-mram-from-dialogue.ts " +
        "<plain.md> <cipher.md> <output.mram>",
    );
    console.error(
      "Passphrase is read interactively (no echo) or from MRAM_PASSPHRASE env var.",
    );
    process.exit(1);
  }

  const [plainPath, cipherPath, outputPath] = args;

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

  console.error("Pairing and building MRAMDocument...");
  const doc = buildFromDialogue(plain, cipher, {
    jurisdiction: "Grand Lodge of Iowa",
    degree: "Entered Apprentice",
    ceremony: "Opening on the First Degree",
  });

  console.error(`  Sections: ${doc.sections.length}`);
  console.error(`  Lines:    ${doc.lines.length}`);
  console.error(`  Roles:    ${Object.keys(doc.roles).join(", ")}`);

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

// Only run CLI when executed directly, not when imported
if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
