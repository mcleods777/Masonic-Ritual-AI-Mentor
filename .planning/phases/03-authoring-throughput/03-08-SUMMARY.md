---
phase: 03-authoring-throughput
plan: 08
subsystem: preview-server
tags: [preview-server, localhost, http, range-requests, dev-guard, path-traversal-mitigation, author-08]

# Dependency graph
requires:
  - phase: 03-authoring-throughput
    plan: 01
    provides: Wave 0 preview-bake.test.ts scaffold + vitest config + preview-bake npm script entry
  - phase: 03-authoring-throughput
    plan: 03
    provides: src/lib/dev-guard.ts assertDevOnly() — called at module load (T-03-02)
  - phase: 03-authoring-throughput
    plan: 05
    provides: rituals/_bake-cache/ cache dir location (CACHE_DIR) — source of .opus files the preview server streams
provides:
  - scripts/preview-bake.ts as the localhost-only cache-scrubber HTTP server (AUTHOR-08)
  - ensureLoopback(host) — T-03-01 loopback-bind guard refusing 0.0.0.0, LAN IPs, ::
  - handleOpusRequest — T-03-03 defense-in-depth (regex gate + path.resolve containment + realpath containment)
  - CACHE_KEY_REGEX — exported /^[0-9a-f]{64}$/ for test monkey-patching and sanity
  - handleIndexRequest / handleIndexJson — browser UI + JSON endpoint over _INDEX.json (fallback to readdir)
  - 20 unit tests covering T-03-01, T-03-03 layer 1 + layer 2 (including symlink-escape), RFC 7233 Range shapes
affects: []

# Tech tracking
tech-stack:
  added: []  # all deps already installed in Plan 01 (node:http, node:fs, node:path from stdlib)
  patterns:
    - "Two-layer T-03-03 path-traversal mitigation: regex gate (layer 1, before path.join) + path.resolve-containment (layer 2a, catches .. traversal) + fs.realpathSync-containment (layer 2b, catches symlink escape)"
    - "isDirectRun guard (process.argv[1]?.endsWith('preview-bake.ts')) lets tests import helpers without spawning the HTTP listener"
    - "Stream-error handler on fs.createReadStream.pipe(res) — mid-stream ENOENT race (cache eviction) now emits res.end() quietly instead of crashing the server"
    - "Loopback-only bind enforced via ensureLoopback(overrideHost) BEFORE server.listen() — env override (PREVIEW_BAKE_HOST) still goes through the guard, not just the hardcoded default"

key-files:
  created:
    - scripts/preview-bake.ts
    - .planning/phases/03-authoring-throughput/03-08-SUMMARY.md
  modified:
    - scripts/__tests__/preview-bake.test.ts

key-decisions:
  - "Rule 1 bug fix during Task 2: original T-03-03 layer 2 used only path.resolve() which does NOT dereference symlinks. Added fs.realpathSync() containment (layer 2b) that follows the link to its target. Symlink-escape test (which would have been a false-positive-pass without the fix) correctly returns 400."
  - "Rule 2 critical functionality added during Task 2: stream-error handlers on fs.createReadStream.pipe(res) — mid-stream ENOENT (e.g. cache eviction race) previously crashed the server with uncaught error. Now emits res.end() quietly and the server stays up."
  - "isDirectRun guard used over main()-export pattern to match scripts/bake-all.ts (Plan 07). Predicate: `process.argv[1]?.endsWith('preview-bake.ts') ?? false`. Tests import ensureLoopback/handleOpusRequest/CACHE_KEY_REGEX without spawning the listener."
  - "CACHE_KEY_REGEX exported (not module-internal) so the test file could sanity-assert the exact regex without brittle source-grep — blocks silent drift to looser regexes during future refactors."
  - "handleIndexJson falls back to readdirSync-based directory listing when rituals/_bake-cache/_INDEX.json is absent. Plan 07's bake-all.ts does NOT yet write _INDEX.json (deferred to post-Phase-3 per the orchestrator's D-03 note); the preview still works against a raw cache dir."

patterns-established:
  - "Any future localhost-only dev server in this repo should follow the two-layer T-03-03 pattern: regex gate BEFORE path.join, + fs.realpathSync containment AFTER, for full symlink-escape defense."
  - "Any future localhost bind in this repo should call ensureLoopback() or equivalent before server.listen() — default BIND_HOST 127.0.0.1 alone is insufficient since env overrides are a reasonable dev knob."

requirements-completed: [AUTHOR-08]

# Metrics
duration: ~6min
completed: 2026-04-23
---

# Phase 3 Plan 08: Preview-Bake Cache Scrubber Server Summary

**Created `scripts/preview-bake.ts` (390 lines) — AUTHOR-08's localhost-only HTTP cache scrubber. Binds `127.0.0.1:8883`, refuses production via Plan 03's assertDevOnly(), refuses non-loopback hosts via ensureLoopback(), and streams cached Opus files via RFC 7233 Range-aware responses. Defense-in-depth path-traversal safety: regex gate /^[0-9a-f]{64}$/ BEFORE path.join, then path.resolve-containment AFTER (catches .. escapes), PLUS fs.realpathSync-containment (catches symlink-escape — a Rule 1 bug caught by the Task 2 symlink test). Replaces Plan-01's preview-bake.test.ts it.todo scaffold with 20 concrete unit tests. Last plan in Phase 3 — 8/8 complete.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-04-23T19:52:46Z
- **Completed:** 2026-04-23T19:59:22Z
- **Tasks:** 2/2
- **Files created:** 2 (`scripts/preview-bake.ts`, this SUMMARY)
- **Files modified:** 1 (`scripts/__tests__/preview-bake.test.ts` — scaffold replaced)

## Accomplishments

### T-03-01: Loopback-only bind (ensureLoopback)

`ensureLoopback(host: string): void` — exported helper that throws when `host` is anything other than `"127.0.0.1"` or `"::1"`. Called BEFORE `server.listen()` at the `isDirectRun` bootstrap block. Env override `PREVIEW_BAKE_HOST` still flows through the guard, so a mis-configured dev machine cannot accidentally expose unreleased ritual content to the LAN. Error message cites `[AUTHOR-08 D-15]` and `loopback` for log-greppability.

Unit tests cover all 5 cases: `0.0.0.0` (throws), `192.168.1.5` (throws), `::` IPv6 unspecified (throws), `127.0.0.1` (accepts), `::1` IPv6 loopback (accepts).

### T-03-02: Production refusal (assertDevOnly)

`assertDevOnly()` imported from `src/lib/dev-guard.ts` (Plan 03's shared module) and called at MODULE LOAD — synchronously, before `http.createServer()`. A `NODE_ENV=production npx tsx scripts/preview-bake.ts` invocation throws `[DEV-GUARD] refusing to run in production (NODE_ENV=production). This module is dev-only.` and exits non-zero. Vitest's default `NODE_ENV=test` satisfies the guard, so the test file can `import { ensureLoopback, handleOpusRequest, CACHE_KEY_REGEX } from "../preview-bake"` without tripping it.

### T-03-03: Defense-in-depth path-traversal mitigation (three gates)

1. **URL-path regex** — `/^\/a\/([^/]+)\.opus$/` disallows further slashes in the cacheKey position, so `/a/foo/bar.opus` never reaches the inner path.join (tests as 404, not 400).
2. **Layer 1 — cacheKey regex gate** (before `path.join`) — `CACHE_KEY_REGEX = /^[0-9a-f]{64}$/` rejects `..`, `/`, `.`, uppercase, non-hex, short, long. Tests cover all 6 rejection axes plus one acceptance + CACHE_KEY_REGEX export sanity.
3. **Layer 2 — path-containment assertion** (after `path.join`) — **two sub-checks:**
   - **Layer 2a:** `path.resolve(opusPath).startsWith(rootAbs + path.sep)` — catches `..` escape if the regex is ever relaxed.
   - **Layer 2b:** `fs.realpathSync(resolved).startsWith(fs.realpathSync(rootAbs) + path.sep)` — catches **symlink-escape**, where a valid-hex filename inside cacheDir is a symlink whose target is outside. This is the load-bearing defense-in-depth layer; the symlink-escape test plants exactly such a file and proves response is 400 + zero escape-file bytes served.

### RFC 7233 Range streaming

`<audio>` element + Chromium requires HTTP Range support (tracked in the skill `chromium-err-range-audio-blob-chunked-transfer`). handleOpusRequest implements:

| Condition | Response |
| --- | --- |
| No `Range` header | `200` + `Accept-Ranges: bytes` + `Content-Length` + full body |
| `Range: bytes=M-N` (valid) | `206` + `Content-Range: bytes M-N/size` + `Content-Length: N-M+1` + sliced body |
| `Range: bytes=M-` (open-ended) | `206` + `Content-Range: bytes M-(size-1)/size` + remainder of file |
| `Range: bytes=abc` (malformed) | `416` + `Content-Range: bytes */size` |
| `Range: bytes=2000-3000` on 1000-byte file (OOB) | `416` + `Content-Range: bytes */size` |
| File missing after regex + containment pass | `404` |

MIME is `audio/ogg; codecs=opus` per RFC 7845 §9 — matches Chromium's expected media-type string for Opus-in-Ogg `<audio>` playback.

### Browser UI (/) and index endpoint (/api/index)

- **GET `/`** — handleIndexRequest serves a single-file no-framework HTML shell that `fetch()`es `/api/index`, groups by ritual, and renders `<audio controls preload="none" src="/a/{cacheKey}.opus">` per line. Cache dir path + NODE_ENV surfaced in the header for operator sanity.
- **GET `/api/index`** — handleIndexJson reads `rituals/_bake-cache/_INDEX.json` if present (shape per 03-CONTEXT.md D-03: `{cacheKey, model, ritualSlug, lineId, byteLen, durationMs, createdAt}[]`) and groups by `ritualSlug` for the UI. Falls back to a `readdirSync` listing of `.opus` files under a single "uncategorized" bucket when `_INDEX.json` doesn't exist yet — which is the current state since Plan 07's bake-all.ts deferred index-writing to post-Phase-3.

### Read-only invariant (D-14)

The server loads zero paid-AI secrets: no `GEMINI_API_KEY`, `GOOGLE_TTS_KEY`, or `GROQ_API_KEY` reads. It cannot re-render a line, cannot modify a `.mram` file, cannot write anywhere on disk. Shannon's workflow when a bad line is spotted is documented inline: edit the dialogue file → rerun `bake-all.ts` (which evicts + rebakes via cache miss) → refresh the preview. No write-side surface area in the preview process.

## Exported Symbols (scripts/preview-bake.ts)

```typescript
export function ensureLoopback(host: string): void;
export const CACHE_KEY_REGEX: RegExp;  // /^[0-9a-f]{64}$/
export function handleOpusRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  cacheDir: string,
): void;
export function handleIndexRequest(res: http.ServerResponse): void;
export function handleIndexJson(res: http.ServerResponse, cacheDir: string): void;
export { server };  // http.Server — for integration tests
```

## Test Coverage (scripts/__tests__/preview-bake.test.ts)

20 tests total, 299 lines:

| Suite | Tests | T-XX coverage |
| --- | --- | --- |
| ensureLoopback | 5 | T-03-01 (LAN exposure) |
| cacheKey validation | 8 | T-03-03 layer 1 (regex gate) |
| path-containment | 2 | T-03-03 layer 2 (defense-in-depth, including symlink-escape) |
| Range handling | 5 | RFC 7233 shape conformance |

The symlink-escape test is the load-bearing layer-2 proof: it plants a `{valid-hex}.opus` symlink inside tmpRoot whose target is a 100-byte `secret.opus` in a sibling escapeDir. handleOpusRequest must return `400` AND must have written fewer than 100 bytes to the mock response. On platforms that disallow symlink creation (Windows without developer mode, some CI sandboxes), the test logs a warning and returns early — still counts as a pass since the symlink attack vector is not reachable on those platforms.

## Task Commits

Each task committed atomically on `gsd/phase-3-authoring-throughput`:

1. **Task 1: Scaffold preview-bake.ts** — `a679360` (`author-08: scaffold preview-bake.ts localhost-only cache scrubber with defense-in-depth path containment`)
2. **Task 2: Fill test scaffold + Rule 1 bug fix + Rule 2 critical fix** — `643baf7` (`author-08: test preview-bake ensureLoopback + cacheKey regex + path-containment + Range handling`)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] T-03-03 layer 2 was non-functional against symlinks**
- **Found during:** Task 2 (symlink-escape test)
- **Issue:** Task 1 used `path.resolve(opusPath).startsWith(rootAbs + path.sep)` as the sole layer 2 containment. `path.resolve()` only normalizes `..` — it does NOT dereference symlinks. A `{valid-hex}.opus` symlink inside cacheDir with a target outside cacheDir was passing the startsWith check because the symlink's own path is under cacheDir; only the target is outside. The symlink-escape test surfaced this as a statusCode=200 when it should have been 400.
- **Fix:** Added `fs.realpathSync()` containment as layer 2b — `fs.realpathSync(resolved).startsWith(fs.realpathSync(rootAbs) + path.sep)`. The realpath follows symlinks to the actual target. Wrapped in try/catch for the race where the file disappears between `existsSync` and `realpathSync` (treated as 404, not 500).
- **Files modified:** `scripts/preview-bake.ts` (added layer 2b block after existsSync; updated the layer 2 docstring comment to correctly describe path.resolve's actual semantics).
- **Commit:** `643baf7` (bundled with Task 2 tests that exposed the bug)

**2. [Rule 2 - Critical] Missing stream-error handlers on fs.createReadStream.pipe(res)**
- **Found during:** Task 2 (ENOENT uncaught-error noise during Range-handling tests)
- **Issue:** `fs.createReadStream(resolved).pipe(res)` returns immediately; the stream opens async and can emit `error` if the file disappears (cache eviction race, tmp-dir cleanup, concurrent rm -rf). An unhandled `error` event on a Readable stream crashes the Node process. In production this means a single race between `statSync` success and stream open could kill the entire preview server.
- **Fix:** Attached `stream.on("error", () => res.end())` before `stream.pipe(res)` on both the 206 and 200 branches. Client sees a truncated read (correct signal on race); server stays up.
- **Files modified:** `scripts/preview-bake.ts` (both pipe callsites in handleOpusRequest).
- **Commit:** `643baf7`

Both auto-fixes were bundled into the Task 2 commit because the Task 2 tests were what exposed them — the scope boundary rule ("only auto-fix issues directly caused by the current task's changes") applies cleanly since preview-bake.ts was the current-task file.

## Issues Encountered

None beyond the two auto-fixes above. Verification ran clean on the first attempt after the fixes:
- `npx tsc --noEmit` — zero errors in preview-bake.ts; the 26 pre-existing errors in unrelated files (same baseline as Plan 05/06/07) remain out of scope per the Scope Boundary rule.
- `npm run build` — exits 0, all routes compile.
- `npx vitest run --no-coverage scripts/__tests__/preview-bake.test.ts` — 20/20 passed.
- `npx vitest run --no-coverage` (full suite) — **517 passed across 43 files**, zero failures, zero regressions vs Plan 07 baseline (497 passed + 12 todo → 517 passed + 0 todo; +20 tests from filling this scaffold, -12 todos from filling ALL remaining Phase 3 scaffolds).

## Smoke Test Results

All three manual smoke tests pass:

1. **Default dev start:** `npx tsx scripts/preview-bake.ts` → logs `[AUTHOR-08] Preview server: http://127.0.0.1:8883` and listens. (Ctrl-C to stop.)
2. **Non-loopback override refused:** `PREVIEW_BAKE_HOST=0.0.0.0 npx tsx scripts/preview-bake.ts` → throws `[AUTHOR-08 D-15] refusing to bind to non-loopback host "0.0.0.0"...` and exits non-zero.
3. **Production refused:** `NODE_ENV=production npx tsx scripts/preview-bake.ts` → throws `[DEV-GUARD] refusing to run in production (NODE_ENV=production). This module is dev-only.` and exits non-zero.

## User Setup Required

None. Shannon can run `npm run preview-bake` (script entry already added in Plan 01) or `npx tsx scripts/preview-bake.ts` directly. The first time he visits `http://127.0.0.1:8883` after a full Phase 3 bake, he'll see either:

- **If `_INDEX.json` exists** (post-Plan-07 enhancement): rituals grouped by slug, line IDs + model + duration surfaced in the line meta.
- **If `_INDEX.json` does NOT exist yet** (current state): all cached `.opus` files bucketed under "uncategorized" with cacheKey-prefix as the line label. Still playable end-to-end.

## TODO Notes for Future Enhancement

- **Line-level `_INDEX.json` writer** — Plan 07's `bake-all.ts` orchestrator reserved the slot but does not yet write the index during bake. When added (post-Phase-3), the preview auto-upgrades from directory-listing to full slug/lineId/model surface with zero changes to preview-bake.ts.
- **Integration test binding a real port** — deliberately out of scope for Phase 3 (spec says "No integration test binding a real port"). If Shannon later wants a full end-to-end test, the exported `server` object from preview-bake.ts supports it: import server, set PREVIEW_BAKE_PORT to 0 (ephemeral), listen, hit via `http.get`, close.
- **Sticky cacheDir realpath** — currently `fs.realpathSync(rootAbs)` runs once per request. If Shannon ever profiles and finds this matters, cache the realpath at startup (not every request). Current overhead is negligible — one syscall per GET.

## Next Phase Readiness

**Phase 3 is now 8/8 complete.** All AUTHOR-01..10 requirements are landed on `gsd/phase-3-authoring-throughput`:

- AUTHOR-01 (content-addressed cache + migration) — Plan 05
- AUTHOR-02 (bake-all orchestrator) — Plan 07
- AUTHOR-03 (model fallback pin) — Plan 05
- AUTHOR-04 (short-line policy) — Plan 06
- AUTHOR-05 (cipher/plain parity validator) — Plan 04
- AUTHOR-06 (audio-duration anomaly detector) — Plan 06
- AUTHOR-07 (`--verify-audio` STT round-trip) — Plan 06
- **AUTHOR-08 (preview-bake localhost server) — this plan**
- AUTHOR-09 (p-limit concurrency cap) — Plan 07
- AUTHOR-10 (idb-schema + feedbackTraces) — Plan 02

Phase 3 goal from ROADMAP.md — "Shannon can scrub baked lines in a browser against localhost:8883 before re-encrypting .mram" — is now satisfied by this plan's preview server. Phase 3 ready for `/gsd-transition` to Phase 4 (Content Coverage).

## Self-Check: PASSED

### Files claimed created
- `scripts/preview-bake.ts` — FOUND (390 lines; `#!/usr/bin/env npx tsx` on line 1; all 5 exports present; 3 T-03-XX citation greps + layer 2b realpath logic verified).
- `.planning/phases/03-authoring-throughput/03-08-SUMMARY.md` — FOUND (this file).

### Files claimed modified
- `scripts/__tests__/preview-bake.test.ts` — FOUND (299 lines; 0 `it.todo(` remaining; 20/20 tests passing).

### Commits claimed
- `a679360` — FOUND on `gsd/phase-3-authoring-throughput` (Task 1: preview-bake.ts scaffold).
- `643baf7` — FOUND on `gsd/phase-3-authoring-throughput` (Task 2: test scaffold filled + Rule 1/2 fixes).

### Acceptance criteria verification
- `head -1 scripts/preview-bake.ts` → `#!/usr/bin/env npx tsx` (shebang present).
- `grep -c "assertDevOnly" scripts/preview-bake.ts` → 4 (import + module-load call + docstring + threat-model comment).
- `grep -c "ensureLoopback" scripts/preview-bake.ts` → 4 (declaration + call before listen + 2 doc refs).
- `grep -c "^export function ensureLoopback" scripts/preview-bake.ts` → 1.
- `grep -c "^export function handleOpusRequest" scripts/preview-bake.ts` → 1.
- `grep -c "^export const CACHE_KEY_REGEX" scripts/preview-bake.ts` → 1.
- `grep -c "resolved.startsWith" scripts/preview-bake.ts` → 1 (layer 2a containment).
- `grep -c "rootAbs" scripts/preview-bake.ts` → 6 (layer 2a + layer 2b references).
- `grep -c "path.resolve" scripts/preview-bake.ts` → 6.
- `grep -c "audio/ogg; codecs=opus" scripts/preview-bake.ts` → 3 (206 + 200 + MIME doc).
- `grep -c "Accept-Ranges" scripts/preview-bake.ts` → 3.
- `grep -c "Content-Range" scripts/preview-bake.ts` → 4.
- `grep -cE "T-03-01|T-03-02|T-03-03" scripts/preview-bake.ts` → 12.
- `grep -c "isDirectRun" scripts/preview-bake.ts` → 3.
- `grep -c 'BIND_PORT.*8883' scripts/preview-bake.ts` → 1.
- `grep -c "realpathSync" scripts/preview-bake.ts` → 4 (layer 2b symlink-escape defense).
- `grep -c "it.todo(" scripts/__tests__/preview-bake.test.ts` → 0 (scaffold fully filled).
- `grep -cE "containment|outside cacheDir" scripts/__tests__/preview-bake.test.ts` → 9.
- `grep -c "symlink" scripts/__tests__/preview-bake.test.ts` → 7.
- `grep -c "CACHE_KEY_REGEX" scripts/__tests__/preview-bake.test.ts` → 5.

### Runtime verification
- `npx vitest run --no-coverage scripts/__tests__/preview-bake.test.ts` → **20 passed / 0 failed / 0 todo** (20 tests: 5 ensureLoopback + 8 cacheKey validation + 2 containment + 5 Range; the acceptance criterion asked for 19+ with 1 possibly skipped on no-symlink platforms — this run, on WSL2 Linux, all 20 ran).
- `npx vitest run --no-coverage` (full suite) → **517 passed across 43 files**, zero failures, zero todos remaining in Phase 3 scaffolds.
- `npx tsc --noEmit` on preview-bake.ts → 0 errors (pre-existing errors in unrelated files stay out of scope per Scope Boundary rule).
- `npm run build` → exit 0, 27 routes generated.
- `PREVIEW_BAKE_HOST=0.0.0.0 npx tsx scripts/preview-bake.ts` → throws with `loopback`, exit non-zero.
- `NODE_ENV=production npx tsx scripts/preview-bake.ts` → throws with `[DEV-GUARD]`, exit non-zero.
- `npx tsx scripts/preview-bake.ts` → `[AUTHOR-08] Preview server: http://127.0.0.1:8883` + listens until Ctrl-C.

---
*Phase: 03-authoring-throughput*
*Completed: 2026-04-23*
