/**
 * Local voice storage for Voxtral TTS voice samples.
 *
 * Stores recorded audio blobs in IndexedDB so they can be sent as
 * ref_audio with each Voxtral TTS request (zero-shot voice cloning).
 * No Mistral paid plan required — the audio never leaves the device
 * until it's sent with a TTS request.
 *
 * The shared openDB() + store-name constants live in src/lib/idb-schema.ts
 * (AUTHOR-10 D-16). AUDIO_CACHE_STORE is re-exported here so downstream
 * callers (e.g. src/lib/tts-cloud.ts) that imported it from this module
 * pre-D-16 keep working without a grep-and-replace.
 */

import {
  openDB,
  VOICES_STORE,
  AUDIO_CACHE_STORE,
} from "./idb-schema";

// Re-export for downstream callers that currently import AUDIO_CACHE_STORE
// from voice-storage. See src/lib/tts-cloud.ts:1036-1040.
export { AUDIO_CACHE_STORE };

export interface LocalVoice {
  id: string;
  name: string;
  /** Base64-encoded audio sample */
  audioBase64: string;
  /** MIME type of the recording */
  mimeType: string;
  /** Duration in seconds */
  duration: number;
  /** Role assignment (optional — e.g. "WM", "SW") */
  role?: string;
  createdAt: number;
  /**
   * Vestigial field from the deprecated default-voices system. Kept to
   * preserve compatibility with previously-exported voice JSON files that
   * still carry a version stamp. Currently ignored by all readers.
   */
  version?: number;
}

// ============================================================
// IndexedDB helpers
// ============================================================
//
// openDB(), VOICES_STORE, AUDIO_CACHE_STORE now live in src/lib/idb-schema.ts
// (imported above). Pre-D-16 this module declared its own openDB() with a
// parallel consolidated upgrade handler — obsolete now that a single shared
// onupgradeneeded creates all 6 stores.

// ============================================================
// Audio cache — exposed for Gemini TTS and any future engines
// that benefit from client-side output caching
// ============================================================

export interface AudioCacheEntry {
  /** sha256(text|style|voice) — content-addressed cache key */
  key: string;
  /** MIME type of the cached audio blob */
  mimeType: string;
  /** Base64-encoded audio bytes (matches LocalVoice storage pattern) */
  audioBase64: string;
  createdAt: number;
}

/** Read a cached audio entry by key. Returns undefined on miss. */
export async function getCachedAudio(
  key: string
): Promise<AudioCacheEntry | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUDIO_CACHE_STORE, "readonly");
    const request = tx.objectStore(AUDIO_CACHE_STORE).get(key);
    request.onsuccess = () =>
      resolve(request.result as AudioCacheEntry | undefined);
    request.onerror = () => reject(request.error);
  });
}

/** Write a cached audio entry. Silent best-effort — quota errors don't throw. */
export async function putCachedAudio(entry: AudioCacheEntry): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(AUDIO_CACHE_STORE, "readwrite");
      tx.objectStore(AUDIO_CACHE_STORE).put(entry);
      tx.oncomplete = () => resolve();
      // Quota-exceeded or any DB error: log and continue. Cache is an
      // optimization, not a requirement — the audio already played.
      tx.onerror = () => {
        console.warn("audioCache write failed:", tx.error);
        resolve();
      };
    });
  } catch (err) {
    console.warn("audioCache open failed:", err);
  }
}

// ============================================================
// CRUD operations
// ============================================================

/** Save a voice recording to IndexedDB. */
export async function saveVoice(voice: LocalVoice): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VOICES_STORE, "readwrite");
    tx.objectStore(VOICES_STORE).put(voice);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** List all saved voice recordings. */
export async function listVoices(): Promise<LocalVoice[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VOICES_STORE, "readonly");
    const request = tx.objectStore(VOICES_STORE).getAll();
    request.onsuccess = () => resolve(request.result as LocalVoice[]);
    request.onerror = () => reject(request.error);
  });
}

/** Get a single voice by ID. */
export async function getVoice(id: string): Promise<LocalVoice | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VOICES_STORE, "readonly");
    const request = tx.objectStore(VOICES_STORE).get(id);
    request.onsuccess = () => resolve(request.result as LocalVoice | undefined);
    request.onerror = () => reject(request.error);
  });
}

/** Delete a voice by ID. */
export async function deleteVoice(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VOICES_STORE, "readwrite");
    tx.objectStore(VOICES_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Update role assignment for a voice. */
export async function assignVoiceRole(
  id: string,
  role: string | undefined
): Promise<void> {
  const voice = await getVoice(id);
  if (!voice) return;
  voice.role = role;
  await saveVoice(voice);
}

/** Rename a voice. Trims input; throws if the trimmed name is empty. */
export async function renameVoice(id: string, newName: string): Promise<void> {
  const trimmed = newName.trim();
  if (!trimmed) throw new Error("Voice name cannot be empty.");
  const voice = await getVoice(id);
  if (!voice) return;
  if (voice.name === trimmed) return;
  voice.name = trimmed;
  await saveVoice(voice);
}

// ============================================================
// Export / Import
// ============================================================

const EXPORT_FORMAT = "masonic-ritual-mentor-voices";
const EXPORT_VERSION = 1;

/** Export all voices as a versioned JSON string. */
export async function exportVoices(): Promise<string> {
  const voices = await listVoices();
  return JSON.stringify(
    {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      voices,
    },
    null,
    2
  );
}

type ValidationResult =
  | { valid: true; voices: LocalVoice[] }
  | { valid: false; error: string };

/** Validate a JSON string as a voice export file. */
export function validateVoiceImport(jsonString: string): ValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    return { valid: false, error: "The selected file is not valid JSON." };
  }

  const data = parsed as Record<string, unknown>;

  if (data.format !== EXPORT_FORMAT) {
    return {
      valid: false,
      error:
        "This is not a voice profiles file. Expected a .json file exported from this app.",
    };
  }

  if (typeof data.version !== "number" || data.version > EXPORT_VERSION) {
    return {
      valid: false,
      error: `This file uses format version ${data.version}, which is not supported. Please update the app.`,
    };
  }

  if (!Array.isArray(data.voices) || data.voices.length === 0) {
    return { valid: false, error: "The file contains no voice profiles." };
  }

  const required = ["name", "audioBase64", "mimeType", "duration", "createdAt"];
  for (let i = 0; i < data.voices.length; i++) {
    const v = data.voices[i] as Record<string, unknown>;
    for (const field of required) {
      if (v[field] === undefined || v[field] === null) {
        return {
          valid: false,
          error: `Voice entry ${i + 1} is missing required field '${field}'.`,
        };
      }
    }
  }

  return { valid: true, voices: data.voices as LocalVoice[] };
}

/** Import voices, skipping duplicates by name+role. Returns counts. */
export async function importVoices(
  voices: LocalVoice[],
  existingVoices: LocalVoice[]
): Promise<{ imported: number; skipped: number }> {
  const existingKeys = new Set(
    existingVoices.map((v) => `${v.name}::${v.role ?? ""}`)
  );

  let imported = 0;
  let skipped = 0;

  for (const voice of voices) {
    const key = `${voice.name}::${voice.role ?? ""}`;
    if (existingKeys.has(key)) {
      skipped++;
      continue;
    }

    const freshId = `voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await saveVoice({ ...voice, id: freshId });
    existingKeys.add(key);
    imported++;
  }

  return { imported, skipped };
}
