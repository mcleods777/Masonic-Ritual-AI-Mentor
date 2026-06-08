---
phase: 04-content-coverage
plan: 04
type: execute
wave: 1
depends_on: [01, 02]
files_modified:
  - rituals/fc-opening-dialogue.md
  - rituals/fc-opening-dialogue-cipher.md
  - rituals/fc-opening-voice-cast.json
  - rituals/fc-opening-styles.json
  - rituals/fc-opening.mram
  - rituals/fc-passing-dialogue.md
  - rituals/fc-passing-dialogue-cipher.md
  - rituals/fc-passing-voice-cast.json
  - rituals/fc-passing-styles.json
  - rituals/fc-passing.mram
  - rituals/fc-middle-chamber-lecture-dialogue.md
  - rituals/fc-middle-chamber-lecture-dialogue-cipher.md
  - rituals/fc-middle-chamber-lecture-voice-cast.json
  - rituals/fc-middle-chamber-lecture-styles.json
  - rituals/fc-middle-chamber-lecture.mram
  - rituals/fc-closing-dialogue.md
  - rituals/fc-closing-dialogue-cipher.md
  - rituals/fc-closing-voice-cast.json
  - rituals/fc-closing-styles.json
  - rituals/fc-closing.mram
  - .planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md
autonomous: false
requirements: [CONTENT-02]
tags: [content, fc-authoring, shannon-labor, fresh-bake]

must_haves:
  truths:
    - "Four FC rituals are authored end-to-end: `fc-opening`, `fc-passing`, `fc-middle-chamber-lecture`, `fc-closing` — each has plain + cipher + voice-cast files on disk, validator-clean, baked, scrubbed, verified, shipped"
    - "Every FC `.mram` passes `npx tsx scripts/verify-mram.ts --check-audio-coverage` (CONTENT-06 satisfied for FC set)"
    - "Each FC ritual's voice-cast reuses the EA role profiles verbatim (per RESEARCH.md §Voice Casting Strategy) — WM, SW, JW, SD, JD, Ch, C all have identical `profile`/`style`/`pacing`/`accent` to `rituals/ea-initiation-voice-cast.json`; only `scene` differs per ritual"
    - "The 4 FC rows in `04-CONTENT-CHECKLIST.md` progress through `[ ]` → `[~]` → `[x]` for every pipeline column"
    - "Cipher/plain parity validator (D-08 bake-band) passes every FC ritual before bake — CONTENT-07 enforced"
  artifacts:
    - path: "rituals/fc-opening-dialogue.md"
      provides: "FC opening plain dialogue; speakers (WM, SW, JW, SD, JD, C) prefixed; frontmatter names jurisdiction + degree + ceremony"
      contains: "jurisdiction: Grand Lodge of Iowa\ndegree: Fellow Craft\nceremony: Fellow Craft Opening"
    - path: "rituals/fc-opening-dialogue-cipher.md"
      provides: "FC opening cipher; structure-identical to plain; word-ratio in 0.5×-2× band per D-08"
    - path: "rituals/fc-opening-voice-cast.json"
      provides: "FC opening voice cast; EA role profiles reused; scene describes lodge-opening atmosphere without naming stations"
      contains: "\"version\": 1, \"scene\": , \"roles\":"
    - path: "rituals/fc-opening.mram"
      provides: "AES-GCM-encrypted FC opening, v3-cache baked, per-line Opus"
    - path: "rituals/fc-passing-dialogue.md"
      provides: "FC passing/initiation plain dialogue — longest FC scene (~180 lines); includes winding-stairs lecture embedded or cross-references fc-middle-chamber-lecture"
    - path: "rituals/fc-passing.mram"
      provides: "AES-GCM-encrypted FC passing ceremony"
    - path: "rituals/fc-middle-chamber-lecture-dialogue.md"
      provides: "Standalone FC middle chamber lecture per EA explanatory precedent"
    - path: "rituals/fc-middle-chamber-lecture.mram"
      provides: "AES-GCM-encrypted middle chamber lecture"
    - path: "rituals/fc-closing-dialogue.md"
      provides: "FC closing plain dialogue — parallel structure to ea-closing"
    - path: "rituals/fc-closing.mram"
      provides: "AES-GCM-encrypted FC closing"
    - path: ".planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md"
      provides: "4 FC rows set to shipped=[x]"
  key_links:
    - from: "rituals/fc-*-voice-cast.json"
      to: "rituals/ea-initiation-voice-cast.json"
      via: "role profiles verbatim reuse (P9 mitigation; also enables cross-ritual cache hits per RESEARCH.md §Voice Casting Strategy)"
      pattern: "\"profile\": .*The Worshipful Master"
    - from: "rituals/fc-*.mram"
      to: "scripts/verify-content.ts"
      via: "release-gate per-ritual acceptance"
      pattern: "verify-content"
    - from: "rituals/fc-passing-dialogue.md"
      to: "rituals/fc-middle-chamber-lecture-dialogue.md"
      via: "scene-split decision: passing ceremony references the middle chamber lecture as a separate rehearsal unit (per EA explanatory precedent)"
      pattern: "middle chamber"
---

<objective>
Author and ship the 4 Fellow Craft rituals (opening, passing, middle chamber lecture, closing) end-to-end: plain dialogue → cipher dialogue → voice-cast (reusing EA role profiles) → validator → bake → scrub → styles edits → re-bake → verify → ship.

Purpose: CONTENT-02 is satisfied only when FC is fully baked in Shannon's lodge's working with per-line Opus verified. This plan covers the single largest authoring load of Phase 4 (~16 Shannon-hours across ~470 spoken lines per RESEARCH.md §Cost + Effort Estimates). Scene split decision: SPLIT `fc-middle-chamber-lecture` into its own `.mram` matching EA's explanatory-lecture precedent — gives finer-grained rehearsal units and smaller `.mram` file sizes.

Output: 4 fresh FC `.mram` files; 4 checklist rows set to shipped=[x]; SUMMARY recording per-ritual metrics and any lodge-working clarifications Shannon made during authoring.

Non-autonomous: the ENTIRE authoring phase of each ritual is human labor — only Shannon writes his lodge's working. Claude runs bakes, verifiers, and documentation.
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
@.planning/phases/03-authoring-throughput/03-06-SUMMARY.md

@rituals/ea-initiation-dialogue.md
@rituals/ea-initiation-dialogue-cipher.md
@rituals/ea-initiation-voice-cast.json
@rituals/ea-initiation-styles.json
@rituals/ea-explanatory-dialogue.md

@scripts/bake-all.ts
@scripts/build-mram-from-dialogue.ts
@scripts/validate-rituals.ts
@scripts/verify-mram.ts
@scripts/verify-content.ts
@scripts/preview-bake.ts
@scripts/list-ritual-lines.ts
@scripts/invalidate-mram-cache.ts
@src/lib/author-validation.ts
@src/lib/dialogue-format.ts
</context>

<per_ritual_pipeline>
Every FC ritual runs the same 9-step pipeline (per RESEARCH.md §Content Authoring Workflow):

1. **Author plain dialogue** — `rituals/{slug}-dialogue.md` with frontmatter (`jurisdiction: Grand Lodge of Iowa`, `degree: Fellow Craft`, `ceremony: {Title}`) + `## CEREMONY: {Title}` section marker + speaker-prefixed lines + bracketed action cues.
2. **Author cipher dialogue** — `rituals/{slug}-dialogue-cipher.md`, structure-identical to plain; word-ratio in 0.5×..2× band per D-08; scripture/prayers left in plain text.
3. **Validate parity** — `npx tsx scripts/validate-rituals.ts` must pass clean before proceeding.
4. **Write voice-cast** — `rituals/{slug}-voice-cast.json`, EA role profiles verbatim for consistency (P9); scene abstract only (P1 — no station/role names).
5. **First bake** — `MRAM_PASSPHRASE="$MRAM_PASSPHRASE" npm run bake-all -- --parallel 4` (validator-first gate runs all rituals; this first bake produces `.mram` for any ready rituals and no-ops for unauthored ones).
6. **Scrub in preview-bake** — `npm run preview-bake`, open `http://127.0.0.1:8883`, play every line.
7. **Styles edits** — add `rituals/{slug}-styles.json` for any speakAs overrides (P2, P5) or style-shifts (P3); invalidate affected line(s) via `npx tsx scripts/invalidate-mram-cache.ts --ritual {slug} --line {lineId}`.
8. **Re-bake** — `npm run bake-all -- --parallel 4` (cache warm; only invalidated lines re-render).
9. **Verify + ship** — `MRAM_PASSPHRASE=... npx tsx scripts/verify-mram.ts rituals/{slug}.mram --check-audio-coverage` exits 0; update checklist row to shipped=[x]; commit `content-04: {slug} {step}-complete`.

Shannon commits atomically AFTER each ritual completes (not after each step within a ritual) — keeps granularity readable in git log without explosion of micro-commits. If an atomic commit per ritual is too coarse (e.g., a scrub pass uncovers an issue requiring dialogue edits), commit at the natural "stable" boundary (post-validator-clean; post-scrub-done).
</per_ritual_pipeline>

<threat_model>
## Trust Boundaries (same as 04-03; new: human-authored dialogue content)

| Boundary | Description |
|----------|-------------|
| Shannon's head → `rituals/*-dialogue.md` | Ritual accuracy depends on Shannon's familiarity with Iowa GL working; no automated check for content fidelity |
| Dialogue source → `.gitignore` | Plain + cipher + voice-cast + styles files MUST stay gitignored |
| `scene` field → baked audio | Preamble leak (P1) is the load-bearing authoring risk |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-04-16 | Tampering | dialogue content wrong vs. Iowa GL working | accept | No automated mitigation possible — Shannon is the authority; dogfood pass in Plan 04-08 is the final guard |
| T-04-17 | Integrity | cipher/plain structure drift | mitigate | `validate-rituals.ts` + bake-all validator-first gate refuse drift per Phase 3 D-08; P6 mitigated |
| T-04-18 | Information Disclosure | dialogue files committed accidentally | mitigate | `git check-ignore rituals/*-dialogue*.md` pre-commit; Task 6 (final) re-asserts |
| T-04-19 | Integrity | voice-cast scene leak into audio (P1) | mitigate | Shannon reviews scene field for station/role names before first bake; anomaly detector (D-10) catches extreme cases; scrub pass (step 6) catches subtler cases |
| T-04-20 | DoS | long bake session burns Gemini quota | accept | P4 mitigated via GOOGLE_GEMINI_API_KEYS pool + night-time scheduling |
| T-04-21 | Integrity | passphrase drift across FC rituals | mitigate | MRAM_PASSPHRASE env var reused across all 4 (P10); single-passphrase invariant |
| T-04-22 | Information Disclosure | SUMMARY file leaks ritual text | mitigate | SUMMARY templates record SHA-256 of dialogue files, line counts, wall-clock — NEVER ritual content. Task 5 SUMMARY template explicitly prohibits including any speaker line body text. |

**Severity:** MEDIUM (copyright-sensitive content authoring). Mitigations are ops-discipline + tooling-assisted, not pure code.
</threat_model>

<tasks>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 1: Shannon authors FC opening (plain + cipher + voice-cast) and runs validator</name>
  <what-built>Plans 04-01..03 shipped the verifier, checklist, and EA baseline. The FC working is Shannon's private authorial content. This task produces the three source files for `fc-opening`; Claude only runs the validator gate after Shannon has drafted.</what-built>
  <how-to-verify>
    Shannon's per-ritual authoring (step-by-step — matches RESEARCH.md §Content Authoring Workflow):

    1. **Plain dialogue** (~1-2 hrs): create `rituals/fc-opening-dialogue.md` from Iowa GL working. Format:
       ```markdown
       ---
       jurisdiction: Grand Lodge of Iowa
       degree: Fellow Craft
       ceremony: Fellow Craft Opening
       ---

       ## CEREMONY: Fellow Craft Opening

       WM: Brethren, be clothed…
       [gavels: 3]
       WM: Brother Senior Warden, are you a Fellow Craft?
       SW: I am, Worshipful Master.
       …
       ```
       - Speaker codes: WM, SW, JW, SD, JD, SS, JS, Ch, C — match existing EA convention (verify no typos — a typo becomes a spurious new role in `verify-mram.ts`'s role breakdown output).
       - Action cues in brackets: `[gavels: 3]`, `[rises]`, `[salute]`.
       - Capitalization: `Worshipful Master`, `Senior Warden`, `In God`, etc. match EA precedent.

    2. **Cipher dialogue** (~0.5-1 hr): create `rituals/fc-opening-dialogue-cipher.md`. Same structure; abbreviate per Iowa GL cipher convention (`Br SW`, `cdt`, `Wh cms hr?` etc.). Scripture/prayers in plain text. Word-ratio must fall within 0.5×..2× of plain per D-08 bake-band.

    3. **Voice-cast** (~15 min): create `rituals/fc-opening-voice-cast.json`:
       ```json
       {
         "version": 1,
         "scene": "<ABSTRACT atmosphere only — NO station names, NO 'officers at their stations', NO role names. P1 mitigation.>",
         "roles": {
           "WM": { <copy EXACTLY from ea-initiation-voice-cast.json> },
           "SW": { <copy EXACTLY from ea-initiation-voice-cast.json> },
           "JW": { <copy EXACTLY from ea-initiation-voice-cast.json> },
           "SD": { <copy EXACTLY from ea-initiation-voice-cast.json> },
           "JD": { <copy EXACTLY from ea-initiation-voice-cast.json if present; else author for this ritual with EA tonal band> },
           "C":  { <copy EXACTLY> }
         }
       }
       ```
       Scene example (good): `"The brethren have settled. Measured pace, attentive — the room is listening for each declared form."`
       Scene example (bad — DO NOT USE): `"Worshipful Master in the East, officers at their stations ready to open the lodge."`  (contains phrases that appear in dialogue → phantom content in baked audio per P1)

    4. **Validate parity**:
       ```bash
       npx tsx scripts/validate-rituals.ts 2>&1 | tee /tmp/04-04-validate.log
       ```
       Expected output: every known ritual (EA + the new fc-opening) validates clean. Any error on fc-opening → fix the cipher or plain file and re-run until clean.

       Also run the validator programmatically through the author-validation module to confirm D-08 bake-band compliance:
       ```bash
       npx tsx -e "
         import { validatePair } from './src/lib/author-validation.ts';
         const fs = await import('node:fs');
         const plain = fs.readFileSync('rituals/fc-opening-dialogue.md','utf8');
         const cipher = fs.readFileSync('rituals/fc-opening-dialogue-cipher.md','utf8');
         const r = validatePair(plain, cipher);
         const errors = r.lineIssues.filter(i => i.severity === 'error');
         console.log('structureOk:', r.structureOk, 'errors:', errors.length);
         if (errors.length) { for (const e of errors) console.error(e); process.exit(1); }
       "
       ```
       Must print `structureOk: true, errors: 0`.

    5. Update `04-CONTENT-CHECKLIST.md`: mark fc-opening row `drafted (plain) = [x]`, `drafted (cipher) = [x]`, `voice-cast = [x]`. Leave `styles = —` for now (may flip to `[x]` after scrub if overrides are added).

    6. Commit: `content-04: fc-opening authored + parity validator clean` — note that the three source files are gitignored; only the checklist update commits.
  </how-to-verify>
  <resume-signal>Type `fc-opening-ready` when validator passes and checklist row updated. Type `block: {reason}` if authoring hit an open question.</resume-signal>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: Shannon authors FC passing + FC middle chamber lecture + runs validator</name>
  <what-built>fc-opening is drafted + validated. This task adds the two harder FC rituals: `fc-passing` (longest, ~180 lines, highest dialogue complexity) and `fc-middle-chamber-lecture` (~60 lines, standalone per EA explanatory precedent).</what-built>
  <how-to-verify>
    Repeat the per-ritual pipeline (steps 1-4 from Task 1) for each of:
    - `fc-passing-dialogue.md` + `fc-passing-dialogue-cipher.md` + `fc-passing-voice-cast.json`
    - `fc-middle-chamber-lecture-dialogue.md` + `fc-middle-chamber-lecture-dialogue-cipher.md` + `fc-middle-chamber-lecture-voice-cast.json`

    Key judgment calls for these two:
    - **Scene split**: The middle chamber lecture exists as a SEPARATE `.mram` per EA explanatory precedent (good for isolated practice). Shannon decides whether fc-passing ALSO contains the lecture verbatim (duplication — practicable as embedded in passing) OR cross-references it with a stage direction like `[candidate receives the middle chamber lecture — see fc-middle-chamber-lecture.mram]` (no duplication — passing ritual simply pauses). Research recommends the latter (cleaner practice units, smaller fc-passing file); Shannon confirms per his lodge's rehearsal pattern.
    - **Voice-cast reuse**: fc-passing and fc-middle-chamber-lecture SHOULD reuse the same role profiles as fc-opening — WM sounds like the same person across all FC rituals. Only `scene` differs. This also enables cross-ritual cache hits (per RESEARCH.md §Voice Casting Strategy).
    - **Long-line regression risk**: fc-passing has the winding stairs lecture — long, densely-worded lines are more susceptible to text-token regression (P3). Pre-emptively, Shannon may add a `style: "measured"` or `style: "formal"` tag to long explanatory passages via the styles file; done at scrub time (Task 4) if issues manifest.

    Run the validator after each ritual is drafted:
    ```bash
    npx tsx scripts/validate-rituals.ts
    ```
    Must pass clean for fc-opening + fc-passing + fc-middle-chamber-lecture. EA rituals still pass.

    Update checklist: fc-passing + fc-middle-chamber-lecture rows → `drafted (plain) = [x], drafted (cipher) = [x], voice-cast = [x]`.

    Commit: `content-04: fc-passing + fc-middle-chamber-lecture authored + parity validator clean`.
  </how-to-verify>
  <resume-signal>Type `fc-authoring-midway-ready` when both rituals validate clean. Type `block: {reason}` on lodge-working clarification needs.</resume-signal>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3: Shannon authors FC closing + runs validator</name>
  <what-built>3 of 4 FC rituals drafted. This task completes the FC source files with `fc-closing` (parallel structure to ea-closing; ~100 lines).</what-built>
  <how-to-verify>
    Same per-ritual pipeline for `fc-closing`. Its structure is near-parallel to ea-closing (same closing-formulaic speaker pattern) — Shannon can use ea-closing-dialogue.md as a structural template (line-ordering, speaker sequence, gavels pattern) while substituting FC-specific text.

    Validator pass:
    ```bash
    npx tsx scripts/validate-rituals.ts
    ```
    All 4 FC rituals + all 4 EA rituals pass clean.

    Update checklist: fc-closing row → drafted/voice-cast columns marked.

    Commit: `content-04: fc-closing authored + all FC parity-clean`.
  </how-to-verify>
  <resume-signal>Type `fc-authoring-complete` when all 4 FC rituals validate clean.</resume-signal>
</task>

<task type="auto">
  <name>Task 4: Run cold FC bake + scrub all 4 FC rituals</name>
  <files>rituals/fc-opening.mram, rituals/fc-passing.mram, rituals/fc-middle-chamber-lecture.mram, rituals/fc-closing.mram, rituals/fc-*-styles.json</files>
  <action>
    Cold FC bake (~470 lines × ~6s fresh ≈ ~47 min wall-clock on serial; ~25-35 min with --parallel 4 and warm cross-ritual hits):

    1. Pre-flight:
       ```bash
       [ -n "$MRAM_PASSPHRASE" ] || { echo "MRAM_PASSPHRASE unset"; exit 1; }
       npm run bake-all -- --dry-run 2>&1 | tee /tmp/04-04-dry-run.log
       # Expected: table shows lines-total for fc-opening, fc-passing, fc-middle-chamber-lecture, fc-closing; cache-miss ≈ lines-total (fresh authoring = cold cache)
       ```

    2. Cold bake:
       ```bash
       MRAM_PASSPHRASE="$MRAM_PASSPHRASE" \
       GOOGLE_GEMINI_API_KEYS="$GOOGLE_GEMINI_API_KEYS" \
       GOOGLE_CLOUD_TTS_API_KEY="$GOOGLE_CLOUD_TTS_API_KEY" \
       npm run bake-all -- --parallel 4 2>&1 | tee /tmp/04-04-bake.log
       ```
       Orchestrator runs validator on ALL rituals first (both EA and FC); then spawns per-ritual build-mram.
       Expected per-line log lines; `_RESUME.json` written atomically.
       Ctrl-C is safe — `--resume` picks up cleanly (Phase 3 D-06).

    3. Handle bake failures:
       - Duration-anomaly hard-fail (D-10) → grep voice-cast scene field for the phantom phrase; if scene has leak words → edit voice-cast → `npx tsx scripts/invalidate-mram-cache.ts --ritual {slug}` → re-bake with `--resume`.
       - Text-token regression (P3) on medium line → escalate Tactics 1→2→3; speakAs in styles JSON is the proper fix.
       - Short-line (<5 char) regression → already auto-routed to Google Cloud TTS per D-09; if mispronunciation, add speakAs per P5.

    4. Launch preview-bake:
       ```bash
       npm run preview-bake &
       sleep 2 && echo "preview at http://127.0.0.1:8883"
       ```

    5. Shannon scrubs each FC ritual end-to-end. For each audio defect heard:
       - **Phantom content (P1)**: grep scene field first; if scene has leak, sanitize + invalidate ritual-wide; re-bake.
       - **Letter-exchange mispronunciation (P5)**: add speakAs to styles JSON:
         ```json
         {"lineHash": "<sha256 of plain>", "style": "formal", "speakAs": "Say only this single letter name, nothing else: Bee"}
         ```
         Find lineHash: `npx tsx scripts/list-ritual-lines.ts --grep "B\\." fc-passing`.
       - **Text-token regression (P3)**: style shift first; speakAs second.
       - Invalidate affected line(s): `npx tsx scripts/invalidate-mram-cache.ts --ritual {slug} --line {lineId}`.
       - Re-bake: `npm run bake-all -- --parallel 4` (cache warm; fast).
       - Scrub again.

    6. Kill preview-bake when all 4 FC rituals scrub-clean.

    7. Update checklist: 4 FC rows → `baked = [x], scrubbed = [x]`. Styles column: `[x]` if a styles.json was created for that ritual, `—` if none needed.

    8. Commit: `content-04: fc cold bake + scrub complete`.

    **Do NOT commit**: any `rituals/fc-*.{md,json,mram}` or `rituals/_bake-cache/` content (all gitignored). Git status should show ONLY checklist + SUMMARY changes.
  </action>
  <verify>
    <automated>ls -la rituals/fc-opening.mram rituals/fc-passing.mram rituals/fc-middle-chamber-lecture.mram rituals/fc-closing.mram && git status --porcelain | grep -vE '^\?\?' | grep -E 'rituals/fc-' && echo "FAIL: FC files staged" || echo "OK: no FC source/mram staged"</automated>
  </verify>
  <done>All 4 FC `.mram` files exist; Shannon judges each ritual scrubs clean; git staging does NOT include any `rituals/fc-*` files.</done>
</task>

<task type="auto">
  <name>Task 5: Verify all 4 FC rituals + update checklist + SUMMARY</name>
  <files>.planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md, .planning/phases/04-content-coverage/04-04-SUMMARY.md</files>
  <action>
    1. Run per-FC-ritual verifier:
       ```bash
       for slug in fc-opening fc-passing fc-middle-chamber-lecture fc-closing; do
         MRAM_PASSPHRASE="$MRAM_PASSPHRASE" npx tsx scripts/verify-mram.ts "rituals/${slug}.mram" --check-audio-coverage 2>&1 | tee -a /tmp/04-04-verify.log
         echo "=== $slug exit: $? ==="
       done
       ```
       Every ritual MUST exit 0. Any failure → return to Task 4 scrub.

    2. OPTIONAL STT round-trip on one FC ritual:
       ```bash
       MRAM_PASSPHRASE="$MRAM_PASSPHRASE" GROQ_API_KEY="$GROQ_API_KEY" \
         npm run bake-all -- --parallel 4 --verify-audio 2>&1 | tail -60
       # Warn-only; aim for median ≤ 2-word diffs. Investigate rituals with >3-word diffs (P1 usually).
       ```

    3. Update `04-CONTENT-CHECKLIST.md`: 4 FC rows → `verified = [x], shipped = [x]`. Notes column: `"baked fresh <date>; passed verify-content"`.

    4. Round-trip checklist parser test:
       ```bash
       npx vitest run --no-coverage scripts/__tests__/content-checklist.test.ts
       ```

    5. Full suite:
       ```bash
       npx vitest run --no-coverage 2>&1 | tail -3
       ```

    6. Confirm no content files staged:
       ```bash
       git status --porcelain | awk '{print $2}' | grep -E '^rituals/' && echo "FAIL" || echo "OK: no rituals staged"
       git check-ignore rituals/fc-*.mram rituals/fc-*-dialogue*.md rituals/fc-*-voice-cast.json rituals/_bake-cache/*.opus 2>&1 | wc -l
       ```

    7. Write `.planning/phases/04-content-coverage/04-04-SUMMARY.md` per-ritual:
       - For each of fc-opening / fc-passing / fc-middle-chamber-lecture / fc-closing:
         - Line count (spoken + action)
         - Cold bake wall-clock
         - Pitfalls hit (P1/P2/P3/P4/P5 with line counts)
         - Styles.json overrides added (count + lineHash prefix only — NEVER ritual text)
         - Final `.mram` file size
         - `--check-audio-coverage` pass
       - Aggregate: total FC lines, total Shannon-hours (rough self-report), total API wall-clock
       - Lodge-working clarifications documented (e.g., "confirmed middle chamber lecture is standalone per Iowa GL precedent")
       - SHA-256 of each dialogue + cipher file for audit trail (NOT the text itself):
         ```bash
         for f in rituals/fc-*-dialogue.md rituals/fc-*-dialogue-cipher.md; do sha256sum "$f"; done
         ```
       - Commit prefix: `content-04: fc phase complete + checklist updated`

    8. Delete logs:
       ```bash
       rm -f /tmp/04-04-bake.log /tmp/04-04-verify.log /tmp/04-04-dry-run.log /tmp/04-04-validate.log
       ```

    9. Commit:
       ```bash
       git add .planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md .planning/phases/04-content-coverage/04-04-SUMMARY.md
       git commit -m "content-04: fc phase complete + checklist updated"
       ```
  </action>
  <verify>
    <automated>npx vitest run --no-coverage scripts/__tests__/content-checklist.test.ts && MRAM_PASSPHRASE="$MRAM_PASSPHRASE" npx tsx -e "for (const slug of ['fc-opening','fc-passing','fc-middle-chamber-lecture','fc-closing']) { const { spawnSync } = await import('node:child_process'); const r = spawnSync('npx', ['tsx','scripts/verify-mram.ts',\`rituals/\${slug}.mram\`,'--check-audio-coverage','--json'], { encoding:'utf8', env: process.env }); console.log(slug, r.status); if (r.status !== 0) process.exit(1); }"</automated>
  </verify>
  <done>All 4 FC `.mram` files pass `--check-audio-coverage`. Checklist shows 4 FC rows shipped=[x]. SUMMARY file written. No rituals staged in git. Phase 3 baseline preserved.</done>
</task>

</tasks>

<verification>
- [ ] `rituals/fc-opening.mram`, `fc-passing.mram`, `fc-middle-chamber-lecture.mram`, `fc-closing.mram` exist with v3-cache baked Opus
- [ ] All 4 FC rows in `04-CONTENT-CHECKLIST.md` show `shipped = [x]`
- [ ] `04-04-SUMMARY.md` committed with per-ritual metrics + SHA-256 hashes
- [ ] No `rituals/fc-*` files committed to git
- [ ] Full vitest suite still green
</verification>

<success_criteria>
CONTENT-02 satisfied: all four FC rituals baked in Shannon's lodge's working; per-line Opus verified; scrubbed for scene-leaks and regressions; tracked in the ledger. FC is the largest single authoring plan in Phase 4; completing it validates the per-ritual pipeline for MM + Installation + Lectures.
</success_criteria>

<output>
`.planning/phases/04-content-coverage/04-04-SUMMARY.md` with per-ritual metrics, pitfall-hit counts, SHA-256s of dialogue sources, lodge-working clarifications, and wall-clock totals. Checklist committed.
</output>
