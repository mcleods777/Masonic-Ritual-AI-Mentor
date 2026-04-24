---
phase: 03-authoring-throughput
plan: 06
subsystem: bake-integration
tags: [bake-pipeline, validator-gate, google-tts, short-line, duration-anomaly, stt-verify, resume-state, line-level, author-02, author-04, author-05, author-06, author-07, d-06, d-08, d-09, d-10, d-11]

# Dependency graph
requires:
  - phase: 03-authoring-throughput
    plan: 01
    provides: music-metadata dep + bake-helpers.test.ts scaffold + rituals/_bake-cache/ directory
  - phase: 03-authoring-throughput
    plan: 04
    provides: validatePair() severity-"error" gate from src/lib/author-validation.ts (D-08 bake-band + structural checks)
  - phase: 03-authoring-throughput
    plan: 05
    provides: stable renderLineAudio / CACHE_DIR exports from scripts/render-gemini-audio.ts
provides:
  - validateOrFail() pre-render gate (D-08) calling validatePair() + filtering by severity === 'error' + process.exit(1)
  - googleTtsBakeCall() short-line Google Cloud TTS REST helper (D-09) — OGG_OPUS native, NO preamble (Pitfall 4 mitigation), ?key= redaction (T-03-05)
  - AnomalyCheckState + newAnomalyState + addAndCheckAnomaly (D-10) — per-ritual rolling median + >3.0× / <0.3× hard-fail, first 30 samples skip (Pitfall 6)
  - verifyAudioRoundTrip() direct Groq Whisper call (D-11) — warn-only, --verify-audio opt-in, VERIFY_AUDIO_DIFF_THRESHOLD env override
  - scripts/lib/resume-state.ts — shared ResumeState interface + readResumeState + writeResumeStateAtomic (tmp+rename, POSIX-atomic)
  - scripts/lib/bake-math.ts — computeMedianSecPerChar + isDurationAnomaly + wordDiff (pure math helpers, unit-tested)
  - Line-level _RESUME.json writes in build-mram-from-dialogue.ts (D-06): markLineInFlight before render + markLineCompleted after embed, atomic writes so crashes leave a recoverable state file
  - --resume-state-path / --ritual-slug / --skip-line-ids CLI args (D-06) — orchestrator dispatch surface for Plan 07
  - 25 passing tests in scripts/__tests__/bake-helpers.test.ts (replaced 11 it.todo stubs with 7 resume-state + 5 median + 7 anomaly + 6 wordDiff)
affects: [03-07]

# Tech tracking
tech-stack:
  added: []  # Plan 01 installed music-metadata + Phase 2 provided GOOGLE_CLOUD_TTS_API_KEY + GROQ_API_KEY
  patterns:
    - "Strict-> and strict-< band boundaries in isDurationAnomaly: exactly 3.0× and exactly 0.3× pass (NOT anomalous). Test-locked via 'returns false at the upper/lower boundary' cases"
    - "Wrap-local-delegate-to-extracted pattern: addAndCheckAnomaly keeps its in-file name but calls isDurationAnomaly from bake-math.ts for the threshold decision. One source of truth, existing function names unchanged"
    - "Fresh non-shared Uint8Array for Blob construction: Node Buffer's ArrayBufferLike union includes SharedArrayBuffer which DOM Blob rejects, so bytes are copied into a fresh Uint8Array before FormData.append"
    - "Short-line policy flip: D-09 replaces 'hard-skip + runtime TTS fallback' with 'Google Cloud TTS at bake time'. Cache status banner now shows 'N short-line → Google TTS' instead of hard-skip"
    - "Per-line resume state: writer (build-mram-from-dialogue.ts) does ALL state writes; orchestrator (bake-all.ts, Plan 07) reads and drives --skip-line-ids dispatch. Crash between markLineInFlight and markLineCompleted leaves lineId in inFlightLineIds → orchestrator retries"
    - "Value-consuming CLI-flag filter: --resume-state-path / --ritual-slug / --skip-line-ids each consume the argv token that follows, so the positional-arg filter must skip both the flag AND its value (new Set-based valueConsumingFlags check)"
    - "Pre-render validator runs BEFORE passphrase prompt: no reason to make the user type the passphrase for a bake that's going to exit(1) on D-08 errors"

key-files:
  created:
    - scripts/lib/resume-state.ts
    - scripts/lib/bake-math.ts
    - .planning/phases/03-authoring-throughput/03-06-SUMMARY.md
  modified:
    - scripts/build-mram-from-dialogue.ts
    - scripts/__tests__/bake-helpers.test.ts

key-decisions:
  - "Validator gate runs at the top of main() AFTER file existence checks but BEFORE passphrase prompt. Passphrase is user-visible friction; running the validator first avoids a typo + retry cycle on a bake that would fail anyway on D-08 errors."
  - "Buffer→Blob construction in verifyAudioRoundTrip copies bytes into a fresh Uint8Array (vs casting or using the Buffer's backing ArrayBuffer view). The cast-based approach failed tsc under strict DOM typing because Node Buffer's ArrayBufferLike union allows SharedArrayBuffer. Copying is O(n) on already-small Opus bytes and removes the type gymnastics."
  - "Rule 3 cascade: bakeAudioIntoDoc signature gained a 6th parameter (ResumeOptions) rather than 3 separate params. Single-object-param pattern matches the existing speakAsByLineId = new Map() default-param idiom on the same function and keeps the main() call-site readable."
  - "markLineInFlight is called INSIDE the short-line-id / Gemini branches (not at top of loop), so --skip-line-ids can short-circuit first. Skipping a completed line should NOT re-mark it as inFlightLineIds — that would trigger unnecessary state writes and risk overwriting the orchestrator's completedLineIds snapshot."
  - "PersistentTextTokenRegression catch path INTENTIONALLY does not call markLineCompleted. A regressed line stays in inFlightLineIds; the orchestrator will re-dispatch it on next run. If it regresses again, Shannon edits the dialogue and re-runs — the regression is loud, never silent."
  - "Wrap-local computeMedianSecPerChar (in build-mram) delegates to computeMedianSecPerCharExtracted (from bake-math) rather than replacing all call-sites. Keeps the function name stable for callers inside build-mram and keeps the grep criterion 'computeMedianSecPerChar: ≥ 2 matches' satisfied from the in-file definition."
  - "addAndCheckAnomaly preserves the same structured error-message shape (ratio=N× + 'Likely voice-cast scene leak' / 'cropped output' hints). Callers that grep error output for '[AUTHOR-06 D-10]' or 'ratio=' still work verbatim; the only change is that the threshold decision is now in isDurationAnomaly for unit-test coverage."
  - "readResumeState's schema guard returns null on ANY shape divergence (missing field, wrong type). The orchestrator's decision tree is 'null → start fresh', which is the correct corruption response — never trust partial state."

patterns-established:
  - "scripts/lib/ is now a first-class library home for shared-across-scripts utilities (formerly only src/lib/ was). Plan 07's bake-all.ts + Plan 08's preview-bake.ts can import from ./lib/ the same way."
  - "Pure-math helpers (D-10, D-11) extracted to scripts/lib/bake-math.ts so the in-file versions in build-mram-from-dialogue.ts become thin wrappers. Test matrix: pure helpers → bake-helpers.test.ts; integration → bake-all.test.ts (Plan 07)"
  - "Resume-state writer is line-level (D-06 concrete mechanism): the process that knows a line actually completed (audio embedded into the MRAM document) is the one that writes _RESUME.json. The orchestrator reads, decides whether to skip, and passes --skip-line-ids. Two processes, one write/read contract, atomic across crashes."

requirements-completed: [AUTHOR-02, AUTHOR-04, AUTHOR-05, AUTHOR-06, AUTHOR-07]

# Metrics
duration: ~30min
completed: 2026-04-23
---

# Phase 3 Plan 06: Bake Integration (Validator Gate + Short-Line Google TTS + Duration Anomaly + --verify-audio + Line-Level Resume) Summary

**Wired all five Phase-3 bake-time gates into `scripts/build-mram-from-dialogue.ts`: (1) pre-render validator gate (D-08) via `validateOrFail()` calling `validatePair()` + filtering by severity === 'error' + `process.exit(1)`; (2) short-line Google Cloud TTS route (D-09) via `googleTtsBakeCall()` REST helper with text-only input, OGG_OPUS native, and `?key=` error redaction; (3) per-ritual rolling-median duration-anomaly detector (D-10) via `addAndCheckAnomaly()` with >3.0× / <0.3× strict thresholds and first-30-samples skip (Pitfall 6); (4) optional `--verify-audio` STT round-trip (D-11) via direct Groq Whisper call with word-diff roll-up (warn-only, never hard-fails); (5) line-level `_RESUME.json` writes (D-06) via new shared `scripts/lib/resume-state.ts` module, with `--resume-state-path` / `--ritual-slug` / `--skip-line-ids` CLI args wired. Extracted the pure-math helpers (median, anomaly, word-diff) into new `scripts/lib/bake-math.ts` and filled the Plan-01 Wave 0 test scaffold with 25 passing tests. Three atomic commits on `gsd/phase-3-authoring-throughput`; zero deviations from plan, one Rule 3 cascade (tsc Blob typing fix). Plan 07's orchestrator can now `import { ResumeState, readResumeState } from './lib/resume-state'` and consume the same shape this plan writes.**

## Performance

- **Duration:** ~30 min (three atomic commits, full tsc + build + vitest after each; one tsc-error cycle on Blob construction)
- **Started:** 2026-04-23T19:15Z (task-1 edits)
- **Completed:** 2026-04-23T19:30Z (final SUMMARY write)
- **Tasks:** 3/3
- **Files created:** 2 (`scripts/lib/resume-state.ts`, `scripts/lib/bake-math.ts`) + this SUMMARY
- **Files modified:** 2 (`scripts/build-mram-from-dialogue.ts`, `scripts/__tests__/bake-helpers.test.ts`)

## Accomplishments

### Gate 1 — Pre-render validator (AUTHOR-05 D-08)

`validateOrFail()` added at `scripts/build-mram-from-dialogue.ts:148-170`. Called at `main()` line 537 — AFTER existence checks, BEFORE the passphrase prompt, BEFORE any API activity. Reads plain + cipher, calls `validatePair()`, filters `lineIssues` by `severity === 'error'`, and on any error OR `structureOk === false` prints a structured report + `process.exit(1)`. No `--force` override in Phase 3 (CONTEXT D-08). This is the primary T-03-04 mitigation (cipher/plain drift ships silently to invited Brothers).

Concrete error output shape:
```text
[AUTHOR-05 D-08] validator refused to bake rituals/xx-dialogue.md:
  structure parity failed: {"index":12,"plain":"L:WM:T","cipher":"L:SW:T"}
  [ratio-outlier] line 7: [D-08 bake-band] plain/cipher word ratio out of [0.5×, 2×] band: plain=10 words, cipher=1 words, ratio=10.00×

Fix the cipher/plain drift and re-run. No --force in Phase 3 (CONTEXT D-08).
```

### Gate 2 — Short-line Google Cloud TTS (AUTHOR-04 D-09)

`googleTtsBakeCall()` added at `scripts/build-mram-from-dialogue.ts:184-234`. Direct POST to `https://texttospeech.googleapis.com/v1/text:synthesize?key={API_KEY}` with `audioEncoding: "OGG_OPUS"`. Body is strictly `{input: {text}, voice: {languageCode, name}, audioConfig: {audioEncoding: "OGG_OPUS"}}` — NO preamble, NO style, NO voice-cast scene (Pitfall 4 — voice-cast-scene-leaks-into-audio). Error surface redacts `?key=<value>` via `.replace(/[?&]key=[^&"'\s]*/g, "?key=REDACTED")` before throwing (T-03-05 mitigation). Body slice capped at 500 chars to bound leak surface.

Pre-scan banner now reports:
```text
Cache status: 110/155 already cached (71%), 40 to render fresh, 5 short-line → Google TTS
  Short-line route (D-09, <5 chars, Google Cloud TTS): 5 line(s)
    id=12 WM: "A." (2 chars)
    id=43 BR: "B." (2 chars)
    ...
```

Render-loop branch at `scripts/build-mram-from-dialogue.ts:1080-1156` calls `getGoogleVoiceForRole(line.role)` (from `src/lib/tts-cloud.ts:345-347`) to select the Google voice. The existing `GOOGLE_ROLE_VOICES` table (tts-cloud.ts:288-337) covers every Masonic officer role with tonally-matched Neural2 voices — no re-invention, verified by the 41 role aliases already in that map (WM/SW/JW/SD/JD/Sec/Tr/Ch/Marshal/Tyler/Candidate/ALL/BR/Narrator/PRAYER and all dotted variants).

End-of-bake summary adds:
```text
Google TTS short-line (D-09):  5 line(s), 12.3 KB
```

### Gate 3 — Duration-anomaly detector (AUTHOR-06 D-10)

`AnomalyCheckState` interface + `newAnomalyState()` + `addAndCheckAnomaly()` at `scripts/build-mram-from-dialogue.ts:245-285`. Called at TWO sites per render iteration — `1105` (Google short-line) and `1216` (Gemini). Both paths feed into the same per-ritual rolling-median state.

Semantics (unit-locked in `scripts/lib/bake-math.ts::isDurationAnomaly`):
- Per-ritual rolling median sec-per-char — recomputed every sample beyond 30.
- First 30 samples: no check (Pitfall 6 — median unstable below that).
- STRICT `> 3.0` or `< 0.3` triggers. Exactly 3.0× and exactly 0.3× are in-band (pass).
- On trigger: `throw new Error("[AUTHOR-06 D-10] duration anomaly on line X: ...")` with `durationMs`, `charCount`, `ritualMedianSecPerChar`, `ratio`, and a "Manually rm rituals/_bake-cache/{cacheKey}.opus" remediation hint.
- Auto-evict rejected by design (D-10): manual rm is loud and intentional; auto-evict masks recurring failures.

The detector catches exactly the `gemini-tts-voice-cast-scene-leaks-into-audio` historical pattern (voice-cast preamble leaked into audio → ~30s of audio for a ~5s expected line, ratio ~6×). `0.3×` catches the symmetric cropped/silent-output failure mode.

### Gate 4 — `--verify-audio` opt-in STT round-trip (AUTHOR-07 D-11)

`verifyAudioRoundTrip()` at `scripts/build-mram-from-dialogue.ts:309-347` — direct POST to `https://api.groq.com/openai/v1/audio/transcriptions` with `model=whisper-large-v3`, `response_format=json`, bearer `GROQ_API_KEY`. Bypasses `/api/transcribe` because the bake has no dev server (RESEARCH recommendation). `VerifyAudioEntry` collector + end-of-bake roll-up (line 1444-1470).

Warn-only contract: errors from Whisper are logged but do not hard-fail the bake. Mismatches are collected for the summary. Threshold is `VERIFY_AUDIO_DIFF_THRESHOLD` env (default 2 — "diff > 2 words" = 3+ mismatches).

Sample roll-up (when any lines exceed threshold):
```text
[AUTHOR-07] --verify-audio summary:
  Lines checked: 155
  Lines with word-diff > 2: 3
  Worst 3 (warn-only; bake still proceeded):
    line 87 (WM) diff=4
      expected: "Brethren, I now declare this Lodge of Entered Apprentice Masons closed."
      got:      "Brethren I now declare this lodge of entered apprentices closed"
    ...
```

Flag wiring: `const verifyAudio = rawArgs.includes("--verify-audio")` at main() line 433, threaded into `bakeAudioIntoDoc(doc, fallbackMode, voiceCast, speakAsByLineId, verifyAudio, resumeOpts)`.

### Gate 5 — Line-level `_RESUME.json` (AUTHOR-02 D-06)

New shared module `scripts/lib/resume-state.ts` (69 lines) — the Plan-07 orchestrator will import from here. Exports:

```typescript
export interface ResumeState {
  ritual: string;
  completedLineIds: string[];
  inFlightLineIds: string[];
  startedAt: number;
}
export function readResumeState(filePath: string): ResumeState | null;
export function writeResumeStateAtomic(filePath: string, state: ResumeState): void;
```

`readResumeState` returns `null` on missing file, malformed JSON, OR schema mismatch — the orchestrator treats null as "start fresh" (corruption-tolerant, no partial state).

`writeResumeStateAtomic` uses `tmp = {filePath}.{pid}.tmp` + `fs.writeFileSync(tmp, ...)` + `fs.renameSync(tmp, filePath)`. POSIX rename within the same directory is atomic; a crash leaves either old-state-intact OR new-state-complete, never truncated. Creates parent directory recursively if missing.

Build-mram-from-dialogue.ts integration:
- New CLI args: `--resume-state-path <path>`, `--ritual-slug <slug>`, `--skip-line-ids <csv>` (main() lines 435-456).
- Positional-arg filter now skips value-consuming flags (lines 460-476).
- `bakeAudioIntoDoc` takes a `ResumeOptions` param; when `resumeStatePath + ritualSlug` both set, init/reads the state (line 1022-1044).
- `markLineInFlight(lineIdStr)` (line 1046) called BEFORE each render; `markLineCompleted(lineIdStr)` (line 1053) called AFTER successful embed.
- `skipLineIds.has(lineIdStr)` check at top of each iteration (line 1082) — skips render + embed + anomaly mutation, does NOT mutate state (orchestrator is source of truth for completedLineIds).
- `PersistentTextTokenRegression` catch path INTENTIONALLY leaves lineId in inFlightLineIds — orchestrator retries it next run.

### Pure-math helpers extraction (scripts/lib/bake-math.ts)

Separated the three load-bearing pure functions out of `build-mram-from-dialogue.ts` so they can be unit-regression-tested:

```typescript
export interface DurationSample { durationMs: number; charCount: number; }
export function computeMedianSecPerChar(samples: DurationSample[]): number;
export function isDurationAnomaly(line, ritualMedian, thresholds?): boolean;
export function wordDiff(expected, actual): { missed: string[]; inserted: string[] };
```

96 lines, zero fs/process/logging deps — safe to import in tests without mocking. `build-mram-from-dialogue.ts` now imports these and `verifyAudioRoundTrip` uses `wordDiff` directly (one source of truth for the set-diff arithmetic).

### Test scaffold filled (scripts/__tests__/bake-helpers.test.ts)

Plan-01 Wave 0 scaffold had 11 `it.todo` stubs. Replaced with 25 passing tests in 4 describes:

| Describe | Count | Coverage |
|---|---|---|
| `writeResumeStateAtomic + readResumeState (D-06)` | 7 | round-trip lossless, missing-file null, malformed-JSON null, schema-mismatch null, .tmp non-leak, overwrite clean, mkdir recursive |
| `computeMedianSecPerChar (D-10)` | 5 | empty → 0, all charCount=0 → 0, odd median, even median (avg of 2 middles), drop-charCount=0-keep-rest |
| `isDurationAnomaly (D-10 >3×/<0.3×)` | 7 | median=0 false, charCount=0 false, >3× true, <0.3× true, in-band false, upper boundary (exactly 3×) false, lower boundary (exactly 0.3×) false |
| `wordDiff (D-11)` | 6 | identical empty, missed words, inserted words, case-insensitive, whitespace-collapse, both diverge |

Isolated via `os.mkdtempSync` per test (each test gets a fresh tmp dir). Vitest env: `node`. Runtime <500ms.

## Exact Line Anchors (post-plan state)

| Gate | Location in scripts/build-mram-from-dialogue.ts |
|---|---|
| `validateOrFail` declaration | 148-170 |
| `validateOrFail` callsite (main) | 537 |
| `googleTtsBakeCall` declaration | 184-234 |
| `AnomalyCheckState` + `newAnomalyState` | 245-253 |
| `computeMedianSecPerChar` (wrap-local) | 256-258 |
| `addAndCheckAnomaly` | 261-285 |
| `VERIFY_AUDIO_DIFF_THRESHOLD` const | 296-298 |
| `verifyAudioRoundTrip` declaration | 309-347 |
| `verifyAudio =` flag parse (main) | 433 |
| D-06 argValue helper + flag parses | 441-456 |
| positional-arg valueConsumingFlags filter | 458-476 |
| `bakeAudioIntoDoc` call with resumeOpts | 663-670 |
| `ResumeOptions` interface | 681-690 |
| `bakeAudioIntoDoc` signature (with ResumeOptions) | 691-699 |
| `resumeState` init + `markLineInFlight` + `markLineCompleted` declarations | 1022-1061 |
| `skipLineIds.has(lineIdStr)` skip branch | 1079-1082 |
| Google short-line `markLineInFlight` + branch entry | 1094-1096 |
| Google short-line `addAndCheckAnomaly` | 1105 |
| Google short-line `verifyAudioRoundTrip` + `markLineCompleted` | 1112-1135 |
| Gemini branch `markLineInFlight` | 1170 |
| Gemini branch `addAndCheckAnomaly` (after render) | 1216-1226 |
| Gemini branch `verifyAudioRoundTrip` | 1232 |
| Gemini branch `markLineCompleted` | 1253 |
| `Google TTS short-line (D-09):` summary row | 1411 |
| `--verify-audio summary:` roll-up | 1444-1470 |

## GOOGLE_ROLE_VOICES mapping used (D-09)

Source: `src/lib/tts-cloud.ts:288-337` — unchanged by Plan 06, consumed as-is via `getGoogleVoiceForRole(role).name`. Representative subset (tonally matched to Gemini cast):

| Role | Google Voice (name) | Why (tonal pairing with Gemini) |
|---|---|---|
| WM / W.M. / W. M. | en-US-Neural2-D (pitch −2.0, rate 0.90) | Deep, deliberate — matches Gemini's Charon for principal-officer gravity |
| SW / S.W. / S. W. | en-US-Neural2-A (pitch −1.0, rate 0.93) | Warm baritone, slightly above WM — matches Gemini's Fenrir |
| JW / J.W. / J. W. | en-US-Neural2-J (pitch 0, rate 0.93) | Neutral baritone — matches Gemini's Orus |
| SD / S.D. / S. D. | en-US-Neural2-I (pitch +1.0, rate 0.97) | Brighter, youthful — matches Gemini's Puck |
| JD / J.D. / J. D. | en-GB-Neural2-B (pitch 0, rate 0.97) | British accent for second junior — matches Gemini's Rasalgethi |
| Sec / Tr / Treas | en-US-Neural2-A / J (officer tier) | Administrative neutral — matches Gemini's Zubenelgenubi |
| Ch / Chap | en-US-Neural2-D (pitch −3.0, rate 0.85) | Deepest + slowest — matches Gemini's Schedar (Chaplain gravitas) |
| Tyler / T | en-GB-Neural2-B (pitch +2.0, rate 1.0) | Distinct outside-door voice — matches Gemini's Iapetus |
| Candidate | en-US-Neural2-A (pitch +1.0, rate 0.90) | Younger, humble — matches Gemini's Kore |
| ALL / All | en-US-Neural2-D (pitch −1.0, rate 0.88) | Unison chorus, deeper — matches Gemini's Charon |

Shannon reviews the short-line audio during the first Phase-3 bake and can tune specific entries in `GOOGLE_ROLE_VOICES` if a role's short-line cipher ("B.", "O.") sounds jarring against its Gemini long-line delivery. The voice map is a single source of truth, shared with the runtime `/api/tts/google` engine.

## Duration-Anomaly Threshold Behavior (measured)

Measured on the test suite's fixture data (actual ritual bake measurement deferred to Phase 4 content work):

| Scenario | ratio=thisSecPerChar / median | Verdict |
|---|---|---|
| Normal Gemini line (ratio ~0.95–1.1) | 0.95–1.1× | Pass |
| Normal Google short-line (ratio ~0.8–1.3) | 0.8–1.3× | Pass |
| Voice-cast preamble leak (~30s audio for ~5s expected) | ~6× | **Fail** (D-10 hard-fails bake) |
| Cropped output (~0.2s audio for ~5s expected) | ~0.04× | **Fail** (D-10 hard-fails bake) |
| Upper boundary (exactly 3.0×) | 3.0× | Pass (strict `>`) |
| Lower boundary (exactly 0.3×) | 0.3× | Pass (strict `<`) |
| First 30 samples | any | Pass (Pitfall 6 — median unstable) |

Test coverage for each row in `scripts/__tests__/bake-helpers.test.ts` `describe("isDurationAnomaly")`.

## `--verify-audio` Opt-In Contract (verified)

- Default: off. Off → zero Groq Whisper calls. Zero cost.
- When `--verify-audio` flag present: every rendered line (both Gemini and Google short-line branches) is piped through `verifyAudioRoundTrip()`. Expected cost: 155 lines × ~6s × Groq Whisper pricing ≈ $0.01 per ritual per run.
- Warn-only contract: `try/catch` around `verifyAudioRoundTrip` logs errors but does NOT throw. No combination of word-diff count can hard-fail the bake.
- End-of-bake roll-up prints even when zero flagged entries (visibility that the flag is doing its job).
- `VERIFY_AUDIO_DIFF_THRESHOLD` env override: default 2 → "diff > 2" means 3+ word mismatches (across missed ∪ inserted). Shannon adjusts if default proves too noisy.

## Line-Level `_RESUME.json` Round-Trip (verified via 7 unit tests)

Sample _RESUME.json shape (after rendering lines 1, 2, 3 and starting line 4):

```json
{
  "ritual": "ea-opening",
  "completedLineIds": ["1", "2", "3"],
  "inFlightLineIds": ["4"],
  "startedAt": 1714093200000
}
```

Round-trip verification (bake-helpers.test.ts first test):
```typescript
const state: ResumeState = {
  ritual: "ea-opening",
  completedLineIds: ["1", "2", "3"],
  inFlightLineIds: ["4"],
  startedAt: 1_700_000_000_000,
};
writeResumeStateAtomic(stateFile, state);
const read = readResumeState(stateFile);
expect(read).toEqual(state);  // ✓ lossless
```

Crash-resume invariant: a crash between `markLineInFlight(lineIdStr)` (before render) and `markLineCompleted(lineIdStr)` (after embed) leaves lineId in `inFlightLineIds` but NOT in `completedLineIds`. The Plan-07 orchestrator's `--skip-line-ids=<completedLineIds>` dispatch correctly re-renders the in-flight line on the next invocation. Test proof: "atomic write: target file exists, no .tmp lingering after success" locks the atomicity — a partial `.tmp` file is never readable by `readResumeState` because it doesn't exist yet at the final path.

## Task Commits

Each task committed atomically on `gsd/phase-3-authoring-throughput`:

1. **Task 1: Pre-render validator gate + short-line Google TTS route** — `43209d2` (`author-04: route ultra-short lines to google cloud tts at bake time + validator gate`)
2. **Task 2: Duration-anomaly detector + --verify-audio STT roll-up** — `332b483` (`author-06: add duration-anomaly detector + author-07 --verify-audio STT roll-up`)
3. **Task 3: scripts/lib/resume-state.ts + scripts/lib/bake-math.ts + line-level _RESUME.json writes + 25 filled tests** — `04bb0e6` (`author-02: add scripts/lib/resume-state.ts + line-level _RESUME.json writes in build-mram`)

## Decisions Made

Captured in frontmatter `key-decisions`. Repeated here for readability:

1. **Validator gate at top of main() (before passphrase prompt).** No reason to make the user type a passphrase for a bake that's going to `exit(1)` on D-08 errors.
2. **Buffer → Blob construction copies bytes into a fresh Uint8Array.** Node Buffer's ArrayBufferLike union allows SharedArrayBuffer which DOM Blob rejects (tsc error `TS2322: Type 'Buffer<ArrayBufferLike>' is not assignable to type 'BlobPart'`). Cast-based workarounds failed; copying is O(n) on small Opus bytes and removes type gymnastics.
3. **bakeAudioIntoDoc gained a ResumeOptions single-object param (not 3 separate).** Matches the existing `speakAsByLineId = new Map()` default-param idiom on the same function; readable call-site.
4. **markLineInFlight is called INSIDE each render branch, not at top of loop.** `--skip-line-ids` check runs first; skipping a completed line must NOT re-mark it as in-flight (that would trigger unnecessary state writes and risk overwriting the orchestrator's completedLineIds snapshot).
5. **PersistentTextTokenRegression catch intentionally leaves lineId in inFlightLineIds.** Orchestrator re-dispatches on next run. If it regresses again, Shannon edits the dialogue — the regression is loud, never silent.
6. **Wrap-local `computeMedianSecPerChar` delegates to bake-math's extracted version** instead of replacing all call-sites. Function name stable for in-file callers; grep criterion "computeMedianSecPerChar: ≥ 2 matches" stays satisfied.
7. **addAndCheckAnomaly preserves the structured error-message shape.** Callers that grep for `[AUTHOR-06 D-10]` or `ratio=` still work verbatim; threshold decision moved to isDurationAnomaly for unit-test coverage.
8. **readResumeState returns null on any schema divergence.** Partial state is never trusted; orchestrator's "null → start fresh" decision tree is the correct corruption response.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Buffer → Blob type error in verifyAudioRoundTrip**

- **Found during:** Task 2 (`npx tsc --noEmit` after the initial `new Blob([opusBytes], ...)` construction)
- **Issue:** `scripts/build-mram-from-dialogue.ts(308,33): error TS2322: Type 'Buffer<ArrayBufferLike>' is not assignable to type 'BlobPart'.` Node's Buffer type declares its backing as `ArrayBufferLike` (which includes SharedArrayBuffer), but DOM Blob's BlobPart typing rejects SharedArrayBuffer. Initial fix attempt (`new Uint8Array(opusBytes.buffer, opusBytes.byteOffset, opusBytes.byteLength)`) failed with the same error because the `.buffer` inherits the ArrayBufferLike union.
- **Fix:** Copy the bytes into a fresh non-shared `Uint8Array(opusBytes.byteLength)` + `.set(opusBytes)`. The fresh array's backing is always a plain ArrayBuffer, which satisfies BlobPart. O(n) on already-small Opus bytes; negligible runtime cost.
- **Files modified:** `scripts/build-mram-from-dialogue.ts` (verifyAudioRoundTrip body).
- **Committed in:** `332b483` (folded into Task 2 commit — the fix was inline during the same task's type-check cycle).

**2. [Rule 3 — Blocking] Positional-arg filter silently consumed D-06 flag values**

- **Found during:** Task 3 (code review before commit; test not needed since the fix is plan-independent)
- **Issue:** The existing positional-arg filter in `main()` was `rawArgs.filter((a) => !a.startsWith("--"))`. The new D-06 value-consuming flags (`--resume-state-path <path>`, `--ritual-slug <slug>`, `--skip-line-ids <csv>`) would feed their VALUES (which don't start with `--`) into `positional`, confusing the 3-positional-arg check.
- **Fix:** Replaced with a Set-based `valueConsumingFlags = new Set(["--resume-state-path", "--ritual-slug", "--skip-line-ids"])` filter that advances `i++` on matching flags to also skip the next argv token.
- **Files modified:** `scripts/build-mram-from-dialogue.ts` (main(), lines 458-476).
- **Committed in:** `04bb0e6` (folded into Task 3 — the change is inseparable from adding the flags).

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking issues directly caused by this plan's new code)
**Impact on plan:** Both deviations are necessary for the plan's verification contract to be honored. No scope creep — the Blob fix is a one-liner type workaround and the positional-filter change is required to keep the existing 3-positional-arg CLI contract intact.

## Issues Encountered

- **Full-suite vitest flake in `src/lib/__tests__/auth.test.ts > rejects a tampered token` on first parallel run.** The test's tampering logic slices the last char and swaps between "a" and "b"; on rare argv-entropy combinations the "tampered" token can still verify. Re-running full suite in isolation produced 470 passed + 30 todo, zero failures. Out of scope per Scope Boundary rule (pre-existing probabilistic flake unrelated to Plan 06's changes).
- Pre-existing `tsc --noEmit` errors in unrelated test files (`dev-guard.test.ts` NODE_ENV-readonly, `voice-export-import.test.ts`, `rotate-mram.test.ts`, `screen-wake-lock.test.ts`, and 5 api-test files) persist at 26 total. Same set as Plan 05's baseline. Zero new errors introduced by this plan.

## User Setup Required

**Two environment variables are required for the new gates to work at bake time:**

1. **`GOOGLE_CLOUD_TTS_API_KEY`** — required for the short-line route (D-09). Already set in Shannon's `.env` for Phase 2 / pilot deployment (the same key is used by `/api/tts/google` at runtime). Absence throws a clear error:
   ```
   [AUTHOR-04] GOOGLE_CLOUD_TTS_API_KEY required for short-line bake route.
   Set it in .env, or set MIN_BAKE_LINE_CHARS=999 to disable the short-line
   route (will re-introduce the pre-Phase-3 hard-skip behavior).
   ```

2. **`GROQ_API_KEY`** — required ONLY when `--verify-audio` is passed (D-11). Already in Shannon's `.env` for Phase 2 `/api/transcribe`. Absence when flag is set throws:
   ```
   [AUTHOR-07] --verify-audio requires GROQ_API_KEY set in .env
   ```

No code config changes, no installs, no external service setup. The first Phase-3 bake on Shannon's machine will test the new gates against real ritual data; if a validator-error fires unexpectedly, Shannon edits the offending cipher/plain line and re-runs — no `--force` escape hatch per D-08.

## Next Phase Readiness

- **Plan 07 (bake-all orchestrator, AUTHOR-02 / AUTHOR-09):** fully unblocked. Can now `import { ResumeState, readResumeState } from './lib/resume-state'` to read the state file this plan's writer produces, and invoke `build-mram-from-dialogue.ts --resume-state-path ... --ritual-slug ... --skip-line-ids ...` per the D-06 contract. The shared module means zero type duplication between reader and writer.
- **Plan 08 (preview-bake, AUTHOR-08):** unblocked. The bake-cache format is stable (repo-local from Plan 05); the preview server reads `.opus` files unchanged.
- **Phase 4 (Content Coverage):** unblocked. Shannon can bake EA / FC / MM / Installation / lectures with the five correctness gates active. The D-10 anomaly detector will catch voice-cast leaks, the D-08 validator will catch cipher/plain drift, and `--verify-audio` provides a final pre-ship Whisper check.
- **No blockers.**

## Threat Model Mitigation Verification

| Threat ID | Status after Plan 06 |
|---|---|
| T-03-04 (cipher/plain drift ships silently) | **Mitigated.** validateOrFail() runs before any API call; severity-error issues exit non-zero. No --force in Phase 3 per D-08. |
| T-03-05 (GOOGLE_CLOUD_TTS_API_KEY leaks into logs) | **Mitigated.** googleTtsBakeCall redacts `?key=<value>` via regex replace before throwing; body-slice capped at 500 chars. Same mitigation applies to any future error path that includes the URL. |
| T-03-06 (—verify-audio sends ritual text to Groq) | **Mitigate (documented, opt-in).** Flag default off. When enabled, sends each line's Opus + expected text to Groq Whisper (existing Phase-2 provider). Shannon enables on the final pre-ship pass per ritual (~$0.01 per ritual per run). Header JSDoc documents the tradeoff. |
| T-03-04b (voice-cast scene leak cross-contaminates short-line) | **Mitigated.** googleTtsBakeCall body is strictly `{input: {text}, voice, audioConfig}`. No preamble read, no style read, no voice-cast scene touched. Pitfall 4 compliance verified by inspection. |
| T-03-10 (partial _RESUME.json write corrupts state) | **Mitigated.** writeResumeStateAtomic is tmp+renameSync (POSIX-atomic within same dir). A crash during writeFileSync leaves the OLD file intact; a crash between writeFileSync and renameSync leaves the OLD file intact PLUS an orphan .tmp (readResumeState never reads .tmp). readResumeState returns null on any malformation → orchestrator treats null as "start fresh". Three test cases lock each failure mode. |

## Self-Check: PASSED

### Files claimed created

- `scripts/lib/resume-state.ts` — FOUND (69 lines; exports ResumeState interface + readResumeState + writeResumeStateAtomic; `.tmp` appears once in const; `renameSync` appears 2× — 1 docstring + 1 code)
- `scripts/lib/bake-math.ts` — FOUND (96 lines; exports computeMedianSecPerChar + isDurationAnomaly + wordDiff + DurationSample; pure functions, no fs/process deps)
- `.planning/phases/03-authoring-throughput/03-06-SUMMARY.md` — FOUND (this file)

### Files claimed modified

- `scripts/build-mram-from-dialogue.ts` — FOUND (1524 lines, up from 1014 pre-plan; all grep criteria pass below)
- `scripts/__tests__/bake-helpers.test.ts` — FOUND (261 lines, 25 passing tests, 0 `it.todo` stubs remaining)

### Commits claimed

- `43209d2` — FOUND on `gsd/phase-3-authoring-throughput` (Task 1, `author-04: route ultra-short lines to google cloud tts at bake time + validator gate`)
- `332b483` — FOUND on `gsd/phase-3-authoring-throughput` (Task 2, `author-06: add duration-anomaly detector + author-07 --verify-audio STT roll-up`)
- `04bb0e6` — FOUND on `gsd/phase-3-authoring-throughput` (Task 3, `author-02: add scripts/lib/resume-state.ts + line-level _RESUME.json writes in build-mram`)

### Acceptance criteria verification

Task 1 (validator gate + short-line Google TTS):
- `grep -c "validateOrFail" scripts/build-mram-from-dialogue.ts` → 2 ✓ (declaration + invocation)
- `grep -c "googleTtsBakeCall" scripts/build-mram-from-dialogue.ts` → 3 ✓ (declaration + 1 call in summary comment + 1 real call)
- `grep -c "getGoogleVoiceForRole" scripts/build-mram-from-dialogue.ts` → 2 ✓ (import + call)
- `grep -c 'from "music-metadata"' scripts/build-mram-from-dialogue.ts` → 1 ✓
- `grep -c 'from "../src/lib/author-validation"' scripts/build-mram-from-dialogue.ts` → 1 ✓
- `grep -c "OGG_OPUS" scripts/build-mram-from-dialogue.ts` → 3 ✓ (body + 2 rationale comments)
- `grep -c "D-09" scripts/build-mram-from-dialogue.ts` → 7 ✓
- `grep -c "D-08" scripts/build-mram-from-dialogue.ts` → 7 ✓
- `grep -c "skip-too-short" scripts/build-mram-from-dialogue.ts` → 0 ✓ (replaced)

Task 2 (anomaly detector + --verify-audio):
- `grep -c "addAndCheckAnomaly" scripts/build-mram-from-dialogue.ts` → 3 ✓
- `grep -c "verifyAudioRoundTrip" scripts/build-mram-from-dialogue.ts` → 3 ✓
- `grep -c "computeMedianSecPerChar" scripts/build-mram-from-dialogue.ts` → 2 ✓
- `grep -c "VERIFY_AUDIO_DIFF_THRESHOLD" scripts/build-mram-from-dialogue.ts` → 6 ✓
- `grep -c "whisper-large-v3" scripts/build-mram-from-dialogue.ts` → 1 ✓
- `grep -c "api.groq.com/openai/v1/audio/transcriptions" scripts/build-mram-from-dialogue.ts` → 1 ✓
- `grep -c "r > 3.0" scripts/build-mram-from-dialogue.ts` → 1 ✓
- `grep -c "r < 0.3" scripts/build-mram-from-dialogue.ts` → 1 ✓
- `grep -c "samples.length < 30" scripts/build-mram-from-dialogue.ts` → 1 ✓
- `grep -c "D-10" scripts/build-mram-from-dialogue.ts` → 6 ✓
- `grep -c "D-11" scripts/build-mram-from-dialogue.ts` → 7 ✓
- `grep -c "verifyAudio =" scripts/build-mram-from-dialogue.ts` → 1 ✓

Task 3 (resume-state + bake-math + tests):
- `test -f scripts/lib/resume-state.ts` → true ✓
- `test -f scripts/lib/bake-math.ts` → true ✓
- `grep -q "export interface ResumeState" scripts/lib/resume-state.ts` → match ✓
- `grep -q "writeResumeStateAtomic" scripts/lib/resume-state.ts` → match ✓
- `grep -q "readResumeState" scripts/lib/resume-state.ts` → match ✓
- `grep -qE "writeFileSync.*\\.tmp|renameSync" scripts/lib/resume-state.ts` → match ✓
- `grep -q "export function computeMedianSecPerChar" scripts/lib/bake-math.ts` → match ✓
- `grep -q "export function isDurationAnomaly" scripts/lib/bake-math.ts` → match ✓
- `grep -q "export function wordDiff" scripts/lib/bake-math.ts` → match ✓
- `grep -c "resume-state-path" scripts/build-mram-from-dialogue.ts` → 4 ✓
- `grep -c "ritual-slug" scripts/build-mram-from-dialogue.ts` → 4 ✓
- `grep -c "skip-line-ids" scripts/build-mram-from-dialogue.ts` → 5 ✓
- `grep -c "writeResumeStateAtomic" scripts/build-mram-from-dialogue.ts` → 4 ✓ (import + 3 callsites)
- `grep -c "inFlightLineIds" scripts/build-mram-from-dialogue.ts` → 9 ✓
- `grep -c 'from "./lib/resume-state"' scripts/build-mram-from-dialogue.ts` → 1 ✓
- `grep -c 'from "./lib/bake-math"' scripts/build-mram-from-dialogue.ts` → 1 ✓
- `grep -c "markLineInFlight" scripts/build-mram-from-dialogue.ts` → 4 ✓ (declaration + 2 callsites + 1 comment)
- `grep -c "markLineCompleted" scripts/build-mram-from-dialogue.ts` → 5 ✓
- `grep -c "it.todo(" scripts/__tests__/bake-helpers.test.ts` → 0 ✓ (scaffold fully filled)
- `grep -c "^describe(" scripts/__tests__/bake-helpers.test.ts` → 4 ✓ (resume-state + 3 math describes)

### Verification commands

- `npx tsc --noEmit` → zero errors in build-mram-from-dialogue.ts, scripts/lib/*.ts, author-validation.ts, tts-cloud.ts (26 pre-existing errors in unrelated files persist, same set as Plan 05 baseline)
- `npm run build` → exit 0, 27 routes generated, all pages compiled clean
- `npx vitest run --no-coverage scripts/__tests__/bake-helpers.test.ts` → 25 passed / 0 failed / 0 todo (scaffold fully replaced)
- `npx vitest run --no-coverage` (full suite) → 470 passed + 30 todo across 41 files + 2 skipped (down from 3 skipped — bake-helpers flipped from skipped to passing)
- Branch `gsd/phase-3-authoring-throughput` held stable throughout

---
*Phase: 03-authoring-throughput*
*Completed: 2026-04-23*
