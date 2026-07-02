---
phase: 03-authoring-throughput
plan: 05
subsystem: authoring-pipeline
tags: [tts, stt, google-cloud-tts, groq-whisper, vitest, tdd, bake-pipeline]

# Dependency graph
requires:
  - phase: 03-authoring-throughput
    provides: "Plan 01's scripts/lib/bake-math.ts (wordDiff, computeMedianSecPerChar, isDurationAnomaly)"
provides:
  - "googleTtsBakeCall(text, voice, apiKey, fetchImpl?) — Google Cloud TTS fallback call for ultra-short lines, preamble-leak-proof by construction"
  - "verifyLineAudio({ audio, expectedText, apiKey, fetchImpl? }) — direct-Groq STT round-trip verifier, policy-free (strict ok)"
  - "VoiceCastRole.googleVoice — per-role Google TTS voice pinning, narrowed by validateVoiceCast, back-compatible"
affects: [03-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Injectable fetchImpl parameter for testing external API calls without a mock-fetch library"
    - "Structural preamble-leak guard: no import from the Gemini preamble-builder module in the Google TTS call site (Pitfall 4)"
    - "Copy-with-provenance-comment for cross-module constant reuse (MASONIC_PROMPT, model id) instead of importing a Next.js route module into a standalone script"
    - "Redact API keys/bearer tokens from thrown error messages before they can reach logs"

key-files:
  created:
    - scripts/lib/google-tts.ts
    - scripts/lib/stt-verify.ts
    - scripts/__tests__/google-tts.test.ts
    - scripts/__tests__/stt-verify.test.ts
  modified:
    - src/lib/voice-cast.ts
    - src/lib/__tests__/voice-cast.test.ts

key-decisions:
  - "stt-verify.ts strips punctuation before calling wordDiff (pre-processing, not a duplicated diff algorithm) because wordDiff (scripts/lib/bake-math.ts, Plan 01, out of this plan's scope) is case-insensitive/whitespace-normalized but intentionally NOT punctuation-insensitive — STT transcripts routinely omit terminal punctuation, and the plan's own acceptance criteria required 'i do' vs 'I do.' to resolve ok:true."
  - "MASONIC_PROMPT and the Groq model id (whisper-large-v3) are copied into stt-verify.ts with a 'keep in sync' provenance comment rather than imported from src/app/api/transcribe/route.ts, avoiding a Next.js server dependency in a standalone bake script (per plan's explicit instruction)."
  - "googleTtsBakeCall's module-header comment deliberately avoids the literal substring 'voice-cast' so the acceptance-criteria grep guard (`grep -c \"voice-cast\" scripts/lib/google-tts.ts` == 0) holds even in documentation, not just in code."

requirements-completed: [AUTHOR-04, AUTHOR-07]

duration: 8min
completed: 2026-07-02
---

# Phase 03 Plan 05: Google TTS fallback + STT round-trip verifier + voice-cast googleVoice pinning Summary

**Preamble-leak-proof Google Cloud TTS short-line fallback call, a policy-free direct-Groq STT round-trip verifier, and per-role `googleVoice` pinning in the voice-cast sidecar schema — the three building blocks Plan 08 wires into the bake pipeline's short-line fix.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-02T16:31:00Z
- **Completed:** 2026-07-02T16:37:06Z
- **Tasks:** 3 completed
- **Files modified:** 6 (4 created, 2 modified), 1 deleted

## Accomplishments
- `VoiceCastRole.googleVoice` added as an optional, back-compatible field, narrowed by `validateVoiceCast`, structurally invisible to `buildPreamble`/`assemblePrompt` (verified by grep + tests)
- `scripts/lib/google-tts.ts` created: `googleTtsBakeCall` sends the raw line text ONLY to Google Cloud TTS (`text:synthesize`), has zero import from the Gemini preamble-builder module (structural Pitfall-4 guard), redacts `?key=`/`&key=` from thrown errors, and returns a base64-decoded OGG_OPUS `Buffer`
- `test-google-line94.mjs` (Shannon's proof-of-concept) folded into `google-tts.ts` and deleted — git status noise reduced
- `scripts/lib/stt-verify.ts` created: `verifyLineAudio` transcribes an audio buffer via a direct Groq Whisper call (mirroring `/api/transcribe`'s model id and `MASONIC_PROMPT`, copied not imported), diffs via `wordDiff` from `./bake-math`, redacts the bearer token from errors, and is strictly policy-free (`ok` requires zero missed AND zero inserted words)

## Task Commits

Each task followed TDD (RED → GREEN) where applicable and was committed atomically:

1. **Task 1: Extend VoiceCastRole with googleVoice (D-04)** - `e724f01` (feat)
2. **Task 2: Create scripts/lib/google-tts.ts short-line call (D-02, Pitfall 4)**
   - `05f26cc` (test — RED, confirmed failing on missing module)
   - `fc5c45e` (feat — GREEN, module + deletion of `test-google-line94.mjs`)
3. **Task 3: Create scripts/lib/stt-verify.ts Groq round-trip helper (AUTHOR-07)**
   - `070858d` (test — RED, confirmed failing on missing module)
   - `c533ec9` (feat — GREEN)

**Plan metadata:** committed separately by the orchestrator after wave completion (worktree mode — this plan does not commit STATE.md/ROADMAP.md).

## Files Created/Modified
- `src/lib/voice-cast.ts` - Added `googleVoice?: string` to `VoiceCastRole`; added `"googleVoice"` to the `validateVoiceCast` narrowing field loop
- `src/lib/__tests__/voice-cast.test.ts` - Added tests: googleVoice round-trips through narrowing, back-compat without googleVoice, non-string rejection, buildPreamble/assemblePrompt never leak googleVoice
- `scripts/lib/google-tts.ts` - New: `googleTtsBakeCall(text, voice, apiKey, fetchImpl?)` — Google Cloud TTS fallback call
- `scripts/__tests__/google-tts.test.ts` - New: 4 tests covering request body shape, preamble-leak guard, key redaction on error, buffer decoding
- `scripts/lib/stt-verify.ts` - New: `verifyLineAudio({ audio, expectedText, apiKey, fetchImpl? })` built on internal `transcribeBuffer`
- `scripts/__tests__/stt-verify.test.ts` - New: 4 tests covering form-data shape/model id/prompt, pass case, fail case, bearer-token redaction
- `test-google-line94.mjs` - Deleted (folded into `scripts/lib/google-tts.ts`)

## Decisions Made
- **Punctuation stripping in stt-verify.ts before wordDiff:** `scripts/lib/bake-math.ts`'s `wordDiff` (Plan 01, out of this plan's `files_modified` scope) is case-insensitive and whitespace-normalized but not punctuation-insensitive (confirmed against its existing test suite, `scripts/__tests__/bake-math.test.ts`). The plan's own acceptance criteria required `"i do"` (STT transcript) vs `"I do."` (expected line text) to resolve `ok:true`. Rather than modify the shared `bake-math.ts` (used by AUTHOR-05/06 validators too — out of scope, higher blast radius), `stt-verify.ts` strips common punctuation from both strings as a pre-processing step immediately before calling `wordDiff`. The diff algorithm itself is still 100% `wordDiff` — no duplicated diff logic — satisfying the acceptance criterion `grep -q "wordDiff" scripts/lib/stt-verify.ts`.
- **Copy MASONIC_PROMPT + model id, don't import the route:** Per the plan's explicit instruction, `stt-verify.ts` copies the `MASONIC_PROMPT` string array and the exact Groq model id (`whisper-large-v3`) from `src/app/api/transcribe/route.ts` with a `// copied from ... — keep in sync` comment, rather than importing the route file (which would drag Next.js server dependencies into a standalone script).
- **google-tts.ts module comment avoids the literal string "voice-cast":** The acceptance criteria required `grep -c "voice-cast" scripts/lib/google-tts.ts` to return `0` as a structural guard proving no import exists. The module's own explanatory comment about *why* there's no import would otherwise trip that same grep, so the comment was worded to describe the guard without using the literal filename substring.

## Deviations from Plan

None requiring Rule 4 (architectural) escalation. One Rule 1 (bug/correctness) fix during implementation:

### Auto-fixed Issues

**1. [Rule 1 - Bug] stt-verify.ts punctuation handling did not match acceptance criteria on first GREEN attempt**
- **Found during:** Task 3 (Create scripts/lib/stt-verify.ts)
- **Issue:** The plan's acceptance criteria specified `"i do"` (STT) vs `"I do."` (expected) → `ok:true`, described as "case/punctuation-insensitive via wordDiff normalization." The actual `wordDiff` (from Plan 01's `scripts/lib/bake-math.ts`, confirmed via its own passing test suite) only normalizes case and whitespace — it does not strip punctuation, so the exact test case in the plan failed on first run (`missed: ["do."], inserted: ["do"]`).
- **Fix:** Added a local `stripPunctuation()` pre-processing step in `stt-verify.ts` applied to both `expectedText` and the raw transcript immediately before the `wordDiff` call. `wordDiff` itself (and `bake-math.ts`) were left untouched — out of this plan's scope and shared by other validators.
- **Files modified:** `scripts/lib/stt-verify.ts`
- **Verification:** `npx vitest run scripts/__tests__/stt-verify.test.ts` — all 4 tests pass, including the exact plan-specified case/punctuation scenario
- **Committed in:** `c533ec9` (Task 3 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Necessary for the plan's own acceptance criteria to hold without touching a shared, out-of-scope module (`bake-math.ts`). No scope creep — the fix is entirely contained within `stt-verify.ts`.

## Issues Encountered
None beyond the deviation documented above.

## User Setup Required

None for this plan directly. Per Task 1's plan instruction: Shannon must add per-role `googleVoice` values to each ritual's `{slug}-voice-cast.json` before the short-line Google fallback (wired in Plan 08) can pick a matched voice for that role. A missing `googleVoice` should be handled at the Plan 08 call site with a documented default — this plan only adds the schema support, not the backfill of real sidecar values.

Also carried forward from the plan: `GOOGLE_CLOUD_TTS_API_KEY` (already present in `.env` and `.env.example`) becomes newly load-bearing for the bake pipeline once Plan 08 wires `googleTtsBakeCall` in — no new env var, but its criticality changed from runtime-optional-fallback to bake-time-required-for-short-lines.

## Next Phase Readiness

Plan 08 (bake pipeline integration) can now:
- Call `googleTtsBakeCall(text, role.googleVoice, apiKey)` for the Google fallback tier of the D-01/D-02 short-line routing, with the preamble-leak guard already structurally enforced
- Call `verifyLineAudio({ audio, expectedText, apiKey })` as the D-03 short-line validation gate's STT round-trip check, applying its own tolerance policy on top of the returned `missed`/`inserted` arrays
- Read `role.googleVoice` from any `{slug}-voice-cast.json` sidecar via the now-extended `VoiceCastFile`/`VoiceCastRole` schema

No blockers. All three artifacts are unit-tested in isolation (30 tests total across the three affected suites) and have not yet been exercised end-to-end against live Google/Groq APIs — that integration testing is Plan 08's responsibility once the call sites exist.

---
*Phase: 03-authoring-throughput*
*Completed: 2026-07-02*

## Self-Check: PASSED

All created/modified files verified present on disk; all task commit hashes (`e724f01`, `05f26cc`, `fc5c45e`, `070858d`, `c533ec9`) verified present in git log; `test-google-line94.mjs` verified absent (intentional deletion). No missing items.
