#!/usr/bin/env npx tsx
/**
 * rotate-mram-passphrase.ts — Re-encrypt one or more .mram files with
 * a new passphrase.
 *
 * Use this when the old passphrase has been compromised (leaked in a
 * chat log, screenshot, bug report, etc.) or when you want to rotate
 * passphrases on a schedule before distributing to a new cohort of
 * Brothers.
 *
 * The rotation is a straight decrypt-with-old → re-encrypt-with-new
 * cycle. Every byte of content (lines, metadata, voice cast, embedded
 * Opus audio) is preserved. Fresh random salt + IV are generated per
 * file so the old ciphertext — including anything ever posted in a
 * backup or chat log — cannot be re-used to derive the new key.
 *
 * Usage:
 *   npx tsx scripts/rotate-mram-passphrase.ts rituals/ea-opening.mram
 *   npx tsx scripts/rotate-mram-passphrase.ts rituals/*.mram
 *
 * You'll be prompted for the old passphrase once and the new
 * passphrase twice (confirmation). Neither ever appears on the command
 * line or in shell history.
 *
 * Non-interactive mode (CI, scripted rotation):
 *   MRAM_OLD_PASSPHRASE=old MRAM_NEW_PASSPHRASE=new \
 *     npx tsx scripts/rotate-mram-passphrase.ts rituals/*.mram
 *
 * Safety: each file is written atomically (staged as {file}.tmp then
 * renamed). If any file fails to decrypt, the script aborts BEFORE
 * touching any files on disk — so a typo on the old passphrase can't
 * corrupt a single byte.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

// ============================================================
// Binary layout constants — must match scripts/build-mram-from-dialogue.ts
// and src/lib/mram-format.ts exactly. Don't drift these.
// ============================================================

const MAGIC = Buffer.from("MRAM", "ascii");
const SUPPORTED_VERSIONS = [1, 2, 3] as const;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 310_000;

// ============================================================
// Crypto primitives
// ============================================================

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, 32, "sha256");
}

interface DecryptResult {
  /** The decrypted JSON payload — opaque to this script; we don't parse it. */
  jsonBytes: Buffer;
  /** Original version byte from the header, preserved on re-encrypt. */
  version: number;
}

function decryptMRAM(fileBytes: Buffer, passphrase: string): DecryptResult {
  if (fileBytes.length < MAGIC.length + 1 + SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("File too short to be a valid .mram");
  }
  const magic = fileBytes.subarray(0, MAGIC.length);
  if (!magic.equals(MAGIC)) {
    throw new Error("Not an .mram file (MAGIC bytes don't match)");
  }
  const version = fileBytes[MAGIC.length];
  if (!SUPPORTED_VERSIONS.includes(version as (typeof SUPPORTED_VERSIONS)[number])) {
    throw new Error(
      `Unsupported version ${version}. Supported: ${SUPPORTED_VERSIONS.join(", ")}`,
    );
  }
  let off = MAGIC.length + 1;
  const salt = fileBytes.subarray(off, off + SALT_LENGTH);
  off += SALT_LENGTH;
  const iv = fileBytes.subarray(off, off + IV_LENGTH);
  off += IV_LENGTH;
  // Everything remaining is ciphertext + auth tag (last 16 bytes).
  const rest = fileBytes.subarray(off);
  const ciphertext = rest.subarray(0, rest.length - AUTH_TAG_LENGTH);
  const authTag = rest.subarray(rest.length - AUTH_TAG_LENGTH);

  const key = deriveKey(passphrase, salt);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return { jsonBytes: plaintext, version };
}

function encryptMRAM(jsonBytes: Buffer, passphrase: string, version: number): Buffer {
  // Fresh salt + IV per file — critical. Reusing old ones would let
  // anyone who saw the old ciphertext + knows PBKDF2 constants derive
  // information they shouldn't have.
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey(passphrase, salt);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(jsonBytes), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([
    MAGIC,
    Buffer.from([version]),
    salt,
    iv,
    encrypted,
    authTag,
  ]);
}

// ============================================================
// Interactive no-echo passphrase prompt. Same pattern as
// build-mram-from-dialogue.ts — lets us rotate without leaking to
// shell history or ps output.
// ============================================================

async function promptPassphrase(label: string, envVarName: string): Promise<string> {
  if (!process.stdin.isTTY) {
    // Non-interactive mode: read from env vars so CI / scripted
    // rotation works. Only allowed when TTY is unavailable; in a
    // real terminal the interactive prompt wins.
    const env = process.env[envVarName];
    if (env) return env;
    throw new Error(
      `stdin is not a TTY and ${envVarName} env var is not set.`,
    );
  }
  process.stderr.write(`${label}: `);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf-8");
  return new Promise((resolve, reject) => {
    let pass = "";
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        const code = ch.charCodeAt(0);
        if (code === 13 || code === 10) {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener("data", onData);
          process.stderr.write("\n");
          resolve(pass);
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
          pass = pass.slice(0, -1);
          continue;
        }
        if (code < 32) continue;
        pass += ch;
      }
    };
    process.stdin.on("data", onData);
  });
}

// ============================================================
// CLI
// ============================================================

async function main() {
  const args = process.argv.slice(2);
  const files = args.filter((a) => !a.startsWith("--"));

  if (files.length === 0) {
    console.error(
      "Usage: npx tsx scripts/rotate-mram-passphrase.ts <file.mram> [more.mram ...]",
    );
    console.error("");
    console.error("Prompts for the OLD passphrase once and the NEW passphrase twice.");
    console.error("Decrypts each file with the old passphrase, re-encrypts with the");
    console.error("new one. Fresh salt + IV per file. Atomic write — a failure leaves");
    console.error("originals intact.");
    console.error("");
    console.error("Non-interactive: set MRAM_OLD_PASSPHRASE and MRAM_NEW_PASSPHRASE.");
    process.exit(1);
  }

  // Verify every file exists before prompting — saves the user from
  // typing passphrases just to discover a typo in the file path.
  for (const f of files) {
    if (!fs.existsSync(f)) {
      console.error(`Error: file not found: ${f}`);
      process.exit(1);
    }
  }

  console.error(`Rotating passphrase on ${files.length} file(s):`);
  for (const f of files) console.error(`  - ${f}`);
  console.error("");

  const oldPass = await promptPassphrase(
    "Enter OLD passphrase",
    "MRAM_OLD_PASSPHRASE",
  );
  if (!oldPass) {
    console.error("Old passphrase cannot be empty.");
    process.exit(1);
  }

  const newPass = await promptPassphrase(
    "Enter NEW passphrase",
    "MRAM_NEW_PASSPHRASE",
  );
  if (!newPass) {
    console.error("New passphrase cannot be empty.");
    process.exit(1);
  }
  // Non-interactive: skip the confirmation (env var can't be typo'd
  // twice). Interactive: require confirmation to catch typos.
  if (process.stdin.isTTY) {
    const newPassConfirm = await promptPassphrase(
      "Confirm NEW passphrase",
      "MRAM_NEW_PASSPHRASE",
    );
    if (newPass !== newPassConfirm) {
      console.error("New passphrases do not match. Aborting — no files modified.");
      process.exit(1);
    }
  }

  if (oldPass === newPass) {
    console.error(
      "Old and new passphrases are identical — nothing to rotate. Exiting.",
    );
    process.exit(1);
  }

  // PRE-FLIGHT: decrypt ALL files before writing ANY. A typo on the
  // old passphrase should fail fast without touching disk. This also
  // catches the "different passphrases across files" case — if file 1
  // decrypts but file 2 doesn't, we abort before any rename.
  console.error("\nPre-flight: decrypting all files to validate old passphrase...");
  const decrypted: { file: string; jsonBytes: Buffer; version: number }[] = [];
  for (const file of files) {
    try {
      const bytes = fs.readFileSync(file);
      const { jsonBytes, version } = decryptMRAM(bytes, oldPass);
      decrypted.push({ file, jsonBytes, version });
      console.error(`  ✓ ${file} (v${version}, ${jsonBytes.length} bytes decrypted)`);
    } catch (err) {
      console.error(`  ✗ ${file}: ${(err as Error).message}`);
      console.error(
        "\nAborting — no files modified. Old passphrase may be wrong, " +
          "or this file was encrypted with a different passphrase.",
      );
      process.exit(1);
    }
  }

  // COMMIT PHASE: every file decrypted successfully. Re-encrypt with
  // the new passphrase and write atomically. A failure mid-run still
  // leaves already-rotated files rotated — that's fine because the
  // new passphrase now works on those, and the user can re-run on
  // the remainder.
  console.error("\nRe-encrypting with new passphrase...");
  let rotated = 0;
  for (const { file, jsonBytes, version } of decrypted) {
    const newBytes = encryptMRAM(jsonBytes, newPass, version);
    const tmpPath = `${file}.tmp`;
    fs.writeFileSync(tmpPath, newBytes);
    fs.renameSync(tmpPath, file);
    const relPath = path.relative(process.cwd(), file);
    console.error(
      `  ✓ ${relPath} (v${version}, ${newBytes.length} bytes written, fresh salt+IV)`,
    );
    rotated++;
  }

  console.error("");
  console.error(`Done. ${rotated}/${files.length} file(s) rotated.`);
  console.error("");
  console.error("IMPORTANT:");
  console.error("  1. The OLD passphrase is now useless against these files.");
  console.error("  2. If any of these files were distributed (emailed, USB, etc.)");
  console.error("     under the OLD passphrase, those distributed copies are STILL");
  console.error("     crackable by anyone who knew the old passphrase. Re-distribute");
  console.error("     the freshly-rotated files and destroy the old ones.");
  console.error("  3. Remove the app's GEMINI_TTS_MODELS cache if any key material");
  console.error("     was entered into a shell session — already gone by now, but");
  console.error("     worth a `history -c` for paranoia.");
}

main().catch((err) => {
  console.error("\nFatal:", err.message || err);
  process.exit(1);
});
