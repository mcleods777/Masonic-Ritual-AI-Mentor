---
phase: 04-content-coverage
plan: 07
type: execute
wave: 1
depends_on: [01, 02]
# scope: 4-11 lectures per Shannon's lodge-specific decision in Task 1 (base 9 +/- deacons/stewards split).
# The globs below capture the MAX scope; the actual shipped set is enumerated in task bodies
# and finalized in 04-07-SUMMARY.md after Task 1 decision lands. Out-of-scope rows in the
# checklist are marked with em-dash status cells ("—") + a `descoped: post-v1 — <reason>` notes column
# (see Task 4 for the exact descope protocol — NO strikethrough, per 04-02 parser contract).
files_modified:
  - rituals/lec-*-dialogue.md
  - rituals/lec-*-dialogue-cipher.md
  - rituals/lec-*-voice-cast.json
  - rituals/lec-*-styles.json
  - rituals/lec-*.mram
  - .planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md
autonomous: false
requirements: [CONTENT-05]
tags: [content, lectures, charges, shannon-labor, shorts]

must_haves:
  truths:
    - "Every officer lecture / charge in Shannon's lodge's core set is authored end-to-end as a standalone `.mram`: plain + cipher + voice-cast → validator → bake → scrub → verify → ship"
    - "Shannon's core lecture set is FINALIZED at the start of this plan (Task 1 checkpoint); rows added or removed from the checklist match exactly what ships"
    - "Each `.mram` passes `--check-audio-coverage` (CONTENT-06)"
    - "Each lecture has a consistent voice — each officer charge is typically spoken by one role (the Installing Officer, a Past Master, or the specific officer); voice-cast pins the voice per lecture"
    - "All lecture rows in `04-CONTENT-CHECKLIST.md` show shipped=[x]; any lectures Shannon descopes have every status cell set to `—` and a notes column of `descoped: post-v1 — <reason>` (see Task 4 for exact protocol; this matches the existing 04-02 parser contract without requiring parser changes)"
  artifacts:
    - path: "rituals/lec-wm-charge.mram"
      provides: "WM charge to the new Master, standalone baked (always in scope — CONTENT-05 minimum)"
    - path: "rituals/lec-sw-duties.mram"
      provides: "SW duties charge, standalone baked (always in scope — CONTENT-05 minimum)"
    - path: "rituals/lec-jw-duties.mram"
      provides: "JW duties charge, standalone baked (always in scope — CONTENT-05 minimum)"
    - path: "rituals/lec-secretary-duties.mram"
      provides: "Secretary duties charge, standalone baked (optional — Shannon selects in Task 1)"
    - path: "rituals/lec-treasurer-duties.mram"
      provides: "Treasurer duties charge (optional — Shannon selects in Task 1)"
    - path: "rituals/lec-chaplain-duties.mram"
      provides: "Chaplain duties charge (optional — Shannon selects in Task 1)"
    - path: "rituals/lec-deacons-duties.mram"
      provides: "SD/JD duties charge (optional; may be split into lec-sd-duties.mram + lec-jd-duties.mram if Iowa GL scripts are separate — Shannon decides in Task 1)"
    - path: "rituals/lec-stewards-duties.mram"
      provides: "SS/JS duties charge (optional; may be split into lec-ss-duties.mram + lec-js-duties.mram — Shannon decides in Task 1)"
    - path: "rituals/lec-tiler-duties.mram"
      provides: "Tiler duties charge (shortest lecture, ~20 lines; optional — Shannon selects in Task 1)"
    - path: ".planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md"
      provides: "Every in-scope lecture row shipped=[x]; out-of-scope rows have status cells set to `—` with `descoped: post-v1 — <reason>` in notes column"
  key_links:
    - from: "rituals/lec-*-voice-cast.json"
      to: "rituals/ea-initiation-voice-cast.json"
      via: "role profile reuse for cross-ritual consistency"
      pattern: "\"profile\":"
    - from: "each rituals/lec-*.mram"
      to: "scripts/verify-content.ts"
      via: "release-gate per-ritual acceptance"
      pattern: "verify-content"
---

<objective>
Author and ship the core officer lectures / charges as standalone `.mram` practice units. Shannon confirms the exact lecture set at Task 1 checkpoint (CONTENT-05 treats lectures as "core lectures specified by Shannon's lodge" — the seed set in the checklist is 9 lectures but the binding set is Shannon's call during this plan's execution, ranging from 4 (minimum: WM + SW + JW + Tiler) to 11 (full set with deacons and stewards split)).

Purpose: CONTENT-05 ("Officer lectures / charges baked as standalone practice units") requires WM charge + SW/JW duties minimum; other officer-specific lectures included per Shannon's lodge practice. Lectures are structurally simpler than full rituals (typically single-role monologues, short — ~20-40 lines each) so the per-ritual pipeline runs fast. The bottleneck is Shannon's authorial labor (~1.5-2 hrs each).

**Scope flexibility**: The checklist seed includes 9 lecture rows. Shannon may:
- Keep all 9 → 9 lectures ship
- Drop some (e.g., if his lodge doesn't separately rehearse Secretary/Treasurer duties) → set every status cell for that row to `—` (em-dash, "not applicable") and write `descoped: post-v1 — <reason>` in the notes column. Those rows stay in the checklist for audit trail; they do NOT appear in the shipped `rituals/lec-*.mram` set
- Combine some (e.g., SD+JD into a single `lec-deacons-duties` vs. splitting into two files) → choice made at Task 1 checkpoint

**Descope UX — no strikethrough.** The 04-02 checklist parser contract defines `StatusCell = "[ ]" | "[~]" | "[x]" | "—"` and throws `InvalidStatusCell` on anything else. Strikethrough syntax (`~~slug~~` or strikethrough-wrapped rows) would either break the parser or require a parser extension that Plan 04-02 deliberately scoped out. Instead, descoping uses the existing `—` em-dash cell (semantically "not applicable") across all eight status columns for a descoped row, with the notes column carrying the human-readable rationale. The parser handles this natively; no 04-02 changes needed.

Output: N `rituals/lec-*.mram` files (N between 4 and 11 per Shannon's Task 1 decision); corresponding checklist rows either shipped (8× `[x]`) or descoped (8× `—` + notes); SUMMARY recording the final in-scope set.

Non-autonomous: authoring + scope decision is Shannon-labor.
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

@rituals/ea-explanatory-dialogue.md
@rituals/ea-initiation-voice-cast.json

@scripts/bake-all.ts
@scripts/validate-rituals.ts
@scripts/verify-mram.ts
@scripts/verify-content.ts
@scripts/preview-bake.ts
@src/lib/author-validation.ts
</context>

<threat_model>
## Trust Boundaries

Same family as 04-04/05/06. New: per-lecture scope decision surfaces.

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-04-34 | Integrity | ambiguous "core lectures" definition → scope creep or gap | mitigate | Task 1 explicit checkpoint where Shannon names the final set; checklist rows match exactly. Descoped rows documented with reason via em-dash + notes-column protocol (see Task 4). |
| T-04-35 | Integrity | single-speaker lecture hitting P2/P3 regression more often (monologue = more consecutive medium-length lines from one voice) | mitigate | Task 2 scrub — apply speakAs + style-shift tactics as needed; lectures are short so iteration is cheap |
| T-04-36 | DoS | bake 9 lectures ≈ 200-300 line cold bake | accept | Well-within Gemini preview quota; cheaper than MM plan |
| T-04-37 | Tampering | lecture text wrong vs. Iowa GL working | accept | Shannon-authority; dogfood in 04-08 |
| T-04-38 | Information Disclosure | source files committed | mitigate | .gitignore + final pre-commit check |
| T-04-43 | Integrity | descope UX breaks 04-02 parser | mitigate | Descope protocol uses only em-dash `—` (already a valid StatusCell per 04-02 parser) + notes column. No strikethrough, no parser extension. Task 4 verify step runs `content-checklist.test.ts` to confirm the descoped file still parses. |

**Severity:** LOW-MEDIUM. Lectures are shortest and simplest content in Phase 4.
</threat_model>

<tasks>

<task type="checkpoint:decision" gate="blocking">
  <name>Task 1: Shannon finalizes the in-scope lecture set</name>
  <decision>Which officer lectures ship in Phase 4?</decision>
  <context>
    RESEARCH.md seeds the checklist with 9 lectures: WM charge, SW duties, JW duties, Secretary duties, Treasurer duties, Chaplain duties, Deacons duties (may split SD/JD), Stewards duties (may split SS/JS), Tiler duties.
    CONTENT-05 wording: "WM charge, SW/JW duties, and any core lectures specified by Shannon's lodge" — minimum is WM + SW + JW; everything else is Shannon's call.
    Also at this checkpoint: Shannon may decide to SPLIT `lec-deacons-duties` into `lec-sd-duties` + `lec-jd-duties` (two files) OR keep combined. Same for stewards. With splits the max count is 11.
  </context>
  <options>
    <option id="option-a">
      <name>Keep the full 9-lecture seed set (or 11 if deacons and stewards split)</name>
      <pros>Most comprehensive — any invited lodge using Iowa GL working gets all standard officer charges; WMs can rehearse entire officer line</pros>
      <cons>Most authoring labor (~9 × ~1.5 hrs = ~13.5 hrs); more potential pitfall surface</cons>
    </option>
    <option id="option-b">
      <name>Core-only set (WM + SW + JW + Tiler) = 4 lectures</name>
      <pros>Satisfies minimum CONTENT-05 requirement; fastest to ship; ~6 hrs authoring</pros>
      <cons>Less coverage for other invited officers (Sec/Treas/Ch/SD/JD/SS/JS can't rehearse their charges)</cons>
    </option>
    <option id="option-c">
      <name>Pragmatic subset — WM + SW + JW + Sec + Treas + Ch + Deacons (combined) + Tiler = 7-8 lectures</name>
      <pros>Good coverage of the most-rehearsed officer roles; skips stewards (typically least-rehearsed); ~10-12 hrs authoring</pros>
      <cons>Slightly arbitrary line; Shannon's specific lodge cadence dictates</cons>
    </option>
    <option id="option-d">
      <name>Other / descoped — Shannon specifies a custom set</name>
      <pros>Matches Shannon's specific lodge reality exactly</pros>
      <cons>Requires explicit enumeration; checklist rows updated accordingly</cons>
    </option>
  </options>
  <resume-signal>Select: `option-a` (full), `option-b` (minimum), `option-c` (pragmatic), or `option-d: {custom list}`. Also specify deacons/stewards split (combined or split files).</resume-signal>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: Shannon authors all in-scope lectures + runs validator</name>
  <what-built>For each lecture in the chosen scope set (Task 1 decision), author plain + cipher + voice-cast. Lectures are structurally simple — typically a single-speaker monologue charging a specific officer or class of officers.</what-built>
  <how-to-verify>
    For each in-scope `lec-*` slug, run the same 4-step authoring pipeline from 04-04 Task 1:

    1. **Plain dialogue** (~45-60 min per lecture): create `rituals/lec-{slug}-dialogue.md`. Frontmatter:
       ```
       ---
       jurisdiction: Grand Lodge of Iowa
       degree: Installation
       ceremony: {Officer} Charge
       ---
       ```
       Most lectures are single-speaker (`IO:` or `WM:` delivering the charge); some have a brief candidate acknowledgment. Example skeleton:
       ```
       ## CEREMONY: Junior Warden Duties Charge

       IO: Brother, you have been elected Junior Warden of this lodge…
       IO: It is your duty, as Junior Warden…
       IO: You are to observe the sun at its meridian height…
       C: I accept the duties charged.
       ```

    2. **Cipher dialogue** (~20-30 min per lecture): standard cipher conventions; word-ratio band applies. Single-speaker shorts are easier to cipher than multi-role ceremonies.

    3. **Voice-cast** (~10 min per lecture): `rituals/lec-{slug}-voice-cast.json`. Usually one or two roles. Copy role profiles from ea-initiation-voice-cast.json. Scene example for a charge: `"The charge is delivered to an officer just installed. Clear, firm, ceremonial. The room is attentive."`

    4. **Validator**:
       ```bash
       npx tsx scripts/validate-rituals.ts
       # Every in-scope lecture + all prior rituals pass.
       ```
       Programmatic D-08 check for each new lecture (snippet from 04-04 Task 1, substitute slug).

    5. **Checklist update**:
       - For each in-scope lecture row → set `drafted (plain)`, `drafted (cipher)`, `voice-cast` cells to `[x]`.
       - For each OUT-of-scope lecture row (per Task 1 decision) → set ALL 8 status cells to `—` and rewrite the notes column to `descoped: post-v1 — <reason>` (e.g., `descoped: post-v1 — Iowa lodge doesn't separately rehearse stewards`). Do NOT use `~~strikethrough~~` syntax or any wrapping of the slug cell — the 04-02 parser will throw `InvalidStatusCell` on anything outside `[ ]|[~]|[x]|—`, and the parser does not special-case markdown strikethrough.

    6. Commit after authoring all in-scope lectures: `content-07: lectures {listed-set} authored + validator clean`.
  </how-to-verify>
  <resume-signal>Type `lectures-ready` when validator clean for all in-scope lectures.</resume-signal>
</task>

<task type="auto">
  <name>Task 3: Cold bake all in-scope lectures + scrub</name>
  <files>rituals/lec-*.mram, rituals/lec-*-styles.json</files>
  <action>
    Cold bake of all in-scope lectures (each ~20-40 lines; total 80-440 lines depending on scope):

    1. Pre-flight + dry-run:
       ```bash
       [ -n "$MRAM_PASSPHRASE" ] || { echo "MRAM_PASSPHRASE unset"; exit 1; }
       npm run bake-all -- --dry-run 2>&1 | tee /tmp/04-07-dry-run.log
       # Expected: lec-* rows show cache-miss ≈ lines-total
       ```

    2. Cold bake:
       ```bash
       MRAM_PASSPHRASE="$MRAM_PASSPHRASE" \
       GOOGLE_GEMINI_API_KEYS="$GOOGLE_GEMINI_API_KEYS" \
       GOOGLE_CLOUD_TTS_API_KEY="$GOOGLE_CLOUD_TTS_API_KEY" \
       npm run bake-all -- --parallel 4 2>&1 | tee /tmp/04-07-bake.log
       ```
       Wall-clock estimate: ~5-15 min depending on scope. Resume-safe.

    3. Preview-bake + scrub:
       ```bash
       npm run preview-bake &
       ```
       Shannon scrubs each lecture (fast — lectures are short). Single-speaker monologues are P2/P3-prone on medium lines; apply speakAs / style-shift tactics if regressions hit. Invalidate affected lines; re-bake.

    4. Checklist update: each in-scope lecture row → baked=[x], scrubbed=[x], styles=[x] or `—`.

    5. Commit: `content-07: lectures cold bake + scrub complete`.
  </action>
  <verify>
    <automated>ls rituals/lec-*.mram 2>/dev/null | wc -l && git status --porcelain | awk '{print $2}' | grep -E '^rituals/lec-' && echo "FAIL: lecture files staged" || echo "OK: no lecture source/mram staged"</automated>
  </verify>
  <done>Every in-scope `lec-*.mram` file exists. Shannon judges each scrubs clean. No lec-* source/mram files staged in git.</done>
</task>

<task type="auto">
  <name>Task 4: Verify all in-scope lectures + update checklist + SUMMARY</name>
  <files>.planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md, .planning/phases/04-content-coverage/04-07-SUMMARY.md</files>
  <action>
    1. Per-lecture verifier:
       ```bash
       for f in rituals/lec-*.mram; do
         slug=$(basename "$f" .mram)
         MRAM_PASSPHRASE="$MRAM_PASSPHRASE" npx tsx scripts/verify-mram.ts "$f" --check-audio-coverage 2>&1 | tee -a /tmp/04-07-verify.log
         echo "=== $slug exit: $? ==="
       done
       ```
       Every in-scope lecture exits 0.

    2. Update `04-CONTENT-CHECKLIST.md`:
       - **In-scope rows** → set `verified=[x]`, `shipped=[x]` (other status cells should already be `[x]` from Tasks 2/3).
       - **Out-of-scope (descoped) rows** — apply the em-dash descope protocol:
         - Set every status cell (drafted plain, drafted cipher, voice-cast, styles, baked, scrubbed, verified, shipped) to `—` (em-dash, U+2014).
         - Rewrite the notes column to `descoped: post-v1 — <one-sentence reason>`, e.g., `descoped: post-v1 — Iowa lodge doesn't separately rehearse stewards; handled via combined floor-officer charge`.
         - Leave the slug cell UNCHANGED (no `~~` wrapping, no strikethrough — the 04-02 parser extracts the slug via a `|` column split and throws on any cell content outside `[ ]|[~]|[x]|—`).
         - Sample descoped row (imagine lec-stewards-duties being descoped):
           ```
           | lec-stewards-duties | — | — | — | — | — | — | — | — | descoped: post-v1 — Iowa lodge handles via combined floor-officer charge |
           ```
       - Update the "Updated:" timestamp at the top of the file.

    3. Parser round-trip — the shape test MUST still pass on the updated file. The descoped rows use only valid `StatusCell` values (`—` is explicitly in the `StatusCell` union per 04-02), so no parser changes are needed. Run:
       ```bash
       npx vitest run --no-coverage scripts/__tests__/content-checklist.test.ts
       # Expected: all 6 tests green (including round-trip on disk).
       ```
       If the round-trip test fails, the descope rows have been formatted wrong — DO NOT extend the 04-02 parser; instead, re-audit the checklist file for stray strikethrough syntax, wrong em-dash character, or extra whitespace in status cells.

    4. Confirm gitignore:
       ```bash
       git status --porcelain | awk '{print $2}' | grep -E '^rituals/lec-' && echo "FAIL" || echo "OK"
       ```

    5. Write `04-07-SUMMARY.md`:
       - Final in-scope lecture list (names + line counts)
       - Descoped lectures (names + one-line reason each; pulled from notes column)
       - Per-lecture: wall-clock, pitfalls hit, styles entries added (lineHash prefixes only — no text), file size, verifier pass
       - Aggregate: total shipped lecture count; total Shannon-hours; total API wall-clock
       - SHA-256 of each in-scope dialogue + cipher file
       - Commit prefix: `content-07: lectures phase complete — shipped {N} lectures, descoped {M}`

    6. Delete logs; commit tracked updates.
  </action>
  <verify>
    <automated>npx vitest run --no-coverage scripts/__tests__/content-checklist.test.ts && for f in rituals/lec-*.mram; do MRAM_PASSPHRASE="$MRAM_PASSPHRASE" npx tsx scripts/verify-mram.ts "$f" --check-audio-coverage --json 2>&1 | tail -1; done</automated>
  </verify>
  <done>Every in-scope lecture `.mram` passes verifier. Checklist rows updated (8× `[x]` for in-scope, 8× `—` + `descoped: post-v1 — <reason>` notes column for descoped). 04-02 parser round-trip test passes without any parser modification. SUMMARY written. No lecture source files committed. Phase 3 baseline preserved.</done>
</task>

</tasks>

<verification>
- [ ] Every in-scope `rituals/lec-*.mram` exists + passes `--check-audio-coverage`
- [ ] In-scope lecture rows in checklist show shipped=[x]
- [ ] Out-of-scope rows have all 8 status cells set to `—` and notes column of `descoped: post-v1 — <reason>` (no strikethrough anywhere; 04-02 parser round-trip still green)
- [ ] `04-07-SUMMARY.md` committed with final lecture list + descope rationale per row
- [ ] No rituals/lec-* files committed
- [ ] Full vitest suite green
</verification>

<success_criteria>
CONTENT-05 satisfied: Shannon's lodge's core officer lectures are baked as standalone practice units. An invited officer can rehearse his individual charge without needing the full installation ceremony file.
</success_criteria>

<output>
`04-07-SUMMARY.md` naming the final shipped lecture set, per-lecture metrics, descope rationale for any removed rows (one line per descoped row).
</output>
