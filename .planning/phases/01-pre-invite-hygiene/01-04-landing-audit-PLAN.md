---
phase: 01-pre-invite-hygiene
plan: 03
type: execute
wave: 1
depends_on: [02]
files_modified:
  - public/landing.html
  - .planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md
autonomous: false
requirements: [HYGIENE-04]
must_haves:
  truths:
    - "A human has read all 622 lines of public/landing.html and confirmed no ritual text is present"
    - "A grep blocklist pass has been run and any flagged lines reviewed by the human"
    - "If flagged content was found, it has been redacted; if none, landing.html body is unchanged"
    - "An evidence entry is added to 01-VERIFICATION.md recording the audit outcome"
  artifacts:
    - path: ".planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md"
      provides: "Per-requirement evidence log for Phase 1"
      contains: "HYGIENE-04"
    - path: "public/landing.html"
      provides: "Audited public landing page"
      contains: "name=\"robots\""
  key_links:
    - from: "grep blocklist patterns"
      to: "public/landing.html content"
      via: "ritual-term scan"
      pattern: "(WM|SW|JW|SD|JD|IG|Tyler|obligation|cable-tow|due-guard)"
---

<objective>
Audit public/landing.html to confirm no ritual text is exposed on the one static, world-readable page of the app. If any flagged content is found, redact it; otherwise the file body is left untouched.

Purpose: HYGIENE-04 — landing.html is the single HTML file that is guaranteed to be accessible without authentication (it is the redirect target from `/` in middleware.ts:52). Ritual text leaking here is a catastrophic trust-loss event: the whole invite-only model rests on authentic Masonic text never appearing on a public URL. The audit is belt-and-suspenders to the `name="robots" noindex` meta tag added in plan 01 — even if a crawler obeys noindex, any human who accidentally lands on this page must see only marketing content, never ritual.
Output: Audit evidence in 01-VERIFICATION.md; optional redactions applied to landing.html if needed.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/01-pre-invite-hygiene/01-CONTEXT.md
@.planning/phases/01-pre-invite-hygiene/01-RESEARCH.md
@.planning/phases/01-pre-invite-hygiene/01-PATTERNS.md
@.planning/phases/01-pre-invite-hygiene/01-VALIDATION.md
@public/landing.html

<interfaces>
<!-- The grep blocklist from RESEARCH.md Code Examples (Claude's Discretion per D-08; Shannon reviews before running). -->

Blocklist patterns (run in-order; each produces a line-numbered report):

1. Officer-code tokens and role names (case-insensitive):
   `\b(WM|SW|JW|SD|JD|IG|Tyler|Worshipful|Senior Warden|Junior Warden|Senior Deacon|Junior Deacon|Inner Guard|Marshal|Chaplain|Steward)\b`

2. Generic obligation-language words (case-insensitive — none are themselves ritual text):
   `\b(obligation|due-guard|due guard|cable-tow|cable tow|hoodwink|cabletow|initiation|passing|raising)\b`

3. Cipher-style punctuation (three-letter dot sequences):
   `[a-zA-Z]\.[a-zA-Z]\.[a-zA-Z]`

4. Working-specific title phrases:
   `\b[A-Z][a-z]+ of the [A-Z][a-z]+`
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Run blocklist grep sweep and build a line-numbered report</name>
  <files>(read-only — no file modified)</files>
  <read_first>
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/public/landing.html (for approximate line count — should be ~622)
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-CONTEXT.md (D-08, D-09 — audit method and redaction rule)
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-RESEARCH.md (Code Examples — HYGIENE-04 ritual-term grep blocklist, the four pattern groups)
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-CONTEXT.md (SPECIFICS section — the blocklist itself must not leak ritual text; stick to officer codes and generic obligation-language only)
  </read_first>
  <action>
    Run each of the four blocklist grep patterns against `public/landing.html` and capture results with line numbers. Use the Grep tool (not Bash grep) with output_mode "content" and -n for line numbers.

    Pattern 1 (officer codes / role names, case-insensitive):
    ```
    Grep(pattern="\\b(WM|SW|JW|SD|JD|IG|Tyler|Worshipful|Senior Warden|Junior Warden|Senior Deacon|Junior Deacon|Inner Guard|Marshal|Chaplain|Steward)\\b", path="public/landing.html", -i=true, -n=true, output_mode="content")
    ```

    Pattern 2 (obligation language, case-insensitive):
    ```
    Grep(pattern="\\b(obligation|due-guard|due guard|cable-tow|cable tow|hoodwink|cabletow|initiation|passing|raising)\\b", path="public/landing.html", -i=true, -n=true, output_mode="content")
    ```

    Pattern 3 (cipher punctuation):
    ```
    Grep(pattern="[a-zA-Z]\\.[a-zA-Z]\\.[a-zA-Z]", path="public/landing.html", -n=true, output_mode="content")
    ```

    Pattern 4 (working-specific title phrases):
    ```
    Grep(pattern="\\b[A-Z][a-z]+ of the [A-Z][a-z]+", path="public/landing.html", -n=true, output_mode="content")
    ```

    Build a single consolidated report listing every unique flagged line number. For each flagged line, record: line number, excerpt (1-2 words of surrounding context — do NOT paste the full line if it appears to be ritual text), which pattern flagged it.

    Heuristic for false positives: "Master Mason" matching Pattern 4 is expected in marketing copy ("learn the Master Mason degree"); this is NOT a leak. "WM" matching Pattern 1 as "WMS" inside a JS variable name is NOT a leak. The human reviewer classifies each hit.

    IMPORTANT per SPECIFICS in CONTEXT: the report itself must not copy ritual text into .planning/ artifacts. If Pattern 2 flags what looks like actual obligation wording, record only the line number and pattern name — not the excerpt.
  </action>
  <verify>
    <automated>test -f /home/mcleods777/Masonic-Ritual-AI-Mentor/public/landing.html &amp;&amp; wc -l /home/mcleods777/Masonic-Ritual-AI-Mentor/public/landing.html</automated>
  </verify>
  <acceptance_criteria>
    - All four Grep tool calls have been executed against public/landing.html
    - A consolidated report exists in the task log (to be folded into the VERIFICATION.md entry in task 3)
    - No ritual-text excerpts have been written into .planning/ files during this task (per SPECIFICS: blocklist output must not itself leak)
    - For every flagged line, the report classifies it as: (a) false positive — marketing copy, (b) ambiguous — needs human judgment, or (c) clear leak — redact
  </acceptance_criteria>
  <done>Grep sweep complete; consolidated line-numbered flagged-hits report ready for human review in task 2.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Human audit — Shannon reviews grep hits and does a full read-through</name>
  <files>(read-only review + optional edits to public/landing.html)</files>
  <read_first>
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/public/landing.html (ALL 622 lines — human read-through per D-08; the file is ~622 lines; use Read with appropriate offset/limit chunks if needed)
    - The consolidated grep-hit report from Task 1 (in the task log)
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-CONTEXT.md (D-09 — keep current marketing copy; redact only flagged content; do NOT pre-emptively shrink)
  </read_first>
  <what-built>
    Task 1 produced a line-numbered list of every grep hit across the four blocklist patterns. Task 2 asks the human to:
    1. Read the full file (landing.html is 622 lines — primarily a canvas-based marketing page with inline JS/CSS).
    2. Review each flagged line in the report and classify as false positive (marketing) or real leak (ritual text).
    3. If any real leaks are identified, redact them in-place (Claude performs the edit under human direction; Shannon approves).
    4. Confirm that the noindex `<meta>` tag added by plan 01 is still present in <head>.
  </what-built>
  <how-to-verify>
    1. Review the grep-hit report below (produced by Task 1).
    2. For each flagged hit, say either "false positive, marketing copy" or "redact — real leak" with the proposed replacement text.
    3. If any real leaks exist, Claude applies the redaction edits to public/landing.html. Shannon re-verifies after each edit.
    4. Confirm `grep 'name="robots" content="noindex, nofollow"' public/landing.html` returns exactly 1 match (the meta tag added by plan 01 is intact).
    5. Approve the audit outcome (one of: "clean — no redactions needed" / "redacted lines X, Y, Z — now clean").
  </how-to-verify>
  <resume-signal>
    Type "clean" if no redactions needed.
    Type "redacted: line N replaced with '<new text>'" for each redaction performed and approved.
    Type "reject" if the audit reveals a larger issue requiring a different approach (e.g., landing.html needs rewriting — out of scope for Phase 1, escalate).
  </resume-signal>
</task>

<task type="auto">
  <name>Task 3: Create 01-VERIFICATION.md with HYGIENE-04 evidence and commit</name>
  <files>.planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md, public/landing.html (only if task 2 required redactions)</files>
  <read_first>
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-PATTERNS.md (section 3 — VERIFICATION.md structural template with frontmatter and per-HYGIENE entry format)
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-VALIDATION.md (frontmatter style reference)
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-CONTEXT.md (D-20, D-21 — commit style and phase-done gate)
  </read_first>
  <action>
    Create the new file `.planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md` with this exact structure (note: this is the phase-wide evidence log; subsequent plans append to it, they do not re-create it):

    ```markdown
    ---
    phase: 1
    slug: pre-invite-hygiene
    status: in-progress
    created: YYYY-MM-DD
    last_updated: YYYY-MM-DD
    ---

    # Phase 1 — Verification Evidence

    One entry per HYGIENE-XX as verifications land. Phase-done gate (D-21)
    fires when all seven entries are green AND `npm run build` +
    `npm run test:run` both pass.

    ## HYGIENE-01 — Dead-package removal
    **Status:** ⬜ pending
    **Date:** —
    **Evidence:** —

    ## HYGIENE-02 — AI SDK v6 codemod
    **Status:** ⬜ pending
    **Date:** —
    **Evidence:** —

    ## HYGIENE-03 — X-Robots-Tag noindex app-wide
    **Status:** ⬜ code landed / ⏳ preview-curl evidence pending (plan 05)
    **Date:** YYYY-MM-DD (plan 01 commit)
    **Evidence:** SECURITY_HEADERS extended in next.config.ts; `<meta name="robots" content="noindex, nofollow">` inline in public/landing.html. `npm run build` + `npm run test:run` green. Preview-deploy curl evidence to be collected when plan 05 runs against a preview.

    ## HYGIENE-04 — Landing.html audit
    **Status:** ✅ verified
    **Date:** YYYY-MM-DD
    **Evidence:** Blocklist grep sweep (4 patterns from RESEARCH.md Code Examples) run against public/landing.html — <N> raw hits. Human review by Shannon: <M> false positives (marketing copy), <K> redactions applied. Full 622-line human read-through completed. No ritual text remains on the public surface.
    <If redactions:> Redactions applied at line(s): <list>. Old text not recorded here per SPECIFICS (blocklist output must not leak ritual text).

    ## HYGIENE-05 — iPhone magic-link end-to-end
    **Status:** ⬜ pending
    **Date:** —
    **Evidence:** —

    ## HYGIENE-06 — Middleware matcher regression test
    **Status:** ✅ verified
    **Date:** YYYY-MM-DD (plan 02 commit)
    **Evidence:** `src/__tests__/middleware.test.ts` created with 6 assertions covering flat/nested/hyphenated `.mram` paths, positive-control sanity, and bounds check. `npm run test:run` exits 0.

    ## HYGIENE-07 — Secret-rotation runbook rehearsed
    **Status:** ⬜ pending
    **Date:** —
    **Evidence:** —
    ```

    Fill in actual dates (today) for HYGIENE-03, HYGIENE-04, and HYGIENE-06 entries that already have code/evidence banked. Leave HYGIENE-01, 02, 05, 07 as pending (later plans fill them in).

    If task 2 applied any redactions to landing.html, include them in the commit. If task 2 confirmed "clean — no redactions needed", public/landing.html is not in this commit.

    Commit per D-20:

    ```
    git add .planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md
    # If redactions applied in task 2, also:
    # git add public/landing.html
    git commit -m "hygiene-04: audit landing.html; create verification evidence log"
    ```

    The commit message covers both the audit outcome and the VERIFICATION.md scaffolding (first appearance of that file). If redactions were applied, optionally note that inline: `hygiene-04: audit landing.html (N redactions); create verification log`.
  </action>
  <verify>
    <automated>cd /home/mcleods777/Masonic-Ritual-AI-Mentor && test -f .planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md &amp;&amp; grep -c "^## HYGIENE-" .planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md</automated>
  </verify>
  <acceptance_criteria>
    - File `.planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md` exists
    - `grep -c '^## HYGIENE-' 01-VERIFICATION.md` returns exactly `7` (one section per requirement)
    - The HYGIENE-04 entry has Status `✅ verified` with a date
    - The HYGIENE-03 and HYGIENE-06 entries reference the prior plans' commits with evidence
    - The file has frontmatter (phase, slug, status, created, last_updated)
    - `git log -1 --format=%s` starts with `hygiene-04:`
    - `git status` shows working tree clean
    - If redactions applied: `grep 'name="robots" content="noindex, nofollow"' public/landing.html` still returns 1 match (the meta tag added by plan 01 is preserved)
  </acceptance_criteria>
  <done>01-VERIFICATION.md exists with seven HYGIENE sections; HYGIENE-04 marked verified; commit lands cleanly.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| World (unauthenticated) → public/landing.html | landing.html is reachable at /landing.html on any deploy with zero auth. Any ritual text here is world-readable. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-1-03 | Information Disclosure | public/landing.html | mitigate | Four-pattern grep blocklist (officer codes, obligation language, cipher punctuation, working-specific titles) combined with full human read-through (D-08). Redact any flagged ritual text in-place without shrinking marketing copy (D-09). |
| T-1-03a | Information Disclosure | .planning/ VERIFICATION.md | mitigate | Per SPECIFICS in CONTEXT: the blocklist itself and any redaction excerpt MUST NOT copy ritual text into .planning/ artifacts — record line numbers and pattern names only. VERIFICATION.md evidence entry stays generic. |
</threat_model>

<verification>
Automated: Task 3's acceptance criteria (file exists, seven sections, HYGIENE-04 verified).
Human-gated: Task 2 requires Shannon to sign off that the audit is clean (or approve applied redactions). This is why `autonomous: false` — no executor can self-verify that marketing copy is free of ritual text without human judgment.
</verification>

<success_criteria>
- 01-VERIFICATION.md exists with sections for all seven HYGIENE requirements
- HYGIENE-04 marked ✅ verified with audit evidence
- HYGIENE-03 and HYGIENE-06 entries cross-link their prior-plan commits
- landing.html still has the noindex meta tag from plan 01
- One commit `hygiene-04: ...` on main
</success_criteria>

<output>
After completion, create `.planning/phases/01-pre-invite-hygiene/01-04-landing-audit-SUMMARY.md` per template. Note whether redactions were applied (high-level count only, no ritual text).
</output>
