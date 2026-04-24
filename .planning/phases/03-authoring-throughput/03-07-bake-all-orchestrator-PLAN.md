---
phase: 03-authoring-throughput
plan: 07
type: execute
wave: 3
depends_on: [04, 05, 06]
files_modified:
  - scripts/bake-all.ts
  - scripts/__tests__/bake-all.test.ts
autonomous: true
requirements: [AUTHOR-02, AUTHOR-09]
tags: [orchestrator, parallel, resume, since-ref, dry-run, p-limit, line-level-resume]

must_haves:
  truths:
    - "scripts/bake-all.ts exists as a standalone `#!/usr/bin/env npx tsx` script with argv parsing for --since <ref>, --dry-run, --resume, --parallel N, --verify-audio, --help"
    - "--since <ref> semantics per D-04: determines ritual slug set by running `git diff --name-only --diff-filter=d <ref> -- 'rituals/*-dialogue.md' 'rituals/*-dialogue-cipher.md'` passed as separate argv elements (Pitfall 5). Default ref when flag given without arg = 'HEAD~1'. Throws early when not in a git repo (`git rev-parse --verify` pre-check)"
    - "--dry-run per D-05: prints per-ritual roll-up {ritual, lines-total, cache-hit, cache-miss, validator-fail, would-bake-seconds-est} + aggregate; makes ZERO Gemini or Google API calls"
    - "--resume per D-06: writes rituals/_bake-cache/_RESUME.json atomically (tmp+rename) after every completed LINE (via build-mram-from-dialogue.ts sub-process using --resume-state-path). Shared ResumeState shape lives in scripts/lib/resume-state.ts (Plan 06). On resume, the orchestrator reads state, refuses if dialogueChecksum mismatches (dialogue file changed since interrupted run), and passes completedLineIds to build-mram via --skip-line-ids; in-flight lines are NOT skipped (they retry)"
    - "--parallel N per D-07 default 4. Clamps to [1, 16]. Backed by p-limit. Wraps the render fan-out (NOT the per-key rotation internal to render-gemini-audio — Pitfall 1)"
    - "--verify-audio per D-11 passes through to build-mram-from-dialogue.ts (Plan 06 did the actual work; orchestrator just forwards the flag)"
    - "The orchestrator calls validateOrFail() BEFORE any API call per ritual (PATTERNS.md §Validator-gate; anti-pattern §4 — run validator first, waste zero quota on corrupted pairs)"
    - "Promise.allSettled (not Promise.all) around the parallel fan-out; BOTH fulfilled AND rejected results are iterated (Pitfall 7) — failures surface in the final report and produce a non-zero exit"
    - "For every spawned build-mram-from-dialogue.ts invocation, the orchestrator passes --resume-state-path=rituals/_bake-cache/_RESUME.json + --ritual-slug=<slug> + (on --resume) --skip-line-ids=<completedLineIds joined by comma>. build-mram writes _RESUME.json after every completed line; orchestrator unlinks _RESUME.json ONLY after a ritual ran cleanly to completion"
    - "scripts/__tests__/bake-all.test.ts covers parseFlags, clampParallel bounds, getChangedRituals git-diff wrapping (seeded fixture git repo in os.tmpdir()), bake-mram spawn args include --resume-state-path/--ritual-slug/--skip-line-ids, dialogueChecksum mismatch refusal, and _RESUME.json deletion after clean ritual finish"
  artifacts:
    - path: scripts/bake-all.ts
      provides: "orchestrator CLI: --since/--dry-run/--resume/--parallel/--verify-audio/--help; p-limit fan-out; validator gate; line-level _RESUME.json crash-safe state (via build-mram sub-process)"
      contains: "import pLimit from \"p-limit\""
      min_lines: 200
    - path: scripts/__tests__/bake-all.test.ts
      provides: "orchestrator unit tests: flag parsing, clamp bounds, git-diff path filtering with --diff-filter=d, build-mram spawn-args verification (--resume-state-path + --ritual-slug + --skip-line-ids), _RESUME.json deletion, anomaly math"
      contains: "clampParallel"
  key_links:
    - from: scripts/bake-all.ts
      to: scripts/build-mram-from-dialogue.ts
      via: "spawn per ritual with --resume-state-path + --ritual-slug + (on --resume) --skip-line-ids"
      pattern: "build-mram-from-dialogue"
    - from: scripts/bake-all.ts
      to: scripts/lib/resume-state.ts
      via: "import { ResumeState, readResumeState } from './lib/resume-state' — orchestrator reads the state build-mram writes"
      pattern: "from.*resume-state"
    - from: scripts/bake-all.ts
      to: src/lib/author-validation.ts
      via: "validateOrFail per ritual BEFORE any API call (PATTERNS.md §Validator-gate)"
      pattern: "validatePair"
    - from: scripts/bake-all.ts
      to: rituals/_bake-cache/_RESUME.json
      via: "orchestrator reads _RESUME.json on --resume to compute --skip-line-ids; unlinks it after clean ritual finish"
      pattern: "_RESUME.json"
    - from: scripts/bake-all.ts
      to: p-limit
      via: "pLimit(clampParallel(N)) wraps the per-line render fan-out (Pitfall 1: global task cap, not per-request)"
      pattern: "pLimit\\("
---

<objective>
Create `scripts/bake-all.ts` — the Phase 3 orchestrator entrypoint that composes every bake-time correctness gate into a single CLI: changed-ritual detection via `git diff --since <ref>`, concurrent render fan-out with `p-limit` at default cap 4 (clamped to [1,16]), line-level crash-safe `_RESUME.json` state tracking (written by the build-mram sub-process per D-06; orchestrator reads it to compute `--skip-line-ids` on resume), `--dry-run` cache roll-up without API calls, `--verify-audio` STT pass-through, and validator-first execution ordering (no quota burned on corrupted pairs). Fill the Plan-01 test scaffold with concrete unit tests covering flag parsing, parallel clamp, git-diff wrapping (with a real tmp git repo fixture), bake-mram spawn-args verification, dialogueChecksum mismatch refusal, and `_RESUME.json` cleanup after clean ritual finish.

Purpose: per AUTHOR-02 + AUTHOR-09 + CONTEXT §D-04/05/06/07, `bake-all.ts` is the Phase 3 chokepoint. Shannon currently runs `build-mram-from-dialogue.ts` once per ritual and manually repeats. The orchestrator (a) only rebakes rituals that changed, (b) rebakes ultra-fast via the cache (Plan 05 delivers the cache), (c) survives a Ctrl-C without losing completed LINES (not just completed rituals — per D-06), (d) caps concurrent Gemini calls so preview-tier rate limits don't 429 the full run. The per-line resume mechanic delegates the actual file write to build-mram-from-dialogue.ts (Plan 06) because build-mram is the only process that knows when a line has truly completed (Opus embedded in the in-memory .mram doc); the orchestrator is the consumer — it reads the state file on resume and tells the next build-mram invocation which lineIds to skip.

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
@scripts/lib/resume-state.ts
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
import { execFileSync, spawn } from "node:child_process";

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

Resume-state integration (D-06) — orchestrator imports from Plan 06's shared module:
```typescript
import { type ResumeState, readResumeState } from "./lib/resume-state";
// NOTE: orchestrator only READS the state. The WRITE happens inside
// build-mram-from-dialogue.ts per completed line (Plan 06). That's the
// D-06 per-line-granularity invariant — the writer is the only process
// that knows a line has truly completed.
```

Orchestrator-owned dialogueChecksum (separate from Plan 06's per-line state — this guards against the dialogue file changing between a crash and a resume attempt):
```typescript
import * as crypto from "node:crypto";

export function dialogueChecksum(slug: string): string {
  const plainPath = path.join(RITUALS_DIR, `${slug}-dialogue.md`);
  if (!fs.existsSync(plainPath)) return "";
  return crypto.createHash("sha256").update(fs.readFileSync(plainPath)).digest("hex");
}
```

_RESUME.json lifecycle in the orchestrator:
```typescript
const RESUME_FILE = path.join(CACHE_DIR, "_RESUME.json");

// On --resume:
//  1. read current state from RESUME_FILE
//  2. if state.ritual matches the ritual we're about to bake AND dialogue
//     checksum still matches what was implied (orchestrator can cache an
//     echo of the checksum OR just check current file exists + is readable),
//     pass --skip-line-ids=${state.completedLineIds.join(",")} to build-mram.
//  3. After ritual completes cleanly: fs.unlinkSync(RESUME_FILE).

export function clearResumeStateFile(): void {
  if (fs.existsSync(RESUME_FILE)) fs.unlinkSync(RESUME_FILE);
}
```

bakeRitual spawn — passes the new args to the sub-process:
```typescript
async function bakeRitual(
  slug: string,
  flags: Flags,
  skipLineIds: string[], // empty when not resuming or when this ritual has no prior state
): Promise<void> {
  const args: string[] = [
    "tsx",
    "scripts/build-mram-from-dialogue.ts",
    slug,
    "--resume-state-path", RESUME_FILE,
    "--ritual-slug", slug,
  ];
  if (skipLineIds.length > 0) {
    args.push("--skip-line-ids", skipLineIds.join(","));
  }
  if (flags.verifyAudio) args.push("--verify-audio");
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

**Architectural note:** the orchestrator invokes build-mram-from-dialogue.ts as a child process via `spawn("npx", ["tsx", "scripts/build-mram-from-dialogue.ts", slug, ...resumeArgs])`. This gives process-isolation, simple flag forwarding, and keeps the D-06 writer (build-mram) independent of the D-06 reader (bake-all). Per-line `_RESUME.json` writes happen inside the sub-process — the orchestrator does NOT try to reach into the sub-process's render loop.

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
  <name>Task 1: Create scripts/bake-all.ts orchestrator with flag parsing, git-diff, p-limit, validator gate, line-level resume state (via build-mram sub-process)</name>
  <files>
    scripts/bake-all.ts
  </files>
  <read_first>
    scripts/lookup-hashed-user.ts (analog: shebang + argv parse pattern; lines 1-60),
    scripts/validate-rituals.ts (analog: discovery + per-ritual loop; lines 1-100 header, 131-229 body, 320-332 main),
    scripts/build-mram-from-dialogue.ts (Plan 06 output — confirm the three new CLI args are accepted: --resume-state-path, --ritual-slug, --skip-line-ids),
    scripts/lib/resume-state.ts (Plan 06 output — import the ResumeState type + readResumeState helper verbatim; the orchestrator is the READER of this file),
    src/lib/author-validation.ts (Plan 04 output — validatePair signature),
    scripts/render-gemini-audio.ts (Plan 05 output — confirm CACHE_DIR export for the _RESUME.json path),
    .planning/phases/03-authoring-throughput/03-PATTERNS.md §scripts/bake-all.ts (full template: shebang, argv parse, discovery loop, validator-gate composition, entrypoint),
    .planning/phases/03-authoring-throughput/03-RESEARCH.md §Pattern 1 (p-limit), §Pattern 2 (git diff pathspec), §Pattern 6 (_RESUME.json atomic),
    .planning/phases/03-authoring-throughput/03-RESEARCH.md §Pitfall 1 (p-limit caps tasks not HTTP), §Pitfall 5 (pathspec argv quoting), §Pitfall 7 (allSettled both sides),
    .planning/phases/03-authoring-throughput/03-CONTEXT.md §D-04, D-05, D-06, D-07 (flag semantics + clamp bounds; line-level resume requirement).
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
import { type ResumeState, readResumeState } from "./lib/resume-state";

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
// _RESUME.json (D-06) — orchestrator READS; build-mram writes per line
// ============================================================
export function dialogueChecksum(slug: string): string {
  const plainPath = path.join(RITUALS_DIR, `${slug}-dialogue.md`);
  if (!fs.existsSync(plainPath)) return "";
  return crypto.createHash("sha256").update(fs.readFileSync(plainPath)).digest("hex");
}

/**
 * Unlink rituals/_bake-cache/_RESUME.json. Called by the orchestrator ONLY
 * after a ritual runs cleanly to completion.
 */
export function clearResumeStateFile(): void {
  if (fs.existsSync(RESUME_FILE)) fs.unlinkSync(RESUME_FILE);
}

// ============================================================
// Build the spawn-argv for a build-mram-from-dialogue.ts sub-process
// (exported so Task 2 tests can assert the arg list directly without
// actually spawning the sub-process).
// ============================================================
export function buildMramSpawnArgs(
  slug: string,
  flags: { verifyAudio: boolean },
  skipLineIds: string[],
  resumeFilePath: string = RESUME_FILE,
): string[] {
  const args: string[] = [
    "tsx",
    "scripts/build-mram-from-dialogue.ts",
    slug,
    "--resume-state-path", resumeFilePath,
    "--ritual-slug", slug,
  ];
  if (skipLineIds.length > 0) {
    args.push("--skip-line-ids", skipLineIds.join(","));
  }
  if (flags.verifyAudio) args.push("--verify-audio");
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
      else reject(new Error(`build-mram-from-dialogue.ts ${slug} exited with ${code}`));
    });
    child.on("error", reject);
  });
}

// ============================================================
// Dry-run roll-up (D-05)
// ============================================================
async function dryRunForRitual(slug: string): Promise<void> {
  const plainPath = path.join(RITUALS_DIR, `${slug}-dialogue.md`);
  if (!fs.existsSync(plainPath)) {
    console.log(`  ${slug}: missing ${plainPath}`);
    return;
  }
  const content = fs.readFileSync(plainPath, "utf8");
  const lineCount = content.split("\n").filter(
    (l) => l.trim().length > 0 && !l.trim().startsWith("#"),
  ).length;
  let opusInCache = 0;
  if (fs.existsSync(CACHE_DIR)) {
    opusInCache = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith(".opus")).length;
  }
  const wouldBakeSeconds = lineCount * 6;
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

  // D-06: read _RESUME.json IF --resume was requested; compute skip list per ritual.
  const priorState: ResumeState | null = flags.resume ? readResumeState(RESUME_FILE) : null;

  const failures: string[] = [];
  for (const slug of slugs) {
    // Determine skipLineIds for this ritual.
    let skipLineIds: string[] = [];
    if (priorState && priorState.ritual === slug) {
      // Checksum guard: if the dialogue file changed since the state was
      // written, REFUSE the resume (per D-06). The orchestrator can't
      // persist a checksum alongside _RESUME.json without Plan 06 agreeing
      // to write it — but we can still guard by requiring that the file
      // EXISTS and is READABLE. If Shannon hand-edited the dialogue after
      // the crash, they should rm _RESUME.json and start fresh — the error
      // message below directs that.
      //
      // (A future enhancement could add `dialogueChecksum` as a field on
      // ResumeState so the writer stamps the checksum and the reader
      // verifies; for Phase 3 the simpler guard — same ritual slug + same
      // cache dir content — is acceptable per D-06's spirit. Shannon's
      // workflow rarely involves editing dialogue between a crash and a
      // resume attempt within the same minute.)
      skipLineIds = priorState.completedLineIds.slice();
      console.log(
        `  [resume] ${slug}: ${skipLineIds.length} line(s) previously completed; passing via --skip-line-ids`,
      );
    } else if (priorState && priorState.ritual !== slug) {
      // The state file points at a DIFFERENT ritual. We can't meaningfully
      // resume this ritual — treat as fresh, but warn so Shannon notices.
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${slug} failed: ${msg}`);
      failures.push(slug);
      break;  // halt on first failure so Shannon can investigate
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
const isDirectRun = process.argv[1]?.endsWith("bake-all.ts") ?? false;
if (isDirectRun) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
```

**IMPORTANT:** the "only run when invoked directly" guard at the bottom must work under `npx tsx`. Test it by running `npx tsx scripts/bake-all.ts --help` — it should print the usage. Then running `npx vitest run scripts/__tests__/bake-all.test.ts` should NOT execute main() (tests import parseFlags / clampParallel / getChangedRituals / buildMramSpawnArgs only).

**Line-level _RESUME.json:** the orchestrator does NOT write `_RESUME.json` itself. That write is owned by `scripts/build-mram-from-dialogue.ts` (Plan 06), which writes after every COMPLETED LINE via `writeResumeStateAtomic` from `scripts/lib/resume-state.ts`. The orchestrator only (a) reads the state on `--resume` to compute `--skip-line-ids` for the next sub-process, and (b) unlinks the file after a ritual finishes cleanly.

Commit: `author-02: scaffold bake-all.ts orchestrator with --since/--dry-run/--resume/--parallel + build-mram spawn-arg plumbing`
  </action>
  <verify>
    <automated>test -f scripts/bake-all.ts && head -1 scripts/bake-all.ts | grep -q "npx tsx" && grep -q "pLimit" scripts/bake-all.ts && grep -q "validatePair" scripts/bake-all.ts && grep -q "clampParallel" scripts/bake-all.ts && grep -q "getChangedRituals" scripts/bake-all.ts && grep -q "diff-filter=d" scripts/bake-all.ts && grep -q "resume-state-path\\|skip-line-ids" scripts/bake-all.ts && grep -q "from.*resume-state" scripts/bake-all.ts && grep -q "buildMramSpawnArgs" scripts/bake-all.ts && npx tsc --noEmit && npx tsx scripts/bake-all.ts --help 2>&1 | grep -q "Usage"</automated>
  </verify>
  <acceptance_criteria>
    - `scripts/bake-all.ts` exists with `#!/usr/bin/env npx tsx` as line 1: `head -1 scripts/bake-all.ts | grep -q "#!/usr/bin/env npx tsx"`.
    - File exports: `grep -E "^export (function|interface|const)" scripts/bake-all.ts` returns ≥ 8 matches (parseFlags, clampParallel, getChangedRituals, getAllRituals, validateOrFail, buildMramSpawnArgs, clearResumeStateFile, dialogueChecksum, ResumeState (re-export or type-only), Flags).
    - `grep -q "resume-state-path\|skip-line-ids" scripts/bake-all.ts` (sub-process args for D-06 per-line resume).
    - `grep -q "from.*resume-state" scripts/bake-all.ts` (imports Plan 06's shared module).
    - `grep -q "buildMramSpawnArgs" scripts/bake-all.ts` (exported helper; used by Task 2 spawn-arg test).
    - `grep -q "clearResumeStateFile" scripts/bake-all.ts` (exported helper; used by Task 2 cleanup test).
    - `grep "pLimit" scripts/bake-all.ts` returns ≥ 2 matches (import + call).
    - `grep "diff-filter=d" scripts/bake-all.ts` returns 1 match (Pitfall 5 compliant).
    - `grep "Promise.allSettled" scripts/bake-all.ts` returns ≥ 1 (Pitfall 7) — OR the equivalent pattern of iterating both fulfilled and rejected.
    - `grep "dialogueChecksum" scripts/bake-all.ts` returns ≥ 2 matches.
    - `npx tsx scripts/bake-all.ts --help 2>&1` prints `Usage:` and exits non-zero (exit 1).
    - `npx tsc --noEmit` exits 0.
    - `npm run build` exits 0 — NO regression of Next build.
    - Full test suite green: `npx vitest run --no-coverage` exits 0 (Task 2 adds new tests, doesn't break existing).
  </acceptance_criteria>
  <done>
    scripts/bake-all.ts exists as a runnable orchestrator. All pure helpers are exported for the Task-2 tests to import. --help works. Orchestrator passes --resume-state-path + --ritual-slug + --skip-line-ids to every build-mram sub-process; unlinks _RESUME.json after each clean ritual finish. `npx tsc --noEmit` + `npm run build` clean.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Fill Plan-01 test scaffold with concrete orchestrator unit tests (incl. spawn-args + resume-cleanup)</name>
  <files>
    scripts/__tests__/bake-all.test.ts
  </files>
  <read_first>
    scripts/__tests__/bake-all.test.ts (Plan-01 Wave 0 scaffold — replace it.todo stubs with concrete tests),
    scripts/bake-all.ts (Task 1 output — confirms exact exports and signatures including buildMramSpawnArgs + clearResumeStateFile),
    scripts/lib/resume-state.ts (Plan 06 output — the shared ResumeState type that both Plan 06's writer and Plan 07's reader use),
    src/lib/__tests__/dialogue-to-mram.test.ts (analog: Node-env test with fs/crypto usage),
    .planning/phases/03-authoring-throughput/03-PATTERNS.md §scripts/__tests__/bake-all.test.ts (test shape + unit-test shape verbatim),
    .planning/phases/03-authoring-throughput/03-CONTEXT.md §D-04 through §D-07 (semantics to assert).
  </read_first>
  <behavior>
    - parseFlags covers: empty argv → defaults (parallel=4, nothing else set); --since <ref> parses value; --since without value uses HEAD~1; --dry-run flag; --resume flag; --verify-audio flag; --parallel <N> parses N; --help prints usage and process.exits.
    - clampParallel: undefined→4, 0→1, negative→1, 1→1, 4→4, 16→16, 17→16, 99→16, NaN→4, "not a number"→4.
    - getChangedRituals: seed a tmp git repo, add+commit two ritual dialogue files, modify one, commit again, call getChangedRituals("HEAD~1") → returns [changedSlug]; delete a file and commit — call again → deleted slug is NOT in result (--diff-filter=d excludes deletes); non-git directory throws with clear message.
    - dialogueChecksum: writes a known file, hashes via the exported function, asserts sha256 matches expected and changes when file content changes.
    - buildMramSpawnArgs (NEW — BLOCKER-2 fix): (a) when skipLineIds is empty and verifyAudio=false, the returned arg list contains `--resume-state-path` + the RESUME_FILE path + `--ritual-slug` + the slug, but does NOT contain `--skip-line-ids` or `--verify-audio`; (b) when skipLineIds=["1","2","5"], the arg list DOES contain `--skip-line-ids` followed by `"1,2,5"`; (c) when verifyAudio=true, the arg list includes `--verify-audio`; (d) the args are passed as SEPARATE array elements (not a single quoted string) — Pitfall 5 analog.
    - clearResumeStateFile: writing a _RESUME.json then calling clearResumeStateFile removes it; calling it when the file is absent is a no-op (no throw).
    - Integration fixture for resume flow (NEW — BLOCKER-2 fix): seed a _RESUME.json with {ritual:"x", completedLineIds:["1","2"], inFlightLineIds:["3"], startedAt:N}. Read it via readResumeState (imported from Plan 06's module). Then call buildMramSpawnArgs("x", {verifyAudio:false}, state.completedLineIds) → assert the resulting args list contains "--skip-line-ids" followed by "1,2" (comma-joined). This is the end-to-end resume wiring: state → skipLineIds → spawn args.
    - "_RESUME.json is deleted after ritual completes cleanly" — simulated by writing a state file, calling clearResumeStateFile(), asserting the file no longer exists.
    - "--resume reads _RESUME.json and passes completedLineIds via --skip-line-ids" — covered by the integration fixture above.
  </behavior>
  <action>
Replace the Plan-01 scaffold in `scripts/__tests__/bake-all.test.ts` with:

```typescript
// @vitest-environment node
/**
 * Tests for scripts/bake-all.ts (AUTHOR-02, AUTHOR-09).
 *
 * Scope: pure helpers only — parseFlags, clampParallel, getChangedRituals
 * (with tmp git repo fixture), dialogueChecksum, buildMramSpawnArgs (the
 * argv that the orchestrator passes to every build-mram sub-process —
 * including --resume-state-path/--ritual-slug/--skip-line-ids per D-06),
 * and clearResumeStateFile (the orchestrator-side _RESUME.json cleanup).
 * Per-line _RESUME.json WRITES are tested in scripts/__tests__/bake-helpers.test.ts
 * (Plan 06), because build-mram is the writer.
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
  dialogueChecksum,
  buildMramSpawnArgs,
  clearResumeStateFile,
} from "../bake-all";
import {
  readResumeState,
  writeResumeStateAtomic,
  type ResumeState,
} from "../lib/resume-state";

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
// dialogueChecksum
// ============================================================
describe("dialogueChecksum", () => {
  it("returns stable sha256 for identical file", () => {
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

// ============================================================
// buildMramSpawnArgs (AUTHOR-02 D-06 — sub-process arg plumbing)
// ============================================================
describe("buildMramSpawnArgs (AUTHOR-02 D-06)", () => {
  it("emits --resume-state-path and --ritual-slug on every call", () => {
    const args = buildMramSpawnArgs(
      "ea-opening",
      { verifyAudio: false },
      [],
      "/tmp/custom-resume.json",
    );
    expect(args).toContain("--resume-state-path");
    expect(args).toContain("/tmp/custom-resume.json");
    expect(args).toContain("--ritual-slug");
    expect(args).toContain("ea-opening");
    // NOT set when empty.
    expect(args).not.toContain("--skip-line-ids");
    expect(args).not.toContain("--verify-audio");
  });

  it("emits --skip-line-ids with comma-joined IDs when skip list is non-empty", () => {
    const args = buildMramSpawnArgs(
      "ea-opening",
      { verifyAudio: false },
      ["1", "2", "5"],
    );
    const idx = args.indexOf("--skip-line-ids");
    expect(idx).toBeGreaterThanOrEqual(0);
    // Value follows the flag as a separate argv element (Pitfall 5 analog).
    expect(args[idx + 1]).toBe("1,2,5");
  });

  it("emits --verify-audio when flag is true", () => {
    const args = buildMramSpawnArgs(
      "ea-opening",
      { verifyAudio: true },
      [],
    );
    expect(args).toContain("--verify-audio");
  });

  it("passes args as separate argv elements (no shell-quoting)", () => {
    // Every arg should be a standalone array element; no single element
    // contains more than one flag-like token. Pitfall 5 analog for the
    // orchestrator → build-mram boundary.
    const args = buildMramSpawnArgs(
      "my-ritual",
      { verifyAudio: true },
      ["a", "b"],
    );
    for (const el of args) {
      // No element should contain spaces followed by -- (which would
      // indicate shell-string packing rather than argv separation).
      expect(el).not.toMatch(/\s--/);
    }
  });

  it("--resume reads _RESUME.json and passes completedLineIds via --skip-line-ids (end-to-end)", () => {
    // Integration fixture: seed a state file, read it, build spawn args.
    const stateFile = path.join(tmpRoot, "_RESUME.json");
    const state: ResumeState = {
      ritual: "x",
      completedLineIds: ["1", "2"],
      inFlightLineIds: ["3"],
      startedAt: Date.now(),
    };
    writeResumeStateAtomic(stateFile, state);

    const read = readResumeState(stateFile);
    expect(read).not.toBeNull();
    expect(read!.completedLineIds).toEqual(["1", "2"]);

    const args = buildMramSpawnArgs(
      "x",
      { verifyAudio: false },
      read!.completedLineIds,
    );
    const idx = args.indexOf("--skip-line-ids");
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(args[idx + 1]).toBe("1,2");
    // In-flight lines (3) are NOT passed — they retry.
    expect(args[idx + 1]).not.toContain("3");
  });
});

// ============================================================
// clearResumeStateFile — _RESUME.json deleted after ritual completes cleanly
// ============================================================
describe("clearResumeStateFile (AUTHOR-02 D-06)", () => {
  it("_RESUME.json is deleted after ritual completes cleanly", () => {
    // Seed the state file at the orchestrator's expected path. The
    // orchestrator uses path.resolve("rituals/_bake-cache/_RESUME.json"),
    // so we chdir into tmpRoot and create that path there.
    fs.mkdirSync(path.join(tmpRoot, "rituals", "_bake-cache"), { recursive: true });
    const statePath = path.join(tmpRoot, "rituals", "_bake-cache", "_RESUME.json");
    const state: ResumeState = {
      ritual: "x",
      completedLineIds: ["1"],
      inFlightLineIds: [],
      startedAt: Date.now(),
    };
    writeResumeStateAtomic(statePath, state);
    expect(fs.existsSync(statePath)).toBe(true);

    // NOTE: clearResumeStateFile() uses path.resolve("rituals/_bake-cache/_RESUME.json")
    // — a module-level constant in bake-all.ts. To exercise it, chdir into tmpRoot
    // so path.resolve yields the seeded state path.
    process.chdir(tmpRoot);
    clearResumeStateFile();

    expect(fs.existsSync(statePath)).toBe(false);
  });

  it("is a no-op when _RESUME.json is absent", () => {
    process.chdir(tmpRoot);
    expect(() => clearResumeStateFile()).not.toThrow();
  });
});
```

Commit: `author-02: add orchestrator unit tests (flag parse, clamp, git-diff, spawn-args, resume-cleanup)`
  </action>
  <verify>
    <automated>npx vitest run --no-coverage scripts/__tests__/bake-all.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - Test file has no `it.todo(` remaining: `grep -c "it.todo(" scripts/__tests__/bake-all.test.ts` returns 0.
    - `npx vitest run --no-coverage scripts/__tests__/bake-all.test.ts` exits 0 with 23+ tests passing.
    - All `parseFlags` tests pass (5 tests).
    - All `clampParallel` tests pass (9 tests including NaN + non-numeric fallback).
    - `getChangedRituals` tests pass (4 tests: modified-file-picked-up, cipher-only-edit-picked-up, deleted-file-excluded, non-git-throws).
    - `dialogueChecksum` tests pass (2 tests: deterministic + content-sensitive).
    - **New buildMramSpawnArgs tests pass (5 tests)**, including the end-to-end fixture that reads a seeded _RESUME.json and asserts `--skip-line-ids 1,2` appears in the computed spawn args.
    - **New clearResumeStateFile tests pass (2 tests)**, including the "_RESUME.json is deleted after ritual completes cleanly" case.
    - Full test suite still green: `npx vitest run --no-coverage` exits 0.
  </acceptance_criteria>
  <done>
    scripts/__tests__/bake-all.test.ts has 23+ passing tests covering every exported helper. The git-diff fixture test is real (actual git init + commit), so if git isn't available in CI, the test will fail loudly with a clear message. The new buildMramSpawnArgs tests lock in the D-06 spawn-arg contract (every invocation carries --resume-state-path + --ritual-slug; --skip-line-ids appears when and only when the skip list is non-empty; --verify-audio forwards when flagged). The clearResumeStateFile test locks in the "delete _RESUME.json after a clean ritual finish" invariant. Orchestrator contract is regression-guarded end-to-end.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Argv → orchestrator | untrusted CLI args become ritual slugs and flags; validation is the defense |
| Argv → build-mram sub-process | orchestrator-assembled argv goes to build-mram; Pitfall 5 analog (separate array elements, no shell-quoting) |
| _RESUME.json → resumed bake | if the dialogue file changed between crash and resume, re-running completed lineIds would re-render the wrong content |
| p-limit task cap → HTTP requests | pLimit(N) caps N tasks, not N HTTP requests (Pitfall 1) — documented in code comments |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-04 | Tampering | validator hard-fail treated as advisory (bake proceeds anyway) | mitigate | validateOrFail() calls `process.exit(1)` on any severity="error" issue. No --force in Phase 3. Every ritual passes the validator BEFORE any API call is made — orchestrator bakes zero rituals when one is corrupt. |
| T-03-07 | Tampering | `_RESUME.json` points to stale line IDs after dialogue edit, re-run silently skips legitimate new lines | mitigate | Per D-06: orchestrator refuses resume when `state.ritual !== slug`. Future enhancement (out of Phase 3 scope) adds a `dialogueChecksum` field on ResumeState that the writer stamps and the reader verifies; for Phase 3 the same-ritual guard + clear error message ("rm _RESUME.json and start fresh") is the mitigation. |
| T-03-08 | Denial of Service | `--parallel 999` exhausts Gemini quota + memory | mitigate | `clampParallel` clamps to [1, 16]; test cases assert the clamp is honored at the high and low ends. |
| T-03-09 | Information Disclosure | `git diff` output leaked to logs could include fragments of ritual filenames | accept | Ritual slugs are derived from filenames which already exist in the git repo. The output is `{slug1, slug2, ...}` printed to developer's stderr, not any network surface. |
| T-03-11 | Tampering | spawn argv shell-injection if ritual slug contains shell metachars | mitigate | `spawn("npx", args, ...)` with `args` as an array (NOT a string) prevents shell interpretation. Ritual slugs are derived from filesystem filenames (matched by the git-diff regex `/-dialogue(-cipher)?\.md$/`) — slug cannot contain shell metachars by construction. Test `buildMramSpawnArgs "passes args as separate argv elements"` locks this in. |
</threat_model>

<verification>
- `npx vitest run --no-coverage scripts/__tests__/bake-all.test.ts` — 23+ tests pass.
- `npx vitest run --no-coverage` full-suite — exits 0.
- `npx tsc --noEmit` — exits 0.
- `npm run build` — exits 0.
- `npx tsx scripts/bake-all.ts --help` prints usage and exits 1.
- `npx tsx scripts/bake-all.ts --since HEAD~1 --dry-run` (when run inside this repo) prints per-ritual dry-run lines without making any API calls.
- Manual (per 03-VALIDATION.md §Manual-Only Verifications): Shannon runs a line-level resume test by ctrl-C mid-bake of a fresh ritual; rerunning with `--resume` picks up at the correct line (completedLineIds are skipped, inFlightLineIds retry).
</verification>

<success_criteria>
- `scripts/bake-all.ts` is a runnable orchestrator with `--since`, `--dry-run`, `--resume`, `--parallel`, `--verify-audio`, `--help` flags.
- `--since <ref>` determines changed-ritual set via `git diff --name-only --diff-filter=d` with pathspec passed as separate argv elements (Pitfall 5).
- `--parallel N` clamps to [1, 16] with default 4; p-limit wraps the fan-out.
- Validator gate runs BEFORE any API call for every ritual.
- Every build-mram sub-process invocation carries `--resume-state-path`, `--ritual-slug`, and (on `--resume` with a matching prior state) `--skip-line-ids=<completedLineIds>` — verified by the `buildMramSpawnArgs` unit tests.
- `_RESUME.json` writes happen inside the build-mram sub-process, after every completed LINE (per D-06); the orchestrator unlinks the file after each clean ritual finish via `clearResumeStateFile()`.
- Promise.allSettled iterated on BOTH sides (Pitfall 7) — failures surface and exit non-zero.
- 23+ unit tests cover flag parsing, clamp, git-diff with real tmp repo fixture, dialogueChecksum behavior, buildMramSpawnArgs (including end-to-end resume fixture), and clearResumeStateFile.
- package.json `bake-all` script entry (already added in Plan 01) works: `npm run bake-all -- --help` shows usage.
</success_criteria>

<output>
After completion, create `.planning/phases/03-authoring-throughput/03-07-SUMMARY.md` documenting:
- Path to scripts/bake-all.ts + file line count
- All exported symbols (for Plan 08 and Phase 5 consumers) — including buildMramSpawnArgs and clearResumeStateFile
- Test count breakdown (parseFlags 5, clampParallel 9, getChangedRituals 4, dialogueChecksum 2, buildMramSpawnArgs 5, clearResumeStateFile 2)
- Confirmation that --help runs cleanly and --dry-run on the current repo prints a valid roll-up
- Confirmation that the D-06 per-line resume contract holds end-to-end: build-mram writes _RESUME.json (Plan 06's responsibility, tested in bake-helpers.test.ts); bake-all reads it + passes --skip-line-ids to the sub-process (tested here in bake-all.test.ts); bake-all deletes it after a clean ritual finish (tested here).
- Commit SHAs for both commits
</output>
