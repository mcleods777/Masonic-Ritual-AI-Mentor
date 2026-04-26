#!/usr/bin/env npx tsx
/**
 * preview-bake.ts — localhost-only ritual-scrubber server (AUTHOR-08).
 *
 * Read-only browser UI for reviewing baked .mram files. Decrypts each
 * ritual on demand (using MRAM_PASSPHRASE) and shows role + dialogue
 * text + audio together, organized per-ritual. Also keeps the
 * /a/{cacheKey}.opus route for backwards-compat hash-based playback.
 *
 * Usage:
 *   MRAM_PASSPHRASE='...' npx tsx scripts/preview-bake.ts
 *   PREVIEW_BAKE_PORT=9999 npx tsx scripts/preview-bake.ts
 *
 * CRITICAL invariants (T-03-01, T-03-02, T-03-03):
 *   1. NODE_ENV=production → process exits at module load (assertDevOnly — T-03-02).
 *   2. Only 127.0.0.1 or ::1 bind allowed (ensureLoopback refuses others — T-03-01).
 *   3. /a/{cacheKey}.opus cacheKey MUST match /^[0-9a-f]{64}$/ before
 *      path.join (regex gate — T-03-03 layer 1), AND the resolved path
 *      MUST start with path.resolve(cacheDir) + path.sep (containment
 *      assertion — T-03-03 layer 2). Two independent gates so a future
 *      regex-relaxation OR a symlink planted inside the cache dir does
 *      NOT re-enable traversal.
 *   4. /api/ritual/{slug} and /api/ritual/{slug}/line/{lineId}.opus —
 *      slug and lineId are validated against strict regexes before any
 *      filesystem access (T-03-03 layer 1 equivalent for the new routes).
 *   5. No Gemini/Google/Groq API key loaded — server is read-only (D-14).
 *
 * Related: src/lib/dev-guard.ts (D-15 single source of truth),
 * src/lib/mram-format.ts (decryptMRAM — the .mram → MRAMDocument boundary).
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { assertDevOnly } from "../src/lib/dev-guard";
import { decryptMRAM, type MRAMDocument } from "../src/lib/mram-format";

// Module-load guard: fail fast in production (T-03-02).
assertDevOnly();

const BIND_HOST = "127.0.0.1";
const BIND_PORT = Number(process.env.PREVIEW_BAKE_PORT ?? "8883");
const BAKE_CACHE_DIR = path.resolve("rituals/_bake-cache");
const RITUALS_DIR = path.resolve("rituals");

/**
 * Refuse anything but loopback (T-03-01). Exported for tests.
 */
export function ensureLoopback(host: string): void {
  if (host !== "127.0.0.1" && host !== "::1") {
    throw new Error(
      `[AUTHOR-08 D-15] refusing to bind to non-loopback host "${host}". ` +
        `Only 127.0.0.1 or ::1 are allowed. Set PREVIEW_BAKE_HOST if you ` +
        `need to override (but be aware: a non-loopback bind exposes ` +
        `unreleased ritual content to the LAN).`,
    );
  }
}

/** T-03-03 layer 1 — regex gate for /a/{cacheKey}.opus. */
export const CACHE_KEY_REGEX = /^[0-9a-f]{64}$/;

/** Slug regex — alphanumeric + hyphens, matches files like ea-opening. */
export const RITUAL_SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Line ID regex — non-negative integer up to 10000 lines per ritual. */
export const LINE_ID_REGEX = /^[0-9]{1,5}$/;

// ============================================================
// In-memory ritual cache (decrypt-on-demand, cache result)
// ============================================================

interface RitualCacheEntry {
  doc: MRAMDocument;
  decryptedAt: number;
  fileSize: number;
}

const ritualCache = new Map<string, RitualCacheEntry>();

/**
 * Decrypt a .mram file and cache the result. Subsequent calls for the
 * same slug return the cached document unless the file mtime/size
 * changed since the cache was populated.
 */
export async function loadRitual(
  slug: string,
  passphrase: string,
): Promise<MRAMDocument> {
  if (!RITUAL_SLUG_REGEX.test(slug)) {
    throw new Error(`Invalid ritual slug: ${slug}`);
  }
  const mramPath = path.join(RITUALS_DIR, `${slug}.mram`);
  if (!fs.existsSync(mramPath)) {
    throw new Error(`Ritual not found: ${slug}.mram`);
  }
  const stat = fs.statSync(mramPath);
  const cached = ritualCache.get(slug);
  if (cached && cached.fileSize === stat.size) {
    return cached.doc;
  }
  const buf = fs.readFileSync(mramPath);
  const doc = await decryptMRAM(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
    passphrase,
  );
  ritualCache.set(slug, { doc, decryptedAt: Date.now(), fileSize: stat.size });
  return doc;
}

/**
 * Read styles.json (per-line style + speakAs overrides) for a ritual.
 * Returns null if the file doesn't exist or can't be parsed — these
 * sidecars are content-authoring artifacts, not required for display.
 *
 * Shape:
 *   { version: 1, styles: [
 *       { lineHash: "<sha256(plain)>", style: "warmly", speakAs?: "..." }
 *   ] }
 */
interface StyleSidecarEntry {
  lineHash: string;
  style: string;
  speakAs?: string;
}
function loadStylesSidecar(slug: string): Map<string, StyleSidecarEntry> {
  const p = path.join(RITUALS_DIR, `${slug}-styles.json`);
  if (!fs.existsSync(p)) return new Map();
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as {
      styles?: StyleSidecarEntry[];
    };
    const out = new Map<string, StyleSidecarEntry>();
    for (const e of raw.styles ?? []) {
      if (e?.lineHash) out.set(e.lineHash, e);
    }
    return out;
  } catch {
    return new Map();
  }
}

/**
 * Read voice-cast.json (per-role voice profile + scene) for a ritual.
 * Returns null on missing/invalid file. Shape varies — both top-level
 * { roles: {...} } and direct { ROLE: {...} } forms are tolerated.
 */
interface VoiceCastSidecar {
  scene?: string;
  roles: Record<string, {
    profile?: string;
    style?: string;
    pacing?: string;
    accent?: string;
    voice?: string;
    [k: string]: unknown;
  }>;
}
function loadVoiceCastSidecar(slug: string): VoiceCastSidecar | null {
  const p = path.join(RITUALS_DIR, `${slug}-voice-cast.json`);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, unknown>;
    const scene = typeof raw.scene === "string" ? raw.scene : undefined;
    const roles = (raw.roles ?? raw.cast ?? {}) as VoiceCastSidecar["roles"];
    if (!roles || typeof roles !== "object") return null;
    return { scene, roles };
  } catch {
    return null;
  }
}

/** sha256 of a string — matches src/lib/styles.ts hashLineText. */
function hashLineText(plain: string): string {
  return crypto.createHash("sha256").update(plain).digest("hex");
}

/**
 * Detect which TTS engine produced an Opus audio blob by inspecting
 * the OpusTags vendor string in the second Ogg page.
 *
 *   "Google Speech using libopus" → Google Cloud TTS (D-09 short-line
 *      route + fallback path for deterministic-empty long lines)
 *   "Lavf" / "Lavf60.16.100" / etc. → ffmpeg encoded the WAV that
 *      Gemini Flash TTS streamed back. The Gemini SSE protocol returns
 *      raw PCM samples, which the bake then runs through ffmpeg's
 *      libopus encoder before caching/embedding.
 *
 * The vendor string lives within the first ~256 bytes of every Opus-
 * in-Ogg file (Ogg page 1: OpusHead, page 2: OpusTags). Reading a
 * fixed-size header avoids the cost of a full music-metadata parse.
 *
 * Returns "google-cloud-tts" | "gemini-flash-tts" | "unknown".
 */
type AudioEngine = "google-cloud-tts" | "gemini-flash-tts" | "unknown";
function detectAudioEngine(opusBytes: Buffer | undefined | null): AudioEngine {
  if (!opusBytes || opusBytes.length < 64) return "unknown";
  // latin1 preserves every byte 1:1 so binary segments don't get UTF-8 mangled
  const head = opusBytes.subarray(0, 256).toString("latin1");
  if (head.includes("Google Speech")) return "google-cloud-tts";
  if (head.includes("Lavf") || head.includes("lavf")) return "gemini-flash-tts";
  return "unknown";
}

/**
 * List all .mram files in rituals/. Returns slugs (sans extension).
 */
export function listRituals(): string[] {
  if (!fs.existsSync(RITUALS_DIR)) return [];
  return fs
    .readdirSync(RITUALS_DIR)
    .filter((f) => f.endsWith(".mram") && !f.includes(".backup-"))
    .map((f) => f.replace(/\.mram$/, ""))
    .filter((slug) => RITUAL_SLUG_REGEX.test(slug))
    .sort();
}

// ============================================================
// /a/{cacheKey}.opus — backwards-compat hash-based playback
// ============================================================

/**
 * Handle GET /a/{cacheKey}.opus — unchanged from prior versions.
 * Three-layer T-03-03 containment: regex gate, path.resolve startsWith,
 * fs.realpathSync containment.
 */
export function handleOpusRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  cacheDir: string,
): void {
  const url = new URL(req.url ?? "/", `http://${BIND_HOST}:${BIND_PORT}`);
  const match = /^\/a\/([^/]+)\.opus$/.exec(url.pathname);
  if (!match) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
    return;
  }
  const cacheKey = match[1]!;
  if (!CACHE_KEY_REGEX.test(cacheKey)) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("bad cache key (must be 64 lowercase hex chars)");
    return;
  }
  const opusPath = path.join(cacheDir, `${cacheKey}.opus`);
  const resolved = path.resolve(opusPath);
  const rootAbs = path.resolve(cacheDir);
  if (!resolved.startsWith(rootAbs + path.sep)) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Bad Request");
    return;
  }
  if (!fs.existsSync(resolved)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
    return;
  }
  let realResolved: string;
  try {
    realResolved = fs.realpathSync(resolved);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
    return;
  }
  const realRoot = fs.existsSync(rootAbs) ? fs.realpathSync(rootAbs) : rootAbs;
  if (
    realResolved !== realRoot &&
    !realResolved.startsWith(realRoot + path.sep)
  ) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Bad Request");
    return;
  }
  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolved);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
    return;
  }
  serveAudioFile(req, res, resolved, stat.size);
}

/**
 * Stream an audio file with proper Range handling. Used by both the
 * /a/{cacheKey}.opus route and the /api/ritual/.../line/N.opus route.
 */
function serveAudioFile(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  resolvedPath: string,
  size: number,
): void {
  const rangeHeader = req.headers.range;
  if (rangeHeader) {
    const rangeMatch = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader);
    if (!rangeMatch) {
      res.writeHead(416, { "Content-Range": `bytes */${size}` });
      res.end();
      return;
    }
    const start = Number(rangeMatch[1]);
    const end = rangeMatch[2] ? Number(rangeMatch[2]) : size - 1;
    if (!Number.isFinite(start) || end >= size || start > end) {
      res.writeHead(416, { "Content-Range": `bytes */${size}` });
      res.end();
      return;
    }
    res.writeHead(206, {
      "Content-Type": "audio/ogg; codecs=opus",
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1,
    });
    const stream = fs.createReadStream(resolvedPath, { start, end });
    stream.on("error", () => { try { res.end(); } catch {} });
    stream.pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Type": "audio/ogg; codecs=opus",
      "Content-Length": size,
      "Accept-Ranges": "bytes",
    });
    const stream = fs.createReadStream(resolvedPath);
    stream.on("error", () => { try { res.end(); } catch {} });
    stream.pipe(res);
  }
}

/**
 * Serve audio bytes from a Buffer (the line.audio embedded in .mram,
 * after base64-decode). Mirror of serveAudioFile but for in-memory data.
 */
function serveAudioBytes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  bytes: Buffer,
): void {
  const size = bytes.length;
  const rangeHeader = req.headers.range;
  if (rangeHeader) {
    const rangeMatch = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader);
    if (!rangeMatch) {
      res.writeHead(416, { "Content-Range": `bytes */${size}` });
      res.end();
      return;
    }
    const start = Number(rangeMatch[1]);
    const end = rangeMatch[2] ? Number(rangeMatch[2]) : size - 1;
    if (!Number.isFinite(start) || end >= size || start > end) {
      res.writeHead(416, { "Content-Range": `bytes */${size}` });
      res.end();
      return;
    }
    res.writeHead(206, {
      "Content-Type": "audio/ogg; codecs=opus",
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1,
    });
    res.end(bytes.subarray(start, end + 1));
  } else {
    res.writeHead(200, {
      "Content-Type": "audio/ogg; codecs=opus",
      "Content-Length": size,
      "Accept-Ranges": "bytes",
    });
    res.end(bytes);
  }
}

// ============================================================
// /api/rituals — list slugs + line counts
// /api/ritual/{slug} — full structured doc (sections + lines + meta)
// /api/ritual/{slug}/line/{id}.opus — single-line audio
// ============================================================

async function handleRitualsList(res: http.ServerResponse): Promise<void> {
  const slugs = listRituals();
  const passphrase = process.env.MRAM_PASSPHRASE;
  const result: Array<{
    slug: string;
    fileSize: number;
    lineCount?: number;
    sectionCount?: number;
    decrypted: boolean;
    error?: string;
  }> = [];
  for (const slug of slugs) {
    const mramPath = path.join(RITUALS_DIR, `${slug}.mram`);
    const stat = fs.statSync(mramPath);
    const entry: typeof result[0] = {
      slug,
      fileSize: stat.size,
      decrypted: false,
    };
    if (passphrase) {
      try {
        const doc = await loadRitual(slug, passphrase);
        entry.lineCount = doc.lines.filter((l) => !l.action).length;
        entry.sectionCount = doc.sections.length;
        entry.decrypted = true;
      } catch (e) {
        entry.error = (e as Error).message.slice(0, 100);
      }
    }
    result.push(entry);
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    rituals: result,
    passphraseSet: Boolean(passphrase),
  }, null, 2));
}

async function handleRitualDetail(
  res: http.ServerResponse,
  slug: string,
): Promise<void> {
  if (!RITUAL_SLUG_REGEX.test(slug)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid slug" }));
    return;
  }
  const passphrase = process.env.MRAM_PASSPHRASE;
  if (!passphrase) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      error: "MRAM_PASSPHRASE env var not set; restart preview-bake with the passphrase.",
    }));
    return;
  }
  try {
    const doc = await loadRitual(slug, passphrase);
    // Read the local styles + voice-cast sidecars (gitignored, plaintext).
    // These are content-authoring artifacts that the bake consumed but
    // doesn't ship inside the .mram. Shannon needs them to scrub WHY
    // each line sounds the way it does.
    const stylesByHash = loadStylesSidecar(slug);
    const voiceCast = loadVoiceCastSidecar(slug);
    // Strip audio bytes from the JSON response — they're large, served
    // separately via /api/ritual/{slug}/line/{id}.opus.
    const engineCounts: Record<string, number> = {};
    const linesLite = doc.lines.map((l) => {
      const sidecar = l.plain
        ? stylesByHash.get(hashLineText(l.plain))
        : undefined;
      // Detect engine by reading first 256 bytes of the embedded Opus —
      // base64-decode just the header prefix, no need to decode the full
      // multi-second audio for this. base64 ratio is 4 chars → 3 bytes,
      // so 384 base64 chars ≈ 288 bytes of binary header.
      let engine: AudioEngine = "unknown";
      if (l.audio) {
        const headerB64 = l.audio.slice(0, 384);
        const headerBytes = Buffer.from(headerB64, "base64");
        engine = detectAudioEngine(headerBytes);
        engineCounts[engine] = (engineCounts[engine] ?? 0) + 1;
      }
      return {
        id: l.id,
        section: l.section,
        role: l.role,
        gavels: l.gavels,
        action: l.action,
        cipher: l.cipher,
        plain: l.plain,
        style: l.style ?? sidecar?.style,
        speakAs: sidecar?.speakAs,
        // What voice was actually pinned in the .mram metadata for this role
        voice: doc.metadata.voiceCast?.[l.role],
        hasAudio: Boolean(l.audio),
        audioBytes: l.audio ? Math.floor((l.audio.length * 3) / 4) : 0,
        engine,
      };
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      slug,
      metadata: doc.metadata,
      sections: doc.sections,
      lines: linesLite,
      // Per-engine line counts so the UI can show a roll-up at the top
      engineCounts,
      // Sidecar data — content-authoring context that's not in the .mram
      voiceCast: voiceCast?.roles ?? {},
      scene: voiceCast?.scene,
    }, null, 2));
  } catch (e) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: (e as Error).message.slice(0, 200) }));
  }
}

async function handleRitualLineAudio(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  slug: string,
  lineIdStr: string,
): Promise<void> {
  if (!RITUAL_SLUG_REGEX.test(slug)) {
    res.writeHead(400);
    res.end("Invalid slug");
    return;
  }
  if (!LINE_ID_REGEX.test(lineIdStr)) {
    res.writeHead(400);
    res.end("Invalid line id");
    return;
  }
  const lineId = Number(lineIdStr);
  const passphrase = process.env.MRAM_PASSPHRASE;
  if (!passphrase) {
    res.writeHead(400);
    res.end("MRAM_PASSPHRASE env var not set");
    return;
  }
  try {
    const doc = await loadRitual(slug, passphrase);
    const line = doc.lines.find((l) => l.id === lineId);
    if (!line || !line.audio) {
      res.writeHead(404);
      res.end("Line has no audio");
      return;
    }
    const bytes = Buffer.from(line.audio, "base64");
    serveAudioBytes(req, res, bytes);
  } catch (e) {
    res.writeHead(500);
    res.end("Decrypt failed");
  }
}

// ============================================================
// Browser UI — rebuilt with per-ritual structure + dialogue text
// ============================================================

export function handleIndexRequest(res: http.ServerResponse): void {
  const html = `<!doctype html>
<html lang="en" class="dark">
<head>
<meta charset="utf-8">
<title>Bake Preview — Masonic Ritual AI Mentor</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700&family=Lato:wght@400;700&display=swap">
<style>
  :root {
    /* Match src/app/globals.css — Hermetic/Pythagorean theme */
    --background: #0b0f19;
    --foreground: #f4f4f5;
    /* Zinc neutrals (Tailwind's) */
    --zinc-950: #09090b;
    --zinc-900: #18181b;
    --zinc-850: #1f1f24;
    --zinc-800: #27272a;
    --zinc-700: #3f3f46;
    --zinc-600: #52525b;
    --zinc-500: #71717a;
    --zinc-400: #a1a1aa;
    --zinc-300: #d4d4d8;
    --zinc-200: #e4e4e7;
    --zinc-100: #f4f4f5;
    /* Masonic Gold (amber) accents */
    --amber-300: #fcd34d;
    --amber-400: #fbbf24;
    --amber-500: #f59e0b;
    --amber-600: #d97706;
    /* Status */
    --error: #f87171;
    --good: #4ade80;
  }
  * { box-sizing: border-box; }
  body {
    font: 15px/1.5 'Lato', system-ui, -apple-system, sans-serif;
    margin: 0; padding: 0;
    background: var(--background); color: var(--foreground);
    -webkit-font-smoothing: antialiased;
  }
  /* Cinzel for all headings — Masonic feel matching the rest of the app */
  h1, h2, h3, h4, h5, h6 {
    font-family: 'Cinzel', Georgia, serif;
  }
  /* Custom scrollbar matching app's theme */
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: #334155; }
  header {
    position: sticky; top: 0; z-index: 10;
    background: var(--zinc-950);
    border-bottom: 1px solid var(--zinc-800);
    padding: 1em 1.5em;
  }
  header .header-inner {
    max-width: 64rem; margin: 0 auto;
  }
  header h1 {
    margin: 0 0 0.25em 0;
    font-family: 'Cinzel', Georgia, serif;
    font-size: 1.35em; font-weight: 600;
    color: var(--amber-500); letter-spacing: 0.02em;
  }
  header .meta { color: var(--zinc-500); font-size: 0.85em; font-family: 'Lato', sans-serif; }
  header .err { color: var(--error); font-weight: 500; }
  .ritual-tabs {
    display: flex; flex-wrap: wrap; gap: 0.4em;
    margin-top: 0.75em;
  }
  .ritual-tabs button {
    background: transparent;
    border: 1px solid var(--zinc-800);
    color: var(--zinc-500);
    padding: 0.45em 1em; font-size: 0.85em;
    border-radius: 8px; cursor: pointer;
    font-family: 'Lato', sans-serif; font-weight: 500;
    transition: color 120ms, background 120ms, border-color 120ms;
  }
  .ritual-tabs button:hover {
    background: rgba(63, 63, 70, 0.5);
    color: var(--zinc-300);
    border-color: var(--zinc-700);
  }
  .ritual-tabs button.active {
    background: rgba(245, 158, 11, 0.1);
    color: var(--amber-400);
    border-color: rgba(245, 158, 11, 0.3);
  }
  .ritual-tabs button.disabled {
    opacity: 0.35; cursor: not-allowed;
  }
  main {
    padding: 2em 2em 4em;
    max-width: 64rem; margin: 0 auto;
  }
  .empty {
    color: var(--zinc-500); padding: 2.5em; text-align: center;
    background: var(--zinc-900);
    border: 1px solid var(--zinc-800); border-radius: 12px;
  }
  section.ritual-section {
    margin: 1.5em 0;
    background: var(--zinc-900);
    border: 1px solid var(--zinc-800);
    border-radius: 12px;
    overflow: hidden;
    transition: border-color 200ms;
  }
  section.ritual-section:hover {
    border-color: rgba(245, 158, 11, 0.2);
  }
  section.ritual-section h2 {
    margin: 0; padding: 1em 1.25em;
    font-family: 'Cinzel', Georgia, serif;
    font-size: 1em;
    color: var(--amber-400); font-weight: 600;
    letter-spacing: 0.06em;
    background: var(--zinc-950);
    border-bottom: 1px solid var(--zinc-800);
  }
  .line {
    display: grid;
    grid-template-columns: 48px 80px minmax(0, 1fr);
    gap: 1em; align-items: start;
    padding: 1em 1.25em;
    border-bottom: 1px solid var(--zinc-800);
    transition: background 100ms;
  }
  .line:last-child { border-bottom: none; }
  .line:hover { background: rgba(63, 63, 70, 0.3); }
  .line.no-audio { opacity: 0.55; }
  .line .id {
    color: var(--zinc-500); font-family: ui-monospace, monospace;
    font-size: 0.85em; text-align: right;
    padding-top: 0.15em;
  }
  .line .role {
    font-family: ui-monospace, monospace; font-size: 0.85em;
    color: var(--amber-400); font-weight: 600;
    padding-top: 0.15em;
  }
  .line .body {
    display: flex; flex-direction: column;
    gap: 0.5em; min-width: 0;
  }
  .line .text {
    font: 15px/1.6 'Lato', sans-serif; color: var(--zinc-200);
  }
  .line .text .gavels {
    color: var(--amber-500); font-weight: bold; margin-right: 0.4em;
  }
  .line.action .text {
    font-style: italic; color: var(--zinc-500);
    font-family: 'Lato', sans-serif;
  }
  /* Native browser audio controls. Subtle dark bg helps anchor them
     visually within the row while keeping the player legible. */
  .line audio {
    width: 100%; max-width: 720px; height: 38px;
    display: block;
    border-radius: 6px;
    background: rgba(9, 9, 11, 0.6);
  }
  .line .meta-row {
    color: var(--zinc-500); font-size: 0.78em;
    font-family: ui-monospace, monospace;
    display: inline-flex; flex-wrap: wrap; gap: 0.5em;
    align-items: center;
  }
  .line .no-audio-note {
    color: var(--zinc-600); font-style: italic; font-size: 0.85em;
  }
  /* Engine badge — small pill showing which TTS rendered each line */
  .engine-badge {
    display: inline-block; padding: 0.15em 0.65em;
    border-radius: 10px; font-size: 0.72em;
    font-weight: 600; font-family: ui-monospace, monospace;
    text-transform: lowercase;
    border: 1px solid transparent;
    letter-spacing: 0.02em;
  }
  /* Gemini = amber gold (matches app accent) */
  .engine-gemini-flash-tts {
    background: rgba(245, 158, 11, 0.12);
    color: var(--amber-300);
    border-color: rgba(245, 158, 11, 0.3);
  }
  /* Google = teal (separate enough to spot, not competing with gold) */
  .engine-google-cloud-tts {
    background: rgba(45, 212, 191, 0.12);
    color: #5eead4;
    border-color: rgba(45, 212, 191, 0.3);
  }
  .engine-unknown {
    background: rgba(113, 113, 122, 0.15);
    color: var(--zinc-400); border-color: rgba(113, 113, 122, 0.3);
  }
  .line.line-google-cloud-tts {
    border-left: 3px solid rgba(45, 212, 191, 0.4);
    padding-left: calc(1.25em - 3px);
  }

  /* Engine filter row — same card style as ritual-context */
  .controls.engine-filters {
    margin: 0.4em 0 1em;
    align-items: center;
    padding: 0.7em 1em;
    background: var(--zinc-900);
    border: 1px solid var(--zinc-800);
    border-radius: 12px;
  }
  .controls.engine-filters .filter-label {
    color: var(--zinc-500); font-size: 0.82em;
    font-family: ui-monospace, monospace;
    text-transform: uppercase; letter-spacing: 0.05em;
  }
  .engine-filter {
    display: inline-flex; align-items: center; gap: 0.4em;
    cursor: pointer; user-select: none;
  }
  .engine-filter input[type="checkbox"] {
    margin: 0; cursor: pointer;
    accent-color: var(--amber-500);
  }
  .engine-filter:hover .engine-badge { filter: brightness(1.15); }
  .filter-shortcut {
    background: transparent; border: 1px solid var(--zinc-800);
    color: var(--zinc-400); padding: 0.3em 0.85em;
    border-radius: 6px; cursor: pointer;
    font-family: 'Lato', sans-serif;
    font-size: 0.8em; font-weight: 500;
    transition: all 120ms;
  }
  .filter-shortcut:hover {
    background: rgba(245, 158, 11, 0.08);
    color: var(--amber-400);
    border-color: rgba(245, 158, 11, 0.3);
  }
  .ritual-meta {
    color: var(--zinc-500); font-size: 0.875em;
    padding: 0.5em 0 1em;
  }
  .controls {
    margin-bottom: 1em; display: flex; gap: 1.25em;
    flex-wrap: wrap; align-items: center;
  }
  .controls label {
    font-size: 0.85em; color: var(--zinc-400);
    cursor: pointer; user-select: none;
  }
  .controls label:hover { color: var(--zinc-200); }
  .controls input[type="checkbox"] {
    vertical-align: middle; margin-right: 0.3em;
    accent-color: var(--amber-500);
  }
  a { color: var(--amber-400); text-decoration: none; }
  a:hover { color: var(--amber-300); text-decoration: underline; }

  /* Scene + voice-cast roster panels — match app card style */
  .ritual-context {
    background: var(--zinc-900);
    border: 1px solid var(--zinc-800);
    border-radius: 12px; padding: 0.9em 1.25em;
    margin: 1em 0;
    transition: border-color 200ms;
  }
  .ritual-context:hover {
    border-color: rgba(245, 158, 11, 0.25);
  }
  .ritual-context summary {
    cursor: pointer;
    font-family: 'Cinzel', Georgia, serif;
    font-size: 0.95em; font-weight: 500;
    color: var(--zinc-300); user-select: none;
    letter-spacing: 0.02em;
  }
  .ritual-context summary::marker { color: var(--amber-500); }
  .ritual-context[open] summary {
    margin-bottom: 0.75em; color: var(--amber-400);
    padding-bottom: 0.6em; border-bottom: 1px solid var(--zinc-800);
  }
  .scene-text {
    font: 14px/1.65 Georgia, serif; color: var(--zinc-300);
    margin: 0.4em 0 0.4em; padding: 0 0.2em;
  }
  .role-table {
    width: 100%; border-collapse: collapse;
    font-size: 0.85em; font-family: 'Lato', sans-serif;
  }
  .role-table th, .role-table td {
    text-align: left; padding: 0.5em 0.6em;
    border-bottom: 1px solid var(--zinc-800); vertical-align: top;
  }
  .role-table tr:last-child th, .role-table tr:last-child td {
    border-bottom: none;
  }
  .role-table th { color: var(--zinc-500); font-weight: 500; font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.05em; }
  .role-table td.role { color: var(--amber-400); font-family: ui-monospace, monospace; font-weight: 600; }
  .role-table td.voice { font-family: ui-monospace, monospace; color: var(--zinc-200); }
  .role-table td.profile { color: var(--zinc-400); font-style: italic; }

  /* Per-line details disclosure — sits inside .body's flex column,
     so it just needs to be a normal block element. NO grid-column. */
  .line-details {
    margin-top: 0.2em;
  }
  .line-details summary {
    cursor: pointer; font-size: 0.78em;
    color: var(--zinc-500); user-select: none;
    padding: 0.2em 0;
    list-style: none;
    font-family: 'Lato', sans-serif;
  }
  .line-details summary::before {
    content: "▸"; display: inline-block; width: 1em;
    transition: transform 150ms;
    color: var(--zinc-500);
  }
  .line-details[open] summary::before {
    transform: rotate(90deg);
    color: var(--amber-500);
  }
  .line-details summary:hover { color: var(--amber-400); }
  .line-details[open] summary { color: var(--amber-400); }
  .line-details-body {
    padding: 0.7em 0.9em; margin-top: 0.4em;
    background: var(--zinc-950);
    border-left: 2px solid var(--amber-500);
    font-size: 0.85em; border-radius: 0 6px 6px 0;
  }
  .line-details-body dt {
    color: var(--zinc-500); font-family: ui-monospace, monospace;
    font-size: 0.82em; margin-top: 0.6em;
    text-transform: uppercase; letter-spacing: 0.05em;
  }
  .line-details-body dt:first-child { margin-top: 0; }
  .line-details-body dd {
    margin: 0.2em 0 0; color: var(--zinc-200);
    word-break: break-word;
  }
  .line-details-body dd.speakAs {
    font-family: ui-monospace, monospace; font-size: 0.85em;
    background: var(--zinc-900); padding: 0.5em 0.7em;
    border-radius: 4px; line-height: 1.5;
    white-space: pre-wrap;
    border: 1px solid var(--zinc-800);
  }
  .line-details-body dd.cipher {
    font-family: Georgia, serif;
    color: var(--zinc-400);
  }
  .line-details-body dd.profile {
    font-style: italic; color: var(--zinc-400);
  }
</style>
</head>
<body>
<header>
  <div class="header-inner">
    <h1>Bake Preview <span style="color: var(--zinc-500); font-weight: 400; font-family: 'Lato', sans-serif; font-size: 0.65em; letter-spacing: 0; margin-left: 0.5em;">rituals/</span></h1>
    <div class="meta" id="header-meta">Loading…</div>
    <div class="ritual-tabs" id="tabs"></div>
  </div>
</header>
<main>
  <div id="content" class="empty">Select a ritual above.</div>
</main>
<script>
  const state = {
    rituals: [],
    activeSlug: null,
    activeDoc: null,
    showCipher: false,
    // Set of engine keys currently visible. null means "all visible"
    // (e.g. before any filter has been touched, or after Reset).
    engineFilter: null,
  };

  async function init() {
    try {
      const res = await fetch("/api/rituals");
      const data = await res.json();
      state.rituals = data.rituals;
      const meta = document.getElementById("header-meta");
      if (!data.passphraseSet) {
        meta.innerHTML = '<span class="err">MRAM_PASSPHRASE not set — restart with the env var to view ritual structure.</span>';
      } else if (state.rituals.length === 0) {
        meta.textContent = "No .mram files in rituals/. Run bake-all to create them.";
      } else {
        const total = state.rituals.reduce((n, r) => n + (r.lineCount || 0), 0);
        meta.textContent = state.rituals.length + " ritual(s), " + total + " spoken line(s) total.";
      }
      renderTabs();
      // Auto-select first ritual that decrypted successfully
      const first = state.rituals.find(r => r.decrypted);
      if (first) selectRitual(first.slug);
    } catch (e) {
      document.getElementById("header-meta").innerHTML = '<span class="err">Error: ' + e.message + '</span>';
    }
  }

  function renderTabs() {
    const tabs = document.getElementById("tabs");
    tabs.innerHTML = state.rituals.map(r => {
      const cls = (r.slug === state.activeSlug ? "active" : "") + (r.decrypted ? "" : " disabled");
      const title = r.error ? "title=\\"" + r.error.replace(/"/g, '&quot;') + "\\"" : "";
      const lineInfo = r.decrypted ? r.lineCount + " lines" : (r.error ? "decrypt failed" : "—");
      return '<button class="' + cls + '" data-slug="' + r.slug + '" ' + title + '>' +
        r.slug + ' <span style="opacity:0.6">(' + lineInfo + ')</span></button>';
    }).join("");
    tabs.querySelectorAll("button").forEach(btn => {
      btn.addEventListener("click", () => {
        if (btn.classList.contains("disabled")) return;
        selectRitual(btn.dataset.slug);
      });
    });
  }

  async function selectRitual(slug) {
    state.activeSlug = slug;
    renderTabs();
    document.getElementById("content").innerHTML = '<div class="empty">Decrypting ' + slug + '…</div>';
    try {
      const res = await fetch("/api/ritual/" + encodeURIComponent(slug));
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || res.statusText);
      }
      state.activeDoc = await res.json();
      renderRitual();
    } catch (e) {
      document.getElementById("content").innerHTML = '<div class="empty err">Error: ' + e.message + '</div>';
    }
  }

  function renderRitual() {
    const doc = state.activeDoc;
    if (!doc) return;
    const linesBySection = new Map();
    for (const l of doc.lines) {
      if (!linesBySection.has(l.section)) linesBySection.set(l.section, []);
      linesBySection.get(l.section).push(l);
    }
    const sectionOrder = doc.sections.map(s => s.id);
    // Append any section IDs found in lines that aren't in the sections array
    for (const id of linesBySection.keys()) {
      if (!sectionOrder.includes(id)) sectionOrder.push(id);
    }
    const totalLines = doc.lines.length;
    const linesWithAudio = doc.lines.filter(l => l.hasAudio).length;
    const audioMb = (doc.lines.reduce((n, l) => n + (l.audioBytes || 0), 0) / (1024*1024)).toFixed(2);
    // Engine breakdown — friendly labels
    const engineLabels = {
      "gemini-flash-tts": "Gemini Flash",
      "google-cloud-tts": "Google Cloud",
      "unknown": "unknown",
    };
    const engineParts = Object.entries(doc.engineCounts || {})
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => '<span class="engine-badge engine-' + k + '">' + (engineLabels[k] || k) + ' ' + n + '</span>')
      .join(' ');
    let html = '<div class="ritual-meta">' +
      totalLines + ' total nodes, ' + linesWithAudio + ' with audio (' + audioMb + ' MB) · ' +
      'jurisdiction: ' + (doc.metadata.jurisdiction || '—') + ' · ' +
      'degree: ' + (doc.metadata.degree || '—') +
      (engineParts ? '<div style="margin-top: 0.5em;">' + engineParts + '</div>' : '') +
      '</div>';

    // Scene panel — context for how the bake interpreted the whole ritual
    if (doc.scene) {
      html += '<details class="ritual-context">' +
        '<summary>Scene description (sent to Gemini as voice-cast preamble context)</summary>' +
        '<div class="scene-text">' + escapeHtml(doc.scene) + '</div>' +
        '</details>';
    }

    // Voice cast roster — what voice was assigned to each role + the
    // local sidecar's profile/style/pacing/accent prose
    const castEntries = Object.keys(doc.voiceCast || {}).sort();
    if (castEntries.length > 0 || (doc.metadata.voiceCast && Object.keys(doc.metadata.voiceCast).length > 0)) {
      const allRoles = new Set([...castEntries, ...Object.keys(doc.metadata.voiceCast || {})]);
      const sortedRoles = Array.from(allRoles).sort();
      html += '<details class="ritual-context"' + (castEntries.length === 0 ? ' open' : '') + '>' +
        '<summary>Voice cast (' + sortedRoles.length + ' role' + (sortedRoles.length === 1 ? '' : 's') + ')</summary>' +
        '<table class="role-table"><thead><tr>' +
        '<th>Role</th><th>Voice</th><th>Profile</th><th>Style / pacing / accent</th>' +
        '</tr></thead><tbody>';
      for (const role of sortedRoles) {
        const voice = (doc.metadata.voiceCast || {})[role] || '—';
        const sidecar = (doc.voiceCast || {})[role] || {};
        const profile = sidecar.profile || '';
        const styleLine = [sidecar.style, sidecar.pacing, sidecar.accent]
          .filter(Boolean).join(' · ');
        html += '<tr>' +
          '<td class="role">' + escapeHtml(role) + '</td>' +
          '<td class="voice">' + escapeHtml(voice) + '</td>' +
          '<td class="profile">' + escapeHtml(profile) + '</td>' +
          '<td class="profile">' + escapeHtml(styleLine) + '</td>' +
          '</tr>';
      }
      html += '</tbody></table></details>';
    }

    // Build per-engine filter group with live counts.
    // engineFilter null = show all; otherwise it's a Set of engine keys
    // currently visible. Reset state when switching rituals so a filter
    // applied to ea-closing doesn't bleed into ea-opening.
    const engineKeys = Object.keys(doc.engineCounts || {}).sort();
    if (!state.engineFilter) {
      state.engineFilter = new Set(engineKeys);
    } else {
      // Add any engines that exist in this ritual but weren't in the
      // previous filter Set. New rituals' engines default to visible.
      for (const k of engineKeys) {
        if (!state.engineFilter.has(k)) state.engineFilter.add(k);
      }
    }
    const filterPills = engineKeys.map(k => {
      const checked = state.engineFilter.has(k) ? ' checked' : '';
      const label = engineLabels[k] || k;
      const count = doc.engineCounts[k];
      return '<label class="engine-filter">' +
        '<input type="checkbox" data-engine="' + k + '"' + checked + '> ' +
        '<span class="engine-badge engine-' + k + '">' + label + ' ' + count + '</span>' +
        '</label>';
    }).join('');

    html += '<div class="controls">' +
      '<label><input type="checkbox" id="show-cipher"' + (state.showCipher ? ' checked' : '') + '> Show cipher text</label>' +
      '<label><input type="checkbox" id="hide-action"> Hide stage actions</label>' +
      '<label><input type="checkbox" id="expand-all-details"> Expand all line details</label>' +
      '</div>';
    if (filterPills) {
      html += '<div class="controls engine-filters">' +
        '<span class="filter-label">Engine:</span>' + filterPills +
        '<button type="button" id="filter-only-google" class="filter-shortcut">Only Google</button>' +
        '<button type="button" id="filter-only-gemini" class="filter-shortcut">Only Gemini</button>' +
        '<button type="button" id="filter-reset" class="filter-shortcut">Show all</button>' +
        '</div>';
    }
    for (const sid of sectionOrder) {
      const lines = linesBySection.get(sid) || [];
      if (lines.length === 0) continue;
      const section = doc.sections.find(s => s.id === sid);
      const title = section?.title || sid;
      html += '<section class="ritual-section">';
      html += '<h2>' + escapeHtml(title) + '</h2>';
      for (const l of lines) {
        html += renderLine(l, doc.slug, doc.voiceCast || {});
      }
      html += '</section>';
    }
    document.getElementById("content").innerHTML = html;
    document.getElementById("show-cipher").addEventListener("change", e => {
      state.showCipher = e.target.checked;
      renderRitual();
    });
    document.getElementById("hide-action").addEventListener("change", e => {
      const hide = e.target.checked;
      document.querySelectorAll(".line.action").forEach(el => {
        el.style.display = hide ? "none" : "grid";
      });
    });
    document.getElementById("expand-all-details").addEventListener("change", e => {
      const open = e.target.checked;
      document.querySelectorAll(".line-details").forEach(el => {
        el.open = open;
      });
    });
    function applyEngineFilter() {
      // Each line has a "line-{engine}" class. Hide if its engine isn't
      // in the current filter set. Lines without engine class (stage
      // actions, no-audio rows) stay visible — the engine filter is a
      // sound-source filter, not a content-type filter.
      const visible = state.engineFilter;
      document.querySelectorAll(".line").forEach(el => {
        let lineEngine = null;
        for (const cls of el.classList) {
          if (cls.startsWith("line-") && cls !== "line-action" && cls !== "line-no-audio") {
            lineEngine = cls.slice(5);
            break;
          }
        }
        // Stage-action / no-audio rows have no engine class — never hide via this filter
        if (!lineEngine) {
          el.style.display = "grid";
          return;
        }
        el.style.display = visible.has(lineEngine) ? "grid" : "none";
      });
    }

    // Per-engine checkbox toggles
    document.querySelectorAll(".engine-filters input[data-engine]").forEach(cb => {
      cb.addEventListener("change", e => {
        const eng = e.target.dataset.engine;
        if (e.target.checked) state.engineFilter.add(eng);
        else state.engineFilter.delete(eng);
        applyEngineFilter();
      });
    });
    // Quick-action shortcuts: Only Google / Only Gemini / Show all
    const setFilter = (engines) => {
      state.engineFilter = new Set(engines);
      // Sync the checkboxes
      document.querySelectorAll(".engine-filters input[data-engine]").forEach(cb => {
        cb.checked = state.engineFilter.has(cb.dataset.engine);
      });
      applyEngineFilter();
    };
    const onlyGoogleBtn = document.getElementById("filter-only-google");
    if (onlyGoogleBtn) onlyGoogleBtn.addEventListener("click", () => setFilter(["google-cloud-tts"]));
    const onlyGeminiBtn = document.getElementById("filter-only-gemini");
    if (onlyGeminiBtn) onlyGeminiBtn.addEventListener("click", () => setFilter(["gemini-flash-tts"]));
    const resetBtn = document.getElementById("filter-reset");
    if (resetBtn) resetBtn.addEventListener("click", () => setFilter(Object.keys(doc.engineCounts || {})));
  }

  function renderLine(l, slug, voiceCastByRole) {
    const isAction = Boolean(l.action);
    const engineCls = l.engine ? " line-" + l.engine : "";
    const cls = "line" + (isAction ? " action" : "") + (l.hasAudio ? "" : " no-audio") + engineCls;
    const text = isAction ? l.action : (state.showCipher ? l.cipher : l.plain);
    const gavels = l.gavels > 0 ? '<span class="gavels">' + '*'.repeat(l.gavels) + '</span>' : '';
    const audio = l.hasAudio
      ? '<audio controls preload="none" src="/api/ritual/' + encodeURIComponent(slug) + '/line/' + l.id + '.opus"></audio>'
      : (isAction ? '<span class="no-audio-note">(stage action)</span>' : '<span class="no-audio-note">(no audio baked)</span>');
    const engineLabels = {
      "gemini-flash-tts": "Gemini Flash",
      "google-cloud-tts": "Google Cloud",
      "unknown": "unknown engine",
    };
    const engineBadge = l.hasAudio && l.engine
      ? '<span class="engine-badge engine-' + l.engine + '">' + (engineLabels[l.engine] || l.engine) + '</span>'
      : '';
    const metaParts = [];
    if (engineBadge) metaParts.push(engineBadge);
    if (l.style) metaParts.push('style: ' + escapeHtml(l.style));
    if (l.audioBytes) metaParts.push(Math.round(l.audioBytes / 1024) + ' KB');
    if (l.speakAs) metaParts.push('speakAs override');
    const meta = metaParts.length > 0 ? '<span class="meta-row">' + metaParts.join(' · ') + '</span>' : '';

    // Build the expandable details panel — only for spoken lines that
    // have something interesting beyond the basic display row
    let details = '';
    if (!isAction && (l.speakAs || l.cipher || l.voice || voiceCastByRole[l.role])) {
      const dl = [];
      if (l.engine && l.engine !== "unknown") {
        const eLabel = engineLabels[l.engine] || l.engine;
        const note = l.engine === "google-cloud-tts"
          ? " (D-09 short-line route or fallback for deterministic-empty Gemini)"
          : " (Gemini SSE stream → ffmpeg-encoded Opus)";
        dl.push('<dt>Render engine</dt><dd>' + escapeHtml(eLabel) + escapeHtml(note) + '</dd>');
      }
      if (l.voice) dl.push('<dt>Voice (assigned to role)</dt><dd>' + escapeHtml(l.voice) + '</dd>');
      const sidecar = voiceCastByRole[l.role];
      if (sidecar) {
        if (sidecar.profile) dl.push('<dt>Role profile</dt><dd class="profile">' + escapeHtml(sidecar.profile) + '</dd>');
        const styleParts = [];
        if (sidecar.style) styleParts.push('style: ' + sidecar.style);
        if (sidecar.pacing) styleParts.push('pacing: ' + sidecar.pacing);
        if (sidecar.accent) styleParts.push('accent: ' + sidecar.accent);
        if (styleParts.length) {
          dl.push('<dt>Delivery</dt><dd class="profile">' + escapeHtml(styleParts.join(' · ')) + '</dd>');
        }
      }
      if (l.style) {
        dl.push('<dt>Style tag</dt><dd>' + escapeHtml(l.style) + '</dd>');
      }
      if (l.speakAs) {
        dl.push('<dt>speakAs (instructional prompt sent to Gemini)</dt>' +
          '<dd class="speakAs">' + escapeHtml(l.speakAs) + '</dd>');
      }
      if (l.cipher && l.cipher !== l.plain) {
        dl.push('<dt>Cipher text</dt><dd class="cipher">' + escapeHtml(l.cipher) + '</dd>');
      }
      if (dl.length > 0) {
        details = '<details class="line-details">' +
          '<summary>Line context (voice, style, prompt)</summary>' +
          '<dl class="line-details-body">' + dl.join('') + '</dl>' +
          '</details>';
      }
    }

    return '<div class="' + cls + '">' +
      '<div class="id">' + l.id + '</div>' +
      '<div class="role">' + escapeHtml(l.role) + '</div>' +
      '<div class="body">' +
      '<div class="text">' + gavels + escapeHtml(text || '') + '</div>' +
      audio +
      meta +
      details +
      '</div></div>';
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  init();
</script>
</body>
</html>`;
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

// ============================================================
// Legacy /api/index — kept for backwards compat (cache-keyed view)
// ============================================================

export function handleIndexJson(
  res: http.ServerResponse,
  cacheDir: string,
): void {
  const indexPath = path.join(cacheDir, "_INDEX.json");
  if (fs.existsSync(indexPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(indexPath, "utf8")) as Array<{
        cacheKey: string; model: string; ritualSlug: string;
        lineId: string | number; byteLen: number; durationMs: number;
        createdAt: string;
      }>;
      const bySlug = new Map<string, typeof raw>();
      for (const e of raw) {
        const arr = bySlug.get(e.ritualSlug) ?? [];
        arr.push(e);
        bySlug.set(e.ritualSlug, arr);
      }
      const rituals = Array.from(bySlug.entries()).map(([slug, entries]) => ({
        slug, lineCount: entries.length,
        lines: entries.sort((a, b) => String(a.lineId).localeCompare(String(b.lineId))),
      }));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ rituals }, null, 2));
      return;
    } catch {}
  }
  if (!fs.existsSync(cacheDir)) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ rituals: [] }));
    return;
  }
  const opusFiles = fs.readdirSync(cacheDir)
    .filter((f) => f.endsWith(".opus"))
    .map((f) => {
      const cacheKey = f.replace(/\.opus$/, "");
      const stat = fs.statSync(path.join(cacheDir, f));
      return {
        cacheKey, model: "unknown", ritualSlug: "uncategorized",
        lineId: cacheKey.slice(0, 8), byteLen: stat.size,
        durationMs: 0, createdAt: stat.mtime.toISOString(),
      };
    });
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    rituals: [{ slug: "uncategorized (_INDEX.json not present)", lineCount: opusFiles.length, lines: opusFiles }],
  }, null, 2));
}

// ============================================================
// Server bootstrap
// ============================================================

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${BIND_HOST}:${BIND_PORT}`);
    if (url.pathname === "/" || url.pathname === "/index.html") {
      handleIndexRequest(res);
      return;
    }
    if (url.pathname === "/api/rituals") {
      await handleRitualsList(res);
      return;
    }
    // /api/ritual/{slug}/line/{id}.opus
    const lineMatch = /^\/api\/ritual\/([^/]+)\/line\/([^/]+)\.opus$/.exec(url.pathname);
    if (lineMatch) {
      await handleRitualLineAudio(req, res, lineMatch[1]!, lineMatch[2]!);
      return;
    }
    // /api/ritual/{slug}
    const detailMatch = /^\/api\/ritual\/([^/]+)$/.exec(url.pathname);
    if (detailMatch) {
      await handleRitualDetail(res, detailMatch[1]!);
      return;
    }
    if (url.pathname === "/api/index") {
      handleIndexJson(res, BAKE_CACHE_DIR);
      return;
    }
    if (url.pathname.startsWith("/a/")) {
      handleOpusRequest(req, res, BAKE_CACHE_DIR);
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  } catch (e) {
    console.error("[preview-bake] unhandled error:", e);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain" });
    }
    try { res.end("Internal error"); } catch {}
  }
});

export { server };

const isDirectRun = process.argv[1]?.endsWith("preview-bake.ts") ?? false;
if (isDirectRun) {
  const overrideHost = process.env.PREVIEW_BAKE_HOST ?? BIND_HOST;
  ensureLoopback(overrideHost);
  server.listen(BIND_PORT, overrideHost, () => {
    console.log(
      `[AUTHOR-08] Preview server: http://${overrideHost}:${BIND_PORT}`,
    );
    console.log(`           Rituals: ${RITUALS_DIR}`);
    console.log(`           Cache:   ${BAKE_CACHE_DIR}`);
    if (!process.env.MRAM_PASSPHRASE) {
      console.log(`           ⚠ MRAM_PASSPHRASE not set — ritual structure won't decrypt.`);
    }
    console.log(`           Dev-only; read-only; Ctrl-C to stop.`);
  });
}
