---
phase: 03-authoring-throughput
fixed_at: 2026-04-23T21:40:00Z
review_path: .planning/phases/03-authoring-throughput/03-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: fixes-applied
test_status: passed
---

# Phase 3: Code Review Fix Report

**Fixed at:** 2026-04-23T21:40:00Z
**Source review:** `.planning/phases/03-authoring-throughput/03-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope (Critical + High + Medium): 7
- Fixed: 7
- Skipped: 0
- Out-of-scope (Low + Info, deferred to iteration 2 or follow-up): 7
- Full test suite after fixes: **517 / 517 passed** (`npx vitest run --no-coverage`)

## Per-finding results

| ID    | Severity | Status | Commit  | Notes |
|-------|----------|--------|---------|-------|
| HI-01 | High     | fixed  | f5b0f64 | Extracted `validateOrFail` into `scripts/lib/validate-or-fail.ts`; both `bake-all.ts` and `build-mram-from-dialogue.ts` now import the single shared function. |
| HI-02 | High     | fixed  | a17a099 | Kept halt-on-first behavior (per 03-07-SUMMARY.md §Failure decision); updated comment + failure summary wording to describe that reality and report "N not attempted" with the skipped slug list. |
| ME-01 | Medium   | fixed  | 5e8b34f | Replaced module-scoped `let migrationRan = false` with a memoized `migrationPromise` — re-entrant and concurrent-safe; `__resetMigrationFlagForTests` still works, existing tests green. |
| ME-02 | Medium   | fixed  | f853845 | Wrapped `fs.statSync(resolved)` in try/catch in `preview-bake.ts#handleOpusRequest`; ENOENT now returns 404 instead of leaking a 500. |
| ME-03 | Medium   | fixed  | 77c1ba6 | Deduped line-id and role parsing in `invalidate-mram-cache.ts` via `Array.from(new Set(…))`; hoisted `argv[i+1]` accesses into named locals for safer null handling. |
| ME-04 | Medium   | fixed  | 22dd856 | Wrapped all six exported `storage.ts` functions (`getOrCreateKey`, `saveMRAMDocument`, `listDocuments`, `getDocumentSections`, `getDocumentPlainText`, `deleteDocument`) in `try { … } finally { db.close(); }` so IDBDatabase handles release on rejection paths. |
| ME-05 | Medium   | fixed  | 0379253 | Added SIGINT/SIGTERM handlers to `promptPassphrase` and `promptFallbackChoice` that restore cooked-mode stdin via a shared `cleanup()` closure before `process.exit(130)`; terminal no longer left in raw mode if bake is killed mid-prompt. |

## Verification

**Targeted tests** run after each commit:

- HI-01 + HI-02 (bake-all.ts, build-mram-from-dialogue.ts, scripts/lib/): `scripts/__tests__/bake-all.test.ts` + `scripts/__tests__/bake-helpers.test.ts` → 52 / 52 passed
- ME-01 (render-gemini-audio.ts): `scripts/__tests__/render-gemini-audio-cache.test.ts` → 13 / 13 passed
- ME-02 (preview-bake.ts): `scripts/__tests__/preview-bake.test.ts` → 20 / 20 passed
- ME-03 (invalidate-mram-cache.ts): no direct tests; TypeScript compile clean
- ME-04 (storage.ts): no direct tests; whole `src/lib/__tests__/` suite → 360 / 360 passed
- ME-05 (build-mram-from-dialogue.ts prompts): no direct tests; TypeScript compile clean

**Full suite** after all fixes: `npx vitest run --no-coverage` → **43 files, 517 tests, all passing.**

**Type-check status:** `npx tsc --noEmit` shows only pre-existing errors unrelated to this fix pass:
- `Intl.Segmenter` namespace export missing (pre-existing tsconfig/lib issue)
- `degraded-mode-store.ts`, `dialogue-to-mram.ts` `--downlevelIteration` warnings (pre-existing)
- `build-mram-from-dialogue.ts:639` discriminated-union narrowing on `validated.error` (pre-existing; line shifted from 618→639 due to ME-05 additions but same issue)

No new type errors were introduced by any fix.

## Out-of-scope (Low + Info)

Per fix-scope `critical_warning`, the following were NOT addressed this iteration:

- **LO-01** — `bake-all.ts` `--parallel` silent NaN fallback (argv parser). Deferred: test currently codifies the silent coercion as the contract, so changing behavior would need a test update.
- **LO-02** — `preview-bake.ts` `ensureLoopback` narrow whitelist. Deferred: could be a doc-comment-only fix noting intent.
- **LO-03** — `render-gemini-audio.ts` `sleepUntilMidnightPT` Intl DST edge. Deferred: works on Node ≥ 18 with full-icu, 30s slack absorbs drift.
- **LO-04** — `build-mram-from-dialogue.ts` `parseFallbackMode` missing usage on throw. Deferred: passable error message already surfaces the issue.
- **IN-01** — `pLimit` instantiated but unused in `bake-all.ts`. Deferred: `void limit` comment already documents the reserved call site.
- **IN-02** — `storage.ts#getOrCreateKey` silent key-import failure. Deferred: adding a `console.warn` is a one-line follow-up but would produce spurious warnings in tests without care.
- **IN-03** — `MIN_BAKE_LINE_CHARS` / `MIN_PREAMBLE_LINE_CHARS` duplicated constants. Deferred: comment in `invalidate-mram-cache.ts:49` already marks the sync-required contract; extracting to `scripts/lib/bake-thresholds.ts` is a clean follow-up.

These can be folded into iteration 2 or a dedicated polish pass.

## Branch

All 7 commits land on `gsd/phase-3-authoring-throughput` (PR #74 target). No changes to `main`; `branch_protection` constraint respected.

---

_Fixed: 2026-04-23T21:40:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
