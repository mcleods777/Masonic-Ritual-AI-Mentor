/**
 * Default voice profiles shipped with the app.
 *
 * These are pre-generated Deepgram Aura-2 male voice samples stored as
 * static files in public/voices/. They load automatically on first visit
 * and serve as the default Voxtral ref_audio for each officer role.
 *
 * Users can override any default by recording their own voice on the
 * Voices page. User voices take priority over defaults.
 */

import { listVoices, saveVoice, type LocalVoice } from "./voice-storage";

/** Default voice definitions — all male Aura-2 voices. */
const DEFAULT_VOICES = [
  { name: "Zeus",    file: "/voices/zeus.mp3",    role: "WM", description: "Commanding, deep" },
  { name: "Orion",   file: "/voices/orion.mp3",   role: "SW", description: "Clear, steady" },
  { name: "Arcas",   file: "/voices/arcas.mp3",   role: "JW", description: "Measured" },
  { name: "Orpheus", file: "/voices/orpheus.mp3", role: "SD", description: "Warm" },
  { name: "Apollo",  file: "/voices/apollo.mp3",  role: "JD", description: "Bright, articulate" },
  { name: "Hermes",  file: "/voices/hermes.mp3",  role: "Ch", description: "Smooth, resonant" },
  { name: "Atlas",   file: "/voices/atlas.mp3",   role: "T",  description: "Steady, grounded" },
] as const;

/** Check if default voices are already loaded in IndexedDB. */
async function defaultsLoaded(): Promise<boolean> {
  const voices = await listVoices();
  const names = new Set(voices.map((v) => v.name));
  return DEFAULT_VOICES.some((d) => names.has(d.name));
}

/** Fetch an mp3 file and return it as a base64 string. */
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
}> {
  const existing = await listVoices();
  const existingNames = new Set(existing.map((v) => v.name));

  let loaded = 0;
  let skipped = 0;

  for (const def of DEFAULT_VOICES) {
    if (existingNames.has(def.name)) {
      skipped++;
      continue;
    }

    try {
      const audioBase64 = await fetchAsBase64(def.file);
      const voice: LocalVoice = {
        id: `default-${def.name.toLowerCase()}`,
        name: def.name,
        audioBase64,
        mimeType: "audio/mpeg",
        duration: 5,
        role: def.role,
        createdAt: 0, // epoch = default voice, distinguishes from user-recorded
      };
      await saveVoice(voice);
      loaded++;
    } catch (err) {
      console.warn(`Failed to load default voice ${def.name}:`, err);
    }
  }

  return { loaded, skipped };
}

/** Get the list of default voice names (for UI to mark them). */
export function getDefaultVoiceNames(): string[] {
  return DEFAULT_VOICES.map((d) => d.name);
}
