# Deferred Items — Phase 03 (Authoring Throughput)

Out-of-scope discoveries logged during plan execution, per the executor's
scope-boundary rule (only auto-fix issues directly caused by the current
task's changes). Logged, not fixed.

## 03-02 / 03-04: Pre-existing repo-wide `npx tsc --noEmit` errors (unrelated files)

**Discovered during:** 03-02 Task 2 verification and independently confirmed
during 03-04 verification.

**Status:** Confirmed pre-existing — reproduced with `git checkout --` on the
files each plan touches (reverting to the pre-plan tree) and re-running
`npx tsc --noEmit`; the same 12-line error set is present with zero relation
to any Phase 3 file (`scripts/render-gemini-audio.ts`,
`scripts/invalidate-mram-cache.ts`, `scripts/migrate-bake-cache.ts`,
`src/lib/idb-schema.ts`, `src/lib/storage.ts`, `src/lib/voice-storage.ts`).

**Files affected (not modified by this phase):**
- `src/app/api/transcribe/__tests__/route.test.ts` (2x TS7006 implicit any on `c` param)
- `src/app/api/tts/gemini/__tests__/route.test.ts` (3x TS7006 implicit any on `c` param)
- `src/lib/__tests__/dev-guard.test.ts:10` (TS2540 — assigning to read-only `NODE_ENV`)
- `src/lib/__tests__/rotate-mram.test.ts:59` (TS2322 — `ArrayBuffer | SharedArrayBuffer` not assignable to `ArrayBuffer`)
- `src/lib/__tests__/screen-wake-lock.test.ts:68` (TS2578 — unused `@ts-expect-error`)
- `src/lib/__tests__/voice-export-import.test.ts` (4x TS2352 — `LocalVoice`-to-`Record<string, unknown>` conversion)

**Impact:** `npx tsc --noEmit` alone exits 1 for the whole repo, which breaks
any `&&`-chained verify command starting with it. Plans verified instead by
grepping the tsc output for their own files (clean) and running the rest of
the chain independently. Full vitest suite passes clean — these are
`tsc`-only strictness findings in test files, not runtime failures.

**Action:** Not fixed (out of scope for AUTHOR-01/AUTHOR-03/AUTHOR-10).
Flagging for Shannon to decide whether a follow-up hygiene pass should
tighten these test files, or whether `tsconfig.json` test-file strictness
should be relaxed.
