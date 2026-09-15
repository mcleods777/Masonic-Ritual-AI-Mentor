/**
 * Single source of truth for the app's IndexedDB schema.
 *
 * Previously `src/lib/storage.ts` and `src/lib/voice-storage.ts` each
 * defined their own `DB_NAME`/`DB_VERSION`/`openDB()` and had to stay in
 * lockstep by convention (a comment, not enforcement) because IndexedDB
 * only fires `onupgradeneeded` once per version bump — whichever module
 * opens the DB first is the one whose `onupgradeneeded` runs, so both
 * modules had to define every store or risk a missing store depending on
 * open order.
 *
 * This module removes that duplication: every store this app uses is
 * created here, guarded by `objectStoreNames.contains(...)` checks so the
 * upgrade is idempotent regardless of which module calls `openDB()` first
 * (the "dual-open invariant").
 *
 * v5 adds the `feedbackTraces` store shell for Phase 5 COACH-06. This
 * bump is purely additive — no store or index is removed or renamed, so
 * upgrading a v4 database preserves all existing data.
 */

export const DB_NAME = "masonic-ritual-mentor";
export const DB_VERSION = 5;

export const DOCUMENTS_STORE = "documents";
export const SECTIONS_STORE = "sections";
export const SETTINGS_STORE = "settings";
export const VOICES_STORE = "voices";
export const AUDIO_CACHE_STORE = "audioCache";
export const FEEDBACK_TRACES_STORE = "feedbackTraces";

/**
 * Shell type for Phase 5 COACH-06. Phase 3 only creates the store and its
 * indexes — no writer exists yet. Deliberately holds only hashes/ids, never
 * prompt/completion body text (see 03-04-PLAN.md threat model T-03-08).
 */
export interface FeedbackTrace {
  id: string;
  documentId: string;
  sectionId: string;
  lineId: string;
  variantId: string;
  promptHash: string;
  completionHash: string;
  timestamp: number;
  ratingSignal?: "helpful" | "unhelpful" | null;
}

export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

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

      // v3: voices store for local Voxtral voice samples
      if (!db.objectStoreNames.contains(VOICES_STORE)) {
        db.createObjectStore(VOICES_STORE, { keyPath: "id" });
      }

      // v4: audioCache for Gemini TTS output, keyed by
      // sha256(text|style|voice) to avoid re-rendering identical lines.
      if (!db.objectStoreNames.contains(AUDIO_CACHE_STORE)) {
        const cacheStore = db.createObjectStore(AUDIO_CACHE_STORE, {
          keyPath: "key",
        });
        cacheStore.createIndex("createdAt", "createdAt", { unique: false });
      }

      // v5: feedbackTraces shell for Phase 5 COACH-06. Store is created
      // now so the schema module owns it end-to-end; the writer/reader
      // lands in Phase 5.
      if (!db.objectStoreNames.contains(FEEDBACK_TRACES_STORE)) {
        const feedbackStore = db.createObjectStore(FEEDBACK_TRACES_STORE, {
          keyPath: "id",
        });
        feedbackStore.createIndex("documentId", "documentId", { unique: false });
        feedbackStore.createIndex("timestamp", "timestamp", { unique: false });
        feedbackStore.createIndex("variantId", "variantId", { unique: false });
      }
    };
  });
}
