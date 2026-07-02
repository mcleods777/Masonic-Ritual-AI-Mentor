import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import {
  DB_NAME,
  openDB,
  DOCUMENTS_STORE,
  SECTIONS_STORE,
  SETTINGS_STORE,
  VOICES_STORE,
  AUDIO_CACHE_STORE,
  FEEDBACK_TRACES_STORE,
} from "../idb-schema";

const ALL_STORES = [
  DOCUMENTS_STORE,
  SECTIONS_STORE,
  SETTINGS_STORE,
  VOICES_STORE,
  AUDIO_CACHE_STORE,
  FEEDBACK_TRACES_STORE,
];

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

/** Hand-rolled v4 schema, replicating current main's storage.ts/voice-storage.ts
 * onupgradeneeded exactly (pre-idb-schema.ts extraction), for the migration test. */
function openLegacyV4Database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 4);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains("documents")) {
        db.createObjectStore("documents", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("sections")) {
        const sectionStore = db.createObjectStore("sections", { keyPath: "id" });
        sectionStore.createIndex("documentId", "documentId", { unique: false });
        sectionStore.createIndex("degree", "degree", { unique: false });
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("voices")) {
        db.createObjectStore("voices", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("audioCache")) {
        const cacheStore = db.createObjectStore("audioCache", { keyPath: "key" });
        cacheStore.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
  });
}

function putRecord(db: IDBDatabase, storeName: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function getRecord<T>(db: IDBDatabase, storeName: string, key: IDBValidKey): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

beforeEach(async () => {
  await deleteDatabase(DB_NAME);
});

describe("idb-schema openDB — dual-open invariant", () => {
  it("yields all 6 stores when opened first via the storage.ts-style path", async () => {
    const db = await openDB();
    for (const store of ALL_STORES) {
      expect(db.objectStoreNames.contains(store)).toBe(true);
    }
    expect(db.objectStoreNames.length).toBe(ALL_STORES.length);
    db.close();
  });

  it("still yields all 6 stores after deleting and re-opening via the voice-storage.ts-style path (open order does not matter)", async () => {
    // Both storage.ts and voice-storage.ts now import the exact same
    // openDB() from idb-schema, so "whichever opens first" collapses to
    // "this function runs its onupgradeneeded exactly once, regardless of
    // caller" — verify that invariant holds across repeated fresh opens.
    await deleteDatabase(DB_NAME);
    const db = await openDB();
    for (const store of ALL_STORES) {
      expect(db.objectStoreNames.contains(store)).toBe(true);
    }
    db.close();
  });
});

describe("idb-schema openDB — v4 to v5 migration preserves existing data", () => {
  it("preserves seeded documents and voices records and adds feedbackTraces on upgrade", async () => {
    // Seed a v4 database with one record in `documents` and one in `voices`.
    const legacyDb = await openLegacyV4Database();
    expect(legacyDb.objectStoreNames.contains("feedbackTraces")).toBe(false);

    await putRecord(legacyDb, "documents", {
      id: "doc-1",
      title: "Test Ritual",
      createdAt: "2026-01-01T00:00:00.000Z",
      sectionCount: 1,
      isMRAM: true,
    });
    await putRecord(legacyDb, "voices", {
      id: "voice-1",
      name: "Test Voice",
      audioBase64: "AAAA",
      mimeType: "audio/webm",
      duration: 3,
      createdAt: 12345,
    });
    legacyDb.close();

    // Upgrade to v5 via idb-schema's openDB().
    const upgradedDb = await openDB();

    for (const store of ALL_STORES) {
      expect(upgradedDb.objectStoreNames.contains(store)).toBe(true);
    }

    const preservedDoc = await getRecord<{ id: string; title: string }>(
      upgradedDb,
      DOCUMENTS_STORE,
      "doc-1"
    );
    expect(preservedDoc).toEqual(
      expect.objectContaining({ id: "doc-1", title: "Test Ritual" })
    );

    const preservedVoice = await getRecord<{ id: string; name: string }>(
      upgradedDb,
      VOICES_STORE,
      "voice-1"
    );
    expect(preservedVoice).toEqual(
      expect.objectContaining({ id: "voice-1", name: "Test Voice" })
    );

    // feedbackTraces exists with its three indexes.
    const tx = upgradedDb.transaction(FEEDBACK_TRACES_STORE, "readonly");
    const feedbackStore = tx.objectStore(FEEDBACK_TRACES_STORE);
    expect(Array.from(feedbackStore.indexNames)).toEqual(
      expect.arrayContaining(["documentId", "timestamp", "variantId"])
    );

    upgradedDb.close();
  });
});
