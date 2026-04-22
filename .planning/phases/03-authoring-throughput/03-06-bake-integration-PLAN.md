---
phase: 03-authoring-throughput
plan: 06
type: execute
wave: 3
depends_on: [04, 05]
files_modified:
  - scripts/build-mram-from-dialogue.ts
autonomous: true
requirements: [AUTHOR-04, AUTHOR-05, AUTHOR-06, AUTHOR-07]
tags: [bake-pipeline, short-line, google-tts, validator-gate, duration-anomaly, stt-verify]

must_haves:
  truths:
    - "Lines shorter than MIN_BAKE_LINE_CHARS (default 5 per D-09) are NO LONGER hard-skipped. Instead they call Google Cloud TTS REST directly via the script-side googleTtsBakeCall helper and the Opus is embedded into the .mram the same as any Gemini-rendered line"
    - "Before ANY rendering per ritual, validatePair() runs on the plain/cipher file pair. Any issue with severity 'error' (including D-08 bake-band ratio-outliers from Plan 04) prints a failure report and exits process.exit(1) WITHOUT making a single API call"
    - "After each rendered line, the duration-anomaly detector computes durationMs from the Opus bytes via music-metadata parseBuffer, then compares against a rolling per-ritual median sec-per-char. >3× or <0.3× the median hard-fails the bake with a structured error message per D-10. First 30 lines per ritual skip the check (insufficient sample, per Pitfall 6)"
    - "--verify-audio flag (opt-in, default off) pipes each rendered line's Opus through Groq Whisper via a DIRECT API call (bypassing /api/transcribe per RESEARCH recommendation) and prints a word-diff roll-up at the end. NEVER hard-fails the bake (warn-only per D-11)"
    - "Google TTS short-line call sends ONLY {text, voiceName, languageCode} — NO preamble, NO style directive, NO voice-cast scene. Prevents the voice-cast-scene-leaks-into-audio failure mode from cross-contaminating the short-line engine (Pitfall 4)"
    - "Google voice mapping uses the existing GOOGLE_ROLE_VOICES table via getGoogleVoiceForRole() from src/lib/tts-cloud.ts — no re-invention; tonally matched to Gemini roles by existing curation"
    - "Short-line audio uses Google's `OGG_OPUS` audioEncoding — native Opus-in-Ogg, byte-compatible with Gemini's post-ffmpeg Opus path (Assumption A3). No ffmpeg transcode for short-line audio"
  artifacts:
    - path: scripts/build-mram-from-dialogue.ts
      provides: "bake pipeline with pre-render validator gate, short-line Google TTS route, post-render duration-anomaly detector, optional STT verify roll-up; all bake-time correctness gates (AUTHOR-04/05/06/07) wired in"
      contains: "googleTtsBakeCall"
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
---

<objective>
Wire the four bake-time correctness gates into `scripts/build-mram-from-dialogue.ts`: (1) **pre-render validator gate** (AUTHOR-05 D-08) — call `validatePair()` before any API activity; bail on severity-error issues; (2) **short-line Google TTS route** (AUTHOR-04 D-09) — replace the current hard-skip behavior for lines under `MIN_BAKE_LINE_CHARS` with a direct Google Cloud TTS REST call that returns native Opus bytes embeddable verbatim in the .mram; (3) **audio-duration anomaly detector** (AUTHOR-06 D-10) — post-render, parse Opus via music-metadata, maintain a rolling per-ritual median sec-per-char, hard-fail any line >3× or <0.3× the median with a structured error; (4) **--verify-audio STT round-trip** (AUTHOR-07 D-11) — opt-in flag that pipes each Opus through Groq Whisper directly, warns on word-diff > 2 words (default threshold), never hard-fails the bake.

Purpose: per D-08/D-09/D-10/D-11, the Phase 3 bake pipeline gains four correctness gates that catch the historical failure modes in a single pass: corrupted cipher/plain pairs, silently-dropped ultra-short lines, voice-cast-preamble-leaks manifesting as pathological durations, and Whisper-diff mismatches as a final ship-check. The changes are layered additively onto the existing bake script without touching the Gemini render path (Plan 05 owns that); the short-line hard-skip is replaced end-to-end with a working alternate engine.

Output: updated `scripts/build-mram-from-dialogue.ts` with the four gates wired; short-line path fully functional via Google TTS REST; duration anomaly detector active; `--verify-audio` flag implemented. No new test file — orchestrator-level tests live in Plan 07 (`scripts/__tests__/bake-all.test.ts`). This plan's validation is integration-level: running a real bake (manual verification per 03-VALIDATION.md §Manual-Only Verifications) + the existing mram-audio-bake test.
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

<interfaces>
<!-- Existing imports preserved. New imports this plan adds. -->

New imports at top of scripts/build-mram-from-dialogue.ts:
```typescript
import { parseBuffer } from "music-metadata";  // D-10 duration anomaly
import { validatePair, type PairValidationResult } from "../src/lib/author-validation";  // D-08 gate
import { getGoogleVoiceForRole, type GoogleVoiceProfile } from "../src/lib/tts-cloud";  // D-09 short-line mapping
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

Flag parsing (this plan adds `--verify-audio` to the existing argv parse block):
```typescript
const verifyAudio = process.argv.includes("--verify-audio");
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

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Dialogue file pair → bake output | D-08 validator catches cipher/plain drift before any API spend |
| Short-line bake → Google Cloud TTS | GOOGLE_CLOUD_TTS_API_KEY sent as `?key=` query param; must never appear in logs |
| --verify-audio → Groq Whisper | GROQ_API_KEY sent as Bearer; ritual text sent as transcription input |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-04 | Tampering | validator hard-fail treated as advisory → corrupted .mram ships | mitigate | validateOrFail() calls process.exit(1) on any severity="error" issue; no --force override in Phase 3 per CONTEXT.md §Deferred Ideas. Plan 07 orchestrator follows the same pattern (PATTERNS.md §Validator-gate). |
| T-03-05 | Information Disclosure | GOOGLE_CLOUD_TTS_API_KEY logged to stdout during error path | mitigate | googleTtsBakeCall() redacts `?key=<value>` via `.replace(/[?&]key=[^&"'\s]*/g, "?key=REDACTED")` before throwing. Body-slice limited to 500 chars to bound leak surface. |
| T-03-06 | Information Disclosure | --verify-audio sends ritual dialogue text to Groq Whisper → data minimization concern | mitigate | Opt-in flag, default off, documented in header JSDoc per D-11. Shannon explicitly enables on the final pre-ship pass per ritual (typically 1 run per ritual, ~155 lines × ~$0.000065 = ~$0.01). Transcription request goes only to Groq (existing Phase 2 provider; already handles ritual audio via /api/transcribe). |
| T-03-04b | Tampering | voice-cast scene preamble leaks into short-line Google TTS audio (Pitfall 4) | mitigate | googleTtsBakeCall() sends `input: { text }` only — no preamble, no style directive. Pitfall 4 in RESEARCH.md explicitly flags this. Additional guard: short-line branch does NOT read `preambleByRole` or `line.style`. |
</threat_model>

<verification>
- `npx tsc --noEmit` — exits 0.
- `npm run build` — exits 0.
- `npx vitest run --no-coverage` — full suite exits 0 (no new tests in this plan; orchestrator-level tests land in Plan 07).
- Grep assertions (acceptance_criteria above) confirm all four gates wired.
- Integration smoke test (manual, during execution): run `npx tsx scripts/build-mram-from-dialogue.ts` against one small test ritual and verify validator runs before API calls, short lines get Google audio, and duration anomaly detector produces no false positives on a 3-5 line ritual (since samples.length < 30 → skip per Pitfall 6).
</verification>

<success_criteria>
- `build-mram-from-dialogue.ts` runs validatePair() as the first operation per ritual and exits non-zero on any severity="error" issue.
- Lines shorter than MIN_BAKE_LINE_CHARS route to googleTtsBakeCall() and produce embedded audio (no more silent drop).
- After each rendered line (Gemini or Google), addAndCheckAnomaly() runs; first 30 lines per ritual skip the check; subsequent lines fail the bake on >3× or <0.3× median ratio.
- --verify-audio flag collects per-line word-diff counts and prints a warn-only summary at the end; never fails the bake.
- Neither GOOGLE_CLOUD_TTS_API_KEY nor GROQ_API_KEY appears in any error path output.
- Full test suite still green.
</success_criteria>

<output>
After completion, create `.planning/phases/03-authoring-throughput/03-06-SUMMARY.md` documenting:
- All four gates wired with exact line references added to build-mram-from-dialogue.ts
- The GOOGLE_ROLE_VOICES mapping used (source: src/lib/tts-cloud.ts:288-337)
- Measured duration-anomaly threshold behavior on a sample bake (if Shannon ran one — else note "to be measured in Phase 4")
- Confirmation that --verify-audio is opt-in and never hard-fails
- Commit SHAs for both commits
</output>
