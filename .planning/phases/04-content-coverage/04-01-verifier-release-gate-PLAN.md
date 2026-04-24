---
phase: 04-content-coverage
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - scripts/verify-mram.ts
  - scripts/verify-content.ts
  - scripts/__tests__/verify-mram.test.ts
  - scripts/__tests__/verify-content.test.ts
  - package.json
autonomous: true
requirements: [CONTENT-06, CONTENT-07]
tags: [verifier, release-gate, opus-audio, mram, content-coverage]

must_haves:
  truths:
    - "`scripts/verify-mram.ts` accepts v3 .mram files (the current throw-on-`version !== 1` check is replaced with `version !== 3`); v1/v2 files are rejected with a `v3 required` error — matches Plan 04-01 Test 5"
    - "`scripts/verify-mram.ts` local interfaces (`MRAMDocument`, `MRAMMetadata`, `MRAMLine`) are extended to match the v3 shape from `src/lib/mram-format.ts`: `metadata.voiceCast?: Record<string,string>`, `metadata.audioFormat?: 'opus-32k-mono'`, `MRAMLine.audio?: string` (base64 Opus bytes)"
    - "`npx tsx scripts/verify-mram.ts rituals/{slug}.mram --check-audio-coverage` exits 0 when every spoken line has valid base64 Opus with OGG magic; exits 1 with per-line failure list otherwise"
    - "The audio-coverage check reuses `scripts/lib/bake-math.ts:isDurationAnomaly` (same >3×/<0.3× per-ritual-median thresholds as AUTHOR-06 D-10) — a belt-and-suspenders re-check at verify time"
    - "`npm run verify-content` discovers every `rituals/*.mram`, pairs it with `{slug}-dialogue.md` + `{slug}-dialogue-cipher.md`, runs `validatePair()` (refusing on any `severity: 'error'` issue per D-08), runs `--check-audio-coverage`, aggregates results, exits 1 on any failure"
    - "`npm run verify-content` prints a per-ritual pass/fail summary table; CONTENT-06 and CONTENT-07 are enforceable from a single command"
    - "Existing Phase 3 behaviour of `verify-mram.ts` is preserved when `--check-audio-coverage` is NOT passed (role breakdown / section table / sample-line display — BUT operating against v3 files now, since the version byte bump is what unlocks this; Phase 3 shipped these features but the `version !== 1` throw made them unreachable against real baked content)"
    - "Unit tests synthesize tiny fixture `.mram` files on-the-fly (no large binaries committed to git)"
  artifacts:
    - path: "scripts/verify-mram.ts"
      provides: "Decrypter + checksum verifier with version bump (v1→v3 accept), extended v3 interfaces (audio, audioFormat, voiceCast), --check-audio-coverage flag, --json flag, Opus OGG-magic sanity, duration-anomaly belt-and-suspenders check, metadata.audioFormat/voiceCast presence assertion"
      contains: "--check-audio-coverage, isDurationAnomaly, MRAMLine.audio, audioFormat, voiceCast, opus-32k-mono, version !== 3"
    - path: "scripts/verify-content.ts"
      provides: "Release-gate orchestrator: discover → pair → validatePair → verify-mram --check-audio-coverage → aggregate → exit code"
      min_lines: 80
      contains: "validatePair, verify-mram, rituals/*.mram, process.exit"
    - path: "scripts/__tests__/verify-mram.test.ts"
      provides: "Unit tests for --check-audio-coverage: missing-audio detection, bad-base64, OGG-magic check, duration anomaly, metadata presence, --json shape"
      min_lines: 120
    - path: "scripts/__tests__/verify-content.test.ts"
      provides: "Unit tests for release-gate orchestration: multi-ritual discovery, pair resolution, validator-fail propagation, audio-coverage-fail propagation, all-pass case"
      min_lines: 80
    - path: "package.json"
      provides: "`verify-content` npm script alias"
      contains: "verify-content"
  key_links:
    - from: "scripts/verify-content.ts"
      to: "src/lib/author-validation.ts:validatePair"
      via: "import"
      pattern: "import.*validatePair.*from.*author-validation"
    - from: "scripts/verify-content.ts"
      to: "scripts/verify-mram.ts"
      via: "programmatic import OR child_process.spawnSync"
      pattern: "verify-mram"
    - from: "scripts/verify-mram.ts"
      to: "scripts/lib/bake-math.ts:isDurationAnomaly"
      via: "import"
      pattern: "isDurationAnomaly"
    - from: "scripts/verify-mram.ts"
      to: "src/lib/mram-format.ts:MRAMLine"
      via: "local interface or shared type"
      pattern: "audio\\?:"
    - from: "plans 04-03 through 04-08"
      to: "scripts/verify-content.ts"
      via: "`npm run verify-content` invocation in per-ritual `<verify>` sections"
      pattern: "verify-content"
---

<objective>
Extend `scripts/verify-mram.ts` with a `--check-audio-coverage` flag that asserts every spoken line in a `.mram` carries valid per-line Opus audio (CONTENT-06), and create `scripts/verify-content.ts` — a local-only release gate that runs validator + verifier across every shipped `.mram` (CONTENT-07). Wire `npm run verify-content` as the single command Shannon runs before distributing a batch.

Purpose: CONTENT-06 ("verified to have per-line Opus embedded") and CONTENT-07 ("passes cipher/plain parity validator before release") must be enforceable as a single local command. Because `rituals/*.md` and `*.mram` are gitignored (copyright — see `.gitignore:110-115`), no GitHub Actions workflow is viable. The release gate is local-only, and every Wave 1 content plan (04-03..07) depends on this verifier existing as their per-ritual acceptance criterion.

**Pre-existing bug being fixed:** The current `scripts/verify-mram.ts:63` throws `Unsupported .mram version: <n>` on any file whose version byte is not `1`. Every on-disk `.mram` in `rituals/` was baked at v3 (confirmed by inspecting `rituals/ea-opening.mram` header bytes: `4d52414d 03 ...`) — so the currently-shipped verifier is inoperable against real baked content. This plan's Task 2 bumps the accepted version to `3` AND extends the local interfaces to match the v3 shape that `src/lib/mram-format.ts` has been producing since Phase 3 Plan 05.

Output: Extended `verify-mram.ts` (v3 interface + audio-coverage check + --json output); new `scripts/verify-content.ts` orchestrator; `npm run verify-content` alias; unit tests with on-the-fly synthesized tiny `.mram` fixtures (<100KB each; avoids committing 3-8 MB binaries).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/04-content-coverage/04-RESEARCH.md
@.planning/phases/04-content-coverage/04-VALIDATION.md
@.planning/phases/03-authoring-throughput/03-CONTEXT.md

@scripts/verify-mram.ts
@scripts/bake-all.ts
@scripts/lib/bake-math.ts
@src/lib/author-validation.ts
@src/lib/mram-format.ts
@package.json

<interfaces>
<!-- Key types and contracts. Executor uses these directly — no codebase exploration needed. -->

From src/lib/mram-format.ts (Phase 3 Plan 05 — canonical v3 shape):
```typescript
export interface MRAMDocument {
  format: "MRAM";
  version: number; // 3 as of Phase 3
  metadata: MRAMMetadata;
  roles: Record<string, string>;
  sections: MRAMSection[];
  lines: MRAMLine[];
}

export interface MRAMMetadata {
  jurisdiction: string;
  degree: string;
  ceremony: string;
  checksum: string;
  expiresAt?: string;
  /** v3+: base64-Opus audio per-line tagged with this voice cast. */
  voiceCast?: Record<string, string>;
  /** v3+: codec identifier. */
  audioFormat?: "opus-32k-mono";
}

export interface MRAMLine {
  id: number;
  section: string;
  role: string;    // "WM" | "SW" | ... | "CUE"
  gavels: number;
  action: string | null;
  cipher: string;
  plain: string;
  style?: string;
  /** v3+: base64 Opus bytes. Absent on v1/v2 files and on CUE/action-only rows. */
  audio?: string;
}
```

From src/lib/author-validation.ts:
```typescript
export interface PairLineIssue {
  index: number;
  severity: "error" | "warning";
  kind: "structure-speaker" | "structure-kind" | "structure-action" | "structure-cue" | "unknown-role" | "empty-text" | "ratio-outlier";
  message: string;
}

export interface PairValidationResult {
  structureOk: boolean;
  plainWarnings: DialogueWarning[];
  cipherWarnings: DialogueWarning[];
  lineIssues: PairLineIssue[];
  counts: { plainNodes: number; cipherNodes: number; sections: number; spokenLines: number; actionLines: number; cues: number };
  firstDivergence?: { index: number; plain: string; cipher: string };
}

export function validatePair(plainSource: string, cipherSource: string): PairValidationResult;
```

From scripts/lib/bake-math.ts (Phase 3 Plan 06):
```typescript
// Pure helpers — reuse at verify time.
export function computeMedianSecPerChar(samples: Array<{ chars: number; seconds: number }>): number;
export function isDurationAnomaly(
  charCount: number,
  durationSeconds: number,
  medianSecPerChar: number
): { anomaly: false } | { anomaly: true; ratio: number; kind: "too-long" | "too-short" };
```

From scripts/bake-all.ts (Phase 3 Plan 07):
```typescript
export function getAllRituals(): string[]; // returns sorted slugs in rituals/
```

From scripts/verify-mram.ts (current Phase 3 state — the code Plan 04-01 Task 2 edits):
```typescript
// Current line 41-53 (LOCAL interfaces, narrower than src/lib/mram-format.ts):
interface MRAMDocument {
  format: "MRAM";
  version: number;
  metadata: {
    jurisdiction: string;
    degree: string;
    ceremony: string;
    checksum: string;
    // MISSING: voiceCast, audioFormat (v3 fields) — Plan 04-01 Task 2 adds these.
  };
  roles: Record<string, string>;
  sections: { id: string; title: string; note?: string }[];
  lines: MRAMLine[];
  // MRAMLine currently lacks the v3 `audio?: string` field — Plan 04-01 Task 2 adds it.
}

// Current line 63:
// const version = buffer[4];
// if (version !== 1) {
//   throw new Error(`Unsupported .mram version: ${version}`);
// }
// Plan 04-01 Task 2 replaces this with `version !== 3` (see Task 2 action step 1).

// function decryptMRAM(buffer: Buffer, passphrase: string): MRAMDocument — NOT exported today.
// This plan MUST export it so verify-content.ts can reuse it without spawning a subprocess.
```
</interfaces>
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| argv → verify-mram | Shannon passes a `.mram` path on the command line; path traversal must not escape intended content |
| argv → verify-content | Same concern; discovery path via `getAllRituals()` is safer (no user-supplied path) |
| .mram file bytes → Opus parser | Malformed Opus bytes must not hang/crash the verifier (DoS on CI-less local workflow is low severity but UX is unacceptable) |
| base64 decode → Buffer | Attacker-controlled payload inside a decrypted `.mram` (post-passphrase, so self-owned) could attempt memory growth via oversized base64 fields |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-04-01 | Tampering | scripts/verify-mram.ts argv | mitigate | Accept only paths under cwd's `rituals/` OR an absolute-but-existing file; reject `..` traversal; `fs.realpathSync` containment under `process.cwd()` when path is relative |
| T-04-02 | DoS | Opus parse on malformed audio | mitigate | Bound `music-metadata` parse by setting a byte-length cap (reject lines with `base64Decoded.length > 10 * 1024 * 1024` = 10 MB per line — no legitimate bake produces this); wrap parse in try/catch, report line as corrupt, continue to next line |
| T-04-03 | Information Disclosure | MRAM_PASSPHRASE in env / argv | accept | Passphrase is already prompted no-echo per the existing Phase 3 pattern in verify-mram.ts:promptPassphrase; env fallback matches bake-all convention |
| T-04-04 | Information Disclosure | stdout / --json ritual contents | mitigate | `--json` output reports per-line pass/fail by `line.id` + byte-len, NEVER the `plain` or `cipher` text. Stdout's existing "first 3 / last 3" sample behaviour is preserved when `--check-audio-coverage` is NOT passed; under `--check-audio-coverage` those samples are suppressed so the check output is suitable for logging to a file |
| T-04-05 | Spoofing | release-gate discovery | mitigate | `scripts/verify-content.ts` uses `scripts/bake-all.ts:getAllRituals()` — already sorted + globbed — rather than reading a user-supplied manifest; no spoofing surface |
| T-04-06 | Elevation of Privilege | subprocess/exec | accept | `verify-content.ts` may import verify-mram's `decryptMRAM` + coverage function directly (no child_process spawn). If subprocess is used, arg list is a string[] (no shell interpolation); accepted as low risk |

**Severity:** all threats LOW (local dev-only tool; no network surface; self-owned inputs). Mitigations are defense-in-depth against operator mistake, not adversarial attack.
</threat_model>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Wave-0 test scaffolds for verify-mram + verify-content</name>
  <files>scripts/__tests__/verify-mram.test.ts, scripts/__tests__/verify-content.test.ts</files>
  <behavior>
    Test file `scripts/__tests__/verify-mram.test.ts` — RED tests:
    - Synthesize a tiny good v3 `.mram` in a `beforeAll` using the existing encryption machinery in `src/lib/mram-format.ts:encryptMRAM` (WebCrypto-based; wrap in a helper that Node can call via the `crypto.webcrypto` global). Fixture: 2 spoken lines + 1 action + valid base64 Opus payload per spoken line (use a 400-byte prerecorded OGG/Opus blob checked into the test file as a base64 constant — real Opus bytes captured from a known-good cached ea-opening line; <100KB total fixture size per VALIDATION.md constraint). The fixture MUST serialize with `version = 3` so Task 2's version-throw change is testable.
    - Test 1: `verify-mram --check-audio-coverage good.mram` exits 0, prints "Audio Coverage" section with "X/X lines OK".
    - Test 2: A `.mram` with ONE spoken line where `audio` is deleted before encryption → exits 1; stderr includes the offending `line.id`.
    - Test 3: A `.mram` where one line's `audio` contains base64 decoding to 4 bytes not matching OGG magic → exits 1; error message mentions "OGG magic".
    - Test 4: A `.mram` with per-line durations intentionally rigged so one line triggers `isDurationAnomaly` (synthesize by cramming 3× the median sec/char into a line) → exits 1; error message quotes the `ratio` and `kind: "too-long"`.
    - Test 5: A v2-era `.mram` (version byte = 2; no `metadata.audioFormat`, no `metadata.voiceCast`) → exits 1; message says "v3 required" (the implementation's `if (version !== 3)` throw path). A v1 file must ALSO be rejected the same way.
    - Test 6: `--json` mode prints a machine-readable shape `{ ritual, totalLines, spokenLines, linesWithAudio, failures: [{ lineId, kind, message }] }` and DOES NOT include `plain` or `cipher` text anywhere in the output.
    - Test 7: Without `--check-audio-coverage`, the v3-accepting script preserves the existing Phase 3 output sentinels against a v3 fixture → stdout contains `"Role breakdown"` AND `"✓ Verification complete"`. Assert sentinel-presence only (not byte-identical; the existing script was never exercised against v3 in Phase 3 because of the `version !== 1` throw — so "byte-identical" is not a coherent baseline. The sentinels are the contract; exact output formatting may differ because this is the first time the script runs successfully against v3.).

    Test file `scripts/__tests__/verify-content.test.ts` — RED tests:
    - Test 1: A tmpdir with 2 good `.mram` files + their 2 dialogue/cipher pairs → `main()` exits 0, stdout summary table has 2 PASS rows.
    - Test 2: A tmpdir where ritual-A's dialogue/cipher has a deliberately-mismatched speaker (validator returns `severity: 'error'`) → exits 1; summary marks ritual-A FAIL with reason "validator".
    - Test 3: A tmpdir where ritual-B's `.mram` has a line missing `audio` → exits 1; ritual-B FAIL with reason "audio-coverage".
    - Test 4: A tmpdir where ritual-C lacks a paired `-dialogue.md` (deleted post-bake) → exits 1; ritual-C FAIL with reason "missing-dialogue-pair".
    - Test 5: Aggregate behaviour — mixed pass/fail across 3 rituals exits 1, BUT prints summary for ALL three (no early abort on first failure); verifies the gate surfaces every issue in one run.

    All tests MUST fail on first run (no implementation yet). Use `it.todo` ONLY as a last resort per D-21 convention — prefer full RED test bodies so Task 2 has a concrete target.
  </behavior>
  <action>
    Create `scripts/__tests__/verify-mram.test.ts` (vitest, node env) and `scripts/__tests__/verify-content.test.ts` with the RED tests above.

    Implementation notes:
    - Use `vitest.tmpDir` / `os.tmpdir()` + `fs.mkdtempSync` for per-test tmpdirs; clean up in `afterEach`.
    - For the Opus fixture byte array: run `npx tsx scripts/preview-bake.ts` briefly against the existing ea-opening cache, copy one 400-byte `.opus` file, base64-encode it into a test-only `FIXTURE_OPUS_B64` constant. Document the source at the top of the test file. Do NOT commit the raw `.opus` fixture — the base64 string inside the `.test.ts` file is the only committed form.
    - The `encryptMRAM()` helper lives in `src/lib/mram-format.ts` and uses WebCrypto; in Node 22 it's `globalThis.crypto.subtle`, so import should work without shims. If it fails under vitest node env, wrap via `import { webcrypto } from 'node:crypto'` + `globalThis.crypto = webcrypto as Crypto`.
    - When synthesizing the v2 fixture for Test 5, the test must hand-craft a buffer with version byte = 2 (and separately version = 1) rather than calling `encryptMRAM` (which only emits v3). Reuse the serialize layout from `src/lib/mram-format.ts` with a different version byte.
    - All tests MUST capture stdout/stderr via vitest's `vi.spyOn(console, 'log')` and `vi.spyOn(console, 'error')` so they can assert against output without relying on subprocess spawning.
    - For `verify-content.test.ts` Test 2: create a tmpdir under `os.tmpdir()`, copy `ea-opening-dialogue.md` + `ea-opening-dialogue-cipher.md` as the good ritual, then write a deliberately-mismatched cipher for ritual-A (e.g., change first speaker). CRITICAL: do NOT write to the real `rituals/` directory — the release gate must accept a path arg (`--rituals-dir <path>`) for test isolation. Add this flag as part of Task 2's implementation.
    - Nyquist compliance: a single `npx vitest run --no-coverage scripts/__tests__/verify-mram.test.ts scripts/__tests__/verify-content.test.ts` completes in <5s and fails clearly.
    - Run the tests to confirm they RED-fail (not timeout/crash): `npx vitest run --no-coverage scripts/__tests__/verify-mram.test.ts scripts/__tests__/verify-content.test.ts` → expect all tests to fail with "not implemented" or similar, not crash the runner.
    - Commit prefix: `content-01: add wave-0 test scaffolds for verify-mram audio-coverage + verify-content release gate`
  </action>
  <verify>
    <automated>npx vitest run --no-coverage scripts/__tests__/verify-mram.test.ts scripts/__tests__/verify-content.test.ts 2>&1 | tail -30</automated>
  </verify>
  <done>Both test files exist with full RED bodies (no `it.todo` placeholders). Running the command above shows ALL tests failing (none passing, none crashing the runner). Commit lands; Phase 3 baseline tests (517) still pass via `npx vitest run --no-coverage`.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Bump verify-mram.ts to v3 (version + interfaces) + implement --check-audio-coverage + build verify-content.ts release gate + wire npm script</name>
  <files>scripts/verify-mram.ts, scripts/verify-content.ts, package.json</files>
  <behavior>
    After this task the tests from Task 1 go GREEN.

    **Mandatory prerequisite edits to `scripts/verify-mram.ts` (do these FIRST before adding new features):**

    1. **Version byte bump (line 63 today):** Replace `if (version !== 1) { throw new Error(\`Unsupported .mram version: ${version}\`); }` with:
       ```typescript
       if (version !== 3) {
         throw new Error(`Unsupported .mram version: ${version} (v3 required)`);
       }
       ```
       Before editing, verify the target by inspecting a real file: `xxd rituals/ea-opening.mram | head -1` — the 5th byte (index 4) of the `MRAM` magic should be `03`. This is the v3 indicator. Any `.mram` file that is NOT v3 (older Phase 3 builds pre-Plan-05, v2 hand-crafts) must be rejected — the pilot cannot ship heterogeneous .mram versions to invited officers. Note: this deliberately makes v1/v2 files unreadable; that matches CONTENT-06's intent ("every shipped .mram has per-line Opus", which is a v3-only property).

    2. **Local interface extension (line 41-53 today):** The local `MRAMDocument` / `MRAMMetadata` / `MRAMLine` interfaces in `scripts/verify-mram.ts` are narrower than the canonical shape in `src/lib/mram-format.ts`. Add the v3 fields:
       ```typescript
       interface MRAMDocument {
         format: "MRAM";
         version: number;
         metadata: {
           jurisdiction: string;
           degree: string;
           ceremony: string;
           checksum: string;
           expiresAt?: string;
           /** v3+: base64-Opus audio per-line tagged with this voice cast. */
           voiceCast?: Record<string, string>;
           /** v3+: codec identifier. */
           audioFormat?: "opus-32k-mono";
         };
         roles: Record<string, string>;
         sections: { id: string; title: string; note?: string }[];
         lines: MRAMLine[];
       }

       interface MRAMLine {
         id: number;
         section: string;
         role: string;
         gavels: number;
         action: string | null;
         cipher: string;
         plain: string;
         style?: string;
         /** v3+: base64 Opus bytes. Absent on CUE/action-only rows. */
         audio?: string;
       }
       ```
       Alternative: import the shared types from `src/lib/mram-format.ts` directly instead of re-declaring locally. Either approach is fine; importing is DRY-er but the local duplication is the Phase 3 pattern. Pick one.

    **After the version + interface prerequisite edits, add the new features:**

    `scripts/verify-mram.ts` gains:
    - New flag `--check-audio-coverage` (position-independent).
    - New flag `--json` (machine-readable output).
    - New flag `--rituals-dir <path>` (dev/test-only override for release-gate integration; defaults to repo's `rituals/`).
    - Exported `decryptMRAM(buffer, passphrase): MRAMDocument` (currently a local helper; lift to a named export so `verify-content.ts` can reuse without subprocess spawn).
    - Exported `checkAudioCoverage(doc: MRAMDocument): { pass: boolean; failures: CoverageFailure[] }` — pure function, testable independently of CLI.
    - Under `--check-audio-coverage`:
      * For every `line` where `line.role !== "CUE"` AND `line.action === null` AND `line.plain.trim().length > 0`:
        * Require `line.audio` to be a non-empty string.
        * `Buffer.from(line.audio, 'base64')` must succeed AND first 4 bytes must equal `OggS` (0x4F 0x67 0x67 0x53).
        * Decode byte length must be in `[500, 10_000_000]` bytes (lower bound: real Opus lines are never <500 bytes; upper: 10 MB per-line hard cap — DoS mitigation).
      * Compute per-ritual median sec/char via `computeMedianSecPerChar()` from `scripts/lib/bake-math.ts`, using `music-metadata` to parse duration for each line's Opus bytes.
      * For every spoken line, run `isDurationAnomaly(chars, seconds, median)` — report anomalies.
      * Assert `doc.metadata.audioFormat === "opus-32k-mono"` AND `doc.metadata.voiceCast` is a non-empty object.
    - Under `--check-audio-coverage` + `--json`: output `{ ritual: <file basename>, totalLines, spokenLines, linesWithAudio, failures: [{ lineId: number, kind: "missing-audio" | "bad-base64" | "bad-ogg-magic" | "byte-len-out-of-range" | "duration-anomaly" | "missing-metadata", message: string }] }`. No `plain` / `cipher` text in output.
    - Under `--check-audio-coverage` (human-readable): print "=== Audio Coverage ===" section with per-failure lines and a final roll-up; suppress the existing "first 3 / last 3 spoken" sample blocks.
    - Exit code: 0 on pass, 1 on any coverage failure.
    - Existing Phase 3 CLI sentinels (`Role breakdown`, `✓ Verification complete`) preserved under no-flag invocation against v3 files — this is the first time the script actually runs successfully against v3 content; Test 7 pins the sentinels, not byte-identity.

    `scripts/verify-content.ts` (new, ~120 LOC):
    - Accepts `--rituals-dir <path>` (defaults to `rituals/` relative to cwd) and `--json` flags.
    - Discovers all `{slug}.mram` files in rituals-dir (does NOT use git since rituals are gitignored). Excludes the `_bake-cache/` subdirectory.
    - For each `.mram`:
      1. Resolve pair files: `{slug}-dialogue.md`, `{slug}-dialogue-cipher.md`. If either missing → record `missing-dialogue-pair` failure; continue.
      2. Run `validatePair(plain, cipher)` from `src/lib/author-validation.ts`. If any `lineIssues[i].severity === 'error'` → record `validator-fail`; continue (don't bail on first — continue to next ritual).
      3. Prompt for / read `MRAM_PASSPHRASE` env var (use the existing `promptPassphrase` helper from verify-mram.ts; requires export).
      4. `decryptMRAM(buffer, passphrase)` → MRAMDocument.
      5. `checkAudioCoverage(doc)` → record failures if any.
    - Aggregate: print per-ritual pass/fail table; exit 1 on any failure, 0 on all-pass.
    - Does NOT abort on first failure — every ritual is checked so Shannon sees the full picture in one run (ties directly to `verify-content.test.ts` Test 5).

    `package.json`: add `"verify-content": "npx tsx scripts/verify-content.ts"` alongside existing `bake-all` / `preview-bake` scripts. Alphabetize with existing alias order.

    Commit prefix: `content-01: bump verify-mram to v3 + implement --check-audio-coverage + build verify-content release gate`
  </behavior>
  <action>
    Implement per the behavior contract above. Key engineering decisions:

    0. **Do the prerequisite version+interface bump FIRST** (before any new feature work). Without it, Task 1 Test 1 crashes with "Unsupported .mram version: 3" before any audio-coverage logic runs. Edit sequence:
       - Open `scripts/verify-mram.ts`.
       - Edit line 63 to `if (version !== 3) throw new Error(\`Unsupported .mram version: ${version} (v3 required)\`);`.
       - Edit the local interfaces (lines 41-53 in current state) to add `voiceCast?`, `audioFormat?`, `expiresAt?` to metadata and `audio?` to MRAMLine. See behavior block above for exact shape.
       - Run `npx vitest run --no-coverage scripts/__tests__/verify-mram.test.ts` — Tests 1, 5, 7 should now at least get past the version throw on v3 fixtures and fail at the audio-coverage / sentinel assertions (expected partial progress).

    1. **Opus OGG-magic check**: hardcode `OGG_MAGIC = Buffer.from([0x4f, 0x67, 0x67, 0x53])`. Compare first 4 bytes via `Buffer.compare(buf.subarray(0, 4), OGG_MAGIC) === 0`.

    2. **Duration parsing**: `import { parseBuffer } from 'music-metadata'`. Already a Phase 3 dep. Wrap in try/catch; on parse failure, record `bad-base64` or `bad-ogg-magic` rather than crashing. Bound timeout implicitly via the byte-length cap.

    3. **Median computation**: collect `{chars: line.plain.length, seconds: duration}` samples across all spoken lines, pass to `computeMedianSecPerChar()`. Skip first 30 samples per bake-math.ts convention (AUTHOR-06 D-10). Per-ritual median, NOT project-wide — matches D-10.

    4. **Exported surface** (for release-gate import):
       ```typescript
       export function decryptMRAM(buffer: Buffer, passphrase: string): MRAMDocument;
       export async function promptPassphrase(): Promise<string>;
       export interface CoverageFailure { lineId: number; kind: "missing-audio" | "bad-base64" | "bad-ogg-magic" | "byte-len-out-of-range" | "duration-anomaly" | "missing-metadata"; message: string; }
       export async function checkAudioCoverage(doc: MRAMDocument): Promise<{ pass: boolean; failures: CoverageFailure[]; stats: { totalLines: number; spokenLines: number; linesWithAudio: number; } }>;
       ```

    5. **CLI arg parsing**: extend the existing minimal arg loop — don't pull in yargs/commander. Phase 3 pattern is manual `for (let i = 0; i < argv.length; i++)` per `scripts/bake-all.ts:parseFlags`.

    6. **`verify-content.ts` orchestration**: use `import { decryptMRAM, checkAudioCoverage, promptPassphrase } from './verify-mram'` — NO subprocess spawn (tests assert aggregate behaviour in a single process). `validatePair` imported from `'../src/lib/author-validation'`.

    7. **Passphrase handling in release gate**: prompt ONCE at start (per P10 single-passphrase invariant), reuse across every `.mram`. If a `.mram` fails to decrypt with the prompted passphrase, record as `decrypt-fail` failure and continue (don't exit — could be an older v2 file Shannon hasn't re-baked; the aggregate view is the point).

    8. **Exports must be tree-shaken cleanly**: `verify-mram.ts`'s own `main()` stays bottom-of-file + `if (isDirectRun()) main().catch(...)` pattern (match `scripts/preview-bake.ts:isDirectRun` convention) so test imports don't trigger the CLI.

    9. **Preserve no-flag sentinel output** — Test 7 locks `"Role breakdown"` + `"✓ Verification complete"` strings. Exact output formatting may differ from the Phase 3-era expectation because Phase 3 never successfully ran this code path against a v3 file; the sentinels are the contract.

    10. **Run tests + expect GREEN**: `npx vitest run --no-coverage scripts/__tests__/verify-mram.test.ts scripts/__tests__/verify-content.test.ts` — all should pass. Then `npx vitest run --no-coverage` full suite — 517 baseline + new tests, zero regressions.

    11. **Smoke test against a real existing EA `.mram`** (only runs locally, not in CI; Shannon does this manually after the plan lands):
        ```bash
        MRAM_PASSPHRASE=$PASSPHRASE npx tsx scripts/verify-mram.ts rituals/ea-opening.mram --check-audio-coverage
        # Expected: exits 0 against a freshly-baked v3 file. Previously (pre-Plan-04-01), this command exited 1 with "Unsupported .mram version: 3" — the interface bump above is what makes this work.
        ```

    12. **Commit prefix**: `content-01: bump verify-mram to v3 + implement --check-audio-coverage + build verify-content release gate`
  </action>
  <verify>
    <automated>npx vitest run --no-coverage scripts/__tests__/verify-mram.test.ts scripts/__tests__/verify-content.test.ts && npx vitest run --no-coverage 2>&1 | tail -5</automated>
  </verify>
  <done>
    All tests from Task 1 pass. Full vitest suite green: Phase 3 baseline 517 tests + ~15-20 new tests = ~535+ passing, zero regressions. `verify-mram.ts` accepts v3 files (rejects v1/v2 with "v3 required"). Local interfaces include `voiceCast`, `audioFormat`, `audio`. `npm run verify-content` is a valid npm alias (`npm run verify-content -- --help` prints usage). `decryptMRAM`, `checkAudioCoverage`, `promptPassphrase` are exported from `scripts/verify-mram.ts`.
  </done>
</task>

</tasks>

<verification>
- [ ] `scripts/verify-mram.ts` line 63 (or equivalent) now asserts `version !== 3`; v1/v2 fixtures are rejected with "v3 required"
- [ ] Local `MRAMDocument.metadata` interface in verify-mram.ts includes `voiceCast?` and `audioFormat?`; `MRAMLine` includes `audio?`
- [ ] `npx vitest run --no-coverage scripts/__tests__/verify-mram.test.ts` passes all tests
- [ ] `npx vitest run --no-coverage scripts/__tests__/verify-content.test.ts` passes all tests
- [ ] Full `npx vitest run --no-coverage` green (Phase 3 baseline 517 + new ~15-20 tests)
- [ ] `npm run verify-content -- --help` prints usage without crashing
- [ ] `npx tsx scripts/verify-mram.ts rituals/ea-opening.mram` (with passphrase) exits 0 and prints `Role breakdown` + `✓ Verification complete` (manual smoke, post-plan — this is the first successful run of this command against real v3 content)
- [ ] TypeScript check clean on touched files: `npx tsc --noEmit` regression count ≤ Phase 3 baseline (26)
</verification>

<success_criteria>
CONTENT-06 is structurally enforceable: any `.mram` missing per-line Opus coverage or carrying bad Opus / out-of-band duration / wrong metadata will fail `verify-mram.ts --check-audio-coverage` with exit code 1 and a precise error message.

CONTENT-07 is structurally enforceable: `npm run verify-content` is a one-command local release gate that runs validator + audio-coverage across every `rituals/*.mram`, aggregates results, surfaces every failure, exits 1 on any issue.

The verifier is THE acceptance criterion for Wave 1 content plans 04-03 through 04-07. Shannon cannot "ship" a ritual until its row passes `verify-content`.
</success_criteria>

<output>
After completion, create `.planning/phases/04-content-coverage/04-01-SUMMARY.md` recording:
- Files touched (with line counts for the new code)
- Test results (new tests added, baseline regression count)
- Any deviations from the plan (documented with rationale)
- A one-line smoke-test result against an existing EA `.mram` (or "deferred — EA re-bake lands in 04-03")
- The commit SHAs landed by this plan
- Confirmation that the pre-existing `version !== 1` throw is no longer in the code
</output>
