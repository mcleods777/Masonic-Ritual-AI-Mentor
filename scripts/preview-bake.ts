#!/usr/bin/env npx tsx
/**
 * preview-bake.ts — localhost-only cache-scrubber server (AUTHOR-08).
 *
 * Read-only browser UI over rituals/_bake-cache/. Lists rituals → lines →
 * streams the cached .opus for a selected line. Dev-only; bound to
 * 127.0.0.1 and refuses to start on any non-loopback interface.
 *
 * Usage:
 *   npx tsx scripts/preview-bake.ts
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
 *      NOT re-enable traversal. Prevents path-traversal via
 *      ../../../etc/passwd.opus AND via `cache/innocuous-symlink.opus`
 *      that resolves outside the cache dir.
 *   4. No Gemini/Google/Groq API key loaded — server is read-only (D-14).
 *
 * Related: src/lib/dev-guard.ts (D-15 single source of truth),
 * scripts/render-gemini-audio.ts (CACHE_DIR — where the .opus files live).
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { assertDevOnly } from "../src/lib/dev-guard";

// Module-load guard: fail fast in production (T-03-02).
assertDevOnly();

const BIND_HOST = "127.0.0.1";
const BIND_PORT = Number(process.env.PREVIEW_BAKE_PORT ?? "8883");
const BAKE_CACHE_DIR = path.resolve("rituals/_bake-cache");

/**
 * Refuse anything but loopback (T-03-01). Exported for tests.
 * Accepts: "127.0.0.1", "::1". Everything else throws.
 *
 * A non-loopback bind (0.0.0.0, a LAN IP, ::) would expose unreleased
 * ritual content (cached Opus files of private lodge ritual) to any
 * device on the LAN. This guard runs before server.listen() so no
 * bind attempt reaches the OS on a mis-configured host.
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

/**
 * T-03-03 layer 1 — regex gate. Exported so tests can monkey-patch or
 * sanity-assert the regex in the defense-in-depth containment test.
 * A cacheKey is exactly 64 lowercase hex chars (sha256 hex digest).
 */
export const CACHE_KEY_REGEX = /^[0-9a-f]{64}$/;

/**
 * Handle GET /a/{cacheKey}.opus.
 *
 * - Returns 404 when URL doesn't match /^\/a\/([^/]+)\.opus$/
 *   (e.g. /a/foo/bar.opus has an embedded slash — defence against
 *   path-traversal URL shapes).
 * - Returns 400 on invalid cacheKey (regex-gate failure — T-03-03 layer 1).
 * - Returns 400 on resolved-path-outside-cacheDir (containment failure —
 *   T-03-03 layer 2, defense-in-depth in case the regex is ever relaxed
 *   OR a symlink inside the cache dir points outside).
 * - Returns 404 on missing file.
 * - Returns 206 Partial Content + Content-Range on Range header.
 * - Returns 200 full body + Accept-Ranges when no Range header.
 * - Returns 416 on malformed Range or out-of-bounds.
 *
 * MIME is `audio/ogg; codecs=opus` per RFC 7845 §9 — matches what Chromium
 * expects for <audio> playback of Opus-in-Ogg.
 */
export function handleOpusRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  cacheDir: string,
): void {
  const url = new URL(req.url ?? "/", `http://${BIND_HOST}:${BIND_PORT}`);
  // Extract cacheKey from path: /a/{64-hex}.opus. The [^/]+ disallows
  // further slashes so /a/../secret.opus and /a/foo/bar.opus don't match.
  const match = /^\/a\/([^/]+)\.opus$/.exec(url.pathname);
  if (!match) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
    return;
  }
  const cacheKey = match[1]!;

  // T-03-03 layer 1: regex gate — refuse any key with .., /, ., or
  // non-hex, uppercase, short, long. Runs BEFORE path.join.
  if (!CACHE_KEY_REGEX.test(cacheKey)) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("bad cache key (must be 64 lowercase hex chars)");
    return;
  }

  const opusPath = path.join(cacheDir, `${cacheKey}.opus`);

  // T-03-03 layer 2: path-containment assertion — refuse any resolved
  // path that escapes cacheDir. Defense-in-depth against (a) a future
  // regex relaxation, or (b) a symlink planted inside the cache dir
  // that resolves outside it.
  //
  // NOTE: `path.resolve` alone does NOT dereference symlinks — it only
  // normalizes `..` and resolves to absolute form. To catch a symlink
  // planted inside the cache dir that points outside, we must also
  // check fs.realpathSync() on any existing file. Two sub-checks:
  //   2a) path.resolve(opusPath) stays under rootAbs (catches `..`
  //       traversal if the regex is ever relaxed).
  //   2b) fs.realpathSync(opusPath) stays under rootAbs (catches
  //       symlink-escape — the realpath follows links to the target).
  const resolved = path.resolve(opusPath);
  const rootAbs = path.resolve(cacheDir);
  if (!resolved.startsWith(rootAbs + path.sep)) {
    console.warn(
      `[PREVIEW-BAKE] rejected cacheKey (containment 2a): ${cacheKey.slice(0, 16)}...`,
    );
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Bad Request");
    return;
  }

  if (!fs.existsSync(resolved)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
    return;
  }

  // Layer 2b — realpath containment. Only runs when the file exists
  // (realpathSync throws on missing files). Uses rootAbs (already
  // computed) because the cache dir itself is expected to NOT be a
  // symlink to somewhere weird; if operators care about that edge
  // case they can also realpath the cacheDir once at startup.
  let realResolved: string;
  try {
    realResolved = fs.realpathSync(resolved);
  } catch {
    // Race: file disappeared between existsSync and realpathSync.
    // Treat as not found rather than 500 — the cache is transient.
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
    return;
  }
  const realRoot = fs.existsSync(rootAbs) ? fs.realpathSync(rootAbs) : rootAbs;
  if (
    realResolved !== realRoot &&
    !realResolved.startsWith(realRoot + path.sep)
  ) {
    console.warn(
      `[PREVIEW-BAKE] rejected cacheKey (containment 2b — symlink escape): ${cacheKey.slice(0, 16)}...`,
    );
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Bad Request");
    return;
  }
  // ME-02: wrap statSync in try/catch — a race between the realpath
  // check above and this stat can see ENOENT if the file is evicted
  // mid-request. The cache dir is explicitly transient per the header
  // comment; returning 404 is the correct signal to the client, not 500.
  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolved);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
    return;
  }
  const rangeHeader = req.headers.range;
  if (rangeHeader) {
    const rangeMatch = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader);
    if (!rangeMatch) {
      res.writeHead(416, {
        "Content-Range": `bytes */${stat.size}`,
        "Content-Type": "text/plain",
      });
      res.end();
      return;
    }
    const start = Number(rangeMatch[1]);
    const end = rangeMatch[2] ? Number(rangeMatch[2]) : stat.size - 1;
    if (!Number.isFinite(start) || end >= stat.size || start > end) {
      res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
      res.end();
      return;
    }
    res.writeHead(206, {
      "Content-Type": "audio/ogg; codecs=opus",
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1,
    });
    const stream = fs.createReadStream(resolved, { start, end });
    // Attach error handler before pipe — a mid-stream ENOENT (file
    // deleted after statSync, or cache eviction) must not crash the
    // server. End the response quietly; the client sees a truncated
    // read, which is the correct signal on a race.
    stream.on("error", () => {
      try {
        res.end();
      } catch {
        // best-effort — response may already be closed
      }
    });
    stream.pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Type": "audio/ogg; codecs=opus",
      "Content-Length": stat.size,
      "Accept-Ranges": "bytes",
    });
    const stream = fs.createReadStream(resolved);
    stream.on("error", () => {
      try {
        res.end();
      } catch {
        // best-effort
      }
    });
    stream.pipe(res);
  }
}

/**
 * Serve the browser UI — minimal no-framework HTML that fetches /api/index
 * and renders a ritual → lines → <audio> tree.
 */
export function handleIndexRequest(res: http.ServerResponse): void {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Bake Cache Preview</title>
<style>
  body { font: 14px system-ui; margin: 2em; background: #0a0a0a; color: #d4d4d8; }
  h1 { color: #f4f4f5; } h2 { color: #e4e4e7; margin-top: 2em; }
  a { color: #facc15; text-decoration: none; } a:hover { text-decoration: underline; }
  .ritual { margin: 1em 0; }
  audio { width: 100%; max-width: 640px; display: block; margin: 0.5em 0; }
  .line { padding: 0.5em; border-bottom: 1px solid #27272a; }
  .meta { color: #71717a; font-size: 12px; font-family: ui-monospace; }
</style></head><body>
<h1>rituals/_bake-cache/</h1>
<p class="meta">AUTHOR-08 preview — read-only. Dev-only (NODE_ENV=${JSON.stringify(process.env.NODE_ENV ?? "undefined")}).</p>
<p><a href="/api/index">View index JSON</a></p>
<div id="rituals">Loading…</div>
<script>
  fetch("/api/index").then(r => r.json()).then(data => {
    const c = document.getElementById("rituals");
    if (!data.rituals || data.rituals.length === 0) {
      c.textContent = "No rituals in the cache yet. Run bake-all.ts first.";
      return;
    }
    c.innerHTML = data.rituals.map(r =>
      '<div class="ritual"><h2>' + r.slug + ' <span class="meta">(' + r.lineCount + ' lines)</span></h2>' +
      r.lines.map(l =>
        '<div class="line"><div class="meta">line ' + l.lineId + ' / ' + l.model + ' / ' + l.durationMs + 'ms</div>' +
        '<audio controls preload="none" src="/a/' + l.cacheKey + '.opus"></audio></div>'
      ).join("") +
      '</div>'
    ).join("");
  }).catch(err => { document.getElementById("rituals").textContent = "Error: " + err; });
</script>
</body></html>`;
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

/**
 * Serve /api/index — reads rituals/_bake-cache/_INDEX.json if present
 * (D-03 shape: {cacheKey, model, ritualSlug, lineId, byteLen, durationMs,
 * createdAt}[]), else falls back to a directory listing of .opus files so
 * the preview still works when Plan 07's index-writer hasn't run yet.
 */
export function handleIndexJson(
  res: http.ServerResponse,
  cacheDir: string,
): void {
  const indexPath = path.join(cacheDir, "_INDEX.json");
  if (fs.existsSync(indexPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(indexPath, "utf8")) as Array<{
        cacheKey: string;
        model: string;
        ritualSlug: string;
        lineId: string | number;
        byteLen: number;
        durationMs: number;
        createdAt: string;
      }>;
      // Group by ritualSlug for the browser UI.
      const bySlug = new Map<string, typeof raw>();
      for (const e of raw) {
        const arr = bySlug.get(e.ritualSlug) ?? [];
        arr.push(e);
        bySlug.set(e.ritualSlug, arr);
      }
      const rituals = Array.from(bySlug.entries()).map(([slug, entries]) => ({
        slug,
        lineCount: entries.length,
        lines: entries.sort((a, b) =>
          String(a.lineId).localeCompare(String(b.lineId)),
        ),
      }));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ rituals }, null, 2));
      return;
    } catch {
      // Malformed _INDEX.json — fall through to directory listing.
    }
  }
  if (!fs.existsSync(cacheDir)) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ rituals: [] }));
    return;
  }
  const opusFiles = fs
    .readdirSync(cacheDir)
    .filter((f) => f.endsWith(".opus"))
    .map((f) => {
      const cacheKey = f.replace(/\.opus$/, "");
      const stat = fs.statSync(path.join(cacheDir, f));
      return {
        cacheKey,
        model: "unknown",
        ritualSlug: "uncategorized",
        lineId: cacheKey.slice(0, 8),
        byteLen: stat.size,
        durationMs: 0,
        createdAt: stat.mtime.toISOString(),
      };
    });
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify(
      {
        rituals: [
          {
            slug: "uncategorized (_INDEX.json not present)",
            lineCount: opusFiles.length,
            lines: opusFiles,
          },
        ],
      },
      null,
      2,
    ),
  );
}

// Server bootstrap — routes: / → index HTML, /api/index → index JSON,
// /a/{cacheKey}.opus → Opus stream, everything else → 404.
const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${BIND_HOST}:${BIND_PORT}`);
  if (url.pathname === "/" || url.pathname === "/index.html") {
    handleIndexRequest(res);
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
});

// Export the server for integration-style tests that might use it.
export { server };

// isDirectRun — only start listening when invoked as the main script.
// Test imports of this module (via `import { handleOpusRequest } from ...`)
// should NOT spawn the HTTP listener; the assertDevOnly() call at the top
// still runs either way (which is fine — vitest defaults NODE_ENV=test).
const isDirectRun = process.argv[1]?.endsWith("preview-bake.ts") ?? false;
if (isDirectRun) {
  const overrideHost = process.env.PREVIEW_BAKE_HOST ?? BIND_HOST;
  // ensureLoopback BEFORE listen — refuses at process level if somehow
  // bind host was overridden (e.g. PREVIEW_BAKE_HOST=0.0.0.0).
  ensureLoopback(overrideHost);
  server.listen(BIND_PORT, overrideHost, () => {
    console.log(
      `[AUTHOR-08] Preview server: http://${overrideHost}:${BIND_PORT}`,
    );
    console.log(`           Cache: ${BAKE_CACHE_DIR}`);
    console.log(`           Dev-only; read-only; Ctrl-C to stop.`);
  });
}
