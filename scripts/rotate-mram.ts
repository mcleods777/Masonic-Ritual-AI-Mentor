#!/usr/bin/env npx tsx
/**
 * rotate-mram.ts — Re-encrypt a .mram file with a new passphrase (and/or new expiry).
 *
 * Use cases:
 *   1. A .mram file has expired and you want to issue a fresh one.
 *   2. The lodge passphrase has been changed and old files need to be reissued.
 *   3. You want to extend/shorten the expiry on an existing file.
 *
 * Rotation always generates a fresh salt + IV, so the new file is a distinct
 * ciphertext — even if the new passphrase equals the old one.
 *
 * Usage:
 *   npx tsx scripts/rotate-mram.ts <input.mram> <output.mram> \
 *       [--old-pass <pass>] [--new-pass <pass>] \
 *       [--expires <ISO-date> | --expires-in <duration> | --no-expires]
 *
 * Options:
 *   --old-pass <pass>       Current passphrase (prompted if omitted).
 *   --new-pass <pass>       New passphrase (prompted if omitted).
 *   --expires <ISO-date>    Set a new hard expiration timestamp.
 *   --expires-in <dur>      Set a new expiration relative to now: 90d, 72h, 45m.
 *   --no-expires            Remove the expiration field entirely.
 *   --keep-expires          Keep the existing expiresAt value verbatim.
 *
 * Expiry flag policy: exactly one of --expires / --expires-in / --no-expires /
 * --keep-expires may be passed. Default is --keep-expires.
 *
 * Expired input files ARE allowed — reissuing an expired file is the whole
 * point of rotation. The script prints a note when this happens.
 *
 * Example:
 *   npx tsx scripts/rotate-mram.ts rituals/ea-opening.mram out.mram \
 *       --old-pass old123 --new-pass new456 --expires-in 90d
 */

import * as fs from "fs";
import * as crypto from "crypto";
import * as readline from "readline";

// ============================================================
// Types (mirrors src/lib/mram-format.ts)
// ============================================================

interface MRAMDocument {
  format: "MRAM";
  version: number;
  metadata: {
    jurisdiction: string;
    degree: string;
    ceremony: string;
    checksum: string;
    expiresAt?: string;
  };
  roles: Record<string, string>;
  sections: { id: string; title: string; note?: string }[];
  lines: {
    id: number;
    section: string;
    role: string;
    gavels: number;
    action: string | null;
    cipher: string;
    plain: string;
  }[];
}

// ============================================================
// Binary format (must match build-mram.ts / mram-format.ts)
//
//   MAGIC(4="MRAM") | VERSION(1) | SALT(16) | IV(12) | CIPHERTEXT | AUTH_TAG(16)
// ============================================================

const MAGIC = Buffer.from("MRAM", "ascii");
const FORMAT_VERSION = 1;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 310_000;

function decryptMRAM(blob: Buffer, passphrase: string): MRAMDocument {
  const headerSize = MAGIC.length + 1 + SALT_LENGTH + IV_LENGTH;
  if (blob.length < headerSize + AUTH_TAG_LENGTH) {
    throw new Error("Invalid file: too small to be a valid .mram file.");
  }

  for (let i = 0; i < MAGIC.length; i++) {
    if (blob[i] !== MAGIC[i]) {
      throw new Error("Invalid file: not a recognized .mram ritual file.");
    }
  }

  const version = blob[MAGIC.length];
  if (version !== FORMAT_VERSION) {
    throw new Error(`Unsupported file version (${version}). This tool supports version ${FORMAT_VERSION}.`);
  }

  let offset = MAGIC.length + 1;
  const salt = blob.subarray(offset, offset + SALT_LENGTH);
  offset += SALT_LENGTH;
  const iv = blob.subarray(offset, offset + IV_LENGTH);
  offset += IV_LENGTH;

  // Ciphertext and auth tag are concatenated (browser side feeds them together
  // to Web Crypto). On Node we must split them back apart.
  const tailStart = blob.length - AUTH_TAG_LENGTH;
  const ciphertext = blob.subarray(offset, tailStart);
  const authTag = blob.subarray(tailStart);

  const key = crypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, 32, "sha256");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  let plainBytes: Buffer;
  try {
    plainBytes = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error("Decryption failed. The passphrase is incorrect or the file has been tampered with.");
  }

  const doc = JSON.parse(plainBytes.toString("utf-8")) as MRAMDocument;

  if (doc.format !== "MRAM") {
    throw new Error("Invalid document format. Expected MRAM format marker.");
  }
  if (!doc.metadata || !Array.isArray(doc.lines)) {
    throw new Error("Invalid document structure. Missing required fields.");
  }

  const expectedChecksum = crypto
    .createHash("sha256")
    .update(JSON.stringify(doc.lines))
    .digest("hex");
  if (doc.metadata.checksum !== expectedChecksum) {
    throw new Error("Checksum mismatch. The file contents may have been altered.");
  }

  return doc;
}

function encryptMRAM(doc: MRAMDocument, passphrase: string): Buffer {
  // Recompute checksum — metadata.expiresAt is outside the lines[] checksum,
  // so changing the expiry does not invalidate it, but recomputing is cheap
  // and guards against any in-memory mutation.
  const linesJson = JSON.stringify(doc.lines);
  doc.metadata.checksum = crypto.createHash("sha256").update(linesJson).digest("hex");

  const jsonBytes = Buffer.from(JSON.stringify(doc), "utf-8");
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = crypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, 32, "sha256");

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(jsonBytes), cipher.final()]);
  const authTag = cipher.getAuthTag();

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
// CLI helpers
// ============================================================

function parseDuration(value: string): number | null {
  const match = value.trim().match(/^(\d+)\s*(d|h|m)$/i);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const ms = unit === "d" ? 86_400_000 : unit === "h" ? 3_600_000 : 60_000;
  return n * ms;
}

type ExpiryMode =
  | { kind: "keep" }
  | { kind: "clear" }
  | { kind: "set"; iso: string };

function resolveExpiryMode(args: {
  expires?: string;
  expiresIn?: string;
  noExpires?: boolean;
  keepExpires?: boolean;
}): ExpiryMode {
  const flags = [
    args.expires !== undefined,
    args.expiresIn !== undefined,
    args.noExpires === true,
    args.keepExpires === true,
  ].filter(Boolean).length;

  if (flags > 1) {
    console.error("Error: --expires, --expires-in, --no-expires, and --keep-expires are mutually exclusive.");
    process.exit(1);
  }

  if (args.noExpires) return { kind: "clear" };
  if (args.keepExpires || flags === 0) return { kind: "keep" };

  if (args.expires) {
    const d = new Date(args.expires);
    if (Number.isNaN(d.getTime())) {
      console.error(`Error: --expires must be an ISO date. Got: ${args.expires}`);
      process.exit(1);
    }
    if (d.getTime() <= Date.now()) {
      console.error(`Error: --expires is in the past (${d.toISOString()}). Refusing to rotate to a pre-expired file.`);
      process.exit(1);
    }
    return { kind: "set", iso: d.toISOString() };
  }

  if (args.expiresIn) {
    const ms = parseDuration(args.expiresIn);
    if (ms === null || ms <= 0) {
      console.error(`Error: --expires-in must be a positive duration like 90d, 72h, or 45m. Got: ${args.expiresIn}`);
      process.exit(1);
    }
    return { kind: "set", iso: new Date(Date.now() + ms).toISOString() };
  }

  return { kind: "keep" };
}

async function promptHidden(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

interface ParsedArgs {
  positional: string[];
  oldPass?: string;
  newPass?: string;
  expires?: string;
  expiresIn?: string;
  noExpires?: boolean;
  keepExpires?: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { positional: [] };

  const takeValue = (flag: string, i: number): string => {
    const v = argv[++i];
    if (!v) {
      console.error(`Error: ${flag} requires a value.`);
      process.exit(1);
    }
    return v;
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--old-pass") { out.oldPass = takeValue(arg, i); i++; continue; }
    if (arg.startsWith("--old-pass=")) { out.oldPass = arg.slice("--old-pass=".length); continue; }
    if (arg === "--new-pass") { out.newPass = takeValue(arg, i); i++; continue; }
    if (arg.startsWith("--new-pass=")) { out.newPass = arg.slice("--new-pass=".length); continue; }
    if (arg === "--expires") { out.expires = takeValue(arg, i); i++; continue; }
    if (arg.startsWith("--expires=")) { out.expires = arg.slice("--expires=".length); continue; }
    if (arg === "--expires-in") { out.expiresIn = takeValue(arg, i); i++; continue; }
    if (arg.startsWith("--expires-in=")) { out.expiresIn = arg.slice("--expires-in=".length); continue; }
    if (arg === "--no-expires") { out.noExpires = true; continue; }
    if (arg === "--keep-expires") { out.keepExpires = true; continue; }
    if (arg.startsWith("--")) {
      console.error(`Error: Unknown option: ${arg}`);
      process.exit(1);
    }
    out.positional.push(arg);
  }

  return out;
}

function printUsage(): void {
  console.error("Usage: npx tsx scripts/rotate-mram.ts <input.mram> <output.mram> [options]");
  console.error("");
  console.error("Options:");
  console.error("  --old-pass <pass>       Current passphrase (prompted if omitted)");
  console.error("  --new-pass <pass>       New passphrase (prompted if omitted)");
  console.error("  --expires <ISO-date>    Set a new hard expiration");
  console.error("  --expires-in <dur>      Set a new expiration: 90d, 72h, 45m");
  console.error("  --no-expires            Remove the expiration field");
  console.error("  --keep-expires          Keep the existing expiresAt (default)");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.positional.length < 2) {
    printUsage();
    process.exit(1);
  }

  const inputPath = args.positional[0];
  const outputPath = args.positional[1];

  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }

  // Refuse to clobber input with output to avoid a partial-write disaster if
  // the process dies mid-rotate. User can rename after the fact.
  const inputReal = fs.realpathSync(inputPath);
  const outputReal = fs.existsSync(outputPath) ? fs.realpathSync(outputPath) : outputPath;
  if (inputReal === outputReal) {
    console.error("Error: input and output paths are the same file. Choose a distinct output path.");
    process.exit(1);
  }

  const expiryMode = resolveExpiryMode(args);

  const oldPass = args.oldPass ?? (await promptHidden("Current passphrase: "));
  if (!oldPass) {
    console.error("Error: Current passphrase cannot be empty.");
    process.exit(1);
  }

  console.error(`Reading ${inputPath}...`);
  const blob = fs.readFileSync(inputPath);

  console.error("Decrypting with current passphrase...");
  const doc = decryptMRAM(blob, oldPass);

  // Rotation intentionally ignores the expiration check on read — the whole
  // point is that you might be re-issuing an already-expired file. Report it
  // so the operator knows what they just unlocked.
  if (doc.metadata.expiresAt) {
    const currentExpiry = new Date(doc.metadata.expiresAt);
    const status = currentExpiry.getTime() <= Date.now() ? "EXPIRED" : "valid until";
    console.error(`  Current expiresAt: ${doc.metadata.expiresAt} (${status})`);
  } else {
    console.error("  Current expiresAt: none");
  }

  switch (expiryMode.kind) {
    case "keep":
      console.error(
        doc.metadata.expiresAt
          ? `  New expiresAt:     ${doc.metadata.expiresAt} (unchanged)`
          : "  New expiresAt:     none (unchanged)"
      );
      break;
    case "clear":
      delete doc.metadata.expiresAt;
      console.error("  New expiresAt:     none (cleared)");
      break;
    case "set":
      doc.metadata.expiresAt = expiryMode.iso;
      console.error(`  New expiresAt:     ${expiryMode.iso}`);
      break;
  }

  const newPass = args.newPass ?? (await promptHidden("New passphrase: "));
  if (!newPass) {
    console.error("Error: New passphrase cannot be empty.");
    process.exit(1);
  }

  if (newPass === oldPass && expiryMode.kind === "keep") {
    console.error(
      "Warning: new passphrase matches old and expiry is unchanged. The rotated file will differ only in salt/IV."
    );
  }

  console.error("Re-encrypting with new passphrase (fresh salt and IV)...");
  const rotated = encryptMRAM(doc, newPass);

  fs.writeFileSync(outputPath, rotated);
  console.error(`Written ${rotated.length} bytes to ${outputPath}`);
  console.error("Done.");
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
