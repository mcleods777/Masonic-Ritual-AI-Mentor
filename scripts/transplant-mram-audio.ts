#!/usr/bin/env npx tsx
/**
 * transplant-mram-audio.ts — copy audio for specific line IDs from
 * one .mram file (the source) into another (the target).
 *
 * Use case: a fresh re-bake produced Google Cloud TTS fallback audio
 * for lines that were originally rendered via Gemini in an older bake.
 * The old audio is preserved in *.mram.backup-* files. This script
 * lifts those specific lines' audio from the backup into the current
 * .mram so the published file is uniformly Gemini-voiced.
 *
 * The dialogue + cipher MUST be identical between source and target
 * (same line IDs, same plain text per line) — the script verifies
 * line.plain matches before transplanting and refuses to copy if not.
 *
 * Usage:
 *   MRAM_PASSPHRASE='...' npx tsx scripts/transplant-mram-audio.ts \
 *     --from rituals/ea-closing.mram.backup-2026-04-22T...Z \
 *     --to rituals/ea-closing.mram \
 *     --lines 7,81,86,90
 *
 *   # Auto-backup the target before overwriting (default behavior)
 *   # Pass --no-backup to skip. The orig is renamed to
 *   # ${target}.backup-pre-transplant-${ISO}
 */

import fs from "node:fs";
import path from "node:path";
import { decryptMRAM } from "../src/lib/mram-format";
import { encryptMRAMNode } from "./build-mram-from-dialogue";

// ============================================================
// CLI parsing
// ============================================================

const args = process.argv.slice(2);
function flagValue(flag: string): string | undefined {
  const i = args.indexOf(flag);
  if (i < 0 || i + 1 >= args.length) return undefined;
  return args[i + 1];
}
function flagPresent(flag: string): boolean {
  return args.includes(flag);
}

const fromPath = flagValue("--from");
const toPath = flagValue("--to");
const linesArg = flagValue("--lines");
const noBackup = flagPresent("--no-backup");
const dryRun = flagPresent("--dry-run");

if (!fromPath || !toPath || !linesArg) {
  console.error(
    "Usage: transplant-mram-audio.ts --from <backup.mram> --to <current.mram> --lines <id1,id2,...>",
  );
  console.error("       Optional: --no-backup --dry-run");
  process.exit(1);
}

const lineIds = linesArg
  .split(",")
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => Number.isFinite(n) && n > 0);

if (lineIds.length === 0) {
  console.error(
    `--lines must list at least one positive integer (got ${linesArg})`,
  );
  process.exit(1);
}

const passphrase = process.env.MRAM_PASSPHRASE;
if (!passphrase) {
  console.error("MRAM_PASSPHRASE env var required");
  process.exit(1);
}

if (!fs.existsSync(fromPath)) {
  console.error(`--from file not found: ${fromPath}`);
  process.exit(1);
}
if (!fs.existsSync(toPath)) {
  console.error(`--to file not found: ${toPath}`);
  process.exit(1);
}

// ============================================================
// Decrypt both, transplant, re-encrypt
// ============================================================

(async () => {
  const fromBuf = fs.readFileSync(fromPath);
  const toBuf = fs.readFileSync(toPath);

  console.log(`Decrypting source: ${fromPath} (${fromBuf.length} bytes)…`);
  const fromDoc = await decryptMRAM(
    fromBuf.buffer.slice(
      fromBuf.byteOffset,
      fromBuf.byteOffset + fromBuf.byteLength,
    ) as ArrayBuffer,
    passphrase,
  );
  console.log(`  → ${fromDoc.lines.length} lines`);

  console.log(`Decrypting target: ${toPath} (${toBuf.length} bytes)…`);
  const toDoc = await decryptMRAM(
    toBuf.buffer.slice(
      toBuf.byteOffset,
      toBuf.byteOffset + toBuf.byteLength,
    ) as ArrayBuffer,
    passphrase,
  );
  console.log(`  → ${toDoc.lines.length} lines`);

  let transplanted = 0;
  let skipped = 0;
  for (const id of lineIds) {
    const fromLine = fromDoc.lines.find((l) => l.id === id);
    const toLine = toDoc.lines.find((l) => l.id === id);
    if (!fromLine) {
      console.error(`  line ${id}: NOT FOUND in source — skipping`);
      skipped++;
      continue;
    }
    if (!toLine) {
      console.error(`  line ${id}: NOT FOUND in target — skipping`);
      skipped++;
      continue;
    }
    if (fromLine.plain !== toLine.plain) {
      console.error(
        `  line ${id}: plain text mismatch — source/target diverged. Skipping.`,
      );
      console.error(`    source: ${JSON.stringify(fromLine.plain.slice(0, 80))}`);
      console.error(`    target: ${JSON.stringify(toLine.plain.slice(0, 80))}`);
      skipped++;
      continue;
    }
    if (!fromLine.audio) {
      console.error(`  line ${id}: source has no audio — skipping`);
      skipped++;
      continue;
    }
    const oldBytes = toLine.audio
      ? Math.floor((toLine.audio.length * 3) / 4)
      : 0;
    const newBytes = Math.floor((fromLine.audio.length * 3) / 4);
    console.log(
      `  line ${id} (${toLine.role}): replacing ${oldBytes}B with ${newBytes}B from source`,
    );
    toLine.audio = fromLine.audio;
    transplanted++;
  }

  console.log(`\nTransplanted ${transplanted}/${lineIds.length} lines (${skipped} skipped)`);

  if (dryRun) {
    console.log("--dry-run: not writing");
    return;
  }

  if (transplanted === 0) {
    console.log("No transplants applied — leaving target untouched");
    return;
  }

  // Backup target before overwriting
  if (!noBackup) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = `${toPath}.backup-pre-transplant-${ts}`;
    fs.copyFileSync(toPath, backupPath);
    console.log(`Backed up target to: ${backupPath}`);
  }

  console.log(`Re-encrypting target…`);
  const reEncrypted = encryptMRAMNode(toDoc, passphrase);
  const tmpPath = `${toPath}.tmp`;
  fs.writeFileSync(tmpPath, reEncrypted);
  fs.renameSync(tmpPath, toPath);
  console.log(`Wrote ${reEncrypted.length} bytes to ${toPath}`);
  console.log(`Done.`);
})().catch((err) => {
  console.error(`Error: ${(err as Error).message}`);
  process.exit(1);
});
