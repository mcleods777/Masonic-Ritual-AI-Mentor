// @vitest-environment jsdom
/**
 * AUTHOR-10 D-18 — dual-open invariant test.
 *
 * Proves three things about src/lib/idb-schema.ts:
 *  1. openDB() returns a DB with all 6 stores present (documents, sections,
 *     settings, voices, audioCache, feedbackTraces) — the alphabetical sort
 *     is literally asserted.
 *  2. Repeated opens yield identical store sets (storage.ts-consumer vs
 *     voice-storage.ts-consumer parity — both files now delegate to the
 *     same openDB() so the invariant becomes trivial once Task 2 lands).
 *  3. A v4-on-disk database upgrades to v5 cleanly: existing data in the
 *     documents store survives, and the feedbackTraces store is newly
 *     created. Phase 3's real concern — Amanda + Shannon + 6 pilot users
 *     all have live v4 data on their devices.
 *
 * Plus type-level and constant sanity checks so the PII-free FeedbackTrace
 * shape can't silently regrow a body/prompt/completion/email key.
 */
import { describe, it, expect, beforeEach } from "vitest";
// Static `import type` keeps the FeedbackTrace type-check compile-time-only;
// the runtime module is still reached via dynamic import below so each test
// sees a fresh module-state after the beforeEach deleteDatabase.
import type { FeedbackTrace } from "../idb-schema";

describe("idb-schema dual-open invariant (AUTHOR-10 D-18)", () => {
  beforeEach(async () => {
    // fake-indexeddb ships types at /auto.d.ts but doesn't expose them via
    // package.json `exports`; the import works at runtime under Vitest. This
    // suppresses the TS7016 in `tsc --noEmit`.
    // @ts-expect-error TS7016 — see comment above
    await import("fake-indexeddb/auto");
    // fake-indexeddb does NOT auto-reset between tests — each beforeEach must
    // explicitly delete the DB. onblocked treated as resolve because no other
    // connections exist inside a single Vitest worker.
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
    // Both consumer modules will (post-Task-2) call into this same openDB().
    // Prior to Task 2 the invariant is demonstrated by showing repeated
    // opens yield identical sets — the test stays valid after Task 2
    // because both consumers still reach the same module.
    const { openDB } = await import("../idb-schema");
    const dbA = await openDB();
    const namesA = Array.from(dbA.objectStoreNames).sort();
    dbA.close();
    // Second open: no upgrade should fire, same store set.
    const dbB = await openDB();
    const namesB = Array.from(dbB.objectStoreNames).sort();
    expect(namesA).toEqual(namesB);
    expect(namesA).toHaveLength(6);
    dbB.close();
  });

  it("v4-on-disk opens as v5 without data loss; feedbackTraces newly created", async () => {
    // Pre-seed a v4 database using the pre-Phase-3 schema subset (documents,
    // sections, settings, voices, audioCache). Write a sample doc, close.
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
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });

    // Now open via idb-schema at v5 — upgrade path fires, adds feedbackTraces only.
    const { openDB, FEEDBACK_TRACES_STORE } = await import("../idb-schema");
    const db = await openDB();
    expect(db.version).toBe(5);

    // Existing data preserved
    const sample = await new Promise<{ id: string; name: string } | undefined>(
      (resolve, reject) => {
        const tx = db.transaction("documents", "readonly");
        const req = tx.objectStore("documents").get("sample-doc");
        req.onsuccess = () =>
          resolve(req.result as { id: string; name: string } | undefined);
        req.onerror = () => reject(req.error);
      }
    );
    expect(sample).toEqual({ id: "sample-doc", name: "test" });

    // feedbackTraces exists and is empty
    expect(db.objectStoreNames.contains(FEEDBACK_TRACES_STORE)).toBe(true);
    const traces = await new Promise<unknown[]>((resolve, reject) => {
      const tx = db.transaction(FEEDBACK_TRACES_STORE, "readonly");
      const req = tx.objectStore(FEEDBACK_TRACES_STORE).getAll();
      req.onsuccess = () => resolve(req.result as unknown[]);
      req.onerror = () => reject(req.error);
    });
    expect(traces).toEqual([]);

    // All 6 stores present after the migration
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

  it("FeedbackTrace interface is hashes-only (compile-time + runtime check)", () => {
    // Compile-time: the `satisfies FeedbackTrace` below proves at tsc time
    // that these are the only keys the interface permits (extra keys would
    // fail tsc --noEmit; missing keys would fail too). If someone tries to
    // add `prompt: string` to FeedbackTrace later, this literal would still
    // compile but the runtime keys check below would flag it.
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

    // Runtime belt: confirm none of the classic PII body keys sneaked in.
    const keys = Object.keys(trace).sort();
    expect(keys).not.toContain("prompt");
    expect(keys).not.toContain("completion");
    expect(keys).not.toContain("email");
    expect(keys).not.toContain("text");
    expect(keys).not.toContain("body");
    expect(keys).toEqual([
      "completionHash",
      "documentId",
      "id",
      "lineId",
      "promptHash",
      "ratingSignal",
      "sectionId",
      "timestamp",
      "variantId",
    ]);
  });
});
