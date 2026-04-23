---
phase: 01-pre-invite-hygiene
plan: 07
subsystem: infra
tags: [npm, package.json, dependency-hygiene, dead-code-removal, supply-chain]

# Dependency graph
requires:
  - phase: 01-pre-invite-hygiene
    provides: HYGIENE-02 codemod landed ai@^6.0.168 + @ai-sdk/anthropic@^3.0.71 with zero source changes; HYGIENE-06 test suite baseline at 257/257 green
provides:
  - Clean package.json with dead packages removed (`natural`, `uuid`, `@ai-sdk/react`, `@types/uuid`)
  - Reduced supply-chain surface (81 fewer installed packages — 4 direct + 77 transitive)
  - Confirmation that `ai@^6.0.168` and `@ai-sdk/anthropic@^3.0.71` are the ONLY AI SDK packages the app needs pre-Phase-5
affects:
  - 05-coach (COACH-02 feedback route rewrite — operates on the retained ai + @ai-sdk/anthropic packages; now confirmed free of stale @ai-sdk/react siblings)
  - All future phases (smaller npm install, faster CI, fewer audit surfaces)

# Tech tracking
tech-stack:
  removed:
    - "natural (NLP toolkit — zero imports, dead code)"
    - "uuid (replaced by crypto.randomUUID() pre-repo)"
    - "@ai-sdk/react (React hook bindings — zero imports)"
    - "@types/uuid (types for removed uuid)"
  retained:
    - "ai@^6.0.168 (Phase 5 COACH-02 dependency)"
    - "@ai-sdk/anthropic@^3.0.71 (Phase 5 COACH-02 dependency)"
  patterns:
    - "Grep-before-uninstall safety invariant (CONTEXT D-15) — mandatory pre-flight import check before any npm uninstall"

key-files:
  created: []
  modified:
    - "package.json (4 entries removed: 3 deps, 1 devDep)"
    - "package-lock.json (reflected 81-package removal)"
    - ".planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md (HYGIENE-01 evidence block + Phase 1 done-gate tally)"

key-decisions:
  - "Used npm uninstall (not manual package.json edit) to let npm atomically update both package.json and package-lock.json — preserves lockfile integrity per CONVENTIONS"
  - "Left uuid@10.0.0 transitive dep under resend→svix untouched — not our direct dep, not ours to manage; CONTEXT D-14 specifies direct-dep removal only"
  - "Flipped Phase 1 done-gate to 3/5 boxes checked (build green, tests green, code-side HYGIENE all verified) with 2 boxes explicitly DEFERRED (HYGIENE-05 iPhone test, HYGIENE-07 preview-deploy rehearsal) — surfaces the remaining gate for the verifier rather than silently closing"

patterns-established:
  - "Dead-package cleanup: grep-before-uninstall, verify-after (npm ls + build + test), commit atomically as `hygiene-01: remove dead packages (...)`"
  - "Final hygiene plan in a phase acts as an integration canary — if any earlier plan silently depended on a dead package, `npm run build` after this step surfaces it"

requirements-completed: [HYGIENE-01]

# Metrics
duration: 4min
completed: 2026-04-20
---

# Phase 1 Plan 07: Dead-package cleanup Summary

**Removed 4 dead npm packages (`natural`, `uuid`, `@ai-sdk/react`, `@types/uuid`) — 81 total packages gone (4 direct + 77 transitive) — build + test remain green at 257/257.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-21T03:14:00Z (approx; pre-flight grep start)
- **Completed:** 2026-04-21T03:18:00Z (commit `b82aefe`)
- **Tasks:** 3 (pre-flight grep, npm uninstall + verify, VERIFICATION.md update + commit)
- **Files modified:** 3 (package.json, package-lock.json, 01-VERIFICATION.md)

## Accomplishments

- Pre-flight grep across `src/`, `scripts/`, `public/` confirmed zero imports of `natural`, `uuid`, `@ai-sdk/react`, and zero references to `@types/uuid` — definitive confirmation that all four packages were truly dead per CONTEXT D-14 + D-15.
- `npm uninstall natural uuid @ai-sdk/react @types/uuid` removed the four direct deps and 77 transitive dependencies, for a total of 81 packages gone from `node_modules`.
- Retained `ai@^6.0.168` and `@ai-sdk/anthropic@^3.0.71` — the two AI SDK packages Phase 5 COACH-02 will rewrite `/api/rehearsal-feedback` against.
- `npm run build` and `npm run test:run` both green post-removal — 257/257 tests passing (same count as the HYGIENE-02 baseline), confirming no silent dependency on removed packages.
- Updated `01-VERIFICATION.md` with the HYGIENE-01 evidence block; flipped 3 of 5 Phase 1 done-gate boxes to checked, left the two manual items (HYGIENE-05 iPhone test, HYGIENE-07 preview-deploy rehearsal) explicitly DEFERRED.
- Phase 1's code-side work is now complete. The phase is one commit away from `status: complete` — that commit is Shannon completing the two deferred manual items.

## Task Commits

1. **Task 1: Pre-flight grep verification** — (no commit; read-only verification step)
2. **Task 2: npm uninstall + verify build + test** — part of `b82aefe` (chore → `hygiene-01:` tag)
3. **Task 3: Update VERIFICATION.md + commit** — `b82aefe` bundled package changes; VERIFICATION.md + SUMMARY.md land in the final `docs(01-01):` metadata commit

**Package removal commit:** `b82aefe` — `hygiene-01: remove dead packages (natural, uuid, @ai-sdk/react, @types/uuid)`
**Plan metadata commit:** (final `docs(01-01):` commit with VERIFICATION.md + SUMMARY.md)

## Files Created/Modified

- `package.json` — Removed `natural`, `uuid`, `@ai-sdk/react` from `dependencies`; removed `@types/uuid` from `devDependencies`. Dependencies count: 13 → 10. DevDependencies count: 14 → 13.
- `package-lock.json` — npm-managed reflection of the 81-package removal (936 line deletions vs 32 line insertions in the `hygiene-01:` commit).
- `.planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md` — Replaced `HYGIENE-01 — Dead-package removal (Plan 07 — pending)` placeholder with full evidence block; flipped Phase 1 done-gate tallies to mark 3 code-side boxes complete and 2 manual boxes explicitly DEFERRED.
- `.planning/phases/01-pre-invite-hygiene/01-01-package-cleanup-SUMMARY.md` — This file.

## Decisions Made

- **npm uninstall over manual edit.** Let npm atomically update both `package.json` and `package-lock.json` rather than hand-editing and regenerating — preserves lockfile integrity and is what CONVENTIONS implicitly requires.
- **Left `uuid@10.0.0` transitive dep under `resend → svix` alone.** The transitive version is owned by `resend` (a retained package); CONTEXT D-14 scoped this task to direct-dep removal. Our direct `uuid` dep is removed; the transitive one is not our concern.
- **Phase 1 done-gate: 3/5 checked, 2 explicitly DEFERRED.** Rather than silently closing Phase 1, marked the two manual items (HYGIENE-05 iPhone test, HYGIENE-07 preview-deploy rehearsal) as `[ ] ... — DEFERRED` so the verifier surfaces them as open work before Shannon invites outside lodges.

## Deviations from Plan

None — plan executed exactly as written. Pre-flight grep confirmed the CONTEXT D-14 removal list; `npm uninstall` succeeded; build + test stayed green; retained packages intact.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

**Phase 1 code-side work is COMPLETE.** All 7 HYGIENE-XX items have `✓ VERIFIED` (or `✓ CODE LANDED` / `⏸ DEFERRED` with unambiguous status) evidence in `01-VERIFICATION.md`. Two items remain open as manual tasks for Shannon before the phase can be formally closed:

- **HYGIENE-05 iPhone + iCloud Private Relay verification** — Shannon manually tests magic-link round-trip on iPhone; records timestamp + iOS version in VERIFICATION.md.
- **HYGIENE-07 runbook rehearsal** — Shannon walks the `docs/runbooks/SECRET-ROTATION.md` end-to-end against a Vercel preview deploy; fixes any gaps inline.

Both are explicitly flagged in the Phase 1 done-gate checklist. Once Shannon clears both, Phase 1 frontmatter flips from `in_progress` to `complete` and Phase 2 (Safety Floor — per-user rate limits, audit log, kill switch) is unblocked per ROADMAP.

**For Phase 2 planner:** the cleaned package.json is the dependency baseline — any new deps added in Phase 2 (e.g., rate-limit libraries) should clear the same grep-before-uninstall invariant established here (CONTEXT D-15 pattern) when they are later retired.

**For Phase 5 COACH-02 planner:** confirmed `ai@^6.0.168` + `@ai-sdk/anthropic@^3.0.71` are the ONLY AI SDK packages in the tree. No stale `@ai-sdk/react` or `@ai-sdk/openai` siblings to worry about when rewriting `/api/rehearsal-feedback`.

---
*Phase: 01-pre-invite-hygiene*
*Completed: 2026-04-20*

## Self-Check: PASSED

- `01-01-package-cleanup-SUMMARY.md` exists at `.planning/phases/01-pre-invite-hygiene/`
- `01-VERIFICATION.md` HYGIENE-01 section updated from pending placeholder to full evidence block (checked: header no longer ends with `(Plan 07 — pending)`)
- `package.json` confirmed free of `natural`, `uuid`, `@ai-sdk/react`, `@types/uuid` (greps return zero matches)
- `package.json` confirmed still has `ai` and `@ai-sdk/anthropic` (retained for Phase 5 COACH-02)
- Commit `b82aefe` (`hygiene-01: remove dead packages ...`) exists in git log
- Build exit 0, test suite 257/257 green (verified during Task 2)
