# Phase 3: Authoring Throughput - Pattern Map

**Mapped:** 2026-07-01
**Files analyzed:** 15 new, 6 modified
**Analogs found:** 21 / 21 (19 exact/reference-implementation matches, 2 role-match)

**Special note on sourcing:** This phase has an unusually strong analog source — the abandoned branch `gsd/phase-3-authoring-throughput` (local + `origin`, SHA `58eb551`) contains a fully-executed, 517-test-verified prior implementation of nearly every file below. Per RESEARCH.md, that branch is the **primary reference**, not a rubber-stamp merge candidate: two of its patterns are confirmed wrong/suboptimal relative to today's CONTEXT.md (D-01..D-08) and are called out explicitly as **anti-patterns to avoid**, not to copy. All old-branch excerpts below were pulled read-only via `git show 58eb551:<path>` — the branch was never checked out.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `scripts/bake-all.ts` (new) | CLI orchestrator | batch/event-driven | `58eb551:scripts/bake-all.ts` (needs `--since` + migration fixes) + `scripts/bake-first-degree.ts` (main, spawn pattern) | exact (with known fixes) |
| `scripts/preview-bake.ts` (new) | service (standalone HTTP server) | streaming/request-response | `58eb551:scripts/preview-bake.ts` | exact |
| `scripts/lib/bake-math.ts` (new) | utility (pure functions) | transform | `58eb551:scripts/lib/bake-math.ts` | exact |
| `scripts/lib/resume-state.ts` (new) | utility (state I/O) | file-I/O | `58eb551:scripts/lib/resume-state.ts` | exact |
| `scripts/lib/validate-or-fail.ts` (new) | utility (validator gate wrapper) | request-response (CLI) | `58eb551:scripts/lib/validate-or-fail.ts` | exact |
| `scripts/lib/cache-manifest.ts` (new, NOT on old branch) | utility (content-hash manifest) | file-I/O | New pattern — see Architecture Pattern 3 in RESEARCH.md; closest in-repo analog is `computeCacheKey`'s sha256 hashing idiom (`scripts/render-gemini-audio.ts:588-596`) and `dialogueChecksum()` on the old branch (`58eb551:scripts/bake-all.ts:237-244`, hashing idiom reusable even though its call site is the broken git-diff path) | role-match |
| `src/lib/idb-schema.ts` (new) | model (schema/config) | CRUD (IndexedDB) | `58eb551:src/lib/idb-schema.ts` | exact |
| `src/lib/dev-guard.ts` (new) | middleware/guard | request-response | `58eb551:src/lib/dev-guard.ts` + current `main`'s `src/app/api/author/_guard.ts` | exact |
| `scripts/render-gemini-audio.ts` (modify: cache relocation, modelId in key, keep-and-upgrade) | service | file-I/O + streaming | itself (current `main`, lines 36-50, 588-596) | exact (self-analog; old branch's v2→v3 key-bump approach is an anti-pattern here — see below) |
| `scripts/build-mram-from-dialogue.ts` (modify: remove hard-skip, add short-line routing, validator gate, anomaly gate, `--verify-audio`, `--resume-state-path`) | CLI (bake pipeline) | batch + streaming | itself (current `main`, lines 584-855) | exact (self-analog) |
| `scripts/invalidate-mram-cache.ts` (modify: new cache location + key shape) | CLI utility | file-I/O | itself (current `main`, lines 1-60) | exact (self-analog) |
| `src/lib/author-validation.ts` (modify: add bake-band hard-fail severity check) | model/validator | transform | itself (current `main`) + old branch's diff (`58eb551` vs `0874247`, `src/lib/author-validation.ts`) | exact |
| `src/lib/storage.ts` (modify: replace own `openDB()` with idb-schema import) | model (storage) | CRUD | itself (current `main`, lines 13-45) | exact (self-analog) |
| `src/lib/voice-storage.ts` (modify: same) | model (storage) | CRUD | itself (current `main`, lines 10-50) | exact (self-analog) |
| `src/lib/voice-cast.ts` (modify: extend `VoiceCastRole`/`VoiceCastFile` schema with `googleVoice` field, D-04) | model (schema + validator) | transform | itself (current `main`, lines 36-60, 145-195) | exact (self-analog) |
| Google Cloud TTS short-line call (new function, likely in `scripts/render-gemini-audio.ts` or a new `scripts/lib/google-tts.ts`) | service (external API call) | request-response | `test-google-line94.mjs` (repo root, untracked) — Shannon's working proof-of-concept | exact |
| Migration script for cache relocation + re-key (new, e.g. `scripts/migrate-bake-cache.ts`) | CLI (one-time migration) | batch/file-I/O | `scripts/invalidate-mram-cache.ts` (CLI shape, dry-run/--yes convention) + `computeCacheKey`/`deleteCacheEntry` (`scripts/render-gemini-audio.ts`) | role-match |
| `vitest.config.ts` (modify: add `scripts/**/*.test.{ts,tsx}` to `include`) | config | — | itself (current `main`) | exact |
| `scripts/__tests__/bake-all.test.ts` (new) | test | — | `58eb551:scripts/__tests__/bake-all.test.ts` (port test *shape*; must rewrite the `--since`-related tests per the fix) | exact (shape), needs targeted rewrite |
| `scripts/__tests__/preview-bake.test.ts` (new) | test | — | `58eb551:scripts/__tests__/preview-bake.test.ts` (20-test containment suite) | exact |
| `src/lib/__tests__/idb-schema.test.ts` (new) | test | — | old branch equivalent (dual-open + fake-indexeddb pattern); current repo convention `src/lib/__tests__/voice-cast.test.ts` for test file placement | exact |

## Pattern Assignments

### `scripts/bake-all.ts` (CLI orchestrator, batch)

**Primary analog:** `58eb551:scripts/bake-all.ts` (489 lines, full file recoverable via `git show 58eb551:scripts/bake-all.ts`)
**Secondary analog (spawn idiom on current main):** `scripts/bake-first-degree.ts`

**Imports pattern** (old branch, adapt paths — this repo has no `"type": "module"` but `p-limit@7` imports fine via `npx tsx`, verified in RESEARCH.md):
```typescript
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import pLimit from "p-limit";
import { type ResumeState, readResumeState } from "./lib/resume-state";
import { validateOrFail as validateOrFailShared } from "./lib/validate-or-fail";
```

**Flag parsing pattern** (copy verbatim, this is solid): `58eb551:scripts/bake-all.ts` lines 74-144 — `Flags` interface, `parseFlags(argv)`, `clampParallel(n)` (clamps `[1,16]`, default 4, handles NaN/negatives — CONTEXT.md's discretion note c).

**Validator-gate-first pattern** (copy verbatim — matches RESEARCH.md Pattern 1):
```typescript
// From 58eb551:scripts/bake-all.ts lines 218-226
export function validateOrFail(slug: string): void {
  const plainPath = path.join(RITUALS_DIR, `${slug}-dialogue.md`);
  const cipherPath = path.join(RITUALS_DIR, `${slug}-dialogue-cipher.md`);
  if (!fs.existsSync(plainPath) || !fs.existsSync(cipherPath)) {
    console.error(`  ✗ ${slug}: missing plain or cipher file`);
    process.exit(1);
  }
  validateOrFailShared(plainPath, cipherPath, slug);
}
```
Called for every discovered ritual slug BEFORE any spawn — "waste zero quota on corrupted pairs" per the old branch's own comment (lines 209-217).

**Sub-process spawn pattern** (copy shape, but see fix below): `58eb551:scripts/bake-all.ts` lines 260-305 (`buildMramSpawnArgs` + `bakeRitual`) — args passed as `string[]` to `spawn`, never shell-interpolated (Security Domain requirement, RESEARCH.md "Shell-injection via spawn args").

**Halt-on-first-failure summary pattern** (copy verbatim): lines 404-471 — records `{slug, ok, error}` per ritual, `break`s the loop on first failure, reports both the failure and the "not attempted" remainder so the user sees full scope.

**MUST FIX — do not port verbatim, this is the confirmed bug (RESEARCH.md "Confirmed bug in the old branch"):**
```typescript
// BROKEN — 58eb551:scripts/bake-all.ts lines 160-195 (getChangedRituals)
// git diff <ref> -- 'rituals/*.md' ALWAYS returns empty because
// rituals/*.md is permanently gitignored (never tracked, never in any
// git tree). Confirmed via .gitignore:46 + git diff semantics.
```
**Replace with:** content-hash manifest per RESEARCH.md Architecture Pattern 3 (`scripts/lib/cache-manifest.ts`, new file — no analog on old branch since this is genuinely new logic):
```typescript
// New pattern for this phase (RESEARCH.md lines 316-346)
interface RitualManifestEntry { slug: string; plainHash: string; cipherHash: string; bakedAt: string; }
function hashFile(path: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex");
}
function getChangedRituals(manifestPath: string): string[] { /* diff current hashes vs manifest */ }
```
Reuse `dialogueChecksum()`'s hashing idiom (`58eb551:scripts/bake-all.ts` lines 232-244) as the sha256-of-file-bytes pattern — that part is fine to copy, only the git-diff-based discovery is broken. Also reconsider whether `--since` is the right flag name (old branch's `--help` text implies git semantics it can no longer have) — RESEARCH.md leaves this to Claude's discretion.

**MUST FIX — cache migration (D-07/D-08), not on old branch at all:**
The old branch's cache-key bump (`CACHE_KEY_VERSION` v2→v3, no provenance backfill) is a documented **anti-pattern** per its own `03-05-SUMMARY.md` (~48 min of wasted re-renders). Do NOT port. Instead implement D-07's provenance-preserving in-place re-key (new logic, no direct analog — closest structural precedent is `scripts/invalidate-mram-cache.ts`'s dry-run/`--yes` CLI convention, see below).

---

### `scripts/preview-bake.ts` (standalone HTTP server, streaming/request-response)

**Analog:** `58eb551:scripts/preview-bake.ts` (401 lines) — **copy nearly verbatim**, this is 20-test-verified defense-in-depth code with no known issues.

**Imports + dev-guard pattern**:
```typescript
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { assertDevOnly } from "../src/lib/dev-guard";

assertDevOnly(); // module-load guard — fails fast in production
```

**Loopback-only bind pattern** (lines 51-60):
```typescript
export function ensureLoopback(host: string): void {
  if (host !== "127.0.0.1" && host !== "::1") {
    throw new Error(`[AUTHOR-08 D-15] refusing to bind to non-loopback host "${host}". ...`);
  }
}
```

**Path-traversal + symlink-escape defense-in-depth pattern (copy verbatim — Pitfall 6)**:
```typescript
export const CACHE_KEY_REGEX = /^[0-9a-f]{64}$/;
// Layer 1: regex gate BEFORE path.join (lines 105-109)
if (!CACHE_KEY_REGEX.test(cacheKey)) { /* 400 */ }
// Layer 2a: path.resolve() containment (lines 126-135)
const resolved = path.resolve(opusPath);
const rootAbs = path.resolve(cacheDir);
if (!resolved.startsWith(rootAbs + path.sep)) { /* 400 */ }
// Layer 2b: fs.realpathSync() containment — catches symlink-escape,
// which path.resolve() alone CANNOT catch (lines 148-169)
const realResolved = fs.realpathSync(resolved);
const realRoot = fs.existsSync(rootAbs) ? fs.realpathSync(rootAbs) : rootAbs;
if (realResolved !== realRoot && !realResolved.startsWith(realRoot + path.sep)) { /* 400 */ }
```

**HTTP Range request pattern** (lines 182-234): regex `^bytes=(\d+)-(\d*)$`, 206 partial content with `Content-Range`, 416 on malformed/out-of-bounds, `fs.createReadStream(path, {start, end})` — matches RESEARCH.md's "Don't Hand-Roll" guidance (use `node:fs` streams, only the header regex is bespoke).

**Route dispatch pattern** (lines 363-379): `/` → HTML, `/api/index` → JSON index, `/a/{key}.opus` → stream, else 404. Keep as-is; only the `handleIndexJson` fallback-to-directory-listing behavior (lines 285-359) needs updating for the new cache location + D-08's fallback-tier bake-manifest format if the index JSON schema changes.

**Error handling pattern**: every `fs.*Sync` call inside the request handler is wrapped in try/catch treating races (file evicted mid-request) as 404, not 500 (lines 149-157, 174-181) — the cache dir is explicitly transient.

---

### `scripts/lib/bake-math.ts` (pure functions, transform)

**Analog:** `58eb551:scripts/lib/bake-math.ts` — **copy verbatim**, no known issues, directly serves AUTHOR-06/AUTHOR-07.

```typescript
export interface DurationSample { durationMs: number; charCount: number; }

export function computeMedianSecPerChar(samples: DurationSample[]): number {
  if (samples.length === 0) return 0;
  const secPerChar = samples
    .filter((s) => s.charCount > 0)
    .map((s) => s.durationMs / 1000 / s.charCount)
    .sort((a, b) => a - b);
  if (secPerChar.length === 0) return 0;
  const mid = Math.floor(secPerChar.length / 2);
  return secPerChar.length % 2 === 0
    ? (secPerChar[mid - 1]! + secPerChar[mid]!) / 2
    : secPerChar[mid]!;
}

export function isDurationAnomaly(
  line: DurationSample,
  ritualMedian: number,
  thresholds: { min: number; max: number } = { min: 0.3, max: 3.0 },
): boolean {
  if (ritualMedian === 0 || line.charCount === 0) return false; // insufficient sample (Pitfall 5)
  const ratio = (line.durationMs / 1000 / line.charCount) / ritualMedian;
  return ratio > thresholds.max || ratio < thresholds.min;
}

export function wordDiff(expected: string, actual: string): { missed: string[]; inserted: string[] } {
  const norm = (s: string) => s.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const expWords = norm(expected);
  const actWords = norm(actual);
  const actSet = new Set(actWords);
  const expSet = new Set(expWords);
  return { missed: expWords.filter((w) => !actSet.has(w)), inserted: actWords.filter((w) => !expSet.has(w)) };
}
```

Note the "≥30 samples before checking" convention lives in the CALLER (`build-mram-from-dialogue.ts`), not in this module — keep pure functions free of that threshold per the old branch's design (Pitfall 5: first-bake false positive avoidance).

---

### `scripts/lib/resume-state.ts` (state I/O, file-I/O)

**Analog:** `58eb551:scripts/lib/resume-state.ts` — **copy verbatim**.

**Atomic write pattern** (matches RESEARCH.md Pattern 2, and matches this repo's existing `.mram` atomic-write idiom):
```typescript
export function writeResumeStateAtomic(filePath: string, state: ResumeState): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, filePath); // POSIX rename is atomic within same filesystem
}
```
**Defensive read pattern** — `readResumeState` returns `null` (not throw) on missing file OR malformed JSON, letting the caller re-init from scratch; validates every field's `typeof` before trusting the shape.

---

### `scripts/lib/validate-or-fail.ts` (validator gate wrapper, request-response/CLI)

**Analog:** `58eb551:scripts/lib/validate-or-fail.ts` — **copy verbatim**. This is the shared gate both `bake-all.ts` (orchestrator pre-flight) and `build-mram-from-dialogue.ts` (per-ritual sub-process) must call, so the gate cannot drift between the two call sites (old branch's own review found this as finding HI-01).

```typescript
import * as fs from "node:fs";
import { validatePair } from "../../src/lib/author-validation";

export function validateOrFail(plainPath: string, cipherPath: string, slug?: string): void {
  const plain = fs.readFileSync(plainPath, "utf8");
  const cipher = fs.readFileSync(cipherPath, "utf8");
  const result = validatePair(plain, cipher);
  const errors = result.lineIssues.filter((i) => i.severity === "error");
  if (errors.length > 0 || !result.structureOk) {
    // ... print structured report, process.exit(1)
  }
}
```
No `--force` override (explicit CONTEXT.md decision carried by the old branch too) — Shannon's intent is fix-the-cipher, not ship-a-wrong-score .mram.

---

### `src/lib/author-validation.ts` (extend with bake-band hard-fail gate, AUTHOR-05)

**Analog:** current `main`'s own `validateParsedPair()` (read in full: `/home/mcleods777/Masonic-Ritual-AI-Mentor/src/lib/author-validation.ts`) — extend in place, do not rewrite.

**Existing char-ratio warning pattern** (lines 192-203, current `main`) stays as the softer `/author` UI warning. **Add** the old branch's word-count hard-fail band alongside it (confirmed working diff between `0874247` and `58eb551`):
```typescript
// AUTHOR-05 D-08: bake-time word-count band check — hard-fails the bake.
// Word count better captures meaning-drift than character count.
// Band [0.5x, 2x]; boundary values do NOT trip (strict > / <).
const plainWords = p.text.trim().split(/\s+/).filter(Boolean).length;
const cipherWords = c.text.trim().split(/\s+/).filter(Boolean).length;
const wordRatio = plainWords / Math.max(cipherWords, 1);
if (cipherWords >= 1 && (wordRatio > 2.0 || wordRatio < 0.5)) {
  lineIssues.push({
    index: i,
    severity: "error",
    kind: "ratio-outlier",
    message: `[D-08 bake-band] plain/cipher word ratio out of [0.5x, 2x] band: plain=${plainWords} words, cipher=${cipherWords} words, ratio=${wordRatio.toFixed(2)}x`,
  });
}
```
Note this reuses the existing `kind: "ratio-outlier"` enum value with `severity: "error"` rather than adding a new `kind` — callers already filter by `severity === "error"`, so no call-site changes are needed at the type level (per the old branch's own comment).

---

### `src/lib/idb-schema.ts` (new, AUTHOR-10)

**Analog:** `58eb551:src/lib/idb-schema.ts` — **copy verbatim**, mechanical extraction, no known issues. Bumps `DB_VERSION` 4→5, purely additive `onupgradeneeded` (checks `objectStoreNames.contains(...)` before each `createObjectStore`, so it's safe whichever of `storage.ts`/`voice-storage.ts` opens the DB first — this is the "dual-open invariant" the AUTHOR-10 test must verify).

```typescript
export const DB_NAME = "masonic-ritual-mentor";
export const DB_VERSION = 5;
export const DOCUMENTS_STORE = "documents";
export const SECTIONS_STORE = "sections";
export const SETTINGS_STORE = "settings";
export const VOICES_STORE = "voices";
export const AUDIO_CACHE_STORE = "audioCache";
export const FEEDBACK_TRACES_STORE = "feedbackTraces"; // NEW

export interface FeedbackTrace {
  id: string; documentId: string; sectionId: string; lineId: string;
  variantId: string; promptHash: string; completionHash: string;
  timestamp: number; ratingSignal?: "helpful" | "unhelpful" | null;
}

export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(DOCUMENTS_STORE)) db.createObjectStore(DOCUMENTS_STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(SECTIONS_STORE)) {
        const s = db.createObjectStore(SECTIONS_STORE, { keyPath: "id" });
        s.createIndex("documentId", "documentId", { unique: false });
        s.createIndex("degree", "degree", { unique: false });
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) db.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
      if (!db.objectStoreNames.contains(VOICES_STORE)) db.createObjectStore(VOICES_STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(AUDIO_CACHE_STORE)) {
        const c = db.createObjectStore(AUDIO_CACHE_STORE, { keyPath: "key" });
        c.createIndex("createdAt", "createdAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(FEEDBACK_TRACES_STORE)) {
        const f = db.createObjectStore(FEEDBACK_TRACES_STORE, { keyPath: "id" });
        f.createIndex("documentId", "documentId", { unique: false });
        f.createIndex("timestamp", "timestamp", { unique: false });
        f.createIndex("variantId", "variantId", { unique: false });
      }
    };
  });
}
```

**Then update `src/lib/storage.ts` and `src/lib/voice-storage.ts`** to delete their own duplicated `openDB()`/`DB_VERSION`/`DB_NAME` (current `main`: `storage.ts` lines 13-45, `voice-storage.ts` lines 10-50) and instead `import { openDB, DOCUMENTS_STORE, SECTIONS_STORE, SETTINGS_STORE } from "./idb-schema"` (and `VOICES_STORE`/`AUDIO_CACHE_STORE` for `voice-storage.ts`). Current main's own comment already flags the duplication: `storage.ts:14` *"MUST stay in lockstep with src/lib/voice-storage.ts DB_VERSION"* — this extraction removes that lockstep requirement entirely.

---

### `src/lib/dev-guard.ts` (new, shared dev-only guard)

**Analog:** `58eb551:src/lib/dev-guard.ts` (copy verbatim) + current `main`'s `src/app/api/author/_guard.ts` (`assertDevLocal`, `resolvePairPaths` — the loopback + CSRF pattern this guard is extracted alongside).

```typescript
export function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}
export function assertDevOnly(): void {
  if (!isDev()) {
    throw new Error("[DEV-GUARD] refusing to run in production (NODE_ENV=production). This module is dev-only.");
  }
}
```
This is a NEW shared module the old branch introduced (`src/app/author/page.tsx` and `scripts/preview-bake.ts` both call it) — current `main`'s `_guard.ts` has a Next.js-`Request`-specific `assertDevLocal()` that is NOT directly reusable in a standalone `node:http` script (no `Request` object). `dev-guard.ts` is the framework-agnostic version; `_guard.ts`'s existing loopback-detection-by-header logic is the conceptual precedent, `preview-bake.ts`'s own `ensureLoopback(host)` (bind-time, not request-time) is the actual mechanism for the standalone server.

---

### Google Cloud TTS short-line fallback call (AUTHOR-04, D-02/D-04)

**Analog:** `test-google-line94.mjs` (repo root, untracked, lines 25-50) — Shannon's own working proof-of-concept, verified shape.

```typescript
// Verified working call shape, from this repo's own experiment file
async function googleTtsBakeCall(text: string, voice: string, apiKey: string): Promise<Buffer> {
  const res = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text },                                   // ⚠ text ONLY — no preamble (Pitfall 4)
        voice: { languageCode: "en-US", name: voice },
        audioConfig: { audioEncoding: "OGG_OPUS" },
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google TTS ${res.status}: ${body.replace(/[?&]key=[^&"'\s]*/g, "?key=REDACTED").slice(0, 300)}`);
  }
  const json = await res.json();
  return Buffer.from(json.audioContent, "base64"); // already OGG_OPUS — no ffmpeg re-encode needed
}
```
**Critical anti-pattern to avoid (Pitfall 4):** `test-google-line94.mjs` itself never touches `buildPreamble()` — it calls Google TTS with the raw line text directly. When wiring this into the real bake path, do NOT reuse `voice-cast.ts`'s `assemblePrompt()`/`buildPreamble()` for this call site; Google Cloud TTS has no preamble concept and will speak whatever string it's given verbatim. Redact `?key=...` from error text before logging (same pattern Gemini error handling already uses elsewhere in `render-gemini-audio.ts`).

**Voice pinning (D-04):** extend `VoiceCastFile`/`VoiceCastRole` in `src/lib/voice-cast.ts` (current `main`, lines 36-60) with a `googleVoice?: string` field per role, following the existing optional-field convention (`profile?`, `style?`, `pacing?`, `accent?`, `other?`) and the existing `validateVoiceCast()` narrowing pattern (lines 145-195) — add `googleVoice` to the `for (const field of [...])` loop at line 172.

---

### Cache relocation + modelId key + keep-and-upgrade (AUTHOR-01, D-06/D-07/D-08)

**Analog:** `scripts/render-gemini-audio.ts` itself (current `main`) — this is a self-modification, not a new-file pattern.

**Current cache key (to extend, lines 588-596):**
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
D-07 adds `modelId` to `material` and bumps `CACHE_KEY_VERSION` (currently `"v2"`, line 50) to `"v3"`. **Do not follow the old branch's version-bump-only approach** — pair the bump with a **one-time in-place migration** that re-keys every existing entry assuming `gemini-3.1-flash-tts-preview` provenance (zero re-render cost per D-07), rather than letting entries cache-miss on next lookup.

**Cache dir constant (lines 36-40, to change per D-06):**
```typescript
const CACHE_DIR = path.join(
  process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache"),
  "masonic-mram-audio",
);
```
→ becomes `path.resolve("rituals/_bake-cache")` (matches the constant already used in the old branch's `bake-all.ts` line 53 and `preview-bake.ts` line 40 — those two files already assume this location, so aligning `render-gemini-audio.ts` to match is required, not optional, for AUTHOR-08 to work).

**Keep-and-upgrade (D-08) replaces the delete-on-fallback pattern** currently at `scripts/build-mram-from-dialogue.ts` lines 762-807 (`handleAbort` calling `deleteCacheEntry(thisLineCacheKey)`). With modelId in the key, a fallback-tier entry and a premium-tier entry for the same line never collide — remove the deletion call, and instead record which lines used a fallback tier in a bake manifest (new — no direct analog; closest structural precedent is `_INDEX.json`'s shape already referenced by `preview-bake.ts`'s `handleIndexJson`, `{cacheKey, model, ritualSlug, lineId, byteLen, durationMs, createdAt}[]`).

**Migration script CLI shape:** follow `scripts/invalidate-mram-cache.ts`'s existing convention (current `main`, lines 1-60) — dry-run by default, explicit `--yes` to execute, structured console output, reuses `computeCacheKey`/`deleteCacheEntry` exports from `render-gemini-audio.ts` for key-compatibility.

---

### Short-line hard-skip removal (AUTHOR-04, D-01)

**Analog:** `scripts/build-mram-from-dialogue.ts` itself (current `main`), the exact block to remove/replace:
```typescript
// Lines 584-624, 649-684 (current main) — the "too-short-to-bake" bucket
// and its hard-skip loop. D-01 removes this bucket entirely; every line
// classified here today must instead route through the D-02 Gemini-padded
// → Google-fallback path.
if (cleanText.length < MIN_BAKE_LINE_CHARS) {
  preSkipShort.push({ id: line.id, role: line.role, text: cleanText });
  continue;
}
```
Also remove/repurpose `MIN_BAKE_LINE_CHARS` env var semantics (`invalidate-mram-cache.ts:37` reads the same constant — keep both scripts' understanding of the constant in sync, or remove it from both once D-01 lands since there's no more hard-skip threshold).

---

## Shared Patterns

### Validator-first ordering (applies to `bake-all.ts` AND `build-mram-from-dialogue.ts`)
**Source:** `src/lib/author-validation.ts` `validatePair()` + `scripts/lib/validate-or-fail.ts` (new, wraps it)
**Apply to:** Any code path that could burn API quota on a corrupted ritual pair — must call the validator gate before any Gemini/Google/Groq call.
```typescript
const result = validatePair(plainSource, cipherSource);
const errors = result.lineIssues.filter((i) => i.severity === "error");
if (errors.length > 0) { /* print + process.exit(1) */ }
```

### Atomic file writes (tmp + rename)
**Source:** `scripts/lib/resume-state.ts` `writeResumeStateAtomic()` (new) — matches the existing idiom already used for `.mram` output in `build-mram-from-dialogue.ts` and for `.opus` cache writes in `render-gemini-audio.ts`.
**Apply to:** `_RESUME.json`, any new bake-manifest/index file, the cache migration script's output.
```typescript
const tmp = `${path}.${process.pid}.tmp`;
fs.writeFileSync(tmp, JSON.stringify(state));
fs.renameSync(tmp, path);
```

### Dev-only guard (loopback + NODE_ENV)
**Source:** `src/lib/dev-guard.ts` (new, `isDev()`/`assertDevOnly()`) + `src/app/api/author/_guard.ts` (`assertDevLocal`, current main, request-based variant) + `scripts/preview-bake.ts`'s `ensureLoopback(host)` (bind-time variant).
**Apply to:** `preview-bake.ts` module load AND bind call; any future dev-only script.

### Redact API keys from error text
**Source:** existing Gemini error handling in `scripts/render-gemini-audio.ts` (pattern to replicate, not a named export — grep for how 429/error bodies are logged there before implementing the same for Google Cloud TTS).
**Apply to:** the new `googleTtsBakeCall` helper and the migration script (any place a `?key=...` query string could leak into stderr/logs).

### Shell-injection-safe subprocess spawning
**Source:** `scripts/bake-first-degree.ts` (current main) + `58eb551:scripts/bake-all.ts` `bakeRitual()` — always `spawn("npx", [...argsArray])`, never a shell string. Ritual slugs are regex-validated by construction (`^[a-z0-9][a-z0-9-]{0,63}$`, matching `src/app/api/author/_guard.ts`'s `resolvePairPaths` slug regex, line 90), so they cannot carry shell metacharacters.

### `.gitignore` hardening (D-06 prerequisite, Pitfall 1)
**Source:** `.gitignore` lines 43-58 (current main) — needs new rules BEFORE first bake writes to `rituals/_bake-cache/`:
```gitignore
rituals/_bake-cache/*
!rituals/_bake-cache/.gitignore
rituals/**/*.json
```
`git check-ignore -v rituals/_bake-cache/<hash>.opus` currently returns exit 1 (NOT ignored) — verify this is fixed before any bake runs, or `.opus` files risk being staged/committed.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `scripts/lib/cache-manifest.ts` | utility | file-I/O | Genuinely new logic — the old branch's `--since` used broken git-diff, not a content-hash manifest. Build from RESEARCH.md Architecture Pattern 3 pseudocode directly; reuse only the sha256-hashing idiom from `computeCacheKey`/`dialogueChecksum`. |
| Bake-manifest for fallback-tier tracking (D-08) | model (JSON sidecar) | file-I/O | Old branch never built keep-and-upgrade (it deleted fallback entries, same as current main). Closest shape precedent is `preview-bake.ts`'s expected `_INDEX.json` schema — extend that shape with a `tier: "premium" \| "fallback"` field rather than inventing a separate file. |
| Cache re-key migration script (D-07) | CLI (one-time migration) | batch | Old branch's migration discarded provenance (documented anti-pattern in its own `03-05-SUMMARY.md`). Build fresh using `scripts/invalidate-mram-cache.ts`'s CLI conventions (dry-run/--yes) as the shape, but write new re-keying logic — no source to copy the actual re-key algorithm from. |

## Metadata

**Analog search scope:** `scripts/`, `src/lib/`, `src/app/api/author/`, repo root (`test-google-line94.mjs`, `.gitignore`, `vitest.config.ts`), and orphaned branch `gsd/phase-3-authoring-throughput` (SHA `58eb551`) inspected read-only via `git show`/`git diff` — never checked out.
**Files scanned:** ~30 (current `main`) + ~12 (old branch, targeted `git show`)
**Pattern extraction date:** 2026-07-01
