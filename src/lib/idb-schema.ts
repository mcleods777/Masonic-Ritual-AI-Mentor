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
        const sectionStore = db.createObjectStore(SECTIONS_STORE, {
          keyPath: "id",
        });
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
        const cacheStore = db.createObjectStore(AUDIO_CACHE_STORE, {
          keyPath: "key",
        });
        cacheStore.createIndex("createdAt", "createdAt", { unique: false });
      }

      // v5 (AUTHOR-10 D-17): feedbackTraces — PII-free eval/coach log
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
