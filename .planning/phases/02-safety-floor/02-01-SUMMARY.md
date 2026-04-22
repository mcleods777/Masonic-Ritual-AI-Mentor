---
phase: 02-safety-floor
plan: 01
subsystem: infra
tags: [audit-log, pii-safety, pricing, eslint, vitest, spend-tally, jose]

# Dependency graph
requires:
  - phase: 01-pre-invite-hygiene
    provides: "Commit convention (D-20, `safety-NN: imperative` / `safety-infra:` for cross-cutting), test-file convention (D-11, `src/**/__tests__/<name>.test.ts`), vitest 4.1.2 + eslint 9 flat-config harness, rate-limit.ts analog pattern."
provides:
  - "src/lib/audit-log.ts — emit(record: AuditRecord) for PII-free audit records to Vercel logs via synchronous console.log('[AUDIT]', ...). TS discriminated union TTSRecord | STTRecord | FeedbackRecord excludes prompt/completion/email/text/body at the type level (D-09). Emits call into spend-tally synchronously (D-06b)."
  - "src/lib/pricing.ts — per-model PRICING_TABLE (17 entries) + estimateCost(modelId, units, unitType) USD helper. Entry kinds: per-input-token, per-output-token, per-character, per-audio-minute, per-audio-token (Gemini), self-hosted (kokoro). All entries carry verified=2026-04-21 + https:// sourceUrl (D-08)."
  - "src/lib/spend-tally.ts — in-memory UTC-day spend accumulator (D-06b). incrementSpendTally(hashedUser, cost) + readAndClearSpendForDay(utcDate) + __resetSpendTallyForTests. Same cold-start caveat as rate-limit.ts; consumed by SAFETY-04 cron (Plan 04)."
  - "eslint.config.mjs no-restricted-syntax rule — catches literal object-argument PII keys in emit() calls (D-10). Defense-in-depth with the TS union; fixture src/lib/__tests__/fixtures/banned-emit.ts is the regression guard."
affects: [safety-02, safety-03, safety-04, safety-06, safety-08, safety-09, coach-02, admin-02]

# Tech tracking
tech-stack:
  added: []  # no new runtime/dev dependencies
  patterns:
    - "Synchronous console.log audit emit with [AUDIT] prefix (reserves the prefix for Phase 6 ADMIN-02 Log Drain)."
    - "TS discriminated-union + ESLint no-restricted-syntax defense-in-depth pair for compile-time PII exclusion."
    - "In-memory day-scoped counter mirroring rate-limit.ts (header-comment template + __resetForTests export)."
    - "Pricing entry as a discriminated union keyed by kind — avoids the Pitfall 6 'every TTS is per-character' false-friend assumption for Gemini."

key-files:
  created:
    - src/lib/audit-log.ts
    - src/lib/pricing.ts
    - src/lib/spend-tally.ts
    - src/lib/__tests__/audit-log.test.ts
    - src/lib/__tests__/pricing.test.ts
    - src/lib/__tests__/spend-tally.test.ts
    - src/lib/__tests__/fixtures/banned-emit.ts
  modified:
    - eslint.config.mjs

key-decisions:
  - "ESLint selector uses descendant combinator (space) between CallExpression[callee.name='emit'] and ObjectExpression — RESEARCH Pattern 3's direct-child combinator (`>`) does NOT match when the object literal is wrapped in a TSAsExpression (which is exactly the shape the fixture uses via `as never`). Descendant combinator catches both forms with no false positives because the callee-name anchor is specific to emit()."
  - "PRICING_TABLE split Groq Llama into two entries (`groq-llama-3.3-70b-versatile-input` and `...-output`) and similarly for Mistral Small, rather than using a composite entry with both input+output rates — keeps each PricingEntry a clean single-kind discriminated-union member, matching Pitfall 6's recommended shape."
  - "Mistral Small (in/out) and Voxtral TTS flagged with explicit 'LOW confidence — verify at console.mistral.ai before merge (D-06d)' text in `notes`; test asserts that marker exists so the flag can't be removed silently."
  - "incrementSpendTally guards against non-finite / non-positive costs with an early return — keeps the tally clean if a malformed AuditRecord leaks into emit() (defensive, aligns with the test matrix)."

patterns-established:
  - "[AUDIT] log prefix convention — downstream paid routes (Plans 03, 05, 06, 07) emit via emit(), never raw console.log, so the Vercel log filter + Phase 6 Log Drain have one consistent tag."
  - "Pricing entries land in src/lib/pricing.ts only; no external billing API dependency. Drift is fixed by editing the table + bumping `verified` dates."
  - "Test-file env pragma `// @vitest-environment node` on any test that spies on console or uses Node-only APIs — matches auth.test.ts precedent."

requirements-completed: [SAFETY-01]

# Metrics
duration: 14min
completed: 2026-04-21
---

# Phase 2 Plan 01: Audit-log + pricing + spend-tally infrastructure

**PII-free audit-log infrastructure: emit() with TS-union + ESLint defense-in-depth, 17-entry pricing table with per-kind unit handling (incl. Gemini per-audio-token outlier), and an in-memory UTC-day spend accumulator for the SAFETY-04 cron.**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-04-21T12:26:44Z
- **Completed:** 2026-04-21T12:40:18Z
- **Tasks:** 2 (both TDD)
- **Files created:** 7
- **Files modified:** 1 (eslint.config.mjs)
- **Commits:** 4 (2 × RED + 2 × GREEN)

## Accomplishments

- **PII-free audit emit infrastructure landed.** `emit(record: AuditRecord)` in `src/lib/audit-log.ts` is synchronous (`console.log('[AUDIT]', JSON.stringify(record))`) and forwards `(hashedUser, estimatedCostUSD)` into `src/lib/spend-tally.ts` so the SAFETY-04 cron (Plan 04) has warm-container day totals to read. Every Phase 2 paid-route plan can now `import { emit } from "@/lib/audit-log"` with confidence.
- **Compile-time + lint-time PII guard shipped.** `AuditRecord` is a discriminated union of `TTSRecord | STTRecord | FeedbackRecord` that omits `prompt|completion|email|text|body` at the type level (D-09), and `eslint.config.mjs` adds a `no-restricted-syntax` rule banning those keys in literal `emit({...})` arguments (D-10). The regression fixture at `src/lib/__tests__/fixtures/banned-emit.ts` trips the rule with the canonical message — verified via `npx eslint`.
- **17-row pricing table (D-08) grounded in sourced provider docs.** Each `PRICING_TABLE` entry carries `verified: "2026-04-21"` and an `https://` source URL. Entry kinds (`per-input-token`, `per-output-token`, `per-character`, `per-audio-minute`, `per-audio-token`, `self-hosted`) are a discriminated union so the Gemini-TTS outlier (25 audio tokens/sec, not per-character) can't be mis-multiplied at call time (Pitfall 6). LOW-confidence Mistral Small + Voxtral TTS entries carry explicit `notes` flags per D-06d, and a test asserts those flags remain present.
- **Spend tally harness ready for Plan 04.** `src/lib/spend-tally.ts` mirrors `rate-limit.ts` shape: `incrementSpendTally` + `readAndClearSpendForDay` + `__resetSpendTallyForTests`. Day bucketing is UTC; idempotent read-and-clear; ignores NaN/Infinity/≤0 costs.
- **Test coverage: +22 unit tests (257 → 279 total, all green).** Build green; ESLint rule fires only on the fixture; full suite `npm run test:run` 279/279.

## Task Commits

Each task followed TDD: **RED** commits first (failing tests / fixture), then **GREEN** commits with the implementation.

1. **Task 1: audit-log + spend-tally + pricing modules + tests**
   - `c2290c5` — `test(02-01): add failing tests for audit-log + pricing + spend-tally (RED)`
   - `cee0e9d` — `safety-infra: add audit-log + pricing + spend-tally infrastructure (GREEN)`
2. **Task 2: ESLint no-restricted-syntax PII guard + fixture**
   - `49f4a39` — `test(02-01): add banned-emit fixture for PII-guard rule (RED)`
   - `30f4cd1` — `safety-01: add eslint no-restricted-syntax PII guard for audit-log emit() (GREEN)`

_Per Phase 1 D-20 convention: `safety-NN:` for requirement-scoped commits (`safety-01:` for the PII-rule landing), `safety-infra:` for the cross-cutting infra commit that touches all three lib modules at once._

## Files Created/Modified

### Created

- `src/lib/audit-log.ts` — `emit(record: AuditRecord)` + discriminated union types. Synchronous, feeds spend-tally.
- `src/lib/pricing.ts` — `PRICING_TABLE` (17 entries, all verified 2026-04-21) + `estimateCost(modelId, units, unitType)` helper with per-kind unit math.
- `src/lib/spend-tally.ts` — in-memory UTC-day accumulator. Matches `rate-limit.ts` shape.
- `src/lib/__tests__/audit-log.test.ts` — 3 tests: `[AUDIT]` prefix shape, spend-tally forwarding, multi-kind round-trip.
- `src/lib/__tests__/pricing.test.ts` — 13 tests: per-kind cost math, unknown-model warn, mismatch warn, units-guard, table-shape invariants, LOW-confidence notes.
- `src/lib/__tests__/spend-tally.test.ts` — 6 tests: accumulate, multi-user, clear-on-read, defensive value handling, empty-day read.
- `src/lib/__tests__/fixtures/banned-emit.ts` — deliberate rule-violation fixture for regression guard.

### Modified

- `eslint.config.mjs` — added `no-restricted-syntax` rule for `src/**/*.{ts,tsx}` with AST selector banning the 5 PII keys in emit() argument object literals. Kept existing flat-config shape; new rule block sits between `nextTs` spread and the final `globalIgnores`.

## Decisions Made

See frontmatter `key-decisions`. In short:

1. Descendant combinator (space) replaces the direct-child combinator (`>`) in the ESLint selector so the rule matches both `emit({...})` and `emit({...} as never)` forms. This was a deviation from RESEARCH Pattern 3's literal selector, driven by the AST shape the fixture actually produces — logged below under Deviations.
2. Split Groq Llama and Mistral Small into `-input` / `-output` entries to keep each `PricingEntry` a clean discriminated-union member. Avoids a composite "two rates per entry" entry that would have forced `estimateCost` to branch on unit-type _inside_ one entry.
3. `incrementSpendTally` ignores non-finite and non-positive costs — catches the failure mode where a broken audit record poisons the tally.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] ESLint AST selector from RESEARCH Pattern 3 did not match the fixture shape**

- **Found during:** Task 2 GREEN verification.
- **Issue:** The plan and RESEARCH prescribed the selector ``CallExpression[callee.name='emit'] > ObjectExpression > Property[key.name=/^(...)$/]`` with a direct-child combinator (`>`). The plan also specified a fixture that uses `emit({...} as never)` to bypass the TS union. But TypeScript's AST wraps the `ObjectExpression` inside a `TSAsExpression` when `as never` is present — so the direct-child combinator missed the literal object every time. Running `npx eslint src/lib/__tests__/fixtures/banned-emit.ts` exited 0 with no diagnostic, which would have shipped a dead PII guard to production.
- **Fix:** Changed `CallExpression[callee.name='emit'] > ObjectExpression > Property[...]` to `CallExpression[callee.name='emit'] ObjectExpression > Property[...]` (descendant combinator between the call and the object; direct-child preserved between the object and its key-property so we don't match nested objects' keys). The descendant combinator has no false-positive risk here because the outer anchor `callee.name='emit'` is specific.
- **Verification:** `npx eslint src/lib/__tests__/fixtures/banned-emit.ts` now exits 1 with `Audit records must not carry request/response bodies...` pointing at line 17 (the `prompt:` property). Production modules `audit-log.ts`, `pricing.ts`, `spend-tally.ts` still exit 0. Full repo lint: pre-existing 321 errors unchanged (none new from this rule).
- **Committed in:** `30f4cd1` (Task 2 GREEN). Inline comment in `eslint.config.mjs` documents the selector rationale so a future maintainer doesn't "fix" it back to direct-child.

---

**Total deviations:** 1 auto-fixed (1 bug — selector-combinator mismatch with the planned fixture shape).
**Impact on plan:** Zero scope creep. The fix keeps the D-10 intent (compile-time PII guard) and the plan's own fixture/assertion semantics; it just adjusts one character (` ` vs ` > `) in the selector.

## Issues Encountered

1. **Unrelated working-tree modification observed in `src/lib/tts-cloud.ts`.** After running `npm run build` + `npm run test:run`, `git status` showed a modification to `src/lib/tts-cloud.ts` (new `Q: "Achird"` + `A: "Zubenelgenubi"` entries added to `GEMINI_ROLE_VOICES`). This file was NOT touched by SAFETY-01 execution — the top-of-session `git status` showed the working tree clean, and none of my tool calls wrote to that file. The modification appeared during `npm run build` or `npm run test:run`, mtime 07:33 UTC. Per the destructive-git prohibition and scope-boundary rules, I did NOT revert it (could destroy intentional prior work) and did NOT commit it under Plan 01 (not part of SAFETY-01 scope). **Left in the working tree for Shannon to review.** If it's intentional prior work, commit it under a separate message; if it's spurious, revert manually.
2. **Pre-existing lint errors in `src/` (practice/page.tsx, signin/SignInForm.tsx, speech-to-text.ts, storage.ts, tts-cloud.ts).** 6 errors + 6 warnings in files I did not modify — all pre-existing. Confirmed unchanged by this plan's work. Out of scope per deviation rules; not logged to `deferred-items.md` because they predate Phase 2 and likely surface in their own Phase 2/5 plans.

## User Setup Required

None — no environment variables, external services, or dashboard config. This plan is entirely local module + lint-rule additions.

## Next Phase Readiness

**Ready for Plan 02 (paid-route-guard) and downstream Wave 2+ plans:**
- `import { emit } from "@/lib/audit-log"` — paid routes can emit AuditRecords.
- `import { estimateCost } from "@/lib/pricing"` — route handlers can compute `estimatedCostUSD` before emitting.
- `import { readAndClearSpendForDay } from "@/lib/spend-tally"` — Plan 04 cron has its data source.
- ESLint rule is live on `src/**/*.{ts,tsx}`. Any future `emit({prompt: ...})` anywhere in `src/` is blocked at lint time.

**Concerns / follow-ups (not blockers):**
- Shannon should cross-verify Mistral Small (in/out) + Voxtral TTS prices at `console.mistral.ai` before Phase 2 merges to main (D-06d). The `notes` flags and assertion tests ensure the LOW-confidence markers remain visible.
- The `src/lib/tts-cloud.ts` modification (see Issue 1) needs Shannon's attention before this branch merges — either commit it separately or revert.

## Self-Check: PASSED

All claimed files verified present via `[ -f ... ]`; all 4 commit hashes (`c2290c5`, `cee0e9d`, `49f4a39`, `30f4cd1`) verified via `git log --oneline --all | grep`. All success criteria from the plan verified:
- 8/8 files created.
- `grep -cE "^export (function emit|type (Audit|TTS|STT|Feedback)Record)" src/lib/audit-log.ts` returns 5.
- `PRICING_TABLE` asserts `>= 17` entries via test (passes).
- 4 exports in `spend-tally.ts` (including `interface SpendReading`).
- `eslint.config.mjs` contains both `no-restricted-syntax` and `prompt|completion|email|text|body`.
- Fixture contains `emit({` and `prompt:`.
- `npx eslint src/lib/__tests__/fixtures/banned-emit.ts` prints the canonical message + exits non-zero.
- Production modules lint clean.
- `npm run build` exits 0; `npm run test:run` 279/279 (257 baseline + 22 new).

---
*Phase: 02-safety-floor*
*Completed: 2026-04-21*
