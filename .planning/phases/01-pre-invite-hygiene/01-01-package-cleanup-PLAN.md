---
phase: 01-pre-invite-hygiene
plan: 07
type: execute
wave: 1
depends_on: [06]
files_modified:
  - package.json
  - package-lock.json
  - .planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md
autonomous: true
requirements: [HYGIENE-01]
must_haves:
  truths:
    - "The four dead packages — `natural`, `uuid`, `@ai-sdk/react`, and `@types/uuid` — are absent from package.json dependencies and devDependencies"
    - "No source file imports from any of the four removed packages (grep confirms)"
    - "`npm run build` succeeds post-removal"
    - "`npm run test:run` passes post-removal"
    - "The production bundle no longer ships code paths for the four removed packages"
  artifacts:
    - path: "package.json"
      provides: "Cleaned dependency list"
      contains: "\"dependencies\":"
  key_links:
    - from: "package.json"
      to: "production bundle"
      via: "Next.js tree-shake of absent deps"
      pattern: "natural|uuid|@ai-sdk/react|@types/uuid"
---

<objective>
Remove the four known-dead packages from package.json and node_modules so the production bundle stops shipping code paths the app does not use. This is the final task in Phase 1 — if any earlier task left a subtle dependency behind, this is where it surfaces.

Purpose: HYGIENE-01 — `natural`, `uuid`, `@ai-sdk/react`, and `@types/uuid` have zero imports anywhere in the codebase (verified in RESEARCH D-15/D-16b; re-verified in plan 06 Task 1). They were either added speculatively or left behind when the pilot pivoted. Removing them reduces install size, eliminates dead code shipped to clients, and removes false signals for future contributors.
Output: Four fewer entries in package.json; build + test green; one atomic `hygiene-01:` commit; Phase 1 done gate eligible (D-21).
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
<!-- Packages to remove (from CONTEXT D-14 — exact list, no additions): -->

dependencies:
- `natural` (NLP toolkit — never imported)
- `uuid` (replaced by `crypto.randomUUID()`)
- `@ai-sdk/react` (React hook bindings — never used)

devDependencies:
- `@types/uuid` (types for removed `uuid`)

DO NOT remove:
- `@ai-sdk/anthropic` — retained for Phase 5 COACH-02 feedback route rewrite
- `ai` — retained for Phase 5 COACH-02 feedback route rewrite
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Pre-flight grep verification — confirm zero imports of the four packages</name>
  <files>(read-only verification)</files>
  <read_first>
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-CONTEXT.md (D-14 — exact 4-package removal list; D-15 — grep-before-uninstall invariant)
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-RESEARCH.md (Removed by HYGIENE-01 table — expected zero matches)
  </read_first>
  <action>
    Run four Grep tool calls to reconfirm zero imports exist before `npm uninstall` per D-15:

    1. `Grep(pattern="from ['\"]natural['\"]", path="/home/mcleods777/Masonic-Ritual-AI-Mentor", glob="{src,scripts,public}/**/*.{ts,tsx,js,jsx,mjs,cjs}", output_mode="files_with_matches")` — expected: empty.
    2. `Grep(pattern="from ['\"]uuid['\"]", path="/home/mcleods777/Masonic-Ritual-AI-Mentor", glob="{src,scripts,public}/**/*.{ts,tsx,js,jsx,mjs,cjs}", output_mode="files_with_matches")` — expected: empty.
    3. `Grep(pattern="from ['\"]@ai-sdk/react['\"]", path="/home/mcleods777/Masonic-Ritual-AI-Mentor", glob="{src,scripts,public}/**/*.{ts,tsx,js,jsx,mjs,cjs}", output_mode="files_with_matches")` — expected: empty.
    4. Also check dynamic `require()` patterns: `Grep(pattern="require\\(['\"](natural|uuid|@ai-sdk/react)['\"]\\)", path="/home/mcleods777/Masonic-Ritual-AI-Mentor", glob="{src,scripts}/**/*.{ts,tsx,js,jsx,mjs,cjs}", output_mode="files_with_matches")` — expected: empty.

    @types/uuid does not need an import check — it is a TypeScript type package and is orphaned by removing uuid.

    If ANY of the four greps returns a match, STOP. Re-read CONTEXT D-14/D-15 — the assumption is zero imports. Report the specific file and import; do NOT run `npm uninstall`. Wait for plan rework.
  </action>
  <verify>
    <automated>cd /home/mcleods777/Masonic-Ritual-AI-Mentor &amp;&amp; ! grep -rE "from ['\"](natural|uuid|@ai-sdk/react)['\"]" src/ scripts/ public/ 2>/dev/null &amp;&amp; ! grep -rE "require\\(['\"](natural|uuid|@ai-sdk/react)['\"]\\)" src/ scripts/ 2>/dev/null</automated>
  </verify>
  <acceptance_criteria>
    - All four Grep calls return zero matches
    - If any match is found, task has STOPPED and reported back (NOT proceeded to uninstall)
  </acceptance_criteria>
  <done>Confirmed zero imports of `natural`, `uuid`, `@ai-sdk/react`; safe to uninstall all four.</done>
</task>

<task type="auto">
  <name>Task 2: Run `npm uninstall` for the four packages and verify build + test</name>
  <files>package.json, package-lock.json</files>
  <read_first>
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/package.json (current state — confirm all four packages are present before attempting removal)
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-CONTEXT.md (D-14, D-17, D-20 — removal list, run-after-codemod ordering, commit style)
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-RESEARCH.md (Code Examples — HYGIENE-01 block with exact verification commands)
  </read_first>
  <action>
    Run the uninstall command exactly as written (per RESEARCH Code Examples):

    ```bash
    npm uninstall natural uuid @ai-sdk/react @types/uuid
    ```

    This updates both package.json and package-lock.json.

    Verify post-state:

    ```bash
    npm ls natural 2>&1 | head -3
    npm ls uuid 2>&1 | head -3
    npm ls @ai-sdk/react 2>&1 | head -3
    npm ls @types/uuid 2>&1 | head -3

    npm run build
    npm run test:run
    ```

    Expected: `npm ls <pkg>` for each of the four returns "empty" or "not found". If any still shows a version number, investigate before committing.

    Confirm the RETAINED packages are still there:
    ```bash
    node -e "const p=require('./package.json'); console.log('ai:', p.dependencies.ai, '@ai-sdk/anthropic:', p.dependencies['@ai-sdk/anthropic']);"
    ```
    Should print `ai: ^6.x` and `@ai-sdk/anthropic: ^3.x` (left there by plan 06).

    Do NOT manually edit package.json. Do NOT touch any other dependency. Do NOT run `npm audit fix` or `npm update`.
  </action>
  <verify>
    <automated>cd /home/mcleods777/Masonic-Ritual-AI-Mentor &amp;&amp; ! grep -E "\"(natural|uuid|@ai-sdk/react|@types/uuid)\":" package.json &amp;&amp; npm run build &amp;&amp; npm run test:run</automated>
  </verify>
  <acceptance_criteria>
    - `grep -E "\"(natural|uuid|@ai-sdk/react|@types/uuid)\":" package.json` returns zero matches
    - `npm ls natural`, `npm ls uuid`, `npm ls @ai-sdk/react`, `npm ls @types/uuid` each report "empty" or "not found"
    - `npm run build` exits 0
    - `npm run test:run` exits 0
    - `@ai-sdk/anthropic` and `ai` are still in package.json dependencies (preserved for Phase 5 per D-14)
    - `git diff` shows only package.json and package-lock.json changed (no src/ or scripts/ changes)
  </acceptance_criteria>
  <done>Four packages removed from package.json; build + test green; retained packages intact.</done>
</task>

<task type="auto">
  <name>Task 3: Update VERIFICATION.md HYGIENE-01 entry; run Phase 1 done-gate check; commit</name>
  <files>.planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md, package.json, package-lock.json</files>
  <read_first>
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md (current state — should have six prior HYGIENE entries marked verified)
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-CONTEXT.md (D-20 commit style; D-21 — Phase-done gate criteria)
  </read_first>
  <action>
    Update `.planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md` HYGIENE-01 entry:

    ```markdown
    ## HYGIENE-01 — Dead-package removal
    **Status:** ✅ verified
    **Date:** YYYY-MM-DD
    **Evidence:** `npm uninstall natural uuid @ai-sdk/react @types/uuid` ran cleanly. Post-state: all four packages absent from package.json (grep returns zero matches); `npm ls` reports "empty" for each. `npm run build` + `npm run test:run` both exit 0. `@ai-sdk/anthropic` and `ai` preserved at `^3.x` / `^6.x` respectively per CONTEXT D-14.
    ```

    Update frontmatter `last_updated` to today. Flip `status` from `in-progress` to `complete` if and only if all seven HYGIENE entries are `✅ verified`:

    ```yaml
    ---
    phase: 1
    slug: pre-invite-hygiene
    status: complete
    created: YYYY-MM-DD
    last_updated: YYYY-MM-DD
    ---
    ```

    **Phase-done gate check (D-21) — verify BEFORE committing:**
    - `npm run build` exits 0
    - `npm run test:run` exits 0
    - VERIFICATION.md has `✅ verified` on ALL SEVEN HYGIENE entries

    If any entry is still pending (e.g., HYGIENE-05 blocked on iPhone), do NOT flip status to `complete`. Leave as `in-progress` and note in the commit.

    Commit per D-20:

    ```
    git add package.json package-lock.json .planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md
    git commit -m "hygiene-01: remove dead packages (natural, uuid, @ai-sdk/react, @types/uuid)"
    ```

    Commit message is short, imperative, lowercase, `hygiene-01:` prefixed, names the four removed packages explicitly.
  </action>
  <verify>
    <automated>cd /home/mcleods777/Masonic-Ritual-AI-Mentor &amp;&amp; git log -1 --format=%s | grep -E "^hygiene-01:" &amp;&amp; grep -c "Status:\\*\\* ✅ verified" .planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md &amp;&amp; npm run build &amp;&amp; npm run test:run</automated>
  </verify>
  <acceptance_criteria>
    - `git log -1 --format=%s` starts with `hygiene-01:`
    - `git diff HEAD~1 --name-only` lists exactly package.json, package-lock.json, and .planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md
    - VERIFICATION.md HYGIENE-01 entry status is `✅ verified` with date
    - `grep -c "Status:\\*\\* ✅ verified" 01-VERIFICATION.md` returns 7 (all seven HYGIENE entries verified) — or fewer if any prior entry is pending, in which case frontmatter status stays `in-progress`
    - `npm run build` exits 0
    - `npm run test:run` exits 0
    - `git status` shows working tree clean
  </acceptance_criteria>
  <done>One commit `hygiene-01: ...` on main; package.json cleaned; Phase 1 done gate achieved (or blocked with reason recorded).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| npm dependency surface → production bundle | Every package listed in dependencies ships its code (or a subset) to the client. Dead packages expand the attack surface for supply-chain compromises and slow down `npm install`. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-1-07 | Information Disclosure (supply-chain) / Bundle bloat | package.json dependencies | mitigate | Remove `natural`, `uuid`, `@ai-sdk/react`, `@types/uuid` — all verified unused via grep (Task 1). Reduces the supply-chain surface by four packages plus transitives. |
| T-1-07a | Regression (accidental removal of live dep) | package.json | mitigate | Task 1 grep verification is mandatory before `npm uninstall` runs. Task 2 `npm run build` + `npm run test:run` fail if any removed package was actually in use. |
| T-1-07b | Future re-add (drift) | package.json | accept | No CI check enforces the banned list. Deferred to post-v1 per CONTEXT Deferred Ideas. Grep-on-PR covers it manually at pilot scale. |
</threat_model>

<verification>
Automated (Task 2 + Task 3):
- Four packages absent from package.json (grep zero matches)
- `npm run build` exits 0
- `npm run test:run` exits 0
- `@ai-sdk/anthropic` and `ai` preserved
- VERIFICATION.md HYGIENE-01 marked ✅ verified
- Phase-done gate (D-21) evaluated: all seven entries verified → frontmatter flipped to `complete`
</verification>

<success_criteria>
- `natural`, `uuid`, `@ai-sdk/react`, `@types/uuid` absent from package.json
- `@ai-sdk/anthropic` and `ai` retained
- `npm run build` + `npm run test:run` both green
- VERIFICATION.md has all seven HYGIENE entries marked ✅ verified (assuming prior plans complete)
- One commit `hygiene-01: ...` on main
- Phase 1 done gate (D-21) achieved: seven atomic commits, all verification evidence recorded, build + test green
</success_criteria>

<output>
After completion, create `.planning/phases/01-pre-invite-hygiene/01-01-package-cleanup-SUMMARY.md` per template.

If this plan completes the phase successfully (D-21 gate met), the SUMMARY should note that Phase 1 is now done and Phase 2 (Safety Floor) is unblocked.
</output>
