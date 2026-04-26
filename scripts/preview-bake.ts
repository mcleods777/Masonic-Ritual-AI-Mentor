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

function reviewSidecarPath(slug: string): string {
  return path.join(RITUALS_DIR, `${slug}-review.json`);
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

function readReviewSidecar(slug: string): ReviewSidecar {
  const p = reviewSidecarPath(slug);
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

function writeReviewSidecar(slug: string, data: ReviewSidecar): void {
  const p = reviewSidecarPath(slug);
  const tmp = `${p}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, p);
}

function handleReviewGet(res: http.ServerResponse, slug: string): void {
  if (!RITUAL_SLUG_REGEX.test(slug)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid slug" }));
    return;
  }
  const sidecar = readReviewSidecar(slug);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(sidecar));
}

async function handleReviewPut(
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
  const sidecar = readReviewSidecar(slug);
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
  writeReviewSidecar(slug, sidecar);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(next));
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

  // Parse small JSON body — { forcePreamble?: boolean }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const c of req) {
    const buf = c as Buffer;
    total += buf.length;
    if (total > 1024) {
      res.writeHead(413);
      res.end("Body too large");
      return;
    }
    chunks.push(buf);
  }
  let body: { forcePreamble?: boolean } = {};
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

  // Per-slug serialization
  const prev = rebakeLockBySlug.get(slug);
  let resolveLock!: () => void;
  const lockPromise = new Promise<void>((r) => {
    resolveLock = r;
  });
  rebakeLockBySlug.set(slug, lockPromise);
  if (prev) await prev;

  try {
    const lineId = Number(lineIdStr);
    const mramPath = path.join(RITUALS_DIR, `${slug}.mram`);
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
    const voice = doc.metadata.voiceCast?.[line.role];
    if (!voice) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Role ${line.role} has no pinned voice` }));
      return;
    }

    // Derive style + speakAs + preamble — same logic as rebake-flagged.ts
    const stylesByHash = loadStylesSidecar(slug);
    const sidecar = stylesByHash.get(hashLineText(line.plain));
    const speakAs = sidecar?.speakAs;
    const style = line.style ?? sidecar?.style;
    const text = speakAs ?? line.plain;

    const VOICE_CAST_MIN_LINE_CHARS = parseInt(
      process.env.VOICE_CAST_MIN_LINE_CHARS ?? "40",
      10,
    );

    let preamble = "";
    if (!speakAs) {
      const overThreshold = line.plain.length >= VOICE_CAST_MIN_LINE_CHARS;
      if (forcePreamble || overThreshold) {
        const voiceCastPath = path.join(
          RITUALS_DIR,
          `${slug}-voice-cast.json`,
        );
        if (fs.existsSync(voiceCastPath)) {
          try {
            const vcRaw = JSON.parse(
              fs.readFileSync(voiceCastPath, "utf8"),
            ) as Record<string, unknown>;
            const vcFile: VoiceCastFile = {
              version: 1,
              scene: vcRaw.scene as string | undefined,
              roles: ((vcRaw.roles ?? vcRaw.cast) ?? {}) as VoiceCastFile["roles"],
            };
            preamble = buildPreamble(vcFile, line.role) ?? "";
          } catch {
            /* parse fail → no preamble */
          }
        }
      }
    }

    // Wipe cache entries for all default models so we get a fresh roll
    for (const model of DEFAULT_MODELS) {
      const key = computeCacheKey(text, style, voice, model, preamble);
      deleteCacheEntry(key, RENDER_CACHE_DIR);
    }

    // Render
    const audioBuf = await renderLineAudio(
      text,
      style,
      voice,
      { apiKeys, models: DEFAULT_MODELS, cacheDir: RENDER_CACHE_DIR },
      preamble,
    );
    line.audio = audioBuf.toString("base64");

    // Re-encrypt + atomic write
    const reEncrypted = encryptMRAMNode(doc, passphrase);
    const tmpPath = `${mramPath}.tmp.${process.pid}`;
    fs.writeFileSync(tmpPath, reEncrypted);
    fs.renameSync(tmpPath, mramPath);

    // Update review sidecar — clear audio-related fields, demote approved
    const reviewPath = path.join(RITUALS_DIR, `${slug}-review.json`);
    if (fs.existsSync(reviewPath)) {
      try {
        const sc = readReviewSidecar(slug);
        const entry = sc.lines[String(lineId)];
        if (entry) {
          entry.audioHash = null;
          entry.approvedAt = null;
          if (entry.status === "approved") {
            entry.status = "unmarked";
            entry.flaggedAt = null;
          }
          sc.updatedAt = new Date().toISOString();
          writeReviewSidecar(slug, sc);
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
      }),
    );
  } catch (e) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: (e as Error).message.slice(0, 300) }));
  } finally {
    resolveLock();
    if (rebakeLockBySlug.get(slug) === lockPromise) {
      rebakeLockBySlug.delete(slug);
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
    background: rgba(45, 212, 191, 0.1);
    color: #5eead4;
    border-color: rgba(45, 212, 191, 0.5);
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
    color: var(--zinc-600); font-style: italic;
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
      // Fetch ritual detail and review sidecar in parallel — sidecar is
      // tiny so this never blocks render meaningfully.
      const [docRes, reviewRes] = await Promise.all([
        fetch("/api/ritual/" + encodeURIComponent(slug)),
        fetch("/api/ritual/" + encodeURIComponent(slug) + "/review"),
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
    html += '<div class="controls status-filters">' +
      '<span class="filter-label">Review:</span>' + statusPillsHtml +
      '<button type="button" id="status-filter-flagged" class="filter-shortcut">Only flagged</button>' +
      '<button type="button" id="status-filter-unmarked" class="filter-shortcut">Only unmarked</button>' +
      '<button type="button" id="status-filter-show-all" class="filter-shortcut">Show all</button>' +
      '<button type="button" id="bulk-approve-unmarked" class="filter-shortcut bulk-approve" title="Approve every unmarked line in this ritual">Approve all unmarked (' + statusCounts.unmarked + ')</button>' +
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
          const res = await fetch("/api/ritual/" + encodeURIComponent(slug) + "/rebake/line/" + encodeURIComponent(lineId), {
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
              audio.src = baseSrc + "?h=" + encodeURIComponent(data.audioHash || Date.now());
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
            const sc = await fetch("/api/ritual/" + encodeURIComponent(slug) + "/review").then(r => r.json());
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

  function setCurrentLine(lineId) {
    state.currentLineId = lineId;
    document.querySelectorAll(".line.is-current").forEach(el => el.classList.remove("is-current"));
    if (lineId == null) return;
    const el = document.querySelector('.line[data-line-id="' + lineId + '"]');
    if (el) {
      el.classList.add("is-current");
      el.scrollIntoView({ behavior: "smooth", block: "center" });
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

  function playLineByEl(el) {
    if (!el) return;
    const audio = el.querySelector("audio");
    if (!audio) return;
    // Synchronous pause-others BEFORE play() — kills the overlap window
    // that can otherwise let two audios start audibly during the queued
    // delay before the new audio's "play" event fires.
    pauseAllExcept(audio);
    setCurrentLine(el.dataset.lineId);
    audio.play().catch(() => { /* autoplay-blocked or load error; ignore */ });
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
    const res = await fetch("/api/ritual/" + encodeURIComponent(slug) + "/review/line/" + encodeURIComponent(lineId), {
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
        if (next) playLineByEl(next);
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        const prev = idx <= 0 ? null : visible[idx - 1];
        if (prev) playLineByEl(prev);
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
    // /api/ritual/{slug}/review/line/{id} — PUT to update one line's status/note
    const reviewLineMatch = /^\/api\/ritual\/([^/]+)\/review\/line\/([^/]+)$/.exec(url.pathname);
    if (reviewLineMatch && req.method === "PUT") {
      await handleReviewPut(req, res, reviewLineMatch[1]!, reviewLineMatch[2]!);
      return;
    }
    // /api/ritual/{slug}/rebake/line/{id} — POST to re-render one line via Gemini
    const rebakeLineMatch = /^\/api\/ritual\/([^/]+)\/rebake\/line\/([^/]+)$/.exec(url.pathname);
    if (rebakeLineMatch && req.method === "POST") {
      await handleRebakeLine(req, res, rebakeLineMatch[1]!, rebakeLineMatch[2]!);
      return;
    }
    // /api/ritual/{slug}/review — GET sidecar
    const reviewMatch = /^\/api\/ritual\/([^/]+)\/review$/.exec(url.pathname);
    if (reviewMatch && req.method === "GET") {
      handleReviewGet(res, reviewMatch[1]!);
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
