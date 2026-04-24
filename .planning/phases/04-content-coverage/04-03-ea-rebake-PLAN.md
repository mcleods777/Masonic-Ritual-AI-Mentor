---
phase: 04-content-coverage
plan: 03
type: execute
wave: 1
depends_on: [01, 02]
files_modified:
  - rituals/ea-opening.mram
  - rituals/ea-initiation.mram
  - rituals/ea-explanatory.mram
  - rituals/ea-closing.mram
  - .planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md
autonomous: false
requirements: [CONTENT-01]
tags: [content, ea-rebake, v3-cache, opus-bake, shannon-labor]

must_haves:
  truths:
    - "All four existing EA rituals (ea-opening, ea-initiation, ea-explanatory, ea-closing) are freshly baked under the Phase 3 v3 cache (AUTHOR-01 D-02) — every `.opus` entry has `modelId` in its cache key"
    - "Each EA `.mram` passes `npx tsx scripts/verify-mram.ts rituals/ea-{slug}.mram --check-audio-coverage` with exit 0 (CONTENT-06 satisfied for EA set)"
    - "Each EA `.mram` passes `validatePair()` during bake-all's pre-render gate (D-08 invariant; CONTENT-07 satisfied for EA set)"
    - "Every EA line has been scrubbed in `scripts/preview-bake.ts` at `http://127.0.0.1:8883` — no voice-cast-scene leaks, no text-token regressions, no missing words"
    - "The 4 EA rows in `04-CONTENT-CHECKLIST.md` have `baked = [x]`, `scrubbed = [x]`, `verified = [x]`, `shipped = [x]`"
    - "The one-time cache re-bake API burn (~385 lines × ~6s/line ≈ 40 min wall-clock; Gemini preview quota consumed — per RESEARCH.md §P7) is complete"
  artifacts:
    - path: "rituals/ea-opening.mram"
      provides: "EA opening ceremony, v3-cache baked, per-line Opus present for every spoken line, voice cast pinned in metadata"
      contains: "metadata.audioFormat == opus-32k-mono, metadata.voiceCast"
    - path: "rituals/ea-initiation.mram"
      provides: "EA initiation (first degree), v3-cache baked, per-line Opus"
      contains: "metadata.audioFormat == opus-32k-mono"
    - path: "rituals/ea-explanatory.mram"
      provides: "EA explanatory lecture, v3-cache baked, per-line Opus"
      contains: "metadata.audioFormat == opus-32k-mono"
    - path: "rituals/ea-closing.mram"
      provides: "EA closing ceremony, v3-cache baked, per-line Opus"
      contains: "metadata.audioFormat == opus-32k-mono"
    - path: ".planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md"
      provides: "All 4 EA rows updated with baked/scrubbed/verified/shipped = [x]"
      contains: "ea-opening | [x] | [x] | [x] | [x]"
  key_links:
    - from: "bake run"
      to: "rituals/_bake-cache/_INDEX.json"
      via: "per-line cache-entry append with modelId in key (Phase 3 D-02/D-03)"
      pattern: "modelId"
    - from: "rituals/ea-*.mram"
      to: "scripts/verify-content.ts"
      via: "release gate invocation at end-of-plan"
      pattern: "verify-content"
    - from: "per-line audio"
      to: "MRAMDocument.metadata.voiceCast"
      via: "build-mram-from-dialogue.ts --with-audio"
      pattern: "voiceCast"
---

<objective>
Re-bake the 4 existing EA rituals (opening, initiation, explanatory, closing) under the Phase 3 v3 cache. The existing `.mram` files were baked on 2026-04-17..22 under the v2 cache key; the v3 key (AUTHOR-01 D-02 added `modelId`) cache-invalidates every line, so this is a one-time ~40-minute wall-clock, ~385-API-call re-render. After baking, scrub each ritual in `preview-bake`, verify with `--check-audio-coverage`, and mark shipped in the checklist.

Purpose: CONTENT-01 requires "EA degree baked — cipher + plain + Gemini audio + voice cast pinned." The dialogue + voice-cast + styles files already exist and are unchanged. What's stale is the actual baked `.mram` output — it must be regenerated so every shipped EA ritual carries the modelId-keyed cache entries and passes Phase 4's new `--check-audio-coverage` verifier.

Output: 4 re-baked EA `.mram` files; 4 checklist rows updated to shipped; one Gemini/Google API spend reported in the SUMMARY.

Non-autonomous: Shannon drives the bake (API keys, passphrase, scrubbing judgment). Claude prepares the environment, runs verification, and updates documentation.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/04-content-coverage/04-RESEARCH.md
@.planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md
@.planning/phases/04-content-coverage/04-01-SUMMARY.md
@.planning/phases/04-content-coverage/04-02-SUMMARY.md
@.planning/phases/03-authoring-throughput/03-CONTEXT.md
@.planning/phases/03-authoring-throughput/03-05-SUMMARY.md
@.planning/phases/03-authoring-throughput/03-06-SUMMARY.md
@.planning/phases/03-authoring-throughput/03-07-SUMMARY.md
@.planning/phases/03-authoring-throughput/03-08-SUMMARY.md

@scripts/bake-all.ts
@scripts/preview-bake.ts
@scripts/verify-mram.ts
@scripts/verify-content.ts
@scripts/lib/resume-state.ts

<pitfalls>
From RESEARCH.md §Pitfalls and Known Hazards:
- **P1 (voice-cast scene leak)**: scrub for phantom phrases; `grep` voice-cast for any phrase you hear but didn't write
- **P2/P3 (text-token regression)**: short lines auto-route to Google Cloud TTS (<5 chars); medium-line regressions → escalate tactics (retry → style shift → speakAs)
- **P4 (preview quota)**: midnight-PT reset; use `GOOGLE_GEMINI_API_KEYS` pool; don't bake during daytime dev testing
- **P7 (the v2→v3 cache burn this plan IS)**: ~385 lines cache-miss, ~40 min wall-clock, single largest API cost in Phase 4
- **P10 (passphrase drift)**: use `MRAM_PASSPHRASE` env var so all 4 EA `.mram`s share a single passphrase
</pitfalls>
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Shannon's machine → Gemini/Google APIs | API keys in env must not leak into logs; Phase 2 PII-free logging discipline applies |
| `rituals/_bake-cache/` → `.gitignore` | Cache entries must never land in a commit |
| `rituals/*.mram` → `.gitignore` | Baked outputs must never land in a commit |
| preview-bake localhost | Loopback-only per Phase 3 D-17; not exposed to LAN |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-04-11 | Information Disclosure | accidentally committing baked `.mram` | mitigate | Pre-plan git status check (`git check-ignore rituals/*.mram` confirms ignore); Task 3 re-confirms before completion |
| T-04-12 | Information Disclosure | voice-cast scene leak into audio (phantom content) | mitigate | Task 2 scrub pass listens for out-of-dialogue phrases per P1; AUTHOR-06 anomaly detector catches extreme cases at bake time |
| T-04-13 | Integrity | stale v2 `.mram` shipped to pilot | mitigate | Plan 04-03 COMPLETELY replaces the v2 files; Task 3 verifier pass exits 1 on any v2 residue (MRAMDocument.version != 3) per Plan 04-01 Test 5 |
| T-04-14 | DoS | Gemini quota burn triggers extended retry cycle | accept | Known one-time cost per P7; mitigation is scheduling (late-night bake, `GEMINI_RETRY_BACKOFF_MS=3000,5000` to fast-tier-drop failed attempts) |
| T-04-15 | Tampering | passphrase drift across 4 EA files | mitigate | `MRAM_PASSPHRASE` env var forced at bake invocation; P10 mitigation |

**Severity:** LOW-MEDIUM. All mitigations already exist in Phase 3 tooling; this plan EXERCISES them on real content.
</threat_model>

<tasks>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 1: Shannon schedules + prepares the EA re-bake session</name>
  <what-built>Plan 04-01 shipped `--check-audio-coverage`; Plan 04-02 shipped the checklist. The EA dialogue/cipher/voice-cast/styles files already exist on disk. This task confirms Shannon has a bake window and the env is set up.</what-built>
  <how-to-verify>
    1. Confirm the time slot: Phase 4 P7 says this is a ~40-minute cold-cache burn across ~385 lines. RESEARCH.md §P4 recommends starting at night to avoid daytime Gemini quota burn; midnight-Pacific is the reset for preview tier. Pick a session ≥ 1 hour long.
    2. Confirm env vars are set in the current shell:
       ```bash
       echo "GOOGLE_GEMINI_API_KEYS: ${GOOGLE_GEMINI_API_KEYS:0:12}…"   # at least one key; comma-separated pool preferred
       echo "GOOGLE_CLOUD_TTS_API_KEY: ${GOOGLE_CLOUD_TTS_API_KEY:0:12}…"  # short-line route (D-09)
       echo "MRAM_PASSPHRASE: $([ -n "$MRAM_PASSPHRASE" ] && echo set || echo UNSET)"   # must be set; will be reused across all 4 EA files (P10)
       # Optional for faster tier-drop on regressions:
       echo "GEMINI_RETRY_BACKOFF_MS: ${GEMINI_RETRY_BACKOFF_MS:-default}"
       ```
    3. Confirm the EA source files are present and unchanged:
       ```bash
       ls -l rituals/ea-{opening,initiation,explanatory,closing}-{dialogue,dialogue-cipher,voice-cast,styles}.json rituals/ea-{opening,initiation,explanatory,closing}-{dialogue,dialogue-cipher}.md 2>/dev/null | wc -l
       # Expected: 24 (4 rituals × 6 files each: plain.md, cipher.md, voice-cast.json, styles.json, ... no — 4 rituals × 4 files = 16; inspect the real count)
       ```
       Simpler cross-check:
       ```bash
       ls rituals/ea-*-dialogue.md rituals/ea-*-dialogue-cipher.md rituals/ea-*-voice-cast.json rituals/ea-*-styles.json
       ```
    4. Confirm Phase 3 tooling is functional against today's working tree:
       ```bash
       npm run bake-all -- --dry-run 2>&1 | tee /tmp/04-03-dry-run.log
       # Expected: roll-up table for all 4 EA rituals showing lines-total, cache-hit, cache-miss, would-bake-seconds-est.
       # Because we're on v3 cache for the first time, cache-miss should equal lines-total for each EA ritual.
       ```
    5. Confirm the Phase 4 verifier from Plan 04-01 is wired:
       ```bash
       npm run verify-content -- --help 2>&1 | head -10
       # Expected: usage text, exit 0 (or 1 with usage — either is fine, just not a crash)
       ```
    6. Reserve a voice-cast snapshot before baking (paranoia against in-session edits):
       ```bash
       cp rituals/ea-opening-voice-cast.json /tmp/04-03-ea-opening-voice-cast.pre-bake.json
       cp rituals/ea-initiation-voice-cast.json /tmp/04-03-ea-initiation-voice-cast.pre-bake.json
       cp rituals/ea-explanatory-voice-cast.json /tmp/04-03-ea-explanatory-voice-cast.pre-bake.json
       cp rituals/ea-closing-voice-cast.json /tmp/04-03-ea-closing-voice-cast.pre-bake.json
       ```
    7. Confirm no in-flight `_RESUME.json` from a prior Phase 3 bake attempt:
       ```bash
       cat rituals/_bake-cache/_RESUME.json 2>/dev/null || echo "no resume state — clean start"
       ```
       If a prior `_RESUME.json` exists from Phase 3 plan testing, delete it: `rm -f rituals/_bake-cache/_RESUME.json`.
  </how-to-verify>
  <resume-signal>Type `ready` when all env + tooling checks pass. Type `block: {reason}` if anything is missing. Shannon may also type `defer` — plan pauses until the next session.</resume-signal>
</task>

<task type="auto">
  <name>Task 2: Execute the EA v3-cache bake + per-ritual scrub loop</name>
  <files>rituals/ea-opening.mram, rituals/ea-initiation.mram, rituals/ea-explanatory.mram, rituals/ea-closing.mram</files>
  <action>
    This task is the API-burn step. Claude orchestrates; Shannon judges scrubs. Execute bake + scrub for all 4 EA rituals in sequence. Rationale for all-in-one-task: the 4 EA rituals share the same voice-cast role profiles (WM, SW, SD, etc.) — sequential bakes benefit from warm-cache hits on cross-ritual lines (e.g., `"So mote it be"` spoken in opening AND closing; cached after the first).

    **Phase 2a — cold bake (40 min wall-clock expected):**

    1. Start the full cold bake with `--verify-audio` OFF (saves Groq cost; we'll run `--verify-audio` on a single ritual as a smoke test in Task 3):
       ```bash
       MRAM_PASSPHRASE="$MRAM_PASSPHRASE" \
       GOOGLE_GEMINI_API_KEYS="$GOOGLE_GEMINI_API_KEYS" \
       GOOGLE_CLOUD_TTS_API_KEY="$GOOGLE_CLOUD_TTS_API_KEY" \
       npm run bake-all -- --parallel 4 2>&1 | tee /tmp/04-03-bake.log
       ```
       Orchestrator runs `validateOrFail()` on all 4 EA rituals first (pre-render gate, D-08); if any parity issue exists, ABORT — fix the dialogue/cipher pair and restart.

       Expected: ~385 lines render sequentially (per ritual) with p-limit=4 concurrency on API calls. Log shows:
       - per-line `[cache-miss]` or `[routed-via-google]` (D-09 short lines)
       - cumulative progress: `ritual 1/4: ea-opening …`, etc.
       - any `[AUTHOR-06 D-10] duration-anomaly` hard-fails (abort the bake if seen — Shannon diagnoses; see P1)
       - `_RESUME.json` atomic writes every line (D-06)

    2. If Ctrl-C or crash mid-bake:
       ```bash
       npm run bake-all -- --parallel 4 --resume 2>&1 | tee -a /tmp/04-03-bake.log
       ```
       Resume picks up where it left off (Phase 3 D-06).

    3. If duration-anomaly hard-fails on a line:
       - grep voice-cast for the phantom phrase if audible
       - If voice-cast scene is clean: use Tactic escalation per RESEARCH.md §P3 (retry → style-tag shift → speakAs)
       - Invalidate the single line's cache: `npx tsx scripts/invalidate-mram-cache.ts --ritual {slug} --line {lineId}`
       - Re-run bake with `--resume` to pick up just that line.

    **Phase 2b — per-ritual scrub via preview-bake:**

    4. Launch the Phase 3 preview-bake server:
       ```bash
       npm run preview-bake &
       # Expected: listening on http://127.0.0.1:8883 per D-13; AUTHOR-08 D-15 loopback-only guard enforced
       ```

    5. For each EA ritual in sequence (opening → initiation → explanatory → closing):
       - Shannon opens `http://127.0.0.1:8883`, selects the ritual, plays through every baked line.
       - For each issue heard:
         - Voice-cast scene leak (P1) → edit `rituals/ea-{slug}-voice-cast.json` to sanitize the `scene` field; invalidate cache for all preamble-using lines in that ritual: `npx tsx scripts/invalidate-mram-cache.ts --ritual ea-{slug}` (broadest invalidation needed; P1 cost-of-fix).
         - Short-line mispronunciation (P5 residual) → add `speakAs` entry in `rituals/ea-{slug}-styles.json`; invalidate just that line.
         - Text-token regression (P2/P3) → escalate tactics; edit styles file accordingly.
       - Re-bake after edits:
         ```bash
         MRAM_PASSPHRASE="$MRAM_PASSPHRASE" \
         GOOGLE_GEMINI_API_KEYS="$GOOGLE_GEMINI_API_KEYS" \
         GOOGLE_CLOUD_TTS_API_KEY="$GOOGLE_CLOUD_TTS_API_KEY" \
         npm run bake-all -- --parallel 4 2>&1 | tee -a /tmp/04-03-bake.log
         # Only the invalidated lines cache-miss; rest cache-hit; fast (<1 min typically).
         ```
       - When Shannon is satisfied with a ritual, proceed to the next.

    6. Kill the preview server when all 4 rituals scrubbed:
       ```bash
       # ps + kill the npm run preview-bake job
       ```

    **Logging discipline (per RESEARCH.md §Security Domain):**
    - The bake log at `/tmp/04-03-bake.log` contains per-line `lineId` + `role` + cache-hit/miss status. It MAY contain short text samples in error messages. Treat this log as copyright-sensitive; do NOT commit it. Delete after Task 3 completes.
    - NEVER paste the log into any cloud service.

    **What to commit from this task:** nothing. All `.mram` and cache outputs are gitignored. Task 3 does the documentation commit.
  </action>
  <verify>
    <automated>ls -la rituals/ea-opening.mram rituals/ea-initiation.mram rituals/ea-explanatory.mram rituals/ea-closing.mram 2>&1 && stat -c "%y %n" rituals/ea-*.mram 2>&1 | head -4</automated>
  </verify>
  <done>
    All 4 `rituals/ea-*.mram` files exist and are newer than their pre-plan mtimes. Shannon has scrubbed each ritual end-to-end in preview-bake without lingering audio defects. `/tmp/04-03-bake.log` exists (not committed).
  </done>
</task>

<task type="auto">
  <name>Task 3: Run `npm run verify-content` + update checklist + SUMMARY</name>
  <files>.planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md, .planning/phases/04-content-coverage/04-03-SUMMARY.md</files>
  <action>
    1. Run the Phase 4 release gate across the 4 EA rituals only (to avoid prompting for non-EA rituals whose dialogue pair doesn't exist yet):
       ```bash
       # verify-mram per-ritual (Plan 04-01's flag):
       for slug in ea-opening ea-initiation ea-explanatory ea-closing; do
         MRAM_PASSPHRASE="$MRAM_PASSPHRASE" npx tsx scripts/verify-mram.ts "rituals/${slug}.mram" --check-audio-coverage 2>&1 | tee -a /tmp/04-03-verify.log
       done
       echo "exit codes: $?" # must be 0
       ```
       Expected: every ritual prints `=== Audio Coverage ===` with `X/X lines OK` and exits 0. Any failure means Task 2 scrub missed something — return to Task 2.

    2. OPTIONAL: run `--verify-audio` STT round-trip on one EA ritual (smoke check that bake→audio→transcription loop is intact):
       ```bash
       MRAM_PASSPHRASE="$MRAM_PASSPHRASE" GROQ_API_KEY="$GROQ_API_KEY" \
         npm run bake-all -- --parallel 4 --verify-audio 2>&1 | tail -40
       # Warn-only per D-11; a few word-diffs are normal (Whisper mistranscribes; ritual text is unusual). Aim for median ≤ 2-word diffs.
       ```
       If 3+ word diffs dominate: voice-cast scene leak is the usual cause (P1). Address and re-bake.

    3. Update `04-CONTENT-CHECKLIST.md`: for each EA row, set `baked = [x]`, `scrubbed = [x]`, `verified = [x]`, `shipped = [x]`. Update the "Updated:" timestamp at top. Keep the `notes` column — replace `"existing; needs v3-cache re-bake"` with `"re-baked v3 cache <date>"`.

    4. Validate the checklist parser still accepts the updated file:
       ```bash
       npx vitest run --no-coverage scripts/__tests__/content-checklist.test.ts
       # Expected: all 6 tests green (including round-trip)
       ```

    5. Confirm no `.mram` or ritual source files accidentally got staged:
       ```bash
       git status
       git check-ignore rituals/ea-*.mram rituals/_bake-cache/*.opus 2>&1 | wc -l
       # Expected: all listed (matching .gitignore:110-115)
       ```

    6. Delete the bake/verify logs (not committed):
       ```bash
       rm -f /tmp/04-03-bake.log /tmp/04-03-verify.log /tmp/04-03-ea-*-voice-cast.pre-bake.json /tmp/04-03-dry-run.log
       ```

    7. Write `.planning/phases/04-content-coverage/04-03-SUMMARY.md`:
       - Per-ritual: line count, cold-bake wall-clock, API cost estimate (preview-tier = free; count 429s if any), post-scrub line-edit count, final `.mram` file size, `--check-audio-coverage` pass
       - Aggregate: total lines re-baked, total wall-clock, any pitfalls hit (P1/P2/P3/P4/P7), any cache-invalidation used
       - Any deviations (e.g., if Shannon added a new style override per P3, document which lineHash)
       - Commit prefix used: `content-03: ea v3-cache re-bake complete + checklist updated`

    8. Commit the tracked updates:
       ```bash
       git add .planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md .planning/phases/04-content-coverage/04-03-SUMMARY.md
       git commit -m "content-03: ea v3-cache re-bake complete + checklist updated"
       ```
  </action>
  <verify>
    <automated>npx vitest run --no-coverage scripts/__tests__/content-checklist.test.ts && MRAM_PASSPHRASE="$MRAM_PASSPHRASE" npx tsx -e "for (const slug of ['ea-opening','ea-initiation','ea-explanatory','ea-closing']) { const { spawnSync } = await import('node:child_process'); const r = spawnSync('npx', ['tsx','scripts/verify-mram.ts',\`rituals/\${slug}.mram\`,'--check-audio-coverage','--json'], { encoding:'utf8', env: process.env }); console.log(slug, r.status); if (r.status !== 0) { console.error(r.stderr); process.exit(1); } }"</automated>
  </verify>
  <done>
    All 4 EA `.mram` files pass `--check-audio-coverage` (exit 0 each). 4 EA rows in checklist set to shipped=[x]. SUMMARY captures per-ritual metrics. Phase 3 vitest baseline preserved. Git history shows the `content-03` commit; no `.mram` or cache files staged.
  </done>
</task>

</tasks>

<verification>
- [ ] `rituals/ea-opening.mram`, `ea-initiation.mram`, `ea-explanatory.mram`, `ea-closing.mram` exist and are v3-cache (mtime newer than plan start; `--check-audio-coverage` exits 0)
- [ ] All 4 EA rows in `04-CONTENT-CHECKLIST.md` show `shipped = [x]`
- [ ] `04-03-SUMMARY.md` written with per-ritual metrics
- [ ] `npx vitest run --no-coverage scripts/__tests__/content-checklist.test.ts` passes
- [ ] Full vitest suite still green (no regression from plan 04-01/04-02)
- [ ] No `.mram` or `_bake-cache/*.opus` files staged in git
</verification>

<success_criteria>
CONTENT-01 satisfied for the first time under Phase 4 discipline: 4 EA rituals baked with modelId-keyed cache entries, per-line Opus verified, scrubbed for scene-leaks and text-token regressions, tracked in the ledger. The Phase 3 tooling has been exercised end-to-end on real content for the first time — any Phase 4-era tooling defects surface here, not during FC/MM/Installation baking.
</success_criteria>

<output>
`.planning/phases/04-content-coverage/04-03-SUMMARY.md` records per-ritual metrics, API burn, scrub-pass findings, and any deviations. Updated `04-CONTENT-CHECKLIST.md` committed. No ritual content or `.mram` files committed (gitignored by design).
</output>
