# Phase 3: Authoring Throughput - Context

**Gathered:** 2026-07-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Solo-author tooling so Shannon can re-bake a single-line edit in under a minute instead of re-rendering a full ritual, and can bake five rituals' worth of content without weekends lost to serial Gemini calls. Scope is AUTHOR-01..10: bake cache canonicalization, `scripts/bake-all.ts` orchestrator, short-line fix, validators (parity, duration anomaly, optional STT round-trip), preview server, `p-limit` concurrency, and the `idb-schema.ts` extraction.

**CRITICAL — the roadmap is stale relative to the codebase.** ROADMAP.md and REQUIREMENTS.md were written 2026-04-20. Between then and now (2026-07-01) Shannon actively baked EA content and the pipeline evolved substantially. Current reality per requirement:

| Req | Roadmap assumption | Actual state (2026-07-01) |
|---|---|---|
| AUTHOR-01 | Build a bake cache | **Mostly exists** — content-addressed cache at `~/.cache/masonic-mram-audio/` (475 entries), key = `sha256(CACHE_KEY_VERSION\x00text\x00style\x00voice\x00preamble)` in `scripts/render-gemini-audio.ts:computeCacheKey`. Missing: modelId in key, canonical location |
| AUTHOR-02 | `--since <git-ref>` | **Cannot work as specced** — dialogue sources are gitignored (`.gitignore:46` `rituals/*.md`); change detection must be content-hash/mtime based, not git |
| AUTHOR-03 | Prioritize 3.1-flash | **Already done** — `gemini-3.1-flash-tts-preview` is first in the chain (`scripts/render-gemini-audio.ts:28-30`) |
| AUTHOR-04 | Silent-skip bug | **No longer silent** — explicit classification: <11 chars hard-skip to runtime TTS (32 lines in ea-initiation per `bake.log`), 11–40 chars bake without preamble. Hard-skip conflicts with Phase 4 CONTENT-06 and is removed by this phase (D-01) |
| AUTHOR-05 | Build parity validator | **Partially exists** — `src/lib/author-validation.ts` has ratio-outlier checks; `scripts/validate-rituals.ts` checks structure (speakers, sections, cues, action flags). Not wired to refuse a bake |
| AUTHOR-06 | Duration anomaly detector | Not built |
| AUTHOR-07 | Optional STT round-trip | Not built (now load-bearing for D-03 short-line validation) |
| AUTHOR-08 | Preview server | Not built — but `rituals/_sessions/` + `rituals/*-review.json` show an informal review workflow exists; planner should inspect before designing |
| AUTHOR-09 | p-limit concurrency | Not built — bake is serial with an interactive `--on-fallback=ask` pause that will fight parallelism |
| AUTHOR-10 | idb-schema extract | Not built — `DB_VERSION = 4` duplicated in `src/lib/storage.ts:17` and `src/lib/voice-storage.ts:11` |

**Out of scope (belongs elsewhere):**
- Actually baking the five rituals — Phase 4 (Content Coverage)
- Hosted/self-serve authoring UI — AUTHOR-v2-01 (explicitly out of v1)
- Errata JSON sidecar for one-word fixes without rebake — AUTHOR-v2-03
- `feedbackTraces` store consumers — Phase 5 COACH-06 (AUTHOR-10 only creates the store housing)

</domain>

<decisions>
## Implementation Decisions

### Ultra-short-line policy (AUTHOR-04)
- **D-01:** **Every line gets baked audio — no runtime-TTS hard-skips, ever.** The current `<11 chars → skip-too-short → runtime TTS` classification is removed. Phase 4's CONTENT-06 ("no live TTS on a first rehearsal") holds by construction, not by verifier exception. (User decision, stated flatly: "all lines get baked audio.")
- **D-02:** Engine path for <11-char lines: **try Gemini with instructional padding first** (keeps the voice cast consistent; see memory skill `gemini-tts-speakas-short-line-instructional-prompt`), **fall back to Google Cloud TTS on validation failure**. The bake never skips — worst case is a non-Gemini voice on a 5-char line. Shannon's `test-google-line94.mjs` (repo root, untracked) is the working proof-of-concept for the Google path; planner should read it.
- **D-03 (PROVISIONAL — user was AFK for this one question; confirm at plan review):** Validation gate for the Gemini padded render: **duration-anomaly check (AUTHOR-06) + STT round-trip diff (AUTHOR-07) on short lines**. For 5-char lines the STT call is pennies and is the only check that catches "audio says the wrong words." If Shannon objects, downgrade to duration-only.
- **D-04:** Google Cloud TTS fallback voice: **per-role closest match to the Gemini cast**, pinned in each ritual's `{slug}-voice-cast.json` (extend the sidecar schema with a `googleVoice` field per role or equivalent). "I do." from the Candidate stays a distinct, consistent character voice across rituals.

### Cache canonicalization & key migration (AUTHOR-01)
- **D-05:** `rituals/_bake-cache/` (873 opus files, previously referenced by zero code) is **Shannon's manual backup of `~/.cache/masonic-mram-audio/`** — a superset snapshot preserving renders later invalidated locally (873 backup vs 475 live). Treat it as migration input, not garbage.
- **D-06:** Canonical cache location going forward: **`rituals/_bake-cache/`** (gitignored — `.gitignore` already excludes non-`.md`/`.json` patterns there; verify `.opus` is covered and extend if needed). The cache lives next to the content it belongs to, survives OS cache-cleaners, and rides along with Shannon's existing rituals/ backup habit. One-time move of the 475 live entries + dedup-merge of the 873 backup entries. `~/.cache/masonic-mram-audio/` is retired; `invalidate-mram-cache.ts` and all scripts point at the new location.
- **D-07:** **Add modelId to the cache key material** (satisfying AUTHOR-01's `sha256(voice + style + text + modelId + KEY_VERSION)`), with a **one-time in-place migration script** that re-keys every existing entry (live + backup union, deduped) assuming `gemini-3.1-flash-tts-preview` provenance — justified because the current bake deletes fallback-tier entries after render, so surviving entries are premium. **Zero re-render cost.** Bump `CACHE_KEY_VERSION`.
- **D-08:** With modelId in the key, premium and degraded renders coexist under distinct keys. **Replace delete-on-fallback with keep-and-upgrade:** degraded-tier (2.5-flash/pro) renders stay cached under their own key; the baked `.mram` (or a bake manifest) records which lines used a fallback tier; a later re-bake re-renders only those lines on the premium model when quota allows. A quota-limited bake completes instead of losing work, and no line is paid for twice.

### Claude's Discretion
- **Orchestrator design (AUTHOR-02, AUTHOR-09)** — not discussed; Claude decides during planning within these discovered constraints: (a) `--since <git-ref>` is impossible for gitignored dialogue files — use a content-hash manifest (or mtime) for change detection and treat the flag name/semantics accordingly; (b) `--parallel N` must not fight the interactive `--on-fallback=ask` pause — resolve the interaction (e.g., pause-all-workers on first fallback, or require `--on-fallback=continue|abort` when parallel); (c) p-limit cap value tuned to Gemini quota behavior observed in `bake.log`.
- **Preview server (AUTHOR-08)** — not discussed; Claude designs the `localhost:8883` scrubber. MUST first inspect the existing informal review workflow (`rituals/*-review.json`, `rituals/_sessions/experiment1/`) and build on it rather than inventing a parallel one. Dev-guard identical to `/author/_guard.ts` per requirement.
- **idb-schema extraction (AUTHOR-10)** — mechanical; single `src/lib/idb-schema.ts` source of truth for `DB_VERSION` + `onupgradeneeded`, imported by both `storage.ts` and `voice-storage.ts`, housing the future `feedbackTraces` store definition (Phase 5 consumes it). Dual-open test per roadmap success criterion 6.
- **Parity validator wiring (AUTHOR-05)** — extend existing `author-validation.ts` / `validate-rituals.ts` (speaker, action tags, word-count ratio band) and wire as a refusing gate in the bake path. Exact ratio band thresholds: Claude tunes from the existing `ratio-outlier` logic.
- **Duration-anomaly thresholds (AUTHOR-06)** — roadmap says ">3× ritual median for its character count"; Claude may refine (e.g., per-character-count normalization) as evidence dictates.
- D-03's exact STT engine for round-trip (Groq Whisper via existing `/api/transcribe` machinery vs direct API call from the script) — script-side direct call likely; Claude decides.

### Folded Todos
One STATE.md open question resolved by this discussion: "Confirm Shannon-specific authoring bottleneck ordering inside Phase 3" — the scout + discussion established the actual bottlenecks (cache location/key, short-line coverage) and that AUTHOR-03 is already done; ordering falls out of the decisions above.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase definition and requirements
- `.planning/ROADMAP.md` §Phase 3 — phase goal, success criteria (7 items), dependencies. **Caveat: written 2026-04-20; superseded where it conflicts with the Actual State table in `<domain>` above**
- `.planning/REQUIREMENTS.md` §Author — AUTHOR-01..10 full requirement text (same staleness caveat)
- `.planning/PROJECT.md` — client-owned data plane invariant (plaintext ritual content never committed, never server-side), solo-offline-authoring constraint

### Prior phase artifacts (locked precedents)
- `.planning/phases/02-safety-floor/02-CONTEXT.md` — commit convention (`author-NN: imperative` following `safety-NN:`), test convention (`src/**/__tests__/*.test.ts`), branching pattern (new branch from prior phase tip or main)
- `.planning/phases/01-pre-invite-hygiene/01-CONTEXT.md` — D-20 commit style, D-11 test location precedent

### The authoring pipeline as it exists TODAY (read before planning — the roadmap does not describe this)
- `scripts/render-gemini-audio.ts` — cache implementation: `computeCacheKey` (line ~588, `CACHE_KEY_VERSION` + text/style/voice/preamble), `renderLineAudio`, `deleteCacheEntry`, `isLineCached`, `PersistentTextTokenRegression`, model chain (lines 28-30)
- `scripts/build-mram-from-dialogue.ts` (967 lines) — the bake pipeline: pre-bake cache scan + line classification (~line 584: cached / too-short / needs-render), `--on-fallback=ask|continue|abort` tier-fallback flow, fallback-tier cache-entry deletion (~line 763-790), short-line rules (<11 hard-skip, <40 no-preamble)
- `scripts/invalidate-mram-cache.ts` — cache invalidation tool; must stay key-compatible after D-07 (its header comment already warns about key drift)
- `scripts/validate-rituals.ts` — existing structure-parity validator (AUTHOR-05 starting point)
- `src/lib/author-validation.ts` — existing `ratio-outlier` check (~line 192)
- `src/lib/voice-cast.ts` + `rituals/{slug}-voice-cast.json` sidecars — preamble construction + per-role voice pinning; D-04 extends the sidecar schema
- `src/lib/dialogue-format.ts` — dialogue parsing shared by scripts and validators
- `test-google-line94.mjs` (repo root, untracked) — Shannon's working Google Cloud TTS short-line experiment; D-02's fallback path starts here
- `bake.log` (repo root, gitignored) — evidence base: skip-too-short counts, text-token regression skips, cache-hit behavior
- `docs/BAKE-WORKFLOW.md` — Shannon's current authoring runbook; update it as part of this phase so it matches the new orchestrator

### idb-schema extraction targets (AUTHOR-10)
- `src/lib/storage.ts` (~line 14-28) — `DB_VERSION = 4`, lockstep comment, `onupgradeneeded`
- `src/lib/voice-storage.ts` (~line 11-41) — duplicated `DB_VERSION = 4`

### Constraints from repo config
- `.gitignore` lines 43-58 — `rituals/*.md`, `*.mram`, plaintext never committed. Drives the D-07/AUTHOR-02 no-git-ref constraint and D-06 cache-location gitignore verification

### Existing memory / skills relevant to Phase 3
- `gemini-tts-speakas-short-line-instructional-prompt` — the padded-prompt technique D-02 leads with
- `gemini-tts-voice-cast-scene-leaks-into-audio` — why duration-anomaly detection (AUTHOR-06) exists; why cache-key changes are historically expensive (D-07 avoids the re-render)
- `gemini-tts-text-token-regression-recovery-tactics` — the `PersistentTextTokenRegression` machinery in the render script
- `gemini-tts-preview-quota-and-fallback-chain` — quota reset at midnight PT, per-model quota buckets; informs D-08 and the orchestrator's parallelism cap
- `deterministic-tts-bake-in-at-build-time` — bake-time determinism rationale

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `computeCacheKey` / `renderLineAudio` in `scripts/render-gemini-audio.ts` — the cache core; D-06/D-07 relocate and re-key it, not rewrite it
- `scripts/validate-rituals.ts` + `src/lib/author-validation.ts` — AUTHOR-05 extends these into a bake-refusing gate rather than building new
- `rituals/*-review.json` + `rituals/_sessions/` — informal per-line review artifacts the AUTHOR-08 preview server should absorb
- `src/app/api/author/_guard.ts` — dev-guard pattern the preview server replicates
- `scripts/lookup-hashed-user.ts` (Phase 2) — precedent for small single-purpose author CLIs

### Established Patterns
- Content-addressed opus cache with `CACHE_KEY_VERSION` versioning — extend key material, bump version, migrate
- `--on-fallback=ask|continue|abort` interactive flow — the pattern the orchestrator must compose with under parallelism
- Passphrase read interactively, never via argv — orchestrator must handle multi-ritual passphrase entry (once per run, not once per ritual, or read from a prompt-once cache)
- Commit convention: `author-NN: imperative lowercase` (following `hygiene-NN:` / `safety-NN:`)
- Tests in `src/**/__tests__/*.test.ts` (vitest)

### Integration Points
- `scripts/build-mram-from-dialogue.ts` is the single per-ritual bake entrypoint; `bake-all.ts` orchestrates it (import its functions rather than shelling out, if practical)
- `src/lib/storage.ts` + `src/lib/voice-storage.ts` both open the same IndexedDB — AUTHOR-10's `idb-schema.ts` becomes their shared import; Phase 5 COACH-06 adds `feedbackTraces` there
- Phase 4 consumes everything this phase ships — the orchestrator's UX is Shannon's daily driver for the five-ritual bake

</code_context>

<specifics>
## Specific Ideas

- **The backup cache is evidence of intent:** Shannon manually backing up `~/.cache` into `rituals/_bake-cache/` means he treats renders as content, not disposable cache — D-06 formalizes that instinct.
- **Migration must dedup the 873-entry backup against the 475-entry live cache** (backup is a superset snapshot; identical keys are byte-identical by construction, so union is safe).
- **`test-google-line94.mjs` is a throwaway experiment file at repo root** — fold its learnings into the real fallback implementation, then delete it (it's in git status noise).
- **`bake.log` at repo root** shows real-world skip counts (32 hard-skips in ea-initiation, 11 text-token-regression skips) — use it to size the D-01 backfill and validate the fix against real rituals.
- **Existing baked EA `.mram`s have skipped lines** — once the short-line path works, the three EA rituals need a rebake to backfill those lines; that rebake is cheap (everything else cache-hits) and can serve as the end-to-end test of this phase. Full ritual coverage remains Phase 4.

</specifics>

<deferred>
## Deferred Ideas

- **Errata JSON sidecar for one-word fixes without full rebake** — AUTHOR-v2-03, post-v1
- **Hosted/self-serve author UI** — AUTHOR-v2-01, explicitly out of v1
- **Trusted co-author circle** — AUTHOR-v2-02, post-v1
- **Cleaning up `.mram.backup-*` clutter in rituals/** — noticed during scout (a dozen timestamped backups); could be an orchestrator nicety (auto-prune old backups) but not a requirement; planner may fold it in as a small task if free

### Reviewed Todos (not folded)
- STATE.md open question "does strong revocation need to ship earlier" — Phase 6 concern, untouched by this phase

</deferred>

---

*Phase: 03-authoring-throughput*
*Context gathered: 2026-07-01*
