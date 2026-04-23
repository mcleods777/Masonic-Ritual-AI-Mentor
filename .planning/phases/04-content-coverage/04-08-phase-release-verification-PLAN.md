---
phase: 04-content-coverage
plan: 08
type: execute
wave: 2
depends_on: [01, 02, 03, 04, 05, 06, 07]
files_modified:
  - .planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md
  - .planning/phases/04-content-coverage/04-08-SUMMARY.md
  - .planning/phases/04-content-coverage/04-HUMAN-UAT.md
  - .planning/REQUIREMENTS.md
  - .planning/STATE.md
  - .planning/ROADMAP.md
autonomous: false
requirements: [CONTENT-01, CONTENT-02, CONTENT-03, CONTENT-04, CONTENT-05, CONTENT-06, CONTENT-07]
tags: [release-verification, dogfood, phase-close, uat]

must_haves:
  truths:
    - "`npm run verify-content` exits 0 when run across every shipped Phase 4 `.mram` — single-command confirmation that CONTENT-06 + CONTENT-07 hold aggregate"
    - "Full vitest suite is green (Phase 3 baseline 517 + Phase 4 additions from plans 01-02 = ~535+ tests, zero regressions)"
    - "Every in-scope ritual row in `04-CONTENT-CHECKLIST.md` shows shipped=[x]; every removed row has a documented rationale"
    - "Shannon has dogfooded at least one ritual per degree (EA, FC, MM) + the installation + one lecture on the real deployed pilot at `masonicmentor.app` — upload + rehearse + verify playback loop works end-to-end as an invited user would experience it"
    - "`.planning/REQUIREMENTS.md` marks CONTENT-01 through CONTENT-07 as [x] Complete"
    - "`.planning/STATE.md` + `.planning/ROADMAP.md` updated to reflect Phase 4 complete"
    - "A phase-close SUMMARY committed recording aggregate metrics: total rituals shipped, total Shannon-hours (self-reported from 04-03..07 SUMMARYs), total API spend, total wall-clock, top 3 pitfalls encountered"
    - "A `04-HUMAN-UAT.md` file captures deferred-human verification items (e.g., invited-pilot feedback) for later tracking — matching Phase 1 + Phase 3 convention"
  artifacts:
    - path: ".planning/REQUIREMENTS.md"
      provides: "CONTENT-01..07 marked [x] Complete with per-requirement evidence"
      contains: "[x] **CONTENT-01**"
    - path: ".planning/STATE.md"
      provides: "Phase 4 status updated to COMPLETE; phase counter advanced"
      contains: "Phase 4 | Content Coverage | 8/8 | Complete"
    - path: ".planning/ROADMAP.md"
      provides: "Phase 4 checkbox ticked; plan list updated to 8/8; success criteria statuses marked"
      contains: "[x] **Phase 4: Content Coverage**"
    - path: ".planning/phases/04-content-coverage/04-08-SUMMARY.md"
      provides: "Phase-close aggregate metrics + dogfood findings + deferred items"
    - path: ".planning/phases/04-content-coverage/04-HUMAN-UAT.md"
      provides: "Deferred-human verification items (pilot feedback, long-tail rehearsal findings) tracked for future phases"
  key_links:
    - from: ".planning/REQUIREMENTS.md CONTENT-06 checkbox"
      to: "npm run verify-content result"
      via: "verifier evidence cited in requirement update"
      pattern: "verify-content"
    - from: ".planning/REQUIREMENTS.md CONTENT-07 checkbox"
      to: "bake-all validator-first gate + verify-content release gate"
      via: "D-08 bake-band (Phase 3) + Phase 4 release gate (Plan 04-01)"
      pattern: "D-08"
    - from: ".planning/ROADMAP.md Phase 4 success criteria"
      to: "Plans 04-01 through 04-07 SUMMARYs"
      via: "per-criterion evidence"
      pattern: "SUMMARY.md"
---

<objective>
Close Phase 4: run the release gate across every shipped `.mram`, dogfood representative rituals on the deployed pilot, mark CONTENT-01..07 Complete in REQUIREMENTS.md, update STATE.md + ROADMAP.md, commit a phase-close SUMMARY.

Purpose: This plan is the evidence layer for CONTENT-06 + CONTENT-07 at aggregate scope, the dogfooding layer for the assumption that the pilot upload-and-rehearse flow works end-to-end with every Phase 4 ritual, and the documentation layer that marks the transition to Phase 5 (Coach Quality Lift).

Output: Verification log, dogfood findings, REQUIREMENTS/STATE/ROADMAP updates, phase-close SUMMARY, UAT file for deferred items.

Non-autonomous: dogfood step requires Shannon interacting with the deployed pilot.
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
@.planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md
@.planning/phases/04-content-coverage/04-01-SUMMARY.md
@.planning/phases/04-content-coverage/04-02-SUMMARY.md
@.planning/phases/04-content-coverage/04-03-SUMMARY.md
@.planning/phases/04-content-coverage/04-04-SUMMARY.md
@.planning/phases/04-content-coverage/04-05-SUMMARY.md
@.planning/phases/04-content-coverage/04-06-SUMMARY.md
@.planning/phases/04-content-coverage/04-07-SUMMARY.md

@scripts/verify-content.ts
@scripts/verify-mram.ts
@scripts/lib/content-checklist.ts
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| localhost bake → production deploy | Dogfood step uploads a `.mram` to `masonicmentor.app`; the `.mram` is identical bytes (AES-GCM-encrypted, client-decrypted), so production drift risk is near-zero — but belt-and-suspenders dogfood confirms |
| REQUIREMENTS.md updates | Human-verifiable claims; flipping a checkbox should match material evidence |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-04-39 | Integrity | REQUIREMENTS.md marked Complete without evidence | mitigate | Each checked requirement in this plan cites the specific evidence (SUMMARY line, verify-content log, dogfood date) |
| T-04-40 | Integrity | checklist row shows shipped=[x] but .mram fails verify | mitigate | Task 1's `npm run verify-content` re-runs aggregate — any ritual that slipped through a per-plan verify step surfaces here |
| T-04-41 | Information Disclosure | dogfood logs on production Vercel could capture ritual text in client-side errors | accept | Client decrypts `.mram` in-browser; no ritual text reaches the server. Any client-side error mid-dogfood is developer-tools-only (not network-emitted) |
| T-04-42 | Tampering | REQUIREMENTS.md edited without phase-close SUMMARY | mitigate | Task 3 commits them atomically — one commit lands REQUIREMENTS + STATE + ROADMAP + SUMMARY updates together |

**Severity:** LOW. This plan is verification and documentation, not new content or new code.
</threat_model>

<tasks>

<task type="auto">
  <name>Task 1: Aggregate release-gate verification across all Phase 4 .mram files</name>
  <files>.planning/phases/04-content-coverage/04-08-verify-content.log (transient)</files>
  <action>
    1. Run the Phase 4 release gate across all shipped rituals:
       ```bash
       [ -n "$MRAM_PASSPHRASE" ] || { echo "MRAM_PASSPHRASE unset"; exit 1; }
       MRAM_PASSPHRASE="$MRAM_PASSPHRASE" npm run verify-content 2>&1 | tee /tmp/04-08-verify-content.log
       echo "exit: $?"
       ```
       Expected: exit 0. Summary table shows every ritual PASS for validator and audio-coverage. If any ritual FAILs, capture the failure AND return to the owning plan (04-03..07) rather than proceeding.

    2. Run the full vitest suite:
       ```bash
       npx vitest run --no-coverage 2>&1 | tee /tmp/04-08-vitest.log | tail -5
       ```
       Expected: `~535+ tests passed across ~45 files`, 0 failed, 0 skipped (or only the Test-6 round-trip-when-empty case from 04-02 if ever re-disabled). Phase 3 baseline of 517 preserved; Phase 4 added tests from Plans 01-02.

    3. Run the checklist shape test one more time as end-to-end evidence:
       ```bash
       npx vitest run --no-coverage scripts/__tests__/content-checklist.test.ts
       ```

    4. Capture verify-content output (summary table only — no ritual text; the Plan 04-01 implementation restricts output to per-line IDs + byte lengths + failure kinds, so logs are safe):
       ```bash
       tail -40 /tmp/04-08-verify-content.log > /tmp/04-08-verify-content.tail
       ```
       This excerpt will be quoted in the SUMMARY.

    5. Pitfall check on installable file sizes (not a gate, informational):
       ```bash
       ls -la rituals/*.mram | awk '{print $5, $9}' | sort -n
       echo "total MB: $(du -sh rituals/*.mram | awk '{sum+=$1} END {print sum}')"
       ```
       Note total size in SUMMARY. Per RESEARCH.md §P11, aggregate >100 MB is observation-only (Phase 6 addresses lazy-load if needed).
  </action>
  <verify>
    <automated>MRAM_PASSPHRASE="$MRAM_PASSPHRASE" npm run verify-content 2>&1 | tail -5 && npx vitest run --no-coverage 2>&1 | tail -3</automated>
  </verify>
  <done>`verify-content` exits 0 across every shipped ritual. Full vitest suite green. `/tmp/04-08-verify-content.tail` captured for SUMMARY.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Shannon dogfoods representative rituals on the deployed pilot</name>
  <what-built>
    The Phase 4 release gate confirmed bytes-level correctness; this task confirms the user experience works end-to-end. Shannon uploads the baked `.mram` files to the deployed pilot at `https://masonicmentor.app`, signs in as an invited user, and rehearses representative rituals.
  </what-built>
  <how-to-verify>
    **Dogfood set** (at minimum one per category; adjust based on Shannon's available bandwidth):
    1. `ea-initiation.mram` — EA representative (most content-dense EA ritual)
    2. `fc-passing.mram` — FC representative (longest FC + contains winding-stairs material)
    3. `mm-raising.mram` — MM representative (longest MM; emotionally heavy)
    4. `installation.mram` — Installation (only ritual in its category; multi-section test)
    5. One lecture — e.g., `lec-wm-charge.mram` (single-speaker test; shortest)

    **Per-ritual dogfood procedure:**
    1. Sign in at `https://masonicmentor.app` with an invited-user account from `LODGE_ALLOWLIST` (NOT Shannon's admin account — the pilot's invited-user experience is the target).
    2. Navigate to `/practice`; drag-drop the `.mram` file; enter `MRAM_PASSPHRASE`.
    3. Confirm upload succeeds, the ritual appears in the sidebar, sections are visible.
    4. Enter Rehearsal mode for at least one section of the ritual.
    5. For each of 5-10 lines in that section:
       - Listen to baked playback (MUST play instantly — no live-TTS fallback banner; AUTHOR-08 / COACH-12 banner path should NOT activate on any line).
       - Verify audio matches the text (no phantom phrases — P1 regression; no missing words; no mispronunciation).
       - Speak along; verify STT + word-diff feedback works against the plain text.
    6. Switch device context if practical (desktop Chrome → mobile Safari) to confirm the `.mram` plays on both.

    **Capture findings in a notes buffer:**
    - Per-ritual: upload success y/n; playback latency (ms to start of first line); any audio defects noticed that escaped the local scrub; STT feedback quality (Phase 5 will address LLM feedback — this is STT only).
    - Cross-ritual: any UX drift between ritual sizes (e.g., large `.mram` upload progress feels slow); any production-specific behavior that didn't manifest locally (there shouldn't be any — the `.mram` is decrypted client-side; but belt-and-suspenders).

    **Red flags that BLOCK the checkpoint:**
    - Any ritual fails to upload
    - Any ritual requires live-TTS fallback for a spoken line (CONTENT-06 regression — should have been caught by verify-content; investigate)
    - Any audio defect surfaces that was missed during Task 2 of the owning plan — return to that plan for a re-scrub

    **Findings short of red-flag:**
    - File too large to upload on slow connection (observation for Phase 6 lazy-load)
    - STT feedback not recognizing the user's attempt (Phase 5 COACH concern; document but don't block)
    - UI polish issues (Phase 7 ONBOARD concern; document)

    These findings get captured in `04-HUMAN-UAT.md` (Task 3 creates the file).
  </how-to-verify>
  <resume-signal>Type `dogfood-green` when all 5 representative rituals play end-to-end. Type `dogfood-red: {ritual} {defect}` if any red-flag issue surfaced. Type `dogfood-partial: {ritual list tested, defects observed}` if Shannon could only dogfood a subset (plan still completes but UAT file captures what's deferred).</resume-signal>
</task>

<task type="auto">
  <name>Task 3: Update REQUIREMENTS + STATE + ROADMAP + write phase-close SUMMARY + UAT</name>
  <files>.planning/REQUIREMENTS.md, .planning/STATE.md, .planning/ROADMAP.md, .planning/phases/04-content-coverage/04-08-SUMMARY.md, .planning/phases/04-content-coverage/04-HUMAN-UAT.md, .planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md</files>
  <action>
    1. **Update `.planning/REQUIREMENTS.md`** — mark CONTENT-01..07 [x] Complete, each with one-line evidence pointer:
       ```markdown
       - [x] **CONTENT-01**: Entered Apprentice (EA) degree baked — cipher + plain + Gemini audio + voice cast pinned (Plan 04-03; `ea-{opening,initiation,explanatory,closing}.mram` all pass `verify-mram --check-audio-coverage`; v3-cache re-bake complete)
       - [x] **CONTENT-02**: Fellow Craft (FC) degree baked — cipher + plain + audio + voice cast (Plan 04-04; 4 fresh `fc-*.mram` shipped)
       - [x] **CONTENT-03**: Master Mason (MM) degree baked — cipher + plain + audio + voice cast (Plan 04-05; 4 fresh `mm-*.mram` shipped; Hiramic legend as standalone unit)
       - [x] **CONTENT-04**: Annual officer installation ceremony baked (Plan 04-06; `installation.mram` single-file; N officer sections)
       - [x] **CONTENT-05**: Officer lectures / charges baked as standalone practice units (Plan 04-07; N lectures shipped — list in 04-07-SUMMARY)
       - [x] **CONTENT-06**: Every shipped `.mram` verified to have per-line Opus embedded (Plan 04-01 shipped `verify-mram --check-audio-coverage`; Plan 04-08 Task 1 ran aggregate across all Phase 4 `.mram` files — exit 0)
       - [x] **CONTENT-07**: Every shipped `.mram` passes the cipher/plain parity validator before release (Phase 3 D-08 bake-band gate + Plan 04-01 `verify-content` release gate; Plan 04-08 Task 1 confirmed aggregate pass)
       ```

    2. **Update `.planning/STATE.md`**:
       - Top-of-file `progress` block: completed_phases 3 → 4; completed_plans updates (+8 from Phase 4); percent recomputed
       - Current Position: advance Phase to 5 (Coach Quality Lift) as "ready to plan"; Phase 4 status → Complete
       - Phase Map table: Phase 4 status → `✓ Complete`
       - Accumulated Context: add Phase 4 key learnings (top 3 pitfalls encountered across content plans; any cipher-convention decisions Shannon codified; total API spend)
       - Session Continuity: last significant action → Phase 4 complete; resumption cue → `/gsd-transition` to Phase 5

    3. **Update `.planning/ROADMAP.md`**:
       - Phases section checkbox: `- [x] **Phase 4: Content Coverage**`
       - Phase Details section for Phase 4: change "**Plans**: TBD" → "**Plans**: 8 plans" + add the plan list with `- [x]` prefix for each
       - Success criteria under Phase 4: review each of the 5 criteria and mark with ✓ + evidence pointer to the owning plan(s) + SUMMARY line
       - Progress table bottom: Phase 4 row → `8/8 | Complete | {today}`

    4. **Update `04-CONTENT-CHECKLIST.md`**:
       - Add a "Phase Close" section at the bottom:
         ```markdown
         ## Phase Close

         **Closed:** <today>
         **Plan:** 04-08
         **Aggregate verify-content:** green on all N in-scope rituals (exit 0)
         **Dogfood:** green on 5 representative rituals on masonicmentor.app (or per dogfood-partial findings)
         **Total rituals shipped:** N (4 EA + 4 FC + 4 MM + 1 Installation + M lectures)
         **Requirements complete:** CONTENT-01..07 all ✓
         ```

    5. **Write `.planning/phases/04-content-coverage/04-08-SUMMARY.md`**:
       - Aggregate metrics (pulled from 04-03..07 SUMMARYs): total lines authored, total Shannon-hours self-reported, total API wall-clock, total API $ spend (Gemini + Google Cloud + Groq), total `.mram` file footprint in MB
       - Top 3 pitfalls across Phase 4 (P-numbers + counts from per-plan SUMMARYs)
       - Verify-content aggregate result (quoted from /tmp/04-08-verify-content.tail)
       - Vitest suite final count (from /tmp/04-08-vitest.log)
       - Dogfood findings (per-ritual y/n + notable observations)
       - Deferred items (pointer into `04-HUMAN-UAT.md`)
       - Lessons-learned for future phases (e.g., "role profile verbatim reuse delivered X% cross-ritual cache hits" if observable)
       - Commit SHA this plan produces

    6. **Write `.planning/phases/04-content-coverage/04-HUMAN-UAT.md`** (matching Phase 1 convention — captures deferred-human verifications):
       ```markdown
       ---
       phase: 04-content-coverage
       created: <date>
       purpose: Deferred-human verification items that are not blocking Phase 4 close
       ---

       # Phase 4 — Deferred Human UAT

       ## Items

       ### UAT-04-01 — Pilot user rehearsal fidelity feedback
       - **What:** Invited pilot users rehearse at least one full ceremony per degree and report audio fidelity + STT accuracy against their own memorized working
       - **Why deferred:** Requires distribution of `.mram` files to invited users + collection of feedback over days/weeks
       - **Owner:** Shannon
       - **Resolution signal:** One Slack/email round-trip per pilot
       - **Blocks:** nothing in the v1 milestone; informs Phase 5 Coach + Phase 7 Onboard polish

       ### UAT-04-02 — Cross-jurisdiction content fidelity audit
       - **What:** If an invited outside lodge reports any working-specific line that differs from their GL's version, document the delta and decide whether it's a one-off jurisdictional difference or a v2 multi-working feature
       - **Why deferred:** Pilot population is small; specific divergences surface only when users rehearse and notice
       - **Resolution signal:** Shannon catalogues reported divergences in a followup note; v2 multi-working scope decision

       <!-- add more items as dogfood + pilot feedback produces them -->
       ```

    7. **Final git commit** (one atomic commit across REQUIREMENTS + STATE + ROADMAP + all new planning files):
       ```bash
       git add .planning/REQUIREMENTS.md .planning/STATE.md .planning/ROADMAP.md \
               .planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md \
               .planning/phases/04-content-coverage/04-08-SUMMARY.md \
               .planning/phases/04-content-coverage/04-HUMAN-UAT.md
       git status --porcelain | awk '{print $2}' | grep -E '^rituals/' && { echo "FAIL: rituals staged"; exit 1; }
       git commit -m "content-08: close phase 4 content coverage (CONTENT-01..07 complete)"
       ```

    8. Delete logs:
       ```bash
       rm -f /tmp/04-08-verify-content.log /tmp/04-08-verify-content.tail /tmp/04-08-vitest.log
       ```
  </action>
  <verify>
    <automated>grep -c "\[x\] \*\*CONTENT-0" .planning/REQUIREMENTS.md && grep -q "Phase 4 | Content Coverage | 8/8 | Complete\|Phase 4.*Complete" .planning/STATE.md && grep -q "\[x\] \*\*Phase 4" .planning/ROADMAP.md && test -f .planning/phases/04-content-coverage/04-08-SUMMARY.md && test -f .planning/phases/04-content-coverage/04-HUMAN-UAT.md && npx vitest run --no-coverage 2>&1 | tail -3  <verify>
    <automated>grep -c "\[x\] \*\*CONTENT-0" .planning/REQUIREMENTS.md && grep -q "Phase 4.*Complete" .planning/STATE.md && grep -q "\[x\] \*\*Phase 4" .planning/ROADMAP.md && test -f .planning/phases/04-content-coverage/04-08-SUMMARY.md && test -f .planning/phases/04-content-coverage/04-HUMAN-UAT.md && npx vitest run --no-coverage 2>&1 | tail -3</automated>
  </verify>
  <done>REQUIREMENTS.md shows 7 [x] CONTENT-* entries. STATE.md shows Phase 4 complete. ROADMAP.md shows Phase 4 checkbox ticked + success criteria annotated. 04-08-SUMMARY.md + 04-HUMAN-UAT.md files exist. Single atomic commit `content-08: close phase 4 content coverage (CONTENT-01..07 complete)` landed. No rituals/ files staged. Full vitest suite green.</done>
</task>

</tasks>

<verification>
- [ ] `npm run verify-content` exits 0 (aggregate pass across every Phase 4 `.mram`)
- [ ] Full vitest suite green (~535+ tests; Phase 3 baseline of 517 preserved + Phase 4 additions)
- [ ] `.planning/REQUIREMENTS.md` shows CONTENT-01..07 all `[x]` with evidence pointers
- [ ] `.planning/STATE.md` advanced: Phase 4 complete, Phase 5 next, progress counters updated
- [ ] `.planning/ROADMAP.md`: Phase 4 `- [x]`, success criteria annotated, progress table updated
- [ ] `04-08-SUMMARY.md` committed with aggregate metrics, dogfood findings, top-pitfall summary
- [ ] `04-HUMAN-UAT.md` committed with deferred items (UAT-04-01 pilot feedback; UAT-04-02 cross-jurisdiction audit)
- [ ] One atomic commit lands all planning updates (`content-08: close phase 4 ...`)
- [ ] No `rituals/` files staged in git at any point
- [ ] Shannon's `dogfood-green` (or `dogfood-partial`) resume signal received at Task 2
</verification>

<success_criteria>
Phase 4 is structurally complete. Every invited lodge's officer can now rehearse EA + FC + MM + Installation + Shannon's in-scope officer lectures in his lodge's working — every spoken line has pre-baked Opus audio, no live-TTS fallback required for a first-time rehearsal. CONTENT-01 through CONTENT-07 are all `[x]` with cited evidence. The project is ready to transition to Phase 5 (Coach Quality Lift) via `/gsd-transition`.
</success_criteria>

<output>
- `.planning/REQUIREMENTS.md` — 7 CONTENT requirements marked complete with evidence
- `.planning/STATE.md` — Phase 4 complete, Phase 5 next
- `.planning/ROADMAP.md` — Phase 4 ticked, plans listed, criteria annotated
- `.planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md` — Phase Close section added
- `.planning/phases/04-content-coverage/04-08-SUMMARY.md` — aggregate metrics + lessons
- `.planning/phases/04-content-coverage/04-HUMAN-UAT.md` — deferred items tracked
- One atomic commit: `content-08: close phase 4 content coverage (CONTENT-01..07 complete)`
</output>
