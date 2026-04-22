# Phase 3: Authoring Throughput - Pattern Map

**Mapped:** 2026-04-21
**Files analyzed:** 9 new, 8 modified
**Analogs found:** 9 / 9 new; all modified files reference their own current state

## File Classification

### New Files

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `scripts/bake-all.ts` | script (orchestrator CLI) | batch / file-I/O + network | `scripts/validate-rituals.ts` + `scripts/build-mram-from-dialogue.ts` | role-match (no direct analog) |
| `scripts/preview-bake.ts` | script (standalone Node HTTP server) | request-response / file-I/O streaming | `src/app/api/tts/google/route.ts` (request shape) + `scripts/lookup-hashed-user.ts` (shebang/entrypoint) | partial (no existing Node `http` server) |
| `src/lib/idb-schema.ts` | library (DB schema module) | CRUD | `src/lib/voice-storage.ts` (lines 10-81 — openDB + consolidated onupgradeneeded) | exact (consolidation of two existing files) |
| `src/lib/dev-guard.ts` | library (guard module) | synchronous check | `src/lib/paid-route-guard.ts` (structure) + current inline check at `src/app/author/page.tsx:220-233` | role-match |
| `src/lib/__tests__/idb-schema.test.ts` | test | unit | `src/lib/__tests__/degraded-mode-store.test.ts` (dynamic-import + reset pattern) | exact (same Vitest style with module reset) |
| `src/lib/__tests__/dev-guard.test.ts` | test | unit | `src/lib/__tests__/screen-wake-lock.test.ts` (global replacement + `@vitest-environment node`) | role-match |
| `scripts/__tests__/bake-all.test.ts` | test | unit | `src/lib/__tests__/hash-user.test.ts` (plain describe/it) + `src/lib/__tests__/dialogue-to-mram.test.ts` (Node-side fs/crypto usage) | role-match (Wave 0 — no scripts test dir exists) |
| `scripts/__tests__/preview-bake.test.ts` | test | unit | same as bake-all.test.ts | role-match (Wave 0) |
| `rituals/_bake-cache/.gitignore` | config | N/A | Root `.gitignore` (line 1+) | trivial |

### Modified Files

| Modified File | Change Type | Current Pattern Preserved |
|---------------|-------------|---------------------------|
| `scripts/render-gemini-audio.ts` | constants + cache key signature + one-shot migration | `CACHE_DIR`/`CACHE_KEY_VERSION`/`computeCacheKey` structure (lines 27-50, 588-596); `atomic tmp+rename` write (lines 136-140) |
| `scripts/build-mram-from-dialogue.ts` | policy: short-line routing + validator gate + duration check | `MIN_BAKE_LINE_CHARS` env-override idiom (lines 488-506); `console.error` progress logging (line 530-534); `renderLineAudio()` callsite signature |
| `src/lib/author-validation.ts` | new severity-"error" band on ratio-outlier | existing `PairLineIssue` discriminated union (lines 18-31); `validateParsedPair()` structured-result shape (lines 68-223) |
| `src/lib/storage.ts` | swap inline openDB for import from idb-schema | existing export surface (`StoredDocument` etc.); `db.transaction(STORE, "readonly")` idiom |
| `src/lib/voice-storage.ts` | same swap | export of `LocalVoice`/`AudioCacheEntry`; existing `getCachedAudio`/`putCachedAudio` behavior |
| `src/app/author/page.tsx` | inline env check → `assertDevOnly()` from dev-guard | existing JSX "Author tool disabled" return block (lines 222-233) |
| `package.json` | add 3 deps + 2 script entries | scripts block indentation (lines 5-12); dependencies/devDependencies split (lines 13-39) |
| `.gitignore` | append `rituals/_bake-cache/` | existing comment grouping style (lines 1, 11, 14, 18, 21, 24) |

---

## Pattern Assignments

### `scripts/bake-all.ts` (script, orchestrator)

**Primary analog:** `scripts/validate-rituals.ts` (discovery + per-ritual loop) composed with `scripts/build-mram-from-dialogue.ts` (render-pipeline composition) and `scripts/lookup-hashed-user.ts` (argv parsing).

**Why it's the analog:** `validate-rituals.ts` already owns the "iterate all rituals, run a checker per pair" pattern. `build-mram-from-dialogue.ts` already composes `renderLineAudio` + voice-cast + encryption. `lookup-hashed-user.ts` is the minimal shebang/argv-parse entrypoint. `bake-all.ts` = argv parsing (from lookup-hashed-user) + discovery loop (from validate-rituals) + render composition (from build-mram).

**Shebang + header pattern** (`scripts/lookup-hashed-user.ts:1-23`):
```typescript
#!/usr/bin/env npx tsx
/**
 * bake-all.ts — orchestrator (AUTHOR-02, AUTHOR-09).
 *
 * Bakes every ritual whose plain/cipher dialogue files changed since
 * <git-ref>, capped at --parallel N, with --resume crash safety.
 *
 * Usage:
 *   npx tsx scripts/bake-all.ts \
 *     [--since <ref>] [--dry-run] [--resume] \
 *     [--parallel <N>] [--verify-audio]
 * ...
 */
```

**Ritual discovery pattern** (copy from `scripts/validate-rituals.ts:66-77`):
```typescript
const files = fs
  .readdirSync(RITUALS_DIR)
  .filter(
    (f) => f.endsWith("-dialogue.md") && !f.endsWith("-dialogue-cipher.md"),
  )
  .sort();
return files.map((f) => ({
  plainFile: path.join(RITUALS_DIR, f),
  cipherFile: path.join(RITUALS_DIR, f.replace(/-dialogue\.md$/, "-dialogue-cipher.md")),
  isDefault: true,
}));
```

**Argv/flag pattern** (from `scripts/validate-rituals.ts:46-65` + `scripts/lookup-hashed-user.ts:28-39`):
```typescript
function parseArgs(): Flags {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.error("Usage: npx tsx scripts/bake-all.ts [--since <ref>] ...");
    process.exit(1);
  }
  // ... extract flags; print Usage and exit(1) on unknown.
}
```

**Logging idiom** (copy from `scripts/validate-rituals.ts:79-85`):
```typescript
const ok = (msg: string) => console.log(`  ✓ ${msg}`);
const warn = (msg: string) => console.log(`  ! ${msg}`);
const header = (msg: string) => console.log(`\n${msg}`);
const fail = (msg: string): never => {
  console.error(`  ✗ ${msg}`);
  process.exit(1);
};
```

**Validator-gate composition** (copy from RESEARCH.md §Example / validate-rituals.ts:131-229 shape):
```typescript
import { validatePair, type PairValidationResult } from "../src/lib/author-validation";

async function validateOrFail(slug: string): Promise<void> {
  // ... read plain/cipher, call validatePair, exit non-zero on error severity.
  // See Shared Patterns §Validator-gate below for full excerpt.
}
```

**Top-level entrypoint** (copy from `scripts/validate-rituals.ts:320-332`):
```typescript
function main() {
  const pairs = parseArgs();
  if (pairs.length === 0) {
    console.log("No ritual dialogue files found in rituals/ — nothing to validate.");
    process.exit(0);
  }
  // ... orchestrate
  console.log(`\n\x1b[32m✓ All ${pairs.length} ritual(s) baked.\x1b[0m\n`);
}
main();
```

**Adapt how:**
- Add `#!/usr/bin/env npx tsx` shebang (present in lookup-hashed-user + build-mram, missing in validate-rituals).
- Import `pLimit` (new dep) and wrap render calls per RESEARCH Pattern 1.
- Use `execSync` for `git diff` per RESEARCH Pattern 2 (not used in any existing script — new helper needed; pass pathspec as separate argv per Pitfall 5).
- Write `_RESUME.json` atomically using tmp+rename (same atomic idiom as `render-gemini-audio.ts:136-140`).
- Call existing `validatePair()` from `src/lib/author-validation.ts` BEFORE any API calls (anti-pattern §4 in RESEARCH).

---

### `scripts/preview-bake.ts` (script, standalone HTTP server)

**Primary analog:** No existing Node `http.createServer` in the repo. Closest references: `scripts/lookup-hashed-user.ts` for shebang/entrypoint shape, `src/app/api/tts/google/route.ts` for MIME/Range response headers if present, and RESEARCH Pattern 4 (verified with project-code's existing use of `fs.createReadStream`).

**Why it's the analog:** Phase 3 bakes in a genuinely-new tool (standalone Node HTTP server). The only re-usable idioms from this repo are (a) the shebang/argv bootstrap from `scripts/lookup-hashed-user.ts`, and (b) the cacheKey regex-validation discipline we already apply on content-hash keys throughout `render-gemini-audio.ts`.

**Shebang + header pattern** (copy from `scripts/lookup-hashed-user.ts:1-23`):
```typescript
#!/usr/bin/env npx tsx
/**
 * preview-bake.ts — localhost-only cache-scrubber server (AUTHOR-08).
 *
 * Read-only browser UI over rituals/_bake-cache/. Lists rituals → lines
 * → streams the cached .opus for a selected line. Dev-only; bound to
 * 127.0.0.1 and refuses to start on any non-loopback interface.
 *
 * Usage:
 *   npx tsx scripts/preview-bake.ts [--port 8883]
 */
```

**Dev-guard + bind pattern** (per RESEARCH Pattern 4, lines 415-469):
```typescript
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { assertDevOnly } from "../src/lib/dev-guard";

assertDevOnly();  // process-level refusal at startup if NODE_ENV=production

const BIND_HOST = "127.0.0.1";
const BIND_PORT = Number(process.env.PREVIEW_BAKE_PORT ?? 8883);
const BAKE_CACHE_DIR = path.resolve("rituals/_bake-cache");
```

**Range-stream response pattern** (copy verbatim from RESEARCH Pattern 4):
```typescript
if (url.pathname.startsWith("/a/") && url.pathname.endsWith(".opus")) {
  const cacheKey = url.pathname.slice(3, -5);
  if (!/^[0-9a-f]{64}$/.test(cacheKey)) {
    res.writeHead(400); res.end("bad key"); return;
  }
  const filepath = path.join(BAKE_CACHE_DIR, `${cacheKey}.opus`);
  if (!fs.existsSync(filepath)) { res.writeHead(404); res.end(); return; }
  const stat = fs.statSync(filepath);
  const range = req.headers.range;
  if (range) {
    const [, startStr, endStr] = /^bytes=(\d+)-(\d*)$/.exec(range) ?? [];
    const start = Number(startStr);
    const end = endStr ? Number(endStr) : stat.size - 1;
    // 206 Partial Content per RFC 7233
    res.writeHead(206, {
      "Content-Type": "audio/ogg; codecs=opus",
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1,
    });
    fs.createReadStream(filepath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Type": "audio/ogg; codecs=opus",
      "Content-Length": stat.size,
      "Accept-Ranges": "bytes",
    });
    fs.createReadStream(filepath).pipe(res);
  }
  return;
}
```

**Bind pattern** (per RESEARCH Pattern 4):
```typescript
server.listen(BIND_PORT, BIND_HOST, () => {
  console.log(`Preview server: http://${BIND_HOST}:${BIND_PORT}`);
});
```

**Adapt how:**
- Security hardening: validate `cacheKey` against `^[0-9a-f]{64}$` BEFORE `path.join` (path-traversal mitigation — RESEARCH §Security Domain).
- Dev-guard: must call `assertDevOnly()` at module load (synchronously) AND once per request (per D-15, the script-side guard is additive on top of the shared module).
- Explicitly refuse `BIND_HOST !== "127.0.0.1" && BIND_HOST !== "::1"` — throw with a message that mentions D-15. (This is the "additional" part of D-15 over the shared module.)
- Content routes `/` and `/r/{slug}` return small JSON + HTML responses; reference `_INDEX.json` for the listing (read-only, no writes).
- Read `_INDEX.json` on every request (file is tiny; no watcher needed).

---

### `src/lib/idb-schema.ts` (library, DB schema)

**Primary analog:** `src/lib/voice-storage.ts:10-81` (already carries the consolidated `onupgradeneeded` that creates ALL stores — documents, sections, settings, voices, audioCache — exactly because it has to survive being opened first).

**Why it's the analog:** The consolidation target is literally the superset of `storage.ts` and `voice-storage.ts`; both files today implement overlapping `onupgradeneeded` handlers to stay safe against being-opened-first. `voice-storage.ts:46-79` is already the canonical "create all stores" block; `idb-schema.ts` lifts this block verbatim plus adds `feedbackTraces`.

**Header pattern** (adapt from `src/lib/voice-storage.ts:1-8`):
```typescript
/**
 * idb-schema.ts — single source of truth for the client-side IndexedDB
 * schema (AUTHOR-10 D-16).
 *
 * Owns:
 *   - DB_NAME, DB_VERSION (bumped to 5 for feedbackTraces)
 *   - All object-store name constants
 *   - openDB() with consolidated onupgradeneeded that creates every store
 *
 * Both src/lib/storage.ts and src/lib/voice-storage.ts import openDB()
 * from here — never call indexedDB.open() directly in any other module.
 */
```

**Constants pattern** (consolidate from `src/lib/storage.ts:13-20` + `src/lib/voice-storage.ts:10-13`):
```typescript
export const DB_NAME = "masonic-ritual-mentor";
// v3: adds voices store. v4: adds audioCache. v5: adds feedbackTraces (AUTHOR-10).
export const DB_VERSION = 5;
export const DOCUMENTS_STORE = "documents";
export const SECTIONS_STORE = "sections";
export const SETTINGS_STORE = "settings";
export const VOICES_STORE = "voices";
export const AUDIO_CACHE_STORE = "audioCache";
export const FEEDBACK_TRACES_STORE = "feedbackTraces";  // NEW (D-17)
```

**openDB pattern** (copy from `src/lib/voice-storage.ts:39-81` — this is the existing consolidated handler; just add the new store):
```typescript
export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // v1-v2: documents + sections
      if (!db.objectStoreNames.contains(DOCUMENTS_STORE)) {
        db.createObjectStore(DOCUMENTS_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(SECTIONS_STORE)) {
        const sectionStore = db.createObjectStore(SECTIONS_STORE, {
          keyPath: "id",
        });
        sectionStore.createIndex("documentId", "documentId", { unique: false });
        sectionStore.createIndex("degree", "degree", { unique: false });
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
      }
      // v3
      if (!db.objectStoreNames.contains(VOICES_STORE)) {
        db.createObjectStore(VOICES_STORE, { keyPath: "id" });
      }
      // v4 — per eng-review decision 1A: client-side caching
      if (!db.objectStoreNames.contains(AUDIO_CACHE_STORE)) {
        const cacheStore = db.createObjectStore(AUDIO_CACHE_STORE, {
          keyPath: "key",
        });
        cacheStore.createIndex("createdAt", "createdAt", { unique: false });
      }
      // v5 (NEW, AUTHOR-10 D-17): feedbackTraces — PII-free eval/coach log
      if (!db.objectStoreNames.contains(FEEDBACK_TRACES_STORE)) {
        const fbStore = db.createObjectStore(FEEDBACK_TRACES_STORE, {
          keyPath: "id",
        });
        fbStore.createIndex("documentId", "documentId", { unique: false });
        fbStore.createIndex("timestamp", "timestamp", { unique: false });
        fbStore.createIndex("variantId", "variantId", { unique: false });
      }
    };
  });
}
```

**FeedbackTrace interface** (new; follows Phase 2 D-09/D-10 PII-free pattern):
```typescript
/** PII-free trace of an AI feedback event. Hashes only — no body content. */
export interface FeedbackTrace {
  id: string;              // randomUUID per trace
  documentId: string;      // .mram document ID
  sectionId: string;
  lineId: string;
  variantId: string;       // "mentor-v1" | "roast-v1" | "terse-v1" | "coach-v1"
  promptHash: string;      // sha256
  completionHash: string;  // sha256
  timestamp: number;       // Date.now()
  ratingSignal?: "helpful" | "unhelpful" | null;
}
```

**Adapt how:**
- Delete the lockstep comment from `src/lib/storage.ts:14-16` — it's obsolete after D-16.
- Bump `DB_VERSION` to `5` exactly once here.
- Keep all existing store definitions byte-identical to avoid accidental schema changes.

---

### `src/lib/dev-guard.ts` (library, guard)

**Primary analog:** Current inline check at `src/app/author/page.tsx:220-233` + the structural pattern in `src/lib/paid-route-guard.ts:1-28` (guard-helper module with clear single-purpose API).

**Why it's the analog:** D-15 is explicitly "extract the inline NODE_ENV check into a shared module." The lines being extracted are 220-233. `paid-route-guard.ts` is the repo's closest existing "shared precondition enforcement" module.

**Header pattern** (adapt from `src/lib/paid-route-guard.ts:1-11`):
```typescript
/**
 * dev-guard.ts — shared dev-only guard (AUTHOR D-15).
 *
 * Single source of truth for "this code only runs in local development."
 * Both src/app/author/page.tsx (Ritual Author tool) and
 * scripts/preview-bake.ts (cache-scrubber server) call assertDevOnly()
 * before exposing any editor/cache surface. Extracted from what used to
 * be an inline process.env.NODE_ENV check in /author/page.tsx:220.
 */
```

**Guard API** (new, but follows same function-returning-or-throwing shape as paid-route-guard):
```typescript
/** Returns true when NODE_ENV is not "production". */
export function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

/** Throw if running in production. Safe to call at module load time. */
export function assertDevOnly(): void {
  if (!isDev()) {
    throw new Error(
      "[DEV-GUARD] refusing to run in production " +
      "(NODE_ENV=production). This module is dev-only.",
    );
  }
}
```

**Adapt how:**
- `/author/page.tsx` is a React component — it needs a non-throwing version (`isDev()`) to render the "Author tool disabled" JSX banner. `preview-bake.ts` wants the throwing version (`assertDevOnly()`) at module load. Export BOTH.
- Message text must echo the D-15 wording so Shannon's future ack-grep finds it.
- No dependencies — pure stdlib.

---

### `src/lib/__tests__/idb-schema.test.ts` (test, dual-open invariant)

**Primary analog:** `src/lib/__tests__/degraded-mode-store.test.ts` (dynamic-import after reset pattern; small, focused Vitest suite).

**Why it's the analog:** `idb-schema.test.ts` needs exactly the same pattern — reset module state between tests, dynamic-import fresh, assert on observable state. `degraded-mode-store.test.ts:19-23` is the canonical shape.

**Import + setup pattern** (copy from `src/lib/__tests__/degraded-mode-store.test.ts:1-23`):
```typescript
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";

describe("idb-schema dual-open invariant (AUTHOR-10 D-18)", () => {
  beforeEach(async () => {
    // fake-indexeddb/auto installs globalThis.indexedDB in jsdom env
    await import("fake-indexeddb/auto");
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase("masonic-ritual-mentor");
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onblocked = () => resolve();  // no other connections in a test worker
    });
  });
  // ...
});
```

**Test body** (from RESEARCH Pattern 3):
```typescript
it("opens with all 6 stores regardless of open order", async () => {
  const { openDB } = await import("../idb-schema");
  const db = await openDB();
  const names = Array.from(db.objectStoreNames).sort();
  expect(names).toEqual([
    "audioCache",
    "documents",
    "feedbackTraces",
    "sections",
    "settings",
    "voices",
  ]);
  db.close();
});
```

**Adapt how:**
- `@vitest-environment jsdom` comment is REQUIRED — fake-indexeddb needs a browser-like global. Default for most tests in this repo is `jsdom` already, but some are `// @vitest-environment node`; call out the jsdom choice explicitly.
- `beforeEach` must await the `deleteDatabase` promise (including `onblocked` treated as success) — see RESEARCH Pitfall 2.
- Third test case: pre-seed a v4 database via `indexedDB.open(DB_NAME, 4)` with a minimal v4 onupgradeneeded, write a sample record, close, then re-open via `openDB()` and assert (a) sample record still readable, (b) `feedbackTraces` now exists.

---

### `src/lib/__tests__/dev-guard.test.ts` (test, simple unit)

**Primary analog:** `src/lib/__tests__/hash-user.test.ts:1-40` (small, no mocks, direct assertions).

**Why it's the analog:** `dev-guard.ts` is a tiny pure module — no external deps, no module state, no IO. The test is a direct-assertion suite with env-var manipulation. `hash-user.test.ts` is the closest existing "pure function, small suite" pattern.

**Import + test pattern** (adapt from `src/lib/__tests__/hash-user.test.ts:22-39`):
```typescript
// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isDev, assertDevOnly } from "../dev-guard";

describe("dev-guard", () => {
  const savedEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = savedEnv;
  });

  it("isDev returns true in non-production", () => {
    process.env.NODE_ENV = "development";
    expect(isDev()).toBe(true);
    process.env.NODE_ENV = "test";
    expect(isDev()).toBe(true);
  });

  it("isDev returns false in production", () => {
    process.env.NODE_ENV = "production";
    expect(isDev()).toBe(false);
  });

  it("assertDevOnly throws in production", () => {
    process.env.NODE_ENV = "production";
    expect(() => assertDevOnly()).toThrow(/DEV-GUARD/);
  });

  it("assertDevOnly does not throw in development", () => {
    process.env.NODE_ENV = "development";
    expect(() => assertDevOnly()).not.toThrow();
  });
});
```

**Adapt how:**
- Use `@vitest-environment node` (matches hash-user, pricing, rate-limit tests — all pure Node logic).
- Save/restore `process.env.NODE_ENV` in `afterEach` so other tests in the suite don't see leaked state.

---

### `scripts/__tests__/bake-all.test.ts` (test, orchestrator unit)

**Primary analog:** `src/lib/__tests__/dialogue-to-mram.test.ts:1-50` (uses `node:crypto`, works with Node-side fs/bytes, Node vitest env).

**Why it's the analog:** No existing `scripts/__tests__/` dir — Wave 0. Closest pattern for "test a Node script's helpers with real fs/crypto" is `dialogue-to-mram.test.ts`, which encrypts with Node crypto and round-trips through the browser decryptor.

**Test file header** (adapt from `src/lib/__tests__/dialogue-to-mram.test.ts:1-15`):
```typescript
// @vitest-environment node
/**
 * Tests for scripts/bake-all.ts (AUTHOR-02, AUTHOR-03, AUTHOR-06, AUTHOR-07, AUTHOR-09).
 *
 * Scope: pure helpers only — argv parsing, git diff wrapping, _RESUME.json
 * round-trip, --parallel clamp, duration-anomaly math. Integration tests
 * that call real Gemini/Google/Groq are out of scope (no API keys in CI).
 */
import { describe, it, expect } from "vitest";
// Import pure helpers from the orchestrator (export them expressly for test):
import {
  parseFlags,
  clampParallel,
  computeRitualMedianSecPerChar,
  detectAnomaly,
} from "../bake-all";
```

**Unit test shape** (adapt from `src/lib/__tests__/hash-user.test.ts:25-40`):
```typescript
describe("clampParallel", () => {
  it("clamps below 1 to 1", () => expect(clampParallel(0)).toBe(1));
  it("clamps above 16 to 16", () => expect(clampParallel(99)).toBe(16));
  it("passes through valid values", () => expect(clampParallel(4)).toBe(4));
  it("default when undefined", () => expect(clampParallel(undefined)).toBe(4));
});
```

**Adapt how:**
- `bake-all.ts` must export the pure helpers as named exports so tests can import them directly — mirrors how `scripts/render-gemini-audio.ts:588` exports `computeCacheKey` for the test path.
- Git diff test: seed a tmp git repo with `execSync` + simulate edits — follow the "integration check" isolation used in `validate-rituals.ts` (no fake-fs needed).
- Anomaly detector test: construct `_INDEX.json`-shaped data in-memory, call `detectAnomaly(entry, median)`, assert hard-fail above 3× and below 0.3× ratio.

---

### `scripts/__tests__/preview-bake.test.ts` (test, server unit)

**Primary analog:** `src/lib/__tests__/dialogue-to-mram.test.ts` (Node env, real bytes) + `src/lib/__tests__/paid-route-guard.test.ts` (request construction pattern).

**Why it's the analog:** preview-bake has two testable surfaces: (a) the bind-refusal logic (call the exported `ensureLoopback(host)` helper with a non-loopback IP → throws), and (b) the Range-request handler (feed in a request-like object → assert 206 + Content-Range).

**Test shape** (adapt from RESEARCH §Validation Architecture Wave 0):
```typescript
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { ensureLoopback, handleOpusRequest } from "../preview-bake";

describe("preview-bake dev-guard", () => {
  it("refuses to bind on non-loopback", () => {
    expect(() => ensureLoopback("0.0.0.0")).toThrow(/loopback/);
    expect(() => ensureLoopback("192.168.1.5")).toThrow();
  });
  it("allows 127.0.0.1 and ::1", () => {
    expect(() => ensureLoopback("127.0.0.1")).not.toThrow();
    expect(() => ensureLoopback("::1")).not.toThrow();
  });
});

describe("preview-bake Range handling", () => {
  it("rejects cacheKey that doesn't match /^[0-9a-f]{64}$/", () => {
    // simulate handler with bad key → 400
  });
});
```

**Adapt how:**
- Export the `ensureLoopback(host)` and the route handler as named exports from `preview-bake.ts` (same export-pure-helpers discipline as `bake-all.ts`).
- Mock `fs.existsSync` / `fs.statSync` for the Range test rather than writing real Opus fixtures.

---

### `rituals/_bake-cache/.gitignore` (config, trivial)

**Primary analog:** Root `/home/mcleods777/Masonic-Ritual-AI-Mentor/.gitignore` (lines 1-end).

**Why it's the analog:** Trivial — just a `.gitignore` file scoped to one directory.

**Content:**
```gitignore
# Content-addressed bake cache — local only, never committed (AUTHOR-01 D-01).
# Every file in this directory is gitignored EXCEPT this .gitignore itself.
*
!.gitignore
```

**Adapt how:**
- Decision D-01 says "per-repo, gitignored." Root `.gitignore` alternative would be `rituals/_bake-cache/`. Phase 3 chooses a nested `.gitignore` for discoverability — the file is self-documenting when Shannon opens `rituals/_bake-cache/` on a fresh machine.
- Root `.gitignore` also gets the entry (belt-and-suspenders).

---

## Modified Files — Current State → New State

### `scripts/render-gemini-audio.ts`

**Current state:**
- Line 27-31: `DEFAULT_MODELS` array — already in the order Phase 3 wants.
- Lines 37-40: `CACHE_DIR = ~/.cache/masonic-mram-audio/`.
- Line 50: `const CACHE_KEY_VERSION = "v2"`.
- Lines 588-596: `computeCacheKey(text, style, voice, preamble)` — 4 params, no `modelId`.
- Line 111: call site `computeCacheKey(text, style, voice, preamble)` inside `renderLineAudio`.
- Lines 136-140: atomic tmp+rename write.

**New state:**
- Line 27-31: add a rationale comment locking the order (D-12): `// Pinned order (AUTHOR-03 D-12): 3.1-flash-tts-preview is the highest-quality preview as of 2026-04. Older previews retained for the quota-exhaustion wait path. Env-overridable via GEMINI_TTS_MODELS.`
- Lines 37-40: replace with `CACHE_DIR = path.resolve("rituals/_bake-cache")` (repo-relative).
- Line 50: `const CACHE_KEY_VERSION = "v3";` with comment `// v3 (AUTHOR-01 D-02): modelId now part of key material — eliminates silent stale 2.5-pro-tagged-as-3.1-flash hits.`
- Lines 588-596: add `modelId: string` as 4th param (before `preamble`); update material string to `${CACHE_KEY_VERSION}\x00${text}\x00${style ?? ""}\x00${voice}\x00${modelId}\x00${preamble}`.
- Line 111 callsite: `computeCacheKey(text, style, voice, model, preamble)` — note `model` must be known BEFORE cache lookup, which changes the flow: the cache lookup now moves AFTER model selection OR the cache-key loop iterates over models. Simpler: on cache lookup, iterate each model in fallback chain, lookup each, use first hit. On miss, render with first model and write with that model's key.
- Add one-shot migration helper (RESEARCH §Code Examples "one-shot legacy cache migration") — runs at module load or first `renderLineAudio` call, guarded by "skip if new cache has any .opus entry."

**Pattern to preserve:**
- Atomic tmp+rename write (lines 136-140) — do not touch.
- `AllModelsQuotaExhausted` handling (lines 149-162) — do not touch.
- The `onProgress` callback shape (lines 75-81) — add a new `status: "migrating-legacy-cache"` variant if you need a progress event for the migration.
- All callers of `computeCacheKey` must be updated in the same commit: `scripts/invalidate-mram-cache.ts` also calls it; update its signature.

---

### `scripts/build-mram-from-dialogue.ts`

**Current state:**
- Lines 488-506: `MIN_PREAMBLE_LINE_CHARS` + `MIN_BAKE_LINE_CHARS` env-overridable constants; comment explaining that ultra-short lines are HARD-SKIPPED and rendered at runtime.
- Lines 508-525: `preferredModel` + `modelsForWaitMode` setup.
- Line 530-534: `console.error` summary of cache location + preferred model at bake start.

**New state:**
- Lines 488-506: `MIN_BAKE_LINE_CHARS` stays, but comment flips from "hard-skip" to "route to Google TTS at bake time" (D-09). `MIN_PREAMBLE_LINE_CHARS` stays unchanged.
- Insert a validator gate BEFORE the render loop: call `validatePair(plain, cipher)` (from `src/lib/author-validation.ts`), hard-fail on any `severity: "error"` issue OR any bake-band ratio-outlier (per D-08). See Shared Patterns §Validator-gate.
- For every spoken line, branch on `line.text.length < MIN_BAKE_LINE_CHARS`:
  - short → `googleTtsBakeCall(line.text, voiceName)` (per RESEARCH Pattern 5).
  - long → existing `renderLineAudio(line.text, style, voice, opts, preamble)` path.
- After each render, call the anomaly detector (RESEARCH Pattern: `music-metadata` parseBuffer → durationMs → compare against per-ritual rolling median); hard-fail above 3× / below 0.3× (D-10).
- If `--verify-audio` flag set: pipe Opus through direct Groq Whisper call (RESEARCH §Pattern: Google TTS / Pitfall 3 — direct `GROQ_API_KEY` call, bypassing `/api/transcribe`).
- Orchestration path: when invoked from `bake-all.ts`, use the orchestrator's state file + parallelism cap; when invoked standalone, preserve today's sequential behavior.
- Line 532: update comment to `Cache: rituals/_bake-cache/ (safe to interrupt + resume via bake-all.ts --resume)`.

**Pattern to preserve:**
- The env-override idiom `Number(process.env.MIN_BAKE_LINE_CHARS ?? "5")` (line 504-506) — keep identical shape for any new env vars.
- The `console.error` progress logging (line 530-534) — keep it on stderr so pipeable output is clean.
- The `preferredModel` + fallback-mode dance (lines 508-525) — do not touch; it's orthogonal to short-line routing.
- `import { renderLineAudio, ... } from "./render-gemini-audio"` (lines 46-51) — still the canonical render path for non-short lines.

---

### `src/lib/author-validation.ts`

**Current state (lines 192-203):**
```typescript
const ratio = c.text.length / Math.max(p.text.length, 1);
if (p.text.length >= 20 && (ratio > 1.0 || ratio < 0.05)) {
  lineIssues.push({
    index: i,
    severity: "warning",   // ← warning only today
    kind: "ratio-outlier",
    message:
      ratio > 1.0
        ? `cipher is longer than plain (${c.text.length} vs ${p.text.length} chars) — unusual for a cipher`
        : `cipher is much shorter than expected (${(ratio * 100).toFixed(0)}% of plain length)`,
  });
}
```

**New state:**
- Keep the existing warning-level `ratio-outlier` path (used by the `/author` UI).
- Add a SECOND band check for bake-time (D-08): word-count ratio (not character-count), band `[0.5×, 2×]`. If plain/cipher word-count ratio is outside this band, push a NEW `PairLineIssue` with `severity: "error"` and `kind: "ratio-outlier"`.
- Phase 3 requires a new helper `isBakeBandError(issue): boolean` OR a dedicated `kind: "bake-ratio-outlier"` so the orchestrator can distinguish bake-band errors from informational warnings. (Claude's discretion per D-08; recommend a new kind for clarity.)

**Suggested addition (new code block, inserted after the existing character-ratio check):**
```typescript
// AUTHOR-05 D-08: bake-time word-count band check — harder threshold
// that hard-fails the bake. The character-ratio check above is the
// softer /author UI warning; this is the bake-stop gate.
const plainWords = p.text.trim().split(/\s+/).filter(Boolean).length;
const cipherWords = c.text.trim().split(/\s+/).filter(Boolean).length;
const wordRatio = plainWords / Math.max(cipherWords, 1);
if (cipherWords >= 1 && (wordRatio > 2.0 || wordRatio < 0.5)) {
  lineIssues.push({
    index: i,
    severity: "error",
    kind: "ratio-outlier",
    message:
      `[D-08 bake-band] plain/cipher word ratio out of [0.5×, 2×] band: ` +
      `plain=${plainWords} words, cipher=${cipherWords} words, ratio=${wordRatio.toFixed(2)}×`,
  });
}
```

**Pattern to preserve:**
- `PairLineIssue` discriminated-union shape (lines 18-31) — do not change it; the new error piggybacks on existing `kind: "ratio-outlier"`.
- `validateParsedPair(plain, cipher)` return shape — callers (the /author UI) depend on `structureOk`, `lineIssues`, etc.
- The "return structured results, do not throw" contract (file-level comment, lines 2-7) — the orchestrator turns these into thrown errors at the call site, not here.

---

### `src/lib/storage.ts`

**Current state:**
- Lines 13-20: inline `DB_NAME`, `DB_VERSION = 4`, store-name constants, lockstep comment.
- Lines 26-69: inline `openDB()` with its own `onupgradeneeded`.

**New state:**
- Delete lines 13-20 (inline constants). Replace with:
  ```typescript
  import {
    openDB,
    DOCUMENTS_STORE,
    SECTIONS_STORE,
    SETTINGS_STORE,
  } from "./idb-schema";
  ```
- Delete lines 26-69 (inline `openDB`).
- Every other line in the file is untouched.

**Pattern to preserve:**
- Every exported symbol (`StoredDocument`, `saveDocument`, `listDocuments`, etc.) keeps its current API — callers elsewhere in the codebase should not notice any change.
- The transaction idiom `db.transaction(STORE, "readonly")` (lines 80-84 and throughout) — untouched.
- `encrypt`/`decrypt`/`getOrCreateKey` helpers (lines 75-136) — untouched.

---

### `src/lib/voice-storage.ts`

**Current state:**
- Lines 10-13: inline `DB_NAME`, `DB_VERSION = 4`, `VOICES_STORE`, `AUDIO_CACHE_STORE`.
- Lines 39-81: inline `openDB()` with consolidated upgrade handler.

**New state:**
- Delete lines 10-13.
- Replace with:
  ```typescript
  import {
    openDB,
    VOICES_STORE,
    AUDIO_CACHE_STORE,
  } from "./idb-schema";
  export { AUDIO_CACHE_STORE };  // preserve existing export for downstream callers
  ```
- Delete lines 39-81.

**Pattern to preserve:**
- `LocalVoice` interface (lines 15-33) — untouched.
- `AudioCacheEntry` interface (lines 88-96) — untouched.
- `getCachedAudio`, `putCachedAudio` (lines 99-130) — untouched.
- All downstream CRUD operations (line 136+) — untouched.

---

### `src/app/author/page.tsx`

**Current state (lines 220-233):**
```typescript
const isProduction = process.env.NODE_ENV === "production";

if (isProduction) {
  return (
    <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-6 text-red-200">
      <h1 className="text-xl font-semibold mb-2">Author tool disabled</h1>
      <p className="text-sm">
        The ritual review and correction tool only runs in local development.
        It edits plaintext ritual files on disk and is never served from a
        production build.
      </p>
    </div>
  );
}
```

**New state:**
- Replace the `const isProduction = ...` line with `import { isDev } from "@/lib/dev-guard";` at the top of the file (import ordering: external, then alias imports, then relative — check existing import ordering at top of `page.tsx`).
- Replace `if (isProduction)` → `if (!isDev())`.
- Keep the JSX banner exactly as it is — it's the visible "disabled" affordance and must look identical.

**Pattern to preserve:**
- The JSX banner — byte-for-byte identical (Shannon or anyone else reviewing in prod should see the same message).
- All other logic in the component — untouched.
- The path alias import style (`@/lib/dev-guard`) — matches existing pattern if the file already uses `@/` aliases; otherwise use `../../lib/dev-guard` relative import.

---

### `package.json`

**Current state:**
- Lines 5-12: `scripts` block.
- Lines 13-24: `dependencies`.
- Lines 25-39: `devDependencies`.

**New state:**
- Add to `scripts` (after `test:run`):
  ```json
  "bake-all": "npx tsx scripts/bake-all.ts",
  "preview-bake": "npx tsx scripts/preview-bake.ts"
  ```
- Add to `dependencies` (alphabetical):
  ```json
  "music-metadata": "^11.12.3",
  "p-limit": "^7.3.0",
  ```
- Add to `devDependencies` (alphabetical):
  ```json
  "fake-indexeddb": "^6.2.5",
  ```

**Pattern to preserve:**
- The `"test:run": "vitest run"` style — no extra flags; orchestrator tests are vitest-native.
- Alphabetical ordering inside each block.
- Semantic-versioning carets (`^`) — matches every existing entry.

---

### `.gitignore`

**Current state (top of file):**
```
# dependencies
/node_modules
...
bake.log
```

**New state (append a new section, matching existing comment-header style):**
```
# bake cache — AUTHOR-01 D-01 (content-addressed Opus cache)
rituals/_bake-cache/
```

**Pattern to preserve:**
- Section comment style (leading `# lowercase description`).
- Absolute-path-with-leading-slash for top-level dirs; no-leading-slash for anywhere-in-repo patterns (existing style: `/node_modules`, `/.next/`).

---

## Shared Patterns

### Atomic file write (tmp + rename)

**Source:** `scripts/render-gemini-audio.ts:136-140` (existing idiom).
**Apply to:** `_INDEX.json` writes, `_RESUME.json` writes, any new cache-adjacent file.

```typescript
const tmpPath = `${targetPath}.tmp`;
fs.writeFileSync(tmpPath, data);
fs.renameSync(tmpPath, targetPath);
```

This is the canonical crash-safe write in this codebase. `_RESUME.json` MUST use this idiom (per RESEARCH §Pattern 6).

---

### Validator-gate (Read → validatePair → hard-fail)

**Source:** `src/lib/author-validation.ts` structure + `scripts/validate-rituals.ts:131-229` usage shape.
**Apply to:** `scripts/bake-all.ts` (pre-render gate, before ANY render call per ritual) and `scripts/build-mram-from-dialogue.ts` (belt-and-suspenders gate inside the build script).

```typescript
import { validatePair } from "../src/lib/author-validation";

function validateOrFail(slug: string): void {
  const plain = fs.readFileSync(`rituals/${slug}-dialogue.md`, "utf8");
  const cipher = fs.readFileSync(`rituals/${slug}-dialogue-cipher.md`, "utf8");
  const result = validatePair(plain, cipher);

  const errors = result.lineIssues.filter((i) => i.severity === "error");
  if (errors.length > 0 || !result.structureOk) {
    console.error(`[AUTHOR-05] ${slug}: validator failed (${errors.length} issues):`);
    for (const issue of errors) {
      console.error(`  [${issue.kind}] line ${issue.index}: ${issue.message}`);
    }
    process.exit(1);
  }
}
```

Must run BEFORE any API call per anti-pattern §4 in RESEARCH.

---

### Logging idiom (checkmark / warn / fail)

**Source:** `scripts/validate-rituals.ts:79-85`.
**Apply to:** `scripts/bake-all.ts`, `scripts/preview-bake.ts` progress output.

```typescript
const ok = (msg: string) => console.log(`  ✓ ${msg}`);
const warn = (msg: string) => console.log(`  ! ${msg}`);
const header = (msg: string) => console.log(`\n${msg}`);
const fail = (msg: string): never => {
  console.error(`  ✗ ${msg}`);
  process.exit(1);
};
```

Matches Shannon's muscle memory from `validate-rituals.ts`. Don't invent a new logging shape.

---

### Script shebang + argv parsing

**Source:** `scripts/lookup-hashed-user.ts:1-53` (smallest complete example).
**Apply to:** `scripts/bake-all.ts`, `scripts/preview-bake.ts`.

- Line 1: `#!/usr/bin/env npx tsx`
- Lines 2-23: doc block explaining usage + env-var inputs.
- `process.argv.slice(2)` for flag parsing.
- `console.error` for usage errors; `process.exit(1)` for them.
- Wrapped in `async function main()` + `void main();` at the end (or a synchronous variant like `validate-rituals.ts:320-332`).

---

### Vitest test header (`@vitest-environment`)

**Source:** `src/lib/__tests__/hash-user.test.ts:1` (Node env); `src/lib/__tests__/screen-wake-lock.test.ts:1` (jsdom env, explicit).
**Apply to:** All new Phase 3 tests.

- `// @vitest-environment node` — for pure logic tests (dev-guard, bake-all helpers, preview-bake helpers).
- `// @vitest-environment jsdom` — for `idb-schema.test.ts` (fake-indexeddb needs browser globals).

Other test files have an implicit default; Phase 3 tests should pick explicitly.

---

### Dynamic-import + `vi.resetModules()` for module-state tests

**Source:** `src/lib/__tests__/degraded-mode-store.test.ts:19-24` + `src/lib/__tests__/audit-log.test.ts:20-26`.
**Apply to:** `src/lib/__tests__/idb-schema.test.ts` (each test needs a fresh module import after `deleteDatabase`).

```typescript
beforeEach(async () => {
  vi.resetModules();
  await import("fake-indexeddb/auto");
  // ... deleteDatabase
});
```

---

## No Analog Found

Files with no close match in the codebase (planner references RESEARCH.md patterns instead):

| File | Role | Reason |
|------|------|--------|
| `scripts/preview-bake.ts` (Node `http.createServer` body) | server | No existing Node HTTP server in the repo. Use RESEARCH §Pattern 4 verbatim. |
| `scripts/__tests__/bake-all.test.ts` git-diff helper test | test | No existing `execSync` / git fixture pattern in this repo. Plan must invent one; RESEARCH Pitfall 5 flags the argv-array quoting gotcha. |
| `scripts/bake-all.ts` p-limit fan-out | orchestrator | No existing p-limit or equivalent concurrency primitive in this repo; use RESEARCH §Pattern 1 verbatim. |
| `scripts/bake-all.ts` music-metadata duration parse | helper | No existing music-metadata usage; use RESEARCH §Example "Google TTS REST direct call" / §Don't Hand-Roll (`parseBuffer(opusBytes, { mimeType: "audio/ogg" })`). |

---

## Metadata

**Analog search scope:**
- `scripts/*.ts` (11 files scanned)
- `src/lib/*.ts` (28 files scanned, 23 relevant to analog)
- `src/lib/__tests__/*.test.ts` (23 files scanned; closest selected per new test file)
- `src/app/author/page.tsx` (current inline dev-guard state, lines 210-250)
- `package.json`, `.gitignore` (config analogs)

**Files scanned (primary):** ~45 (scripts + src/lib + src/lib/__tests__ + key UI page + 2 config files).

**Pattern extraction date:** 2026-04-21.

## PATTERN MAPPING COMPLETE
