---
phase: 01-pre-invite-hygiene
plan: 01-03
subsystem: infra
tags: [security-headers, noindex, next-config, seo, robots, vercel]

# Dependency graph
requires:
  - phase: "existing codebase"
    provides: "SECURITY_HEADERS array pattern in next.config.ts; public/landing.html static asset"
provides:
  - "App-wide X-Robots-Tag: noindex, nofollow response header via next.config.ts headers()"
  - "Inline <meta name=\"robots\" content=\"noindex, nofollow\"> on public/landing.html as belt-and-suspenders coverage for the static path that bypasses Next's request pipeline"
affects: [01-04-landing-audit, 01-05-iphone-verify, phase-2-safety-floor]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Security-header-by-array extension — any new per-response header goes into SECURITY_HEADERS in next.config.ts under the /:path* source"
    - "Belt-and-suspenders noindex — HTTP header for Next routes AND inline meta for static public/ assets that bypass headers()"

key-files:
  created: []
  modified:
    - "next.config.ts"
    - "public/landing.html"

key-decisions:
  - "Used the stronger noindex, nofollow variant (both tokens) per CONTEXT D-06 Claude's Discretion — blocks link-graph crawling as well as indexing"
  - "Applied the inline meta tag immediately after viewport and before title so it sits high in <head> and is seen even by crawlers that parse partial content"
  - "Adopted HTML5 style (no self-closing slash on the <meta>) to match existing landing.html convention; did not introduce XHTML style"

patterns-established:
  - "Header-first, meta-second defense-in-depth for crawler policy on this app"
  - "Commit-prefix override: phase 1 HYGIENE tasks use hygiene-NN: imperative form per CONTEXT D-20, overriding the otherwise-conventional docs:/feat:/chore: prefixes in this repo"

requirements-completed: [HYGIENE-03]

# Metrics
duration: 2m 25s
completed: 2026-04-21
---

# Phase 1 Plan 03: Noindex Enforcement Summary

**Added `X-Robots-Tag: noindex, nofollow` to every Next.js route via SECURITY_HEADERS, plus an inline `<meta name="robots" content="noindex, nofollow">` in `public/landing.html` so the invite-only pilot can't be indexed by outside search engines even before the first magic-link invitation leaves.**

## Performance

- **Duration:** 2m 25s
- **Started:** 2026-04-21T02:38:46Z
- **Completed:** 2026-04-21T02:41:11Z
- **Tasks:** 3 (all executed)
- **Files modified:** 2

## Accomplishments

- `next.config.ts` SECURITY_HEADERS now has a sixth entry, `{ key: "X-Robots-Tag", value: "noindex, nofollow" }`, that applies to the existing `/:path*` source block and therefore covers every Next.js route (pages + API) on Vercel deploys with one line.
- `public/landing.html` `<head>` has a new `<meta name="robots" content="noindex, nofollow">` positioned between viewport and title — the static-asset path that bypasses Next's `headers()` function is now covered at the HTML layer.
- Two independent crawler-blocking paths so a failure of one (dev server, rewrite, platform swap) does not expose the app to indexing. Matches the T-1-01 / T-1-01a mitigations in the plan's threat model.
- `npm run build` exits 0; `npm run test:run` passes all 251 tests across 15 test files. No regressions.

## Task Commits

All three tasks were executed. Per plan Task 3 (and CONTEXT D-20 — "one commit per HYGIENE-XX task"), the two code edits were committed as a single atomic `hygiene-03:` commit rather than per-sub-task:

1. **Task 1: Add X-Robots-Tag to SECURITY_HEADERS in next.config.ts** — included in `2135496`
2. **Task 2: Add inline noindex meta tag to public/landing.html** — included in `2135496`
3. **Task 3: Commit HYGIENE-03 as a single atomic commit** — `2135496` (`hygiene-03: add x-robots-tag noindex app-wide + landing meta`)

This matches the `hygiene-NN: imperative` format from CONTEXT D-20 and the PATTERNS Shared Patterns section.

## Files Created/Modified

- `next.config.ts` — appended one `{ key, value }` object to the `SECURITY_HEADERS` array. No structural change to the `headers()` function or the `/:path*` source block; CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, and Permissions-Policy entries unchanged and in original order.
- `public/landing.html` — inserted one line (`  <meta name="robots" content="noindex, nofollow">`) immediately after the viewport meta tag and before the title, inside the existing `<head>`. File grew 622 → 623 lines, no other content changed (no body audit — that is plan 04, HYGIENE-04).

## Decisions Made

- None beyond the already-locked CONTEXT decisions (D-06 X-Robots-Tag placement, D-07 inline meta, D-20 commit style). Plan executed exactly as specified.

## Deviations from Plan

None — plan executed exactly as written. The only judgement call was interpreting the orchestrator's "commit each task atomically" instruction against the plan's explicit Task 3 that combines both code edits into one commit. Resolution: followed the plan as written (D-20 says one commit per HYGIENE-XX requirement ID, not one commit per sub-task). The resulting commit message and diff match Task 3's acceptance criteria exactly.

## Issues Encountered

None. Both edits were surgical single-point insertions, both verifications (grep, strict-equality grep, build, test:run) passed on first run.

## User Setup Required

None — no external service configuration, no env-var changes. The preview-deploy `curl -I` evidence collection called out in the plan's `<verification>` section is owned by plan 05 (HYGIENE-05 iPhone verify) against a preview deploy that has this code landed, not by this plan.

## Hand-off Notes

- **VERIFICATION.md evidence:** The plan's `<output>` section asks for an entry to be appended to `.planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md`. That file does not exist yet — planner deferred its creation to plan 04 (first plan that needs to record evidence beyond what goes in a SUMMARY). When VERIFICATION.md is created, the HYGIENE-03 entry should read: "Code-level grep + build + tests green on 2026-04-21 (commit 2135496). Preview-deploy `curl -I` and `curl -s | grep 'name=\"robots\"'` evidence recorded by plan 05."
- **Next HYGIENE plan per D-19 order:** HYGIENE-06 (matcher regression test).

## Self-Check

- `[ -f next.config.ts ]` → FOUND
- `[ -f public/landing.html ]` → FOUND
- `grep -F 'X-Robots-Tag' next.config.ts` → FOUND (line 35)
- `grep -F 'name="robots" content="noindex, nofollow"' public/landing.html` → FOUND (line 6, exactly one match)
- `git log --oneline --all | grep 2135496` → FOUND (`hygiene-03: add x-robots-tag noindex app-wide + landing meta`)
- `git diff HEAD~1 --name-only` → `next.config.ts` + `public/landing.html` only
- `npm run build` → exit 0
- `npm run test:run` → 251 / 251 passed (15 files)

## Self-Check: PASSED

---
*Phase: 01-pre-invite-hygiene*
*Plan: 01-03-noindex*
*Completed: 2026-04-21*
