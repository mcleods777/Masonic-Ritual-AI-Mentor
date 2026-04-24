---
phase: 04-content-coverage
plan: 01
subsystem: verifier-release-gate
tags: [verifier, release-gate, opus-audio, mram, content-coverage, v3-version-bump]

# Dependency graph
requires:
  - phase: 03-authoring-throughput
    provides: "scripts/lib/bake-math.ts (computeMedianSecPerChar, isDurationAnomaly), scripts/bake-all.ts (getAllRituals), src/lib/author-validation.ts (validatePair + D-08 bake-band), src/lib/mram-format.ts (v3 shape with voiceCast/audioFormat/audio), music-metadata dep"
provides:
  - "scripts/verify-mram.ts --check-audio-coverage flag asserting per-line Opus presence, OGG magic, byte-length bounds, duration anomaly (AUTHOR-06 D-10 re-check), metadata.audioFormat + metadata.voiceCast"
  - "scripts/verify-mram.ts version bump v1→v3 (v1/v2 files now rejected with 'v3 required'; previous throw made the verifier inoperable against every Phase 3-baked file)"
  - "scripts/verify-mram.ts --json flag (machine-readable output with no plain/cipher leakage — T-04-04)"
  - "scripts/verify-content.ts release gate — single local command that runs validator + audio-coverage across every rituals/*.mram, aggregates into PASS/FAIL table, exits 1 on any failure"
  - "Exported decryptMRAM, promptPassphrase, checkAudioCoverage (with CoverageFailure + CoverageResult types) from scripts/verify-mram.ts for reuse without subprocess spawn"
  - "npm run verify-content alias"
affects: [04-03-ea-rebake, 04-04-fc-authoring-bake, 04-05-mm-authoring-bake, 04-06-installation-authoring-bake, 04-07-lectures-authoring-bake, 04-08-phase-release-verification]

# Tech tracking
tech-stack:
  added: []  # No new deps — music-metadata was already present from Phase 3
  patterns:
    - "isDirectRun module-load guard for test-importable CLI scripts (matches bake-all.ts + preview-bake.ts pattern from Phase 3)"
    - "Per-ritual-median duration-anomaly sanity check as belt-and-suspenders at verify time (bake-time gate from AUTHOR-06 D-10 re-run at release time)"
    - "--rituals-dir flag for test isolation (release gate accepts tmpdir paths so tests never touch the real rituals/ folder)"
    - "T-04-04 stdout leakage mitigation: --json output includes only {lineId, kind, message} — never plain/cipher text"

key-files:
  created:
    - "scripts/verify-content.ts (336 LOC) — release gate orchestrator"
    - "scripts/__tests__/verify-mram.test.ts (360 LOC) — 10 tests for --check-audio-coverage + exports"
    - "scripts/__tests__/verify-content.test.ts (241 LOC) — 5 tests for release-gate aggregation"
    - ".planning/phases/04-content-coverage/04-01-SUMMARY.md"
  modified:
    - "scripts/verify-mram.ts (263 → 632 LOC): version bump 1→3, extended v3 interfaces (voiceCast/audioFormat/audio/expiresAt), --check-audio-coverage + --json flags, exported decryptMRAM + promptPassphrase + checkAudioCoverage, isDirectRun guard"
    - "package.json: added 'verify-content' npm script alias"

key-decisions:
  - "Version bump v1→v3 is a strict rejection of v1/v2 (not a permissive 'support all versions') — CONTENT-06's intent is 'every shipped .mram has per-line Opus', which is a v3-only property. Heterogeneous .mram versions shipped to pilot officers would break the coverage guarantee."
  - "Local interface duplication over shared-import from src/lib/mram-format.ts — matches Phase 3 pattern. The local copy in scripts/verify-mram.ts includes only the fields the script reads (narrower than the shared type is fine; extra fields pass through JSON.parse)."
  - "Duration-anomaly check requires ≥30 samples before flagging (AUTHOR-06 D-10 Pitfall 6). Below that the median is unstable and would false-positive on short rituals. The check is skipped with no failure when samples.length < 30; documented behaviour."
  - "checkAudioCoverage is a pure async function export (not a CLI-coupled routine) so scripts/verify-content.ts reuses it without subprocess spawn. Single-process semantics matter for Test 5 (aggregate-behaviour assertion)."
  - "Release gate does NOT abort on first failure — every ritual is checked so Shannon sees the full picture in one run. Trade: one bad ritual doesn't block visibility into the others; aggregate counts in the summary table make the failure set obvious."
  - "--rituals-dir flag added specifically for test isolation. Tests spawn the gate against tmpdirs with synthesized .mram files; the real rituals/ folder is never touched. Production use still defaults to ./rituals."
  - "Fixture strategy: base64-encoded real Opus bytes (1.0s + 1.56s durations) inlined as test constants. No .opus binaries committed per VALIDATION.md <100KB-per-fixture constraint. Captured from ~/.cache/masonic-mram-audio/ prior ea-opening bake."

patterns-established:
  - "Exported types + pure-function cores for CLI scripts: `export interface CoverageResult` + `export async function checkAudioCoverage(doc)` + `export async function promptPassphrase()` lets a downstream orchestrator (verify-content.ts) consume the logic directly. CLI main() stays at the bottom behind an isDirectRun guard."
  - "Per-ritual aggregation over halt-on-first-failure: the release gate reports every ritual even when some fail, prioritizing operator visibility over fail-fast. Contrast with bake-all.ts which halts on first failure (a failed bake likely signals a systemic issue worth investigating before burning more quota)."
  - "Defense-in-depth for stdout leakage (T-04-04): under --json, output is constructed from {lineId, kind, message} only — message strings are composed WITHOUT line.plain/line.cipher content. Tests plant UNIQUE_PLAIN_MARKER constants in the doc and assert neither appears anywhere in stdout."

requirements-completed: [CONTENT-06, CONTENT-07]

# Metrics
duration: 35min
completed: 2026-04-23
---

# Phase 4 Plan 01: Verifier + Release Gate Summary

**verify-mram.ts now accepts v3 .mram files (previously broken at `version !== 1`) and gains a --check-audio-coverage flag that asserts every spoken line carries valid Opus with OGG magic + duration sanity + metadata.voiceCast/audioFormat; verify-content.ts ships as a single `npm run verify-content` release gate orchestrating validator + audio-coverage across every rituals/*.mram.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-04-23T20:14:00Z
- **Completed:** 2026-04-23T20:25:00Z
- **Tasks:** 2/2 completed (both tasks as TDD)
- **Files created:** 3 (verify-content.ts + 2 test files)
- **Files modified:** 2 (verify-mram.ts + package.json)

## Accomplishments

- **Pre-existing blocker fixed:** `scripts/verify-mram.ts:63` threw `Unsupported .mram version: <n>` on any version ≠ 1. Every on-disk `.mram` was baked at v3, so the shipped verifier was inoperable against real content. Version byte is now required to be 3; v1/v2 rejected with `v3 required`.
- **CONTENT-06 structurally enforceable:** any `.mram` missing per-line Opus / bad OGG magic / out-of-band duration / missing metadata now fails `verify-mram.ts --check-audio-coverage` with exit code 1 and a precise error message.
- **CONTENT-07 structurally enforceable:** `npm run verify-content` orchestrates validator (D-08 bake-band from Plan 03-04) + audio-coverage across every ritual, aggregates PASS/FAIL, exits 1 on any failure.
- **Shannon-facing workflow:** one command (`npm run verify-content`) is now THE acceptance criterion for every Wave 1 content plan (04-03 through 04-07).

## Task Commits

Each task was committed atomically:

1. **Task 1: Wave-0 test scaffolds for verify-mram + verify-content** — `87e7415` (test)
   - 14 RED tests across 2 files; fixture strategy (real Opus base64) established.
   - Runs in ~20s; fails with 14 test failures + 1 unhandled rejection from main() running on import (fixed in Task 2 via isDirectRun).

2. **Task 2: Bump verify-mram to v3 + implement --check-audio-coverage + build verify-content release gate** — `65b8172` (feat)
   - Version byte check bumped from `!== 1` to `!== 3`.
   - Local interfaces extended with v3 fields.
   - `--check-audio-coverage`, `--json`, `--rituals-dir` flags added.
   - `decryptMRAM`, `promptPassphrase`, `checkAudioCoverage`, `CoverageFailure`, `CoverageResult` exported.
   - `scripts/verify-content.ts` created (release gate, 336 LOC).
   - `package.json`: `verify-content` npm script added.
   - All 15 tests GREEN (1 Task-1 test fixture adjusted: 12-byte → 1024-byte all-zeros so the byte-len gate passes and the OGG-magic gate fires as intended).
   - 5 regex `/s` dotAll flags removed (ES2018-only; target is ES2017) — table output puts ritual+status on same line anyway.

## Files Created/Modified

### Created

- `scripts/verify-content.ts` (336 LOC) — release gate orchestrator. Discovers `{slug}.mram` files → pairs with dialogue/cipher → runs `validatePair` → decrypts → runs `checkAudioCoverage` → aggregates into PASS/FAIL summary table → exits 1 on any failure. Accepts `--rituals-dir <path>` (test isolation), `--json` (machine-readable), `--help`. Prompts passphrase ONCE per P10 invariant, reuses across every ritual. Does NOT abort on first failure — every ritual is checked so Shannon sees the full picture.

- `scripts/__tests__/verify-mram.test.ts` (360 LOC) — 10 tests:
  1. Good v3 fixture with all audio → exit 0 + "Audio Coverage" + "X/X lines OK"
  2. Missing audio on a spoken line → exit 1 + line.id in output
  3. Audio with 1024 zero bytes (no OGG magic) → exit 1 + "OGG magic"
  4. Duration anomaly (sec/char > 3× ritual median with 35 samples) → exit 1 + "too-long"/"duration-anomaly"
  5. v2 file → exit 1 + "v3 required"
  6. v1 file → exit 1 + "v3 required"
  7. --json output: machine-readable shape + no plain/cipher leakage (UNIQUE_PLAIN_MARKER / UNIQUE_CIPHER_MARKER never appear in stdout)
  8. No-flag mode preserves "Role breakdown" + "Verification complete" sentinels on v3
  9. checkAudioCoverage pure-function export: pass=true on good doc
  10. checkAudioCoverage: returns missing-metadata failure when audioFormat deleted

- `scripts/__tests__/verify-content.test.ts` (241 LOC) — 5 tests:
  1. Two good rituals → exit 0 + both PASS in summary
  2. Ritual-A validator-fail (speaker mismatch) → exit 1 + ritual-A FAIL "validator"
  3. Ritual-B audio-coverage-fail → exit 1 + ritual-B FAIL + "audio"
  4. Ritual-C missing -dialogue.md → exit 1 + "missing-dialogue-pair"
  5. Aggregate: 1 pass + 2 fail → all three appear in summary, exit 1 (no early abort)

- `.planning/phases/04-content-coverage/04-01-SUMMARY.md` — this file.

### Modified

- `scripts/verify-mram.ts` (263 → 632 LOC):
  - Line 63 version check: `version !== 1` → `version !== 3` with new "v3 required" error.
  - Local `MRAMDocument` + `MRAMMetadata` + `MRAMLine` extended with v3 fields (`voiceCast?`, `audioFormat?`, `expiresAt?`, `audio?`, `style?`).
  - New `CoverageFailure` + `CoverageResult` exports.
  - New `checkAudioCoverage(doc: MRAMDocument): Promise<CoverageResult>` — pure async function, no CLI coupling. Checks OGG magic + byte-len bounds + duration anomaly + metadata presence.
  - New `parseArgs()` helper → `--check-audio-coverage`, `--json` flags (position-independent).
  - Exported `decryptMRAM` + `promptPassphrase` (previously local).
  - Added `isDirectRun` guard at bottom — tests can import without triggering `main()`.
  - Phase 3 no-flag behaviour preserved (same sentinels: "Role breakdown", "✓ Verification complete"). This is the first time the no-flag code path runs successfully against v3 content.

- `package.json`: added `"verify-content": "npx tsx scripts/verify-content.ts"` npm script alias.

## Key Technical Decisions

### Version bump strategy: reject v1/v2 rather than support them

CONTENT-06 demands "every shipped .mram has per-line Opus" — a strict v3-only property. A permissive `SUPPORTED_VERSIONS = [1, 2, 3]` model would leak through v1/v2 files that lack `audio` on every spoken line. The pilot cannot ship heterogeneous .mram versions to invited officers without breaking the coverage guarantee.

### Duration anomaly ≥30 samples gate

Matches `scripts/build-mram-from-dialogue.ts` bake-time gate (AUTHOR-06 D-10 Pitfall 6). Below 30 samples the per-ritual median is unstable enough to false-positive on short rituals. The check is gracefully skipped below the threshold rather than throwing. This matters for the smallest rituals in the set (officer lectures may have <30 spoken lines).

### Aggregate visibility over fail-fast

Release gate does not abort on first failure, unlike `bake-all.ts`. The ceiling-case operator behaviour differs: a failed bake signals a systemic issue (auth, quota, detector false positive) worth investigating before burning more API calls. A failed release gate check signals a content issue on ONE ritual — Shannon wants to see every issue in one run so he can fix the batch in a single session.

### Local interface duplication over shared import

`scripts/verify-mram.ts` declares its own `MRAMDocument` / `MRAMMetadata` / `MRAMLine` interfaces even though `src/lib/mram-format.ts` exports the canonical shapes. This matches the Phase 3 pattern across `build-mram-from-dialogue.ts`, `bake-all.ts`, and other scripts. The local copies are narrower (only fields the script actually reads); JSON.parse passes through unknown fields without issue.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test 3 fixture byte length too small**

- **Found during:** Task 2 first test run.
- **Issue:** Plan's suggested fixture for the OGG-magic test used 12 zero bytes (`"AAAAAAAAAAAAAAAA"` base64), but my implementation correctly rejects under-500-byte payloads via the `byte-len-out-of-range` gate BEFORE the OGG-magic check. The test was asserting "OGG magic" text in the output but the actual failure reason was "byte-len-out-of-range".
- **Fix:** Changed fixture to 1024 zero bytes — above the 500-byte MIN floor so the byte-len gate passes and the OGG-magic gate is the one that fires (first 4 bytes are 0x00 0x00 0x00 0x00, not "OggS").
- **Files modified:** `scripts/__tests__/verify-mram.test.ts` (Test 3 body).
- **Commit:** `65b8172` (bundled with Task 2 since the test was synthesized in Task 1 but the gate order was defined in Task 2).

**2. [Rule 3 - Blocking] /s (dotAll) regex flag requires ES2018+**

- **Found during:** Task 2 TypeScript check.
- **Issue:** `tsconfig.json` target is ES2017. `expect(stdout).toMatch(/foo.*bar/s)` in `verify-content.test.ts` triggered 6 TS1501 errors.
- **Fix:** Dropped the `/s` flag. Inspection of the verify-content.ts summary-table output showed ritual-slug + PASS/FAIL always print on the same line, so `.` (without dotAll) already matches — no dotAll needed.
- **Files modified:** `scripts/__tests__/verify-content.test.ts` (6 regex literals).
- **Commit:** `65b8172`.

### None Required

No architectural deviations. No authentication gates. No new dependencies.

## Test Results

- **Before plan:** 517 passed (Phase 3 baseline, 43 test files)
- **After plan:** **532 passed** (45 test files; +15 net)
- **Breakdown of new tests:**
  - `scripts/__tests__/verify-mram.test.ts`: 10 tests
  - `scripts/__tests__/verify-content.test.ts`: 5 tests
- **TypeScript errors:** 21 (below Phase 3 baseline of 26; net improvement of -5 — Plan 04-01's test file is clean, and the absence of the `/s` flag dropped 6 errors)
- **Next.js build:** clean (27 routes, no warnings)

## Smoke Test Result

- `npm run verify-content -- --help` → prints usage, exits 0 ✓
- `npx tsx scripts/verify-content.ts --rituals-dir /tmp/empty-rituals` (empty dir) → "No .mram files found", exits 0 ✓
- `MRAM_PASSPHRASE=wrong npx tsx scripts/verify-mram.ts rituals/ea-opening.mram --check-audio-coverage` → `Fatal error: Decryption failed — wrong passphrase?`, exits 1 ✓ (critically — NOT "Unsupported .mram version: 3"; the version bump is working end-to-end on real v3 content)
- Real-passphrase end-to-end smoke against `rituals/ea-opening.mram` deferred — the real passphrase isn't captured in the agent's env. Shannon verifies manually when next re-baking EA (Plan 04-03).

## Pre-existing Bug Resolved

**Confirmation:** The throw path that made Phase 3's `verify-mram.ts` inoperable against every on-disk `.mram` is gone. The active version check is now `if (version !== REQUIRED_VERSION)` where `REQUIRED_VERSION = 3`. The only remaining `version !== 1` string in the file is a comment documenting the historical throw ("the old `version !== 1` throw made verify-mram inoperable..."). Smoke-test proof: `rituals/ea-opening.mram` now decrypts past the version byte instead of throwing.

## Self-Check: PASSED

- `scripts/verify-mram.ts` exists ✓
- `scripts/verify-content.ts` exists ✓
- `scripts/__tests__/verify-mram.test.ts` exists ✓
- `scripts/__tests__/verify-content.test.ts` exists ✓
- `.planning/phases/04-content-coverage/04-01-SUMMARY.md` exists ✓
- Commit `87e7415` present in git log ✓
- Commit `65b8172` present in git log ✓
- `package.json` contains `"verify-content"` ✓
- Full vitest suite: 532/532 passing ✓
