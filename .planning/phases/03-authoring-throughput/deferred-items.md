# Deferred Items — Phase 03 (Authoring Throughput)

Out-of-scope discoveries logged during plan execution, per the executor's
scope-boundary rule (only auto-fix issues directly caused by the current
task's changes).

## 03-02: Pre-existing repo-wide `npx tsc --noEmit` errors (unrelated files)

**Discovered during:** 03-02 Task 2 verification (`npx tsc --noEmit && npx tsx
scripts/migrate-bake-cache.ts --help ...`).

**Status:** Confirmed pre-existing — reproduced with `git checkout --` on the
two files this plan touches (reverting to the pre-03-02 tree) and re-running
`npx tsc --noEmit`; the same 12-line error set is present with zero relation
to `scripts/render-gemini-audio.ts`, `scripts/invalidate-mram-cache.ts`, or
`scripts/migrate-bake-cache.ts`.

**Files affected (not modified by this phase):**
- `src/app/api/transcribe/__tests__/route.test.ts` (2x TS7006 implicit any)
- `src/app/api/tts/gemini/__tests__/route.test.ts` (3x TS7006 implicit any)
- `src/lib/__tests__/dev-guard.test.ts` (TS2540 — assigning to read-only `NODE_ENV`)
- `src/lib/__tests__/rotate-mram.test.ts` (TS2322 — ArrayBuffer/SharedArrayBuffer type mismatch)
- `src/lib/__tests__/screen-wake-lock.test.ts` (TS2578 — unused `@ts-expect-error`)
- `src/lib/__tests__/voice-export-import.test.ts` (4x TS2352 — LocalVoice-to-Record conversion)

**Impact on this plan:** `npx tsc --noEmit` alone exits 1 for the whole repo,
which breaks the plan's `&&`-chained verify command
(`npx tsc --noEmit && npx tsx scripts/migrate-bake-cache.ts --help ...`).
Verified instead by running each half separately: `npx tsc --noEmit 2>&1 |
grep -i "render-gemini-audio\|invalidate-mram-cache\|migrate-bake-cache"`
returns clean, and `npx tsx scripts/migrate-bake-cache.ts --help | grep -qi
"dry-run\|--yes"` passes independently. Full vitest suite (438 tests) also
passes clean — these are `tsc`-only strictness findings in test files, not
runtime failures.

**Action:** Not fixed (out of scope for AUTHOR-01/AUTHOR-03). Flagging for
Shannon to decide whether a follow-up hygiene pass should tighten these test
files, or whether `tsconfig.json` test-file strictness should be relaxed.
