---
phase: 03-authoring-throughput
plan: 06
type: execute
wave: 3
depends_on: [04, 05]
files_modified:
  - scripts/build-mram-from-dialogue.ts
  - scripts/lib/resume-state.ts
  - scripts/lib/bake-math.ts
  - scripts/__tests__/bake-helpers.test.ts
autonomous: true
requirements: [AUTHOR-02, AUTHOR-04, AUTHOR-05, AUTHOR-06, AUTHOR-07]
tags: [bake-pipeline, short-line, google-tts, validator-gate, duration-anomaly, stt-verify, resume-state, line-level]

must_haves:
  truths:
    - "Lines shorter than MIN_BAKE_LINE_CHARS (default 5 per D-09) are NO LONGER hard-skipped. Instead they call Google Cloud TTS REST directly via the script-side googleTtsBakeCall helper and the Opus is embedded into the .mram the same as any Gemini-rendered line"
    - "Before ANY rendering per ritual, validatePair() runs on the plain/cipher file pair. Any issue with severity 'error' (including D-08 bake-band ratio-outliers from Plan 04) prints a failure report and exits process.exit(1) WITHOUT making a single API call"
    - "After each rendered line, the duration-anomaly detector computes durationMs from the Opus bytes via music-metadata parseBuffer, then compares against a rolling per-ritual median sec-per-char. >3× or <0.3× the median hard-fails the bake with a structured error message per D-10. First 30 lines per ritual skip the check (insufficient sample, per Pitfall 6)"
    - "--verify-audio flag (opt-in, default off) pipes each rendered line's Opus through Groq Whisper via a DIRECT API call (bypassing /api/transcribe per RESEARCH recommendation) and prints a word-diff roll-up at the end. NEVER hard-fails the bake (warn-only per D-11)"
    - "Google TTS short-line call sends ONLY {text, voiceName, languageCode} — NO preamble, NO style directive, NO voice-cast scene. Prevents the voice-cast-scene-leaks-into-audio failure mode from cross-contaminating the short-line engine (Pitfall 4)"
    - "Google voice mapping uses the existing GOOGLE_ROLE_VOICES table via getGoogleVoiceForRole() from src/lib/tts-cloud.ts — no re-invention; tonally matched to Gemini roles by existing curation"
    - "Short-line audio uses Google's `OGG_OPUS` audioEncoding — native Opus-in-Ogg, byte-compatible with Gemini's post-ffmpeg Opus path (Assumption A3). No ffmpeg transcode for short-line audio"
    - "Accepts three new CLI args for D-06 line-level resume: --resume-state-path <path> (state file location), --ritual-slug <slug> (identifies this bake), --skip-line-ids <id1,id2,...> (lines already completed in a prior interrupted run). Shared types live in scripts/lib/resume-state.ts (imported by Plan 07's bake-all.ts)"
    - "When --resume-state-path is provided, build-mram-from-dialogue.ts writes _RESUME.json atomically (tmp+rename via writeResumeStateAtomic) AFTER EVERY COMPLETED LINE — lineId moves from inFlightLineIds to completedLineIds. Before each render, lineId is added to inFlightLineIds + atomic-written so a crash mid-render leaves a recoverable state file. This is the concrete D-06 mechanism — per-line granularity, not per-ritual"
    - "When --skip-line-ids is provided, any line whose ID is in the set is skipped entirely (no render, no embed, no anomaly check). In-flight-but-not-completed lines from a prior crash are NOT in --skip-line-ids — they retry"
  artifacts:
    - path: scripts/build-mram-from-dialogue.ts
      provides: "bake pipeline with pre-render validator gate, short-line Google TTS route, post-render duration-anomaly detector, optional STT verify roll-up, line-level _RESUME.json state writes (D-06); all bake-time correctness gates (AUTHOR-02/04/05/06/07) wired in"
      contains: "googleTtsBakeCall"
    - path: scripts/lib/resume-state.ts
      provides: "shared ResumeState type + atomic read/write helpers, imported by both build-mram-from-dialogue.ts (writer) and bake-all.ts (reader)"
      contains: "writeResumeStateAtomic"
    - path: scripts/lib/bake-math.ts
      provides: "pure math helpers extracted from build-mram for unit testability: computeMedianSecPerChar (D-10 rolling median), isDurationAnomaly (>3× or <0.3× ratio check), wordDiff (expected ∖ got + got ∖ expected per D-11 --verify-audio). Imported by build-mram-from-dialogue.ts; covered by bake-helpers.test.ts"
      contains: "computeMedianSecPerChar"
    - path: scripts/__tests__/bake-helpers.test.ts
      provides: "unit tests for the ResumeState helpers AND the pure math helpers — atomic write round-trip, missing-file null return, .tmp non-leak, median odd/even/single, anomaly ratio <0.3×/>3×/in-band/boundary, wordDiff identical/missed/inserted/case-insensitive"
      contains: "writeResumeStateAtomic"
  key_links:
    - from: scripts/build-mram-from-dialogue.ts
      to: src/lib/author-validation.ts
      via: "pre-render gate: validatePair(plain, cipher) → filter severity==='error' → process.exit(1)"
      pattern: "validatePair"
    - from: scripts/build-mram-from-dialogue.ts
      to: src/lib/tts-cloud.ts
      via: "short-line branch calls getGoogleVoiceForRole(role) then googleTtsBakeCall(text, voiceName)"
      pattern: "getGoogleVoiceForRole"
    - from: scripts/build-mram-from-dialogue.ts
      to: music-metadata
      via: "parseBuffer(opusBytes, { mimeType: 'audio/ogg' }) → durationMs for anomaly detector"
      pattern: "parseBuffer"
    - from: scripts/build-mram-from-dialogue.ts
      to: "Groq Whisper API (https://api.groq.com/openai/v1/audio/transcriptions)"
      via: "--verify-audio only: direct multipart/form-data call with GROQ_API_KEY from env (RESEARCH recommendation over /api/transcribe)"
      pattern: "api.groq.com/openai/v1/audio/transcriptions"
    - from: scripts/build-mram-from-dialogue.ts
      to: scripts/lib/resume-state.ts
      via: "imports ResumeState type + writeResumeStateAtomic helper; calls it before/after every line render"
      pattern: "writeResumeStateAtomic"
---

<objective>
Wire the five Phase-3 bake-time gates into `scripts/build-mram-from-dialogue.ts`: (1) **pre-render validator gate** (AUTHOR-05 D-08) — call `validatePair()` before any API activity; bail on severity-error issues; (2) **short-line Google TTS route** (AUTHOR-04 D-09) — replace the current hard-skip behavior for lines under `MIN_BAKE_LINE_CHARS` with a direct Google Cloud TTS REST call that returns native Opus bytes embeddable verbatim in the .mram; (3) **audio-duration anomaly detector** (AUTHOR-06 D-10) — post-render, parse Opus via music-metadata, maintain a rolling per-ritual median sec-per-char, hard-fail any line >3× or <0.3× the median with a structured error; (4) **--verify-audio STT round-trip** (AUTHOR-07 D-11) — opt-in flag that pipes each Opus through Groq Whisper directly, warns on word-diff > 2 words (default threshold), never hard-fails the bake; (5) **line-level _RESUME.json writes** (AUTHOR-02 D-06) — accept `--resume-state-path / --ritual-slug / --skip-line-ids` CLI args, write state atomically after every completed line, and skip lines whose IDs are in the skip set. Shared ResumeState types live in `scripts/lib/resume-state.ts` so Plan 07's orchestrator can read the same shape.

Purpose: per D-06/D-08/D-09/D-10/D-11, the Phase 3 bake pipeline gains five correctness gates that catch the historical failure modes in a single pass: corrupted cipher/plain pairs, silently-dropped ultra-short lines, voice-cast-preamble-leaks manifesting as pathological durations, Whisper-diff mismatches as a final ship-check, and crash-recoverable per-line state. The D-06 mechanism is concrete — build-mram-from-dialogue.ts is the process that knows when a line actually completes, so it writes `_RESUME.json` directly rather than deferring to the orchestrator.

Output: updated `scripts/build-mram-from-dialogue.ts` with the five gates wired; new `scripts/lib/resume-state.ts` with the shared types and atomic helpers; the Plan-01 scaffold at `scripts/__tests__/bake-helpers.test.ts` filled with tests for the resume-state helpers (pure TS, deterministic, runs in < 1s). Orchestrator-level tests live in Plan 07 (`scripts/__tests__/bake-all.test.ts`).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/03-authoring-throughput/03-CONTEXT.md
@.planning/phases/03-authoring-throughput/03-RESEARCH.md
@.planning/phases/03-authoring-throughput/03-PATTERNS.md
@.planning/phases/03-authoring-throughput/03-VALIDATION.md
@.planning/phases/03-authoring-throughput/03-04-SUMMARY.md
@.planning/phases/03-authoring-throughput/03-05-SUMMARY.md
@scripts/build-mram-from-dialogue.ts
@src/lib/author-validation.ts
@src/lib/tts-cloud.ts
@src/app/api/tts/google/route.ts
@src/app/api/transcribe/route.ts
@scripts/__tests__/bake-helpers.test.ts

<interfaces>
<!-- Existing imports preserved. New imports this plan adds. -->

New imports at top of scripts/build-mram-from-dialogue.ts:
```typescript
import { parseBuffer } from "music-metadata";  // D-10 duration anomaly
import { validatePair, type PairValidationResult } from "../src/lib/author-validation";  // D-08 gate
import { getGoogleVoiceForRole, type GoogleVoiceProfile } from "../src/lib/tts-cloud";  // D-09 short-line mapping
import {
  type ResumeState,
  readResumeState,
  writeResumeStateAtomic,
} from "./lib/resume-state";  // D-06 line-level state
```

**Shared ResumeState types (scripts/lib/resume-state.ts — NEW file, imported by Plan 07 too):**
```typescript
/**
 * scripts/lib/resume-state.ts — shared resume-state types + atomic helpers.
 *
 * Written by scripts/build-mram-from-dialogue.ts (line-level, per-line
 * atomic writes). Read by scripts/bake-all.ts (orchestrator) to know which
 * lineIds completed in a prior interrupted run and pass them via
 * --skip-line-ids to the next build-mram invocation.
 *
 * AUTHOR-02 D-06: per-line granularity (not per-ritual). The writer is
 * the only process that knows when a line has actually completed (audio
 * embedded into the in-memory .mram document), so it writes here.
 */

import * as fs from "node:fs";
import * as path from "node:path";

export interface ResumeState {
  /** Slug of the ritual currently being baked. Guards against mixed-ritual resume. */
  ritual: string;
  /** Line IDs (in order of completion) that have been fully rendered + embedded. */
  completedLineIds: string[];
  /** Line IDs that started rendering but did not complete. Re-tried on resume. */
  inFlightLineIds: string[];
  /** Unix ms timestamp — when the current bake invocation started. */
  startedAt: number;
}

/**
 * Read _RESUME.json from `filePath`. Returns null when the file doesn't
 * exist OR when it's malformed (caller can then re-init from scratch).
 */
export function readResumeState(filePath: string): ResumeState | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (
      typeof raw !== "object" ||
      raw === null ||
      typeof raw.ritual !== "string" ||
      !Array.isArray(raw.completedLineIds) ||
      !Array.isArray(raw.inFlightLineIds) ||
      typeof raw.startedAt !== "number"
    ) {
      return null;
    }
    return raw as ResumeState;
  } catch {
    return null;
  }
}

/**
 * Write `state` to `filePath` atomically via tmp+rename (RESEARCH Pattern 6).
 * A crash mid-write leaves EITHER the old file intact OR the new file
 * fully written — never a truncated file. `fs.renameSync` is atomic on
 * POSIX within the same directory; the tmp path is co-located for that
 * reason.
 */
export function writeResumeStateAtomic(filePath: string, state: ResumeState): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, filePath);
}
```

**Short-line Google TTS call shape (D-09, RESEARCH Pattern 5):**
```typescript
/**
 * Direct Google Cloud TTS REST call for short-line bake path (D-09).
 * Bypasses /api/tts/google (no dev server during bake) and uses
 * GOOGLE_CLOUD_TTS_API_KEY from env (set in .env for Phase 2 deployment).
 *
 * CRITICAL: sends ONLY text + voiceName + languageCode. NO preamble, NO
 * style directive, NO voice-cast scene — the voice-cast-scene-leaks-into
 * audio failure mode (gemini-tts-voice-cast-scene-leaks-into-audio skill)
 * must NOT cross-contaminate the short-line engine. Pitfall 4 in RESEARCH
 * flags this explicitly.
 *
 * Returns native Opus-in-Ogg bytes (audioEncoding: "OGG_OPUS") — byte-
 * compatible with the Gemini+ffmpeg Opus path per Assumption A3.
 */
async function googleTtsBakeCall(
  text: string,
  voiceName: string,
  languageCode: string = "en-US",
): Promise<{ opusBytes: Buffer; durationMs: number }> {
  const apiKey = process.env.GOOGLE_CLOUD_TTS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "[AUTHOR-04] GOOGLE_CLOUD_TTS_API_KEY required for short-line bake route. " +
      "Set it in .env or unset MIN_BAKE_LINE_CHARS=999 to disable short-line baking.",
    );
  }
  const res = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text },  // ← text only; no preamble, no style
        voice: { languageCode, name: voiceName },
        audioConfig: { audioEncoding: "OGG_OPUS" },  // native Opus, no transcode
      }),
    },
  );
  if (!res.ok) {
    // Redact ?key= from any error path (T-03-05 mitigation — don't leak API key).
    const body = await res.text();
    throw new Error(`[AUTHOR-04] google tts ${res.status}: ${body.slice(0, 500)}`);
  }
  const json = (await res.json()) as { audioContent: string };
  const opusBytes = Buffer.from(json.audioContent, "base64");
  const meta = await parseBuffer(opusBytes, { mimeType: "audio/ogg" });
  const durationMs = Math.round((meta.format.duration ?? 0) * 1000);
  return { opusBytes, durationMs };
}
```

**Duration anomaly detector (D-10, RESEARCH Pitfall 6):**
```typescript
interface AnomalyCheckState {
  samples: Array<{ durationMs: number; charCount: number }>;  // rolling per-ritual
  medianSecPerChar: number | null;  // null until samples.length >= 30
}

function computeMedianSecPerChar(samples: AnomalyCheckState["samples"]): number {
  const ratios = samples.map((s) => (s.durationMs / 1000) / Math.max(s.charCount, 1));
  ratios.sort((a, b) => a - b);
  const mid = Math.floor(ratios.length / 2);
  return ratios.length % 2 === 1 ? ratios[mid]! : (ratios[mid - 1]! + ratios[mid]!) / 2;
}

function addAndCheckAnomaly(
  state: AnomalyCheckState,
  lineId: number,
  durationMs: number,
  charCount: number,
): void {
  state.samples.push({ durationMs, charCount });
  if (state.samples.length < 30) {
    // Pitfall 6: skip check for first 30 lines; median is unstable.
    return;
  }
  // Recompute median from ALL samples (rolling, not windowed — ritual is a
  // short run anyway, typically ≤ 200 lines).
  state.medianSecPerChar = computeMedianSecPerChar(state.samples);
  const thisRatio = (durationMs / 1000) / Math.max(charCount, 1);
  const r = thisRatio / state.medianSecPerChar;
  if (r > 3.0 || r < 0.3) {
    throw new Error(
      `[AUTHOR-06 D-10] duration anomaly on line ${lineId}: ` +
      `durationMs=${durationMs}, charCount=${charCount}, ` +
      `ritualMedianSecPerChar=${state.medianSecPerChar.toFixed(4)}, ` +
      `ratio=${r.toFixed(2)}× (band: [0.3×, 3×]). ` +
      `Likely voice-cast scene leak (>3×) or cropped output (<0.3×). ` +
      `Manually rm the cached .opus for this line and re-bake.`,
    );
  }
}
```

**Validator gate (D-08):**
```typescript
function validateOrFail(plainPath: string, cipherPath: string): void {
  const plain = fs.readFileSync(plainPath, "utf8");
  const cipher = fs.readFileSync(cipherPath, "utf8");
  const result = validatePair(plain, cipher);
  const errors = result.lineIssues.filter((i) => i.severity === "error");
  if (errors.length > 0 || !result.structureOk) {
    console.error(
      `\n[AUTHOR-05 D-08] validator refused to bake ${plainPath}:`,
    );
    if (!result.structureOk) {
      console.error(`  structure parity failed: ${JSON.stringify(result.firstDivergence)}`);
    }
    for (const issue of errors) {
      console.error(`  [${issue.kind}] line ${issue.index}: ${issue.message}`);
    }
    console.error(
      `\nFix the cipher/plain drift and re-run. No --force in Phase 3 (per CONTEXT D-08).`,
    );
    process.exit(1);
  }
}
```

**--verify-audio direct Groq call (D-11, RESEARCH Pattern for Groq direct + A4):**
```typescript
/**
 * Direct Groq Whisper call for --verify-audio (D-11). Bypasses
 * /api/transcribe because the bake has no dev server and the bake script
 * already has GROQ_API_KEY. Shape mirrors src/app/api/transcribe/route.ts.
 * Warn-only: diff report is collected and printed at the end; never
 * hard-fails the bake.
 */
async function verifyAudioRoundTrip(
  opusBytes: Buffer,
  expectedText: string,
): Promise<{ transcript: string; wordDiffCount: number }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("[AUTHOR-07] --verify-audio requires GROQ_API_KEY");
  }
  const form = new FormData();
  form.append("file", new Blob([opusBytes], { type: "audio/ogg" }), "line.opus");
  form.append("model", "whisper-large-v3");
  form.append("response_format", "json");
  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`[AUTHOR-07] groq whisper ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const { text: transcript } = (await res.json()) as { text: string };
  const expWords = expectedText.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const gotWords = transcript.toLowerCase().trim().split(/\s+/).filter(Boolean);
  // Word-level diff: count of words in expected NOT in got + vice versa.
  const expSet = new Set(expWords);
  const gotSet = new Set(gotWords);
  let diff = 0;
  for (const w of expWords) if (!gotSet.has(w)) diff++;
  for (const w of gotWords) if (!expSet.has(w)) diff++;
  return { transcript, wordDiffCount: diff };
}
```

Verify-audio threshold (default N=2, env-overridable per D-11 + Claude's Discretion):
```typescript
const VERIFY_AUDIO_DIFF_THRESHOLD = Number(process.env.VERIFY_AUDIO_DIFF_THRESHOLD ?? "2");
// Warn when wordDiffCount > threshold — "diff > 2 words" = 3+ word mismatches.
```

**Flag parsing (new args for D-06 resume state, in addition to existing --verify-audio):**
```typescript
// D-06 CLI args — orchestrator-provided when resuming / passing state path.
// When absent, build-mram runs with no resume-state side effects (pre-D-06 behavior).
const verifyAudio = process.argv.includes("--verify-audio");

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx < 0 || idx + 1 >= process.argv.length) return undefined;
  const next = process.argv[idx + 1];
  if (!next || next.startsWith("--")) return undefined;
  return next;
}

const resumeStatePath = argValue("--resume-state-path");   // e.g. rituals/_bake-cache/_RESUME.json
const ritualSlugArg   = argValue("--ritual-slug");         // e.g. "ea-opening"
const skipLineIdsArg  = argValue("--skip-line-ids");       // e.g. "1,2,5,9"
const skipLineIds = new Set(
  (skipLineIdsArg ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);
```

**Line-level _RESUME.json flow (AUTHOR-02 D-06):**
```typescript
/**
 * Per-line state writes. Called at two points in the render loop:
 *   - BEFORE render: add lineId to inFlightLineIds, atomic-write.
 *   - AFTER successful embed: move lineId from inFlightLineIds to
 *     completedLineIds, atomic-write.
 *
 * A crash BETWEEN these two writes leaves lineId in inFlightLineIds
 * (but NOT in completedLineIds) — the orchestrator passes
 * --skip-line-ids=<completedLineIds> on resume, so the in-flight
 * line is retried from scratch. That is the correct behavior:
 * in-flight means "we started but didn't finish," so we don't trust
 * the partial result.
 */

function ensureResumeState(): ResumeState {
  // resumeStatePath must be set when this runs — caller guards.
  const existing = readResumeState(resumeStatePath!);
  if (existing && existing.ritual === ritualSlugArg) {
    return existing;
  }
  // No state, or state was for a different ritual → initialize fresh.
  const fresh: ResumeState = {
    ritual: ritualSlugArg!,
    completedLineIds: [],
    inFlightLineIds: [],
    startedAt: Date.now(),
  };
  writeResumeStateAtomic(resumeStatePath!, fresh);
  return fresh;
}

// Call sites (conceptual; adapt variable names to match the existing loop):
// BEFORE each render in the main loop, when resume is active:
function markLineInFlight(state: ResumeState, lineId: string): void {
  if (!state.inFlightLineIds.includes(lineId)) {
    state.inFlightLineIds.push(lineId);
    writeResumeStateAtomic(resumeStatePath!, state);
  }
}

// AFTER successful embedAudioOnLine:
function markLineCompleted(state: ResumeState, lineId: string): void {
  state.inFlightLineIds = state.inFlightLineIds.filter((id) => id !== lineId);
  if (!state.completedLineIds.includes(lineId)) {
    state.completedLineIds.push(lineId);
  }
  writeResumeStateAtomic(resumeStatePath!, state);
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add pre-render validator gate + short-line Google TTS route to build-mram-from-dialogue.ts</name>
  <files>
    scripts/build-mram-from-dialogue.ts
  </files>
  <read_first>
    scripts/build-mram-from-dialogue.ts (lines 1-100 — import block, top-level config; lines 480-700 — MIN_BAKE_LINE_CHARS + cache-scan + render loop; lines 700-900 — post-render + encryption),
    src/lib/author-validation.ts (Plan 04 output — confirm validatePair signature and PairValidationResult shape),
    src/lib/tts-cloud.ts (lines 280-350 — GOOGLE_ROLE_VOICES table + getGoogleVoiceForRole export),
    src/app/api/tts/google/route.ts (lines 1-80 — confirm request body shape: input.text + voice.{languageCode, name} + audioConfig.audioEncoding='OGG_OPUS'),
    .planning/phases/03-authoring-throughput/03-PATTERNS.md §scripts/build-mram-from-dialogue.ts (current → new state),
    .planning/phases/03-authoring-throughput/03-RESEARCH.md §Pattern 5 (Google TTS REST direct call, verbatim),
    .planning/phases/03-authoring-throughput/03-RESEARCH.md §Pitfall 4 (voice-cast scene leak — why short-line must send JUST text),
    .planning/phases/03-authoring-throughput/03-CONTEXT.md §D-08 and §D-09 (validator semantics; short-line D-09 rationale + env-override behavior).
  </read_first>
  <action>
**Step 1 — Add imports.** At the top of `scripts/build-mram-from-dialogue.ts` (after existing imports), add:

```typescript
import { parseBuffer } from "music-metadata";
import { validatePair } from "../src/lib/author-validation";
import { getGoogleVoiceForRole } from "../src/lib/tts-cloud";
```

(If `getGoogleVoiceForRole` is NOT exported from `src/lib/tts-cloud.ts`, verify the actual export name — check `src/lib/tts-cloud.ts` around lines 345. The helper may be called differently. Adjust the import accordingly.)

**Step 2 — Add the validator gate helper.** Inside the file (near the top or in a helpers section before main), define:

```typescript
/**
 * Pre-render validator gate (AUTHOR-05 D-08).
 * Run BEFORE any API call per ritual. Hard-fails the process with a
 * structured issue report on any severity="error" issue — including
 * D-08 bake-band word-ratio outliers from author-validation.ts.
 */
function validateOrFail(plainPath: string, cipherPath: string): void {
  const plain = fs.readFileSync(plainPath, "utf8");
  const cipher = fs.readFileSync(cipherPath, "utf8");
  const result = validatePair(plain, cipher);
  const errors = result.lineIssues.filter((i) => i.severity === "error");
  if (errors.length > 0 || !result.structureOk) {
    console.error(`\n[AUTHOR-05 D-08] validator refused to bake ${plainPath}:`);
    if (!result.structureOk) {
      console.error(`  structure parity failed: ${JSON.stringify(result.firstDivergence)}`);
    }
    for (const issue of errors) {
      console.error(`  [${issue.kind}] line ${issue.index}: ${issue.message}`);
    }
    console.error(
      `\nFix the cipher/plain drift and re-run. No --force in Phase 3 (CONTEXT D-08).`,
    );
    process.exit(1);
  }
}
```

**Step 3 — Add googleTtsBakeCall helper.** Same helpers section:

```typescript
/**
 * Direct Google Cloud TTS REST call for the short-line bake path (AUTHOR-04 D-09).
 * Bypasses /api/tts/google because there is no dev server during an offline
 * bake; uses GOOGLE_CLOUD_TTS_API_KEY from .env (set in Phase 2 deployment).
 *
 * CRITICAL: sends only {text, voiceName, languageCode}. NO preamble, NO style,
 * NO voice-cast scene — Pitfall 4 in RESEARCH.md §Common Pitfalls.
 * Returns native Opus-in-Ogg (audioEncoding: "OGG_OPUS") byte-compatible
 * with Gemini+ffmpeg output (Assumption A3).
 */
async function googleTtsBakeCall(
  text: string,
  voiceName: string,
  languageCode: string = "en-US",
): Promise<{ opusBytes: Buffer; durationMs: number }> {
  const apiKey = process.env.GOOGLE_CLOUD_TTS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "[AUTHOR-04] GOOGLE_CLOUD_TTS_API_KEY required for short-line bake route. " +
      "Set it in .env, or set MIN_BAKE_LINE_CHARS=999 to disable the short-line route (will re-introduce the pre-Phase-3 hard-skip behavior).",
    );
  }
  const res = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text },  // text only; NO preamble, NO style (Pitfall 4)
        voice: { languageCode, name: voiceName },
        audioConfig: { audioEncoding: "OGG_OPUS" },
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    // Redact any ?key= that might leak into error surface (T-03-SEC)
    const redacted = body.replace(/[?&]key=[^&"'\s]*/g, "?key=REDACTED");
    throw new Error(`[AUTHOR-04] google tts ${res.status}: ${redacted.slice(0, 500)}`);
  }
  const json = (await res.json()) as { audioContent: string };
  const opusBytes = Buffer.from(json.audioContent, "base64");
  const meta = await parseBuffer(opusBytes, { mimeType: "audio/ogg" });
  const durationMs = Math.round((meta.format.duration ?? 0) * 1000);
  return { opusBytes, durationMs };
}
```

**Step 4 — Call validateOrFail at the top of the bake flow.** Locate the function where `build-mram-from-dialogue.ts` opens the plain and cipher files (typically near the top of the main bake function). INSERT a call to `validateOrFail(plainPath, cipherPath)` as the first operation — BEFORE any API call, BEFORE reading voice cast, BEFORE the pre-scan loop. This is the "run validator before rendering" invariant from RESEARCH §anti-pattern §4.

**Step 5 — Replace the short-line hard-skip with Google TTS routing.** Locate lines 591-607 and 655-683 (the `preSkipShort`/`tooShortIds`/"skip-too-short" blocks). The new behavior:

- `preSkipShort` becomes `preShortLineGoogle` — lines routed to Google TTS instead of runtime TTS.
- In the render loop, the `if (tooShortIds.has(line.id))` branch no longer skips; it calls `googleTtsBakeCall(line.plain, getGoogleVoiceForRole(line.role).name)` — then proceeds to the embed step exactly as the Gemini path does. The status label becomes `"google-short"` (or similar) instead of `"skip-too-short"`.

Use an Edit tool replacement for the pre-scan block:

```typescript
  // AUTHOR-04 D-09: Short lines (< MIN_BAKE_LINE_CHARS) route to Google TTS
  // at bake time instead of being hard-skipped. Every shipped .mram ships
  // audio for every spoken line. Tune via MIN_BAKE_LINE_CHARS env.
  let preCached = 0;
  let preToRender = 0;
  let preShortLine = 0;  // new: counted into the total bake work
  for (const line of spokenLines) {
    const cleanText = line.plain.trim();
    if (cleanText.length < MIN_BAKE_LINE_CHARS) {
      preShortLine++;
      continue;
    }
    const voice = getGeminiVoiceForRole(line.role);
    const preamble =
      cleanText.length >= MIN_PREAMBLE_LINE_CHARS
        ? preambleByRole[line.role] ?? ""
        : "";
    if (isLineCached(cleanText, line.style, voice, preamble)) {
      preCached++;
    } else {
      preToRender++;
    }
  }
  const preCachedPct = total > 0 ? Math.round((preCached / total) * 100) : 0;
  console.error(
    `  Cache status: ${preCached}/${total} already cached (${preCachedPct}%), ${preToRender} to render fresh, ${preShortLine} short-line → Google TTS`,
  );
```

And in the render loop, REPLACE the `tooShortIds` skip block (lines 672-684) with a short-line Google branch:

```typescript
    const cleanText = line.plain.trim();
    if (cleanText.length < MIN_BAKE_LINE_CHARS) {
      // AUTHOR-04 D-09: short-line → Google Cloud TTS (not hard-skip).
      try {
        const googleVoice = getGoogleVoiceForRole(line.role);
        const { opusBytes, durationMs } = await googleTtsBakeCall(
          cleanText,
          googleVoice.name,
          // languageCode default "en-US"; if the voice has a language hint, use that.
        );
        // Anomaly check (D-10) — fed into the same detector state as Gemini lines.
        addAndCheckAnomaly(anomalyState, line.id, durationMs, cleanText.length);
        // Embed the same way the Gemini path does — base64 into line.audio.
        embedAudioOnLine(line, opusBytes);  // use the existing embed helper; confirm its exact name
        rendered++;
        const done = spokenLines.indexOf(line) + 1;
        const pct = Math.floor((done / total) * 100);
        process.stderr.write(
          `\r  [${done.toString().padStart(3)}/${total}] ${pct.toString().padStart(3)}% ` +
            `${line.role.padEnd(10)} (${"google-short".padEnd(30)}) ` +
            `${opusBytes.length.toString().padStart(6)}B         `,
        );
      } catch (err) {
        console.error(
          `\n[AUTHOR-04] short-line bake failed for line ${line.id} (${line.role}): ${(err as Error).message}`,
        );
        // Short-line failure: bake CAN continue — this line stays un-embedded,
        // runtime TTS handles at rehearsal. But flag it for the summary.
        regressedLines.push({ id: line.id, role: line.role, text: cleanText });
      }
      continue;
    }
```

**CRITICAL:** read the existing `build-mram-from-dialogue.ts` to find:
1. The actual name of the audio-embed helper (grep for `line.audio` assignment or similar) — the pseudocode `embedAudioOnLine(line, opusBytes)` must be replaced with the actual expression the Gemini path uses today.
2. The actual name of `MIN_BAKE_LINE_CHARS` and whether it's still in scope at the render-loop level.
3. Whether `tooShortIds` is still referenced downstream (likely not after this edit; can be deleted or left as unused const).

Adjust the short-line branch to use the same embed mechanism the Gemini path uses (line 723-ish per PATTERNS.md). If the existing code stores audio by mutating the `line` object, do the same for the Google branch.

**Step 6 — Update the summary block.** Find the end-of-bake summary (around lines 820-900 likely). Add:
- `preShortLine` count → "Google TTS short-line: N line(s) rendered"
- Any `regressedLines` entries tagged from the short-line branch keep the existing "runtime TTS at rehearsal" wording.

**Step 7 — Flag-parse --verify-audio.** In the argv block (near the top of main), add:
```typescript
const verifyAudio = process.argv.includes("--verify-audio");
```
Store for Step 8 (next task).

Commit: `author-04: route ultra-short lines to google cloud tts at bake time + validator gate`
  </action>
  <verify>
    <automated>grep -q "validateOrFail" scripts/build-mram-from-dialogue.ts && grep -q "googleTtsBakeCall" scripts/build-mram-from-dialogue.ts && grep -q "getGoogleVoiceForRole" scripts/build-mram-from-dialogue.ts && grep -q "OGG_OPUS" scripts/build-mram-from-dialogue.ts && grep -q 'from "music-metadata"' scripts/build-mram-from-dialogue.ts && grep -q 'from "../src/lib/author-validation"' scripts/build-mram-from-dialogue.ts && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep "validateOrFail" scripts/build-mram-from-dialogue.ts` returns ≥ 2 matches (declaration + invocation).
    - `grep "googleTtsBakeCall" scripts/build-mram-from-dialogue.ts` returns ≥ 2 matches (declaration + invocation).
    - `grep "getGoogleVoiceForRole" scripts/build-mram-from-dialogue.ts` returns ≥ 1 match.
    - `grep 'from "music-metadata"' scripts/build-mram-from-dialogue.ts` returns 1 match.
    - `grep 'from "../src/lib/author-validation"' scripts/build-mram-from-dialogue.ts` returns 1 match (validatePair imported).
    - `grep "OGG_OPUS" scripts/build-mram-from-dialogue.ts` returns ≥ 1 match.
    - `grep "D-09" scripts/build-mram-from-dialogue.ts` returns ≥ 2 matches (rationale comments).
    - `grep "D-08" scripts/build-mram-from-dialogue.ts` returns ≥ 1 match (validator gate citation).
    - `grep "skip-too-short" scripts/build-mram-from-dialogue.ts` returns 0 matches (replaced with google-short routing).
    - `npx tsc --noEmit` exits 0.
    - `npm run build` exits 0.
    - `npx vitest run --no-coverage` exits 0 (no regression in existing mram-audio-bake tests; no new file added here).
  </acceptance_criteria>
  <done>
    build-mram-from-dialogue.ts runs validatePair() as first op, fails fast on D-08 errors. Short lines route to googleTtsBakeCall() (text-only, no preamble). The hard-skip behavior is gone. Full build + type-check pass.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add duration-anomaly detector + optional --verify-audio STT roll-up</name>
  <files>
    scripts/build-mram-from-dialogue.ts
  </files>
  <read_first>
    scripts/build-mram-from-dialogue.ts (output of Task 1 — confirm imports are in place and helper locations),
    src/app/api/transcribe/route.ts (lines 75-133 — existing Groq Whisper request shape: endpoint, model, form-data; reused for direct call per RESEARCH A4),
    .planning/phases/03-authoring-throughput/03-RESEARCH.md §Pitfall 6 (first-30-lines rolling-median skip),
    .planning/phases/03-authoring-throughput/03-CONTEXT.md §D-10 (threshold semantics, hard-fail not auto-evict) and §D-11 (opt-in, warn-only, threshold 2 default, env override).
  </read_first>
  <action>
**Step 1 — Add duration-anomaly detector helpers.** In the same helpers section as Task 1:

```typescript
// AUTHOR-06 D-10: audio-duration anomaly detector. Per-ritual rolling median
// (Pitfall 6: skip check for first 30 lines — median is unstable). Triggers
// on >3× OR <0.3× the median sec-per-char; hard-fails the bake with a
// structured message. Manual rm of the failing cache entry is intentional
// (D-10 rejects auto-evict — don't mask recurring failures).
interface AnomalyCheckState {
  samples: Array<{ durationMs: number; charCount: number }>;
  medianSecPerChar: number | null;
}

function newAnomalyState(): AnomalyCheckState {
  return { samples: [], medianSecPerChar: null };
}

function computeMedianSecPerChar(samples: AnomalyCheckState["samples"]): number {
  const ratios = samples
    .map((s) => (s.durationMs / 1000) / Math.max(s.charCount, 1))
    .sort((a, b) => a - b);
  const mid = Math.floor(ratios.length / 2);
  return ratios.length % 2 === 1 ? ratios[mid]! : (ratios[mid - 1]! + ratios[mid]!) / 2;
}

function addAndCheckAnomaly(
  state: AnomalyCheckState,
  lineId: number,
  durationMs: number,
  charCount: number,
): void {
  state.samples.push({ durationMs, charCount });
  if (state.samples.length < 30) return; // Pitfall 6: insufficient sample
  state.medianSecPerChar = computeMedianSecPerChar(state.samples);
  const thisRatio = (durationMs / 1000) / Math.max(charCount, 1);
  const r = thisRatio / state.medianSecPerChar;
  if (r > 3.0 || r < 0.3) {
    throw new Error(
      `[AUTHOR-06 D-10] duration anomaly on line ${lineId}: ` +
      `durationMs=${durationMs}, charCount=${charCount}, ` +
      `ritualMedianSecPerChar=${state.medianSecPerChar.toFixed(4)}, ` +
      `ratio=${r.toFixed(2)}× (allowed band: [0.3×, 3×]). ` +
      `Likely voice-cast scene leak (>3×) or cropped output (<0.3×). ` +
      `Manually rm rituals/_bake-cache/{cacheKey}.opus for this line, ` +
      `verify the dialogue text, and re-run bake-all.ts.`,
    );
  }
}
```

**Step 2 — Call the detector for every rendered line.** In the Gemini render-success branch (after the atomic write), compute `durationMs` via `music-metadata` and call the detector. Example placement:

```typescript
// (inside the Gemini render-success branch, after `const opus = await renderLineAudio(...);`)
const meta = await parseBuffer(opus, { mimeType: "audio/ogg" });
const geminiDurationMs = Math.round((meta.format.duration ?? 0) * 1000);
addAndCheckAnomaly(anomalyState, line.id, geminiDurationMs, cleanText.length);
```

The Google short-line branch (Task 1) already receives `durationMs` from `googleTtsBakeCall` — confirm that branch also calls `addAndCheckAnomaly(anomalyState, line.id, durationMs, cleanText.length)` per the snippet in Task 1 Step 5.

**Step 3 — Initialize `anomalyState` once per ritual.** Near the top of the bake function (before the render loop):

```typescript
const anomalyState = newAnomalyState();
```

**Step 4 — Add --verify-audio helper.** Same helpers section:

```typescript
// AUTHOR-07 D-11: optional STT round-trip verify. Direct Groq Whisper call
// (bypasses /api/transcribe because the bake has no dev server). Warn-only:
// never hard-fails the bake; diffs are collected and printed at end.
// Default threshold for "diff" is 2 words (env-overridable).
const VERIFY_AUDIO_DIFF_THRESHOLD = Number(
  process.env.VERIFY_AUDIO_DIFF_THRESHOLD ?? "2",
);

interface VerifyAudioEntry {
  lineId: number;
  role: string;
  expected: string;
  transcript: string;
  wordDiffCount: number;
}

async function verifyAudioRoundTrip(
  opusBytes: Buffer,
  expectedText: string,
): Promise<{ transcript: string; wordDiffCount: number }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("[AUTHOR-07] --verify-audio requires GROQ_API_KEY set in .env");
  }
  const form = new FormData();
  form.append("file", new Blob([opusBytes], { type: "audio/ogg" }), "line.opus");
  form.append("model", "whisper-large-v3");
  form.append("response_format", "json");
  const res = await fetch(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    },
  );
  if (!res.ok) {
    throw new Error(
      `[AUTHOR-07] groq whisper ${res.status}: ${(await res.text()).slice(0, 200)}`,
    );
  }
  const { text: transcript } = (await res.json()) as { text: string };
  const expWords = expectedText.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const gotWords = transcript.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const expSet = new Set(expWords);
  const gotSet = new Set(gotWords);
  let diff = 0;
  for (const w of expWords) if (!gotSet.has(w)) diff++;
  for (const w of gotWords) if (!expSet.has(w)) diff++;
  return { transcript, wordDiffCount: diff };
}
```

**Step 5 — Collect verify entries (opt-in).** When `verifyAudio` flag is true, after each line renders (both Gemini and Google paths), call `verifyAudioRoundTrip` and push a `VerifyAudioEntry` into a collector array:

```typescript
const verifyEntries: VerifyAudioEntry[] = [];

// ...inside render-success branches (both Gemini and Google short-line):
if (verifyAudio) {
  try {
    const { transcript, wordDiffCount } = await verifyAudioRoundTrip(opusBytes, cleanText);
    verifyEntries.push({
      lineId: line.id,
      role: line.role,
      expected: cleanText,
      transcript,
      wordDiffCount,
    });
  } catch (err) {
    // Verify failure is never bake-killing — log and continue.
    console.error(`\n[AUTHOR-07] verify-audio failed on line ${line.id}: ${(err as Error).message}`);
  }
}
```

**Step 6 — Print the verify roll-up at the end.** After the render loop, before the final summary:

```typescript
if (verifyAudio && verifyEntries.length > 0) {
  const flagged = verifyEntries.filter((e) => e.wordDiffCount > VERIFY_AUDIO_DIFF_THRESHOLD);
  console.error(`\n[AUTHOR-07] --verify-audio summary:`);
  console.error(`  Lines checked: ${verifyEntries.length}`);
  console.error(
    `  Lines with word-diff > ${VERIFY_AUDIO_DIFF_THRESHOLD}: ${flagged.length}`,
  );
  if (flagged.length > 0) {
    const worst = [...flagged].sort((a, b) => b.wordDiffCount - a.wordDiffCount).slice(0, 3);
    console.error(`  Worst 3 (warn-only; bake still proceeded):`);
    for (const e of worst) {
      console.error(
        `    line ${e.lineId} (${e.role}) diff=${e.wordDiffCount}`,
      );
      console.error(`      expected: "${e.expected.slice(0, 80)}${e.expected.length > 80 ? "…" : ""}"`);
      console.error(`      got:      "${e.transcript.slice(0, 80)}${e.transcript.length > 80 ? "…" : ""}"`);
    }
  }
}
```

**Step 7 — Document usage at the top of the file.** In the header JSDoc of build-mram-from-dialogue.ts, add lines citing the new flag:

```
*   --verify-audio          (AUTHOR-07 D-11) Pipe each rendered line's Opus
*                           through Groq Whisper and print a word-diff
*                           roll-up. Default off. Warn-only (never fails).
*                           Threshold: VERIFY_AUDIO_DIFF_THRESHOLD env
*                           (default 2).
```

Commit: `author-06: add duration-anomaly detector + author-07 --verify-audio STT roll-up`
  </action>
  <verify>
    <automated>grep -q "addAndCheckAnomaly" scripts/build-mram-from-dialogue.ts && grep -q "verifyAudioRoundTrip" scripts/build-mram-from-dialogue.ts && grep -q "VERIFY_AUDIO_DIFF_THRESHOLD" scripts/build-mram-from-dialogue.ts && grep -q "computeMedianSecPerChar" scripts/build-mram-from-dialogue.ts && grep -q "api.groq.com/openai/v1/audio/transcriptions" scripts/build-mram-from-dialogue.ts && grep -q "3\.0\|3\\.0" scripts/build-mram-from-dialogue.ts && grep -q "0\.3\|0\\.3" scripts/build-mram-from-dialogue.ts && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep "addAndCheckAnomaly" scripts/build-mram-from-dialogue.ts` returns ≥ 3 matches (declaration + 2 callsites, Gemini path + Google path).
    - `grep "verifyAudioRoundTrip" scripts/build-mram-from-dialogue.ts` returns ≥ 2 matches (declaration + callsite).
    - `grep "computeMedianSecPerChar" scripts/build-mram-from-dialogue.ts` returns ≥ 2 matches.
    - `grep "VERIFY_AUDIO_DIFF_THRESHOLD" scripts/build-mram-from-dialogue.ts` returns ≥ 2 matches.
    - `grep "whisper-large-v3" scripts/build-mram-from-dialogue.ts` returns 1 match.
    - `grep "api.groq.com/openai/v1/audio/transcriptions" scripts/build-mram-from-dialogue.ts` returns 1 match.
    - `grep "r > 3.0" scripts/build-mram-from-dialogue.ts` returns 1 match (D-10 threshold high end).
    - `grep "r < 0.3" scripts/build-mram-from-dialogue.ts` returns 1 match (D-10 threshold low end).
    - `grep "samples.length < 30" scripts/build-mram-from-dialogue.ts` returns 1 match (Pitfall 6 sample skip).
    - `grep "D-10" scripts/build-mram-from-dialogue.ts` returns ≥ 2 matches.
    - `grep "D-11" scripts/build-mram-from-dialogue.ts` returns ≥ 1 match.
    - `grep "verifyAudio =" scripts/build-mram-from-dialogue.ts` returns ≥ 1 match (flag parse).
    - `npx tsc --noEmit` exits 0.
    - `npm run build` exits 0.
    - Full test suite green: `npx vitest run --no-coverage` exits 0.
  </acceptance_criteria>
  <done>
    Duration-anomaly detector wired for every rendered line (Gemini and Google paths). --verify-audio flag parses and triggers direct Groq Whisper calls with word-diff roll-up at the end. First 30 lines per ritual skip the anomaly check (Pitfall 6). Threshold locked at >3× / <0.3× of rolling per-ritual median (D-10). build + type-check clean.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Add line-level _RESUME.json writes (D-06) + shared scripts/lib/resume-state.ts + extract pure math helpers to scripts/lib/bake-math.ts</name>
  <files>
    scripts/lib/resume-state.ts,
    scripts/lib/bake-math.ts,
    scripts/build-mram-from-dialogue.ts,
    scripts/__tests__/bake-helpers.test.ts
  </files>
  <read_first>
    scripts/build-mram-from-dialogue.ts (output of Tasks 1 and 2 — locate the render loop and the per-line success branches),
    .planning/phases/03-authoring-throughput/03-CONTEXT.md §D-06 (line-level resume requirement; completedLineIds / inFlightLineIds semantics; atomic write; ritual mismatch refusal),
    .planning/phases/03-authoring-throughput/03-RESEARCH.md §Pattern 6 (atomic write tmp+rename; POSIX rename semantics),
    scripts/__tests__/bake-helpers.test.ts (Plan-01 Wave 0 scaffold — `it.todo` stubs this task replaces with concrete tests).
  </read_first>
  <behavior>
    - writeResumeStateAtomic writes JSON to the target path via a tmp + rename; after a successful write the tmp file does not linger in the target directory.
    - readResumeState returns null when the file does not exist.
    - readResumeState returns null when the file exists but is not valid JSON (corruption tolerance — orchestrator will decide whether to re-init or refuse).
    - readResumeState returns the parsed ResumeState when the file exists and the JSON matches the schema (ritual: string, completedLineIds: string[], inFlightLineIds: string[], startedAt: number).
    - A write → read round-trip is lossless (values deep-equal after JSON parse).
    - If --resume-state-path is not set, build-mram-from-dialogue.ts runs with no resume side effects (pre-D-06 behavior).
    - If --resume-state-path is set but the existing file's `ritual` field does not match --ritual-slug, the helper initializes fresh state for the current ritual (orchestrator-level ritual-mismatch handling lives in Plan 07; at this layer the helper just starts over for the current ritual).
    - When --skip-line-ids="1,2,5" is passed, the render loop skips lines with those IDs (no render, no embed, no anomaly-state mutation) BUT does NOT mutate completedLineIds for them (the orchestrator is the source of truth for what was completed previously).
    - BEFORE each render: lineId is added to inFlightLineIds + atomic-written.
    - AFTER each successful embed: lineId is removed from inFlightLineIds, added to completedLineIds, atomic-written.
    - The module can be imported from a Vitest test without side effects (no top-level fs writes, no process.argv inspection at module scope).
  </behavior>
  <action>
**Step 1 — Create scripts/lib/resume-state.ts.** New file containing the shared type and helpers verbatim from the `<interfaces>` block above:

```typescript
/**
 * scripts/lib/resume-state.ts — shared resume-state types + atomic helpers.
 *
 * Written by scripts/build-mram-from-dialogue.ts (line-level, per-line
 * atomic writes). Read by scripts/bake-all.ts (orchestrator) to know which
 * lineIds completed in a prior interrupted run and pass them via
 * --skip-line-ids to the next build-mram invocation.
 *
 * AUTHOR-02 D-06: per-line granularity (not per-ritual). The writer is
 * the only process that knows when a line has actually completed (audio
 * embedded into the in-memory .mram document), so it writes here.
 */

import * as fs from "node:fs";
import * as path from "node:path";

export interface ResumeState {
  /** Slug of the ritual currently being baked. Guards against mixed-ritual resume. */
  ritual: string;
  /** Line IDs (in order of completion) that have been fully rendered + embedded. */
  completedLineIds: string[];
  /** Line IDs that started rendering but did not complete. Re-tried on resume. */
  inFlightLineIds: string[];
  /** Unix ms timestamp — when the current bake invocation started. */
  startedAt: number;
}

/**
 * Read _RESUME.json from `filePath`. Returns null when the file doesn't
 * exist OR when it's malformed (caller can then re-init from scratch).
 */
export function readResumeState(filePath: string): ResumeState | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (
      typeof raw !== "object" ||
      raw === null ||
      typeof raw.ritual !== "string" ||
      !Array.isArray(raw.completedLineIds) ||
      !Array.isArray(raw.inFlightLineIds) ||
      typeof raw.startedAt !== "number"
    ) {
      return null;
    }
    return raw as ResumeState;
  } catch {
    return null;
  }
}

/**
 * Write `state` to `filePath` atomically via tmp+rename (RESEARCH Pattern 6).
 * A crash mid-write leaves EITHER the old file intact OR the new file
 * fully written — never a truncated file. `fs.renameSync` is atomic on
 * POSIX within the same directory; the tmp path is co-located for that
 * reason.
 */
export function writeResumeStateAtomic(filePath: string, state: ResumeState): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, filePath);
}
```

**Step 2 — Wire the new CLI args + per-line writes into scripts/build-mram-from-dialogue.ts.**

Add to imports (after Task 1/2 imports):
```typescript
import {
  type ResumeState,
  readResumeState,
  writeResumeStateAtomic,
} from "./lib/resume-state";
```

Add to argv parsing block:
```typescript
function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx < 0 || idx + 1 >= process.argv.length) return undefined;
  const next = process.argv[idx + 1];
  if (!next || next.startsWith("--")) return undefined;
  return next;
}

const resumeStatePath = argValue("--resume-state-path");
const ritualSlugArg   = argValue("--ritual-slug");
const skipLineIdsArg  = argValue("--skip-line-ids");
const skipLineIds = new Set(
  (skipLineIdsArg ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);
```

Add state-management helpers near the existing helpers section:

```typescript
/**
 * Per-line resume-state manager (AUTHOR-02 D-06).
 * Only active when --resume-state-path + --ritual-slug are both set.
 */
function initResumeStateIfRequested(): ResumeState | null {
  if (!resumeStatePath || !ritualSlugArg) return null;
  const existing = readResumeState(resumeStatePath);
  if (existing && existing.ritual === ritualSlugArg) {
    return existing;
  }
  // No state, or state was for a different ritual → fresh start for THIS ritual.
  // (Plan 07's orchestrator is responsible for any cross-ritual mismatch refusal
  // BEFORE spawning this process.)
  const fresh: ResumeState = {
    ritual: ritualSlugArg,
    completedLineIds: [],
    inFlightLineIds: [],
    startedAt: Date.now(),
  };
  writeResumeStateAtomic(resumeStatePath, fresh);
  return fresh;
}

function markLineInFlight(state: ResumeState | null, lineId: string): void {
  if (!state || !resumeStatePath) return;
  if (!state.inFlightLineIds.includes(lineId)) {
    state.inFlightLineIds.push(lineId);
    writeResumeStateAtomic(resumeStatePath, state);
  }
}

function markLineCompleted(state: ResumeState | null, lineId: string): void {
  if (!state || !resumeStatePath) return;
  state.inFlightLineIds = state.inFlightLineIds.filter((id) => id !== lineId);
  if (!state.completedLineIds.includes(lineId)) {
    state.completedLineIds.push(lineId);
  }
  writeResumeStateAtomic(resumeStatePath, state);
}
```

Initialize the state once per bake invocation (near `const anomalyState = newAnomalyState();`):
```typescript
const resumeState = initResumeStateIfRequested();
```

Wire `markLineInFlight` / `markLineCompleted` into the render loop. In both branches (Gemini path and Google short-line path):

```typescript
// At the very top of each per-line iteration (before any work), honor --skip-line-ids:
const lineIdStr = String(line.id);
if (skipLineIds.has(lineIdStr)) {
  continue;
}

// Immediately BEFORE the API call / render:
markLineInFlight(resumeState, lineIdStr);

// ... render (Gemini or Google short-line) ...

// Immediately AFTER successful embedAudioOnLine (inside the success branch):
markLineCompleted(resumeState, lineIdStr);
```

Treat the Google short-line branch identically — the two helper calls (`markLineInFlight` before `googleTtsBakeCall`, `markLineCompleted` after the embed) are the same pattern. If a line fails rendering, the lineId stays in `inFlightLineIds` — the orchestrator retries it on the next run.

Cleanup note: when `resumeStatePath` is set, the orchestrator is responsible for unlinking `_RESUME.json` after a clean ritual finish (handled in Plan 07). build-mram-from-dialogue.ts does NOT delete the state file — it only writes it.

**Step 2b — Extract pure math helpers into scripts/lib/bake-math.ts.** The D-10 duration-anomaly math and the D-11 word-diff are load-bearing (D-10 catches the `gemini-tts-voice-cast-scene-leaks-into-audio` historical failure mode) and must have unit-test coverage. Extract three pure functions out of build-mram-from-dialogue.ts into a new small module:

```ts
// scripts/lib/bake-math.ts
export interface DurationSample {
  durationMs: number;
  charCount: number;
}

/** Median sec-per-char across samples. Returns 0 when samples is empty (caller must guard). */
export function computeMedianSecPerChar(samples: DurationSample[]): number {
  if (samples.length === 0) return 0;
  const secPerChar = samples
    .filter((s) => s.charCount > 0)
    .map((s) => s.durationMs / 1000 / s.charCount)
    .sort((a, b) => a - b);
  if (secPerChar.length === 0) return 0;
  const mid = Math.floor(secPerChar.length / 2);
  return secPerChar.length % 2 === 0
    ? (secPerChar[mid - 1] + secPerChar[mid]) / 2
    : secPerChar[mid];
}

/**
 * Per D-10: anomaly iff ratio > 3.0× OR < 0.3× the per-ritual median. Boundary is INCLUSIVE
 * of the band (exactly 3.0× or 0.3× does NOT trigger — must strictly exceed).
 */
export function isDurationAnomaly(
  line: DurationSample,
  ritualMedian: number,
  thresholds: { min: number; max: number } = { min: 0.3, max: 3.0 },
): boolean {
  if (ritualMedian === 0 || line.charCount === 0) return false;
  const lineSecPerChar = line.durationMs / 1000 / line.charCount;
  const ratio = lineSecPerChar / ritualMedian;
  return ratio > thresholds.max || ratio < thresholds.min;
}

/**
 * Word-level diff for --verify-audio: returns case-insensitive {missed, inserted} arrays.
 * Used by verifyAudioRoundTrip to compute wordDiffCount per D-11.
 */
export function wordDiff(expected: string, actual: string): { missed: string[]; inserted: string[] } {
  const norm = (s: string) => s.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const expSet = new Set(norm(expected));
  const actSet = new Set(norm(actual));
  const missed = norm(expected).filter((w) => !actSet.has(w));
  const inserted = norm(actual).filter((w) => !expSet.has(w));
  return { missed, inserted };
}
```

In build-mram-from-dialogue.ts, replace the inline `computeMedianSecPerChar` definition with `import { computeMedianSecPerChar, isDurationAnomaly, wordDiff, type DurationSample } from "./lib/bake-math"`. Update `addAndCheckAnomaly` to call `isDurationAnomaly` instead of its inline ratio check. Update `verifyAudioRoundTrip` to use `wordDiff` for its word-set difference computation (`wordDiff(expectedText, transcript).missed.length + wordDiff(expectedText, transcript).inserted.length` — or more efficiently, compute once and sum the two array lengths).

**Step 3 — Fill scripts/__tests__/bake-helpers.test.ts.** Replace the Plan-01 scaffold with concrete tests of `readResumeState` + `writeResumeStateAtomic` AND the pure math helpers from `scripts/lib/bake-math.ts`:

```typescript
// @vitest-environment node
/**
 * Tests for scripts/lib/resume-state.ts (AUTHOR-02 D-06).
 *
 * Scope: pure file-system unit tests for the shared ResumeState helpers.
 * Orchestrator-level behavior (ritual mismatch refusal, --skip-line-ids
 * propagation) is tested in scripts/__tests__/bake-all.test.ts (Plan 07).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  readResumeState,
  writeResumeStateAtomic,
  type ResumeState,
} from "../lib/resume-state";

let tmpRoot: string;
let stateFile: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "resume-state-test-"));
  stateFile = path.join(tmpRoot, "_RESUME.json");
});
afterEach(() => {
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
});

describe("writeResumeStateAtomic + readResumeState (D-06)", () => {
  it("round-trips the full ResumeState shape losslessly", () => {
    const state: ResumeState = {
      ritual: "ea-opening",
      completedLineIds: ["1", "2", "3"],
      inFlightLineIds: ["4"],
      startedAt: 1_700_000_000_000,
    };
    writeResumeStateAtomic(stateFile, state);
    const read = readResumeState(stateFile);
    expect(read).toEqual(state);
  });

  it("readResumeState returns null when the file does not exist", () => {
    expect(readResumeState(stateFile)).toBeNull();
  });

  it("readResumeState returns null on malformed JSON (corruption tolerance)", () => {
    fs.writeFileSync(stateFile, "{not valid json");
    expect(readResumeState(stateFile)).toBeNull();
  });

  it("readResumeState returns null when schema does not match", () => {
    // Missing inFlightLineIds — the schema guard in readResumeState returns null.
    fs.writeFileSync(
      stateFile,
      JSON.stringify({ ritual: "x", completedLineIds: [], startedAt: 0 }),
    );
    expect(readResumeState(stateFile)).toBeNull();
  });

  it("atomic write: target file exists, no .tmp lingering after success", () => {
    const state: ResumeState = {
      ritual: "x",
      completedLineIds: [],
      inFlightLineIds: [],
      startedAt: Date.now(),
    };
    writeResumeStateAtomic(stateFile, state);
    const entries = fs.readdirSync(tmpRoot);
    expect(entries).toContain("_RESUME.json");
    expect(entries.filter((n) => n.endsWith(".tmp"))).toEqual([]);
  });

  it("atomic write: overwrites an existing state file cleanly", () => {
    const first: ResumeState = {
      ritual: "x",
      completedLineIds: ["1"],
      inFlightLineIds: [],
      startedAt: 1,
    };
    writeResumeStateAtomic(stateFile, first);

    const second: ResumeState = {
      ritual: "x",
      completedLineIds: ["1", "2"],
      inFlightLineIds: [],
      startedAt: 1,
    };
    writeResumeStateAtomic(stateFile, second);

    expect(readResumeState(stateFile)).toEqual(second);
    // Still no lingering tmp.
    expect(fs.readdirSync(tmpRoot).filter((n) => n.endsWith(".tmp"))).toEqual([]);
  });

  it("creates the parent directory if missing (mkdirSync recursive)", () => {
    const nested = path.join(tmpRoot, "a", "b", "c", "_RESUME.json");
    const state: ResumeState = {
      ritual: "x",
      completedLineIds: [],
      inFlightLineIds: [],
      startedAt: 1,
    };
    writeResumeStateAtomic(nested, state);
    expect(fs.existsSync(nested)).toBe(true);
    expect(readResumeState(nested)).toEqual(state);
  });
});

// ---- D-10 / D-11 pure-math helpers (extracted to scripts/lib/bake-math.ts) ----

import {
  computeMedianSecPerChar,
  isDurationAnomaly,
  wordDiff,
  type DurationSample,
} from "../lib/bake-math";

describe("computeMedianSecPerChar (D-10)", () => {
  it("returns 0 on empty samples", () => {
    expect(computeMedianSecPerChar([])).toBe(0);
  });

  it("returns 0 when all samples have charCount=0", () => {
    expect(computeMedianSecPerChar([{ durationMs: 1000, charCount: 0 }])).toBe(0);
  });

  it("computes median for an odd sample count", () => {
    // durations 1s, 2s, 3s over 10 chars each → 0.1, 0.2, 0.3 s/char → median 0.2
    const samples: DurationSample[] = [
      { durationMs: 1000, charCount: 10 },
      { durationMs: 2000, charCount: 10 },
      { durationMs: 3000, charCount: 10 },
    ];
    expect(computeMedianSecPerChar(samples)).toBeCloseTo(0.2, 5);
  });

  it("computes median for an even sample count (average of two middles)", () => {
    // 0.1, 0.2, 0.3, 0.4 → median = (0.2 + 0.3) / 2 = 0.25
    const samples: DurationSample[] = [
      { durationMs: 1000, charCount: 10 },
      { durationMs: 2000, charCount: 10 },
      { durationMs: 3000, charCount: 10 },
      { durationMs: 4000, charCount: 10 },
    ];
    expect(computeMedianSecPerChar(samples)).toBeCloseTo(0.25, 5);
  });

  it("skips samples with charCount=0 but still medians the rest", () => {
    const samples: DurationSample[] = [
      { durationMs: 1000, charCount: 10 },  // 0.1
      { durationMs: 9999, charCount: 0 },   // dropped
      { durationMs: 3000, charCount: 10 },  // 0.3
    ];
    // After dropping charCount=0: [0.1, 0.3] → median 0.2
    expect(computeMedianSecPerChar(samples)).toBeCloseTo(0.2, 5);
  });
});

describe("isDurationAnomaly (D-10 >3× or <0.3× ritual median)", () => {
  const median = 0.2; // sec/char

  it("returns false when ritualMedian is 0 (insufficient sample)", () => {
    expect(isDurationAnomaly({ durationMs: 9999, charCount: 1 }, 0)).toBe(false);
  });

  it("returns false when line.charCount is 0", () => {
    expect(isDurationAnomaly({ durationMs: 9999, charCount: 0 }, median)).toBe(false);
  });

  it("returns true when ratio > 3.0× (voice-cast-scene-leak pattern)", () => {
    // 0.8 s/char is 4× of 0.2 median
    expect(isDurationAnomaly({ durationMs: 8000, charCount: 10 }, median)).toBe(true);
  });

  it("returns true when ratio < 0.3× (cropped/silent output)", () => {
    // 0.05 s/char is 0.25× of 0.2 median
    expect(isDurationAnomaly({ durationMs: 500, charCount: 10 }, median)).toBe(true);
  });

  it("returns false when ratio is in-band (1.0× = median)", () => {
    expect(isDurationAnomaly({ durationMs: 2000, charCount: 10 }, median)).toBe(false);
  });

  it("returns false at the upper boundary (exactly 3.0× does NOT trigger)", () => {
    // 0.6 s/char = exactly 3.0× of 0.2 → NOT an anomaly (strict >)
    expect(isDurationAnomaly({ durationMs: 6000, charCount: 10 }, median)).toBe(false);
  });

  it("returns false at the lower boundary (exactly 0.3× does NOT trigger)", () => {
    // 0.06 s/char = exactly 0.3× of 0.2 → NOT an anomaly (strict <)
    expect(isDurationAnomaly({ durationMs: 600, charCount: 10 }, median)).toBe(false);
  });
});

describe("wordDiff (D-11 --verify-audio)", () => {
  it("returns empty arrays when expected === actual", () => {
    const r = wordDiff("so mote it be", "so mote it be");
    expect(r.missed).toEqual([]);
    expect(r.inserted).toEqual([]);
  });

  it("flags words missing from actual (model dropped words)", () => {
    const r = wordDiff("brethren let us commence", "brethren us commence");
    expect(r.missed).toEqual(["let"]);
    expect(r.inserted).toEqual([]);
  });

  it("flags words inserted by actual (model hallucinated words)", () => {
    const r = wordDiff("so mote it be", "so mote it truly be");
    expect(r.missed).toEqual([]);
    expect(r.inserted).toEqual(["truly"]);
  });

  it("is case-insensitive", () => {
    const r = wordDiff("SO Mote It Be", "so mote it be");
    expect(r.missed).toEqual([]);
    expect(r.inserted).toEqual([]);
  });

  it("handles whitespace variation (collapses multiple spaces)", () => {
    const r = wordDiff("so   mote  it be", "so mote it be");
    expect(r.missed).toEqual([]);
    expect(r.inserted).toEqual([]);
  });

  it("returns both missed and inserted when both diverge", () => {
    const r = wordDiff("brethren rise", "brother rose");
    expect(r.missed.sort()).toEqual(["brethren", "rise"].sort());
    expect(r.inserted.sort()).toEqual(["brother", "rose"].sort());
  });
});
```

Commit: `author-02: add scripts/lib/resume-state.ts + line-level _RESUME.json writes in build-mram`
  </action>
  <verify>
    <automated>test -f scripts/lib/resume-state.ts && test -f scripts/lib/bake-math.ts && grep -q "export interface ResumeState" scripts/lib/resume-state.ts && grep -q "writeResumeStateAtomic" scripts/lib/resume-state.ts && grep -q "\.tmp" scripts/lib/resume-state.ts && grep -q "renameSync" scripts/lib/resume-state.ts && grep -q "export function computeMedianSecPerChar" scripts/lib/bake-math.ts && grep -q "export function isDurationAnomaly" scripts/lib/bake-math.ts && grep -q "export function wordDiff" scripts/lib/bake-math.ts && grep -q "resume-state-path" scripts/build-mram-from-dialogue.ts && grep -q "writeResumeStateAtomic\\|inFlightLineIds" scripts/build-mram-from-dialogue.ts && grep -q "skip-line-ids" scripts/build-mram-from-dialogue.ts && grep -q "from \"./lib/resume-state\"" scripts/build-mram-from-dialogue.ts && grep -q "from \"./lib/bake-math\"" scripts/build-mram-from-dialogue.ts && npx tsc --noEmit && npx vitest run --no-coverage scripts/__tests__/bake-helpers.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `test -f scripts/lib/resume-state.ts` is true (new file created).
    - `grep -q "export interface ResumeState" scripts/lib/resume-state.ts` (shared type present).
    - `grep -q "writeResumeStateAtomic" scripts/lib/resume-state.ts` (exported atomic writer).
    - `grep -q "readResumeState" scripts/lib/resume-state.ts` (exported reader).
    - `grep -qE "writeFileSync.*\\.tmp|renameSync" scripts/lib/resume-state.ts` (atomic-write mechanism: tmp + rename).
    - `grep -q "resume-state-path" scripts/build-mram-from-dialogue.ts` (CLI arg recognized).
    - `grep -q "ritual-slug" scripts/build-mram-from-dialogue.ts` (CLI arg recognized).
    - `grep -q "skip-line-ids" scripts/build-mram-from-dialogue.ts` (CLI arg recognized).
    - `grep -qE "writeResumeStateAtomic|inFlightLineIds" scripts/build-mram-from-dialogue.ts` (per-line writes wired).
    - `grep -q 'from "./lib/resume-state"' scripts/build-mram-from-dialogue.ts` (imports the shared module).
    - `grep -q "markLineInFlight" scripts/build-mram-from-dialogue.ts` returns ≥ 2 matches (declaration + call).
    - `grep -q "markLineCompleted" scripts/build-mram-from-dialogue.ts` returns ≥ 2 matches (declaration + call).
    - `grep -c "it.todo(" scripts/__tests__/bake-helpers.test.ts` returns 0 (scaffold fully replaced).
    - `test -f scripts/lib/bake-math.ts` is true (new math-helpers module created).
    - `grep -q "export function computeMedianSecPerChar" scripts/lib/bake-math.ts` (D-10 median helper exported).
    - `grep -q "export function isDurationAnomaly" scripts/lib/bake-math.ts` (D-10 ratio check exported).
    - `grep -q "export function wordDiff" scripts/lib/bake-math.ts` (D-11 word-diff exported).
    - `grep -q 'from "./lib/bake-math"' scripts/build-mram-from-dialogue.ts` (build-mram imports the extracted helpers rather than redefining them inline).
    - `grep -c "describe(" scripts/__tests__/bake-helpers.test.ts` returns ≥ 4 (resume-state + 3 math describes: computeMedianSecPerChar, isDurationAnomaly, wordDiff).
    - `npx vitest run --no-coverage scripts/__tests__/bake-helpers.test.ts` exits 0 with ≥ 20 passing tests (7+ resume-state + 5 median + 7 anomaly + 6 wordDiff).
    - `npx tsc --noEmit` exits 0.
    - `npm run build` exits 0.
    - Full test suite green: `npx vitest run --no-coverage` exits 0.
  </acceptance_criteria>
  <done>
    scripts/lib/resume-state.ts exists with shared ResumeState + atomic helpers. build-mram-from-dialogue.ts accepts --resume-state-path / --ritual-slug / --skip-line-ids, writes _RESUME.json atomically before AND after every line, and respects --skip-line-ids to skip completed work on resume. Plan 07's orchestrator can import the same types to read state for its pre-spawn decisions.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Dialogue file pair → bake output | D-08 validator catches cipher/plain drift before any API spend |
| Short-line bake → Google Cloud TTS | GOOGLE_CLOUD_TTS_API_KEY sent as `?key=` query param; must never appear in logs |
| --verify-audio → Groq Whisper | GROQ_API_KEY sent as Bearer; ritual text sent as transcription input |
| _RESUME.json file ↔ build-mram process / orchestrator | crash-window consistency depends on atomic rename |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-04 | Tampering | validator hard-fail treated as advisory → corrupted .mram ships | mitigate | validateOrFail() calls process.exit(1) on any severity="error" issue; no --force override in Phase 3 per CONTEXT.md §Deferred Ideas. Plan 07 orchestrator follows the same pattern (PATTERNS.md §Validator-gate). |
| T-03-05 | Information Disclosure | GOOGLE_CLOUD_TTS_API_KEY logged to stdout during error path | mitigate | googleTtsBakeCall() redacts `?key=<value>` via `.replace(/[?&]key=[^&"'\s]*/g, "?key=REDACTED")` before throwing. Body-slice limited to 500 chars to bound leak surface. |
| T-03-06 | Information Disclosure | --verify-audio sends ritual dialogue text to Groq Whisper → data minimization concern | mitigate | Opt-in flag, default off, documented in header JSDoc per D-11. Shannon explicitly enables on the final pre-ship pass per ritual (typically 1 run per ritual, ~155 lines × ~$0.000065 = ~$0.01). Transcription request goes only to Groq (existing Phase 2 provider; already handles ritual audio via /api/transcribe). |
| T-03-04b | Tampering | voice-cast scene preamble leaks into short-line Google TTS audio (Pitfall 4) | mitigate | googleTtsBakeCall() sends `input: { text }` only — no preamble, no style directive. Pitfall 4 in RESEARCH.md explicitly flags this. Additional guard: short-line branch does NOT read `preambleByRole` or `line.style`. |
| T-03-10 | Tampering | partial _RESUME.json write (power loss mid-write) → unreadable state file on resume | mitigate | writeResumeStateAtomic uses tmp+rename (`fs.renameSync` is atomic on POSIX within the same directory). A crash DURING writeFileSync leaves the OLD _RESUME.json intact; a crash AFTER writeFileSync but BEFORE renameSync leaves the OLD file intact plus an orphan .tmp (readResumeState never reads .tmp). Plan 07's orchestrator treats unreadable state as "start fresh" rather than auto-delete (safer — preserves forensic evidence). |
</threat_model>

<verification>
- `npx tsc --noEmit` — exits 0.
- `npm run build` — exits 0.
- `npx vitest run --no-coverage` — full suite exits 0 (new bake-helpers.test.ts adds ≥ 20 tests; orchestrator-level tests land in Plan 07).
- `npx vitest run --no-coverage scripts/__tests__/bake-helpers.test.ts` — ≥ 20 passing tests covering ResumeState helpers AND the extracted pure-math helpers (computeMedianSecPerChar, isDurationAnomaly, wordDiff).
- Grep assertions (acceptance_criteria above) confirm all five gates wired.
- Integration smoke test (manual, during execution): run `npx tsx scripts/build-mram-from-dialogue.ts --resume-state-path /tmp/rs.json --ritual-slug test-ritual` against one small test ritual and (a) verify validator runs before API calls, (b) short lines get Google audio, (c) `_RESUME.json` is written after every line with the lineId appearing in completedLineIds, (d) duration anomaly detector produces no false positives on a 3-5 line ritual (since samples.length < 30 → skip per Pitfall 6).
</verification>

<success_criteria>
- `build-mram-from-dialogue.ts` runs validatePair() as the first operation per ritual and exits non-zero on any severity="error" issue.
- Lines shorter than MIN_BAKE_LINE_CHARS route to googleTtsBakeCall() and produce embedded audio (no more silent drop).
- After each rendered line (Gemini or Google), addAndCheckAnomaly() runs; first 30 lines per ritual skip the check; subsequent lines fail the bake on >3× or <0.3× median ratio.
- --verify-audio flag collects per-line word-diff counts and prints a warn-only summary at the end; never fails the bake.
- `scripts/lib/resume-state.ts` exists with exported `ResumeState` interface + `readResumeState` + `writeResumeStateAtomic`.
- `scripts/lib/bake-math.ts` exists with exported `computeMedianSecPerChar` + `isDurationAnomaly` + `wordDiff` + `DurationSample` interface; `build-mram-from-dialogue.ts` imports them instead of defining them inline.
- `build-mram-from-dialogue.ts` accepts `--resume-state-path`, `--ritual-slug`, `--skip-line-ids` CLI args; writes `_RESUME.json` atomically after every completed line (inFlightLineIds → completedLineIds).
- `--skip-line-ids` skips matching lineIds entirely (no render, no embed, no anomaly mutation).
- Neither GOOGLE_CLOUD_TTS_API_KEY nor GROQ_API_KEY appears in any error path output.
- Full test suite still green; new `scripts/__tests__/bake-helpers.test.ts` adds 7+ passing tests for the resume-state helpers.
</success_criteria>

<output>
After completion, create `.planning/phases/03-authoring-throughput/03-06-SUMMARY.md` documenting:
- All five gates wired with exact line references added to build-mram-from-dialogue.ts
- The GOOGLE_ROLE_VOICES mapping used (source: src/lib/tts-cloud.ts:288-337)
- The new scripts/lib/resume-state.ts module shape (ResumeState interface + exports)
- Measured duration-anomaly threshold behavior on a sample bake (if Shannon ran one — else note "to be measured in Phase 4")
- Confirmation that --verify-audio is opt-in and never hard-fails
- Confirmation that a sample line-level _RESUME.json write round-trips through readResumeState cleanly
- Commit SHAs for all three commits
</output>
