---
phase: 03-authoring-throughput
plan: 01
subsystem: infra
tags: [deps, scaffolding, wave-0, gitignore, bake-cache, p-limit, music-metadata, fake-indexeddb, vitest]

# Dependency graph
requires:
  - phase: 02-safety-floor
    provides: stable main + vitest 4.x baseline + commit-prefix convention reused
provides:
  - p-limit@7.3.0 runtime dep (AUTHOR-09 concurrency cap)
  - music-metadata@11.12.3 runtime dep (AUTHOR-06 audio-duration parsing)
  - fake-indexeddb@6.2.5 dev dep (AUTHOR-10 D-18 dual-open invariant test)
  - npm script entries bake-all + preview-bake (used by Plans 07/08)
  - rituals/_bake-cache/ directory + nested .gitignore (D-01 cache home)
  - root .gitignore entry rituals/_bake-cache/* + !rituals/_bake-cache/.gitignore
  - vitest.config.ts include glob extended to scripts/**/*.test.{ts,tsx}
  - 7 Wave 0 test scaffolds (each turns GREEN as Plans 02-08 land)
affects: [03-02, 03-03, 03-04, 03-05, 03-06, 03-07, 03-08]

# Tech tracking
tech-stack:
  added:
    - p-limit@7.3.0 (sindresorhus, ESM-only, MIT)
    - music-metadata@11.12.3 (Borewit, ESM-only, MIT)
    - fake-indexeddb@6.2.5 (dumbmatter, ESM-only, MIT, dev-only)
  patterns:
    - "@vitest-environment pragma per scaffold (jsdom for IndexedDB; node for pure logic)"
    - "Wave 0 scaffolds with it.todo() markers + Plan-NN citation header"
    - "Belt-and-suspenders gitignore (root entry + nested self-documenting .gitignore)"

key-files:
  created:
    - rituals/_bake-cache/.gitignore
    - src/lib/__tests__/idb-schema.test.ts
    - src/lib/__tests__/dev-guard.test.ts
    - src/lib/__tests__/author-validation.test.ts
    - scripts/__tests__/bake-all.test.ts
    - scripts/__tests__/preview-bake.test.ts
    - scripts/__tests__/render-gemini-audio-cache.test.ts
    - scripts/__tests__/bake-helpers.test.ts
  modified:
    - package.json
    - package-lock.json
    - .gitignore
    - vitest.config.ts

key-decisions:
  - "Adjusted root .gitignore from rituals/_bake-cache/ (plain) to rituals/_bake-cache/* with !rituals/_bake-cache/.gitignore — needed so the nested self-documenting .gitignore is trackable in git. Plan grep acceptance criterion still satisfied."
  - "Extended vitest.config.ts include glob to add scripts/**/*.test.{ts,tsx} — required so the four scripts/__tests__ scaffolds Plans 05-08 will fill in are discoverable by the runner."
  - "Added @ts-expect-error on the fake-indexeddb/auto dynamic import — the package ships types but doesn't expose them via package.json exports; runtime works fine, this only quiets tsc."

patterns-established:
  - "Phase 3 commit prefix: author-NN: imperative lowercase per CONTEXT.md D-20; shared infra commits use author-infra:"
  - "Wave 0 scaffolds belong to the Plan that implements them (header citation), not to the plan that creates the empty file"
  - "scripts/__tests__/ is now a first-class test home alongside src/__tests__/ and src/lib/__tests__/"

requirements-completed: [AUTHOR-01, AUTHOR-02, AUTHOR-05, AUTHOR-06, AUTHOR-08, AUTHOR-09, AUTHOR-10]

# Metrics
duration: ~10min
completed: 2026-04-22
---

# Phase 3 Plan 01: Deps + Scaffolding Summary

**Three new ESM-only deps installed (p-limit, music-metadata, fake-indexeddb), bake-cache directory and gitignore plumbed, seven Wave 0 test scaffolds committed as RED-with-todo so Plans 02-08 each have a pre-existing test file to flip to GREEN.**

## Performance

- **Duration:** ~10 min (dominated by npm install network calls, branch-recovery, and re-running vitest after include-glob fix)
- **Started:** 2026-04-23T01:47:02Z (from STATE.md last-updated)
- **Completed:** 2026-04-23T01:57:27Z
- **Tasks:** 2/2
- **Files created:** 8 (1 nested gitignore + 7 test scaffolds)
- **Files modified:** 4 (package.json, package-lock.json, .gitignore, vitest.config.ts)

## Accomplishments

- Three Phase 3 dependencies installed at exact-pinned versions
  (p-limit@7.3.0, music-metadata@11.12.3, fake-indexeddb@6.2.5) and confirmed
  resolvable under `npx tsx` (ESM-only — no CJS shim needed).
- Two npm script entries registered (`bake-all`, `preview-bake`) so Plans 07/08
  can be invoked via `npm run` once their scripts exist.
- Bake-cache directory and two gitignore layers (root entry + nested
  self-documenting .gitignore) materialized — `fs.cp` migration in Plan 05 will
  not need a `mkdir`.
- Seven Wave 0 test scaffolds committed, each with the correct
  `@vitest-environment` pragma, at least one `it.todo()` marker, and a header
  citing the implementing plan number. Vitest config updated so all 7 are
  discoverable by the runner.
- Full test suite still green: 36 passed + 7 skipped (the new all-todo
  scaffolds), 409 passed + 61 todo = 470 total, no regression.

## Task Commits

Each task was committed atomically:

1. **Task 1: Install deps + add script entries + add gitignore + create cache dir** — `77c07c0` (chore via author-infra:)
2. **Task 2: Seven Wave 0 test scaffolds + vitest include-glob extension** — `73e350c` (test via author-infra:)

_Both commits use the `author-infra:` prefix per D-20, since each spans
multiple AUTHOR-NN requirements rather than implementing one specifically._

## Files Created/Modified

- `package.json` — added 3 deps, 2 script entries (bake-all, preview-bake)
- `package-lock.json` — locked transitive resolutions (added 14 packages, changed 2)
- `.gitignore` — added `rituals/_bake-cache/*` + `!rituals/_bake-cache/.gitignore`
- `rituals/_bake-cache/.gitignore` — self-documenting nested ignore (new dir)
- `vitest.config.ts` — added `scripts/**/*.test.{ts,tsx}` to include glob
- `src/lib/__tests__/idb-schema.test.ts` — Wave 0 scaffold for AUTHOR-10 (Plan 02)
- `src/lib/__tests__/dev-guard.test.ts` — Wave 0 scaffold for D-15 (Plan 03)
- `src/lib/__tests__/author-validation.test.ts` — Wave 0 scaffold for AUTHOR-05 (Plan 04)
- `scripts/__tests__/bake-all.test.ts` — Wave 0 scaffold for AUTHOR-02/09 (Plan 07)
- `scripts/__tests__/preview-bake.test.ts` — Wave 0 scaffold for AUTHOR-08 (Plan 08)
- `scripts/__tests__/render-gemini-audio-cache.test.ts` — Wave 0 scaffold for AUTHOR-01 (Plan 05)
- `scripts/__tests__/bake-helpers.test.ts` — Wave 0 scaffold for AUTHOR-06 (Plan 06)

## Decisions Made

- **Root gitignore pattern adjusted from plain `rituals/_bake-cache/` to glob form
  `rituals/_bake-cache/* + !rituals/_bake-cache/.gitignore`** so the nested
  self-documenting .gitignore is actually trackable. The plan's literal text
  used the plain directory form, but that ignored the very file the plan also
  asked us to create. The acceptance criterion `grep 'rituals/_bake-cache/' .gitignore`
  still passes (matches the new line).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extended vitest.config.ts include glob to pick up `scripts/**/*.test.{ts,tsx}`**
- **Found during:** Task 2 (after creating the four `scripts/__tests__/` scaffolds)
- **Issue:** Default include glob is `["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"]` — the `scripts/__tests__/` dir is silently filtered out even when files are passed explicitly to `vitest run`. With this filter, Plans 05-08 would have had test scaffolds that the runner refuses to discover, defeating the Nyquist validation contract.
- **Fix:** Added `"scripts/**/*.test.{ts,tsx}"` as a third entry in `vitest.config.ts` `test.include`.
- **Files modified:** `vitest.config.ts`
- **Verification:** Re-ran the seven-file vitest invocation — went from "3 skipped (3) / 13 todo" to "7 skipped (7) / 61 todo". Full suite still 36 passed (no existing test broken).
- **Committed in:** `73e350c` (folded into the Task 2 author-infra: scaffold commit)

**2. [Rule 3 - Blocking] Added `// @ts-expect-error TS7016` directive on the `fake-indexeddb/auto` dynamic import**
- **Found during:** Task 2 (`npx tsc --noEmit` after creating idb-schema.test.ts)
- **Issue:** `fake-indexeddb` ships type declarations at `node_modules/fake-indexeddb/auto.d.ts` but its `package.json` `exports` map doesn't surface them through the `/auto` subpath. TypeScript reports `TS7016: Could not find a declaration file for module 'fake-indexeddb/auto'`. Vitest itself runs the test fine (it's a runtime import inside a beforeEach); the directive only quiets `tsc --noEmit` so it doesn't get flagged in CI.
- **Fix:** Added a comment block + `@ts-expect-error TS7016` directly above the dynamic import line.
- **Files modified:** `src/lib/__tests__/idb-schema.test.ts`
- **Verification:** `npx tsc --noEmit | grep idb-schema` returns nothing. Vitest still treats the file as 3 todos (no behavior change).
- **Committed in:** `73e350c` (folded into the Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking issues directly caused by this plan's new files)
**Impact on plan:** Both deviations are necessary for the plan's verification contract to be honored. No scope creep — the include-glob change unlocks Plans 05-08, and the @ts-expect-error is a one-liner whose comment foreshadows Plan 02's likely simplification (a global setupFile install).

## Issues Encountered

- **Mid-execution branch checkout to `docs/pilot-email-banner-no-select` (external).**
  Between Task 1 commit and the start of Task 2 verification, an external
  process (likely a parallel session working on the masonicmentor.app banner
  copy fix) ran `git checkout docs/pilot-email-banner-no-select` and
  `git reset --hard aad7a11`. Task 1 commit `77c07c0` was preserved on the
  phase-3 branch (untouched), but the Task 2 commit I subsequently created
  landed on `docs/pilot-email-banner-no-select` as `1de6dcb` instead of
  phase-3.

  **Recovery (no work lost):**
  1. `git checkout gsd/phase-3-authoring-throughput` — back on the right branch.
  2. `git cherry-pick 1de6dcb` — Task 2 work landed on phase-3 as `73e350c`.
  3. `git update-ref refs/heads/docs/pilot-email-banner-no-select cddfd23 1de6dcb`
     — rewound docs/pilot... to its origin tip (cddfd23), removing my
     mis-targeted commit. Used `update-ref` rather than `checkout + reset`
     to avoid switching off phase-3 again.

  Final state: both Task 1 and Task 2 are present on
  `gsd/phase-3-authoring-throughput`; `docs/pilot-email-banner-no-select`
  matches origin and is ready for the user's parallel work to continue.

## User Setup Required

None — all changes are local repo + npm install. No external service configuration required for this plan.

## Next Phase Readiness

- **Plan 02 (idb-schema, AUTHOR-10):** can start immediately. `fake-indexeddb` is installed, `idb-schema.test.ts` scaffold exists with the @ts-expect-error directive that Plan 02 may remove if it adopts a global setupFile pattern.
- **Plan 03 (dev-guard, D-15):** `dev-guard.test.ts` scaffold ready.
- **Plan 04 (author-validation, AUTHOR-05):** `author-validation.test.ts` scaffold ready.
- **Plan 05 (cache key v3 + migration, AUTHOR-01):** `render-gemini-audio-cache.test.ts` scaffold ready; `rituals/_bake-cache/` exists for the migration target.
- **Plan 06 (bake-helpers, AUTHOR-06):** `bake-helpers.test.ts` scaffold ready; `music-metadata` installed for duration parsing.
- **Plan 07 (bake-all orchestrator, AUTHOR-02/09):** `bake-all.test.ts` scaffold + `npm run bake-all` script entry ready; `p-limit` installed.
- **Plan 08 (preview-bake, AUTHOR-08):** `preview-bake.test.ts` scaffold + `npm run preview-bake` script entry ready.
- **No blockers** for any downstream plan in Phase 3.

## Self-Check: PASSED

- Files claimed created (8): all present on disk.
  - `rituals/_bake-cache/.gitignore` — FOUND
  - `src/lib/__tests__/idb-schema.test.ts` — FOUND
  - `src/lib/__tests__/dev-guard.test.ts` — FOUND
  - `src/lib/__tests__/author-validation.test.ts` — FOUND
  - `scripts/__tests__/bake-all.test.ts` — FOUND
  - `scripts/__tests__/preview-bake.test.ts` — FOUND
  - `scripts/__tests__/render-gemini-audio-cache.test.ts` — FOUND
  - `scripts/__tests__/bake-helpers.test.ts` — FOUND
- Commits claimed:
  - `77c07c0` — FOUND on `gsd/phase-3-authoring-throughput` (Task 1)
  - `73e350c` — FOUND on `gsd/phase-3-authoring-throughput` (Task 2, cherry-picked from `1de6dcb`)
- Verification commands:
  - `node -e "...full automated check..."` exited 0 with `ok`.
  - `npx vitest run --no-coverage [seven files]` exited 0 (7 skipped / 61 todo).
  - `npx vitest run --no-coverage` (full suite) exited 0 (36 passed + 7 skipped, 409 passed + 61 todo).
  - `npx tsx .phase3-deps-sanity.ts` printed `p-limit: function` + `music-metadata parseBuffer: function` (file deleted before commit, never tracked).

---
*Phase: 03-authoring-throughput*
*Completed: 2026-04-22*
