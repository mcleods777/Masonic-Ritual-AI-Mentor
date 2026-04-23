---
phase: 02-safety-floor
plan: 04
subsystem: infra
tags: [cron, vercel-cron, resend, idempotency, spend-alert, lookup-cli, hash-user, sha256, runbook]

# Dependency graph
requires:
  - phase: 02-safety-floor (Plan 01)
    provides: "readAndClearSpendForDay(utcDate: string): SpendReading — the daily-spend tally the cron reads + clears at 02:00 UTC. SpendReading shape {aggregate: number, perUser: Array<{hashedUser: string, total: number}>} drives both the D-04 threshold compare and the top-5-spenders body of the alert email."
  - phase: 02-safety-floor (Plan 02)
    provides: "Defers canonical hashedUserFromEmail introduction to THIS plan (Plan 04 creates src/lib/hash-user.ts). Plan 02's paid-route-guard reads the hash from tokenPayload.sub and does NOT call hashedUserFromEmail — no dependency in that direction."
  - phase: 01-pilot-foundation
    provides: "MAGIC_LINK_FROM_EMAIL env var + existing Resend pattern in src/app/api/auth/magic-link/request/route.ts — reused verbatim for the cron's `from` address so we don't need a second sender-domain verified in Resend. RESEND_API_KEY already provisioned in Vercel from magic-link."
provides:
  - "src/app/api/cron/spend-alert/route.ts — GET handler with Bearer ${CRON_SECRET} exact-string auth, reads yesterday's UTC day from spend-tally, applies D-04 thresholds (aggregate > $10 OR any user > $3), builds the D-06 email body (top-5 spenders, lookup-CLI pointer, warm-container caveat), sends via Resend with idempotencyKey=`spend-alert-${YYYY-MM-DD}` to survive Vercel at-least-once cron semantics."
  - "vercel.json — first vercel.* config file in the repo; registers /api/cron/spend-alert at `0 2 * * *` (02:00 UTC daily)."
  - "src/lib/hash-user.ts — centralized sha256(email.trim().toLowerCase()).slice(0,16) helper + findEmailByHashedUser CSV-scan for reverse lookup. Imported by scripts/lookup-hashed-user.ts; will be imported by Plan 05's client-token mint route so mint-side and lookup-side hashes cannot drift."
  - "scripts/lookup-hashed-user.ts — executable CLI (shebang #!/usr/bin/env npx tsx, chmod +x) that reads LODGE_ALLOWLIST + arg hash, prints matched email on stdout and exits 0 (or errors on stderr and exits 1 if no match)."
  - "src/app/api/cron/spend-alert/__tests__/auth.test.ts — 3 it() blocks: missing header → 401, wrong Bearer → 401, correct Bearer + no thresholds crossed → 200 + {success:true, sent:false}."
  - "src/app/api/cron/spend-alert/__tests__/alert.test.ts — tests for idempotencyKey=`spend-alert-${yesterday}`, email body contents (warm-container caveat, lookup-CLI pointer, SPEND_ALERT_TO as recipient), and no-send when thresholds not crossed."
  - "src/lib/__tests__/hash-user.test.ts — 7 it() blocks: case-insensitive + trim invariance, 16-hex-char output, CSV match, null on no match, whitespace-tolerant CSV, case-insensitive target hash, lowercase-email return on mixed-case input."
  - "docs/runbooks/PHASE-2-DEPLOY-CHECKLIST.md — one-time env-var provisioning (CRON_SECRET, SPEND_ALERT_TO via atomic `echo -n | vercel env add`) + post-deploy smoke tests (cron-dashboard check, kill-switch e2e, reverse-lookup CLI)."
affects: [safety-05, safety-08, phase-2-final-deploy]

# Tech tracking
tech-stack:
  added:
    - "resend@^6 idempotencyKey (already in package.json from Phase 1; this plan is the first caller to use the v6 options argument's idempotencyKey field)"
    - "vercel.json crons block (first vercel.* config file in the repo)"
  patterns:
    - "Vercel cron shape: `export async function GET(request: NextRequest)` with `Authorization: Bearer ${process.env.CRON_SECRET}` exact-string compare at the top. NOT POST (RESEARCH §Surprise 2 — Vercel's scheduler only fires GET). Runtime=nodejs + maxDuration=30s so Resend SDK imports cleanly and the cron has headroom on a slow SMTP handoff."
    - "Idempotency for at-least-once cron delivery: Resend v6 `idempotencyKey: spend-alert-${YYYY-MM-DD}` dedups duplicate invocations within the 24h window — exactly the cron's period. No client-side dedup bookkeeping needed."
    - "Yesterday-UTC read window: cron fires at 02:00 UTC and reads `new Date(Date.now() - 86_400_000).toISOString().slice(0,10)` so it always reports the day that just ended (never a half-day). Matches spend-tally's `readAndClearSpendForDay(utcDate)` UTC-partition contract from Plan 01."
    - "Shared hash helper for split-brain prevention: both the mint-side (Plan 05 client-token route, forthcoming) and the lookup-side (this plan's CLI) import `hashedUserFromEmail` from a single `src/lib/hash-user.ts`. The paid-route-guard does NOT import it — the guard reads `tokenPayload.sub` directly so the hash only lives in one place (the mint)."
    - "Atomic env-var provisioning per D-05b: `echo -n \"$VALUE\" | vercel env add NAME production --yes` with no trailing newline. Documented in the deploy checklist so Shannon doesn't trip the `add → rm → add` window-of-unset footgun from Phase 1 secret rotations."

key-files:
  created:
    - src/app/api/cron/spend-alert/route.ts
    - src/app/api/cron/spend-alert/__tests__/auth.test.ts
    - src/app/api/cron/spend-alert/__tests__/alert.test.ts
    - src/lib/hash-user.ts
    - src/lib/__tests__/hash-user.test.ts
    - scripts/lookup-hashed-user.ts
    - vercel.json
    - docs/runbooks/PHASE-2-DEPLOY-CHECKLIST.md
  modified: []

key-decisions:
  - "Kept hash-user.ts Plan-05-origin-scoped per the plan's explicit note: the module is created in Plan 04 with BOTH helpers (hashedUserFromEmail + findEmailByHashedUser). The JSDoc history block acknowledges Plan 05 will import hashedUserFromEmail from here once that plan lands. paid-route-guard.ts is UNCHANGED by this plan (grep confirms no `hash-user` import in the guard) — the guard reads tokenPayload.sub directly per the post-Plan-05 design."
  - "Cron uses the already-provisioned MAGIC_LINK_FROM_EMAIL as its `from` sender. Reusing a verified sender avoids adding a second domain to Resend and keeps DKIM/SPF uniform. The cron is the second Resend caller in the codebase (magic-link being the first)."
  - "No FeedbackRecord / no audit emit from the cron itself. The cron consumes the audit tally but is not itself a billable AI call — it's a scheduler trigger. Emitting would pollute the audit stream with non-user-initiated records."
  - "findEmailByHashedUser is case-insensitive on the target hash (hex is canonically lowercase but operators may paste uppercase from email clients that rewrite casing). Input CSV is whitespace- and blank-entry-tolerant so copy-paste from an .env file doesn't require hand-editing. Lowercased-email return so the caller's output matches the canonical hashed input."
  - "PHASE-2-DEPLOY-CHECKLIST.md intentionally cross-links forward to `docs/runbooks/KILL-SWITCH.md` (owned by Plan 08 per D-20) rather than duplicating the kill-switch playbook. Keeps the deploy checklist scoped to Phase 2 one-time setup + smoke, and lets the kill-switch runbook remain the single-source-of-truth when it lands."

patterns-established:
  - "Single cron-handler shape for the repo: GET on /api/cron/* with Bearer auth + runtime=nodejs + maxDuration. Future phases adding crons (e.g., periodic audit-log rollup, pilot-session cleanup) MUST follow this shape. Scheduler is registered by appending a new entry to vercel.json's `crons` array — not per-file config."
  - "Idempotency-key naming: `${cronName}-${YYYY-MM-DD}`. Future Resend sends from crons should follow this so the 24h dedup window exactly matches a daily-cron period. Weekly/monthly crons need a longer-horizon key (e.g., ISO week) — not applicable in Phase 2 but flagged for future extension."
  - "Email-body footer-caveats pattern: every pilot-facing alert email includes (a) a warm-container / cold-start data-honesty caveat and (b) a kill-switch pointer (`vercel env update RITUAL_EMERGENCY_DISABLE_PAID production --value true --yes` + KILL-SWITCH.md reference). Operator always knows how to read the data AND how to immediately stop the bleed."
  - "CLI wrapper → tested helper pattern: `scripts/*.ts` files delegate logic to `src/lib/*.ts` so vitest can cover the logic without spawning a subprocess. The script itself is a thin argv/stdout/exit-code shell. First instance: hash-user.ts (helper) + lookup-hashed-user.ts (wrapper). Future Phase 2+ scripts (e.g., rotate-mram-passphrase already follows this; a future list-pilot-spend CLI would follow) should mirror."

requirements-completed: [SAFETY-04]

# Metrics
duration: ~25min active (interrupted mid-plan; ~2h wall-clock gap between task-2 RED and task-2 GREEN)
completed: 2026-04-21
---

# Phase 2 Plan 04: Daily spend-alert cron + reverse-lookup CLI Summary

**SAFETY-04 shipped: Vercel cron at 02:00 UTC reads `spend-tally`, fires a Resend alert email (with 24h idempotencyKey) whenever aggregate pilot spend > $10 or any user > $3 for yesterday's UTC day; email body includes top-5 spenders + a `scripts/lookup-hashed-user.ts <hash>` pointer that reverse-resolves the 16-hex hashedUser back to an email from LODGE_ALLOWLIST via a freshly-extracted `src/lib/hash-user.ts` helper. First `vercel.json` in the repo. PHASE-2-DEPLOY-CHECKLIST.md documents the two new env vars and the dashboard-verification smoke.**

## Performance

- **Duration:** ~25 min active work; interrupted mid-plan mid-Task-2 by a previous-agent tool error — ~2h wall-clock gap between the Task-2 RED commit (`cb3db00`) and the Task-2 GREEN commit (`852f410`).
- **Started (Task 1 RED commit):** 2026-04-21T18:42:23Z
- **Completed (Task 3 commit):** 2026-04-21T20:54:51Z
- **Tasks:** 3 (Task 1 TDD: RED + GREEN; Task 2 TDD: RED + GREEN; Task 3: docs-only single commit)
- **Files modified:** 8 created, 0 modified (see key-files above)
- **Test suite:** 382 tests across 34 files, all green after the last commit.
- **Build:** `npm run build` exits 0; new `/api/cron/spend-alert` dynamic route appears in the route manifest.

## Accomplishments
- Daily 02:00 UTC spend-alert cron with Bearer auth + Resend idempotencyKey.
- First `vercel.json` in the repo (crons block, schema pinned).
- Reverse-lookup CLI + extracted `hash-user` helper (single source of truth for `sha256(email.trim().toLowerCase()).slice(0,16)` across mint-side (Plan 05-forthcoming) and lookup-side).
- PHASE-2-DEPLOY-CHECKLIST.md documents env-var provisioning + post-deploy smoke tests for the whole phase.

## Task Commits

Each task was committed atomically (TDD RED/GREEN pairs where applicable):

1. **Task 1 RED: cron spend-alert auth + alert failing tests** — `5eab812` (test)
2. **Task 1 GREEN: cron route + vercel.json + Resend idempotency** — `5c601b3` (feat under `safety-04:` convention)
3. **Task 2 RED: hash-user findEmailByHashedUser failing tests** — `cb3db00` (test)
4. **Task 2 GREEN: hashed-user CLI + extracted hash-user helper** — `852f410` (feat under `safety-04:` convention)
5. **Task 3: phase-2 deploy checklist (env vars + smoke tests)** — `b335dff` (docs under `safety-04:` convention)

**Plan metadata commit (to be added by this summary):** `docs(02-04): record safety-04 plan execution summary`

_Commits 5eab812, 5c601b3, and cb3db00 landed in the previous agent session before the tool error; commits 852f410 and b335dff landed in the resume session (this one)._

## Files Created/Modified

- `src/app/api/cron/spend-alert/route.ts` — Vercel cron GET handler, Bearer auth, yesterday-UTC read, D-04 thresholds, Resend v6 idempotencyKey, D-06 email body.
- `src/app/api/cron/spend-alert/__tests__/auth.test.ts` — 3 Bearer-auth cases.
- `src/app/api/cron/spend-alert/__tests__/alert.test.ts` — idempotencyKey + body + no-send threshold paths.
- `vercel.json` — new; registers the cron at `0 2 * * *`.
- `src/lib/hash-user.ts` — hashedUserFromEmail + findEmailByHashedUser helpers.
- `src/lib/__tests__/hash-user.test.ts` — 7 helper invariance + lookup cases.
- `scripts/lookup-hashed-user.ts` — executable (`chmod +x`) CLI wrapper.
- `docs/runbooks/PHASE-2-DEPLOY-CHECKLIST.md` — phase-wide deploy checklist.

## Decisions Made

- Scope-locked `hash-user.ts` to the mint-side + lookup-side only. paid-route-guard.ts intentionally unchanged; it continues to read the hash from `tokenPayload.sub` per the Plan 05 design. Acceptance criterion (`src/lib/paid-route-guard.ts` has no `hash-user` import) verified by grep — zero matches.
- Reused `MAGIC_LINK_FROM_EMAIL` as cron `from` to avoid adding a second Resend sender domain. Consistent DKIM/SPF.
- `findEmailByHashedUser` tolerates whitespace + blank CSV entries + uppercase target hash. Operators pasting hashes from email clients (some of which rewrite casing) work without hand-editing.
- `PHASE-2-DEPLOY-CHECKLIST.md` cross-links forward to Plan 08's (forthcoming) `KILL-SWITCH.md` rather than duplicating kill-switch content.

## Deviations from Plan

None — plan executed exactly as written. No Rule 1/2/3/4 auto-fixes or architectural deviations were needed. The only divergence from a normal execution flow was procedural: the plan was interrupted mid-Task-2 by a tool error in a previous agent session (see Issues Encountered) and resumed in a fresh session. Resume simply committed the already-written GREEN pair, ran Task 3, and wrote this summary — no code-level changes to anything the previous session had authored.

## Issues Encountered

**Interrupted-and-resumed execution.** A previous agent session authored all of Task 1 (RED + GREEN, committed as `5eab812` + `5c601b3`) and Task 2's RED (`cb3db00`) plus the Task 2 GREEN source files (`src/lib/hash-user.ts` modified + `scripts/lookup-hashed-user.ts` untracked), then hit a tool error before committing the GREEN pair or starting Task 3.

Resume handling (this session):
1. Confirmed git state matched the orchestrator's context-briefing exactly.
2. Reviewed the pending diff — it correctly implements `findEmailByHashedUser` required by commit `cb3db00`'s failing test; no corrective work needed.
3. Ran `npm run test:run src/lib/__tests__/hash-user.test.ts` with the pending changes applied → all 7 tests pass (GREEN as expected).
4. Chmod +x the CLI script (the plan's action block explicitly calls for this post-write).
5. Staged the two files individually (never `git add -A` — the working tree is polluted with unrelated gstack submodule churn that must NOT be swept up), committed as `852f410` with the plan's prescribed message.
6. Wrote `PHASE-2-DEPLOY-CHECKLIST.md`, committed as `b335dff`.
7. Ran `npm run test:run` full suite (382/382 green) + `npm run build` (0 errors) + `npx eslint` on new files (only one pre-existing warning in Task 1's alert.test.ts; no new errors).

Two user-authored commits landed on the branch during the interruption window (`85d2a56 docs(pilot-email): ...` and `6e22337 ui(nav): remove walkthrough ...`) — these are parallel work unrelated to SAFETY-04 and were left in place, unmodified.

## User Setup Required

**External services require manual configuration before deploy.** See [`docs/runbooks/PHASE-2-DEPLOY-CHECKLIST.md`](../../../docs/runbooks/PHASE-2-DEPLOY-CHECKLIST.md) for the full playbook. Two new env vars must be provisioned in Vercel (production + preview) before the cron can run:

- `CRON_SECRET` — generate via `openssl rand -hex 32`, provision via `echo -n "$SECRET" | vercel env add CRON_SECRET production --yes` (atomic; no trailing-newline per D-05b footgun).
- `SPEND_ALERT_TO` — Shannon's alert-destination email, provisioned via the same `echo -n | vercel env add` pattern.
- `MAGIC_LINK_FROM_EMAIL` — should already exist from Phase 1; verify with `vercel env ls`.

Post-deploy manual smoke test: open Vercel Dashboard → Project → Settings → Cron Jobs and confirm `/api/cron/spend-alert` appears at `0 2 * * *`. Manual "Run" button fires a one-shot invocation; `vercel logs --since 10m | grep CRON` should show a `no thresholds crossed` line from the cold spend-tally on a fresh instance.

## Next Phase Readiness

- SAFETY-04 complete; the Phase 2 Safety Floor is now deploy-ready once env vars are provisioned.
- `src/lib/hash-user.ts` exports `hashedUserFromEmail` — Plan 05 (client-token mint) can import it to produce the canonical `sub` claim, guaranteeing byte-for-byte agreement with the reverse-lookup CLI.
- Plan 08 will own the broader KILL-SWITCH.md runbook; the deploy checklist already cross-references it so the link resolves as soon as Plan 08 lands.
- No blockers. Build is green, full test suite (382/382) is green, no lint errors.

## Threat Flags

None new. The threat surface added by this plan (cron route + lookup CLI + hash helper) is fully covered by the plan's declared threat model (T-2-07, T-2-12, T-2-13, T-2-14, T-2-15). No new trust boundary, no new endpoint outside `/api/cron/spend-alert`, no new schema, no new auth path.

---
*Phase: 02-safety-floor*
*Completed: 2026-04-21*

## Self-Check: PASSED

**Created files verified:**
- FOUND: src/app/api/cron/spend-alert/route.ts
- FOUND: src/app/api/cron/spend-alert/__tests__/auth.test.ts
- FOUND: src/app/api/cron/spend-alert/__tests__/alert.test.ts
- FOUND: src/lib/hash-user.ts
- FOUND: src/lib/__tests__/hash-user.test.ts
- FOUND: scripts/lookup-hashed-user.ts (also: executable bit set)
- FOUND: vercel.json
- FOUND: docs/runbooks/PHASE-2-DEPLOY-CHECKLIST.md

**Commits verified:**
- FOUND: 5eab812 (Task 1 RED)
- FOUND: 5c601b3 (Task 1 GREEN)
- FOUND: cb3db00 (Task 2 RED)
- FOUND: 852f410 (Task 2 GREEN)
- FOUND: b335dff (Task 3)

**Verification gates:**
- `npm run test:run` → 382 passed (34 files)
- `npm run build` → exits 0, `/api/cron/spend-alert` appears in route manifest
- `npx eslint src/lib/hash-user.ts scripts/lookup-hashed-user.ts src/app/api/cron/spend-alert/` → exits 0 (1 pre-existing unused-variable warning, not introduced by this resume)
- Acceptance-criteria smoke test: `LODGE_ALLOWLIST="shannon@example.com" npx tsx scripts/lookup-hashed-user.ts 15f6d9a10f6cd051` prints `shannon@example.com` and exits 0
- No-match smoke: `ffffffffffffffff` target → prints stderr error + exits 1
- `grep "hash-user" src/lib/paid-route-guard.ts` → no matches (acceptance-criterion: guard must not import hash-user)

## TDD Gate Compliance

Plan 04 is a `type: execute` plan with per-task TDD (`tdd="true"` on Tasks 1 and 2). Gate sequence for each:

- **Task 1:** RED `5eab812` (`test(02-04): add failing cron spend-alert auth + alert tests (RED)`) → GREEN `5c601b3` (`safety-04: add daily cron spend-alert + resend idempotency + vercel.json`). ✓ Sequence correct.
- **Task 2:** RED `cb3db00` (`test(02-04): add failing hash-user tests for findEmailByHashedUser (RED)`) → GREEN `852f410` (`safety-04: add hashed-user CLI + extracted hash-user helper`). ✓ Sequence correct, with the ~2h interruption documented above not affecting correctness.
- **Task 3:** Docs-only (checklist file); no TDD gate applicable despite `tdd="true"` in the task header — the plan's own `<behavior>` block explicitly says "no automated test (this is a developer-facing checklist artifact)." Single commit `b335dff` is appropriate. ✓
