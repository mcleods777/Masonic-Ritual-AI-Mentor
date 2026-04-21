---
phase: 01-pre-invite-hygiene
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - next.config.ts
  - public/landing.html
autonomous: true
requirements: [HYGIENE-03]
must_haves:
  truths:
    - "Every Next.js app route response header includes X-Robots-Tag: noindex, nofollow on Vercel deploys"
    - "public/landing.html contains an inline <meta name=\"robots\" content=\"noindex, nofollow\"> in <head>"
    - "The existing SECURITY_HEADERS array stays alphabetically coherent with the prior pattern (key/value object form)"
  artifacts:
    - path: "next.config.ts"
      provides: "SECURITY_HEADERS array extended by one entry"
      contains: "X-Robots-Tag"
    - path: "public/landing.html"
      provides: "noindex meta tag in head"
      contains: "name=\"robots\""
  key_links:
    - from: "next.config.ts headers() function"
      to: "/:path* edge response"
      via: "SECURITY_HEADERS array"
      pattern: "X-Robots-Tag.*noindex, nofollow"
    - from: "public/landing.html <head>"
      to: "search-engine crawler"
      via: "inline meta robots tag"
      pattern: "<meta name=\"robots\" content=\"noindex, nofollow\">"
---

<objective>
Add app-wide noindex enforcement so no outside search engine ever indexes an authenticated pilot route or the public landing page.

Purpose: HYGIENE-03 — the invite-only pilot must not be discoverable from Google or Bing before Shannon starts sending magic-link invitations to outside lodges. Defense in depth: HTTP header (via next.config.ts SECURITY_HEADERS) covers all routes on Vercel; inline meta tag (in landing.html) covers the one static page even when headers() does not apply (dev server, rewrites, non-Vercel hosts).
Output: Two small surgical edits — one new entry in SECURITY_HEADERS, one new <meta> tag in landing.html's <head>.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/01-pre-invite-hygiene/01-CONTEXT.md
@.planning/phases/01-pre-invite-hygiene/01-RESEARCH.md
@.planning/phases/01-pre-invite-hygiene/01-PATTERNS.md
@.planning/phases/01-pre-invite-hygiene/01-VALIDATION.md
@next.config.ts
@public/landing.html

<interfaces>
<!-- Current shape of the SECURITY_HEADERS array (next.config.ts:29-35). The new entry adopts this exact { key, value } form. -->

From next.config.ts:
```typescript
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
];

async headers() {
  return [
    {
      source: "/:path*",
      headers: SECURITY_HEADERS,
    },
  ];
}
```

From public/landing.html (<head> block, lines 3-12):
```html
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Masonic Ritual Mentor</title>
  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="#0a0a0a">
  ...
</head>
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add X-Robots-Tag to SECURITY_HEADERS in next.config.ts</name>
  <files>next.config.ts</files>
  <read_first>
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/next.config.ts (current state of SECURITY_HEADERS)
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-CONTEXT.md (D-06, D-07 locked decisions)
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-PATTERNS.md (section 4 — next.config.ts self-analog showing exact target state)
  </read_first>
  <action>
    Per D-06: Extend the SECURITY_HEADERS array in next.config.ts (currently lines 29-35) by appending exactly one new entry immediately after the Permissions-Policy line:

    `  { key: "X-Robots-Tag", value: "noindex, nofollow" },`

    Final array must be:
    ```typescript
    const SECURITY_HEADERS = [
      { key: "Content-Security-Policy", value: CSP },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ];
    ```

    Use the value `"noindex, nofollow"` (both tokens — per Claude's Discretion in CONTEXT, default to the stronger form that also blocks link-graph crawling).

    Do NOT restructure the `headers()` function. Do NOT touch CSP or any other existing header. Do NOT add a separate per-source rule — the existing `source: "/:path*"` block is the one-and-done application surface.
  </action>
  <verify>
    <automated>grep -E "X-Robots-Tag.*noindex, nofollow" /home/mcleods777/Masonic-Ritual-AI-Mentor/next.config.ts && npm run build --prefix /home/mcleods777/Masonic-Ritual-AI-Mentor</automated>
  </verify>
  <acceptance_criteria>
    - grep `grep -E '\\{ key: "X-Robots-Tag", value: "noindex, nofollow" \\},' next.config.ts` returns exactly one match
    - grep `grep -c "^const SECURITY_HEADERS" next.config.ts` returns exactly one line (no duplicate array declared)
    - `npm run build` exits 0
    - No new headers() rule added (grep `headers()` body still contains exactly one `source: "/:path*"` object)
    - CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, and Permissions-Policy entries remain untouched and in original order
  </acceptance_criteria>
  <done>SECURITY_HEADERS array has six entries; the sixth is `{ key: "X-Robots-Tag", value: "noindex, nofollow" }`; `npm run build` succeeds.</done>
</task>

<task type="auto">
  <name>Task 2: Add inline noindex meta tag to public/landing.html</name>
  <files>public/landing.html</files>
  <read_first>
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/public/landing.html (lines 1-20 — the full <head> block)
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-CONTEXT.md (D-07 — inline meta required as belt-and-suspenders)
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-PATTERNS.md (section 5 — landing.html self-analog showing exact insertion location)
  </read_first>
  <action>
    Per D-07: Insert exactly one line in the <head> block of public/landing.html, immediately AFTER the `<meta name="viewport" content="width=device-width, initial-scale=1">` line and BEFORE the `<title>Masonic Ritual Mentor</title>` line.

    New line (use existing 2-space indent, no self-closing slash — matches existing style):

    `  <meta name="robots" content="noindex, nofollow">`

    Target head block shape after edit (lines 3-8):
    ```html
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <meta name="robots" content="noindex, nofollow">
      <title>Masonic Ritual Mentor</title>
      <link rel="manifest" href="/manifest.json">
    ```

    Do NOT audit or redact landing.html body content — that is plan 03 (HYGIENE-04). This plan only adds the noindex meta tag. Do NOT switch to XHTML-style self-closing `/>`; the existing file uses HTML5 style without it.
  </action>
  <verify>
    <automated>[ "$(grep -c 'name="robots" content="noindex, nofollow"' /home/mcleods777/Masonic-Ritual-AI-Mentor/public/landing.html)" = "1" ]</automated>
  </verify>
  <acceptance_criteria>
    - strict equality check `[ "$(grep -c 'name="robots" content="noindex, nofollow"' public/landing.html)" = "1" ]` exits 0 (exactly one match — not zero, not duplicated)
    - grep `grep -n 'name="robots"' public/landing.html` shows the meta tag on a line BEFORE the first `<title>` occurrence
    - `wc -l public/landing.html` shows exactly one more line than before (one line added, no other edits)
    - File still starts with `<!DOCTYPE html>` and head still contains the original `<meta charset="utf-8">`, `<meta name="viewport"`, and `<title>` tags
  </acceptance_criteria>
  <done>landing.html head contains `<meta name="robots" content="noindex, nofollow">` between viewport and title; no other content changed.</done>
</task>

<task type="auto">
  <name>Task 3: Commit HYGIENE-03 as a single atomic commit</name>
  <files>next.config.ts, public/landing.html</files>
  <read_first>
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-CONTEXT.md (D-20 — commit style `hygiene-NN: imperative lowercase`)
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-PATTERNS.md (section Shared Patterns — commit style override for this phase)
  </read_first>
  <action>
    Run `npm run build` one final time to confirm green, then `npm run test:run` to confirm existing tests still pass.

    Stage and commit both modified files in one commit per D-20:

    ```
    git add next.config.ts public/landing.html
    git commit -m "hygiene-03: add x-robots-tag noindex app-wide + landing meta"
    ```

    Commit message is short, imperative, lowercase, prefixed with `hygiene-03:`. Do NOT add Co-Authored-By trailers (not in this repo's existing commit style).

    Do NOT push. Do NOT commit .planning/ evidence here — plan 05 collects VERIFICATION.md evidence for manual parts of HYGIENE-03 (curl on preview). This commit is code-only.
  </action>
  <verify>
    <automated>cd /home/mcleods777/Masonic-Ritual-AI-Mentor && git log -1 --format=%s | grep -E "^hygiene-03:" && git diff HEAD~1 --name-only | sort</automated>
  </verify>
  <acceptance_criteria>
    - `git log -1 --format=%s` starts with `hygiene-03:`
    - `git diff HEAD~1 --name-only` lists exactly `next.config.ts` and `public/landing.html` (nothing else)
    - `npm run build` exits 0
    - `npm run test:run` exits 0
    - `git status` shows working tree clean (no staged or unstaged changes from this plan)
  </acceptance_criteria>
  <done>One commit on main with the two files; build + test:run green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Search-engine crawler → public surface | Crawlers discover the app URL (landing.html link from marketing / accidental submission / DNS leak) and attempt to index authenticated routes |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-1-01 | Information Disclosure | next.config.ts SECURITY_HEADERS + public/landing.html | mitigate | Add `X-Robots-Tag: noindex, nofollow` response header to all Next routes via existing SECURITY_HEADERS pattern; add `<meta name="robots" content="noindex, nofollow">` inline to landing.html for static-asset coverage. Two independent paths so a failure of one (dev server, rewrites, platform swap) does not expose the app to indexing. |
| T-1-01a | Information Disclosure | Preview deploys | mitigate | Same SECURITY_HEADERS apply to preview deploys (same next.config.ts ships with every deploy); no special preview config needed. |
</threat_model>

<verification>
After the commit lands:
1. Automated (this plan): `npm run build` + `npm run test:run` both exit 0. Grep confirmations above pass.
2. Manual (plan 05 records evidence): `curl -I https://<preview>.vercel.app/` shows `x-robots-tag: noindex, nofollow` in response headers.
3. Manual (plan 05 records evidence): `curl -s https://<preview>.vercel.app/landing.html | grep 'name="robots"'` shows the meta tag present.

The manual deploy-side checks are evidence collection, not a blocker for this plan's merge — code-level correctness is verified by the automated grep + build above.
</verification>

<success_criteria>
- SECURITY_HEADERS array in next.config.ts has a sixth entry: `{ key: "X-Robots-Tag", value: "noindex, nofollow" }`
- public/landing.html <head> contains `<meta name="robots" content="noindex, nofollow">`
- `npm run build` passes
- `npm run test:run` passes
- One commit `hygiene-03: ...` on main with exactly two file changes
</success_criteria>

<output>
After completion, append an entry to `.planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md` (created by plan 04 or later) noting the code-level grep confirmations from this plan. The preview-deploy curl check gets recorded when plan 05 (Shannon iPhone verify) runs against a preview deploy that has this code.

Create `.planning/phases/01-pre-invite-hygiene/01-03-noindex-SUMMARY.md` per template.
</output>
