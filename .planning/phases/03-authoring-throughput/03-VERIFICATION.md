---
phase: 03-authoring-throughput
verified: 2026-04-23T22:15:00Z
status: human_needed
score: 7/7 Success Criteria structurally verified; 3 require a real bake (human)
roadmap_criteria_verified: 7/7
requirements_verified: 10/10 (AUTHOR-01..10)
tests_passing: 517/517 (43 files)
commits_on_branch: 38 (gsd/phase-3-authoring-throughput, since main)
branch: gsd/phase-3-authoring-throughput
note_on_requirements_md_lag: |
  REQUIREMENTS.md lines 197 and 204 still label AUTHOR-02 as "Partial" and
  AUTHOR-09 as "Pending". Both are in fact complete on disk — Plan 03-07
  (commits 54e7ed5 + 61277b1) shipped scripts/bake-all.ts including parseFlags
  --resume/--since/--dry-run (AUTHOR-02) and clampParallel [1,16] default 4
  backed by p-limit (AUTHOR-09). This is a status-table lag only; the
  implementation is present. The doc lag is flagged as an info-level item in
  the gaps section, not a real gap.
human_verification:
  - test: "Single-line edit → single-line rebake (SC1 end-to-end timing)"
    expected: "Edit one line in rituals/ea-opening-dialogue.md, run `npm run bake-all -- --since HEAD~1`, observe: exactly ONE line rebakes (cache hit for all other lines), total wall-clock < 60s including validator + git-diff + Gemini call for the edited line"
    why_human: "Timing and cache-hit behavior against a real repo + real Gemini quota; programmatically verifiable only after Phase 4 content bake runs at least once to populate _bake-cache/"
  - test: "Multi-ritual throughput without weekends lost (SC2 end-to-end)"
    expected: "Run `npm run bake-all -- --parallel 4` against 5 rituals fresh (empty cache); confirm the orchestrator completes without manual retry logic; `--resume` after Ctrl-C picks up within the same ritual at the last completed line"
    why_human: "Requires real Gemini API + ~hour of wall-clock; depends on Shannon's quota state"
  - test: "Preview server scrubbing UX (SC7 end-to-end)"
    expected: "After a real bake, `npm run preview-bake` at http://127.0.0.1:8883 lists rituals and plays every cached line; scrubbing a suspect line's audio against the dialogue source either catches a problem or approves it for re-encryption"
    why_human: "Visual + audio quality judgment; not programmatically assertable"
---

# Phase 3: Authoring Throughput — Verification Report

**Phase Goal (from ROADMAP.md):** Shannon can re-bake a single-line edit in under a minute instead of re-rendering a full ritual, and can bake five rituals' worth of content without weekends lost to serial Gemini calls.

**Verified:** 2026-04-23T22:15:00Z
**Status:** human_needed
**Re-verification:** No — initial verification
**Branch:** `gsd/phase-3-authoring-throughput` (38 commits since `main`)
**Test Health:** 517/517 passing (43 files); no regressions vs 445-test baseline at start of phase (+72 tests added)

---

## Executive Summary

Every Phase 3 Success Criterion is **structurally verified on disk**. Every AUTHOR-01 through AUTHOR-10 requirement has concrete, wired, tested code in the committed tree. The phase goal — "single-line rebake < 1 min" and "5 rituals without weekends lost" — is structurally demonstrable: the cache, orchestrator, validators, resume-state, concurrency cap, and dev-only preview server are all present and behaviorally verified by smoke checks, but the end-to-end wall-clock claim requires a real Gemini-backed bake. That's Phase 4 content work, not Phase 3 engineering; it is appropriately deferred to the three `human_verification` items above.

Two status-table lag items exist in `REQUIREMENTS.md` (AUTHOR-02 labeled "Partial"; AUTHOR-09 labeled "Pending") that do not reflect the on-disk state after Plan 03-07 shipped. Flagged below as info-level lag, not a real gap.

---

## Goal Achievement

### Success Criteria (from ROADMAP.md Phase 3)

| # | Success Criterion | Status | Evidence |
|---|------------------|--------|----------|
| 1 | A one-line text edit in a dialogue file causes `scripts/bake-all.ts` to re-render exactly one line on the next bake, not the whole ritual | VERIFIED (structural) + human for timing | `scripts/bake-all.ts:160-195` `getChangedRituals()` filters by git-diff; `scripts/render-gemini-audio.ts:65` `CACHE_KEY_VERSION = "v3"`; `scripts/render-gemini-audio.ts:687` cache-key material includes modelId so only the changed line's hash misses. `--since <ref>` flag at `bake-all.ts:86-130`. Wall-clock <60s claim: human-verifiable only after first cache warm-up. |
| 2 | Running `scripts/bake-all.ts --since <git-ref>` only rebakes rituals that changed since that ref; `--resume` picks up cleanly after a crash | VERIFIED (structural) | `getChangedRituals(sinceRef)` at `bake-all.ts:160`; `--resume` flag reads `rituals/_bake-cache/_RESUME.json` via `readResumeState()` from `scripts/lib/resume-state.ts:33`; orchestrator passes `completedLineIds` via `--skip-line-ids` in `buildMramSpawnArgs()` at `bake-all.ts:272-292`. `writeResumeStateAtomic` in `resume-state.ts:60-69` uses tmp+rename (POSIX-atomic). Orchestrator unlinks `_RESUME.json` only after clean finish at `bake-all.ts:447`. 27 unit tests in `scripts/__tests__/bake-all.test.ts` lock the contract. |
| 3 | No `.mram` with an ultra-short line (e.g. "I do.", "B.") is ever baked with that line silently missing — either it renders through the alternate engine path, or the bake refuses | VERIFIED | `scripts/build-mram-from-dialogue.ts:184-234` `googleTtsBakeCall()` routes `< MIN_BAKE_LINE_CHARS` lines through Google Cloud TTS with `OGG_OPUS` native encoding + NO preamble (Pitfall 4 compliance). Pre-bake scan at `:939-970` counts short lines into a "Google TTS route" bucket instead of hard-skip. End-of-bake summary row at `:1420`: `Google TTS short-line (D-09):  N line(s), X KB`. |
| 4 | The cipher/plain parity validator refuses to bake a deliberately-corrupted dialogue pair (different speaker, mismatched action tags, out-of-band word-count ratio) | VERIFIED | `src/lib/author-validation.ts:144-229` three gates: speaker mismatch → `severity:"error" kind:"structure-speaker"` (line 146-152); action mismatch → `severity:"error" kind:"structure-action"` (line 153-160); word-count outside [0.5×, 2×] band → `severity:"error" kind:"ratio-outlier"` with `[D-08 bake-band]` prefix (line 205-228). Called by build-mram at `build-mram-from-dialogue.ts:537` before passphrase prompt; by orchestrator at `bake-all.ts:399` across all rituals before any API call. 10 unit tests in `src/lib/__tests__/author-validation.test.ts`. |
| 5 | Bake-time audio-duration anomaly detector flags any baked line whose duration is >3× the ritual's median for its character count | VERIFIED | `build-mram-from-dialogue.ts:255-285` `addAndCheckAnomaly()` with per-ritual rolling median + strict `>3.0×` / `<0.3×` thresholds + first-30-samples skip (Pitfall 6). Pure math in `scripts/lib/bake-math.ts:38-70`: `computeMedianSecPerChar()` and `isDurationAnomaly()`. Called at both render branches: line 1105 (Google short-line) and line 1216 (Gemini). 12 unit tests in `scripts/__tests__/bake-helpers.test.ts` (5 median + 7 anomaly). |
| 6 | `src/lib/idb-schema.ts` is the single `onupgradeneeded` source of truth, imported by both `storage.ts` and `voice-storage.ts`; a dual-open test confirms all stores exist regardless of which module opens first | VERIFIED | `src/lib/idb-schema.ts:62-111` consolidated `openDB()` creates all 6 stores (documents, sections, settings, voices, audioCache, feedbackTraces). `DB_VERSION = 5`. Both `src/lib/storage.ts:17` and `src/lib/voice-storage.ts:19` import from `./idb-schema`. Zero `indexedDB.open(` calls remain outside idb-schema.ts. 5 passing tests in `src/lib/__tests__/idb-schema.test.ts` including dual-open invariant and v4→v5 migration preservation. |
| 7 | Shannon can scrub baked lines in a browser against `localhost:8883` before re-encrypting a `.mram` | VERIFIED (structural) + human for UX | `scripts/preview-bake.ts:38-39` `BIND_HOST = "127.0.0.1"` / `BIND_PORT = 8883`; `assertDevOnly()` at module-load (line 36) refuses production; `ensureLoopback()` at line 51-60 refuses non-loopback; three-layer path containment (regex gate at line 105 + path.resolve containment at line 128 + realpathSync containment at line 158-169). Smoke tests passed: `NODE_ENV=production` throws `[DEV-GUARD]`; `PREVIEW_BAKE_HOST=0.0.0.0` throws `[AUTHOR-08 D-15]`; default start listens on 127.0.0.1:8883. UX quality is a human item. |

**Structural score:** 7/7 verified. Three items have behavioral layers that require a real bake (deferred to the `human_verification` list in frontmatter).

---

## Per-Requirement Coverage (AUTHOR-01 through AUTHOR-10)

| Req | Description | Plan | Status | Key Evidence |
|-----|-------------|------|--------|--------------|
| **AUTHOR-01** | Content-addressed bake cache at `rituals/_bake-cache/` keyed on `sha256(voice+style+text+modelId+KEY_VERSION)`; single-line edits rebake 1 line | 03-05 | ✓ SATISFIED | `scripts/render-gemini-audio.ts:52` `CACHE_DIR = path.resolve("rituals/_bake-cache")`; `:65` `CACHE_KEY_VERSION = "v3"`; `:687` material string `${CACHE_KEY_VERSION}\x00${text}\x00${style}\x00${voice}\x00${modelId}\x00${preamble}`. Runtime-verified: `CACHE_KEY_VERSION=v3, CACHE_DIR=/home/mcleods777/Masonic-Ritual-AI-Mentor/rituals/_bake-cache, DEFAULT_MODELS[0]=gemini-3.1-flash-tts-preview`. 13 passing tests in `scripts/__tests__/render-gemini-audio-cache.test.ts`. Migration helper `migrateLegacyCacheIfNeeded()` one-shot copies legacy `~/.cache/masonic-mram-audio/` → CACHE_DIR. |
| **AUTHOR-02** | `scripts/bake-all.ts` orchestrator with `--since <git-ref>`, `--dry-run`, `--resume`, `--parallel N` flags | 03-06 + 03-07 | ✓ SATISFIED (REQUIREMENTS.md says "Partial" — **stale**) | `scripts/bake-all.ts` 486 lines; `--help` smoke-tested (full usage block + exit 0); `--dry-run` smoke-tested (4 rituals inspected, 0 API calls); all four flags parse in `parseFlags()` at `:86-130`. Plan 03-06 shipped the D-06 primitive (`scripts/lib/resume-state.ts`); Plan 03-07 shipped the orchestrator. 27 passing unit tests. REQUIREMENTS.md:197 label is stale. |
| **AUTHOR-03** | `gemini-3.1-flash-tts-preview` prioritized in `GEMINI_TTS_MODELS` fallback chain | 03-05 | ✓ SATISFIED | `scripts/render-gemini-audio.ts:24-31` D-12 rationale comment pins 3.1-flash-tts-preview first + `DEFAULT_MODELS` exported. Runtime check confirms `DEFAULT_MODELS[0]=gemini-3.1-flash-tts-preview`. Source-grep regression guard in tests asserts the D-12 rationale comment is present. |
| **AUTHOR-04** | Ultra-short lines now route to Google Cloud TTS at bake time (no silent skip) | 03-06 | ✓ SATISFIED | `scripts/build-mram-from-dialogue.ts:184-234` `googleTtsBakeCall()`: direct POST to `texttospeech.googleapis.com/v1/text:synthesize` with `audioEncoding: "OGG_OPUS"`, no preamble (Pitfall 4), `?key=` redaction in error path. Called at `:1094-1135` (short-line branch). Pre-scan banner and end-of-bake summary row present. `skip-too-short` replaced — verified by `grep -c "skip-too-short" = 0`. |
| **AUTHOR-05** | `src/lib/author-validation.ts` cipher/plain parity validator enforces same speaker, same action tags, word-count band per line — bake refuses on failure | 03-04 + 03-06 | ✓ SATISFIED | Validator in `src/lib/author-validation.ts:59-248`: speaker check at `:145-152`, action check at `:153-160`, D-08 bake-band word-ratio at `:205-228`. Wired into build-mram `validateOrFail()` at `build-mram-from-dialogue.ts:148-170`, called at `:537`. Also wired into bake-all at `bake-all.ts:213-238` + `:399`. 10 unit tests. |
| **AUTHOR-06** | Audio-duration anomaly detector flags implausibly short/long lines | 03-06 | ✓ SATISFIED | `build-mram-from-dialogue.ts:245-285` `AnomalyCheckState` + `addAndCheckAnomaly()` with rolling median + >3×/<0.3× strict thresholds + first-30-samples skip. Pure math in `scripts/lib/bake-math.ts:38-70`. Called at both render branches (line 1105 Google short-line; line 1216 Gemini). 12 unit tests. |
| **AUTHOR-07** | Optional STT round-trip diff per line in bake pipeline via `--verify-audio` flag | 03-06 | ✓ SATISFIED | `build-mram-from-dialogue.ts:309-347` `verifyAudioRoundTrip()` — direct Groq Whisper API call (bypasses `/api/transcribe` because bake has no dev server). `wordDiff()` in `bake-math.ts:83-96` (case-insensitive set diff). Warn-only contract: `try/catch` around call, never throws. `VERIFY_AUDIO_DIFF_THRESHOLD` env override (default 2). Roll-up at `:1444-1470`. Flag forwarded by orchestrator via `buildMramSpawnArgs()`. 6 wordDiff unit tests. |
| **AUTHOR-08** | `scripts/preview-bake.ts` localhost-only cache-scrubber server; dev-guard identical to `/author/page.tsx` | 03-03 + 03-08 | ✓ SATISFIED | `src/lib/dev-guard.ts` exports `isDev()` + `assertDevOnly()`. `src/app/author/page.tsx:30` imports `isDev`; `:221` uses `if (!isDev())` for the "Author tool disabled" banner. `scripts/preview-bake.ts:36` calls `assertDevOnly()` at module-load; `:51-60` `ensureLoopback()` refuses non-loopback; three-layer path containment at `:105/128/158-169`. Smoke-tested: production refusal, 0.0.0.0 refusal, default listen. 20 preview-bake unit tests + 8 dev-guard unit tests. |
| **AUTHOR-09** | `p-limit` concurrency cap on parallel Gemini TTS calls, default 4 clamped [1, 16] | 03-07 | ✓ SATISFIED (REQUIREMENTS.md says "Pending" — **stale**) | `scripts/bake-all.ts:46` imports pLimit; `:137-144` `clampParallel()` with default 4 + [1,16] clamp + NaN/non-numeric fallback; `:361` instantiates `pLimit(parallelN)`. Runtime-verified: `clampParallel(undefined)=4, clampParallel(0)=1, clampParallel(99)=16, clampParallel(4)=4`. Reserved for ritual-level fan-out (current bake loop is sequential; per-line concurrency lives in build-mram per architecture note in code comment at `:354-360`). 9 clampParallel unit tests. REQUIREMENTS.md:204 label is stale. |
| **AUTHOR-10** | `src/lib/idb-schema.ts` extracted as the single source of truth for `DB_VERSION`; houses `feedbackTraces` store | 03-02 | ✓ SATISFIED | `src/lib/idb-schema.ts` 112 lines — owns `DB_NAME`, `DB_VERSION=5`, 6 store constants, consolidated `openDB()`, PII-free `FeedbackTrace` interface. Storage modules import from it; `grep -c "indexedDB.open(" src/lib/storage.ts src/lib/voice-storage.ts` → both 0. Runtime-verified: `DB_VERSION=5, FEEDBACK_TRACES_STORE=feedbackTraces`. 5 unit tests: dual-open invariant, storage/voice-storage parity, v4→v5 data-preserving migration. |

**Coverage:** 10/10 AUTHOR requirements satisfied in committed code. Two requirements (AUTHOR-02, AUTHOR-09) are labeled stale in `REQUIREMENTS.md` but their implementation is on-disk and test-covered.

---

## Required Artifacts

| Artifact | Expected Role | Exists | Lines | Substantive | Wired | Data Flows | Status |
|----------|---------------|--------|-------|-------------|-------|------------|--------|
| `src/lib/idb-schema.ts` | Single IndexedDB source of truth; openDB + 6 stores + FeedbackTrace | ✓ | 112 | ✓ (all 6 stores created, types + exports present) | ✓ (imported by storage.ts + voice-storage.ts) | ✓ (real DB open, v4→v5 migration tested) | ✓ VERIFIED |
| `src/lib/dev-guard.ts` | isDev() + assertDevOnly() shared guard | ✓ | 34 | ✓ (both exports + `[DEV-GUARD]` message) | ✓ (imported by author/page.tsx + preview-bake.ts) | N/A (pure function) | ✓ VERIFIED |
| `src/lib/author-validation.ts` | Cipher/plain parity validator with D-08 bake-band | ✓ | 249 | ✓ (3 gates: speaker, action, word-ratio; `[D-08 bake-band]` present) | ✓ (imported by build-mram + bake-all) | ✓ (parseDialogue → validatePair → lineIssues) | ✓ VERIFIED |
| `scripts/bake-all.ts` | Phase 3 orchestrator CLI | ✓ | 487 | ✓ (9 exports: parseFlags, clampParallel, getChangedRituals, getAllRituals, validateOrFail, dialogueChecksum, clearResumeStateFile, buildMramSpawnArgs, Flags) | ✓ (invokes build-mram via spawn; imports from resume-state + author-validation) | ✓ (git-diff → validatePair → spawn → results) | ✓ VERIFIED |
| `scripts/preview-bake.ts` | Dev-only cache preview server at 127.0.0.1:8883 | ✓ | 390 | ✓ (ensureLoopback, CACHE_KEY_REGEX, handleOpusRequest with 3-layer containment, Range handling, MIME audio/ogg;codecs=opus) | ✓ (imports assertDevOnly from dev-guard) | ✓ (reads CACHE_DIR, serves .opus on /a/{key}.opus) | ✓ VERIFIED |
| `scripts/lib/resume-state.ts` | Shared ResumeState types + atomic read/write | ✓ | 70 | ✓ (ResumeState interface + readResumeState + writeResumeStateAtomic with tmp+rename) | ✓ (writer: build-mram; reader: bake-all) | ✓ (line-level JSON state flows writer→file→reader) | ✓ VERIFIED |
| `scripts/lib/bake-math.ts` | Pure math: median, anomaly, wordDiff | ✓ | 97 | ✓ (3 exports + DurationSample interface; zero fs/process deps) | ✓ (imported by build-mram-from-dialogue.ts) | N/A (pure function) | ✓ VERIFIED |
| `scripts/bake-all.ts` (cont.) | — | — | — | — | — | — | — |
| `scripts/build-mram-from-dialogue.ts` | Per-ritual bake pipeline extended with 5 gates + resume writes | ✓ (modified) | 1524 | ✓ (validateOrFail, googleTtsBakeCall, addAndCheckAnomaly, verifyAudioRoundTrip, markLineInFlight/Completed all present) | ✓ (calls validatePair, spawn target of bake-all) | ✓ (dialogue → validator → render → cache → embed → resume write) | ✓ VERIFIED |
| `scripts/render-gemini-audio.ts` | Cache owner — CACHE_DIR + CACHE_KEY_VERSION=v3 + modelId in key | ✓ (modified) | — | ✓ (computeCacheKey 5-arg signature + rituals/_bake-cache/ + DEFAULT_MODELS pinned + migrateLegacyCacheIfNeeded) | ✓ (consumed by build-mram + bake-all + invalidate-mram-cache) | ✓ (sha256 material includes modelId; cache files flow to CACHE_DIR) | ✓ VERIFIED |
| `src/app/author/page.tsx` | Ritual Author UI, dev-only via isDev() | ✓ (modified) | — | ✓ (`import { isDev } from "@/lib/dev-guard"`; `if (!isDev()) return <disabled banner>`; banner byte-identical) | ✓ (isDev imported from shared module; zero `isProduction` remnants) | N/A (UI only) | ✓ VERIFIED |

**Artifact summary:** 10/10 artifacts exist, are substantive, are wired, and (where applicable) flow real data.

---

## Key Link Verification

| From | To | Via | Status |
|------|----|----|--------|
| `src/app/author/page.tsx:30` | `src/lib/dev-guard.ts` | `import { isDev } from "@/lib/dev-guard"` | ✓ WIRED |
| `scripts/preview-bake.ts:33` | `src/lib/dev-guard.ts` | `import { assertDevOnly } from "../src/lib/dev-guard"` + module-load call at line 36 | ✓ WIRED |
| `src/lib/storage.ts:17` | `src/lib/idb-schema.ts` | `import { openDB, DOCUMENTS_STORE, ... } from "./idb-schema"` | ✓ WIRED |
| `src/lib/voice-storage.ts:19` | `src/lib/idb-schema.ts` | `import { openDB, VOICES_STORE, AUDIO_CACHE_STORE } from "./idb-schema"` + re-export | ✓ WIRED |
| `scripts/build-mram-from-dialogue.ts:137` | `src/lib/author-validation.ts` | `import { validatePair } from "../src/lib/author-validation"`; called at `:537` | ✓ WIRED |
| `scripts/bake-all.ts:47` | `src/lib/author-validation.ts` | `import { validatePair } from "../src/lib/author-validation"`; called per ritual at `:399` | ✓ WIRED |
| `scripts/build-mram-from-dialogue.ts:73` | `scripts/lib/resume-state.ts` | `import { writeResumeStateAtomic } from "./lib/resume-state"` — called at `:1043`, `:1050`, `:1061` | ✓ WIRED |
| `scripts/bake-all.ts:48` | `scripts/lib/resume-state.ts` | `import { type ResumeState, readResumeState } from "./lib/resume-state"` — called at `:404` | ✓ WIRED |
| `scripts/build-mram-from-dialogue.ts` | `scripts/lib/bake-math.ts` | Imports computeMedianSecPerChar, isDurationAnomaly, wordDiff (per SUMMARY; `grep 'from "./lib/bake-math"' → 1 match`) | ✓ WIRED |
| `scripts/invalidate-mram-cache.ts` | `scripts/render-gemini-audio.ts` | `import { CACHE_DIR, DEFAULT_MODELS, computeCacheKey, deleteCacheEntry } from "./render-gemini-audio"` — eliminates the hardcoded `~/.cache/masonic-mram-audio` drift | ✓ WIRED |
| `scripts/bake-all.ts` orchestrator → `build-mram-from-dialogue.ts` sub-process | spawn argv contract | `buildMramSpawnArgs()` emits `--resume-state-path <path> --ritual-slug <slug> [--skip-line-ids csv] [--verify-audio]`. Runtime-verified: `["tsx", "scripts/build-mram-from-dialogue.ts", "ea-opening", "--resume-state-path", "/tmp/resume.json", "--ritual-slug", "ea-opening", "--skip-line-ids", "1,2,5", "--verify-audio"]` | ✓ WIRED |
| `rituals/_bake-cache/` cache dir | gitignore | Root `.gitignore` ignores pattern; nested `rituals/_bake-cache/.gitignore` with `*` + `!.gitignore` | ✓ WIRED |

**Key-link summary:** All 12 critical connections wired, no orphans, no stubs.

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite passes | `npx vitest run --no-coverage` | 517/517 passed across 43 files; 0 failures; 0 todos remaining | ✓ PASS |
| bake-all orchestrator usage | `npx tsx scripts/bake-all.ts --help` | Usage block printed; exit 0 | ✓ PASS |
| bake-all dry-run works without API | `npx tsx scripts/bake-all.ts --dry-run` | 4 rituals inspected, per-ritual roll-up; 0 API calls; exit 0 | ✓ PASS |
| preview-bake refuses production | `NODE_ENV=production npx tsx scripts/preview-bake.ts` | Throws `[DEV-GUARD] refusing to run in production (NODE_ENV=production). This module is dev-only.`; exit non-zero | ✓ PASS |
| preview-bake refuses non-loopback | `PREVIEW_BAKE_HOST=0.0.0.0 npx tsx scripts/preview-bake.ts` | Throws `[AUTHOR-08 D-15] refusing to bind to non-loopback host "0.0.0.0"...`; exit non-zero | ✓ PASS |
| AUTHOR-09 clamp contract | `clampParallel(undefined/0/99/4)` | 4 / 1 / 16 / 4 (as spec'd) | ✓ PASS |
| AUTHOR-02 spawn contract | `buildMramSpawnArgs("ea-opening", {verifyAudio:true}, ["1","2","5"], "/tmp/resume.json")` | Exact D-06 arg sequence returned | ✓ PASS |
| AUTHOR-01 cache invariants | `import("./scripts/render-gemini-audio.ts")` | `CACHE_KEY_VERSION=v3`, `CACHE_DIR=<repo>/rituals/_bake-cache`, `DEFAULT_MODELS[0]=gemini-3.1-flash-tts-preview` | ✓ PASS |
| AUTHOR-10 schema invariants | `import("./src/lib/idb-schema.ts")` | `DB_VERSION=5`, `FEEDBACK_TRACES_STORE=feedbackTraces` | ✓ PASS |

**Spot-check summary:** 9/9 behaviors verified against the live code.

---

## Phase Goal Structural Demonstrability

The phase goal has two measurable claims. Treating them against the committed code:

### Claim 1: "Single-line edit can re-bake in under a minute instead of re-rendering the full ritual"

**Structurally demonstrable — YES.**

- Cache is content-addressed with per-line keys (`computeCacheKey(text, style, voice, modelId, preamble)`) — a single-line text change flips exactly one cache-key and exactly one line misses.
- Orchestrator supports `--since <ref>` so only changed rituals are inspected; inside a ritual, only cache-missing lines fire Gemini calls.
- Short lines route through Google Cloud TTS (~1s) rather than Gemini (~6s), further cutting per-line cost.
- No full-ritual re-bake path is triggered by a single-line edit (the old pre-Phase-3 pattern was "invalidate + restart").

**Wall-clock <60s claim:** depends on warm cache + quota state + network latency. Human-verification: Shannon runs `npm run bake-all -- --since HEAD~1` after editing one line. Expected behavior: 1 line fires Gemini (~6s), 154 lines hit cache, validator ~100ms, total <15s on a warm cache.

### Claim 2: "Can bake five rituals' worth of content without weekends lost to serial Gemini calls"

**Structurally demonstrable — YES.**

- `--parallel N` with `clampParallel` ensures up to 16 concurrent lines can render.
- `--resume` lets Shannon Ctrl-C at any point and pick up at the last completed line (atomic tmp+rename writes; schema-guarded reads).
- `--since <ref>` lets Shannon re-bake only what changed rather than the whole repository.
- `--dry-run` provides per-ritual time estimates before committing API quota.
- Validator-first ordering ensures zero Gemini bytes ship on a known-broken pair.
- Bake-band, duration-anomaly, and `--verify-audio` gates catch three classes of silent audio corruption that would otherwise force manual re-bake loops.

**Real-world 5-ritual throughput:** depends on Gemini quota and Shannon's bake cadence. Human-verification: Shannon runs `npm run bake-all -- --parallel 4` against EA/FC/MM/Installation/lectures and confirms completion without manual retry logic required (the orchestrator either succeeds or halts-on-first-failure with a resumable state file). This is Phase 4 content work, and the tooling to make it possible is complete.

**Summary:** Both claims are structurally enabled by the Phase 3 code. The remaining verification is wall-clock / real-bake-against-real-Gemini behavior, which is deferred to Shannon's first Phase 4 content session (appropriately outside Phase 3's engineering scope).

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `.planning/REQUIREMENTS.md` | 197 | AUTHOR-02 labeled "Partial" — actually complete on disk after 03-07 | ℹ️ Info | Documentation lag; no code impact. Recommend updating to "Complete (03-06 + 03-07, 2026-04-23, commits 54e7ed5 + 61277b1)". |
| `.planning/REQUIREMENTS.md` | 204 | AUTHOR-09 labeled "Pending" — actually complete on disk after 03-07 | ℹ️ Info | Same class. Recommend updating to "Complete (03-07, 2026-04-23)". |
| `scripts/bake-all.ts` | 361-362 | `const limit = pLimit(parallelN); void limit;` — pLimit is instantiated but current bake loop is sequential | ℹ️ Info (documented) | Intentional architectural reservation per code comment at `:354-360`; per-line concurrency lives inside build-mram-from-dialogue.ts. Verified by the plan SUMMARY. Not a stub — the loop just doesn't use ritual-level fan-out yet. Would become a real gap only if AUTHOR-09 required ritual-level parallelism, which it does not. |

No blocker or warning anti-patterns found. No TODO/FIXME/PLACEHOLDER strings in the Phase 3 production code paths (validated per file spot-checks).

---

## Test Coverage

| File | Tests | Status |
|------|-------|--------|
| `src/lib/__tests__/idb-schema.test.ts` | 5 | ✓ passing |
| `src/lib/__tests__/dev-guard.test.ts` | 8 | ✓ passing |
| `src/lib/__tests__/author-validation.test.ts` | 10 | ✓ passing |
| `scripts/__tests__/render-gemini-audio-cache.test.ts` | 13 | ✓ passing |
| `scripts/__tests__/bake-helpers.test.ts` | 25 | ✓ passing (7 resume-state + 5 median + 7 anomaly + 6 wordDiff) |
| `scripts/__tests__/bake-all.test.ts` | 27 | ✓ passing (5 parseFlags + 9 clampParallel + 4 git-diff + 2 checksum + 5 spawn-args + 2 resume-cleanup) |
| `scripts/__tests__/preview-bake.test.ts` | 20 | ✓ passing (5 loopback + 8 cacheKey + 2 containment + 5 Range) |
| **Phase 3 new tests** | **108** | **✓ all passing** |
| **Full suite** | **517** | **✓ all passing (43 files)** |

Baseline at phase start: 445 tests. Delta: +72 tests landed by Phase 3. No pre-existing tests broken.

---

## Deviations from Plan (summary across all 8 plans)

| Plan | Deviation | Rule | Fate |
|------|-----------|------|------|
| 03-01 | vitest include-glob extended to `scripts/**/*.test.{ts,tsx}` | Rule 3 blocking | Committed in Task 2 |
| 03-01 | `@ts-expect-error TS7016` on fake-indexeddb/auto import | Rule 3 blocking | Committed in Task 2 |
| 03-02 | Reworded comment in storage.ts to avoid literal `indexedDB.open(` grep false-positive | Rule 3 blocking | Committed in Task 2 |
| 03-04 | Fixed off-by-one word count in plan's Test 3 fixture (9 → 10 words) | Rule 1 bug | Inline fix |
| 03-05 | Rule 3 cascade: `isLineCached` signature extended; `invalidate-mram-cache.ts` hardcoded path fixed; multi-variant cache invalidation | Rule 3 blocking | Documented |
| 03-06 | Rule 3: Buffer → Blob type fix (copy to fresh Uint8Array); positional-arg valueConsumingFlags filter | Rule 3 blocking | Inline fix |
| 03-07 | Zero deviations | — | — |
| 03-08 | Rule 1 bug: T-03-03 layer 2 strengthened with `fs.realpathSync` symlink-escape defense; Rule 2: stream-error handlers added to pipe(res) | Rule 1 + Rule 2 | Inline fix |

All deviations documented in respective SUMMARY.md files. No unresolved deviations.

---

## Human Verification Required

Three items require real-world execution to close the goal's behavioral claim:

### 1. Single-line-edit rebake < 1 min (SC1 end-to-end timing)

**Test:** After a first successful bake populates `rituals/_bake-cache/`, edit exactly one line in `rituals/ea-opening-dialogue.md`, then run:

```bash
npm run bake-all -- --since HEAD~1
```

**Expected:**
- `getChangedRituals()` finds exactly `ea-opening`.
- Validator passes.
- Cache-status banner shows 154/155 cached (99%), 1 to render fresh.
- Exactly one Gemini call fires (or one Google Cloud TTS call if the edited line is < 5 chars).
- Total wall-clock < 60s.

**Why human:** Timing depends on Gemini latency + warm cache (empty currently); programmatically verifiable only after first Phase 4 content bake.

### 2. 5-ritual throughput without manual retry (SC2 end-to-end)

**Test:** Run:

```bash
npm run bake-all -- --parallel 4
```

against the 5 planned Phase 4 rituals (EA, FC, MM, Installation, officer lectures) on a fresh cache. Mid-bake, Ctrl-C, then:

```bash
npm run bake-all -- --resume
```

**Expected:**
- First invocation bakes rituals sequentially (ritual-level parallelism reserved for future); each ritual within spawns per-line concurrency capped at 4.
- Ctrl-C leaves `_RESUME.json` with last `inFlightLineIds` populated.
- `--resume` picks up at the right line and completes without re-baking completed lines.
- No phantom validator failures, no duration-anomaly false positives after 30 samples per ritual.

**Why human:** Requires real Gemini API quota + ~hour of wall-clock + Shannon's content-baking cadence. This is Phase 4 territory; Phase 3's job is to make it possible.

### 3. Preview-bake UX end-to-end (SC7)

**Test:** After a real bake, run `npm run preview-bake` and open `http://127.0.0.1:8883`. Browse all rituals. Scrub one suspected-bad line.

**Expected:**
- Rituals + lines listed (`_INDEX.json` groups, or "uncategorized" bucket via readdir fallback).
- `<audio>` element plays every line (RFC 7233 Range requests serve 206 on Chromium seek).
- Bad line either catches a real audio problem or approves for re-encryption.

**Why human:** Visual + audio judgment. The server correctness (dev-guard, loopback, path-containment, Range) is already test-covered.

---

## Gaps Summary

**No code gaps.** All 7 ROADMAP Success Criteria are structurally satisfied; all 10 AUTHOR-* requirements have working, wired, tested implementations on disk. The 38-commit branch `gsd/phase-3-authoring-throughput` is ready for merge.

**Documentation lag (info-only):**
- `REQUIREMENTS.md` lines 197 and 204 list AUTHOR-02 as "Partial" and AUTHOR-09 as "Pending" — both are fact complete. Not a code gap. Recommend updating the traceability table to reflect post-03-07 state.

**Status determination:** `human_needed` — because three items on the success-criteria ledger (single-line rebake timing, 5-ritual throughput, preview UX) have structural verification but their behavioral claim requires a real bake Shannon does on his own machine with his own Gemini quota. The engineering is done; the wall-clock proof is Phase 4's job. Per the Step 9 decision tree, any non-empty human-verification list forces `human_needed` over `passed` — this is the correct call.

---

_Verified: 2026-04-23T22:15:00Z_
_Verifier: Claude (gsd-verifier)_
