---
phase: 03-authoring-throughput
plan: 05
type: execute
wave: 2
depends_on: [01]
files_modified:
  - scripts/render-gemini-audio.ts
  - scripts/invalidate-mram-cache.ts
  - scripts/__tests__/render-gemini-audio-cache.test.ts
autonomous: true
requirements: [AUTHOR-01, AUTHOR-03]
tags: [cache, migration, cache-key, modelId, v3-bump, gemini-pin]

must_haves:
  truths:
    - "CACHE_DIR in scripts/render-gemini-audio.ts resolves to path.resolve('rituals/_bake-cache') — NOT ~/.cache/masonic-mram-audio any more"
    - "CACHE_KEY_VERSION is the literal string 'v3' (bumped from 'v2' per D-02) with a comment citing D-02 + modelId addition"
    - "computeCacheKey() signature is (text, style, voice, modelId, preamble) — 5 positional params, modelId is 4th before preamble"
    - "The sha256 material string for cache keys includes modelId between voice and preamble: `${CACHE_KEY_VERSION}\\x00${text}\\x00${style ?? ''}\\x00${voice}\\x00${modelId}\\x00${preamble}`"
    - "renderLineAudio and every other caller of computeCacheKey (including scripts/invalidate-mram-cache.ts) pass the actual model being used — no stale call sites"
    - "A one-shot migration helper copies existing ~/.cache/masonic-mram-audio/ *.opus files into rituals/_bake-cache/ on first run, via fs.cp recursive+filter; old location preserved for rollback; migration skips if new cache has any .opus entry"
    - "DEFAULT_MODELS order is pinned with an explicit rationale comment citing D-12 (AUTHOR-03): gemini-3.1-flash-tts-preview first, older previews as fallback chain, env-overridable via GEMINI_TTS_MODELS"
    - "Tests assert: (1) CACHE_KEY_VERSION === 'v3', (2) different modelIds produce different cache keys, (3) deterministic output for identical inputs, (4) migration is one-shot (skips when NEW has an entry), (5) migration COPIES (doesn't move) when NEW is empty and OLD has .opus entries — byte-identical copy, OLD preserved, (6) no-op when OLD doesn't exist, (7) migrateLegacyCacheIfNeeded signature is `(cacheDir, oldDir = OLD_CACHE_DIR)` — tests inject tmp oldDir so they never touch the real user cache"
  artifacts:
    - path: scripts/render-gemini-audio.ts
      provides: "cache dir → rituals/_bake-cache/, CACHE_KEY_VERSION = v3, computeCacheKey(text, style, voice, modelId, preamble), one-shot fs.cp migration helper, DEFAULT_MODELS rationale comment"
      contains: "CACHE_KEY_VERSION = \"v3\""
    - path: scripts/invalidate-mram-cache.ts
      provides: "updated to call computeCacheKey with the new 5-param signature"
      contains: "computeCacheKey"
    - path: scripts/__tests__/render-gemini-audio-cache.test.ts
      provides: "six unit tests covering v3 bump, modelId key inclusion, migration idempotency"
      contains: "CACHE_KEY_VERSION"
  key_links:
    - from: "scripts/bake-all.ts (Plan 07)"
      to: scripts/render-gemini-audio.ts
      via: "import { renderLineAudio, computeCacheKey } from './render-gemini-audio'"
      pattern: "renderLineAudio"
    - from: "scripts/build-mram-from-dialogue.ts (Plan 06)"
      to: scripts/render-gemini-audio.ts
      via: "unchanged import of renderLineAudio — but the cache file location moves from home to repo"
      pattern: "renderLineAudio"
    - from: scripts/render-gemini-audio.ts
      to: "rituals/_bake-cache/ (Plan 01 infrastructure)"
      via: "mkdirSync + fs.cp migration on first use"
      pattern: "rituals/_bake-cache"
---

<objective>
Execute the cache foundation of Phase 3: (1) bump `CACHE_KEY_VERSION` from `"v2"` to `"v3"` in `scripts/render-gemini-audio.ts`; (2) extend `computeCacheKey()` signature to include `modelId` as a new parameter whose value participates in the sha256 material; (3) move `CACHE_DIR` from `~/.cache/masonic-mram-audio/` to `path.resolve("rituals/_bake-cache")`; (4) add a one-shot `fs.cp`-based migration that copies any existing legacy-cache `.opus` files into the new location on first run (old location preserved for rollback; migration skips if new cache already has entries); (5) add a DEFAULT_MODELS rationale comment locking the order per D-12 (AUTHOR-03); (6) update `scripts/invalidate-mram-cache.ts` to match the new 5-param `computeCacheKey` signature; (7) replace the Plan-01 test scaffold with full coverage.

Purpose: per D-01/D-02, adding `modelId` to the key material eliminates silent stale-hit bugs where a `v2`-keyed entry rendered by `gemini-2.5-pro-preview-tts` gets served to a run asking for `gemini-3.1-flash-tts-preview`. Bumping to `"v3"` auto-invalidates every existing cache entry — honest re-bake on first run. Moving the cache under the repo means the cache survives a new laptop with the repo. Per D-12 (AUTHOR-03), the existing DEFAULT_MODELS order is already correct; this plan locks it with a rationale comment so future edits are intentional.

Output: `render-gemini-audio.ts` with new cache location, v3 key, modelId param, migration helper, D-12 comment; `invalidate-mram-cache.ts` updated call site; six-test test file.
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
@.planning/phases/03-authoring-throughput/03-01-SUMMARY.md
@scripts/render-gemini-audio.ts
@scripts/invalidate-mram-cache.ts
@scripts/__tests__/render-gemini-audio-cache.test.ts

<interfaces>
<!-- Current state of scripts/render-gemini-audio.ts (key loci). -->

Lines 27-31 (DEFAULT_MODELS):
```typescript
const DEFAULT_MODELS = [
  "gemini-3.1-flash-tts-preview",
  "gemini-2.5-flash-preview-tts",
  "gemini-2.5-pro-preview-tts",
];
```
(Already correct per D-12 — Phase 3 just adds a comment locking it.)

Lines 37-40 (CACHE_DIR — to be replaced):
```typescript
const CACHE_DIR = path.join(
  process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache"),
  "masonic-mram-audio",
);
```

Line 50 (CACHE_KEY_VERSION — to be bumped to "v3"):
```typescript
const CACHE_KEY_VERSION = "v2";
```

Lines 588-596 (computeCacheKey — to be extended):
```typescript
export function computeCacheKey(
  text: string,
  style: string | undefined,
  voice: string,
  preamble: string = "",
): string {
  const material = `${CACHE_KEY_VERSION}\x00${text}\x00${style ?? ""}\x00${voice}\x00${preamble}`;
  return crypto.createHash("sha256").update(material).digest("hex");
}
```

New signature (D-02 — modelId inserted BEFORE preamble):
```typescript
export function computeCacheKey(
  text: string,
  style: string | undefined,
  voice: string,
  modelId: string,           // NEW
  preamble: string = "",
): string {
  const material =
    `${CACHE_KEY_VERSION}\x00${text}\x00${style ?? ""}\x00${voice}\x00${modelId}\x00${preamble}`;
  return crypto.createHash("sha256").update(material).digest("hex");
}
```

**CRITICAL callsite flow change.** Today (line ~111) the call is:
```typescript
const cacheKey = computeCacheKey(text, style, voice, preamble);
```
After the change, `modelId` must be known BEFORE the cache lookup. Two options per RESEARCH.md §Modified Files:
- **Option A (simpler):** on cache lookup, iterate each model in the fallback chain, compute the key for that model, check for a hit. Use the first hit found. On full miss, render with the first model and write under that model's key.
- **Option B:** flip the flow so model selection happens first, then compute key, then look up. This is closer to "one key per rendered line" but changes more lines.

Plan 05 uses **Option A** — minimal churn, preserves fallback-model semantics.

Migration helper (RESEARCH §Code Examples, verbatim with one safety tweak):
```typescript
const OLD_CACHE_DIR = path.join(
  process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache"),
  "masonic-mram-audio",
);
const NEW_CACHE_DIR = path.resolve("rituals/_bake-cache");

async function migrateLegacyCacheIfNeeded(): Promise<void> {
  if (!fs.existsSync(NEW_CACHE_DIR)) fs.mkdirSync(NEW_CACHE_DIR, { recursive: true });
  const hasAny = fs.readdirSync(NEW_CACHE_DIR).some((f) => f.endsWith(".opus"));
  if (hasAny) return; // one-shot: new cache already populated
  if (!fs.existsSync(OLD_CACHE_DIR)) return; // nothing to migrate
  const files = fs.readdirSync(OLD_CACHE_DIR).filter((f) => f.endsWith(".opus"));
  if (files.length === 0) return; // empty legacy cache
  console.error(
    `[AUTHOR-01] migrating legacy cache ${OLD_CACHE_DIR} → ${NEW_CACHE_DIR} ` +
      `(${files.length} entries; old location preserved for rollback)`,
  );
  await fs.promises.cp(OLD_CACHE_DIR, NEW_CACHE_DIR, {
    recursive: true,
    filter: (src) => src === OLD_CACHE_DIR || src.endsWith(".opus"),
  });
  console.error(`[AUTHOR-01] migrated ${files.length} entries.`);
}
```

**Preserved patterns (do NOT touch):**
- Atomic tmp+rename write at lines 136-140.
- `AllModelsQuotaExhausted` handling at lines 149-162.
- `onProgress` callback shape at lines 75-81.
- env-overridable `GEMINI_TTS_MODELS` via `readModelsFromEnv()` (lines 598-603).

Other callers of computeCacheKey (must also update to 5-param signature):
- `scripts/invalidate-mram-cache.ts` — grep for `computeCacheKey` to confirm its call shape.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Bump cache key to v3, add modelId, move CACHE_DIR, add migration helper, lock DEFAULT_MODELS rationale</name>
  <files>
    scripts/render-gemini-audio.ts,
    scripts/invalidate-mram-cache.ts
  </files>
  <read_first>
    scripts/render-gemini-audio.ts (full file — lines 1-604 — need accurate line anchors for every edit, especially the callsites of computeCacheKey at line ~111),
    scripts/invalidate-mram-cache.ts (full file — confirm its computeCacheKey call-site shape to update),
    .planning/phases/03-authoring-throughput/03-PATTERNS.md §scripts/render-gemini-audio.ts "Current state" and "New state" sections,
    .planning/phases/03-authoring-throughput/03-RESEARCH.md §Code Examples: "one-shot legacy cache migration" (D-01) and "cache key bump adding modelId" (D-02) — both verbatim,
    .planning/phases/03-authoring-throughput/03-CONTEXT.md §D-01, §D-02, §D-12 (locked decisions),
    scripts/render-gemini-audio.ts lines 100-170 (understand renderLineAudio loop — where to fan out cache lookup across models per Option A, and where migration helper should be called).
  </read_first>
  <action>
Execute these edits in order. The edits are mutually coupled (new signature breaks old callsites) — do NOT commit after step 1; commit only after all steps compile and tests pass. Use one commit at the end.

**Step 1 — Lock DEFAULT_MODELS order (AUTHOR-03 D-12).** At lines 23-26 (above `DEFAULT_MODELS`), REPLACE the existing comment with:

```typescript
/**
 * Models tried in order. Pinned order (AUTHOR-03 D-12): 3.1-flash-tts-preview
 * is the highest-quality preview as of 2026-04. Older 2.5-* previews retained
 * as fallback for the quota-exhaustion wait path (per the
 * gemini-tts-preview-quota-and-fallback-chain skill). Env-overridable via
 * GEMINI_TTS_MODELS (comma-separated). Same chain as
 * src/app/api/tts/gemini/route.ts.
 */
const DEFAULT_MODELS = [
  "gemini-3.1-flash-tts-preview",
  "gemini-2.5-flash-preview-tts",
  "gemini-2.5-pro-preview-tts",
];
```
(No change to the array; only the comment is replaced.)

**Step 2 — Move CACHE_DIR (AUTHOR-01 D-01).** At lines 37-40, REPLACE:

```typescript
/** Cache directory. Honor XDG_CACHE_HOME if set. */
const CACHE_DIR = path.join(
  process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache"),
  "masonic-mram-audio",
);
```

With:

```typescript
/**
 * Cache directory: per-repo, co-located with content (AUTHOR-01 D-01).
 * Was ~/.cache/masonic-mram-audio/ pre-Phase-3; moved under the repo so
 * the cache travels with the repo on machine moves. rituals/_bake-cache/
 * is gitignored (see repo-root .gitignore + nested rituals/_bake-cache/.gitignore).
 * Old location is retained as OLD_CACHE_DIR below; migrateLegacyCacheIfNeeded()
 * copies (not moves) any existing entries on first run.
 */
const OLD_CACHE_DIR = path.join(
  process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache"),
  "masonic-mram-audio",
);
const CACHE_DIR = path.resolve("rituals/_bake-cache");
```

**Step 3 — Bump CACHE_KEY_VERSION (AUTHOR-01 D-02).** At line 50, REPLACE:

```typescript
const CACHE_KEY_VERSION = "v2";
```

With:

```typescript
/**
 * Cache format version. Bump when we change the Opus encoding params
 * or the cache-key material so old cached entries miss instead of
 * replaying stale audio.
 *   - v1: initial (text, style, voice) → [style] text
 *   - v2: adds optional director's-notes preamble in the prompt + key material.
 *   - v3: adds modelId to key material (AUTHOR-01 D-02). Eliminates silent
 *         stale hits where a v2-keyed entry rendered by gemini-2.5-pro gets
 *         served to a run asking for gemini-3.1-flash. First run after this
 *         bump re-bakes all entries.
 */
const CACHE_KEY_VERSION = "v3";
```

**Step 4 — Add migration helper.** AFTER the CACHE_KEY_VERSION block (around line 62, before `// ============================================================ // Types`), INSERT the migration helper. Must be an async function; callers await it before the first cache lookup:

```typescript
/**
 * One-shot migration from OLD_CACHE_DIR (~/.cache/masonic-mram-audio/)
 * into CACHE_DIR (rituals/_bake-cache/) — AUTHOR-01 D-01.
 *
 * fs.cp copies (does not move); old location preserved for rollback.
 * One-shot: if NEW already has any .opus entry the migration is a no-op.
 * Most migrated entries will miss on first lookup after the v3 bump
 * (Step 3) and get re-rendered anyway — the migration still saves any
 * entry whose key happens to match under v3 (voice+style+text+modelId
 * combo that was latently equivalent to a v3 key).
 */
let migrationRan = false;
async function migrateLegacyCacheIfNeeded(
  cacheDir: string,
  oldDir: string = OLD_CACHE_DIR,  // default to real legacy path; tests pass a tmp dir
): Promise<void> {
  if (migrationRan) return;
  migrationRan = true;
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
  const hasAny = fs.readdirSync(cacheDir).some((f) => f.endsWith(".opus"));
  if (hasAny) return;
  if (!fs.existsSync(oldDir)) return;
  const files = fs.readdirSync(oldDir).filter((f) => f.endsWith(".opus"));
  if (files.length === 0) return;
  console.error(
    `[AUTHOR-01] migrating legacy cache ${oldDir} → ${cacheDir} ` +
      `(${files.length} entries; old location preserved for rollback)`,
  );
  await fs.promises.cp(oldDir, cacheDir, {
    recursive: true,
    filter: (src) => src === oldDir || src.endsWith(".opus"),
  });
  console.error(`[AUTHOR-01] migrated ${files.length} entries.`);
}

// Expose a test-hook to reset the one-shot guard between tests.
export function __resetMigrationFlagForTests(): void { migrationRan = false; }
```

Export the migration helper so tests can inject test cache dirs:
```typescript
export { migrateLegacyCacheIfNeeded };
```
(Place the export statement either immediately after the function or in an existing export block near the bottom.)

**Step 5 — Extend computeCacheKey (D-02).** At lines 588-596, REPLACE the existing signature:

```typescript
export function computeCacheKey(
  text: string,
  style: string | undefined,
  voice: string,
  modelId: string,            // NEW (AUTHOR-01 D-02)
  preamble: string = "",
): string {
  // Key material order: version | text | style | voice | modelId | preamble.
  // modelId is between voice and preamble so voice+style+text equivalence alone
  // doesn't produce equal keys across different Gemini model revs.
  const material =
    `${CACHE_KEY_VERSION}\x00${text}\x00${style ?? ""}\x00${voice}\x00${modelId}\x00${preamble}`;
  return crypto.createHash("sha256").update(material).digest("hex");
}
```

**Step 6 — Update renderLineAudio's cache lookup (Option A: iterate models for hit).** At the renderLineAudio cache-check block around line 108-117, REPLACE:

```typescript
const cacheKey = computeCacheKey(text, style, voice, preamble);
const cachePath = path.join(cacheDir, `${cacheKey}.opus`);

if (fs.existsSync(cachePath)) {
  options.onProgress?.({ status: "cache-hit", cacheKey });
  return fs.readFileSync(cachePath);
}
```

With (Option A — probe each model in the fallback chain for a hit before falling through to render):

```typescript
// AUTHOR-01 D-02: cache key now includes modelId. On lookup, probe each
// model in the fallback chain; any pre-existing hit (against any model in
// the chain) counts — we don't want to re-render just because a different
// model produced the same audio previously. On a full miss, the render
// loop writes under the actually-used model's key.
const models = options.models ?? readModelsFromEnv() ?? DEFAULT_MODELS;

// Run migration before the first cache read.
await migrateLegacyCacheIfNeeded(cacheDir);

for (const probeModel of models) {
  const probeKey = computeCacheKey(text, style, voice, probeModel, preamble);
  const probePath = path.join(cacheDir, `${probeKey}.opus`);
  if (fs.existsSync(probePath)) {
    options.onProgress?.({ status: "cache-hit", cacheKey: probeKey });
    return fs.readFileSync(probePath);
  }
}
// No hit across any model in the chain — fall through to render loop.
```

Then in the render-success branch around lines 134-148 (where the atomic write happens), the cache key must match the actually-used model. Update to use the returned `model` from `callGeminiWithFallback`:

```typescript
const { wav, model } = await callGeminiWithFallback(
  text, style, voice, models, options.apiKeys, preamble,
);
const opus = await encodeWavToOpus(wav);

// Compute cache key under the model actually used (per D-02).
const cacheKey = computeCacheKey(text, style, voice, model, preamble);
const cachePath = path.join(cacheDir, `${cacheKey}.opus`);

// Atomic write: stage to .tmp then rename. Prevents corrupt cache
// entries if the script is killed mid-write.
const tmpPath = `${cachePath}.tmp`;
fs.writeFileSync(tmpPath, opus);
fs.renameSync(tmpPath, cachePath);

options.onProgress?.({
  status: "rendered",
  model,
  cacheKey,
  bytesOut: opus.length,
});
return opus;
```

**IMPORTANT:** the pre-render `models = ...` assignment at step 6 above replaces the one that currently exists at line 119 — there must be ONE `models` declaration in the function scope, at the top, and the render loop uses it. If the existing code has `const models = options.models ?? readModelsFromEnv() ?? DEFAULT_MODELS;` at line 119, move it UP to before the probe loop.

**Step 7 — Update every other caller of computeCacheKey.** Run `grep -rn "computeCacheKey" scripts/ src/` to find all callers. Known callers:
- `scripts/render-gemini-audio.ts` itself (updated above)
- `scripts/invalidate-mram-cache.ts` — expect something like `const key = computeCacheKey(text, style, voice, preamble);` — update to include modelId. If the script invalidates by iterating (text, style, voice) triples without knowing the model, add a loop: for each DEFAULT_MODEL, compute key and attempt delete. Preserve the script's existing CLI semantics.

Read `scripts/invalidate-mram-cache.ts` fully and update the callsite. Typical update:
```typescript
// BEFORE: const key = computeCacheKey(text, style, voice, preamble);
// AFTER: iterate the fallback chain and delete any matching keys.
import { DEFAULT_MODELS } from "./render-gemini-audio"; // export DEFAULT_MODELS if not already

for (const modelId of DEFAULT_MODELS) {
  const key = computeCacheKey(text, style, voice, modelId, preamble);
  const p = path.join(CACHE_DIR, `${key}.opus`);
  if (fs.existsSync(p)) { fs.unlinkSync(p); invalidated++; }
}
```
If `DEFAULT_MODELS` isn't already exported from `render-gemini-audio.ts`, ADD `export` to the declaration at the top.

**Step 8 — Type-check & build.** Run:
```bash
npx tsc --noEmit && npm run build
```
Fix any compile errors before proceeding.

Commit: `author-01: bump cache key to v3, add modelId to key material, migrate legacy cache`
  </action>
  <verify>
    <automated>grep -q 'CACHE_KEY_VERSION = "v3"' scripts/render-gemini-audio.ts && grep -q 'rituals/_bake-cache' scripts/render-gemini-audio.ts && grep -q 'modelId: string' scripts/render-gemini-audio.ts && grep -q 'migrateLegacyCacheIfNeeded' scripts/render-gemini-audio.ts && grep -q 'AUTHOR-03 D-12' scripts/render-gemini-audio.ts && grep -qE 'DEFAULT_MODELS|modelId' scripts/invalidate-mram-cache.ts && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep 'CACHE_KEY_VERSION = "v3"' scripts/render-gemini-audio.ts` returns exactly 1 match.
    - `grep 'rituals/_bake-cache' scripts/render-gemini-audio.ts` returns ≥ 1 match (new CACHE_DIR).
    - `grep 'OLD_CACHE_DIR' scripts/render-gemini-audio.ts` returns ≥ 1 match (rollback-preserved legacy path).
    - `grep 'modelId: string' scripts/render-gemini-audio.ts` returns ≥ 1 match (computeCacheKey signature).
    - `grep 'migrateLegacyCacheIfNeeded' scripts/render-gemini-audio.ts` returns ≥ 2 matches (declaration + call in renderLineAudio).
    - `grep 'export { migrateLegacyCacheIfNeeded }' scripts/render-gemini-audio.ts || grep 'export async function migrateLegacyCacheIfNeeded' scripts/render-gemini-audio.ts` returns ≥ 1 match.
    - `grep 'AUTHOR-03 D-12' scripts/render-gemini-audio.ts` returns ≥ 1 match (DEFAULT_MODELS rationale comment).
    - `grep 'computeCacheKey' scripts/invalidate-mram-cache.ts` call site includes a modelId argument (verified by manual inspection or by `grep -A 2 'computeCacheKey' scripts/invalidate-mram-cache.ts` showing 5 positional args or a model iteration loop).
    - `npx tsc --noEmit` exits 0.
    - `npm run build` exits 0.
    - Full test suite still green on the previously-existing tests: `npx vitest run --no-coverage` exits 0 (some tests may have been adjusted; at minimum nothing unexpected breaks — the new test file lands in Task 2).
  </acceptance_criteria>
  <done>
    render-gemini-audio.ts now uses v3 cache keys including modelId, stores cache under rituals/_bake-cache/, migrates legacy entries on first run, and carries a D-12 rationale comment locking the DEFAULT_MODELS order. invalidate-mram-cache.ts adopts the new 5-param signature. Full build + type-check pass.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Fill Plan-01 test scaffold with six concrete cache-key + migration tests</name>
  <files>
    scripts/__tests__/render-gemini-audio-cache.test.ts
  </files>
  <read_first>
    scripts/__tests__/render-gemini-audio-cache.test.ts (Plan-01 Wave 0 scaffold — it.todo stubs to replace),
    scripts/render-gemini-audio.ts (Task 1 output — confirm exports: computeCacheKey, migrateLegacyCacheIfNeeded, CACHE_KEY_VERSION),
    src/lib/__tests__/dialogue-to-mram.test.ts (analog: Node-env test writing/reading bytes via real fs, uses os.tmpdir),
    .planning/phases/03-authoring-throughput/03-PATTERNS.md §scripts/__tests__/bake-all.test.ts (shape for scripts/__tests__ tests — similar pattern).
  </read_first>
  <behavior>
    - Test 1: `CACHE_KEY_VERSION === "v3"` (regression guard — if anyone reverts the bump, this fails).
    - Test 2: `computeCacheKey("hello", undefined, "Charon", "gemini-3.1-flash-tts-preview", "")` is DIFFERENT from `computeCacheKey("hello", undefined, "Charon", "gemini-2.5-pro-preview-tts", "")` — modelId participates in the key.
    - Test 3: `computeCacheKey("hello", undefined, "Charon", "gemini-3.1-flash-tts-preview", "")` called twice returns identical hex string (deterministic).
    - Test 4: `computeCacheKey` output matches `/^[0-9a-f]{64}$/` (sha256 hex).
    - Test 5 (migration one-shot): write a `.opus` file into the TEST new-cache dir first → call `migrateLegacyCacheIfNeeded(testNewDir)` with a populated OLD → assert no new entries appear (migration is one-shot, skips when NEW is non-empty).
    - Test 6 (migration copy): create isolated tmp OLD dir with 2 `.opus` files → point NEW to empty tmp dir → call `migrateLegacyCacheIfNeeded(testNewDir)` with OLD_CACHE_DIR overridden via a test-only env var OR via file-level mock (see note) → assert both files now exist in NEW AND still exist in OLD. **NOTE:** because OLD_CACHE_DIR is a module-level const, the test either: (a) creates actual fixture dirs at OLD_CACHE_DIR's real path (risky — pollutes user's home); (b) mocks `fs` to redirect reads of OLD_CACHE_DIR; or (c) we export OLD_CACHE_DIR and use `vi.doMock` to override. Prefer (c) — add `export { OLD_CACHE_DIR }` to render-gemini-audio.ts and mock it per-test via `vi.spyOn(fs, "existsSync").mockImplementation(...)`-style. If tests feel fragile, skip the full end-to-end migration test and only cover the pure-logic cases (Test 5 + the cacheKey tests).
    - Test 7 (migration no-op when OLD doesn't exist): point OLD to a non-existent tmp path (via mock or by running the helper with the tmp new dir; OLD is the real path which will almost certainly not be a tmp dir the test controls) → call `migrateLegacyCacheIfNeeded(testNewDir)` → assert NEW is still empty (or contains only what it had before the call) AND no error thrown.
  </behavior>
  <action>
Replace the Plan-01 `it.todo` scaffold in `scripts/__tests__/render-gemini-audio-cache.test.ts` with concrete tests:

```typescript
// @vitest-environment node
/**
 * Tests for AUTHOR-01 cache key v3 + modelId (D-02) and legacy-cache
 * migration (D-01). Covers scripts/render-gemini-audio.ts.
 *
 * Scope: pure-logic computeCacheKey tests + migration helper using isolated
 * tmpdirs. The migration helper is run with a test-provided newCacheDir
 * arg; OLD_CACHE_DIR is the module-level real path. We override it via a
 * module-scoped variable where possible, and otherwise scope tests so the
 * real OLD_CACHE_DIR's presence/absence doesn't affect the outcome.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { computeCacheKey, migrateLegacyCacheIfNeeded, __resetMigrationFlagForTests } from "../render-gemini-audio";

// Helper: fresh tmp dir per test, cleaned in afterEach.
let tmpRoot: string;
beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bake-cache-test-"));
  __resetMigrationFlagForTests(); // allow per-test migrations
});
afterEach(() => {
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
});

describe("computeCacheKey v3 + modelId (AUTHOR-01 D-02)", () => {
  it("produces a 64-hex-char sha256 string", () => {
    const key = computeCacheKey("hello", undefined, "Charon", "gemini-3.1-flash-tts-preview", "");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic (same inputs → same key)", () => {
    const a = computeCacheKey("hello", undefined, "Charon", "gemini-3.1-flash-tts-preview", "");
    const b = computeCacheKey("hello", undefined, "Charon", "gemini-3.1-flash-tts-preview", "");
    expect(a).toBe(b);
  });

  it("changes when modelId changes (D-02 invariant)", () => {
    const k1 = computeCacheKey("hello", undefined, "Charon", "gemini-3.1-flash-tts-preview", "");
    const k2 = computeCacheKey("hello", undefined, "Charon", "gemini-2.5-pro-preview-tts", "");
    expect(k1).not.toBe(k2);
  });

  it("changes when text changes", () => {
    const k1 = computeCacheKey("hello", undefined, "Charon", "gemini-3.1-flash-tts-preview", "");
    const k2 = computeCacheKey("world", undefined, "Charon", "gemini-3.1-flash-tts-preview", "");
    expect(k1).not.toBe(k2);
  });

  it("changes when voice changes", () => {
    const k1 = computeCacheKey("hello", undefined, "Charon", "gemini-3.1-flash-tts-preview", "");
    const k2 = computeCacheKey("hello", undefined, "Alnilam", "gemini-3.1-flash-tts-preview", "");
    expect(k1).not.toBe(k2);
  });
});

describe("migrateLegacyCacheIfNeeded (AUTHOR-01 D-01)", () => {
  it("skips migration when new cache already has a .opus entry (one-shot)", async () => {
    // Seed new cache with an existing .opus; migration should no-op.
    const seededKey = "a".repeat(64);
    fs.writeFileSync(path.join(tmpRoot, `${seededKey}.opus`), Buffer.from("seeded"));
    const oldTmp = fs.mkdtempSync(path.join(os.tmpdir(), "bake-old-"));
    try {
      // Even with an OLD populated with files, migration must skip because NEW has an entry.
      fs.writeFileSync(path.join(oldTmp, "b".repeat(64) + ".opus"), Buffer.from("leg"));
      const before = fs.readdirSync(tmpRoot).sort();
      await migrateLegacyCacheIfNeeded(tmpRoot, oldTmp);
      const after = fs.readdirSync(tmpRoot).sort();
      expect(after).toEqual(before);
    } finally {
      try { fs.rmSync(oldTmp, { recursive: true, force: true }); } catch {}
    }
  });

  it("COPIES .opus entries from OLD to NEW when NEW is empty and OLD has entries (load-bearing)", async () => {
    // The core AUTHOR-01 D-01 guarantee: developers with a pre-Phase-3 legacy
    // cache at ~/.cache/masonic-mram-audio/ get their entries copied (not moved)
    // into rituals/_bake-cache/ on first bake.
    const oldTmp = fs.mkdtempSync(path.join(os.tmpdir(), "bake-old-"));
    try {
      const key1 = "a".repeat(64);
      const key2 = "b".repeat(64);
      fs.writeFileSync(path.join(oldTmp, `${key1}.opus`), Buffer.from("AAA"));
      fs.writeFileSync(path.join(oldTmp, `${key2}.opus`), Buffer.from("BBB"));
      // Also put a non-.opus file to confirm filter skips it.
      fs.writeFileSync(path.join(oldTmp, "unrelated.txt"), "noise");

      expect(fs.readdirSync(tmpRoot)).toEqual([]); // NEW starts empty

      await migrateLegacyCacheIfNeeded(tmpRoot, oldTmp);

      // BOTH .opus files present in NEW.
      const newFiles = fs.readdirSync(tmpRoot).sort();
      expect(newFiles).toContain(`${key1}.opus`);
      expect(newFiles).toContain(`${key2}.opus`);
      // Byte-identical copy.
      expect(fs.readFileSync(path.join(tmpRoot, `${key1}.opus`))).toEqual(Buffer.from("AAA"));
      expect(fs.readFileSync(path.join(tmpRoot, `${key2}.opus`))).toEqual(Buffer.from("BBB"));
      // Filter excluded the non-opus file.
      expect(newFiles).not.toContain("unrelated.txt");
      // COPY (not move): OLD still has the files.
      expect(fs.existsSync(path.join(oldTmp, `${key1}.opus`))).toBe(true);
      expect(fs.existsSync(path.join(oldTmp, `${key2}.opus`))).toBe(true);
    } finally {
      try { fs.rmSync(oldTmp, { recursive: true, force: true }); } catch {}
    }
  });

  it("no-ops silently when OLD does not exist", async () => {
    const nonexistentOld = path.join(tmpRoot, "does-not-exist");
    await expect(migrateLegacyCacheIfNeeded(tmpRoot, nonexistentOld)).resolves.not.toThrow();
    expect(fs.readdirSync(tmpRoot)).toEqual([]); // NEW untouched
  });

  it("no-ops silently when OLD exists but is empty", async () => {
    const emptyOld = fs.mkdtempSync(path.join(os.tmpdir(), "bake-empty-old-"));
    try {
      await expect(migrateLegacyCacheIfNeeded(tmpRoot, emptyOld)).resolves.not.toThrow();
      expect(fs.readdirSync(tmpRoot)).toEqual([]);
    } finally {
      try { fs.rmSync(emptyOld, { recursive: true, force: true }); } catch {}
    }
  });

  it("creates the cache dir if missing", async () => {
    const missingDir = path.join(tmpRoot, "does-not-exist-yet");
    const emptyOld = fs.mkdtempSync(path.join(os.tmpdir(), "bake-empty-old-"));
    try {
      expect(fs.existsSync(missingDir)).toBe(false);
      await migrateLegacyCacheIfNeeded(missingDir, emptyOld);
      expect(fs.existsSync(missingDir)).toBe(true);
    } finally {
      try { fs.rmSync(emptyOld, { recursive: true, force: true }); } catch {}
    }
  });

  it("is idempotent across repeated calls (module-level guard)", async () => {
    // First call runs (empty OLD → no-op); second call short-circuits on migrationRan.
    const emptyOld = fs.mkdtempSync(path.join(os.tmpdir(), "bake-empty-old-"));
    try {
      await migrateLegacyCacheIfNeeded(tmpRoot, emptyOld);
      const after1 = fs.readdirSync(tmpRoot).sort();
      await migrateLegacyCacheIfNeeded(tmpRoot, emptyOld);
      const after2 = fs.readdirSync(tmpRoot).sort();
      expect(after2).toEqual(after1);
    } finally {
      try { fs.rmSync(emptyOld, { recursive: true, force: true }); } catch {}
    }
  });
});

describe("AUTHOR-03 D-12 DEFAULT_MODELS rationale comment", () => {
  it("scripts/render-gemini-audio.ts contains the D-12 rationale comment", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../render-gemini-audio.ts"),
      "utf8",
    );
    expect(src).toMatch(/AUTHOR-03 D-12/);
    // Pin first entry
    expect(src).toMatch(/gemini-3.1-flash-tts-preview/);
  });
});
```

**NOTE on migration testing:** `migrateLegacyCacheIfNeeded` now accepts `oldDir` as a 2nd parameter (defaults to real `OLD_CACHE_DIR`). Tests pass isolated tmp dirs for both NEW and OLD — never touches the developer's real `~/.cache/masonic-mram-audio/`. The load-bearing copy test is now in scope.

Commit: `author-01: test cache v3 bump + modelId key participation + migration idempotency`
  </action>
  <verify>
    <automated>npx vitest run --no-coverage scripts/__tests__/render-gemini-audio-cache.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - Test file has no `it.todo(` remaining: `grep -c "it.todo(" scripts/__tests__/render-gemini-audio-cache.test.ts` returns 0.
    - `npx vitest run --no-coverage scripts/__tests__/render-gemini-audio-cache.test.ts` exits 0 with ≥ 12 tests passing.
    - All five "computeCacheKey" tests pass (length, determinism, modelId-sensitivity, text-sensitivity, voice-sensitivity).
    - All six "migrateLegacyCacheIfNeeded" tests pass (one-shot skip with OLD populated, load-bearing COPY when NEW empty + OLD has entries, no-op on missing OLD, no-op on empty OLD, creates dir, idempotent).
    - The D-12 rationale-comment regression test passes.
    - `npx vitest run --no-coverage` (full suite) exits 0 — no regression anywhere.
  </acceptance_criteria>
  <done>
    Cache key v3 bump and modelId inclusion are regression-guarded by five cacheKey tests. Migration idempotency is covered by four helper tests. The D-12 DEFAULT_MODELS rationale comment is guarded by a source-grep test so future refactors don't silently drop it.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Developer's ~/.cache/masonic-mram-audio/ → repo-co-located rituals/_bake-cache/ | migration is a copy; old location preserved until manually deleted, so a bad migration is recoverable |
| Cache key (sha256) → rendered audio file | sha256 collision risk is negligible; key is 64-hex-char; v3 bump forces an honest re-bake of every entry |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-05 | Information Disclosure / Integrity | Cache poisoning via SHA collision → wrong audio served. Also stale 2.5-pro-tagged-as-3.1-flash entries served pre-v3 bump. | mitigate | sha256 is collision-resistant for adversarial and benign content (literally unfindable collisions at 2^128 effort); `CACHE_KEY_VERSION` bump from v2→v3 auto-invalidates every existing cache entry (the v2 prefix is no longer in the material). modelId participation (D-02) eliminates the silent-stale-hit class entirely: two Gemini models with the same text/voice/style/preamble now produce distinct keys. |
| T-03-05b | Tampering | A malicious file dropped in `rituals/_bake-cache/` would be served by a future bake as if it were a legitimate cache hit | accept | `rituals/_bake-cache/` is a local developer-owned directory. At the point an attacker can write files there, they already own the dev machine (same threat-surface as any other source file). Not a Phase 3 scope to defend against. Phase 6 ADMIN-05 per-ritual build hashes provide end-to-end integrity for the invited-user-facing side. |
| T-03-05c | Data Loss | Migration `fs.cp` copy fails mid-operation → partial state | mitigate | `fs.cp` is NOT atomic per-file but the legacy location is PRESERVED (copy, not move). Partial migration on first run means NEW has some files, OLD has all files; next invocation of `renderLineAudio` sees `hasAny = true` in NEW (the one-shot guard) and does not retry — but every missing NEW entry simply misses on lookup and gets re-rendered. Worst case: some extra re-bakes happen. Recovery: `rm -rf rituals/_bake-cache/*` and re-run to restart migration. |
</threat_model>

<verification>
- `grep 'CACHE_KEY_VERSION = "v3"' scripts/render-gemini-audio.ts` — 1 match.
- `grep -c 'rituals/_bake-cache' scripts/render-gemini-audio.ts` — ≥ 1.
- `grep -c 'modelId' scripts/render-gemini-audio.ts` — ≥ 4 (signature, material string, callsite passes, optional docs).
- `npx tsc --noEmit` — exits 0.
- `npm run build` — exits 0.
- `npx vitest run --no-coverage scripts/__tests__/render-gemini-audio-cache.test.ts` — all tests pass.
- `npx vitest run --no-coverage` (full suite) — exits 0.
- Manual sanity: running `npx tsx -e "import('./scripts/render-gemini-audio.ts').then(m => console.log(typeof m.computeCacheKey))"` prints `function` (ESM import resolves).
</verification>

<success_criteria>
- `scripts/render-gemini-audio.ts` now uses `rituals/_bake-cache/` as its cache directory, bumps `CACHE_KEY_VERSION` to `"v3"`, includes `modelId` in the sha256 key material, and runs a one-shot migration helper on first `renderLineAudio` call.
- DEFAULT_MODELS carries a D-12 rationale comment locking the order.
- `scripts/invalidate-mram-cache.ts` calls the new 5-param computeCacheKey (via model iteration or a single call per model).
- `scripts/__tests__/render-gemini-audio-cache.test.ts` has six+ passing tests covering the D-01 and D-02 invariants.
- Downstream Plan 06 (build-mram) and Plan 07 (bake-all) can use `renderLineAudio` without any further cache-plumbing work.
</success_criteria>

<output>
After completion, create `.planning/phases/03-authoring-throughput/03-05-SUMMARY.md` documenting:
- All three cache invariants enforced (v3 key, modelId in material, repo-local location)
- Migration behavior verified (one-shot, copy not move, idempotent)
- Number of legacy `.opus` entries that would migrate on Shannon's dev machine (check `ls ~/.cache/masonic-mram-audio/*.opus | wc -l` before first bake; capture in summary)
- DEFAULT_MODELS rationale comment committed + lint-guarded by the regression test
- Commit SHAs for both commits
</output>
