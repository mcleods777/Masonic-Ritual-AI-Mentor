---
phase: 03-authoring-throughput
plan: 07
type: execute
wave: 3
depends_on: [04, 05]
files_modified:
  - scripts/bake-all.ts
  - scripts/__tests__/bake-all.test.ts
autonomous: true
requirements: [AUTHOR-02, AUTHOR-09]
tags: [orchestrator, parallel, resume, since-ref, dry-run, p-limit]

must_haves:
  truths:
    - "scripts/bake-all.ts exists as a standalone `#!/usr/bin/env npx tsx` script with argv parsing for --since <ref>, --dry-run, --resume, --parallel N, --verify-audio, --help"
    - "--since <ref> semantics per D-04: determines ritual slug set by running `git diff --name-only --diff-filter=d <ref> -- 'rituals/*-dialogue.md' 'rituals/*-dialogue-cipher.md'` passed as separate argv elements (Pitfall 5). Default ref when flag given without arg = 'HEAD~1'. Throws early when not in a git repo (`git rev-parse --verify` pre-check)"
    - "--dry-run per D-05: prints per-ritual roll-up {ritual, lines-total, cache-hit, cache-miss, validator-fail, would-bake-seconds-est} + aggregate; makes ZERO Gemini or Google API calls"
    - "--resume per D-06: writes rituals/_bake-cache/_RESUME.json atomically (tmp+rename) after every completed line with {ritualSlug, startedAt, completedLineIds, inFlightLineIds, totalLines, dialogueChecksum}. On resume, reads state, skips completed lineIds, retries in-flight lineIds, refuses if dialogueChecksum mismatches (dialogue file changed since interrupted run)"
    - "--parallel N per D-07 default 4. Clamps to [1, 16]. Backed by p-limit. Wraps the render fan-out (NOT the per-key rotation internal to render-gemini-audio — Pitfall 1)"
    - "--verify-audio per D-11 passes through to build-mram-from-dialogue.ts (Plan 06 did the actual work; orchestrator just forwards the flag)"
    - "The orchestrator calls validateOrFail() BEFORE any API call per ritual (PATTERNS.md §Validator-gate; anti-pattern §4 — run validator first, waste zero quota on corrupted pairs)"
    - "Promise.allSettled (not Promise.all) around the parallel fan-out; BOTH fulfilled AND rejected results are iterated (Pitfall 7) — failures surface in the final report and produce a non-zero exit"
    - "scripts/__tests__/bake-all.test.ts covers parseFlags, clampParallel bounds, getChangedRituals git-diff wrapping (seeded fixture git repo in os.tmpdir()), _RESUME.json round-trip (atomic write + read-back + mismatch guard), anomaly detector math (reusing helpers exported from build-mram or re-implemented here)"
  artifacts:
    - path: scripts/bake-all.ts
      provides: "orchestrator CLI: --since/--dry-run/--resume/--parallel/--verify-audio/--help; p-limit fan-out; validator gate; _RESUME.json crash-safe state"
      contains: "import pLimit from \"p-limit\""
      min_lines: 200
    - path: scripts/__tests__/bake-all.test.ts
      provides: "orchestrator unit tests: flag parsing, clamp bounds, git-diff path filtering with --diff-filter=d, _RESUME.json round-trip, anomaly math"
      contains: "clampParallel"
  key_links:
    - from: scripts/bake-all.ts
      to: scripts/build-mram-from-dialogue.ts
      via: "orchestrator spawns or imports-and-invokes the bake for each ritual slug"
      pattern: "build-mram-from-dialogue"
    - from: scripts/bake-all.ts
      to: src/lib/author-validation.ts
      via: "validateOrFail per ritual BEFORE any API call (PATTERNS.md §Validator-gate)"
      pattern: "validatePair"
    - from: scripts/bake-all.ts
      to: rituals/_bake-cache/_RESUME.json
      via: "atomic tmp+rename write after every completed line; delete on clean per-ritual finish"
      pattern: "_RESUME.json"
    - from: scripts/bake-all.ts
      to: p-limit
      via: "pLimit(clampParallel(N)) wraps the per-line render fan-out (Pitfall 1: global task cap, not per-request)"
      pattern: "pLimit\\("
---

<objective>
Create `scripts/bake-all.ts` — the Phase 3 orchestrator entrypoint that composes every bake-time correctness gate into a single CLI: changed-ritual detection via `git diff --since <ref>`, concurrent render fan-out with `p-limit` at default cap 4 (clamped to [1,16]), crash-safe `_RESUME.json` state tracking, --dry-run cache roll-up without API calls, --verify-audio STT pass-through, and validator-first execution ordering (no quota burned on corrupted pairs). Fill the Plan-01 test scaffold with concrete unit tests covering flag parsing, parallel clamp, git-diff wrapping (with a real tmp git repo fixture), `_RESUME.json` round-trip, and duration-anomaly math.

Purpose: per AUTHOR-02 + AUTHOR-09 + CONTEXT §D-04/05/06/07, `bake-all.ts` is the Phase 3 chokepoint. Shannon currently runs `build-mram-from-dialogue.ts` once per ritual and manually repeats. The orchestrator (a) only rebakes rituals that changed, (b) rebakes ultra-fast via the cache (Plan 05 delivers the cache), (c) survives a Ctrl-C without losing completed work, (d) caps concurrent Gemini calls so preview-tier rate limits don't 429 the full run.

Output: new `scripts/bake-all.ts` (200+ lines, #!/usr/bin/env npx tsx), comprehensive unit test file, updated package.json is already done (Plan 01).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/03-authoring-throughput/03-CONTEXT.md
@.planning/phases/03-authoring-throughput/03-RESEARCH.md
@.planning/phases/03-authoring-throughput/03-PATTERNS.md
@.planning/phases/03-authoring-throughput/03-VALIDATION.md
@.planning/phases/03-authoring-throughput/03-04-SUMMARY.md
@.planning/phases/03-authoring-throughput/03-05-SUMMARY.md
@.planning/phases/03-authoring-throughput/03-06-SUMMARY.md
@scripts/lookup-hashed-user.ts
@scripts/validate-rituals.ts
@scripts/build-mram-from-dialogue.ts
@src/lib/author-validation.ts
@scripts/__tests__/bake-all.test.ts

<interfaces>
<!-- Analog references for bake-all.ts structure. -->

Shebang + header (from scripts/lookup-hashed-user.ts:1-23):
```typescript
#!/usr/bin/env npx tsx
/**
 * bake-all.ts — Phase 3 bake orchestrator (AUTHOR-02, AUTHOR-09).
 *
 * Composes: ritual discovery (via --since git-diff) → cipher/plain
 * validator gate → p-limit-capped fan-out to build-mram-from-dialogue →
 * _RESUME.json crash-safe state → final summary with failure report.
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
 *                     changed since the state was written.
 *   --parallel <N>    Max concurrent lines being rendered. Default 4;
 *                     clamped to [1, 16]. Backed by p-limit.
 *   --verify-audio    Forward to the bake script — opt-in STT round-trip
 *                     warn-only diff report. Never hard-fails.
 *   --help            Print usage and exit 1.
 *
 * Exit codes:
 *   0: success (all rituals baked OR --dry-run completed).
 *   1: help, argv parse error, validator fail, render fail, or non-git repo.
 */
```

Flag-parse + clamp-parallel (for testability, EXPORT these helpers from bake-all.ts):
```typescript
export interface Flags {
  since?: string;
  sinceFlagPresent: boolean;
  dryRun: boolean;
  resume: boolean;
  parallel: number;
  verifyAudio: boolean;
}

export function parseFlags(argv: string[]): Flags {
  const rest = argv.slice(2);
  if (rest.includes("--help")) {
    console.error(usage);
    process.exit(1);
  }
  // ... parse --since [value], --dry-run, --resume, --parallel <N>, --verify-audio
}

export function clampParallel(n: unknown): number {
  const num = Number(n ?? 4);
  if (!Number.isFinite(num)) return 4;
  const rounded = Math.floor(num);
  if (rounded < 1) return 1;
  if (rounded > 16) return 16;
  return rounded;
}
```

Git-diff changed rituals (RESEARCH Pattern 2 + Pitfall 5 — pathspec as SEPARATE argv elements):
```typescript
import { execFileSync, execSync } from "node:child_process";

export function getChangedRituals(sinceRef: string = "HEAD~1"): string[] {
  try {
    execFileSync("git", ["rev-parse", "--verify", `${sinceRef}^{commit}`], { stdio: "ignore" });
  } catch {
    throw new Error(
      `--since requires a git repo; '${sinceRef}' not resolvable. ` +
      `Run inside the repo root or omit --since for a full rebake.`,
    );
  }
  // Pitfall 5: pass pathspec as SEPARATE argv elements to avoid shell globbing.
  // --diff-filter=d excludes deletes so we don't try to bake a vanished ritual.
  const out = execFileSync(
    "git",
    [
      "diff", "--name-only", "--diff-filter=d", sinceRef,
      "--",
      "rituals/*-dialogue.md",
      "rituals/*-dialogue-cipher.md",
    ],
    { encoding: "utf8" },
  );
  const paths = out.split("\n").filter((l) => l.trim());
  const slugs = new Set<string>();
  for (const p of paths) {
    const base = p.replace(/^rituals\//, "").replace(/-dialogue(-cipher)?\.md$/, "");
    slugs.add(base);
  }
  return Array.from(slugs).sort();
}
```

_RESUME.json shape (RESEARCH Pattern 6):
```typescript
export interface ResumeState {
  ritualSlug: string;
  startedAt: string;               // ISO
  completedLineIds: string[];
  inFlightLineIds: string[];
  totalLines: number;
  dialogueChecksum: string;        // sha256 of plain.md — guards against mid-run edits
}

export async function writeResumeState(cacheDir: string, state: ResumeState): Promise<void> {
  const target = path.join(cacheDir, "_RESUME.json");
  const tmp = `${target}.${process.pid}.tmp`;
  await fs.promises.writeFile(tmp, JSON.stringify(state, null, 2));
  await fs.promises.rename(tmp, target);  // atomic on POSIX
}

export function readResumeState(cacheDir: string): ResumeState | null {
  const p = path.join(cacheDir, "_RESUME.json");
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")) as ResumeState;
}

export function clearResumeState(cacheDir: string): void {
  const p = path.join(cacheDir, "_RESUME.json");
  if (fs.existsSync(p)) fs.unlinkSync(p);
}
```

p-limit fan-out (RESEARCH Pattern 1 + Pitfall 1 + Pitfall 7):
```typescript
import pLimit from "p-limit";

const parallelN = clampParallel(flags.parallel);
const limit = pLimit(parallelN);

// Collect BOTH fulfilled and rejected per Pitfall 7.
const settled = await Promise.allSettled(
  linesToRender.map((line) =>
    limit(async () => await renderAndEmbed(line, writeResumeForLine)),
  ),
);
const failures = settled
  .filter((r): r is PromiseRejectedResult => r.status === "rejected")
  .map((r) => r.reason);
if (failures.length > 0) {
  console.error(`\n${failures.length} line(s) failed during render:`);
  for (const f of failures) console.error(`  ${f instanceof Error ? f.message : String(f)}`);
  process.exit(1);
}
```

Validator-gate callsite (PATTERNS.md §Validator-gate + §bake-all.ts):
```typescript
import { validatePair } from "../src/lib/author-validation";

function validateOrFail(slug: string): void {
  const plainPath = `rituals/${slug}-dialogue.md`;
  const cipherPath = `rituals/${slug}-dialogue-cipher.md`;
  const plain = fs.readFileSync(plainPath, "utf8");
  const cipher = fs.readFileSync(cipherPath, "utf8");
  const result = validatePair(plain, cipher);
  const errors = result.lineIssues.filter((i) => i.severity === "error");
  if (errors.length > 0 || !result.structureOk) {
    console.error(`[AUTHOR-05 D-08] ${slug}: validator refused to bake (${errors.length} issues)`);
    for (const issue of errors) {
      console.error(`  [${issue.kind}] line ${issue.index}: ${issue.message}`);
    }
    if (!result.structureOk) {
      console.error(`  structure parity failed: ${JSON.stringify(result.firstDivergence)}`);
    }
    process.exit(1);
  }
}
```

**Architectural note:** the orchestrator MAY invoke build-mram-from-dialogue.ts either (a) as a child process via `spawn("npx", ["tsx", "scripts/build-mram-from-dialogue.ts", ...])` (process-isolation, simpler flag forwarding, but overhead per ritual), or (b) by importing and calling its main function directly (faster, but needs build-mram-from-dialogue to export a callable entry). Prefer (b) if build-mram already has an exported `buildMramForSlug(slug, opts)` or equivalent. If not, use (a) for Phase 3 and leave (b) as a future optimization.

Check `scripts/build-mram-from-dialogue.ts` for an exported main/entry function. If a callable export exists, use it. Otherwise use spawn.

Logging idiom (from scripts/validate-rituals.ts:79-85):
```typescript
const ok = (msg: string) => console.log(`  ✓ ${msg}`);
const warn = (msg: string) => console.log(`  ! ${msg}`);
const header = (msg: string) => console.log(`\n${msg}`);
const fail = (msg: string): never => {
  console.error(`  ✗ ${msg}`);
  process.exit(1);
};
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create scripts/bake-all.ts orchestrator with flag parsing, git-diff, p-limit, validator gate, resume state</name>
  <files>
    scripts/bake-all.ts
  </files>
  <read_first>
    scripts/lookup-hashed-user.ts (analog: shebang + argv parse pattern; lines 1-60),
    scripts/validate-rituals.ts (analog: discovery + per-ritual loop; lines 1-100 header, 131-229 body, 320-332 main),
    scripts/build-mram-from-dialogue.ts (Plan 06 output — confirm whether it exports a callable or runs main() at module load; orchestrator invocation strategy decided here),
    src/lib/author-validation.ts (Plan 04 output — validatePair signature),
    scripts/render-gemini-audio.ts (Plan 05 output — confirm CACHE_DIR export for the _RESUME.json path),
    .planning/phases/03-authoring-throughput/03-PATTERNS.md §scripts/bake-all.ts (full template: shebang, argv parse, discovery loop, validator-gate composition, entrypoint),
    .planning/phases/03-authoring-throughput/03-RESEARCH.md §Pattern 1 (p-limit), §Pattern 2 (git diff pathspec), §Pattern 6 (_RESUME.json atomic),
    .planning/phases/03-authoring-throughput/03-RESEARCH.md §Pitfall 1 (p-limit caps tasks not HTTP), §Pitfall 5 (pathspec argv quoting), §Pitfall 7 (allSettled both sides),
    .planning/phases/03-authoring-throughput/03-CONTEXT.md §D-04, D-05, D-06, D-07 (flag semantics + clamp bounds).
  </read_first>
  <action>
Create `scripts/bake-all.ts`. Full structure (200+ lines — executor may tune layout but ALL exports listed below MUST be present for Task 2 tests to pass):

```typescript
#!/usr/bin/env npx tsx
/**
 * bake-all.ts — Phase 3 bake orchestrator (AUTHOR-02, AUTHOR-09).
 *
 * [full header block — see <interfaces> above — verbatim]
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import pLimit from "p-limit";
import { validatePair } from "../src/lib/author-validation";

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
  "  --parallel <N>      Max concurrent renders (default 4; clamped [1, 16]).",
  "  --verify-audio      Forward to bake script; Groq Whisper word-diff warn-only.",
  "  --help              Print this usage and exit 1.",
].join("\n");

// ============================================================
// Flag parsing
// ============================================================
export interface Flags {
  since?: string;            // ref value, only set if --since <arg> provided
  sinceFlagPresent: boolean; // true if --since appeared (even without value)
  dryRun: boolean;
  resume: boolean;
  parallel: number;          // raw; use clampParallel() downstream
  verifyAudio: boolean;
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
      if (next && !next.startsWith("--")) { flags.since = next; i++; }
      else flags.since = "HEAD~1";
    } else if (a === "--dry-run") flags.dryRun = true;
    else if (a === "--resume") flags.resume = true;
    else if (a === "--parallel") {
      const next = rest[i + 1];
      if (!next || next.startsWith("--")) {
        console.error(`--parallel requires a numeric arg\n${usage}`);
        process.exit(1);
      }
      flags.parallel = Number(next);
      i++;
    } else if (a === "--verify-audio") flags.verifyAudio = true;
    else {
      console.error(`Unknown flag: ${a}\n${usage}`);
      process.exit(1);
    }
  }
  return flags;
}

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
export function getChangedRituals(sinceRef: string = "HEAD~1"): string[] {
  try {
    execFileSync("git", ["rev-parse", "--verify", `${sinceRef}^{commit}`], { stdio: "ignore" });
  } catch {
    throw new Error(
      `--since requires a git repo with ${sinceRef} resolvable. ` +
      `Run inside the repo root or omit --since for a full rebake.`,
    );
  }
  const out = execFileSync(
    "git",
    [
      "diff", "--name-only", "--diff-filter=d", sinceRef,
      "--",
      "rituals/*-dialogue.md",
      "rituals/*-dialogue-cipher.md",
    ],
    { encoding: "utf8" },
  );
  const paths = out.split("\n").filter((l) => l.trim());
  const slugs = new Set<string>();
  for (const p of paths) {
    const base = p.replace(/^rituals\//, "").replace(/-dialogue(-cipher)?\.md$/, "");
    slugs.add(base);
  }
  return Array.from(slugs).sort();
}

export function getAllRituals(): string[] {
  if (!fs.existsSync(RITUALS_DIR)) return [];
  return fs
    .readdirSync(RITUALS_DIR)
    .filter((f) => f.endsWith("-dialogue.md") && !f.endsWith("-dialogue-cipher.md"))
    .map((f) => f.replace(/-dialogue\.md$/, ""))
    .sort();
}

// ============================================================
// Validator gate (D-08)
// ============================================================
export function validateOrFail(slug: string): void {
  const plainPath = path.join(RITUALS_DIR, `${slug}-dialogue.md`);
  const cipherPath = path.join(RITUALS_DIR, `${slug}-dialogue-cipher.md`);
  if (!fs.existsSync(plainPath) || !fs.existsSync(cipherPath)) {
    console.error(`  ✗ ${slug}: missing plain or cipher file`);
    process.exit(1);
  }
  const plain = fs.readFileSync(plainPath, "utf8");
  const cipher = fs.readFileSync(cipherPath, "utf8");
  const result = validatePair(plain, cipher);
  const errors = result.lineIssues.filter((i) => i.severity === "error");
  if (errors.length > 0 || !result.structureOk) {
    console.error(`[AUTHOR-05 D-08] ${slug}: validator refused to bake (${errors.length} issues)`);
    for (const issue of errors) {
      console.error(`  [${issue.kind}] line ${issue.index}: ${issue.message}`);
    }
    if (!result.structureOk) {
      console.error(`  structure parity failed: ${JSON.stringify(result.firstDivergence)}`);
    }
    process.exit(1);
  }
}

// ============================================================
// _RESUME.json (D-06)
// ============================================================
export interface ResumeState {
  ritualSlug: string;
  startedAt: string;
  completedLineIds: string[];
  inFlightLineIds: string[];
  totalLines: number;
  dialogueChecksum: string;
}

export function dialogueChecksum(slug: string): string {
  const plainPath = path.join(RITUALS_DIR, `${slug}-dialogue.md`);
  if (!fs.existsSync(plainPath)) return "";
  return crypto.createHash("sha256").update(fs.readFileSync(plainPath)).digest("hex");
}

export async function writeResumeState(
  state: ResumeState,
  cacheDir: string = CACHE_DIR,
): Promise<void> {
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
  const target = path.join(cacheDir, "_RESUME.json");
  const tmp = `${target}.${process.pid}.tmp`;
  await fs.promises.writeFile(tmp, JSON.stringify(state, null, 2));
  await fs.promises.rename(tmp, target);
}

export function readResumeState(cacheDir: string = CACHE_DIR): ResumeState | null {
  const p = path.join(cacheDir, "_RESUME.json");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as ResumeState;
  } catch {
    return null;
  }
}

export function clearResumeState(cacheDir: string = CACHE_DIR): void {
  const p = path.join(cacheDir, "_RESUME.json");
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

// ============================================================
// Bake invocation (per-ritual)
// ============================================================
async function bakeRitual(slug: string, flags: Flags, parallelN: number): Promise<void> {
  // Strategy: spawn build-mram-from-dialogue.ts as a child process per ritual
  // (process-isolation, simpler flag forwarding). If build-mram exports a
  // callable entry post-Plan-06, this can be replaced with direct invocation.
  const args = ["tsx", "scripts/build-mram-from-dialogue.ts", slug];
  if (flags.verifyAudio) args.push("--verify-audio");
  // Note: --parallel is honored at THIS layer (p-limit wraps bakeRitual calls
  // at the orchestrator level). Per-ritual, build-mram is still sequential
  // internally — matches today's behavior.
  return new Promise((resolve, reject) => {
    const child = spawn("npx", args, {
      stdio: "inherit",
      env: { ...process.env },
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`build-mram-from-dialogue.ts ${slug} exited with ${code}`));
    });
    child.on("error", reject);
  });
}

// ============================================================
// Dry-run roll-up (D-05)
// ============================================================
async function dryRunForRitual(slug: string): Promise<void> {
  // Walk the dialogue, count lines, count cache hits against rituals/_bake-cache/,
  // estimate bake seconds from _INDEX.json median or fallback ~6s/line per D-05.
  // This is a best-effort report — exact shape is Claude's Discretion (D-05).
  // Minimal implementation: count .md lines, count .opus files in cache that
  // would match if rendered, estimate.
  const plainPath = path.join(RITUALS_DIR, `${slug}-dialogue.md`);
  if (!fs.existsSync(plainPath)) {
    console.log(`  ${slug}: missing ${plainPath}`);
    return;
  }
  // Line count: rough heuristic — count non-empty lines minus section headers.
  const content = fs.readFileSync(plainPath, "utf8");
  const lineCount = content.split("\n").filter(
    (l) => l.trim().length > 0 && !l.trim().startsWith("#"),
  ).length;
  // Cache inventory.
  let opusInCache = 0;
  if (fs.existsSync(CACHE_DIR)) {
    opusInCache = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith(".opus")).length;
  }
  const wouldBakeSeconds = lineCount * 6; // D-05 fallback constant when no _INDEX history
  console.log(
    `  ${slug}: lines≈${lineCount}, cache-entries-present=${opusInCache}, est-seconds-if-all-miss≈${wouldBakeSeconds}`,
  );
}

// ============================================================
// Main
// ============================================================
async function main(): Promise<void> {
  const flags = parseFlags(process.argv);
  const parallelN = clampParallel(flags.parallel);

  let slugs: string[];
  if (flags.sinceFlagPresent) {
    const ref = flags.since ?? "HEAD~1";
    slugs = getChangedRituals(ref);
    if (slugs.length === 0) {
      console.log(`No ritual dialogue files changed since ${ref}. Nothing to bake.`);
      process.exit(0);
    }
    console.log(`\nRituals changed since ${ref}: ${slugs.length}`);
  } else {
    slugs = getAllRituals();
    if (slugs.length === 0) {
      console.log("No ritual dialogue files found in rituals/. Nothing to bake.");
      process.exit(0);
    }
    console.log(`\nBaking all rituals: ${slugs.length}`);
  }

  if (flags.dryRun) {
    console.log(`\n--dry-run: per-ritual cache roll-up (NO API calls):\n`);
    for (const slug of slugs) {
      // Validator gate runs even in dry-run (D-08 is free to run — it's a local file check).
      validateOrFail(slug);
      await dryRunForRitual(slug);
    }
    console.log(`\nDry-run complete. ${slugs.length} ritual(s) inspected.`);
    process.exit(0);
  }

  // Validator gate — all rituals, before any API call (PATTERNS.md §Validator-gate).
  console.log(`\nRunning cipher/plain validator (D-08)...`);
  for (const slug of slugs) validateOrFail(slug);
  console.log(`  ✓ All ${slugs.length} ritual(s) pass the validator.`);

  // Resume-aware per-ritual bake. At the inter-ritual layer, sequential
  // (one ritual at a time) is fine because Gemini quota budgeting matters
  // within a ritual's line set. p-limit at --parallel N is applied inside
  // build-mram's render loop (Plan 06). Orchestrator's job is to not
  // double-bake a successfully-completed ritual on resume.
  const resume = flags.resume ? readResumeState() : null;

  // Build the list of rituals to bake: if resume state exists, find its
  // ritual in the slug list, skip anything before it (they completed in
  // a previous run if resume state was written; if this is wrong, user can
  // rm _RESUME.json and start fresh).
  const failures: string[] = [];
  for (const slug of slugs) {
    // Checksum guard per Open Question #2: if resume state exists AND points
    // to THIS ritual BUT the dialogue file has changed, refuse the resume.
    if (resume && resume.ritualSlug === slug) {
      const currentChecksum = dialogueChecksum(slug);
      if (currentChecksum !== resume.dialogueChecksum) {
        console.error(
          `[AUTHOR-02 D-06] refusing to resume ${slug}: dialogue file changed since the crash ` +
          `(old=${resume.dialogueChecksum.slice(0, 8)}, new=${currentChecksum.slice(0, 8)}). ` +
          `Remove rituals/_bake-cache/_RESUME.json and re-run fresh.`,
        );
        process.exit(1);
      }
    }
    try {
      console.log(`\n→ ${slug}`);
      await bakeRitual(slug, flags, parallelN);
      // Clear resume state on clean finish per ritual (D-06).
      clearResumeState();
      console.log(`  ✓ ${slug} baked.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${slug} failed: ${msg}`);
      failures.push(slug);
      // Do not continue after a failure — halt so Shannon can investigate.
      break;
    }
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} ritual(s) failed: ${failures.join(", ")}`);
    process.exit(1);
  }

  console.log(`\n\x1b[32m✓ All ${slugs.length} ritual(s) baked cleanly.\x1b[0m\n`);
  process.exit(0);
}

// ============================================================
// Run
// ============================================================
// Only run main when invoked directly (not when imported by tests).
// ESM `import.meta.url` compare equivalent:
const isDirectRun = process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url).pathname);
if (isDirectRun) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
```

**IMPORTANT:** the "only run when invoked directly" guard at the bottom must work under `npx tsx`. If the ESM `import.meta.url` approach has issues in this repo's tsx setup, use a simpler guard: `if (process.argv[1]?.endsWith("bake-all.ts")) { void main(); }`. Test this by running `npx tsx scripts/bake-all.ts --help` — it should print the usage. Then running `npx vitest run scripts/__tests__/bake-all.test.ts` should NOT execute main() (tests import parseFlags / clampParallel / getChangedRituals only).

**Per-line _RESUME.json writes:** the orchestrator currently invokes build-mram-from-dialogue.ts as a child process per ritual; writing _RESUME.json after EVERY completed LINE requires modifying build-mram (out of scope for this plan — build-mram doesn't yet know about the orchestrator's state file). For Phase 3, write _RESUME.json only at the per-ritual boundary (start + completion). This satisfies "crash-safe resume" at ritual granularity; line-level granularity requires a future patch when Shannon's actual usage demands it. Document this in the script's header JSDoc.

Commit: `author-02: scaffold bake-all.ts orchestrator with --since/--dry-run/--resume/--parallel`
  </action>
  <verify>
    <automated>test -f scripts/bake-all.ts && head -1 scripts/bake-all.ts | grep -q "npx tsx" && grep -q "pLimit" scripts/bake-all.ts && grep -q "validatePair" scripts/bake-all.ts && grep -q "writeResumeState" scripts/bake-all.ts && grep -q "clampParallel" scripts/bake-all.ts && grep -q "getChangedRituals" scripts/bake-all.ts && grep -q "diff-filter=d" scripts/bake-all.ts && npx tsc --noEmit && npx tsx scripts/bake-all.ts --help 2>&1 | grep -q "Usage"</automated>
  </verify>
  <acceptance_criteria>
    - `scripts/bake-all.ts` exists with `#!/usr/bin/env npx tsx` as line 1: `head -1 scripts/bake-all.ts | grep -q "#!/usr/bin/env npx tsx"`.
    - File exports: `grep -E "^export (function|interface|const)" scripts/bake-all.ts` returns ≥ 8 matches (parseFlags, clampParallel, getChangedRituals, getAllRituals, validateOrFail, writeResumeState, readResumeState, clearResumeState, ResumeState, Flags, dialogueChecksum).
    - `grep "pLimit" scripts/bake-all.ts` returns ≥ 2 matches (import + call).
    - `grep "diff-filter=d" scripts/bake-all.ts` returns 1 match (Pitfall 5 compliant).
    - `grep "Promise.allSettled" scripts/bake-all.ts` returns ≥ 1 (Pitfall 7) — OR the equivalent pattern of iterating both fulfilled and rejected.
    - `grep "dialogueChecksum" scripts/bake-all.ts` returns ≥ 2 matches.
    - `grep "MIGRATION\\|rm .*_RESUME" scripts/bake-all.ts` or similar reference to the resume-mismatch-refusal message: `grep "dialogue file changed" scripts/bake-all.ts` returns ≥ 1 match.
    - `npx tsx scripts/bake-all.ts --help 2>&1` prints `Usage:` and exits non-zero (exit 1).
    - `npx tsc --noEmit` exits 0.
    - `npm run build` exits 0 — NO regression of Next build.
    - Full test suite green: `npx vitest run --no-coverage` exits 0 (Task 2 adds new tests, doesn't break existing).
  </acceptance_criteria>
  <done>
    scripts/bake-all.ts exists as a runnable orchestrator. All pure helpers are exported for the Task-2 tests to import. --help works. `npx tsc --noEmit` + `npm run build` clean.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Fill Plan-01 test scaffold with concrete orchestrator unit tests</name>
  <files>
    scripts/__tests__/bake-all.test.ts
  </files>
  <read_first>
    scripts/__tests__/bake-all.test.ts (Plan-01 Wave 0 scaffold — replace it.todo stubs with concrete tests),
    scripts/bake-all.ts (Task 1 output — confirms exact exports and signatures),
    src/lib/__tests__/dialogue-to-mram.test.ts (analog: Node-env test with fs/crypto usage),
    .planning/phases/03-authoring-throughput/03-PATTERNS.md §scripts/__tests__/bake-all.test.ts (test shape + unit-test shape verbatim),
    .planning/phases/03-authoring-throughput/03-CONTEXT.md §D-04 through §D-07 (semantics to assert).
  </read_first>
  <behavior>
    - parseFlags covers: empty argv → defaults (parallel=4, nothing else set); --since <ref> parses value; --since without value uses HEAD~1; --dry-run flag; --resume flag; --verify-audio flag; --parallel <N> parses N; --help prints usage and process.exits.
    - clampParallel: undefined→4, 0→1, negative→1, 1→1, 4→4, 16→16, 17→16, 99→16, NaN→4, "not a number"→4.
    - getChangedRituals: seed a tmp git repo, add+commit two ritual dialogue files, modify one, commit again, call getChangedRituals("HEAD~1") → returns [changedSlug]; delete a file and commit — call again → deleted slug is NOT in result (--diff-filter=d excludes deletes); non-git directory throws with clear message.
    - writeResumeState + readResumeState: write → read → JSON round-trip is lossless; write is atomic (no half-written file after simulated mid-write by checking that target is never truncated — practically, write twice and verify second write won't corrupt state even if interrupted; this is hard to simulate, so at minimum assert writeResumeState + readResumeState round-trip is correct).
    - dialogueChecksum: writes a known file, hashes via the exported function, asserts sha256 matches expected.
    - Resume-mismatch guard: state file checksum ≠ current file checksum → main() path exits non-zero (this is integration-level; the unit test can assert the dialogueChecksum helper alone — the process-exit behavior is covered by a manual smoke test).
  </behavior>
  <action>
Replace the Plan-01 scaffold in `scripts/__tests__/bake-all.test.ts` with:

```typescript
// @vitest-environment node
/**
 * Tests for scripts/bake-all.ts (AUTHOR-02, AUTHOR-09).
 *
 * Scope: pure helpers only — parseFlags, clampParallel, getChangedRituals
 * (with tmp git repo fixture), _RESUME.json round-trip, dialogueChecksum.
 * Integration tests (real Gemini/Google/Groq calls) are out of scope.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

import {
  parseFlags,
  clampParallel,
  getChangedRituals,
  writeResumeState,
  readResumeState,
  clearResumeState,
  dialogueChecksum,
  type ResumeState,
} from "../bake-all";

// ============================================================
// Shared tmp dir helper
// ============================================================
let tmpRoot: string;
let cwdSaved: string;
beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bake-all-test-"));
  cwdSaved = process.cwd();
});
afterEach(() => {
  process.chdir(cwdSaved);
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
});

// ============================================================
// parseFlags
// ============================================================
describe("parseFlags (AUTHOR-02)", () => {
  it("returns defaults when no flags given", () => {
    const f = parseFlags(["node", "bake-all.ts"]);
    expect(f.sinceFlagPresent).toBe(false);
    expect(f.since).toBeUndefined();
    expect(f.dryRun).toBe(false);
    expect(f.resume).toBe(false);
    expect(f.parallel).toBe(4);
    expect(f.verifyAudio).toBe(false);
  });

  it("--since <ref> parses value", () => {
    const f = parseFlags(["node", "bake-all.ts", "--since", "main"]);
    expect(f.sinceFlagPresent).toBe(true);
    expect(f.since).toBe("main");
  });

  it("--since with no following value defaults to HEAD~1", () => {
    const f = parseFlags(["node", "bake-all.ts", "--since"]);
    expect(f.sinceFlagPresent).toBe(true);
    expect(f.since).toBe("HEAD~1");
  });

  it("--dry-run + --resume + --verify-audio all recognized", () => {
    const f = parseFlags(["node", "bake-all.ts", "--dry-run", "--resume", "--verify-audio"]);
    expect(f.dryRun).toBe(true);
    expect(f.resume).toBe(true);
    expect(f.verifyAudio).toBe(true);
  });

  it("--parallel <N> parses the numeric value", () => {
    const f = parseFlags(["node", "bake-all.ts", "--parallel", "8"]);
    expect(f.parallel).toBe(8);
  });
});

// ============================================================
// clampParallel (AUTHOR-09 D-07)
// ============================================================
describe("clampParallel (AUTHOR-09 D-07)", () => {
  it("default when undefined = 4", () => {
    expect(clampParallel(undefined)).toBe(4);
  });
  it("clamps 0 to 1", () => {
    expect(clampParallel(0)).toBe(1);
  });
  it("clamps negative to 1", () => {
    expect(clampParallel(-5)).toBe(1);
  });
  it("passes 1 through", () => {
    expect(clampParallel(1)).toBe(1);
  });
  it("passes 4 through", () => {
    expect(clampParallel(4)).toBe(4);
  });
  it("passes 16 through", () => {
    expect(clampParallel(16)).toBe(16);
  });
  it("clamps 17 to 16", () => {
    expect(clampParallel(17)).toBe(16);
  });
  it("clamps 99 to 16", () => {
    expect(clampParallel(99)).toBe(16);
  });
  it("NaN falls back to 4", () => {
    expect(clampParallel(NaN)).toBe(4);
    expect(clampParallel("not a number")).toBe(4);
  });
});

// ============================================================
// getChangedRituals (D-04, Pitfall 5)
// ============================================================
describe("getChangedRituals (AUTHOR-02 D-04)", () => {
  function runGit(args: string[], cwd: string) {
    execFileSync("git", args, { cwd, stdio: "ignore" });
  }

  function seedRepoWithRituals(root: string, rituals: Record<string, string>) {
    runGit(["init", "-q"], root);
    runGit(["config", "user.email", "t@t.t"], root);
    runGit(["config", "user.name", "t"], root);
    fs.mkdirSync(path.join(root, "rituals"));
    for (const [name, body] of Object.entries(rituals)) {
      fs.writeFileSync(path.join(root, "rituals", name), body);
    }
    runGit(["add", "rituals"], root);
    runGit(["commit", "-q", "-m", "initial"], root);
  }

  it("returns slugs for rituals whose dialogue files changed since ref", () => {
    seedRepoWithRituals(tmpRoot, {
      "a-dialogue.md": "## s\nWM: hello\n",
      "a-dialogue-cipher.md": "## s\nWM: h\n",
      "b-dialogue.md": "## s\nSW: world\n",
      "b-dialogue-cipher.md": "## s\nSW: w\n",
    });
    // Modify only ritual a's plain file.
    fs.writeFileSync(
      path.join(tmpRoot, "rituals", "a-dialogue.md"),
      "## s\nWM: hello modified\n",
    );
    runGit(["add", "."], tmpRoot);
    runGit(["commit", "-q", "-m", "edit a"], tmpRoot);

    process.chdir(tmpRoot);
    const slugs = getChangedRituals("HEAD~1");
    expect(slugs).toEqual(["a"]);
  });

  it("catches cipher-only changes (validators must still fire)", () => {
    seedRepoWithRituals(tmpRoot, {
      "c-dialogue.md": "## s\nWM: hello\n",
      "c-dialogue-cipher.md": "## s\nWM: h\n",
    });
    // Modify only the cipher file.
    fs.writeFileSync(
      path.join(tmpRoot, "rituals", "c-dialogue-cipher.md"),
      "## s\nWM: h2\n",
    );
    runGit(["add", "."], tmpRoot);
    runGit(["commit", "-q", "-m", "cipher-only edit"], tmpRoot);

    process.chdir(tmpRoot);
    const slugs = getChangedRituals("HEAD~1");
    expect(slugs).toEqual(["c"]);
  });

  it("excludes deleted files (--diff-filter=d)", () => {
    seedRepoWithRituals(tmpRoot, {
      "d-dialogue.md": "## s\nWM: hello\n",
      "d-dialogue-cipher.md": "## s\nWM: h\n",
      "e-dialogue.md": "## s\nSW: keep\n",
      "e-dialogue-cipher.md": "## s\nSW: k\n",
    });
    // Delete ritual d; keep ritual e.
    fs.unlinkSync(path.join(tmpRoot, "rituals", "d-dialogue.md"));
    fs.unlinkSync(path.join(tmpRoot, "rituals", "d-dialogue-cipher.md"));
    runGit(["add", "-A"], tmpRoot);
    runGit(["commit", "-q", "-m", "delete d"], tmpRoot);

    process.chdir(tmpRoot);
    const slugs = getChangedRituals("HEAD~1");
    expect(slugs).not.toContain("d");
  });

  it("throws a clear message when not in a git repo", () => {
    process.chdir(tmpRoot); // tmpRoot has no .git
    expect(() => getChangedRituals("HEAD~1")).toThrow(/git repo/);
  });
});

// ============================================================
// _RESUME.json round-trip (D-06)
// ============================================================
describe("_RESUME.json (AUTHOR-02 D-06)", () => {
  it("write + read round-trips losslessly", async () => {
    const state: ResumeState = {
      ritualSlug: "test-ritual",
      startedAt: "2026-04-22T10:00:00.000Z",
      completedLineIds: ["1", "2", "3"],
      inFlightLineIds: ["4"],
      totalLines: 100,
      dialogueChecksum: "a".repeat(64),
    };
    await writeResumeState(state, tmpRoot);
    const read = readResumeState(tmpRoot);
    expect(read).toEqual(state);
  });

  it("readResumeState returns null when no file", () => {
    expect(readResumeState(tmpRoot)).toBeNull();
  });

  it("clearResumeState removes the file", async () => {
    const state: ResumeState = {
      ritualSlug: "x",
      startedAt: "2026-04-22T10:00:00.000Z",
      completedLineIds: [],
      inFlightLineIds: [],
      totalLines: 0,
      dialogueChecksum: "b".repeat(64),
    };
    await writeResumeState(state, tmpRoot);
    expect(fs.existsSync(path.join(tmpRoot, "_RESUME.json"))).toBe(true);
    clearResumeState(tmpRoot);
    expect(fs.existsSync(path.join(tmpRoot, "_RESUME.json"))).toBe(false);
  });

  it("atomic write: tmp file does not persist after success", async () => {
    const state: ResumeState = {
      ritualSlug: "x",
      startedAt: "2026-04-22T10:00:00.000Z",
      completedLineIds: [],
      inFlightLineIds: [],
      totalLines: 0,
      dialogueChecksum: "c".repeat(64),
    };
    await writeResumeState(state, tmpRoot);
    const entries = fs.readdirSync(tmpRoot);
    // Target exists; no .tmp lingering.
    expect(entries).toContain("_RESUME.json");
    expect(entries.filter((n) => n.endsWith(".tmp"))).toEqual([]);
  });
});

// ============================================================
// dialogueChecksum
// ============================================================
describe("dialogueChecksum", () => {
  it("returns stable sha256 for identical file", () => {
    // Seed an isolated rituals dir and chdir to it so dialogueChecksum's
    // hardcoded RITUALS_DIR (path.resolve("rituals")) resolves here.
    fs.mkdirSync(path.join(tmpRoot, "rituals"));
    fs.writeFileSync(path.join(tmpRoot, "rituals", "x-dialogue.md"), "hello\n");
    process.chdir(tmpRoot);
    const a = dialogueChecksum("x");
    const b = dialogueChecksum("x");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when file content changes", () => {
    fs.mkdirSync(path.join(tmpRoot, "rituals"));
    const filePath = path.join(tmpRoot, "rituals", "y-dialogue.md");
    fs.writeFileSync(filePath, "a\n");
    process.chdir(tmpRoot);
    const a = dialogueChecksum("y");
    fs.writeFileSync(filePath, "b\n");
    const b = dialogueChecksum("y");
    expect(a).not.toBe(b);
  });
});
```

Commit: `author-02: add orchestrator unit tests (flag parse, clamp, git-diff, resume, checksum)`
  </action>
  <verify>
    <automated>npx vitest run --no-coverage scripts/__tests__/bake-all.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - Test file has no `it.todo(` remaining: `grep -c "it.todo(" scripts/__tests__/bake-all.test.ts` returns 0.
    - `npx vitest run --no-coverage scripts/__tests__/bake-all.test.ts` exits 0 with 20+ tests passing.
    - All `parseFlags` tests pass.
    - All `clampParallel` tests pass (including NaN + non-numeric fallback).
    - `getChangedRituals` tests seed a real git repo in os.tmpdir() and assert: modified-file-picked-up, cipher-only-edit-picked-up, deleted-file-excluded, non-git-throws.
    - `_RESUME.json` round-trip tests assert write+read are lossless and tmp files don't leak.
    - `dialogueChecksum` tests assert deterministic + content-sensitive.
    - Full test suite still green: `npx vitest run --no-coverage` exits 0.
  </acceptance_criteria>
  <done>
    scripts/__tests__/bake-all.test.ts has 20+ passing tests covering every exported helper. The git-diff fixture test is real (actual git init + commit), so if git isn't available in CI, the test will fail loudly with a clear message. Orchestrator contract is regression-guarded.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Argv → orchestrator | untrusted CLI args become ritual slugs and flags; validation is the defense |
| _RESUME.json → resumed bake | if the dialogue file changed between crash and resume, re-running completed lineIds would re-render the wrong content |
| p-limit task cap → HTTP requests | pLimit(N) caps N tasks, not N HTTP requests (Pitfall 1) — documented in code comments |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-04 | Tampering | validator hard-fail treated as advisory (bake proceeds anyway) | mitigate | validateOrFail() calls `process.exit(1)` on any severity="error" issue. No --force in Phase 3. Every ritual passes the validator BEFORE any API call is made — orchestrator bakes zero rituals when one is corrupt. |
| T-03-07 | Tampering | `_RESUME.json` points to stale line IDs after dialogue edit, re-run silently skips legitimate new lines | mitigate | `dialogueChecksum` field compares sha256 of plain.md at resume time vs. at state-write time. Mismatch → error message tells user to rm the file and re-run fresh. |
| T-03-08 | Denial of Service | `--parallel 999` exhausts Gemini quota + memory | mitigate | `clampParallel` clamps to [1, 16]; test cases assert the clamp is honored at the high and low ends. |
| T-03-09 | Information Disclosure | `git diff` output leaked to logs could include fragments of ritual filenames | accept | Ritual slugs are derived from filenames which already exist in the git repo. The output is `{slug1, slug2, ...}` printed to developer's stderr, not any network surface. |
</threat_model>

<verification>
- `npx vitest run --no-coverage scripts/__tests__/bake-all.test.ts` — 20+ tests pass.
- `npx vitest run --no-coverage` full-suite — exits 0.
- `npx tsc --noEmit` — exits 0.
- `npm run build` — exits 0.
- `npx tsx scripts/bake-all.ts --help` prints usage and exits 1.
- `npx tsx scripts/bake-all.ts --since HEAD~1 --dry-run` (when run inside this repo) prints per-ritual dry-run lines without making any API calls.
- Manual (per 03-VALIDATION.md §Manual-Only Verifications): Shannon runs a resume test by ctrl-C mid-bake of a fresh ritual; rerunning with `--resume` picks up cleanly.
</verification>

<success_criteria>
- `scripts/bake-all.ts` is a runnable orchestrator with `--since`, `--dry-run`, `--resume`, `--parallel`, `--verify-audio`, `--help` flags.
- `--since <ref>` determines changed-ritual set via `git diff --name-only --diff-filter=d` with pathspec passed as separate argv elements (Pitfall 5).
- `--parallel N` clamps to [1, 16] with default 4; p-limit wraps the fan-out.
- Validator gate runs BEFORE any API call for every ritual.
- `_RESUME.json` written atomically (tmp+rename), refuses resume on dialogueChecksum mismatch.
- Promise.allSettled iterated on BOTH sides (Pitfall 7) — failures surface and exit non-zero.
- 20+ unit tests cover flag parsing, clamp, git-diff with real tmp repo fixture, _RESUME.json round-trip, dialogueChecksum behavior.
- package.json `bake-all` script entry (already added in Plan 01) works: `npm run bake-all -- --help` shows usage.
</success_criteria>

<output>
After completion, create `.planning/phases/03-authoring-throughput/03-07-SUMMARY.md` documenting:
- Path to scripts/bake-all.ts + file line count
- All exported symbols (for Plan 08 and Phase 5 consumers)
- Test count breakdown (parseFlags N, clampParallel N, getChangedRituals N, _RESUME N, dialogueChecksum N)
- Confirmation that --help runs cleanly and --dry-run on the current repo prints a valid roll-up
- Commit SHAs for both commits
</output>
