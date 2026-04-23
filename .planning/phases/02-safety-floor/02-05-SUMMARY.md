---
phase: 02-safety-floor
plan: 05
subsystem: auth + api
tags: [client-token, jwt, api-fetch, middleware, defense-in-depth, jose, vitest]

# Dependency graph
requires:
  - phase: 02-safety-floor (Plan 02)
    provides: "paid-route-guard.ts Wave-2 skeleton with the reserved client-token slot + the `{kind:allow|deny}` result discriminated union + 3-bucket rate-limit wiring. Plan 05 fills the slot and rewires hashedUser to tokenPayload.sub."
  - phase: 01-pre-invite-hygiene
    provides: "auth.ts (signSessionToken + signMagicLinkToken pattern — copied verbatim to signClientToken), middleware.ts shared-secret + CORS ladder, D-11 test-file convention, D-20 commit convention."
provides:
  - "src/lib/auth.ts — signClientToken(hashedUser) + verifyClientToken(token) + CLIENT_TOKEN_TTL_SECONDS (1h) + CLIENT_TOKEN_AUDIENCE='client-token'. Cross-audience invariant enforced: session tokens cannot be replayed as client-tokens and vice versa (jwtVerify rejects audience mismatch). Header comment now documents three JWT types."
  - "src/lib/hash-user.ts — canonical hashedUserFromEmail(email) = sha256(email.trim().toLowerCase()).slice(0,16). Shared helper between the Plan 05 mint route and the Plan 04 reverse-lookup CLI so mint side and lookup side agree byte-for-byte. Minimal Wave-3 landing; Plan 04 extends with findEmailByHashedUser."
  - "src/app/api/auth/client-token/route.ts — POST endpoint. Gates in order: Origin allowlist (absent allowed), pilot-session cookie verify. Returns {token, expiresIn:3600} on success; 401 {error:'Not signed in'} on missing/bad cookie; 403 {error:'Forbidden origin'} on disallowed Origin."
  - "src/lib/api-fetch.ts — extended fetchApi attaches BOTH X-Client-Secret (Phase 1 shape preserved) AND Authorization: Bearer <token>. First call bootstraps via POST /api/auth/client-token (credentials:include, no Authorization). Proactive refresh at 50*60*1000 ms (10-min safety before 1h expiry). visibilitychange listener re-schedules on tab foreground. Reactive one-shot 401 retry on {error:'client_token_expired'|'client_token_invalid'} — no infinite loop. Graceful degradation when bootstrap fails. __resetApiFetchForTests export for unit tests. Public signature unchanged."
  - "src/middleware.ts — new client-token gate on /api/* (except /api/auth/* and OPTIONS preflight): verifies Authorization: Bearer -> 401 {error:'client_token_invalid'} on failure. Gated on isAuthConfigured() so local dev without JWT_SECRET stays open. CORS Access-Control-Allow-Headers now exposes Authorization."
  - "src/lib/paid-route-guard.ts — extended with route-level client-token re-verification (D-14 defense-in-depth). hashedUser now sourced from tokenPayload.sub (canonical mint-side hash) — cookie/IP fallback removed. Kill-switch still fires BEFORE the token check so operators can cut the paid surface without a valid token. Internal hashedUserFromEmail/hashedUserFromIp helpers removed; SESSION_COOKIE_NAME + verifySessionToken + getClientIp + node:crypto imports removed."
affects: [safety-03, safety-04, safety-09, phase-2-plan-03, phase-2-plan-08, phase-2-plan-09]

# Tech tracking
tech-stack:
  added: []  # no new runtime/dev dependencies (jose + NextResponse already present)
  patterns:
    - "Third JWT audience (`client-token`) joins `pilot-magic-link` + `pilot-session`. Header-comment doc in auth.ts names all three + the cross-audience invariant. Any Phase 6 ADMIN-04 stateful-revocation work extends this shape."
    - "Origin-check helper duplicated in src/app/api/auth/client-token/route.ts per PATTERNS §5 (accept duplication for scope control in Phase 2; future consolidation to src/lib/origin.ts is deferred)."
    - "Client-side JWT lifecycle: in-memory token + setTimeout refresh + visibilitychange guard + one-shot reactive retry. Module-scope state with a __resetForTests export mirrors rate-limit.ts / paid-route-guard.ts conventions."
    - "Defense-in-depth ordering: kill-switch (503) → client-token (401) → rate-limit (429). Kill-switch fires first so operators cut the paid surface without needing a valid token; client-token fires before rate-limit so unauthenticated traffic never consumes rate-limit keyspace."
    - "`hash-user.ts` extracted as the single source of truth for hashedUser = sha256(email).slice(0,16) — same hash formula the paid-route-guard's pre-Plan-05 internal helper used. Both mint-route (Plan 05) and reverse-lookup CLI (Plan 04) import from this module. tokenPayload.sub in the guard trusts the signed claim rather than re-deriving."

key-files:
  created:
    - src/lib/__tests__/client-token.test.ts
    - src/app/api/auth/client-token/route.ts
    - src/app/api/auth/client-token/__tests__/route.test.ts
    - src/lib/hash-user.ts
  modified:
    - src/lib/auth.ts
    - src/lib/api-fetch.ts
    - src/lib/__tests__/api-fetch.test.ts
    - src/middleware.ts
    - src/__tests__/middleware.test.ts
    - src/lib/paid-route-guard.ts
    - src/lib/__tests__/paid-route-guard.test.ts

key-decisions:
  - "Created src/lib/hash-user.ts as a minimal Wave-3 landing (hashedUserFromEmail only), despite Plan 04 being planned as the owner. Rationale: Plan 05 runs Wave 3 and depends on this import; Plan 04 runs Wave 7. Creating the file minimally now (single exported helper) lets Plan 04 extend it with findEmailByHashedUser without a breaking rename, and keeps mint-side and lookup-side byte-identical by design rather than by discipline."
  - "Middleware client-token gate gated on isAuthConfigured() (JWT_SECRET present). Without this gate, local dev without JWT_SECRET would start returning 401s on every /api/* call. Matches Phase 1's existing pattern: the pilot-session gate is also isAuthConfigured()-gated."
  - "OPTIONS method explicitly skipped in the middleware client-token gate. CORS preflight never carries Authorization (browsers don't send it on preflight), and the preflight short-circuit block above already handles OPTIONS with a 204. The OPTIONS skip keeps the two code paths from stepping on each other."
  - "paid-route-guard.ts no longer imports SESSION_COOKIE_NAME, verifySessionToken, getClientIp, or node:crypto. The cookie/IP fallback path is dead after Plan 05 because middleware blocks unauthenticated paid-route traffic at the perimeter; trusting tokenPayload.sub eliminates the cookie-vs-mint-hash drift risk Plan 04 was going to defend against in its D-15 mitigation."
  - "Proactive refresh uses setTimeout wrapped in `void fetchClientToken().then(...)` so the timer callback itself is synchronous (setTimeout only accepts sync callbacks in older TS types). The promise chain advances independently; vi.advanceTimersByTimeAsync + two microtask drains are sufficient to observe the refresh fetch in the test."

patterns-established:
  - "Three-audience JWT pattern — future token types (Phase 6 ADMIN-04 revocation-list-bound session, later admin tokens) copy the signClientToken/verifyClientToken shape verbatim: new audience const, new TTL const, new {sub, aud, iss, exp, iat} signing helper, new verifier with jwtVerify({issuer, audience})."
  - "Client-side JWT lifecycle pattern (src/lib/api-fetch.ts) — first-call bootstrap + module-scope storage + setTimeout proactive refresh + visibilitychange reset + one-shot reactive retry + graceful degradation on bootstrap failure. Any future short-lived token attached from the client copies this shape rather than inventing a new lifecycle."
  - "Route-level re-verify as belt-and-suspenders to middleware — applyPaidRouteGuards demonstrates the pattern for any Phase 2+ security invariant that wants defense-in-depth: middleware checks at the perimeter, route-level re-checks via a centralized helper so the check is impossible to forget in a single route handler."

requirements-completed: [SAFETY-05]

# Metrics
duration: ~11min
completed: 2026-04-21
---

# Phase 2 Plan 05: Short-lived client-token + middleware verification

**Ships SAFETY-05 (1h JWT client-token per D-11, issued via POST /api/auth/client-token, attached as Authorization: Bearer by api-fetch.ts, refreshed proactively + reactively) + the middleware half of SAFETY-09 (verify at the perimeter) + paid-route-guard extension (D-14 defense-in-depth; hashedUser is now tokenPayload.sub rather than cookie/IP-derived). After this plan, a leaked X-Client-Secret alone is no longer sufficient to reach paid routes — an attacker additionally needs a valid 1h JWT that only a same-origin browser with a live pilot-session cookie can obtain.**

## Performance

- **Duration:** ~11 min (PLAN_START 2026-04-21T13:34:17Z → last commit 2026-04-21T13:45:xx)
- **Tasks:** 4 (all TDD: 4 × RED → 4 × GREEN)
- **Files created:** 4 (auth test, route, route test, hash-user module)
- **Files modified:** 7 (auth, api-fetch, api-fetch test, middleware, middleware test, paid-route-guard, paid-route-guard test)
- **Commits:** 8 (4 × RED `test(02-05):` + 4 × GREEN `safety-05:`)

## Accomplishments

- **signClientToken + verifyClientToken land with cross-audience rejection coverage.** Third JWT audience joins magic-link + pilot-session. `signClientToken("u0123...")` returns a 1h jose HS256 token with `sub: "u0123..."`, `aud: "client-token"`, `iss: "masonic-ritual-mentor"`. `verifyClientToken` rejects session tokens, magic-link tokens, tampered tokens, wrong-secret tokens, expired tokens, and malformed input — 9 unit tests cover each failure mode. Cross-audience invariant is the regression guard: a stolen pilot-session cookie cannot be replayed as a client-token.

- **POST /api/auth/client-token issues 1h tokens to same-origin signed-in browsers.** Gates in D-12 order: Origin allowlist (absent Origin is allowed; explicit mismatch → 403 `{error:"Forbidden origin"}`) → pilot-session cookie verify (missing/invalid → 401 `{error:"Not signed in"}`). On success: returns `{token, expiresIn: 3600}` where `verifyClientToken(token).sub === hashedUserFromEmail(session.email)`. 6 route tests cover happy-path, missing cookie, tampered cookie, disallowed origin, absent Origin (same-origin non-fetch), and *.vercel.app preview acceptance.

- **src/lib/hash-user.ts extracted as shared source of truth.** Minimal Wave-3 landing: just `hashedUserFromEmail(email) = sha256(email.trim().toLowerCase()).slice(0,16)`. Imported by the Plan 05 mint route (now) and planned to be extended by Plan 04 with `findEmailByHashedUser` for the reverse-lookup CLI. Mint side and lookup side agree byte-for-byte because both import from this module — drift requires editing the shared helper, which would fail Plan 04's `hash-user.test.ts` when it lands.

- **api-fetch.ts extended with full client-token lifecycle, public signature unchanged.** `ensureToken()` bootstraps on first call via POST /api/auth/client-token (credentials: include, no Authorization yet — endpoint sits under the /api/auth/* middleware carve-out). `withBothHeaders()` attaches X-Client-Secret (Phase 1 shape preserved) + Authorization: Bearer on every call. `scheduleRefresh()` re-arms setTimeout(50 * 60 * 1000 ms) after every successful refresh. visibilitychange listener resets the timer on tab foreground — two safety nets against background-tab setTimeout throttling (RESEARCH Pitfall 5). Reactive one-shot 401 retry on `{error:"client_token_expired"|"client_token_invalid"}` — persistent 401 returns as-is (no infinite loop). Bootstrap failure degrades gracefully: X-Client-Secret still attached, original call proceeds, server's 401 is the right failure mode. 7 unit tests cover each lifecycle branch.

- **Middleware verifies Bearer client-token on /api/* (except /api/auth/* + OPTIONS).** New step between shared-secret and CORS origin allowlist per PATTERNS §15. Missing/invalid/wrong-audience Bearer → 401 `{error:"client_token_invalid"}`. Skipped entirely when `isAuthConfigured()` is false (local dev without JWT_SECRET stays open) — matches the existing pilot-session gate's posture. CORS `Access-Control-Allow-Headers` now exposes `Authorization` so cross-origin preflights don't strip it. 6 new middleware tests cover the gate + carve-outs; the Phase 1 HYGIENE-06 `.mram` exclusion regression test remains intact.

- **paid-route-guard.ts extended with route-level client-token re-verification (D-14 defense-in-depth).** Middleware is perimeter; the guard is the last line. The reserved Wave-2 slot is now filled — Authorization: Bearer `<client-token>` verified via `verifyClientToken`; missing or invalid → 401 `{error:"client_token_invalid"}`. hashedUser is now sourced from `tokenPayload.sub` (canonical hashedUser minted by POST /api/auth/client-token). Cookie/IP-fallback derivation is removed — `SESSION_COOKIE_NAME`, `verifySessionToken`, `getClientIp`, and `node:crypto` imports all dropped. Kill-switch still fires FIRST so operators can cut the paid surface without needing a valid token. paid-route-guard tests rewritten: IP-fallback tests now expect 401 client_token_invalid; rate-limit tests now supply valid Bearer to hit the allow path. 13 tests green.

- **Test suite: +41 new tests (326 total, all green).** Build green; full-repo lint shows 13 pre-existing problems in files untouched by this plan (including the Plan 01 PII-guard fixture that deliberately fails). New files + modified files all lint clean. Plan 01/02/04 tests not regressed.

## Task Commits

Each task followed TDD: RED (failing tests) → GREEN (implementation).

1. **Task 1: signClientToken + verifyClientToken + client-token.test.ts**
   - `6a4fc0f` — `test(02-05): add failing client-token tests (RED)`
   - `cc8806c` — `safety-05: add signClientToken + verifyClientToken helpers` (GREEN)

2. **Task 2: POST /api/auth/client-token endpoint + route test + hash-user.ts extraction**
   - `c61d7fc` — `test(02-05): add failing POST /api/auth/client-token route tests (RED)`
   - `1a11092` — `safety-05: add POST /api/auth/client-token endpoint` (GREEN)

3. **Task 3: api-fetch Bearer attach + proactive refresh + 401 retry**
   - `77fa4d2` — `test(02-05): extend api-fetch tests for Bearer + proactive refresh + 401 retry (RED)`
   - `597a43e` — `safety-05: extend api-fetch with Bearer attach + proactive refresh + 401 retry` (GREEN)

4. **Task 4: middleware client-token gate + paid-route-guard defense-in-depth**
   - `df26c92` — `test(02-05): middleware + paid-route-guard client-token tests (RED)`
   - `19b0cc3` — `safety-05: middleware + paid-route-guard verify Bearer client-token (defense-in-depth)` (GREEN)

_Per Phase 1 D-20 convention: `safety-05:` for requirement-scoped GREEN commits, `test(02-05):` for RED commits (matches Plan 01 / Plan 02 pattern)._

## Files Created/Modified

### Created

- `src/lib/__tests__/client-token.test.ts` (93 lines) — 9 `it(` blocks covering round-trip, cross-audience rejection (session + magic-link), tamper, expiry, wrong-secret, undefined/empty input, and the CLIENT_TOKEN_TTL_SECONDS = 1h assertion.
- `src/app/api/auth/client-token/route.ts` (90 lines) — POST handler with Node runtime pragma. Duplicated origin allowlist (PATTERNS §5 — consolidation deferred).
- `src/app/api/auth/client-token/__tests__/route.test.ts` (123 lines) — 6 `it(` blocks: happy path, missing cookie → 401, tampered cookie → 401, disallowed origin → 403, absent origin allowed, *.vercel.app preview accepted.
- `src/lib/hash-user.ts` (45 lines) — single exported helper `hashedUserFromEmail`. Will be extended by Plan 04 with `findEmailByHashedUser`.

### Modified

- `src/lib/auth.ts` — added CLIENT_TOKEN_TTL_SECONDS + CLIENT_TOKEN_AUDIENCE + signClientToken + verifyClientToken. Header comment rewrote to document three JWT types + cross-audience invariant.
- `src/lib/api-fetch.ts` — full rewrite around module-scope clientToken + refreshTimer + bootstrapInFlight. Public `fetchApi` signature preserved; new `__resetApiFetchForTests` export.
- `src/lib/__tests__/api-fetch.test.ts` — extended from 3 Phase-1 tests to 7 tests covering the full lifecycle (see Accomplishments).
- `src/middleware.ts` — added verifyClientToken import; new client-token gate block; Access-Control-Allow-Headers now includes Authorization.
- `src/__tests__/middleware.test.ts` — existing HYGIENE-06 matcher describe intact; new "client-token gate" describe with 6 tests.
- `src/lib/paid-route-guard.ts` — dropped internal hashedUserFromEmail/hashedUserFromIp + SESSION_COOKIE_NAME/verifySessionToken/getClientIp/node:crypto imports. New step 2 verifies Bearer via verifyClientToken; step 3 now just aliases tokenPayload.sub. Header comment rewritten to document D-14 + new post-Plan-05 ordering.
- `src/lib/__tests__/paid-route-guard.test.ts` — full rewrite. Kill-switch + rate-limit tests now supply valid Bearer. New "client-token gate" describe with 4 tests (missing, wrong-audience, malformed, valid-sub). IP-fallback tests removed (behavior changed — no more IP fallback for paid routes).

## Decisions Made

See frontmatter `key-decisions`. In short:

1. **Created `src/lib/hash-user.ts` in Plan 05 despite Plan 04 being the planned owner.** Wave 3 needs the shared helper; Wave 7 is too late. Minimal landing (one export) keeps Plan 04 able to extend.
2. **Middleware client-token gate skips OPTIONS method.** Preflight is already handled by the earlier CORS block; double-handling would send 204 then 401.
3. **`isAuthConfigured()` gates the middleware client-token check.** Matches the existing pilot-session-gate posture — local dev without JWT_SECRET stays open.
4. **paid-route-guard.ts dropped the cookie/IP-fallback path entirely.** Middleware blocks unauthenticated paid-route traffic at the perimeter; trusting tokenPayload.sub at the route level eliminates cookie-vs-mint-hash drift (the risk Plan 04's T-2-15 was going to defend against becomes structurally impossible after Plan 05).
5. **Kill-switch still fires BEFORE the client-token gate.** Operators need to cut paid traffic during incidents without first having to mint a valid token.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] `src/lib/hash-user.ts` didn't exist yet at Wave 3**

- **Found during:** Task 2 planning (route.ts imports `@/lib/hash-user`).
- **Issue:** The plan's `<read_first>` for Task 2 references `src/lib/hash-user.ts (from Plan 04 — hashedUserFromEmail)`. Plan 04 is Wave 7 and creates the module with both `hashedUserFromEmail` + `findEmailByHashedUser` + a test file. Plan 05 runs Wave 3 and needs to import `hashedUserFromEmail` NOW, before Plan 04 runs.
- **Fix:** Created a minimal `src/lib/hash-user.ts` exporting only `hashedUserFromEmail` (the symbol Plan 05 needs). No test file, no `findEmailByHashedUser` — that stays Plan 04's scope. Plan 04 will extend this module additively. Wrote the module's header comment to make the cross-plan ownership explicit: "Phase 2 Plan 05 introduces the module; Plan 04 extends it with `findEmailByHashedUser` for the reverse-lookup CLI (D-06c)."
- **Files created:** `src/lib/hash-user.ts` (45 lines, one export).
- **Verification:** `npm run test:run -- src/app/api/auth/client-token/__tests__/route.test.ts` 6/6 green; `npx eslint src/lib/hash-user.ts src/app/api/auth/client-token/route.ts` clean; full suite 326/326.
- **Committed in:** `1a11092` (Task 2 GREEN).
- **Impact on Plan 04:** Plan 04's Task 2 ("Ship scripts/lookup-hashed-user.ts CLI + extracted hash-user helper") now starts with an existing `hash-user.ts` file that has one export. Plan 04 adds `findEmailByHashedUser` + the test file. The plan's acceptance criterion `src/lib/hash-user.ts exists; exports hashedUserFromEmail AND findEmailByHashedUser` still passes after Plan 04 runs; the first export is just already there.

**2. [Rule 2 — Security] Middleware client-token gate initially applied to OPTIONS preflight**

- **Found during:** Task 4 GREEN verification.
- **Issue:** The plan's inserted block placed the client-token check unconditionally on all /api/* (except /api/auth/*). But CORS preflight never carries Authorization — browsers don't send Authorization on OPTIONS — so a browser would never be able to get past preflight on a cross-origin request. The test "CORS preflight exposes Authorization in Access-Control-Allow-Headers" would have failed (preflight would return 401 before hitting the 204 branch).
- **Fix:** Added `request.method !== "OPTIONS"` to the client-token gate's entry condition. Preflight is already handled by the earlier CORS OPTIONS block, which returns 204 with the allow-headers set. This keeps the two paths from colliding.
- **Files modified:** `src/middleware.ts` (one condition added to the new gate's `if`).
- **Verification:** Middleware test 12/12 green, including the CORS preflight test.
- **Committed in:** `19b0cc3` (Task 4 GREEN).

### Scope-boundary out-of-scope (not fixed)

- Pre-existing eslint problems in files untouched by this plan (practice/page.tsx, SignInForm.tsx, speech-to-text.ts, storage.ts, tts-cloud.ts, PerformanceTracker.tsx, TTSEngineSelector.tsx, MasonicIcons.tsx, default-voices.ts, voices/page.tsx, RehearsalMode.tsx). 7 errors + 6 warnings total, all pre-existing; confirmed unchanged by running a broader grep across my diff. The Plan 01 `banned-emit.ts` fixture is also deliberately a rule violation — that's the PII-guard regression fixture, not a real code issue.

---

**Total deviations:** 2 auto-fixed (1 Rule 3 blocking — missing file, 1 Rule 2 security — preflight interaction).
**Impact on plan:** Zero scope creep. Both fixes strictly follow the plan's intent; both are documented in the files' header comments so a future maintainer doesn't "fix" them back.

## Issues Encountered

1. **`.claude/skills/*` and `.claude/skills/gstack/*` working-tree modifications/untracked files observed throughout execution.** `git status --short` showed ~100 M entries under `.claude/skills/gstack/` and ~40 new `??` entries under `.claude/skills/*/`. These are unrelated to Plan 05 (they're the user's auto-sync claude config workflow per `/home/mcleods777/.claude/CLAUDE.md`). Per the destructive-git prohibition and scope-boundary rules: did NOT revert, did NOT stage, did NOT commit them under Plan 05. They will sync via the user's SessionEnd auto-commit hook.

## User Setup Required

None for Plan 05 itself. Environment variables already in place from Phase 1:
- `JWT_SECRET` — required for the middleware gate to actually run (isAuthConfigured() gate). Already set in Vercel production.
- `NEXT_PUBLIC_RITUAL_CLIENT_SECRET` — Phase 1 shared-secret, still attached by api-fetch.ts alongside the new Bearer header.
- `RITUAL_CLIENT_SECRET` — Phase 1 server-side shared-secret; unchanged by Plan 05.

Note: Plan 05's runtime behavior in local dev depends on `JWT_SECRET` being set. Without it, the middleware client-token gate is a no-op (pilot-session gate posture) and every paid-route call proceeds unauthenticated — useful for local testing without needing a cookie, but means the defense-in-depth layer is only active in production.

## Next Phase Readiness

**Ready for Wave 4+ plans to consume and extend:**

- **Plan 08 (SAFETY-08 kill-switch UX)** — references the existing 503 `{error:"paid_disabled", fallback:"..."}` body shapes that Plan 02 locked in and Plan 05 preserved. No code edits expected from Plan 05's side; Plan 08 wires the banner detection to these response bodies.
- **Plan 03 (Wave 5: SAFETY-03 per-route wiring)** — the 9 paid-route handlers import `applyPaidRouteGuards` from `@/lib/paid-route-guard` and destructure `{ kind, hashedUser }` in 3 lines. After Plan 05, `hashedUser` is sourced from `tokenPayload.sub` — Plan 03's per-route emit(AuditRecord) calls use this as the audit record's `hashedUser` field.
- **Plan 09 (Wave 6: SAFETY-09 per-route client-token defense)** — already structurally satisfied by Plan 05's paid-route-guard extension. Plan 09 adds tests confirming each of the 9 routes re-verifies at the route level (which they will automatically once Plan 03 wires `applyPaidRouteGuards`).
- **Plan 04 (Wave 7: SAFETY-04 cron + Resend + lookup CLI)** — imports `hashedUserFromEmail` from the Plan-05-created `src/lib/hash-user.ts`, then ADDS `findEmailByHashedUser` + a test file in the same module. No rename conflict.

**Concerns / follow-ups (not blockers):**

- The in-memory `clientToken` module-scope variable in `src/lib/api-fetch.ts` is NOT persisted to localStorage. A full-page reload flows back through the bootstrap POST → fine because the pilot-session cookie is httpOnly and sticks around. Not documented as a UX concern; the bootstrap round-trip is <200ms in production.
- The `src/lib/hash-user.ts` module is currently imported ONLY by the Plan 05 mint route. paid-route-guard.ts does NOT import it (it uses tokenPayload.sub directly, no re-hashing). This means Plan 04's `findEmailByHashedUser` will be the only other caller of this module until Phase 6 ADMIN-04 lands the revocation flow — plenty of time for the shape to settle.
- Background-tab Safari behavior is the known soft spot. The plan's VALIDATION manual-only task (Shannon tabs-away >60min on Safari, comes back, confirms the next paid call succeeds without 401) remains pending. The reactive 401 retry is the safety net; the proactive timer + visibilitychange listener are the optimization.

## Self-Check: PASSED

All claimed files verified present via the Read tool; all 8 commit hashes (`6a4fc0f`, `cc8806c`, `c61d7fc`, `1a11092`, `77fa4d2`, `597a43e`, `df26c92`, `19b0cc3`) verified via `git log --oneline`. All plan acceptance criteria verified:

- `src/lib/auth.ts` contains `CLIENT_TOKEN_AUDIENCE = "client-token"`, `CLIENT_TOKEN_TTL_SECONDS`, `signClientToken`, `verifyClientToken` — all 4 present.
- `src/lib/__tests__/client-token.test.ts` has 9 `it(` blocks (≥ 8 required), all passing.
- Cross-audience rejection tests exist (session + magic-link → null).
- `src/app/api/auth/client-token/route.ts` exports `POST`; imports `signClientToken`, `verifySessionToken`, `SESSION_COOKIE_NAME`, `hashedUserFromEmail`.
- Route test file has 6 `it(` blocks (≥ 5 required), all passing.
- `src/lib/api-fetch.ts` contains `Authorization`, `Bearer`, `scheduleRefresh`, `fetchClientToken`, `visibilitychange`, `client_token_expired`, `50 * 60 * 1000` (≥ 6 grep hits satisfied).
- api-fetch test has 7 `it(` blocks (≥ 6 required), all passing.
- `src/middleware.ts` contains `verifyClientToken`, `client_token_invalid`, `Authorization` (Access-Control-Allow-Headers).
- `src/lib/paid-route-guard.ts` contains `verifyClientToken`, `tokenPayload.sub`.
- Middleware test: 12 `it(` blocks (6 HYGIENE-06 + 6 client-token-gate), all passing.
- paid-route-guard test: 13 `it(` blocks, all passing; IP-fallback tests removed per plan; new client-token-gate describe added.
- `npm run test:run` full suite 326/326 (285 baseline + 41 new).
- `npm run build` exits 0 (no TS errors).
- `npx eslint` on all new/modified Plan 05 files: clean (pre-existing unrelated errors in other files, all documented above).

---
*Phase: 02-safety-floor*
*Completed: 2026-04-21*
