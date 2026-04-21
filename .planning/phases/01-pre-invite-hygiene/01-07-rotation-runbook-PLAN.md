---
phase: 01-pre-invite-hygiene
plan: 04
type: execute
wave: 1
depends_on: [03]
files_modified:
  - docs/runbooks/SECRET-ROTATION.md
  - .planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md
autonomous: false
requirements: [HYGIENE-07]
must_haves:
  truths:
    - "A Markdown runbook exists at docs/runbooks/SECRET-ROTATION.md covering rotation of BOTH RITUAL_CLIENT_SECRET and JWT_SECRET"
    - "The runbook uses `vercel env update` (atomic) rather than `vercel env rm` + `vercel env add`"
    - "The runbook explicitly calls out that JWT_SECRET rotation invalidates every live pilot-session cookie as expected signal, not bug"
    - "Shannon has rehearsed the runbook end-to-end against a Vercel preview deploy and confirmed every step executes cleanly"
    - "The runbook accounts for the two known Vercel CLI footguns: preview-branch required for env add, and trailing-newline capture in piped values"
  artifacts:
    - path: "docs/runbooks/SECRET-ROTATION.md"
      provides: "Operational runbook for secret rotation"
      contains: "vercel env update"
      min_lines: 80
    - path: "docs/runbooks/"
      provides: "New runbooks folder for Phase 1+ ops docs"
  key_links:
    - from: "docs/runbooks/SECRET-ROTATION.md"
      to: "Shannon's rehearsal on Vercel preview deploy"
      via: "end-to-end execution of the runbook"
      pattern: "vercel env update.*preview"
---

<objective>
Write a complete, rehearsed secret-rotation runbook so Shannon has a practiced playbook before sending any outside invitation — and so a real rotation does not need to be improvised against a clock.

Purpose: HYGIENE-07 — both RITUAL_CLIENT_SECRET and JWT_SECRET are authentication gates for the pilot. Without a rehearsed procedure, rotation is a guaranteed panic event (env var briefly unset, sessions silently invalidated, magic-link emails broken). The runbook covers both secrets, uses `vercel env update` (atomic), explicitly flags the JWT_SECRET → cookie-invalidation signal, and is proven by actually running it end-to-end against a preview deploy (D-04).
Output: `docs/runbooks/SECRET-ROTATION.md` (new file, new folder) + VERIFICATION.md entry confirming Shannon's rehearsal.
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
@docs/BAKE-WORKFLOW.md

<interfaces>
<!-- The canonical Vercel CLI command shapes verified in RESEARCH.md. -->

Atomic production rotation (from RESEARCH Code Examples):
```bash
printf "%s" "<NEW_RITUAL_CLIENT_SECRET>" | vercel env update RITUAL_CLIENT_SECRET production --yes
printf "%s" "<NEW_JWT_SECRET>" | vercel env update JWT_SECRET production --yes
vercel deploy --prod
```

Preview-branch rehearsal (D-04 — note branch arg is REQUIRED per project memory):
```bash
printf "%s" "<TEST_RITUAL_SECRET>" | vercel env add RITUAL_CLIENT_SECRET preview rotation-rehearsal
printf "%s" "<TEST_JWT>" | vercel env add JWT_SECRET preview rotation-rehearsal
git push origin rotation-rehearsal
# (wait for preview deploy; test sign-in)
vercel env rm RITUAL_CLIENT_SECRET preview rotation-rehearsal --yes
vercel env rm JWT_SECRET preview rotation-rehearsal --yes
```

Known footguns (from project memory — must appear in runbook):
- Trailing newline: `cat file | vercel env add` captures the file's trailing `\n` into the value. Use `printf "%s"` (no `\n`) or interactive prompt.
- Preview requires explicit branch: `vercel env add NAME preview` without the branch name scopes to all preview branches; intended rehearsal-branch isolation needs the branch arg.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Write docs/runbooks/SECRET-ROTATION.md</name>
  <files>docs/runbooks/SECRET-ROTATION.md</files>
  <read_first>
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/docs/BAKE-WORKFLOW.md (structural analog: TL;DR → mechanism sections → typical workflows → troubleshooting → see-also)
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-CONTEXT.md (D-01..D-05b — runbook scope, location, form)
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-RESEARCH.md (Code Examples — HYGIENE-07 canonical vercel env update commands; Pitfalls 3 + 4 — trailing-newline + preview-branch footguns; Open Question 4 — which Vercel verb to prefer)
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-PATTERNS.md (section 2 — runbook heading hierarchy, inline CLI code-fence pattern, typical-workflows section shape, troubleshooting tail style)
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/src/lib/auth.ts (for the pilot-session cookie lifecycle and jose HS256 usage — so runbook "see also" can point at it accurately)
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/src/middleware.ts (for the RITUAL_CLIENT_SECRET check — so runbook can reference which paths gate on it)
  </read_first>
  <action>
    Create the new folder `docs/runbooks/` and the new file `docs/runbooks/SECRET-ROTATION.md`.

    The runbook is Markdown only (D-05) — no helper scripts, no automation. Use the BAKE-WORKFLOW.md structural pattern exactly. The runbook MUST include each of the following sections in this order:

    1. **Top H1 heading** — `# Secret Rotation — Canonical Runbook` with one-line purpose paragraph.

    2. **TL;DR section** (fenced `bash` block) — the minimum command sequence for a standard production rotation of RITUAL_CLIENT_SECRET AND JWT_SECRET:
       ```bash
       printf "%s" "<NEW_RITUAL_CLIENT_SECRET>" | vercel env update RITUAL_CLIENT_SECRET production --yes
       printf "%s" "<NEW_JWT_SECRET>" | vercel env update JWT_SECRET production --yes
       vercel deploy --prod
       ```

    3. **What gets rotated and why** — name both secrets and their roles:
       - `RITUAL_CLIENT_SECRET` — the `x-client-secret` header that gates `/api/*` in src/middleware.ts. A leaked value lets anyone hit paid API routes with a valid secret but no session.
       - `JWT_SECRET` — signs `pilot-session` cookies via jose HS256 in src/lib/auth.ts. A leaked value lets an attacker forge valid session cookies.

    4. **Expected signal: JWT_SECRET rotation invalidates every live pilot-session cookie** — USE THE BOLD-PREFIX CALLOUT pattern from BAKE-WORKFLOW.md:
       > **Rotating `JWT_SECRET` invalidates every live `pilot-session` cookie.** This is expected — users will be bounced to `/signin` on their next request. Plan timing accordingly (quiet hours) and send an out-of-band heads-up to the invited lodges before rotating.

    5. **Prerequisites section** — verify these BEFORE rotating:
       - `command -v vercel` — install with `npm install -g vercel` if missing.
       - Logged in: `vercel whoami` returns your email.
       - On the right project: `cat .vercel/project.json` matches.
       - Write access to the project's env vars on Vercel.

    6. **Typical workflows — Production rotation** (numbered steps, use pattern from BAKE-WORKFLOW.md `## Typical workflows` section):
       a. Generate new secret values locally — `openssl rand -base64 48 | tr -d '\n'` for each secret. Store in a temporary note (never commit).
       b. Send heads-up to invited lodges ("pilot sign-in will reset at HH:MM; re-sign-in required").
       c. Run the `vercel env update` commands (TL;DR block).
       d. Redeploy production: `vercel deploy --prod` (or push to main — whichever this project's standard deploy path is).
       e. Verify magic-link flow end-to-end: request link on a test device, tap it, land in the app.
       f. Confirm old cookies are invalidated (open an existing tab with a stale cookie; should redirect to /signin).

    7. **Typical workflows — Rehearsal on preview deploy** (D-04) — this is the step that fulfills the HYGIENE-07 rehearsal requirement:
       a. Create a rehearsal branch: `git checkout -b rotation-rehearsal`.
       b. Push a trivial commit so a preview deploy spawns.
       c. Add preview-scoped secrets USING THE EXPLICIT BRANCH ARG (footgun): `printf "%s" "<TEST>" | vercel env add RITUAL_CLIENT_SECRET preview rotation-rehearsal`. Same for JWT_SECRET.
       d. Trigger preview deploy by pushing to the branch: `git push origin rotation-rehearsal`.
       e. Open the preview URL; request magic link; tap; confirm auth works.
       f. Rotate the preview secrets (run `vercel env update NAME preview` with new values, though note: `update` does not scope by branch — for preview-branch values you `vercel env rm NAME preview rotation-rehearsal --yes` then `vercel env add NAME preview rotation-rehearsal` with the new value). Document this asymmetry in the runbook as a known quirk.
       g. Redeploy the preview (push an empty commit: `git commit --allow-empty -m "re-deploy after rotation rehearsal"`; `git push`).
       h. Re-verify sign-in works.
       i. Cleanup: `vercel env rm RITUAL_CLIENT_SECRET preview rotation-rehearsal --yes` + same for JWT_SECRET.
       j. Delete the branch locally and remotely if desired.

    8. **Troubleshooting section** (bold-prefix / em-dash / one-line pattern from BAKE-WORKFLOW.md):
       - **Sign-in returns 401 after rotation** — the new secret's trailing newline was captured. Re-set interactively or use `printf "%s"` (not `echo` which appends `\n`). Cross-reference project memory: `vercel-env-newline-fix`.
       - **Preview rehearsal reads production env values** — the `vercel env add` was run without the explicit branch arg. Remove and re-add with `vercel env add NAME preview <branch-name>`. Cross-reference project memory: `vercel-cli-env-add-preview-branch-required`.
       - **`vercel env update` is not a recognized command** — Vercel CLI version is too old. Upgrade with `npm install -g vercel@latest`.
       - **Magic-link email never arrives** — check Resend logs first, then iCloud Junk folder; Private Relay + Resend has had transient outages. See `.planning/phases/01-pre-invite-hygiene/01-RESEARCH.md` Pitfall 5.
       - **New deploy serves old env values** — the deploy happened before the env update propagated, OR Vercel's build cache served a pre-build. Trigger a fresh deploy: `vercel deploy --prod --force`.

    9. **See also** (footer):
       - `src/lib/auth.ts` — pilot-session cookie lifecycle, JWT_SECRET usage
       - `src/middleware.ts` — RITUAL_CLIENT_SECRET gate on `/api/*`
       - `.env.example` — full env var list for this project
       - `.planning/phases/01-pre-invite-hygiene/01-RESEARCH.md` — rotation research, pitfalls
       - Vercel docs: https://vercel.com/docs/cli/env §Updating Environment Variables

    Formatting rules:
    - Use H1 for title, H2 for major sections, H3 for subsections (workflows, scenarios).
    - Fenced code blocks with `bash` language for all CLI.
    - Bold-prefix paragraphs for callouts (NOT `> **Note:**` blockquotes — BAKE-WORKFLOW.md avoids admonition syntax).
    - Horizontal rules `---` between top-level sections (matches BAKE-WORKFLOW.md).
    - Runbook should be at minimum ~80 lines (less is under-specified for a rotation playbook; more is fine).

    Do NOT include any actual secret values. Do NOT include ritual text. Do NOT add a helper script (D-05 explicitly: Markdown only).
  </action>
  <verify>
    <automated>test -d /home/mcleods777/Masonic-Ritual-AI-Mentor/docs/runbooks &amp;&amp; test -f /home/mcleods777/Masonic-Ritual-AI-Mentor/docs/runbooks/SECRET-ROTATION.md &amp;&amp; wc -l /home/mcleods777/Masonic-Ritual-AI-Mentor/docs/runbooks/SECRET-ROTATION.md</automated>
  </verify>
  <acceptance_criteria>
    - File `docs/runbooks/SECRET-ROTATION.md` exists
    - `wc -l docs/runbooks/SECRET-ROTATION.md` returns ≥ 80 lines
    - grep `grep -c "vercel env update" docs/runbooks/SECRET-ROTATION.md` returns ≥ 2 (both secrets covered; atomic form used)
    - grep `grep -c "RITUAL_CLIENT_SECRET" docs/runbooks/SECRET-ROTATION.md` returns ≥ 3 (mentioned in summary, commands, and "what gets rotated" sections)
    - grep `grep -c "JWT_SECRET" docs/runbooks/SECRET-ROTATION.md` returns ≥ 3
    - grep `grep -E "pilot-session|invalidates every live" docs/runbooks/SECRET-ROTATION.md` returns ≥ 1 match (D-02 expected-signal callout present)
    - grep `grep -E "printf \"%s\"|newline" docs/runbooks/SECRET-ROTATION.md` returns ≥ 1 (trailing-newline footgun documented)
    - grep `grep -E "preview [a-z-]+|rotation-rehearsal" docs/runbooks/SECRET-ROTATION.md` returns ≥ 1 (preview-branch rehearsal section exists with explicit branch name)
    - grep `grep -c "^## " docs/runbooks/SECRET-ROTATION.md` returns ≥ 5 (TL;DR, what gets rotated, prerequisites, typical workflows, troubleshooting, see also)
    - No ritual text, no actual secret values, no helper-script files checked in
  </acceptance_criteria>
  <done>Runbook exists at target path with all required sections, both secrets covered, atomic CLI commands, known footguns documented.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Shannon rehearses the runbook end-to-end on a Vercel preview deploy</name>
  <files>(no file changes unless the rehearsal surfaces runbook bugs)</files>
  <read_first>
    - The just-written `docs/runbooks/SECRET-ROTATION.md` (the artifact under test)
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-CONTEXT.md (D-04 — rehearsal method is full runbook end-to-end against a Vercel preview, not a table-top read)
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-RESEARCH.md (Pitfalls 3 + 4 — what to expect)
  </read_first>
  <what-built>
    Task 1 produced a complete Markdown rotation runbook covering both `RITUAL_CLIENT_SECRET` and `JWT_SECRET`, with TL;DR, prereqs, production-rotation workflow, preview-branch rehearsal workflow, troubleshooting, and see-also sections. Task 2 asks Shannon to execute the "Rehearsal on preview deploy" section end-to-end against a real Vercel preview, proving the procedure actually works as written.
  </what-built>
  <how-to-verify>
    1. From the runbook, follow the "Typical workflows — Rehearsal on preview deploy" section step-by-step.
    2. Start from step (a) (create a `rotation-rehearsal` branch) through step (j) (cleanup).
    3. For each step, note: did the command execute as written? Did the expected behavior occur?
    4. If any step fails, note exactly why — wrong flag, missing prerequisite, wrong command syntax, misleading wording. Report back so the runbook can be corrected in Task 3 before the phase closes.
    5. Confirm the end-to-end outcome: after rotating preview secrets and redeploying, a fresh sign-in flow works on the preview URL.
    6. Record the preview URL used (for the VERIFICATION.md entry).
  </how-to-verify>
  <resume-signal>
    Type "rehearsed clean — preview URL https://<url>" if every step worked as written.
    Type "rehearsed with fixes — <list of steps that failed and what was changed>" if runbook edits are needed (Claude applies fixes in Task 3 and Shannon re-rehearses the changed section only).
    Type "blocked — <reason>" if the rehearsal cannot proceed (e.g., Vercel CLI not installed on Shannon's machine; out of Vercel quota) — escalate and de-scope to phase-close-blocker.
  </resume-signal>
</task>

<task type="auto">
  <name>Task 3: Apply any runbook fixes from rehearsal; update VERIFICATION.md; commit</name>
  <files>docs/runbooks/SECRET-ROTATION.md (only if rehearsal surfaced bugs), .planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md</files>
  <read_first>
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md (current state — created by plan 03)
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-CONTEXT.md (D-20 commit style)
    - The rehearsal report from Task 2
  </read_first>
  <action>
    If Task 2 reported fixes needed, apply them to `docs/runbooks/SECRET-ROTATION.md` exactly as specified by Shannon. Each fix should be surgical — replace the failing step's wording, not rewrite the runbook.

    Update `.planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md` HYGIENE-07 entry:

    ```markdown
    ## HYGIENE-07 — Secret-rotation runbook rehearsed
    **Status:** ✅ verified
    **Date:** YYYY-MM-DD
    **Evidence:** Runbook at `docs/runbooks/SECRET-ROTATION.md` covers rotation of both `RITUAL_CLIENT_SECRET` and `JWT_SECRET` using atomic `vercel env update`. Rehearsed end-to-end against preview deploy `<preview-url-from-task-2>`. <If fixes applied:> Runbook edited based on rehearsal (fixed: <one-line summary>).
    ```

    Also update the frontmatter `last_updated` to today.

    Commit per D-20:

    ```
    git add docs/runbooks/SECRET-ROTATION.md .planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md
    git commit -m "hygiene-07: add rehearsed secret-rotation runbook"
    ```

    (If no runbook edits in this task because rehearsal was clean, the commit includes the VERIFICATION.md update and the previously-created SECRET-ROTATION.md from task 1 if it was not already committed. If task 1's runbook was already committed in an earlier atomic commit, this task commits only the VERIFICATION.md update with message `hygiene-07: record runbook rehearsal evidence`. Prefer a single atomic commit at this task — move the runbook file + VERIFICATION update together to make the audit trail single-shot per D-20.)

    Rule of thumb: one atomic commit per HYGIENE-XX requirement. If the runbook was a separate commit earlier, that is OK — combine the rehearsal evidence + any fixes into this one.
  </action>
  <verify>
    <automated>cd /home/mcleods777/Masonic-Ritual-AI-Mentor && git log -1 --format=%s | grep -E "^hygiene-07:" &amp;&amp; grep -A2 "HYGIENE-07" .planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md | grep -c "✅ verified"</automated>
  </verify>
  <acceptance_criteria>
    - `git log -1 --format=%s` starts with `hygiene-07:`
    - VERIFICATION.md HYGIENE-07 entry status is `✅ verified`
    - VERIFICATION.md HYGIENE-07 entry has a date
    - VERIFICATION.md HYGIENE-07 entry references the actual preview URL used in rehearsal
    - `docs/runbooks/SECRET-ROTATION.md` is tracked in git
    - `npm run test:run` exits 0 (sanity — should be unaffected)
    - `git status` shows working tree clean
  </acceptance_criteria>
  <done>HYGIENE-07 verification evidence recorded; any rehearsal-surfaced runbook bugs fixed; one commit `hygiene-07: ...` on main.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Leaked secret → app privileges | A leaked RITUAL_CLIENT_SECRET lets anyone hit `/api/*` (including paid AI routes). A leaked JWT_SECRET lets an attacker forge valid `pilot-session` cookies and bypass the allowlist. Rotation is the mitigation; the runbook is the rehearsed procedure for exercising that mitigation under time pressure. |
| Vercel CLI operator → production env | Operator runs privileged CLI commands that change production. Footguns (trailing newline, missing branch arg) can leave the app in a broken state (env var captures the wrong value). |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-1-04 | Elevation of Privilege | RITUAL_CLIENT_SECRET / JWT_SECRET | mitigate | Rehearsed rotation runbook (this plan). Both secrets covered per D-01. |
| T-1-04a | Denial of Service (operator) | Rotation procedure | mitigate | Use `vercel env update` (atomic) — no window-of-unset. Documented per D-05b. |
| T-1-04b | Tampering (env value corruption) | Piped values | mitigate | Runbook requires `printf "%s"` (not `echo`, not `cat file`) to avoid trailing-newline capture. Project-memory footgun documented. |
| T-1-04c | User impact (session invalidation) | pilot-session cookies | accept | JWT_SECRET rotation invalidates live cookies as expected behavior. Runbook explicitly flags this and requires out-of-band heads-up to invited lodges before a production rotation. Not a defect — an intentional signal (D-02). |
</threat_model>

<verification>
Automated: runbook file exists with required sections (grep acceptance criteria above).
Human-gated: rehearsal against a real Vercel preview deploy (Task 2). Cannot be self-verified by Claude — requires Shannon's machine, Vercel login, and a real preview deploy.
</verification>

<success_criteria>
- `docs/runbooks/SECRET-ROTATION.md` exists (≥80 lines, ≥5 major sections)
- Both secrets covered; atomic `vercel env update` used throughout
- JWT_SECRET invalidation callout present
- Both known footguns documented (trailing newline; preview-branch required)
- Shannon rehearsed end-to-end on a preview deploy; any surfaced fixes applied
- VERIFICATION.md HYGIENE-07 entry marked ✅ verified with preview URL + date
- One commit `hygiene-07: ...` on main
</success_criteria>

<output>
After completion, create `.planning/phases/01-pre-invite-hygiene/01-07-rotation-runbook-SUMMARY.md` per template. Include the preview URL used for rehearsal (not sensitive — Vercel preview URLs are public and short-lived).
</output>
