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
    // fake-indexeddb ships types at /auto.d.ts but doesn't expose them via
    // package.json `exports`; the import works at runtime under Vitest. This
    // suppresses the TS7016 in `tsc --noEmit`. Plan 02 may switch to a
    // global setupFile install instead, removing this directive.
    // @ts-expect-error TS7016 — see comment above
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
