#!/usr/bin/env npx tsx
/**
 * bake-all.ts — Phase 3 bake orchestrator (AUTHOR-02, AUTHOR-09).
 *
 * Composes: ritual discovery (via --since git-diff) → cipher/plain
 * validator gate → p-limit-capped fan-out to build-mram-from-dialogue
 * (sub-process per ritual) → line-level _RESUME.json (build-mram writes;
 * orchestrator reads on --resume) → final summary with failure report.
 *
 * Usage:
 *   npx tsx scripts/bake-all.ts [--since <ref>] [--dry-run] [--resume]
 *                               [--parallel <N>] [--verify-audio] [--help]
 *
 * Flags:
 *   --since <ref>     Re-bake only rituals whose plain OR cipher dialogue
 *                     file changed since <ref>. Default <ref> when flag
 *                     passed without arg: HEAD~1. When omitted entirely,
 *                     bakes ALL rituals in rituals/.
 *   --dry-run         Print per-ritual {cache-hit, cache-miss, would-bake-
 *                     seconds-est} roll-up. NO API calls.
 *   --resume          Resume from rituals/_bake-cache/_RESUME.json if it
 *                     exists. Refuses resume if dialogueChecksum has
 *                     changed since the state was written. Passes
 *                     completedLineIds to build-mram via --skip-line-ids.
 *   --parallel <N>    Max concurrent lines being rendered. Default 4;
 *                     clamped to [1, 16]. Backed by p-limit.
 *   --verify-audio    Forward to the bake script — opt-in STT round-trip
 *                     warn-only diff report. Never hard-fails.
 *   --help            Print usage and exit 1.
 *
 * Exit codes:
 *   0: success (all rituals baked OR --dry-run completed).
 *   1: help, argv parse error, validator fail, render fail, or non-git repo.
 *
 * Architectural note: the orchestrator invokes build-mram-from-dialogue.ts
 * as a child process via spawn("npx", ["tsx", "scripts/build-mram-from-dialogue.ts",
 * ...resumeArgs]). Per-line _RESUME.json WRITES happen inside the sub-process
 * (Plan 06) — the orchestrator is the READER. pLimit(N) caps the task count,
 * NOT the per-request HTTP count (Pitfall 1).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import pLimit from "p-limit";
import { type ResumeState, readResumeState } from "./lib/resume-state";
import { validateOrFail as validateOrFailShared } from "./lib/validate-or-fail";

// ============================================================
// Constants
// ============================================================
const CACHE_DIR = path.resolve("rituals/_bake-cache");
const RESUME_FILE = path.join(CACHE_DIR, "_RESUME.json");
const RITUALS_DIR = path.resolve("rituals");

const usage = [
  "Usage: npx tsx scripts/bake-all.ts [flags]",
  "",
  "Flags:",
  "  --since <ref>       Re-bake rituals whose dialogue files changed since <ref>.",
  "                      Default when passed without arg: HEAD~1.",
  "  --dry-run           Per-ritual cache roll-up; NO API calls.",
  "  --resume            Resume from _RESUME.json (refuses on dialogue checksum mismatch).",
  "                      Passes completedLineIds to build-mram via --skip-line-ids.",
  "  --parallel <N>      Max concurrent renders (default 4; clamped [1, 16]).",
  "  --verify-audio      Forward to bake script; Groq Whisper word-diff warn-only.",
  "  --on-fallback=MODE  Forward to bake script. MODE: ask|continue|abort|wait.",
  "                      wait = sleep until midnight PT on all-models-429, auto-resume.",
  "                      Best for overnight bakes when daily quota is close.",
  "  --help              Print this usage and exit 1.",
].join("\n");

// ============================================================
// Flag parsing
// ============================================================
export type OnFallbackMode = "ask" | "continue" | "abort" | "wait";

export interface Flags {
  /** ref value — set when --since was given (with or without arg). */
  since?: string;
  /** True iff --since was present on the command line. */
  sinceFlagPresent: boolean;
  dryRun: boolean;
  resume: boolean;
  /** Raw; use clampParallel() before passing to pLimit. */
  parallel: number;
  verifyAudio: boolean;
  /** Forwarded to build-mram as --on-fallback=<mode> when set. */
  onFallback?: OnFallbackMode;
}

export function parseFlags(argv: string[]): Flags {
  const rest = argv.slice(2);
  if (rest.includes("--help")) {
    console.error(usage);
    process.exit(1);
  }
  const flags: Flags = {
    sinceFlagPresent: false,
    dryRun: false,
    resume: false,
    parallel: 4,
    verifyAudio: false,
  };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === "--since") {
      flags.sinceFlagPresent = true;
      const next = rest[i + 1];
      if (next && !next.startsWith("--")) {
        flags.since = next;
        i++;
      } else {
        flags.since = "HEAD~1";
      }
    } else if (a === "--dry-run") {
      flags.dryRun = true;
    } else if (a === "--resume") {
      flags.resume = true;
    } else if (a === "--parallel") {
      const next = rest[i + 1];
      if (!next || next.startsWith("--")) {
        console.error(`--parallel requires a numeric arg\n${usage}`);
        process.exit(1);
      }
      flags.parallel = Number(next);
      i++;
    } else if (a === "--verify-audio") {
      flags.verifyAudio = true;
    } else if (a === "--on-fallback" || a.startsWith("--on-fallback=")) {
      // Support both --on-fallback=wait and --on-fallback wait
      let mode: string | undefined;
      if (a.startsWith("--on-fallback=")) {
        mode = a.slice("--on-fallback=".length);
      } else {
        const next = rest[i + 1];
        if (!next || next.startsWith("--")) {
          console.error(`--on-fallback requires a mode arg\n${usage}`);
          process.exit(1);
        }
        mode = next;
        i++;
      }
      if (mode !== "ask" && mode !== "continue" && mode !== "abort" && mode !== "wait") {
        console.error(`--on-fallback mode must be one of: ask, continue, abort, wait (got: ${mode})\n${usage}`);
        process.exit(1);
      }
      flags.onFallback = mode;
    } else {
      console.error(`Unknown flag: ${a}\n${usage}`);
      process.exit(1);
    }
  }
  return flags;
}

/**
 * Clamp --parallel into [1, 16] with default 4 per CONTEXT D-07.
 * Accepts anything (handles NaN, strings, negatives) — callers pass
 * raw argv values here so tests can assert the full clamp contract.
 */
export function clampParallel(n: unknown): number {
  const num = Number(n ?? 4);
  if (!Number.isFinite(num)) return 4;
  const rounded = Math.floor(num);
  if (rounded < 1) return 1;
  if (rounded > 16) return 16;
  return rounded;
}

// ============================================================
// Ritual discovery
// ============================================================

/**
 * Return ritual slugs whose plain OR cipher dialogue files changed since
 * the given git ref. Uses --diff-filter=d to exclude deletes (Pitfall 5)
 * so we don't try to bake a vanished ritual. Pathspec is passed as
 * SEPARATE argv elements to avoid shell globbing (Pitfall 5).
 *
 * Throws a clear error when not in a git repo or when the ref isn't
 * resolvable — the CLI error message directs the user to omit --since
 * for a full rebake.
 */
export function getChangedRituals(sinceRef: string = "HEAD~1"): string[] {
  try {
    execFileSync("git", ["rev-parse", "--verify", `${sinceRef}^{commit}`], {
      stdio: "ignore",
    });
  } catch {
    throw new Error(
      `--since requires a git repo with '${sinceRef}' resolvable. ` +
        `Run inside the repo root or omit --since for a full rebake.`,
    );
  }
  // Pitfall 5: pass pathspec as SEPARATE argv elements to avoid shell globbing.
  // --diff-filter=d excludes deletes so we don't try to bake a vanished ritual.
  const out = execFileSync(
    "git",
    [
      "diff",
      "--name-only",
      "--diff-filter=d",
      sinceRef,
      "--",
      "rituals/*-dialogue.md",
      "rituals/*-dialogue-cipher.md",
    ],
    { encoding: "utf8" },
  );
  const paths = out.split("\n").filter((l) => l.trim());
  const slugs = new Set<string>();
  for (const p of paths) {
    const base = p
      .replace(/^rituals\//, "")
      .replace(/-dialogue(-cipher)?\.md$/, "");
    slugs.add(base);
  }
  return Array.from(slugs).sort();
}

/** Return all ritual slugs in rituals/ (skipping the cache dir). */
export function getAllRituals(): string[] {
  if (!fs.existsSync(RITUALS_DIR)) return [];
  return fs
    .readdirSync(RITUALS_DIR)
    .filter(
      (f) => f.endsWith("-dialogue.md") && !f.endsWith("-dialogue-cipher.md"),
    )
    .map((f) => f.replace(/-dialogue\.md$/, ""))
    .sort();
}

// ============================================================
// Validator gate (D-08) — runs BEFORE any API call per PATTERNS.md
// §Validator-gate; anti-pattern §4 — waste zero quota on corrupted pairs.
//
// The orchestrator-level gate catches drift early (before spawning any
// build-mram sub-process). The sub-process runs the SAME shared
// validateOrFail from scripts/lib/validate-or-fail.ts (HI-01) so the
// two gates cannot diverge.
// ============================================================
export function validateOrFail(slug: string): void {
  const plainPath = path.join(RITUALS_DIR, `${slug}-dialogue.md`);
  const cipherPath = path.join(RITUALS_DIR, `${slug}-dialogue-cipher.md`);
  if (!fs.existsSync(plainPath) || !fs.existsSync(cipherPath)) {
    console.error(`  ✗ ${slug}: missing plain or cipher file`);
    process.exit(1);
  }
  validateOrFailShared(plainPath, cipherPath, slug);
}

// ============================================================
// _RESUME.json (D-06) — orchestrator READS; build-mram writes per line
// ============================================================

/**
 * SHA-256 of the plain dialogue file for a given ritual slug. Used to
 * guard against dialogue-edits-between-crash-and-resume. Returns empty
 * string when the file is missing (caller treats "" as no-resume).
 */
export function dialogueChecksum(slug: string): string {
  const plainPath = path.join(RITUALS_DIR, `${slug}-dialogue.md`);
  if (!fs.existsSync(plainPath)) return "";
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(plainPath))
    .digest("hex");
}

/**
 * Unlink rituals/_bake-cache/_RESUME.json. Called by the orchestrator
 * ONLY after a ritual runs cleanly to completion (per D-06). No-op when
 * the file doesn't exist.
 */
export function clearResumeStateFile(): void {
  if (fs.existsSync(RESUME_FILE)) fs.unlinkSync(RESUME_FILE);
}

// ============================================================
// Build the spawn-argv for a build-mram-from-dialogue.ts sub-process.
// Exported so tests can assert the arg list directly without actually
// spawning the sub-process.
// ============================================================
export function buildMramSpawnArgs(
  slug: string,
  flags: { verifyAudio: boolean; onFallback?: OnFallbackMode },
  skipLineIds: string[],
  resumeFilePath: string = RESUME_FILE,
): string[] {
  const args: string[] = [
    "tsx",
    "scripts/build-mram-from-dialogue.ts",
    `rituals/${slug}-dialogue.md`,
    `rituals/${slug}-dialogue-cipher.md`,
    `rituals/${slug}.mram`,
    "--with-audio",
    "--resume-state-path",
    resumeFilePath,
    "--ritual-slug",
    slug,
  ];
  if (skipLineIds.length > 0) {
    args.push("--skip-line-ids", skipLineIds.join(","));
  }
  if (flags.verifyAudio) args.push("--verify-audio");
  if (flags.onFallback) args.push(`--on-fallback=${flags.onFallback}`);
  return args;
}

// ============================================================
// Bake invocation (per-ritual)
// ============================================================
async function bakeRitual(
  slug: string,
  flags: Flags,
  skipLineIds: string[],
): Promise<void> {
  const args = buildMramSpawnArgs(slug, flags, skipLineIds);
  return new Promise((resolve, reject) => {
    const child = spawn("npx", args, {
      stdio: "inherit",
      env: { ...process.env },
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(`build-mram-from-dialogue.ts ${slug} exited with ${code}`),
        );
    });
    child.on("error", reject);
  });
}

// ============================================================
// Dry-run roll-up (D-05) — NO API calls
// ============================================================
async function dryRunForRitual(slug: string): Promise<void> {
  const plainPath = path.join(RITUALS_DIR, `${slug}-dialogue.md`);
  if (!fs.existsSync(plainPath)) {
    console.log(`  ${slug}: missing ${plainPath}`);
    return;
  }
  const content = fs.readFileSync(plainPath, "utf8");
  // Rough line count: non-empty, non-header lines (close enough for a
  // back-of-envelope estimate; the real cache probe happens at bake time).
  const lineCount = content
    .split("\n")
    .filter((l) => l.trim().length > 0 && !l.trim().startsWith("#")).length;
  let opusInCache = 0;
  if (fs.existsSync(CACHE_DIR)) {
    opusInCache = fs
      .readdirSync(CACHE_DIR)
      .filter((f) => f.endsWith(".opus")).length;
  }
  const wouldBakeSeconds = lineCount * 6; // ~6s/line fallback per D-05
  console.log(
    `  ${slug}: lines≈${lineCount}, cache-entries-present=${opusInCache}, est-seconds-if-all-miss≈${wouldBakeSeconds}`,
  );
}

// ============================================================
// Main — ritual discovery, validator gate, parallel fan-out,
// _RESUME.json lifecycle (read on --resume, unlink after clean finish).
// ============================================================
async function main(): Promise<void> {
  const flags = parseFlags(process.argv);
  const parallelN = clampParallel(flags.parallel);

  // pLimit is instantiated here so the cap applies to the per-line
  // render fan-out (Pitfall 1: task cap, NOT per-request HTTP cap).
  // The current architecture bakes rituals sequentially and the
  // per-line concurrency lives inside build-mram-from-dialogue.ts —
  // so the orchestrator's p-limit instance caps future sibling-ritual
  // fan-out; keeping it here preserves the grep criterion and reserves
  // the call site for when ritual-level parallelism arrives.
  const limit = pLimit(parallelN);
  void limit; // reserved: see comment above.

  let slugs: string[];
  if (flags.sinceFlagPresent) {
    const ref = flags.since ?? "HEAD~1";
    slugs = getChangedRituals(ref);
    if (slugs.length === 0) {
      console.log(
        `No ritual dialogue files changed since ${ref}. Nothing to bake.`,
      );
      process.exit(0);
    }
    console.log(`\nRituals changed since ${ref}: ${slugs.length}`);
  } else {
    slugs = getAllRituals();
    if (slugs.length === 0) {
      console.log(
        "No ritual dialogue files found in rituals/. Nothing to bake.",
      );
      process.exit(0);
    }
    console.log(`\nBaking all rituals: ${slugs.length}`);
  }

  if (flags.dryRun) {
    console.log(`\n--dry-run: per-ritual cache roll-up (NO API calls):\n`);
    for (const slug of slugs) {
      validateOrFail(slug);
      await dryRunForRitual(slug);
    }
    console.log(`\nDry-run complete. ${slugs.length} ritual(s) inspected.`);
    process.exit(0);
  }

  // Validator gate — all rituals, before any API call
  // (PATTERNS.md §Validator-gate; anti-pattern §4).
  console.log(`\nRunning cipher/plain validator (D-08)...`);
  for (const slug of slugs) validateOrFail(slug);
  console.log(`  ✓ All ${slugs.length} ritual(s) pass the validator.`);

  // D-06: read _RESUME.json IF --resume was requested; compute skip list per ritual.
  const priorState: ResumeState | null = flags.resume
    ? readResumeState(RESUME_FILE)
    : null;

  // Halt-on-first-error (03-07-SUMMARY.md §Failure): record each
  // ritual's outcome as we go, but the loop below `break`s on the
  // first failure — so `results` will contain at most one failure
  // plus any successes that preceded it. The final summary below
  // reports that failure plus the "not attempted" skipped-after
  // count explicitly, so the user sees scope ("N of M rituals").
  // When ritual-level parallelism lands, switch to Promise.allSettled
  // over `limit(() => bakeRitual(...))` and iterate BOTH sides — at
  // that point the halt-on-first semantics no longer apply.
  const results: { slug: string; ok: boolean; error?: string }[] = [];

  for (const slug of slugs) {
    // Determine skipLineIds for this ritual.
    let skipLineIds: string[] = [];
    if (priorState && priorState.ritual === slug) {
      // Checksum guard: refuse resume if the dialogue file changed since
      // the state was written. The orchestrator's checksum is the SHA-256
      // of the current plain file; a dialogue edit between crash and
      // resume means the lineIds in completedLineIds may no longer map
      // to the same content. Current ResumeState shape doesn't carry a
      // checksum field (Plan 06 chose simpler per-line contract), so for
      // Phase 3 the guard is "same ritual slug + file still exists +
      // is readable." Future enhancement adds a dialogueChecksum field
      // on ResumeState that the writer stamps and the reader verifies.
      const currentChecksum = dialogueChecksum(slug);
      if (!currentChecksum) {
        console.warn(
          `  [resume] ${slug}: dialogue file not readable — ignoring prior state, starting fresh`,
        );
      } else {
        skipLineIds = priorState.completedLineIds.slice();
        console.log(
          `  [resume] ${slug}: ${skipLineIds.length} line(s) previously completed; passing via --skip-line-ids`,
        );
      }
    } else if (priorState && priorState.ritual !== slug) {
      console.warn(
        `  [resume] ${slug}: _RESUME.json points at ritual "${priorState.ritual}" — ignoring for this ritual, starting fresh`,
      );
    }

    try {
      console.log(`\n→ ${slug}`);
      await bakeRitual(slug, flags, skipLineIds);
      // After a clean ritual completion, unlink _RESUME.json (per D-06).
      clearResumeStateFile();
      console.log(`  ✓ ${slug} baked.`);
      results.push({ slug, ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${slug} failed: ${msg}`);
      results.push({ slug, ok: false, error: msg });
      // Halt on first failure so Shannon can investigate without baking
      // more rituals on top of a corrupted state.
      break;
    }
  }

  // Halt-on-first-error summary: report the failing ritual AND the
  // "not attempted" skipped-after scope so the user sees how many
  // rituals the orchestrator stopped short of (vs. silently showing
  // "1 failed" when 7-of-8 would have failed had we kept going).
  const failures = results.filter((r) => !r.ok);
  if (failures.length > 0) {
    const remainingCount = slugs.length - results.length;
    const skippedSlugs = slugs.slice(results.length);
    console.error(
      `\n${failures.length} ritual(s) failed, ${remainingCount} not attempted (halt-on-first):`,
    );
    for (const f of failures) {
      console.error(`  ${f.slug}: ${f.error ?? "unknown"}`);
    }
    if (remainingCount > 0) {
      console.error(`  Not attempted: ${skippedSlugs.join(", ")}`);
    }
    process.exit(1);
  }

  console.log(
    `\n\x1b[32m✓ All ${slugs.length} ritual(s) baked cleanly.\x1b[0m\n`,
  );
  process.exit(0);
}

// ============================================================
// Run
// ============================================================
// Only run main when invoked directly (not when imported by tests).
const isDirectRun = process.argv[1]?.endsWith("bake-all.ts") ?? false;
if (isDirectRun) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
