---
phase: 03-authoring-throughput
reviewed: 2026-04-23T15:30:00Z
depth: standard
files_reviewed: 23
files_reviewed_list:
  - scripts/bake-all.ts
  - scripts/build-mram-from-dialogue.ts
  - scripts/invalidate-mram-cache.ts
  - scripts/lib/bake-math.ts
  - scripts/lib/resume-state.ts
  - scripts/preview-bake.ts
  - scripts/render-gemini-audio.ts
  - scripts/__tests__/bake-all.test.ts
  - scripts/__tests__/bake-helpers.test.ts
  - scripts/__tests__/preview-bake.test.ts
  - scripts/__tests__/render-gemini-audio-cache.test.ts
  - src/app/author/page.tsx
  - src/lib/author-validation.ts
  - src/lib/dev-guard.ts
  - src/lib/idb-schema.ts
  - src/lib/storage.ts
  - src/lib/voice-storage.ts
  - src/lib/__tests__/author-validation.test.ts
  - src/lib/__tests__/dev-guard.test.ts
  - src/lib/__tests__/idb-schema.test.ts
  - package.json
  - vitest.config.ts
findings:
  critical: 0
  high: 2
  medium: 5
  low: 4
  info: 3
  total: 14
status: issues-found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-04-23T15:30:00Z
**Depth:** standard
**Files Reviewed:** 23
**Status:** issues-found

## Summary

Phase 3 (Authoring Throughput) delivers a cohesive set of bake-time tooling with generally strong defensive posture. The three focus areas that matter most all show careful engineering:

- **`scripts/preview-bake.ts`** — the three-gate containment (regex + path.resolve startsWith + fs.realpathSync) composes correctly. Layer 2b's symlink-escape defense is covered by a real symlink-planting test. One minor race in the file-then-realpath sequence, noted below.
- **`scripts/bake-all.ts`** — argv is consistently passed as separate elements to `execFileSync`/`spawn`; the `--diff-filter=d` pathspec is properly separated with `--`. `pLimit` is instantiated but currently unused (sequential bake loop) — the `void limit` comment is honest, which is good.
- **`scripts/render-gemini-audio.ts`** — cache-key v3 correctly includes modelId; `migrateLegacyCacheIfNeeded` is a copy (not move), one-shot per process.
- **`src/lib/dev-guard.ts`** — clean two-function API (`isDev()` / `assertDevOnly()`).
- **`src/lib/idb-schema.ts`** — single `openDB()` entry point, idempotent upgrade handler, v4→v5 migration guarded by `contains()` checks.

Findings below cluster around (1) a defense-in-depth gap where `validateOrFail` in `bake-all.ts` re-reads files already read by `build-mram-from-dialogue.ts`'s own validator gate (potential TOCTOU window on concurrent edits, duplicate work, and divergent behavior if the two implementations drift), (2) the one-shot `migrationRan` flag being module-scoped (defeats test isolation despite the `__resetMigrationFlagForTests` escape hatch), (3) a minor TOCTOU between `fs.existsSync(resolved)` and `fs.realpathSync(resolved)` in `preview-bake.ts` that currently degrades correctly to 404, (4) the `invalidate-mram-cache.ts` arg parser having a double-add bug when `--lines=X` and `--lines Y` are both passed, and (5) several medium-severity robustness gaps (halt-on-first-failure in `bake-all.ts` truncates the failure report; `db.close()` not called on rejection paths in `storage.ts`; the raw-mode stdin in `promptPassphrase`/`promptFallbackChoice` doesn't restore state on unexpected exit).

No critical bugs or security vulnerabilities found.

## High

### HI-01: `bake-all.ts` orchestrator runs the validator gate twice (divergence + TOCTOU window)

**File:** `scripts/bake-all.ts:213-238` and `scripts/build-mram-from-dialogue.ts:148-168`
**Issue:** The orchestrator's `validateOrFail(slug)` reads plain + cipher markdown and runs `validatePair` for every ritual. Then when it spawns `build-mram-from-dialogue.ts` per ritual, that subprocess runs its own copy of `validateOrFail(plainPath, cipherPath)` (line 537) which re-reads and re-runs the same validator. Two failure modes this creates:

1. **Silent divergence risk.** `bake-all.ts:validateOrFail` and `build-mram-from-dialogue.ts:validateOrFail` are two separate functions with nearly-identical logic. Any future edit to one that doesn't update the other (e.g., adding a severity tier, changing the "no --force" behavior referenced in CONTEXT D-08) will be invisible — the orchestrator's gate may pass while the subprocess's gate rejects, leaving Shannon to debug why a bake "suddenly" fails after the orchestrator said "✓ All 8 ritual(s) pass the validator."
2. **TOCTOU window on concurrent edits.** Between the orchestrator's validator read (line 220-221) and the subprocess's validator read (line 549-550), the plain/cipher files could change if the author is editing them concurrently. The orchestrator would announce success on now-stale content.

**Fix:** Collapse into a single gate. Either (a) remove the orchestrator's `validateOrFail` entirely and rely on the subprocess's gate (simpler; orchestrator's only benefit is earlier feedback), OR (b) extract the validator gate into `scripts/lib/validate-or-fail.ts` and have both files import it so drift is impossible:

```ts
// scripts/lib/validate-or-fail.ts
import * as fs from "node:fs";
import { validatePair } from "../../src/lib/author-validation";
export function validateOrFail(plainPath: string, cipherPath: string, slug?: string): void {
  // ... single implementation
}
```

### HI-02: `bake-all.ts` halts on first failure, discarding the multi-ritual failure report it promises

**File:** `scripts/bake-all.ts:450-457`
**Issue:** The comment at line 411 and the "Surface BOTH fulfilled and rejected per Pitfall 7" block at line 460-468 both advertise collecting wins AND losses. But the `break;` at line 456 ("Halt on first failure so Shannon can investigate without baking more rituals on top of a corrupted state") means `results` never accumulates more than one failure. The post-loop report at 462-467 will always show exactly 1 failure even if 7 of 8 rituals would have failed — silently misleading the user about scope of damage.

The tension is real (don't compound corruption) but the code and documentation disagree. Either fix the report or document the actual behavior.

**Fix:** Change the summary to reflect halt-on-first semantics, or decouple "corrupted state" (which is really just the most recent ritual's `_RESUME.json`) from "keep validating other rituals":

```ts
// Option A: clarify the summary wording
if (failures.length > 0) {
  const remainingCount = slugs.length - results.length;
  console.error(`\n${failures.length} ritual(s) failed, ${remainingCount} skipped (halt-on-first):`);
  for (const f of failures) console.error(`  ${f.slug}: ${f.error ?? "unknown"}`);
  if (remainingCount > 0) {
    console.error(`  Not attempted: ${slugs.slice(results.length).join(", ")}`);
  }
  process.exit(1);
}
```

Either way, update the "collect both successes and failures for a final report" comment to describe the halt-on-first reality.

## Medium

### ME-01: `render-gemini-audio.ts` `migrationRan` module-global defeats test isolation for anything except the explicit reset hook

**File:** `scripts/render-gemini-audio.ts:85-107`
**Issue:** `let migrationRan = false;` at module scope plus the `__resetMigrationFlagForTests` hook acknowledges that the module-global state is inconvenient for tests. Two concrete downstream risks:

1. Any test that imports `renderLineAudio` (not just tests of the migration) and forgets to call the reset hook will see non-deterministic behavior depending on test order. The current test suite only exercises `migrateLegacyCacheIfNeeded` directly, so this hasn't bitten yet.
2. If `renderLineAudio` is ever called concurrently (e.g., the "future sibling-ritual fan-out" explicitly reserved in `bake-all.ts:361`), the flag's non-atomic check-then-set introduces a race where two concurrent lines both start a migration, but `fs.cp` with `recursive: true` on the same destination may produce partial results if the second call sees a mid-copy state.

**Fix:** Replace the boolean with a memoized promise so the function is re-entrant and concurrent-safe without test hooks:

```ts
let migrationPromise: Promise<void> | null = null;
export function migrateLegacyCacheIfNeeded(cacheDir, oldDir = OLD_CACHE_DIR): Promise<void> {
  if (migrationPromise) return migrationPromise;
  migrationPromise = (async () => { /* ...existing body... */ })();
  return migrationPromise;
}
export function __resetMigrationFlagForTests(): void {
  migrationPromise = null;
}
```

### ME-02: `preview-bake.ts` Layer-2b TOCTOU — `existsSync` → `realpathSync` race

**File:** `scripts/preview-bake.ts:137-157`
**Issue:** Line 137 does `fs.existsSync(resolved)`, returns 404 on miss. Then line 150 does `fs.realpathSync(resolved)` inside a `try/catch` that correctly handles ENOENT as "treat as 404." However, between those two calls:

- If the file exists at 137, then is deleted, then replaced with a symlink-escape before 150, the realpath check on line 158-168 would correctly fire and return 400. This is benign.
- If the file exists at 137, is deleted, then `realpathSync` throws at 150 — returns 404 (correct).

The current sequence is already defensible (the catch at 151 returns 404, and the realpath check at 158-168 catches the escape case). But the intermediate `fs.statSync(resolved)` at line 170 is **not** inside a try/catch and will throw uncaught if the file disappears between 158 and 170. A 500 leaks implementation detail; a 404 is what the client should see.

**Fix:** Wrap `fs.statSync` in try/catch returning 404 on ENOENT, mirroring the realpath handling. The cache dir is explicitly transient per the code's own comments.

```ts
let stat: fs.Stats;
try {
  stat = fs.statSync(resolved);
} catch {
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("not found");
  return;
}
```

### ME-03: `invalidate-mram-cache.ts` double-adds line IDs when both `--lines=X` and `--lines Y` are passed

**File:** `scripts/invalidate-mram-cache.ts:63-86`
**Issue:** The parser accepts both `--lines=1,2` (equals form) and `--lines 1,2` (space-separated form), merging both into `lineIds`. If a user passes both (or passes `--lines=1,2,3 --lines 4,5` for a wider set), IDs from both forms are concatenated. That's arguably a feature, but there's no dedupe — passing `--lines=1 --lines 1` produces `[1, 1]`, which results in two deletion attempts on the same cache entry (the second finds nothing, prints "already gone") and inflates the "deleted" count in the summary by one per duplicate.

Also: the `argv[linesIdx + 1]` access at line 79 and 80 is type-unsafe — `argv[linesIdx + 1]` may be undefined when `--lines` is the final argument, and `.startsWith("--")` would throw. The guard `argv[linesIdx + 1] && !argv[linesIdx + 1].startsWith("--")` handles it correctly via short-circuit, but the non-null assertion would be cleaner with `const nextArg = argv[linesIdx + 1]; if (nextArg && !nextArg.startsWith("--"))`.

**Fix:** Dedupe via Set and clean up the null handling:

```ts
const rawIds: number[] = [];
const linesFlag = argv.find((a) => a.startsWith("--lines="));
if (linesFlag) rawIds.push(...parseCsvNumbers(linesFlag.slice("--lines=".length)));
const linesIdx = argv.indexOf("--lines");
const nextArg = linesIdx >= 0 ? argv[linesIdx + 1] : undefined;
if (nextArg && !nextArg.startsWith("--")) rawIds.push(...parseCsvNumbers(nextArg));
const lineIds = Array.from(new Set(rawIds));
```

### ME-04: `src/lib/storage.ts` leaks `db.close()` on rejection paths

**File:** `src/lib/storage.ts:32-79, 144-214, 240-261, 266-311, 317-330, 335-368`
**Issue:** Every exported function follows the pattern `const db = await openDB(); ... ; db.close();`. If any intermediate `await` (an encrypt/decrypt call or an inner promise) rejects, `db.close()` is never called. Over a long session with error paths, this leaks IDBDatabase connections (which Chrome caps and which also block `versionchange` events needed for the next schema bump).

Concrete example in `saveMRAMDocument` (line 144-214): if the first `store.put` at line 159 rejects, the function throws before reaching `db.close()` at line 212.

**Fix:** Wrap in try/finally:

```ts
export async function saveMRAMDocument(mramDoc: MRAMDocument): Promise<string> {
  const db = await openDB();
  try {
    // ... existing body through line 211
    return id;
  } finally {
    db.close();
  }
}
```

Same pattern applies to `getOrCreateKey`, `listDocuments`, `getDocumentSections`, `getDocumentPlainText`, `deleteDocument`.

### ME-05: `build-mram-from-dialogue.ts` raw-mode stdin not restored on unexpected process termination

**File:** `scripts/build-mram-from-dialogue.ts:359-408` and `1484-1509`
**Issue:** `promptPassphrase` sets `process.stdin.setRawMode(true)` before awaiting a Promise. The Promise's `onData` handler restores raw mode on Enter / Ctrl-C / Backspace. But if the surrounding process receives a signal (SIGTERM, SIGHUP) while the prompt is active, the terminal is left in raw mode — the user's shell becomes unusable after the bake exits. Same issue in `promptFallbackChoice` (line 1494).

This is tail-risk in normal use (the happy path restores correctly), but it is a real footgun for anyone who kills a stuck bake from another terminal or whose laptop suspends mid-prompt.

**Fix:** Register a SIGINT/SIGTERM handler inside the prompt function that restores raw mode before the default signal handling runs:

```ts
return new Promise((resolve, reject) => {
  let passphrase = "";
  const cleanup = () => {
    try { process.stdin.setRawMode(false); } catch {}
    process.stdin.pause();
    process.stdin.removeListener("data", onData);
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
  };
  const onSignal = () => { cleanup(); process.exit(130); };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  // ... existing onData, calling cleanup() before resolve/reject
});
```

## Low

### LO-01: `bake-all.ts` `--parallel` NaN fallback happens silently after argv parsing

**File:** `scripts/bake-all.ts:120`
**Issue:** `flags.parallel = Number(next);` at line 120 accepts any string argv value. If the user types `--parallel abc`, `Number("abc")` is NaN, which `clampParallel` silently coerces to 4. Good that it doesn't crash, but the user sees no warning — they think they got concurrency of 4 because that's what they asked for, when really they typo'd. The test `bake-all.test.ts:124-127` asserts this silent coercion as correct behavior.

**Fix:** Warn when the parsed value doesn't round-trip:

```ts
const rawN = Number(next);
if (!Number.isFinite(rawN)) {
  console.error(`--parallel received non-numeric "${next}"; using default 4.`);
}
flags.parallel = rawN;
```

This is a low-severity because the test codifies the current contract — changing the behavior would require updating the test. But the user-visible UX is mildly surprising.

### LO-02: `preview-bake.ts` `ensureLoopback` doesn't cover IPv4-mapped IPv6 or alternate loopback representations

**File:** `scripts/preview-bake.ts:51-60`
**Issue:** The guard accepts exactly two strings: `"127.0.0.1"` and `"::1"`. Per RFC 4291, the IPv4-mapped IPv6 address `::ffff:127.0.0.1` is also loopback (and some Node versions / OS stacks will pass it to `listen`). Similarly, any address in `127.0.0.0/8` (e.g., `127.0.0.2`) is technically loopback per RFC 3330. If a user sets `PREVIEW_BAKE_HOST=::ffff:127.0.0.1` (or `127.0.0.2` for a secondary loopback alias), `ensureLoopback` rejects.

The current strictness is defensible — "only the canonical loopback" is a reasonable security posture. But it's worth documenting as deliberate.

**Fix:** Either expand the check to cover `/8` IPv4 and IPv4-mapped IPv6, or add a code comment stating that the narrow whitelist is deliberate and `PREVIEW_BAKE_HOST` overrides are expected to be exactly `127.0.0.1` or `::1`:

```ts
// Deliberately narrow whitelist — we don't want to reason about edge-case
// loopback representations (::ffff:127.0.0.1, 127.0.0.2, etc.). If you need
// one of those, set PREVIEW_BAKE_HOST=127.0.0.1 explicitly.
```

### LO-03: `render-gemini-audio.ts` `sleepUntilMidnightPT` uses fixed hour offset instead of proper timezone math

**File:** `scripts/render-gemini-audio.ts:736-770`
**Issue:** `nextMidnightPT` computes tomorrow's UTC time as `Date.UTC(year, month - 1, day + 1, offsetHours, 0, 0)`. The `day + 1` without normalizing can produce invalid dates if the wall-clock date is the last day of a month (e.g., Apr 30 + 1 → `Date.UTC(year, 3, 31, ...)`, which IS correct because JS normalizes overflow — so this is actually fine). Also DST transition day: on the Sunday in March when clocks spring forward at 2am PT, there IS no `00:00 PT` for the next-day calendar — but `Date.UTC` with offset 7 will still produce a valid UTC instant, just a skewed one. Quota reset happens "at midnight PT local wall time," and Google's actual reset is best-effort aligned with the LA timezone — the 30s slack at line 777 absorbs this.

The narrower concern: `getPTOffsetHours` calls `Intl.DateTimeFormat` with `timeZoneName: "short"` and looks for exactly `"PDT"` or `"PST"`. On some older Node versions the short name is `"GMT-7"` or `"GMT-8"` (ICU data dependent). A regression here would silently skew the wake time by up to an hour.

**Fix:** Add a unit test asserting the PT offset matches the actual `America/Los_Angeles` offset across DST boundaries, or switch to a more robust offset computation using Intl directly:

```ts
function getPTOffsetHours(at: Date): number {
  // Format a UTC-midnight reference in LA to derive the signed offset.
  const lax = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles", hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit",
  }).formatToParts(at);
  // Compute diff between LA wall-clock and UTC wall-clock → 7 or 8.
  // ...
}
```

This is low because the current code works on typical Node ≥ 18 with full-icu. Just worth tracking.

### LO-04: `build-mram-from-dialogue.ts` `parseFallbackMode` throws from inside `main()` without user-friendly error

**File:** `scripts/build-mram-from-dialogue.ts:412-427`, called at `458`
**Issue:** `parseFallbackMode(rawArgs)` throws on unknown `--on-fallback=<value>`. The throw propagates out of `main()` into the top-level `.catch` at `require.main === module` branch (line 1520-1523), which prints `"Fatal error: <Error object>"`. That's a passable error message, but it doesn't print usage — unlike argv parse errors in `bake-all.ts` which print usage via `console.error(usage)`.

**Fix:** Catch `parseFallbackMode`'s throw inside `main()` and print usage:

```ts
let fallbackMode: FallbackMode;
try {
  fallbackMode = parseFallbackMode(rawArgs);
} catch (err) {
  console.error((err as Error).message);
  // print usage or reference to --help
  process.exit(1);
}
```

## Info

### IN-01: `bake-all.ts` `pLimit` is instantiated but never awaited — consider removing until sibling-ritual fan-out is implemented

**File:** `scripts/bake-all.ts:361-362`
**Issue:** `const limit = pLimit(parallelN);` followed by `void limit; // reserved: see comment above.` is a load-bearing comment that preserves the `p-limit` dep and `--parallel` flag UX. The comment is honest and the setup is minimal, so this is purely a style note, not a defect. The `clampParallel` function IS exercised (returns a value that then goes unused), and the `--parallel` flag is advertised as functional in help text.

**Fix:** Either (a) remove `pLimit` usage entirely until it's needed (keeps `--parallel` flag as a no-op with a deprecation note), or (b) add a `TODO:` tag so grep finds the reserved call site when sibling-ritual fan-out lands. Currently the `void limit` comment is close enough to serve both purposes — keep as-is if the plan is to add fan-out soon.

### IN-02: `storage.ts` silent-fallback in `getOrCreateKey` discards key-import errors

**File:** `src/lib/storage.ts:43-50`
**Issue:** `crypto.subtle.importKey(...).then(resolve).catch(() => resolve(null));` silently treats an import failure as "no existing key," which will then trigger fresh key generation and write. If the stored JWK is corrupted (e.g., from a browser extension tampering with IndexedDB or a partial storage quota clear), the user's existing encrypted ritual documents become unreadable with the newly-generated key — silent data loss.

**Fix:** Log the import error so the failure mode is visible in browser devtools:

```ts
.catch((err) => {
  console.warn("[storage] failed to import existing encryption key; generating new one (existing documents may be unreadable):", err);
  resolve(null);
});
```

This doesn't fix the data loss — that would require prompting the user before re-keying — but at least makes the failure investigable.

### IN-03: Cross-file — `MIN_BAKE_LINE_CHARS` / `MIN_PREAMBLE_LINE_CHARS` duplicated in `invalidate-mram-cache.ts` and `build-mram-from-dialogue.ts`

**File:** `scripts/invalidate-mram-cache.ts:49-53` and `scripts/build-mram-from-dialogue.ts:843-861`
**Issue:** Both files independently read `process.env.VOICE_CAST_MIN_LINE_CHARS` and `process.env.MIN_BAKE_LINE_CHARS` with the same defaults (40 and 5). The `invalidate-mram-cache.ts` comment at line 49 explicitly says "Must stay in sync with build-mram-from-dialogue.ts defaults." — acknowledging that the two sources can drift. If a future edit to `build-mram-from-dialogue.ts` changes the default (say, to 6), `invalidate-mram-cache.ts` will silently use 5 and report "not cached" for lines the bake actually cached, then fail to delete them on re-bake.

**Fix:** Hoist the two constants into a shared `scripts/lib/bake-thresholds.ts` module and import from both. Same pattern as `scripts/lib/resume-state.ts` and `scripts/lib/bake-math.ts` already demonstrate.

---

_Reviewed: 2026-04-23T15:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
