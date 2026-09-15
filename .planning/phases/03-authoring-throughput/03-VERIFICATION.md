---
phase: 03-authoring-throughput
verified: 2026-07-02T19:00:11Z
status: human_needed
score: 11/11 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 7/11
  gaps_closed:
    - "--resume picks up cleanly after a crash (Roadmap SC 2, second clause) — WR-02 closed by 03-09"
    - "Passphrase prompted once and passed safely to every parallel child (CR-01) — closed by 03-09"
    - "--parallel > 1 refuses --on-fallback=ask unconditionally (CR-02) — closed by 03-09"
    - "Fallback-tier renders are reliably recorded in the bake manifest for later premium upgrade (CR-03) — closed by 03-10"
  gaps_remaining: []
  regressions: []
deferred: []
human_verification:
  - test: "Single-line dialogue edit re-bakes in under a minute"
    expected: "Editing one line in an existing ritual's dialogue file, then running `bake-all.ts --changed-only`, re-renders only that one line (cache-hit for all others) and completes in well under a minute."
    why_human: "Requires a real GOOGLE_GEMINI_API_KEY and an existing baked ritual with real audio in the cache — not available on the verification machine. The code mechanism (content-addressed cache keyed on modelId+text+voice+style) is confirmed correct by static analysis and unit tests, but wall-clock timing needs a live run."
  - test: "Bake five rituals' worth of content in parallel without manual babysitting"
    expected: "Running `bake-all.ts --parallel 4` (or the bare default) against 5 rituals completes cleanly with correctly-decryptable .mram outputs and no lost _INDEX.json provenance entries."
    why_human: "Cannot be safely exercised without real API keys and a real interactive TTY session. All three code-confirmed defects that previously blocked this (CR-01 passphrase corruption, CR-02 forbidden parallel+ask default, CR-03 index race) are now closed and covered by regression tests including a real un-mocked subprocess handshake — this check should now be expected to PASS, but a live run with real keys has not been observed by the verifier."
  - test: "Scrub baked lines in a browser against localhost:8883 before re-encrypting a .mram"
    expected: "`npx tsx scripts/preview-bake.ts`, open http://localhost:8883, browse a ritual's lines, and audibly confirm a rendered line before re-encrypting."
    why_human: "Requires a real baked cache and a human listening — deferred explicitly in 03-07-SUMMARY.md and docs/BAKE-WORKFLOW.md's UAT section; server + containment + tests are verified structurally but the actual listen-through has not happened. Unaffected by this gap-closure wave."
  - test: "EA rituals rebake backfills the 32 previously-skipped short lines"
    expected: "Re-baking the existing EA rituals (which have runtime-TTS-skipped ultra-short lines per bake.log) produces audio for every previously-missing line via the Gemini-padded/Google-fallback path."
    why_human: "Requires a real Gemini + Google Cloud TTS key and the actual EA ritual content; deferred per docs/BAKE-WORKFLOW.md's UAT section. Unaffected by this gap-closure wave."
---

# Phase 3: Authoring Throughput Verification Report

**Phase Goal:** Shannon can re-bake a single-line edit in under a minute instead of re-rendering a full ritual, and can bake five rituals' worth of content without weekends lost to serial Gemini calls
**Verified:** 2026-07-02T19:00:11Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (plans 03-09, 03-10)

## Goal Achievement

### Gap Closure Summary

All 4 gaps from the initial verification (2026-07-02T18:05:46Z, `status: gaps_found`, 7/11) are closed and code-confirmed in this re-verification:

| Gap | Closure Plan | Fix | Verified In Source |
|-----|--------------|-----|---------------------|
| CR-01 — passphrase corruption under parallel/interactive bake | 03-09 | `choosePassphraseSource()` exported, env-first ordering; children spawned with `stdio[0]="ignore"` for continue/abort | `scripts/build-mram-from-dialogue.ts:717-724,735-740`; `scripts/bake-all.ts:439-444,599-610` |
| CR-02 — forbidden `parallel>1 + on-fallback=ask` default | 03-09 | `resolveEffectiveParallel()` degrades bare invocation to `parallel=1`; conflict check now enforced unconditionally on resolved value | `scripts/bake-all.ts:296-301,660-674` |
| CR-03 — `_INDEX.json` cross-process lost-update race | 03-10 | Per-slug shards (`_INDEX.<slug>.json`), merge-on-read (`readBakeIndex`), parent-owned `consolidateBakeIndex` post-wave | `scripts/build-mram-from-dialogue.ts:331-450`; `scripts/bake-all.ts:745-760` |
| WR-02 — `--resume` doesn't survive a crash | 03-09 | Incremental unconditional resume writes in `bakeSelected` after every ritual success; `--resume-state-path` wired via `buildMramSpawnArgs` | `scripts/bake-all.ts:398-418,485-531` |

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: A one-line text edit causes `bake-all.ts` to re-render exactly one line, not the whole ritual | ✓ VERIFIED | Unchanged since initial verification. `computeCacheKey` (render-gemini-audio.ts:620-628) content-addressed on `text+style+voice+modelId+CACHE_KEY_VERSION`; re-confirmed present, no regression. |
| 2 | SC2a: `--since <git-ref>` (compat) / `--changed-only` only rebakes rituals changed since the manifest baseline | ✓ VERIFIED | Unchanged. `getChangedRituals` (cache-manifest.ts) content-hash logic untouched by 03-09/03-10. |
| 3 | SC2b: `--resume` picks up cleanly after a crash | ✓ VERIFIED (was FAILED) | `bakeSelected` (bake-all.ts:485-531) now calls `writeCompletedSlugs` synchronously immediately after every successful ritual (line 517), unconditionally — a crash mid-fan-out leaves a resumable record. `buildMramSpawnArgs` (370-418) now appends `--resume-state-path=<cacheDir>/_RESUME-<slug>.json` to every spawned child, wiring the child's already-existing per-line resume through the spawn boundary. `initialCompleted` seeds the incremental writer from a prior `--resume` load so history isn't clobbered (documented deviation, correctness fix). |
| 4 | SC3: No `.mram` with an ultra-short line is ever baked with that line silently missing | ✓ VERIFIED | Unchanged since initial verification; untouched by this gap-closure wave. |
| 5 | SC4: The parity validator refuses to bake a deliberately-corrupted dialogue pair | ✓ VERIFIED | Unchanged since initial verification; untouched by this gap-closure wave. |
| 6 | SC5: Bake-time duration-anomaly detector flags any baked line >3x the ritual's median | ✓ VERIFIED (with pre-existing WARNING) | Unchanged since initial verification. WR-05 (sample pool polluted by gate-failed samples, `build-mram-from-dialogue.ts:274`) remains present — real precision caveat, but not one of the 4 gaps assigned to this closure wave and does not defeat the mechanism. |
| 7 | SC6: `src/lib/idb-schema.ts` is the single `onupgradeneeded` source of truth; dual-open test confirms all stores exist regardless of open order | ✓ VERIFIED | Re-confirmed: `storage.ts:17` and `voice-storage.ts:14` both `import ... from "./idb-schema"`; `grep -rn "DB_VERSION *= *[0-9]" src/lib/` shows only `idb-schema.ts` and an unrelated separate database (`performance-history.ts`, its own `DB_NAME="masonic-performance"`, not part of storage.ts/voice-storage.ts's schema) — no regression. |
| 8 | SC7: Shannon can scrub baked lines in a browser against `localhost:8883` before re-encrypting a `.mram` | ✓ VERIFIED (structurally) | Re-confirmed present (524 lines, all containment layers); additionally now reads the merged `readBakeIndex` view (imported from build-mram-from-dialogue.ts, preview-bake.ts:54,409) so fallback-tier entries surface even before consolidation — an improvement from 03-10, not a regression. Actual browser listen-through remains human-only. |
| 9 | Passphrase prompted once, passed safely to every parallel child | ✓ VERIFIED (was FAILED) | `choosePassphraseSource(envPass, isTTY)` (build-mram-from-dialogue.ts:717-724) returns `{kind:"env"}` whenever `envPass` is a non-empty string, checked BEFORE any TTY logic; `promptPassphrase()` (735-746) and `bake-all.ts`'s `readPassphrase()` (599-610) both consult it first. `bakeRitual` (bake-all.ts:424-456) computes `childStdin = onFallback==="ask"||"wait" ? "inherit" : "ignore"` — closes the shared-raw-mode-TTY corruption path as defense-in-depth. Proven end-to-end by a real, un-mocked subprocess test (`bake-passphrase-handshake.test.ts`, 185 lines, 2 tests, both passing): positive case spawns the real child with `stdio:["ignore",...]` + `MRAM_PASSPHRASE` set, asserts exit 0 and a decryptable `.mram`; negative case asserts non-zero exit + `MRAM_PASSPHRASE` named in stderr, never hanging (30s timeout guard). |
| 10 | `--parallel > 1` refuses `--on-fallback=ask` unconditionally | ✓ VERIFIED (was FAILED) | `resolveEffectiveParallel(flags)` (bake-all.ts:296-301): `bothDefault = !parallelFlagPresent && !onFallbackFlagPresent; return bothDefault ? 1 : clampParallel(flags.parallel)`. `main()` (660-674) now calls this BEFORE the conflict check and passes `flagged=true` unconditionally to `checkParallelFallbackConflict` — the flag-provenance gate that caused the original defect is gone. A bare invocation now resolves to `parallel=1` (where `ask` is legal) instead of running the forbidden `parallel=4+ask` default; an explicit `--parallel 4 --on-fallback=ask` still resolves to 4 and is refused with exit 1. `bake-all.test.ts`'s "resolveEffectiveParallel (CR-02)" describe block (lines 115-165) asserts both the isolated function and the end-to-end composition with `checkParallelFallbackConflict`; the old codified-gap test block ("skips the check when neither flag was explicitly passed") no longer exists. |
| 11 | Fallback-tier renders reliably recorded in `_INDEX.json` for premium upgrade (D-08) | ✓ VERIFIED (was FAILED) | `upsertBakeIndexEntry` (build-mram-from-dialogue.ts:417-429) now writes exclusively to `bakeIndexShardPath(cacheDir, entry.ritualSlug)` — a per-slug file (`_INDEX.<slug>.json`) — never the shared `_INDEX.json`; since `bake-all.ts` spawns exactly one child per ritual, each child is the sole writer of its shard, eliminating the cross-process race by construction. `readBakeIndex` (398-405) merges the legacy file + every shard, deduped by `(ritualSlug,lineId,cacheKey)` with shard entries winning. `consolidateBakeIndex` (440-445), called from `bake-all.ts main()` (752-760) strictly after `bakeSelected` resolves with zero failures, writes the union to canonical `_INDEX.json` and removes the shards; failure is caught and logged as a non-fatal warning (no data loss even if consolidation itself fails). `preview-bake.ts`'s `handleIndexJson` now imports and uses `readBakeIndex` directly (preview-bake.ts:54,409) instead of reading only the legacy file. Proven by `bake-index-shard.test.ts` (188 lines, 9 tests): interleaved-writer no-loss (both slugs survive), same-slug idempotency, fallback-tier survival across shards, and 3 consolidation tests (full union + shards removed, idempotent re-run, shard-wins-over-legacy after a prior consolidation). |

**Score:** 11/11 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/bake-all.ts` | Multi-ritual orchestrator, parallel/passphrase/resume safe | ✓ VERIFIED | 780 lines. Imports `choosePassphraseSource, consolidateBakeIndex` from `build-mram-from-dialogue.ts` (line 100). All four gap fixes present and wired: `resolveEffectiveParallel` (296-301), conditional `childStdin` (439), incremental `writeCompletedSlugs` call (517), `--resume-state-path` in `buildMramSpawnArgs` (416), post-wave `consolidateBakeIndex` call (753). |
| `scripts/build-mram-from-dialogue.ts` | `choosePassphraseSource` export, per-slug index shards | ✓ VERIFIED | `export function choosePassphraseSource` (717) — exactly one definition, env-first ordering confirmed by line-number check (env branch at 721, `isTTY` check at 722, in that order). `bakeIndexShardPath`, `sanitizeIndexShardSlug`, `mergeBakeIndexEntries`, `listIndexShardFiles`, `consolidateBakeIndex` all present (319-450); `upsertBakeIndexEntry` targets the shard path exclusively (417-429). |
| `scripts/__tests__/bake-passphrase-handshake.test.ts` | Real un-mocked subprocess handshake regression | ✓ VERIFIED | 185 lines, does not import `../bake-all` (confirmed no module-mock leakage), spawns a real child, both tests pass. |
| `scripts/__tests__/bake-index-shard.test.ts` | Concurrency regression, no lost provenance | ✓ VERIFIED | 188 lines, 9 tests, all passing; interleaved-writer + idempotency + fallback-survival + consolidation coverage. |
| `scripts/preview-bake.ts` | Localhost-only Opus scrubber, merged index read | ✓ VERIFIED | 524 lines; now imports `readBakeIndex` (line 54) and uses it in `handleIndexJson` (409) — fallback-tier entries visible pre-consolidation. |
| `docs/BAKE-WORKFLOW.md` | Runbook reflecting the wired resume flag | ⚠️ STALE (info) | Line 268 still reads "a future revision of `bake-all.ts` can wire through" — this is now factually incorrect; `bake-all.ts` wires `--resume-state-path` today (03-09). Documentation lag only, not a functional gap. See Anti-Patterns. |
| `.planning/REQUIREMENTS.md` | Traceability matches code state | ✓ FIXED IN THIS VERIFICATION | AUTHOR-01/03/06/08/10 checkboxes updated `[ ]`→`[x]` and traceability table rows updated `Pending`→`✓ Validated`, matching code-confirmed implementation status (sanctioned doc-sync fix per task instructions). AUTHOR-02/04/05/07/09 traceability rows also updated from bare "Complete" to dated "✓ Validated" for consistency with the rest of the table's format. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `scripts/bake-all.ts` (readPassphrase) | `scripts/build-mram-from-dialogue.ts` (choosePassphraseSource) | shared import | ✓ WIRED | `bake-all.ts:100` imports it; `readPassphrase()` (599-610) calls it before any TTY logic — same resolution order as the child. |
| `scripts/bake-all.ts` (bakeRitual) | spawned child stdio | conditional `childStdin` | ✓ WIRED | `stdio:[childStdin,"inherit","inherit"]` (442); `"ignore"` for continue/abort, `"inherit"` only for ask/wait. |
| `scripts/bake-all.ts` main() | resolveEffectiveParallel → checkParallelFallbackConflict | resolved-value enforcement | ✓ WIRED | `parallelN = resolveEffectiveParallel(flags)` (660) feeds `checkParallelFallbackConflict(parallelN, flags.onFallback, true)` (666-670) — `flagged` is now always `true`. |
| `scripts/bake-all.ts` (buildMramSpawnArgs) | `scripts/build-mram-from-dialogue.ts` (--resume-state-path) | spawn argv flag | ✓ WIRED | `--resume-state-path=${resumeStatePath}` appended (416); confirmed present in the returned array, tested. |
| `scripts/bake-all.ts` (bakeSelected) | `rituals/_bake-cache/_RESUME.json` | incremental unconditional write | ✓ WIRED | `writeCompletedSlugs(completedThisRun, startedAt, resumeFile)` called synchronously immediately after `recordBaked` on every ritual success (515-517), not gated on `--resume`. |
| `scripts/build-mram-from-dialogue.ts` (upsertBakeIndexEntry) | `rituals/_bake-cache/_INDEX.<slug>.json` | exclusive per-slug shard write | ✓ WIRED | Confirmed targets `bakeIndexShardPath` exclusively (417-429), never the shared file. |
| `scripts/bake-all.ts` main() (post-wave) | `consolidateBakeIndex` | parent-owned consolidation | ✓ WIRED | Called at 753, strictly after `bakeSelected` resolves with zero failures (736-743 failure branch exits before reaching it); wrapped in try/catch that warns rather than fails. |
| `scripts/preview-bake.ts` (handleIndexJson) | `_INDEX.json` + `_INDEX.*.json` shards | merged read via `readBakeIndex` | ✓ WIRED | Imports and calls `readBakeIndex` (54, 409) instead of parsing the legacy file directly. |
| `src/lib/storage.ts` / `src/lib/voice-storage.ts` | `src/lib/idb-schema.ts` | `import { openDB, ... }` | ✓ WIRED (unchanged) | Re-confirmed, no regression. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| AUTHOR-01 | 03-02 | Content-addressed bake cache at `rituals/_bake-cache/`, keyed incl. modelId | ✓ SATISFIED | `render-gemini-audio.ts:58,620-628`. REQUIREMENTS.md updated `[ ]`→`[x]` in this verification. |
| AUTHOR-02 | 03-06 / 03-09 | `bake-all.ts` orchestrator with flags | ✓ SATISFIED | Orchestrator flag-complete AND parallel-mode safety gaps (CR-01/02) closed by 03-09 with regression coverage. REQUIREMENTS.md already `[x]`. |
| AUTHOR-03 | 03-02 | `gemini-3.1-flash-tts-preview` prioritized | ✓ SATISFIED | `DEFAULT_MODELS[0]` confirmed (render-gemini-audio.ts:27). REQUIREMENTS.md updated `[ ]`→`[x]` in this verification. |
| AUTHOR-04 | 03-08 | Ultra-short-line silent-skip fix | ✓ SATISFIED | Unchanged. REQUIREMENTS.md `[x]`. |
| AUTHOR-05 | 03-03 | Cipher/plain parity validator hard-fail | ✓ SATISFIED | Unchanged. REQUIREMENTS.md `[x]`. |
| AUTHOR-06 | 03-08 | Audio-duration-anomaly detector | ✓ SATISFIED (with WR-05 precision caveat, unchanged) | Mechanism wired and tested. REQUIREMENTS.md updated `[ ]`→`[x]` in this verification. |
| AUTHOR-07 | 03-05/03-08 | Optional STT round-trip diff | ✓ SATISFIED | Unchanged. REQUIREMENTS.md `[x]`. |
| AUTHOR-08 | 03-07 | `preview-bake.ts` localhost-only scrubber | ✓ SATISFIED | Confirmed present and tested; now also reads merged index. REQUIREMENTS.md updated `[ ]`→`[x]` in this verification. |
| AUTHOR-09 | 03-06 / 03-10 | `p-limit` concurrency cap + D-08 provenance integrity | ✓ SATISFIED | Cap applied at ritual-fan-out level (unchanged); CR-03 `_INDEX.json` race closed by 03-10 with regression coverage. REQUIREMENTS.md `[x]`. |
| AUTHOR-10 | 03-04 | `idb-schema.ts` single source of truth | ✓ SATISFIED | Confirmed. REQUIREMENTS.md updated `[ ]`→`[x]` in this verification. |

**No orphaned requirements** — all 10 AUTHOR-* IDs declared across the phase's plans are accounted for in REQUIREMENTS.md. **REQUIREMENTS.md traceability doc-sync completed** as part of this re-verification (AUTHOR-01/03/06/08/10 checkboxes and traceability table rows updated to match code-confirmed status).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `docs/BAKE-WORKFLOW.md` | 268 | Stale claim that `--resume-state-path` wiring is a "future revision" — it is wired today (03-09) | ℹ️ INFO | Documentation lag, not a functional gap. Recommend a follow-up one-line doc fix, not a re-plan. |
| `scripts/invalidate-mram-cache.ts` | 76 | `positional` filter still collects space-separated flag values (WR-03, review-confirmed live, unchanged) | ⚠️ WARNING | Maintenance-script usability bug; does not touch any roadmap success criterion or bake-time data integrity. Untouched by this gap-closure wave. |
| `scripts/build-mram-from-dialogue.ts` | 274 | Duration-anomaly sample pool includes gate-failed samples (WR-05, unchanged) | ⚠️ WARNING | Real precision degradation over a ritual with several failing short lines; does not defeat the mechanism (SC5 still VERIFIED). Not one of the 4 gaps assigned to 03-09/03-10; out of scope for this closure wave. |
| `scripts/lib/google-tts.ts` | 57-60 | Weaker key redaction than sibling `stt-verify.ts` (WR-06, unchanged) | ⚠️ WARNING | Low-likelihood info-disclosure in bake logs; not blocking. |
| `src/lib/storage.ts` | 23-70 | First-use encryption-key race (WR-07, unchanged) | ⚠️ WARNING | Pre-existing pattern, low-likelihood single-user race; not introduced by this phase. |

No `TBD`/`FIXME`/`XXX` debt markers found in any file touched by 03-09 or 03-10. No `TODO`/`HACK`/`PLACEHOLDER` markers found in `bake-all.ts`, `build-mram-from-dialogue.ts`, or `preview-bake.ts`.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite (repo-wide) | `npx vitest run` | 51 files, 614 tests, all passing | ✓ PASS (matches the 614/614 claimed by the task brief) |
| Phase 3 scoped suite | `npx vitest run scripts/__tests__/ src/lib/__tests__/` | 39 files, 542 tests, all passing | ✓ PASS |
| Gap-closure test files directly | `npx vitest run scripts/__tests__/bake-all.test.ts scripts/__tests__/bake-passphrase-handshake.test.ts scripts/__tests__/bake-index-shard.test.ts scripts/__tests__/build-mram-short-line.test.ts scripts/__tests__/preview-bake.test.ts` | 5 files, 128 tests, all passing | ✓ PASS |
| Real un-mocked passphrase handshake (positive + negative) | Contained within `bake-passphrase-handshake.test.ts` — spawns real `npx tsx build-mram-from-dialogue.ts` subprocess | Both cases pass (exit 0 + decryptable .mram; exit non-zero + stderr names MRAM_PASSPHRASE, no hang) | ✓ PASS |
| `choosePassphraseSource` env-first ordering (source-level) | `grep -n` line-number comparison: env check at build-mram-from-dialogue.ts:721 vs. `process.stdin.isTTY` reference inside `promptPassphrase` at 738 | 721 < 738 — env is consulted first | ✓ PASS |
| `resolveEffectiveParallel` wired into `main()` | Source read of `bake-all.ts:660,666-670` | `parallelN = resolveEffectiveParallel(flags)`; `checkParallelFallbackConflict(parallelN, flags.onFallback, true)` | ✓ PASS |
| `_INDEX.json` shard isolation | Source read + `bake-index-shard.test.ts` "each slug lands in its own distinct shard file" test | Confirmed: `upsertBakeIndexEntry` never touches `_INDEX.json` directly | ✓ PASS |
| No new `tsc` errors in gap-closure files | `npx tsc --noEmit -p tsconfig.json \| grep -E "scripts/(bake-all\|build-mram-from-dialogue\|preview-bake)\.ts"` | No output | ✓ PASS |
| No debt markers introduced | `grep -n "TBD\|FIXME\|XXX"` across all 03-09/03-10 touched files | No matches | ✓ PASS |

`bake-all.ts` was not run against real rituals with real API keys (no `rituals/` dialogue content or Gemini/Google Cloud credentials present on this machine — consistent with every plan's own test strategy of temp-dir fixtures). This is the reason "bake five rituals in parallel" remains a human-verification item below, even though every code-level defect that previously blocked it is now closed.

### Probe Execution

No `scripts/*/tests/probe-*.sh` convention or PLAN/SUMMARY-declared probes found for this phase. SKIPPED (no probe-based verification declared).

### Human Verification Required

1. **Single-line dialogue edit re-bakes in under a minute** — needs a real Gemini key and existing baked cache; code mechanism confirmed correct by static analysis, timing itself needs a live run. Unaffected by this gap-closure wave.
2. **Bake five rituals in parallel without manual babysitting** — needs real keys and an interactive TTY. All three code-level blockers (CR-01 passphrase corruption, CR-02 forbidden default combination, CR-03 index race) are now closed with regression coverage including a real un-mocked subprocess test; this check is now expected to PASS on a live run, but has not been observed live by the verifier.
3. **Scrub baked lines in a browser at `localhost:8883`** — server/tests verified structurally; actual listen-through deferred per 03-07-SUMMARY.md. Unaffected by this gap-closure wave.
4. **EA rituals rebake backfills the 32 previously-skipped short lines** — needs real Gemini + Google Cloud TTS keys and the actual EA content. Unaffected by this gap-closure wave.

### Gaps Summary

All 4 gaps from the initial verification are closed and code-confirmed:

1. **CR-01 (passphrase corruption)** — closed by 03-09's `choosePassphraseSource()` shared decision function (env always wins over TTY) plus defense-in-depth `stdio[0]="ignore"` for non-interactive fallback modes. Proven by the repo's first real, un-mocked child-process regression test.
2. **CR-02 (forbidden parallel+ask default)** — closed by 03-09's `resolveEffectiveParallel()`, which resolves the two conflicting defaults to a safe `parallel=1` on a bare invocation instead of skipping enforcement; the refusal now runs unconditionally on the resolved value.
3. **CR-03 (`_INDEX.json` lost-update race)** — closed by 03-10's per-slug shard architecture: each child owns an exclusive `_INDEX.<slug>.json` file (no contention by construction), readers merge all shards, and the parent consolidates race-free after a clean wave.
4. **WR-02 (`--resume` doesn't survive a crash)** — closed by 03-09's incremental, unconditional ritual-granularity resume writes plus wiring the child's existing per-line `--resume-state-path` through the spawn boundary.

All four fixes are backed by passing regression tests (128 tests across the 5 directly-relevant test files; 614/614 across the full repo suite; zero new `tsc` errors in touched files). As a doc-sync side effect of this re-verification, `.planning/REQUIREMENTS.md`'s AUTHOR-01/03/06/08/10 checkboxes and traceability rows — previously lagging behind code reality — have been corrected to `[x]`/`✓ Validated`.

**Why status is `human_needed` rather than `passed`:** all 11 observable truths are code-verified and the score is 11/11, but four items require a live run with real API keys and/or a human listening/watching, per Step 9 of the verification process (human items take priority over a clean score). None of these four items are new — they were already flagged in the initial verification — but item 2 ("bake five rituals in parallel") should now be expected to succeed rather than fail, since its blocking code defects are closed.

---

_Verified: 2026-07-02T19:00:11Z_
_Verifier: Claude (gsd-verifier)_
