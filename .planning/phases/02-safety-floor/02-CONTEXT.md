# Phase 2: Safety Floor - Context

**Gathered:** 2026-04-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Three layered defenses so no invited user can produce a surprise AI bill, no runaway loop can run uncapped overnight, and no compromise of the shared-secret header alone is sufficient to reach paid routes. Scope is surgical: per-user rate limits, per-user budget caps, PII-free audit log, short-lived client token, cron-driven spend alerts, session step ceiling, wake-lock auto-release, and an emergency kill switch.

**In scope (SAFETY-01..09):**
- Structured PII-free audit log (SAFETY-01)
- Rate limiter `userKey` parameter extension + application to every paid route (SAFETY-02)
- Per-user hourly + daily budget caps with 429 responses (SAFETY-03)
- Daily spend-spike Resend cron alert (SAFETY-04)
- 1h client-token JWT endpoint + `api-fetch` attach (SAFETY-05)
- Session step ceiling in RehearsalMode + server-side ceiling (SAFETY-06)
- Wake-lock inactivity timeout auto-release (SAFETY-07)
- `RITUAL_EMERGENCY_DISABLE_PAID` kill switch (SAFETY-08)
- Paid-route handlers verify client-token directly, not relying on middleware (SAFETY-09)

**Out of scope (belongs to other phases):**
- Upstash Redis swap for durable rate-limit state — SAFETY-v2-01 (explicit pilot-scale deferral)
- Stateful session revocation list — ADMIN-04 (Phase 6)
- Admin dashboard that surfaces audit log / spend — ADMIN-02 (Phase 6)
- Anomaly alerts ("user X 10× normal") — ADMIN-v2-01 (post-v1)
- Webhook/Slack spend alerts in addition to Resend email — SAFETY-v2-03 (post-v1)
- Rewriting `/api/rehearsal-feedback` for structured output — COACH-02 (Phase 5)

</domain>

<decisions>
## Implementation Decisions

### Budget thresholds + spike-alert semantics (SAFETY-03, SAFETY-04)
- **D-01:** Per-user **hourly cap**: **60 calls/hr** aggregate across `/api/tts/*`, `/api/transcribe`, `/api/rehearsal-feedback`. A serious rehearsal session hits ~20-30 feedback calls + ~5-10 new TTS calls (rest cached). 60 comfortably covers a dedicated 45-min session; anything above is a loop or stress test.
- **D-02:** Per-user **daily cap**: **300 calls/day** aggregate across the same routes. Equivalent to 5 full rehearsal sessions. Caps worst-case runaway loop at ~$1-3/user/day depending on route mix.
- **D-03:** Rate-limit key scheme (per SAFETY-02): `userKey = sha256(email).slice(0, 16)`. Fallback to IP (existing `getClientIp`) when session is absent. Buckets namespaced per time window: `paid:hour:${userKey}` + `paid:day:${userKey}`. Route handlers additionally keep per-route buckets for per-endpoint throttling if the aggregate is healthy but one route is misbehaving (`tts:hour:${userKey}` etc.) — these are belt-and-suspenders, loose limits (e.g., 100/hr per route).
- **D-04:** Spike-alert trigger (SAFETY-04): **absolute thresholds** — fires Resend email when (a) total-pilot spend > **$10/day** OR (b) any single hashed-user > **$3/day**. No rolling median, no percentile math. Simple reasoning, no baseline needed, works on day 1.
- **D-05:** Cron schedule: **daily at 02:00 UTC** via Vercel cron (`vercel.ts` crons block, or `vercel.json` crons field if not yet migrated). One email/day max. Early enough that the previous UTC day's data is complete; late enough Shannon sees it with morning coffee.
- **D-06:** Alert email contents: aggregate totals per route + top 5 spenders (by hashedUser) + per-user totals. Shannon can reverse-lookup via the local hashedUser → email CLI from memory skill `hashed-user-id-analytics-with-operator-runbook`.

### Audit log destination + shape (SAFETY-01)
- **D-07:** Destination: **Vercel logs only via structured `console.log`**. `src/lib/audit-log.ts` exports `emit(record: AuditRecord): void` that `JSON.stringify`s the record and calls `console.log('[AUDIT]', jsonStr)`. Vercel captures it; retention per plan. Zero new infrastructure. Phase 6 ADMIN-02 dashboard can tail via Vercel Log Drain API or add its own in-memory buffer on top — Phase 2 does NOT build that buffer.
- **D-08:** Cost estimation: **per-model lookup table in `src/lib/pricing.ts`**. Maps model-id → unit price (e.g., `gemini-3.1-flash-tts-preview: $X/sec`, `groq-whisper: $Y/min`, `mistral-small-latest: $Z/1K tokens`). Multiplied by measured dimension at log-emit time. Table includes a `lastUpdated` timestamp per entry and a source URL; drifts are fixed by editing the table (no external billing API dependency). Initial values from each provider's current published pricing (verify during execution).
- **D-09:** Audit record schema — **single TypeScript discriminated union** `AuditRecord = TTSRecord | STTRecord | FeedbackRecord`. Each carries the PII-free common shape: `{timestamp, hashedUser, route, promptHash, completionHash, estimatedCostUSD, latencyMs}`. Route-specific extras per union member: TTS adds `{model, voice, charCount}`; STT adds `{model, durationMs, audioByteCount}`; Feedback adds `{variantId, promptTokens, completionTokens}`. Hashes are `sha256` hex; `promptHash` = hash of the request payload, `completionHash` = hash of the response payload — both computed but the bodies themselves never touch `emit()`.
- **D-10:** PII-safety enforcement: **compile-time via TypeScript union types + ESLint rule** banning `prompt`/`completion`/`email`/`text`/`body` keys inside `AuditRecord` shape. Custom ESLint rule (or `no-restricted-syntax` with a targeted matcher) warns on any object literal passed to `emit()` that has a banned key. No runtime redactor — catching PII at build time is faster feedback and avoids the "it got silently dropped" failure mode. Matches memory skill `typed-event-names-for-pii-safe-telemetry`.

### Client-token architecture (SAFETY-05, SAFETY-09)
- **D-11:** Token shape: **`{sub: hashedUser, aud: 'client-token', exp: 1h, iat, iss: 'masonic-ritual-mentor'}`**. Signed with existing `JWT_SECRET` via jose HS256 (reuses `src/lib/auth.ts` infrastructure). `aud = 'client-token'` distinguishes from the existing `pilot-session` audience so a stolen session cookie cannot be replayed as a client-token (and vice versa).
- **D-12:** Endpoint: **`POST /api/auth/client-token`**. Gate: must present a valid `pilot-session` cookie (existing magic-link flow authenticates the user) AND be same-origin (check `Origin` header against the existing `ALLOWED_ORIGIN_SUFFIXES` list in middleware; reject otherwise). Returns `{token, expiresIn: 3600}` JSON.
- **D-13:** Client refresh strategy: **proactive at 50 min via in-memory timer in `src/lib/api-fetch.ts`**. On first `fetchApi` call in a session, fetch the token; schedule `setTimeout(refresh, 50*60*1000)`. On refresh, the timer re-fires. Fallback: if a request 401s with `error: 'client_token_expired'`, invalidate in-memory token, fetch a new one, retry the original request exactly once. Timer is reset if the tab backgrounds for >60min via `visibilitychange` listener (known pattern in this codebase — `screen-wake-lock.ts` has a similar listener).
- **D-14:** Verification point — **defense in depth per SAFETY-09**. Middleware verifies shared-secret header + client-token JWT on `/api/*` (except `/api/auth/*`). Each paid-route handler (`/api/tts/*`, `/api/transcribe`, `/api/rehearsal-feedback`) additionally calls `requireClientToken(request)` helper at the top — decodes + verifies the token, returns `401 { error: 'client_token_invalid' }` directly if verification fails. Middleware is the perimeter; route-level is the last line. A future Next.js quirk that skips middleware cannot bypass paid-route auth.
- **D-15:** `src/lib/api-fetch.ts` attaches BOTH headers on every call: `X-Client-Secret` (existing shared-secret) AND `Authorization: Bearer <client-token>`. Initial bootstrap: on first call, if the client has no token yet, fetches one via `/api/auth/client-token` using cookie-auth (no client-secret yet, no Authorization yet — but the endpoint's allowlist is `/api/auth/*` for shared-secret skip, same pattern as magic-link). After bootstrap, both headers attached to every subsequent call.

### Kill switch UX + fallback content (SAFETY-08)
- **D-16:** Env-var scope: **single `RITUAL_EMERGENCY_DISABLE_PAID=true`** env var flips the whole paid surface. One flip, one redeploy, everything quiet. Shannon does not have to diagnose which provider is burning money before cutting — everything off, figure out the cause after.
- **D-17:** Route-level response when enabled: **503 + structured fallback JSON per route**:
  - `/api/tts/*`: `{error: 'paid_disabled', fallback: 'pre-baked'}` — client checks `MRAMLine.audio` (embedded base64 Opus) and plays that instead. Live-TTS lines fall through to browser TTS if no embedded audio.
  - `/api/transcribe`: `{error: 'paid_disabled'}` — client disables STT input, switches rehearsal into listen-only mode, shows contextual inline note.
  - `/api/rehearsal-feedback`: `{error: 'paid_disabled', feedback: 'diff-only'}` — client renders word-level diff without LLM commentary; inline note "Feedback temporarily paused; scoring shows word-diff only."
- **D-18:** User-visible indicator: **persistent top-of-app banner** using the existing `PilotBanner.tsx` pattern. Text: "Degraded mode — live AI paused. Using pre-baked audio and word-diff scoring." Appears when the client detects its first `503 + paid_disabled` response; persists for the session. Contextual inline notes in Rehearsal mode and Listen mode provide mode-specific context. Dismissable for the session but reappears on any subsequent `paid_disabled` response.
- **D-19:** Detection method: **per-response** — no dedicated health endpoint. Client flips its own `degradedMode` state on first `503 + error: 'paid_disabled'` response; shows banner. Handles mid-session toggle naturally (next request discovers the new state). No extra infra, no polling.
- **D-20:** Kill-switch runbook: add a new entry to `docs/runbooks/SECRET-ROTATION.md`'s "See also" section pointing to a new (short) `docs/runbooks/KILL-SWITCH.md`. This new runbook documents: set env var via `vercel env update RITUAL_EMERGENCY_DISABLE_PAID production --value true --yes`, redeploy, verify by curling any paid route, flip back when done. Same folder convention as HYGIENE-07.

### Remaining SAFETY-06 + SAFETY-07 (Claude's Discretion)
- **SAFETY-06 session step ceiling:** `RehearsalMode.tsx` currently has no hard cap on auto-advance loops. Claude's Discretion on exact ceiling value (default to 200 steps per session, which exceeds the longest baked ritual's line count of ~160 by a safety margin) and ceiling scope (reset on explicit user "next section" navigation; persists across a single rehearsal's auto-advance chain). Server-side belt-and-suspenders: `/api/rehearsal-feedback` tracks an in-memory counter per hashed-user per 5-minute window; returns 429 after 300 calls in that window.
- **SAFETY-07 wake-lock inactivity:** `src/lib/screen-wake-lock.ts` currently has no auto-release. Claude's Discretion: release after **30 min of no user interaction** (keypress, click, touchstart, STT activity). Timeout resets on each event. If released, do NOT auto-reacquire — user must interact to wake. Banner or toast "Screen lock released — tap to resume."

### Branching strategy (orchestration — not a source-code decision)
- **D-21:** Phase 2 lands on a new branch `gsd/phase-2-safety-floor` created from the current `gsd/phase-1-pre-invite-hygiene` tip (NOT from main, since Phase 2 builds on Phase 1's AI SDK bump + middleware test + noindex headers). Phase 1 merges to main independently when Shannon's UAT closes; Phase 2 merges after. If Phase 1 merges first, Phase 2 rebases cleanly. Settled here because Shannon explicitly asked about branching at Phase 1 start; keeping the pattern consistent.

### Claude's Discretion
- Exact JSON shape of the audit record (field ordering, nested vs flat) — Claude chooses during implementation within the D-09 union constraints.
- Exact strings for the ESLint rule message in D-10 ("audit records must not contain request/response bodies").
- `src/lib/pricing.ts` initial price values (D-08) — Claude sources current published prices from each provider's docs during execution; Shannon reviews the initial table before merge.
- SAFETY-06 exact ceiling value (200 is the starting default — Shannon can override via env var).
- SAFETY-07 exact inactivity threshold (30 min is the starting default).
- Banner copy text (D-18) — Claude writes; Shannon reviews during execution.

### Folded Todos
None — no pending todos from prior sessions matched Phase 2 scope.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase definition and requirements
- `.planning/ROADMAP.md` §Phase 2 — phase goal, success criteria (6 items), dependencies (Phase 1)
- `.planning/REQUIREMENTS.md` §Safety — SAFETY-01..09 full requirement text
- `.planning/PROJECT.md` — project vision, v1 invite-only constraint, client-owned data plane invariant, Key Decisions table

### Phase 1 artifacts (closed, locked precedents)
- `.planning/phases/01-pre-invite-hygiene/01-CONTEXT.md` — 21 Phase 1 decisions including commit-convention D-20 (`hygiene-NN: imperative`), test-file-location D-11 (`src/__tests__/`), secret-rotation runbook D-01..D-05b
- `.planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md` — Phase 1 evidence (5/7 ✓ VERIFIED, 2/7 ⏸ DEFERRED for HYGIENE-05/07 UAT)
- `docs/runbooks/SECRET-ROTATION.md` — canonical Vercel-env rotation flow (D-20 in this Phase 2 CONTEXT references it for the new KILL-SWITCH.md runbook)

### Codebase context (read before planning)
- `.planning/codebase/ARCHITECTURE.md` §Middleware, §Security headers, §Rate limiting, §Authentication — current structure of everything Phase 2 extends
- `.planning/codebase/CONVENTIONS.md` — test/commit/file-naming conventions (Phase 2 commit prefix: `safety-NN: imperative` following Phase 1's pattern)

### Files that will be touched in Phase 2
- `src/lib/rate-limit.ts` — adds `userKey` parameter, new keyspace for per-user aggregate + per-route buckets (SAFETY-02)
- `src/lib/audit-log.ts` — NEW file (SAFETY-01)
- `src/lib/pricing.ts` — NEW file (D-08)
- `src/lib/auth.ts` — adds `signClientToken` + `verifyClientToken` (SAFETY-05 extends existing jose HS256 usage)
- `src/lib/api-fetch.ts` — attaches `Authorization: Bearer` in addition to `X-Client-Secret`; proactive refresh timer (D-13, D-15)
- `src/middleware.ts` — verifies client-token on `/api/*` (extends current shared-secret + CORS flow)
- `src/app/api/auth/client-token/route.ts` — NEW endpoint (SAFETY-05)
- `src/app/api/tts/*/route.ts` (7 TTS engine routes) — add `requireClientToken` + rate-limit + audit-log emit + kill-switch check
- `src/app/api/transcribe/route.ts` — same treatment
- `src/app/api/rehearsal-feedback/route.ts` — same treatment (Phase 5 COACH-02 will rewrite the body of this route; Phase 2 adds the perimeter)
- `src/components/RehearsalMode.tsx` — session step ceiling (SAFETY-06)
- `src/lib/screen-wake-lock.ts` — inactivity auto-release (SAFETY-07)
- `src/components/PilotBanner.tsx` (or a new `DegradedModeBanner.tsx`) — kill-switch banner (D-18)
- `vercel.ts` or `vercel.json` — cron entry for SAFETY-04 daily spike check
- `src/app/api/cron/spend-alert/route.ts` — NEW cron target (SAFETY-04)
- `docs/runbooks/KILL-SWITCH.md` — NEW runbook (D-20)
- `next.config.ts` — no changes expected

### External references
- Vercel Cron docs: https://vercel.com/docs/cron-jobs — for `vercel.ts` crons block syntax + authentication header
- Resend SDK (`resend` package, already in devDeps / deps) — for SAFETY-04 email send; existing use in `src/app/api/auth/magic-link/request/route.ts`
- jose library (`jose`, already in deps) — for SAFETY-05 JWT sign/verify; existing use in `src/lib/auth.ts`
- Vercel Log Drain API (future — Phase 6 concern): https://vercel.com/docs/log-drains

### Existing memory / skills relevant to Phase 2
- `hashed-user-id-analytics-with-operator-runbook` — hashedUser pattern + reverse-lookup CLI (D-03, D-06 build on this directly)
- `typed-event-names-for-pii-safe-telemetry` — TS union + ESLint pattern for compile-time PII prevention (D-09, D-10 build on this directly)
- `llm-api-cost-amp-shared-secret-protection` — prior CSO finding that drove SAFETY-05's existence (client-token prevents a leaked shared-secret from being the only thing standing between an attacker and paid routes)
- `flask-csrf-test-mode-toggle` — precedent for middleware/test interactions (not directly applicable but tonally useful for D-14 defense-in-depth)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/rate-limit.ts:27-68` — `rateLimit(key, limit, windowMs)` is already a sliding-window limiter. SAFETY-02 extends, not replaces: same signature, different callers (now passing `userKey` + per-route + per-window keys).
- `src/lib/rate-limit.ts:75-93` — `getClientIp(request)` is the IP-fallback source. Keep; used when session is absent.
- `src/lib/auth.ts:31-38` — `getSecret()` loads JWT_SECRET with length check. Reused for client-token signing.
- `src/lib/auth.ts:70-79` + `103-112` — `signMagicLinkToken` / `signSessionToken` — template for `signClientToken` (same pattern, different `aud`).
- `src/lib/auth.ts:87-101` + `119-134` — `verifyMagicLinkToken` / `verifySessionToken` — template for `verifyClientToken`. Same return-null-on-any-failure pattern.
- `src/middleware.ts:13-31` — `ALLOWED_ORIGIN_SUFFIXES` + `isAllowedOrigin` — reused by D-12 same-origin check on `/api/auth/client-token`.
- `src/app/api/auth/magic-link/request/route.ts:93-110` — existing pattern for applying `rateLimit` + `getClientIp` inside a route handler. Phase 2 replicates this shape in every paid route.
- `src/components/PilotBanner.tsx` — existing banner component. Reuse or extend for degraded-mode banner (D-18).
- `src/lib/screen-wake-lock.ts` — existing wake-lock module with `visibilitychange` listener pattern. SAFETY-07 extends the event set (add inactivity timer reset on user interaction).

### Established Patterns
- **JWT signing + verification in `src/lib/auth.ts`:** jose HS256, `iss: masonic-ritual-mentor`, audience-scoped, expiration via TTL constant. Client-token follows verbatim.
- **Rate-limit callsite pattern:** `const ip = getClientIp(req); const check = rateLimit(\`ns:${scope}:${key}\`, LIMIT, WINDOW_MS); if (!check.allowed) return 429`. Replicate in every paid route.
- **Middleware gate pattern:** shared-secret check skips `/api/auth/*`. Same carve-out for client-token — but `/api/auth/client-token` is same-origin-only, cookie-gated, doesn't need shared-secret. Middleware gets a narrow exception for this endpoint.
- **`PILOT_PUBLIC_PATHS` in `src/middleware.ts:40-45`:** extend with `/api/auth/client-token` IF client-token issuance happens before shared-secret attachment — but D-15 says bootstrap uses the existing `/api/auth/*` allowlist, so no middleware edit needed.
- **Commit convention (from Phase 1 D-20):** `safety-NN: imperative lowercase` per task. One commit per SAFETY-XX where practical. For commits that span multiple SAFETY items (e.g., one shared infrastructure commit that lands D-07 audit-log + D-08 pricing + D-10 ESLint rule), use `safety-infra: ...` prefix.
- **Test convention (from Phase 1 D-11):** tests in `src/**/__tests__/<name>.test.ts`. SAFETY-02 rate-limit userKey tests extend existing `src/lib/__tests__/rate-limit.test.ts` if it exists (CHECK during planning) or create it.

### Integration Points
- **`src/lib/api-fetch.ts`** is the single chokepoint for client → server calls. All paid-route client calls flow through `fetchApi`. D-13 (proactive refresh) + D-15 (attach both headers) land here.
- **`src/middleware.ts`** is the single chokepoint for server-side perimeter checks. D-14 extends the existing auth ladder.
- **`src/lib/auth.ts`** is the single JWT-signing module. D-11 adds one more audience with almost-identical helpers.
- **`RehearsalMode.tsx`** is 1,511 lines (per project memory `counselor-system-architecture` — this project has a similar large component). SAFETY-06 adds a step counter + ceiling check; do not restructure. Phase 5 COACH-11 will split this file — keep SAFETY-06 changes minimal so they survive the split.

### Constraints Discovered
- Current `/api/tts/*` routes do NOT call `rateLimit` — only `/api/auth/magic-link/request` does. SAFETY-02 is the first time paid routes get rate-limited. Plan accordingly: each paid route needs the callsite addition.
- `src/lib/rate-limit.ts:52` — the Map-size cap is 5000 entries. Per-user + per-window + per-route keyspace is bounded (≤10 lodges × ≤3 officers × 2 windows × 4 route-namespaces ≈ 240 entries max). The 5000 cap is more than sufficient.
- Vercel Fluid Compute reuses instances (per knowledge-update: "Fluid Compute reuses function instances across concurrent requests"). In-memory rate limit + audit log buffer is coherent across concurrent requests on the same instance; coldstart resets to empty. This is accepted pilot-scale behavior.
- The existing shared-secret header `X-Client-Secret` is named for the CLIENT-side secret; SAFETY-05's client-token header is `Authorization: Bearer`. These two headers do different things and coexist. Naming collision risk is low but document clearly in `src/lib/api-fetch.ts`.

</code_context>

<specifics>
## Specific Ideas

- **Pricing table sourcing (D-08):** use provider docs as source-of-truth, not historical Vercel invoices. Include a comment in `src/lib/pricing.ts` pointing to the upstream URL per model and the date last verified. Shannon reviews before merge.
- **Hashed-user reverse lookup (D-06):** when Shannon reads a spike alert email, he needs to match `hashedUser = 4f2a8c...` back to a real email to know which lodge to contact. The memory skill `hashed-user-id-analytics-with-operator-runbook` describes the local CLI for this. Phase 2 should reuse that CLI, not invent a new one. Add a note in the alert email body: "Use `scripts/lookup-hashed-user.ts <hash>` locally to reverse-resolve."
- **Banner copy (D-18):** soft, not alarming. "Live AI is paused — using pre-baked audio and word-diff scoring. Contact Shannon for questions." — no "ERROR" or "DOWN" language that would make an invited Past Master think the app is broken.
- **Cron authentication (SAFETY-04):** Vercel cron requests carry a shared bearer token (`CRON_SECRET`). Verify it in `/api/cron/spend-alert/route.ts` so a public GET to that URL cannot trigger the email. Document in `docs/runbooks/KILL-SWITCH.md` alongside the kill switch.
- **Kill-switch verify step in runbook:** after flipping the env var, the runbook says "curl `/api/tts/gemini` with a minimal body, expect 503 + `paid_disabled`" so Shannon confirms the switch actually took effect before the next incident.

</specifics>

<deferred>
## Deferred Ideas

- **Durable rate-limit state** (SAFETY-v2-01) — Upstash Redis or Vercel KV keyed swap. Trigger: >30 pilot users OR stateful sessions (ADMIN-04) land.
- **Stateful one-time magic links** (SAFETY-v2-02) — paired with SAFETY-v2-01 durable store; replaces current stateless magic-link flow.
- **Webhook / Slack spend-alert destination** (SAFETY-v2-03) — in addition to Resend email. Deferred; Resend email suffices for pilot.
- **Per-user prompt-adaptation telemetry** — Phase 5 COACH-v2-02; not relevant to Phase 2.
- **Anomaly alerts** ("user X 10× normal") — ADMIN-v2-01, needs rolling history. Phase 2 uses absolute thresholds only.
- **Grafana / external dashboard export** — ADMIN-v2-02. Phase 2 emits to Vercel logs; no external ingest.
- **Per-route kill-switch overrides** — floated but rejected (D-16). Single switch is simpler; per-route surface can land later if a specific incident demands it.
- **Dedicated `/api/system/paid-status` health probe** — floated but rejected (D-19). Per-response 503 detection is sufficient for pilot.
- **Rolling-median spike alert** — floated but rejected (D-04). Absolute thresholds chosen for simplicity; revisit if false-positive email volume becomes an issue.
- **Runtime PII-redaction helper** on audit records — floated but rejected (D-10). Compile-time type guards are faster feedback. Revisit only if we find a real PII leak that slipped past types.
- **Opaque session IDs inside client-token claims** — floated but rejected (D-11). Stateful session IDs belong in ADMIN-04 (Phase 6) alongside the stateful revocation list. Phase 2 keeps stateless claims.

### Reviewed Todos (not folded)
None — no pending todos were relevant to this phase.

</deferred>

---

*Phase: 02-safety-floor*
*Context gathered: 2026-04-21*
