---
phase: 03-authoring-throughput
verified: 2026-07-02T18:05:46Z
status: gaps_found
score: 7/11 must-haves verified
overrides_applied: 0
gaps:
  - truth: "--resume picks up cleanly after a crash (Roadmap SC 2, second clause)"
    status: failed
    reason: >
      bake-all.ts's own resume state (_RESUME.json, ritual granularity) is only
      written AFTER bakeSelected() fully resolves, and only when the CURRENT
      run itself was started with --resume (scripts/bake-all.ts:653-656). A
      crash/Ctrl-C/SIGKILL mid-fan-out — the exact scenario the flag exists
      for — terminates before that line ever runs, so no resume state exists
      to resume from. A first run invoked WITHOUT --resume also records
      nothing even on failure, so a later --resume retry has nothing to skip.
      Separately, build-mram-from-dialogue.ts implements true per-line resume
      via --resume-state-path (scripts/build-mram-from-dialogue.ts:685-687,
      1164-1188), but bake-all.ts's buildMramSpawnArgs
      (scripts/bake-all.ts:370-387) never passes that flag to spawned
      children, so even a successful ritual-granularity resume restarts each
      un-completed ritual from its first line rather than its interrupted
      line. docs/BAKE-WORKFLOW.md:268 candidly documents this as unwired
      ("a future revision of bake-all.ts can wire through").
    artifacts:
      - path: "scripts/bake-all.ts"
        issue: "Resume state written only post-completion and only when --resume was already set (lines 653-656); --resume-state-path never passed to spawned children (buildMramSpawnArgs, lines 370-387)."
    missing:
      - "Write resume state incrementally inside bakeSelected's per-ritual success path, unconditionally (matches code review WR-02 fix)."
      - "Pass --resume-state-path=<per-ritual file> in buildMramSpawnArgs so line-level progress survives a mid-ritual crash, not just ritual-level."
  - truth: "Passphrase prompted once and passed safely to every parallel child (Plan 03-06 must-have, underpins phase goal 'without weekends lost')"
    status: failed
    reason: >
      bake-all.ts's documented contract is 'passphrase prompted ONCE, then
      passed via MRAM_PASSPHRASE env var.' But build-mram-from-dialogue.ts's
      promptPassphrase() (scripts/build-mram-from-dialogue.ts:614-621) checks
      process.stdin.isTTY FIRST and only consults the env var when stdin is
      NOT a TTY. bake-all.ts spawns children with
      stdio: ["inherit","inherit","inherit"] (scripts/bake-all.ts:400-404),
      so each child's stdin IS a TTY in any interactive run and each child
      re-prompts, ignoring MRAM_PASSPHRASE. At --parallel 1 this is a
      contract-violating re-prompt per ritual. At --parallel > 1 (default 4)
      it is destructive: multiple children put the same shared TTY into raw
      mode and read from it concurrently — keystrokes are delivered to
      whichever child reads first, so each child can assemble an arbitrary
      substring of what Shannon types, silently encrypting .mram output
      under a garbled, undecryptable passphrase. No test exercises the real
      child handshake — scripts/__tests__/bake-all.test.ts fully mocks
      node:child_process (spawn), so this path has zero test coverage.
    artifacts:
      - path: "scripts/build-mram-from-dialogue.ts"
        issue: "promptPassphrase() (lines 614-621) checks isTTY before MRAM_PASSPHRASE — env var never consulted when the child inherits a TTY."
      - path: "scripts/bake-all.ts"
        issue: "bakeRitual (lines 393-414) spawns children with stdio: [\"inherit\",\"inherit\",\"inherit\"], guaranteeing each child's stdin is a TTY in interactive use."
    missing:
      - "Make promptPassphrase() (and bake-all.ts's own readPassphrase) check MRAM_PASSPHRASE unconditionally before consulting isTTY, per code review CR-01 fix."
      - "Defense in depth: spawn children with stdio: [\"ignore\",\"inherit\",\"inherit\"] when --on-fallback is continue/abort so they have no interactive stdin at all."
  - truth: "--parallel > 1 refuses --on-fallback=ask (Plan 03-06 must-have; T-03-14 in the phase threat model)"
    status: failed
    reason: >
      checkParallelFallbackConflict correctly refuses parallel>1 + ask/wait
      when flagged=true, but main() (scripts/bake-all.ts:594-602) passes
      flagged = flags.parallelFlagPresent || flags.onFallbackFlagPresent. A
      bare invocation — `npx tsx scripts/bake-all.ts`, or the workflow doc's
      own daily-driver example `bake-all.ts --changed-only`
      (docs/BAKE-WORKFLOW.md:17) — touches neither flag, so the check is
      skipped and the run proceeds with the two conflicting DEFAULTS:
      parallel=4 AND on-fallback=ask, exactly the composition the guard
      exists to prevent. Combined with the passphrase gap above, a bare
      interactive invocation is broken from the first prompt. This is not an
      oversight: scripts/__tests__/bake-all.test.ts:108-114 explicitly locks
      in "skips the check when neither flag was explicitly passed" as
      intended behavior, and 03-06-SUMMARY.md documents the same tradeoff as
      a deliberate resolution of a conflict between two of the plan's own
      acceptance criteria (bare --dry-run must exit 0 vs. the explicit-flags
      refusal must exit 1). The code review (CR-02) independently flagged
      this as Critical and proposes a fix that satisfies both acceptance
      criteria without silently running the forbidden combination.
    artifacts:
      - path: "scripts/bake-all.ts"
        issue: "main() (lines 594-602) gates enforcement on flagged=parallelFlagPresent||onFallbackFlagPresent; bare invocation runs parallel=4+on-fallback=ask unchecked."
      - path: "scripts/__tests__/bake-all.test.ts"
        issue: "Lines 108-114 assert the bare-invocation skip as correct behavior, codifying the gap rather than catching it."
    missing:
      - "Resolve the default conflict instead of skipping enforcement: when neither flag is touched, degrade parallelism to 1 (or default on-fallback to continue when parallelN>1), per code review CR-02 fix, then always enforce the refusal."
    human_note: >
      This may be an intentional-tradeoff candidate for an override (the
      executor documented the reasoning), but the resulting behavior is the
      one condition the phase's own threat model (T-03-14) exists to
      prevent, so it is reported as a gap rather than auto-overridden. If
      Shannon accepts the current behavior as-is, add an override entry
      instead of a closure plan.
  - truth: "Fallback-tier renders are reliably recorded in the bake manifest for later premium upgrade (D-08, roadmap SC 5/7 supporting data)"
    status: failed
    reason: >
      upsertBakeIndexEntry (scripts/build-mram-from-dialogue.ts:338-349) is a
      read-entire-file, modify-one-entry, write-entire-file operation. The
      tmp+rename write is atomic per call, but the read-modify-write
      SEQUENCE is not serialized across the multiple build-mram-from-
      dialogue.ts child processes bake-all.ts --parallel N runs concurrently
      against the same shared rituals/_bake-cache/_INDEX.json. Two children
      interleaving (A reads, B reads, A writes, B writes) means the last
      writer clobbers the other's entries — silent last-writer-wins loss of
      D-08 tier/provenance data. Lost entries are never regenerated (index
      entries are written only on fresh renders; cache hits skip them), so
      fallback-tier lines silently vanish from preview-bake.ts's scrubber
      badge and from the "candidates for premium upgrade" workflow the
      manifest exists to support. Unit tests only exercise single-process
      upserts.
    artifacts:
      - path: "scripts/build-mram-from-dialogue.ts"
        issue: "upsertBakeIndexEntry (lines 338-349) has no cross-process locking or per-process sharding around the _INDEX.json read-modify-write."
    missing:
      - "Serialize index writes across processes: per-slug-keyed shard files merged by readers (smallest change per code review CR-03), an advisory lock, or parent-owned writes via IPC."
deferred: []
human_verification:
  - test: "Single-line dialogue edit re-bakes in under a minute"
    expected: "Editing one line in an existing ritual's dialogue file, then running `bake-all.ts --changed-only`, re-renders only that one line (cache-hit for all others) and completes in well under a minute."
    why_human: "Requires a real GOOGLE_GEMINI_API_KEY and an existing baked ritual with real audio in the cache — not available on the verification machine. The code mechanism (content-addressed cache keyed on modelId+text+voice+style) is confirmed correct by static analysis and unit tests, but wall-clock timing needs a live run."
  - test: "Bake five rituals' worth of content in parallel without manual babysitting"
    expected: "Running `bake-all.ts --parallel 4` (or the bare default) against 5 rituals completes cleanly with correctly-decryptable .mram outputs and no lost _INDEX.json provenance entries."
    why_human: "Cannot be safely exercised without real API keys and a real interactive TTY session; also currently expected to FAIL per the CR-01/CR-02/CR-03 gaps above — this check should be re-run by a human only after those gaps are closed."
  - test: "Scrub baked lines in a browser against localhost:8883 before re-encrypting a .mram"
    expected: "`npx tsx scripts/preview-bake.ts`, open http://localhost:8883, browse a ritual's lines, and audibly confirm a rendered line before re-encrypting."
    why_human: "Requires a real baked cache and a human listening — deferred explicitly in 03-07-SUMMARY.md and docs/BAKE-WORKFLOW.md's UAT section; server + containment + tests are verified structurally but the actual listen-through has not happened."
  - test: "EA rituals rebake backfills the 32 previously-skipped short lines"
    expected: "Re-baking the existing EA rituals (which have runtime-TTS-skipped ultra-short lines per bake.log) produces audio for every previously-missing line via the Gemini-padded/Google-fallback path."
    why_human: "Requires a real Gemini + Google Cloud TTS key and the actual EA ritual content; deferred per docs/BAKE-WORKFLOW.md's UAT section."
---

# Phase 3: Authoring Throughput Verification Report

**Phase Goal:** Shannon can re-bake a single-line edit in under a minute instead of re-rendering a full ritual, and can bake five rituals' worth of content without weekends lost to serial Gemini calls
**Verified:** 2026-07-02T18:05:46Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: A one-line text edit causes `bake-all.ts` to re-render exactly one line, not the whole ritual | ✓ VERIFIED | `computeCacheKey` (render-gemini-audio.ts:620-628) is content-addressed on `text+style+voice+modelId+CACHE_KEY_VERSION`; `build-mram-from-dialogue.ts`'s per-line render loop (~1290-1310) checks cache/resume hits before rendering, so unchanged lines cache-hit and only the edited line's key misses. `--changed-only` re-selects the whole ritual via `cache-manifest.ts`, but within it the line-level cache still gates actual Gemini calls. |
| 2 | SC2a: `--since <git-ref>` (compat) / `--changed-only` only rebakes rituals changed since the manifest baseline | ✓ VERIFIED | `getChangedRituals` (cache-manifest.ts:92-113) compares sha256 hashes of both dialogue files against `_manifest.json`; `--since` is an intentional, documented alias (CONTEXT.md discretion (a)) that prints a deprecation warning and delegates to the same content-hash logic — git-ref semantics are structurally impossible on gitignored dialogue files, so this is a reasoned substitution, not a missing feature. |
| 3 | SC2b: `--resume` picks up cleanly after a crash | ✗ FAILED | Resume state is written only after full run completion and only when `--resume` was already set (bake-all.ts:653-656); `--resume-state-path` (true per-line resume) exists in the child but is never passed by `buildMramSpawnArgs` (bake-all.ts:370-387). See gap. |
| 4 | SC3: No `.mram` with an ultra-short line is ever baked with that line silently missing | ✓ VERIFIED | `MIN_BAKE_LINE_CHARS`/`preSkipShort` fully removed (`grep` confirms absence in `scripts/`); short lines route Gemini-padded → `googleTtsBakeCall` fallback; both-engines-fail throws naming the line (build-mram-from-dialogue.ts:499-527). 521 tests pass including `build-mram-short-line.test.ts`'s both-engines-fail case. |
| 5 | SC4: The parity validator refuses to bake a deliberately-corrupted dialogue pair | ✓ VERIFIED | `validatePair`/`validateParsedPair` (author-validation.ts) hard-fails speaker mismatch, action-tag mismatch, and the new `[D-08 bake-band]` word-ratio band `[0.5x, 2x]` at `severity:"error"`; `validateOrFail` wraps and exits 1; called in both `bake-all.ts:616` (pre-flight, before any spawn) and `build-mram-from-dialogue.ts:790` (before any API call). |
| 6 | SC5: Bake-time duration-anomaly detector flags any baked line >3x the ritual's median | ✓ VERIFIED (with WARNING) | `isDurationAnomaly`/`runDurationAnomalyGate` wired with a 30-sample warm-up window (build-mram-from-dialogue.ts:255-275, 587); mechanism functions and is tested. Code review WR-05: the sample pool is polluted by gate-failed samples (appended even when tripped), degrading precision over a ritual with several failing short lines — not a defeat of the mechanism, but a real accuracy bug. |
| 7 | SC6: `src/lib/idb-schema.ts` is the single `onupgradeneeded` source of truth; dual-open test confirms all stores exist regardless of open order | ✓ VERIFIED | `storage.ts:17` and `voice-storage.ts:14` both `import ... from "./idb-schema"`; `grep -rn "DB_VERSION *= *[0-9]" src/lib/` matches only `idb-schema.ts`; `src/lib/__tests__/idb-schema.test.ts` (part of the 521 passing tests) covers dual-open + v4→v5 preservation. |
| 8 | SC7: Shannon can scrub baked lines in a browser against `localhost:8883` before re-encrypting a `.mram` | ✓ VERIFIED (structurally) | `preview-bake.ts` (524 lines): `assertDevOnly()` at module load, `ensureLoopback` refusing non-loopback binds, three-layer path containment (regex, `path.resolve`, `fs.realpathSync`), Range support, default port 8883 — all present and covered by `preview-bake.test.ts` (part of the 521 passing tests). Actual browser listen-through is human-only (see Human Verification). |
| 9 | Plan 03-06 must-have: passphrase prompted once, passed safely to every parallel child | ✗ FAILED | `promptPassphrase()` in the spawned child checks `isTTY` before `MRAM_PASSPHRASE` (build-mram-from-dialogue.ts:614-621); `bake-all.ts` spawns with inherited TTY stdio (bake-all.ts:400-404). Code review CR-01. See gap. |
| 10 | Plan 03-06 must-have: `--parallel > 1` refuses `--on-fallback=ask` unconditionally | ✗ FAILED | Enforcement is gated on `flags.parallelFlagPresent \|\| flags.onFallbackFlagPresent` (bake-all.ts:594-602); a bare invocation runs the conflicting defaults (parallel=4, on-fallback=ask) unchecked. Code review CR-02; codified as intended in `bake-all.test.ts:108-114`. See gap. |
| 11 | Plan 03-08 must-have: fallback-tier renders reliably recorded in `_INDEX.json` for premium upgrade (D-08) | ✗ FAILED | `upsertBakeIndexEntry` (build-mram-from-dialogue.ts:338-349) is an unlocked cross-process read-modify-write on a single shared file; concurrent `bake-all.ts --parallel` children can silently clobber each other's entries. Code review CR-03. See gap. |

**Score:** 7/11 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/lib/bake-math.ts` | Pure duration/word-diff math | ✓ VERIFIED | Exports `computeMedianSecPerChar`, `isDurationAnomaly`, `wordDiff`; no `fs`/`process` imports; used by both `stt-verify.ts` and `build-mram-from-dialogue.ts`. |
| `src/lib/dev-guard.ts` | `isDev`/`assertDevOnly` | ✓ VERIFIED | Used at module load in `preview-bake.ts`. |
| `scripts/lib/cache-manifest.ts` | Content-hash change detection | ✓ VERIFIED | No `git`/`spawn`/`execFileSync` usage; hash-based `getChangedRituals`/`recordBaked`. |
| `scripts/lib/resume-state.ts` | Atomic tmp+rename resume read/write | ✓ VERIFIED (module) / ⚠️ misused by caller | Module itself is a verbatim, correct port; the *caller* (`bake-all.ts`) doesn't invoke it incrementally — see gap #3 above. |
| `scripts/bake-all.ts` | Multi-ritual orchestrator, ≥300 lines | ✓ EXISTS, ✗ NOT SOUND | 675 lines, p-limit-capped, validator-gated — but the passphrase and parallel/fallback-conflict gaps make it unsafe for its primary parallel-bake use case. |
| `scripts/lib/validate-or-fail.ts` | Shared CLI validator gate | ✓ VERIFIED | Imports `validatePair` from `src/lib/author-validation`; no `--force`/bypass. |
| `src/lib/idb-schema.ts` | Single-source DB schema, `DB_VERSION=5` | ✓ VERIFIED | 6 `objectStoreNames.contains` guards; `feedbackTraces` shell present. |
| `scripts/lib/google-tts.ts` | Preamble-free Google TTS fallback call | ✓ VERIFIED | `grep -c "voice-cast"` = 0 (structural guard); redaction present though weaker than sibling (WR-06, info-level). |
| `scripts/lib/stt-verify.ts` | Groq STT round-trip verifier | ✓ VERIFIED | Imports `wordDiff` from `bake-math`; used in both short-line (default-on) and `--verify-audio` paths. |
| `scripts/preview-bake.ts` | Localhost-only Opus scrubber, ≥250 lines | ✓ VERIFIED | 524 lines; all containment layers present and tested. |
| `scripts/build-mram-from-dialogue.ts` | Short-line routing + all gates + `_INDEX.json` | ✓ VERIFIED (functionality) / ✗ (cross-process safety) | All gates wired and tested in isolation; `_INDEX.json` writer is not safe under the orchestrator's own parallel mode (CR-03). |
| `docs/BAKE-WORKFLOW.md` | Updated runbook | ✓ VERIFIED | References `bake-all`, `_bake-cache`, `8883`, all new flags; candidly documents the `--resume-state-path` wiring gap itself. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `scripts/bake-all.ts` | `scripts/lib/validate-or-fail.ts` | pre-flight gate | ✓ WIRED | `runValidatorGate(slugs)` called before dry-run branch and before any spawn (bake-all.ts:616). |
| `scripts/bake-all.ts` | `p-limit` | `pLimit(parallelN)` | ✓ WIRED | Confirmed at bake-all.ts:441. |
| `scripts/bake-all.ts` | `scripts/lib/cache-manifest.ts` | `getChangedRituals` | ✓ WIRED | Used in `selectSlugs`. |
| `scripts/build-mram-from-dialogue.ts` | `scripts/lib/validate-or-fail.ts` | pre-bake gate | ✓ WIRED | `validateOrFail(plainPath, cipherPath)` at line 790. |
| `scripts/build-mram-from-dialogue.ts` | `scripts/lib/google-tts.ts` | short-line fallback | ✓ WIRED | `googleTtsBakeCall` called in `renderShortLineWithGates` (line 510). |
| `scripts/build-mram-from-dialogue.ts` | `scripts/lib/bake-math.ts` | duration-anomaly gate | ✓ WIRED | `isDurationAnomaly` used in `runDurationAnomalyGate`. |
| `scripts/build-mram-from-dialogue.ts` | `rituals/_bake-cache/_INDEX.json` | tier-aware manifest writes | ⚠️ WIRED BUT UNSAFE | Writes happen (atomic per-write), but the read-modify-write sequence races across the parallel children `bake-all.ts` itself spawns (CR-03). |
| `scripts/bake-all.ts` (spawn) | `scripts/build-mram-from-dialogue.ts` (`--resume-state-path`) | per-line resume plumbing | ✗ NOT WIRED | `buildMramSpawnArgs` never emits `--resume-state-path`; confirmed absent from the constructed args array. |
| `src/lib/storage.ts` / `src/lib/voice-storage.ts` | `src/lib/idb-schema.ts` | `import { openDB, ... }` | ✓ WIRED | Both files import from `./idb-schema`; no local `DB_VERSION` remains outside `idb-schema.ts`. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| AUTHOR-01 | 03-02 | Content-addressed bake cache at `rituals/_bake-cache/`, keyed incl. modelId | ✓ SATISFIED (code) / ⚠️ REQUIREMENTS.md still shows `[ ]` | Cache relocated, v3 key includes modelId (render-gemini-audio.ts:58, 620-628). Traceability doc not updated — see Anti-Patterns. |
| AUTHOR-02 | 03-06 | `bake-all.ts` orchestrator with flags | ✓ SATISFIED (mechanism) / ✗ SEE GAPS | Orchestrator exists and is flag-complete, but parallel-mode safety gaps (CR-01/02/03) undermine its core promise. REQUIREMENTS.md correctly marks `[x]`. |
| AUTHOR-03 | 03-02 | `gemini-3.1-flash-tts-preview` prioritized | ✓ SATISFIED (code) / ⚠️ REQUIREMENTS.md still shows `[ ]` | `DEFAULT_MODELS[0]` confirmed (render-gemini-audio.ts:27); regression test present. |
| AUTHOR-04 | 03-08 | Ultra-short-line silent-skip fix | ✓ SATISFIED | Hard-skip removed; alternate-engine routing confirmed. REQUIREMENTS.md `[x]`. |
| AUTHOR-05 | 03-03 | Cipher/plain parity validator hard-fail | ✓ SATISFIED | Confirmed. REQUIREMENTS.md `[x]`. |
| AUTHOR-06 | 03-08 | Audio-duration-anomaly detector | ✓ SATISFIED (code, with WR-05 precision caveat) / ⚠️ REQUIREMENTS.md still shows `[ ]` | Mechanism wired and tested. |
| AUTHOR-07 | 03-05/03-08 | Optional STT round-trip diff | ✓ SATISFIED | Confirmed. REQUIREMENTS.md `[x]`. |
| AUTHOR-08 | 03-07 | `preview-bake.ts` localhost-only scrubber | ✓ SATISFIED (code) / ⚠️ REQUIREMENTS.md still shows `[ ]` | Confirmed present and tested. |
| AUTHOR-09 | 03-06 | `p-limit` concurrency cap | ✓ SATISFIED (at ritual granularity, not literal line-level in build-mram-from-dialogue.ts) | `build-mram-from-dialogue.ts` renders lines strictly sequentially (no internal concurrency to cap); the cap is correctly applied at the `bake-all.ts` ritual-fan-out level instead, which bounds total concurrent Gemini load system-wide. REQUIREMENTS.md `[x]`. |
| AUTHOR-10 | 03-04 | `idb-schema.ts` single source of truth | ✓ SATISFIED | Confirmed. REQUIREMENTS.md still shows `[ ]` — traceability gap. |

**No orphaned requirements** — all 10 AUTHOR-* IDs declared across the 8 plans are accounted for in REQUIREMENTS.md.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `.planning/REQUIREMENTS.md` | 69,71,74,76,84 | AUTHOR-01/03/06/08/10 checkboxes still `[ ]` despite plans 03-02/03-04/03-07/03-08 implementing and code-confirming them | ℹ️ INFO | Documentation traceability lag, not a functional gap — every one of these was independently confirmed present in the codebase during this verification. Recommend a follow-up doc update, not a re-plan. |
| `scripts/bake-all.ts` | 400-404 | Children spawned with inherited TTY stdio in interactive use | 🛑 BLOCKER | See gap #2 (CR-01). |
| `scripts/bake-all.ts` | 594-602 | Parallel/fallback conflict check skipped on bare invocation | 🛑 BLOCKER | See gap #3 (CR-02). |
| `scripts/build-mram-from-dialogue.ts` | 338-349 | Unlocked cross-process read-modify-write on `_INDEX.json` | 🛑 BLOCKER | See gap #4 (CR-03). |
| `scripts/bake-all.ts` | 653-656 | Resume state written post-hoc only, not incrementally | 🛑 BLOCKER | See gap #1 (WR-02). |
| `scripts/invalidate-mram-cache.ts` | 76 | `positional` filter still collects space-separated flag values (WR-03, review-confirmed live) | ⚠️ WARNING | Maintenance-script usability bug; does not touch any roadmap success criterion or bake-time data integrity. Not blocking this phase. |
| `scripts/lib/google-tts.ts` | 57-60 | Weaker key redaction than sibling `stt-verify.ts` (WR-06) | ⚠️ WARNING | Low-likelihood info-disclosure in bake logs; not blocking. |
| `src/lib/storage.ts` | 23-70 | First-use encryption-key race (WR-07) | ⚠️ WARNING | Pre-existing pattern, low-likelihood single-user race; not introduced fresh by this phase's roadmap criteria. |

No `TBD`/`FIXME`/`XXX` debt markers found in any file modified by this phase.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full Phase 3 test suite | `npx vitest run scripts/__tests__/ src/lib/__tests__/` | 37 files, 521 tests, all passing | ✓ PASS |
| `MIN_BAKE_LINE_CHARS`/`preSkipShort` fully retired | `grep -rn "MIN_BAKE_LINE_CHARS\|preSkipShort" scripts/` | No matches | ✓ PASS |
| `idb-schema.ts` sole `DB_VERSION` source | `grep -rn "DB_VERSION *= *[0-9]" src/lib/` | Only `idb-schema.ts` | ✓ PASS |
| `test-google-line94.mjs` deleted per plan 03-05 | `ls test-google-line94.mjs` | File does not exist | ✓ PASS |
| CR-01/02/03 code-review findings still present | Direct source read of the cited line ranges | All three confirmed unfixed | ✗ FAIL (expected — matches 03-REVIEW.md) |

Bake-all.ts was not run against real rituals (no `rituals/` dialogue content or API keys present on this machine — consistent with every plan's own test strategy of temp-dir fixtures).

### Probe Execution

No `scripts/*/tests/probe-*.sh` convention or PLAN/SUMMARY-declared probes found for this phase. SKIPPED (no probe-based verification declared).

### Human Verification Required

1. **Single-line dialogue edit re-bakes in under a minute** — needs a real Gemini key and existing baked cache; code mechanism confirmed correct by static analysis, timing itself needs a live run.
2. **Bake five rituals in parallel without manual babysitting** — needs real keys and an interactive TTY; expected to currently FAIL per the CR-01/02/03 gaps and should be re-run only after those are closed.
3. **Scrub baked lines in a browser at `localhost:8883`** — server/tests verified structurally; actual listen-through deferred per 03-07-SUMMARY.md.
4. **EA rituals rebake backfills the 32 previously-skipped short lines** — needs real Gemini + Google Cloud TTS keys and the actual EA content.

### Gaps Summary

The library layer of Phase 3 (bake-math, dev-guard, cache-manifest, resume-state module, validate-or-fail, google-tts, stt-verify, voice-cast, idb-schema, preview-bake) is solid, well-tested, and each individually satisfies its roadmap success criterion. Six of seven numbered roadmap success criteria (1, 3, 4, 5, 6, 7) and the first half of the phase goal ("re-bake a single-line edit in under a minute") are structurally achieved.

The orchestrator (`bake-all.ts`) composing with the bake entrypoint (`build-mram-from-dialogue.ts`) under parallelism — exactly the second half of the phase goal ("bake five rituals' worth of content without weekends lost to serial Gemini calls") — has four concrete, code-confirmed defects, three of which the standard-depth code review independently rated Critical:

1. Passphrase corruption risk under any interactive parallel bake (CR-01) — children re-prompt on a shared raw-mode TTY instead of honoring the already-collected passphrase, and can silently encrypt `.mram` files under garbled, undecryptable passphrases.
2. The forbidden `parallel>1 + on-fallback=ask` combination runs by default on a bare invocation (CR-02) — the exact composition the phase's own threat model (T-03-14) says must be refused, and this is codified as intended behavior in the current test suite.
3. `_INDEX.json` provenance entries are silently lost to a cross-process read-modify-write race under `--parallel` (CR-03), undermining the D-08 keep-and-upgrade workflow the preview scrubber depends on.
4. `--resume` does not actually survive a crash in the scenario it's documented for (WR-02) — state is written only after a run completes, and per-line resume plumbing exists in the child but is never wired from the orchestrator.

These are not exotic edge cases — they are the default, unadorned way Shannon would invoke the tool to achieve the phase's stated purpose. All four gaps center on `scripts/bake-all.ts`'s composition with its child process and are naturally grouped for a single focused closure plan.

---

_Verified: 2026-07-02T18:05:46Z_
_Verifier: Claude (gsd-verifier)_
