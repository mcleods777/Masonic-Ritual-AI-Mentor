#!/usr/bin/env npx tsx
/**
 * bake-all.ts — Phase 3 bake orchestrator (AUTHOR-02, AUTHOR-09).
 *
 * Composes: ritual discovery (all rituals, or --changed-only via the
 * content-hash cache-manifest) → cipher/plain validator gate (runs for
 * EVERY selected ritual BEFORE any spawn) → p-limit-capped fan-out to
 * build-mram-from-dialogue.ts (one sub-process per ritual) → manifest
 * update on success → ritual-granularity resume state → halt-on-first-
 * failure summary.
 *
 * Usage:
 *   npx tsx scripts/bake-all.ts [--changed-only] [--since [ref]] \
 *     [--dry-run] [--resume] [--parallel <N>] [--on-fallback=ask|continue|abort|wait] [--help]
 *
 * Flags:
 *   --changed-only     Re-bake only rituals whose plain OR cipher dialogue
 *                      file content-hash changed since the last recorded
 *                      bake (rituals/_bake-cache/_manifest.json). Primary,
 *                      honest flag name for content-hash change detection.
 *   --since [ref]      DEPRECATED compat alias for --changed-only. Prints
 *                      a one-line warning and behaves identically — the
 *                      ref value is accepted but IGNORED. git-ref semantics
 *                      are impossible here: dialogue files under rituals/
 *                      are permanently gitignored, so `git diff` can never
 *                      see them (confirmed-broken on the abandoned branch —
 *                      it silently returned "0 changed" forever).
 *   --dry-run          Print a per-ritual roll-up (line count estimate,
 *                      cache-entries-present). Still runs the validator
 *                      gate. ZERO spawns, zero API calls.
 *   --resume           Skip ritual slugs already recorded as completed in
 *                      rituals/_bake-cache/_RESUME.json from a prior
 *                      interrupted run. RITUAL granularity (see "Resume
 *                      granularity" note below) — not per-line.
 *   --parallel <N>     Max concurrent ritual bakes (each a build-mram-
 *                      from-dialogue.ts child process). Default 4;
 *                      clamped to [1, 16] via p-limit.
 *   --on-fallback=...  Forwarded to each build-mram-from-dialogue.ts
 *                      child verbatim. One of ask|continue|abort|wait.
 *                      Default "ask" (matches the child's own default).
 *                      REFUSED when --parallel > 1 and this is ask or
 *                      wait — see "Parallel + fallback" note below.
 *   --help             Print usage and exit 1.
 *
 * Parallel + fallback (CONTEXT.md discretion (b)):
 *   ask/wait pause a SINGLE child for interactive input (a keypress, or
 *   sleeping until quota resets). With --parallel > 1, multiple children
 *   run concurrently — an interactive pause on one child while siblings
 *   keep running is confusing at best, and multiple children racing for
 *   the same terminal at worst. Rather than build pause-all-workers
 *   coordination, --parallel > 1 simply requires --on-fallback=continue
 *   or --on-fallback=abort.
 *
 * Resume granularity (WR-02): TWO independent resume layers now compose.
 *
 *   1. RITUAL granularity (this orchestrator): scripts/lib/resume-state.ts's
 *      ResumeState is repurposed here — `completedLineIds` holds completed
 *      RITUAL SLUGS (not line IDs) and `ritual` is the fixed marker string
 *      RESUME_MARKER. Written to rituals/_bake-cache/_RESUME.json
 *      INCREMENTALLY and UNCONDITIONALLY after EVERY successful ritual
 *      bake (not just when --resume is passed, and not only post-hoc at
 *      the end of the run) — a crash mid-fan-out still leaves a resumable
 *      record of every ritual that finished before the crash. `--resume`
 *      only controls whether a prior run's completed slugs are read back
 *      and skipped on this invocation; the write itself is unconditional.
 *
 *   2. Per-LINE granularity (the child, build-mram-from-dialogue.ts):
 *      that script DOES have a --resume-state-path=<file> flag (see its
 *      own module docstring) — it persists completedLineIds after every
 *      line renders, atomically, via the SAME resume-state.ts contract.
 *      buildMramSpawnArgs passes a PER-RITUAL file
 *      (_bake-cache/_RESUME-<slug>.json, keyed by slug so cross-ritual
 *      state can never collide) to every spawned child, so a bake
 *      interrupted mid-ritual resumes from its interrupted LINE on the
 *      next invocation, not from that ritual's first line.
 *
 * Passphrase: prompted ONCE here (same raw-stdin idiom as
 * scripts/bake-first-degree.ts's readPassphrase), then passed to every
 * child via the MRAM_PASSPHRASE env var — NEVER via argv (T-03-13:
 * argv is visible in `ps` output; env is not visible to unrelated users).
 *
 * Exit codes:
 *   0: success (all selected rituals baked OR --dry-run completed OR
 *      nothing to bake).
 *   1: help, argv parse error, validator fail, empty passphrase, parallel/
 *      fallback conflict, or one-or-more ritual bake failure.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";
import pLimit from "p-limit";
import {
  type ResumeState,
  readResumeState,
  writeResumeStateAtomic,
} from "./lib/resume-state";
import { getChangedRituals, recordBaked } from "./lib/cache-manifest";
import { validateOrFail as validateOrFailShared } from "./lib/validate-or-fail";
import { choosePassphraseSource, consolidateBakeIndex } from "./build-mram-from-dialogue";

// ============================================================
// Constants
// ============================================================
const RITUALS_DIR = path.resolve("rituals");
const CACHE_DIR = path.join(RITUALS_DIR, "_bake-cache");
const MANIFEST_PATH = path.join(CACHE_DIR, "_manifest.json");
const RESUME_FILE = path.join(CACHE_DIR, "_RESUME.json");

/** Marker `ritual` value for bake-all's ritual-granularity resume file
 *  (see "Resume granularity" note in the module docstring above). */
const RESUME_MARKER = "__bake-all__";

/** Matches src/app/api/author/_guard.ts's resolvePairPaths slug regex. */
export const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/;

const usage = [
  "Usage: npx tsx scripts/bake-all.ts [flags]",
  "",
  "Flags:",
  "  --changed-only       Re-bake rituals whose dialogue files changed",
  "                       (content-hash manifest, not git).",
  "  --since [ref]        DEPRECATED alias for --changed-only; ref is",
  "                       accepted but ignored (git-ref semantics are",
  "                       impossible for gitignored dialogue files).",
  "  --dry-run            Per-ritual roll-up; validator gate still runs;",
  "                       ZERO spawns, zero API calls.",
  "  --resume             Skip ritual slugs already completed in a prior",
  "                       interrupted run (ritual granularity).",
  "  --parallel <N>       Max concurrent ritual bakes (default 4;",
  "                       clamped [1, 16]). Caps concurrent LINE-RENDER",
  "                       TASKS per ritual spawn fan-out — each ritual",
  "                       spawn internally renders many lines serially,",
  "                       so N caps how many ritual spawns (and thus how",
  "                       much line-render work) run at once. Internal",
  "                       model-fallback RETRIES within a single line's",
  "                       render are NOT individually capped by this flag.",
  "  --on-fallback=...    Forwarded to each build-mram-from-dialogue.ts",
  "                       child verbatim. One of ask|continue|abort|wait",
  "                       (default ask). REFUSED with --parallel > 1 when",
  "                       ask or wait (interactive pause cannot compose",
  "                       with parallel workers).",
  "  --help               Print this usage and exit 1.",
].join("\n");

// ============================================================
// Flag parsing
// ============================================================
export type FallbackMode = "ask" | "continue" | "abort" | "wait";

export interface Flags {
  changedOnly: boolean;
  /** ref value — set when --since was given (with or without arg). Ignored. */
  since?: string;
  /** True iff --since was present on the command line. */
  sinceFlagPresent: boolean;
  dryRun: boolean;
  resume: boolean;
  /** Raw; use clampParallel() before passing to pLimit. */
  parallel: number;
  /** True iff --parallel was present on the command line (vs. the default 4). */
  parallelFlagPresent: boolean;
  onFallback: FallbackMode;
  /** True iff --on-fallback=... was present on the command line (vs. the default "ask"). */
  onFallbackFlagPresent: boolean;
}

export function parseFlags(argv: string[]): Flags {
  const rest = argv.slice(2);
  if (rest.includes("--help")) {
    console.error(usage);
    process.exit(1);
  }
  const flags: Flags = {
    changedOnly: false,
    sinceFlagPresent: false,
    dryRun: false,
    resume: false,
    parallel: 4,
    parallelFlagPresent: false,
    onFallback: "ask",
    onFallbackFlagPresent: false,
  };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === "--changed-only") {
      flags.changedOnly = true;
    } else if (a === "--since") {
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
      flags.parallelFlagPresent = true;
      i++;
    } else if (a.startsWith("--on-fallback=")) {
      const value = a.slice("--on-fallback=".length);
      if (
        value !== "ask" &&
        value !== "continue" &&
        value !== "abort" &&
        value !== "wait"
      ) {
        console.error(
          `Invalid --on-fallback=${value}. Must be one of: ask, continue, abort, wait.\n${usage}`,
        );
        process.exit(1);
      }
      flags.onFallback = value;
      flags.onFallbackFlagPresent = true;
    } else {
      console.error(`Unknown flag: ${a}\n${usage}`);
      process.exit(1);
    }
  }
  return flags;
}

/**
 * Clamp --parallel into [1, 16] with default 4 per CONTEXT.md discretion
 * (c). Accepts anything (handles NaN, strings, negatives) — callers pass
 * raw argv-derived values here so tests can assert the full clamp contract.
 */
export function clampParallel(n: unknown): number {
  const num = Number(n ?? 4);
  if (!Number.isFinite(num)) return 4;
  const rounded = Math.floor(num);
  if (rounded < 1) return 1;
  if (rounded > 16) return 16;
  return rounded;
}

/**
 * CONTEXT.md discretion (b) / T-03-14: --parallel > 1 cannot compose
 * with an interactive fallback pause (ask/wait). Returns an error
 * message naming both flags when the combination is invalid, or null
 * when it's fine. Pure function — no process.exit — so tests can assert
 * the refusal without mocking process.exit or console.
 *
 * `flagged` gates enforcement on whether the user actually TOUCHED
 * --parallel and/or --on-fallback on the command line (default true —
 * most callers, including tests, are asserting the explicit-flag
 * scenario). This distinction matters because BOTH --parallel (default
 * 4) and --on-fallback (default "ask", matching build-mram-from-
 * dialogue.ts's own default) have defaults that would otherwise conflict
 * with each other on a completely bare invocation — refusing a plain
 * `bake-all.ts --dry-run` with no explicit flags would be a confusing
 * surprise. main() passes `flags.parallelFlagPresent ||
 * flags.onFallbackFlagPresent` here so the refusal only fires once the
 * user has actually engaged with one of the two flags.
 */
export function checkParallelFallbackConflict(
  parallelN: number,
  onFallback: FallbackMode,
  flagged: boolean = true,
): string | null {
  if (
    flagged &&
    parallelN > 1 &&
    (onFallback === "ask" || onFallback === "wait")
  ) {
    return (
      `Error: --parallel ${parallelN} (> 1) cannot compose with ` +
      `--on-fallback=${onFallback} (interactive pause). ` +
      `Use --parallel with --on-fallback=continue or --on-fallback=abort.`
    );
  }
  return null;
}

/**
 * CR-02 / T-03-14: resolve the two conflicting DEFAULTS (parallel=4,
 * on-fallback="ask") to a SAFE effective parallel value instead of gating
 * enforcement on flag-provenance. A completely bare invocation (neither
 * --parallel nor --on-fallback touched) degrades to parallel=1, where
 * "ask" is legal and safe — no forbidden combination can ever run by
 * default. The moment the user engages EITHER flag explicitly, the
 * degrade is skipped and the resolved value is whatever --parallel
 * specified (clamped), so checkParallelFallbackConflict's refusal fires
 * on it as expected.
 */
export function resolveEffectiveParallel(
  flags: Pick<Flags, "parallel" | "parallelFlagPresent" | "onFallbackFlagPresent">,
): number {
  const bothDefault = !flags.parallelFlagPresent && !flags.onFallbackFlagPresent;
  return bothDefault ? 1 : clampParallel(flags.parallel);
}

// ============================================================
// Ritual discovery
// ============================================================

/**
 * Return all ritual slugs discovered under `ritualsDir` (skipping the
 * cache dir). Slugs that don't match SLUG_REGEX are rejected (logged,
 * excluded) rather than silently included — protects the spawn-argv
 * boundary downstream (T-03-12).
 */
export function getAllRituals(ritualsDir: string = RITUALS_DIR): string[] {
  if (!fs.existsSync(ritualsDir)) return [];
  const slugs = fs
    .readdirSync(ritualsDir)
    .filter(
      (f) => f.endsWith("-dialogue.md") && !f.endsWith("-dialogue-cipher.md"),
    )
    .map((f) => f.replace(/-dialogue\.md$/, ""));
  const valid: string[] = [];
  for (const slug of slugs) {
    if (!SLUG_REGEX.test(slug)) {
      console.error(
        `  ! skipping non-conforming ritual slug "${slug}" (must match ${SLUG_REGEX})`,
      );
      continue;
    }
    valid.push(slug);
  }
  return valid.sort();
}

/**
 * Resolve the ritual slugs selected for this run given the parsed flags.
 * --changed-only and --since (deprecated alias) both delegate to the same
 * content-hash getChangedRituals; omitting both selects every ritual.
 */
export function selectSlugs(
  flags: Pick<Flags, "changedOnly" | "sinceFlagPresent">,
  ritualsDir: string = RITUALS_DIR,
  manifestPath: string = MANIFEST_PATH,
): string[] {
  const all = getAllRituals(ritualsDir);
  if (flags.changedOnly || flags.sinceFlagPresent) {
    return getChangedRituals(manifestPath, all);
  }
  return all;
}

/**
 * The one-line deprecation warning printed when --since is used. Pure
 * function (returns the string rather than calling console.warn
 * directly) so tests can assert its content without spying on console.
 */
export function sinceDeprecationWarning(): string {
  return (
    `[deprecated] --since is a compat alias for --changed-only; ` +
    `git-ref semantics are impossible for gitignored dialogue files, ` +
    `so the ref value is ignored and a content-hash manifest is used instead.`
  );
}

// ============================================================
// Validator gate — runs for EVERY selected ritual BEFORE any spawn.
// Waste zero quota on corrupted pairs.
// ============================================================
export function validateOrFail(
  slug: string,
  ritualsDir: string = RITUALS_DIR,
): void {
  const plainPath = path.join(ritualsDir, `${slug}-dialogue.md`);
  const cipherPath = path.join(ritualsDir, `${slug}-dialogue-cipher.md`);
  if (!fs.existsSync(plainPath) || !fs.existsSync(cipherPath)) {
    console.error(`  ✗ ${slug}: missing plain or cipher file`);
    process.exit(1);
  }
  validateOrFailShared(plainPath, cipherPath, slug);
}

export function runValidatorGate(
  slugs: string[],
  ritualsDir: string = RITUALS_DIR,
): void {
  for (const slug of slugs) validateOrFail(slug, ritualsDir);
}

// ============================================================
// Build the spawn-argv for a build-mram-from-dialogue.ts sub-process.
// Exported so tests can assert the arg list directly without spawning.
// WR-02: also appends --resume-state-path=<per-ritual file>, keyed by
// slug so the child's `loaded.ritual === ritualSlug` guard matches and
// cross-ritual state can never collide — this is the per-LINE resume
// layer (see the module docstring's "Resume granularity" note, layer 2).
// build-mram-from-dialogue.ts DOES support --resume-state-path (see its
// own module docstring); it is not the abandoned branch's flag set.
// ============================================================
export function buildMramSpawnArgs(
  slug: string,
  onFallback: FallbackMode,
  ritualsDir: string = RITUALS_DIR,
): string[] {
  const plainPath = path.join(ritualsDir, `${slug}-dialogue.md`);
  const cipherPath = path.join(ritualsDir, `${slug}-dialogue-cipher.md`);
  const outputPath = path.join(ritualsDir, `${slug}.mram`);
  const cacheDir = path.join(ritualsDir, "_bake-cache");
  const resumeStatePath = path.join(cacheDir, `_RESUME-${slug}.json`);
  return [
    "tsx",
    "scripts/build-mram-from-dialogue.ts",
    plainPath,
    cipherPath,
    outputPath,
    "--with-audio",
    `--on-fallback=${onFallback}`,
    `--resume-state-path=${resumeStatePath}`,
  ];
}

// ============================================================
// Bake invocation (per-ritual) — args are a string[], never a shell
// string (T-03-12). Passphrase travels via env only, never argv (T-03-13).
// ============================================================
function bakeRitual(
  slug: string,
  onFallback: FallbackMode,
  passphrase: string,
  ritualsDir: string = RITUALS_DIR,
): Promise<void> {
  const args = buildMramSpawnArgs(slug, onFallback, ritualsDir);
  // T-03-13 / T-03-CR01: with env-first passphrase resolution (CR-01) the
  // child never needs stdin to obtain the passphrase — it reads
  // MRAM_PASSPHRASE via choosePassphraseSource() before ever touching TTY
  // state. Interactive stdin is only needed for the child's on-fallback
  // ask/wait quota prompt, which is only reachable at parallel=1 (enforced
  // by CR-02's resolveEffectiveParallel refusal, see Task 2) — closing the
  // shared-raw-mode-TTY corruption path as defense-in-depth even
  // independent of the child-side fix.
  const childStdin = onFallback === "ask" || onFallback === "wait" ? "inherit" : "ignore";
  return new Promise((resolve, reject) => {
    const child = spawn("npx", args, {
      stdio: [childStdin, "inherit", "inherit"],
      env: { ...process.env, MRAM_PASSPHRASE: passphrase },
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `build-mram-from-dialogue.ts ${slug} exited with ${code}`,
          ),
        );
    });
    child.on("error", reject);
  });
}

export interface BakeResult {
  slug: string;
  ok: boolean;
  error?: string;
}

/**
 * Fan out over `slugs` bounded by `parallelN` concurrent ritual spawns.
 * Does NOT run the validator gate (call runValidatorGate first — kept
 * separate so tests can assert validator-before-spawn ordering directly).
 * On first failure, sets an abort flag so tasks not yet started report
 * "not attempted" instead of spawning on top of a possibly-corrupted
 * state (halt-on-first-failure, adapted for bounded concurrency: tasks
 * already in flight when the failure lands are allowed to finish).
 *
 * WR-02: writes ritual-granularity resume state INCREMENTALLY and
 * UNCONDITIONALLY — immediately after every successful ritual, not just
 * post-hoc at the end of the run, and not gated on `--resume` having
 * been passed. `initialCompleted` seeds the accumulator with any slugs
 * already known complete from a prior interrupted run (so a --resume
 * invocation's incremental writes still preserve that history instead
 * of clobbering it with only this run's newly-baked slugs).
 * writeResumeStateAtomic is synchronous, so the add+write pair for a
 * given task never interleaves with a sibling p-limit task's own
 * add+write — both run on the single Node event loop, and neither await
 * point sits between the Set.add and the synchronous file write.
 */
export async function bakeSelected(
  slugs: string[],
  onFallback: FallbackMode,
  passphrase: string,
  parallelN: number,
  ritualsDir: string = RITUALS_DIR,
  manifestPath: string = MANIFEST_PATH,
  resumeFile: string = RESUME_FILE,
  startedAt: number = Date.now(),
  initialCompleted: Set<string> = new Set(),
): Promise<BakeResult[]> {
  const limit = pLimit(parallelN);
  let aborted = false;
  const results: BakeResult[] = [];
  const completedThisRun = new Set<string>(initialCompleted);

  await Promise.all(
    slugs.map((slug) =>
      limit(async () => {
        if (aborted) {
          results.push({
            slug,
            ok: false,
            error: "not attempted (halted after an earlier failure)",
          });
          return;
        }
        try {
          console.log(`\n→ ${slug}`);
          await bakeRitual(slug, onFallback, passphrase, ritualsDir);
          recordBaked(manifestPath, slug);
          completedThisRun.add(slug);
          writeCompletedSlugs(completedThisRun, startedAt, resumeFile);
          console.log(`  ✓ ${slug} baked.`);
          results.push({ slug, ok: true });
        } catch (err) {
          aborted = true;
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`  ✗ ${slug} failed: ${msg}`);
          results.push({ slug, ok: false, error: msg });
        }
      }),
    ),
  );

  return results;
}

// ============================================================
// Ritual-granularity resume state (see module docstring "Resume
// granularity" note).
// ============================================================
export function loadCompletedSlugs(
  resumeFile: string = RESUME_FILE,
): Set<string> {
  const state: ResumeState | null = readResumeState(resumeFile);
  if (!state || state.ritual !== RESUME_MARKER) return new Set();
  return new Set(state.completedLineIds);
}

function writeCompletedSlugs(
  completed: Set<string>,
  startedAt: number,
  resumeFile: string = RESUME_FILE,
): void {
  writeResumeStateAtomic(resumeFile, {
    ritual: RESUME_MARKER,
    completedLineIds: Array.from(completed),
    inFlightLineIds: [],
    startedAt,
  });
}

function clearResumeStateFile(resumeFile: string = RESUME_FILE): void {
  if (fs.existsSync(resumeFile)) fs.unlinkSync(resumeFile);
}

// ============================================================
// Dry-run roll-up — NO API calls, NO spawns.
// ============================================================
export async function dryRunForRitual(
  slug: string,
  ritualsDir: string = RITUALS_DIR,
  cacheDir: string = CACHE_DIR,
): Promise<void> {
  const plainPath = path.join(ritualsDir, `${slug}-dialogue.md`);
  if (!fs.existsSync(plainPath)) {
    console.log(`  ${slug}: missing ${plainPath}`);
    return;
  }
  const content = fs.readFileSync(plainPath, "utf8");
  const lineCount = content
    .split("\n")
    .filter((l) => l.trim().length > 0 && !l.trim().startsWith("#")).length;
  let opusInCache = 0;
  if (fs.existsSync(cacheDir)) {
    opusInCache = fs
      .readdirSync(cacheDir)
      .filter((f) => f.endsWith(".opus")).length;
  }
  const wouldBakeSeconds = lineCount * 6; // ~6s/line rough estimate
  console.log(
    `  ${slug}: lines≈${lineCount}, cache-entries-present=${opusInCache}, est-seconds-if-all-miss≈${wouldBakeSeconds}`,
  );
}

// ============================================================
// Passphrase — prompted ONCE, passed to children via env only.
// Same raw-stdin idiom as scripts/bake-first-degree.ts's readPassphrase.
// CR-01: env-first via the shared choosePassphraseSource() decision
// function (imported from build-mram-from-dialogue.ts) so the parent's
// own resolution order matches the child's exactly — env always wins
// over an interactive TTY.
// ============================================================
async function readPassphrase(): Promise<string> {
  const source = choosePassphraseSource(
    process.env.MRAM_PASSPHRASE,
    !!process.stdin.isTTY,
  );
  if (source.kind === "env") return source.value;
  if (source.kind === "error") {
    throw new Error(
      "stdin is not a TTY and MRAM_PASSPHRASE env var is not set. " +
        "Run interactively or set MRAM_PASSPHRASE.",
    );
  }

  process.stderr.write("Enter passphrase for all selected .mram files: ");
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

// ============================================================
// Main
// ============================================================
async function main(): Promise<void> {
  const flags = parseFlags(process.argv);
  // CR-02: resolve the conflicting defaults (parallel=4 + on-fallback=
  // "ask") to a safe effective value BEFORE the conflict check — a bare
  // invocation degrades to parallel=1 (ask is legal there); any explicit
  // engagement of either flag resolves to the real --parallel value, so
  // the refusal below is enforced unconditionally on the resolved number.
  const parallelN = resolveEffectiveParallel(flags);

  // CONTEXT.md discretion (b) / T-03-14: interactive pause cannot
  // compose with parallel workers. Always enforced on the RESOLVED
  // value — flag-provenance gating is no longer needed since
  // resolveEffectiveParallel already encodes the safe-default behavior.
  const conflict = checkParallelFallbackConflict(
    parallelN,
    flags.onFallback,
    true,
  );
  if (conflict) {
    console.error(conflict);
    process.exit(1);
  }

  if (flags.sinceFlagPresent) {
    console.warn(sinceDeprecationWarning());
  }

  const slugs = selectSlugs(flags);
  if (slugs.length === 0) {
    console.log("No rituals selected. Nothing to bake.");
    process.exit(0);
  }
  console.log(`\nSelected ${slugs.length} ritual(s): ${slugs.join(", ")}`);

  console.log(`\nRunning cipher/plain validator...`);
  runValidatorGate(slugs);
  console.log(`  ✓ All ${slugs.length} ritual(s) pass the validator.`);

  if (flags.dryRun) {
    console.log(`\n--dry-run: per-ritual roll-up (NO API calls, NO spawns):\n`);
    for (const slug of slugs) await dryRunForRitual(slug);
    console.log(`\nDry-run complete. ${slugs.length} ritual(s) inspected. Zero spawns.`);
    process.exit(0);
  }

  let selected = slugs;
  const completed = flags.resume ? loadCompletedSlugs() : new Set<string>();
  if (flags.resume && completed.size > 0) {
    selected = slugs.filter((s) => !completed.has(s));
    console.log(
      `  [resume] ${completed.size} ritual(s) already completed in a prior run; skipping.`,
    );
    if (selected.length === 0) {
      console.log("All selected rituals already completed. Nothing left to bake.");
      process.exit(0);
    }
  }

  const passphrase = await readPassphrase();
  if (!passphrase) {
    console.error("Error: passphrase cannot be empty.");
    process.exit(1);
  }

  const startedAt = Date.now();
  // WR-02: resume state is now written INCREMENTALLY and UNCONDITIONALLY
  // inside bakeSelected itself (after every successful ritual), so no
  // post-hoc write is needed here. `completed` (populated above only when
  // --resume was passed) seeds the incremental writer so a --resume run's
  // writes preserve prior-run history instead of clobbering it with only
  // this run's newly-baked slugs.
  const results = await bakeSelected(
    selected,
    flags.onFallback,
    passphrase,
    parallelN,
    RITUALS_DIR,
    MANIFEST_PATH,
    RESUME_FILE,
    startedAt,
    completed,
  );

  const failures = results.filter((r) => !r.ok);
  if (failures.length > 0) {
    console.error(
      `\n${failures.length} of ${results.length} selected ritual(s) failed or were not attempted (halt-on-first-failure):`,
    );
    for (const f of failures) console.error(`  ${f.slug}: ${f.error ?? "unknown"}`);
    process.exit(1);
  }

  // CR-03: consolidate this wave's per-slug _INDEX.<slug>.json shards into
  // the canonical _INDEX.json. Runs here, in the single PARENT process,
  // strictly AFTER every child has exited (bakeSelected already resolved
  // above with zero failures) — race-free by construction. Best-effort:
  // if this throws (e.g. permissions), warn but do not fail the bake —
  // the shards remain and readBakeIndex still merges them, so no D-08
  // provenance is lost even when consolidation itself fails.
  try {
    consolidateBakeIndex(CACHE_DIR);
  } catch (err) {
    console.warn(
      `  ! warning: bake-index consolidation failed (shards left in place, readers still merge them): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  if (flags.resume) clearResumeStateFile();
  console.log(
    `\n\x1b[32m✓ All ${selected.length} ritual(s) baked cleanly.\x1b[0m\n`,
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
