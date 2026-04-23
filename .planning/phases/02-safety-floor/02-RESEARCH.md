# Phase 2: Safety Floor - Research

**Researched:** 2026-04-21
**Domain:** Per-user rate limiting + budget caps + PII-free audit log + 1h client-token JWT + Vercel cron spend alerts + emergency kill switch
**Confidence:** HIGH (mechanics + package versions fact-checked; initial pricing table values verified at provider docs)

## Summary

Phase 2 extends existing in-memory rate-limit + magic-link auth infrastructure. All nine SAFETY-XX requirements are mechanical additions that reuse patterns already in the codebase (jose HS256, `fetchApi` chokepoint, in-memory sliding-window limiter, `console.log`-to-Vercel-logs). The CONTEXT.md decisions are self-consistent and internally locked; this research was scoped to fact-check the concrete APIs / commands / syntax CONTEXT assumes, source an initial `src/lib/pricing.ts` table from each provider's docs, and catch surprises.

**Three concrete surprises caught** (the Phase 1 codemod-syntax / matcher-case-sensitivity class of finding):

1. **`vercel.ts` requires installing `@vercel/config@^0.2.1` and exporting a named `config` const** (not default-exported). Shipped just recently enough that CONTEXT's phrasing "`vercel.ts` crons block or `vercel.json` crons field" is accurate, but the mechanics are non-obvious. `vercel.json` continues to work — simpler, recommend it for Phase 2. [CITED: https://vercel.com/docs/project-configuration/vercel-ts]
2. **Vercel cron routes are invoked via HTTP `GET` only** — not POST. The `Authorization: Bearer ${CRON_SECRET}` header pattern in CONTEXT is correct, but the handler signature must be `export function GET(req: NextRequest)`. [CITED: https://vercel.com/docs/cron-jobs/manage-cron-jobs]
3. **Hobby-plan cron-job schedules are imprecise** — runs anytime within the specified hour. Phase 2 lives on a Pro plan (per-minute accuracy), so `0 2 * * *` really does fire at 02:00-02:00:59 UTC. Verify plan tier before merging; if someone later downgrades the Vercel project to Hobby, the 02:00 UTC promise quietly degrades to "anywhere 02:00-02:59 UTC." Document in the KILL-SWITCH.md runbook (D-20). [CITED: https://vercel.com/docs/cron-jobs/manage-cron-jobs §Cron jobs accuracy]

**Primary recommendation:** Use `vercel.json` (not `vercel.ts`) for the single Phase 2 cron entry. Rationale: (a) this repo has no `vercel.*` file at all today — creating either one is net-new, and `vercel.json` is zero-dependency, (b) the Phase 2 cron entry is static (one path, one schedule, no dynamic config), (c) Vercel's own docs in `/docs/cron-jobs` and `/docs/cron-jobs/quickstart` continue to use `vercel.json` as the canonical example. `vercel.ts` would require installing `@vercel/config@^0.2.1` (a 0.x unstable package) for zero incremental benefit at Phase 2 scope. If a future phase needs programmatic config (e.g., per-deployment env-var-dependent routes), migrate then.

## Project Constraints (from CLAUDE.md)

Scanned `./CLAUDE.md` at repo root and at home. Relevant directives for Phase 2:

- **gstack skill usage for web browsing** — applies to interactive sessions, not research agents. Research used WebFetch/WebSearch per agent spec; future phases that involve live pilot UAT should use `/browse`.
- **Skill routing table** — no Phase 2 planner tasks trigger these skills. Irrelevant here.
- **No other binding conventions** in CLAUDE.md affect Phase 2 implementation. Existing Phase 1 CONTEXT D-20 (`safety-NN: imperative lowercase` commits) and D-11 (tests in `src/**/__tests__/`) are the binding conventions for this phase.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Per-user rate limiting (SAFETY-02, SAFETY-03) | API / Backend | — | In-memory Map in Node route handlers; client cannot self-police |
| Audit log emit (SAFETY-01) | API / Backend | — | `console.log` inside route handlers → Vercel logs; client must never see cost data |
| Pricing table (D-08) | API / Backend | — | Secret-adjacent (what we pay) stays server-side; never imported client-side |
| Client-token issue (SAFETY-05, D-12) | API / Backend | — | Cookie-gated issuance; signing requires `JWT_SECRET` which never leaves server |
| Client-token attach (D-13, D-15) | Browser / Client | — | `api-fetch.ts` runs only in browser |
| Client-token verify (SAFETY-09, D-14) | API / Backend | API / Backend (middleware + route) | Defense in depth per D-14 |
| Spend-alert cron (SAFETY-04) | API / Backend | External (Resend) | Vercel Cron → `/api/cron/spend-alert` → Resend SMTP |
| Kill switch (SAFETY-08) | API / Backend | Browser / Client (UI banner) | Env var read server-side; banner rendered client-side |
| Session step ceiling — client (SAFETY-06) | Browser / Client | — | `RehearsalMode.tsx` counter |
| Session step ceiling — server (SAFETY-06) | API / Backend | — | Per-5-min in-memory counter in rehearsal-feedback route |
| Wake-lock inactivity release (SAFETY-07) | Browser / Client | — | `screen-wake-lock.ts` only runs in browser |

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SAFETY-01 | PII-free structured audit log | D-07/D-09 patterns verified; `console.log` → Vercel logs is standard Vercel capture path (also the existing error-reporting pattern in `tts/gemini/route.ts`) |
| SAFETY-02 | Rate limiter accepts `userKey` | Existing `rateLimit(key, limit, windowMs)` signature unchanged — SAFETY-02 is a caller-side keyspace extension, not a signature change |
| SAFETY-03 | Per-user hourly + daily caps returning 429 | Existing `RateLimitResult.retryAfterSeconds` drives the `Retry-After` response header; pattern used in `/api/auth/magic-link/request/route.ts:99` |
| SAFETY-04 | Daily spend-spike cron email via Resend | Vercel Cron + Resend SDK v6 both verified (§Standard Stack) |
| SAFETY-05 | `/api/auth/client-token` issues 1h JWT | jose v6.2.2 `SignJWT().setAudience('client-token')` works identically to existing `signSessionToken()` pattern |
| SAFETY-06 | Session step ceiling (client + server) | `RehearsalMode.tsx` counter is new code; server counter reuses `rateLimit()` with short window |
| SAFETY-07 | Wake-lock inactivity auto-release | Existing `screen-wake-lock.ts:68` already has `visibilitychange` listener — new inactivity listener joins same pattern |
| SAFETY-08 | `RITUAL_EMERGENCY_DISABLE_PAID` kill switch | Plain env-var read at top of each paid route; no new infra |
| SAFETY-09 | Route-level `requireClientToken` check | jose `jwtVerify(token, secret, {audience: 'client-token'})` returns null on any failure — reuse existing `verifySessionToken` failure-swallowing pattern |

## Standard Stack

### Core (already in repo — no install required)
| Library | Version (verified) | Purpose | Why Standard |
|---------|--------------------|---------|--------------|
| `jose` | `^6.2.2` (latest stable 2026-04) | JWT sign / verify for client-token | Same library as existing magic-link + session tokens; edge-runtime safe |
| `resend` | `^6.11.0` (latest `6.12.2`) | Spend-alert email send | Already used in `/api/auth/magic-link/request/route.ts` |
| `next` | `^16.2.3` | Cron route handler (App Router) | Existing framework |
| `vitest` | `^4.1.2` | Test framework | Existing harness — already used by `api-fetch.test.ts`, `auth.test.ts`, `middleware.test.ts` |
| `eslint` | `^9` + `eslint-config-next@16.1.6` | Compile-time PII guard (D-10) | Existing ESLint 9 flat-config (`eslint.config.mjs`) supports inline `rules` blocks with `no-restricted-syntax` |

### Supporting (new — none required)
No new runtime dependencies. Phase 2 ships on the existing dep graph. [VERIFIED: `npm view jose version` → 6.2.2; `npm view resend version` → 6.12.2]

### Alternatives Considered (for completeness — not recommended)
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `vercel.json` crons block | `vercel.ts` + `@vercel/config@^0.2.1` | TS autocomplete and dynamic config. Rejected: adds a 0.x unstable dependency for zero benefit at Phase 2 scope (one static cron entry). |
| `no-restricted-syntax` ESLint rule | Custom ESLint plugin via `eslint-plugin-local-rules` | Dedicated plugin gives per-call-site context. Rejected: `no-restricted-syntax` with AST selector (`CallExpression[callee.name='emit'] > ObjectExpression > Property[key.name=/^(prompt\|completion\|email\|text\|body)$/]`) is single-file config, no new package. |
| `no-restricted-syntax` ESLint rule | Runtime redactor | Rejected by D-10 — compile-time is faster feedback, runtime redactor has silent-drop failure mode. |

### Installation
No `npm install` required for Phase 2.

**Version verification** (performed 2026-04-21):
```bash
npm view jose version      # → 6.2.2  (matches package.json ^6.2.2 — HIGH)
npm view resend version    # → 6.12.2 (package.json pins ^6.11.0 — HIGH; minor updates since bump, none breaking per Resend semver policy)
npm view @vercel/config version  # → 0.2.1 (not needed if using vercel.json — which is the recommendation)
```

## Architecture Patterns

### System Data Flow

```
                                    ┌───────────────────────────────┐
                                    │ Browser                        │
                                    │                                │
                                    │  [Component] → fetchApi()      │
                                    │                 ↓              │
                                    │        inject X-Client-Secret  │
                                    │           + Authorization:     │
                                    │             Bearer <1h-JWT>    │
                                    └──────────────┬────────────────┘
                                                   │
                                                   ▼
                                    ┌───────────────────────────────┐
                                    │ src/middleware.ts              │
                                    │  1. CORS origin check          │
                                    │  2. X-Client-Secret check      │
                                    │  3. pilot-session cookie       │
                                    │  4. client-token (Bearer)      │◀──── SAFETY-09 new
                                    │     verifyClientToken()        │      (except /api/auth/*)
                                    └──────────────┬────────────────┘
                                                   │
                                                   ▼
                                    ┌───────────────────────────────┐
                                    │ Paid route handler              │
                                    │  (tts/*, transcribe,           │
                                    │   rehearsal-feedback)          │
                                    │                                │
                                    │  0. if RITUAL_EMERGENCY_       │
                                    │     DISABLE_PAID → 503 early   │◀──── SAFETY-08 new
                                    │  1. requireClientToken() again │◀──── SAFETY-09 new (belt-&-suspenders)
                                    │  2. rateLimit(paid:hour:${u})  │◀──── SAFETY-02/03 new
                                    │     + rateLimit(paid:day:${u}) │
                                    │  3. call upstream AI provider  │
                                    │  4. compute estimatedCost      │◀──── SAFETY-01 new
                                    │     via pricing.ts lookup      │
                                    │  5. emit(AuditRecord)          │◀──── SAFETY-01 new
                                    │  6. return response            │
                                    └───────────────────────────────┘

                                    ┌───────────────────────────────┐
                                    │ Vercel Cron (scheduler)         │
                                    │  daily 02:00 UTC                │
                                    │    GET /api/cron/spend-alert   │◀──── SAFETY-04 new
                                    │    with Authorization:          │
                                    │      Bearer ${CRON_SECRET}      │
                                    └──────────────┬────────────────┘
                                                   ▼
                                    ┌───────────────────────────────┐
                                    │ /api/cron/spend-alert/route.ts │
                                    │  - verify CRON_SECRET bearer   │
                                    │  - aggregate Vercel log tail   │
                                    │    (Phase 2: no log-drain yet; │
                                    │    see "Known Gap" below)       │
                                    │  - if total > $10 or any-user  │
                                    │    > $3 → resend.emails.send() │
                                    └───────────────────────────────┘
```

### Recommended Project Structure (Phase 2 additions only)

```
src/
├── lib/
│   ├── rate-limit.ts        # EXTEND: callers pass namespaced keys (no signature change)
│   ├── audit-log.ts         # NEW: emit(record: AuditRecord) → console.log('[AUDIT]', json)
│   ├── pricing.ts           # NEW: model → unit-price lookup table
│   ├── auth.ts              # EXTEND: add signClientToken + verifyClientToken
│   ├── api-fetch.ts         # EXTEND: attach Authorization: Bearer + proactive refresh
│   ├── screen-wake-lock.ts  # EXTEND: inactivity timer + release
│   └── __tests__/
│       ├── rate-limit.test.ts       # NEW
│       ├── audit-log.test.ts        # NEW
│       ├── client-token.test.ts     # NEW (or inside extended auth.test.ts)
│       └── pricing.test.ts          # NEW (thin — verifies lookup shape)
├── middleware.ts            # EXTEND: verify client-token on /api/* (except /api/auth/*)
├── __tests__/
│   └── middleware.test.ts   # EXTEND: add client-token flow cases
├── app/api/
│   ├── auth/client-token/route.ts   # NEW
│   ├── cron/spend-alert/route.ts    # NEW
│   ├── tts/{engine}/route.ts        # EXTEND each: 7 engines × (killswitch + requireClientToken + rateLimit + audit emit)
│   ├── transcribe/route.ts          # EXTEND: same treatment
│   └── rehearsal-feedback/route.ts  # EXTEND: same treatment + 300-calls/5-min counter
├── components/
│   ├── RehearsalMode.tsx            # EXTEND: session step ceiling (200 default)
│   └── DegradedModeBanner.tsx       # NEW (or extend PilotBanner.tsx per D-18)
└── eslint.config.mjs        # EXTEND: add no-restricted-syntax rule for audit-log PII guard
docs/
└── runbooks/
    ├── SECRET-ROTATION.md   # EXTEND: "See also" points at KILL-SWITCH.md
    └── KILL-SWITCH.md       # NEW: flip + verify + flip-back procedure
vercel.json                  # NEW: single crons entry (recommendation)
```

### Pattern 1: Vercel Cron → Protected Next.js Route Handler

**What:** Vercel Cron invokes a production-deployment URL via HTTP GET; injects `Authorization: Bearer ${CRON_SECRET}` (env var set by you).

**When to use:** Any scheduled task running on Vercel. Only way to run recurring server work without an external scheduler.

**Example** — the canonical Vercel-docs pattern, verbatim:
```ts
// Source: https://vercel.com/docs/cron-jobs/manage-cron-jobs §Securing cron jobs
// src/app/api/cron/spend-alert/route.ts
import type { NextRequest } from 'next/server';

export function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  // ... aggregate spend, send Resend email ...
  return Response.json({ success: true });
}
```

**And the `vercel.json` entry:**
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    { "path": "/api/cron/spend-alert", "schedule": "0 2 * * *" }
  ]
}
```

`0 2 * * *` = 02:00 UTC daily. Verified with crontab.guru semantics. Vercel timezone is always UTC [CITED: https://vercel.com/docs/cron-jobs §Cron expression limitations].

### Pattern 2: jose HS256 Client-Token (SAFETY-05)

**What:** Mirror the existing `signSessionToken` / `verifySessionToken` with a new `aud: 'client-token'` audience constant.

**When to use:** Any time the app needs a short-lived token distinct from the 30-day session cookie — here, the 1h client-token that rides alongside `X-Client-Secret`.

**Example:**
```ts
// Source: adapted from src/lib/auth.ts:70-134 (existing pattern)
import { SignJWT, jwtVerify } from "jose";

const CLIENT_TOKEN_AUDIENCE = "client-token";
const CLIENT_TOKEN_TTL_SECONDS = 60 * 60; // 1h

export async function signClientToken(hashedUser: string): Promise<string> {
  return new SignJWT({ sub: hashedUser })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("masonic-ritual-mentor")       // existing ISSUER constant
    .setAudience(CLIENT_TOKEN_AUDIENCE)
    .setExpirationTime(`${CLIENT_TOKEN_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifyClientToken(
  token: string | undefined,
): Promise<{ sub: string } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: "masonic-ritual-mentor",
      audience: CLIENT_TOKEN_AUDIENCE,
    });
    const sub = payload.sub;
    if (typeof sub !== "string") return null;
    return { sub };
  } catch {
    return null;
  }
}
```

**jose v5→v6 breaking-change audit** [VERIFIED: https://github.com/panva/jose/releases/tag/v6.0.0]:
- v6.0 breaking changes: `PEMImportOptions` → `KeyImportOptions` rename, ES2022 build target, Node 18.x dropped, secp256k1 and RSA1_5 removed, Ed448/X448 removed.
- **NONE** of the breaking changes affect `SignJWT().setProtectedHeader({alg:'HS256'}).setIssuedAt().setIssuer().setAudience().setExpirationTime().sign()` or `jwtVerify(token, secret, {issuer, audience})` — the exact APIs this repo uses. Confidence: HIGH. Shipping code that mirrors `signSessionToken` is safe.

### Pattern 3: ESLint `no-restricted-syntax` for PII Guard (D-10)

**What:** AST selector inside `eslint.config.mjs` catches any object-literal property key named `prompt`, `completion`, `email`, `text`, or `body` that appears as an argument to a `CallExpression` whose callee is `emit`.

**When to use:** The D-10 compile-time PII guard.

**Example** (flat-config syntax, matches repo's existing `eslint.config.mjs`):
```js
// Source: https://eslint.org/docs/latest/rules/no-restricted-syntax + AST selector syntax
// eslint.config.mjs
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const AUDIT_BANNED_KEYS = "prompt|completion|email|text|body";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            `CallExpression[callee.name='emit'] > ObjectExpression > ` +
            `Property[key.name=/^(${AUDIT_BANNED_KEYS})$/]`,
          message:
            "Audit records must not carry request/response bodies. " +
            "Hash the value with sha256 and pass promptHash/completionHash instead.",
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
```

**Footgun:** the selector only fires on literal object expressions passed directly to `emit({...})`. Variables passed through (`const record = { prompt: ...}; emit(record);`) bypass the rule. Mitigation: the `AuditRecord` TS discriminated union type (D-09) omits these keys — so the variable case fails type-checking even when ESLint misses it. Defense in depth per D-10's stated "TS union + ESLint rule" combo. Document the limitation inline in the rule comment.

### Anti-Patterns to Avoid

- **Passing the raw `prompt` string as a variable named `promptHash`**: the type system and ESLint both see "promptHash", but runtime emits plaintext. Mitigation: hash inside the route handler immediately before the `emit()` call, and the helper `sha256Hex(x)` returns the hex digest — make the hash function the only source of promptHash values.
- **Calling `emit()` inside a Promise.catch without awaiting**: audit record is dropped on unhandled rejection. Mitigation: `emit` is synchronous (it's just `console.log`) — document this in `audit-log.ts`.
- **Reading `CRON_SECRET` from a non-env source**: if it's hardcoded or read from `process.env[userInput]`, it's spoofable. Mitigation: `process.env.CRON_SECRET` literal only.
- **Hobby-plan assumption**: `0 2 * * *` on Hobby plan runs anywhere in 02:00-02:59 UTC. Mitigation: the project is on Pro (inferred from active Cron Jobs permissions); if downgraded, the 02:00 target degrades. Document in KILL-SWITCH.md.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cron scheduler | Custom setInterval in a warm function | Vercel Cron via `vercel.json` | Serverless instances die; no durable scheduler |
| Auth header verification for cron | Custom HMAC signature scheme | `Authorization: Bearer ${CRON_SECRET}` exact string compare | Vercel docs canonical pattern, well-tested |
| JWT sign/verify | Manual HMAC + JSON | `jose` v6 `SignJWT` / `jwtVerify` | Already in repo; edge-runtime safe; audience/issuer checks |
| Sliding-window rate limiter | New ring buffer | Existing `src/lib/rate-limit.ts` | Already shipped; SAFETY-02 is a caller extension |
| Email template | React server-render for alert | Plain HTML + text in `resend.emails.send()` | Magic-link route precedent; alert email is internal-to-Shannon |
| Hashed-user reverse lookup | New `/admin` endpoint | Existing `scripts/lookup-hashed-user.ts` CLI from memory skill `hashed-user-id-analytics-with-operator-runbook` | Phase 2 specifically says NOT to build this |
| PII runtime redactor | `redactKeys(obj)` helper | TS discriminated union + ESLint `no-restricted-syntax` | D-10 rejected runtime redaction (silent-drop failure mode) |
| SSE-stream cost accounting | Per-chunk token counter | Call `estimateCost(model, units)` once after response body is known | Cost precision not needed; pricing table is provider published-list, not invoice-exact |

**Key insight:** every item Phase 2 needs is either already in the repo (jose, rate-limit, resend, fetchApi) or is a trivial wrapper around an existing pattern. No net-new external dependency. The largest surface change is the seven TTS-engine-route callsite additions (plus transcribe + rehearsal-feedback), which is a mechanical propagation of the audit-emit + rate-limit + killswitch-check pattern.

## Runtime State Inventory

> N/A for Phase 2 — this is not a rename / refactor / migration phase. No existing keys, collection names, env var names, OS task registrations, or build artifacts change meaning. All Phase 2 changes are additive (new modules, new env vars, new callsites) or expansive (existing signatures are compatible with existing callers). Confirmed by reading CONTEXT.md — no "rename X to Y" or "migrate store from A to B" decision.

## Common Pitfalls

### Pitfall 1: Forgetting `/api/auth/client-token` in the middleware shared-secret carve-out
**What goes wrong:** Middleware blocks the client-token bootstrap because the client has no token yet and nothing to present except the session cookie. First call enters a chicken-and-egg loop.

**Why it happens:** CONTEXT D-12 says the endpoint is "cookie-gated AND same-origin" — meaning it must NOT require `X-Client-Secret` or `Authorization: Bearer <client-token>` on the request (the client doesn't have one yet on the first call). Existing middleware carve-out is only for `/api/auth/*`. `/api/auth/client-token` is already under `/api/auth/` so this happens to work — but D-15's note "/api/auth/* for shared-secret skip" is only accurate because the URL path starts with `/api/auth/`. Changing the URL later (e.g., `/api/client-token`) without updating the carve-out breaks bootstrap.

**How to avoid:** Keep the endpoint under `/api/auth/client-token` verbatim. If renamed, update `/api/auth/*` carve-out list in middleware.

**Warning signs:** First-ever `fetchApi` call returns 401; client logs "token fetch failed"; `middleware.test.ts` passes because no test exercises the bootstrap path.

### Pitfall 2: Vercel cron retries don't exist — drops are silent
**What goes wrong:** Cron job fails (e.g., Resend 503) and Shannon gets no alert the next morning. Spend continues uncapped.

**Why it happens:** "Vercel will not retry an invocation if a cron job fails." [CITED: https://vercel.com/docs/cron-jobs/manage-cron-jobs §Cron job error handling] Plus: Vercel's event-driven system can deliver the SAME cron event multiple times — so idempotency matters.

**How to avoid:** (a) Log success/failure with a structured `[CRON]` tag so Vercel logs surface failed runs; (b) make the aggregation idempotent (`LIKE` Vercel's own Good/Bad example: "aggregate yesterday's spend and send email" is safe to run twice); (c) KILL-SWITCH.md runbook adds a "verify the cron ran in the last 25 hours" step Shannon can spot-check.

**Warning signs:** Vercel Cron Jobs dashboard shows a failed invocation and no retry; Shannon sees a quiet day that was actually a silent alert drop.

### Pitfall 3: `no-restricted-syntax` variable-assignment bypass
**What goes wrong:** Developer writes `const r = { prompt: x, route: 'tts' }; emit(r as AuditRecord);` — the ESLint selector doesn't fire because the object literal isn't a direct argument to `emit`.

**Why it happens:** AST selectors are local; they don't do data-flow analysis.

**How to avoid:** D-09's TS discriminated union omits `prompt`/`completion`/`email`/`text`/`body` from the `AuditRecord` type itself. Without a cast, the assignment fails type-checking. Document in `audit-log.ts`: "If you find yourself reaching for `as AuditRecord`, you are the bug."

**Warning signs:** PR diff shows `as AuditRecord` near an `emit()` call; code review flag.

### Pitfall 4: Rate-limit cold-start quota reset
**What goes wrong:** Attacker forces function cold starts (e.g., via long gaps between requests that evict the container) to reset the in-memory rate-limit Map, bypassing per-user caps.

**Why it happens:** `rate-limit.ts` header comment already flags this: "cold-start spawns a new process with an empty map." In-memory Maps don't persist across instances.

**How to avoid:** CONTEXT's locked decision to stay in-memory (Upstash deferred to SAFETY-v2-01) accepts this. Mitigation is that Vercel Fluid Compute reuses instances and pilot scale (≤10 lodges) means the attacker would need to distribute calls across many cold starts to meaningfully reset. For pilot, acceptable. **Do not claim the rate limit is "durable" in Shannon-facing docs.** Mention it in KILL-SWITCH.md as a known limitation ("Rate limit is best-effort; for a sustained high-rate attack, flip the kill switch").

**Warning signs:** Audit log shows a single hashedUser making >60 calls/hr across multiple function-instance cold starts — the buckets shard by instance.

### Pitfall 5: Proactive 50-min refresh races with tab backgrounding
**What goes wrong:** User backgrounds the tab at minute 49; browser throttles the `setTimeout`; refresh fires minute 75 but by then the 60-min client-token expired at minute 60. Next API call returns 401.

**Why it happens:** Browsers throttle `setTimeout` in background tabs to ~1min resolution; a 50-min timer may fire anywhere from 50 to 90+ minutes later depending on tab lifecycle.

**How to avoid:** D-13's **reactive 401-retry fallback** is the correct safety net — the proactive timer is the fast path, the retry is the slow path. Also D-13's `visibilitychange` listener resets the timer when the tab foregrounds. Both are required; neither alone suffices.

**Warning signs:** Users report intermittent "one-off failure then it worked" — the reactive retry kicked in and they never noticed.

### Pitfall 6: Gemini TTS pricing is per-token, not per-character
**What goes wrong:** `src/lib/pricing.ts` assumes per-character cost for `gemini-3.1-flash-tts-preview`. Actual is per-token, with **25 tokens per second of output audio**. A pricing-table value of "$X/char" produces wildly wrong `estimatedCostUSD`.

**Why it happens:** Every other TTS engine in the app (ElevenLabs, Google Cloud, Deepgram) is priced per-character. Gemini TTS is the outlier.

**How to avoid:** In `pricing.ts`, make the unit-type an explicit tag per entry:
```ts
type PricingEntry =
  | { kind: "per-input-token" | "per-output-token"; usdPerMillion: number; sourceUrl: string; verified: string }
  | { kind: "per-character"; usdPerMillionChars: number; sourceUrl: string; verified: string }
  | { kind: "per-audio-minute"; usdPerMinute: number; sourceUrl: string; verified: string }
  | { kind: "self-hosted"; usdPerUnit: 0; sourceUrl: string; verified: string };
```
Compute `estimatedCostUSD` at emit time from the measured dimension (charCount, audio-seconds × 25 tokens/s for Gemini, etc.).

**Warning signs:** Spike alert email values that don't match Shannon's Vercel invoice by orders of magnitude.

## Code Examples

Verified patterns from official sources:

### Vercel Cron — route handler + config (SAFETY-04)
```ts
// src/app/api/cron/spend-alert/route.ts
// Source: https://vercel.com/docs/cron-jobs/manage-cron-jobs §Securing cron jobs (verbatim pattern)
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30; // seconds — well under Pro plan limits

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  // ... aggregate spend + Resend email ...
  return Response.json({ success: true });
}
```

```json
// vercel.json  (new file at repo root)
// Source: https://vercel.com/docs/cron-jobs/quickstart
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    { "path": "/api/cron/spend-alert", "schedule": "0 2 * * *" }
  ]
}
```

### Resend v6 — send with HTML + text (SAFETY-04 email)
```ts
// Source: https://resend.com/docs/send-with-nodejs (verified against resend@6.11.0+ shape)
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);
const { data, error } = await resend.emails.send({
  from: process.env.MAGIC_LINK_FROM_EMAIL!, // reuse existing env var or add SPEND_ALERT_FROM
  to: process.env.SPEND_ALERT_TO!,           // Shannon's email
  subject: `Masonic Ritual Mentor spend alert — ${dateStr}`,
  html: htmlBody,
  text: textBody,
  idempotencyKey: `spend-alert-${dateStr}`, // v6 feature — prevents dupes if Vercel delivers twice
});
if (error) console.error("[CRON] spend-alert Resend failed:", error);
```

**Resend v6 idempotency keys** [CITED: https://resend.com/docs/send-with-nodejs] expire after 24h and prevent duplicate sends — perfect fit for Vercel cron's at-least-once semantics.

### Audit emit + PII guard (SAFETY-01)
```ts
// src/lib/audit-log.ts
// PII banned-keys list is ENFORCED by eslint.config.mjs no-restricted-syntax rule.

export type TTSRecord = {
  kind: "tts";
  timestamp: string;
  hashedUser: string;
  route: string;
  promptHash: string;
  completionHash: string;
  estimatedCostUSD: number;
  latencyMs: number;
  model: string;
  voice: string;
  charCount: number;
};
export type STTRecord = {
  kind: "stt";
  timestamp: string;
  hashedUser: string;
  route: string;
  promptHash: string;
  completionHash: string;
  estimatedCostUSD: number;
  latencyMs: number;
  model: string;
  durationMs: number;
  audioByteCount: number;
};
export type FeedbackRecord = {
  kind: "feedback";
  timestamp: string;
  hashedUser: string;
  route: string;
  promptHash: string;
  completionHash: string;
  estimatedCostUSD: number;
  latencyMs: number;
  variantId: string;
  promptTokens: number;
  completionTokens: number;
};
export type AuditRecord = TTSRecord | STTRecord | FeedbackRecord;

export function emit(record: AuditRecord): void {
  // Synchronous. Vercel captures stdout automatically — no await.
  console.log("[AUDIT]", JSON.stringify(record));
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `vercel.json` only | `vercel.ts` + `@vercel/config` optional | Sept 2025 (approx) | Programmatic config available; static is still canonical |
| jose v5 | jose v6 | v6.0.0 (mid-2025) | No impact on SignJWT fluent API or jwtVerify — safe transition |
| resend v5 | resend v6 | v6.0.0 (2025) | Added `idempotencyKey`, `template`, `scheduledAt` fields |

**Deprecated / outdated:**
- Cron-via-Next-middleware patterns (old hack): Vercel Cron is the supported path; never run scheduling in middleware.
- `vercel env rm` + `vercel env add` pattern for atomic rotation: use `vercel env update` (flagged in Phase 1 D-05b).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Vercel project is on Pro plan (cron per-minute accuracy) | Summary — Surprise #3; Pattern 1 | Hobby plan has hour-level jitter; 02:00 becomes 02:00-02:59 UTC. Phase 2 still works; KILL-SWITCH.md warning text is wrong. Low-severity. |
| A2 | `@vercel/config` v0.x is production-safe for the one config pattern we'd use | Alternatives Considered | Irrelevant if we follow the recommendation (use `vercel.json`). Only matters if Phase 2 picks `vercel.ts`. |
| A3 | Vercel log retention is sufficient for the cron to tail yesterday's logs | Pattern 1; Known Gap below | If retention is shorter than 24h, the cron can't aggregate. Mitigation: ingest-and-store lives in Phase 6 ADMIN-02; Phase 2 cron may need to aggregate from a lightweight in-memory buffer that resets at cold start (acceptable pilot-scale limitation). **Flag for user.** |
| A4 | `eslint.config.mjs` flat-config supports the `no-restricted-syntax` rule with the proposed selector | Pattern 3 | Selector syntax verified; specific selector combinator may need AST-Explorer verification during implementation. Low-severity. |
| A5 | `RITUAL_EMERGENCY_DISABLE_PAID=true` as a string literal comparison covers intended behavior | SAFETY-08 | Env-var-string comparison (`=== 'true'`) is standard; anything else (`1`, `yes`) would not flip the switch. Keep the env-var value convention explicit in KILL-SWITCH.md. Low-severity. |
| A6 | The "top 5 spenders" in the alert email is computable from the same day's log tail | D-06 | See A3 — depends on log aggregation source. Phase 2 may only be able to report "total spend / top buckets seen during cron invocation window" unless a buffer is stood up. **Flag for user.** |

> **Known Gap — audit log aggregation source for the cron** (A3 + A6):
> D-07 locks the audit log destination as Vercel logs via `console.log`. D-06 says the cron aggregates "totals per route + top 5 spenders." The cron route handler has NO direct Vercel-logs read API in Phase 2 — Vercel Log Drain API (ADMIN-02) is explicitly deferred. Three options surface:
>  - **Option A:** Cron reads from an in-memory `recentSpend` buffer populated by every `emit()` call. Buffer resets on cold start — alert is "last 24h of warm-container data" not "last 24h true total." Acceptable pilot-scale with a caveat in the alert email body.
>  - **Option B:** Cron no-ops for aggregation and emits only a heartbeat — Shannon watches Vercel logs manually during the pilot. Alert still fires on per-request thresholds (route handler sees its own emit and sends a one-shot alert in-handler when a user crosses $3 in a single call — but this is not what D-04 describes).
>  - **Option C:** Stand up a minimal single-file in-memory day-scoped counter (`src/lib/spend-tally.ts`) that `emit()` updates synchronously and the cron reads. Same cold-start limitation as rate-limit; same pilot-scale rationale.
>
> Option C matches the CONTEXT.md spirit ("zero new infrastructure" in D-07) and is the natural extension. **Recommend the planner select C and document the cold-start limitation explicitly.** Flag for user review.

## Open Questions

1. **Hashed-user reverse-lookup CLI existence.** CONTEXT D-06 says "Shannon can reverse-lookup via the local hashedUser → email CLI from memory skill `hashed-user-id-analytics-with-operator-runbook`."
   - What we know: a memory skill exists describing the pattern.
   - What's unclear: whether `scripts/lookup-hashed-user.ts` already exists in the repo, or whether it's something Phase 2 must create. Not found in `scripts/` listing.
   - Recommendation: Planner includes a small task to create or verify this CLI, since the alert email (D-06) explicitly references it. If already exists elsewhere, mark as verified; otherwise add a one-file task under SAFETY-04.

2. **Audit log aggregation source.** See Known Gap above.

3. **`eslint.config.mjs` coverage for `scripts/`.** The proposed ESLint rule applies to `src/**`. Scripts (`scripts/*.ts`) are excluded by the existing flat config. Phase 2 never calls `emit()` from scripts, so this is fine — but document the exclusion in `audit-log.ts` ("emit() is intended for server route handlers only").

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| `vercel` CLI | Cron configuration verification + runbook | ✓ | 51.4.0 | — |
| `node` | Build / test | ✓ | 20.20.0 | — |
| `jose` | Client-token | ✓ | 6.2.2 (matches package.json) | — |
| `resend` | Spend alert | ✓ | 6.11.0 (package.json; latest 6.12.2) | — |
| `vitest` | Test harness | ✓ | 4.1.2 | — |
| `eslint` | PII guard | ✓ | 9 + eslint-config-next 16.1.6 | — |
| `RESEND_API_KEY` env var | Spend alert | Assumed set (used by magic-link route) | — | If unset, cron falls through to `console.error` — acceptable pilot-scale degradation |
| `CRON_SECRET` env var | Cron auth | Must be added (new) | — | Hard requirement — planner includes a task to set via `vercel env add CRON_SECRET production` |
| `SPEND_ALERT_TO` env var | Alert recipient | Must be added (new) | — | Hard requirement; or hardcode Shannon's email (rejected — env is cleaner) |

**Missing dependencies with no fallback:**
- `CRON_SECRET` — must be provisioned before the cron route deploys, else every cron invocation 401s. Planner's SAFETY-04 task includes a `vercel env add CRON_SECRET` step (reuse the runbook pattern from HYGIENE-07 D-05b: `vercel env add CRON_SECRET production` with explicit branch + trailing-newline awareness).
- `SPEND_ALERT_TO` — same.

**Missing dependencies with fallback:**
- None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.2 |
| Config file | `/home/mcleods777/Masonic-Ritual-AI-Mentor/vitest.config.ts` (existing, unchanged) |
| Quick run command | `npm test` (watch mode) |
| Full suite command | `npm run test:run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| SAFETY-01 | `emit(AuditRecord)` writes JSON to stdout prefixed `[AUDIT]` | unit | `npm run test:run -- src/lib/__tests__/audit-log.test.ts` | ❌ Wave 0 |
| SAFETY-01 (guard) | ESLint rule fires on banned-key object literal in `emit()` arg | lint | `npx eslint --rule '{"no-restricted-syntax": "error"}' <fixture>` | ❌ Wave 0 — add a fixture file + snapshot assertion |
| SAFETY-02 | `rateLimit('paid:hour:${userKey}', 60, 3_600_000)` allows 60 then rejects | unit | `npm run test:run -- src/lib/__tests__/rate-limit.test.ts` | ❌ Wave 0 |
| SAFETY-03 | `/api/tts/gemini` returns 429 after 60th call | integration (route-handler) | `npm run test:run -- src/app/api/tts/gemini/__tests__/` | ❌ Wave 0 — new `__tests__` subdir |
| SAFETY-04 | Cron route rejects missing/wrong `Authorization: Bearer ${CRON_SECRET}` | unit | `npm run test:run -- src/app/api/cron/spend-alert/__tests__/auth.test.ts` | ❌ Wave 0 |
| SAFETY-04 | Cron route calls `resend.emails.send` when thresholds exceeded | unit (mocked Resend) | `npm run test:run -- src/app/api/cron/spend-alert/__tests__/alert.test.ts` | ❌ Wave 0 |
| SAFETY-05 | `signClientToken(userKey)` round-trips through `verifyClientToken` | unit | `npm run test:run -- src/lib/__tests__/client-token.test.ts` or extend `auth.test.ts` | ❌ Wave 0 |
| SAFETY-05 | `verifyClientToken` rejects a token with `aud: pilot-session` | unit | same file | ❌ Wave 0 — cross-audience spoofing case |
| SAFETY-06 | `RehearsalMode` stops auto-advance after step ceiling | integration / jsdom | `npm run test:run -- src/components/__tests__/rehearsal-mode-ceiling.test.tsx` | ❌ Wave 0 — new file |
| SAFETY-06 (server) | `/api/rehearsal-feedback` returns 429 after 300 in 5 min | unit | covered in rehearsal-feedback route test | ❌ Wave 0 |
| SAFETY-07 | `keepScreenAwake` releases after 30 min inactivity | unit (fake timers) | `npm run test:run -- src/lib/__tests__/screen-wake-lock.test.ts` | ❌ Wave 0 (no existing wake-lock test) |
| SAFETY-08 | Paid route returns 503 + structured JSON when env set | unit | per-route `__tests__/` folders | ❌ Wave 0 |
| SAFETY-09 | Paid route returns 401 when middleware is bypassed but no Bearer present | unit (route-level) | per-route `__tests__/` folders | ❌ Wave 0 |
| MIDDLEWARE | Existing `.mram` exclusion still holds (regression) | unit | `src/__tests__/middleware.test.ts` (Phase 1 HYGIENE-06) | ✅ Exists |
| MIDDLEWARE (new) | Middleware verifies Bearer client-token on `/api/tts/*` | unit | extend `src/__tests__/middleware.test.ts` | ✅ Extend |

### Sampling Rate
- **Per task commit:** `npm run test:run -- <file>` for the touched file(s) + `npm run test:run -- src/__tests__/middleware.test.ts` (always, since middleware is touched by many tasks)
- **Per wave merge:** `npm run test:run` (full vitest suite)
- **Phase gate:** `npm run build && npm run test:run && npx eslint .` all green before verification

### Wave 0 Gaps
- [ ] `src/lib/__tests__/rate-limit.test.ts` — covers SAFETY-02 (does not exist; new file)
- [ ] `src/lib/__tests__/audit-log.test.ts` — covers SAFETY-01 emit shape
- [ ] `src/lib/__tests__/client-token.test.ts` — covers SAFETY-05 sign + verify round-trip (or extend existing `auth.test.ts`)
- [ ] `src/lib/__tests__/pricing.test.ts` — covers D-08 lookup-table shape (thin)
- [ ] `src/lib/__tests__/screen-wake-lock.test.ts` — covers SAFETY-07 inactivity release
- [ ] `src/app/api/cron/spend-alert/__tests__/` — new dir, two test files
- [ ] `src/app/api/tts/gemini/__tests__/` — new dir (and same for each of the 7 engines, OR one shared `tts-common.test.ts` that imports each route and drives it through a common path)
- [ ] `src/app/api/rehearsal-feedback/__tests__/` — new dir
- [ ] `src/app/api/transcribe/__tests__/` — new dir
- [ ] `src/components/__tests__/` — new dir for `RehearsalMode` ceiling test
- [ ] ESLint fixture file for banned-key test (`src/lib/__tests__/fixtures/banned-emit.ts` — deliberately fails the rule; test loads ESLint programmatically and asserts the error)

Framework install: none — vitest 4.1.2 already present.

## Security Domain

> `security_enforcement` is not explicitly set in `.planning/config.json` — treated as enabled per agent default.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | yes | Magic-link JWT (existing) + client-token JWT (SAFETY-05 new) — jose HS256 with audience scoping |
| V3 Session Management | yes | httpOnly `pilot-session` cookie (existing); client-token is NOT a session (it's a bearer used in-memory) |
| V4 Access Control | yes | `LODGE_ALLOWLIST` (existing); `requireClientToken` (SAFETY-09 new); shared-secret header (existing) |
| V5 Input Validation | yes | Existing input caps (`MAX_TEXT_CHARS` 2000 for TTS, 1MB for transcribe, 4000 chars for rehearsal-feedback performanceContext); SAFETY-02 rate limiter is a form of input-rate validation |
| V6 Cryptography | yes | HMAC-SHA256 via jose (existing); sha256 for promptHash/completionHash (new) — use Node's `crypto.createHash('sha256')` — never hand-roll |
| V7 Error Handling | yes | Existing null-collapse pattern for auth failures; kill-switch structured 503 bodies per D-17 |
| V8 Data Protection | yes | Audit log MUST NOT carry prompt/completion bodies — D-10 compile-time guard |
| V9 Communications | yes | CSP already includes required upstreams (Mistral, Gemini, Google TTS, Resend) in `next.config.ts` |
| V12 Files / Resources | no | Phase 2 touches no file upload / filesystem APIs |
| V14 Configuration | yes | `CRON_SECRET`, `RITUAL_EMERGENCY_DISABLE_PAID`, pricing-table constants — all must be env-sourced or code-sourced, never user-input-sourced |

### Known Threat Patterns for this Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Leaked shared-secret header reused against paid routes | Spoofing | SAFETY-05 + SAFETY-09 add 1h client-token ride-along; verified route-level |
| Replay of expired client-token | Spoofing | `setExpirationTime('3600s')` in `signClientToken`; `jwtVerify` enforces |
| Cross-audience token reuse (session cookie replayed as Bearer) | Spoofing | `aud: 'client-token'` vs `aud: 'pilot-session'` in `jwtVerify` options |
| PII in logs (ritual text, emails) | Information disclosure | D-09 TS union + D-10 ESLint rule; hashes only |
| Cron endpoint public GET flood | DoS / unauthorized invocation | `Authorization: Bearer ${CRON_SECRET}` check per Vercel canonical pattern |
| Rate-limit quota reset via cold start | Elevation / bypass | Accepted pilot-scale tradeoff (documented in `rate-limit.ts` header); mitigation is SAFETY-v2-01 Upstash swap |
| Runaway auto-advance billing | DoS-of-wallet | SAFETY-06 client ceiling + SAFETY-03 server caps + SAFETY-08 kill switch (three layers) |
| Audit-log silent drop | Auditability gap | `emit()` is synchronous `console.log`; Vercel captures stdout; no async path that can drop |
| Cron double-delivery sends duplicate alert | Integrity | `idempotencyKey: spend-alert-${YYYY-MM-DD}` in Resend v6 call (24h window — exactly right) |

## Sources

### Primary (HIGH confidence)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs) — expression syntax, UTC-only timezone
- [Vercel Managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs) — `CRON_SECRET` pattern, GET-only invocation, no-retry, idempotency requirement
- [Vercel Cron Quickstart](https://vercel.com/docs/cron-jobs/quickstart) — `vercel.json` canonical schema
- [Vercel Programmatic Configuration with vercel.ts](https://vercel.com/docs/project-configuration/vercel-ts) — `@vercel/config` package + `export const config: VercelConfig = {...}` pattern
- [jose v6.0.0 release notes](https://github.com/panva/jose/releases/tag/v6.0.0) — breaking-change audit
- [Google Cloud Text-to-Speech Pricing](https://cloud.google.com/text-to-speech/pricing) — per-character rates for Standard/WaveNet/Neural2/Studio/Chirp 3 HD
- [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing) — per-1M-token rates for TTS preview models; 25 tokens/sec audio conversion
- [Groq Pricing](https://groq.com/pricing/) — Whisper per-hour + Llama 3.3 per-1M-token
- [Voxtral Transcribe 2 announcement](https://mistral.ai/news/voxtral-transcribe-2) — $0.003/min (mini) and $0.006/min (realtime) per-minute audio
- [Deepgram Pricing](https://deepgram.com/pricing) — Aura per-1000-char + Nova per-minute (via WebFetch)
- [Resend Node.js SDK](https://resend.com/docs/send-with-nodejs) — v6 `emails.send()` signature, idempotencyKey feature
- [ESLint no-restricted-syntax](https://eslint.org/docs/latest/rules/no-restricted-syntax) — AST selector grammar for D-10 PII guard
- Phase 1 `01-CONTEXT.md` — commit + test conventions carried forward

### Secondary (MEDIUM confidence)
- [ElevenLabs Pricing (2026)](https://bigvu.tv/blog/elevenlabs-pricing-2026-plans-credits-commercial-rights-api-costs/) — Creator plan overage $0.30/1K chars; pay-as-you-go API $0.06-$0.12/1K chars (aggregator, cross-verified with elevenlabs.io/pricing/api)
- [Mistral Small pricing](https://costbench.com/software/llm-api-providers/mistral-ai/) — $0.20/1M input, $0.60/1M output (aggregator; Mistral's own pricing page didn't render dollar values for WebFetch)
- [ESLint selector discussion](https://github.com/eslint/eslint/discussions/18320) — how to target object-literal keys specifically

### Tertiary (LOW confidence — flagged for user confirmation)
- Exact Mistral Small pricing ($0.20 in / $0.60 out per 1M tokens) — came from an aggregator, not mistral.ai directly. Shannon should confirm by logging into https://console.mistral.ai/ and viewing current plan pricing before the table ships. **Marked [CITED: costbench.com — cross-verify at console.mistral.ai]** in the pricing table.
- Voxtral TTS pricing ($0.016 per 1000 characters of generated audio) — reported by DataCamp article, not mistral.ai directly. If Phase 2 pricing-table needs Voxtral TTS (the project currently uses Voxtral for voice cloning + TTS via `/api/tts/voxtral`), verify before shipping.

## Initial `src/lib/pricing.ts` Table Values (D-08)

Sourced 2026-04-21. Each entry's `verified` date should be stamped into the table. Shannon reviews before merge.

| Model ID (app-internal) | Unit | USD per unit (or per 1M) | Source | Verified | Notes |
|-------------------------|------|---------------------------|--------|----------|-------|
| `gemini-3.1-flash-tts-preview` | output-audio-token | $20 / 1M | [ai.google.dev/gemini-api/docs/pricing](https://ai.google.dev/gemini-api/docs/pricing) | 2026-04-21 | Also $1 / 1M input-text tokens. 25 audio-tokens/sec — multiply output seconds × 25 × $20e-6. Preview: free tier exists, paid past quota. |
| `gemini-2.5-flash-preview-tts` | output-audio-token | $10 / 1M | same | 2026-04-21 | + $0.50 / 1M input-text tokens |
| `gemini-2.5-pro-preview-tts` | output-audio-token | $20 / 1M | same | 2026-04-21 | + $1 / 1M input-text tokens. No listed free tier for pro preview. |
| `groq-whisper-large-v3` | minute-audio | $0.111 / hour = **$0.00185 / min** | [groq.com/pricing](https://groq.com/pricing/) | 2026-04-21 | **Minimum 10 seconds per request billed** — very short ritual lines ("So mote it be") still billed as 10s. |
| `groq-llama-3.3-70b-versatile` | input-token | $0.59 / 1M | same | 2026-04-21 | Primary feedback model per `rehearsal-feedback/route.ts:42` |
| `groq-llama-3.3-70b-versatile` | output-token | $0.79 / 1M | same | 2026-04-21 | |
| `mistral-small-latest` | input-token | $0.20 / 1M | [costbench.com — aggregator; verify at console.mistral.ai](https://costbench.com/software/llm-api-providers/mistral-ai/) | 2026-04-21 | **LOW confidence** — Shannon cross-verify before merge |
| `mistral-small-latest` | output-token | $0.60 / 1M | same | 2026-04-21 | Same caveat |
| `mistral-voxtral-mini-transcribe-v2` | minute-audio | $0.003 / min | [mistral.ai/news/voxtral-transcribe-2](https://mistral.ai/news/voxtral-transcribe-2) | 2026-04-21 | If/when Voxtral is used for STT |
| `mistral-voxtral-tts` | character | ~$0.016 / 1000 chars | [datacamp.com voxtral TTS guide](https://www.datacamp.com/blog/voxtral-tts) | 2026-04-21 | **LOW confidence** — secondary source; verify before merge. Used by `/api/tts/voxtral`. |
| `elevenlabs` | character | $0.12 / 1000 chars (multilingual v2/v3 PAYG API) | [elevenlabs.io/pricing/api](https://elevenlabs.io/pricing/api) | 2026-04-21 | Flash/Turbo models $0.06/1000; the app's default voices likely use multilingual. Verify which model per voice. |
| `google-tts-neural2` | character | $16 / 1M = **$0.016 / 1000 chars** | [cloud.google.com/text-to-speech/pricing](https://cloud.google.com/text-to-speech/pricing) | 2026-04-21 | Free tier: first 1M chars/month. Standard voices: $4/1M chars (free tier 4M/month). |
| `google-tts-chirp3-hd` | character | $30 / 1M | same | 2026-04-21 | Premium tier if used |
| `google-tts-studio` | character | $160 / 1M | same | 2026-04-21 | Emergency-only tier |
| `deepgram-aura-2` | character | $0.030 / 1000 chars = $30 / 1M | [deepgram.com/pricing](https://deepgram.com/pricing) | 2026-04-21 | PAYG rate |
| `deepgram-aura-1` | character | $0.015 / 1000 chars | same | 2026-04-21 | Cheaper fallback |
| `kokoro-*` | self-hosted | $0.00 | (self-host per `src/app/api/tts/kokoro/route.ts`) | 2026-04-21 | Compute cost accrues as Vercel function time, not per-char API cost — track separately as latencyMs only. |

**Pricing-table assumptions** (surface to Shannon for approval):
- All prices are **list / public PAYG**; no volume discounts, no committed-use contracts assumed.
- No per-request overhead added (e.g., minimum audio length, minimum request fee) except Groq Whisper's 10s minimum — that one IS captured in the comment.
- Cached audio playback costs $0 (no API call made). This is implicit — the audit record only emits when the route handler makes the upstream call. Document in `pricing.ts` header.

## Metadata

**Confidence breakdown:**
- Vercel Cron mechanics: HIGH — verified against 3 official Vercel docs pages
- `vercel.ts` vs `vercel.json`: HIGH — official Vercel programmatic-config page read directly; recommendation is `vercel.json` for Phase 2
- jose v6 compatibility: HIGH — v6.0 release notes confirm SignJWT / jwtVerify APIs unchanged
- Resend v6 SDK: HIGH — official docs read; idempotencyKey feature confirmed
- Gemini / Groq / Google TTS / Voxtral Transcribe / Deepgram pricing: HIGH — provider pricing pages or official announcement pages
- Mistral Small pricing: MEDIUM-LOW — aggregator confirmed; provider page didn't render values for WebFetch
- Voxtral TTS pricing: MEDIUM — secondary source (DataCamp guide); verify before ship
- ElevenLabs pricing: MEDIUM — aggregator-confirmed; official pricing API page could be fetched for final numbers
- ESLint `no-restricted-syntax` with proposed selector: MEDIUM-HIGH — selector syntax is standard; exact combinator may need AST-Explorer verification during implementation
- Audit-log aggregation source for cron: MEDIUM — CONTEXT doesn't settle this; see Known Gap + Assumption A3/A6

**Research date:** 2026-04-21
**Valid until:** 2026-05-21 (30 days — stable patterns; pricing table re-verify if not merged by then)
