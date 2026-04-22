---
phase: 03-authoring-throughput
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - package-lock.json
  - .gitignore
  - rituals/_bake-cache/.gitignore
  - src/lib/__tests__/idb-schema.test.ts
  - src/lib/__tests__/dev-guard.test.ts
  - src/lib/__tests__/author-validation.test.ts
  - scripts/__tests__/bake-all.test.ts
  - scripts/__tests__/preview-bake.test.ts
  - scripts/__tests__/render-gemini-audio-cache.test.ts
autonomous: true
requirements: [AUTHOR-01, AUTHOR-02, AUTHOR-05, AUTHOR-06, AUTHOR-08, AUTHOR-09, AUTHOR-10]
tags: [deps, scaffolding, wave-0, gitignore, bake-cache]

must_haves:
  truths:
    - "package.json dependencies includes `p-limit: ^7.3.0` and `music-metadata: ^11.12.3`"
    - "package.json devDependencies includes `fake-indexeddb: ^6.2.5`"
    - "package.json scripts includes `bake-all` and `preview-bake` entries"
    - ".gitignore contains `rituals/_bake-cache/` entry (root gitignore — belt-and-suspenders)"
    - "rituals/_bake-cache/ directory exists with a self-documenting .gitignore inside it"
    - "Six Wave 0 test scaffold files exist and all fail with a clear TODO marker — they will turn green as Plans 02-08 implement the features they describe"
    - "`npm install` exits 0 (lockfile updates cleanly, no peer conflicts)"
  artifacts:
    - path: package.json
      provides: "p-limit, music-metadata, fake-indexeddb dependencies + bake-all + preview-bake script entries"
      contains: "p-limit"
    - path: .gitignore
      provides: "rituals/_bake-cache/ ignored at repo root"
      contains: "rituals/_bake-cache/"
    - path: rituals/_bake-cache/.gitignore
      provides: "nested self-documenting gitignore — cache contents excluded, .gitignore itself retained"
      contains: "!.gitignore"
    - path: src/lib/__tests__/idb-schema.test.ts
      provides: "Wave 0 scaffold for AUTHOR-10 dual-open invariant — implemented by Plan 02"
      contains: "idb-schema dual-open invariant"
    - path: src/lib/__tests__/dev-guard.test.ts
      provides: "Wave 0 scaffold for D-15 assertDevOnly/isDev — implemented by Plan 03"
      contains: "dev-guard"
    - path: src/lib/__tests__/author-validation.test.ts
      provides: "Wave 0 scaffold for AUTHOR-05 bake-band parity validator — implemented by Plan 04"
      contains: "bake-band"
    - path: scripts/__tests__/bake-all.test.ts
      provides: "Wave 0 scaffold for AUTHOR-02/09 orchestrator — implemented by Plan 07"
      contains: "bake-all"
    - path: scripts/__tests__/preview-bake.test.ts
      provides: "Wave 0 scaffold for AUTHOR-08 preview server — implemented by Plan 08"
      contains: "ensureLoopback"
    - path: scripts/__tests__/render-gemini-audio-cache.test.ts
      provides: "Wave 0 scaffold for AUTHOR-01 cache key v3 bump + migration — implemented by Plan 05"
      contains: "CACHE_KEY_VERSION"
  key_links:
    - from: package.json
      to: node_modules
      via: "npm install resolves the three new deps"
      pattern: "p-limit"
    - from: .gitignore
      to: rituals/_bake-cache/
      via: "root entry prevents accidental commits of cache .opus files"
      pattern: "rituals/_bake-cache"
---

<objective>
Install the three Phase 3 npm dependencies (`p-limit`, `music-metadata`, `fake-indexeddb`), register the two new script entries (`bake-all`, `preview-bake`), add the bake-cache gitignore entries (per D-01), create the `rituals/_bake-cache/` directory with a nested self-documenting `.gitignore`, and land the six Wave 0 test scaffold files — stub tests that establish the validation contract every downstream plan (02..08) satisfies.

Purpose: per D-01/D-07/D-18, Phase 3 needs `p-limit@^7.3.0` (AUTHOR-09 concurrency cap), `music-metadata@^11.12.3` (AUTHOR-06 duration parsing), and `fake-indexeddb@^6.2.5` (AUTHOR-10 dual-open test). All three are ESM-only and verified available on the npm registry as of 2026-04-21 (RESEARCH §Standard Stack). Wave 0 test scaffolds exist so the Nyquist validation strategy (03-VALIDATION.md) has concrete files to point at before any feature code lands; tests are RED until their implementing plan lands (Plans 02-08).

Output: `package.json` + `package-lock.json` updated, `.gitignore` entry + nested `rituals/_bake-cache/.gitignore`, six test scaffold files committed failing with clear TODO markers.
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
@package.json
@.gitignore

<interfaces>
<!-- Key values for this plan. Values locked in 03-CONTEXT.md and 03-RESEARCH.md. -->

Exact versions (RESEARCH §Standard Stack + Installation block):
- `p-limit@^7.3.0` — runtime dep
- `music-metadata@^11.12.3` — runtime dep
- `fake-indexeddb@^6.2.5` — dev dep

Exact script entries (PATTERNS.md §package.json):
- `"bake-all": "npx tsx scripts/bake-all.ts"`
- `"preview-bake": "npx tsx scripts/preview-bake.ts"`

Nested gitignore content (PATTERNS.md §rituals/_bake-cache/.gitignore):
```
# Content-addressed bake cache — local only, never committed (AUTHOR-01 D-01).
# Every file in this directory is gitignored EXCEPT this .gitignore itself.
*
!.gitignore
```

Root .gitignore append block (PATTERNS.md §.gitignore):
```
# bake cache — AUTHOR-01 D-01 (content-addressed Opus cache)
rituals/_bake-cache/
```

All three packages are ESM-only (`type: "module"` in their own package.json). This repo uses Next + `module: "esnext"` in tsconfig and `npx tsx` for scripts, so ESM imports work. Default exports: `import pLimit from "p-limit"`. Named exports: `import { parseBuffer } from "music-metadata"`. Side-effect import: `import "fake-indexeddb/auto"`.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install deps + add script entries + add gitignore entries + create cache dir</name>
  <files>
    package.json,
    package-lock.json,
    .gitignore,
    rituals/_bake-cache/.gitignore
  </files>
  <read_first>
    package.json (current state — lines 1-40 — to know exactly where to insert alphabetically),
    .gitignore (root file — to match the existing comment-header style),
    .planning/phases/03-authoring-throughput/03-PATTERNS.md §`package.json` and §`.gitignore` blocks (for exact line placements),
    .planning/phases/03-authoring-throughput/03-RESEARCH.md §Standard Stack (for exact version numbers + ESM-only warning),
    .planning/phases/03-authoring-throughput/03-CONTEXT.md §D-01 (cache-location decision — rationale).
  </read_first>
  <action>
Run these steps in this exact order (do NOT short-circuit):

**Step 1 — install runtime deps (these append to `dependencies` alphabetically):**
```bash
npm install p-limit@^7.3.0 music-metadata@^11.12.3
```

**Step 2 — install dev dep (appends to `devDependencies`):**
```bash
npm install --save-dev fake-indexeddb@^6.2.5
```

**Step 3 — add the two script entries to `package.json`.** Edit `package.json` and insert after the existing `"test:run": "vitest run"` line (use the Edit tool; preserve existing JSON formatting — 2-space indent, trailing comma on non-last key):

```json
    "test:run": "vitest run",
    "bake-all": "npx tsx scripts/bake-all.ts",
    "preview-bake": "npx tsx scripts/preview-bake.ts"
```

**Step 4 — append to root `.gitignore`** (preserve file's existing comment-header style; add at end of file with a blank line separator):

```
# bake cache — AUTHOR-01 D-01 (content-addressed Opus cache)
rituals/_bake-cache/
```

**Step 5 — create `rituals/_bake-cache/` directory and its nested `.gitignore`.** The directory must exist so `fs.cp` migrations (Plan 05) don't have to mkdir during a migration. Use:
```bash
mkdir -p rituals/_bake-cache
```
Then create `rituals/_bake-cache/.gitignore` with exactly this content (nothing else):
```
# Content-addressed bake cache — local only, never committed (AUTHOR-01 D-01).
# Every file in this directory is gitignored EXCEPT this .gitignore itself.
*
!.gitignore
```

**Step 6 — verify the three packages are actually imported-able under tsx.** Write a one-off sanity file `/tmp/phase3-deps-sanity.ts`:
```typescript
import pLimit from "p-limit";
import { parseBuffer } from "music-metadata";
const lim = pLimit(4);
console.log("p-limit:", typeof lim);
console.log("music-metadata parseBuffer:", typeof parseBuffer);
```
Run: `npx tsx /tmp/phase3-deps-sanity.ts` — should print `p-limit: function` and `music-metadata parseBuffer: function`. Remove the file when done. (Do NOT commit the sanity file.)

**Step 7 — commit** (single commit; all scaffolding is one unit):
```
author-infra: install p-limit, music-metadata, fake-indexeddb + bake-cache gitignore
```
  </action>
  <verify>
    <automated>node -e "const p = require('./package.json'); const deps = {...p.dependencies, ...p.devDependencies}; if (!deps['p-limit']) process.exit(1); if (!deps['music-metadata']) process.exit(2); if (!deps['fake-indexeddb']) process.exit(3); if (!p.scripts['bake-all']) process.exit(4); if (!p.scripts['preview-bake']) process.exit(5); if (!require('fs').readFileSync('.gitignore','utf8').includes('rituals/_bake-cache/')) process.exit(6); if (!require('fs').existsSync('rituals/_bake-cache/.gitignore')) process.exit(7); console.log('ok')"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -E '"p-limit": "\^7\.' package.json` returns 1 match.
    - `grep -E '"music-metadata": "\^11\.' package.json` returns 1 match.
    - `grep -E '"fake-indexeddb": "\^6\.' package.json` returns 1 match.
    - `grep '"bake-all": "npx tsx scripts/bake-all.ts"' package.json` returns 1 match.
    - `grep '"preview-bake": "npx tsx scripts/preview-bake.ts"' package.json` returns 1 match.
    - `grep 'rituals/_bake-cache/' .gitignore` returns ≥ 1 match.
    - File `rituals/_bake-cache/.gitignore` exists and contains the literal strings `*` AND `!.gitignore` AND `AUTHOR-01 D-01`.
    - `npm install` (re-run) exits 0 with no warnings about peer-dep conflicts.
    - `npx tsx -e "import('p-limit').then(m => console.log(typeof m.default))"` prints `function` (ESM default export resolves).
  </acceptance_criteria>
  <done>
    Three new packages installed with the exact version ranges from RESEARCH.md; two new npm script entries registered; `rituals/_bake-cache/` exists and is gitignored at both the root (belt-and-suspenders) and via a self-documenting nested `.gitignore`; sanity-checked that `npx tsx` can resolve the ESM-only imports.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create six Wave 0 test scaffolds — RED stubs with TODO markers</name>
  <files>
    src/lib/__tests__/idb-schema.test.ts,
    src/lib/__tests__/dev-guard.test.ts,
    src/lib/__tests__/author-validation.test.ts,
    scripts/__tests__/bake-all.test.ts,
    scripts/__tests__/preview-bake.test.ts,
    scripts/__tests__/render-gemini-audio-cache.test.ts
  </files>
  <read_first>
    .planning/phases/03-authoring-throughput/03-VALIDATION.md §Wave 0 Requirements (authoritative list of test files needed),
    .planning/phases/03-authoring-throughput/03-PATTERNS.md §src/lib/__tests__/idb-schema.test.ts, §dev-guard.test.ts, §bake-all.test.ts, §preview-bake.test.ts (for exact vitest-environment pragma + header structure),
    src/lib/__tests__/hash-user.test.ts (Template A pattern — @vitest-environment node header),
    src/lib/__tests__/degraded-mode-store.test.ts (Template C pattern — beforeEach with vi.resetModules + dynamic import),
    src/lib/__tests__/screen-wake-lock.test.ts (explicit jsdom env pragma example).
  </read_first>
  <action>
Create six test scaffold files. Each is intentionally RED at the end of this task — they turn GREEN as their implementing plan (02-08) lands. Each file MUST include:
1. The correct `// @vitest-environment (node|jsdom)` pragma.
2. At least one `it.todo()` or `it()` with `expect.fail` marking the pending behavior.
3. A header JSDoc block citing the implementing plan (e.g. `// Implemented by Plan 02 (AUTHOR-10).`).

Create `src/lib/__tests__/idb-schema.test.ts` (jsdom env — needs fake-indexeddb global polyfill; Plan 02 will complete it):
```typescript
// @vitest-environment jsdom
/**
 * Wave 0 scaffold for AUTHOR-10 dual-open invariant (D-18).
 * Implemented by Plan 02 (03-02).
 *
 * Three cases:
 *  1. openDB() from a fresh IDB leaves all 6 stores present.
 *  2. storage.ts and voice-storage.ts both arrive at the same store set
 *     regardless of which module triggered the first open.
 *  3. A v4-on-disk database opens as v5 without data loss; feedbackTraces
 *     store is newly created.
 */
import { describe, it, expect, beforeEach } from "vitest";

describe("idb-schema dual-open invariant (AUTHOR-10 D-18)", () => {
  beforeEach(async () => {
    await import("fake-indexeddb/auto");
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase("masonic-ritual-mentor");
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onblocked = () => resolve(); // no other connections in a test worker
    });
  });

  it.todo("opens via openDB() with all 6 stores present (AUTHOR-10 Plan 02)");
  it.todo("storage.ts and voice-storage.ts produce identical store sets");
  it.todo("v4-on-disk opens as v5 without data loss; feedbackTraces newly created");
});
```

Create `src/lib/__tests__/dev-guard.test.ts` (node env — pure function):
```typescript
// @vitest-environment node
/**
 * Wave 0 scaffold for D-15 assertDevOnly/isDev.
 * Implemented by Plan 03 (03-03).
 */
import { describe, it } from "vitest";

describe("dev-guard (D-15)", () => {
  it.todo("isDev returns true in non-production (Plan 03)");
  it.todo("isDev returns false in production");
  it.todo("assertDevOnly throws in production with DEV-GUARD message");
  it.todo("assertDevOnly does not throw in development");
});
```

Create `src/lib/__tests__/author-validation.test.ts` (node env; file does not exist yet per repo state 2026-04-21):
```typescript
// @vitest-environment node
/**
 * Wave 0 scaffold for AUTHOR-05 / D-08 cipher/plain parity validator.
 * Implemented by Plan 04 (03-04).
 *
 * Three hard-fail cases (per D-08):
 *   1. Speaker mismatch → severity "error".
 *   2. Action-tag mismatch → severity "error".
 *   3. Word-count ratio outside [0.5×, 2×] → severity "error" with kind "ratio-outlier".
 * Plus one soft-case: within-band word ratios do NOT raise an error.
 */
import { describe, it } from "vitest";

describe("author-validation cipher/plain parity (AUTHOR-05 D-08)", () => {
  it.todo("hard-fails on speaker mismatch (Plan 04)");
  it.todo("hard-fails on action-tag mismatch");
  it.todo("hard-fails on word-count ratio > 2×");
  it.todo("hard-fails on word-count ratio < 0.5×");
  it.todo("accepts matched speakers + actions + within-band word ratio");
  it.todo("bake-band check is word-count not character-count (explicit)");
});
```

Create `scripts/__tests__/bake-all.test.ts` (node env; scripts/__tests__/ dir does not exist — first test under it):
```typescript
// @vitest-environment node
/**
 * Wave 0 scaffold for AUTHOR-02/03/06/07/09 orchestrator unit tests.
 * Implemented by Plan 07 (03-07). Covers:
 *   - parseFlags (AUTHOR-02)
 *   - clampParallel [1, 16] (AUTHOR-09, default 4 per D-07)
 *   - getChangedRituals git-diff wrapping (D-04 + Pitfall 5 argv-array quoting)
 *   - computeRitualMedianSecPerChar rolling median skips first 30 lines (Pitfall 6)
 *   - detectAnomaly hard-fails >3× OR <0.3× median (D-10)
 *   - writeResumeState atomic tmp+rename (D-06)
 *   - verifyAudioDiff word-count diff (D-11)
 */
import { describe, it } from "vitest";

describe("bake-all flag parsing (AUTHOR-02)", () => {
  it.todo("parses --since <ref> --dry-run --resume --parallel N --verify-audio (Plan 07)");
  it.todo("--help prints usage and exits 1");
});

describe("bake-all clampParallel (AUTHOR-09 D-07)", () => {
  it.todo("default when undefined = 4");
  it.todo("clamps 0 to 1");
  it.todo("clamps 99 to 16");
  it.todo("passes 4 through unchanged");
});

describe("bake-all getChangedRituals (D-04)", () => {
  it.todo("returns unique slugs from plain+cipher diff output");
  it.todo("handles cipher-only changes (validators must still fire)");
  it.todo("excludes deleted files (--diff-filter=d)");
  it.todo("throws with clear message when not in a git repo");
});

describe("bake-all duration anomaly detector (AUTHOR-06 D-10)", () => {
  it.todo("skips anomaly check for first 30 completed lines per ritual (Pitfall 6)");
  it.todo("hard-fails when duration > 3× ritual median sec/char");
  it.todo("hard-fails when duration < 0.3× ritual median sec/char");
  it.todo("error message contains lineId, durationMs, charCount, ritualMedian, ratio");
});

describe("bake-all _RESUME.json atomic write (D-06)", () => {
  it.todo("writes tmp then renames; partial write does not corrupt target");
  it.todo("dialogueChecksum rejects resume if dialogue file changed");
});

describe("bake-all --verify-audio diff (AUTHOR-07 D-11)", () => {
  it.todo("warns when word-diff > N (default 2)");
  it.todo("never hard-fails the bake (warn-only)");
});
```

Create `scripts/__tests__/preview-bake.test.ts` (node env):
```typescript
// @vitest-environment node
/**
 * Wave 0 scaffold for AUTHOR-08 preview server.
 * Implemented by Plan 08 (03-08).
 *
 * Unit surfaces:
 *   - ensureLoopback(host) — throws on non-loopback (D-13/D-15)
 *   - handleOpusRequest — 400 on cacheKey not matching /^[0-9a-f]{64}$/ (T-03-03)
 *   - handleOpusRequest — 206 Partial Content with Content-Range on Range header
 *   - handleOpusRequest — 404 when cache key not present
 *   - assertDevOnly integration — refuses when NODE_ENV=production
 */
import { describe, it } from "vitest";

describe("preview-bake ensureLoopback (D-13/D-15)", () => {
  it.todo("refuses 0.0.0.0 with /loopback/ message (Plan 08)");
  it.todo("refuses 192.168.1.5 with /loopback/ message");
  it.todo("allows 127.0.0.1");
  it.todo("allows ::1");
});

describe("preview-bake handleOpusRequest (T-03-03 path-traversal mitigation)", () => {
  it.todo("rejects cacheKey with .. (path traversal)");
  it.todo("rejects cacheKey with / (absolute path)");
  it.todo("rejects cacheKey shorter than 64 hex");
  it.todo("accepts valid 64-hex-char cacheKey");
});

describe("preview-bake Range handling", () => {
  it.todo("serves 206 with Content-Range when Range: bytes=0-499 present");
  it.todo("serves 200 full body when Range absent");
  it.todo("serves 416 when range start > end");
});

describe("preview-bake dev-guard integration (T-03-02)", () => {
  it.todo("assertDevOnly refuses when NODE_ENV=production");
});
```

Create `scripts/__tests__/render-gemini-audio-cache.test.ts` (node env):
```typescript
// @vitest-environment node
/**
 * Wave 0 scaffold for AUTHOR-01 cache key v3 bump + modelId + migration.
 * Implemented by Plan 05 (03-05).
 *
 * Three invariants:
 *   1. CACHE_KEY_VERSION === "v3" (bumped from "v2" per D-02).
 *   2. computeCacheKey(text, style, voice, modelId, preamble) includes modelId
 *      in the sha256 material — two different modelIds produce different keys.
 *   3. Legacy-cache migration is one-shot: if NEW_CACHE_DIR has any .opus,
 *      migration skips. Otherwise it fs.cp's from ~/.cache/masonic-mram-audio/.
 */
import { describe, it } from "vitest";

describe("render-gemini-audio cache key v3 (AUTHOR-01 D-02)", () => {
  it.todo("CACHE_KEY_VERSION === 'v3' (Plan 05)");
  it.todo("computeCacheKey includes modelId in material — changing modelId changes key");
  it.todo("computeCacheKey is stable for identical inputs (deterministic)");
});

describe("render-gemini-audio legacy cache migration (AUTHOR-01 D-01)", () => {
  it.todo("one-shot: skips if NEW_CACHE_DIR already has a .opus file (Plan 05)");
  it.todo("copies from OLD_CACHE_DIR when NEW is empty; old location preserved");
  it.todo("no-ops when OLD_CACHE_DIR does not exist");
});
```

Commit:
```
author-infra: scaffold wave 0 tests for idb-schema, dev-guard, author-validation, bake-all, preview-bake, cache
```
  </action>
  <verify>
    <automated>test -f src/lib/__tests__/idb-schema.test.ts && test -f src/lib/__tests__/dev-guard.test.ts && test -f src/lib/__tests__/author-validation.test.ts && test -f scripts/__tests__/bake-all.test.ts && test -f scripts/__tests__/preview-bake.test.ts && test -f scripts/__tests__/render-gemini-audio-cache.test.ts && npx vitest run --no-coverage src/lib/__tests__/idb-schema.test.ts src/lib/__tests__/dev-guard.test.ts src/lib/__tests__/author-validation.test.ts scripts/__tests__/bake-all.test.ts scripts/__tests__/preview-bake.test.ts scripts/__tests__/render-gemini-audio-cache.test.ts 2>&1 | grep -E "todo|passed"</automated>
  </verify>
  <acceptance_criteria>
    - All six scaffold files exist (six `test -f ...` checks pass).
    - Every file starts with a `// @vitest-environment` pragma (grep finds one per file): `grep -l "@vitest-environment" src/lib/__tests__/idb-schema.test.ts src/lib/__tests__/dev-guard.test.ts src/lib/__tests__/author-validation.test.ts scripts/__tests__/bake-all.test.ts scripts/__tests__/preview-bake.test.ts scripts/__tests__/render-gemini-audio-cache.test.ts` returns 6 lines.
    - Every file contains at least one `it.todo(` marker (grep `-c "it.todo(" <file>` returns ≥ 1 for each).
    - `npx vitest run --no-coverage src/lib/__tests__/idb-schema.test.ts src/lib/__tests__/dev-guard.test.ts src/lib/__tests__/author-validation.test.ts scripts/__tests__/bake-all.test.ts scripts/__tests__/preview-bake.test.ts scripts/__tests__/render-gemini-audio-cache.test.ts` exits 0 (Vitest treats `it.todo` as passing, not failing — confirms files compile cleanly).
    - `npx vitest run --no-coverage` full-suite still exits 0 (no regression in existing tests).
    - Every scaffold cites its implementing plan in the header (grep `"Plan 0"` hits every file).
  </acceptance_criteria>
  <done>
    Six test scaffolds committed as a single `author-infra:` commit. Full test suite still green (todo counts rise). Every downstream plan (02-08) has a concrete test file it can `vi.resetModules` + fill in; the Nyquist validation contract for Phase 3 is materialized.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Developer → package-lock.json | new deps arrive from npm; integrity hashes are the defense |
| Filesystem → `rituals/_bake-cache/` | cache contents never enter git; the two gitignores are the defense |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-INFRA-01 | Information Disclosure | `rituals/_bake-cache/` contents | mitigate | Two-layer gitignore: root `.gitignore` has `rituals/_bake-cache/` entry AND the nested `rituals/_bake-cache/.gitignore` excludes everything except itself. One layer failing (e.g., someone deletes root entry) still has the nested as defense-in-depth. |
| T-03-INFRA-02 | Tampering | new npm deps (p-limit, music-metadata, fake-indexeddb) could ship malicious code | accept | All three from well-known authors (Sindre Sorhus, Borewit, dumbmatter), verified on npm registry 2026-04-21. Package-lock.json records integrity hashes. Solo-dev pilot, not a shared build system — risk bounded by developer's own review of install output. |
| T-03-INFRA-03 | Denial of Service | ESM-only deps break `npm run build` if Next can't resolve them | mitigate | Task 1 includes a `npx tsx` sanity check that confirms the imports resolve before commit. Next build (production) uses its own bundler path and doesn't touch `scripts/` — the three new deps only ship into server-build artifacts on routes that import them (none in Phase 3). |
</threat_model>

<verification>
- `npm install` with a clean `node_modules/` produces identical lockfile entries and exits 0.
- `node -e "require('./package.json')"` parses cleanly (JSON well-formed).
- `grep rituals/_bake-cache .gitignore` returns a hit.
- `ls rituals/_bake-cache/.gitignore` succeeds.
- `npx vitest run --no-coverage` exits 0 (Phase 2 baseline + 6 scaffolds-with-todos still green).
- `npx tsc --noEmit` exits 0 (scaffolds compile; ESM-only deps resolve under tsc/tsx).
</verification>

<success_criteria>
- Three new npm packages installed at exact versions (p-limit@^7.3.0, music-metadata@^11.12.3, fake-indexeddb@^6.2.5).
- Two new package.json script entries exist (`bake-all`, `preview-bake`).
- `rituals/_bake-cache/` directory exists; root `.gitignore` has the entry; nested `.gitignore` excludes everything except itself.
- Six Wave 0 test scaffold files exist, each with correct @vitest-environment pragma and at least one `it.todo()` marker, each citing its implementing plan.
- Full test suite still exits 0.
- Downstream Plans 02-08 can start without re-installing any dep or creating any test file.
</success_criteria>

<output>
After completion, create `.planning/phases/03-authoring-throughput/03-01-SUMMARY.md` documenting:
- Three new deps installed with exact resolved versions from `package-lock.json`
- Two script entries registered
- Gitignore entries added (root + nested)
- Six Wave 0 test scaffolds committed
- Commit SHAs for both commits
- Any peer-dep warnings from `npm install` (likely none but capture if they appear)
</output>
