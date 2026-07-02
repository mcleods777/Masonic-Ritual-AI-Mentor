# Deferred Items — Phase 03 (Authoring Throughput)

Pre-existing issues discovered during execution that are out of scope for the
current plan (not caused by this plan's changes). Logged, not fixed, per
executor scope-boundary rules.

## From 03-04 (idb-schema extraction)

`npx tsc --noEmit` reports pre-existing type errors unrelated to
`src/lib/idb-schema.ts`, `src/lib/storage.ts`, or `src/lib/voice-storage.ts`
(none of these plan files appear in the error list):

- `src/app/api/transcribe/__tests__/route.test.ts` — implicit `any` on `c` param (2 occurrences)
- `src/app/api/tts/gemini/__tests__/route.test.ts` — implicit `any` on `c` param (3 occurrences)
- `src/lib/__tests__/dev-guard.test.ts:10` — assigning to read-only `NODE_ENV`
- `src/lib/__tests__/rotate-mram.test.ts:59` — `ArrayBuffer | SharedArrayBuffer` not assignable to `ArrayBuffer`
- `src/lib/__tests__/screen-wake-lock.test.ts:68` — unused `@ts-expect-error` directive
- `src/lib/__tests__/voice-export-import.test.ts` — `LocalVoice` to `Record<string, unknown>` conversion errors (4 occurrences)

These do not block plan 03-04's verification (`npx tsc --noEmit` is expected
to be non-zero already; the plan's own verify commands target the specific
files/greps relevant to AUTHOR-10, which all pass).
