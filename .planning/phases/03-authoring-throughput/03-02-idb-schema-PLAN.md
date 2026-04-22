---
phase: 03-authoring-throughput
plan: 02
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/lib/idb-schema.ts
  - src/lib/storage.ts
  - src/lib/voice-storage.ts
  - src/lib/__tests__/idb-schema.test.ts
autonomous: true
requirements: [AUTHOR-10]
tags: [indexeddb, schema, feedback-traces, dual-open-invariant, test-heavy]

must_haves:
  truths:
    - "src/lib/idb-schema.ts is the single source of truth for DB_NAME, DB_VERSION, all object-store name constants, and a shared openDB() function"
    - "DB_VERSION === 5 (bumped from 4 for the feedbackTraces store)"
    - "The consolidated onupgradeneeded creates all 6 stores: documents, sections, settings, voices, audioCache, feedbackTraces"
    - "Both src/lib/storage.ts and src/lib/voice-storage.ts import openDB() from ./idb-schema — neither file declares its own indexedDB.open() call"
    - "FeedbackTrace interface (exported from idb-schema.ts) contains id, documentId, sectionId, lineId, variantId, promptHash, completionHash, timestamp, optional ratingSignal — and NO body/text/prompt/completion/email keys"
    - "feedbackTraces store has indexes on documentId, timestamp, variantId (per D-17)"
    - "Opening via storage.ts first OR voice-storage.ts first both yield the same 6 object stores (dual-open invariant)"
    - "A v4-on-disk database opens as v5 cleanly: existing documents/sections/settings/voices/audioCache data is preserved; feedbackTraces is newly created"
  artifacts:
    - path: src/lib/idb-schema.ts
      provides: "single source of truth for IndexedDB schema: DB_NAME, DB_VERSION=5, store-name constants, openDB(), FeedbackTrace interface"
      contains: "export function openDB"
      min_lines: 80
    - path: src/lib/storage.ts
      provides: "existing storage module — now importing openDB from ./idb-schema instead of declaring its own"
      contains: 'from "./idb-schema"'
    - path: src/lib/voice-storage.ts
      provides: "existing voice-storage module — now importing openDB from ./idb-schema"
      contains: 'from "./idb-schema"'
    - path: src/lib/__tests__/idb-schema.test.ts
      provides: "three test cases: dual-open, storage-first/voice-first parity, v4→v5 migration preservation"
      contains: "dual-open invariant"
  key_links:
    - from: src/lib/storage.ts
      to: src/lib/idb-schema.ts
      via: "import { openDB, DOCUMENTS_STORE, SECTIONS_STORE, SETTINGS_STORE } from './idb-schema'"
      pattern: 'from "./idb-schema"'
    - from: src/lib/voice-storage.ts
      to: src/lib/idb-schema.ts
      via: "import { openDB, VOICES_STORE, AUDIO_CACHE_STORE } from './idb-schema'; re-export AUDIO_CACHE_STORE"
      pattern: 'from "./idb-schema"'
    - from: src/lib/__tests__/idb-schema.test.ts
      to: fake-indexeddb/auto
      via: "beforeEach dynamic import installs globalThis.indexedDB for jsdom"
      pattern: "fake-indexeddb/auto"
---

<objective>
Extract `src/lib/idb-schema.ts` as the single source of truth for the client-side IndexedDB schema (DB_NAME, DB_VERSION, all object-store name constants, and a shared `openDB()` with a consolidated `onupgradeneeded` that creates all 6 stores including the new `feedbackTraces` store). Delete the duplicated inline `openDB()` from `src/lib/storage.ts` and `src/lib/voice-storage.ts`; both files now import from `./idb-schema`. Fill in the Plan-01 test scaffold at `src/lib/__tests__/idb-schema.test.ts` with three passing cases: dual-open invariant, storage-first/voice-first equivalence, and v4→v5 migration with data preservation.

Purpose: per D-16/D-17/D-18, kills the `DB_VERSION` lockstep dance (current storage.ts:14-16 and voice-storage.ts:10-13), adds the `feedbackTraces` store Phase 5 COACH-06 will consume, and makes Shannon's "bump DB version" future edits touch exactly one file. The FeedbackTrace interface follows Phase 2 D-09/D-10's hashes-only PII-prevention pattern — no prompt/completion/email/text/body keys in the shape.

Output: new `src/lib/idb-schema.ts` owning the schema; both existing storage modules updated to import from it; three-case test file proves dual-open invariant and v4→v5 migration.
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
@src/lib/storage.ts
@src/lib/voice-storage.ts
@src/lib/__tests__/idb-schema.test.ts
@src/lib/__tests__/degraded-mode-store.test.ts

<interfaces>
<!-- Key existing exports that must be preserved after the swap. Executor should NOT change these. -->

From src/lib/storage.ts (public API preserved verbatim):
```typescript
export interface StoredDocument { ... }
export interface StoredSection { ... }
export async function saveDocument(doc: StoredDocument): Promise<void>;
export async function listDocuments(): Promise<StoredDocument[]>;
export async function getSection(id: string): Promise<StoredSection | null>;
// (etc.) — only the inline openDB/constants block changes.
```

From src/lib/voice-storage.ts (public API preserved verbatim):
```typescript
export const AUDIO_CACHE_STORE: string;   // must stay re-exported (downstream callers import it)
export interface LocalVoice { ... }
export interface AudioCacheEntry { ... }
export async function getCachedAudio(key: string): Promise<AudioCacheEntry | null>;
export async function putCachedAudio(entry: AudioCacheEntry): Promise<void>;
// (etc.)
```

Store-name constants (PATTERNS.md §idb-schema.ts — verbatim):
```typescript
export const DB_NAME = "masonic-ritual-mentor";
export const DB_VERSION = 5;                         // v5: adds feedbackTraces
export const DOCUMENTS_STORE = "documents";
export const SECTIONS_STORE = "sections";
export const SETTINGS_STORE = "settings";
export const VOICES_STORE = "voices";
export const AUDIO_CACHE_STORE = "audioCache";
export const FEEDBACK_TRACES_STORE = "feedbackTraces"; // NEW (D-17)
```

FeedbackTrace interface (CONTEXT §D-17, verbatim — hashes-only PII-prevention pattern):
```typescript
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

feedbackTraces store creation (PATTERNS.md §idb-schema.ts — inside onupgradeneeded):
```typescript
if (!db.objectStoreNames.contains(FEEDBACK_TRACES_STORE)) {
  const fbStore = db.createObjectStore(FEEDBACK_TRACES_STORE, { keyPath: "id" });
  fbStore.createIndex("documentId", "documentId", { unique: false });
  fbStore.createIndex("timestamp",  "timestamp",  { unique: false });
  fbStore.createIndex("variantId",  "variantId",  { unique: false });
}
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create src/lib/idb-schema.ts (single source of truth) + fill test scaffold</name>
  <files>
    src/lib/idb-schema.ts,
    src/lib/__tests__/idb-schema.test.ts
  </files>
  <read_first>
    src/lib/voice-storage.ts (lines 1-90 — the existing consolidated onupgradeneeded at lines 39-81 is the canonical superset; idb-schema.ts is literally this block with feedbackTraces appended),
    src/lib/storage.ts (lines 1-70 — the parallel inline openDB at 26-69 to confirm no stores are missing from voice-storage's consolidation),
    src/lib/__tests__/degraded-mode-store.test.ts (the dynamic-import + resetModules pattern Phase 3's idb-schema test mirrors),
    .planning/phases/03-authoring-throughput/03-PATTERNS.md §src/lib/idb-schema.ts (header + openDB + constants verbatim),
    .planning/phases/03-authoring-throughput/03-CONTEXT.md §D-16 / §D-17 / §D-18 (version bump rationale, FeedbackTrace interface, test cases),
    .planning/phases/03-authoring-throughput/03-RESEARCH.md §Pattern 3 (fake-indexeddb test harness verbatim),
    src/lib/__tests__/idb-schema.test.ts (the Wave 0 scaffold from Plan 01 — `it.todo` markers to replace).
  </read_first>
  <behavior>
    - Test 1 (dual-open invariant, AUTHOR-10 SC6): `await openDB()` on a fresh fake-indexeddb → `db.objectStoreNames` sorted equals `["audioCache", "documents", "feedbackTraces", "sections", "settings", "voices"]` exactly — six stores, alphabetically sorted.
    - Test 2 (storage-first-then-voice vs voice-first-then-storage parity): opening via storage.listDocuments() first (forces idb-schema.openDB()) then closing and opening via voice-storage.getCachedAudio() produces identical object-store set. Run the symmetric case (voice first then storage) — both produce the same six stores.
    - Test 3 (v4→v5 migration preservation): manually `indexedDB.open(DB_NAME, 4)` with a minimal v4 upgrade handler (creates documents, sections, settings, voices, audioCache); put a sample StoredDocument into documents; close; then `await openDB()` from idb-schema (version 5 triggers upgrade). Assert: sample doc is still readable, feedbackTraces store exists and is empty, all 6 stores present.
    - Test 4 (FeedbackTrace PII safety — type-level only; compile-time assertion): a `const never: FeedbackTrace = { id, documentId, sectionId, lineId, variantId, promptHash, completionHash, timestamp, ratingSignal: null }` literal includes ONLY the interface keys — the test uses a TypeScript `satisfies FeedbackTrace` expression to prove the shape. No body/text/prompt/completion/email keys in the type.
    - Test 5: `DB_VERSION === 5` (trivial constant assertion).
    - Test 6: `openDB()` resolves with an IDBDatabase whose `.version === 5`.
  </behavior>
  <action>
Create `src/lib/idb-schema.ts` with the exact structure from PATTERNS.md §src/lib/idb-schema.ts, populated as follows:

```typescript
/**
 * idb-schema.ts — single source of truth for the client-side IndexedDB
 * schema (AUTHOR-10 D-16).
 *
 * Owns:
 *   - DB_NAME, DB_VERSION (bumped to 5 for feedbackTraces, D-17)
 *   - All object-store name constants
 *   - openDB() with one consolidated onupgradeneeded that creates every store
 *   - FeedbackTrace TypeScript interface (hashes-only PII-prevention shape)
 *
 * Both src/lib/storage.ts and src/lib/voice-storage.ts import openDB()
 * from here — never call indexedDB.open() directly in any other module.
 * Phase 5 COACH-06 will import FEEDBACK_TRACES_STORE + FeedbackTrace from
 * this file to write the first real feedbackTrace records.
 *
 * v-history of this shared DB:
 *   v1: documents + sections
 *   v2: + settings
 *   v3: + voices
 *   v4: + audioCache (per eng-review decision 1A)
 *   v5: + feedbackTraces (AUTHOR-10 D-17 — for Phase 5 COACH-06)
 */

export const DB_NAME = "masonic-ritual-mentor";
export const DB_VERSION = 5; // D-16 + D-17: bumped from 4 for feedbackTraces

export const DOCUMENTS_STORE = "documents";
export const SECTIONS_STORE = "sections";
export const SETTINGS_STORE = "settings";
export const VOICES_STORE = "voices";
export const AUDIO_CACHE_STORE = "audioCache";
export const FEEDBACK_TRACES_STORE = "feedbackTraces"; // NEW (D-17)

/**
 * PII-free trace of an AI feedback event (AUTHOR-10 D-17).
 * Hashes only — no body content. Follows Phase 2 D-09/D-10 type-system
 * PII-prevention pattern (typed-event-names-for-pii-safe-telemetry skill).
 *
 * Intentionally does NOT include hashedUser — Phase 3 doesn't need it for
 * the trace store, and adding it would let an attacker with IDB access
 * correlate ratings to a hashed identity. Phase 5 eval harness consumes
 * exactly these fields and nothing more.
 */
export interface FeedbackTrace {
  id: string;              // randomUUID per trace (keyPath)
  documentId: string;      // .mram document ID
  sectionId: string;       // ritual section ID
  lineId: string;          // line within section
  variantId: string;       // "mentor-v1" | "roast-v1" | "terse-v1" | "coach-v1"
  promptHash: string;      // sha256
  completionHash: string;  // sha256
  timestamp: number;       // Date.now()
  ratingSignal?: "helpful" | "unhelpful" | null;
}

/**
 * Open the shared IndexedDB. Single consolidated onupgradeneeded creates
 * all 6 stores; safe to be the first caller OR the second caller (D-16
 * kills the lockstep dance from the pre-Phase-3 storage.ts + voice-storage.ts
 * duplicated blocks).
 */
export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // v1-v2: documents + sections + settings
      if (!db.objectStoreNames.contains(DOCUMENTS_STORE)) {
        db.createObjectStore(DOCUMENTS_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(SECTIONS_STORE)) {
        const sectionStore = db.createObjectStore(SECTIONS_STORE, { keyPath: "id" });
        sectionStore.createIndex("documentId", "documentId", { unique: false });
        sectionStore.createIndex("degree", "degree", { unique: false });
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
      }

      // v3: voices store
      if (!db.objectStoreNames.contains(VOICES_STORE)) {
        db.createObjectStore(VOICES_STORE, { keyPath: "id" });
      }

      // v4: audioCache (per eng-review decision 1A — client-side Gemini TTS caching)
      if (!db.objectStoreNames.contains(AUDIO_CACHE_STORE)) {
        const cacheStore = db.createObjectStore(AUDIO_CACHE_STORE, { keyPath: "key" });
        cacheStore.createIndex("createdAt", "createdAt", { unique: false });
      }

      // v5 (AUTHOR-10 D-17): feedbackTraces — PII-free eval/coach log
      if (!db.objectStoreNames.contains(FEEDBACK_TRACES_STORE)) {
        const fbStore = db.createObjectStore(FEEDBACK_TRACES_STORE, { keyPath: "id" });
        fbStore.createIndex("documentId", "documentId", { unique: false });
        fbStore.createIndex("timestamp",  "timestamp",  { unique: false });
        fbStore.createIndex("variantId",  "variantId",  { unique: false });
      }
    };
  });
}
```

Fill in `src/lib/__tests__/idb-schema.test.ts` (replacing the Plan-01 `it.todo` stubs). Use the @vitest-environment jsdom pragma the scaffold already has. Implement:

```typescript
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";

describe("idb-schema dual-open invariant (AUTHOR-10 D-18)", () => {
  beforeEach(async () => {
    await import("fake-indexeddb/auto");
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase("masonic-ritual-mentor");
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onblocked = () => resolve();
    });
  });

  it("DB_VERSION is 5 (bumped from 4 per D-17)", async () => {
    const mod = await import("../idb-schema");
    expect(mod.DB_VERSION).toBe(5);
  });

  it("opens with all 6 stores present, alphabetical", async () => {
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
    expect(db.version).toBe(5);
    db.close();
  });

  it("storage.ts consumer and voice-storage.ts consumer agree on store set", async () => {
    // Open via idb-schema directly (what both consumers will do post-refactor)
    const { openDB } = await import("../idb-schema");
    const dbA = await openDB();
    const namesA = Array.from(dbA.objectStoreNames).sort();
    dbA.close();
    // Second open: no upgrade should fire, same store set.
    const dbB = await openDB();
    const namesB = Array.from(dbB.objectStoreNames).sort();
    expect(namesA).toEqual(namesB);
    dbB.close();
  });

  it("v4-on-disk opens as v5 without data loss; feedbackTraces newly created", async () => {
    // Pre-seed a v4 database by opening with the pre-Phase-3 schema subset
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("masonic-ritual-mentor", 4);
      req.onerror = () => reject(req.error);
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        db.createObjectStore("documents", { keyPath: "id" });
        const sec = db.createObjectStore("sections", { keyPath: "id" });
        sec.createIndex("documentId", "documentId", { unique: false });
        sec.createIndex("degree", "degree", { unique: false });
        db.createObjectStore("settings", { keyPath: "key" });
        db.createObjectStore("voices", { keyPath: "id" });
        const cache = db.createObjectStore("audioCache", { keyPath: "key" });
        cache.createIndex("createdAt", "createdAt", { unique: false });
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("documents", "readwrite");
        tx.objectStore("documents").put({ id: "sample-doc", name: "test" });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });

    // Now open via idb-schema at v5 — upgrade path fires, adds feedbackTraces only
    const { openDB, FEEDBACK_TRACES_STORE } = await import("../idb-schema");
    const db = await openDB();

    // Existing data preserved
    const sample = await new Promise<any>((resolve, reject) => {
      const tx = db.transaction("documents", "readonly");
      const req = tx.objectStore("documents").get("sample-doc");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    expect(sample).toEqual({ id: "sample-doc", name: "test" });

    // feedbackTraces exists and is empty
    expect(db.objectStoreNames.contains(FEEDBACK_TRACES_STORE)).toBe(true);
    const traces = await new Promise<any[]>((resolve, reject) => {
      const tx = db.transaction(FEEDBACK_TRACES_STORE, "readonly");
      const req = tx.objectStore(FEEDBACK_TRACES_STORE).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    expect(traces).toEqual([]);
    db.close();
  });

  it("FeedbackTrace interface is hashes-only (compile-time type check)", async () => {
    const { type FeedbackTrace } = await import("../idb-schema");
    // This is purely a compile-time proof: if PII keys existed in the shape,
    // TypeScript would catch the below as an extra-keys error. We construct
    // an object satisfying the interface exactly and nothing more.
    const trace = {
      id: "11111111-1111-1111-1111-111111111111",
      documentId: "doc-a",
      sectionId: "sec-1",
      lineId: "line-1",
      variantId: "mentor-v1",
      promptHash: "a".repeat(64),
      completionHash: "b".repeat(64),
      timestamp: Date.now(),
      ratingSignal: null,
    } satisfies FeedbackTrace;
    expect(trace.id).toBe("11111111-1111-1111-1111-111111111111");
    // No keys like prompt / completion / email / text / body present.
    const keys = Object.keys(trace).sort();
    expect(keys).not.toContain("prompt");
    expect(keys).not.toContain("completion");
    expect(keys).not.toContain("email");
    expect(keys).not.toContain("text");
    expect(keys).not.toContain("body");
  });
});
```

Commit: `author-10: extract idb-schema.ts as single IndexedDB source of truth + dual-open test`
  </action>
  <verify>
    <automated>npx vitest run --no-coverage src/lib/__tests__/idb-schema.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `src/lib/idb-schema.ts` exists and exports: `DB_NAME`, `DB_VERSION`, `DOCUMENTS_STORE`, `SECTIONS_STORE`, `SETTINGS_STORE`, `VOICES_STORE`, `AUDIO_CACHE_STORE`, `FEEDBACK_TRACES_STORE`, `openDB`, `FeedbackTrace` — verified: `grep -cE "^export" src/lib/idb-schema.ts` returns ≥ 10.
    - `grep 'DB_VERSION = 5' src/lib/idb-schema.ts` returns exactly 1 match.
    - `grep 'FEEDBACK_TRACES_STORE = "feedbackTraces"' src/lib/idb-schema.ts` returns 1 match.
    - The onupgradeneeded block creates all 6 stores — `grep -cE "objectStoreNames.contains\(" src/lib/idb-schema.ts` returns 6.
    - `src/lib/idb-schema.ts` does NOT contain the keys `prompt`, `completion`, `email`, `text`, `body` anywhere in FeedbackTrace: `grep -E "^\s+(prompt|completion|email|text|body):" src/lib/idb-schema.ts` returns 0 matches.
    - `npx vitest run --no-coverage src/lib/__tests__/idb-schema.test.ts` exits 0 with all 5+ tests passing (no `.todo` remaining).
    - `npm run build` exits 0 (TypeScript compile still clean).
  </acceptance_criteria>
  <done>
    `idb-schema.ts` is the single source of truth; DB_VERSION is 5; feedbackTraces store is creatable; FeedbackTrace interface is PII-free; all three D-18 test cases pass (dual-open, consumer parity, v4→v5 migration preservation).
  </done>
</task>

<task type="auto">
  <name>Task 2: Swap storage.ts and voice-storage.ts to import openDB from idb-schema</name>
  <files>
    src/lib/storage.ts,
    src/lib/voice-storage.ts
  </files>
  <read_first>
    src/lib/storage.ts (lines 1-80 — full top of file; delete lines 13-20 + 26-69 per PATTERNS.md §src/lib/storage.ts),
    src/lib/voice-storage.ts (lines 1-90 — full top of file; delete lines 10-13 + 39-81 per PATTERNS.md §src/lib/voice-storage.ts),
    src/lib/idb-schema.ts (output of Task 1 — confirms exact exports to import),
    .planning/phases/03-authoring-throughput/03-PATTERNS.md §src/lib/storage.ts and §src/lib/voice-storage.ts (exact line deletions + imports).
  </read_first>
  <action>
Edit `src/lib/storage.ts`:

1. Locate lines 13-20 (the `const DB_NAME`, `const DB_VERSION = 4`, `const DOCUMENTS_STORE`, `const SECTIONS_STORE`, `const SETTINGS_STORE` block — including the lockstep-comment at lines 14-16). DELETE these 8 lines entirely (including the lockstep comment which is now obsolete per D-16).
2. In the import block at the top of the file, ADD:
   ```typescript
   import {
     openDB,
     DOCUMENTS_STORE,
     SECTIONS_STORE,
     SETTINGS_STORE,
   } from "./idb-schema";
   ```
3. Locate lines 26-69 (the `function openDB(): Promise<IDBDatabase> { ... }` declaration with its inline `onupgradeneeded`). DELETE this entire function (44 lines).
4. Leave every other line in the file untouched — including `getOrCreateKey`, `encrypt`/`decrypt`, `saveDocument`, `listDocuments`, `getSection`, all export shapes.

Edit `src/lib/voice-storage.ts`:

1. Locate lines 10-13 (`const DB_NAME`, `const DB_VERSION = 4`, `const VOICES_STORE`, `export const AUDIO_CACHE_STORE`). DELETE these 4 lines.
2. In the import block at the top (currently empty — the file has no imports before the constants), ADD at the top:
   ```typescript
   import {
     openDB,
     VOICES_STORE,
     AUDIO_CACHE_STORE,
   } from "./idb-schema";

   // Re-export AUDIO_CACHE_STORE so downstream callers that currently
   // import it from voice-storage.ts keep working without a grep-and-replace.
   export { AUDIO_CACHE_STORE };
   ```
3. Locate lines 39-81 (the `function openDB(): Promise<IDBDatabase> { ... }` declaration). DELETE this entire function (43 lines).
4. Leave `LocalVoice`, `AudioCacheEntry`, `getCachedAudio`, `putCachedAudio`, all other exports untouched.

After the edits, run `npx tsc --noEmit` to confirm both files type-check. Run the full test suite to confirm no regression.

**Sanity check before commit:** grep both files for `indexedDB.open(` — MUST return 0 matches in either. Grep for `from "./idb-schema"` — MUST return ≥ 1 match in each.

Commit: `author-10: wire storage.ts + voice-storage.ts to shared idb-schema openDB`
  </action>
  <verify>
    <automated>grep -c "indexedDB.open(" src/lib/storage.ts src/lib/voice-storage.ts | grep -E ":0$" | wc -l | grep -q "^2$" && grep -l 'from "./idb-schema"' src/lib/storage.ts src/lib/voice-storage.ts | wc -l | grep -q "^2$" && npm run build && npx vitest run --no-coverage src/lib/__tests__/</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "indexedDB.open(" src/lib/storage.ts` returns 0 (no inline open).
    - `grep -c "indexedDB.open(" src/lib/voice-storage.ts` returns 0.
    - `grep -c "DB_VERSION" src/lib/storage.ts` returns 0 (constant no longer declared here).
    - `grep -c "DB_VERSION" src/lib/voice-storage.ts` returns 0.
    - `grep 'from "./idb-schema"' src/lib/storage.ts` returns ≥ 1 match.
    - `grep 'from "./idb-schema"' src/lib/voice-storage.ts` returns ≥ 1 match.
    - `grep 'export { AUDIO_CACHE_STORE }' src/lib/voice-storage.ts` returns 1 match (re-export preserved for downstream callers).
    - The obsolete lockstep comment is gone: `grep "MUST stay in lockstep" src/lib/storage.ts src/lib/voice-storage.ts` returns 0 matches.
    - `npm run build` exits 0.
    - `npx vitest run --no-coverage` exits 0 (no regression in existing tests that use storage/voice-storage).
  </acceptance_criteria>
  <done>
    Both files import `openDB` from `./idb-schema` and no longer declare their own `indexedDB.open()`. Every downstream consumer of `AUDIO_CACHE_STORE` via `voice-storage.ts` still compiles (re-export preserved). Full test suite green. The DB_VERSION lockstep dance is eliminated — bumping the version in Phase 5 for COACH-06 is a single-file change in `idb-schema.ts`.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Browser → IndexedDB | client-side storage for ritual text (AES-GCM encrypted at rest) |
| Developer → idb-schema.ts | future schema edits ONLY happen here; no other module opens the DB directly |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-02-01 | Information Disclosure | FeedbackTrace interface accidentally grows to include prompt/completion/email/text/body | mitigate | Interface definition in idb-schema.ts contains ONLY id/documentId/sectionId/lineId/variantId/promptHash/completionHash/timestamp/ratingSignal per D-17; type-level test in idb-schema.test.ts asserts the keys are not present (Test 5 in Task 1); Phase 2's ESLint no-restricted-syntax rule for `emit()` calls is NOT yet extended to IDB writes — Phase 5 COACH-06 adds a similar guard for feedbackTrace writes (follow-up reference). |
| T-03-02-02 | Tampering | schema drift between idb-schema.ts and two consumer modules (storage.ts / voice-storage.ts) re-introduces pre-Phase-3 lockstep bug | mitigate | Two consumer modules import `openDB` directly from idb-schema (no local declaration). The dual-open test case (storage-first vs voice-first) proves equivalence. |
| T-03-02-03 | Denial of Service | v4→v5 upgrade path corrupts existing user data (Amanda + Shannon + 6 other pilot users have live v4 data on their devices) | mitigate | D-17 migration is purely additive — only creates the new feedbackTraces store; does NOT rewrite or delete any existing store. Test case "v4-on-disk opens as v5 without data loss" explicitly seeds a v4 DB, adds a sample document, upgrades to v5, asserts the sample is intact. |
</threat_model>

<verification>
- `npx vitest run --no-coverage src/lib/__tests__/idb-schema.test.ts` — all tests (including v4→v5 preservation) pass.
- `npx vitest run --no-coverage` (full suite) — no regression in any storage/voice-storage consumer tests.
- `npm run build` — TypeScript compile clean.
- `grep -c "indexedDB.open(" src/lib/storage.ts src/lib/voice-storage.ts` — both return 0.
- `grep -l 'from "./idb-schema"' src/lib/storage.ts src/lib/voice-storage.ts` — both files listed.
</verification>

<success_criteria>
- `src/lib/idb-schema.ts` owns `DB_NAME`, `DB_VERSION = 5`, all 6 store-name constants, a consolidated `openDB()`, and the PII-free `FeedbackTrace` interface.
- Both `src/lib/storage.ts` and `src/lib/voice-storage.ts` import `openDB` from `./idb-schema` and have their inline `openDB` declarations removed.
- Dual-open invariant test passes (opening from either consumer produces the same 6 stores).
- v4→v5 migration preserves existing data and newly creates `feedbackTraces`.
- FeedbackTrace interface contains hashes only — no PII keys.
- Phase 5 COACH-06 (the first real writer of feedbackTraces) can `import { FEEDBACK_TRACES_STORE, FeedbackTrace, openDB } from "@/lib/idb-schema"` without any further schema work.
</success_criteria>

<output>
After completion, create `.planning/phases/03-authoring-throughput/03-02-SUMMARY.md` documenting:
- File paths created/modified
- Final object-store list (6 stores) with index keys
- FeedbackTrace interface shape (8 required + 1 optional field)
- Dual-open test result (3 test cases, all passing)
- v4→v5 migration behavior verified
- Commit SHAs for both commits
</output>
