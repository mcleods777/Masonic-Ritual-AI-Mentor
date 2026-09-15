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
 *   npx tsx scripts/verify-mram.ts <file.mram> [passphrase]
 *
 * Reports:
 *   - format + version
 *   - metadata (jurisdiction, degree, ceremony)
 *   - section count, line count
 *   - role breakdown
 *   - checksum match (SHA-256 over JSON.stringify(lines))
 *   - first 3 and last 3 lines (for sanity)
 */

import * as fs from "node:fs";
import * as crypto from "node:crypto";

const MAGIC_BYTES = [0x4d, 0x52, 0x41, 0x4d]; // "MRAM"
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 310_000;

interface MRAMLine {
  id: number;
  section: string;
  role: string;
  gavels: number;
  action: string | null;
  cipher: string;
  plain: string;
}

interface MRAMDocument {
  format: "MRAM";
  version: number;
  metadata: {
    jurisdiction: string;
    degree: string;
    ceremony: string;
    checksum: string;
  };
  roles: Record<string, string>;
  sections: { id: string; title: string; note?: string }[];
  lines: MRAMLine[];
}

function decryptMRAM(buffer: Buffer, passphrase: string): MRAMDocument {
  // Verify magic
  for (let i = 0; i < 4; i++) {
    if (buffer[i] !== MAGIC_BYTES[i]) {
      throw new Error("Not a valid .mram file (bad magic bytes)");
    }
  }
  const version = buffer[4];
  if (version !== 1) {
    throw new Error(`Unsupported .mram version: ${version}`);
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

const ok = (msg: string) => console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
const warn = (msg: string) => console.log(`  \x1b[33m!\x1b[0m ${msg}`);
const fail = (msg: string): never => {
  console.error(`  \x1b[31m✗\x1b[0m ${msg}`);
  process.exit(1);
};
const header = (msg: string) => console.log(`\n${msg}`);

/**
 * No-echo passphrase prompt. Falls back to MRAM_PASSPHRASE env var when
 * stdin is not a TTY (automation). Never accepts passphrase on command line.
 */
async function promptPassphrase(): Promise<string> {
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

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    console.error("Usage: npx tsx scripts/verify-mram.ts <file.mram>");
    console.error(
      "Passphrase is read interactively (no echo) or from MRAM_PASSPHRASE env var.",
    );
    process.exit(1);
  }
  const filePath = args[0];

  if (!fs.existsSync(filePath)) {
    fail(`file not found: ${filePath}`);
  }

  const passphrase = await promptPassphrase();
  if (!passphrase) fail("passphrase is required");

  header("=== Loading ===");
  const buffer = fs.readFileSync(filePath);
  ok(`read ${buffer.length} bytes from ${filePath}`);

  header("=== Decrypting ===");
  const doc = decryptMRAM(buffer, passphrase);
  ok(`decrypted successfully (version ${doc.version})`);

  header("=== Metadata ===");
  console.log(`  jurisdiction: ${doc.metadata.jurisdiction}`);
  console.log(`  degree:       ${doc.metadata.degree}`);
  console.log(`  ceremony:     ${doc.metadata.ceremony}`);
  console.log(`  format:       ${doc.format} v${doc.version}`);

  header("=== Content ===");
  ok(`${doc.sections.length} sections`);
  ok(`${doc.lines.length} lines`);
  ok(`${Object.keys(doc.roles).length} roles: ${Object.keys(doc.roles).join(", ")}`);

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
    console.log(`  ${role.padEnd(6)} ${String(n).padStart(4)}  (${display})`);
  }
  console.log(`\n  ${spokenCount} lines contain spoken text`);
  console.log(`  ${actionCount} lines contain action text`);

  // Section breakdown
  header("=== Sections ===");
  for (const section of doc.sections) {
    const n = doc.lines.filter((l) => l.section === section.id).length;
    console.log(`  ${section.id.padEnd(4)} ${section.title.padEnd(42)} ${String(n).padStart(4)} lines`);
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
}

main().catch((err) => {
  console.error("\x1b[31mFatal error:\x1b[0m", err.message);
  process.exit(1);
});
