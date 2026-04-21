---
phase: 01-pre-invite-hygiene
plan: 05
type: execute
wave: 5
depends_on: [04]
files_modified:
  - .planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md
autonomous: false
requirements: [HYGIENE-05]
must_haves:
  truths:
    - "Shannon has personally completed one successful end-to-end magic-link sign-in on an iPhone with iCloud Private Relay enabled"
    - "The round-trip (request email → tap link on phone → authenticated session) completed on the preview deploy that already has HYGIENE-03's noindex header"
    - "An evidence entry is added to 01-VERIFICATION.md recording the iPhone test with date/time"
    - "The preview-deploy curl check for HYGIENE-03's X-Robots-Tag header is performed against the same preview and recorded"
  artifacts:
    - path: ".planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md"
      provides: "HYGIENE-05 evidence entry + HYGIENE-03 preview-curl evidence"
      contains: "HYGIENE-05"
  key_links:
    - from: "Shannon's iPhone + iCloud Private Relay"
      to: "Preview deploy magic-link flow"
      via: "magic-link email → tap → authenticated session"
      pattern: "pilot-session cookie set after tap"
---

<objective>
Prove the magic-link sign-in flow works end-to-end on a real iPhone with iCloud Private Relay enabled. This is a regression guard against the most likely real-world failure: invited WMs receive their magic-link email on an Apple device behind Private Relay and cannot complete sign-in.

Purpose: HYGIENE-05 — the invited audience is Masonic officers, statistically heavy on Apple devices. If the magic-link flow silently breaks on Private Relay, every invitation becomes a support ticket. This plan produces one piece of evidence: Shannon's own iPhone round-trip succeeded on the current preview deploy.

Secondary purpose: while we have a live preview deploy with HYGIENE-03's noindex header, collect the preview-curl evidence for HYGIENE-03 in the same session. No new deploy is needed for either check.

Output: Two VERIFICATION.md entry updates (HYGIENE-05 verified; HYGIENE-03 preview-curl evidence appended).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/01-pre-invite-hygiene/01-CONTEXT.md
@.planning/phases/01-pre-invite-hygiene/01-RESEARCH.md
@.planning/phases/01-pre-invite-hygiene/01-VALIDATION.md
@.planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md
</context>

<tasks>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 1: Shannon performs iPhone + iCloud Private Relay magic-link sign-in on a preview deploy</name>
  <files>(no file changes — manual device test)</files>
  <read_first>
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-CONTEXT.md (D-18 — scope of the test: one successful end-to-end round-trip, evidence is a one-line note)
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-RESEARCH.md (Pitfall 5 — Private Relay + Resend outage history; retry semantics)
  </read_first>
  <what-built>
    No new code. The app already ships the magic-link sign-in flow (pre-v1 validated — see STATE.md). Plans 01, 02, 03, 04 have landed code-level hygiene changes on a preview deploy. This task asks Shannon to prove the magic-link flow still works on the actual target device profile (iPhone, iCloud Private Relay on).
  </what-built>
  <how-to-verify>
    Preconditions:
    1. A Vercel preview deploy (or the main pilot deploy) is live and reachable.
    2. Shannon's iPhone has iCloud Private Relay enabled (Settings → Apple ID → iCloud → Private Relay → On).
    3. Shannon's email address is in `LODGE_ALLOWLIST` for the target deploy.

    Test procedure:
    1. On the iPhone, open Safari and visit the preview (or pilot) URL. Expect redirect to `/signin`.
    2. Enter Shannon's email and request the magic link.
    3. Open the Mail app on the iPhone. Wait for the magic-link email from Resend. If it does not arrive in 90 seconds, check the iCloud Junk folder (Private Relay addresses sometimes land there).
    4. Tap the magic-link in the email. The iPhone should open the link in Safari and land in the authenticated app (not `/signin`).
    5. Confirm a session is active (navigate to any authenticated page; no redirect to `/signin`).

    Failure modes and how to interpret:
    - Email never arrives → Private Relay delivery issue; retry once after 5 minutes. If persistent, check Resend dashboard for delivery log. This is NOT a Phase 1 code defect per RESEARCH Pitfall 5 — it's environmental.
    - Email arrives but tap redirects back to `/signin` → this IS a code defect. STOP and escalate; do not mark HYGIENE-05 verified.
    - Email link expires before tap → JWT magic-link `exp` is 24h; should not trigger in a human-scale round-trip.

    Secondary check in the same session (HYGIENE-03 preview-curl evidence):
    6. From your terminal (not the iPhone), run:
       ```
       curl -I https://<preview-or-pilot-url>/ | grep -i x-robots-tag
       curl -I https://<preview-or-pilot-url>/landing.html | grep -i x-robots-tag
       ```
    7. Record the output — expected: `X-Robots-Tag: noindex, nofollow` on at least the root response; landing.html may or may not carry the header depending on static-asset routing, but the inline `<meta name="robots">` added in plan 01 covers that case.
    8. Also verify inline meta tag: `curl -s https://<preview-or-pilot-url>/landing.html | grep 'name="robots"'` should return exactly one match.

    Report back with: preview URL used, date/time of successful iPhone sign-in, and the curl output for HYGIENE-03.
  </how-to-verify>
  <resume-signal>
    Type "verified — iPhone signed in on <preview-url> at YYYY-MM-DD HH:MM; curl X-Robots-Tag: <header value>; landing meta: <present|absent>".
    Type "retry needed — <specific failure>" if the test needs to be re-run after a fix.
    Type "blocked — <reason>" if a deploy isn't available or the iPhone is unavailable.
  </resume-signal>
</task>

<task type="auto">
  <name>Task 2: Update VERIFICATION.md with HYGIENE-05 and HYGIENE-03 preview evidence; commit</name>
  <files>.planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md</files>
  <read_first>
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md (current state)
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-CONTEXT.md (D-20 commit style)
    - The sign-off data from Task 1 (preview URL, iPhone sign-in timestamp, curl output)
  </read_first>
  <action>
    Update `.planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md`:

    1. Update the HYGIENE-05 entry:
       ```markdown
       ## HYGIENE-05 — iPhone magic-link end-to-end
       **Status:** ✅ verified
       **Date:** YYYY-MM-DD HH:MM (local TZ)
       **Evidence:** Shannon signed in end-to-end on iPhone with iCloud Private Relay enabled. Preview URL: <url-from-task-1>. One successful round-trip (email request → tap magic link → authenticated session). No defects observed.
       ```

    2. Update the HYGIENE-03 entry to flip status from "code landed / preview-curl pending" to `✅ verified` and append the curl evidence:
       ```markdown
       ## HYGIENE-03 — X-Robots-Tag noindex app-wide
       **Status:** ✅ verified
       **Date:** YYYY-MM-DD (plan 01 commit); YYYY-MM-DD HH:MM (preview-curl evidence from plan 05)
       **Evidence:** SECURITY_HEADERS extended in next.config.ts; `<meta name="robots" content="noindex, nofollow">` inline in public/landing.html. `npm run build` + `npm run test:run` green. Preview-deploy check: `curl -I https://<preview-url>/` returned `X-Robots-Tag: <exact value from task 1>`. `curl -s https://<preview-url>/landing.html | grep 'name="robots"'` confirmed inline meta tag present.
       ```

    3. Update frontmatter `last_updated` to today.

    Commit per D-20:
    ```
    git add .planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md
    git commit -m "hygiene-05: record iphone private-relay sign-in evidence + hygiene-03 preview curl"
    ```

    Alternative commit message (same meaning): `hygiene-05: verify iphone magic-link + record preview noindex evidence`.
  </action>
  <verify>
    <automated>cd /home/mcleods777/Masonic-Ritual-AI-Mentor && git log -1 --format=%s | grep -E "^hygiene-05:" &amp;&amp; grep -A2 "HYGIENE-05" .planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md | grep -c "✅ verified" &amp;&amp; grep -A2 "HYGIENE-03" .planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md | grep -c "✅ verified"</automated>
  </verify>
  <acceptance_criteria>
    - `git log -1 --format=%s` starts with `hygiene-05:`
    - VERIFICATION.md HYGIENE-05 entry status is `✅ verified` with a date
    - VERIFICATION.md HYGIENE-05 entry references the preview URL used
    - VERIFICATION.md HYGIENE-03 entry status is now `✅ verified` (flipped from "pending")
    - VERIFICATION.md HYGIENE-03 entry contains the actual X-Robots-Tag header value observed
    - VERIFICATION.md frontmatter `last_updated` matches today's date
    - `git status` shows working tree clean
  </acceptance_criteria>
  <done>HYGIENE-05 verification evidence recorded; HYGIENE-03 fully verified (preview-curl evidence attached); one commit `hygiene-05: ...` on main.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| iPhone + iCloud Private Relay → pilot deploy | Real-world invited WM device profile. If Private Relay rewrites IPs between the magic-link email click and subsequent session requests, and the session layer IP-binds, the user is locked out. (Verified in RESEARCH.md: auth.ts does NOT IP-bind, so this specific threat is not triggered — but the evidence is only as strong as a device test.) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-1-05 | Regression (UX failure) | Magic-link sign-in on mobile Safari + Private Relay | mitigate | Real-device end-to-end test by Shannon (this plan). Evidence in VERIFICATION.md. RESEARCH.md confirms no IP-binding in auth.ts, so Private-Relay IP rotation does not break sessions. |
| T-1-05a | External (Private Relay delivery outage) | Resend → Private Relay email delivery | accept | Not mitigable in Phase 1. Documented in RESEARCH Pitfall 5. HYGIENE-05 is evidence-of-works-today, not a durable fix. |
</threat_model>

<verification>
This plan is manual-verification-dominant by design. The only "automated" surface is the VERIFICATION.md grep check that HYGIENE-05 entry is marked verified. The load-bearing verification is Shannon's real-device round-trip, which no executor can perform.
</verification>

<success_criteria>
- Shannon completed one successful end-to-end iPhone magic-link sign-in on the preview deploy
- HYGIENE-05 marked ✅ verified in VERIFICATION.md with preview URL + timestamp
- HYGIENE-03 flipped to ✅ verified (preview-curl evidence now attached)
- One commit `hygiene-05: ...` on main
</success_criteria>

<output>
After completion, create `.planning/phases/01-pre-invite-hygiene/01-05-iphone-verify-SUMMARY.md` per template. Include the preview URL and timestamp.
</output>
