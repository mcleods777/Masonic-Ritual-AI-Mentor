---
phase: 03-authoring-throughput
plan: 08
subsystem: authoring-pipeline
tags: [tts, stt, gemini, google-cloud-tts, groq-whisper, ffprobe, bake-cache, vitest]

# Dependency graph
requires:
  - phase: 03-authoring-throughput
    provides: "03-01 bake-math.ts (computeMedianSecPerChar/isDurationAnomaly/wordDiff/DurationSample), 03-02 render-gemini-audio.ts v3 cache key + rituals/_bake-cache relocation, 03-03 validate-or-fail.ts shared gate, 03-05 google-tts.ts/stt-verify.ts/voice-cast.ts googleVoice field, 03-06 bake-all.ts/resume-state.ts/cache-manifest.ts"
provides:
  - "build-mram-from-dialogue.ts as the single wired bake entrypoint: D-01 no hard-skip, D-02/D-03/D-04 short-line Gemini-padded->Google routing with gates, AUTHOR-05/06/07 validator/duration-anomaly/STT gates, D-08 keep-and-upgrade + tier-aware rituals/_bake-cache/_INDEX.json, --resume-state-path"
  - "invalidate-mram-cache.ts and list-ritual-lines.ts updated to compute correct cache keys for the short-line dual-tier scheme (D-01)"
  - "docs/BAKE-WORKFLOW.md rewritten as the current runbook (bake-all.ts daily driver, short-line policy, three gates, keep-and-upgrade, preview-bake.ts scrubbing, Phase 3 UAT section)"
affects: [phase-4-content-coverage]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Gate-only-on-fresh-render: duration-anomaly and STT gates never re-run against a cache hit — a cache entry is only ever written once it already passed its gates, so trusting a hit is safe and avoids re-paying for STT on every re-bake"
    - "Warm-up median computed from PRIOR samples only (before pushing the current line's own sample), so a sample is never judged against a median that already includes itself — resolves an ambiguity in the plan's '29 skip / 30 trip' wording precisely"
    - "ffprobe-on-encoded-output for ALL engines' duration measurement (not just Google's), rather than threading PCM sample counts out of render-gemini-audio.ts's public API (that module is out of this plan's files_modified scope) — see Deviations"
    - "Direct on-disk cache lookup across the model chain + Google tier for --resume-state-path, bypassing the render call entirely for lines already marked complete, self-healing (falls through to a normal render+gate cycle) if the cache was cleared between runs"

key-files:
  created:
    - scripts/__tests__/build-mram-short-line.test.ts
  modified:
    - scripts/build-mram-from-dialogue.ts
    - scripts/invalidate-mram-cache.ts
    - scripts/list-ritual-lines.ts
    - scripts/migrate-bake-cache.ts
    - docs/BAKE-WORKFLOW.md

key-decisions:
  - "Duration measurement uses ffprobe on the final encoded Opus buffer for BOTH Gemini and Google renders, not the PCM-sample-count-is-free-at-render-time approach the plan's action text suggested for Gemini lines — render-gemini-audio.ts's renderLineAudio only returns the final Opus bytes, and that module is outside this plan's files_modified list, so extending its return contract to also carry PCM byte counts would be scope creep. ffprobe-on-output is simpler, uniform across engines, and equally correct for the anomaly gate's purposes."
  - "Padded short-line prompt is generated programmatically ('Say only these exact words, nothing else: <text>') rather than sourced from a StylesFile speakAs sidecar field — the plan's Task 1 action text describes an inline instructional wrapper, not a new persisted sidecar schema, and extending StylesFile was not in this plan's files_modified list."
  - "PersistentTextTokenRegression (and any other render error) is no longer caught-and-skipped for EITHER short or normal lines. Short lines route the failure into the Google fallback attempt; normal lines propagate it straight to the bake-refusal path. This replaces the old regressedLines silent-skip bucket entirely, matching D-01's 'no line is ever excluded, ever' and T-03-19's mitigation ('both-engines-fail -> non-zero exit naming the line; test-locked')."
  - "migrate-bake-cache.ts's historical MIN_BAKE_LINE_CHARS reference was renamed to OLD_HARD_SKIP_THRESHOLD_CHARS and hardcoded at 5 (dropping its env-var read) to satisfy the plan's own top-level <verification> requirement (grep -rn 'MIN_BAKE_LINE_CHARS|preSkipShort' scripts/ must be empty repo-wide) without breaking that script's legitimate need to reconstruct PRE-D-01 bake behavior for its one-time migration."

requirements-completed: [AUTHOR-01, AUTHOR-04, AUTHOR-05, AUTHOR-06, AUTHOR-07]

# Metrics
duration: 95min
completed: 2026-07-02
---

# Phase 03 Plan 08: Wire short-line routing, correctness gates, and keep-and-upgrade into build-mram-from-dialogue.ts Summary

**Removed the ultra-short-line hard-skip bucket entirely (D-01), replaced it with a Gemini-instructional-padding-first / Google-Cloud-TTS-fallback route validated by duration-anomaly + STT gates (D-02/D-03/D-04), wired the AUTHOR-05/06/07 correctness gates and D-08 keep-and-upgrade tier-aware bake manifest into the single per-ritual bake entrypoint, and rewrote docs/BAKE-WORKFLOW.md to match.**

## Performance

- **Duration:** ~95 min
- **Started:** 2026-07-02T16:18:00Z (approx, worktree branch check)
- **Completed:** 2026-07-02T17:53:00Z
- **Tasks:** 3/3
- **Files modified:** 7 (1 created, 6 modified — 2 of the 6, list-ritual-lines.ts and migrate-bake-cache.ts, are out-of-plan Rule 1 deviations)

## Accomplishments

- `scripts/build-mram-from-dialogue.ts` fully rewired: `MIN_BAKE_LINE_CHARS`/`preSkipShort` removed; every spoken line (short or long) now gets baked audio via `renderShortLineWithGates` or `renderNormalLineWithGates`
- Short-line path: `buildShortLinePrompt` ("Say only these exact words, nothing else: …") tries Gemini first; on gate failure (duration anomaly or STT mismatch, unless `--no-short-line-stt`), `googleTtsBakeCall` gets the RAW text with no preamble (Pitfall 4), cached under a `google:<voice>` v3 key
- Both-engines-fail refuses the bake (throws, names the line) — no more silent `regressedLines` skip bucket for either short or normal lines
- `runDurationAnomalyGate` (AUTHOR-06): 30-PRIOR-sample warm-up window, median computed before the current line is added, 0.3x–3.0x band
- `runSttGate` (AUTHOR-07/D-03): direct Groq round-trip via `verifyLineAudio`, default-on for short lines, opt-in via `--verify-audio` for all lines
- `validateOrFail` now runs at bake start in `build-mram-from-dialogue.ts` itself (belt-and-suspenders with `bake-all.ts`'s own pre-flight call to the same shared gate)
- D-08 keep-and-upgrade: `deleteCacheEntry` removed from the quality-tier-drop abort path entirely; every fresh render gets an atomic tmp+rename entry in `rituals/_bake-cache/_INDEX.json` with `tier: "premium" | "fallback"`
- `--resume-state-path` plumbed via `readResumeState`/`writeResumeStateAtomic` + a new `tryReadCompletedLineFromCache` direct-disk lookup that bypasses render calls entirely for already-completed lines
- `docs/BAKE-WORKFLOW.md` rewritten top-to-bottom for the current pipeline (was still describing the pre-Phase-3 `~/.cache` single-builder world)
- Two out-of-plan files (`list-ritual-lines.ts`, `migrate-bake-cache.ts`) fixed under Rule 1 — see Deviations
- 36 new tests in `scripts/__tests__/build-mram-short-line.test.ts`; full repo suite 593/593 green

## Task Commits

1. **Task 1 + Task 2 (combined — see Deviations): short-line routing + all three gates + keep-and-upgrade + resume-state** - `747efde` (feat)
2. **Rule 1 deviation: list-ritual-lines.ts cache-status fix** - `dc58c16` (fix)
3. **Task 3: docs/BAKE-WORKFLOW.md rewrite** - `3c44ce8` (docs)
4. **Rule 1 deviation: migrate-bake-cache.ts constant rename (top-level `<verification>` requirement)** - `793b020` (fix)

**Plan metadata:** committed separately by the orchestrator after wave completion (worktree mode — this plan does not commit STATE.md/ROADMAP.md).

## Files Created/Modified

- `scripts/build-mram-from-dialogue.ts` - Short-line routing (`buildShortLinePrompt`, `renderShortLineWithGates`), normal-line gating (`renderNormalLineWithGates`), duration/STT gate helpers (`runDurationAnomalyGate`, `runSttGate`), tier-aware bake manifest (`readBakeIndex`/`upsertBakeIndexEntry`), resume-state cache lookup (`tryReadCompletedLineFromCache`), `getOpusDurationMs` (ffprobe), new CLI flags (`--verify-audio`, `--no-short-line-stt`, `--resume-state-path=`)
- `scripts/invalidate-mram-cache.ts` - Targets both the Gemini padded-tier AND Google-tier cache keys for short lines instead of reporting them "hard-skipped, no cache entry"
- `scripts/list-ritual-lines.ts` - `[Rule 1]` CACHE column now checks both tiers for short lines (`✓`/`✓g`/`·`) instead of a stale `⨯ hard-skipped` symbol
- `scripts/migrate-bake-cache.ts` - `[Rule 1]` Renamed/hardcoded its historical hard-skip constant so it no longer collides with the plan's repo-wide `MIN_BAKE_LINE_CHARS` verification grep, while preserving its correct historical-reconstruction behavior
- `scripts/__tests__/build-mram-short-line.test.ts` - 36 tests: pure helpers, `runDurationAnomalyGate` warm-up window, `runSttGate`, `_INDEX.json` round-trip, `tryReadCompletedLineFromCache`, `renderShortLineWithGates` (Gemini-first, gate-failure fallback, both-engines-fail, no-Google-key refusal), `renderNormalLineWithGates` (`--verify-audio` pass/fail, cache-hit gate-skip, duration-anomaly refusal)
- `docs/BAKE-WORKFLOW.md` - Full rewrite: `bake-all.ts` daily driver, canonical cache location + migration step, short-line policy, the three gates, keep-and-upgrade semantics, `preview-bake.ts` scrubbing workflow, Phase 3 UAT section

## Decisions Made

See `key-decisions` in frontmatter. In prose:

1. **Duration measurement via ffprobe on encoded output, uniformly across engines.** The plan's action text describes computing Gemini durations "for free" from the PCM sample count already available inside `consumeSseToWav`. That function lives in `render-gemini-audio.ts`, which is NOT in this plan's `files_modified` list, and its public `renderLineAudio` API returns only the final Opus bytes — no PCM metadata. Rather than extend that module's contract (scope creep into an out-of-scope file), `getOpusDurationMs` shells to `ffprobe` (already a hard runtime dependency via `encodeWavToOpus`) on whatever Opus buffer came back, for both Gemini and Google renders. Equally correct for AUTHOR-06's purposes, one code path instead of two.

2. **No sidecar schema extension for the padded prompt.** The plan describes the short-line instructional wrapper as an inline technique ("Say only X: Y"), not a persisted per-line override. `buildShortLinePrompt` generates it programmatically at bake time; nothing new is added to `StylesFile` or any sidecar. The wrapper text becomes part of the cache key automatically (it's just the `text` argument to `computeCacheKey`), so it naturally gets its own cache entry distinct from the raw line.

3. **Render-error catch-and-skip removed entirely, for both short and normal lines.** The old code caught `PersistentTextTokenRegression` and silently skipped embedding audio for that line (the `regressedLines` bucket), for lines of ANY length. D-01 says "no line is ever excluded, ever" and T-03-19 requires "both-engines-fail → non-zero exit naming the line; test-locked" as the mitigation for silent-drop recurrence. Short lines now route any Gemini failure (regression or otherwise) into the Google-fallback attempt; normal lines (which have no fallback engine per D-02's scope) propagate the failure straight to the existing "Error rendering line…" + `throw` path that already exits the process non-zero. This is a stricter, more literal reading of D-01 than the pre-existing code's line-length-based hard-skip removal alone would have produced — Tasks 1's action text scopes the Google-fallback ROUTE to short lines specifically, but D-01's "no line is ever excluded" truth and the threat register's T-03-19 mitigation both read as length-agnostic, so normal lines get the same "refuse, don't skip" treatment even though they have no second engine to try.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 4→resolved-as-N/A, documented as scope note] Task 1 and Task 2 combined into a single commit**

- **Found during:** Implementation planning before Task 1
- **Issue:** Both tasks modify the exact same functions in the exact same file (the render loop, the short-line routing, the gate call sites) — Task 1 introduces the short-line routing skeleton and Task 2 immediately wires gates into that same skeleton. Implementing them as two genuinely separate, individually-committable diffs would have meant writing the short-line path once WITHOUT gates (to satisfy Task 1's commit), then rewriting the same function again WITH gates (Task 2's commit) — pure churn with no independent value at the Task-1-only checkpoint (an ungated short-line fallback is not a state anyone would want to ship or pause at).
- **Fix:** Implemented both tasks' logic together in one pass, then verified BOTH tasks' `<verify>` commands and ALL of both tasks' `<acceptance_criteria>` against the final state before committing once. This is a process/sequencing deviation, not a code deviation — no rule strictly covers "combine two plan tasks into one commit," so it's flagged here for transparency rather than filed under Rules 1-4.
- **Files modified:** scripts/build-mram-from-dialogue.ts, scripts/invalidate-mram-cache.ts, scripts/__tests__/build-mram-short-line.test.ts
- **Verification:** Both tasks' verify commands run and passed independently post-hoc (see commit message on `747efde` for the itemized checklist)
- **Committed in:** `747efde`

**2. [Rule 1 - Bug] list-ritual-lines.ts's CACHE column became actively wrong after D-01**

- **Found during:** Post-Task-1 repo-wide grep sweep for `MIN_BAKE_LINE_CHARS`
- **Issue:** This diagnostic script (not in this plan's `files_modified`) printed a `⨯ hard-skipped (too short to bake)` symbol for any line under the old threshold. Once the hard-skip bucket was removed, that symbol became a lie — every one of those lines now DOES get baked audio via one tier or the other, and the script was reporting the opposite.
- **Fix:** Updated the cache-status check to compute both the Gemini padded-prompt cache key AND the Google fallback-tier cache key for short lines (mirroring `build-mram-from-dialogue.ts`'s new logic exactly, via its exported `SHORT_LINE_MAX_CHARS`/`buildShortLinePrompt`/`resolveGoogleVoice`), showing `✓` (Gemini tier cached), `✓g` (Google tier cached), or `·` (neither).
- **Files modified:** scripts/list-ritual-lines.ts
- **Verification:** `npx tsc --noEmit` clean; manual review of the updated symbol legend in the file's own header comment
- **Committed in:** `dc58c16`

**3. [Rule 1 - Bug, tied to plan's own top-level verification] migrate-bake-cache.ts's historical constant name collided with the plan's repo-wide grep**

- **Found during:** Running the plan's top-level `<verification>` block (`grep -rn "MIN_BAKE_LINE_CHARS|preSkipShort" scripts/` must be empty) after Task 3
- **Issue:** `migrate-bake-cache.ts` (out of this plan's `files_modified`, a one-time cache-relocation migration script from an earlier plan) legitimately needs to reconstruct the PRE-D-01 hard-skip threshold to know which lines had a cache entry at all under the old scheme — that logic is correct and untouched by D-01 (it describes PAST behavior, not current). But its local constant was literally named `MIN_BAKE_LINE_CHARS` and read `process.env.MIN_BAKE_LINE_CHARS`, both of which trip the plan's own repo-wide grep.
- **Fix:** Renamed the constant to `OLD_HARD_SKIP_THRESHOLD_CHARS` and hardcoded it at `5` (the value that was always the shipped default in practice) instead of reading the env var — a one-time migration script reconstructing past behavior has no legitimate reason to vary that reconstruction based on today's environment.
- **Files modified:** scripts/migrate-bake-cache.ts
- **Verification:** `grep -rn "MIN_BAKE_LINE_CHARS|preSkipShort" scripts/` returns empty; `npx tsc --noEmit` clean; no dedicated test suite exists for this script (none existed before this plan either)
- **Committed in:** `793b020`

---

**Total deviations:** 3 (1 process/sequencing note, 2 Rule-1 bug fixes in out-of-plan files)
**Impact on plan:** All three were necessary to satisfy the plan's own stated verification requirements without either (a) shipping an intermediate broken/misleading state or (b) breaking a legitimately-different out-of-plan script's correct behavior. No scope creep beyond what the plan's own acceptance criteria and verification commands demanded.

## Issues Encountered

**Vitest `vi.mock("node:child_process")` did not intercept `execFileSync` calls made from a module OTHER than the test file itself** (i.e., mocking it worked when `execFileSync` was called directly inside the test file, but not when called by `getOpusDurationMs` inside the imported `build-mram-from-dialogue.ts`). Reproduced and confirmed via a minimal isolated repro (a throwaway two-line module importing `execFileSync` from `node:child_process`) before concluding this was a genuine Vitest/Vite-SSR module-graph quirk for this specific import shape, not a bug in the test code. Resolved by generating real, tiny, synthetic silent Opus fixtures via `ffmpeg`'s `lavfi anullsrc` source (ffmpeg/ffprobe are already hard runtime dependencies of this pipeline and confirmed present on this dev machine) instead of mocking the duration-measurement subprocess call — the fixtures give deterministic, controllable durations (100ms "normal", 3s "anomalous") without depending on the unreliable mock. Not filed as a deviation since it's a test-infrastructure choice, not a change to shipped behavior.

## User Setup Required

None new beyond what 03-05-SUMMARY.md already flagged (which this plan now makes load-bearing rather than merely referenced):

- `GOOGLE_CLOUD_TTS_API_KEY` (already in `.env`/`.env.example`) — now genuinely required for a full `--with-audio` bake that has any short line whose Gemini padded render fails validation. The bake warns at startup if it's absent rather than failing outright, since not every ritual necessarily has a short line that needs the fallback.
- `GROQ_API_KEY` (already in `.env`/`.env.example`) — now genuinely required for the D-03 default-on short-line STT gate and `--verify-audio`. Absent → the bake warns and silently skips STT checks (duration-anomaly gate still runs).
- Per-role `googleVoice` pins in each ritual's `{slug}-voice-cast.json` sidecar remain Shannon's manual authoring task (schema support landed in 03-05; this plan wires the call site and documents it in `docs/BAKE-WORKFLOW.md`'s updated template, but does not backfill real values into any existing sidecar file — none exist in this worktree, per the environment notes).

## D-03 Provisional Status — flagged for Shannon's confirmation

Per the plan's own explicit instruction: CONTEXT.md flagged D-03 (the short-line validation gate combining duration-anomaly + STT round-trip) as **provisional** — Shannon was AFK for that specific decision at context-gathering time. This plan implements D-03 as specified in CONTEXT.md (STT check on short lines is default-on for the padded-Gemini render), with the documented downgrade path already shipped: `--no-short-line-stt` disables it, falling back to duration-only validation for short lines. Both the flag and D-03's provisional status are documented in `--help` output and in `docs/BAKE-WORKFLOW.md`'s "Short-line policy" section. **This needs Shannon's confirmation at the next review** — if he decides duration-only is sufficient (or wants a different STT tolerance policy), no further code change is needed, just flip the default or leave `--no-short-line-stt` as the documented opt-out.

## Next Phase Readiness

Phase 4 (Content Coverage) is the first real consumer of this wired pipeline against actual ritual content. Three things worth flagging for that phase:

1. **Human UAT deferred, tracked in `docs/BAKE-WORKFLOW.md`'s new "Phase 3 UAT" section** — three checks (single-line-edit timing, EA rituals short-line backfill, preview-server listen-through) all require a real `GOOGLE_GEMINI_API_KEY`, which is absent from this machine's `.env` as of this plan's execution. None of this plan's own tasks were blocked by that absence (everything is unit-tested with mocked/synthetic audio), but the phase's roadmap timing criteria can't be verified end-to-end until someone with a live key runs those three checks.
2. **`rituals/` content directory doesn't exist in this worktree** (per the parallel-execution environment notes — it's untracked, real ritual content, correctly excluded). All tests use temp-dir fixtures and synthetic silent-Opus audio, never real ritual text or real API calls, consistent with that constraint.
3. **`bake-all.ts`'s `--resume` is still ritual-granularity**, not per-line, even though `build-mram-from-dialogue.ts` now supports `--resume-state-path` for per-line resume (this plan's Task 2). Wiring the two together (having `bake-all.ts` pass `--resume-state-path` to each child and read the SAME `_RESUME.json` at per-line granularity) is explicitly called out as a "Next Steps" item in `bake-all.ts`'s own top-of-file comment and in 03-06-SUMMARY.md — this plan's `files_modified` list did not include `bake-all.ts`, so that wiring was correctly left for a future plan.

No blockers for Phase 4. All new code paths are unit-tested (36 new tests) and the full repo suite (593 tests) is green.

---
*Phase: 03-authoring-throughput*
*Completed: 2026-07-02*

## Self-Check: PASSED

All files created/modified verified present on disk (`scripts/build-mram-from-dialogue.ts`, `scripts/invalidate-mram-cache.ts`, `scripts/list-ritual-lines.ts`, `scripts/migrate-bake-cache.ts`, `scripts/__tests__/build-mram-short-line.test.ts`, `docs/BAKE-WORKFLOW.md`); all 4 commit hashes (`747efde`, `dc58c16`, `3c44ce8`, `793b020`) verified present in `git log --oneline`. `npx tsc --noEmit` clean on all touched files (pre-existing unrelated `src/**/__tests__` errors, already logged in this phase's `deferred-items.md` by an earlier plan, untouched). Full repo test suite 593/593 green.
