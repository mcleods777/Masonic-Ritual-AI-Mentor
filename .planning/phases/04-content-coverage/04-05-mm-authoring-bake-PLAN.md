---
phase: 04-content-coverage
plan: 05
type: execute
wave: 1
depends_on: [01, 02]
files_modified:
  - rituals/mm-opening-dialogue.md
  - rituals/mm-opening-dialogue-cipher.md
  - rituals/mm-opening-voice-cast.json
  - rituals/mm-opening-styles.json
  - rituals/mm-opening.mram
  - rituals/mm-raising-dialogue.md
  - rituals/mm-raising-dialogue-cipher.md
  - rituals/mm-raising-voice-cast.json
  - rituals/mm-raising-styles.json
  - rituals/mm-raising.mram
  - rituals/mm-hiramic-legend-dialogue.md
  - rituals/mm-hiramic-legend-dialogue-cipher.md
  - rituals/mm-hiramic-legend-voice-cast.json
  - rituals/mm-hiramic-legend-styles.json
  - rituals/mm-hiramic-legend.mram
  - rituals/mm-closing-dialogue.md
  - rituals/mm-closing-dialogue-cipher.md
  - rituals/mm-closing-voice-cast.json
  - rituals/mm-closing-styles.json
  - rituals/mm-closing.mram
  - .planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md
autonomous: false
requirements: [CONTENT-03]
tags: [content, mm-authoring, shannon-labor, fresh-bake, hiramic-legend]

must_haves:
  truths:
    - "Four MM rituals are authored end-to-end: `mm-opening`, `mm-raising`, `mm-hiramic-legend`, `mm-closing` — each has plain + cipher + voice-cast files, validator-clean, baked, scrubbed, verified, shipped"
    - "`mm-raising` is the longest ritual in Phase 4 (~220 lines per RESEARCH.md) — the Hiramic legend is SPLIT into its own `mm-hiramic-legend.mram` (parallel to fc-middle-chamber-lecture split) for standalone practice"
    - "Every MM `.mram` passes `--check-audio-coverage` (CONTENT-06)"
    - "MM voice-cast role profiles reuse EA/FC profiles verbatim — WM/SW/JW/SD/JD sound identical across all three degrees"
    - "4 MM rows in `04-CONTENT-CHECKLIST.md` set to shipped=[x]"
  artifacts:
    - path: "rituals/mm-opening.mram"
      provides: "MM opening ceremony baked under v3 cache"
    - path: "rituals/mm-raising.mram"
      provides: "MM raising (third-degree initiation); longest single-file ritual in Phase 4"
    - path: "rituals/mm-hiramic-legend.mram"
      provides: "Hiramic legend as standalone practice unit; emotionally heavy content"
    - path: "rituals/mm-closing.mram"
      provides: "MM closing ceremony"
    - path: ".planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md"
      provides: "4 MM rows set to shipped=[x]"
  key_links:
    - from: "rituals/mm-raising-dialogue.md"
      to: "rituals/mm-hiramic-legend-dialogue.md"
      via: "stage-direction cross-reference at the point the legend is delivered (scene-split decision matching fc-passing → fc-middle-chamber-lecture precedent)"
      pattern: "hiramic legend"
    - from: "rituals/mm-*-voice-cast.json"
      to: "rituals/ea-initiation-voice-cast.json"
      via: "role profile verbatim reuse for cross-degree tonal consistency (P9)"
      pattern: "\"profile\":"
---

<objective>
Author and ship the 4 Master Mason rituals (opening, raising, hiramic-legend, closing). MM is the most complex degree in the craft lodge; `mm-raising` is the longest ritual in Phase 4 at ~220 spoken lines. The Hiramic legend is split into its own `.mram` per the EA explanatory and FC middle chamber precedent — gives finer rehearsal granularity and isolates the emotionally heaviest content.

Purpose: CONTENT-03 ("MM degree baked — cipher + plain + audio + voice cast") requires all four MM rituals shipped in Shannon's lodge's working with per-line Opus verified.

Output: 4 MM `.mram` files; 4 checklist rows set to shipped=[x]; SUMMARY with per-ritual metrics.

Non-autonomous: authoring is Shannon-labor; Claude orchestrates bakes, verifiers, documentation.
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
@rituals/ea-explanatory-dialogue.md

@scripts/bake-all.ts
@scripts/validate-rituals.ts
@scripts/verify-mram.ts
@scripts/verify-content.ts
@scripts/preview-bake.ts
@scripts/list-ritual-lines.ts
@scripts/invalidate-mram-cache.ts
@src/lib/author-validation.ts
</context>

<per_ritual_pipeline>
Same 9-step pipeline as 04-04 (plain → cipher → voice-cast → validator → first bake → scrub → styles → re-bake → verify). See RESEARCH.md §Content Authoring Workflow for canonical steps.

**MM-specific considerations:**
- `mm-raising` (~220 lines) is the longest single-file ritual. Cold bake alone is ~22 min wall-clock; add ~1-2 hrs for Shannon's authoring per RESEARCH.md. Budget this as the bottleneck task in this plan.
- `mm-hiramic-legend` is emotionally charged content. Voice-cast `scene` should reflect this (e.g., `"The room has gone still. Low light. Every line lands with weight."`) — but still P1-abstract (no station/role names).
- The raising ceremony has a dramatic arc (candidate raised from symbolic death). Voice-cast may use per-role style shifts at specific beats; these land in `mm-raising-styles.json` at Task 4 scrub time.
- **Cross-ritual cache hits**: MM opening shares formulaic lines with EA/FC openings (identical speaker patterns for some declarations). With verbatim role-profile reuse, Gemini cache hits on cross-ritual repeated text — reduces API spend.
</per_ritual_pipeline>

<threat_model>
## Trust Boundaries (same family as 04-04)

| Boundary | Description |
|----------|-------------|
| Shannon's head → mm-*-dialogue.md | Content fidelity to Iowa GL MM working is Shannon-authority |
| mm-raising's length → bake session duration | Single ~22-min API burn; requires scheduled window |
| Hiramic legend emotional content → voice-cast scene | Abstract-atmosphere rule (P1) still applies; resist describing the legend's narrative in the scene field |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-04-23 | Tampering | content fidelity to Iowa GL MM working | accept | Shannon-authority; dogfood pass in Plan 04-08 is final guard |
| T-04-24 | Integrity | cipher/plain structure drift | mitigate | validate-rituals.ts + D-08 bake-band (same as 04-04) |
| T-04-25 | Information Disclosure | committing MM dialogue files | mitigate | `.gitignore:110-115` covers; Task 5 re-asserts |
| T-04-26 | Integrity | voice-cast scene leak on emotional mm-raising lines | mitigate | Task 4 scrub listens specifically for narrative-phrase leakage (P1 amplified on dramatic content) |
| T-04-27 | DoS | mm-raising cold bake exhausts Gemini daily quota mid-session | mitigate | Bake at night (P4 midnight-PT reset); GOOGLE_GEMINI_API_KEYS pool rotation |
| T-04-28 | Integrity | hash-collision on repeated `"So mote it be"` styles entry | mitigate | P3 hash-collision trap — if a style is needed on a specific instance, use `invalidate-mram-cache.ts --lines=<id>` rather than a styles entry (styles entries key on sha256(plain) and apply to the FIRST occurrence only) |

**Severity:** MEDIUM — same as 04-04.
</threat_model>

<tasks>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 1: Shannon authors MM opening + MM closing + validator</name>
  <what-built>Start with the shorter MM rituals (opening ~140 lines, closing ~100 lines) — these are structurally parallel to EA/FC opening and closing, so authoring is faster and lets Shannon warm up on MM-specific cipher conventions before the raising ceremony.</what-built>
  <how-to-verify>
    Per-ritual pipeline (steps 1-4 from 04-04 Task 1) for:
    - `rituals/mm-opening-dialogue.md` + cipher + voice-cast
    - `rituals/mm-closing-dialogue.md` + cipher + voice-cast

    Voice-cast MUST reuse EA role profiles (verbatim `profile`/`style`/`pacing`/`accent` per role from `rituals/ea-initiation-voice-cast.json`); only `scene` differs per ritual. Mm-opening scene suggestion: `"The brethren assemble for the third degree's opening; attention is high — this is the degree that opens last and sets the weightiest tone."` (abstract; P1-safe).

    Validator gate:
    ```bash
    npx tsx scripts/validate-rituals.ts
    ```
    All known rituals (EA + FC + mm-opening + mm-closing) must pass.

    Author-validation programmatic check per ritual (same snippet from 04-04 Task 1).

    Update checklist: mm-opening + mm-closing rows → drafted/voice-cast columns.

    Commit: `content-05: mm-opening + mm-closing authored + validator clean`.
  </how-to-verify>
  <resume-signal>Type `mm-bookends-ready` when both validate clean.</resume-signal>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: Shannon authors MM raising (longest Phase 4 ritual) + validator</name>
  <what-built>The raising ceremony — most complex single file Shannon will author in Phase 4. ~220 lines; includes the Hiramic narrative arc (SPLIT into its own file in Task 3 per EA explanatory precedent).</what-built>
  <how-to-verify>
    Author `rituals/mm-raising-dialogue.md`, `rituals/mm-raising-dialogue-cipher.md`, `rituals/mm-raising-voice-cast.json`.

    Scene-split decision: the Hiramic legend is REFERENCED by stage direction in mm-raising rather than duplicated inline. Example in mm-raising-dialogue.md:
    ```
    [candidate is raised; the Hiramic legend is delivered — see mm-hiramic-legend ritual]
    ```
    This mirrors EA explanatory and fc-middle-chamber-lecture handling.

    Budget: ~1-2 hrs plain + ~1 hr cipher + ~20 min voice-cast = ~2.5-3 hrs authoring.

    Validator:
    ```bash
    npx tsx scripts/validate-rituals.ts
    ```

    Programmatic author-validation check for mm-raising (snippet from 04-04 Task 1, substitute slug).

    Update checklist: mm-raising row → drafted/voice-cast.

    Commit: `content-05: mm-raising authored + validator clean`.
  </how-to-verify>
  <resume-signal>Type `mm-raising-ready` when validator clean.</resume-signal>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3: Shannon authors MM Hiramic legend as standalone + validator</name>
  <what-built>Standalone Hiramic legend ritual (~80 lines). Distinct rehearsal unit; emotionally heaviest content in the phase.</what-built>
  <how-to-verify>
    Author `rituals/mm-hiramic-legend-dialogue.md`, `-dialogue-cipher.md`, `-voice-cast.json`.

    Voice-cast scene should reflect the gravity but stay P1-abstract. Example (good): `"The room has gone still. Low light. Every line lands with weight. Nothing hurried."`. Example (bad — DO NOT): `"Hiram Abiff is attacked by three ruffians at the south gate"` — narrative leakage, will phantom-echo in baked audio.

    Validator + programmatic check (same pattern).

    Update checklist: mm-hiramic-legend row → drafted/voice-cast.

    Commit: `content-05: mm-hiramic-legend authored + all MM parity-clean`.

    Confirm all 4 MM rituals pass validator together:
    ```bash
    npx tsx scripts/validate-rituals.ts
    # All 8 EA+FC plus 4 MM must pass.
    ```
  </how-to-verify>
  <resume-signal>Type `mm-authoring-complete` when all 4 MM validate clean.</resume-signal>
</task>

<task type="auto">
  <name>Task 4: Cold MM bake + scrub all 4 MM rituals</name>
  <files>rituals/mm-opening.mram, rituals/mm-raising.mram, rituals/mm-hiramic-legend.mram, rituals/mm-closing.mram, rituals/mm-*-styles.json</files>
  <action>
    Cold MM bake (~540 lines total — the largest single bake session in Phase 4; ~54 min serial, ~30-40 min with --parallel 4 and cross-ritual cache hits).

    1. Pre-flight:
       ```bash
       [ -n "$MRAM_PASSPHRASE" ] || { echo "MRAM_PASSPHRASE unset"; exit 1; }
       npm run bake-all -- --dry-run 2>&1 | tee /tmp/04-05-dry-run.log
       # Expected: table shows mm-opening, mm-raising, mm-hiramic-legend, mm-closing with cache-miss ≈ lines-total
       ```
       **Schedule at night per P4** — MM's 540-line cold bake is the largest Gemini preview-tier burn in the phase; midnight-PT reset is your friend. Use `GOOGLE_GEMINI_API_KEYS` pool with 2+ keys to parallelize across quota buckets.

    2. Cold bake:
       ```bash
       MRAM_PASSPHRASE="$MRAM_PASSPHRASE" \
       GOOGLE_GEMINI_API_KEYS="$GOOGLE_GEMINI_API_KEYS" \
       GOOGLE_CLOUD_TTS_API_KEY="$GOOGLE_CLOUD_TTS_API_KEY" \
       GEMINI_RETRY_BACKOFF_MS="3000,5000" \
       npm run bake-all -- --parallel 4 2>&1 | tee /tmp/04-05-bake.log
       ```
       Expected: mm-raising is longest (~22 min). If Ctrl-C or crash: `--resume`. Watch for duration-anomalies on the Hiramic legend — emotional content can surface P1 scene leaks more audibly.

    3. Preview scrub (same pattern as 04-04 Task 4):
       ```bash
       npm run preview-bake &
       # Shannon scrubs each of the 4 MM rituals; most attention on mm-raising + mm-hiramic-legend
       ```

    4. For any defect: P1/P2/P3/P5 mitigations from RESEARCH.md. Invalidate + re-bake.

    5. Update checklist: 4 MM rows → baked=[x], scrubbed=[x], styles=[x]-or-`—`.

    6. Commit: `content-05: mm cold bake + scrub complete`.
  </action>
  <verify>
    <automated>ls -la rituals/mm-opening.mram rituals/mm-raising.mram rituals/mm-hiramic-legend.mram rituals/mm-closing.mram && git status --porcelain | awk '{print $2}' | grep -E '^rituals/mm-' && echo "FAIL: MM files staged" || echo "OK: no MM source/mram staged"</automated>
  </verify>
  <done>All 4 MM `.mram` files exist; Shannon judges each scrubs clean; git has no staged MM source/mram files.</done>
</task>

<task type="auto">
  <name>Task 5: Verify all 4 MM rituals + update checklist + SUMMARY</name>
  <files>.planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md, .planning/phases/04-content-coverage/04-05-SUMMARY.md</files>
  <action>
    Same shape as 04-04 Task 5:

    1. Per-ritual verifier:
       ```bash
       for slug in mm-opening mm-raising mm-hiramic-legend mm-closing; do
         MRAM_PASSPHRASE="$MRAM_PASSPHRASE" npx tsx scripts/verify-mram.ts "rituals/${slug}.mram" --check-audio-coverage 2>&1 | tee -a /tmp/04-05-verify.log
         echo "=== $slug exit: $? ==="
       done
       ```
       All exit 0.

    2. Optional `--verify-audio` on mm-raising (STT round-trip smoke).

    3. Update `04-CONTENT-CHECKLIST.md`: 4 MM rows → verified=[x], shipped=[x].

    4. Parser round-trip:
       ```bash
       npx vitest run --no-coverage scripts/__tests__/content-checklist.test.ts
       ```

    5. Confirm gitignore discipline:
       ```bash
       git status --porcelain | awk '{print $2}' | grep -E '^rituals/mm-' && echo "FAIL" || echo "OK"
       ```

    6. Write `04-05-SUMMARY.md`:
       - Per-ritual: line count, wall-clock, pitfalls hit (counts by kind), styles.json lineHash prefixes (NEVER ritual text), file size, verifier pass
       - Aggregate: total MM lines, Shannon-hours, API wall-clock, quota-recovery count if any
       - SHA-256s of each dialogue + cipher file
       - Lodge-working clarifications (e.g., Hiramic legend scope, dramatic beats)
       - Commit prefix: `content-05: mm phase complete + checklist updated`

    7. Delete logs; commit tracked changes.
  </action>
  <verify>
    <automated>npx vitest run --no-coverage scripts/__tests__/content-checklist.test.ts && MRAM_PASSPHRASE="$MRAM_PASSPHRASE" npx tsx -e "for (const slug of ['mm-opening','mm-raising','mm-hiramic-legend','mm-closing']) { const { spawnSync } = await import('node:child_process'); const r = spawnSync('npx', ['tsx','scripts/verify-mram.ts',\`rituals/\${slug}.mram\`,'--check-audio-coverage','--json'], { encoding:'utf8', env: process.env }); console.log(slug, r.status); if (r.status !== 0) process.exit(1); }"</automated>
  </verify>
  <done>4 MM `.mram` files pass verify. 4 MM checklist rows shipped=[x]. SUMMARY written. No rituals/mm-* staged. Phase 3 baseline preserved.</done>
</task>

</tasks>

<verification>
- [ ] `rituals/mm-opening.mram`, `mm-raising.mram`, `mm-hiramic-legend.mram`, `mm-closing.mram` exist + pass `--check-audio-coverage`
- [ ] All 4 MM rows in checklist show shipped=[x]
- [ ] `04-05-SUMMARY.md` committed with per-ritual metrics + SHA-256s
- [ ] No rituals/mm-* committed
- [ ] Full vitest suite still green
</verification>

<success_criteria>
CONTENT-03 satisfied: 4 MM rituals baked, verified, shipped. The three craft-lodge degrees (EA + FC + MM) are now complete in Shannon's lodge's working.
</success_criteria>

<output>
`04-05-SUMMARY.md` with per-ritual metrics, pitfalls, source SHA-256s, lodge-working clarifications.
</output>
