# Phase 3: Authoring Throughput - Research

**Researched:** 2026-04-21
**Domain:** Offline bake orchestration, content-addressed cache, IndexedDB schema unification, localhost-only preview server
**Confidence:** HIGH

## Summary

Phase 3 is an entirely-internal tooling lift: no runtime surface changes, no invited-user-visible behavior changes. It builds a bake orchestrator (`scripts/bake-all.ts`) around the existing `render-gemini-audio.ts` / `build-mram-from-dialogue.ts` / `author-validation.ts` chain, adds a content-addressed cache under `rituals/_bake-cache/`, layers five bake-time correctness gates (cipher/plain parity validator, short-line Google-TTS auto-route, duration-anomaly detector, optional Whisper round-trip, `--resume` crash safety), hoists IndexedDB schema into a single source of truth (`src/lib/idb-schema.ts`), and ships a localhost-only cache-scrubbing server (`scripts/preview-bake.ts`). Every material implementation decision is already locked in CONTEXT.md D-01..D-21; the research question is **how** to execute cleanly against verified current-version APIs.

All external dependencies — `p-limit`, `fake-indexeddb`, Google Cloud TTS REST, Gemini 3.1 flash TTS preview, `music-metadata` for Opus duration, Node 20 `fs.cp` for cache migration — are available and verified in this environment (Node 20.20, ffmpeg 6.1.1, git 2.43.0, npx 10.8.2; 438 existing `.opus` files in the legacy `~/.cache/masonic-mram-audio/` cache ready to migrate).

**Primary recommendation:** Structure Phase 3 as 10 plans sequenced `infra first → orchestrator → gates → preview → schema test`, in that order. Build the cache-migration + key-bump (AUTHOR-01) and idb-schema extraction (AUTHOR-10) first because they are foundational dependencies; layer the orchestrator, gates, and preview server on top.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Content-addressed bake cache (AUTHOR-01) | Build-time script (Node) | Filesystem (`rituals/_bake-cache/`) | Bake is an offline workflow; cache lives with the repo it serves |
| Bake orchestrator (`bake-all.ts` AUTHOR-02, AUTHOR-09) | Build-time script (Node) | Git (via `git diff` for `--since`) | Orchestrator composes existing scripts; no server or browser involvement |
| Gemini model fallback chain pin (AUTHOR-03) | Build-time script (Node) | — | Ordering-only change inside `render-gemini-audio.ts`; no runtime impact |
| Short-line Google TTS auto-route (AUTHOR-04) | Build-time script (Node) | Google Cloud TTS REST API | Bake runs with no dev server; script must call Google REST directly |
| Cipher/plain parity validator (AUTHOR-05) | Build-time script + shared lib | `src/lib/author-validation.ts` | Shared module consumed by `/author` UI today; orchestrator will reuse |
| Audio-duration anomaly detector (AUTHOR-06) | Build-time script (Node) | Opus metadata parsing | Reads durations from Opus files produced by the bake |
| Optional STT round-trip verify (AUTHOR-07) | Build-time script (Node) | `/api/transcribe` Groq Whisper route (live HTTP call) | Orchestrator opt-in; reuses the shipping transcribe route's Bearer-gated endpoint |
| Preview-bake server (AUTHOR-08) | Standalone Node script | Browser `<audio>` element (client) | Localhost-only read-only streaming server; no Next involvement |
| Concurrency cap (AUTHOR-09) | Build-time script (Node) | — | Wraps the Gemini API calls inside the orchestrator |
| `idb-schema.ts` single source of truth (AUTHOR-10) | Browser (IndexedDB) | — | Pure schema/types module consumed by `storage.ts` + `voice-storage.ts` |

## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01..D-03 — Cache layout, key, invalidation (AUTHOR-01):**
- Cache location: `rituals/_bake-cache/`, gitignored. One-shot migration by `fs.cp` copy (not symlink, not delete) from existing `~/.cache/masonic-mram-audio/`; old location stays intact for rollback.
- Cache key formula: `sha256(KEY_VERSION + text + style + voice + modelId + preamble)`. Bumps `CACHE_KEY_VERSION` `"v2"` → `"v3"` (auto-invalidates existing entries to avoid stale 2.5-pro-tagged-as-3.1-flash hits).
- Cache entry storage: same shape as today (`{cacheKey}.opus` files); add a single `_INDEX.json` recording `{cacheKey, model, ritualSlug, lineId, byteLen, durationMs, createdAt}` for every entry.

**D-04..D-07 — Orchestrator (AUTHOR-02, AUTHOR-09):**
- `--since <git-ref>`: rebake rituals whose plain OR cipher dialogue file changed since `<ref>` via `git diff --name-only <ref> -- 'rituals/*-dialogue.md' 'rituals/*-dialogue-cipher.md'`. Default `<ref>` = `HEAD~1`. Cipher-only changes still trigger because validators must run.
- `--dry-run`: per-ritual roll-up `{ritual, lines-total, cache-hit, cache-miss, validator-fail, would-bake-seconds-est}` + aggregate. No Gemini calls, no `.mram` writes.
- `--resume`: state file `rituals/_bake-cache/_RESUME.json` written after every completed line. Skips completed line IDs; retries in-flight ones. State file deleted on clean finish per ritual.
- `--parallel N` default **4** (conservative against preview-tier rate limits). Clamps to `[1, 16]`. Backed by `p-limit`. Per-key rotation inside `render-gemini-audio.ts` continues to fire independently of the global concurrency cap.

**D-08..D-12 — Bake-time correctness gates (AUTHOR-03..07):**
- Cipher/plain parity validator hard-fails the bake. Three checks per line pair: (1) same speaker, (2) same action tags, (3) word-count ratio in [0.5×, 2×]. No `--force` override in Phase 3.
- Short-line auto-route to Google Cloud TTS at bake time (bypassing the Next API route since no dev server runs during bake). Lines shorter than `MIN_BAKE_LINE_CHARS` (5) skip Gemini entirely. Voice mapping via new `GOOGLE_ROLE_VOICES` table tonally matched to each role's Gemini voice.
- Duration anomaly detector: `>3× OR <0.3× ritual median seconds-per-character`. Per-ritual median (different rituals have different cadences). Hard-fail bake with `{lineId, durationMs, charCount, ritualMedian, ratio}`. Manual `rm` + rebake; no auto-evict.
- `--verify-audio` opt-in flag, warn-only. Pipes each line's Opus through Whisper, prints word-diff roll-up. Default off, typically run on final pre-ship pass per ritual.
- Pin `GEMINI_TTS_MODELS` order `["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"]` (current order — Phase 3 adds explicit comment locking rationale). Chain stays env-overridable.

**D-13..D-15 — Preview server (AUTHOR-08):**
- Standalone `scripts/preview-bake.ts` runs `http.createServer` on `127.0.0.1:8883`. Independent of Next dev.
- Read-only cache scrubber: browser UI lists rituals → lists baked lines → `<audio>` streams the cached `.opus` for selection. No re-render trigger, no `.mram` modification.
- Dev-guard: new `src/lib/dev-guard.ts` exporting `assertDevOnly()` — replaces inline `process.env.NODE_ENV === "production"` at `src/app/author/page.tsx:220` AND called from `scripts/preview-bake.ts`. Script-side additionally refuses to bind anywhere other than `127.0.0.1` / `::1`.

**D-16..D-18 — idb-schema unification (AUTHOR-10):**
- `src/lib/idb-schema.ts` owns `DB_NAME`, `DB_VERSION` (bumped to **5**), all store-name constants, AND a single shared `openDB()` with one consolidated `onupgradeneeded` creating ALL stores (`documents`, `sections`, `settings`, `voices`, `audioCache`, `feedbackTraces`). Both `storage.ts` and `voice-storage.ts` `import { openDB } from "./idb-schema"`.
- `feedbackTraces` store: `{keyPath: 'id'}`, indexes on `documentId`, `timestamp`, `variantId`. `FeedbackTrace` interface: `{id, documentId, sectionId, lineId, variantId, promptHash, completionHash, timestamp, ratingSignal?}` — PII-free (hashes only).
- Test approach: `src/lib/__tests__/idb-schema.test.ts` using `fake-indexeddb`. Three cases: open-via-storage-first, open-via-voice-first, v4→v5 migration preserves existing data.

**D-19..D-21 — Branching, commits, execution order:**
- Branch: **`gsd/phase-3-authoring-throughput`** from current `main` tip (Phase 2 merged as PR #68, commit `d2e02cc`, 2026-04-22).
- Commit prefix: `author-NN: imperative lowercase`. Shared infrastructure: `author-infra: ...`.
- Test convention from Phase 1 D-11: tests in `src/**/__tests__/*.test.ts`. New test files: `src/lib/__tests__/idb-schema.test.ts`, `src/lib/__tests__/author-validation.test.ts` (extend if it exists), `scripts/__tests__/bake-all.test.ts`.

### Claude's Discretion
- Exact `_INDEX.json` field ordering and on-disk format (D-03).
- `_RESUME.json` exact format (D-06).
- Initial `GOOGLE_ROLE_VOICES` bake-time mapping (D-09) — tonally-adjacent Studio voices, table presented during execution for Shannon A/B.
- Exact `--dry-run` output format (D-05).
- Banner / inline messaging on validator failures (D-08).
- Whether `--verify-audio` writes a file report in addition to stdout (D-11).
- Exact threshold `N` for "diff > N words" warn message in `--verify-audio` (default `2`, env-overridable).

### Deferred Ideas (OUT OF SCOPE)
- Errata JSON sidecar (AUTHOR-v2-03) — rejected for v1.
- Hosted/self-serve `/author` UI (AUTHOR-v2-01) — out of scope per project Key Decisions.
- Trusted co-author circle with local dev access (AUTHOR-v2-02).
- `--force` override on validator failures — floated, rejected for Phase 3.
- Auto-evict cache entry on duration-anomaly trigger — rejected.
- Always-on STT verify with sampling — rejected.
- Re-render in preview server — rejected (API key leak surface).
- Web UI for editing dialogue files — `/author` covers it.
- `feedbackTraces` storing prompt/completion bodies — rejected (hashes-only invariant).
- `scripts/bake-all.ts --watch` mode — rejected for Phase 3.
- Per-key `--parallel` accounting — rejected for Phase 3.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTHOR-01 | Content-addressed bake cache at `rituals/_bake-cache/` keyed on `sha256(voice+style+text+modelId+KEY_VERSION)`; one-line edits rebake 1 line | `computeCacheKey()` in `scripts/render-gemini-audio.ts:586-594` is the existing canonical — extend to add `modelId` and bump version to `v3`. `fs.cp` with `recursive: true` (Node 16+, confirmed Node 20 available) handles migration atomically. [CITED: Node `fs.cp` stable since 16.7] |
| AUTHOR-02 | `scripts/bake-all.ts` orchestrator with `--since <git-ref>`, `--dry-run`, `--resume`, `--parallel N` | `scripts/lookup-hashed-user.ts` is the canonical pattern model (`#!/usr/bin/env npx tsx` shebang, `process.argv` parsing, delegation to shared lib). `git diff --name-only <ref> -- <pathspec>` is standard; `git rev-parse --verify HEAD~1` is the "is this a git repo" pre-check. |
| AUTHOR-03 | `gemini-3.1-flash-tts-preview` prioritized first in `GEMINI_TTS_MODELS` | Model ID confirmed current as of 2026-04-15 preview release [VERIFIED: Google AI blog, MindStudio]. `DEFAULT_MODELS` in `scripts/render-gemini-audio.ts:27-31` already matches — Phase 3 adds a rationale comment locking the order. |
| AUTHOR-04 | Bake pipeline fixes ultra-short-line silent-skip; route to alternate engine | `src/lib/tts-cloud.ts:288-337` already contains a complete `GOOGLE_ROLE_VOICES` Neural2 mapping for every officer role (WM, SW, JW, SD, JD, Sec, Tr, Ch, Marshal, T, Candidate, ALL, Q, A, etc.). Directly reusable by the bake-time path; `src/app/api/tts/google/route.ts` is the reference implementation to port (REST endpoint, audioEncoding, voice name format). |
| AUTHOR-05 | `src/lib/author-validation.ts` cipher/plain parity validator enforces same speaker, same action tags, word-count ratio band — bake refuses on failure | Existing `validatePair()` and `validateParsedPair()` in `src/lib/author-validation.ts` already return structured `PairLineIssue[]` with `kind: "structure-speaker" \| "structure-action" \| "ratio-outlier"` declared — but today returns warning-level ratio-outlier at `ratio > 1.0 \|\| ratio < 0.05`. Phase 3 adds a **second ratio check** at the D-08 threshold [0.5×, 2×] that escalates to `severity: "error"` for the bake path. |
| AUTHOR-06 | Audio-duration-anomaly detector flags baked line duration >3× (or <0.3×) ritual median seconds-per-char | `music-metadata` ^11.12.3 [VERIFIED: npm view 2026-04-21] parses Opus via `parseBuffer()` returning `format.duration` in seconds. ESM-only (`type: module`), Node ≥ 14.13 — compatible with this repo's Node 20 + `module: "esnext"` tsconfig. Alternative: parse OGG granule_position directly from the last page [CITED: RFC 7845] — cheaper but more code to own. |
| AUTHOR-07 | Optional STT round-trip diff per line via `--verify-audio` | Existing `/api/transcribe/route.ts` takes `multipart/form-data` with `audio` blob, returns `{transcript}`. Already Bearer-gated — orchestrator must attach a valid client-token header when calling (or the route will 401). Simpler alternative: call Groq Whisper endpoint (`https://api.groq.com/openai/v1/audio/transcriptions`) directly from the script using `GROQ_API_KEY` from env, bypassing the route's paid-route-guard entirely (bake already has the key; no need for the client-token dance). |
| AUTHOR-08 | `scripts/preview-bake.ts` localhost-only cache-scrubber server | Node 20 `http.createServer` + `fs.createReadStream` + `Range:` header handling. MIME `audio/ogg; codecs=opus` per [CITED: RFC 7845]. Dev-guard via D-15 `src/lib/dev-guard.ts`. |
| AUTHOR-09 | `p-limit` concurrency cap on parallel Gemini TTS calls | `p-limit@7.3.0` [VERIFIED: npm view 2026-04-21, published 2 months ago]. ESM-only (`type: module`); Node ≥18 engines. Works in this repo via `npx tsx` + `module: "esnext"` in `tsconfig.json`. Usage: `import pLimit from "p-limit"; const limit = pLimit(4); await Promise.all(lines.map((l) => limit(() => renderLineAudio(l))));`. |
| AUTHOR-10 | `src/lib/idb-schema.ts` single source of truth for `DB_VERSION` shared between `storage.ts` and `voice-storage.ts`; also houses the new `feedbackTraces` store | `fake-indexeddb@6.2.5` [VERIFIED: npm view 2026-04-21, published 5 months ago]. Apache-2.0, zero deps. Pure JS IndexedDB implementation. Works with Vitest jsdom env via `import "fake-indexeddb/auto"` in the test file. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `p-limit` | `^7.3.0` | Concurrency cap for parallel Gemini/Google TTS calls | Canonical Node concurrency primitive from Sindre Sorhus; 24 versions of track record; 14.9 kB unpacked; zero unnecessary deps (only `yocto-queue`). Locked by D-07. |
| `fake-indexeddb` | `^6.2.5` | In-memory IndexedDB for the `idb-schema` dual-open test | The only mature pure-JS IndexedDB implementation for Node; 340 kB; MIT/Apache-2.0. Locked by D-18. |
| `music-metadata` | `^11.12.3` | Parse Opus files at bake time to extract `durationMs` for the anomaly detector (AUTHOR-06) | Mature (`Borewit/music-metadata`, active maintenance, supports Opus/Ogg/MP3/WAV/MP4/FLAC/AIFF). Avoids hand-rolling RFC 7845 granule_position parsing. ESM-only, Node ≥14.13. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tsx` (already in use via `npx`) | `npx tsx` | TS script runner | All `scripts/*.ts` files — existing convention |
| `node:http` (built-in) | Node 20 | `http.createServer` for `preview-bake.ts` | Preferred over Express/Fastify — one file, zero deps, loopback-only |
| `node:fs/promises` (built-in) | Node 20 | `fs.cp({ recursive: true })` for cache migration (D-01); `fs.createReadStream` for `preview-bake.ts` Range support | Node 16.7+ stable; already in use across the codebase |
| `node:child_process` spawn | Node 20 | `git diff --name-only`, `git rev-parse --verify`, `git merge-base` for `--since` semantics (D-04) | `execSync` pattern already used elsewhere; child_process has no external deps |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `p-limit` | `p-queue` (same author, richer API — priority, pause/resume, timeout) | `p-limit` is sufficient for the cap-and-fan pattern we need; `p-queue` adds API surface we don't use. **Decision locked by D-07.** |
| `music-metadata` | Hand-rolled RFC 7845 granule_position parser (~60 lines) | `music-metadata` is a 340 kB dep; hand-roll is ~60 lines owning one format. **Recommendation: use `music-metadata`** — faster to ship, battle-tested, Phase 3 is about velocity not minimalism. If a later phase wants to drop it, the 60-line replacement is a one-commit swap. |
| `fake-indexeddb` | `happy-dom` with native IndexedDB polyfill | jsdom (current test env) doesn't implement IndexedDB; happy-dom would require an env swap across the whole repo. **fake-indexeddb is the correct narrow fix; locked by D-18.** |
| `/api/transcribe` via HTTP for `--verify-audio` | Direct Groq `https://api.groq.com/openai/v1/audio/transcriptions` call | Route requires client-token (script has no session cookie). Direct call reuses `GROQ_API_KEY` the bake script has anyway. **Recommend direct Groq call** — simpler, no dev-server dependency, matches the D-09 "bake has no server" pattern. |

**Installation:**
```bash
npm install --save-dev fake-indexeddb@^6.2.5
npm install p-limit@^7.3.0 music-metadata@^11.12.3
```

**Version verification (performed 2026-04-21):**
- `npm view p-limit version` → `7.3.0` (published 2 months ago) — HIGH confidence, source: npm registry
- `npm view fake-indexeddb version` → `6.2.5` (published 5 months ago) — HIGH confidence, source: npm registry
- `npm view music-metadata version` → `11.12.3` — HIGH confidence, source: npm registry
- `gemini-3.1-flash-tts-preview` model availability → confirmed preview launch 2026-04-15 — HIGH confidence, source: Google AI for Developers docs + Google DeepMind model card

**ESM-only warning (all three):** `p-limit@7`, `fake-indexeddb@6`, `music-metadata@11` are all `type: "module"`. This repo uses `"module": "esnext"` in `tsconfig.json` and runs scripts via `npx tsx`, so ESM imports work. Example: `import pLimit from "p-limit"` — default export, not named. `tsx` handles the CJS→ESM interop automatically for TS callers.

## Architecture Patterns

### System Architecture Diagram

```
                    ┌──────────────────────┐
                    │  Shannon's terminal  │
                    │  npm run bake-all …  │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼────────────┐
                    │  scripts/bake-all.ts  │◄──── flags: --since, --dry-run,
                    │    (orchestrator)     │      --resume, --parallel N,
                    └──────┬────────────────┘      --verify-audio
                           │
          ┌────────────────┼───────────────────────┬─────────────────┐
          ▼                ▼                       ▼                 ▼
    ┌───────────┐   ┌──────────────┐   ┌──────────────────┐   ┌──────────────┐
    │   git     │   │ validatePair │   │ p-limit(N) fan  │   │ _RESUME.json │
    │  --since  │   │ (D-08 gates) │   │  ├─ long lines  │   │ write after  │
    │ pathspec  │   │ hard-fail if │   │  │  Gemini TTS  │   │ each line    │
    │           │   │ any issue    │   │  └─ short <5ch  │   │              │
    └─────┬─────┘   └──────┬───────┘   │     Google TTS  │   └──────────────┘
          │                │           └────────┬─────────┘
          ▼                ▼                    ▼
    rituals that     structure +         render-gemini-audio.ts or
    changed since    ratio checks        googleCloudRestCall() helper
    <ref>            pass                    │
                                             ▼
                                   ┌───────────────────────┐
                                   │ rituals/_bake-cache/  │
                                   │   ├─ {sha256}.opus    │
                                   │   ├─ _INDEX.json      │
                                   │   └─ _RESUME.json     │
                                   └─────────┬─────────────┘
                                             │
                    ┌────────────────────────┼─────────────────────────┐
                    ▼                        ▼                         ▼
           ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────────┐
           │ anomaly detector │    │ --verify-audio   │    │ build-mram-from-     │
           │ music-metadata   │    │ direct Groq      │    │ dialogue.ts          │
           │ duration / char  │    │ Whisper call     │    │ embeds audio into    │
           │ vs ritual median │    │ word-diff        │    │ encrypted .mram      │
           └─────────┬────────┘    └──────────────────┘    └──────────────────────┘
                     │
              hard-fail on
              >3× or <0.3× ratio

            ┌────────────────────────────────────────────────────────────┐
            │  scripts/preview-bake.ts (separate invocation)             │
            │  Node http.createServer on 127.0.0.1:8883                  │
            │    GET /                    → list rituals from _INDEX     │
            │    GET /r/{slug}            → list lines for ritual        │
            │    GET /a/{cacheKey}.opus   → stream Opus with Range       │
            │  assertDevOnly() from src/lib/dev-guard.ts                 │
            └────────────────────────────────────────────────────────────┘

            ┌────────────────────────────────────────────────────────────┐
            │  Browser tier (independent of bake pipeline)               │
            │  src/lib/idb-schema.ts  ←─── owns DB_NAME, DB_VERSION=5,   │
            │       │                      all store-name constants,     │
            │       │                      single openDB() w/ consolidated│
            │       │                      onupgradeneeded creating 6     │
            │       │                      stores inc. feedbackTraces     │
            │       ├──── imported by: src/lib/storage.ts                 │
            │       ├──── imported by: src/lib/voice-storage.ts           │
            │       └──── imported by: (Phase 5) src/lib/feedback-store.ts│
            └────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

**New files:**
```
scripts/
├── bake-all.ts              # NEW orchestrator (AUTHOR-02, AUTHOR-09)
├── preview-bake.ts          # NEW localhost cache scrubber (AUTHOR-08)
└── __tests__/
    └── bake-all.test.ts     # NEW orchestrator unit tests (D-21)

src/lib/
├── idb-schema.ts            # NEW single source of truth (AUTHOR-10, D-16/17)
├── dev-guard.ts             # NEW shared dev-only guard (D-15)
└── __tests__/
    ├── idb-schema.test.ts   # NEW dual-open invariant test (D-18)
    └── author-validation.test.ts  # NEW (if absent) or extension (D-21)

rituals/_bake-cache/
├── .gitignore               # NEW (or top-level entry)
├── _INDEX.json              # NEW cache index, gitignored (D-03)
├── _RESUME.json             # NEW transient resume state, gitignored (D-06)
└── {cacheKey}.opus          # cached audio per unique input
```

**Modified files:**
```
scripts/
├── render-gemini-audio.ts   # MODIFIED: CACHE_DIR, CACHE_KEY_VERSION→"v3",
│                            #           add modelId to key material,
│                            #           one-shot fs.cp migration from old cache
└── build-mram-from-dialogue.ts  # MODIFIED: short-line Google-TTS route,
                                 #           validator gate before render,
                                 #           duration anomaly check

src/lib/
├── storage.ts               # MODIFIED: replace inline openDB + constants
│                            #           with import from "./idb-schema"
├── voice-storage.ts         # MODIFIED: same as above
└── author-validation.ts     # MODIFIED: add error-level ratio check (D-08)

src/app/author/page.tsx      # MODIFIED: replace inline env check at L220
                             #           with assertDevOnly() from dev-guard.ts

package.json                 # MODIFIED: add p-limit, music-metadata (runtime);
                             #           fake-indexeddb (dev); bake-all +
                             #           preview-bake script entries

.gitignore                   # MODIFIED: add rituals/_bake-cache/ entry
```

### Pattern 1: p-limit concurrency cap wrapping render calls
**What:** Wrap parallel Gemini TTS calls with a global concurrency limiter so no more than N inflight at a time; each wrapped call still rotates through `apiKeys[]` internally.
**When to use:** Baking 100+ lines in parallel against preview-tier rate-limited APIs (D-07).
**Example:**
```typescript
// scripts/bake-all.ts
import pLimit from "p-limit";
import { renderLineAudio } from "./render-gemini-audio";

const parallelN = clamp(Number(flags.parallel ?? 4), 1, 16);
const limit = pLimit(parallelN);

// linesToRender = lines with cache-miss (cache-hits skipped upstream)
const results = await Promise.allSettled(
  linesToRender.map((line) =>
    limit(async () => {
      const { opusBytes, durationMs, model } = await renderLineAudio(line, {
        apiKeys: GEMINI_KEYS,
        models: GEMINI_TTS_MODELS,
        cacheDir: BAKE_CACHE_DIR,
        onProgress: (p) => writeResumeEntry(line.id, p),
      });
      await writeIndexEntry({ cacheKey: p.cacheKey, model, durationMs, ... });
      return { line, durationMs, model };
    })
  )
);
// p-limit holds the fan at N inflight; per-key rotation happens inside
// render-gemini-audio.ts's callGeminiWithFallback, so a 429 on key 1 doesn't
// block the other N-1 inflight tasks — they each rotate keys independently.
```
Source: `p-limit` README + existing `render-gemini-audio.ts:309-466` (inner key rotation).

### Pattern 2: `git diff --since` pathspec for changed-ritual detection
**What:** Determine which ritual dialogue file pairs changed since a git ref, handling adds, modifications, renames, and deletes appropriately.
**When to use:** `bake-all.ts --since <ref>` entrypoint (D-04).
**Example:**
```typescript
import { execSync } from "node:child_process";

function getChangedRituals(sinceRef: string = "HEAD~1"): string[] {
  // Pre-flight: must be inside a git repo with the ref reachable
  try {
    execSync(`git rev-parse --verify ${sinceRef}^{commit}`, { stdio: "ignore" });
  } catch {
    throw new Error(
      `--since requires a git repo; '${sinceRef}' not resolvable. ` +
      `Run inside the repo root or omit --since for a full rebake.`
    );
  }

  // --diff-filter=d excludes DELETED files (lowercase d = exclude)
  // We don't want to try to bake a ritual whose dialogue file was just removed
  const out = execSync(
    `git diff --name-only --diff-filter=d ${sinceRef} -- ` +
      `'rituals/*-dialogue.md' 'rituals/*-dialogue-cipher.md'`,
    { encoding: "utf8" }
  );
  const paths = out.split("\n").filter((l) => l.trim());

  // Extract ritual slugs: "rituals/ea-opening-dialogue-cipher.md" → "ea-opening"
  const slugs = new Set<string>();
  for (const p of paths) {
    const base = path.basename(p).replace(/-dialogue(-cipher)?\.md$/, "");
    slugs.add(base);
  }
  return Array.from(slugs).sort();
}
```
**Edge cases handled:**
- Deletes excluded via `--diff-filter=d` (lowercase) — avoids trying to bake a ritual whose files vanished.
- Renames handled implicitly — a rename shows up as an Add (new name), which is in the default filter; old name appears as a Delete (excluded).
- Non-git checkout fails loudly via `git rev-parse` pre-flight.
- Both plain AND cipher file changes trigger — cipher-only edits still need validator run.

Source: [CITED: git-scm.com git-diff docs, diff-filter section].

### Pattern 3: fake-indexeddb dual-open test harness
**What:** Verify that opening the shared DB from either `storage.ts` or `voice-storage.ts` first produces the same set of object stores regardless of open order, and that a v4→v5 migration preserves data.
**When to use:** `src/lib/__tests__/idb-schema.test.ts` (D-18).
**Example:**
```typescript
// src/lib/__tests__/idb-schema.test.ts
import { describe, it, expect, beforeEach } from "vitest";

// fake-indexeddb/auto wires globalThis.indexedDB + IDBKeyRange in jsdom.
// Importing it as a side-effect module is the canonical Vitest setup.
// Alternative for repo-wide use: add to vitest.config.ts setupFiles.
// Here we do it per-file because it's the only file that needs IDB.

describe("idb-schema dual-open invariant (D-18)", () => {
  beforeEach(async () => {
    // fake-indexeddb does NOT auto-reset between tests. We need an explicit
    // fresh in-memory DB for each case. Two options:
    //   (a) dynamic-import a fresh indexedDB instance per test
    //   (b) deleteDatabase between tests
    // Option (b) is simpler and matches real-browser semantics.
    await import("fake-indexeddb/auto");
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase("masonic-ritual-mentor");
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onblocked = () => resolve();  // no other connections in the test
    });
  });

  it("opens via storage.ts first, voice-storage.ts second — all 6 stores present", async () => {
    const { openDB } = await import("../idb-schema");
    const dbA = await openDB();  // first open — triggers onupgradeneeded
    dbA.close();
    const dbB = await openDB();  // second open — stores already exist
    const names = Array.from(dbB.objectStoreNames).sort();
    expect(names).toEqual([
      "audioCache",
      "documents",
      "feedbackTraces",
      "sections",
      "settings",
      "voices",
    ]);
    dbB.close();
  });

  // The dual-open invariant is about the SHARED openDB under idb-schema.ts.
  // Before D-16 there were two separate openDB functions; after D-16 there's one
  // that both storage.ts and voice-storage.ts import. So the real test is:
  // "does either consumer module, on first import, leave the DB in the same state?"
  it("storage.ts and voice-storage.ts produce identical store sets", async () => {
    // Import storage.ts first — it transitively opens via idb-schema.openDB()
    const storage = await import("../storage");
    await storage.listDocuments();  // force first IDB open
    // ... assertions about stores
  });

  it("v4-on-disk database opens as v5 without data loss", async () => {
    // Pre-seed a v4 database by manually calling indexedDB.open("...", 4)
    // with a v4 onupgradeneeded (subset of the v5 schema)
    // ... then open via idb-schema.openDB() and assert:
    //   - existing documents/sections data intact
    //   - feedbackTraces store newly created (empty but queryable)
  });
});
```
**Critical detail:** Vitest does not auto-reset fake-indexeddb between tests. Pattern: either use `indexedDB.deleteDatabase()` in `beforeEach` (shown above), or load `fake-indexeddb/auto` fresh via `vi.resetModules()` + dynamic import. The `deleteDatabase` approach is closer to real-browser semantics.

Source: [CITED: fake-indexeddb README + Vitest discussion #908 on setup files].

### Pattern 4: HTTP Range request handling for `<audio>` scrubbing
**What:** Serve Opus files via Node `http.createServer` supporting HTTP Range requests so the browser `<audio>` element can seek within the file.
**When to use:** `scripts/preview-bake.ts` (D-13/D-14).
**Example:**
```typescript
// scripts/preview-bake.ts
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { assertDevOnly } from "../src/lib/dev-guard";

const BAKE_CACHE_DIR = path.resolve("rituals/_bake-cache");

const server = http.createServer((req, res) => {
  assertDevOnly();  // throw if NODE_ENV === "production"

  const url = new URL(req.url ?? "/", "http://127.0.0.1:8883");
  if (url.pathname.startsWith("/a/") && url.pathname.endsWith(".opus")) {
    const cacheKey = url.pathname.slice(3, -5);
    if (!/^[0-9a-f]{64}$/.test(cacheKey)) {
      res.writeHead(400); res.end("bad key"); return;
    }
    const filepath = path.join(BAKE_CACHE_DIR, `${cacheKey}.opus`);
    if (!fs.existsSync(filepath)) { res.writeHead(404); res.end(); return; }

    const stat = fs.statSync(filepath);
    const range = req.headers.range;
    if (range) {
      // "bytes=0-499" or "bytes=500-"
      const [, startStr, endStr] = /^bytes=(\d+)-(\d*)$/.exec(range) ?? [];
      const start = Number(startStr);
      const end = endStr ? Number(endStr) : stat.size - 1;
      if (!Number.isFinite(start) || end >= stat.size || start > end) {
        res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
        res.end(); return;
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
    return;
  }
  // ... other routes (/, /r/{slug}) serve index HTML and JSON
});

// D-15 script-side guard: refuse anything but loopback
server.listen(8883, "127.0.0.1", () => {
  console.log("Preview server: http://127.0.0.1:8883");
});
```
**MIME note:** `audio/ogg; codecs=opus` is the specific, spec-correct value per [CITED: RFC 7845 §9]. Browsers also accept `audio/opus` but `audio/ogg; codecs=opus` is more defensive against format drift.

Source: [CITED: MDN HTTP Range requests] + [CITED: Node.js `http.createServer` docs].

### Pattern 5: Google Cloud TTS REST direct call from Node
**What:** Call the Google Cloud TTS REST endpoint directly from the bake script (bypassing the Next API route, which requires a dev server + client-token).
**When to use:** Short-line fallback for lines < `MIN_BAKE_LINE_CHARS` (D-09).
**Example:**
```typescript
// Inside bake-all.ts or a helper; direct REST call, not via /api/tts/google
async function googleTtsBakeCall(
  text: string,
  voiceName: string,
  languageCode: string = "en-US"
): Promise<{ opusBytes: Buffer; durationMs: number }> {
  const apiKey = process.env.GOOGLE_CLOUD_TTS_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_CLOUD_TTS_API_KEY required for short-line bake");

  const res = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode, name: voiceName },
        audioConfig: { audioEncoding: "OGG_OPUS" },  // native Opus — no ffmpeg re-encode needed
      }),
    }
  );
  if (!res.ok) throw new Error(`google tts ${res.status}: ${await res.text()}`);
  const { audioContent } = (await res.json()) as { audioContent: string };
  const opusBytes = Buffer.from(audioContent, "base64");
  // AUTHOR-06: read duration at bake time
  const { parseBuffer } = await import("music-metadata");
  const meta = await parseBuffer(opusBytes, { mimeType: "audio/ogg" });
  const durationMs = Math.round((meta.format.duration ?? 0) * 1000);
  return { opusBytes, durationMs };
}
```
**Key points:**
- API key auth (`?key=...` query param) is the canonical form for project-scoped API keys [CITED: Google Cloud TTS REST reference]. Service account + gcloud Bearer token is an alternative but adds no value for this use case.
- `audioEncoding: "OGG_OPUS"` returns native Opus-in-Ogg container — byte-identical to what Gemini pipeline ends with after ffmpeg. **No re-encode step needed** for short-line audio.
- Voice tier selection: `voiceName` like `en-US-Studio-Q` (premium), `en-US-Neural2-D` (mid), `en-US-Chirp3-HD-Achernar` (newest). D-09 requires tonal consistency — the existing `GOOGLE_ROLE_VOICES` in `src/lib/tts-cloud.ts:288-337` uses Neural2-D/A/J/I etc. which is a good baseline. Phase 3's "discretion" decision is whether to upgrade the short-line bake path to Studio tier for closer tonal match to Gemini's high-end.

**Voice-mapping recommendation for D-09 (initial draft, Shannon A/B review during execution):**

| Role | Gemini voice (existing) | Google short-line bake voice | Notes |
|------|------------------------|------------------------------|-------|
| WM   | Alnilam (firm male)     | `en-US-Studio-Q` or `en-US-Neural2-D` pitch -2 | Studio Q is authoritative low male |
| SW   | Charon (calm male)      | `en-US-Neural2-A` pitch -1 | existing table value |
| JW   | Enceladus (deep male)   | `en-US-Neural2-J` | existing |
| SD   | Algenib (gravelly male) | `en-US-Neural2-I` pitch +1 | existing |
| JD   | Orus (firm male)        | `en-GB-Neural2-B` | existing |
| S/Sec | Iapetus (articulate)   | `en-US-Neural2-A` | existing |
| Tr   | Schedar (measured)      | `en-US-Neural2-J` pitch -1 | existing |
| Ch   | Achird (warm)           | `en-US-Neural2-D` pitch -3 | existing |
| T (Tyler) | (Marshal Fenrir)   | `en-GB-Neural2-B` pitch +2 | existing |
| ALL  | —                       | `en-US-Neural2-D` pitch -1 | existing |
| Q (catechism) | Achird         | `en-US-Neural2-D` pitch -3 | match existing Ch |
| A (candidate) | Zubenelgenubi  | `en-US-Neural2-A` pitch +1 | match existing Candidate |

**Action for planner:** Bake script should `import { getGoogleVoiceForRole } from "../src/lib/tts-cloud"` and use the existing mapping directly. Any upgrade to Studio tier is additive and can be done in a second pass.

Source: [CITED: Google Cloud TTS list-voices-and-types docs] + existing `src/lib/tts-cloud.ts:288-347`.

### Pattern 6: `_RESUME.json` crash-safe state (suggested shape)
**What:** Per-ritual state file written atomically after every completed line so `--resume` picks up without re-rendering completed lines.
**When to use:** `bake-all.ts --resume` (D-06).
**Suggested shape (Claude's Discretion):**
```typescript
interface ResumeState {
  ritualSlug: string;           // e.g. "ea-opening"
  startedAt: string;             // ISO timestamp of the current/interrupted run
  completedLineIds: string[];   // in order; orchestrator skips these on resume
  inFlightLineIds: string[];    // started but not cached at crash time; retry
  totalLines: number;            // sanity check vs current dialogue parse
  dialogueChecksum: string;      // sha256 of plain.md; invalidates resume if file changed
}
```
**Atomic write pattern (crash-safe):**
```typescript
async function writeResumeState(state: ResumeState): Promise<void> {
  const target = path.join(BAKE_CACHE_DIR, "_RESUME.json");
  const tmp = `${target}.${process.pid}.tmp`;
  await fs.promises.writeFile(tmp, JSON.stringify(state, null, 2));
  await fs.promises.rename(tmp, target);  // atomic on POSIX
}
```
`dialogueChecksum` guards the hand-off case: if Shannon crashed mid-bake, edited the dialogue, and resumed, the resume should refuse (or at minimum warn loudly) because `completedLineIds` may reference line IDs that no longer exist.

Source: fs-atomic-rename idiom (standard POSIX semantics).

### Anti-Patterns to Avoid

- **Using a global `try/catch` around `Promise.all` for concurrent bake calls** — hides which specific line failed. Use `Promise.allSettled` so failures are per-line and the orchestrator can collate a readable final report. `p-limit` wraps cleanly inside `allSettled`.

- **Auto-evicting a cache entry on duration-anomaly detection (D-10 rejects this).** If Gemini returned bad audio once for line X, it'll likely return bad audio again — auto-evict masks the recurring failure. Manual `rm {cacheKey}.opus` is intentional and the loud, correct action.

- **Silently falling through to the old cache location on read miss.** D-01 is a one-shot COPY migration — after the first run, only `rituals/_bake-cache/` is consulted. Falling through to `~/.cache/masonic-mram-audio/` on miss would mask "the migration didn't happen" as success.

- **Running the validator inside the per-line render loop.** Validator is structural (operates on parsed document, not per-render output); run it once per ritual BEFORE any rendering starts. If validator fails, no API calls are made. Wastes zero quota on corrupted pairs.

- **Trying to open the shared IndexedDB with `DB_VERSION` less than the latest when either consumer module upgrades schema.** The whole point of D-16 is that `idb-schema.ts` is the ONLY place that knows the current version. If someone writes `indexedDB.open(DB_NAME, 4)` directly in a new module, the shared upgrade logic will not fire and their code will see missing stores. **Always** `import { openDB } from "./idb-schema"`.

- **Binding `preview-bake.ts` server on `0.0.0.0`.** Locked against by D-13/D-15 — script must refuse anything but `127.0.0.1` or `::1`. A 0.0.0.0 bind in WSL2 or on a laptop at a coffee shop is a LAN exposure.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Concurrency cap on async work | Hand-rolled Promise pool / semaphore | `p-limit@^7.3.0` | 14.9 kB, one function, decade of hardening; D-07 locks this |
| Opus duration extraction | Hand-rolled OGG granule_position parser | `music-metadata@^11.12.3` `parseBuffer(opus, { mimeType: "audio/ogg" })` | Borewit's parser handles malformed headers, multiple stream chunks, tag variations. Our ~60 lines would own none of those edge cases. |
| In-memory IndexedDB for tests | Custom IDB stub | `fake-indexeddb@^6.2.5` | Apache-2.0 pure JS reference implementation tracking the real spec. D-18 locks this. |
| Range request parser | Hand-rolled `Range:` header regex | Node stream `fs.createReadStream(f, { start, end })` + minimal regex | The regex is 1 line (`/^bytes=(\d+)-(\d*)$/`); fs handles the actual byte range. Don't reach for `express` / `koa` / `send` — one file, one response, one handler. |
| Git changed-files detection | Shelling `git log` + manual parse | `git diff --name-only --diff-filter=d <ref> -- <pathspec>` | First-class git command, one exec, porcelain output is stable. |
| Atomic file write | Direct `writeFile` | `writeFile(tmp)` + `rename(tmp, target)` | POSIX rename is atomic; writeFile mid-write can tear on crash. 2-line idiom. |

**Key insight:** Phase 3 scope is orchestration, not format engineering. Every format (Opus, IndexedDB, Git diff, HTTP Range) has a canonical parser. Reaching for them — even when the footprint feels heavy — is the correct move because the bake pipeline already has enough novel code to own.

## Common Pitfalls

### Pitfall 1: p-limit concurrency cap defeated by internal key rotation
**What goes wrong:** Developer assumes `p-limit(4)` means 4 Gemini API calls inflight total. But `render-gemini-audio.ts:309-466` rotates through `apiKeys` on a 429 — from p-limit's perspective, one task is still occupying a slot even though it's firing multiple HTTP calls internally.
**Why it happens:** p-limit caps **tasks**, not **HTTP requests inside tasks**. The key rotation happens inside `callGeminiWithFallback`, outside p-limit's view.
**How to avoid:** Accept that `--parallel 4` means "4 lines being rendered at once, each of which may make 1-M HTTP calls internally as it rotates through keys + models." Document this in bake-all.ts header comment. For true per-request caps, we'd need a lower-level HTTP middleware (not planned for Phase 3).
**Warning signs:** Unexpected `429` bursts in logs that exceed the `--parallel` value.

### Pitfall 2: `fake-indexeddb` state bleeds between tests
**What goes wrong:** Test 1 creates objects in `documents` store; Test 2 opens the same DB and finds leftover data, produces false pass/fail.
**Why it happens:** `fake-indexeddb/auto` installs a module-scoped in-memory IDB that persists for the life of the Vitest worker. Nothing resets it between `it()` blocks.
**How to avoid:** `beforeEach` must `indexedDB.deleteDatabase("masonic-ritual-mentor")` and await its completion (including the `onblocked` case — treat as success since no other tabs exist in a test worker).
**Warning signs:** First-run passes, second-run same test fails. Tests pass individually but fail when suite runs together.

### Pitfall 3: Gemini TTS preview model ID drift
**What goes wrong:** Google rotates preview model IDs (happened between 3.1-flash-preview-tts and 3.1-flash-tts-preview at launch). If the bake script hardcodes an ID that's since been aliased or deprecated, every line fails with 404 and the fallback chain burns through all three models before error surfaces.
**Why it happens:** Preview models have unstable IDs. Even this project's `scripts/render-gemini-audio.ts:27-31` DEFAULT_MODELS might be slightly out of date relative to the blog post wording.
**How to avoid:** Keep `DEFAULT_MODELS` env-overridable via `GEMINI_TTS_MODELS`. Before Phase 3 ships, confirm the first entry is the exact current ID by hitting `https://generativelanguage.googleapis.com/v1beta/models?key=$KEY` and grepping for `tts` + `3.1`. If the ID has rotated, document the new ID in `.env.example` and note the rotation in a CHANGELOG.
**Warning signs:** Every bake attempt hits 404 on the first model and falls through to 2.5-flash. Logs show `streamGenerateContent` returning 404 specifically on the 3.1 model.
**Reference:** Project memory skill `gemini-tts-preview-quota-and-fallback-chain` covers this fully.

### Pitfall 4: Voice-cast preamble leak into short-line Google TTS
**What goes wrong:** The existing Gemini bake pipeline uses a `buildPreamble()` director's-notes preamble that is part of the cache key. Short-line lines (under `VOICE_CAST_MIN_LINE_CHARS=40`) already skip the preamble. D-09's Google TTS fallback is specifically FOR these short lines — it MUST NOT receive a preamble either. If the plan author re-uses `buildPreamble()` for Google calls without stripping, the Google TTS will speak the preamble as audio. (This is the historical incident documented in the project skill `gemini-tts-voice-cast-scene-leaks-into-audio`.)
**Why it happens:** Copy-paste from `build-mram-from-dialogue.ts`'s long-line path without reading what's being copied.
**How to avoid:** Short-line bake path calls Google TTS with JUST `text` (no style, no preamble). Unit-test this explicitly: `expect(googleTtsBakeCall).toHaveBeenCalledWith({ text: "B.", ... })` — assert no preamble string, no scene, no role profile.
**Warning signs:** Short-line audio includes full sentences from the voice-cast sidecar.

### Pitfall 5: `git diff --since` misses cipher-only changes because of pathspec quoting
**What goes wrong:** In some shells/CI, `'rituals/*-dialogue.md'` doesn't expand correctly, so only the cipher OR only the plain files are matched. Cipher-only edits (Shannon correcting a cipher abbreviation without touching plain) slip through and validators don't run.
**Why it happens:** Shell globbing vs git pathspec confusion. Git pathspec needs LITERAL `*-dialogue.md`; if the shell pre-expands it, git only sees the first matching file.
**How to avoid:** Pass pathspec as SEPARATE argv elements, not a single glob string: `execSync(["git", "diff", "--name-only", ref, "--", "rituals/*-dialogue.md", "rituals/*-dialogue-cipher.md"], { encoding: "utf8" })` — or wrap in `'single quotes'` that pass through to git literally. Unit-test: seed a repo with a known pair of changes, verify both pairs show up.
**Warning signs:** D-08 validator not firing on cipher-only edits; bake reports "no rituals changed" when Shannon knows he edited a cipher file.

### Pitfall 6: Duration-anomaly false positive on the first-ever bake (no prior median)
**What goes wrong:** On a fresh repo with an empty `_INDEX.json`, there's no historical data to compute a "ritual median seconds-per-character." The detector might default to a global constant and flag legitimate lines on a first bake.
**Why it happens:** Median requires data. D-10 says "per-ritual median," which is only meaningful after at least ~N lines have baked.
**How to avoid:** Compute median from the CURRENT bake run's completed lines (rolling), not historical. After 30 completed lines per ritual, the median stabilizes enough to check subsequent lines. For the first 30, skip anomaly check with a console info note: `[AUTHOR-06] sample too small (n=${i}), skipping anomaly check`.
**Warning signs:** First-ever bake run fails on line 5 of 155 with an anomaly error. After manual investigation, the line is fine; the median was just unstable.

### Pitfall 7: p-limit + `Promise.allSettled` pitfall hiding rejected tasks
**What goes wrong:** Developer writes `await Promise.allSettled(lines.map(l => limit(() => render(l))))` and assumes all failures are caught. But if the orchestrator's final reporter iterates only `fulfilled` cases (or silently ignores `rejected`), failures never surface.
**Why it happens:** `allSettled` returns both `fulfilled` and `rejected`; easy to forget to check the `.status`.
**How to avoid:** Always iterate `allSettled` results TWICE — once to collect `rejected` into a failure report (printed to stderr + included in the non-zero exit), once to collect `fulfilled` into the success summary. Unit-test: inject a mock `renderLineAudio` that rejects for one line, assert the orchestrator exits non-zero and the failure appears in the report.
**Warning signs:** Silent bakes that "complete" but the `.mram` is missing audio for 1-5 lines.

## Runtime State Inventory

**Not applicable for Phase 3 as a greenfield phase** — but Phase 3 *does* touch runtime state, so flagging here for the planner:

| Category | Items | Action Required |
|----------|-------|-----------------|
| Stored data | Client-side IndexedDB (`documents`, `sections`, `settings`, `voices`, `audioCache`) on every pilot user's device (Amanda + Shannon + 6 other allowlist addresses) | v4→v5 migration is **additive** (new `feedbackTraces` store only). Existing data is preserved verbatim. **No data migration needed; code change + `DB_VERSION` bump only.** D-16/D-18 lock this; the D-18 test case #3 proves it. |
| Stored data | Legacy bake cache at `~/.cache/masonic-mram-audio/` (438 `.opus` files verified present in the dev environment) | **One-shot `fs.cp` copy** into `rituals/_bake-cache/` on first `bake-all.ts` run; old location left intact for rollback. D-01 locks this; migration skips if new cache already populated. |
| Live service config | None | Phase 3 doesn't touch external services (Vercel env vars, Resend config, Gemini keys) |
| OS-registered state | None | Phase 3 adds no cron jobs, no systemd units, no scheduled tasks |
| Secrets / env vars | `GOOGLE_CLOUD_TTS_API_KEY` (already exists in `.env`) — newly required by bake script for D-09 short-line route; `GROQ_API_KEY` — newly required by `--verify-audio` direct call path | **No new secret names introduced**, just new call sites. Document in `.env.example` comments that bake scripts need both set when running `--verify-audio` or `--with-audio` + short lines. |
| Build artifacts | None net-new; `rituals/_bake-cache/` is the new artifact location — gitignored | Add `.gitignore` entry before first bake run. |

**Verified in environment:** 438 `.opus` files in `~/.cache/masonic-mram-audio/` ready for D-01 migration.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All scripts | ✓ | 20.20.0 | — |
| npx / npm | Package install + script runner | ✓ | 10.8.2 / 10.x | — |
| git | `--since` pathspec | ✓ | 2.43.0 | Error loudly if not a git repo; `--since` disabled, full rebake only |
| ffmpeg | Existing bake pipeline (Gemini WAV → Opus transcode) | ✓ | 6.1.1 | — |
| `GOOGLE_CLOUD_TTS_API_KEY` env | D-09 short-line Google TTS fallback | — (present in `.env` per existing routes) | — | Bake script should error early if key missing and short lines present |
| `GOOGLE_GEMINI_API_KEY` env | Existing Gemini TTS | — (present in `.env`) | — | — |
| `GROQ_API_KEY` env | D-11 `--verify-audio` direct Whisper call | — (present in `.env`) | — | `--verify-audio` disabled if key missing; warn don't fail |
| `p-limit` npm package | D-07 concurrency cap | — | 7.3.0 available on npm | — |
| `fake-indexeddb` npm package | D-18 idb-schema dual-open test | — | 6.2.5 available on npm | — |
| `music-metadata` npm package | D-10 Opus duration extraction | — | 11.12.3 available on npm | Hand-rolled RFC 7845 granule_position parser (~60 lines) |

**Missing dependencies with no fallback:** None — Phase 3's only hard dependency is `GOOGLE_CLOUD_TTS_API_KEY` for short-line bakes, which is already present from Phase 2 deployment.

**Missing dependencies with fallback:** None — all npm packages install cleanly; all env vars already exist.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 with `jsdom` 29.0.1 environment |
| Config file | `vitest.config.ts` |
| Quick run command | `npm run test:run -- <filename>` (one file, single pass) |
| Full suite command | `npm run test:run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTHOR-01 | Cache key formula includes `modelId`; `v3` bump invalidates `v2` entries; `fs.cp` migration copies not moves | unit | `npm run test:run -- src/__tests__/cache-key.test.ts` OR extend existing render-gemini-audio test | ❌ Wave 0 — new test file `scripts/__tests__/render-gemini-audio-cache.test.ts` OR extend existing |
| AUTHOR-02 | `--since <ref>` returns correct ritual slug set for adds/mods/deletes/renames; `--resume` skips completed; `--dry-run` makes no API calls; `--parallel N` clamped to [1,16] | unit | `npm run test:run -- scripts/__tests__/bake-all.test.ts` | ❌ Wave 0 — new file |
| AUTHOR-03 | `GEMINI_TTS_MODELS` order pinned; first entry is `gemini-3.1-flash-tts-preview` unless env-overridden | unit (trivial) | `npm run test:run -- scripts/__tests__/bake-all.test.ts` (roll into AUTHOR-02 suite) | same as AUTHOR-02 |
| AUTHOR-04 | Short-line (< 5 chars) routes to Google REST, never silently drops; Google call receives no preamble; resulting Opus embedded in `.mram` | unit + integration | `npm run test:run -- scripts/__tests__/bake-all.test.ts` | same |
| AUTHOR-05 | Validator hard-fails bake on: speaker mismatch, action-tag mismatch, word-count ratio outside [0.5×, 2×] | unit | `npm run test:run -- src/lib/__tests__/author-validation.test.ts` | ❌ Wave 0 — new file (or extension if exists) |
| AUTHOR-06 | Duration >3× median triggers hard-fail with structured error; <0.3× also hard-fails; first 30 lines per ritual skip check | unit | `npm run test:run -- scripts/__tests__/bake-all.test.ts` (anomaly detector block) | same as AUTHOR-02 |
| AUTHOR-07 | `--verify-audio` pipes Opus through Whisper; word-diff > N triggers warn; never hard-fails the bake | unit | `npm run test:run -- scripts/__tests__/bake-all.test.ts` (verify-audio block) | same |
| AUTHOR-08 | Preview server binds 127.0.0.1 only; 0.0.0.0 bind refused; `/a/{cacheKey}.opus` serves Range requests correctly; `assertDevOnly` refuses in production | unit + system | `npm run test:run -- scripts/__tests__/preview-bake.test.ts` | ❌ Wave 0 — new file |
| AUTHOR-09 | `p-limit` caps inflight tasks; global cap respected regardless of per-key rotation inside render | unit | `npm run test:run -- scripts/__tests__/bake-all.test.ts` (parallel block) | same as AUTHOR-02 |
| AUTHOR-10 | `idb-schema` dual-open invariant: storage→voice order and voice→storage order both produce 6 stores; v4→v5 migration preserves existing data | unit | `npm run test:run -- src/lib/__tests__/idb-schema.test.ts` | ❌ Wave 0 — new file |

### Sampling Rate
- **Per task commit:** `npm run test:run -- <files touched>` (Vitest file filter)
- **Per wave merge:** `npm run test:run` (full suite — 395 tests baseline from Phase 2; Phase 3 adds ~40-60 more)
- **Phase gate:** Full suite green + `npm run build` exits 0 + `npm run lint` clean before `/gsd-verify-work`

### Manual-Only Verification (cannot be automated)
| What | Why manual | When |
|------|-----------|------|
| Short-line Google TTS tonal consistency across a full ritual bake | Auditory judgment — tonal-match between Gemini Alnilam and Google en-US-Studio-Q is subjective | During execution — Shannon A/B's the GOOGLE_ROLE_VOICES table |
| Preview server `<audio>` scrubbing UX in a real browser | jsdom doesn't actually play audio; can't verify `<audio>` plays Opus + scrubs via Range | After AUTHOR-08 lands — Shannon opens http://127.0.0.1:8883 |
| End-to-end bake of a 5-ritual night with --parallel 8 | Real rate-limit behavior under load; overnight wall-clock test | Phase 4 (content baking) or Shannon's discretion |
| `--verify-audio` Whisper round-trip cost (~$0.01/ritual) holds in practice | Only observable by running against real Groq and checking cost dashboard | First real use during Phase 4 pre-ship pass |

### Wave 0 Gaps
- [ ] `scripts/__tests__/bake-all.test.ts` — covers AUTHOR-02, AUTHOR-03, AUTHOR-06, AUTHOR-07, AUTHOR-09 (orchestrator unit tests: flag parsing, --since git integration via fixture repo, --resume state file round-trip, p-limit concurrency cap, duration anomaly math, verify-audio diff computation)
- [ ] `scripts/__tests__/preview-bake.test.ts` — covers AUTHOR-08 (dev-guard refuses production, Range request handling, non-loopback bind refused)
- [ ] `src/lib/__tests__/idb-schema.test.ts` — covers AUTHOR-10 (dual-open invariant, v4→v5 migration preservation)
- [ ] `src/lib/__tests__/author-validation.test.ts` — covers AUTHOR-05 (hard-fail on speaker mismatch, action mismatch, word-count ratio out-of-band) — if file doesn't exist yet, create it
- [ ] `scripts/__tests__/render-gemini-audio-cache.test.ts` OR extension of existing tests — covers AUTHOR-01 (cache key includes modelId, v3 bump invalidates v2, fs.cp migration is one-shot and idempotent)
- [ ] Framework install: `npm install --save-dev fake-indexeddb@^6.2.5` + `npm install p-limit@^7.3.0 music-metadata@^11.12.3` — single commit before test files land

## Security Domain

**Applicable because Phase 2's `security_enforcement` remains enabled** — but Phase 3 is largely dev-only build tooling, so the surface is narrow.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Phase 3 adds no new auth surface; preview server is dev-guard-gated (not JWT-gated because it's loopback-only) |
| V3 Session Management | no | No session state added |
| V4 Access Control | yes | `assertDevOnly()` in `src/lib/dev-guard.ts` is the access control for both `/author/page.tsx` (prod-disable) and `preview-bake.ts` (loopback-only). Unit test must verify both branches. |
| V5 Input Validation | yes | `preview-bake.ts` serves cached files by key; MUST validate `cacheKey` against `^[0-9a-f]{64}$` before `path.join`. Failure to validate = path traversal via `/a/../../../etc/passwd.opus` |
| V6 Cryptography | no | Phase 3 adds no new crypto; existing `encryptMRAMNode()` unchanged. AES-GCM AUDIT already locked down in Phase 2. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal in `preview-bake.ts` filename param | Tampering | Strict `^[0-9a-f]{64}$` regex on `cacheKey`; reject anything else with 400. `path.join(BAKE_CACHE_DIR, key + ".opus")` after validation. |
| Preview server bound to 0.0.0.0 by accident (LAN exposure) | Information Disclosure | D-13 + D-15 lock `127.0.0.1` only; the script refuses to start on any other interface. Unit test must invoke the bind helper with a non-loopback IP and assert it throws. |
| `_RESUME.json` or `_INDEX.json` leaks ritual text | Information Disclosure | **These files carry ZERO ritual text** by construction. `_RESUME.json` has line IDs + checksums. `_INDEX.json` has cache keys + model names + byte counts. Writing review checklist: scan JSON for any field that could contain plain text before committing the shape. |
| `.opus` file in cache contains ritual text as audio | Information Disclosure | **Accepted** — this is literally the purpose of the cache. `rituals/_bake-cache/` is gitignored. Same threat model as every other file under `rituals/` today. |
| `GOOGLE_CLOUD_TTS_API_KEY` logged to stdout during bake error | Information Disclosure | Bake script must redact `?key=...` from any error-path `console.error(response.url)`. Matches the pattern in `src/lib/auth.ts:181-185` comment about not leaking secrets in logs. |
| `music-metadata` malicious Opus file crashes Node | Denial of Service | Low likelihood — the only Opus files fed to `music-metadata` are files the bake pipeline just created. Attacker would need write access to `rituals/_bake-cache/` to inject a malformed Opus. At that point they already own the dev machine. Accept. |

## Code Examples

Verified patterns from official sources + existing project code. See **Pattern 1-6** above for full code blocks; summary here:

### Example: one-shot legacy cache migration (D-01)
```typescript
// scripts/render-gemini-audio.ts — add near CACHE_DIR definition
import * as fs from "node:fs";
import * as path from "node:path";

const OLD_CACHE_DIR = path.join(os.homedir(), ".cache", "masonic-mram-audio");
const NEW_CACHE_DIR = path.resolve("rituals/_bake-cache");

async function migrateLegacyCacheIfNeeded(): Promise<void> {
  // Skip if new cache already has any .opus entry (one-shot migration)
  if (!fs.existsSync(NEW_CACHE_DIR)) fs.mkdirSync(NEW_CACHE_DIR, { recursive: true });
  const existing = fs.readdirSync(NEW_CACHE_DIR).some((f) => f.endsWith(".opus"));
  if (existing) return;

  if (!fs.existsSync(OLD_CACHE_DIR)) return;  // nothing to migrate
  console.error(`[AUTHOR-01] migrating legacy cache ${OLD_CACHE_DIR} → ${NEW_CACHE_DIR}`);
  const files = fs.readdirSync(OLD_CACHE_DIR).filter((f) => f.endsWith(".opus"));
  // fs.cp with recursive copies each file; filter callback limits to .opus
  await fs.promises.cp(OLD_CACHE_DIR, NEW_CACHE_DIR, {
    recursive: true,
    filter: (src) => src === OLD_CACHE_DIR || src.endsWith(".opus"),
  });
  console.error(`[AUTHOR-01] copied ${files.length} entries; old location preserved for rollback`);
}
```
Source: Node.js `fs.cp` docs + existing `scripts/render-gemini-audio.ts:37-40` cache-dir pattern.

### Example: cache key bump adding modelId (D-02)
```typescript
// scripts/render-gemini-audio.ts — replace existing computeCacheKey
const CACHE_KEY_VERSION = "v3";  // bumped from "v2" (D-02)

export function computeCacheKey(
  text: string,
  style: string | undefined,
  voice: string,
  modelId: string,               // NEW param (D-02)
  preamble: string = "",
): string {
  const material = `${CACHE_KEY_VERSION}\x00${text}\x00${style ?? ""}\x00${voice}\x00${modelId}\x00${preamble}`;
  return crypto.createHash("sha256").update(material).digest("hex");
}
```
All callers of `computeCacheKey` must be updated to pass `modelId`. The existing `scripts/invalidate-mram-cache.ts` also uses this function — update its call signature in the same commit.
Source: existing `scripts/render-gemini-audio.ts:586-594`.

### Example: Validator hard-fail integration (D-08)
```typescript
// scripts/bake-all.ts — validator runs BEFORE any render call per ritual
import { validatePair, type PairValidationResult } from "../src/lib/author-validation";

async function validateOrFail(slug: string): Promise<void> {
  const plainPath = `rituals/${slug}-dialogue.md`;
  const cipherPath = `rituals/${slug}-dialogue-cipher.md`;
  const plain = fs.readFileSync(plainPath, "utf8");
  const cipher = fs.readFileSync(cipherPath, "utf8");
  const result: PairValidationResult = validatePair(plain, cipher);

  const errors = result.lineIssues.filter((i) => i.severity === "error");
  // AUTHOR-05 / D-08: ratio-outlier at the bake-time threshold ALSO errors
  const bakeRatioErrors = result.lineIssues.filter((i) =>
    i.kind === "ratio-outlier" && isOutOfBakeBand(i)  // helper checks [0.5×, 2×]
  );

  const all = [...errors, ...bakeRatioErrors];
  if (all.length > 0) {
    console.error(`[AUTHOR-05] ${slug}: validator failed (${all.length} issues):`);
    for (const issue of all) {
      console.error(`  [${issue.kind}] line ${issue.index}: ${issue.message}`);
    }
    throw new Error(`validator refused to bake ${slug}`);
  }
  if (!result.structureOk) {
    throw new Error(`[AUTHOR-05] ${slug}: structure parity failed — ${JSON.stringify(result.firstDivergence)}`);
  }
}
```
Source: existing `src/lib/author-validation.ts:59-223` (pattern of return-structured-results, not throw-on-issue).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Cache at `~/.cache/masonic-mram-audio/` (outside repo) | Cache at `rituals/_bake-cache/` (co-located with content, per-repo) | This phase (D-01) | Survives machine moves with the repo; no more "my new laptop re-bakes from scratch" |
| `CACHE_KEY_VERSION = "v2"`, no modelId in key | `CACHE_KEY_VERSION = "v3"`, modelId in key material | This phase (D-02) | Eliminates silent stale hits where a 2.5-pro bake gets served as 3.1-flash |
| Short lines silently dropped at bake time | Short lines auto-route to Google Cloud TTS | This phase (D-09) | No more `.mram` missing "I do." audio |
| No cipher/plain parity enforcement at bake time | Validator hard-fails bake on parity issues | This phase (D-08) | Catches scoring-time failures at authoring time |
| Two separate `openDB` in `storage.ts` + `voice-storage.ts` (lockstep comment at L14-17) | Single `openDB` in `idb-schema.ts` imported by both | This phase (D-16) | One place to bump `DB_VERSION`; Phase 5 `feedbackTraces` adds cleanly |
| Inline `process.env.NODE_ENV === "production"` in author page | `assertDevOnly()` from `src/lib/dev-guard.ts` | This phase (D-15) | Shared guard between `/author` and `preview-bake.ts`; one invariant |

**Deprecated / outdated:**
- `@esm2cjs/p-limit` — the CJS backport. We don't need it: Node 20 + `module: "esnext"` + `npx tsx` handles p-limit 7+ ESM directly.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `gemini-3.1-flash-tts-preview` model ID is the canonical current ID as of 2026-04-21 | AUTHOR-03 | If Google rotated the ID between blog post (2026-04-15) and now, every bake hits 404 on the first model; fallback chain still renders but at lower quality. **Mitigation:** planner adds a pre-flight check that hits `/v1beta/models` and greps for the exact ID before the first real render. |
| A2 | `music-metadata@11.12.3` correctly parses Opus bytes from Gemini's post-ffmpeg encode AND Google Cloud TTS's `OGG_OPUS` native encode | AUTHOR-06 | If one path produces a container the parser doesn't recognize, the anomaly detector throws instead of returning a number. **Mitigation:** unit test with one sample of each pipeline's output. |
| A3 | Google Cloud TTS `audioEncoding: "OGG_OPUS"` returns bytes that are byte-compatible with Gemini's post-ffmpeg Opus output (same container, same codec profile) | AUTHOR-04 | If encoding differs, the `.mram` has mixed-container audio per line and browser playback breaks on some lines. **Mitigation:** integration test embeds one Google-rendered short line into a test `.mram` and asserts the app's `<audio>` plays it. |
| A4 | `--verify-audio` can call Groq's Whisper endpoint directly with `GROQ_API_KEY` from env, bypassing the `/api/transcribe` route's client-token gate | AUTHOR-07 | If Groq's API contract changed between the existing route's implementation and now, the direct call fails. **Mitigation:** copy the exact request shape from `src/app/api/transcribe/route.ts:75-92` — same endpoint, same model, same multipart form. |
| A5 | The existing `GOOGLE_ROLE_VOICES` table in `src/lib/tts-cloud.ts:288-337` is tonally appropriate for short-line bake use AS-IS (no Studio-tier upgrade required) | AUTHOR-04 | If the Neural2 voices sound jarringly different from Gemini's, every short-line bake produces audible timbre shift. **Mitigation:** this is explicitly in Claude's Discretion per D-09; Shannon A/B's during execution. Start with existing table; upgrade path is well-understood. |

## Open Questions

1. **Should `--parallel N` also cap Google Cloud TTS short-line calls, or just Gemini?**
   - What we know: D-07 locks `--parallel 4` default against Gemini preview rate limits. Google Cloud TTS has separate, higher quotas.
   - What's unclear: Whether the orchestrator uses one `p-limit` pool across both engines (simpler) or two pools (more aggressive on Google).
   - Recommendation: **One pool for simplicity in Phase 3.** Google short-line bakes are a small fraction of total calls (lines < 5 chars are rare); the complexity of two pools isn't worth it. Revisit if Phase 4 shows Google is the bottleneck.

2. **How does `--resume` behave if Shannon edits the dialogue file between crash and resume?**
   - What we know: `_RESUME.json` carries `completedLineIds`; those IDs come from parsing the dialogue.
   - What's unclear: Whether line IDs are stable across edits (they come from `dialogue-format.ts` parse positions). An inserted line shifts all subsequent IDs.
   - Recommendation: **`dialogueChecksum` field in `_RESUME.json` (sha256 of plain.md).** If checksum doesn't match on resume, refuse with a clear message: "dialogue file changed since this run started; remove `_RESUME.json` and re-run fresh." Saves Shannon from a confusing half-stale bake.

3. **Which voice tier for short-line Google bakes — Neural2 or Studio?**
   - What we know: Existing `GOOGLE_ROLE_VOICES` uses Neural2 (mid-tier, cheaper).
   - What's unclear: Whether Studio tier's closer audio fidelity is worth the price increase for short lines that account for <5% of total audio time.
   - Recommendation: **Neural2 initial default; Shannon A/B's during execution (D-09 Discretion).** If timbre shift is audible, add `BAKE_GOOGLE_VOICE_TIER=studio` env var as a follow-up patch — ~10-line change.

4. **Does `fake-indexeddb/auto` need to be loaded globally in `vitest.config.ts` or per-file?**
   - What we know: Only `src/lib/__tests__/idb-schema.test.ts` needs it in Phase 3.
   - What's unclear: Whether future Phase 5 `feedbackTraces` tests will benefit from global loading.
   - Recommendation: **Per-file in Phase 3.** Add to `vitest.config.ts` `setupFiles` only when a second consumer appears in Phase 5. Keeps the test env minimal for Phase 3's scope.

## Sources

### Primary (HIGH confidence)
- `npm view p-limit version` → 7.3.0, published 2 months ago, MIT, Sindre Sorhus
- `npm view fake-indexeddb version` → 6.2.5, published 5 months ago, Apache-2.0
- `npm view music-metadata version` → 11.12.3, ESM-only, Node ≥14.13
- Existing project code: `scripts/render-gemini-audio.ts` (DEFAULT_MODELS, CACHE_DIR, CACHE_KEY_VERSION, computeCacheKey, callGeminiWithFallback, AllModelsQuotaExhausted)
- Existing project code: `src/lib/author-validation.ts` (validatePair, PairLineIssue types, ratio-outlier pattern)
- Existing project code: `src/lib/storage.ts:14-17` + `src/lib/voice-storage.ts:10-13` (DB_VERSION lockstep comment)
- Existing project code: `src/lib/tts-cloud.ts:288-347` (GOOGLE_ROLE_VOICES Neural2 table), `src/lib/tts-cloud.ts:1053-1090` (GEMINI_ROLE_VOICES)
- Existing project code: `src/app/api/tts/google/route.ts` (Google Cloud TTS REST request shape reference)
- Existing project code: `src/app/api/transcribe/route.ts:75-133` (Groq Whisper API request + audit emit reference)
- Existing project code: `scripts/lookup-hashed-user.ts` (standalone-script pattern for bake-all.ts)
- Environment verification: Node 20.20, npx 10.8.2, git 2.43.0, ffmpeg 6.1.1 (all `command -v` + `--version`)
- Environment verification: 438 `.opus` files in `~/.cache/masonic-mram-audio/` (ls + wc -l) — real migration data for D-01
- `.planning/codebase/ARCHITECTURE.md`, `CONVENTIONS.md`, `TESTING.md`, `STACK.md`

### Secondary (MEDIUM confidence — cross-verified with official docs)
- Google AI for Developers: `gemini-3.1-flash-tts-preview` model doc (https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-tts-preview) — confirms model ID as of 2026-04
- Google Cloud Text-to-Speech docs (https://docs.cloud.google.com/text-to-speech/docs/reference/rest/v1/AudioEncoding) — confirms OGG_OPUS audioEncoding value
- Google Cloud TTS list-voices-and-types (https://docs.cloud.google.com/text-to-speech/docs/list-voices-and-types) — confirms Studio + Neural2 + Chirp3-HD voice tiers
- Git docs (https://git-scm.com/docs/git-diff) — `--name-only` + `--diff-filter=d` semantics
- RFC 7845 (https://www.rfc-editor.org/rfc/rfc7845.html) — Ogg Opus container format, granule_position, recommended MIME type
- MDN HTTP Range (https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Range) — 206 Partial Content + Content-Range semantics
- `p-limit` README (https://github.com/sindresorhus/p-limit) — ESM usage, default-export signature
- `music-metadata` README (https://github.com/Borewit/music-metadata) — `parseBuffer` + Opus support
- `fake-indexeddb` README (https://github.com/dumbmatter/fakeIndexedDB) — `fake-indexeddb/auto` side-effect import

### Tertiary (LOW confidence — flagged in Assumptions Log)
- None — all assumptions are either verified or flagged explicitly with mitigations above

### Project skills referenced (HIGH confidence — maintained by Shannon)
- `gemini-tts-voice-cast-scene-leaks-into-audio` — root cause driving D-10 duration anomaly detector
- `gemini-tts-preview-quota-and-fallback-chain` — historical fix for D-12 3-model chain
- `typed-event-names-for-pii-safe-telemetry` — pattern D-17 `FeedbackTrace` interface follows
- `aes-gcm-node-web-crypto-interop` — `.mram` encryption context (Phase 3 doesn't modify)
- `markdown-beats-jsonl-for-llm-transcripts` — dialogue format context for file-walking logic

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified on npm registry 2026-04-21; all APIs have existing code references in the repo
- Architecture: HIGH — all files to touch are explicitly enumerated in CONTEXT.md with line-number pointers
- Pitfalls: HIGH — most come from the project's own skill library and prior incident records
- Validation architecture: MEDIUM — test file stubs are listed in Wave 0 but concrete test cases await planning
- Google TTS voice-tonal-match decision: LOW-MEDIUM — subjective, explicitly in Claude's Discretion; Shannon A/B's during execution per D-09

**Research date:** 2026-04-21
**Valid until:** 2026-05-21 (30 days — Gemini preview model IDs rotate quickly; re-verify A1 before execution if Phase 3 slips past that window)
