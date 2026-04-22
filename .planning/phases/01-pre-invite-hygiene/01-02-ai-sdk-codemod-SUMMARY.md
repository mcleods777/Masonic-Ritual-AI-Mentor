---
phase: 01-pre-invite-hygiene
plan: 06
subsystem: toolchain / dependencies
tags: [ai-sdk, codemod, package-json, v6-migration, vercel, hygiene]

requires:
  - phase: 01-pre-invite-hygiene
    provides: "pre-existing package.json with ai@^6.0.86 and @ai-sdk/anthropic@^3.0.44 (and zero source imports of either)"
provides:
  - "package.json dependencies at AI SDK v6 latest ranges (ai@^6.0.168, @ai-sdk/anthropic@^3.0.71) — v6 idioms available for future code"
  - "Evidence that @ai-sdk/codemod@3.0.4 v6 runs clean against this repo (a useful known-good for Phase 5 COACH-02 follow-up if the SDK bumps again)"
affects:
  - "Phase 5 COACH-02 — `/api/rehearsal-feedback` rewrite can use v6 generateObject / AI Gateway patterns against the pinned major version"
  - "Plan 07 HYGIENE-01 next — will remove `@ai-sdk/react` (still in package.json, untouched here by design)"

tech-stack:
  added: []
  patterns:
    - "Explicit version-bump via `npm install <pkg>@<range>` + version-pinned codemod subcommand (`v6` not `upgrade v6`) — cleaner audit trail than letting the codemod's `upgrade` verb touch package.json implicitly"
    - "Pre-flight import grep before running an automated migration tool — verified the zero-import assumption (CONTEXT D-16b) still held at execution time"

key-files:
  created: []
  modified:
    - "package.json — two version bumps: ai ^6.0.86 → ^6.0.168, @ai-sdk/anthropic ^3.0.44 → ^3.0.71"
    - "package-lock.json — transitive dep resolution refresh (ai v6.0.168 tree)"
    - ".planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md — HYGIENE-02 entry filled in (status ✓ VERIFIED, commit 005dc82)"

key-decisions:
  - "Used `npx --yes @ai-sdk/codemod@3.0.4 v6 src/ scripts/` (the corrected form per RESEARCH Common Pitfalls #1 and Open Questions Q1-RESOLVED) — NOT the malformed `upgrade v6` from original CONTEXT D-16. The `v6` subcommand runs only v5→v6 codemods on the explicit paths and does not touch package.json."
  - "Bumped dependency versions explicitly via `npm install` rather than letting `codemod upgrade` do it — per RESEARCH Q3-RESOLVED, the explicit bump gives a cleaner audit trail and a more deterministic diff."
  - "Retained `@ai-sdk/react` at ^3.0.88 — its removal belongs to HYGIENE-01 (Plan 07), not this plan (per CONTEXT D-14 package boundary)."
  - "Single atomic `hygiene-02:` commit for the version bumps (no source changes to combine with it) + one `docs(01-02):` commit for SUMMARY + VERIFICATION updates (per this run's two-commit objective, matches the precedent from plans 01/02/03/07)."

patterns-established:
  - "Pre-flight import grep before automated migration: confirm the migration tool's target surface before running it — protects against silent scope drift if imports appeared after research."
  - "Version-pinned codemod invocation (`@3.0.4`) to avoid npx pulling a newer codemod with different behavior during re-runs."

requirements-completed: [HYGIENE-02]

duration: 6min
completed: 2026-04-21
---

# Phase 1 Plan 06: AI SDK v6 Codemod Summary

**AI SDK v6 codemod ran clean over a zero-import codebase — effectively a package.json version bump to `ai@^6.0.168` and `@ai-sdk/anthropic@^3.0.71`, no source transformation needed, build + 257 tests still green.**

## Performance

- **Duration:** ~6 min (including ~4min codemod walk time)
- **Started:** 2026-04-21T03:07:52Z
- **Completed:** 2026-04-21T03:13:24Z
- **Tasks:** 3 (pre-flight grep → codemod + install + verify → VERIFICATION.md update)
- **Files modified:** 3 (`package.json`, `package-lock.json`, `.planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md`)
- **Source files modified:** 0 (as predicted by CONTEXT D-16b)

## Accomplishments

- Pre-flight grep across `src/`, `scripts/`, `public/` for `from "ai"` / `from "@ai-sdk/*"` imports returned **zero matches** — confirms CONTEXT D-16b assumption still holds at execution time (no imports added between research on 2026-04-20 and execution on 2026-04-21).
- Ran `npx --yes @ai-sdk/codemod@3.0.4 v6 src/ scripts/` — output `Starting v6 codemods...` → `v6 codemods complete.` in ~3m46s. Zero source files modified.
- `npm install ai@^6.0.168 @ai-sdk/anthropic@^3.0.71` — bumped both dependencies to current npm-latest; added 6, changed 4 packages; 0 vulnerabilities.
- `npm run build`: exit 0 (Next.js 16.2.3 production build; 26 routes; middleware-deprecation warning is the pre-existing Next 16 scope-creep trap documented in RESEARCH Pitfall #7, not introduced by this plan).
- `npm run test:run`: exit 0 — **257/257** tests passing (identical to HYGIENE-06 post-commit baseline; no test regressions from the version bump).
- `git diff HEAD~1 HEAD --name-only` on the `hygiene-02:` commit shows exactly two files: `package.json`, `package-lock.json`. Zero changes in `src/`, `scripts/`, or `public/` — matches D-16b expectation to the letter.
- Two atomic commits created: `hygiene-02: bump ai-sdk to v6 via codemod (no source changes)` and (pending final) `docs(01-02): record hygiene-02 plan execution summary`.

## Task Commits

1. **Task 1 (pre-flight grep):** no commit — read-only verification step. Output: three empty grep results across `src/`, `scripts/`, `public/`.
2. **Task 2 (codemod + version bump + build/test):** `005dc82` — `hygiene-02: bump ai-sdk to v6 via codemod (no source changes)` — `package.json` + `package-lock.json` only.
3. **Task 3 (VERIFICATION + SUMMARY):** `docs(01-02): ...` — combines the VERIFICATION.md HYGIENE-02 entry with this SUMMARY.md in one docs commit.

## Files Created/Modified

- `package.json` — Bumped two dependency ranges: `ai` from `^6.0.86` to `^6.0.168`, `@ai-sdk/anthropic` from `^3.0.44` to `^3.0.71`. All other deps untouched. `@ai-sdk/react` retained at `^3.0.88` (to be removed by HYGIENE-01 Plan 07).
- `package-lock.json` — Auto-updated by npm to reflect the new ai@6.0.168 dependency tree (net +6 / Δ4 packages per `npm install` output).
- `.planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md` — HYGIENE-02 entry replaced from "pending" stub to `✓ VERIFIED` with commit SHA `005dc82`, dependency bump evidence, and build/test results.
- `.planning/phases/01-pre-invite-hygiene/01-02-ai-sdk-codemod-SUMMARY.md` — this file (new).

## Decisions Made

- **Correct codemod form.** Used `npx --yes @ai-sdk/codemod@3.0.4 v6 src/ scripts/` — the version-pinned, explicit-subcommand, explicit-paths form that RESEARCH Common Pitfalls #1 identified as the canonical official invocation. NOT the malformed `upgrade v6` form from original CONTEXT D-16 (which was corrected on 2026-04-20 after RESEARCH found that `commander` silently ignores trailing args to the `upgrade` subcommand and ends up running v4+v5+v6 codemods instead of just v6).
- **Explicit install over codemod's implicit bump.** Ran `npm install ai@^6.0.168 @ai-sdk/anthropic@^3.0.71` manually instead of letting `codemod upgrade` handle package.json. Per RESEARCH Open Questions Q3-RESOLVED, this gives a cleaner audit trail — the version decision is explicit, and the diff is narrower and deterministic.
- **Version ranges, not exact pins.** Used `^6.0.168` / `^3.0.71` (caret prefix) to accept forward patch + minor updates within the semver boundary. Matches the rest of the repo's dependency convention.
- **Package retention boundary.** Did NOT touch `@ai-sdk/react`, `natural`, `uuid`, or `@types/uuid` — those are HYGIENE-01 (Plan 07) territory per CONTEXT D-14. Strict plan-boundary discipline.
- **Two commits instead of one.** The plan's Task 3 description suggested one combined commit, but the user-level objective for this run specified `hygiene-02:` for code/deps and `docs(01-02):` for VERIFICATION+SUMMARY. Matches the pattern from sibling plans (01, 02, 03, 07 all used the two-commit convention).

## Deviations from Plan

None substantive — plan executed exactly as the objective specified, with two minor notes:

1. **Two commits instead of one (per user-level objective override).** The plan's Task 3 <action> suggested combining everything into one `hygiene-02:` commit. The run objective instead specified `hygiene-02: ...` + `docs(01-02): ...` — two commits matching the existing Phase 1 convention (HYGIENE-03 at 2135496, HYGIENE-07 at 66b4d93 both followed this pattern via their associated docs commits). No CONTEXT rule was broken — D-20 says "one commit per HYGIENE-XX task," which refers to the code-landing commit; docs/evidence commits are additive. The hygiene-02: commit is the single atomic code commit for HYGIENE-02; the docs(01-02): commit carries only the SUMMARY + VERIFICATION entries.

2. **Next.js middleware-deprecation warning in build output.** Pre-existing warning surfaced by every build since Next 16.2.x adoption; RESEARCH Pitfall #7 explicitly documents this as expected and scope-deferred to post-Phase-1. Not introduced by this plan's changes — reproducible before the `hygiene-02:` commit. Noting for completeness; no action required.

## Issues Encountered

None. Every step produced the expected output on the first attempt:

- Pre-flight grep: empty results (confirmed D-16b)
- `npm view` for current-latest: matched RESEARCH Code Examples exactly (`ai@6.0.168`, `@ai-sdk/anthropic@3.0.71`)
- `npm install`: clean add/change/audit, 0 vulnerabilities
- Codemod: `Starting v6 codemods...` → `v6 codemods complete.` (the exact canonical RESEARCH-predicted output; zero file diffs)
- Build: exit 0
- Tests: 257/257 (no regressions from baseline)
- `git diff` post-commit: exactly 2 files, both in the plan's `files_modified` allowlist

## User Setup Required

None. No external service configuration, no credentials, no environment variables. npm pulled from the public registry only.

## Threat Mitigation

- **T-1-06 (Build integrity / codemod breakage) — mitigated.** Build + test gate ran post-codemod, both green. The pre-flight grep (Task 1) established that the codemod had no source to rewrite, so this threat was effectively neutered before the codemod ran. Had the grep surfaced any imports, the plan mandated a STOP and escalate — the plan was prepared to handle the surprise case, it just didn't occur.
- **T-1-06a (Version drift via future npm installs) — accepted.** The `^6.x` and `^3.x` ranges will accept patch + minor updates. Phase 5 COACH-02 will exercise the real v6 API and provides the earliest signal if a future v6.x.y introduces a breaking change.

## Self-Check: PASSED

- **File exists:** `.planning/phases/01-pre-invite-hygiene/01-02-ai-sdk-codemod-SUMMARY.md` — FOUND (this file)
- **File exists:** `.planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md` — FOUND, HYGIENE-02 entry updated
- **Commit exists:** `005dc82` — FOUND (verified via `git log --oneline`); commit message starts with `hygiene-02:`
- **Commit scope:** `git diff 005dc82~1 005dc82 --name-only` = `package-lock.json\npackage.json` (2 files, both in allowed set, zero src/scripts/public changes)
- **Versions:** `node -e` confirms `ai: ^6.0.168 @ai-sdk/anthropic: ^3.0.71` in current package.json
- **Build:** `npm run build` exits 0
- **Tests:** `npm run test:run` 257/257 passing
- **No STATE.md or ROADMAP.md edits** (per user-level objective — handled by parent orchestrator)
- **No package removals** (@ai-sdk/react, natural, uuid, @types/uuid all still present; those are Plan 07 HYGIENE-01)

## Next Phase Readiness

- HYGIENE-02 complete. Per CONTEXT D-19 execution order, only HYGIENE-01 (Plan 07 — dead-package removal) remains before Phase 1 close gate. Two deferred manual tasks (HYGIENE-05 iPhone verify, HYGIENE-07 runbook rehearsal) still outstanding for the phase-close ceremony.
- Phase 5 COACH-02 now has the v6 toolchain it needs: `ai@^6.x` supports `generateObject({ schema })` and AI Gateway patterns. When that plan rewrites `/api/rehearsal-feedback`, the SDK is already where it should be — no in-plan migration work required.
- A future AI SDK v7 (discussions underway per RESEARCH metadata) would be a new HYGIENE-XX cycle; this plan's pattern (pre-flight grep → explicit install → version-pinned codemod → build+test gate → two commits) can be reused verbatim.

---
*Phase: 01-pre-invite-hygiene*
*Completed: 2026-04-21*
