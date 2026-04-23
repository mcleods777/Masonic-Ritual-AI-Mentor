# Phase 2: Safety Floor - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-21
**Phase:** 02-safety-floor
**Areas discussed:** Budget thresholds + spike-alert semantics, Audit log destination + shape, Client-token architecture, Kill switch UX + fallback content

---

## Gray area selection

| Area | Offered | Selected |
|------|---------|----------|
| Budget thresholds + spike-alert semantics | ☐ | ✓ |
| Audit log destination + shape | ☐ | ✓ |
| Client-token architecture | ☐ | ✓ |
| Kill switch UX + fallback content | ☐ | ✓ |

User selected all four presented areas. Two additional candidates (SAFETY-06 session ceiling, SAFETY-07 wake-lock threshold) were offered at the end under "more gray areas" and declined in favor of Claude's Discretion with documented defaults (200 steps, 30 min inactivity).

---

## Area 1: Budget thresholds + spike-alert semantics (SAFETY-03, SAFETY-04)

### Q1: Per-user hourly cap (aggregate across paid routes)

| Option | Selected |
|--------|----------|
| 60 calls/hr | ✓ |
| 120 calls/hr | |
| 30 calls/hr | |

**Notes:** Covers a dedicated 45-min session; flags loops and stress tests.

### Q2: Per-user daily cap

| Option | Selected |
|--------|----------|
| 300 calls/day | ✓ |
| 500 calls/day | |
| 150 calls/day | |

**Notes:** ~5 rehearsal sessions. Worst-case runaway loop capped at ~$1-3/user/day.

### Q3: SAFETY-04 spike-alert threshold

| Option | Selected |
|--------|----------|
| Absolute: total > $10/day OR any user > $3/day | ✓ |
| Percentile: 3× rolling 7-day median | |
| Both | |

**Notes:** Simple reasoning. No baseline needed. Works on day 1 of pilot.

### Q4: Cron schedule for spike check

| Option | Selected |
|--------|----------|
| Daily at 02:00 UTC | ✓ |
| Every 6 hours | |
| Hourly | |

**Notes:** One email/day max. Late enough to capture full UTC day; early enough for morning review.

---

## Area 2: Audit log destination + shape (SAFETY-01)

### Q1: Destination

| Option | Selected |
|--------|----------|
| Vercel logs only via structured `console.log` | ✓ |
| Vercel logs + in-memory circular buffer | |
| Stream to Vercel Blob | |

**Notes:** Zero new infra. Phase 6 dashboard adds buffer on top of Phase 2's foundation.

### Q2: Cost-estimation method

| Option | Selected |
|--------|----------|
| Per-model lookup table in code | ✓ |
| Vercel Marketplace billing reconciliation | |
| Both | |

**Notes:** `src/lib/pricing.ts` new file. Table maintained manually; drift fixed by edit.

### Q3: Audit record schema

| Option | Selected |
|--------|----------|
| Single TS discriminated union `AuditRecord = TTSRecord \| STTRecord \| FeedbackRecord` | ✓ |
| Flat record with optional route-specific fields | |
| Per-route files with separate emitters | |

**Notes:** Matches typed-event-names-for-pii-safe-telemetry memory skill.

### Q4: PII-safety enforcement

| Option | Selected |
|--------|----------|
| TS union types + ESLint rule | ✓ |
| Runtime redaction helper | |
| Both | |

**Notes:** Compile-time is faster feedback. No silent-drop failure mode.

---

## Area 3: Client-token architecture (SAFETY-05, SAFETY-09)

### Q1: Token claims shape

| Option | Selected |
|--------|----------|
| `{sub: hashedUser, aud: client-token, exp: 1h}` | ✓ |
| Adds email claim | |
| Adds opaque sessionId | |

**Notes:** Minimal. `aud` distinguishes from pilot-session. Stateless aligns with v1 architecture.

### Q2: Issue-endpoint gate

| Option | Selected |
|--------|----------|
| Session JWT cookie + same-origin | ✓ |
| Session JWT cookie only | |
| Session JWT + shared-secret header | |

**Notes:** Same-origin prevents external tools from using leaked cookies.

### Q3: Client refresh strategy

| Option | Selected |
|--------|----------|
| Proactive at 50 min via in-memory timer | ✓ |
| Reactive-only (retry on 401) | |
| Per-request JIT refresh if expiry <5 min | |

**Notes:** No in-flight request 401s from expiry. Reactive 401 retry retained as fallback.

### Q4: Verification point for paid routes

| Option | Selected |
|--------|----------|
| Middleware + route-level (defense in depth) | ✓ |
| Middleware only | |
| Route-only | |

**Notes:** Matches SAFETY-09 explicit wording.

---

## Area 4: Kill switch UX + fallback content (SAFETY-08)

### Q1: Route response when kill switch active

| Option | Selected |
|--------|----------|
| 503 + structured fallback JSON per route | ✓ |
| 200 + static text | |
| Entire app read-only | |

**Notes:** Client-specific fallback per route.

### Q2: User-visible indicator

| Option | Selected |
|--------|----------|
| Persistent banner + contextual inline notes | ✓ |
| Silent degradation | |
| Modal on first degraded response | |

**Notes:** Transparency. Reuse PilotBanner pattern.

### Q3: Env var granularity

| Option | Selected |
|--------|----------|
| Single `RITUAL_EMERGENCY_DISABLE_PAID=true` | ✓ |
| Per-route switches | |
| Master + per-route overrides | |

**Notes:** One big-red-button. Matches SAFETY-08 wording exactly.

### Q4: Client detection method

| Option | Selected |
|--------|----------|
| Per-response 503 + `paid_disabled` | ✓ |
| Dedicated `/api/system/paid-status` probe | |
| Both | |

**Notes:** Simplest. No new endpoint.

---

## Claude's Discretion (deferred to implementation)

- SAFETY-06 session step ceiling default: 200 steps per session
- SAFETY-07 wake-lock inactivity threshold: 30 min
- Exact JSON field ordering in audit records
- ESLint rule message text
- Pricing table initial values (verified from provider docs during execution)
- Banner copy text

## Deferred Ideas

- Upstash/KV swap (SAFETY-v2-01)
- Stateful one-time magic links (SAFETY-v2-02)
- Webhook/Slack spend alerts (SAFETY-v2-03)
- Anomaly alerts (ADMIN-v2-01)
- Grafana/external dashboard (ADMIN-v2-02)
- Per-route kill-switch overrides
- `/api/system/paid-status` probe
- Rolling-median spike alerts
- Runtime PII-redaction helper
- Opaque session IDs in client-token claims
