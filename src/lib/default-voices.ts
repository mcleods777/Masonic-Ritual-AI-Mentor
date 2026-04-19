/**
 * Default voice profiles shipped with the app.
 *
 * Two groups: character voices (rustic/regional) and Deepgram Aura-2 voices
 * (neutral male). All are stored as static files in public/voices/ and load
 * automatically on first visit as Voxtral ref_audio.
 *
 * Defaults ship UNASSIGNED — no role is pre-bound to any voice. They sit
 * in the Voices page as available pool entries. Users can manually assign
 * one to a role via the Voices page, and the unassigned remainder serves
 * as the round-robin pool for the Voxtral fallback when Gemini fails.
 *
 * This is the post-pilot model: Gemini is the default playback engine,
 * Voxtral is a fallback (or per-role override when a Brother records their
 * own clone). The 15 ship voices give Voxtral something to say while the
 * Brother decides what to record.
 */

import {
  listVoices,
  saveVoice,
  type LocalVoice,
} from "./voice-storage";

/**
 * Default voice definitions — character voices first, then Aura-2.
 *
 * `version` is optional. Bump it when the underlying audio file at `/voices/...`
 * is replaced with a better recording: existing installs will re-download and
 * overwrite, preserving any role the user assigned. Omit = version 1.
 */
const DEFAULT_VOICES = [
  { name: "Normal Shannon",        file: "/voices/normal-shannon.wav",       mimeType: "audio/wav",  description: "Shannon, natural delivery",     duration: 10 },
  { name: "Shannon South African", file: "/voices/shannon-south-african.wav", mimeType: "audio/wav",  description: "Shannon, South African accent", duration: 6 },
  { name: "Sith Lord Shannon",     file: "/voices/sith-lord-shannon.wav",    mimeType: "audio/wav",  description: "Shannon, commanding Sith tone", duration: 7 },
  { name: "Crazy German",          file: "/voices/crazy-german.wav",         mimeType: "audio/wav",  description: "German accent, theatrical — short lines only (clone quiets on long lines)" },
  { name: "Jebidiah",              file: "/voices/jebidiah.wav",             mimeType: "audio/wav",  description: "Rustic, backwoods" },
  { name: "Old Man",               file: "/voices/old-man.wav",              mimeType: "audio/wav",  description: "Weathered, aged" },
  { name: "Scottish Man",          file: "/voices/scottish-man.wav",         mimeType: "audio/wav",  description: "Scottish brogue" },
  { name: "Southern Gentleman",    file: "/voices/southern-gentleman.wav",   mimeType: "audio/wav",  description: "Southern drawl, genteel" },
  { name: "Zeus",                  file: "/voices/zeus.mp3",                 mimeType: "audio/mpeg", description: "Commanding, deep" },
  { name: "Orion",                 file: "/voices/orion.mp3",                mimeType: "audio/mpeg", description: "Clear, steady" },
  { name: "Arcas",                 file: "/voices/arcas.mp3",                mimeType: "audio/mpeg", description: "Measured" },
  { name: "Orpheus",               file: "/voices/orpheus.mp3",              mimeType: "audio/mpeg", description: "Warm" },
  { name: "Apollo",                file: "/voices/apollo.mp3",               mimeType: "audio/mpeg", description: "Bright, articulate" },
  { name: "Hermes",                file: "/voices/hermes.mp3",               mimeType: "audio/mpeg", description: "Smooth, resonant" },
  { name: "Atlas",                 file: "/voices/atlas.mp3",                mimeType: "audio/mpeg", description: "Steady, grounded" },
] as const;

/** Stable id for a default voice, by name. */
function defaultVoiceId(name: string): string {
  return `default-${name.toLowerCase()}`;
}

/** Check if default voices are already loaded in IndexedDB. */
async function defaultsLoaded(): Promise<boolean> {
  const voices = await listVoices();
  const ids = new Set(voices.map((v) => v.id));
  return DEFAULT_VOICES.some((d) => ids.has(defaultVoiceId(d.name)));
}

/** Fetch an audio file and return it as a base64 string. */
async function fetchAsBase64(url: string): Promise<string> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  const buffer = await resp.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Load default voices into IndexedDB if not already present.
 * Call this once on app startup (e.g., in the Voices page or layout).
 * Skips voices that already exist by name.
 */
export async function ensureDefaultVoices(): Promise<{
  loaded: number;
  skipped: number;
  refreshed: number;
}> {
  const existing = await listVoices();
  // Index by id so a renamed default is not re-created on next visit, and
  // version comparison can find the stored entry for a given default.
  const existingById = new Map(existing.map((v) => [v.id, v]));

  let loaded = 0;
  let skipped = 0;
  let refreshed = 0;

  for (const def of DEFAULT_VOICES) {
    const id = defaultVoiceId(def.name);
    const stored = existingById.get(id);
    const canonicalVersion = "version" in def ? (def.version as number) : 1;

    if (stored) {
      const storedVersion = stored.version ?? 1;
      if (storedVersion >= canonicalVersion) {
        skipped++;
        continue;
      }
      // Stored version is stale — re-fetch audio and overwrite, preserving
      // the user's role assignment and any rename.
      try {
        const audioBase64 = await fetchAsBase64(def.file);
        const refreshedVoice: LocalVoice = {
          ...stored,
          audioBase64,
          mimeType: def.mimeType,
          duration: "duration" in def ? (def.duration as number) : stored.duration,
          version: canonicalVersion,
        };
        await saveVoice(refreshedVoice);
        refreshed++;
      } catch (err) {
        console.warn(`Failed to refresh default voice ${def.name}:`, err);
      }
      continue;
    }

    try {
      const audioBase64 = await fetchAsBase64(def.file);
      const voice: LocalVoice = {
        id,
        name: def.name,
        audioBase64,
        mimeType: def.mimeType,
        duration: "duration" in def ? (def.duration as number) : 5,
        role: undefined, // ships unassigned; user assigns via Voices page
        createdAt: 0, // epoch = default voice, distinguishes from user-recorded
        version: canonicalVersion,
      };
      await saveVoice(voice);
      loaded++;
    } catch (err) {
      console.warn(`Failed to load default voice ${def.name}:`, err);
    }
  }

  return { loaded, skipped, refreshed };
}

/** Get the list of default voice names (for UI to mark them). */
export function getDefaultVoiceNames(): string[] {
  return DEFAULT_VOICES.map((d) => d.name);
}

/**
 * Clear role assignments on all default voices, back to unassigned. Useful
 * if a user wants to reset their setup without deleting the voices.
 *
 * User-recorded voices (createdAt > 0) are never touched. Returns the count
 * of default voices whose role was cleared.
 */
export async function resetDefaultVoiceRoles(): Promise<{ changed: number }> {
  const existing = await listVoices();
  const byId = new Map(existing.map((v) => [v.id, v]));
  let changed = 0;

  for (const def of DEFAULT_VOICES) {
    const id = defaultVoiceId(def.name);
    const stored = byId.get(id);
    if (!stored) continue;
    if (stored.role === undefined) continue;
    await saveVoice({ ...stored, role: undefined });
    changed++;
  }

  return { changed };
}
