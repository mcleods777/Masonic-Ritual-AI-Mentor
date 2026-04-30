#!/usr/bin/env npx tsx
/**
 * verify-content.ts — local-only release gate (CONTENT-07).
 *
 * Runs `validatePair()` + `checkAudioCoverage()` across every `.mram` in
 * a rituals directory. Because rituals/*.md and *.mram are gitignored
 * (copyright; see .gitignore:110-115), this gate is LOCAL-only — no CI
 * workflow can see the content.
 *
 * Usage:
 *   npx tsx scripts/verify-content.ts
 *   npx tsx scripts/verify-content.ts --rituals-dir /tmp/alt-rituals
 *   npx tsx scripts/verify-content.ts --json
 *   npm run verify-content
 *
 * Behaviour:
 *   - Discover every `{slug}.mram` in <rituals-dir>.
 *   - For each .mram:
 *       1. Pair with `{slug}-dialogue.md` + `{slug}-dialogue-cipher.md`.
 *          Missing → record `missing-dialogue-pair`, continue.
 *       2. Run `validatePair(plain, cipher)`. Any `severity: 'error'` →
 *          record `validator-fail`, continue.
 *       3. Decrypt .mram with MRAM_PASSPHRASE (prompted once).
 *       4. Run `checkAudioCoverage(doc)`. Any failure → record
 *          `audio-coverage-fail`, continue.
 *   - Aggregate into a per-ritual pass/fail table. Print. Exit 1 on any
 *     failure, 0 on all-pass.
 *
 * Does NOT abort on first failure — every ritual is checked so Shannon
 * sees the full picture in one run (tied to verify-content.test.ts Test 5).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { validatePair } from "../src/lib/author-validation";
import {
  decryptMRAM,
  promptPassphrase,
  checkAudioCoverage,
  type CoverageFailure,
} from "./verify-mram";

// ============================================================
// Flag parsing
// ============================================================

interface Flags {
  ritualsDir: string;
  json: boolean;
  help: boolean;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {
    ritualsDir: path.resolve("rituals"),
    json: false,
    help: false,
  };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--rituals-dir") {
      const next = args[i + 1];
      if (!next || next.startsWith("--")) {
        throw new Error("--rituals-dir requires a path arg");
      }
      flags.ritualsDir = path.resolve(next);
      i++;
    } else if (a === "--json") {
      flags.json = true;
    } else if (a === "--help" || a === "-h") {
      flags.help = true;
    } else {
      throw new Error(`Unknown flag: ${a}`);
    }
  }
  return flags;
}

const USAGE = [
  "Usage: npx tsx scripts/verify-content.ts [flags]",
  "       npm run verify-content [-- flags]",
  "",
  "Flags:",
  "  --rituals-dir <path>  Directory containing *.mram + *-dialogue.md pairs.",
  "                        Default: ./rituals",
  "  --json                Print machine-readable summary (no colour, no text).",
  "  --help, -h            Print this usage and exit 0.",
  "",
  "Environment:",
  "  MRAM_PASSPHRASE       If set, used without prompting. Otherwise prompts once.",
  "",
  "Exit codes:",
  "  0  All rituals pass validator + audio-coverage.",
  "  1  At least one ritual fails (see summary table).",
].join("\n");

// ============================================================
// Discovery
// ============================================================

/** Return sorted ritual slugs (basename of *.mram). Excludes the
 *  _bake-cache/ subdirectory contents. */
function discoverRituals(ritualsDir: string): string[] {
  if (!fs.existsSync(ritualsDir)) return [];
  return fs
    .readdirSync(ritualsDir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(".mram"))
    .map((d) => d.name.replace(/\.mram$/, ""))
    .sort();
}

// ============================================================
// Per-ritual check
// ============================================================

type RitualFailureReason =
  | "missing-dialogue-pair"
  | "validator-fail"
  | "audio-coverage-fail"
  | "decrypt-fail";

interface RitualResult {
  slug: string;
  pass: boolean;
  reason?: RitualFailureReason;
  validatorErrors?: { kind: string; index: number; message: string }[];
  coverageFailures?: CoverageFailure[];
  errorMessage?: string;
}

async function checkOneRitual(
  slug: string,
  ritualsDir: string,
  passphrase: string,
): Promise<RitualResult> {
  const plainPath = path.join(ritualsDir, `${slug}-dialogue.md`);
  const cipherPath = path.join(ritualsDir, `${slug}-dialogue-cipher.md`);
  const mramPath = path.join(ritualsDir, `${slug}.mram`);

  // --- Step 1: pair resolution ---
  if (!fs.existsSync(plainPath) || !fs.existsSync(cipherPath)) {
    return {
      slug,
      pass: false,
      reason: "missing-dialogue-pair",
      errorMessage: `missing ${fs.existsSync(plainPath) ? cipherPath : plainPath}`,
    };
  }

  // --- Step 2: validatePair ---
  const plain = fs.readFileSync(plainPath, "utf8");
  const cipher = fs.readFileSync(cipherPath, "utf8");
  const validatorResult = validatePair(plain, cipher);
  const errorIssues = validatorResult.lineIssues.filter(
    (i) => i.severity === "error",
  );
  if (errorIssues.length > 0 || !validatorResult.structureOk) {
    return {
      slug,
      pass: false,
      reason: "validator-fail",
      validatorErrors: errorIssues.map((i) => ({
        kind: i.kind,
        index: i.index,
        message: i.message,
      })),
    };
  }

  // --- Step 3: decrypt ---
  let doc;
  try {
    const buffer = fs.readFileSync(mramPath);
    doc = decryptMRAM(buffer, passphrase);
  } catch (err) {
    return {
      slug,
      pass: false,
      reason: "decrypt-fail",
      errorMessage: (err as Error).message,
    };
  }

  // --- Step 4: checkAudioCoverage ---
  const coverage = await checkAudioCoverage(doc);
  if (!coverage.pass) {
    return {
      slug,
      pass: false,
      reason: "audio-coverage-fail",
      coverageFailures: coverage.failures,
    };
  }

  return { slug, pass: true };
}

// ============================================================
// Rendering
// ============================================================

function renderHumanTable(results: RitualResult[]): void {
  console.log("\n=== Release Gate Summary ===\n");
  const maxSlug = Math.max(12, ...results.map((r) => r.slug.length));
  console.log(
    `  ${"RITUAL".padEnd(maxSlug)}  STATUS  REASON`,
  );
  console.log(`  ${"-".repeat(maxSlug)}  ------  ------`);
  for (const r of results) {
    const status = r.pass
      ? "\x1b[32mPASS\x1b[0m"
      : "\x1b[31mFAIL\x1b[0m";
    const reason = r.pass ? "" : r.reason ?? "unknown";
    console.log(`  ${r.slug.padEnd(maxSlug)}  ${status}    ${reason}`);
  }
  console.log("");

  // Per-failure detail (indented).
  const failures = results.filter((r) => !r.pass);
  for (const f of failures) {
    console.log(`  ── ${f.slug}: ${f.reason}`);
    if (f.errorMessage) {
      console.log(`     ${f.errorMessage}`);
    }
    if (f.validatorErrors) {
      for (const e of f.validatorErrors.slice(0, 10)) {
        console.log(`     [${e.kind}] line ${e.index}: ${e.message}`);
      }
      if (f.validatorErrors.length > 10) {
        console.log(`     ... +${f.validatorErrors.length - 10} more`);
      }
    }
    if (f.coverageFailures) {
      for (const c of f.coverageFailures.slice(0, 10)) {
        console.log(`     [${c.kind}] line ${c.lineId}: ${c.message}`);
      }
      if (f.coverageFailures.length > 10) {
        console.log(`     ... +${f.coverageFailures.length - 10} more`);
      }
    }
  }

  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  console.log(
    `\nResult: ${passed}/${total} rituals passed${
      passed === total ? " — release gate GREEN." : " — release gate RED."
    }\n`,
  );
}

function renderJson(results: RitualResult[]): void {
  const out = {
    totalRituals: results.length,
    passed: results.filter((r) => r.pass).length,
    failed: results.filter((r) => !r.pass).length,
    rituals: results.map((r) => ({
      slug: r.slug,
      pass: r.pass,
      reason: r.reason,
      validatorErrors: r.validatorErrors,
      coverageFailures: r.coverageFailures,
      errorMessage: r.errorMessage,
    })),
  };
  console.log(JSON.stringify(out, null, 2));
}

// ============================================================
// Main
// ============================================================

export async function main(): Promise<void> {
  let flags: Flags;
  try {
    flags = parseFlags(process.argv);
  } catch (err) {
    console.error((err as Error).message);
    console.error(USAGE);
    process.exit(1);
  }

  if (flags.help) {
    console.log(USAGE);
    process.exit(0);
  }

  const slugs = discoverRituals(flags.ritualsDir);
  if (slugs.length === 0) {
    console.log(
      `No .mram files found in ${flags.ritualsDir}. Nothing to verify.`,
    );
    process.exit(0);
  }

  // Prompt ONCE per P10 invariant — reuse across every ritual.
  const passphrase = await promptPassphrase();

  const results: RitualResult[] = [];
  for (const slug of slugs) {
    try {
      const r = await checkOneRitual(slug, flags.ritualsDir, passphrase);
      results.push(r);
    } catch (err) {
      // Unexpected error — record and continue so aggregate still surfaces.
      results.push({
        slug,
        pass: false,
        reason: "decrypt-fail",
        errorMessage: `unexpected: ${(err as Error).message}`,
      });
    }
  }

  if (flags.json) {
    renderJson(results);
  } else {
    renderHumanTable(results);
  }

  const anyFailure = results.some((r) => !r.pass);
  process.exit(anyFailure ? 1 : 0);
}

// ============================================================
// Run — only when invoked directly (tests import without triggering main)
// ============================================================
const isDirectRun =
  process.argv[1]?.endsWith("verify-content.ts") ?? false;
if (isDirectRun) {
  main().catch((err) => {
    console.error("\x1b[31mFatal error:\x1b[0m", err.message);
    process.exit(1);
  });
}
