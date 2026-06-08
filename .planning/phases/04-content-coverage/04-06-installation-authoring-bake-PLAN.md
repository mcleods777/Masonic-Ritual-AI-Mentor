---
phase: 04-content-coverage
plan: 06
type: execute
wave: 1
depends_on: [01, 02]
files_modified:
  - rituals/installation-dialogue.md
  - rituals/installation-dialogue-cipher.md
  - rituals/installation-voice-cast.json
  - rituals/installation-styles.json
  - rituals/installation.mram
  - .planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md
autonomous: false
requirements: [CONTENT-04]
tags: [content, installation, shannon-labor, long-ritual]

must_haves:
  truths:
    - "`rituals/installation.mram` exists — the annual officer installation ceremony baked under v3 cache"
    - "The installation ritual is authored as a SINGLE file (per CONTENT-04 wording: 'ceremony', not 'ceremonies'); the sequential per-officer installation beats live as sections within one dialogue"
    - "`installation.mram` passes `--check-audio-coverage` (CONTENT-06)"
    - "Voice-cast covers every officer role the installation inducts (WM, SW, JW, Ch, Sec, Treas, SD, JD, SS, JS, Tiler) — one voice-cast JSON; role profiles reused verbatim from EA/FC/MM where overlap exists"
    - "Installation row in `04-CONTENT-CHECKLIST.md` set to shipped=[x]"
  artifacts:
    - path: "rituals/installation-dialogue.md"
      provides: "Annual officer installation plain dialogue; ~250 lines; multiple sections — one per officer being installed"
      contains: "## CEREMONY: Annual Officer Installation"
    - path: "rituals/installation-dialogue-cipher.md"
      provides: "Installation cipher; structure-identical; word-ratio in 0.5×..2× band per D-08"
    - path: "rituals/installation-voice-cast.json"
      provides: "Installation voice cast; every officer role present; scene abstract (P1)"
    - path: "rituals/installation.mram"
      provides: "AES-GCM-encrypted installation ritual, per-line Opus"
    - path: ".planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md"
      provides: "Installation row set to shipped=[x]"
  key_links:
    - from: "rituals/installation-dialogue.md"
      to: "rituals/installation-voice-cast.json"
      via: "every speaker role in dialogue MUST appear as a key in voice-cast.roles (validator catches missing roles)"
      pattern: "\"roles\":"
    - from: "rituals/installation.mram"
      to: "scripts/verify-content.ts"
      via: "release-gate acceptance"
      pattern: "verify-content"
---

<objective>
Author and ship the annual officer installation ceremony as a single `.mram` file. Installation is the longest ritual in Phase 4 (~250 lines per RESEARCH.md estimate; real Iowa GL installation may run longer). It's authored as a single `.mram` rather than split per officer — rationale below.

Purpose: CONTENT-04 ("Annual officer installation ceremony baked") requires one shippable installation ritual Shannon's invited WMs can rehearse. Keeping it as one file matches the natural rehearsal unit (the whole ceremony is rehearsed together in real lodge practice) and the CONTENT-04 singular "ceremony" wording.

**Single-file vs scene-split decision**: UNLIKE fc-passing (which split the middle chamber lecture) and mm-raising (which split the Hiramic legend), installation is NOT split. Rationale:
1. A WM rehearsing installation needs to practice transitions between consecutive officer charges; scene-splitting would hide those transitions.
2. Each individual officer-charge is short (~15-30 lines); splitting 9-11 officer inductions into 9-11 `.mram` files trades rehearsal coherence for tooling friction.
3. CONTENT-04 wording ("Annual officer installation ceremony") explicitly singular.
4. `.mram` file size is acceptable: 250 lines × ~35KB/line audio = ~9 MB; within the existing EA-initiation file-size envelope.

Output: 1 `installation.mram` + source files; installation row in checklist shipped=[x]; SUMMARY recording per-section (per-officer) metrics.

Non-autonomous: authoring is Shannon-labor.
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

@rituals/ea-initiation-dialogue.md
@rituals/ea-initiation-voice-cast.json
@rituals/ea-initiation-styles.json

@scripts/bake-all.ts
@scripts/validate-rituals.ts
@scripts/verify-mram.ts
@scripts/verify-content.ts
@scripts/preview-bake.ts
@src/lib/author-validation.ts
</context>

<threat_model>
## Trust Boundaries (same family as 04-04/05; new: per-section structure)

| Boundary | Description |
|----------|-------------|
| Multi-section dialogue → section-header convention | Installation has ~9-11 sections (one per officer installed); section IDs must follow `## CEREMONY:` / `### SECTION:` convention enforced by `src/lib/dialogue-format.ts` |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-04-29 | Integrity | section-header drift breaks verify-mram's section breakdown | mitigate | Shannon uses `### SECTION: {Officer}` convention; validator + verify-mram expose section count as a pass/fail signal |
| T-04-30 | DoS | ~250-line cold bake exhausts Gemini quota | mitigate | Night-time scheduling; key-pool rotation; `--resume` on Ctrl-C |
| T-04-31 | Integrity | hash collision on repeated formulaic text ("So mote it be" recurring per-officer) | mitigate | P3 hash-collision trap acknowledged; if a specific instance needs a style override, use `invalidate-mram-cache.ts --lines=<id>` rather than a styles entry |
| T-04-32 | Tampering | installation text wrong vs. Iowa GL working | accept | Shannon-authority; dogfood in Plan 04-08 |
| T-04-33 | Information Disclosure | committing installation source | mitigate | gitignore covers; Task 3 re-checks |

**Severity:** MEDIUM.
</threat_model>

<tasks>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 1: Shannon authors installation (plain + cipher + voice-cast) + validator</name>
  <what-built>Single installation ritual covering all officer induction beats in sequence. Shannon's longest single-file authoring task in Phase 4 (~6-8 hrs estimated per RESEARCH.md §Cost + Effort Estimates).</what-built>
  <how-to-verify>
    1. **Plain dialogue** (~3-4 hrs):
       Create `rituals/installation-dialogue.md` with sectioned structure — one section per officer. Suggested section layout:
       ```markdown
       ---
       jurisdiction: Grand Lodge of Iowa
       degree: Installation
       ceremony: Annual Officer Installation
       ---

       ## CEREMONY: Annual Officer Installation

       ### SECTION: Opening of Installation

       {convocation; installing officer's proclamation}

       ### SECTION: Installation of the Worshipful Master

       {WM charge; obligation; investiture}

       ### SECTION: Installation of the Senior Warden

       {SW charge; investiture}

       ### SECTION: Installation of the Junior Warden
       …
       ### SECTION: Installation of the Treasurer
       ### SECTION: Installation of the Secretary
       ### SECTION: Installation of the Chaplain
       ### SECTION: Installation of the Senior Deacon
       ### SECTION: Installation of the Junior Deacon
       ### SECTION: Installation of the Senior Steward
       ### SECTION: Installation of the Junior Steward
       ### SECTION: Installation of the Tiler

       ### SECTION: Closing of Installation

       {proclamation of installed officers; benediction}
       ```
       - Speaker roles: Installing Officer (IO), Grand Chaplain (Ch), incoming officers (WM, SW, JW, etc.), ALL for collective responses, C for candidate (the installing-line "I do" beats).
       - Include `[invests with jewel]`, `[presents gavel]`, `[conducts to station]` action cues.
       - Shannon's lodge may deviate from the 10-officer structure above — use whatever inductions Iowa GL includes.

    2. **Cipher dialogue** (~1.5-2 hrs):
       Create `rituals/installation-dialogue-cipher.md`. Same sections, same speakers, same action cues. Word-ratio 0.5×..2× per D-08. For scripture/prayer sections (invocation and benediction), leave in plain text per the EA explanatory precedent.

    3. **Voice-cast** (~30 min):
       Create `rituals/installation-voice-cast.json`. Roles to include:
       - `IO` — Installing Officer (senior Past Master; weighty, ceremonial voice — adapt EA "WM" profile)
       - `WM`, `SW`, `JW`, `Ch`, `Sec`, `Treas`, `SD`, `JD`, `SS`, `JS`, `Tiler` — all officers being installed
       - `C` — candidate (being installed; accepts obligations)
       - `ALL` — collective responses
       Reuse existing EA/FC/MM role profiles verbatim where overlap exists; author fresh profiles for IO + officer roles not used in other rituals.

       Scene (P1-abstract): `"A formal, ceremonial moment. The room is full; attention is ritualized, each phrase declared plainly. Pace is measured — this is annual, load-bearing work."`

    4. **Validate parity**:
       ```bash
       npx tsx scripts/validate-rituals.ts
       # All known rituals including installation pass clean.
       ```
       Programmatic D-08 bake-band check:
       ```bash
       npx tsx -e "
         import { validatePair } from './src/lib/author-validation.ts';
         const fs = await import('node:fs');
         const plain = fs.readFileSync('rituals/installation-dialogue.md','utf8');
         const cipher = fs.readFileSync('rituals/installation-dialogue-cipher.md','utf8');
         const r = validatePair(plain, cipher);
         const errors = r.lineIssues.filter(i => i.severity === 'error');
         console.log('structureOk:', r.structureOk, 'sections:', r.counts.sections, 'spokenLines:', r.counts.spokenLines, 'errors:', errors.length);
         if (errors.length) { for (const e of errors) console.error(e); process.exit(1); }
       "
       ```
       Must print `structureOk: true, errors: 0`. Sections count should be ≥10 if Shannon includes all officer inductions.

    5. **Update checklist**: installation row → drafted/voice-cast columns.

    6. Commit: `content-06: installation authored + validator clean (sections=N, lines=M)`.
  </how-to-verify>
  <resume-signal>Type `installation-ready` when validator clean. Type `block: {reason}` if lodge-working question.</resume-signal>
</task>

<task type="auto">
  <name>Task 2: Cold bake installation + scrub</name>
  <files>rituals/installation.mram, rituals/installation-styles.json</files>
  <action>
    Cold bake (~250 lines × ~6s ≈ ~25 min serial, ~15-20 min with --parallel 4).

    1. Pre-flight:
       ```bash
       [ -n "$MRAM_PASSPHRASE" ] || { echo "MRAM_PASSPHRASE unset"; exit 1; }
       npm run bake-all -- --dry-run 2>&1 | tee /tmp/04-06-dry-run.log
       # Expected: installation shows cache-miss ≈ lines-total
       ```

    2. Cold bake:
       ```bash
       MRAM_PASSPHRASE="$MRAM_PASSPHRASE" \
       GOOGLE_GEMINI_API_KEYS="$GOOGLE_GEMINI_API_KEYS" \
       GOOGLE_CLOUD_TTS_API_KEY="$GOOGLE_CLOUD_TTS_API_KEY" \
       GEMINI_RETRY_BACKOFF_MS="3000,5000" \
       npm run bake-all -- --parallel 4 2>&1 | tee /tmp/04-06-bake.log
       ```
       Same resume + hard-fail handling as 04-04/05.

    3. Scrub in preview-bake:
       ```bash
       npm run preview-bake &
       ```
       Shannon scrubs each section in order. Key listening points:
       - **Officer-role voice consistency**: every officer installation beat should sound like the officer who will occupy the station — SW should sound like SW did in EA/FC/MM. If voice drift, check voice-cast role profiles match.
       - **Installing Officer voice distinction**: IO is typically a senior Past Master; the voice should carry more ceremonial weight than any single current officer. Adjust IO profile if needed; invalidate IO's cache entries and re-bake.
       - **Repeated formulaic text (P3 hash-collision trap)**: lines like `"So mote it be"` appear many times. If one instance needs a style override, use `invalidate-mram-cache.ts --lines=<id>` per P3 — NOT a styles entry (which would apply to the first occurrence only).

    4. Handle defects per P1/P2/P3/P5; invalidate + re-bake.

    5. Update checklist: installation row → baked=[x], scrubbed=[x], styles=[x]-or-`—`.

    6. Commit: `content-06: installation cold bake + scrub complete`.
  </action>
  <verify>
    <automated>ls -la rituals/installation.mram && git status --porcelain | awk '{print $2}' | grep -E '^rituals/installation' && echo "FAIL: installation files staged" || echo "OK: no installation source/mram staged"</automated>
  </verify>
  <done>`rituals/installation.mram` exists, post-scrub. No installation source files or mram staged in git.</done>
</task>

<task type="auto">
  <name>Task 3: Verify installation + update checklist + SUMMARY</name>
  <files>.planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md, .planning/phases/04-content-coverage/04-06-SUMMARY.md</files>
  <action>
    1. Run verifier:
       ```bash
       MRAM_PASSPHRASE="$MRAM_PASSPHRASE" npx tsx scripts/verify-mram.ts rituals/installation.mram --check-audio-coverage 2>&1 | tee /tmp/04-06-verify.log
       # Must exit 0. Also inspect section breakdown — number of sections should match what Shannon authored.
       ```

    2. Update `04-CONTENT-CHECKLIST.md`: installation row → verified=[x], shipped=[x].

    3. Parser round-trip:
       ```bash
       npx vitest run --no-coverage scripts/__tests__/content-checklist.test.ts
       ```

    4. Confirm gitignore discipline:
       ```bash
       git status --porcelain | awk '{print $2}' | grep -E '^rituals/installation' && echo "FAIL" || echo "OK"
       ```

    5. Write `04-06-SUMMARY.md`:
       - Section count (number of officer inductions Shannon included)
       - Per-section line count
       - Cold bake wall-clock
       - Pitfalls hit (counts by kind)
       - Styles.json lineHash prefixes if any
       - `.mram` file size
       - Verifier pass
       - Lodge-working notes (which officers inducted; any deviations from the suggested 10-officer structure)
       - SHA-256 of dialogue + cipher + voice-cast files
       - Commit prefix: `content-06: installation phase complete + checklist updated`

    6. Delete logs; commit tracked updates.
  </action>
  <verify>
    <automated>npx vitest run --no-coverage scripts/__tests__/content-checklist.test.ts && MRAM_PASSPHRASE="$MRAM_PASSPHRASE" npx tsx scripts/verify-mram.ts rituals/installation.mram --check-audio-coverage --json 2>&1 | grep -E '"failures":\[\]|"linesWithAudio"'</automated>
  </verify>
  <done>`installation.mram` passes `--check-audio-coverage`. Checklist row shows shipped=[x]. SUMMARY written. No source files committed. Phase 3 baseline preserved.</done>
</task>

</tasks>

<verification>
- [ ] `rituals/installation.mram` exists + passes `--check-audio-coverage`
- [ ] Installation row in checklist shows shipped=[x]
- [ ] `04-06-SUMMARY.md` committed with section count, SHA-256s, lodge-working notes
- [ ] No rituals/installation* files committed
- [ ] Full vitest suite green
</verification>

<success_criteria>
CONTENT-04 satisfied: the annual officer installation ceremony is baked, verified, shipped as a single `.mram`. An invited WM can rehearse installing his entire officer line in sequence without needing any separate file.
</success_criteria>

<output>
`04-06-SUMMARY.md` recording section structure, per-section metrics, pitfalls, lodge-working specifics.
</output>
