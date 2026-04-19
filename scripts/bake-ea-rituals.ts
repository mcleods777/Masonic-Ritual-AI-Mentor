#!/usr/bin/env npx tsx
/**
 * bake-ea-rituals.ts — Bake audio into all three EA degree .mram files
 * back-to-back with a single passphrase prompt.
 *
 * Wrapper around scripts/build-mram-from-dialogue.ts --with-audio.
 * Runs ea-opening, ea-initiation, ea-closing in sequence, re-using a
 * single passphrase for all three. Resume-safe via the render cache.
 *
 * Usage:
 *   GOOGLE_GEMINI_API_KEY=... npx tsx scripts/bake-ea-rituals.ts
 *
 * Total time when cache is cold: ~25-30 minutes wall clock (ea-opening
 * ~4 min + ea-initiation ~13 min + ea-closing ~4 min, plus quota-reset
 * pauses if 3.1-flash caps out mid-run).
 *
 * Skip individual rituals by setting BAKE_SKIP (comma-separated):
 *   BAKE_SKIP=ea-closing GOOGLE_GEMINI_API_KEY=... npx tsx scripts/bake-ea-rituals.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";

const RITUALS = [
  { slug: "ea-opening",    label: "EA Opening" },
  { slug: "ea-initiation", label: "EA Initiation (longest — ~13 min)" },
  { slug: "ea-closing",    label: "EA Closing" },
];

async function readPassphrase(): Promise<string> {
  if (!process.stdin.isTTY) {
    const env = process.env.MRAM_PASSPHRASE;
    if (env) return env;
    throw new Error(
      "stdin is not a TTY and MRAM_PASSPHRASE env var is not set. " +
        "Run interactively or set MRAM_PASSPHRASE.",
    );
  }

  process.stderr.write("Enter passphrase for all three .mram files: ");
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

function runBuild(slug: string, passphrase: string): Promise<void> {
  const plainPath = path.join("rituals", `${slug}-dialogue.md`);
  const cipherPath = path.join("rituals", `${slug}-dialogue-cipher.md`);
  const outputPath = path.join("rituals", `${slug}.mram`);

  return new Promise((resolve, reject) => {
    const proc = spawn(
      "npx",
      [
        "tsx",
        "scripts/build-mram-from-dialogue.ts",
        plainPath,
        cipherPath,
        outputPath,
        "--with-audio",
      ],
      {
        stdio: ["ignore", "inherit", "inherit"],
        env: { ...process.env, MRAM_PASSPHRASE: passphrase },
      },
    );

    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`build-mram-from-dialogue exited ${code}`));
    });
  });
}

async function main() {
  if (!process.env.GOOGLE_GEMINI_API_KEY) {
    console.error("Error: GOOGLE_GEMINI_API_KEY env var is required.");
    console.error(
      "Set it via: export GOOGLE_GEMINI_API_KEY=AIza... (or prepend inline)",
    );
    process.exit(1);
  }

  const skip = new Set(
    (process.env.BAKE_SKIP ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

  // Filter rituals to those where source files exist AND aren't skipped.
  // Missing source files = silent skip (user may only have some degrees
  // locally). Explicit BAKE_SKIP = user intent.
  const queue = RITUALS.filter(({ slug }) => {
    if (skip.has(slug)) {
      console.error(`Skipping ${slug} (BAKE_SKIP set)`);
      return false;
    }
    const plain = path.join("rituals", `${slug}-dialogue.md`);
    const cipher = path.join("rituals", `${slug}-dialogue-cipher.md`);
    if (!fs.existsSync(plain) || !fs.existsSync(cipher)) {
      console.error(`Skipping ${slug} (source dialogue files missing)`);
      return false;
    }
    return true;
  });

  if (queue.length === 0) {
    console.error("\nNothing to bake. Exiting.");
    process.exit(0);
  }

  console.error("");
  console.error(`Baking ${queue.length} ritual(s):`);
  for (const { slug, label } of queue) {
    console.error(`  - ${slug}.mram  (${label})`);
  }
  console.error("");
  console.error("You'll be prompted for the passphrase once. Same one used for all three.");
  console.error("Cache at ~/.cache/masonic-mram-audio/ is preserved — safe to Ctrl-C and resume.");
  console.error("");

  const passphrase = await readPassphrase();
  if (!passphrase) {
    console.error("Error: passphrase cannot be empty.");
    process.exit(1);
  }

  const startTime = Date.now();

  for (const { slug, label } of queue) {
    console.error(`\n${"═".repeat(67)}`);
    console.error(`  Baking ${slug}.mram — ${label}`);
    console.error(`${"═".repeat(67)}\n`);
    try {
      await runBuild(slug, passphrase);
    } catch (err) {
      console.error(`\nFailed on ${slug}: ${(err as Error).message}`);
      console.error("Cache is preserved. Fix the issue and re-run.");
      process.exit(1);
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const mm = Math.floor(elapsed / 60);
  const ss = elapsed % 60;
  console.error(`\n${"═".repeat(67)}`);
  console.error(`  All rituals baked in ${mm}m${ss.toString().padStart(2, "0")}s`);
  console.error(`${"═".repeat(67)}`);
  console.error("");
  console.error("Next:");
  console.error("  1. Verify file sizes jumped to ~MB range:");
  console.error("     ls -la rituals/*.mram");
  console.error("  2. Re-encrypt the files for your pilot Brothers (same passphrase).");
  console.error("  3. Distribute the new .mram files — Brothers who re-upload will");
  console.error("     get embedded audio, zero per-line API calls on playback.");
  console.error("");
}

main().catch((err) => {
  console.error("Fatal:", err.message || err);
  process.exit(1);
});
