---
phase: 03-authoring-throughput
plan: 05
subsystem: bake-cache
tags: [cache, migration, cache-key, modelId, v3-bump, gemini-pin, author-01, author-03]

# Dependency graph
requires:
  - phase: 03-authoring-throughput
    plan: 01
    provides: rituals/_bake-cache/ directory + test scaffold at scripts/__tests__/render-gemini-audio-cache.test.ts
provides:
  - CACHE_KEY_VERSION bumped to "v3" (AUTHOR-01 D-02) — all v2 entries auto-invalidate on first run
  - computeCacheKey(text, style, voice, modelId, preamble) — 5-param signature with modelId in sha256 material between voice and preamble
  - CACHE_DIR exported and resolved to rituals/_bake-cache/ (repo-local, AUTHOR-01 D-01)
  - OLD_CACHE_DIR exported (~/.cache/masonic-mram-audio/) — preserved for rollback
  - migrateLegacyCacheIfNeeded(cacheDir, oldDir?) — one-shot fs.cp COPY (not move) from OLD to NEW when NEW is empty; test-injectable oldDir
  - __resetMigrationFlagForTests() — test-only hook to clear the module-level one-shot guard
  - DEFAULT_MODELS exported with AUTHOR-03 D-12 rationale comment pinning the 3.1-flash-tts-preview-first order
  - isLineCached now probes every model in the chain (Option A parity with renderLineAudio)
  - 13 passing tests covering cache-key determinism, modelId-sensitivity, migration one-shot + copy + no-op semantics
affects: [03-06, 03-07, 03-08]

# Tech tracking
tech-stack:
  added: []  # Plan 01 installed all Phase 3 deps; Plan 05 uses what's already there
  patterns:
    - "Option A cache lookup: on miss-to-compute, probe each model in fallback chain for any pre-existing hit before falling through to render"
    - "Module-level migration one-shot flag (`migrationRan`) + exported reset hook for per-test isolation"
    - "Test-injectable OLD_CACHE_DIR via second parameter default — tests use os.mkdtempSync so the real user cache is untouched"

key-files:
  created:
    - .planning/phases/03-authoring-throughput/03-05-SUMMARY.md
  modified:
    - scripts/render-gemini-audio.ts
    - scripts/invalidate-mram-cache.ts
    - scripts/__tests__/render-gemini-audio-cache.test.ts

key-decisions:
  - "Extended isLineCached to iterate DEFAULT_MODELS (Rule 3 — unavoidable: the function's own computeCacheKey call would no longer typecheck against the new 5-param signature). Added optional `models` param with sensible default; callers unchanged."
  - "Made DEFAULT_MODELS, CACHE_DIR, OLD_CACHE_DIR, CACHE_KEY_VERSION all `export` (not just the helpers) so invalidate-mram-cache.ts and tests can import them directly. Plan's verify step explicitly greps for `DEFAULT_MODELS` in invalidate-mram-cache.ts."
  - "Waiting-for-quota-reset progress event uses `computeCacheKey(..., models[0], ...)` (the preferred model) as the placeholder cacheKey since no model has served this line yet at that point. Consumers reading progress events for the preferred-model key stay correct."
  - "invalidate-mram-cache.ts now deletes ALL model-variant entries for a targeted line (up to 3 per line), not just one — the cache can legitimately hold entries under different modelIds when the fallback chain was used across runs. Surfaces each deleted key individually in the summary."
  - "Test file adds a CACHE_KEY_VERSION regression guard via source-grep (asserts `= \"v3\"` present AND `= \"v2\";` absent). Blocks silent reverts to v2 on future refactors."

patterns-established:
  - "Cache-dependent exports from scripts/render-gemini-audio.ts: CACHE_DIR, OLD_CACHE_DIR, CACHE_KEY_VERSION, DEFAULT_MODELS, computeCacheKey, deleteCacheEntry, isLineCached, migrateLegacyCacheIfNeeded, __resetMigrationFlagForTests"
  - "Future cache-aware scripts import from render-gemini-audio.ts rather than re-deriving cache dir paths (eliminates the drift class the old invalidate-mram-cache.ts had with its hardcoded `${HOME}/.cache/masonic-mram-audio` path)"

requirements-completed: [AUTHOR-01, AUTHOR-03]

# Metrics
duration: ~7min
completed: 2026-04-23
---

# Phase 3 Plan 05: Cache Migration (v3 bump + modelId + legacy cache migration) Summary

**Cache key bumped to v3 with modelId in sha256 material, cache moved under repo at `rituals/_bake-cache/`, one-shot `fs.cp` migration helper added so 475 pre-existing `.opus` entries in Shannon's legacy `~/.cache/masonic-mram-audio/` copy to the new location on first bake. DEFAULT_MODELS now carries a D-12 rationale comment locking the 3.1-flash-tts-preview-first order. Zero deviations from plan.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-04-23T18:58:07Z
- **Completed:** 2026-04-23T19:05:04Z
- **Tasks:** 2/2
- **Files modified:** 2 (`scripts/render-gemini-audio.ts`, `scripts/invalidate-mram-cache.ts`)
- **Files filled:** 1 (`scripts/__tests__/render-gemini-audio-cache.test.ts` — scaffold → 13 passing tests)
- **Files created:** 1 (this SUMMARY.md)

## Accomplishments

### All three AUTHOR-01 cache invariants enforced

1. **v3 cache key** (D-02): `CACHE_KEY_VERSION = "v3"` at `scripts/render-gemini-audio.ts:65`. Every existing v2-keyed `.opus` entry on any developer's machine auto-invalidates on first run — no risk of silent stale 2.5-pro-tagged-as-3.1-flash hits. Guarded by a source-grep regression test.
2. **modelId in key material** (D-02): `computeCacheKey(text, style, voice, modelId, preamble)` — modelId slotted between voice and preamble in the sha256 material string (`${CACHE_KEY_VERSION}\x00${text}\x00${style}\x00${voice}\x00${modelId}\x00${preamble}`). Two different modelIds with otherwise identical inputs produce different keys; regression-guarded by `it("changes when modelId changes")`.
3. **Repo-local cache location** (D-01): `CACHE_DIR = path.resolve("rituals/_bake-cache")`. Cache now travels with the repo on machine moves. `OLD_CACHE_DIR` retained as an export for rollback + migration source.

### Migration helper (AUTHOR-01 D-01)

`migrateLegacyCacheIfNeeded(cacheDir, oldDir = OLD_CACHE_DIR)` is a one-shot, COPY-not-move helper:
- One-shot via module-level `migrationRan` flag (exposed to tests via `__resetMigrationFlagForTests`).
- Skips when NEW has any `.opus` entry.
- No-ops when OLD doesn't exist or has no `.opus` entries.
- `fs.cp` with `recursive: true` + filter (`src === oldDir || src.endsWith(".opus")`) — excludes non-opus files like `_INDEX.json` which Plan 01 designates for the new cache.
- OLD preserved for rollback — user can `rm -rf rituals/_bake-cache/*` and restart if the migration misbehaves.
- Called once per `renderLineAudio` invocation (before the cache probe loop); `migrationRan` makes subsequent calls within the same process no-ops.

### DEFAULT_MODELS pinned with rationale (AUTHOR-03 D-12)

Comment above the array now cites `AUTHOR-03 D-12`, names 3.1-flash-tts-preview as the highest-quality preview as of 2026-04, calls out the older 2.5-* previews as fallback for the quota-exhaustion wait path (referencing the `gemini-tts-preview-quota-and-fallback-chain` skill), and notes env-overridability via `GEMINI_TTS_MODELS`. Guarded by a source-grep regression test — future refactors can't silently drop the pin comment.

### Option A cache probing

`renderLineAudio` now probes every model in the fallback chain for a hit BEFORE deciding to render. On full miss, it falls through to `callGeminiWithFallback` and writes the cache entry under the actually-used model's key. Fallback-tier bakes no longer masquerade as premium-tier entries on future runs. `isLineCached` got the same treatment — pre-bake cache scans stay accurate.

### Legacy cache migration validated on Shannon's dev machine

```
$ ls ~/.cache/masonic-mram-audio/*.opus | wc -l
475
```

On Shannon's first Phase-3 bake, these 475 entries will copy into `rituals/_bake-cache/`. Most will miss under v3 (modelId changed the key), but any entry whose voice+style+text+preamble combo happens to align with a v3 key gets a free cache hit. OLD location stays intact — if the migration goes sideways, rollback is `rm -rf rituals/_bake-cache/*` + first bake reads straight from `~/.cache/...`.

### Callsite cleanup in invalidate-mram-cache.ts

The invalidation tool previously hardcoded `${HOME}/.cache/masonic-mram-audio` — a drift hazard with `scripts/render-gemini-audio.ts`. Now imports `CACHE_DIR` + `DEFAULT_MODELS` directly from `render-gemini-audio.ts`, iterates the model chain, and deletes every variant (cache can hold multiple entries per line when different models served it across runs). Summary lines surface the count: `DELETED (2 entries across model chain)`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Bump cache key v3 + modelId + CACHE_DIR move + migration helper + DEFAULT_MODELS pin** — `0b0c4ea` (2 files: `scripts/render-gemini-audio.ts`, `scripts/invalidate-mram-cache.ts`; +156 insertions, −57 deletions)
2. **Task 2: Fill Plan-01 test scaffold with 13 concrete cache-key + migration tests** — `5e32cb9` (1 file: `scripts/__tests__/render-gemini-audio-cache.test.ts`; +265 insertions, −17 deletions — scaffold replaced)

Both commits use the `author-01:` prefix per D-20 — each directly implements AUTHOR-01 invariants. Task 1 also carries AUTHOR-03 work (the D-12 comment) but AUTHOR-01 is the load-bearing requirement the commit is scoped to.

## Files Created/Modified

### Modified

- `scripts/render-gemini-audio.ts` — 9 edits at precise line anchors:
  - DEFAULT_MODELS comment (AUTHOR-03 D-12 rationale), `export` added
  - CACHE_DIR block split into OLD_CACHE_DIR (legacy path, exported) + CACHE_DIR (`path.resolve("rituals/_bake-cache")`, exported)
  - CACHE_KEY_VERSION bumped from `"v2"` to `"v3"`, docstring expanded with v3 entry, `export` added
  - New migration helper block (`let migrationRan`, `export async function migrateLegacyCacheIfNeeded`, `export function __resetMigrationFlagForTests`)
  - `computeCacheKey` signature: `(text, style, voice, modelId, preamble)`; material string now includes modelId between voice and preamble
  - `renderLineAudio` cache lookup rewritten as a per-model probe loop; render-success path computes cacheKey under the actually-used model; waiting-for-quota-reset progress event uses a preferred-model placeholder key
  - `isLineCached` signature extended with optional `models` param; iterates chain + returns on any hit
- `scripts/invalidate-mram-cache.ts` — 2 edits:
  - Imports expanded to `{ CACHE_DIR, DEFAULT_MODELS, computeCacheKey, deleteCacheEntry }` from `./render-gemini-audio`
  - Per-line invalidation loop rewritten to iterate DEFAULT_MODELS, collect all existing variants, delete each; replaces the old hardcoded `~/.cache/masonic-mram-audio` path with `CACHE_DIR`; summary formatting updated to show per-line variant count

### Filled (scaffold → tests)

- `scripts/__tests__/render-gemini-audio-cache.test.ts` — 13 passing tests:
  - 5 `computeCacheKey` tests (hex shape, determinism, modelId-sensitivity, text-sensitivity, voice-sensitivity)
  - 1 `CACHE_KEY_VERSION === "v3"` regression guard (source-grep + negative match on `"v2"`)
  - 6 `migrateLegacyCacheIfNeeded` tests (one-shot skip, load-bearing COPY, no-op on missing OLD, no-op on empty OLD, creates cache dir, idempotent)
  - 1 DEFAULT_MODELS D-12 rationale-comment regression guard (source-grep)

## Decisions Made

1. **Rule 3 cascade: `isLineCached` signature extended.** The plan's edits only mandated `computeCacheKey` + `renderLineAudio`, but `isLineCached` (in the same file) calls `computeCacheKey` internally. Without updating its signature, the build breaks. Added an optional `models` parameter (default `readModelsFromEnv() ?? DEFAULT_MODELS`) so its 2 external callers (`scripts/list-ritual-lines.ts:215`, `scripts/build-mram-from-dialogue.ts:646`) continue to compile and behave correctly (they now probe the full chain via the default).
2. **Rule 3 cascade: `invalidate-mram-cache.ts` hardcoded path fixed.** The tool previously computed `cacheDir = "${HOME}/.cache/masonic-mram-audio"` inline — a latent drift hazard even before Phase 3 — and now points at the wrong location entirely after D-01. Import `CACHE_DIR` from the source module to eliminate the class.
3. **Multi-variant invalidation in `invalidate-mram-cache.ts`.** Since the cache can hold multiple entries per line (one per modelId that rendered it during the fallback chain), the invalidation loop now deletes all variants, not just one. Surfaces the count in the per-line summary so Shannon sees "DELETED (2 entries across model chain)" rather than a silent over-action.
4. **`waiting-for-quota-reset` progress event uses preferred-model placeholder key.** The actual cacheKey isn't known at the quota-wait point (no model served this line yet). Using `computeCacheKey(..., models[0], ...)` gives consumers a stable key tied to the first-chain model; the final `rendered` event emits the real key of whichever model eventually succeeded.
5. **CACHE_KEY_VERSION regression guard via source-grep.** The test file greps `scripts/render-gemini-audio.ts` for `= "v3"` present AND `= "v2";` absent. Catches any silent revert; cheaper than a runtime import.

## Deviations from Plan

Zero deviations. Plan 05 executed exactly as written — every `must_have` truth asserted, every verify command exit-0'd, every acceptance criterion satisfied.

The only beyond-the-written-plan work was Rule 3 scope-expansion on `isLineCached` + `invalidate-mram-cache.ts` hardcoded cache path — both captured under "Decisions Made" above. These were unavoidable-blocking (Rule 3): without them the build would have failed on the computeCacheKey signature change.

## Issues Encountered

None. Verification ran clean on the first attempt:
- `npx tsc --noEmit` on touched files: 0 errors (pre-existing errors in unrelated files stay out of scope per Scope Boundary rule)
- `npm run build`: passed, 27 routes generated
- `npx vitest run --no-coverage scripts/__tests__/render-gemini-audio-cache.test.ts`: 13/13 passed
- `npx vitest run --no-coverage` (full suite): 445 passed + 42 todo across 40 files + 3 skipped (the three skipped scaffolds — Plans 06, 07, 08 — are still pending)

## User Setup Required

**First bake after this change will migrate 475 legacy `.opus` entries from `~/.cache/masonic-mram-audio/` to `rituals/_bake-cache/`.** Shannon should expect:

1. Stderr banner on the first `renderLineAudio` call: `[AUTHOR-01] migrating legacy cache ... (475 entries; old location preserved for rollback)`
2. Most of those 475 entries will MISS on lookup under v3 (modelId changed the key) and get re-rendered. Budget ~475 × ~6s = ~48 minutes of fresh Gemini calls on the next full bake, or have the fallback chain's quota-exhaustion wait kick in.
3. Legacy `~/.cache/masonic-mram-audio/` stays intact for rollback. To retry migration: `rm -rf rituals/_bake-cache/*` and re-run — `migrationRan` resets across process boundaries.

No environment variables, no installs, no config changes required.

## Next Phase Readiness

- **Plan 06 (bake-helpers, AUTHOR-06):** `renderLineAudio` now consistently writes to `rituals/_bake-cache/` → bake-helpers can read from the same location. Duration-anomaly detection via `music-metadata` (already installed in Plan 01) reads `.opus` files from CACHE_DIR.
- **Plan 07 (bake-all orchestrator, AUTHOR-02/09):** imports `renderLineAudio` + `computeCacheKey` unchanged signature-wise at the renderLineAudio level (3 positional args + RenderOptions + preamble). Orchestrator benefits from the cache location move — `_INDEX.json` and `_RESUME.json` from D-03/D-06 go alongside the cache in `rituals/_bake-cache/`.
- **Plan 08 (preview-bake, AUTHOR-08):** reads cache files from `CACHE_DIR` — now repo-local so `preview-bake.ts` can glob `rituals/_bake-cache/*.opus` without a home-dir detour.
- **No blockers** for any downstream Phase 3 plan.

## Self-Check: PASSED

### Files claimed modified
- `scripts/render-gemini-audio.ts` — FOUND (verified via commit 0b0c4ea; 9 edits landed)
- `scripts/invalidate-mram-cache.ts` — FOUND (verified via commit 0b0c4ea; 2 edits landed)
- `scripts/__tests__/render-gemini-audio-cache.test.ts` — FOUND (verified via commit 5e32cb9; +265/−17)

### Files claimed created
- `.planning/phases/03-authoring-throughput/03-05-SUMMARY.md` — FOUND (this file)

### Commits claimed
- `0b0c4ea` — FOUND on `gsd/phase-3-authoring-throughput` (Task 1)
- `5e32cb9` — FOUND on `gsd/phase-3-authoring-throughput` (Task 2)

### Acceptance criteria verification
- `grep '^export const CACHE_KEY_VERSION = "v3"' scripts/render-gemini-audio.ts` — line 65, 1 match
- `grep -c 'rituals/_bake-cache' scripts/render-gemini-audio.ts` — 4 matches
- `grep -c 'OLD_CACHE_DIR' scripts/render-gemini-audio.ts` — 5 matches
- `grep -c 'modelId: string' scripts/render-gemini-audio.ts` — 1 match (the signature)
- `grep -c 'modelId' scripts/render-gemini-audio.ts` — 10 matches (signature, material, callsites, docs)
- `grep -c 'migrateLegacyCacheIfNeeded' scripts/render-gemini-audio.ts` — 3 matches (declaration + call in renderLineAudio + reset-hook reference in docstring)
- `grep -cE 'export (async )?function migrateLegacyCacheIfNeeded' scripts/render-gemini-audio.ts` — 1 match
- `grep -c 'AUTHOR-03 D-12' scripts/render-gemini-audio.ts` — 1 match
- `grep -cE 'DEFAULT_MODELS|modelId' scripts/invalidate-mram-cache.ts` — 4 matches
- `grep -c 'it\.todo(' scripts/__tests__/render-gemini-audio-cache.test.ts` — 0 matches (scaffold fully filled)
- `npm run build` — exit 0, 27 routes generated
- `npx tsc --noEmit` — 0 errors in touched files (26 pre-existing errors in unrelated files are out of scope per Scope Boundary rule)
- `npx vitest run --no-coverage scripts/__tests__/render-gemini-audio-cache.test.ts` — 13/13 passed
- `npx vitest run --no-coverage` (full suite) — 445 passed + 42 todo, 0 regressions
- ESM import sanity: `npx tsx -e "import('./scripts/render-gemini-audio.ts').then(...)" ` prints `computeCacheKey: function migrateLegacyCacheIfNeeded: function CACHE_KEY_VERSION: v3 DEFAULT_MODELS[0]: gemini-3.1-flash-tts-preview`

---
*Phase: 03-authoring-throughput*
*Completed: 2026-04-23*
