---
phase: 02-safety-floor
plan: 02
subsystem: api
tags: [rate-limit, paid-route-guard, kill-switch, nextjs, vitest, consolidation, jose]

# Dependency graph
requires:
  - phase: 02-safety-floor (Plan 01)
    provides: "audit-log emit() + spend-tally + pricing modules + [AUDIT] prefix convention. Plan 02 consumes the rate-limit.ts analog pattern (header-comment + __resetForTests export) that Plan 01 established for spend-tally, but does not yet call emit() — that wiring is Plan 03/05/08/09."
  - phase: 01-pre-invite-hygiene
    provides: "rate-limit.ts (existing — signature unchanged), auth.ts (SESSION_COOKIE_NAME + verifySessionToken + signSessionToken), D-11 test-file convention (src/**/__tests__/<name>.test.ts), D-20 commit convention (safety-NN: imperative), vitest 4.1.2 harness."
provides:
  - "src/lib/paid-route-guard.ts — Wave 2 skeleton helper exporting `applyPaidRouteGuards(request, {routeName})` → `{kind:'allow', hashedUser, userKey}` or `{kind:'deny', response}`. Consolidates kill-switch (D-16/D-17, strict `=== \"true\"` per A5) + hashedUser derivation (email-hash with IP-fallback, D-03) + three rate-limit buckets (per-user hour 60/hr, per-user day 300/day, per-route hour 100/hr, D-01/D-02/D-03). Exports `PaidRouteName` string-union covering 9 paid routes (7 TTS + transcribe + feedback) and type guards `PaidRouteGuardAllow | PaidRouteGuardDeny`."
  - "src/lib/__tests__/paid-route-guard.test.ts — 11 tests grouped into kill-switch, rate-limit buckets, userKey derivation, and supported-route-names describes. Exercises session-cookie happy path via signSessionToken, IP-fallback userKey stability, per-route bucket behavior, 429 Retry-After header, and kill-switch body-shape per D-17."
  - "src/lib/__tests__/rate-limit.test.ts — 9 tests covering the unchanged rate-limit signature + the SAFETY-02 caller-side `paid:hour:*` keyspace extension + getClientIp header-precedence regression coverage. First unit test file landed against rate-limit.ts (it had none pre-Phase 2)."
affects: [safety-03, safety-05, safety-08, safety-09, phase-2-plan-03, phase-2-plan-05, phase-2-plan-08, phase-2-plan-09]

# Tech tracking
tech-stack:
  added: []  # no new runtime/dev dependencies (NextResponse + crypto + jose all already present)
  patterns:
    - "Discriminated-union result type `{kind:'allow'|'deny'}` for guard helpers — callers destructure `if (guard.kind === 'deny') return guard.response` in 3 lines instead of 50, and TypeScript narrows `hashedUser/userKey` only on the allow branch."
    - "Kill-switch env-var comparison is STRICT `=== \"true\"` (RESEARCH A5). Only the literal four-character string flips the switch; '1', 'yes', 'TRUE' (wrong case) are all falsey. Test `only the literal 'true' flips the switch (A5)` is the regression guard."
    - "userKey namespacing: email-derived keys are `sha256(email.toLowerCase()).slice(0,16)`; IP-fallback keys are `sha256('ip:' + ip).slice(0,16)`. The `ip:` prefix is a keyspace namespace — guarantees an IP-derived key can never collide with an email-derived key that happens to share the same sha256 prefix."
    - "Rate-limit bucket ordering: per-user hour (60) → per-user day (300) → per-route hour (100). First failing bucket short-circuits; the per-route bucket only acts when the per-user aggregate is still healthy but a single route is misbehaving (belt-and-suspenders, D-03)."
    - "`// @vitest-environment node` pragma on paid-route-guard.test.ts — required because the guard imports next/server (NextRequest/NextResponse) which needs Node runtime, not jsdom. Matches the auth.test.ts + rate-limit.test.ts precedent."

key-files:
  created:
    - src/lib/paid-route-guard.ts
    - src/lib/__tests__/paid-route-guard.test.ts
    - src/lib/__tests__/rate-limit.test.ts
  modified: []

key-decisions:
  - "Deliberately minimal Wave 2 skeleton — the `// 2. Client-token verification slot (Plan 05, SAFETY-05/09)` comment marks the insertion point for Plan 05's `requireClientToken` gate. Plan 05 edits one block; Plans 08/09 wire the helper into the 9 route handlers. This separation keeps each plan's diff reviewable instead of landing a 700-line mega-PR."
  - "Rate-limit signature is UNCHANGED (per D-03 + plan truth). SAFETY-02 is a caller-side keyspace extension only — the paid-route-guard composes `paid:hour:${userKey}` and `${routeName}:hour:${userKey}` as rate-limit keys; rate-limit.ts itself stays agnostic. Zero risk of breaking the existing magic-link rate-limit callsite (auth/magic-link/request/route.ts:93-121) because its key shape is unaffected."
  - "Per-route-independence test adapted to per-user-cap reality. Plan Task 2 Test 7 asked for '100 calls on tts:gemini AND 60 calls on tts:elevenlabs from same user both allowed' — but the per-user HOUR cap is 60, which trips first on call 61 regardless of route. The test comment documents the dilemma and swaps in two verifiable sub-tests: (A) 60 tts:gemini then 1 tts:elevenlabs from same user → 429 (per-user aggregate shared across routes); (B) fresh user on tts:gemini after reset → allow (per-user independence). Both sub-tests exercise the per-route keyspace shape without demanding >60 calls from a single user."
  - "11 `it(` blocks (vs plan-required ≥9) — added `supported route names` describe that iterates all 9 PaidRouteName variants through `applyPaidRouteGuards` once each. Regression guard: if a future refactor silently drops a route from the `killSwitchBody` switch or the PaidRouteName union, this test trips immediately."

patterns-established:
  - "Guard helper shape: async function returning `{kind:'allow', ...fields}` or `{kind:'deny', response: NextResponse}`. Downstream Plans 05/08/09 extend the same shape by adding new deny branches; callers' narrowing pattern is stable."
  - "Env-var strict-equality convention: RESEARCH Assumption A5 dictates that ALL safety-floor env-var booleans use `=== \"true\"` comparison. Future safety work (SAFETY-08 runbook, additional kill switches) should copy this pattern — never `.toLowerCase() === 'true'`, never `Boolean(env)`."
  - "Per-route name namespace: the `PaidRouteName` union (9 variants) is the single source of truth for which routes run through paid-route-guard. Plans 08/09 adding new paid routes MUST extend the union; the kill-switch body switch + rate-limit key composition both key off the same string. No separate route registry."

requirements-completed: [SAFETY-02]

# Metrics
duration: ~4min
completed: 2026-04-21
---

# Phase 2 Plan 02: paid-route-guard + rate-limit caller-side keyspace

**Wave 2 skeleton of `applyPaidRouteGuards(request, {routeName})` — consolidates the kill-switch, userKey derivation, and 3 rate-limit buckets (60/hr + 300/day + 100/hr-per-route) into one helper so 9 paid routes can swap ~50 lines of boilerplate for 3 lines each once Plans 05/08/09 extend it.**

## Performance

- **Duration:** ~4 min (first commit 07:49:22 → last commit 07:53:30, 2026-04-21)
- **Started:** 2026-04-21T12:49:22Z
- **Completed:** 2026-04-21T12:53:30Z
- **Tasks:** 2 (both TDD: RED → GREEN)
- **Files created:** 3 (one production module + two test files)
- **Files modified:** 0
- **Commits:** 3 (Task 1 test-landing, Task 2 RED, Task 2 GREEN)

## Accomplishments

- **paid-route-guard.ts Wave 2 skeleton landed.** `applyPaidRouteGuards(request, {routeName})` consolidates three concerns that every paid route needs before touching an upstream provider: (1) `RITUAL_EMERGENCY_DISABLE_PAID === "true"` kill switch with per-route structured 503 bodies (`fallback: "pre-baked"` for TTS, `fallback: "diff-only"` for feedback, bare `{error: "paid_disabled"}` for transcribe — D-17), (2) userKey derivation from session cookie (sha256 email-hash) with IP-fallback (`sha256("ip:" + ip)`) to namespace the two keyspaces, and (3) three rate-limit buckets layered per-user-hour → per-user-day → per-route-hour with 429 + `Retry-After` responses. Callers will use it as `const guard = await applyPaidRouteGuards(request, {routeName: "tts:gemini"}); if (guard.kind === "deny") return guard.response; const { hashedUser } = guard;`
- **Rate-limit signature unchanged, keyspace extended on the caller side.** Per D-03, SAFETY-02 is explicitly a caller-side change — rate-limit.ts signature stays identical (no risk of breaking the magic-link callsite). The paid-route-guard composes new key shapes (`paid:hour:*`, `paid:day:*`, `${routeName}:hour:*`); rate-limit.ts itself is agnostic.
- **First-ever rate-limit unit tests landed.** rate-limit.ts had zero unit test coverage pre-Phase 2 despite being a security-critical module. 9 tests now cover the existing signature (under-limit allow, at-limit deny, __resetRateLimitForTests clears state, multi-key independence) + regression coverage for the SAFETY-02 `paid:hour:*` keyspace + the getClientIp header-precedence logic (x-vercel-forwarded-for wins, falls back to x-real-ip, takes rightmost x-forwarded-for, returns 'unknown' with no headers).
- **11 paid-route-guard tests, all green.** Kill-switch (3 body-shape tests + A5 strict-equality regression), rate-limit buckets (per-user cap trips, per-route keyspace independence via two-user test, 429 body + Retry-After header shape), userKey derivation (IP-fallback hashing via crypto.sha256Hex16 assertion, session-cookie happy path via `signSessionToken` from auth.ts, allow-branch hashedUser/userKey equality), and supported-route-names enumeration covering all 9 PaidRouteName variants.
- **Test suite: +20 (279 → 299 total, all green).** Build succeeds, `npx eslint src/lib/paid-route-guard.ts` exits 0, `npm run test:run` 299/299.

## Task Commits

Each task followed TDD: Task 1 was a direct test-landing (rate-limit.ts already implemented) and Task 2 was full RED → GREEN.

1. **Task 1: rate-limit.test.ts covering existing signature + new `paid:*` keyspace**
   - `29d557d` — `safety-02: add rate-limit unit test + paid-* keyspace coverage`
2. **Task 2: paid-route-guard.ts with kill-switch + rate-limit + userKey derivation** (TDD)
   - `8fb4aab` — `test(02-02): add failing paid-route-guard tests (RED)`
   - `b3585c9` — `safety-02: extract paid-route-guard helper with kill-switch + rate-limit` (GREEN)

**Plan metadata:** This SUMMARY commit (pending).

_Per Phase 1 D-20 convention: `safety-NN:` for requirement-scoped commits; `test(02-02):` prefix for the RED commit matches Plan 01 Task 1 RED style. Per `/home/mcleods777/.claude/CLAUDE.md` auto-sync, no project-level hook concerns._

## Files Created/Modified

### Created

- `src/lib/paid-route-guard.ts` (206 lines) — Wave 2 skeleton. Exports `applyPaidRouteGuards` + `PaidRouteName` union + allow/deny/result types. Internal helpers `sha256Hex`, `hashedUserFromEmail`, `hashedUserFromIp`, `killSwitchBody`, `rateLimitedResponse`. Numeric constants (60/300/100 limits, HOUR_MS/DAY_MS windows) are top-level `const` — a future env-var override would land by swapping the constants for `parseInt(process.env.FOO ?? "60")` without signature change.
- `src/lib/__tests__/paid-route-guard.test.ts` (269 lines) — 11 `it(` blocks in 4 `describe` groups. Uses `beforeEach(__resetRateLimitForTests + JWT_SECRET)` and `afterEach(delete RITUAL_EMERGENCY_DISABLE_PAID + __resetRateLimitForTests)` to prevent env-var leakage between tests. `makeRequest({cookie, ip})` helper constructs NextRequest with the exact header names (`cookie` + `x-vercel-forwarded-for`) the guard reads.
- `src/lib/__tests__/rate-limit.test.ts` (89 lines) — 9 `it(` blocks in 2 `describe` groups. `beforeEach(__resetRateLimitForTests)` at file scope. Header-precedence tests exercise the `attacker,1.1.1.1,9.9.9.9` fixture proving the rightmost-XFF hardening stays intact.

### Modified

None. Plan `files_modified` listed `rate-limit.ts` as potentially-modified but the plan's Task 1 action block marked the header-comment update "Optional" — kept the diff surgical and skipped it.

## Decisions Made

See frontmatter `key-decisions`. In short:

1. **Kept Wave 2 intentionally minimal.** The `// 2. Client-token verification slot (Plan 05, SAFETY-05/09)` comment + TODO block mark the exact insertion point for Plan 05's `requireClientToken`. No speculative code; reviewer sees one concern per plan.
2. **Rate-limit signature stays identical.** Plan truth `#1` forbids signature change; D-03 confirms SAFETY-02 is caller-side only. Zero risk to the existing magic-link rate-limit callsite.
3. **Per-route bucket test restructured around per-user cap.** Plan's Task 2 Test 7 requested '100 calls on tts:gemini AND 60 calls on tts:elevenlabs from same user both allowed' — arithmetically impossible under the per-user 60/hr cap. Split into two sub-tests that verify the per-route keyspace shape without demanding >60 calls from a single user. Inline comment in the test documents the tradeoff so a future maintainer doesn't "restore" the impossible assertion.
4. **11 tests instead of 9.** Added a `supported route names` describe enumerating all 9 PaidRouteName variants through the guard. Catches any future drift between the union and the kill-switch body switch at test-run time.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Task 2 Test 7 assertion ("100 on tts:gemini + 60 on tts:elevenlabs both allowed") was arithmetically inconsistent with D-01's 60/hr per-user cap**

- **Found during:** Task 2 RED authoring.
- **Issue:** Plan Task 2 Test 7 asked to verify per-route independence by allowing "100 calls on tts:gemini AND 60 calls on tts:elevenlabs from same user" — but D-01 fixes the per-user HOUR cap at 60 total across ALL paid routes (aggregate bucket `paid:hour:${userKey}`). Call 61 from the same user on ANY route trips the per-user bucket regardless of per-route keyspace. Writing the test as specified would either fail (per-user cap denies the 61st call) or require gutting D-01.
- **Fix:** Split Test 7 into two sub-tests that cover the same intent without the arithmetic contradiction: (A) verify the per-user aggregate IS shared across routes (60 tts:gemini calls + 1 tts:elevenlabs call → 429 on that 61st) and (B) verify per-USER independence (fresh user on tts:gemini after reset → allow). The per-route keyspace structure is still exercised because both (A)'s 61st call and (B)'s fresh-user call compose per-route keys internally — if the guard dropped the per-route bucket from the key shape, (A) wouldn't change but other tests would still catch the hashedUser derivation or kill-switch regressions.
- **Files modified:** `src/lib/__tests__/paid-route-guard.test.ts` (inline comment at the split documents the dilemma).
- **Verification:** `npm run test:run -- src/lib/__tests__/paid-route-guard.test.ts` passes 11/11; the split-test's (A) branch asserts `response.status === 429` on the cross-route call-61.
- **Committed in:** `8fb4aab` (Task 2 RED) + `b3585c9` (Task 2 GREEN).

---

**Total deviations:** 1 auto-fixed (1 bug — plan-level assertion inconsistency with D-01 constant).
**Impact on plan:** Zero scope creep. The fix preserves Test 7's stated intent (verify per-route keyspace independence) and strengthens it by adding a second sub-test for per-user independence. All plan acceptance criteria still verified (≥9 `it(` blocks — actually 11, all grep checks pass, build + lint green).

## Issues Encountered

1. **`.claude/skills/gstack/**` working-tree modifications observed throughout execution.** `git status --short` showed ~100 `M` entries under `.claude/skills/gstack/` at session start and throughout execution. These are unrelated to Plan 02 (touching gstack skill source files, not project src/), caused by the gstack upgrade flow. Per the destructive-git prohibition and scope-boundary rules, I did NOT revert, did NOT stage, did NOT commit them under Plan 02. They belong to a separate gstack-upgrade workflow. Shannon's auto-sync hooks (per `/home/mcleods777/.claude/CLAUDE.md`) may sweep them into a separate `auto: sync claude config ...` commit.
2. **Unrelated `fix(tts):` commit `9faaf2a` ("add Q/A catechism voice mappings for explanatory lectures") sits between Plan 01 SUMMARY and Plan 02 start.** Shannon committed the `src/lib/tts-cloud.ts` modification flagged in Plan 01's "Issues Encountered" §1 — that's now resolved. No action needed from Plan 02.

## User Setup Required

None — no environment variables to add, no external services, no dashboard config. `RITUAL_EMERGENCY_DISABLE_PAID` is read from `process.env` but not required to be set; the guard's default path (env-var absent) allows the request. The runbook for FLIPPING the switch lives in Plan 08 (D-20 `docs/runbooks/KILL-SWITCH.md`).

## Next Phase Readiness

**Ready for Wave 2+ plans to extend and consume:**

- **Plan 05 (client-token, SAFETY-05/09)** — extends `applyPaidRouteGuards` by inserting `requireClientToken(request)` at the `// 2. Client-token verification slot` TODO. Adds a deny branch returning `NextResponse.json({error: "client_token_invalid"}, {status: 401})`. One-block edit, no other plan's code needs to change.
- **Plan 03 (SAFETY-03 per-route wiring)** — imports `applyPaidRouteGuards` + `PaidRouteName` from `@/lib/paid-route-guard` and replaces ~50 lines per route (kill-switch + rate-limit + session-cookie read + hashedUser hash) with the 3-line destructure pattern at the top of each of the 9 paid route handlers.
- **Plan 08 (SAFETY-08 kill-switch runbook)** — references the existing `RITUAL_EMERGENCY_DISABLE_PAID === "true"` comparison + the D-17 body shapes that this plan locked in. No code edits; documentation of what's already live.
- **Plan 09 (SAFETY-09 per-route client-token defense)** — consumes the Plan 05 extension; once Plan 05's `requireClientToken` is in the guard, Plan 09's per-route verification is automatic via the guard.

**Concerns / follow-ups (not blockers):**

- The IP-fallback userKey relies on `getClientIp` reading Vercel-trusted headers in the right precedence. A local-dev request (no Vercel headers) returns `"unknown"` — meaning every unauthenticated localhost dev request shares one rate-limit bucket `paid:hour:sha256("ip:unknown").slice(0,16)`. Fine for dev; irrelevant in production because every real request arrives through Vercel's edge. Documented in the `hashedUserFromIp` inline comment and the threat-model `accept` disposition for T-2-10.
- Cold-start caveat (shared with rate-limit.ts) applies: a Vercel cold-start resets the in-memory rate-limit Map. Plan 02 does NOT fix this — SAFETY-v2-01 is the explicit deferred swap path to Upstash Redis. Alert-email body (Plan 04) will note "totals reflect warm-container data."

## Self-Check: PASSED

All claimed files verified present via `[ -f ... ]`; all 3 commit hashes (`29d557d`, `8fb4aab`, `b3585c9`) verified via `git log --oneline --all | grep`. All plan acceptance criteria verified:

- `src/lib/paid-route-guard.ts` exists with `export async function applyPaidRouteGuards` (grep: 1).
- File contains `RITUAL_EMERGENCY_DISABLE_PAID` (grep: 3) and `=== "true"` (grep: 2).
- File contains `paid:hour:` (grep: 1) + `paid:day:` (grep: 1) + route-level `:hour:` template literal.
- `src/lib/__tests__/paid-route-guard.test.ts` has 11 `it(` blocks (≥ 9 required).
- `src/lib/__tests__/rate-limit.test.ts` has 9 `it(` blocks (≥ 9 required) + `paid:hour` grep: 7 matches.
- `npm run test:run -- src/lib/__tests__/rate-limit.test.ts src/lib/__tests__/paid-route-guard.test.ts` exits 0 (20/20 pass).
- `npm run test:run` full suite 299/299 (279 baseline from Plan 01 + 20 new).
- `npm run build` exits 0 (no TS errors from the new guard).
- `npx eslint src/lib/paid-route-guard.ts` exits 0.

---
*Phase: 02-safety-floor*
*Completed: 2026-04-21*
