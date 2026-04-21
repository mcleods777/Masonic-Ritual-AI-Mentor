---
phase: 01-pre-invite-hygiene
plan: 06
type: execute
wave: 1
depends_on: [05]
files_modified:
  - package.json
  - package-lock.json
  - .planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md
autonomous: true
requirements: [HYGIENE-02]
must_haves:
  truths:
    - "The `@ai-sdk/codemod@3.0.4 v6` command has been run against src/ and scripts/ without errors"
    - "package.json shows `ai` on a `^6.x` range and `@ai-sdk/anthropic` on a `^3.x` range (current latest at time of execution)"
    - "`npm run build` succeeds post-codemod"
    - "`npm run test:run` passes post-codemod"
    - "Zero source-code changes were made (the codebase has zero `ai` imports today per RESEARCH D-16b; codemod is effectively a version bump)"
  artifacts:
    - path: "package.json"
      provides: "Updated AI SDK version ranges"
      contains: "\"ai\":"
  key_links:
    - from: "HYGIENE-02 codemod"
      to: "Phase 5 COACH-02 feedback route rewrite"
      via: "v6 idioms available when /api/rehearsal-feedback is rewritten"
      pattern: "ai.*\\^6"
---

<objective>
Run the Vercel AI SDK v6 codemod so the toolchain is aligned with v6 conventions before Phase 5 (COACH-02) rewrites `/api/rehearsal-feedback` using `generateObject({ schema })` behind Vercel AI Gateway.

Purpose: HYGIENE-02 — per RESEARCH D-16b, the current codebase has zero `ai`, `@ai-sdk/anthropic`, or `@ai-sdk/react` imports. The codemod is effectively a package.json version bump with no source-code transformation. The value is in (a) proving the v6 toolchain runs clean against this repo, (b) bumping the AI SDK dependency to `^6.x` so future code can use v6 APIs idiomatically, and (c) getting the scaffolding in place before Phase 5 exercises v6 for real.
Output: package.json + package-lock.json updated; `npm run build` + `npm run test:run` still green; one atomic `hygiene-02:` commit.
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
@package.json

<interfaces>
<!-- Current dependency state (package.json lines 13-27): -->

```json
"dependencies": {
  "@ai-sdk/anthropic": "^3.0.44",
  "@ai-sdk/react": "^3.0.88",      <!-- removed by plan 07 -->
  "ai": "^6.0.86",
  ...
}
```

Target post-codemod state (per RESEARCH Code Examples):
```json
"dependencies": {
  "@ai-sdk/anthropic": "^3.0.71",   <!-- or whatever is latest on run day -->
  "@ai-sdk/react": "^3.0.88",       <!-- still present until plan 07 -->
  "ai": "^6.0.168",                 <!-- or whatever is latest on run day -->
  ...
}
```

Note: `@ai-sdk/react` stays in this plan — plan 07 (HYGIENE-01) removes it and the three other dead packages. Do NOT remove it here.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Pre-flight grep to reconfirm zero ai / @ai-sdk/* imports</name>
  <files>(read-only verification)</files>
  <read_first>
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-CONTEXT.md (D-15, D-16, D-16b — pre-check semantics, expected zero imports)
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-RESEARCH.md (D-16b — confirmed zero imports at research time; re-verify before running codemod)
  </read_first>
  <action>
    Before running the codemod, reconfirm that no `ai` / `@ai-sdk/*` imports have been added since research (2026-04-20). Use Grep tool (not Bash grep):

    1. Search src/: `Grep(pattern="from ['\"](\\bai\\b|@ai-sdk/)", path="src/", output_mode="files_with_matches")` — expected: no matches.
    2. Search scripts/: `Grep(pattern="from ['\"](\\bai\\b|@ai-sdk/)", path="scripts/", output_mode="files_with_matches")` — expected: no matches.
    3. Search public/: `Grep(pattern="from ['\"](\\bai\\b|@ai-sdk/)", path="public/", output_mode="files_with_matches")` — expected: no matches (defense check — .html doesn't import JS modules this way, but confirm).

    If any imports are found, STOP. Re-read RESEARCH.md D-16b and CONTEXT D-16 — the plan assumes zero imports. If this assumption is wrong, the task needs to be reworked to also handle source-code migration (which RESEARCH did not expect to need and did not plan for). Escalate and pause the phase.

    If all three greps return empty, proceed to Task 2.
  </action>
  <verify>
    <automated>cd /home/mcleods777/Masonic-Ritual-AI-Mentor &amp;&amp; ! grep -rE "from ['\"](\\bai\\b|@ai-sdk/)" src/ scripts/ public/ 2>/dev/null</automated>
  </verify>
  <acceptance_criteria>
    - Grep across src/, scripts/, public/ for `from "ai"` or `from "@ai-sdk/..."` returns zero matches
    - If any match is found, task has STOPPED and reported back for plan rework (NOT proceeded to codemod)
  </acceptance_criteria>
  <done>Confirmed zero `ai` / `@ai-sdk/*` imports; safe to treat codemod as a pure version bump.</done>
</task>

<task type="auto">
  <name>Task 2: Run the AI SDK v6 codemod and bump AI SDK versions</name>
  <files>package.json, package-lock.json</files>
  <read_first>
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/package.json (current dependency versions)
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-RESEARCH.md (Common Pitfalls #1 — correct codemod syntax; Code Examples — exact commands)
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-CONTEXT.md (D-16, D-16b — version-pinned codemod command, hand-fix rule if anything breaks)
  </read_first>
  <action>
    Run the codemod exactly as specified (NOT the malformed form from the original CONTEXT D-16 — use the RESEARCH-corrected form):

    ```bash
    npx --yes @ai-sdk/codemod@3.0.4 v6 src/ scripts/
    ```

    Per RESEARCH Common Pitfalls #1: version-pinned (`@3.0.4`), correct subcommand (`v6`, not `upgrade v6`), explicit source paths (`src/ scripts/`). This runs ONLY v5→v6 codemods over those directories. Does NOT touch package.json.

    Expected output: `Starting v6 codemods...` followed by `v6 codemods complete.` (possibly with zero files changed per D-16b). If output says `Starting upgrade...` instead, the command was typed wrong — re-read and fix.

    Then bump the AI SDK dependency versions (the `v6` subcommand does NOT modify package.json — the `upgrade` subcommand does, but RESEARCH recommends the explicit version-bump over the implicit bump for a cleaner audit trail):

    ```bash
    npm install ai@^6.0.168 @ai-sdk/anthropic@^3.0.71
    ```

    (Use the exact version numbers from RESEARCH Code Examples. If by the time this runs a newer version exists, use the current latest — the `^` range will accept subsequent patch releases. Check with `npm view ai version` and `npm view @ai-sdk/anthropic version` to confirm current-latest before running.)

    Verify:
    ```bash
    npm run build
    npm run test:run
    ```

    Both must exit 0. If `npm run build` fails, per D-16: review the diff and fix by hand in THIS commit — do NOT revert and defer. Expected outcome given zero source imports: build and test pass with no changes needed.

    Confirm post-state:
    ```bash
    node -e "const p=require('./package.json'); console.log('ai:', p.dependencies.ai, '@ai-sdk/anthropic:', p.dependencies['@ai-sdk/anthropic']);"
    ```

    Should print `ai: ^6.0.168` (or newer) and `@ai-sdk/anthropic: ^3.0.71` (or newer).

    Do NOT remove `@ai-sdk/react`, `natural`, `uuid`, or `@types/uuid` in this plan. Those are plan 07 (HYGIENE-01).
  </action>
  <verify>
    <automated>cd /home/mcleods777/Masonic-Ritual-AI-Mentor &amp;&amp; npm run build &amp;&amp; npm run test:run &amp;&amp; node -e "const p=require('./package.json'); const ai=p.dependencies.ai; const anth=p.dependencies['@ai-sdk/anthropic']; if (!ai.startsWith('^6.')) { console.error('ai not on ^6 range:', ai); process.exit(1); } if (!anth.startsWith('^3.')) { console.error('@ai-sdk/anthropic not on ^3 range:', anth); process.exit(1); } console.log('ok', ai, anth);"</automated>
  </verify>
  <acceptance_criteria>
    - `package.json` `dependencies.ai` starts with `^6.`
    - `package.json` `dependencies["@ai-sdk/anthropic"]` starts with `^3.`
    - `npm run build` exits 0
    - `npm run test:run` exits 0
    - `git diff src/ scripts/ public/` shows zero source-file changes (per D-16b expectation — codemod is a no-op on source)
    - `git diff package.json` shows only the version-range bumps (no removed keys, no added keys beyond possibly new transitive entries)
    - `@ai-sdk/react` is still present in package.json (removed by plan 07, not here)
  </acceptance_criteria>
  <done>package.json has bumped AI SDK versions; build + test green; zero source changes.</done>
</task>

<task type="auto">
  <name>Task 3: Update VERIFICATION.md HYGIENE-02 entry and commit</name>
  <files>.planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md, package.json, package-lock.json</files>
  <read_first>
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md (current state)
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-CONTEXT.md (D-20 commit style)
  </read_first>
  <action>
    Update `.planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md` HYGIENE-02 entry:

    ```markdown
    ## HYGIENE-02 — AI SDK v6 codemod
    **Status:** ✅ verified
    **Date:** YYYY-MM-DD
    **Evidence:** Ran `npx @ai-sdk/codemod@3.0.4 v6 src/ scripts/` — v6 codemods complete, zero source files changed (expected per CONTEXT D-16b: codebase has no `ai` or `@ai-sdk/*` imports). Bumped dependencies: `ai` to `<observed range>`, `@ai-sdk/anthropic` to `<observed range>`. `npm run build` + `npm run test:run` both exit 0. Phase 5 COACH-02 will be the first consumer of v6 idioms when `/api/rehearsal-feedback` is rewritten.
    ```

    Update frontmatter `last_updated` to today.

    Commit per D-20 with EVERYTHING from this plan in one atomic commit:

    ```
    git add package.json package-lock.json .planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md
    git commit -m "hygiene-02: run ai-sdk v6 codemod, bump ai to ^6 and @ai-sdk/anthropic to ^3"
    ```

    Commit message is short, imperative, lowercase, prefixed with `hygiene-02:`. Do NOT include `src/` or `scripts/` in the diff — they should be unchanged per Task 2 acceptance criteria.
  </action>
  <verify>
    <automated>cd /home/mcleods777/Masonic-Ritual-AI-Mentor &amp;&amp; git log -1 --format=%s | grep -E "^hygiene-02:" &amp;&amp; git diff HEAD~1 --name-only | sort &amp;&amp; grep -A2 "HYGIENE-02" .planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md | grep -c "✅ verified"</automated>
  </verify>
  <acceptance_criteria>
    - `git log -1 --format=%s` starts with `hygiene-02:`
    - `git diff HEAD~1 --name-only` lists exactly: `.planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md`, `package-lock.json`, `package.json` (no src/ or scripts/ changes)
    - VERIFICATION.md HYGIENE-02 status is `✅ verified` with date
    - VERIFICATION.md HYGIENE-02 evidence names the specific SDK versions installed
    - `npm run build` exits 0 (re-run after commit — sanity)
    - `npm run test:run` exits 0
    - `git status` shows working tree clean
  </acceptance_criteria>
  <done>One atomic commit on main with `hygiene-02:` prefix; package.json version-bumped; build + test green; VERIFICATION.md updated.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Codemod tool → app source | The codemod is a jscodeshift wrapper that rewrites source files automatically. A malformed codemod could silently break the build. Mitigation: RESEARCH confirms zero `ai` imports exist, so there is nothing for the codemod to rewrite — it's a version-bump no-op. |
| Upgraded AI SDK version → future code | A major version bump (v5→v6) changes API surface. Any future `ai` import after this plan lands must use v6 APIs. Mitigation: Phase 5 COACH-02 is the first consumer and is planned with v6 idioms (`generateObject({ schema })` pattern) from the start. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-1-06 | Build integrity (codemod breakage) | package.json, src/, scripts/ | mitigate | Build and test must pass after codemod (D-21 gate). If codemod breaks anything, hand-fix in the same commit per D-16 — no revert-and-defer. Pre-flight grep in Task 1 confirms no source code would be rewritten, so risk is minimal. |
| T-1-06a | Version drift (subsequent npm installs) | dependency ranges | accept | `^6.x` range accepts all v6 patch and minor releases. Any breaking change within v6 (shouldn't occur per semver) would surface in CI builds after the fact. Phase 5 COACH-02 exercises the real v6 API and provides the earliest signal. |
</threat_model>

<verification>
Automated (Task 2 + Task 3 acceptance criteria):
- `npm run build` exits 0
- `npm run test:run` exits 0
- package.json has `ai@^6.x` and `@ai-sdk/anthropic@^3.x`
- Zero source changes in src/ or scripts/
- VERIFICATION.md HYGIENE-02 entry updated
- One `hygiene-02:` commit on main
</verification>

<success_criteria>
- Codemod ran successfully with `v6` subcommand (not `upgrade v6`)
- `ai` dependency bumped to `^6.x` range; `@ai-sdk/anthropic` bumped to `^3.x` range
- `@ai-sdk/react` still present (removed by next plan)
- `npm run build` + `npm run test:run` both green
- Zero source-file changes (per D-16b expectation)
- VERIFICATION.md HYGIENE-02 marked ✅ verified
- One commit `hygiene-02: ...` on main
</success_criteria>

<output>
After completion, create `.planning/phases/01-pre-invite-hygiene/01-02-ai-sdk-codemod-SUMMARY.md` per template. Note the exact installed versions.
</output>
