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
import {
  renderLineAudio,
  computeCacheKey,
  deleteCacheEntry,
  DEFAULT_MODELS,
  CACHE_DIR as RENDER_CACHE_DIR,
} from "./render-gemini-audio";
import { encryptMRAMNode } from "./build-mram-from-dialogue";
import { buildPreamble, type VoiceCastFile } from "../src/lib/voice-cast";

// Module-load guard: fail fast in production (T-03-02).
assertDevOnly();

const BIND_HOST = "127.0.0.1";
const BIND_PORT = Number(process.env.PREVIEW_BAKE_PORT ?? "8883");
const BAKE_CACHE_DIR = path.resolve("rituals/_bake-cache");
const RITUALS_DIR = path.resolve("rituals");
const SESSIONS_ROOT = path.resolve("rituals/_sessions");

// Session name: same shape as ritual slug — lowercase alpha-num + dash/underscore,
// 1-64 chars, must start with alphanumeric. Reserved names blocked below.
const SESSION_NAME_REGEX = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const RESERVED_SESSION_NAMES = new Set([
  "canonical",
  "_sessions",
  "_bake-cache",
  ".",
  "..",
]);

/**
 * Resolve the rituals directory for the given session. Empty/undefined
 * session means canonical (the rituals/ directory). Anything else routes
 * to rituals/_sessions/{name}/ after regex + reserved-name + path-traversal
 * validation. Returns null on any validation failure (caller responds 400).
 */
function resolveSessionDir(session: string | undefined | null): string | null {
  if (!session) return RITUALS_DIR;
  if (!SESSION_NAME_REGEX.test(session)) return null;
  if (RESERVED_SESSION_NAMES.has(session)) return null;
  const resolved = path.resolve(SESSIONS_ROOT, session);
  // Defense in depth: ensure we're inside SESSIONS_ROOT after resolve
  // (regex should already prevent this, but belt-and-suspenders).
  if (!resolved.startsWith(SESSIONS_ROOT + path.sep)) return null;
  return resolved;
}

function listSessions(): Array<{ name: string; createdAt: string; branchedFrom: string }> {
  if (!fs.existsSync(SESSIONS_ROOT)) return [];
  const result: Array<{ name: string; createdAt: string; branchedFrom: string }> = [];
  for (const entry of fs.readdirSync(SESSIONS_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!SESSION_NAME_REGEX.test(entry.name)) continue;
    if (RESERVED_SESSION_NAMES.has(entry.name)) continue;
    const metaPath = path.join(SESSIONS_ROOT, entry.name, "_meta.json");
    let createdAt = "";
    let branchedFrom = "canonical";
    if (fs.existsSync(metaPath)) {
      try {
        const m = JSON.parse(fs.readFileSync(metaPath, "utf8"));
        if (typeof m.createdAt === "string") createdAt = m.createdAt;
        if (typeof m.branchedFrom === "string") branchedFrom = m.branchedFrom;
      } catch { /* missing meta is OK */ }
    }
    result.push({ name: entry.name, createdAt, branchedFrom });
  }
  result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}

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
  session?: string,
): Promise<MRAMDocument> {
  if (!RITUAL_SLUG_REGEX.test(slug)) {
    throw new Error(`Invalid ritual slug: ${slug}`);
  }
  const dir = resolveSessionDir(session);
  if (!dir) throw new Error(`Invalid session: ${session}`);
  const mramPath = path.join(dir, `${slug}.mram`);
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
function loadStylesSidecar(slug: string, session?: string): Map<string, StyleSidecarEntry> {
  const dir = resolveSessionDir(session);
  if (!dir) return new Map();
  // Styles sidecar: prefer session-local, fall back to canonical (styles
  // rarely change per-session — they're authoring artifacts).
  let p = path.join(dir, `${slug}-styles.json`);
  if (!fs.existsSync(p) && dir !== RITUALS_DIR) {
    p = path.join(RITUALS_DIR, `${slug}-styles.json`);
  }
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
function loadVoiceCastSidecar(slug: string, session?: string): VoiceCastSidecar | null {
  const dir = resolveSessionDir(session);
  if (!dir) return null;
  // Voice-cast sidecar: prefer session-local, fall back to canonical.
  let p = path.join(dir, `${slug}-voice-cast.json`);
  if (!fs.existsSync(p) && dir !== RITUALS_DIR) {
    p = path.join(RITUALS_DIR, `${slug}-voice-cast.json`);
  }
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
 * List all .mram files in the active session directory. Returns slugs
 * (sans extension). Session = empty/undefined means canonical.
 */
export function listRituals(session?: string): string[] {
  const dir = resolveSessionDir(session);
  if (!dir || !fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
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

async function handleRitualsList(
  res: http.ServerResponse,
  session?: string,
): Promise<void> {
  if (session !== undefined && !resolveSessionDir(session)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid session" }));
    return;
  }
  const dir = resolveSessionDir(session) ?? RITUALS_DIR;
  const slugs = listRituals(session);
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
    const mramPath = path.join(dir, `${slug}.mram`);
    const stat = fs.statSync(mramPath);
    const entry: typeof result[0] = {
      slug,
      fileSize: stat.size,
      decrypted: false,
    };
    if (passphrase) {
      try {
        const doc = await loadRitual(slug, passphrase, session);
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
    activeSession: session || "",
  }, null, 2));
}

async function handleRitualDetail(
  res: http.ServerResponse,
  slug: string,
  session?: string,
): Promise<void> {
  if (!RITUAL_SLUG_REGEX.test(slug)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid slug" }));
    return;
  }
  if (session !== undefined && !resolveSessionDir(session)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid session" }));
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
    const doc = await loadRitual(slug, passphrase, session);
    // Read the local styles + voice-cast sidecars (gitignored, plaintext).
    // These are content-authoring artifacts that the bake consumed but
    // doesn't ship inside the .mram. Shannon needs them to scrub WHY
    // each line sounds the way it does.
    const stylesByHash = loadStylesSidecar(slug, session);
    const voiceCast = loadVoiceCastSidecar(slug, session);
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
      let audioHash: string | null = null;
      if (l.audio) {
        const headerB64 = l.audio.slice(0, 384);
        const headerBytes = Buffer.from(headerB64, "base64");
        engine = detectAudioEngine(headerBytes);
        engineCounts[engine] = (engineCounts[engine] ?? 0) + 1;
        // Full-audio sha256 — used by the client to detect when audio
        // has been re-baked since a previous "approved" review state was
        // recorded. Cheap (~3-5ms total per ritual at 200 lines).
        audioHash = crypto.createHash("sha256")
          .update(Buffer.from(l.audio, "base64"))
          .digest("hex");
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
        audioHash,
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
  session?: string,
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
  if (session !== undefined && !resolveSessionDir(session)) {
    res.writeHead(400);
    res.end("Invalid session");
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
    const doc = await loadRitual(slug, passphrase, session);
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
// Review sidecar — STT-01 Step 2/3: per-line status + notes
// ============================================================
// Stored at rituals/{slug}-review.json (gitignored via rituals/*.json).
// Single-user dev tool; no concurrency control beyond atomic write.

const REVIEW_STATUSES = new Set([
  "unmarked",
  "flagged-review",
  "flagged-regen",
  "approved",
]);

interface ReviewEntry {
  status: string;
  note: string;
  audioHash: string | null;
  approvedAt: string | null;
  flaggedAt: string | null;
}

interface ReviewSidecar {
  version: number;
  updatedAt: string | null;
  lines: Record<string, ReviewEntry>;
}

function reviewSidecarPath(slug: string, session?: string): string {
  const dir = resolveSessionDir(session) ?? RITUALS_DIR;
  return path.join(dir, `${slug}-review.json`);
}

function defaultReviewEntry(): ReviewEntry {
  return {
    status: "unmarked",
    note: "",
    audioHash: null,
    approvedAt: null,
    flaggedAt: null,
  };
}

function readReviewSidecar(slug: string, session?: string): ReviewSidecar {
  const p = reviewSidecarPath(slug, session);
  if (!fs.existsSync(p)) {
    return { version: 1, updatedAt: null, lines: {} };
  }
  try {
    const raw = fs.readFileSync(p, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { version: 1, updatedAt: null, lines: {} };
    }
    const lines: Record<string, ReviewEntry> = {};
    if (parsed.lines && typeof parsed.lines === "object") {
      for (const [k, v] of Object.entries(parsed.lines)) {
        if (!v || typeof v !== "object") continue;
        const entry = v as Record<string, unknown>;
        const status = typeof entry.status === "string" && REVIEW_STATUSES.has(entry.status)
          ? entry.status
          : "unmarked";
        lines[k] = {
          status,
          note: typeof entry.note === "string" ? entry.note : "",
          audioHash: typeof entry.audioHash === "string" ? entry.audioHash : null,
          approvedAt: typeof entry.approvedAt === "string" ? entry.approvedAt : null,
          flaggedAt: typeof entry.flaggedAt === "string" ? entry.flaggedAt : null,
        };
      }
    }
    return {
      version: 1,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
      lines,
    };
  } catch {
    return { version: 1, updatedAt: null, lines: {} };
  }
}

function writeReviewSidecar(slug: string, data: ReviewSidecar, session?: string): void {
  const p = reviewSidecarPath(slug, session);
  // Ensure parent dir exists (session dirs may not be created yet for
  // first review write — though the session-create flow always mkdirs).
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, p);
}

function handleReviewGet(res: http.ServerResponse, slug: string, session?: string): void {
  if (!RITUAL_SLUG_REGEX.test(slug)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid slug" }));
    return;
  }
  if (session !== undefined && !resolveSessionDir(session)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid session" }));
    return;
  }
  const sidecar = readReviewSidecar(slug, session);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(sidecar));
}

async function handleReviewPut(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  slug: string,
  lineIdStr: string,
  session?: string,
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
  if (session !== undefined && !resolveSessionDir(session)) {
    res.writeHead(400);
    res.end("Invalid session");
    return;
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const c of req) {
    const buf = c as Buffer;
    total += buf.length;
    if (total > 8192) {
      res.writeHead(413);
      res.end("Body too large");
      return;
    }
    chunks.push(buf);
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    res.writeHead(400);
    res.end("Invalid JSON");
    return;
  }
  if (!parsed || typeof parsed !== "object") {
    res.writeHead(400);
    res.end("Invalid body");
    return;
  }
  const sidecar = readReviewSidecar(slug, session);
  const next: ReviewEntry = { ...(sidecar.lines[lineIdStr] ?? defaultReviewEntry()) };
  const now = new Date().toISOString();
  if ("status" in parsed) {
    if (typeof parsed.status !== "string" || !REVIEW_STATUSES.has(parsed.status)) {
      res.writeHead(400);
      res.end("Invalid status");
      return;
    }
    next.status = parsed.status;
    if (parsed.status === "approved") next.approvedAt = now;
    else if (parsed.status === "flagged-review" || parsed.status === "flagged-regen") next.flaggedAt = now;
    else if (parsed.status === "unmarked") {
      next.approvedAt = null;
      next.flaggedAt = null;
    }
  }
  if ("note" in parsed) {
    if (typeof parsed.note !== "string") {
      res.writeHead(400);
      res.end("Invalid note");
      return;
    }
    if (parsed.note.length > 4000) {
      res.writeHead(400);
      res.end("Note too long");
      return;
    }
    next.note = parsed.note;
  }
  if ("audioHash" in parsed) {
    if (parsed.audioHash !== null && (typeof parsed.audioHash !== "string" || !/^[0-9a-f]{64}$/.test(parsed.audioHash))) {
      res.writeHead(400);
      res.end("Invalid audioHash");
      return;
    }
    next.audioHash = parsed.audioHash as string | null;
  }
  sidecar.lines[lineIdStr] = next;
  sidecar.updatedAt = now;
  writeReviewSidecar(slug, sidecar, session);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(next));
}

// ============================================================
// Sessions — STT-01 Tier 2b: parallel-bake feature
// ============================================================
// A session is a parallel directory of ritual files (.mram + sidecars)
// that lives under rituals/_sessions/{name}/. The bake-cache is shared
// across all sessions (content-addressed by text+style+voice+model+preamble).
// Creation copies all .mram + review/styles/voice-cast files from the source
// (canonical or another session). Promotion copies session files back to
// canonical (with auto-backup of canonical first). Deletion removes the
// session dir entirely. Sessions are gitignored via the rituals/_sessions/
// prefix in .gitignore (added when this feature ships).

const SESSION_FILE_GLOB = (slug: string) => [
  `${slug}.mram`,
  `${slug}-review.json`,
  `${slug}-styles.json`,
  `${slug}-voice-cast.json`,
];

function copySessionFiles(srcDir: string, destDir: string): number {
  let copied = 0;
  if (!fs.existsSync(srcDir)) return 0;
  fs.mkdirSync(destDir, { recursive: true });
  // Get the slug list from the SOURCE — we copy whatever rituals exist there.
  const slugs = fs
    .readdirSync(srcDir)
    .filter((f) => f.endsWith(".mram") && !f.includes(".backup-"))
    .map((f) => f.replace(/\.mram$/, ""))
    .filter((slug) => RITUAL_SLUG_REGEX.test(slug));
  for (const slug of slugs) {
    for (const filename of SESSION_FILE_GLOB(slug)) {
      const src = path.join(srcDir, filename);
      if (!fs.existsSync(src)) continue;
      const dest = path.join(destDir, filename);
      fs.copyFileSync(src, dest);
      copied++;
    }
  }
  return copied;
}

function handleSessionsList(res: http.ServerResponse): void {
  const sessions = listSessions();
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    sessions,
    canonical: { name: "", createdAt: null, branchedFrom: null },
  }));
}

async function handleSessionCreate(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  name: string,
): Promise<void> {
  if (!SESSION_NAME_REGEX.test(name) || RESERVED_SESSION_NAMES.has(name)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid session name" }));
    return;
  }
  const destDir = resolveSessionDir(name);
  if (!destDir) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid session" }));
    return;
  }
  if (fs.existsSync(destDir)) {
    res.writeHead(409, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Session already exists" }));
    return;
  }
  // Parse body — { branchFrom?: string } where empty/undefined = canonical
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const c of req) {
    const buf = c as Buffer;
    total += buf.length;
    if (total > 1024) { res.writeHead(413); res.end("Body too large"); return; }
    chunks.push(buf);
  }
  let body: { branchFrom?: string } = {};
  if (chunks.length > 0) {
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
      return;
    }
  }
  const branchFrom = (body.branchFrom || "").trim();
  const sourceDir = resolveSessionDir(branchFrom);
  if (!sourceDir) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid branchFrom session" }));
    return;
  }
  try {
    const copied = copySessionFiles(sourceDir, destDir);
    const meta = {
      version: 1,
      name,
      createdAt: new Date().toISOString(),
      branchedFrom: branchFrom || "canonical",
      branchedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(destDir, "_meta.json"), JSON.stringify(meta, null, 2));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, name, filesCopied: copied, branchedFrom: meta.branchedFrom }));
  } catch (e) {
    // Best-effort cleanup if copy failed mid-flight
    try { fs.rmSync(destDir, { recursive: true, force: true }); } catch { /* */ }
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: (e as Error).message.slice(0, 200) }));
  }
}

function handleSessionPromote(
  res: http.ServerResponse,
  name: string,
): void {
  if (!SESSION_NAME_REGEX.test(name) || RESERVED_SESSION_NAMES.has(name)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid session name" }));
    return;
  }
  const sourceDir = resolveSessionDir(name);
  if (!sourceDir || !fs.existsSync(sourceDir)) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Session not found" }));
    return;
  }
  // Auto-backup canonical first to a special pre-promote session so the
  // user can roll back the promotion if they regret it.
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.resolve(SESSIONS_ROOT, `_pre-promote-${ts}`);
  try {
    fs.mkdirSync(backupDir, { recursive: true });
    copySessionFiles(RITUALS_DIR, backupDir);
    fs.writeFileSync(path.join(backupDir, "_meta.json"), JSON.stringify({
      version: 1,
      name: path.basename(backupDir),
      createdAt: new Date().toISOString(),
      branchedFrom: "canonical",
      branchedAt: new Date().toISOString(),
      note: `Auto-backup before promoting "${name}" to canonical`,
    }, null, 2));
    // Promote: copy session files into canonical (overwrites)
    const copied = copySessionFiles(sourceDir, RITUALS_DIR);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      promoted: name,
      filesCopied: copied,
      backupDir: path.basename(backupDir),
    }));
  } catch (e) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: (e as Error).message.slice(0, 200) }));
  }
}

function handleSessionDelete(
  res: http.ServerResponse,
  name: string,
): void {
  if (!SESSION_NAME_REGEX.test(name) || RESERVED_SESSION_NAMES.has(name)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid session name" }));
    return;
  }
  const dir = resolveSessionDir(name);
  if (!dir || !fs.existsSync(dir)) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Session not found" }));
    return;
  }
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, deleted: name }));
  } catch (e) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: (e as Error).message.slice(0, 200) }));
  }
}

// ============================================================
// Rebake one line — STT-01 in-GUI regenerate
// ============================================================
// Decrypts the .mram, re-renders one line via Gemini using the same
// param derivation as scripts/rebake-flagged.ts, atomically writes the
// updated .mram, and updates the review sidecar (audioHash → null;
// approved → unmarked since the audio bytes changed). Single in-process
// lock per slug serializes concurrent rebakes against the same ritual.

const rebakeLockBySlug = new Map<string, Promise<void>>();

async function handleRebakeLine(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  slug: string,
  lineIdStr: string,
  session?: string,
): Promise<void> {
  if (!RITUAL_SLUG_REGEX.test(slug)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid slug" }));
    return;
  }
  if (!LINE_ID_REGEX.test(lineIdStr)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid line id" }));
    return;
  }
  if (session !== undefined && !resolveSessionDir(session)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid session" }));
    return;
  }
  const passphrase = process.env.MRAM_PASSPHRASE;
  if (!passphrase) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "MRAM_PASSPHRASE not set" }));
    return;
  }
  const apiKeysRaw =
    process.env.GOOGLE_GEMINI_API_KEYS ?? process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKeysRaw) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "GOOGLE_GEMINI_API_KEYS not set" }));
    return;
  }
  const apiKeys = apiKeysRaw.split(",").map((s) => s.trim()).filter(Boolean);

  // Parse JSON body — director-note overrides plus optional speakAsOverride
  // (free-text spoken transcript with inline Gemini tags). Cap at 8KB so
  // speakAs (up to 4000 chars) + profile (1000) + others + JSON overhead fit.
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const c of req) {
    const buf = c as Buffer;
    total += buf.length;
    if (total > 8192) {
      res.writeHead(413);
      res.end("Body too large");
      return;
    }
    chunks.push(buf);
  }
  let body: {
    forcePreamble?: boolean;
    voiceOverride?: string;
    styleOverride?: string;
    paceOverride?: string;
    accentOverride?: string;
    profileOverride?: string;
    speakAsOverride?: string;
    temperature?: number;
    modelOverride?: string;
  } = {};
  if (chunks.length > 0) {
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
      return;
    }
  }
  const forcePreamble = !!body.forcePreamble;
  // Validate overrides — each is optional; reject malformed input so we
  // never proxy raw control chars into the Gemini prompt. Voice override
  // stays restricted to the API's voice-name shape; prose overrides allow
  // free-text but cap length and forbid control chars.
  const isSafeIdent = (s: unknown): s is string =>
    typeof s === "string" && s.length > 0 && s.length <= 64 && /^[A-Za-z][A-Za-z0-9 _\-/]*$/.test(s);
  const isSafeProse = (s: unknown, maxLen: number): s is string =>
    typeof s === "string"
    && s.length > 0
    && s.length <= maxLen
    && !/[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]/.test(s);
  const voiceOverride = isSafeIdent(body.voiceOverride) ? body.voiceOverride : undefined;
  const styleOverride = isSafeProse(body.styleOverride, 500) ? body.styleOverride : undefined;
  const paceOverride = isSafeProse(body.paceOverride, 500) ? body.paceOverride : undefined;
  const accentOverride = isSafeProse(body.accentOverride, 500) ? body.accentOverride : undefined;
  const profileOverride = isSafeProse(body.profileOverride, 1000) ? body.profileOverride : undefined;
  // speakAsOverride: free-text spoken transcript with inline Gemini tags
  // ([whispered], [pause], etc.). Replaces the line's plain text in the
  // prompt for this rebake. Cap at 4000 chars — Gemini's total prompt
  // (preamble + text) limit is ~8KB, and the preamble can run several KB.
  const speakAsOverride = isSafeProse(body.speakAsOverride, 4000) ? body.speakAsOverride : undefined;
  // Temperature: numeric, range 0.0-2.0, undefined = use Gemini default
  const temperatureRaw = body.temperature;
  const temperature = (typeof temperatureRaw === "number" && Number.isFinite(temperatureRaw) && temperatureRaw >= 0 && temperatureRaw <= 2)
    ? temperatureRaw
    : undefined;
  // Model override: must look like a Gemini model identifier (alphanumeric + dashes/dots, no spaces)
  const modelOverride = (typeof body.modelOverride === "string" && /^[a-z0-9][a-z0-9.\-_]{0,127}$/i.test(body.modelOverride))
    ? body.modelOverride
    : undefined;

  // Per-(session, slug) serialization — different sessions on the same
  // slug write to different files, so they don't conflict.
  const lockKey = (session || "") + "::" + slug;
  const prev = rebakeLockBySlug.get(lockKey);
  let resolveLock!: () => void;
  const lockPromise = new Promise<void>((r) => {
    resolveLock = r;
  });
  rebakeLockBySlug.set(lockKey, lockPromise);
  if (prev) await prev;

  try {
    const lineId = Number(lineIdStr);
    const sessionDir = resolveSessionDir(session) ?? RITUALS_DIR;
    const mramPath = path.join(sessionDir, `${slug}.mram`);
    if (!fs.existsSync(mramPath)) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Ritual not found" }));
      return;
    }
    const buf = fs.readFileSync(mramPath);
    const ab = buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength,
    ) as ArrayBuffer;
    const doc = await decryptMRAM(ab, passphrase);

    const line = doc.lines.find((l) => l.id === lineId);
    if (!line || line.action || !line.plain) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Line not found or not spoken" }));
      return;
    }
    // Voice: override beats role-pinned voice from .mram metadata.
    const pinnedVoice = doc.metadata.voiceCast?.[line.role];
    const voice = voiceOverride ?? pinnedVoice;
    if (!voice) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Role ${line.role} has no pinned voice and no voiceOverride` }));
      return;
    }

    // Derive style + speakAs — same logic as rebake-flagged.ts.
    // IMPORTANT: style/pace/accent overrides do NOT get packed into the
    // inline "[<style>] " bracket prefix anymore. Doing that on top of a
    // voice-cast preamble that already describes pacing/style/accent at
    // length produced two competing directive sets — the model would
    // follow the rich preamble and quietly ignore the terse bracket
    // (Shannon observed this empirically: changing pace did nothing).
    // Instead, overrides are LAYERED into a synthetic role-card BEFORE
    // the preamble is built. The preamble then carries one coherent set
    // of directives.
    const stylesByHash = loadStylesSidecar(slug, session);
    const sidecar = stylesByHash.get(hashLineText(line.plain));
    // Two distinct flavors of speakAs:
    //   sidecarSpeakAs = committed instructional prompt — replaces text AND
    //     suppresses the voice-cast preamble (the prompt is self-contained).
    //   speakAsOverride = ephemeral GUI edit (e.g. inline Gemini tags like
    //     [whispered], [pause]) — replaces text but PRESERVES the preamble,
    //     since tags are meant to compose with role/scene context.
    const sidecarSpeakAs = sidecar?.speakAs;
    const baseStyle = line.style ?? sidecar?.style;
    const style = baseStyle; // pass only the base style; overrides → preamble
    const text = speakAsOverride ?? sidecarSpeakAs ?? line.plain;

    const VOICE_CAST_MIN_LINE_CHARS = parseInt(
      process.env.VOICE_CAST_MIN_LINE_CHARS ?? "40",
      10,
    );

    const hasAnyOverride = !!(styleOverride || paceOverride || accentOverride || profileOverride || speakAsOverride);

    let preamble = "";
    if (!sidecarSpeakAs) {
      const overThreshold = line.plain.length >= VOICE_CAST_MIN_LINE_CHARS;
      // Always inject preamble when style/pace/accent overrides are set —
      // they have nowhere else to go.
      if (forcePreamble || hasAnyOverride || overThreshold) {
        // Voice-cast: prefer session-local, fall back to canonical.
        let voiceCastPath = path.join(sessionDir, `${slug}-voice-cast.json`);
        if (!fs.existsSync(voiceCastPath) && sessionDir !== RITUALS_DIR) {
          voiceCastPath = path.join(RITUALS_DIR, `${slug}-voice-cast.json`);
        }
        if (fs.existsSync(voiceCastPath)) {
          try {
            const vcRaw = JSON.parse(
              fs.readFileSync(voiceCastPath, "utf8"),
            ) as Record<string, unknown>;
            const baseRoles = ((vcRaw.roles ?? vcRaw.cast) ?? {}) as Record<string, Record<string, unknown>>;
            const baseRole = baseRoles[line.role] ?? {};
            // Layer overrides on top — replacing the role-card field rather
            // than appending. style → role.style, pace → role.pacing,
            // accent → role.accent, profile → role.profile. Voice override
            // is handled separately (passed directly to the API as voiceName).
            const syntheticRole: Record<string, unknown> = { ...baseRole };
            if (styleOverride) syntheticRole.style = styleOverride;
            if (paceOverride) syntheticRole.pacing = paceOverride;
            if (accentOverride) syntheticRole.accent = accentOverride;
            if (profileOverride) syntheticRole.profile = profileOverride;
            const syntheticRoles = {
              ...baseRoles,
              [line.role]: syntheticRole,
            };
            const vcFile: VoiceCastFile = {
              version: 1,
              scene: vcRaw.scene as string | undefined,
              roles: syntheticRoles as VoiceCastFile["roles"],
            };
            preamble = buildPreamble(vcFile, line.role) ?? "";
          } catch {
            /* parse fail → no preamble */
          }
        }
      }
    }

    // Wipe cache entries so we get a fresh roll. When the user has set a
    // modelOverride, only invalidate that one (other models' caches stay
    // intact in case the user wants to A/B against them later). Otherwise
    // wipe the whole default chain.
    const invalidateModels = modelOverride ? [modelOverride] : DEFAULT_MODELS;
    for (const model of invalidateModels) {
      const key = computeCacheKey(text, style, voice, model, preamble, temperature);
      deleteCacheEntry(key, RENDER_CACHE_DIR);
    }

    // Render. When modelOverride is set, force only that model. Otherwise
    // let renderLineAudio read GEMINI_TTS_MODELS from env (the
    // .env.local-pinned chain), so e.g. skipping a degraded preview model
    // still works without GUI input.
    const renderOpts: { apiKeys: string[]; cacheDir: string; models?: string[]; temperature?: number } = {
      apiKeys,
      cacheDir: RENDER_CACHE_DIR,
    };
    if (modelOverride) renderOpts.models = [modelOverride];
    if (temperature !== undefined) renderOpts.temperature = temperature;
    const audioBuf = await renderLineAudio(
      text,
      style,
      voice,
      renderOpts,
      preamble,
    );
    line.audio = audioBuf.toString("base64");

    // Backup the .mram BEFORE atomic write so the prior audio is
    // recoverable if the user wants to revert. Matches the CLI rebake's
    // backup behavior. Keeps the last 3 GUI-rebake backups per ritual,
    // prunes older ones — frequent experimentation otherwise produces
    // a lot of disk noise. Backups are gitignored via rituals/*.backup-*.
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const backupPath = `${mramPath}.backup-rebake-${ts}`;
      fs.copyFileSync(mramPath, backupPath);
      // Prune older rebake backups — keep last 3 (chronological by ISO ts)
      const BACKUP_KEEP = 3;
      const dir = path.dirname(mramPath);
      const base = path.basename(mramPath);
      const prefix = `${base}.backup-rebake-`;
      const backups = fs.readdirSync(dir)
        .filter((f) => f.startsWith(prefix))
        .sort();
      while (backups.length > BACKUP_KEEP) {
        const oldest = backups.shift();
        if (oldest) {
          try { fs.unlinkSync(path.join(dir, oldest)); } catch { /* swallow */ }
        }
      }
    } catch (e) {
      console.warn(
        `[rebake] backup failed (continuing): ${(e as Error).message}`,
      );
    }

    // Re-encrypt + atomic write
    const reEncrypted = encryptMRAMNode(doc, passphrase);
    const tmpPath = `${mramPath}.tmp.${process.pid}`;
    fs.writeFileSync(tmpPath, reEncrypted);
    fs.renameSync(tmpPath, mramPath);

    // Update review sidecar — clear audio-related fields, demote approved
    const reviewPath = path.join(sessionDir, `${slug}-review.json`);
    if (fs.existsSync(reviewPath)) {
      try {
        const sc = readReviewSidecar(slug, session);
        const entry = sc.lines[String(lineId)];
        if (entry) {
          entry.audioHash = null;
          entry.approvedAt = null;
          if (entry.status === "approved") {
            entry.status = "unmarked";
            entry.flaggedAt = null;
          }
          sc.updatedAt = new Date().toISOString();
          writeReviewSidecar(slug, sc, session);
        }
      } catch {
        /* swallow */
      }
    }

    const newHash = crypto.createHash("sha256").update(audioBuf).digest("hex");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        audioBytes: audioBuf.length,
        audioHash: newHash,
        preambleUsed: preamble.length > 0,
        voiceUsed: voice,
        styleUsed: style,
        modelUsed: modelOverride ?? "(chain default)",
        temperatureUsed: temperature ?? "(API default)",
      }),
    );
  } catch (e) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: (e as Error).message.slice(0, 300) }));
  } finally {
    resolveLock();
    if (rebakeLockBySlug.get(lockKey) === lockPromise) {
      rebakeLockBySlug.delete(lockKey);
    }
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
    /* Surface tones — slightly elevated zinc for cards/hero areas
       on the bake page. Director's note uses these to establish
       depth without adding chroma. */
    --surface-card: #161618;
    --surface-elevated: #1d1d20;
    --border-subtle: #2a2a2e;
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
    padding: 1.25em 1.5em 1em;
  }
  header .header-inner {
    max-width: 64rem; margin: 0 auto;
  }
  /* Wordmark — Cinzel small caps, tracked, matching the main app's
     title treatment. The amber accent is the only chromatic moment in
     the header strip; everything else stays zinc. */
  header h1 {
    margin: 0 0 0.4em 0;
    font-family: 'Cinzel', Georgia, serif;
    font-size: 1.05em; font-weight: 600;
    color: var(--amber-500);
    text-transform: uppercase; letter-spacing: 0.18em;
  }
  header h1 > span {
    color: var(--zinc-600) !important;
    font-weight: 400 !important;
    font-family: 'Lato', sans-serif !important;
    font-size: 0.75em !important;
    letter-spacing: 0.04em !important;
    text-transform: none !important;
    margin-left: 0.7em !important;
  }
  header .meta { color: var(--zinc-500); font-size: 0.82em; font-family: 'Lato', sans-serif; }
  header .err { color: var(--error); font-weight: 500; }
  /* Session row — STT-01 Tier 2b — sits between meta and ritual tabs */
  .session-row {
    display: flex; flex-wrap: wrap; gap: 0.5em; align-items: center;
    margin: 0.5em 0 0.25em;
    padding: 0.45em 0;
    border-bottom: 1px dashed transparent;
  }
  .session-row:not(:empty) { border-bottom-color: var(--zinc-800); padding-bottom: 0.65em; }
  .session-row .session-label {
    color: var(--zinc-500); font-size: 0.78em;
    font-family: ui-monospace, monospace;
    text-transform: uppercase; letter-spacing: 0.05em;
  }
  .session-row select#session-select {
    background: var(--zinc-900);
    color: var(--zinc-200);
    border: 1px solid var(--zinc-700);
    border-radius: 6px;
    padding: 0.35em 0.5em;
    font-family: 'Lato', sans-serif;
    font-size: 0.85em;
    min-width: 160px;
    cursor: pointer;
  }
  .session-row select#session-select:hover, .session-row select#session-select:focus {
    border-color: var(--amber-500); outline: none;
  }
  .session-row button {
    background: transparent;
    border: 1px solid var(--zinc-700);
    color: var(--zinc-300);
    padding: 0.35em 0.85em;
    border-radius: 6px; cursor: pointer;
    font-family: 'Lato', sans-serif;
    font-size: 0.82em;
    transition: all 120ms;
  }
  .session-row button:hover {
    background: rgba(245, 158, 11, 0.1);
    color: var(--amber-400);
    border-color: rgba(245, 158, 11, 0.4);
  }
  .session-row button.session-promote {
    border-color: rgba(74, 222, 128, 0.4);
    color: var(--good);
  }
  .session-row button.session-promote:hover {
    background: rgba(74, 222, 128, 0.12);
    border-color: rgba(74, 222, 128, 0.6);
    color: var(--good);
  }
  .session-row button.session-delete {
    border-color: rgba(248, 113, 113, 0.35);
    color: var(--error);
  }
  .session-row button.session-delete:hover {
    background: rgba(248, 113, 113, 0.12);
    border-color: rgba(248, 113, 113, 0.6);
    color: var(--error);
  }
  .session-form {
    display: inline-flex; align-items: center; gap: 0.5em; flex-wrap: wrap;
    background: var(--zinc-950);
    border: 1px solid var(--zinc-800);
    border-radius: 8px;
    padding: 0.4em 0.7em;
  }
  .session-form input[type="text"] {
    background: var(--zinc-900);
    color: var(--zinc-200);
    border: 1px solid var(--zinc-700);
    border-radius: 4px;
    padding: 0.35em 0.5em;
    font-family: ui-monospace, monospace;
    font-size: 0.85em;
    min-width: 200px;
  }
  .session-form input[type="text"]:focus {
    border-color: var(--amber-500); outline: none;
  }
  .session-form-checkbox {
    color: var(--zinc-400); font-size: 0.82em;
    display: inline-flex; align-items: center; gap: 0.3em;
  }
  .session-form-checkbox input[type="checkbox"] {
    accent-color: var(--amber-500);
  }
  .session-form button.session-cancel {
    border-color: var(--zinc-700); color: var(--zinc-400);
  }
  .session-form .session-err { color: var(--error); font-size: 0.82em; }
  .session-form .session-ok { color: var(--good); font-size: 0.82em; }
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
  /* Mobile: stack id/role above the body so the audio + director's
     note get the full column width. Without this, the body column
     collapses to a sliver and the textarea wraps to a single
     character per line. */
  @media (max-width: 640px) {
    .line {
      grid-template-columns: auto 1fr;
      grid-template-areas:
        "id role"
        "body body";
      gap: 0.5em 0.75em;
      padding: 0.85em 0.9em;
    }
    .line .id { grid-area: id; text-align: left; padding-top: 0; }
    .line .role { grid-area: role; padding-top: 0; }
    .line .body { grid-area: body; }
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
    color: var(--zinc-500); font-style: italic; font-size: 0.85em;
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
  /* Gemini = filled amber (the primary engine — most lines).
     Google = outlined zinc (the fallback engine — distinguished by
     treatment, not by introducing a second chromatic color).
     Unknown = filled zinc (de-emphasized, can't classify).
     This replaces the previous teal accent for Google, which broke
     the masonic-style amber-only constraint. */
  .engine-gemini-flash-tts {
    background: rgba(245, 158, 11, 0.12);
    color: var(--amber-300);
    border-color: rgba(245, 158, 11, 0.3);
  }
  .engine-google-cloud-tts {
    background: transparent;
    color: var(--zinc-300);
    border-color: var(--zinc-700);
  }
  .engine-unknown {
    background: rgba(113, 113, 122, 0.15);
    color: var(--zinc-400); border-color: rgba(113, 113, 122, 0.3);
  }
  .line.line-google-cloud-tts {
    border-left: 3px solid var(--zinc-700);
    padding-left: calc(1.25em - 3px);
  }

  /* Engine filter row — same card style as ritual-context */
  .controls.engine-filters,
  .controls.role-filters,
  .controls.status-filters {
    margin: 0.4em 0 1em;
    align-items: center;
    padding: 0.7em 1em;
    background: var(--zinc-900);
    border: 1px solid var(--zinc-800);
    border-radius: 12px;
  }
  .controls.engine-filters .filter-label,
  .controls.role-filters .filter-label,
  .controls.status-filters .filter-label {
    color: var(--zinc-500); font-size: 0.82em;
    font-family: ui-monospace, monospace;
    text-transform: uppercase; letter-spacing: 0.05em;
  }
  /* Role pill — analogous to engine pill but uses role-tone styling
     (monospace amber matching the per-line .role color). */
  .role-filter {
    display: inline-flex; align-items: center; gap: 0.4em;
    cursor: pointer; user-select: none;
  }
  .role-filter input[type="checkbox"] {
    margin: 0; cursor: pointer;
    accent-color: var(--amber-500);
  }
  .role-pill {
    display: inline-block; padding: 0.15em 0.65em;
    border-radius: 10px; font-size: 0.78em;
    font-weight: 600; font-family: ui-monospace, monospace;
    color: var(--amber-400);
    background: rgba(245, 158, 11, 0.08);
    border: 1px solid rgba(245, 158, 11, 0.2);
    letter-spacing: 0.02em;
    transition: filter 100ms;
  }
  .role-filter:hover .role-pill { filter: brightness(1.15); }
  .role-pill .count {
    color: var(--zinc-500); font-weight: 400; margin-left: 0.4em;
  }
  /* Status filter — uses the same status-pill style as the inline pills
     but as a static (non-clickable) badge inside a checkbox label. */
  .status-filter {
    display: inline-flex; align-items: center; gap: 0.4em;
    cursor: pointer; user-select: none;
  }
  .status-filter input[type="checkbox"] {
    margin: 0; cursor: pointer;
    accent-color: var(--amber-500);
  }
  .status-filter:hover .status-pill { filter: brightness(1.15); }
  .status-pill .status-count {
    margin-left: 0.5em;
    font-weight: 400; opacity: 0.75;
    font-size: 0.85em;
  }
  /* Bulk approve button has the same shape as filter-shortcut but a
     subtle green tint so it reads as the action target. */
  .filter-shortcut.bulk-approve {
    border-color: rgba(74, 222, 128, 0.4);
    color: var(--good);
  }
  .filter-shortcut.bulk-approve:hover {
    background: rgba(74, 222, 128, 0.12);
    border-color: rgba(74, 222, 128, 0.6);
    color: var(--good);
  }
  .filter-shortcut:disabled {
    opacity: 0.5; cursor: wait;
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
  .controls button#jump-to-current {
    background: transparent;
    border: 1px solid var(--zinc-700);
    color: var(--zinc-400);
    padding: 0.3em 0.85em;
    border-radius: 6px; cursor: pointer;
    font-family: 'Lato', sans-serif;
    font-size: 0.82em;
    transition: all 120ms;
  }
  .controls button#jump-to-current:hover {
    background: rgba(245, 158, 11, 0.08);
    color: var(--amber-400);
    border-color: rgba(245, 158, 11, 0.3);
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

  /* STT-01 Step 1: current-line indicator. Amber edge + subtle bg so the
     line you're auditioning stands out without competing with engine
     color-coding. The engine left-border is overridden when current. */
  .line.is-current {
    background: rgba(245, 158, 11, 0.07);
    border-left: 3px solid var(--amber-500);
    padding-left: calc(1.25em - 3px);
  }
  .line.is-current .id { color: var(--amber-400); }

  /* STT-01 Step 2: status pills + note area.
     Sized to look like real interactive controls — these are primary
     action targets (click to cycle status, click to open note), so they
     need to read as buttons, not as ambient metadata. */
  .status-pill {
    display: inline-flex; align-items: center;
    padding: 0.5em 1.15em;
    border-radius: 8px;
    font-size: 0.95em; font-weight: 600;
    font-family: 'Lato', sans-serif;
    text-transform: lowercase;
    border: 1.5px solid transparent;
    letter-spacing: 0.03em;
    cursor: pointer;
    transition: filter 100ms, box-shadow 100ms, transform 80ms;
    user-select: none;
    line-height: 1;
  }
  .status-pill::before {
    content: "●"; margin-right: 0.45em;
    font-size: 0.85em; line-height: 1;
  }
  .status-pill:hover {
    filter: brightness(1.2);
    box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.12);
  }
  .status-pill:active { transform: scale(0.97); }
  .status-pill.status-unmarked {
    background: rgba(113, 113, 122, 0.18);
    color: var(--zinc-300); border-color: rgba(113, 113, 122, 0.4);
  }
  .status-pill.status-unmarked::before { color: var(--zinc-500); }
  .status-pill.status-flagged-review {
    background: rgba(251, 191, 36, 0.18);
    color: var(--amber-300); border-color: rgba(251, 191, 36, 0.5);
  }
  .status-pill.status-flagged-review::before { color: var(--amber-400); }
  .status-pill.status-flagged-regen {
    background: rgba(248, 113, 113, 0.18);
    color: var(--error); border-color: rgba(248, 113, 113, 0.5);
  }
  .status-pill.status-flagged-regen::before { color: var(--error); }
  .status-pill.status-approved {
    background: rgba(74, 222, 128, 0.16);
    color: var(--good); border-color: rgba(74, 222, 128, 0.5);
  }
  .status-pill.status-approved::before { content: "✓"; color: var(--good); }
  .status-pill.status-approved.stale {
    background: rgba(245, 158, 11, 0.16);
    color: var(--amber-400); border-color: rgba(245, 158, 11, 0.5);
  }
  .status-pill.status-approved.stale::before {
    content: "⚠"; color: var(--amber-400);
  }
  .status-pill.status-approved.stale::after {
    content: " (stale)"; opacity: 0.85;
  }
  /* Note toggle — sized to match the status pill so they read as a pair. */
  .note-toggle {
    background: transparent; border: 1.5px solid var(--zinc-700);
    color: var(--zinc-300);
    padding: 0.5em 1.15em;
    border-radius: 8px; cursor: pointer;
    font-family: 'Lato', sans-serif;
    font-size: 0.95em; font-weight: 600;
    transition: all 120ms, transform 80ms;
    line-height: 1;
  }
  .note-toggle:hover {
    background: rgba(245, 158, 11, 0.1);
    color: var(--amber-400);
    border-color: rgba(245, 158, 11, 0.5);
  }
  .note-toggle:active { transform: scale(0.97); }
  .note-toggle.has-note {
    border-color: rgba(245, 158, 11, 0.5);
    color: var(--amber-400);
    background: rgba(245, 158, 11, 0.08);
  }
  /* Rebake button — same shape as note-toggle but with a refresh icon and
     a subtle blue/teal accent so it reads as a regenerate action, not a
     toggle. Disabled state during in-flight render. */
  .rebake-btn {
    background: transparent;
    border: 1.5px solid var(--zinc-700);
    color: var(--zinc-300);
    padding: 0.5em 1em;
    border-radius: 8px; cursor: pointer;
    font-family: 'Lato', sans-serif;
    font-size: 0.95em; font-weight: 600;
    transition: all 120ms, transform 80ms;
    line-height: 1;
    display: inline-flex; align-items: center; gap: 0.4em;
  }
  .rebake-btn::before { content: "↻"; font-size: 1.1em; line-height: 1; }
  .rebake-btn:hover:not(:disabled) {
    color: var(--amber-400);
    border-color: rgba(245, 158, 11, 0.5);
  }
  .rebake-btn:active:not(:disabled) { transform: scale(0.97); }
  .rebake-btn:disabled {
    opacity: 0.5; cursor: wait;
    border-style: dashed;
  }
  .rebake-btn.rebaking::before {
    animation: rebake-spin 1s linear infinite;
    display: inline-block;
  }
  @keyframes rebake-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* === Global motion + a11y polish (Phase 3) ============================
     The bake tool is a working surface — voice directors spend long
     stretches in it. We honor reduced-motion globally (not just on the
     director's note) and make focus-visible rings explicit on every
     interactive control. Per masonic-style: amber-400 ring at 2px,
     not the browser default blue.
     =================================================================== */
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }

  /* Keyboard focus — every interactive control gets the same amber ring
     when it was focused via keyboard (not click). The default browser
     ring is blue, which would violate the amber-only constraint. */
  button:focus-visible,
  select:focus-visible,
  input:focus-visible,
  textarea:focus-visible,
  details > summary:focus-visible,
  a:focus-visible {
    outline: 2px solid var(--amber-400);
    outline-offset: 2px;
  }
  /* Tag chips already have a tight border; offset their ring so it
     doesn't crowd the chip outline. */
  .tag-chip:focus-visible {
    outline-offset: 1px;
  }


  /* === Director's Note (Phase 1 redesign) ============================
     The panel is a workbench, not a control panel. Hierarchy is:
       1. Spoken text (the hero)        — large textarea, elevated surface
       2. Parameter rail (the tools)    — single-control-per-cell grid
       3. Primary CTA (Try these)       — only solid amber on the panel
     Profile + summary chrome live in the header strip; the tag palette
     hides behind a "+ Insert tag" disclosure beneath the textarea so the
     editor is what the eye lands on.
     Amber-600 is reserved for the CTA. Amber-400 marks focus + the
     summary tag when overrides are pinned. Everything else is zinc.
     ====================================================================== */
  .director-note {
    margin-top: 0.6em;
    background: var(--surface-card);
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    overflow: hidden;
    transition: border-color 150ms ease;
  }
  .director-note[open] { border-color: var(--zinc-700); }
  /* Header strip — title + summary tag + profile compact row */
  .director-note > summary {
    list-style: none;
    cursor: pointer; user-select: none;
    display: flex; align-items: center; gap: 0.65rem;
    padding: 0.7rem 0.95rem;
    transition: background 150ms ease;
  }
  .director-note > summary::-webkit-details-marker { display: none; }
  .director-note > summary::before {
    content: "▸"; color: var(--zinc-600);
    font-size: 0.85em; line-height: 1;
    transition: transform 150ms ease, color 150ms ease;
    display: inline-block; width: 1ch;
  }
  .director-note[open] > summary::before {
    transform: rotate(90deg); color: var(--zinc-400);
  }
  .director-note > summary:hover { background: rgba(255, 255, 255, 0.015); }
  .director-note .dn-title {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 0.78em; font-weight: 600;
    color: var(--zinc-300);
    text-transform: uppercase; letter-spacing: 0.18em;
  }
  .director-note .summary-tag {
    margin-left: auto;
    font-family: 'Lato', sans-serif;
    font-size: 0.78em;
    color: var(--zinc-500);
    font-style: italic;
  }
  .director-note[open] .summary-tag { color: var(--zinc-400); }
  .director-note[open] .summary-tag.has-overrides { color: var(--amber-400); font-style: normal; }
  .director-note .summary-tag.has-overrides { color: var(--amber-500); font-style: normal; }

  /* Content frame — opens beneath the summary */
  .dn-content {
    display: flex; flex-direction: column;
    gap: 1rem;
    padding: 0.5rem 1rem 1rem;
    border-top: 1px solid var(--zinc-800);
  }

  /* Eyebrow — uppercase tracked label used for every field heading */
  .dn-eyebrow {
    display: inline-block;
    font: 600 0.7em/1 'Lato', system-ui, sans-serif;
    color: var(--zinc-500);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  /* Profile compact row — single line, tucked at top */
  .dn-profile-row {
    display: flex; align-items: center; gap: 0.5rem;
    flex-wrap: wrap;
  }
  .dn-profile-row .dn-eyebrow { margin-right: 0.15rem; }
  .director-note-profile-select {
    background: var(--zinc-900);
    color: var(--zinc-200);
    border: 1px solid var(--zinc-800);
    border-radius: 6px;
    padding: 0.4em 0.55em;
    font: 0.85em/1.2 'Lato', sans-serif;
    min-width: 200px;
    flex: 1 1 240px;
    cursor: pointer;
    transition: border-color 120ms ease;
  }
  .director-note-profile-select:hover,
  .director-note-profile-select:focus { border-color: var(--amber-500); outline: none; }
  .save-profile-btn, .delete-profile-btn {
    background: transparent;
    border: 1px solid var(--zinc-800);
    color: var(--zinc-400);
    padding: 0.4em 0.75em;
    border-radius: 6px;
    cursor: pointer;
    font: 0.78em/1 'Lato', sans-serif;
    transition: color 120ms ease, border-color 120ms ease;
  }
  .save-profile-btn:hover { color: var(--amber-400); border-color: var(--zinc-700); }
  .delete-profile-btn:hover:not(:disabled) { color: var(--error); border-color: rgba(248, 113, 113, 0.4); }
  .delete-profile-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  /* Hero — spoken text + tag disclosure. The textarea is the visual focus. */
  .dn-hero {
    background: var(--surface-elevated);
    border: 1px solid var(--zinc-800);
    border-radius: 8px;
    padding: 0.85rem 0.95rem;
    display: flex; flex-direction: column; gap: 0.55rem;
  }
  .dn-hero-header {
    display: flex; align-items: baseline; justify-content: space-between;
    gap: 0.5rem;
  }
  .speakas-reset-btn {
    background: transparent;
    border: 1px solid var(--zinc-800);
    color: var(--zinc-400);
    padding: 0.3em 0.7em;
    border-radius: 5px; cursor: pointer;
    font: 0.74em/1 'Lato', sans-serif;
    transition: color 120ms ease, border-color 120ms ease;
  }
  .speakas-reset-btn:hover { color: var(--amber-400); border-color: var(--zinc-700); }
  .director-note-speakas-textarea {
    width: 100%; box-sizing: border-box;
    min-height: 7em; max-height: 18em; resize: vertical;
    background: var(--zinc-950);
    color: var(--zinc-100);
    border: 1px solid var(--zinc-800);
    border-radius: 6px;
    padding: 0.65rem 0.8rem;
    font: 15px/1.55 'Lato', system-ui, sans-serif;
    transition: border-color 120ms ease, background 120ms ease;
  }
  .director-note-speakas-textarea::placeholder { color: var(--zinc-500); font-style: italic; }
  .director-note-speakas-textarea:focus {
    border-color: var(--amber-500); outline: none;
    background: #0a0a0c;
  }

  /* Tag-palette disclosure — collapsed by default; opens beneath textarea.
     Anchor flush-left so it reads as a control on the textarea, not a
     centered floater. */
  .dn-tag-disclosure { margin-top: 0.1rem; align-self: flex-start; }
  .dn-tag-disclosure > summary {
    list-style: none;
    cursor: pointer; user-select: none;
    display: inline-flex; align-items: center; gap: 0.4em;
    color: var(--zinc-400);
    font: 0.78em/1 'Lato', sans-serif;
    padding: 0.35em 0.5em 0.35em 0;
    transition: color 120ms ease;
  }
  .dn-tag-disclosure > summary::-webkit-details-marker { display: none; }
  .dn-tag-disclosure > summary::before {
    content: "+";
    font: 1em ui-monospace, 'SF Mono', monospace;
    width: 1em; text-align: center;
    color: var(--zinc-500);
    transition: color 120ms ease;
  }
  .dn-tag-disclosure[open] > summary::before { content: "−"; color: var(--amber-400); }
  .dn-tag-disclosure > summary:hover { color: var(--zinc-200); }
  .dn-tag-disclosure > summary:hover::before { color: var(--zinc-300); }
  .dn-tag-tray {
    margin-top: 0.55rem;
    background: var(--zinc-950);
    border: 1px solid var(--zinc-800);
    border-radius: 6px;
    padding: 0.65rem 0.8rem;
  }
  .tag-group {
    display: flex; align-items: baseline; gap: 0.6rem; flex-wrap: wrap;
    padding: 0.3rem 0;
  }
  .tag-group + .tag-group {
    border-top: 1px dashed var(--zinc-800);
    margin-top: 0.15rem; padding-top: 0.5rem;
  }
  .tag-group-label {
    flex: 0 0 9.5rem;
    color: var(--zinc-500);
    font: 600 0.68em/1.2 'Lato', sans-serif;
    text-transform: uppercase; letter-spacing: 0.08em;
  }
  .tag-group-chips { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .tag-chip {
    background: var(--zinc-900);
    border: 1px solid var(--zinc-800);
    color: var(--zinc-300);
    padding: 0.22em 0.65em;
    border-radius: 12px;
    cursor: pointer;
    font: 0.76em/1.2 ui-monospace, 'SF Mono', Menlo, monospace;
    transition: background 100ms ease, color 100ms ease, border-color 100ms ease;
  }
  .tag-chip:hover {
    background: var(--zinc-800);
    color: var(--zinc-100);
    border-color: var(--zinc-700);
  }
  .tag-chip:active { transform: scale(0.97); }
  .director-note-speakas-hint {
    margin: 0.55rem 0 0;
    color: var(--zinc-500);
    font: italic 0.74em/1.55 'Lato', sans-serif;
  }

  /* Parameter grid — one control per cell. Custom prose appears only
     when the user selects "(custom prose)" in the dropdown.            */
  .dn-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 0.85rem 1rem;
  }
  .dn-cell { display: flex; flex-direction: column; gap: 0.3rem; min-width: 0; }
  .dn-cell.dn-cell-wide { grid-column: 1 / -1; }
  .dn-cell select,
  .dn-cell input[type="text"],
  .dn-cell textarea {
    background: var(--zinc-900);
    color: var(--zinc-200);
    border: 1px solid var(--zinc-800);
    border-radius: 6px;
    padding: 0.45em 0.6em;
    font: 13px/1.5 'Lato', system-ui, sans-serif;
    width: 100%; box-sizing: border-box;
    transition: border-color 120ms ease;
  }
  .dn-cell select { cursor: pointer; }
  .dn-cell select:hover, .dn-cell select:focus,
  .dn-cell input:hover, .dn-cell input:focus,
  .dn-cell textarea:hover, .dn-cell textarea:focus {
    border-color: var(--amber-500); outline: none;
  }
  .dn-cell input::placeholder, .dn-cell textarea::placeholder {
    color: var(--zinc-500); font-style: italic;
  }
  .dn-cell textarea { min-height: 3.2em; max-height: 10em; resize: vertical; line-height: 1.5; }
  /* Custom-prose input revealed only when select is at "__custom__" */
  .dn-cell-custom { display: none; }
  .dn-cell.dn-cell--custom-open .dn-cell-custom { display: block; }

  /* Temperature row — the only cell with multiple controls */
  .director-note-temp-display {
    margin-left: auto;
    font: 700 0.92em/1 ui-monospace, 'SF Mono', monospace;
    color: var(--amber-400);
  }
  .dn-cell .dn-temp-head { display: flex; align-items: center; gap: 0.5rem; }
  .director-note-temp-slider {
    width: 100%;
    accent-color: var(--amber-500);
    cursor: pointer;
  }
  .director-note-temp-controls {
    display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
  }
  .director-note-temp-reset {
    background: transparent;
    border: 1px solid var(--zinc-800);
    color: var(--zinc-400);
    padding: 0.3em 0.7em;
    border-radius: 5px; cursor: pointer;
    font: 0.74em/1 'Lato', sans-serif;
    transition: color 120ms ease, border-color 120ms ease;
  }
  .director-note-temp-reset:hover { color: var(--amber-400); border-color: var(--zinc-700); }
  .director-note-temp-hint {
    color: var(--zinc-500);
    font: 0.7em/1 ui-monospace, 'SF Mono', monospace;
  }

  /* Action bar — Info on left, quiet utilities, primary CTA on right */
  .dn-actions {
    display: flex; gap: 0.6rem; flex-wrap: wrap;
    align-items: center;
    padding-top: 0.55rem;
    border-top: 1px solid var(--zinc-800);
  }
  .director-note-info {
    margin-right: auto;
    font: 0.78em/1.4 'Lato', sans-serif;
    color: var(--zinc-500);
  }
  /* Quiet buttons — apply-to and clear share one shape, zinc only. */
  .reset-overrides-btn,
  .apply-to-flagged-btn,
  .apply-to-role-btn {
    background: transparent;
    border: 1px solid var(--zinc-800);
    color: var(--zinc-400);
    padding: 0.5em 0.85em;
    border-radius: 6px; cursor: pointer;
    font: 0.82em/1 'Lato', sans-serif;
    transition: color 120ms ease, border-color 120ms ease;
  }
  .reset-overrides-btn:hover,
  .apply-to-flagged-btn:hover,
  .apply-to-role-btn:hover {
    color: var(--zinc-100);
    border-color: var(--zinc-700);
  }
  /* Primary CTA — solid amber-600, the only filled button on the panel.
     Matches src/app/page.tsx's "Upload .mram File" treatment.           */
  .try-overrides-btn {
    background: var(--amber-600);
    border: 1px solid var(--amber-600);
    color: #fff;
    padding: 0.55em 1.15em;
    border-radius: 7px; cursor: pointer;
    font: 600 0.88em/1 'Lato', sans-serif;
    transition: background 120ms ease, transform 80ms ease;
    display: inline-flex; align-items: center; gap: 0.4em;
  }
  .try-overrides-btn:hover:not(:disabled) { background: var(--amber-500); border-color: var(--amber-500); }
  .try-overrides-btn:active:not(:disabled) { transform: scale(0.97); }
  .try-overrides-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .try-overrides-btn.rebaking { background: var(--amber-500); }
  .try-overrides-btn.rebaking::before {
    content: "↻"; display: inline-block; font-size: 1em;
    animation: rebake-spin 1s linear infinite;
  }

  /* Honor reduced-motion — disable all transitions/animations on the
     Director's note when the user prefers less motion.                  */
  @media (prefers-reduced-motion: reduce) {
    .director-note,
    .director-note *,
    .director-note *::before,
    .director-note *::after {
      transition: none !important;
      animation: none !important;
    }
  }
  /* Bulk-rebake button in the status filter row — shape matches the
     bulk-approve button it sits next to. Uses amber-quiet (matches
     the per-line .rebake-btn hover) so the regenerate action reads
     as the same family across the page. */
  .filter-shortcut.bulk-rebake {
    border-color: rgba(245, 158, 11, 0.35);
    color: var(--amber-400);
  }
  .filter-shortcut.bulk-rebake:hover:not(:disabled) {
    background: rgba(245, 158, 11, 0.08);
    border-color: rgba(245, 158, 11, 0.55);
    color: var(--amber-300);
  }
  .filter-shortcut.bulk-rebake::before {
    content: "↻ "; display: inline-block;
  }
  .filter-shortcut.bulk-rebake.rebaking::before {
    animation: rebake-spin 1s linear infinite;
  }
  .note-area {
    margin-top: 0.5em;
    background: var(--zinc-950);
    border: 1px solid var(--zinc-800);
    border-radius: 8px;
    padding: 0.6em 0.75em;
    transition: border-color 100ms;
  }
  .note-area:focus-within {
    border-color: rgba(245, 158, 11, 0.4);
  }
  .note-area textarea {
    width: 100%; min-height: 3em; max-height: 14em;
    background: transparent; border: none;
    color: var(--zinc-200);
    font: 14px/1.5 'Lato', system-ui, sans-serif;
    resize: vertical; outline: none;
    padding: 0;
  }
  .note-area textarea::placeholder {
    color: var(--zinc-500); font-style: italic;
  }
  .note-saved-indicator {
    font-size: 0.72em; color: var(--zinc-500);
    font-family: ui-monospace, monospace;
    margin-top: 0.4em; min-height: 1em;
  }
  .note-saved-indicator.saved { color: var(--good); }
  .note-saved-indicator.error { color: var(--error); }
  .kbd-hint {
    color: var(--zinc-500);
    font-size: 0.78em;
    font-family: ui-monospace, monospace;
    margin-left: 0.5em;
  }
  .kbd-hint kbd {
    background: var(--zinc-900);
    border: 1px solid var(--zinc-800);
    border-radius: 3px;
    padding: 0.1em 0.4em;
    font-family: ui-monospace, monospace;
    font-size: 0.85em;
    color: var(--zinc-300);
    margin: 0 0.1em;
  }
</style>
</head>
<body>
<header>
  <div class="header-inner">
    <h1>Bake Preview <span style="color: var(--zinc-500); font-weight: 400; font-family: 'Lato', sans-serif; font-size: 0.65em; letter-spacing: 0; margin-left: 0.5em;">rituals/</span></h1>
    <div class="meta" id="header-meta">Loading…</div>
    <div class="session-row" id="session-row"></div>
    <div class="ritual-tabs" id="tabs"></div>
  </div>
</header>
<main>
  <div id="content" class="empty">Select a ritual above.</div>
</main>
<script>
  // === STT-01 Tier 1: Director's note voice catalog ===
  // Gemini TTS voices grouped by gender-leaning. Within each group, ordered
  // roughly by descriptor (firm/lower → soft/higher). The "Used" group up
  // top shows voices already pinned to roles in this project so Shannon
  // can compare deviations against the existing cast at a glance.
  const VOICE_CATALOG = {
    "Male-leaning (used in this project)": [
      { name: "Alnilam", desc: "Firm, lower-mid pitch (WM)" },
      { name: "Charon", desc: "Informative, lower pitch (SW)" },
      { name: "Enceladus", desc: "Deep, weighted (JW / Narrator)" },
      { name: "Algenib", desc: "Gravelly, lower pitch (SD)" },
      { name: "Orus", desc: "Firm, decisive (JD)" },
      { name: "Iapetus", desc: "Clear, articulate (Sec)" },
      { name: "Schedar", desc: "Even, steady (Trs)" },
      { name: "Achird", desc: "Friendly, lower-mid (Ch / Q)" },
      { name: "Fenrir", desc: "Excitable (Marshal)" },
      { name: "Rasalgethi", desc: "Distinctive male (Steward)" },
      { name: "Zubenelgenubi", desc: "Casual, distinctive male (Candidate / A)" },
    ],
    "Male-leaning (untried)": [
      { name: "Puck", desc: "Upbeat" },
      { name: "Algieba", desc: "Smooth, lower pitch" },
      { name: "Umbriel", desc: "Easy-going" },
      { name: "Sadaltager", desc: "Knowledgeable" },
      { name: "Gacrux", desc: "Mature" },
    ],
    "Female-leaning (for diagnostic A/B only)": [
      { name: "Aoede", desc: "Breezy, mid pitch" },
      { name: "Kore", desc: "Firm" },
      { name: "Leda", desc: "Youthful" },
      { name: "Autonoe", desc: "Bright, mid pitch" },
      { name: "Callirrhoe", desc: "Easy-going, mid" },
      { name: "Despina", desc: "Smooth" },
      { name: "Erinome", desc: "Clear" },
      { name: "Pulcherrima", desc: "Forward" },
      { name: "Vindemiatrix", desc: "Gentle" },
      { name: "Sadachbia", desc: "Lively" },
      { name: "Sulafat", desc: "Warm" },
      { name: "Zephyr", desc: "Bright" },
      { name: "Achernar", desc: "Soft, higher pitch" },
      { name: "Laomedeia", desc: "Upbeat" },
    ],
  };
  // Style / Pace / Accent options match the Google AI Studio voice playground.
  const STYLE_OPTIONS = [
    { value: "", label: "(default)" },
    { value: "Vocal Smile", label: "Vocal Smile — bright, sunny, inviting" },
    { value: "Newscaster", label: "Newscaster — professional, broadcast cadence" },
    { value: "Whisper", label: "Whisper — intimate, breathy" },
    { value: "Empathetic", label: "Empathetic — warm, soft, gentle inflections" },
    { value: "Promo/Hype", label: "Promo/Hype — high energy, punchy" },
    { value: "Deadpan", label: "Deadpan — flat, dry delivery" },
    { value: "Ceremonial", label: "Ceremonial — measured, formal, weighted" },
    { value: "Authoritative", label: "Authoritative — firm, commanding" },
  ];
  const PACE_OPTIONS = [
    { value: "", label: "(default)" },
    { value: "Natural", label: "Natural — conversational" },
    { value: "Rapid Fire", label: "Rapid Fire — fast, energetic" },
    { value: "The Drift", label: "The Drift — slow, long pauses" },
    { value: "Staccato", label: "Staccato — short, clipped" },
    { value: "Measured", label: "Measured — deliberate, ceremonial" },
  ];
  const ACCENT_OPTIONS = [
    { value: "", label: "(default)" },
    { value: "American", label: "American" },
    { value: "British", label: "British" },
    { value: "Scottish", label: "Scottish" },
    { value: "Irish", label: "Irish" },
    { value: "Australian", label: "Australian" },
    { value: "Mid-Atlantic", label: "Mid-Atlantic" },
  ];
  // Inline-tag palette for the spoken-text editor. Tags are inserted
  // verbatim at the cursor — Gemini 3.1 Flash TTS interprets bracketed
  // English directives like [whispered], [pause], [solemnly] inside the
  // transcript. ALM Corp guidance: use deliberately, not on every line —
  // over-tagging destabilizes delivery. Replicate guidance: any descriptive
  // English tag works; test new tags before relying on them.
  const RITUAL_TAG_PALETTE = [
    { group: "Pauses", tags: ["[pause]", "[short pause]", "[long pause]", "[breath]", "[deep breath]"] },
    { group: "Solemn / ritual gravity", tags: ["[solemnly]", "[reverently]", "[gravely]", "[with gravitas]", "[slowly]"] },
    { group: "Volume", tags: ["[whispered]", "[softly]", "[quietly]", "[firmly]", "[boldly]"] },
    { group: "Warmth", tags: ["[warmly]", "[kindly]", "[fraternally]"] },
    { group: "Stern / charge", tags: ["[sternly]", "[exhorting]", "[admonishing]", "[authoritatively]"] },
    { group: "Catechism", tags: ["[questioningly]", "[matter-of-factly]", "[answering plainly]"] },
    { group: "Reflection", tags: ["[reflectively]", "[thoughtfully]", "[meditatively]"] },
    { group: "Reluctance / oath", tags: ["[reluctantly]", "[hesitantly]", "[resolutely]"] },
    { group: "Special delivery", tags: ["[chanted]", "[intoned]", "[as if reciting from memory]", "[announcing]", "[proclaiming]"] },
    { group: "Mechanical", tags: ["[clears throat]", "[sighs]"] },
  ];
  // Gemini TTS model picker — pin a single model for this rebake.
  // "(default chain)" lets the env-var chain pick (skipping degraded models).
  const MODEL_OPTIONS = [
    { value: "", label: "(default chain — env-var driven)" },
    { value: "gemini-3.1-flash-tts-preview", label: "gemini-3.1-flash-tts-preview (premium)" },
    { value: "gemini-2.5-flash-preview-tts", label: "gemini-2.5-flash-preview-tts (faster fallback)" },
    { value: "gemini-2.5-pro-preview-tts", label: "gemini-2.5-pro-preview-tts (slower, possibly higher quality)" },
  ];

  const state = {
    rituals: [],
    activeSlug: null,
    activeDoc: null,
    showCipher: false,
    // STT-01 Tier 2b: session = parallel-bake. "" or null = canonical
    // (rituals/), otherwise rituals/_sessions/{name}/.
    activeSession: "",
    allSessions: [],
    // Set of engine keys currently visible. null means "all visible"
    // (e.g. before any filter has been touched, or after Reset).
    engineFilter: null,
    // STT-01 Step 1: autoplay sequence (space + arrows). Persisted to
    // localStorage so it survives reloads. currentLineId is the line
    // whose audio last started or was selected via keyboard.
    autoplay: false,
    currentLineId: null,
    // Set of role names currently visible. Behaves like engineFilter:
    // null = uninitialized; on ritual switch, new roles auto-add as visible.
    roleFilter: null,
    // STT-01 Step 2: review sidecar state. { lines: { [id]: { status, note,
    // audioHash, approvedAt, flaggedAt } } }. Loaded from /api/ritual/{slug}/review.
    review: { lines: {} },
    // STT-01 Step 3: status filter — Set of statuses currently visible.
    // null = uninitialized (default to all on first render).
    statusFilter: null,
  };

  async function init() {
    try {
      // Load sessions list first, then rituals for the active session.
      await refreshSessions();
      await loadRitualsForActiveSession();
      renderSessionRow();
      renderTabs();
      // Auto-select first ritual that decrypted successfully
      const first = state.rituals.find(r => r.decrypted);
      if (first) selectRitual(first.slug);
    } catch (e) {
      document.getElementById("header-meta").innerHTML = '<span class="err">Error: ' + e.message + '</span>';
    }
  }

  async function refreshSessions() {
    try {
      const r = await fetch("/api/sessions").then(r => r.json());
      state.allSessions = r.sessions || [];
    } catch { state.allSessions = []; }
  }

  async function loadRitualsForActiveSession() {
    const res = await fetch(withSession("/api/rituals"));
    const data = await res.json();
    state.rituals = data.rituals;
    const meta = document.getElementById("header-meta");
    const dirLabel = state.activeSession ? "rituals/_sessions/" + state.activeSession + "/" : "rituals/";
    if (!data.passphraseSet) {
      meta.innerHTML = '<span class="err">MRAM_PASSPHRASE not set — restart with the env var to view ritual structure.</span>';
    } else if (state.rituals.length === 0) {
      meta.textContent = "No .mram files in " + dirLabel + ".";
    } else {
      const total = state.rituals.reduce((n, r) => n + (r.lineCount || 0), 0);
      meta.textContent = state.rituals.length + " ritual(s), " + total + " spoken line(s) total in " + dirLabel;
    }
  }

  function renderSessionRow() {
    const el = document.getElementById("session-row");
    if (!el) return;
    const isCanonical = !state.activeSession;
    const opts = ['<option value="">Canonical</option>']
      .concat(state.allSessions.map(s => {
        const sel = s.name === state.activeSession ? ' selected' : '';
        return '<option value="' + escapeHtml(s.name) + '"' + sel + '>' + escapeHtml(s.name) + '</option>';
      }));
    el.innerHTML =
      '<span class="session-label">Session:</span>' +
      '<select id="session-select">' + opts.join('') + '</select>' +
      '<button type="button" id="session-new-btn" title="Create a new session by branching from the current one">+ New session</button>' +
      (isCanonical ? '' :
        '<button type="button" id="session-promote-btn" class="session-action session-promote" title="Copy this session’s files into canonical (overwrites — auto-backs up first)">Promote to canonical</button>' +
        '<button type="button" id="session-delete-btn" class="session-action session-delete" title="Delete this session and all its ritual copies (the bake-cache is preserved)">Delete session</button>'
      ) +
      '<span id="session-form-host"></span>';
    document.getElementById("session-select").addEventListener("change", async (e) => {
      const target = e.target.value;
      state.activeSession = target;
      state.activeDoc = null;
      state.activeSlug = null;
      state.engineFilter = null;
      state.roleFilter = null;
      state.statusFilter = null;
      state.review = { lines: {} };
      state.currentLineId = null;
      try {
        await loadRitualsForActiveSession();
        renderSessionRow();
        renderTabs();
        const first = state.rituals.find(r => r.decrypted);
        if (first) await selectRitual(first.slug);
        else document.getElementById("content").innerHTML = '<div class="empty">No rituals in this session.</div>';
      } catch (err) {
        document.getElementById("content").innerHTML = '<div class="empty err">Error: ' + escapeHtml(err.message) + '</div>';
      }
    });
    document.getElementById("session-new-btn").addEventListener("click", () => showNewSessionForm());
    if (!isCanonical) {
      document.getElementById("session-promote-btn").addEventListener("click", () => promoteCurrentSession());
      document.getElementById("session-delete-btn").addEventListener("click", () => deleteCurrentSession());
    }
  }

  function showNewSessionForm() {
    const host = document.getElementById("session-form-host");
    if (!host) return;
    if (host.querySelector("input")) {
      host.innerHTML = "";
      return;
    }
    const branchFromLabel = state.activeSession ? state.activeSession : "canonical";
    host.innerHTML =
      '<span class="session-form">' +
      '<input id="session-new-name" type="text" placeholder="session-name" maxlength="64">' +
      '<label class="session-form-checkbox" title="If checked, branch from canonical instead of the active session"><input type="checkbox" id="session-new-from-canonical"' + (state.activeSession ? '' : ' checked disabled') + '> from canonical</label>' +
      '<button type="button" id="session-new-create">Create from ' + escapeHtml(branchFromLabel) + '</button>' +
      '<button type="button" id="session-new-cancel" class="session-cancel">Cancel</button>' +
      '<span id="session-new-msg"></span>' +
      '</span>';
    document.getElementById("session-new-cancel").addEventListener("click", () => { host.innerHTML = ""; });
    document.getElementById("session-new-create").addEventListener("click", async () => {
      const nameInput = document.getElementById("session-new-name");
      const fromCanonical = document.getElementById("session-new-from-canonical").checked;
      const msg = document.getElementById("session-new-msg");
      const name = (nameInput.value || "").trim().toLowerCase().replace(/\s+/g, "-");
      if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(name)) {
        msg.textContent = "✗ name must be 1–64 chars, [a-z0-9_-]";
        msg.className = "session-err";
        return;
      }
      msg.textContent = "creating…";
      msg.className = "";
      try {
        const branchFrom = fromCanonical ? "" : state.activeSession;
        const res = await fetch("/api/sessions/" + encodeURIComponent(name), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ branchFrom }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || res.statusText);
        }
        const data = await res.json();
        msg.textContent = "✓ created (" + data.filesCopied + " files)";
        msg.className = "session-ok";
        // Switch to the new session
        await refreshSessions();
        state.activeSession = name;
        state.activeDoc = null;
        state.activeSlug = null;
        state.engineFilter = null;
        state.roleFilter = null;
        state.statusFilter = null;
        state.review = { lines: {} };
        await loadRitualsForActiveSession();
        renderSessionRow();
        renderTabs();
        const first = state.rituals.find(r => r.decrypted);
        if (first) await selectRitual(first.slug);
      } catch (err) {
        msg.textContent = "✗ " + (err.message || "create failed");
        msg.className = "session-err";
      }
    });
    const nameInputEl = document.getElementById("session-new-name");
    if (nameInputEl && nameInputEl.focus) nameInputEl.focus();
  }

  async function promoteCurrentSession() {
    if (!state.activeSession) return;
    const ok = window.confirm(
      'Promote session "' + state.activeSession + '" to canonical?\\n\\n' +
      'This OVERWRITES the canonical .mram files. The current canonical will be auto-backed up to rituals/_sessions/_pre-promote-{ISO}/ first, so you can roll back if needed.'
    );
    if (!ok) return;
    try {
      const res = await fetch("/api/sessions/" + encodeURIComponent(state.activeSession) + "/promote", { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || res.statusText);
      }
      const data = await res.json();
      alert("✓ promoted to canonical (" + data.filesCopied + " files). Backup at rituals/_sessions/" + data.backupDir + "/. The session is still here — you can keep tweaking it or delete it.");
      // Refresh in case canonical's review state has changed semantically
      await refreshSessions();
      renderSessionRow();
    } catch (err) {
      alert("✗ promote failed: " + (err.message || ""));
    }
  }

  async function deleteCurrentSession() {
    if (!state.activeSession) return;
    const ok = window.confirm(
      'Delete session "' + state.activeSession + '"? This removes its directory and all .mram + review files in it. The bake-cache and canonical are untouched.'
    );
    if (!ok) return;
    try {
      const res = await fetch("/api/sessions/" + encodeURIComponent(state.activeSession), { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || res.statusText);
      }
      // Switch back to canonical
      state.activeSession = "";
      state.activeDoc = null;
      state.activeSlug = null;
      state.engineFilter = null;
      state.roleFilter = null;
      state.statusFilter = null;
      state.review = { lines: {} };
      await refreshSessions();
      await loadRitualsForActiveSession();
      renderSessionRow();
      renderTabs();
      const first = state.rituals.find(r => r.decrypted);
      if (first) await selectRitual(first.slug);
    } catch (err) {
      alert("✗ delete failed: " + (err.message || ""));
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
      // Fetch ritual detail and review sidecar in parallel — sidecar is
      // tiny so this never blocks render meaningfully.
      const [docRes, reviewRes] = await Promise.all([
        fetch(withSession("/api/ritual/" + encodeURIComponent(slug))),
        fetch(withSession("/api/ritual/" + encodeURIComponent(slug) + "/review")),
      ]);
      if (!docRes.ok) {
        const err = await docRes.json().catch(() => ({}));
        throw new Error(err.error || docRes.statusText);
      }
      state.activeDoc = await docRes.json();
      state.review = reviewRes.ok ? await reviewRes.json() : { lines: {} };
      if (!state.review.lines) state.review.lines = {};
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

    // Build per-role filter group. Roles come from spoken lines only
    // (stage actions don't have a role and aren't subject to this filter).
    const roleCounts = {};
    for (const l of doc.lines) {
      if (l.action || !l.role) continue;
      roleCounts[l.role] = (roleCounts[l.role] || 0) + 1;
    }
    const roleKeys = Object.keys(roleCounts).sort();
    if (!state.roleFilter) {
      state.roleFilter = new Set(roleKeys);
    } else {
      for (const r of roleKeys) {
        if (!state.roleFilter.has(r)) state.roleFilter.add(r);
      }
    }
    const rolePills = roleKeys.map(r => {
      const checked = state.roleFilter.has(r) ? ' checked' : '';
      return '<label class="role-filter">' +
        '<input type="checkbox" data-role="' + escapeHtml(r) + '"' + checked + '> ' +
        '<span class="role-pill">' + escapeHtml(r) + '<span class="count">' + roleCounts[r] + '</span></span>' +
        '</label>';
    }).join('');

    html += '<div class="controls">' +
      '<label><input type="checkbox" id="show-cipher"' + (state.showCipher ? ' checked' : '') + '> Show cipher text</label>' +
      '<label><input type="checkbox" id="hide-action"> Hide stage actions</label>' +
      '<label><input type="checkbox" id="expand-all-details"> Expand all line details</label>' +
      '<label><input type="checkbox" id="autoplay-sequence"' + (state.autoplay ? ' checked' : '') + '> Autoplay sequence</label>' +
      '<button type="button" id="jump-to-current" title="Scroll back to whichever line is currently playing — autoplay no longer auto-scrolls so the page stays still while audio advances">Jump to current</button>' +
      '<span class="kbd-hint"><kbd>Space</kbd> play/pause &middot; <kbd>&uarr;</kbd><kbd>&darr;</kbd> nav &middot; <kbd>a</kbd> approve &middot; <kbd>f</kbd> flag-review &middot; <kbd>r</kbd> flag-regen &middot; <kbd>n</kbd> note &middot; <kbd>shift</kbd>+click Rebake = with voice anchor</span>' +
      '</div>';
    if (filterPills) {
      html += '<div class="controls engine-filters">' +
        '<span class="filter-label">Engine:</span>' + filterPills +
        '<button type="button" id="filter-only-google" class="filter-shortcut">Only Google</button>' +
        '<button type="button" id="filter-only-gemini" class="filter-shortcut">Only Gemini</button>' +
        '<button type="button" id="filter-reset" class="filter-shortcut">Show all</button>' +
        '</div>';
    }
    if (rolePills) {
      html += '<div class="controls role-filters">' +
        '<span class="filter-label">Role:</span>' + rolePills +
        '<button type="button" id="role-filter-show-all" class="filter-shortcut">Show all</button>' +
        '<button type="button" id="role-filter-hide-all" class="filter-shortcut">Hide all</button>' +
        '</div>';
    }

    // Status filter — counts come from state.review.lines, defaulting
    // any missing line to "unmarked". Only spoken/audio lines count.
    const statusKeys = ["unmarked", "flagged-review", "flagged-regen", "approved"];
    const statusCounts = { "unmarked": 0, "flagged-review": 0, "flagged-regen": 0, "approved": 0 };
    let approvableCount = 0;
    for (const l of doc.lines) {
      if (l.action || !l.hasAudio) continue;
      approvableCount++;
      const entry = (state.review.lines || {})[String(l.id)];
      const s = (entry && entry.status) || "unmarked";
      if (statusCounts[s] !== undefined) statusCounts[s]++;
    }
    if (!state.statusFilter) state.statusFilter = new Set(statusKeys);
    const statusLabels = {
      "unmarked": "unmarked",
      "flagged-review": "flag-review",
      "flagged-regen": "flag-regen",
      "approved": "approved",
    };
    const statusPillsHtml = statusKeys.map(s => {
      const checked = state.statusFilter.has(s) ? ' checked' : '';
      return '<label class="status-filter">' +
        '<input type="checkbox" data-status="' + s + '"' + checked + '> ' +
        '<span class="status-pill status-' + s + '" style="cursor:default">' + escapeHtml(statusLabels[s]) + '<span class="status-count">' + statusCounts[s] + '</span></span>' +
        '</label>';
    }).join('');
    const flaggedRegenCount = statusCounts["flagged-regen"];
    html += '<div class="controls status-filters">' +
      '<span class="filter-label">Review:</span>' + statusPillsHtml +
      '<button type="button" id="status-filter-flagged" class="filter-shortcut">Only flagged</button>' +
      '<button type="button" id="status-filter-unmarked" class="filter-shortcut">Only unmarked</button>' +
      '<button type="button" id="status-filter-show-all" class="filter-shortcut">Show all</button>' +
      '<button type="button" id="bulk-approve-unmarked" class="filter-shortcut bulk-approve" title="Approve every unmarked line in this ritual">Approve all unmarked (' + statusCounts.unmarked + ')</button>' +
      '<button type="button" id="bulk-rebake-flagged-regen" class="filter-shortcut bulk-rebake" title="Rebake every line currently flagged-regen, using each line’s director-note overrides where set">Rebake all flagged-regen (' + flaggedRegenCount + ')</button>' +
      '</div>';
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
    function applyAllFilters() {
      // Combined engine + role + status filter. A line is visible only
      // if it passes all three. Stage-action / no-audio rows have no
      // engine class, no data-role, and no status — they pass all three
      // filters by default and are hidden only via the explicit "Hide
      // stage actions" toggle.
      document.querySelectorAll(".line").forEach(el => {
        // Engine check: derive from line-{engine} class.
        let lineEngine = null;
        for (const cls of el.classList) {
          if (cls.startsWith("line-") && cls !== "line-action" && cls !== "line-no-audio") {
            lineEngine = cls.slice(5);
            break;
          }
        }
        const engineOk = !lineEngine || (state.engineFilter && state.engineFilter.has(lineEngine));
        // Role check: derive from data-role attribute.
        const role = el.dataset.role || null;
        const roleOk = !role || !state.roleFilter || state.roleFilter.has(role);
        // Status check: spoken+audio lines have a status pill; lookup
        // the line in state.review.lines.
        const lineId = el.dataset.lineId;
        let statusOk = true;
        if (lineId && el.querySelector('.status-pill')) {
          const entry = (state.review.lines || {})[String(lineId)];
          const status = (entry && entry.status) || "unmarked";
          statusOk = !state.statusFilter || state.statusFilter.has(status);
        }
        el.style.display = (engineOk && roleOk && statusOk) ? "grid" : "none";
      });
    }

    // Per-engine checkbox toggles
    document.querySelectorAll(".engine-filters input[data-engine]").forEach(cb => {
      cb.addEventListener("change", e => {
        const eng = e.target.dataset.engine;
        if (e.target.checked) state.engineFilter.add(eng);
        else state.engineFilter.delete(eng);
        applyAllFilters();
      });
    });
    // Quick-action shortcuts: Only Google / Only Gemini / Show all
    const setEngineFilter = (engines) => {
      state.engineFilter = new Set(engines);
      // Sync the checkboxes
      document.querySelectorAll(".engine-filters input[data-engine]").forEach(cb => {
        cb.checked = state.engineFilter.has(cb.dataset.engine);
      });
      applyAllFilters();
    };
    const onlyGoogleBtn = document.getElementById("filter-only-google");
    if (onlyGoogleBtn) onlyGoogleBtn.addEventListener("click", () => setEngineFilter(["google-cloud-tts"]));
    const onlyGeminiBtn = document.getElementById("filter-only-gemini");
    if (onlyGeminiBtn) onlyGeminiBtn.addEventListener("click", () => setEngineFilter(["gemini-flash-tts"]));
    const resetBtn = document.getElementById("filter-reset");
    if (resetBtn) resetBtn.addEventListener("click", () => setEngineFilter(Object.keys(doc.engineCounts || {})));

    // Per-role checkbox toggles
    document.querySelectorAll(".role-filters input[data-role]").forEach(cb => {
      cb.addEventListener("change", e => {
        const role = e.target.dataset.role;
        if (e.target.checked) state.roleFilter.add(role);
        else state.roleFilter.delete(role);
        applyAllFilters();
      });
    });
    const setRoleFilter = (roles) => {
      state.roleFilter = new Set(roles);
      document.querySelectorAll(".role-filters input[data-role]").forEach(cb => {
        cb.checked = state.roleFilter.has(cb.dataset.role);
      });
      applyAllFilters();
    };
    const roleShowAllBtn = document.getElementById("role-filter-show-all");
    if (roleShowAllBtn) roleShowAllBtn.addEventListener("click", () => setRoleFilter(roleKeys));
    const roleHideAllBtn = document.getElementById("role-filter-hide-all");
    if (roleHideAllBtn) roleHideAllBtn.addEventListener("click", () => setRoleFilter([]));

    // Status filter — per-status checkbox toggles
    document.querySelectorAll(".status-filters input[data-status]").forEach(cb => {
      cb.addEventListener("change", e => {
        const s = e.target.dataset.status;
        if (e.target.checked) state.statusFilter.add(s);
        else state.statusFilter.delete(s);
        applyAllFilters();
      });
    });
    const setStatusFilter = (statuses) => {
      state.statusFilter = new Set(statuses);
      document.querySelectorAll(".status-filters input[data-status]").forEach(cb => {
        cb.checked = state.statusFilter.has(cb.dataset.status);
      });
      applyAllFilters();
    };
    const statusFlaggedBtn = document.getElementById("status-filter-flagged");
    if (statusFlaggedBtn) statusFlaggedBtn.addEventListener("click", () => setStatusFilter(["flagged-review", "flagged-regen"]));
    const statusUnmarkedBtn = document.getElementById("status-filter-unmarked");
    if (statusUnmarkedBtn) statusUnmarkedBtn.addEventListener("click", () => setStatusFilter(["unmarked"]));
    const statusShowAllBtn = document.getElementById("status-filter-show-all");
    if (statusShowAllBtn) statusShowAllBtn.addEventListener("click", () => setStatusFilter(statusKeys));

    // Bulk approve all unmarked
    const bulkApproveBtn = document.getElementById("bulk-approve-unmarked");
    if (bulkApproveBtn) {
      bulkApproveBtn.addEventListener("click", async () => {
        const unmarkedLines = doc.lines.filter(l => {
          if (l.action || !l.hasAudio) return false;
          const entry = (state.review.lines || {})[String(l.id)];
          const s = (entry && entry.status) || "unmarked";
          return s === "unmarked";
        });
        if (unmarkedLines.length === 0) {
          alert("No unmarked lines to approve.");
          return;
        }
        const ok = window.confirm("Approve all " + unmarkedLines.length + " unmarked line(s) in this ritual? Already-flagged or already-approved lines will not be touched.");
        if (!ok) return;
        bulkApproveBtn.disabled = true;
        bulkApproveBtn.textContent = "Approving 0/" + unmarkedLines.length + "…";
        let done = 0;
        for (const l of unmarkedLines) {
          try {
            await updateLineReview(l.id, { status: "approved" });
          } catch (err) {
            console.error("approve line " + l.id + " failed:", err);
          }
          done++;
          bulkApproveBtn.textContent = "Approving " + done + "/" + unmarkedLines.length + "…";
        }
        // Re-render so status filter counts and chip colors are correct
        renderRitual();
      });
    }

    // === STT-01 Step 1: autoplay + keyboard nav ===
    const autoplayCheckbox = document.getElementById("autoplay-sequence");
    if (autoplayCheckbox) {
      autoplayCheckbox.addEventListener("change", e => {
        state.autoplay = e.target.checked;
        try { localStorage.setItem("preview-bake.autoplay", state.autoplay ? "1" : "0"); } catch (_) {}
      });
    }
    // Jump-to-current button — opt back into following the playhead after
    // the user has scrolled away. Autoplay-advance no longer auto-scrolls,
    // so this is the explicit way to re-sync.
    const jumpBtn = document.getElementById("jump-to-current");
    if (jumpBtn) {
      jumpBtn.addEventListener("click", () => {
        if (state.currentLineId == null) return;
        const el = document.querySelector('.line[data-line-id="' + state.currentLineId + '"]');
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }

    // Wire each audio: pause-others on play, mark current line, advance on end.
    // Two events for defense-in-depth on the pause-others side:
    //  - "play" fires when .play() is called (queued, may have brief lag)
    //  - "playing" fires when the audio actually begins producing sound
    // Listening to both kills overlap windows when the user rapid-clicks
    // multiple play buttons.
    document.querySelectorAll(".line audio").forEach(audio => {
      const lineEl = audio.closest(".line");
      const onStart = () => {
        pauseAllExcept(audio);
        if (lineEl) setCurrentLine(lineEl.dataset.lineId);
      };
      audio.addEventListener("play", onStart);
      audio.addEventListener("playing", onStart);
      audio.addEventListener("ended", () => {
        if (!state.autoplay) return;
        if (!lineEl) return;
        const visible = getVisibleLineElsWithAudio();
        const idx = lineIndexById(visible, lineEl.dataset.lineId);
        const next = idx >= 0 ? visible[idx + 1] : null;
        if (next) playLineByEl(next);
      });
    });

    // Restore current-line marker after re-render (e.g. cipher toggle).
    if (state.currentLineId != null) {
      const el = document.querySelector('.line[data-line-id="' + state.currentLineId + '"]');
      if (el) el.classList.add("is-current");
    }

    // === STT-01 Step 2: status pill click + note toggle + note save ===
    document.querySelectorAll(".status-pill[data-line-id]").forEach(pill => {
      pill.addEventListener("click", async (e) => {
        e.stopPropagation();
        const lineId = pill.dataset.lineId;
        const next = nextStatus(currentStatus(lineId));
        await updateLineReview(lineId, { status: next });
      });
    });
    document.querySelectorAll(".note-toggle[data-line-id]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const lineId = btn.dataset.lineId;
        const noteArea = document.querySelector('.note-area[data-line-id="' + lineId + '"]');
        if (!noteArea) return;
        const willOpen = noteArea.hasAttribute("hidden");
        if (willOpen) {
          noteArea.removeAttribute("hidden");
          const ta = noteArea.querySelector("textarea");
          if (ta) ta.focus();
        } else {
          noteArea.setAttribute("hidden", "");
        }
      });
    });
    // Rebake button — POST /api/ritual/{slug}/rebake/line/{id}, then refresh
    // the audio src with a cache-busting query so the player reloads.
    document.querySelectorAll(".rebake-btn[data-line-id]").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const lineId = btn.dataset.lineId;
        // Shift-click → force preamble (helps on short lines that normally
        // skip the voice-cast role card).
        const forcePreamble = e.shiftKey;
        const slug = state.activeSlug;
        if (!slug || !lineId) return;
        btn.disabled = true;
        btn.classList.add("rebaking");
        const originalText = btn.textContent;
        btn.textContent = forcePreamble ? "Rebaking (anchored)…" : "Rebaking…";
        try {
          const res = await fetch(withSession("/api/ritual/" + encodeURIComponent(slug) + "/rebake/line/" + encodeURIComponent(lineId)), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ forcePreamble }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || res.statusText);
          }
          const data = await res.json();
          // Refresh the audio src to bust the browser cache. Append a query
          // param tied to the new audioHash so the <audio> element reloads.
          const lineEl = document.querySelector('.line[data-line-id="' + lineId + '"]');
          if (lineEl) {
            const audio = lineEl.querySelector("audio");
            if (audio) {
              const baseSrc = "/api/ritual/" + encodeURIComponent(slug) + "/line/" + encodeURIComponent(lineId) + ".opus";
              audio.src = withSession(baseSrc + "?h=" + encodeURIComponent(data.audioHash || Date.now()));
              audio.load();
            }
          }
          // Refetch review sidecar (server may have demoted approved → unmarked)
          // Update local state's audioHash for this line so the stale-pill
          // logic stays accurate.
          if (state.activeDoc && state.activeDoc.lines) {
            const docLine = state.activeDoc.lines.find(l => String(l.id) === String(lineId));
            if (docLine) docLine.audioHash = data.audioHash;
          }
          try {
            const sc = await fetch(withSession("/api/ritual/" + encodeURIComponent(slug) + "/review")).then(r => r.json());
            state.review = sc;
            if (!state.review.lines) state.review.lines = {};
          } catch { /* swallow — local state still mostly correct */ }
          refreshLineReviewWidgets(lineId);
          // Brief success flash
          btn.textContent = data.preambleUsed ? "✓ rebaked (anchored)" : "✓ rebaked";
          setTimeout(() => {
            if (btn) {
              btn.disabled = false;
              btn.classList.remove("rebaking");
              btn.textContent = originalText;
            }
          }, 1800);
        } catch (err) {
          btn.textContent = "✗ " + (err.message || "rebake failed");
          btn.classList.remove("rebaking");
          setTimeout(() => {
            if (btn) {
              btn.disabled = false;
              btn.textContent = originalText;
            }
          }, 3000);
        }
      });
    });
    // === STT-01 Tier 2a: Profile dropdown + Save/Delete buttons ===
    document.querySelectorAll(".director-note-profile-select[data-line-id]").forEach(sel => {
      const lineId = sel.dataset.lineId;
      const det = sel.closest(".director-note");
      const delBtn = det && det.querySelector(".delete-profile-btn");
      // Disable Delete unless a profile is selected.
      const updateDeleteBtn = () => {
        if (delBtn) delBtn.disabled = !sel.value;
      };
      updateDeleteBtn();
      sel.addEventListener("change", () => {
        const name = sel.value;
        if (!name) {
          updateDeleteBtn();
          return;
        }
        const profiles = readProfiles();
        const p = profiles[name];
        if (!p) return;
        // Apply this profile to the line: fill all four override dropdowns
        // and persist to localStorage. We DO NOT auto-rebake — user clicks
        // Try when ready.
        const overrides = profileSettingsToOverrides(p);
        writeDirectorNote(state.activeSlug, lineId, overrides);
        if (det) {
          // Sync each combobox cell to the loaded profile. If the loaded
          // value matches a preset option, select it directly. Otherwise
          // open the cell in custom mode and fill the prose input.
          det.querySelectorAll('select[data-field]').forEach(s => {
            const field = s.dataset.field;
            const value = (overrides && overrides[field]) || "";
            const cell = s.closest('.dn-cell');
            const customInput = cell ? cell.querySelector('input.dn-cell-custom[data-field="' + field + '"]') : null;
            const presetOpt = Array.from(s.options).find(o => o.value === value && o.value !== '__custom__');
            if (value && !presetOpt) {
              // Custom prose value
              s.value = '__custom__';
              if (cell) cell.classList.add('dn-cell--custom-open');
              if (customInput) customInput.value = value;
            } else {
              s.value = value;
              if (cell) cell.classList.remove('dn-cell--custom-open');
              if (customInput) customInput.value = "";
            }
          });
          updateSummaryTag(lineId);
        }
        const info = document.querySelector('.director-note-info[data-line-id="' + lineId + '"]');
        if (info) {
          info.textContent = 'loaded profile: ' + name + ' — click Try to render';
          setTimeout(() => { if (info && info.textContent.startsWith('loaded profile')) info.textContent = ''; }, 2400);
        }
        updateDeleteBtn();
      });
    });
    document.querySelectorAll(".save-profile-btn[data-line-id]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const lineId = btn.dataset.lineId;
        const stored = readDirectorNote(state.activeSlug, lineId);
        if (Object.keys(stored).length === 0) {
          alert("This line has no overrides set. Pick voice/style/pace/accent first, then save as profile.");
          return;
        }
        const desc = describeOverrides(stored);
        const suggested = (stored.voiceOverride ? stored.voiceOverride + " " : "") +
                          (stored.styleOverride || "Custom") + " profile";
        const name = (window.prompt(
          "Save these settings as a profile?\\n\\n" + desc + "\\n\\nName:",
          suggested
        ) || "").trim();
        if (!name) return;
        if (name.length > 64) {
          alert("Profile name too long (max 64 chars).");
          return;
        }
        const existing = readProfiles();
        if (existing[name]) {
          if (!window.confirm("Profile \\"" + name + "\\" already exists. Overwrite?")) return;
        }
        saveProfile(name, stored);
        // Refresh all profile dropdowns in the page so the new profile is
        // immediately selectable everywhere.
        document.querySelectorAll(".director-note-profile-select").forEach(sel => {
          const cur = sel.value;
          const profiles = readProfiles();
          const opts = ['<option value="">(no profile)</option>'].concat(
            Object.keys(profiles).sort().map(n => '<option value="' + n.replace(/"/g, '&quot;') + '"' + (n === cur ? ' selected' : '') + '>' + n.replace(/</g, '&lt;') + '</option>')
          );
          sel.innerHTML = opts.join('');
        });
        // Set THIS line's profile dropdown to the just-saved name
        const sel = document.querySelector('.director-note-profile-select[data-line-id="' + lineId + '"]');
        if (sel) {
          sel.value = name;
          const det = sel.closest(".director-note");
          const delBtn = det && det.querySelector(".delete-profile-btn");
          if (delBtn) delBtn.disabled = false;
        }
        const info = document.querySelector('.director-note-info[data-line-id="' + lineId + '"]');
        if (info) {
          info.textContent = "✓ saved profile: " + name;
          setTimeout(() => { if (info) info.textContent = ''; }, 2400);
        }
      });
    });
    document.querySelectorAll(".delete-profile-btn[data-line-id]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const lineId = btn.dataset.lineId;
        const sel = document.querySelector('.director-note-profile-select[data-line-id="' + lineId + '"]');
        if (!sel || !sel.value) return;
        const name = sel.value;
        if (!window.confirm('Delete profile "' + name + '" globally? This cannot be undone.')) return;
        deleteProfile(name);
        // Refresh ALL profile dropdowns; if any line had this profile selected, clear it.
        document.querySelectorAll(".director-note-profile-select").forEach(s => {
          const wasSelected = s.value === name;
          const profiles = readProfiles();
          const opts = ['<option value="">(no profile)</option>'].concat(
            Object.keys(profiles).sort().map(n => '<option value="' + n.replace(/"/g, '&quot;') + '">' + n.replace(/</g, '&lt;') + '</option>')
          );
          s.innerHTML = opts.join('');
          if (wasSelected) s.value = "";
          const det = s.closest(".director-note");
          const dBtn = det && det.querySelector(".delete-profile-btn");
          if (dBtn) dBtn.disabled = !s.value;
        });
        const info = document.querySelector('.director-note-info[data-line-id="' + lineId + '"]');
        if (info) {
          info.textContent = "✓ deleted profile: " + name;
          setTimeout(() => { if (info) info.textContent = ''; }, 2400);
        }
      });
    });

    // === Director's note dropdowns + combobox-with-custom inputs ===
    // Each parameter cell has one select. Style/Pace/Accent/Model selects
    // include a final "__custom__" option that reveals a free-text input
    // below; voice + temperature have no custom mode.
    //   - Picking a preset: save it, hide + clear the custom input.
    //   - Picking "__custom__": don't save yet — wait for user to type;
    //     reveal the input + focus it. If a custom prose value is already
    //     stored, keep it and pre-fill the input.
    //   - Typing in the custom input: save the prose, ensure the select
    //     stays at "__custom__" so the cell stays open.
    document.querySelectorAll(".director-note select[data-field]").forEach(sel => {
      sel.addEventListener("change", () => {
        const lineId = sel.dataset.lineId;
        const field = sel.dataset.field;
        const cell = sel.closest('.dn-cell');
        const customInput = cell ? cell.querySelector('input.dn-cell-custom[data-field="' + field + '"]') : null;
        const stored = readDirectorNote(state.activeSlug, lineId);
        if (sel.value === "__custom__") {
          if (cell) cell.classList.add('dn-cell--custom-open');
          if (customInput) {
            // If the stored value is already a custom-prose override,
            // keep it; otherwise start blank and let the user type.
            const existing = stored[field] || "";
            customInput.value = existing;
            customInput.focus();
          }
        } else {
          if (cell) cell.classList.remove('dn-cell--custom-open');
          if (customInput) customInput.value = "";
          stored[field] = sel.value || undefined;
          writeDirectorNote(state.activeSlug, lineId, stored);
        }
        updateSummaryTag(lineId);
      });
    });
    document.querySelectorAll(".director-note .director-note-prose[data-field]").forEach(input => {
      input.addEventListener("input", () => {
        const lineId = input.dataset.lineId;
        const field = input.dataset.field;
        const value = input.value.trim();
        const stored = readDirectorNote(state.activeSlug, lineId);
        stored[field] = value || undefined;
        writeDirectorNote(state.activeSlug, lineId, stored);
        // For combobox cells: keep select at "__custom__" while the user
        // is typing — that's the visible state. profileOverride and
        // speakAsOverride are textarea-only and have no paired select.
        if (input.classList.contains('dn-cell-custom')) {
          const sel = document.querySelector('.director-note select[data-field="' + field + '"][data-line-id="' + lineId + '"]');
          if (sel && sel.value !== '__custom__') sel.value = '__custom__';
        }
        updateSummaryTag(lineId);
      });
    });
    function updateSummaryTag(lineId) {
      const det = document.querySelector('.director-note[data-line-id="' + lineId + '"]');
      if (!det) return;
      const tag = det.querySelector('.summary-tag');
      if (!tag) return;
      const desc = describeOverrides(readDirectorNote(state.activeSlug, lineId));
      // Toggle has-overrides so CSS can switch from italic-zinc placeholder
      // to amber pinned-overrides label.
      if (desc) {
        tag.textContent = desc;
        tag.classList.add('has-overrides');
      } else {
        tag.textContent = 'no overrides';
        tag.classList.remove('has-overrides');
      }
    }

    // Temperature slider — live updates the displayed value AND persists.
    document.querySelectorAll(".director-note-temp-slider[data-line-id]").forEach(slider => {
      slider.addEventListener("input", () => {
        const lineId = slider.dataset.lineId;
        const val = parseFloat(slider.value);
        const display = document.querySelector('.director-note-temp-display[data-line-id="' + lineId + '"]');
        if (display) display.textContent = val.toFixed(2);
        const stored = readDirectorNote(state.activeSlug, lineId);
        stored.temperature = val;
        writeDirectorNote(state.activeSlug, lineId, stored);
        updateSummaryTag(lineId);
      });
    });
    // "Use API default" button — clears the stored temperature so the
    // request omits the field entirely (Gemini uses its own default).
    document.querySelectorAll(".director-note-temp-reset[data-line-id]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const lineId = btn.dataset.lineId;
        const stored = readDirectorNote(state.activeSlug, lineId);
        delete stored.temperature;
        writeDirectorNote(state.activeSlug, lineId, stored);
        const display = document.querySelector('.director-note-temp-display[data-line-id="' + lineId + '"]');
        if (display) display.textContent = "(API default)";
        const slider = document.querySelector('.director-note-temp-slider[data-line-id="' + lineId + '"]');
        if (slider) slider.value = "1";
        updateSummaryTag(lineId);
      });
    });
    // === STT-01 Tier 1: Bulk-apply director's note settings ===
    // Source line's director-note settings are read from localStorage and
    // copied into localStorage for each target line. No rebake yet — that's
    // a separate explicit step (the "Rebake all flagged-regen" button).
    function applyDirectorNoteToTargets(sourceLineId, targetLineIds, scopeLabel) {
      if (targetLineIds.length === 0) {
        alert("No target lines for scope: " + scopeLabel);
        return;
      }
      const rawSourceSettings = readDirectorNote(state.activeSlug, sourceLineId);
      // speakAsOverride is line-specific text — never copy it to siblings
      // (different lines have different transcripts). Style/voice/pace/etc.
      // are the cross-line settings.
      const { speakAsOverride: droppedSpeakAs, ...sourceSettings } = rawSourceSettings;
      if (Object.keys(sourceSettings).length === 0) {
        alert("Source line has no shareable director-note overrides set. Pick a voice/style/pace/accent first, then apply. (Tagged spoken text is per-line and isn’t copied.)");
        return;
      }
      const settingsDesc = describeOverrides(sourceSettings);
      const droppedNotice = droppedSpeakAs ? "\\n\\nNote: tagged spoken text stays on the source line only." : "";
      const ok = window.confirm(
        "Apply these settings to " + targetLineIds.length + " " + scopeLabel + " line(s)?\\n\\n" +
        "Settings: " + settingsDesc + droppedNotice + "\\n\\n" +
        "This only copies the settings. Use 'Rebake all flagged-regen' afterward to render them."
      );
      if (!ok) return;
      let applied = 0;
      for (const tid of targetLineIds) {
        if (String(tid) === String(sourceLineId)) continue; // don't overwrite source
        // Preserve any existing speakAsOverride on the target — only the
        // shareable settings get overwritten.
        const existing = readDirectorNote(state.activeSlug, tid);
        const merged = { ...sourceSettings };
        if (existing.speakAsOverride) merged.speakAsOverride = existing.speakAsOverride;
        writeDirectorNote(state.activeSlug, tid, merged);
        applied++;
      }
      // Re-render so each director-note panel reflects the new settings.
      renderRitual();
      const sourceInfo = document.querySelector('.director-note-info[data-line-id="' + sourceLineId + '"]');
      if (sourceInfo) {
        sourceInfo.textContent = "✓ Applied to " + applied + " " + scopeLabel + " line(s). Use 'Rebake all flagged-regen' to render.";
      }
    }

    document.querySelectorAll(".apply-to-flagged-btn[data-line-id]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const sourceLineId = btn.dataset.lineId;
        const targets = doc.lines
          .filter(l => {
            if (l.action || !l.hasAudio) return false;
            const entry = (state.review.lines || {})[String(l.id)];
            const s = (entry && entry.status) || "unmarked";
            return s === "flagged-regen";
          })
          .map(l => l.id);
        applyDirectorNoteToTargets(sourceLineId, targets, "flagged-regen");
      });
    });
    document.querySelectorAll(".apply-to-role-btn[data-line-id]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const sourceLineId = btn.dataset.lineId;
        const sourceRole = btn.dataset.sourceRole;
        const targets = doc.lines
          .filter(l => !l.action && l.hasAudio && l.role === sourceRole)
          .map(l => l.id);
        applyDirectorNoteToTargets(sourceLineId, targets, "role " + sourceRole);
      });
    });

    // === Bulk rebake: every flagged-regen line, sequentially ===
    const bulkRebakeBtn = document.getElementById("bulk-rebake-flagged-regen");
    if (bulkRebakeBtn) {
      bulkRebakeBtn.addEventListener("click", async () => {
        const flaggedRegen = doc.lines.filter(l => {
          if (l.action || !l.hasAudio) return false;
          const entry = (state.review.lines || {})[String(l.id)];
          return (entry && entry.status) === "flagged-regen";
        });
        if (flaggedRegen.length === 0) {
          alert("No lines currently flagged-regen.");
          return;
        }
        // Surface how many target lines have director-note overrides vs.
        // will use role defaults (with forcePreamble true on overrides).
        let withOverrides = 0;
        for (const l of flaggedRegen) {
          const o = readDirectorNote(state.activeSlug, l.id);
          if (Object.keys(o).length > 0) withOverrides++;
        }
        const ok = window.confirm(
          "Rebake " + flaggedRegen.length + " flagged-regen line(s)?\\n\\n" +
          withOverrides + " have director-note overrides; " + (flaggedRegen.length - withOverrides) + " will use role defaults (with preamble forced).\\n\\n" +
          "Each rebake takes 5–15 seconds. Total ~" + Math.ceil(flaggedRegen.length * 8 / 60) + " minute(s). The .mram is auto-backed up before each write."
        );
        if (!ok) return;
        bulkRebakeBtn.disabled = true;
        bulkRebakeBtn.classList.add("rebaking");
        const original = bulkRebakeBtn.textContent;
        let done = 0;
        let failed = 0;
        for (const l of flaggedRegen) {
          const overrides = readDirectorNote(state.activeSlug, l.id);
          const payload = { forcePreamble: true, ...overrides };
          bulkRebakeBtn.textContent = "Rebaking " + (done + failed + 1) + "/" + flaggedRegen.length + "…";
          try {
            const res = await fetch(withSession("/api/ritual/" + encodeURIComponent(state.activeSlug) + "/rebake/line/" + encodeURIComponent(l.id)), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
            const data = await res.json();
            // Refresh this line's audio src in place
            const lineEl = document.querySelector('.line[data-line-id="' + l.id + '"]');
            if (lineEl) {
              const audio = lineEl.querySelector("audio");
              if (audio) {
                const baseSrc = "/api/ritual/" + encodeURIComponent(state.activeSlug) + "/line/" + encodeURIComponent(l.id) + ".opus";
                audio.src = withSession(baseSrc + "?h=" + encodeURIComponent(data.audioHash || Date.now()));
                audio.load();
              }
              const docLine = doc.lines.find(x => x.id === l.id);
              if (docLine) docLine.audioHash = data.audioHash;
            }
            done++;
          } catch (e) {
            console.error("Bulk rebake line " + l.id + " failed:", e);
            failed++;
          }
        }
        // Refetch review sidecar once at the end (each rebake updates it)
        try {
          const sc = await fetch(withSession("/api/ritual/" + encodeURIComponent(state.activeSlug) + "/review")).then(r => r.json());
          state.review = sc;
          if (!state.review.lines) state.review.lines = {};
        } catch { /* swallow */ }
        // Re-render so all line widgets reflect new state (status pills, hashes).
        renderRitual();
        const summary = "Done. " + done + " rebaked" + (failed > 0 ? ", " + failed + " failed" : "") + ".";
        alert(summary);
      });
    }

    // === Inline tag palette: insert at cursor in the speakAs textarea ===
    document.querySelectorAll(".tag-chip[data-tag][data-line-id]").forEach(chip => {
      chip.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        const lineId = chip.dataset.lineId;
        const tag = chip.dataset.tag || "";
        const ta = document.querySelector('textarea.director-note-speakas-textarea[data-line-id="' + lineId + '"]');
        if (!ta) return;
        const start = ta.selectionStart ?? ta.value.length;
        const end = ta.selectionEnd ?? ta.value.length;
        const before = ta.value.slice(0, start);
        const after = ta.value.slice(end);
        // Surround with single spaces if neighboring chars aren't already
        // whitespace — keeps tags from glomming onto adjacent words.
        const needsLeadSpace = before.length > 0 && !/\s$/.test(before);
        const needsTrailSpace = after.length > 0 && !/^\s/.test(after);
        const insert = (needsLeadSpace ? " " : "") + tag + (needsTrailSpace ? " " : "");
        ta.value = before + insert + after;
        const cursor = before.length + insert.length;
        ta.focus();
        ta.setSelectionRange(cursor, cursor);
        // Persist via the existing input-handler path
        ta.dispatchEvent(new Event("input", { bubbles: true }));
      });
    });
    // === Reset speakAs textarea to the original line text ===
    // Clears stored.speakAsOverride and restores the textarea to l.plain.
    // Other director-note overrides are untouched.
    document.querySelectorAll(".speakas-reset-btn[data-line-id]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const lineId = btn.dataset.lineId;
        const ta = document.querySelector('textarea.director-note-speakas-textarea[data-line-id="' + lineId + '"]');
        if (!ta) return;
        const docLine = (state.activeDoc && state.activeDoc.lines)
          ? state.activeDoc.lines.find(l => String(l.id) === String(lineId))
          : null;
        const original = (docLine && docLine.plain) || "";
        ta.value = original;
        const stored = readDirectorNote(state.activeSlug, lineId);
        delete stored.speakAsOverride;
        writeDirectorNote(state.activeSlug, lineId, stored);
        updateSummaryTag(lineId);
      });
    });
    document.querySelectorAll(".reset-overrides-btn[data-line-id]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const lineId = btn.dataset.lineId;
        writeDirectorNote(state.activeSlug, lineId, {});
        const det = document.querySelector('.director-note[data-line-id="' + lineId + '"]');
        if (det) {
          det.querySelectorAll('select[data-field]').forEach(s => { s.value = ""; });
          det.querySelectorAll('.director-note-prose[data-field]').forEach(inp => { inp.value = ""; });
          // Close any cells currently in custom-prose mode
          det.querySelectorAll('.dn-cell--custom-open').forEach(c => c.classList.remove('dn-cell--custom-open'));
          const slider = det.querySelector('.director-note-temp-slider');
          if (slider) slider.value = "1";
          const tempDisplay = det.querySelector('.director-note-temp-display');
          if (tempDisplay) tempDisplay.textContent = "(API default)";
          updateSummaryTag(lineId);
        }
        const info = document.querySelector('.director-note-info[data-line-id="' + lineId + '"]');
        if (info) info.textContent = 'cleared — using role defaults';
        setTimeout(() => { if (info) info.textContent = ''; }, 1800);
      });
    });
    document.querySelectorAll(".try-overrides-btn[data-line-id]").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const lineId = btn.dataset.lineId;
        const slug = state.activeSlug;
        if (!slug || !lineId) return;
        const stored = readDirectorNote(slug, lineId);
        const info = document.querySelector('.director-note-info[data-line-id="' + lineId + '"]');
        // Force preamble when overriding voice — short lines especially
        // benefit from the role-card context, and overrides are
        // experimental anyway.
        const payload = { forcePreamble: true, ...stored };
        btn.disabled = true;
        btn.classList.add("rebaking");
        const original = btn.textContent;
        btn.textContent = "Rebaking…";
        if (info) info.textContent = 'rendering with overrides…';
        try {
          const res = await fetch(withSession("/api/ritual/" + encodeURIComponent(slug) + "/rebake/line/" + encodeURIComponent(lineId)), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || res.statusText);
          }
          const data = await res.json();
          // Refresh audio + state same as the regular Rebake button
          const lineEl = document.querySelector('.line[data-line-id="' + lineId + '"]');
          if (lineEl) {
            const audio = lineEl.querySelector("audio");
            if (audio) {
              const baseSrc = "/api/ritual/" + encodeURIComponent(slug) + "/line/" + encodeURIComponent(lineId) + ".opus";
              audio.src = withSession(baseSrc + "?h=" + encodeURIComponent(data.audioHash || Date.now()));
              audio.load();
            }
          }
          if (state.activeDoc && state.activeDoc.lines) {
            const docLine = state.activeDoc.lines.find(l => String(l.id) === String(lineId));
            if (docLine) docLine.audioHash = data.audioHash;
          }
          try {
            const sc = await fetch(withSession("/api/ritual/" + encodeURIComponent(slug) + "/review")).then(r => r.json());
            state.review = sc;
            if (!state.review.lines) state.review.lines = {};
          } catch { /* swallow */ }
          refreshLineReviewWidgets(lineId);
          btn.textContent = "✓ rebaked";
          if (info) {
            const usedParts = [];
            if (data.voiceUsed) usedParts.push("voice: " + data.voiceUsed);
            if (data.styleUsed) usedParts.push("style: " + data.styleUsed);
            if (data.temperatureUsed !== undefined && data.temperatureUsed !== "(API default)") usedParts.push("temp: " + data.temperatureUsed);
            if (data.modelUsed && data.modelUsed !== "(chain default)") usedParts.push("model: " + data.modelUsed);
            info.textContent = "✓ rendered (" + usedParts.join(", ") + ")";
          }
          setTimeout(() => {
            if (btn) {
              btn.disabled = false;
              btn.classList.remove("rebaking");
              btn.textContent = original;
            }
          }, 1800);
        } catch (err) {
          btn.textContent = "✗ failed";
          btn.classList.remove("rebaking");
          if (info) info.textContent = "✗ " + (err.message || "rebake failed");
          setTimeout(() => {
            if (btn) {
              btn.disabled = false;
              btn.textContent = original;
            }
          }, 3000);
        }
      });
    });

    document.querySelectorAll(".note-area textarea").forEach(ta => {
      const lineId = ta.closest(".note-area").dataset.lineId;
      ta.addEventListener("blur", async () => {
        const note = ta.value;
        const indicator = document.querySelector('.note-saved-indicator[data-line-id="' + lineId + '"]');
        if (indicator) { indicator.textContent = "saving…"; indicator.className = "note-saved-indicator"; }
        try {
          await updateLineReview(lineId, { note });
          if (indicator) {
            indicator.textContent = "saved";
            indicator.className = "note-saved-indicator saved";
            setTimeout(() => { if (indicator) indicator.textContent = ""; }, 1500);
          }
        } catch (err) {
          if (indicator) {
            indicator.textContent = "save failed: " + (err.message || "");
            indicator.className = "note-saved-indicator error";
          }
        }
      });
    });
  }

  // === STT-01 Step 1: helper functions hoisted to script scope so the
  // global keydown handler can call them across re-renders. ===

  function setCurrentLine(lineId, opts) {
    state.currentLineId = lineId;
    document.querySelectorAll(".line.is-current").forEach(el => el.classList.remove("is-current"));
    if (lineId == null) return;
    const el = document.querySelector('.line[data-line-id="' + lineId + '"]');
    if (el) {
      el.classList.add("is-current");
      // Scroll into view ONLY when the caller explicitly requests it.
      // Autoplay-advance and audio play/playing events update the indicator
      // but leave the scroll position alone — the user might be auditing
      // a different line while audio plays. Keyboard nav passes scroll: true
      // because that IS the user asking to navigate.
      if (opts && opts.scroll) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }

  function pauseAllExcept(audio) {
    document.querySelectorAll(".line audio").forEach(a => {
      if (a !== audio && !a.paused) a.pause();
    });
  }

  function getVisibleLineElsWithAudio() {
    return Array.from(document.querySelectorAll(".line[data-line-id]"))
      .filter(el => el.style.display !== "none" && el.querySelector("audio"));
  }

  function lineIndexById(visible, id) {
    return visible.findIndex(el => String(el.dataset.lineId) === String(id));
  }

  function playLineByEl(el, opts) {
    if (!el) return;
    const audio = el.querySelector("audio");
    if (!audio) return;
    // Synchronous pause-others BEFORE play() — kills the overlap window
    // that can otherwise let two audios start audibly during the queued
    // delay before the new audio's "play" event fires.
    pauseAllExcept(audio);
    setCurrentLine(el.dataset.lineId, opts);
    audio.play().catch(() => { /* autoplay-blocked or load error; ignore */ });
  }

  // === STT-01 Tier 1: Director's note storage (localStorage per slug+lineId) ===
  function dnKey(slug, lineId) {
    return "preview-bake.director-note." + slug + "." + lineId;
  }
  function readDirectorNote(slug, lineId) {
    try {
      const raw = localStorage.getItem(dnKey(slug, lineId));
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return {};
      return parsed;
    } catch { return {}; }
  }
  function writeDirectorNote(slug, lineId, obj) {
    try {
      const cleaned = {};
      for (const k of ["voiceOverride", "styleOverride", "paceOverride", "accentOverride", "profileOverride", "speakAsOverride", "modelOverride"]) {
        if (obj[k]) cleaned[k] = obj[k];
      }
      // Temperature is a number, not a string — preserve 0 as a real value.
      if (typeof obj.temperature === "number" && Number.isFinite(obj.temperature)) {
        cleaned.temperature = obj.temperature;
      }
      if (Object.keys(cleaned).length === 0) {
        localStorage.removeItem(dnKey(slug, lineId));
      } else {
        localStorage.setItem(dnKey(slug, lineId), JSON.stringify(cleaned));
      }
    } catch { /* localStorage may be blocked or full */ }
  }
  // === STT-01 Tier 2b: Session-aware fetch helper ===
  // Append ?session={state.activeSession} to any URL when on a non-canonical
  // session. Canonical is the empty/missing case — server-side default.
  function withSession(url) {
    if (!state.activeSession) return url;
    const sep = url.includes('?') ? '&' : '?';
    return url + sep + 'session=' + encodeURIComponent(state.activeSession);
  }

  // Returns the dropdown value if the stored override matches a preset
  // option, otherwise returns "" (so the dropdown renders unselected and
  // the prose textbox carries the user's custom text). Used at render
  // time so a re-render cleanly distinguishes preset vs custom input.
  function isPresetValue(options, storedValue) {
    if (!storedValue) return "";
    const match = options.find(o => o.value === storedValue);
    return match ? match.value : "";
  }

  function describeOverrides(stored) {
    const trunc = (s, n) => s && s.length > n ? s.slice(0, n - 1) + "…" : s;
    const parts = [];
    if (stored.voiceOverride) parts.push(stored.voiceOverride);
    if (stored.styleOverride) parts.push(trunc(stored.styleOverride, 30));
    if (stored.paceOverride) parts.push(trunc(stored.paceOverride, 30) + " pace");
    if (stored.accentOverride) parts.push(trunc(stored.accentOverride, 30));
    if (stored.profileOverride) parts.push("custom profile");
    if (stored.speakAsOverride) parts.push("tagged text");
    if (typeof stored.temperature === "number") parts.push("temp=" + stored.temperature.toFixed(2));
    if (stored.modelOverride) parts.push(trunc(stored.modelOverride.replace(/^gemini-/, ""), 25));
    return parts.join(" · ");
  }

  // === STT-01 Tier 2a: Saved director-note profiles ===
  // Profiles are global (not per-ritual): a useful "voice + style + pace +
  // accent" combo for one ritual is usually useful for others too. Stored
  // in localStorage at "preview-bake.profiles". Profile names are
  // free-form but trimmed + capped at 64 chars + duplicates blocked.
  const PROFILES_KEY = "preview-bake.profiles";
  function readProfiles() {
    try {
      const raw = localStorage.getItem(PROFILES_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return {};
      return parsed.profiles && typeof parsed.profiles === "object"
        ? parsed.profiles
        : {};
    } catch { return {}; }
  }
  function writeProfiles(profiles) {
    try {
      localStorage.setItem(PROFILES_KEY, JSON.stringify({ version: 1, profiles }));
    } catch { /* localStorage may be blocked or full */ }
  }
  function saveProfile(name, settings) {
    const profiles = readProfiles();
    const entry = {
      voiceOverride: settings.voiceOverride || "",
      styleOverride: settings.styleOverride || "",
      paceOverride: settings.paceOverride || "",
      accentOverride: settings.accentOverride || "",
      profileOverride: settings.profileOverride || "",
      modelOverride: settings.modelOverride || "",
    };
    if (typeof settings.temperature === "number") entry.temperature = settings.temperature;
    profiles[name] = entry;
    writeProfiles(profiles);
  }
  function deleteProfile(name) {
    const profiles = readProfiles();
    delete profiles[name];
    writeProfiles(profiles);
  }
  function profileSettingsToOverrides(p) {
    const o = {};
    if (p.voiceOverride) o.voiceOverride = p.voiceOverride;
    if (p.styleOverride) o.styleOverride = p.styleOverride;
    if (p.paceOverride) o.paceOverride = p.paceOverride;
    if (p.accentOverride) o.accentOverride = p.accentOverride;
    if (p.profileOverride) o.profileOverride = p.profileOverride;
    if (typeof p.temperature === "number") o.temperature = p.temperature;
    if (p.modelOverride) o.modelOverride = p.modelOverride;
    return o;
  }

  // === STT-01 Step 2: review state helpers ===
  // Cycle order: unmarked → flagged-review → flagged-regen → approved → unmarked
  const STATUS_ORDER = ["unmarked", "flagged-review", "flagged-regen", "approved"];

  function currentStatus(lineId) {
    const entry = (state.review.lines || {})[String(lineId)];
    return (entry && entry.status) || "unmarked";
  }

  function nextStatus(s) {
    const i = STATUS_ORDER.indexOf(s);
    return STATUS_ORDER[(i + 1) % STATUS_ORDER.length];
  }

  function findLineById(id) {
    return (state.activeDoc && state.activeDoc.lines || []).find(l => String(l.id) === String(id));
  }

  // Atomic update: PUT to server, on success update state and re-render
  // just the affected line's meta/note widgets (full ritual re-render is
  // overkill for a single status flip).
  async function updateLineReview(lineId, patch) {
    // When approving, attach the line's current audioHash so the server
    // can record what audio was approved. On the next render, if the
    // audio has been re-baked, the pill renders as "approved (stale)".
    if (patch.status === "approved") {
      const line = findLineById(lineId);
      if (line && line.audioHash) patch.audioHash = line.audioHash;
    }
    const slug = state.activeSlug;
    if (!slug) return;
    const res = await fetch(withSession("/api/ritual/" + encodeURIComponent(slug) + "/review/line/" + encodeURIComponent(lineId)), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(txt || ("HTTP " + res.status));
    }
    const updated = await res.json();
    if (!state.review.lines) state.review.lines = {};
    state.review.lines[String(lineId)] = updated;
    // Targeted DOM update: pill + note-toggle label, no full re-render.
    refreshLineReviewWidgets(lineId);
  }

  function refreshLineReviewWidgets(lineId) {
    const entry = state.review.lines[String(lineId)] || { status: "unmarked", note: "", audioHash: null };
    const line = findLineById(lineId);
    const pill = document.querySelector('.status-pill[data-line-id="' + lineId + '"]');
    if (pill) {
      const stale = entry.status === "approved" && entry.audioHash && line && line.audioHash && entry.audioHash !== line.audioHash;
      pill.className = "status-pill status-" + entry.status + (stale ? " stale" : "");
      pill.textContent = entry.status;
    }
    const btn = document.querySelector('.note-toggle[data-line-id="' + lineId + '"]');
    if (btn) {
      const noteLen = (entry.note || "").length;
      btn.classList.toggle("has-note", noteLen > 0);
      btn.textContent = noteLen > 0 ? ("📝 " + noteLen + " char" + (noteLen === 1 ? "" : "s")) : "📝 note";
    }
  }

  // Install global keyboard handler once. CAPTURE phase (third arg true)
  // so my preventDefault runs BEFORE the native audio element's default
  // space-to-toggle behavior. Otherwise clicking a play button focuses
  // the audio, and pressing space then triggers BOTH my handler (toggle
  // current line) AND the native audio control (toggle focused audio),
  // which de-syncs them when current line and focused audio differ.
  // The handler reads live DOM, so it remains correct across re-renders.
  if (!window.__previewBakeKeyboardInstalled) {
    window.__previewBakeKeyboardInstalled = true;
    document.addEventListener("keydown", e => {
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const visible = getVisibleLineElsWithAudio();
      if (visible.length === 0) return;
      const idx = state.currentLineId != null ? lineIndexById(visible, state.currentLineId) : -1;
      if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        e.stopPropagation();
        if (idx < 0) {
          // No current line yet — pick the first visible. User isn't
          // nav'ing to it deliberately; don't scroll. Indicator updates.
          playLineByEl(visible[0]);
        } else {
          const audio = visible[idx].querySelector("audio");
          if (audio) {
            if (audio.paused) {
              pauseAllExcept(audio);
              audio.play().catch(() => {});
            } else {
              audio.pause();
            }
          }
        }
      } else if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        const next = idx < 0 ? visible[0] : visible[idx + 1];
        if (next) playLineByEl(next, { scroll: true });
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        const prev = idx <= 0 ? null : visible[idx - 1];
        if (prev) playLineByEl(prev, { scroll: true });
      } else if (e.key === "a" || e.key === "A") {
        // Approve current line. No preventDefault on bare letter keys
        // unless we matched — let normal typing through.
        if (idx >= 0) {
          e.preventDefault();
          e.stopPropagation();
          updateLineReview(visible[idx].dataset.lineId, { status: "approved" }).catch(() => {});
        }
      } else if (e.key === "f" || e.key === "F") {
        if (idx >= 0) {
          e.preventDefault();
          e.stopPropagation();
          updateLineReview(visible[idx].dataset.lineId, { status: "flagged-review" }).catch(() => {});
        }
      } else if (e.key === "r" || e.key === "R") {
        if (idx >= 0) {
          e.preventDefault();
          e.stopPropagation();
          updateLineReview(visible[idx].dataset.lineId, { status: "flagged-regen" }).catch(() => {});
        }
      } else if (e.key === "n" || e.key === "N") {
        // Open + focus the note textarea on the current line.
        if (idx >= 0) {
          e.preventDefault();
          e.stopPropagation();
          const lineId = visible[idx].dataset.lineId;
          const noteArea = document.querySelector('.note-area[data-line-id="' + lineId + '"]');
          if (noteArea) {
            noteArea.removeAttribute("hidden");
            const ta = noteArea.querySelector("textarea");
            if (ta) ta.focus();
          }
        }
      }
    }, true);
  }

  // Restore autoplay preference from localStorage on first load.
  try {
    const saved = localStorage.getItem("preview-bake.autoplay");
    if (saved === "1") state.autoplay = true;
  } catch (_) { /* localStorage may be blocked */ }

  function renderLine(l, slug, voiceCastByRole) {
    const isAction = Boolean(l.action);
    const engineCls = l.engine ? " line-" + l.engine : "";
    const cls = "line" + (isAction ? " action" : "") + (l.hasAudio ? "" : " no-audio") + engineCls;
    const text = isAction ? l.action : (state.showCipher ? l.cipher : l.plain);
    const gavels = l.gavels > 0 ? '<span class="gavels">' + '*'.repeat(l.gavels) + '</span>' : '';
    const audio = l.hasAudio
      ? '<audio controls preload="none" src="' + escapeHtml(withSession("/api/ritual/" + encodeURIComponent(slug) + "/line/" + l.id + ".opus")) + '"></audio>'
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
    // Status pill — only meaningful for spoken lines that have audio
    // (stage actions can't be approved/flagged in the same sense).
    if (!isAction && l.hasAudio) {
      const review = (state.review.lines || {})[String(l.id)] || { status: "unmarked", note: "", audioHash: null };
      const status = review.status || "unmarked";
      // Stale check: an "approved" entry is stale if its stored audioHash
      // no longer matches the current audio. The user re-baked the line
      // and the prior approval should be re-confirmed.
      const stale = status === "approved" && review.audioHash && l.audioHash && review.audioHash !== l.audioHash;
      const staleClass = stale ? ' stale' : '';
      metaParts.push('<span class="status-pill status-' + status + staleClass + '" data-line-id="' + l.id + '" title="Click to cycle status">' + escapeHtml(status) + '</span>');
      const noteLen = (review.note || "").length;
      const noteClass = noteLen > 0 ? ' has-note' : '';
      const noteLabel = noteLen > 0 ? ('📝 ' + noteLen + ' char' + (noteLen === 1 ? '' : 's')) : '📝 note';
      metaParts.push('<button type="button" class="note-toggle' + noteClass + '" data-line-id="' + l.id + '">' + noteLabel + '</button>');
      // Rebake button — shift-click forces preamble even on short lines.
      metaParts.push('<button type="button" class="rebake-btn" data-line-id="' + l.id + '" title="Re-render this line via Gemini. Shift-click to force voice-cast preamble (helps on short lines).">Rebake</button>');
    }
    if (l.style) metaParts.push('style: ' + escapeHtml(l.style));
    if (l.audioBytes) metaParts.push(Math.round(l.audioBytes / 1024) + ' KB');
    if (l.speakAs) metaParts.push('speakAs override');
    const meta = metaParts.length > 0 ? '<span class="meta-row">' + metaParts.join(' · ') + '</span>' : '';

    // Inline note area — collapsed by default (open if existing note).
    let noteArea = '';
    if (!isAction && l.hasAudio) {
      const review = (state.review.lines || {})[String(l.id)] || { note: "" };
      const noteText = review.note || "";
      const hidden = noteText.length === 0 ? ' hidden' : '';
      noteArea = '<div class="note-area" data-line-id="' + l.id + '"' + hidden + '>' +
        '<textarea placeholder="Notes about this line — saved automatically when you click outside.">' + escapeHtml(noteText) + '</textarea>' +
        '<div class="note-saved-indicator" data-line-id="' + l.id + '"></div>' +
        '</div>';
    }

    // Director's note panel — Tier 1 voice/style/pace/accent overrides.
    // Stored per (slug, lineId) in localStorage. "Try these settings"
    // sends the overrides to the rebake endpoint.
    let directorNote = '';
    if (!isAction && l.hasAudio) {
      const stored = readDirectorNote(slug, l.id);
      const summaryTag = describeOverrides(stored);
      // Always collapsed by default — the panel is dense and crowds the
      // line list when expanded automatically. The summary-tag still shows
      // any pinned overrides so the user can see at a glance which lines
      // have a director-note set without expanding them.
      const isOpen = '';
      const buildVoiceOpts = () => {
        const groups = Object.entries(VOICE_CATALOG).map(([groupName, voices]) => {
          const opts = voices.map(v => {
            const sel = stored.voiceOverride === v.name ? ' selected' : '';
            return '<option value="' + escapeHtml(v.name) + '"' + sel + '>' + escapeHtml(v.name) + ' — ' + escapeHtml(v.desc) + '</option>';
          }).join('');
          return '<optgroup label="' + escapeHtml(groupName) + '">' + opts + '</optgroup>';
        }).join('');
        const defaultSel = !stored.voiceOverride ? ' selected' : '';
        const pinnedNote = l.voice ? ' (pinned: ' + escapeHtml(l.voice) + ')' : '';
        return '<option value=""' + defaultSel + '>(use role default' + pinnedNote + ')</option>' + groups;
      };
      const buildOpts = (options, current) => options.map(o => {
        const sel = current === o.value ? ' selected' : '';
        return '<option value="' + escapeHtml(o.value) + '"' + sel + '>' + escapeHtml(o.label) + '</option>';
      }).join('');
      // Profile dropdown — saved (voice, style, pace, accent) tuples
      // stored globally in localStorage. Picking a profile fills the four
      // dropdowns below and persists to this line's settings.
      const profiles = readProfiles();
      const profileNames = Object.keys(profiles).sort();
      const buildProfileOpts = () => {
        const opts = profileNames.map(n => '<option value="' + escapeHtml(n) + '">' + escapeHtml(n) + '</option>').join('');
        return '<option value="">(no profile)</option>' + opts;
      };
      // Build the inline-tag palette HTML — grouped buttons that insert
      // their tag at the speakAs textarea cursor. The whole tray hides
      // behind a "+ Insert tag" disclosure so the textarea stays the
      // visual focus of the panel.
      const buildTagPalette = () => {
        return RITUAL_TAG_PALETTE.map(g => {
          const btns = g.tags.map(t =>
            '<button type="button" class="tag-chip" data-line-id="' + l.id + '" data-tag="' + escapeHtml(t) + '" title="Insert ' + escapeHtml(t) + ' at cursor">' + escapeHtml(t) + '</button>'
          ).join('');
          return '<div class="tag-group">' +
            '<span class="tag-group-label">' + escapeHtml(g.group) + '</span>' +
            '<div class="tag-group-chips">' + btns + '</div>' +
            '</div>';
        }).join('');
      };
      // Combobox-with-custom: each parameter cell renders a single select
      // whose options end with "(custom prose…)". Picking that reveals a
      // matching free-text input below; picking any preset hides it.
      // Render-time, if the saved override isn't one of the presets, we
      // open the cell in custom mode and pre-fill the input.
      const buildComboCell = (field, labelText, options, current) => {
        const raw = current || "";
        const isPreset = options.some(o => o.value === raw);
        const customOpen = !!raw && !isPreset;
        const presetSel = isPreset ? raw : (customOpen ? "__custom__" : "");
        const opts = options.map(o => {
          const sel = o.value === presetSel ? ' selected' : '';
          return '<option value="' + escapeHtml(o.value) + '"' + sel + '>' + escapeHtml(o.label) + '</option>';
        }).join('') +
          '<option value="__custom__"' + (customOpen ? ' selected' : '') + '>(custom prose…)</option>';
        const cellCls = 'dn-cell' + (customOpen ? ' dn-cell--custom-open' : '');
        const inputVal = customOpen ? escapeHtml(raw) : "";
        const inputId = 'dn-' + field + '-' + l.id;
        const labelId = inputId + '-label';
        return '<div class="' + cellCls + '" data-cell-field="' + field + '" data-line-id="' + l.id + '">' +
          '<label class="dn-eyebrow" for="' + inputId + '" id="' + labelId + '">' + escapeHtml(labelText) + '</label>' +
          '<select id="' + inputId + '" data-field="' + field + '" data-line-id="' + l.id + '">' + opts + '</select>' +
          '<input type="text" class="director-note-prose dn-cell-custom" data-field="' + field + '" data-line-id="' + l.id + '" maxlength="500" placeholder="Custom prose…" aria-labelledby="' + labelId + '" value="' + inputVal + '">' +
        '</div>';
      };
      // Default value for the speakAs editor — the user's saved override
      // wins, otherwise show the line's plain text as the editing baseline
      // (so they can edit + insert tags into the existing transcript).
      const speakAsValue = stored.speakAsOverride || l.plain || "";
      // summary-tag visual treatment depends on whether overrides are
      // pinned (amber) vs. blank (zinc italic placeholder).
      const summaryTagCls = summaryTag.length > 0 ? 'summary-tag has-overrides' : 'summary-tag';
      const summaryTagText = summaryTag.length > 0 ? summaryTag : 'no overrides';
      const speakAsTextareaId = 'dn-speakas-' + l.id;
      directorNote = '<details class="director-note" data-line-id="' + l.id + '"' + isOpen + '>' +
        '<summary>' +
          '<span class="dn-title">Director’s note</span>' +
          '<span class="' + summaryTagCls + '">' + escapeHtml(summaryTagText) + '</span>' +
        '</summary>' +
        '<div class="dn-content">' +
          // Profile compact row
          '<div class="dn-profile-row">' +
            '<span class="dn-eyebrow">Profile</span>' +
            '<select class="director-note-profile-select" data-line-id="' + l.id + '" aria-label="Saved profile">' + buildProfileOpts() + '</select>' +
            '<button type="button" class="save-profile-btn" data-line-id="' + l.id + '" title="Save voice/style/pace/accent as a named profile (global, available across rituals)">Save as profile…</button>' +
            '<button type="button" class="delete-profile-btn" data-line-id="' + l.id + '" title="Delete the currently selected profile" disabled>Delete profile</button>' +
          '</div>' +
          // Hero — spoken text + tag-palette disclosure
          '<div class="dn-hero">' +
            '<div class="dn-hero-header">' +
              '<label class="dn-eyebrow" for="' + speakAsTextareaId + '">Spoken text</label>' +
              '<button type="button" class="speakas-reset-btn" data-line-id="' + l.id + '" title="Reset the textarea to the original line text and clear the saved override">Reset to original</button>' +
            '</div>' +
            '<textarea id="' + speakAsTextareaId + '" class="director-note-prose director-note-speakas-textarea" data-field="speakAsOverride" data-line-id="' + l.id + '" maxlength="4000" placeholder="The line as the model will read it. Use the tag picker below to insert pauses or delivery cues at the cursor.">' + escapeHtml(speakAsValue) + '</textarea>' +
            '<details class="dn-tag-disclosure">' +
              '<summary aria-label="Insert delivery tag">Insert tag</summary>' +
              '<div class="dn-tag-tray">' + buildTagPalette() +
                '<p class="director-note-speakas-hint">Tags work best when used sparingly — don’t spray them on every line. They must be in English even when the spoken text is not. Some tags may be read aloud rather than interpreted; test before committing.</p>' +
              '</div>' +
            '</details>' +
          '</div>' +
          // Parameter grid — one control per cell, free-text only when "custom" is picked
          '<div class="dn-grid">' +
            // Voice — single select, no custom prose
            '<div class="dn-cell" data-cell-field="voiceOverride" data-line-id="' + l.id + '">' +
              '<label class="dn-eyebrow" for="dn-voiceOverride-' + l.id + '">Voice</label>' +
              '<select id="dn-voiceOverride-' + l.id + '" data-field="voiceOverride" data-line-id="' + l.id + '">' + buildVoiceOpts() + '</select>' +
            '</div>' +
            buildComboCell('styleOverride', 'Style', STYLE_OPTIONS, stored.styleOverride) +
            buildComboCell('paceOverride', 'Pace', PACE_OPTIONS, stored.paceOverride) +
            buildComboCell('accentOverride', 'Accent', ACCENT_OPTIONS, stored.accentOverride) +
            buildComboCell('modelOverride', 'Model', MODEL_OPTIONS, stored.modelOverride) +
            // Temperature — slider widget
            '<div class="dn-cell" data-cell-field="temperature" data-line-id="' + l.id + '">' +
              '<div class="dn-temp-head">' +
                '<span class="dn-eyebrow">Temperature</span>' +
                '<span class="director-note-temp-display" data-line-id="' + l.id + '">' + (typeof stored.temperature === "number" ? stored.temperature.toFixed(2) : "(API default)") + '</span>' +
              '</div>' +
              '<input type="range" class="director-note-temp-slider" data-line-id="' + l.id + '" min="0" max="2" step="0.05" value="' + (typeof stored.temperature === "number" ? stored.temperature : 1) + '" aria-label="Temperature">' +
              '<div class="director-note-temp-controls">' +
                '<button type="button" class="director-note-temp-reset" data-line-id="' + l.id + '" title="Use Gemini API default (~1.0). Removes temperature from the request entirely.">Use API default</button>' +
                '<span class="director-note-temp-hint">0 = deterministic · 2 = most varied</span>' +
              '</div>' +
            '</div>' +
            // Profile (override) — full-width textarea
            '<div class="dn-cell dn-cell-wide" data-cell-field="profileOverride" data-line-id="' + l.id + '">' +
              '<label class="dn-eyebrow" for="dn-profileOverride-' + l.id + '">Profile (override)</label>' +
              '<textarea id="dn-profileOverride-' + l.id + '" class="director-note-prose" data-field="profileOverride" data-line-id="' + l.id + '" maxlength="1000" placeholder="Override the role profile prose for this rebake. Empty = use the role-card profile from voice-cast.json. Example: “An elderly Mason in his 70s, voice slightly hoarse from decades of declamation.”">' + escapeHtml(stored.profileOverride || "") + '</textarea>' +
            '</div>' +
          '</div>' +
          // Action bar
          '<div class="dn-actions">' +
            '<span class="director-note-info" data-line-id="' + l.id + '"></span>' +
            '<button type="button" class="apply-to-flagged-btn" data-line-id="' + l.id + '" data-source-role="' + escapeHtml(l.role) + '" title="Copy these settings to every line currently flagged-regen — does not rebake yet">Apply to flagged-regen</button>' +
            '<button type="button" class="apply-to-role-btn" data-line-id="' + l.id + '" data-source-role="' + escapeHtml(l.role) + '" title="Copy these settings to every line where role = ' + escapeHtml(l.role) + ' — does not rebake yet">Apply to role ' + escapeHtml(l.role) + '</button>' +
            '<button type="button" class="reset-overrides-btn" data-line-id="' + l.id + '">Clear overrides</button>' +
            '<button type="button" class="try-overrides-btn" data-line-id="' + l.id + '">Try these settings</button>' +
          '</div>' +
        '</div>' +
        '</details>';
    }

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

    const roleAttr = (!isAction && l.role) ? ' data-role="' + escapeHtml(l.role) + '"' : '';
    return '<div class="' + cls + '" data-line-id="' + l.id + '"' + roleAttr + '>' +
      '<div class="id">' + l.id + '</div>' +
      '<div class="role">' + escapeHtml(l.role) + '</div>' +
      '<div class="body">' +
      '<div class="text">' + gavels + escapeHtml(text || '') + '</div>' +
      audio +
      meta +
      noteArea +
      directorNote +
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
    // Session is read uniformly from the ?session= query param. Empty
    // string or missing = canonical (the rituals/ root).
    const sessionParam = url.searchParams.get("session") || undefined;
    if (url.pathname === "/" || url.pathname === "/index.html") {
      handleIndexRequest(res);
      return;
    }
    // Session management endpoints (above ritual routes so /api/sessions
    // doesn't collide with /api/ritual/...)
    if (url.pathname === "/api/sessions" && req.method === "GET") {
      handleSessionsList(res);
      return;
    }
    const sessionPromoteMatch = /^\/api\/sessions\/([^/]+)\/promote$/.exec(url.pathname);
    if (sessionPromoteMatch && req.method === "POST") {
      handleSessionPromote(res, sessionPromoteMatch[1]!);
      return;
    }
    const sessionMatch = /^\/api\/sessions\/([^/]+)$/.exec(url.pathname);
    if (sessionMatch && req.method === "POST") {
      await handleSessionCreate(req, res, sessionMatch[1]!);
      return;
    }
    if (sessionMatch && req.method === "DELETE") {
      handleSessionDelete(res, sessionMatch[1]!);
      return;
    }
    if (url.pathname === "/api/rituals") {
      await handleRitualsList(res, sessionParam);
      return;
    }
    // /api/ritual/{slug}/line/{id}.opus
    const lineMatch = /^\/api\/ritual\/([^/]+)\/line\/([^/]+)\.opus$/.exec(url.pathname);
    if (lineMatch) {
      await handleRitualLineAudio(req, res, lineMatch[1]!, lineMatch[2]!, sessionParam);
      return;
    }
    // /api/ritual/{slug}/review/line/{id} — PUT to update one line's status/note
    const reviewLineMatch = /^\/api\/ritual\/([^/]+)\/review\/line\/([^/]+)$/.exec(url.pathname);
    if (reviewLineMatch && req.method === "PUT") {
      await handleReviewPut(req, res, reviewLineMatch[1]!, reviewLineMatch[2]!, sessionParam);
      return;
    }
    // /api/ritual/{slug}/rebake/line/{id} — POST to re-render one line via Gemini
    const rebakeLineMatch = /^\/api\/ritual\/([^/]+)\/rebake\/line\/([^/]+)$/.exec(url.pathname);
    if (rebakeLineMatch && req.method === "POST") {
      await handleRebakeLine(req, res, rebakeLineMatch[1]!, rebakeLineMatch[2]!, sessionParam);
      return;
    }
    // /api/ritual/{slug}/review — GET sidecar
    const reviewMatch = /^\/api\/ritual\/([^/]+)\/review$/.exec(url.pathname);
    if (reviewMatch && req.method === "GET") {
      handleReviewGet(res, reviewMatch[1]!, sessionParam);
      return;
    }
    // /api/ritual/{slug}
    const detailMatch = /^\/api\/ritual\/([^/]+)$/.exec(url.pathname);
    if (detailMatch) {
      await handleRitualDetail(res, detailMatch[1]!, sessionParam);
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
