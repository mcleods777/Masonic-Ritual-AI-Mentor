/**
 * Default voice profiles shipped with the app.
 *
 * Two groups: character voices (rustic/regional) and Deepgram Aura-2 voices
 * (neutral male). All are stored as static files in public/voices/ and load
 * automatically on first visit as Voxtral ref_audio.
 *
 * Defaults ship with NO explicit role assignment — the voice-selection logic
 * in tts-cloud.ts falls back to deterministic round-robin across the voice
 * list, keyed by the role's group index. Character voices are listed first
 * so they become the default picks for the earliest officer slots.
 *
 * Users can override by recording their own voice and assigning a role on
 * the Voices page. User voices take priority over defaults.
 */

import {
  listVoices,
  saveVoice,
  assignVoiceRole,
  type LocalVoice,
} from "./voice-storage";

/** Default voice definitions — character voices first, then Aura-2. */
const DEFAULT_VOICES = [
  { name: "Crazy German",       file: "/voices/crazy-german.wav",       mimeType: "audio/wav",  description: "German accent, theatrical" },
  { name: "Jebidiah",            file: "/voices/jebidiah.wav",           mimeType: "audio/wav",  description: "Rustic, backwoods" },
  { name: "Old Man",             file: "/voices/old-man.wav",            mimeType: "audio/wav",  description: "Weathered, aged" },
  { name: "Scottish Man",        file: "/voices/scottish-man.wav",       mimeType: "audio/wav",  description: "Scottish brogue" },
  { name: "Southern Gentleman",  file: "/voices/southern-gentleman.wav", mimeType: "audio/wav",  description: "Southern drawl, genteel" },
  { name: "Zeus",                file: "/voices/zeus.mp3",               mimeType: "audio/mpeg", description: "Commanding, deep" },
  { name: "Orion",               file: "/voices/orion.mp3",              mimeType: "audio/mpeg", description: "Clear, steady" },
  { name: "Arcas",               file: "/voices/arcas.mp3",              mimeType: "audio/mpeg", description: "Measured" },
  { name: "Orpheus",             file: "/voices/orpheus.mp3",            mimeType: "audio/mpeg", description: "Warm" },
  { name: "Apollo",              file: "/voices/apollo.mp3",             mimeType: "audio/mpeg", description: "Bright, articulate" },
  { name: "Hermes",              file: "/voices/hermes.mp3",             mimeType: "audio/mpeg", description: "Smooth, resonant" },
  { name: "Atlas",               file: "/voices/atlas.mp3",              mimeType: "audio/mpeg", description: "Steady, grounded" },
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
  migrated: number;
}> {
  const existing = await listVoices();
  // Dedupe by id (not name) so a renamed default is not re-created on next visit.
  const existingIds = new Set(existing.map((v) => v.id));

  let loaded = 0;
  let skipped = 0;

  for (const def of DEFAULT_VOICES) {
    if (existingIds.has(defaultVoiceId(def.name))) {
      skipped++;
      continue;
    }

    try {
      const audioBase64 = await fetchAsBase64(def.file);
      const voice: LocalVoice = {
        id: defaultVoiceId(def.name),
        name: def.name,
        audioBase64,
        mimeType: def.mimeType,
        duration: 5,
        // role intentionally omitted — defaults ship unassigned so the
        // round-robin fallback handles role → voice mapping.
        createdAt: 0, // epoch = default voice, distinguishes from user-recorded
      };
      await saveVoice(voice);
      loaded++;
    } catch (err) {
      console.warn(`Failed to load default voice ${def.name}:`, err);
    }
  }

  // Migration: earlier versions shipped defaults with explicit role assignments
  // (WM, SW, JW, ...). Clear those so existing installs also get round-robin.
  // Only touches default voices (createdAt === 0) — user-recorded voices
  // (createdAt > 0) keep whatever role the user assigned.
  let migrated = 0;
  for (const v of existing) {
    if (v.createdAt === 0 && v.role) {
      await assignVoiceRole(v.id, undefined);
      migrated++;
    }
  }

  return { loaded, skipped, migrated };
}

/** Get the list of default voice names (for UI to mark them). */
export function getDefaultVoiceNames(): string[] {
  return DEFAULT_VOICES.map((d) => d.name);
}
