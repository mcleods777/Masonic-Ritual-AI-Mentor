---
phase: 03-authoring-throughput
plan: 08
type: execute
wave: 3
depends_on: [03, 05]
files_modified:
  - scripts/preview-bake.ts
  - scripts/__tests__/preview-bake.test.ts
autonomous: true
requirements: [AUTHOR-08]
tags: [preview-server, localhost, http, range-requests, dev-guard, path-traversal-mitigation]

must_haves:
  truths:
    - "scripts/preview-bake.ts exists as a standalone `#!/usr/bin/env npx tsx` script binding http.createServer to 127.0.0.1:8883 (not 0.0.0.0) — serves a browser UI over rituals/_bake-cache/"
    - "assertDevOnly() from src/lib/dev-guard.ts is called at MODULE LOAD (synchronously, at the top of the file before http.createServer) — the process refuses to start when NODE_ENV=production"
    - "The script refuses to bind to anything other than 127.0.0.1 or ::1 via an exported ensureLoopback(host) helper — T-03-01 mitigation, refuse LAN exposure"
    - "/a/{cacheKey}.opus route validates cacheKey against /^[0-9a-f]{64}$/ BEFORE path.join (T-03-03 path-traversal mitigation per RESEARCH §Security Domain)"
    - "/a/{cacheKey}.opus serves 206 Partial Content + Content-Range when the request carries Range: bytes=M-N; serves 200 + Accept-Ranges: bytes when no Range header; serves 416 Requested Range Not Satisfiable on malformed ranges. MIME is `audio/ogg; codecs=opus` per RFC 7845"
    - "/ lists rituals (reads rituals/_bake-cache/_INDEX.json if present; falls back to readdirSync if _INDEX.json is not yet created by the bake-all infrastructure); /r/{slug} lists lines for that ritual"
    - "The script is READ-ONLY — no re-render, no .mram modification, no Gemini API key loaded into the preview process (D-14)"
    - "Unit tests cover: ensureLoopback refusal on 0.0.0.0 + 192.168.x.x; ensureLoopback acceptance on 127.0.0.1 + ::1; cacheKey regex rejects .., /, traversal patterns, and anything not /^[0-9a-f]{64}$/; Range-handler returns correct 206/200/416 shapes (mock fs.statSync + createReadStream)"
  artifacts:
    - path: scripts/preview-bake.ts
      provides: "localhost-only cache-scrubber HTTP server with dev-guard + loopback-only bind + path-traversal-safe cacheKey lookup"
      contains: "ensureLoopback"
      min_lines: 150
    - path: scripts/__tests__/preview-bake.test.ts
      provides: "unit tests: ensureLoopback, cacheKey validation, handleOpusRequest Range handling, assertDevOnly integration"
      contains: "ensureLoopback"
  key_links:
    - from: scripts/preview-bake.ts
      to: src/lib/dev-guard.ts
      via: "import { assertDevOnly } from '../src/lib/dev-guard'; call at module load"
      pattern: "assertDevOnly"
    - from: scripts/preview-bake.ts
      to: rituals/_bake-cache/
      via: "fs.createReadStream reads {cacheKey}.opus files from the Plan-05 cache dir"
      pattern: "rituals/_bake-cache"
    - from: "Shannon's browser (http://127.0.0.1:8883)"
      to: scripts/preview-bake.ts
      via: "HTTP GET / → index, GET /r/{slug} → line list, GET /a/{cacheKey}.opus → Opus stream"
      pattern: "127.0.0.1:8883"
---

<objective>
Create `scripts/preview-bake.ts` — AUTHOR-08's localhost-only cache-scrubber HTTP server. Browser UI at `http://127.0.0.1:8883` lists rituals (from the cache index), lists baked lines per ritual, and streams individual cached Opus files via `<audio>`-element-friendly HTTP Range responses. Calls `assertDevOnly()` from Plan 03's `src/lib/dev-guard.ts` at module load to refuse production start. Refuses any non-loopback bind interface. Validates every requested cacheKey against `/^[0-9a-f]{64}$/` before path.join to defend against path-traversal. Fill the Plan-01 test scaffold with tests covering loopback-refusal, cacheKey regex, and Range-handler response shapes.

Purpose: per AUTHOR-08 + D-13/D-14/D-15, Shannon needs a way to listen to any cached line before re-encrypting a .mram. Today's workflow requires manually playing `{cacheKey}.opus` files from the filesystem (awkward — no metadata about which ritual/line each key maps to). The preview server is the "listen to every line before ship" affordance. D-14 explicitly keeps it read-only: no re-render trigger, no .mram modification, no Gemini API key in the server's runtime. D-15 locks the dev-only invariant via the shared module from Plan 03.

Output: new `scripts/preview-bake.ts` (150+ lines, #!/usr/bin/env npx tsx), comprehensive unit test file, `preview-bake` npm script entry already registered in Plan 01.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/03-authoring-throughput/03-CONTEXT.md
@.planning/phases/03-authoring-throughput/03-RESEARCH.md
@.planning/phases/03-authoring-throughput/03-PATTERNS.md
@.planning/phases/03-authoring-throughput/03-VALIDATION.md
@.planning/phases/03-authoring-throughput/03-03-SUMMARY.md
@.planning/phases/03-authoring-throughput/03-05-SUMMARY.md
@scripts/lookup-hashed-user.ts
@src/lib/dev-guard.ts
@scripts/__tests__/preview-bake.test.ts

<interfaces>
<!-- Structure of preview-bake.ts (per RESEARCH Pattern 4, PATTERNS.md §preview-bake). -->

Shebang + dev-guard module-load:
```typescript
#!/usr/bin/env npx tsx
/**
 * preview-bake.ts — localhost-only cache-scrubber server (AUTHOR-08).
 *
 * Read-only browser UI over rituals/_bake-cache/. Lists rituals → lines →
 * streams the cached .opus for a selected line. Dev-only; bound to
 * 127.0.0.1 and refuses to start on any non-loopback interface.
 *
 * Usage:
 *   npx tsx scripts/preview-bake.ts [--port 8883]
 *
 * CRITICAL invariants (T-03-01, T-03-02, T-03-03):
 *   1. NODE_ENV=production → process exits at module load (assertDevOnly).
 *   2. Only 127.0.0.1 or ::1 bind allowed (ensureLoopback refuses others).
 *   3. /a/{cacheKey}.opus cacheKey MUST match /^[0-9a-f]{64}$/ before
 *      path.join, or the request 400s. Prevents path-traversal via
 *      ../../../etc/passwd.opus.
 *   4. No Gemini/Google/Groq API key loaded — server is read-only.
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
const INDEX_JSON_PATH = path.join(BAKE_CACHE_DIR, "_INDEX.json");
```

ensureLoopback — exported for tests, called before listen():
```typescript
/**
 * Refuse anything but loopback (T-03-01). Exported for tests.
 * Accepts: "127.0.0.1", "::1". Everything else throws.
 */
export function ensureLoopback(host: string): void {
  if (host !== "127.0.0.1" && host !== "::1") {
    throw new Error(
      `[AUTHOR-08 D-15] refusing to bind to non-loopback host "${host}". ` +
      `Only 127.0.0.1 or ::1 are allowed. Set PREVIEW_BAKE_HOST if you need ` +
      `to override (but be aware: a non-loopback bind exposes unreleased ` +
      `ritual content to the LAN).`,
    );
  }
}
```

cacheKey validation + Opus request handler (T-03-03 + RESEARCH Pattern 4):
```typescript
const CACHE_KEY_REGEX = /^[0-9a-f]{64}$/;

/**
 * Handle GET /a/{cacheKey}.opus.
 * Returns 400 on invalid cacheKey (path-traversal defense — T-03-03).
 * Returns 404 on missing file.
 * Returns 206 Partial Content + Content-Range on Range header.
 * Returns 200 full body when no Range header.
 * Returns 416 on malformed Range.
 */
export function handleOpusRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  cacheDir: string,
): void {
  const url = new URL(req.url ?? "/", `http://${BIND_HOST}:${BIND_PORT}`);
  // Extract cacheKey from path: /a/{64-hex}.opus
  const match = /^\/a\/([^/]+)\.opus$/.exec(url.pathname);
  if (!match) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
    return;
  }
  const cacheKey = match[1]!;
  if (!CACHE_KEY_REGEX.test(cacheKey)) {
    // T-03-03: path-traversal defense — refuse any key with ..\, /, or not-hex.
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("bad cache key (must be 64 hex chars)");
    return;
  }
  const filepath = path.join(cacheDir, `${cacheKey}.opus`);
  if (!fs.existsSync(filepath)) {
    res.writeHead(404);
    res.end();
    return;
  }
  const stat = fs.statSync(filepath);
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
    fs.createReadStream(filepath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Type": "audio/ogg; codecs=opus",
      "Content-Length": stat.size,
      "Accept-Ranges": "bytes",
    });
    fs.createReadStream(filepath).pipe(res);
  }
}
```

Index HTML response (minimal, inline — no framework):
```typescript
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
```

Index JSON response (reads _INDEX.json or falls back to directory listing):
```typescript
export function handleIndexJson(res: http.ServerResponse, cacheDir: string): void {
  const indexPath = path.join(cacheDir, "_INDEX.json");
  if (fs.existsSync(indexPath)) {
    // _INDEX.json exists — serve it with minor restructuring for the browser UI.
    // _INDEX.json shape (per 03-CONTEXT.md §D-03): {cacheKey, model, ritualSlug, lineId, byteLen, durationMs, createdAt}
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
        lines: entries.sort((a, b) => String(a.lineId).localeCompare(String(b.lineId))),
      }));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ rituals }, null, 2));
      return;
    } catch (err) {
      // Fall through to directory listing on malformed _INDEX.json.
    }
  }
  // Fallback: list all .opus files as un-attributed entries. _INDEX.json may
  // not exist yet if bake-all.ts hasn't run post-Plan-07 with index writes.
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
```

Server bootstrap at end of file:
```typescript
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

// ensureLoopback BEFORE listen — refuses at process level if somehow bind
// host was overridden (e.g. PREVIEW_BAKE_HOST=0.0.0.0).
const overrideHost = process.env.PREVIEW_BAKE_HOST ?? BIND_HOST;
ensureLoopback(overrideHost);

server.listen(BIND_PORT, overrideHost, () => {
  console.log(`[AUTHOR-08] Preview server: http://${overrideHost}:${BIND_PORT}`);
  console.log(`           Cache: ${BAKE_CACHE_DIR}`);
  console.log(`           Dev-only; read-only; Ctrl-C to stop.`);
});
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create scripts/preview-bake.ts with dev-guard, loopback-only bind, and path-traversal-safe Opus streaming</name>
  <files>
    scripts/preview-bake.ts
  </files>
  <read_first>
    scripts/lookup-hashed-user.ts (shebang + argv pattern),
    src/lib/dev-guard.ts (Plan 03 output — confirm assertDevOnly export),
    .planning/phases/03-authoring-throughput/03-PATTERNS.md §scripts/preview-bake.ts (full template),
    .planning/phases/03-authoring-throughput/03-RESEARCH.md §Pattern 4 (http.createServer + Range handling verbatim),
    .planning/phases/03-authoring-throughput/03-RESEARCH.md §Security Domain (cacheKey regex, path-traversal, 0.0.0.0 LAN exposure threats),
    .planning/phases/03-authoring-throughput/03-CONTEXT.md §D-13, D-14, D-15 (standalone Node script, read-only, dev-guard).
  </read_first>
  <action>
Create `scripts/preview-bake.ts` using the full structure in `<interfaces>` above. Include ALL of:

1. `#!/usr/bin/env npx tsx` shebang as line 1.
2. Header JSDoc citing AUTHOR-08 + D-13/D-14/D-15 + the four CRITICAL invariants (T-03-01, T-03-02, T-03-03, read-only).
3. `import { assertDevOnly } from "../src/lib/dev-guard";` — and a module-load `assertDevOnly();` call (T-03-02).
4. Constants: `BIND_HOST = "127.0.0.1"`, `BIND_PORT = Number(process.env.PREVIEW_BAKE_PORT ?? "8883")`, `BAKE_CACHE_DIR = path.resolve("rituals/_bake-cache")`.
5. `export function ensureLoopback(host: string): void` — throws for anything other than `127.0.0.1` and `::1`.
6. `export function handleOpusRequest(req, res, cacheDir)` — validates cacheKey against `/^[0-9a-f]{64}$/` BEFORE path.join (T-03-03 defense); handles Range requests (206/416), no-Range (200), missing file (404).
7. `export function handleIndexRequest(res)` — inline HTML shell that lists rituals via fetch to `/api/index`.
8. `export function handleIndexJson(res, cacheDir)` — reads `_INDEX.json` if present, else falls back to a directory listing of `.opus` files.
9. The http.createServer wiring at the bottom: route `/` → index HTML; `/api/index` → JSON; `/a/{cacheKey}.opus` → handleOpusRequest; everything else → 404.
10. `ensureLoopback(overrideHost)` called BEFORE `server.listen()`. Allow env override via `process.env.PREVIEW_BAKE_HOST` but ensureLoopback will still refuse it if non-loopback.
11. At the end, the `server.listen()` call and a console.log.

**IMPORTANT:** the `assertDevOnly()` call at the top of the file means importing this file from a Vitest test process with `NODE_ENV !== "production"` is safe. For the test in Task 2, the executor can either (a) set `process.env.NODE_ENV = "test"` (the default in Vitest) to avoid the throw, or (b) write tests that import the `handleOpusRequest` / `ensureLoopback` functions via `await import("../preview-bake")` inside a test body — the module-scope `assertDevOnly()` runs on first import either way, and in test env it does not throw.

The server should NOT auto-listen when imported by tests. Two options:
- (a) Use an `isDirectRun` check at the very bottom that only calls `server.listen()` when `process.argv[1]?.endsWith("preview-bake.ts")`.
- (b) Export the server object but not listen; listen is called only from a `main()` function invoked when direct-run.

Prefer (a) — matches the pattern used in `scripts/bake-all.ts` (Plan 07). Wrap the `server.listen(...)` call inside:
```typescript
const isDirectRun = process.argv[1]?.endsWith("preview-bake.ts") ?? false;
if (isDirectRun) {
  const overrideHost = process.env.PREVIEW_BAKE_HOST ?? BIND_HOST;
  ensureLoopback(overrideHost);
  server.listen(BIND_PORT, overrideHost, () => {
    console.log(`[AUTHOR-08] Preview server: http://${overrideHost}:${BIND_PORT}`);
    console.log(`           Cache: ${BAKE_CACHE_DIR}`);
    console.log(`           Dev-only; read-only; Ctrl-C to stop.`);
  });
}
```

Also export the server object so integration tests (not Phase 3 scope, but easy to support) could use it:
```typescript
export { server };
```

**Sanity check before commit:** run `npx tsx scripts/preview-bake.ts` — expect it to print `Preview server: http://127.0.0.1:8883` and listen. Ctrl-C to stop. Do NOT commit the running server; manual smoke test only. Also run with `PREVIEW_BAKE_HOST=0.0.0.0 npx tsx scripts/preview-bake.ts` → should throw the `refusing to bind to non-loopback` error and exit non-zero.

Commit: `author-08: scaffold preview-bake.ts localhost-only cache scrubber`
  </action>
  <verify>
    <automated>test -f scripts/preview-bake.ts && head -1 scripts/preview-bake.ts | grep -q "npx tsx" && grep -q "assertDevOnly" scripts/preview-bake.ts && grep -q "ensureLoopback" scripts/preview-bake.ts && grep -q "127.0.0.1" scripts/preview-bake.ts && grep -q "0-9a-f.{64}" scripts/preview-bake.ts && grep -q "audio/ogg; codecs=opus" scripts/preview-bake.ts && grep -q "Accept-Ranges" scripts/preview-bake.ts && npx tsc --noEmit && PREVIEW_BAKE_HOST=0.0.0.0 npx tsx -e "import('./scripts/preview-bake.js').catch(e => { if (/loopback/i.test(e.message)) process.exit(0); process.exit(1); })" 2>&1 ; true</automated>
  </verify>
  <acceptance_criteria>
    - `scripts/preview-bake.ts` exists with `#!/usr/bin/env npx tsx` on line 1.
    - `grep "assertDevOnly" scripts/preview-bake.ts` returns ≥ 2 matches (import + module-load call).
    - `grep "ensureLoopback" scripts/preview-bake.ts` returns ≥ 2 matches (declaration + call before listen).
    - `grep "^export function ensureLoopback" scripts/preview-bake.ts` returns 1 match.
    - `grep "^export function handleOpusRequest" scripts/preview-bake.ts` returns 1 match.
    - `grep "/\\^\\[0-9a-f\\]{64}\\$/" scripts/preview-bake.ts` returns 1 match (path-traversal defense regex).
    - `grep "audio/ogg; codecs=opus" scripts/preview-bake.ts` returns ≥ 2 matches (206 + 200 response headers).
    - `grep "Accept-Ranges" scripts/preview-bake.ts` returns ≥ 2 matches.
    - `grep "Content-Range" scripts/preview-bake.ts` returns ≥ 2 matches (206 + 416).
    - `grep "T-03-01\\|T-03-02\\|T-03-03" scripts/preview-bake.ts` returns ≥ 3 (threat-model citations).
    - `grep "isDirectRun" scripts/preview-bake.ts` returns ≥ 1 (guards server.listen for test safety).
    - `grep "BIND_PORT.*8883" scripts/preview-bake.ts` returns ≥ 1 match (default port).
    - `npx tsc --noEmit` exits 0.
    - `npm run build` exits 0.
    - Manual smoke check: `PREVIEW_BAKE_HOST=0.0.0.0 npx tsx scripts/preview-bake.ts` throws a `loopback`-containing error and exits non-zero (captured in verify automated).
  </acceptance_criteria>
  <done>
    scripts/preview-bake.ts exists, runs when invoked directly, refuses to bind on 0.0.0.0, enforces dev-only via the shared module, and validates cacheKeys against the strict hex regex. Ready for Task 2 unit tests.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Fill Plan-01 test scaffold with concrete preview-bake unit tests</name>
  <files>
    scripts/__tests__/preview-bake.test.ts
  </files>
  <read_first>
    scripts/__tests__/preview-bake.test.ts (Plan-01 Wave 0 scaffold — replace it.todo stubs),
    scripts/preview-bake.ts (Task 1 output — confirm exports),
    src/lib/__tests__/paid-route-guard.test.ts (analog: request-shape unit tests from existing repo),
    .planning/phases/03-authoring-throughput/03-PATTERNS.md §scripts/__tests__/preview-bake.test.ts (test body verbatim).
  </read_first>
  <behavior>
    - ensureLoopback throws for "0.0.0.0" with /loopback/ in message.
    - ensureLoopback throws for "192.168.1.5".
    - ensureLoopback throws for "::".
    - ensureLoopback does NOT throw for "127.0.0.1".
    - ensureLoopback does NOT throw for "::1".
    - CACHE_KEY_REGEX (via handleOpusRequest integration) rejects: cacheKey with `..`, cacheKey with `/`, cacheKey that's all uppercase hex (regex is lowercase only), cacheKey shorter than 64 chars, cacheKey longer than 64 chars, cacheKey with non-hex chars (z).
    - CACHE_KEY_REGEX accepts: exactly 64 lowercase hex chars.
    - handleOpusRequest on missing file → 404.
    - handleOpusRequest on valid file + no Range → 200 + Accept-Ranges: bytes.
    - handleOpusRequest on valid file + Range: bytes=0-99 → 206 + Content-Range: bytes 0-99/{size} + Content-Length 100.
    - handleOpusRequest on valid file + malformed Range: bytes=abc → 416.
    - handleOpusRequest on valid file + out-of-bounds Range → 416 + Content-Range: bytes */{size}.
  </behavior>
  <action>
Replace the Plan-01 `it.todo` scaffold in `scripts/__tests__/preview-bake.test.ts`:

```typescript
// @vitest-environment node
/**
 * Tests for scripts/preview-bake.ts (AUTHOR-08).
 *
 * Scope: pure unit tests — ensureLoopback, cacheKey regex + Range handler
 * via mocked req/res objects. No integration test binding a real port.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import http from "node:http";
import { Readable } from "node:stream";

// IMPORTANT: importing preview-bake runs `assertDevOnly()` at module load.
// In Vitest, NODE_ENV defaults to "test" → no throw.
import { ensureLoopback, handleOpusRequest } from "../preview-bake";

let tmpRoot: string;
beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "preview-bake-test-"));
});
afterEach(() => {
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
});

// ============================================================
// ensureLoopback (T-03-01 mitigation)
// ============================================================
describe("ensureLoopback (D-15, T-03-01)", () => {
  it("refuses 0.0.0.0 with /loopback/ in message", () => {
    expect(() => ensureLoopback("0.0.0.0")).toThrow(/loopback/i);
  });
  it("refuses 192.168.1.5 (LAN address)", () => {
    expect(() => ensureLoopback("192.168.1.5")).toThrow(/loopback/i);
  });
  it("refuses :: (IPv6 unspecified)", () => {
    expect(() => ensureLoopback("::")).toThrow(/loopback/i);
  });
  it("accepts 127.0.0.1", () => {
    expect(() => ensureLoopback("127.0.0.1")).not.toThrow();
  });
  it("accepts ::1 (IPv6 loopback)", () => {
    expect(() => ensureLoopback("::1")).not.toThrow();
  });
});

// ============================================================
// handleOpusRequest — cacheKey regex (T-03-03 path-traversal mitigation)
// ============================================================
describe("handleOpusRequest cacheKey validation (T-03-03)", () => {
  /**
   * Build a mock req/res pair for a given URL. Returns {req, captured} where
   * captured accumulates statusCode + headers + end body.
   */
  function makeMockPair(urlPath: string, rangeHeader?: string) {
    const req = {
      url: urlPath,
      headers: rangeHeader ? { range: rangeHeader } : {},
    } as unknown as http.IncomingMessage;
    const captured: {
      statusCode?: number;
      headers?: http.OutgoingHttpHeaders;
      body: Buffer[];
    } = { body: [] };
    const res = {
      writeHead(sc: number, h?: http.OutgoingHttpHeaders) {
        captured.statusCode = sc;
        captured.headers = h;
      },
      end(chunk?: string | Buffer) {
        if (chunk) captured.body.push(Buffer.from(chunk as any));
      },
      // fs.createReadStream.pipe(res) requires writable-stream behavior.
      // We stub with a minimal sink that captures what's written.
      write(chunk: string | Buffer) { captured.body.push(Buffer.from(chunk as any)); return true; },
      on() { return res as any; },
      once() { return res as any; },
      emit() { return true; },
    } as unknown as http.ServerResponse;
    return { req, res, captured };
  }

  it("rejects cacheKey with .. (400)", () => {
    const { req, res, captured } = makeMockPair("/a/../../../etc/passwd.opus");
    handleOpusRequest(req, res, tmpRoot);
    expect(captured.statusCode).toBe(400);
  });

  it("rejects cacheKey with / (treated as 404 because path does not match the route regex)", () => {
    const { req, res, captured } = makeMockPair("/a/foo/bar.opus");
    handleOpusRequest(req, res, tmpRoot);
    // /a/foo/bar.opus does not match /^\/a\/([^/]+)\.opus$/, so the handler
    // falls into the "not a /a/...opus path" 404 branch.
    expect(captured.statusCode).toBe(404);
  });

  it("rejects uppercase hex cacheKey (400 — regex is lowercase only)", () => {
    const upper = "A".repeat(64);
    const { req, res, captured } = makeMockPair(`/a/${upper}.opus`);
    handleOpusRequest(req, res, tmpRoot);
    expect(captured.statusCode).toBe(400);
  });

  it("rejects cacheKey shorter than 64 chars (400)", () => {
    const short = "a".repeat(63);
    const { req, res, captured } = makeMockPair(`/a/${short}.opus`);
    handleOpusRequest(req, res, tmpRoot);
    expect(captured.statusCode).toBe(400);
  });

  it("rejects cacheKey longer than 64 chars (400)", () => {
    const long = "a".repeat(65);
    const { req, res, captured } = makeMockPair(`/a/${long}.opus`);
    handleOpusRequest(req, res, tmpRoot);
    expect(captured.statusCode).toBe(400);
  });

  it("rejects cacheKey with non-hex chars (400)", () => {
    const bad = "z".repeat(64);
    const { req, res, captured } = makeMockPair(`/a/${bad}.opus`);
    handleOpusRequest(req, res, tmpRoot);
    expect(captured.statusCode).toBe(400);
  });

  it("accepts valid 64-hex-char cacheKey + returns 404 for missing file", () => {
    const valid = "a".repeat(64);
    const { req, res, captured } = makeMockPair(`/a/${valid}.opus`);
    handleOpusRequest(req, res, tmpRoot);
    // Valid key but file doesn't exist → 404 (not 400).
    expect(captured.statusCode).toBe(404);
  });
});

// ============================================================
// handleOpusRequest — Range handling
// ============================================================
describe("handleOpusRequest Range handling (RFC 7233)", () => {
  function makeMockPair(urlPath: string, rangeHeader?: string) {
    const req = {
      url: urlPath,
      headers: rangeHeader ? { range: rangeHeader } : {},
    } as unknown as http.IncomingMessage;
    const captured: { statusCode?: number; headers?: http.OutgoingHttpHeaders } = {};
    const res = {
      writeHead(sc: number, h?: http.OutgoingHttpHeaders) {
        captured.statusCode = sc;
        captured.headers = h;
      },
      end() {},
      write() { return true; },
      on() { return res as any; },
      once() { return res as any; },
      emit() { return true; },
    } as unknown as http.ServerResponse;
    return { req, res, captured };
  }

  function seedOpus(size: number): string {
    const key = "a".repeat(64);
    const filepath = path.join(tmpRoot, `${key}.opus`);
    fs.writeFileSync(filepath, Buffer.alloc(size, 0x55));
    return key;
  }

  it("returns 200 + Accept-Ranges when no Range header", () => {
    const key = seedOpus(1000);
    const { req, res, captured } = makeMockPair(`/a/${key}.opus`);
    handleOpusRequest(req, res, tmpRoot);
    expect(captured.statusCode).toBe(200);
    expect(captured.headers!["Content-Type"]).toBe("audio/ogg; codecs=opus");
    expect(captured.headers!["Accept-Ranges"]).toBe("bytes");
    expect(captured.headers!["Content-Length"]).toBe(1000);
  });

  it("returns 206 + Content-Range on bytes=0-99", () => {
    const key = seedOpus(1000);
    const { req, res, captured } = makeMockPair(`/a/${key}.opus`, "bytes=0-99");
    handleOpusRequest(req, res, tmpRoot);
    expect(captured.statusCode).toBe(206);
    expect(captured.headers!["Content-Range"]).toBe("bytes 0-99/1000");
    expect(captured.headers!["Content-Length"]).toBe(100);
  });

  it("returns 206 on open-ended bytes=500- (to end of file)", () => {
    const key = seedOpus(1000);
    const { req, res, captured } = makeMockPair(`/a/${key}.opus`, "bytes=500-");
    handleOpusRequest(req, res, tmpRoot);
    expect(captured.statusCode).toBe(206);
    expect(captured.headers!["Content-Range"]).toBe("bytes 500-999/1000");
    expect(captured.headers!["Content-Length"]).toBe(500);
  });

  it("returns 416 on malformed Range: bytes=abc", () => {
    const key = seedOpus(1000);
    const { req, res, captured } = makeMockPair(`/a/${key}.opus`, "bytes=abc");
    handleOpusRequest(req, res, tmpRoot);
    expect(captured.statusCode).toBe(416);
    expect(captured.headers!["Content-Range"]).toBe("bytes */1000");
  });

  it("returns 416 on out-of-bounds Range: bytes=2000-3000", () => {
    const key = seedOpus(1000);
    const { req, res, captured } = makeMockPair(`/a/${key}.opus`, "bytes=2000-3000");
    handleOpusRequest(req, res, tmpRoot);
    expect(captured.statusCode).toBe(416);
  });
});
```

Commit: `author-08: test preview-bake ensureLoopback + cacheKey regex + Range handling`
  </action>
  <verify>
    <automated>npx vitest run --no-coverage scripts/__tests__/preview-bake.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - Test file has no `it.todo(` remaining: `grep -c "it.todo(" scripts/__tests__/preview-bake.test.ts` returns 0.
    - `npx vitest run --no-coverage scripts/__tests__/preview-bake.test.ts` exits 0 with 17+ tests passing (5 ensureLoopback + 7 cacheKey + 5 Range).
    - All 5 ensureLoopback tests pass.
    - All 7 cacheKey-validation tests pass.
    - All 5 Range-handling tests pass.
    - Full test suite green: `npx vitest run --no-coverage` exits 0.
  </acceptance_criteria>
  <done>
    17+ passing unit tests cover the three T-03-XX threat mitigations (T-03-01 loopback-only, T-03-03 path-traversal, RFC 7233 Range handling). Regression guard is in place — any future edit that weakens the cacheKey regex or relaxes the loopback-only bind will fail the suite.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| LAN → 127.0.0.1:8883 | loopback-only bind means NO LAN client can reach the server |
| Browser → preview-bake | browser is trusted (Shannon's dev machine); server serves any cacheKey that matches the regex from anywhere under `rituals/_bake-cache/` |
| Filesystem → preview-bake process | the process has read access to the entire cache dir; T-03-03 mitigates path-traversal |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-01 | Information Disclosure | Preview server binds to 0.0.0.0 → LAN exposure of unreleased ritual content | mitigate | (a) `BIND_HOST = "127.0.0.1"` hardcoded default. (b) `ensureLoopback(host)` called before `server.listen()`, throws on anything other than `127.0.0.1` / `::1`. (c) `PREVIEW_BAKE_HOST` env override still goes through `ensureLoopback` — refusing LAN IPs even when env-overridden. (d) Unit tests assert refusal for `0.0.0.0`, `192.168.1.5`, `::`. |
| T-03-02 | Information Disclosure | Preview server runs in production → leaks dev-only authoring UI to end users | mitigate | `assertDevOnly()` from Plan 03's `src/lib/dev-guard.ts` called at module load. Process exits with `[DEV-GUARD]` error message before `server.listen()` is ever reached when `NODE_ENV === "production"`. |
| T-03-03 | Tampering | Path-traversal via `/a/../../../etc/passwd.opus` reads arbitrary files | mitigate | `CACHE_KEY_REGEX = /^[0-9a-f]{64}$/` validation runs BEFORE `path.join(cacheDir, key + ".opus")`. Unit tests assert rejection of `..`, `/`, uppercase, short, long, non-hex. Additionally the URL-path regex `/^\/a\/([^/]+)\.opus$/` prevents `/a/foo/bar.opus` from ever reaching the inner path.join. |
| T-03-08 | Denial of Service | Large Range reads exhaust memory or disk I/O | accept | Loopback-only server on Shannon's dev machine. Worst case: ctrl-C the server. No persistent state to corrupt. |
</threat_model>

<verification>
- `npx vitest run --no-coverage scripts/__tests__/preview-bake.test.ts` — 17+ tests pass.
- `npx vitest run --no-coverage` full-suite — exits 0.
- `npx tsc --noEmit` — exits 0.
- `npm run build` — exits 0.
- Manual smoke: `npx tsx scripts/preview-bake.ts` logs `Preview server: http://127.0.0.1:8883` and accepts browser GET /.
- Manual smoke: `PREVIEW_BAKE_HOST=0.0.0.0 npx tsx scripts/preview-bake.ts` throws and exits non-zero.
- Manual smoke: `NODE_ENV=production npx tsx scripts/preview-bake.ts` throws `[DEV-GUARD]` and exits non-zero.
- Browser integration (per 03-VALIDATION.md §Manual-Only Verifications): Shannon opens http://localhost:8883, sees ritual list, plays a baked line, confirms audio plays + scrub bar works.
</verification>

<success_criteria>
- `scripts/preview-bake.ts` exists as an executable `#!/usr/bin/env npx tsx` standalone server bound to `127.0.0.1:8883`.
- `assertDevOnly()` runs at module load (T-03-02 mitigation).
- `ensureLoopback()` runs before `server.listen()` and refuses any non-loopback host (T-03-01 mitigation).
- `/a/{cacheKey}.opus` validates the key against a strict 64-hex regex BEFORE path.join (T-03-03 mitigation) and serves Range requests per RFC 7233.
- Server is read-only — no Gemini/Google/Groq API key loaded into its runtime (D-14).
- 17+ unit tests cover loopback refusal, cacheKey regex, and Range shapes.
- `npm run preview-bake` (script entry from Plan 01) runs the server.
- Shannon can scrub baked lines in a browser against localhost:8883 (per Phase 3 success criterion 7 from ROADMAP.md).
</success_criteria>

<output>
After completion, create `.planning/phases/03-authoring-throughput/03-08-SUMMARY.md` documenting:
- Paths to scripts/preview-bake.ts + test file, line counts
- All exported symbols (ensureLoopback, handleOpusRequest, handleIndexRequest, handleIndexJson, server)
- Test count (5 ensureLoopback + 7 cacheKey + 5 Range = 17+ tests)
- Confirmation that manual smoke tests pass (default 127.0.0.1 bind works; 0.0.0.0 override refuses; NODE_ENV=production refuses)
- Any TODO notes for future enhancement (e.g., line-level _INDEX.json requires Plan 07 to write that index during bake; the preview falls back to directory listing if absent)
- Commit SHAs for both commits
</output>
