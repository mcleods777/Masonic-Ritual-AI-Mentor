# Phase 3: Authoring Throughput - Research

**Researched:** 2026-07-01
**Domain:** Node/TypeScript CLI tooling — content-addressed caching, process orchestration, TTS pipeline hardening, local dev-only HTTP server
**Confidence:** HIGH (verified against actual codebase, live tool checks, and a fully-executed prior implementation — see Prior Implementation section)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Ultra-short-line policy (AUTHOR-04):**
- **D-01:** Every line gets baked audio — no runtime-TTS hard-skips, ever. The current `<11 chars → skip-too-short → runtime TTS` classification is removed. Phase 4's CONTENT-06 ("no live TTS on a first rehearsal") holds by construction, not by verifier exception.
- **D-02:** Engine path for <11-char lines: try Gemini with instructional padding first (keeps the voice cast consistent; memory skill `gemini-tts-speakas-short-line-instructional-prompt`), fall back to Google Cloud TTS on validation failure. The bake never skips — worst case is a non-Gemini voice on a 5-char line. `test-google-line94.mjs` (repo root, untracked) is the working proof-of-concept for the Google path.
- **D-03 (PROVISIONAL — user was AFK; confirm at plan review):** Validation gate for the Gemini padded render: duration-anomaly check (AUTHOR-06) + STT round-trip diff (AUTHOR-07) on short lines. If Shannon objects, downgrade to duration-only.
- **D-04:** Google Cloud TTS fallback voice: per-role closest match to the Gemini cast, pinned in each ritual's `{slug}-voice-cast.json` (extend the sidecar schema with a `googleVoice` field per role or equivalent).

**Cache canonicalization & key migration (AUTHOR-01):**
- **D-05:** `rituals/_bake-cache/` (873 opus files, previously referenced by zero code) is Shannon's manual backup of `~/.cache/masonic-mram-audio/` — a superset snapshot preserving renders later invalidated locally (873 backup vs 475 live). Treat it as migration input, not garbage.
- **D-06:** Canonical cache location going forward: `rituals/_bake-cache/` (gitignored — verify `.opus` is covered and extend if needed). One-time move of the 475 live entries + dedup-merge of the 873 backup entries. `~/.cache/masonic-mram-audio/` is retired; `invalidate-mram-cache.ts` and all scripts point at the new location.
- **D-07:** Add modelId to the cache key material (`sha256(voice + style + text + modelId + KEY_VERSION)`), with a one-time in-place migration script that re-keys every existing entry (live + backup union, deduped) assuming `gemini-3.1-flash-tts-preview` provenance — justified because the current bake deletes fallback-tier entries after render, so surviving entries are premium. **Zero re-render cost.** Bump `CACHE_KEY_VERSION`.
- **D-08:** With modelId in the key, premium and degraded renders coexist under distinct keys. Replace delete-on-fallback with keep-and-upgrade: degraded-tier (2.5-flash/pro) renders stay cached under their own key; the baked `.mram` (or a bake manifest) records which lines used a fallback tier; a later re-bake re-renders only those lines on the premium model when quota allows.

### Claude's Discretion

- **Orchestrator design (AUTHOR-02, AUTHOR-09)** — not discussed; Claude decides during planning within these discovered constraints: (a) `--since <git-ref>` is impossible for gitignored dialogue files — use a content-hash manifest (or mtime) for change detection and treat the flag name/semantics accordingly; (b) `--parallel N` must not fight the interactive `--on-fallback=ask` pause — resolve the interaction (e.g., pause-all-workers on first fallback, or require `--on-fallback=continue|abort` when parallel); (c) p-limit cap value tuned to Gemini quota behavior observed in `bake.log`.
- **Preview server (AUTHOR-08)** — not discussed; Claude designs the `localhost:8883` scrubber. MUST first inspect the existing informal review workflow (`rituals/*-review.json`, `rituals/_sessions/experiment1/`) and build on it rather than inventing a parallel one. Dev-guard identical to `/author/_guard.ts` per requirement.
- **idb-schema extraction (AUTHOR-10)** — mechanical; single `src/lib/idb-schema.ts` source of truth for `DB_VERSION` + `onupgradeneeded`, imported by both `storage.ts` and `voice-storage.ts`, housing the future `feedbackTraces` store definition (Phase 5 consumes it). Dual-open test per roadmap success criterion 6.
- **Parity validator wiring (AUTHOR-05)** — extend existing `author-validation.ts` / `validate-rituals.ts` (speaker, action tags, word-count ratio band) and wire as a refusing gate in the bake path. Exact ratio band thresholds: Claude tunes from the existing `ratio-outlier` logic.
- **Duration-anomaly thresholds (AUTHOR-06)** — roadmap says ">3× ritual median for its character count"; Claude may refine (e.g., per-character-count normalization) as evidence dictates.
- D-03's exact STT engine for round-trip (Groq Whisper via existing `/api/transcribe` machinery vs direct API call from the script) — script-side direct call likely; Claude decides.

### Deferred Ideas (OUT OF SCOPE)

- **Errata JSON sidecar for one-word fixes without full rebake** — AUTHOR-v2-03, post-v1
- **Hosted/self-serve author UI** — AUTHOR-v2-01, explicitly out of v1
- **Trusted co-author circle** — AUTHOR-v2-02, post-v1
- **Cleaning up `.mram.backup-*` clutter in rituals/** — noticed during scout (a dozen timestamped backups); could be an orchestrator nicety (auto-prune old backups) but not a requirement; planner may fold it in as a small task if free
- STATE.md open question "does strong revocation need to ship earlier" — Phase 6 concern, untouched by this phase
</user_constraints>

## Summary

Phase 3 builds solo-author tooling (AUTHOR-01..10) so Shannon can re-bake a single edited line in under a minute and bake five rituals' worth of content without burning weekends on serial Gemini calls. The domain is entirely Node/TypeScript CLI engineering on top of an already-mature bake pipeline (`scripts/build-mram-from-dialogue.ts`, `scripts/render-gemini-audio.ts`) — no new frameworks, no UI framework decisions, just orchestration, caching, validation gates, and one small localhost-only HTTP server.

**The single most important finding in this research:** an orphaned git branch, `gsd/phase-3-authoring-throughput` (also present on `origin`), already contains a **complete, tested, code-reviewed, security-audited implementation of this exact phase** (AUTHOR-01 through AUTHOR-10, 55 commits, diverged from `main` at commit `0874247` on 2026-04-23, 517/517 tests passing). It was never merged. `main` has only drifted 8 commits since divergence, mostly unrelated (upload/zip-import feature, iOS mic fix, pilot banner fix). This branch should be treated as **primary reference material, not something to reinvent from scratch** — but it is NOT a rubber-stamp merge candidate: this research also found a **confirmed, load-bearing bug** in that branch's `--since <git-ref>` implementation (it diffs git refs against `rituals/*.md`, which are permanently gitignored and never enter git history, so the flag silently reports "0 rituals changed" on every real edit Shannon makes) and at least one meaningfully worse design decision (its cache-key v2→v3 migration discards all 475 existing cache entries instead of doing the zero-cost provenance-assumption re-keying that today's CONTEXT.md's D-07 specifies). The planner should treat the old branch as a detailed worked example and a source of pre-vetted code patterns, pitfalls, and test structure — while re-deriving the specific decisions where today's CONTEXT.md (D-01 through D-08) diverges from what the old branch built.

**Primary recommendation:** Recover the old branch's file structure and test patterns as a reference (`git show gsd/phase-3-authoring-throughput:<path>`), rebase or hand-port its non-`--since`/non-migration code onto current `main`, fix the `--since` git-diff bug with the content-hash/mtime approach CONTEXT.md's Claude's-Discretion already specifies, and implement the D-07/D-08 provenance-preserving cache migration that the old branch didn't do. Use `p-limit@^7.3.0` for concurrency, `ffprobe` (already a hard dependency via ffmpeg) for Opus duration extraction instead of adding `music-metadata`, and a direct Groq Whisper API call (not `/api/transcribe`) for the STT round-trip since bake scripts have no HTTP session.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Bake cache (content-addressed Opus storage) | Author CLI (Node scripts) | Filesystem (`rituals/_bake-cache/`) | Local dev-only artifact; never touches the deployed app tier |
| Orchestrator (`bake-all.ts`) | Author CLI | — | Pure Node process orchestration, spawns `build-mram-from-dialogue.ts` per ritual |
| Cipher/plain parity validator | Author CLI + shared lib (`src/lib/author-validation.ts`) | `/author/*` API routes (existing) | Same validator logic is imported by both the CLI bake gate and the existing `/api/author/pair` route — shared lib is correct, CLI is primary consumer for Phase 3 |
| Duration-anomaly / STT round-trip | Author CLI | External API (Google Cloud TTS, Groq Whisper) | Bake-time-only correctness gates; zero runtime/client footprint |
| Preview server (`scripts/preview-bake.ts`) | Author CLI (standalone `node:http` server) | — | Explicitly NOT part of Next.js dev server; independent process, loopback-only, dev-guarded |
| `idb-schema.ts` | Browser/Client (IndexedDB) | — | Runs in the browser tier; `storage.ts` and `voice-storage.ts` are both client-side modules. Phase 3 only touches the schema-definition module, not server code |
| `feedbackTraces` store (schema only, no writer yet) | Browser/Client (IndexedDB) | — | Store housing created in Phase 3; Phase 5 COACH-06 is the actual writer/reader |

No capability in this phase touches the Next.js server tier, the deployed API routes' request path, or the CDN/static tier — everything is either (a) a local dev-only Node CLI/script, or (b) a schema-definition change to a client-side IndexedDB module. This matters for planning: none of AUTHOR-01..09 requires `next build` changes or route changes; only AUTHOR-10's `idb-schema.ts` touches code that ships to production (and even then, only as an internal refactor with no behavior change for shipped users).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTHOR-01 | Content-addressed bake cache at `rituals/_bake-cache/` keyed on `sha256(voice+style+text+modelId+KEY_VERSION)` | Prior Implementation section (old branch's `computeCacheKey`/migration code as reference); Common Pitfalls #1 (.gitignore gap), #2 (migration re-render cost) |
| AUTHOR-02 | `scripts/bake-all.ts` orchestrator with `--since`, `--dry-run`, `--resume`, `--parallel N` | Common Pitfalls #3 (`--since` git-diff bug — confirmed in old branch); Architecture Patterns (orchestrator design); Code Examples (resume-state pattern) |
| AUTHOR-03 | `gemini-3.1-flash-tts-preview` prioritized in fallback chain | Already done in current `main` (`scripts/render-gemini-audio.ts:28-30`) — Standard Stack notes this is verification-only work |
| AUTHOR-04 | Ultra-short-line fix — route to alternate engine, never silently drop | Code Examples (Google Cloud TTS call shape from `test-google-line94.mjs`); Common Pitfalls #4 (preamble leak into short-line Google TTS) |
| AUTHOR-05 | Cipher/plain parity validator hard-fails bake | Existing `src/lib/author-validation.ts` + `scripts/validate-rituals.ts` as extension base; Architecture Patterns (validator-first ordering) |
| AUTHOR-06 | Audio-duration anomaly detector | Code Examples (`computeMedianSecPerChar`/`isDurationAnomaly` reference implementation); Common Pitfalls #5 (first-bake false positive) |
| AUTHOR-07 | Optional STT round-trip diff (`--verify-audio`) | Existing `/api/transcribe` route's `MASONIC_PROMPT` vocabulary hints reusable; Code Examples (`wordDiff` reference); direct-call rationale in Standard Stack |
| AUTHOR-08 | `scripts/preview-bake.ts` localhost-only server | Existing informal review workflow (`rituals/*-review.json`, `rituals/_sessions/`) to build on; `src/app/api/author/_guard.ts` as the dev-guard pattern to extract from; Common Pitfalls #6 (path traversal) |
| AUTHOR-09 | `p-limit` concurrency cap | Standard Stack (p-limit v7.3.0 verified + ESM/tsx compatibility empirically tested); Common Pitfalls #7 (p-limit caps tasks, not internal HTTP calls) |
| AUTHOR-10 | `src/lib/idb-schema.ts` extraction | Existing `storage.ts`/`voice-storage.ts` duplication documented; Code Examples (consolidated `openDB()` pattern); `fake-indexeddb` for dual-open test |
</phase_requirements>

## Prior Implementation Recovered (read before planning)

An orphaned branch already contains a full build-out of this phase. **This is not hypothetical — verified directly against the git object database in this repo.**

```
git log --oneline main..gsd/phase-3-authoring-throughput | wc -l   # → 55 commits
git merge-base main gsd/phase-3-authoring-throughput               # → 0874247 (2026-04-23)
git log --oneline 0874247..main | wc -l                            # → 8 commits (main's drift since)
```

`origin/gsd/phase-3-authoring-throughput` matches the local branch exactly (same SHA `58eb551`).

### What's on the branch

- Full planning trail: `.planning/phases/03-authoring-throughput/03-{01..08}-*-PLAN.md` + matching `*-SUMMARY.md` (8 plans, 3 waves), `03-RESEARCH.md`, `03-REVIEW.md`, `03-REVIEW-FIX.md` (7 code-review findings fixed), `03-SECURITY.md` (28/28 threats closed, ASVS level 1), `03-VERIFICATION.md` (7/7 structural success criteria verified, 3 flagged `human_needed` for real-Gemini-bake timing), `03-HUMAN-UAT.md`.
- Working code for every AUTHOR-01..10 requirement: `scripts/bake-all.ts` (489 lines), `scripts/preview-bake.ts` (401 lines), `src/lib/idb-schema.ts`, `src/lib/dev-guard.ts`, `src/lib/author-validation.ts` extensions, `scripts/lib/bake-math.ts`, `scripts/lib/resume-state.ts`, `scripts/lib/validate-or-fail.ts`, plus 517 passing tests across 43 files (+72 tests vs. the pre-Phase-3 baseline).
- It went further than this phase's scope needs: it also has Phase 4 research + an 8-plan Phase 4 breakdown committed on top (commits `5796269`..`0afef4d`), meaning whoever worked this branch continued past Phase 3 before it was abandoned.

Pull any file for reference with `git show gsd/phase-3-authoring-throughput:<path>`. **Do not check out or merge the branch wholesale** — it predates D-07/D-08's smarter migration and has the confirmed `--since` bug below. Treat it as a paved-road reference, not a source of truth.

### Where today's CONTEXT.md (D-01..D-08) already improves on the old branch

| Area | Old branch's decision | Today's CONTEXT.md decision | Why today's is better |
|------|----------------------|------------------------------|------------------------|
| Cache key migration | Bump `CACHE_KEY_VERSION` v2→v3, add modelId. No provenance backfill — confirmed in `03-05-SUMMARY.md`: *"Most of those 475 entries will MISS on lookup under v3 ... Budget ~475 × ~6s = ~48 minutes of fresh Gemini calls."* | D-07: one-time in-place re-key of every existing entry, assuming `gemini-3.1-flash-tts-preview` provenance (justified because current code deletes fallback-tier entries on abort, so survivors are premium-only). **Zero re-render cost.** | Saves ~48 minutes of Gemini quota + avoids a cold-cache scare on first Phase-3 bake |
| Fallback-tier handling | Not addressed — current `main` code (and the old branch, unchanged here) deletes a just-rendered fallback-tier entry on `--on-fallback=abort`, throwing away real work | D-08: keep-and-upgrade — degraded renders stay cached under their own (modelId-qualified) key; a bake manifest records which lines used a fallback tier so a later re-bake can selectively upgrade just those | Never re-pays for a render that already succeeded, even at lower tier |
| `--since` change detection | `git diff --name-only <ref> -- 'rituals/*-dialogue.md' ...` (see bug below) | Claude's Discretion: content-hash manifest or mtime, explicitly because dialogue files are gitignored | Old approach is confirmed broken for real use (see Common Pitfalls #3) |

### Confirmed bug in the old branch: `--since <git-ref>` cannot work

The old branch's `scripts/bake-all.ts` `getChangedRituals()` runs:

```ts
execFileSync("git", ["diff", "--name-only", "--diff-filter=d", sinceRef,
  "--", "rituals/*-dialogue.md", "rituals/*-dialogue-cipher.md"], { encoding: "utf8" });
```

`git diff <ref> -- <pathspec>` compares a git tree to the **working directory**, and git diff (in any form) **never reports untracked files** — only files that exist in at least one side's tree/index. `.gitignore` lines 46-52 exclude `rituals/*.md` (and `*.json`, `*.yaml`, etc.) from ever being tracked. These dialogue files have **never once been committed to git**, at any point in this repo's history. Therefore `getChangedRituals()` returns an empty array for every possible `sinceRef`, on every real edit Shannon makes to a real dialogue file — the flag silently does nothing useful in production use, even though 27 unit tests pass for it (the tests almost certainly exercise a fixture repo with tracked files, which doesn't reproduce the gitignore interaction). `[VERIFIED: read old branch's source directly + confirmed .gitignore lines 46-52 + confirmed git diff semantics for untracked paths]`

This validates today's CONTEXT.md's Claude's-Discretion guidance precisely: implement `--since` via a content-hash or mtime manifest, not `git diff`.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `p-limit` | `^7.3.0` | Concurrency cap for parallel Gemini/Google TTS renders (AUTHOR-09) | `[VERIFIED: npm registry, slopcheck OK]` Canonical Sindre Sorhus concurrency primitive. `npm view p-limit version` → `7.3.0` (published 2026-02-03). **ESM-only (`"type": "module"`), requires Node ≥20** — confirmed compatible with this project's `npx tsx` execution model by direct empirical test: `import pLimit from "p-limit"` inside a `require.main === module`-style CJS script ran correctly under `npx tsx` in this repo (Node 20.20.0 present). Not currently a direct dependency (only present transitively via a devDependency at v3.1.0 CJS) — planner must add it explicitly. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `fake-indexeddb` | `^6.2.5` | In-memory IndexedDB for the AUTHOR-10 dual-open test | `[VERIFIED: npm registry, slopcheck OK]` Only mature pure-JS IndexedDB implementation for Node test environments; `jsdom` (this project's vitest environment) does not implement IndexedDB. |
| `node:http` (built-in) | Node 20 | `preview-bake.ts` server | No framework needed — one route, streamed file responses, loopback-only. Adding Express/Fastify for this would be over-engineering for a dev-only single-purpose tool. |
| `node:child_process` (built-in) | Node 20 | Orchestrator spawning `build-mram-from-dialogue.ts` per ritual | Already the pattern used by `scripts/bake-first-degree.ts`. |
| ffmpeg/ffprobe (system binary) | 6.1.1 (confirmed present) | Opus duration extraction for AUTHOR-06 | See "Duration extraction" note below — avoids a new dependency. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ffprobe subprocess for duration | `music-metadata@^11.13.0` npm package | `[VERIFIED: npm registry, slopcheck OK]` `music-metadata` is what the old branch used and what `test-google-line94.mjs` (Shannon's own experiment) already reaches for via `await import("music-metadata")`. It's a legitimate, well-maintained option (Borewit/music-metadata) and works fine via `npx tsx` (ESM-only, Node ≥18). **Recommendation: prefer ffprobe** for two of the three duration-measurement needs (see below) since `ffmpeg` is already a hard runtime dependency of this pipeline (`encodeWavToOpus` in `render-gemini-audio.ts` already shells out to it) — adding `music-metadata` only pays off for decoding OGG/Opus bytes that never had a WAV intermediate (i.e., the Google Cloud TTS short-line path, which returns `OGG_OPUS` directly). If the planner wants one uniform code path for all duration measurement (Gemini WAV-derived + Google Opus-derived), `music-metadata` is the simpler single-tool choice and is pre-vetted (Shannon already imported it once, old branch already used it in production-quality code with tests) — a reasonable call either way. |
| `--since` via content-hash | mtime-based change detection | mtime is simpler (no hashing) but is unreliable across `git clone`/`rsync`/editor "safe save" (which often rewrites mtimes even for unchanged content, and can also LEAVE mtimes unchanged after a real edit on some editors/filesystems). Content-hash (sha256 of file bytes, stored in a small local manifest e.g. `rituals/_bake-cache/_manifest.json`) is the more robust choice and costs almost nothing extra (hashing a handful of small `.md` files is sub-millisecond). **Recommend content-hash manifest.** |
| Direct Groq call for `--verify-audio` | Route through `/api/transcribe` | The existing route requires a client-token + session cookie (`applyPaidRouteGuards`) that a standalone Node script has no way to obtain without running a full Next dev server. A direct call to `https://api.groq.com/openai/v1/audio/transcriptions` using the same `GROQ_API_KEY` env var the bake script already needs is simpler and matches the "bake has no server" pattern already used elsewhere in this pipeline (e.g. `promptPassphrase()`'s stdin-vs-env handling). **Recommend direct call.** The existing `MASONIC_PROMPT` constant in `src/app/api/transcribe/route.ts` is reusable verbatim — copy or import it for the bake-time Whisper call to keep transcription accuracy on ritual vocabulary consistent between runtime and bake-time paths. |

**Installation:**
```bash
npm install p-limit@^7.3.0
npm install --save-dev fake-indexeddb@^6.2.5
```

**Version verification (performed 2026-07-01):**
- `npm view p-limit version` → `7.3.0` (published 2026-02-03) — `[VERIFIED: npm registry]`
- `npm view fake-indexeddb version` → `6.2.5` — `[VERIFIED: npm registry]`
- `npm view music-metadata version` → `11.13.0` — `[VERIFIED: npm registry]` (not recommended as the primary path; see Alternatives)
- `p-limit@7` empirically confirmed importable via `npx tsx` in this exact repo (test script executed, printed `p-limit works: 42`) — `[VERIFIED: direct test in this repo]`
- `ffprobe` confirmed present on this dev machine (`/usr/bin/ffprobe`, ffmpeg 6.1.1 suite) — `[VERIFIED: command -v ffprobe]`

**ESM-only warning:** `p-limit@7` and `fake-indexeddb@6` are both `"type": "module"`. This repo has no `"type"` field in `package.json` (defaults to CommonJS) but scripts run via `npx tsx`, which transparently interop-imports ESM-only packages from CJS-style `.ts` files (confirmed empirically — see above). No special handling needed beyond `import pLimit from "p-limit"` (default export).

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `p-limit` | npm | ~9 years (first published 2015, current major published 2026-02-03) | very high (foundational Sindre Sorhus utility, used transitively by this project already) | github.com/sindresorhus/p-limit | `[OK]` | Approved |
| `fake-indexeddb` | npm | multi-year, actively maintained | high (standard IndexedDB test double across the ecosystem) | github.com/dumbmatter/fakeIndexedDB | `[OK]` | Approved |
| `music-metadata` | npm | multi-year (Borewit/music-metadata) | high | github.com/Borewit/music-metadata | `[OK]` | Not recommended as primary (see Alternatives) — approved if planner chooses it over ffprobe |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

All three packages ran through `slopcheck install <pkg> --ecosystem npm` in this repo and returned `[OK]`. Package names were cross-checked against the old branch's already-shipped, already-code-reviewed, already-security-audited use of the identical package/version combination (`p-limit@^7.3.0`, `fake-indexeddb@^6.2.5`, `music-metadata@^11.12.3`), which independently corroborates these are the correct, non-hallucinated package names for this exact use case.

## Architecture Patterns

### System Architecture Diagram

```
                     ┌─────────────────────────────┐
                     │  Shannon edits a dialogue    │
                     │  file: rituals/{slug}-       │
                     │  dialogue.md / -cipher.md    │
                     └──────────────┬────────────────┘
                                    │
                                    ▼
                     ┌─────────────────────────────┐
                     │  npx tsx scripts/bake-all.ts │
                     │  [--since] [--dry-run]       │
                     │  [--resume] [--parallel N]   │
                     └──────────────┬────────────────┘
                                    │
                    1. discover rituals to bake
                    (content-hash manifest diff,
                     or --resume state, or all)
                                    │
                                    ▼
                     ┌─────────────────────────────┐
                     │  Parity validator (AUTHOR-05)│
                     │  src/lib/author-validation.ts│
                     │  speaker / action / ratio    │
                     └──────────────┬────────────────┘
                             fail → exit non-zero, NO API calls
                                    │ pass
                                    ▼
                     ┌─────────────────────────────┐
                     │  per-ritual spawn:           │
                     │  build-mram-from-dialogue.ts │
                     │  --with-audio --resume-state │
                     └──────────────┬────────────────┘
                                    │
                     p-limit(N) fan-out over spoken lines
                                    │
                 ┌──────────────────┼──────────────────┐
                 ▼                  ▼                  ▼
        ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
        │ cache hit?      │ │ short line      │ │ normal line     │
        │ rituals/_bake-  │ │ (<11 chars)     │ │ Gemini TTS      │
        │ cache/{key}.opus│ │ D-02: Gemini    │ │ fallback chain  │
        │ → return bytes  │ │ padded first,   │ │ (3.1-flash →    │
        │                 │ │ Google TTS      │ │  2.5-flash →    │
        │                 │ │ fallback        │ │  2.5-pro)       │
        └────────┬────────┘ └────────┬────────┘ └────────┬────────┘
                 │                   │                    │
                 │          ┌────────▼────────┐  ┌────────▼────────┐
                 │          │ Duration-anomaly │  │ Duration-anomaly│
                 │          │ + STT round-trip │  │ check (AUTHOR-06)│
                 │          │ gate (AUTHOR-06/ │  │                 │
                 │          │ 07, D-03)        │  │                 │
                 │          └────────┬────────┘  └────────┬────────┘
                 │                   │                    │
                 └───────────────────┴────────────────────┘
                                     │
                         write to rituals/_bake-cache/
                         {sha256(text,style,voice,modelId,KV)}.opus
                         (D-08: distinct key per model tier —
                          fallback-tier entries kept, not deleted)
                                     │
                                     ▼
                     ┌─────────────────────────────┐
                     │  Encrypt → rituals/{slug}.mram│
                     └──────────────┬────────────────┘
                                    │
                                    ▼
                     ┌─────────────────────────────┐
                     │  scripts/preview-bake.ts     │
                     │  127.0.0.1:8883 (dev-only)   │
                     │  streams cached .opus for    │
                     │  in-browser scrub, before     │
                     │  Shannon re-encrypts/ships    │
                     └─────────────────────────────┘
```

### Recommended Project Structure

```
scripts/
├── bake-all.ts                    # AUTHOR-02/09 orchestrator (new)
├── preview-bake.ts                # AUTHOR-08 localhost cache scrubber (new)
├── build-mram-from-dialogue.ts    # existing — gains short-line routing (AUTHOR-04),
│                                   #   validator gate (AUTHOR-05), anomaly gate (AUTHOR-06),
│                                   #   --verify-audio (AUTHOR-07), --resume-state-path plumbing
├── render-gemini-audio.ts         # existing — cache relocation (AUTHOR-01), modelId in key
├── invalidate-mram-cache.ts       # existing — must track new cache key shape + location
└── lib/                            # NEW subfolder for pure, test-friendly helpers
    ├── bake-math.ts                # median/anomaly/word-diff pure functions (AUTHOR-06/07)
    ├── resume-state.ts             # --resume state file read/write (AUTHOR-02)
    ├── cache-manifest.ts           # content-hash change-detection for --since (AUTHOR-02)
    └── validate-or-fail.ts         # shared validator-gate wrapper (AUTHOR-05, used by both
                                     #   bake-all.ts and build-mram-from-dialogue.ts)

src/lib/
├── idb-schema.ts                   # NEW — AUTHOR-10, single openDB() + onupgradeneeded
├── storage.ts                      # existing — replaces own openDB() with idb-schema import
├── voice-storage.ts                # existing — same
└── author-validation.ts            # existing — extended with hard-fail severity gate (AUTHOR-05)

rituals/
└── _bake-cache/                    # NEW canonical cache location (D-06), gitignored
    ├── .gitignore                  # `*` / `!.gitignore` pattern (verify .opus actually excluded)
    └── {sha256}.opus                # content-addressed render cache
```

### Pattern 1: Validator-first ordering

**What:** Every ritual passes the cipher/plain parity validator (AUTHOR-05) BEFORE any API call is made — both at the single-ritual level (`build-mram-from-dialogue.ts`) and at the orchestrator level (`bake-all.ts`, checking every discovered ritual up front).
**When to use:** Any multi-ritual batch operation where a single corrupt input shouldn't burn API quota on other, valid rituals before the corruption is caught.
**Example:**
```typescript
// Source: existing src/lib/author-validation.ts validatePair(), extended with
// a severity:"error" gate. Pattern confirmed working in the prior implementation.
const result = validatePair(plainSource, cipherSource);
const errors = result.lineIssues.filter((i) => i.severity === "error");
if (errors.length > 0) {
  console.error(`Refusing to bake: ${errors.length} parity error(s)`);
  for (const e of errors) console.error(`  line ${e.index}: ${e.message}`);
  process.exit(1);
}
```

### Pattern 2: Crash-safe resume via atomic tmp+rename state file

**What:** `--resume` reads a small JSON state file recording which lines already completed; the orchestrator/build script writes it after every line using the existing atomic-write idiom already used for `.mram` output (`writeFileSync(tmp)` + `renameSync(tmp, target)`).
**When to use:** Any long-running batch job where Ctrl-C or a crash mid-run should not force starting over.
**Example:**
```typescript
// Pattern already used in this codebase for .mram output (build-mram-from-dialogue.ts)
// and confirmed as the resume-state pattern in the prior implementation.
function writeResumeStateAtomic(path: string, state: ResumeState): void {
  const tmp = `${path}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, path); // POSIX rename is atomic within same filesystem
}
```

### Pattern 3: Content-hash manifest for `--since` (replaces broken git-diff approach)

**What:** Instead of `git diff <ref>` (which cannot see gitignored dialogue files — see Prior Implementation's confirmed bug), maintain a small manifest mapping each ritual slug to a hash of its dialogue file contents. `--since` compares current hashes against the last-recorded manifest, not against git history.
**When to use:** AUTHOR-02's `--since` flag.
**Example:**
```typescript
// New pattern for this phase — NOT present in the prior implementation
// (which used the broken git-diff approach).
interface RitualManifestEntry { slug: string; plainHash: string; cipherHash: string; bakedAt: string; }

function hashFile(path: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex");
}

function getChangedRituals(manifestPath: string): string[] {
  const manifest: RitualManifestEntry[] = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, "utf-8"))
    : [];
  const byslug = new Map(manifest.map((e) => [e.slug, e]));
  const changed: string[] = [];
  for (const slug of getAllRituals()) {
    const plainHash = hashFile(`rituals/${slug}-dialogue.md`);
    const cipherHash = hashFile(`rituals/${slug}-dialogue-cipher.md`);
    const prior = byslug.get(slug);
    if (!prior || prior.plainHash !== plainHash || prior.cipherHash !== cipherHash) {
      changed.push(slug);
    }
  }
  return changed;
}
```
Note: this repurposes the `--since` flag name from "git-ref-relative" to "manifest-relative"; document the semantic change clearly in the CLI's `--help` output since the flag name implies git history. Consider whether to keep `--since` as the flag name at all vs. renaming to `--changed-only` — CONTEXT.md's Claude's Discretion explicitly allows adjusting "the flag name/semantics."

### Anti-Patterns to Avoid

- **Reusing `buildPreamble()` for the Google Cloud TTS short-line fallback path:** the existing Gemini preamble mechanism is cache-keyed and content-scoped for Gemini's classifier; feeding it into a Google Cloud TTS call would either error (different API shape) or, if naively concatenated as plain text, get spoken aloud verbatim (see `gemini-tts-voice-cast-scene-leaks-into-audio` memory skill and old branch's Pitfall 4). The short-line Google TTS call must be `{ input: { text: cleanText }, voice: {...}, audioConfig: { audioEncoding: "OGG_OPUS" } }` — nothing else in the `input.text` field.
- **`git diff` for `--since` against gitignored paths:** confirmed non-functional (Prior Implementation section). Do not resurrect this pattern even though it's what the old branch shipped and tested.
- **Deleting fallback-tier cache entries on abort:** current `main` code (`build-mram-from-dialogue.ts`'s `handleAbort`) does this; D-08 explicitly reverses this decision for Phase 3. Once modelId is in the cache key, a fallback-tier entry and a premium-tier entry for the same line never collide, so there's no correctness reason to delete — only a would-be storage-savings reason, which is not worth losing completed work over.
- **Passing `models:` explicitly into `renderLineAudio()` options when it should default from env:** documented gotcha in memory skill `gemini-tts-model-wide-outage-bypass` — defeats the `GEMINI_TTS_MODELS` env override. Keep any new call sites consistent with `options.models ?? readModelsFromEnv() ?? DEFAULT_MODELS` resolution order.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Concurrency cap on async work | Hand-rolled Promise pool / semaphore | `p-limit@^7.3.0` | 14.9 kB, one function, near-decade of hardening in the ecosystem |
| Opus/WAV duration extraction | Hand-rolled RIFF/OGG parser | `ffprobe -show_entries format=duration` subprocess (already-required binary) OR `music-metadata` if a uniform JS-only code path is preferred | Audio container parsing has enough edge cases (VBR, multi-page Ogg streams) that a hand-rolled parser is a false economy for a Phase 3-sized task |
| In-memory IndexedDB for tests | Custom IDB stub | `fake-indexeddb@^6.2.5` | Pure-JS reference implementation tracking the real spec; this project's `jsdom` test environment has no native IndexedDB |
| Atomic file writes | Direct `fs.writeFileSync(path, data)` | `writeFileSync(tmp)` + `renameSync(tmp, path)` | Already the established idiom in this codebase (`.mram` output, `.opus` cache writes) — POSIX rename is atomic, direct write can tear on crash |
| HTTP Range request handling | Hand-rolled byte-range server logic from scratch | `fs.createReadStream(path, { start, end })` + a one-line `/^bytes=(\d+)-(\d*)$/` regex | `node:fs` streams already do the heavy lifting; only the header-parsing regex is bespoke, and it's tiny |
| Git changed-files detection (if it were viable here) | Manual `git log` parsing | `git diff --name-only --diff-filter=d <ref> -- <pathspec>` | Not applicable in this phase (dialogue files are gitignored) — noted for completeness since it's a legitimate pattern elsewhere in this pipeline |

**Key insight:** Phase 3's job is orchestration and correctness-gating on top of an already-solid bake pipeline, not format engineering. Every format this phase touches (Opus/WAV audio, IndexedDB, HTTP Range) has either a canonical system tool (`ffprobe`) or a canonical library already in the ecosystem — reaching for them is correct even when the footprint feels heavy relative to this phase's scope, because the alternative is Shannon (a solo author, not a team) owning format-parsing edge cases indefinitely.

## Runtime State Inventory

This phase relocates and re-keys a cache, which is exactly the kind of change that grep-based audits miss. Explicit answers for all 5 categories:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | `~/.cache/masonic-mram-audio/` — 475 live `.opus` cache entries on Shannon's dev machine, keyed under `CACHE_KEY_VERSION = "v2"` (no modelId). `rituals/_bake-cache/` — 873 `.opus` files, Shannon's manual backup copy of an earlier cache state (superset of the 475 live entries per D-05), currently referenced by **zero code** — not yet the active cache location. | **Data migration, not just code edit.** D-06/D-07 require: (1) union-dedupe the 873 backup + 475 live entries (identical keys are byte-identical by construction, so a plain filename-based union/copy is safe — no conflict resolution needed beyond "prefer either, they're the same bytes"), (2) re-key every surviving entry to include `modelId` assuming `gemini-3.1-flash-tts-preview` provenance (D-07's zero-re-render migration), (3) copy (not move) into `rituals/_bake-cache/`, leaving `~/.cache/masonic-mram-audio/` intact for rollback. |
| **Live service config** | None. Phase 3 touches no external service configuration (no Vercel env changes, no Resend config, no third-party dashboards). | No action. |
| **OS-registered state** | None. No cron jobs, systemd units, or scheduled tasks are added or changed by this phase. | No action. |
| **Secrets / env vars** | `GOOGLE_CLOUD_TTS_API_KEY` — already present in `.env`, newly load-bearing for AUTHOR-04's short-line fallback path (previously only used by Shannon's throwaway experiment script). `GROQ_API_KEY` — already present in `.env`, newly load-bearing for AUTHOR-07's `--verify-audio` direct-call path. **`GOOGLE_GEMINI_API_KEY` / `GOOGLE_GEMINI_API_KEYS` — verified ABSENT from this dev machine's `.env`.** No new secret *names* are introduced, but the bake scripts cannot run `--with-audio` end-to-end on this machine without Shannon adding a Gemini key first. | Document in `.env.example` (or equivalent) that both `GOOGLE_CLOUD_TTS_API_KEY` and `GROQ_API_KEY` are now load-bearing for a full bake, not just optional extras. Flag the missing Gemini key as a pre-flight check the orchestrator should perform and fail loudly on, rather than a deep-in-the-run surprise. |
| **Build artifacts / installed packages** | None currently installed that need updating. `p-limit@3.1.0` exists transitively (via some devDependency) but is not a direct dependency — adding `p-limit@^7.3.0` as a direct dependency will NOT conflict (npm resolves both independently since the transitive one is scoped to its parent's `node_modules`), but the planner should be aware two `p-limit` majors will coexist in `node_modules` after this change. | Add `p-limit` and `fake-indexeddb` as direct dependencies (see Standard Stack); no cleanup of the transitive v3 needed. |

**Nothing found in category:** Live service config and OS-registered state — verified explicitly, both empty for this phase.

## Common Pitfalls

### Pitfall 1: `.gitignore` does not actually cover the new cache location's file type
**What goes wrong:** D-06 says "gitignored — verify `.opus` is covered and extend if needed." It is **not** currently covered. `git check-ignore -v rituals/_bake-cache/<hash>.opus` returns exit code 1 (not ignored) against the current `.gitignore`. The existing rules (`.gitignore` lines 46-52) only exclude `rituals/*.md`, `rituals/*.txt`, `rituals/*.json`, `rituals/*.yaml`, `rituals/*.yml` — no `.opus` rule exists anywhere, and none of the `rituals/*.json` rules match nested paths like `rituals/_sessions/experiment1/*.json` (glob without `**` doesn't recurse). Also confirmed **not ignored**: `*.mram.backup-*` files (a dozen exist in `rituals/` today) and `.zip` files (`rituals/entered_apprentice.zip` exists today, uncovered).
**Why it happens:** The existing `.gitignore` was written for the old `~/.cache/`-based cache (outside the repo entirely, so it never needed a rule) and for the specific file extensions already in use when it was authored.
**How to avoid:** Add explicit rules before the first bake writes to the new location: `rituals/_bake-cache/*` (with a `!rituals/_bake-cache/.gitignore` exception so the directory itself can carry its own nested ignore file, matching the pattern the old branch's security audit already validated — `T-03-INFRA-01`), plus `rituals/**/*.json` (not just the top-level glob) to close the nested-sessions gap, plus a rule for `*.mram.backup-*` and `*.zip` under `rituals/` if those are meant to stay untracked (worth flagging to Shannon even though not literally in AUTHOR-01..10 scope — see Deferred Ideas).
**Warning signs:** `git status` showing hundreds of new `.opus`/`.mram.backup-*` files as untracked/staged after the first bake under the new cache location; a `git add -A` accidentally committing gigabytes of audio or old encrypted backups.

### Pitfall 2: Cache-key version bump without provenance backfill re-renders everything
**What goes wrong:** The straightforward way to add `modelId` to the cache key is to bump `CACHE_KEY_VERSION` and let every existing entry cache-miss on next lookup. This is exactly what the prior implementation did, and its own SUMMARY docs record the cost: ~475 entries × ~6s ≈ 48 minutes of fresh Gemini calls, or worse if quota is tight that day.
**Why it happens:** Version-bump-as-cache-buster is the simplest mental model, and it's technically correct/safe — it's just needlessly expensive when the actual modelId of every existing entry IS knowable (current code deletes fallback-tier entries on abort, so every surviving `.opus` under the old key scheme was rendered by the preferred model).
**How to avoid:** Implement D-07 literally — a one-time migration script that computes the NEW (v3, modelId-inclusive) key for every existing entry assuming `gemini-3.1-flash-tts-preview` provenance, and copies/renames the file to the new key. Verify the assumption is safe by checking `bake.log`/prior bake summaries for any entries known to have been rendered on a fallback tier before deletion was added — if any such entries exist and are still cached, they'd be mislabeled. Given the codebase's `handleAbort` has deleted fallback-tier entries since audio-baking was introduced (PR #66), this risk is low but worth a one-line sanity check in the migration script's output (log a count, not just silently assume).
**Warning signs:** First bake after migration burns through Gemini's daily preview quota on lines that were already correctly baked before.

### Pitfall 3: `--since <git-ref>` cannot work against gitignored dialogue files
**What goes wrong:** Implementing `--since` the "obvious" way (`git diff <ref> -- rituals/*.md`) silently returns zero changed files forever, because these files are permanently untracked (see Prior Implementation section — this is a confirmed, not hypothetical, bug in the abandoned prior branch).
**Why it happens:** `git diff` semantics don't surface untracked files under any invocation form; the dialogue files were deliberately gitignored from day one (data-plane invariant — plaintext ritual content never committed) with no exception carved out for a future orchestrator's needs.
**How to avoid:** Use a content-hash manifest (Architecture Patterns, Pattern 3) instead of git history. If a git-relative concept is still wanted for some other reason, it would need the dialogue files force-added to git (`git add -f`), which directly violates the project's data-plane invariant (PROJECT.md) — not an option.
**Warning signs:** `--since` always reports "no rituals changed" regardless of real edits; a unit test suite that passes because it seeds a temp git repo with TRACKED fixture files (not reproducing the real gitignore interaction) will not catch this — treat any `--since` test that uses `git add` on its fixtures as a red flag that it isn't testing the real-world path.

### Pitfall 4: Voice-cast preamble leaking into the short-line Google TTS fallback
**What goes wrong:** The existing Gemini bake path already skips the preamble for lines under `VOICE_CAST_MIN_LINE_CHARS` (default 40 chars) — but the NEW Google Cloud TTS fallback path (D-02/D-04) is easy to wire by copy-pasting from the Gemini call site, which could accidentally carry preamble/style text into the Google TTS `input.text` field. Google Cloud TTS has no concept of "director's notes preamble" — it will speak whatever string it's given, verbatim.
**Why it happens:** Copy-paste from the long-line Gemini path without re-reading what's being copied; this exact failure mode is documented for the analogous Gemini preamble-leak case in memory skill `gemini-tts-voice-cast-scene-leaks-into-audio`.
**How to avoid:** The Google TTS call for short lines must send `input.text` = the raw short line text ONLY, per `test-google-line94.mjs`'s working shape: `{ input: { text }, voice: { languageCode: "en-US", name: voice }, audioConfig: { audioEncoding: "OGG_OPUS" } }`. Add a unit test asserting no preamble/scene/style string ever reaches this call's `input.text`.
**Warning signs:** A short line's baked audio contains spoken content longer than the line's displayed text, or contains phrases matching a `{slug}-voice-cast.json` `scene`/`profile` field.

### Pitfall 5: Duration-anomaly detector false-positives on the first bake (no prior median)
**What goes wrong:** A per-ritual median requires data; on a completely fresh cache (or the first few lines of any ritual), there's no meaningful median to compare against, and a naive implementation could flag legitimate lines as anomalous.
**Why it happens:** Median-of-completed-samples is inherently empty/unstable for the first N lines of any run.
**How to avoid:** Skip the anomaly check until enough same-ritual samples have accumulated (the prior implementation used a threshold of 30 lines, with a rolling median computed from the current run's own completed lines, not historical data — this is a reasonable, evidence-based choice worth reusing). Log a clear `sample too small — skipping anomaly check` message during the skip window so it's visibly distinguishable from a silent gap.
**Warning signs:** First-ever bake of a fresh ritual fails on line 3-5 with an anomaly error that, on manual listen, turns out to be a perfectly normal line.

### Pitfall 6: Preview server path-traversal / symlink-escape via the cache-key URL parameter
**What goes wrong:** `preview-bake.ts` serves files by cache key from a URL path segment. A naive implementation (`path.join(cacheDir, req.url)`) is vulnerable to `../../../etc/passwd`-style traversal, and even a `path.resolve()`-containment check alone can be defeated by a symlink placed inside the cache directory that points outside it.
**Why it happens:** Path traversal is a classic and easy-to-miss vulnerability class in any "serve a file by ID" server, and symlink-escape specifically defeats `path.resolve()`-only containment checks because `resolve()` does not dereference symlinks.
**How to avoid:** Defense in depth, three layers (this exact pattern is already implemented and 20-test-verified in the prior implementation, safe to port as-is): (1) a strict URL-path regex that only accepts a bare 64-hex-char cache key, no slashes, no dots; (2) a `CACHE_KEY_REGEX = /^[0-9a-f]{64}$/` validation before any `path.join`; (3) `path.resolve()`-containment AND `fs.realpathSync()`-containment (the latter specifically to catch symlink-escape, which `path.resolve()` alone misses).
**Warning signs:** A request like `GET /a/../../../etc/passwd.opus` (or any path containing `/` or `..` in the key position) returns anything other than a 400/404.

### Pitfall 7: `p-limit` caps concurrent tasks, not concurrent HTTP requests inside those tasks
**What goes wrong:** `--parallel 4` reads as "at most 4 Gemini API calls in flight" but the existing `callGeminiWithFallback()` internally rotates through multiple API keys and up to 3 model tiers on failure — from `p-limit`'s perspective, one "task" (one line render) can still be making several sequential (or, if not careful, parallel) HTTP calls inside it.
**Why it happens:** `p-limit` only sees the async function boundary it's given; it has no visibility into what that function does internally.
**How to avoid:** Document this explicitly in the orchestrator's `--help` text and code comments — `--parallel N` means "N lines rendering concurrently, each of which may internally retry/rotate through several HTTP calls," not a hard HTTP-request-level cap. For true per-request throttling, a lower-level middleware would be needed, which is out of scope for Phase 3 (note as an Open Question if Shannon wants tighter quota control later).
**Warning signs:** 429 bursts that appear to exceed what `--parallel N` alone would suggest.

### Pitfall 8: vitest's `include` glob does not cover `scripts/` test files by default
**What goes wrong:** New tests placed at `scripts/__tests__/*.test.ts` (the natural location for orchestrator/preview-server tests, matching this repo's existing `scripts/` layout) will NOT be picked up by `npm test` / `npm run test:run` unless `vitest.config.ts`'s `include` array is extended. Current config: `include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"]` — no `scripts/` entry.
**Why it happens:** The existing test convention (Phase 1 D-11, carried into Phase 2) only anticipated `src/**/__tests__/` and `tests/**/`; Phase 3 is the first phase to need CLI-script-level unit tests at meaningful scale.
**How to avoid:** Add `"scripts/**/*.test.{ts,tsx}"` to `vitest.config.ts`'s `include` array as an early task in this phase (before any script test files are written, so CI/local `npm test` picks them up from the start rather than silently skipping them).
**Warning signs:** New `scripts/__tests__/*.test.ts` files exist, pass when run directly (`npx vitest run scripts/__tests__/bake-all.test.ts`), but don't appear in `npm test`'s overall file count.

## Code Examples

Verified/reference patterns (adapted from the prior implementation and this codebase's existing conventions):

### Pure duration-anomaly math (unit-testable, no I/O)
```typescript
// Adapted from the prior implementation's scripts/lib/bake-math.ts — pure
// functions, no fs/process/logging, safe to import from tests directly.
export interface DurationSample { durationMs: number; charCount: number; }

export function computeMedianSecPerChar(samples: DurationSample[]): number {
  if (samples.length === 0) return 0;
  const secPerChar = samples
    .filter((s) => s.charCount > 0)
    .map((s) => s.durationMs / 1000 / s.charCount)
    .sort((a, b) => a - b);
  if (secPerChar.length === 0) return 0;
  const mid = Math.floor(secPerChar.length / 2);
  return secPerChar.length % 2 === 0
    ? (secPerChar[mid - 1]! + secPerChar[mid]!) / 2
    : secPerChar[mid]!;
}

export function isDurationAnomaly(
  line: DurationSample,
  ritualMedian: number,
  thresholds: { min: number; max: number } = { min: 0.3, max: 3.0 },
): boolean {
  if (ritualMedian === 0 || line.charCount === 0) return false; // insufficient sample
  const ratio = (line.durationMs / 1000 / line.charCount) / ritualMedian;
  return ratio > thresholds.max || ratio < thresholds.min;
}
```

### Google Cloud TTS short-line call (verified shape from `test-google-line94.mjs`)
```typescript
// Source: this repo's own test-google-line94.mjs (Shannon's working experiment),
// confirmed shape. NOTE: no preamble/style — see Common Pitfalls #4.
async function googleTtsBakeCall(text: string, voice: string, apiKey: string): Promise<Buffer> {
  const res = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: "en-US", name: voice },
        audioConfig: { audioEncoding: "OGG_OPUS" },
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    // Redact the key from any echoed URL in error text before logging/throwing.
    throw new Error(`Google TTS ${res.status}: ${body.replace(/[?&]key=[^&"'\s]*/g, "?key=REDACTED").slice(0, 300)}`);
  }
  const json = await res.json();
  return Buffer.from(json.audioContent, "base64"); // already OGG_OPUS — no ffmpeg re-encode needed
}
```

### Word-level diff for `--verify-audio` STT round-trip
```typescript
// Case-insensitive, whitespace-normalized set diff. Absorbs Whisper's normal
// capitalization/spacing noise without flagging it; real drops/hallucinations
// surface as array entries.
export function wordDiff(expected: string, actual: string): { missed: string[]; inserted: string[] } {
  const norm = (s: string) => s.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const expWords = norm(expected);
  const actWords = norm(actual);
  const actSet = new Set(actWords);
  const expSet = new Set(expWords);
  return {
    missed: expWords.filter((w) => !actSet.has(w)),
    inserted: actWords.filter((w) => !expSet.has(w)),
  };
}
```

### ffprobe duration extraction (avoids a new npm dependency for the Gemini/WAV-derived path)
```typescript
// Duration for Gemini-rendered lines can be computed for FREE at render time
// from the PCM sample count already available in consumeSseToWav() —
// no decode-after-the-fact needed:
//   durationMs = Math.round((pcm.length / (bitsPerSample/8) / channels) / sampleRate * 1000)
// For the Google Cloud TTS short-line path (which returns OGG_OPUS directly,
// no WAV intermediate), decode after the fact via ffprobe (already a hard dep):
import { execFileSync } from "node:child_process";
function getOpusDurationMs(opusBuffer: Buffer): number {
  const tmp = `/tmp/probe-${Date.now()}.opus`;
  fs.writeFileSync(tmp, opusBuffer);
  try {
    const out = execFileSync("ffprobe", [
      "-v", "error", "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1", tmp,
    ], { encoding: "utf-8" });
    return Math.round(parseFloat(out.trim()) * 1000);
  } finally {
    fs.unlinkSync(tmp);
  }
}
```

### Consolidated `idb-schema.ts` (AUTHOR-10)
```typescript
// src/lib/idb-schema.ts — single onupgradeneeded, imported by both
// storage.ts and voice-storage.ts. Purely additive relative to current
// DB_VERSION=4 (documents, sections, settings, voices, audioCache) —
// bump to 5 to add the empty feedbackTraces store shell for Phase 5.
export const DB_NAME = "masonic-ritual-mentor";
export const DB_VERSION = 5;

export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("documents")) db.createObjectStore("documents", { keyPath: "id" });
      if (!db.objectStoreNames.contains("sections")) {
        const s = db.createObjectStore("sections", { keyPath: "id" });
        s.createIndex("documentId", "documentId", { unique: false });
        s.createIndex("degree", "degree", { unique: false });
      }
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "key" });
      if (!db.objectStoreNames.contains("voices")) db.createObjectStore("voices", { keyPath: "id" });
      if (!db.objectStoreNames.contains("audioCache")) db.createObjectStore("audioCache", { keyPath: "id" });
      // v5: feedbackTraces shell — Phase 5 COACH-06 is the first writer/reader.
      if (!db.objectStoreNames.contains("feedbackTraces")) {
        const f = db.createObjectStore("feedbackTraces", { keyPath: "id" });
        f.createIndex("documentId", "documentId", { unique: false });
        f.createIndex("timestamp", "timestamp", { unique: false });
        f.createIndex("variantId", "variantId", { unique: false });
      }
    };
  });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Hard-skip lines <11 chars to runtime TTS (current `main`) | Every line gets baked audio; short lines route through an alternate engine (D-01/D-02) | This phase | Removes the last runtime-TTS dependency for a first rehearsal; makes Phase 4 CONTENT-06 hold by construction |
| Cache at `~/.cache/masonic-mram-audio/`, no modelId in key, delete-on-fallback | Cache at `rituals/_bake-cache/`, modelId in key, keep-and-upgrade (D-06/D-07/D-08) | This phase | Repo-portable cache, honest per-tier provenance, no wasted fallback-tier work |
| `--since <git-ref>` via `git diff` on gitignored paths (prior branch, confirmed broken) | Content-hash manifest for change detection | This phase (superseding the abandoned branch's approach) | The flag actually works against real dialogue files |

**Deprecated/outdated:** The abandoned `gsd/phase-3-authoring-throughput` branch's `--since` implementation and its non-provenance-preserving cache migration are both superseded by today's CONTEXT.md decisions; do not port either pattern forward even though the branch is otherwise a strong reference.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | The 475 live cache entries were all rendered by `gemini-3.1-flash-tts-preview` (justifying D-07's zero-cost provenance-assumption migration) | Prior Implementation / Common Pitfalls #2 | If some surviving entries were actually rendered on a fallback tier before the current `handleAbort` deletion logic existed (i.e., predate PR #66/#72), the migration would mislabel them as premium-tier. Mitigation: the migration script should log a sanity-check count and Shannon should spot-check a few migrated entries by ear. |
| A2 | `music-metadata` vs `ffprobe` tradeoff recommendation (prefer ffprobe to avoid a new dependency) is a reasonable engineering call, not a hard requirement | Standard Stack / Alternatives Considered | Low risk either way — both are legitimate, slopcheck-clean options; this is a stylistic recommendation, not a correctness issue |
| A3 | Renaming/repurposing the `--since <git-ref>` flag semantics to `--since` (content-hash manifest, not actually git-relative) is acceptable without a flag-name change | Architecture Patterns, Pattern 3 | If Shannon strongly associates `--since` with git semantics, a confusing UX could result; CONTEXT.md explicitly delegates this naming choice to Claude, so this is within discretion, not a violation |

**If this table is empty:** N/A — see entries above; all are LOW-to-MEDIUM risk with documented mitigations, none block planning.

## Open Questions (RESOLVED)

1. **Should the planner attempt a git rebase/cherry-pick of the abandoned branch, or reimplement fresh using it as reference?**
   - RESOLVED: Fresh files written from `git show 58eb551:<path>` references — no checkout/cherry-pick/merge. Recorded across all 8 plans; the two confirmed-broken patterns (`--since` git-diff, provenance-discarding migration) are explicitly marked do-not-port in 03-02 and 03-06.
   - What we know: The abandoned branch's core logic (validators, resume-state atomic writes, preview-server path-containment, idb-schema consolidation) is sound and 517-test-verified. Its `--since` and cache-migration logic are confirmed wrong/suboptimal relative to today's CONTEXT.md.
   - What's unclear: Whether a partial rebase (taking most files, rewriting two) is faster/safer than a fresh implementation informed by the reference, given main has only drifted 8 commits (low conflict risk) but some of that drift touches the same files (`src/app/upload/page.tsx`, `src/components/DocumentUpload.tsx` — unrelated Phase 3 changes vs. new upload/zip-import feature on main).
   - Recommendation: Planner's call. A cherry-pick-then-fix-two-files approach could save substantial time; a fresh build using the old branch purely as line-by-line reference (via `git show`) avoids merge-conflict risk entirely. Given this is a solo-author low-stakes-timeline project, either is viable — recommend the planner explicitly decide and record the choice, since it materially affects task breakdown either way.

2. **Should the D-03 provisional STT-round-trip-on-short-lines validation gate be confirmed or downgraded to duration-only before planning locks tasks?**
   - What we know: CONTEXT.md flags D-03 as provisional (user was AFK for that specific question) and explicitly invites downgrading to duration-only at plan review.
   - What's unclear: Whether Shannon has since confirmed a preference.
   - Recommendation: Surface this explicitly in plan review rather than silently defaulting either way.
   - RESOLVED: 03-08 implements D-03 as specified (short-line STT verification default-on) with a documented `--no-short-line-stt` downgrade flag; surfaced for Shannon's confirmation in the 03-08 SUMMARY at plan review.

3. **Does the `.gitignore` gap (Pitfall 1: `.opus`, `.mram.backup-*`, `.zip` not actually ignored) need a task in THIS phase, or is it adjacent cleanup Shannon should handle separately?**
   - What we know: AUTHOR-01/D-06 explicitly calls out verifying `.opus` coverage as in-scope ("verify .opus is covered and extend if needed"). The `.mram.backup-*` and `.zip` gaps are adjacent findings, not literally requested.
   - What's unclear: Whether fixing the adjacent gaps is worth a few minutes of scope creep given Shannon's stated preference (Deferred Ideas) that `.mram.backup-*` cleanup is a "nicety... not a requirement."
   - Recommendation: Fix the `.opus` gap (in-scope). Flag the `.mram.backup-*`/`.zip` gaps to Shannon as a one-line "found this while in the area" note rather than silently ignoring or silently fixing without mention — these are a light-but-real risk of accidentally committing plaintext-adjacent binary content.
   - RESOLVED: 03-01 Task 1 fixes the `.opus` gap in-scope; the `.mram.backup-*`/`.zip` gaps are flag-only in the 03-01 SUMMARY per CONTEXT.md Deferred Ideas.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|----------|
| Node.js | All scripts | Yes | 20.20.0 | — |
| npm | Package install | Yes | 10.8.2 | — |
| git | (not used for `--since` per this research's recommendation) | Yes | 2.43.0 | — |
| ffmpeg | Existing WAV→Opus encode | Yes | 6.1.1 | — |
| ffprobe | Recommended for AUTHOR-06 duration extraction | Yes | 6.1.1 (same suite as ffmpeg) | `music-metadata` npm package |
| `GOOGLE_CLOUD_TTS_API_KEY` env | AUTHOR-04 short-line fallback | Yes (present in `.env`) | — | — |
| `GROQ_API_KEY` env | AUTHOR-07 `--verify-audio` | Yes (present in `.env`) | — | — |
| `GOOGLE_GEMINI_API_KEY` / `GOOGLE_GEMINI_API_KEYS` env | Core Gemini bake path (pre-existing requirement, not new to this phase) | **No — absent from this dev machine's `.env`** | — | None — this blocks any actual `--with-audio` bake run on this machine until Shannon adds a key. Does not block writing/testing the code (unit tests mock the API), but blocks a real end-to-end smoke test. |

**Missing dependencies with no fallback:**
- `GOOGLE_GEMINI_API_KEY`/`GOOGLE_GEMINI_API_KEYS` — required for any real bake; not required for implementing/unit-testing the phase's code, but the human-verification items (mirroring the prior branch's 3 deferred `human_needed` items: single-line rebake timing, multi-ritual throughput, preview-server UX) cannot be exercised without it. Flag this explicitly at plan-review time so Shannon knows to add the key before attempting end-to-end UAT.

**Missing dependencies with fallback:**
- `ffprobe`/`music-metadata` — both available; either satisfies AUTHOR-06's duration-extraction need.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.2 (already in use) |
| Config file | `vitest.config.ts` — **requires editing** to add `"scripts/**/*.test.{ts,tsx}"` to `include` (Common Pitfalls #8) |
| Quick run command | `npx vitest run scripts/__tests__/<file>.test.ts` or `src/lib/__tests__/<file>.test.ts` |
| Full suite command | `npm run test:run` (after `vitest.config.ts` is updated) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|-------------|
| AUTHOR-01 | Cache key includes modelId; migration is idempotent + provenance-preserving | unit | `npx vitest run scripts/__tests__/render-gemini-audio-cache.test.ts` | Wave 0 (new file; reference implementation exists on abandoned branch to adapt) |
| AUTHOR-02 | `--since` correctly detects changed rituals via content-hash (not git); `--resume` skips completed lines; `--dry-run` makes zero API calls | unit | `npx vitest run scripts/__tests__/bake-all.test.ts` | Wave 0 (new file) |
| AUTHOR-03 | `DEFAULT_MODELS[0]` is `gemini-3.1-flash-tts-preview` | unit (regression guard) | `npx vitest run scripts/__tests__/render-gemini-audio-cache.test.ts` | Wave 0 (can co-locate with AUTHOR-01 tests) |
| AUTHOR-04 | Short lines never silently drop; Google TTS call carries no preamble | unit | `npx vitest run scripts/__tests__/bake-helpers.test.ts` (or a dedicated short-line test file) | Wave 0 (new file) |
| AUTHOR-05 | Validator hard-fails on speaker/action/ratio mismatch | unit | `npx vitest run src/lib/__tests__/author-validation.test.ts` | Wave 0 (extend existing test file if present, else new) |
| AUTHOR-06 | `computeMedianSecPerChar`/`isDurationAnomaly` correctness, including the first-30-lines skip window | unit | `npx vitest run scripts/__tests__/bake-math.test.ts` | Wave 0 (new file) |
| AUTHOR-07 | `wordDiff` correctness (case-insensitive, whitespace-normalized) | unit | same as AUTHOR-06 test file (`bake-math.test.ts`) | Wave 0 |
| AUTHOR-08 | Loopback-only enforcement, path-traversal/symlink-escape refusal, Range request correctness | unit | `npx vitest run scripts/__tests__/preview-bake.test.ts` | Wave 0 (new file; strong reference implementation on abandoned branch, 20 tests) |
| AUTHOR-09 | `clampParallel` boundary behavior `[1,16]` default 4 | unit | co-locate with `bake-all.test.ts` | Wave 0 |
| AUTHOR-10 | Dual-open invariant (either module opens DB first, all 6 stores exist); v4→v5 migration preserves existing data | unit | `npx vitest run src/lib/__tests__/idb-schema.test.ts` | Wave 0 (new file; needs `fake-indexeddb`) |

### Sampling Rate
- **Per task commit:** targeted `npx vitest run <file>` for the file(s) touched
- **Per wave merge:** `npm run test:run` (full suite, after `vitest.config.ts` include fix)
- **Phase gate:** Full suite green before `/gsd:verify-work`; the three end-to-end human-verification items (single-line rebake timing, multi-ritual throughput, preview-server audio UX) require a real Gemini key and are appropriately deferred to human UAT, matching the prior implementation's own verification report's disposition

### Wave 0 Gaps
- [ ] `vitest.config.ts` — add `scripts/**/*.test.{ts,tsx}` to `include` (must land before any `scripts/__tests__/*.test.ts` file is trusted to run in CI/local `npm test`)
- [ ] `scripts/__tests__/bake-all.test.ts` — orchestrator flag parsing, content-hash change detection, resume, dry-run
- [ ] `scripts/__tests__/render-gemini-audio-cache.test.ts` — cache key shape, modelId sensitivity, migration idempotency/provenance
- [ ] `scripts/__tests__/bake-math.test.ts` — median/anomaly/word-diff pure functions
- [ ] `scripts/__tests__/preview-bake.test.ts` — loopback enforcement, path-containment, Range handling
- [ ] `src/lib/__tests__/idb-schema.test.ts` — dual-open invariant, v4→v5 migration preservation (needs `fake-indexeddb` installed first)
- [ ] `src/lib/__tests__/author-validation.test.ts` — extend if exists, else new; hard-fail severity gate

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|--------------------|
| V2 Authentication | No | This phase adds no authenticated surfaces; preview-bake.ts is unauthenticated-by-network-restriction (loopback-only), not by credential |
| V3 Session Management | No | No sessions introduced |
| V4 Access Control | Yes | `preview-bake.ts` loopback-only bind + `NODE_ENV!==production` refusal (reuse existing `/api/author/_guard.ts` pattern, extract as shared `dev-guard.ts`) |
| V5 Input Validation | Yes | Cache-key URL parameter on `preview-bake.ts` must be strictly validated (`^[0-9a-f]{64}$`) before any filesystem path construction — path-traversal / symlink-escape prevention |
| V6 Cryptography | No new surface — this phase does not touch the AES-256-GCM/.mram encryption path; cache entries are unencrypted Opus bytes at rest locally (same as current `main` behavior, not a regression) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|------------------------|
| Path traversal via cache-key URL parameter | Tampering / Information Disclosure | Strict regex validation + `path.resolve()` containment + `fs.realpathSync()` containment (defends against symlink-escape specifically) — see Common Pitfalls #6, pattern already implemented and test-verified in the prior branch, safe to port |
| Dev-only tool reachable in production | Information Disclosure | `NODE_ENV === "production"` refusal at module load, before the server even binds a port; loopback-only bind (`127.0.0.1`, refuse `0.0.0.0` even if explicitly requested via env override) |
| API key leaked in error messages | Information Disclosure | Redact `?key=...` query-string values from any error text before logging/throwing (already the pattern used elsewhere in this codebase's Gemini error handling; apply identically to the new Google Cloud TTS call site) |
| Cache poisoning via crafted filename | Tampering | Cache keys are always sha256 hex — never derived from or containing user-controllable path segments; the `CACHE_KEY_REGEX` validation on the preview server's read path is the relevant control here, not a write-side concern since only the bake scripts (not network input) ever write cache entries |
| Shell-injection via spawn args | Tampering | Orchestrator spawns `build-mram-from-dialogue.ts` per ritual — pass arguments as a `string[]` to `child_process.spawn`, never interpolate into a shell string; ritual slugs are derived from a regex-validated filename pattern, so they cannot contain shell metacharacters by construction |

## Project Constraints (from CLAUDE.md)

This project's `CLAUDE.md` is primarily about gstack skill routing (use `/browse` for web browsing, invoke skills like `/ship`, `/review`, `/investigate` for their respective workflows) and does not impose coding-style or architectural constraints specific to backend/CLI script work. No directive in either the global (`~/.claude/CLAUDE.md`, about the unrelated `dotfiles-claude` repo) or project-level `CLAUDE.md` conflicts with or constrains any recommendation in this research. The one actionable note: if any part of Phase 3 execution needs to verify current documentation/API behavior via the web (e.g., re-confirming Gemini TTS model IDs haven't rotated again), use the `/browse` skill rather than other browsing tools, per this project's routing rule.

## Sources

### Primary (HIGH confidence — direct repo/tool verification in this session)
- This repo's working tree on `main`: `scripts/render-gemini-audio.ts`, `scripts/build-mram-from-dialogue.ts`, `src/lib/author-validation.ts`, `scripts/validate-rituals.ts`, `src/lib/storage.ts`, `src/lib/voice-storage.ts`, `src/lib/voice-cast.ts`, `src/lib/mram-format.ts`, `src/lib/dialogue-format.ts`, `src/lib/dialogue-to-mram.ts`, `src/lib/styles.ts`, `src/app/api/author/_guard.ts`, `src/app/api/transcribe/route.ts`, `docs/BAKE-WORKFLOW.md`, `test-google-line94.mjs`, `bake.log`, `.gitignore`, `package.json`, `vitest.config.ts`
- Orphaned branch `gsd/phase-3-authoring-throughput` (local + `origin`, SHA `58eb551`), full planning/execution/review/verification trail: `03-RESEARCH.md`, `03-{01..08}-SUMMARY.md`, `03-REVIEW.md`, `03-REVIEW-FIX.md`, `03-SECURITY.md`, `03-VERIFICATION.md`, `03-HUMAN-UAT.md`, and source files `scripts/bake-all.ts`, `scripts/preview-bake.ts`, `scripts/lib/bake-math.ts`, `src/lib/idb-schema.ts`
- `npm view p-limit version` → `7.3.0`; `npm view fake-indexeddb version` → `6.2.5`; `npm view music-metadata version` → `11.13.0`
- `slopcheck install p-limit fake-indexeddb music-metadata --ecosystem npm` → all `[OK]`
- Direct empirical test: `p-limit@7.3.0` imported and executed successfully via `npx tsx` inside this repo's script directory
- `command -v ffprobe` → `/usr/bin/ffprobe` (ffmpeg 6.1.1 suite, already present)
- `git check-ignore -v` tests against `.gitignore` for `.opus`, `.mram.backup-*`, `.zip`, nested `_sessions/*.json` paths — all confirmed NOT ignored
- `git diff --name-only <ref> -- <pathspec>` semantics against gitignored/untracked files — confirmed empty output by direct testing of the old branch's actual `getChangedRituals()` source against this repo's real `.gitignore`

### Secondary (MEDIUM confidence)
- User-local memory skills (`~/.claude/gsd-user-files-backup/skills/gemini-tts-*`, `deterministic-tts-bake-in-at-build-time`) — first-party project-specific incident writeups from prior sessions on this exact codebase, treated as high-value project history though not independently re-verified against Google's current docs in this session

### Tertiary (LOW confidence)
- None — every claim in this document is either directly verified against the repo/tooling in this session or explicitly tagged as an assumption in the Assumptions Log

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified via `npm view` + `slopcheck`, ESM/tsx compatibility empirically tested in this exact repo
- Architecture: HIGH — patterns drawn from a fully-executed, code-reviewed, security-audited prior implementation of this exact phase, cross-checked against current `main`'s actual code
- Pitfalls: HIGH — the most load-bearing pitfall (`--since` git-diff bug) is a confirmed defect found by direct source inspection + git semantics verification, not a hypothetical risk
- Prior-implementation recovery: HIGH — branch existence, commit history, divergence point, and file contents all directly verified via `git log`/`git show`/`git merge-base` in this session

**Research date:** 2026-07-01
**Valid until:** ~30 days (stable domain — Node/CLI tooling patterns and this repo's own architecture don't move fast; the one fast-moving risk is Gemini preview model ID rotation, already covered by the existing env-override mechanism and memory skill `gemini-tts-model-wide-outage-bypass`)
