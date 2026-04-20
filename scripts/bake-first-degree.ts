#!/usr/bin/env npx tsx
/**
 * bake-first-degree.ts — Bake audio into all Entered Apprentice (first
 * degree) .mram files back-to-back with a single passphrase prompt.
 *
 * This is the first-degree wrapper. Future parallel scripts:
 *   bake-second-degree.ts — Fellowcraft (FC)
 *   bake-third-degree.ts  — Master Mason (MM)
 * Each wraps scripts/build-mram-from-dialogue.ts --with-audio for the
 * rituals of one degree, re-using a single passphrase across all of
 * that degree's ceremonies. Resume-safe via the render cache.
 *
 * Usage:
 *   GOOGLE_GEMINI_API_KEY=... npx tsx scripts/bake-first-degree.ts \
 *     [--on-fallback=ask|continue|abort]
 *
 * Total time when cache is cold: ~25-30 minutes wall clock for the
 * full EA degree (opening ~4 min + initiation ~13 min + explanatory
 * ~3 min + closing ~4 min, plus quota-reset pauses if 3.1-flash caps
 * out mid-run).
 *
 * --on-fallback is passed through to each child build subprocess. The
 * default "ask" will prompt if the preferred model (3.1-flash) runs
 * out of quota mid-ritual; choosing abort stops the whole wrapper (one
 * ritual aborting stops the rest since mixing tiers across rituals is
 * the same consistency problem as mixing within a ritual).
 *
 * Skip individual rituals by setting BAKE_SKIP (comma-separated):
 *   BAKE_SKIP=ea-closing GOOGLE_GEMINI_API_KEY=... npx tsx scripts/bake-first-degree.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";

const RITUALS = [
  { slug: "ea-opening",     label: "EA Opening" },
  { slug: "ea-initiation",  label: "EA Initiation (longest — ~13 min)" },
  { slug: "ea-explanatory", label: "EA Explanatory Lecture" },
  { slug: "ea-closing",     label: "EA Closing" },
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

function runBuild(
  slug: string,
  passphrase: string,
  fallbackFlag: string,
): Promise<void> {
  const plainPath = path.join("rituals", `${slug}-dialogue.md`);
  const cipherPath = path.join("rituals", `${slug}-dialogue-cipher.md`);
  const outputPath = path.join("rituals", `${slug}.mram`);

  return new Promise((resolve, reject) => {
    // stdin is inherited (not ignored) so the child's interactive
    // fallback prompt can read our keypress. The child reads the
    // passphrase from MRAM_PASSPHRASE instead of stdin, so the prompt
    // is the only thing that ever asks for input.
    const proc = spawn(
      "npx",
      [
        "tsx",
        "scripts/build-mram-from-dialogue.ts",
        plainPath,
        cipherPath,
        outputPath,
        "--with-audio",
        fallbackFlag,
      ],
      {
        stdio: ["inherit", "inherit", "inherit"],
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

  // Pass through --on-fallback to each child build. Default "ask" so
  // the user controls quality-tier consistency across all three rituals
  // with a single prompt on the first fallback. Wait mode is best for
  // overnight bakes — child sleeps until midnight PT on preferred-
  // model exhaustion and resumes automatically, never degrading.
  const fallbackArg = process.argv.slice(2).find((a) => a.startsWith("--on-fallback="));
  const fallbackFlag = fallbackArg ?? "--on-fallback=ask";
  const fallbackValue = fallbackFlag.slice("--on-fallback=".length);
  if (!["ask", "continue", "abort", "wait"].includes(fallbackValue)) {
    console.error(
      `Error: invalid ${fallbackFlag}. Must be one of: ask, continue, abort, wait.`,
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
  console.error(`Fallback policy: ${fallbackValue} (${fallbackFlag})`);
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
      await runBuild(slug, passphrase, fallbackFlag);
    } catch (err) {
      const msg = (err as Error).message;
      console.error(`\nFailed on ${slug}: ${msg}`);
      // Exit code 2 from child = user chose abort (or --on-fallback=abort)
      // on a quality-tier drop. Propagate that specific signal clearly —
      // it's not really a "failure," it's user intent.
      if (msg.includes("exited 2")) {
        console.error(
          "Child aborted on quality-tier drop. Cache is preserved —",
        );
        console.error(
          "re-run after midnight PT for a uniform premium bake across all rituals.",
        );
        process.exit(2);
      }
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
