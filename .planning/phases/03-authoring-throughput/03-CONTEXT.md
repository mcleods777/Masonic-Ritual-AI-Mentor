# Phase 3: Authoring Throughput - Context

**Gathered:** 2026-04-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Speed up Shannon's content authoring loop so a single-line edit rebakes one line (not 155), multi-ritual bakes don't dominate calendar weekends, ultra-short lines stop silently dropping audio, cipher/plain mismatches fail loudly at bake time, and the in-browser preview at `localhost:8883` lets him scrub baked audio against the dialogue text before re-encrypting a `.mram`. Also extracts `src/lib/idb-schema.ts` as the single DB-version source of truth — both unifying the existing `storage.ts` / `voice-storage.ts` invariant and unblocking Phase 5's `feedbackTraces` store.

**In scope (AUTHOR-01..10):**
- Content-addressed bake cache at `rituals/_bake-cache/` (AUTHOR-01)
- `scripts/bake-all.ts` orchestrator with `--since`, `--dry-run`, `--resume`, `--parallel` (AUTHOR-02)
- Pinning `gemini-3.1-flash-tts-preview` first in fallback chain; older previews retained (AUTHOR-03)
- Ultra-short-line policy fix — auto-route to alternate engine, never silently drop (AUTHOR-04)
- `src/lib/author-validation.ts` cipher/plain parity validator (AUTHOR-05)
- Audio-duration anomaly detector (AUTHOR-06)
- Optional STT round-trip diff per line via `--verify-audio` (AUTHOR-07)
- `scripts/preview-bake.ts` localhost-only cache-scrubber server (AUTHOR-08)
- `p-limit` concurrency cap on parallel Gemini TTS calls (AUTHOR-09)
- `src/lib/idb-schema.ts` extraction + new `feedbackTraces` store (AUTHOR-10)

**Out of scope (belongs to other phases):**
- Hosted/self-serve `/author` UI — AUTHOR-v2-01 (out of scope by default)
- Trusted co-author circle with local dev access — AUTHOR-v2-02
- Lightweight errata JSON sidecar for one-word fixes without full `.mram` rebake — AUTHOR-v2-03
- Actual multi-ritual content baking (EA, FC, MM, Installation, lectures) — Phase 4
- Feedback prompt assembly + `/api/rehearsal-feedback` rewrite that consumes `feedbackTraces` — Phase 5 (COACH-06)
- Per-ritual build-hash tracking + stale-version banner — Phase 6 (ADMIN-05)

</domain>

<decisions>
## Implementation Decisions

### Cache layout, key, and invalidation (AUTHOR-01)

- **D-01:** Cache location: **`rituals/_bake-cache/`**, gitignored. Per-repo, co-located with content; survives machine moves with the repo. Cache files do not enter version control. On first run, an existing `~/.cache/masonic-mram-audio/` is migrated by **copy** (not symlink, not delete) into `rituals/_bake-cache/`; the old location is left intact for rollback. Migration is one-shot — once the new cache has any entry, the migration step skips. (`fs.cp` with `recursive: true`, only `.opus` files.)

- **D-02:** Cache key formula: **`sha256(KEY_VERSION + text + style + voice + modelId + preamble)`**. Adds `modelId` to the existing v2 key formula. **Bumps `CACHE_KEY_VERSION` from `"v2"` to `"v3"`** so existing cached entries auto-invalidate (honest re-bake on first run; no risk of silent stale 2.5-pro-tagged-as-3.1-flash hits). Re-bake cost is one-time: ~155 lines per ritual that has been baked already.

- **D-03:** Cache entry storage: same shape as today — `{cacheKey}.opus` files inside the cache directory. No metadata sidecar. Stored alongside is a single `_INDEX.json` (cache directory level, gitignored) that records `{cacheKey, model, ritualSlug, lineId, byteLen, durationMs, createdAt}` for every entry. The orchestrator reads `_INDEX.json` to drive `--dry-run` reporting and AUTHOR-06 anomaly comparisons without re-decoding every Opus file.

### Orchestrator: scripts/bake-all.ts (AUTHOR-02, AUTHOR-09)

- **D-04:** `--since <git-ref>` semantics: re-bake any ritual whose **plain or cipher dialogue file changed** since `<ref>`, computed as `git diff --name-only <ref> -- 'rituals/*-dialogue.md' 'rituals/*-dialogue-cipher.md'`. Same-ritual line-level granularity comes from the cache (unchanged lines are cache hits). Default `<ref>` when `--since` is passed without an arg = `HEAD~1`. Cipher-only changes still trigger because the validators (D-08) need to run.

- **D-05:** `--dry-run`: prints **per-ritual roll-up** of `{ritual, lines-total, cache-hit, cache-miss, validator-fail, would-bake-seconds-est}` plus a final aggregate. Does NOT call Gemini, does NOT touch `.mram` files. Estimate uses the median bake time per line from `_INDEX.json` (D-03); if no history, falls back to "~6s/line" constant.

- **D-06:** `--resume`: orchestrator writes a state file at `rituals/_bake-cache/_RESUME.json` after every completed line: `{ritual, completedLineIds: [], inFlightLineIds: [], startedAt}`. On `--resume`, reads the file, skips completed line IDs, retries in-flight ones (assumes interruption mid-render), and continues. Crash-safe by construction. State file is deleted when the orchestrator finishes a ritual cleanly.

- **D-07:** `--parallel N` default: **`4`**. Conservative against Gemini TTS preview-tier rate limits (~6-10 RPM observed); leaves headroom for the per-key fallback. Backed by `p-limit` (already a candidate dep). Shannon overrides via `--parallel 8` for full-rebake nights when willing to accept higher 429 rate. The flag clamps to `[1, 16]`. The existing per-key `apiKeys` array (in `render-gemini-audio.ts`) continues to rotate through keys before backoff — `--parallel` is the cap on concurrent in-flight calls regardless of key.

### Bake-time correctness gates (AUTHOR-04, 05, 06, 07)

- **D-08:** `src/lib/author-validation.ts` cipher/plain parity validator **hard-fails the bake**. Three checks per line pair:
  1. **Same speaker** — cipher and plain dialogue nodes must reference the same role code (`WM`, `SW`, `JW`, etc.).
  2. **Same action tags** — `[stage direction]` markers must appear identically in both files.
  3. **Word-count ratio band** — plain word count must fall within **0.5× to 2× the cipher word count** (±50% band). Wide enough that a 1-letter cipher abbreviating a 5-word phrase ("B." for "Bone of my bone") still falls in band on real ritual content; tight enough to catch dialogue-pair drift. Validator returns a structured list of failures (line ID, kind, expected vs actual). The orchestrator prints the list and exits non-zero. No `--force` override in Phase 3 — if Shannon needs one later, add it then.

- **D-09:** Short-line policy (AUTHOR-04) — **auto-route to Google Cloud TTS** at bake time. Lines shorter than `MIN_BAKE_LINE_CHARS` (current default `5`) skip Gemini entirely and call `/api/tts/google` (the existing engine wired in `src/lib/text-to-speech.ts`) at bake time, embedding the resulting Opus the same as any Gemini-rendered line. The bake summary includes `{short-line-count, routed-via-google}`. The runtime TTS fallback for these lines is no longer needed — every shipped `.mram` carries audio for every spoken line. **Voice mapping:** the bake script maps the existing role → Gemini voice mapping (`GEMINI_ROLE_VOICES`) onto a parallel `GOOGLE_ROLE_VOICES` table chosen for tonal consistency; same role gets a consistent Google voice across short lines. Initial mapping comes in the plan; Shannon reviews during execution.

- **D-10:** AUTHOR-06 audio-duration anomaly: detector triggers on **`>3× OR <0.3× the per-ritual median seconds-per-character`**. Per-ritual median (not per-line, not project-wide) since rituals have different cadences. Both ends caught: too-long catches voice-cast preamble leak (the load-bearing concern from `voice-cast.ts` and the project's `gemini-tts-voice-cast-scene-leaks-into-audio` skill); too-short catches cropped/silent output. **Action: hard-fail bake** with `{lineId, durationMs, charCount, ritualMedian, ratio}` in the error message. Discarding the cached entry for the failing line is a manual step (Shannon rm's the `cacheKey.opus` and re-bakes); auto-evict rejected here to avoid masking real recurring failures.

- **D-11:** AUTHOR-07 STT round-trip diff: **`--verify-audio` opt-in flag, warn-only**. Off by default (Whisper Groq cost ~$0.01 per ritual at 155 lines × ~6s/line via the existing `/api/transcribe` route). When set, the orchestrator pipes each line's Opus through Whisper after rendering, computes word-level diff against the source plain text, and prints a roll-up at the end: `{lines-checked, lines-with-diff > N words, worst-3-lines}`. Does NOT refuse the bake — Whisper itself mis-transcribes occasionally; surfacing for review beats false-positive blocking. Shannon runs `--verify-audio` on a final pre-ship pass per ritual.

### Model fallback chain (AUTHOR-03)

- **D-12:** Pin `GEMINI_TTS_MODELS` order: `["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"]`. Already the current `DEFAULT_MODELS` order in `scripts/render-gemini-audio.ts:30-34` — Phase 3 makes the priority explicit by adding a comment locking the order and the rationale (3.1-flash is the highest-quality preview as of 2026-04). The chain stays env-overridable via `GEMINI_TTS_MODELS`. Older previews retained as fallback (not deleted) for the wait-mode quota-exhaustion path.

### Preview server (AUTHOR-08)

- **D-13:** Architecture: **standalone Node script** at `scripts/preview-bake.ts`, runs `http.createServer` on `127.0.0.1:8883`. Independent of Next dev (so `next dev` on `:3000` and the preview server can run side by side). Reads cache files directly from `rituals/_bake-cache/` and `_INDEX.json`. Boot time <1s; no rebuild cycles.

- **D-14:** Scope: **read-only cache scrubber**. The browser UI lists rituals → lists baked lines per ritual → `<audio>` element streams the `.opus` for the selected line. No re-render trigger, no `.mram` modification, no Gemini API key in the preview server's runtime. Workflow: Shannon spots a bad line → edits the dialogue file → reruns `bake-all.ts` (which evicts + rebakes that line via cache miss) → refreshes preview. Smallest surface, fastest to build, no API surface.

- **D-15:** Dev-guard: extract a new **`src/lib/dev-guard.ts`** that exports `assertDevOnly()` performing the production-disable + loopback-only invariant. Both `src/app/author/page.tsx` (replacing the inline `process.env.NODE_ENV === "production"` check at line 220) AND `scripts/preview-bake.ts` import and call it. Single source of truth — spec's "identical guard" wording satisfied via shared module. The script-side guard additionally refuses to start if the bind interface is anything other than `127.0.0.1` or `::1`.

### idb-schema unification (AUTHOR-10)

- **D-16:** `src/lib/idb-schema.ts` owns: `DB_NAME`, `DB_VERSION` (bumped to **`5`** for the `feedbackTraces` store), all object-store name constants, AND a single shared `openDB()` function with one consolidated `onupgradeneeded` handler that creates ALL stores (`documents`, `sections`, `settings`, `voices`, `audioCache`, `feedbackTraces`). `src/lib/storage.ts` and `src/lib/voice-storage.ts` both replace their own `openDB()` with `import { openDB } from "./idb-schema"`. Existing in-store data survives the migration (only adding a new store; no schema rewrites of existing stores).

- **D-17:** `feedbackTraces` store schema: `{keyPath: 'id'}` with indexes on `documentId`, `timestamp`, and `variantId`. Field shape (TypeScript interface, exported from `idb-schema.ts`):
  ```ts
  interface FeedbackTrace {
    id: string;            // randomUUID per trace
    documentId: string;    // .mram document ID this trace came from
    sectionId: string;     // ritual section ID
    lineId: string;        // line within section
    variantId: string;     // mentor-v1 / roast-v1 / terse-v1 / coach-v1 (Phase 5)
    promptHash: string;    // sha256, no body content
    completionHash: string;// sha256, no body content
    timestamp: number;     // Date.now()
    ratingSignal?: 'helpful' | 'unhelpful' | null; // populated when user taps "this feedback seems wrong"
  }
  ```
  No PII, no ritual text, no email — all PII-free fields, matching Phase 2 D-09/D-10 type-system PII-prevention pattern. Phase 5 (COACH-06, COACH-12) is the first writer/reader; Phase 3 just creates the empty store + types.

- **D-18:** Test approach: **`src/lib/__tests__/idb-schema.test.ts` using `fake-indexeddb`** (npm package, ~3KB, MIT). Two test cases proving the dual-open invariant:
  1. Open via `storage.ts` first, then `voice-storage.ts` — assert all 6 stores exist after both opens.
  2. Reset fake-indexeddb. Open via `voice-storage.ts` first, then `storage.ts` — assert all 6 stores exist.
  Plus a third case: opening at `DB_VERSION=5` from a v4-on-disk database succeeds without data loss (existing stores intact, `feedbackTraces` newly created). Satisfies AUTHOR-10 success criterion 6.

### Branching, commits, and execution order

- **D-19:** Branch: **`gsd/phase-3-authoring-throughput`** created from current `main` tip. Phase 2 was merged to main as PR #68 (commit `d2e02cc`, 2026-04-22), so Phase 3 starts clean from main rather than from the prior phase branch.

- **D-20:** Commit prefix: **`author-NN: imperative lowercase`** per AUTHOR requirement (matches Phase 1's `hygiene-NN` and Phase 2's `safety-NN` patterns from prior CONTEXTs). One commit per AUTHOR-XX where practical. Shared infrastructure commits that span multiple AUTHOR items use `author-infra: ...` prefix.

- **D-21:** Test convention carries from Phase 1 D-11: tests live in `src/__tests__/` or `src/lib/__tests__/`. New test files: `src/lib/__tests__/idb-schema.test.ts`, `src/lib/__tests__/author-validation.test.ts` (extension if file already covered, otherwise new), and `scripts/__tests__/bake-all.test.ts` for orchestrator unit tests (state-file format, --since path filtering).

### Claude's Discretion

- Exact `_INDEX.json` field ordering and on-disk format (D-03) — Claude chooses; test asserts shape.
- `_RESUME.json` exact format (D-06) — Claude chooses; test asserts crash-resume invariant.
- Initial `GOOGLE_ROLE_VOICES` mapping (D-09) — Claude proposes a table during execution; Shannon reviews before merge. Default seed picks Google Cloud Studio voices in the same broad timbre band as the Gemini voices for each role.
- Exact `--dry-run` output format (D-05) — Claude writes the human-readable summary; Shannon adjusts during execution.
- Banner / inline messaging on validator failures (D-08) — Claude writes; ergonomics adjusted during execution.
- Whether `--verify-audio` writes its diff report to a file in addition to stdout (D-11) — Claude's call during implementation.
- Exact threshold `N` for "diff > N words" warn message in `--verify-audio` (D-11) — Claude defaults to `2` (i.e., warn if 3+ words mismatch); Shannon overrides via env var if too noisy.

### Folded Todos

None — no pending todos from prior sessions matched Phase 3 scope.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase definition and requirements
- `.planning/ROADMAP.md` §Phase 3 — phase goal, success criteria (7 items), dependencies (Phase 1 toolchain only)
- `.planning/REQUIREMENTS.md` §Authoring (AUTHOR-01..10) — full requirement text
- `.planning/PROJECT.md` — project vision, v1 invite-only constraint, client-owned data plane invariant, "solo offline authoring" key decision

### Prior phase artifacts (closed, locked precedents)
- `.planning/phases/01-pre-invite-hygiene/01-CONTEXT.md` — Phase 1 decisions including commit-convention D-20 (`hygiene-NN: imperative`), test-file-location D-11 (`src/__tests__/`), runbook folder convention D-03
- `.planning/phases/02-safety-floor/02-CONTEXT.md` — Phase 2 decisions including type-system PII-prevention pattern D-09/D-10 (referenced by D-17 feedbackTraces schema), commit-convention D-21 (one commit per requirement), branching pattern D-21
- `.planning/phases/02-safety-floor/02-VERIFICATION.md` — Phase 2 evidence baseline; Phase 3's branch starts from main after PR #68 merged

### Codebase context (read before planning)
- `.planning/codebase/ARCHITECTURE.md` §Storage, §Bake pipeline (if present), §Author tools — current structure of everything Phase 3 extends
- `.planning/codebase/CONVENTIONS.md` — test/commit/file-naming conventions

### Files that will be touched in Phase 3

**New files:**
- `scripts/bake-all.ts` — NEW orchestrator (AUTHOR-02), `p-limit`-capped (AUTHOR-09)
- `scripts/preview-bake.ts` — NEW localhost-only cache scrubber (AUTHOR-08)
- `src/lib/idb-schema.ts` — NEW single source of truth for IndexedDB (AUTHOR-10)
- `src/lib/dev-guard.ts` — NEW shared dev-only guard (D-15)
- `src/lib/__tests__/idb-schema.test.ts` — NEW dual-open invariant test (D-18)
- `scripts/__tests__/bake-all.test.ts` — NEW orchestrator unit tests (D-21)
- `rituals/_bake-cache/.gitignore` — NEW (or top-level gitignore entry); excludes cache contents from git
- `rituals/_bake-cache/_INDEX.json` — NEW cache index file (D-03), gitignored
- `rituals/_bake-cache/_RESUME.json` — NEW transient resume state (D-06), gitignored

**Modified files:**
- `scripts/render-gemini-audio.ts` — cache location switch, `CACHE_KEY_VERSION` bump to `"v3"`, modelId in key (D-01, D-02), one-shot migration from `~/.cache/masonic-mram-audio/` (D-01)
- `scripts/build-mram-from-dialogue.ts` — short-line auto-route to Google Cloud TTS instead of hard-skip (D-09); duration-anomaly check (D-10); validator gate before any rendering (D-08); optional STT verify pass (D-11); pin model fallback chain comment (D-12); use `bake-all.ts` orchestrator path
- `src/lib/author-validation.ts` — add cipher/plain parity validator (D-08); existing structural validator stays
- `src/lib/storage.ts` — replace inline `openDB` + constants with `import { openDB } from "./idb-schema"` (D-16)
- `src/lib/voice-storage.ts` — same (D-16)
- `src/app/author/page.tsx` — replace inline `process.env.NODE_ENV === "production"` check (line ~220) with `assertDevOnly()` from `src/lib/dev-guard.ts` (D-15)
- `package.json` — add `p-limit` (runtime), `fake-indexeddb` (dev) deps; add `bake-all` and `preview-bake` script entries
- `.gitignore` — add `rituals/_bake-cache/` entry (D-01)

### External references
- Gemini TTS preview models docs: https://ai.google.dev/gemini-api/docs/text-to-speech
- Google Cloud TTS docs (for short-line auto-route, D-09): https://cloud.google.com/text-to-speech/docs
- `p-limit` docs: https://github.com/sindresorhus/p-limit (concurrency cap, AUTHOR-09)
- `fake-indexeddb` docs: https://github.com/dumbmatter/fakeIndexedDB (test-only, D-18)
- Whisper via Groq (existing): existing `/api/transcribe` route — for `--verify-audio` (D-11)

### Existing memory / skills relevant to Phase 3
- `gemini-tts-voice-cast-scene-leaks-into-audio` — historical incident driving D-10 (audio-duration anomaly); voice-cast preamble leak is exactly what `>3× median` catches
- `gemini-tts-preview-quota-and-fallback-chain` — historical fix for the 3-model fallback chain; D-12 keeps the existing chain order intact
- `typed-event-names-for-pii-safe-telemetry` — type-system PII-prevention pattern; D-17 `FeedbackTrace` interface follows it (no body content, hashes only)
- `aes-gcm-node-web-crypto-interop` — relevant context for `.mram` rebake correctness; existing `encryptMRAMNode` in `build-mram-from-dialogue.ts` already handles the Node/Web Crypto interop
- `markdown-beats-jsonl-for-llm-transcripts` — relevant background for why dialogue lives in markdown (`{slug}-dialogue.md`) rather than JSONL — applies to AUTHOR-01..02 file-walking logic

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `scripts/render-gemini-audio.ts:30-34` — `DEFAULT_MODELS` is already in the order Phase 3 wants to lock (D-12).
- `scripts/render-gemini-audio.ts:37-41` — `CACHE_DIR` (currently `~/.cache/masonic-mram-audio/`) is the migration source (D-01).
- `scripts/render-gemini-audio.ts:50` — `CACHE_KEY_VERSION = "v2"` is the constant Phase 3 bumps to `"v3"` (D-02).
- `scripts/render-gemini-audio.ts:586-594` — `computeCacheKey()` — Phase 3 adds `modelId` to the material string (D-02).
- `scripts/build-mram-from-dialogue.ts:485-506` — `MIN_BAKE_LINE_CHARS` + the hard-skip block — Phase 3 replaces the skip with Google Cloud TTS routing (D-09).
- `scripts/build-mram-from-dialogue.ts` `encryptMRAMNode()` — Node-side `.mram` writer; Phase 3 doesn't touch the binary format, just the audio source.
- `src/lib/text-to-speech.ts` — existing Google Cloud TTS engine wired up; Phase 3's short-line bake path calls into it (D-09).
- `src/lib/author-validation.ts` — existing structural validator (`PairLineIssue` type with `kind: "structure-speaker" | "structure-action" | "ratio-outlier"` already declared); Phase 3 adds the `ratio-outlier` enforcement at bake time (D-08).
- `src/lib/storage.ts:14-17` — `DB_NAME`, `DB_VERSION = 4`, `DOCUMENTS_STORE` etc.; with explicit comment "MUST stay in lockstep with src/lib/voice-storage.ts" — Phase 3 deletes that lockstep dance via D-16.
- `src/lib/voice-storage.ts:11-13` — mirror constants Phase 3 collapses into `idb-schema.ts`.
- `src/app/author/page.tsx:220` — `const isProduction = process.env.NODE_ENV === "production"` inline check; D-15 replaces with `assertDevOnly()`.
- `scripts/lookup-hashed-user.ts` — small standalone script pattern from Phase 2 D-06c; reusable as a model for `scripts/bake-all.ts` (`#!/usr/bin/env npx tsx` shebang, `process.argv` parsing, no framework dep).
- `scripts/validate-rituals.ts` — existing validator script — Phase 3's orchestrator can call its core logic, not re-implement (`src/lib/author-validation.ts` is the shared module).

### Established Patterns

- **Cache pattern in `render-gemini-audio.ts`:** content-addressed by sha256, atomic write to `{cacheKey}.opus`, version bump invalidates without delete. D-02 follows verbatim.
- **Script invocation:** `#!/usr/bin/env npx tsx` shebang, run via `npm run` script entry. Standardized in Phase 1/2.
- **Test convention (Phase 1 D-11):** tests in `src/**/__tests__/<name>.test.ts`. Phase 3 tests follow.
- **Commit convention (Phase 2 D-20):** `<prefix>-NN: imperative lowercase` per task. Phase 3 prefix is `author-NN`.
- **Branch convention (Phase 2 D-21):** `gsd/phase-N-<slug>` created from prior tip OR main when prior phase has merged. Phase 3 starts from main (PR #68 merged 2026-04-22).
- **PII-free type-system telemetry (Phase 2 D-09/D-10):** TypeScript discriminated union + ESLint rule banning body keys. D-17 `FeedbackTrace` follows the same shape (hashes, no bodies).
- **Dev-only guard:** currently inline in `/author/page.tsx`; Phase 3 standardizes via `src/lib/dev-guard.ts` (D-15).

### Integration Points

- **`scripts/bake-all.ts`** is the new chokepoint for multi-ritual baking. It composes: validator (D-08) → orchestrator → `build-mram-from-dialogue.ts` per ritual → cache-aware `render-gemini-audio.ts`. `--verify-audio` (D-11) layers on top.
- **`src/lib/idb-schema.ts`** is the new single chokepoint for IndexedDB. Both `storage.ts` and `voice-storage.ts` read DB_NAME/DB_VERSION/store names from here. Phase 5 COACH-06 is the first downstream consumer that will write `feedbackTraces`.
- **`src/lib/author-validation.ts`** is shared between the `/author` UI (existing) and the new bake orchestrator (D-08). One module, two callers.
- **`src/lib/dev-guard.ts`** is the new shared chokepoint for dev-only access. Both `/author/page.tsx` and `preview-bake.ts` call `assertDevOnly()`.

### Constraints Discovered

- `DB_VERSION` is currently `4` in BOTH `storage.ts` and `voice-storage.ts` (the lockstep is honored today). D-16 bumps to `5` exactly once in the consolidated schema; only ONE place to update next time.
- `voice-storage.ts:46-77` already creates ALL existing stores (`documents`, `sections`, `settings`, `voices`, `audioCache`) in its `onupgradeneeded` because it had to handle being-opened-first. After D-16 the consolidated `idb-schema.ts` carries this consolidated upgrade handler verbatim plus the new `feedbackTraces` store.
- Existing `~/.cache/masonic-mram-audio/` may already contain hundreds of `.opus` files baked across prior Shannon-hours. D-01 migration is `fs.cp recursive: true` (Node 16+ API), copying files unchanged. The cache key bump (D-02) means most copied entries miss on first lookup and get re-baked anyway — but the migration still saves anything that happens to match the new key formula (e.g., when modelId matches the embedded preamble, which already includes voice).
- Google Cloud TTS engine wiring exists in `src/lib/text-to-speech.ts` and `src/app/api/tts/google/` — but Phase 3's bake-time call needs to bypass the Next API route (no dev server running) and call the Google Cloud TTS REST API directly from the script. Plan needs: a script-side adapter that reuses the API key + voice mapping but invokes the REST endpoint, not the route.
- `bake-all.ts --since HEAD~1` requires the script to run inside a git repo. Not portable to non-git checkouts; acceptable since Shannon's authoring workflow is git-native. Validate with `git rev-parse` before invoking diff; print clear error if not in git.

</code_context>

<specifics>
## Specific Ideas

- **Cache key bump rationale (D-02):** the current `v2` key includes `preamble` (which embeds voice via the voice-cast file). Adding `modelId` is strictly additive — every existing entry could have its modelId reconstructed from the voice/style/text combo, but doing so post-hoc is fragile. Bump-and-rebake is the honest move. Shannon's first `bake-all.ts` run will re-render the existing baked rituals; subsequent edits are cheap.

- **Short-line voice consistency (D-09):** when a Gemini-voiced WM utters "Brethren!" in one breath and a Google-voiced "B." in the next, the timbre shift is audible. The plan should pick Google Cloud Studio voices that share rough register/age with each Gemini voice in `GEMINI_ROLE_VOICES` (e.g., a deep male Studio voice for WM if Gemini's WM is `Charon`-ish). Not pixel-perfect — but tonally adjacent. Shannon listens during execution; voice mapping locks in the plan after a short A/B.

- **Validator hard-fail philosophy (D-08):** Shannon will rewrite a bad cipher line rather than ship an `.mram` that scores wrong. Hard-fail forces the fix at bake time, not at first-rehearsal time when an invited Brother sees a phantom score-failure. No `--force` override in Phase 3 — if Shannon needs one for a one-off, add it as a tiny patch later.

- **Anomaly detector vs voice-cast leak (D-10):** the `gemini-tts-voice-cast-scene-leaks-into-audio` skill is the historical record of why this matters — a Gemini TTS bake leaked the voice-cast preamble into the rendered audio, producing a 30-second line where 5 seconds were expected. `>3× median` catches exactly that pattern. The `<0.3× median` end is rarer (cropped output) but cheap to add and prevents the symmetric cropped-line failure.

- **`--verify-audio` cost framing (D-11):** at ~$0.01 per ritual when run, `--verify-audio` is essentially free even on a per-rebake basis. The reason it's opt-in rather than always-on is **cognitive overhead** — Shannon doesn't want to wade through a Whisper diff list on every iterative bake during authoring; he wants it on the final pre-ship pass per ritual. Default off, opt-in flag, run before each ritual ships.

- **Preview server bind (D-13/D-15):** `127.0.0.1:8883` not `0.0.0.0:8883`. WSL2 forwards `127.0.0.1` to the Windows host's loopback by default; Shannon's browser on Windows can hit `http://localhost:8883`. No firewall rule needed, no LAN exposure.

- **`feedbackTraces` storing zero PII (D-17):** the `FeedbackTrace` interface is intentionally narrower than the audit log. No `hashedUser` field — Phase 3 doesn't need it for the trace store, and adding it would let an attacker with IndexedDB access correlate ratings to a hashed identity. Only what Phase 5's eval harness genuinely consumes: doc/section/line IDs, variant, hashes, time, optional rating.

</specifics>

<deferred>
## Deferred Ideas

- **Errata JSON sidecar** (AUTHOR-v2-03) — for one-word corrections without full `.mram` rebake. Floated but rejected for v1; the bake cache + git-diff `--since` flow already makes one-word edits a sub-minute operation.
- **Hosted/self-serve `/author` UI** (AUTHOR-v2-01) — out of scope by default per project Key Decisions table.
- **Trusted co-author circle with local dev access** (AUTHOR-v2-02) — same.
- **`--force` override on validator failures** (D-08) — floated but rejected for Phase 3. Add as a tiny patch later if a real one-off needs it.
- **Auto-evict cache entry on duration-anomaly trigger** (D-10) — floated but rejected. Auto-evict masks recurring failures; manual `rm` of the offending `cacheKey.opus` is loud and intentional.
- **Always-on STT verify with sampling** (D-11 alt) — floated but rejected for Phase 3. Default-off `--verify-audio` is the simpler ergonomic; revisit if Shannon misses the safety net.
- **Re-render in preview server** (D-14 alt) — floated but rejected for Phase 3. Browser-triggered Gemini calls would put an API key in the preview server's runtime, widening the dev-only attack surface. Re-render = `bake-all.ts --since HEAD` from terminal.
- **Web UI for editing dialogue files** (D-14 alt) — out of scope; that's `/author` UI's job, and `/author` is dev-only and already covers it.
- **`feedbackTraces` storing prompt/completion bodies** (D-17 alt) — floated but rejected; matches Phase 2 D-09/D-10 hashes-only invariant.
- **`scripts/bake-all.ts --watch` mode** — file-watcher that auto-rebakes on dialogue file save. Floated; rejected for Phase 3 (`--since HEAD` from terminal is already <1min for single-line edits). Revisit if iterative authoring proves slow.
- **Per-key `--parallel` accounting** (D-07 alt) — letting `--parallel N` cap per-API-key concurrency rather than global. Phase 3 keeps it simple (global cap); revisit if multi-key authoring shows rate-limit headroom.

### Reviewed Todos (not folded)

None — no pending todos were relevant to this phase.

</deferred>

---

*Phase: 03-authoring-throughput*
*Context gathered: 2026-04-21*
