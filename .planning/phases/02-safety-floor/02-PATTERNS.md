# Phase 2: Safety Floor - Pattern Map

**Mapped:** 2026-04-21
**Files analyzed:** 19 (10 new, 9 modified) + 1 consolidation helper recommendation
**Analogs found:** 19/19 (100% — every file has a strong existing analog in-repo)

---

## File Classification

| File | New/Modified | Role | Data Flow | Closest Analog | Match Quality |
|------|--------------|------|-----------|----------------|---------------|
| `src/lib/audit-log.ts` | NEW | utility (pure-function library) | one-way write (JSON → stdout → Vercel logs); optional side-effect into spend-tally | `src/lib/rate-limit.ts` | exact (single-export function, module-level Map/state, cold-start caveat in header) |
| `src/lib/pricing.ts` | NEW | constants module | read-only lookup | `src/lib/styles.ts` | exact (single-source-of-truth constant + thin helpers; `STYLE_TAG_PATTERN` + `isValidStyleTag` = `PRICING_TABLE` + `estimateCost`) |
| `src/lib/spend-tally.ts` | NEW | utility (in-memory day counter) | synchronous increment; periodic read-and-clear | `src/lib/rate-limit.ts` | exact (same in-memory Map model + eviction + cold-start caveat + `__resetSpendTallyForTests`) |
| `src/lib/paid-route-guard.ts` | NEW (recommended) | helper (route-level guard consolidation) | request-response | 7 TTS routes + transcribe + rehearsal-feedback share structural opening | role-match — see "Consolidation Analysis" section below |
| `src/app/api/auth/client-token/route.ts` | NEW | API route handler (POST) | request → verify cookie → sign JWT → response | `src/app/api/auth/magic-link/verify/route.ts` + `src/app/api/auth/magic-link/request/route.ts` | exact (verify route = cookie→JWT issuance; request route = rate-limit + error shape) |
| `src/app/api/cron/spend-alert/route.ts` | NEW | API route handler (GET, cron) | request → auth header check → read spend-tally → send Resend email | `src/app/api/auth/magic-link/request/route.ts` (Resend send pattern) + RESEARCH canonical Vercel GET | role-match for Resend; canonical Vercel shape for GET+bearer |
| `scripts/lookup-hashed-user.ts` | NEW | CLI script | read env → hash + compare → print | `scripts/rotate-mram-passphrase.ts` (header + shebang + arg parsing) | partial — rotate-mram is much more complex; simpler `scripts/validate-rituals.ts` is the size match. Best: combine both for shape. |
| `docs/runbooks/KILL-SWITCH.md` | NEW | operational runbook | human procedure | `docs/runbooks/SECRET-ROTATION.md` | exact (sibling runbook in same folder; same structure enforced by Phase 1 D-20) |
| `vercel.json` | NEW | build config | Vercel reads at deploy time | n/a — new file at repo root; RESEARCH Pattern 1 is canonical | n/a |
| `src/components/DegradedModeBanner.tsx` | NEW | React component | server-or-client banner | `src/components/PilotBanner.tsx` | exact (same "conditional fixed-top banner" shape; just swap env-var check for state prop) |
| `src/lib/__tests__/audit-log.test.ts` | NEW | unit test | pure-function + console.log spy | `src/lib/__tests__/api-fetch.test.ts` | role-match (only existing test that spies on a global; here we spy on `console.log`) |
| `src/lib/__tests__/pricing.test.ts` | NEW | unit test | pure-function assertions | `src/lib/__tests__/rehearsal-decision.test.ts` | exact (pure pricing math, no mocks) |
| `src/lib/__tests__/client-token.test.ts` | NEW | unit test | JWT sign/verify round-trip | `src/lib/__tests__/auth.test.ts` | exact (cross-audience rejection test already in auth.test.ts lines 149-153 + 177-181 — copy verbatim pattern) |
| `src/lib/__tests__/spend-tally.test.ts` | NEW | unit test | in-memory counter | `src/lib/__tests__/rehearsal-decision.test.ts` | exact (pure function; reset-between-tests via exported `__resetSpendTallyForTests`) |
| `src/lib/__tests__/screen-wake-lock.test.ts` | NEW | unit test | fake timers + mocked navigator.wakeLock | `src/lib/__tests__/api-fetch.test.ts` | role-match (module-scope global replacement; fake timers not yet used in repo — will be a first) |
| `src/lib/__tests__/rate-limit.test.ts` | NEW (not present yet) | unit test | pure-function + `__resetRateLimitForTests` | `src/lib/__tests__/rehearsal-decision.test.ts` | exact |
| `src/lib/__tests__/fixtures/banned-emit.ts` | NEW | ESLint fixture | deliberately-failing source | n/a — no existing fixture pattern in repo | bare (see RESEARCH Pattern 3 inline) |
| `src/app/api/cron/spend-alert/__tests__/auth.test.ts` + `alert.test.ts` | NEW | route unit test | POST invocation + mocked Resend | `src/app/api/auth/magic-link/request/__tests__/route.test.ts` (per CONVENTIONS; verify exists) | partial — listed in STRUCTURE.md but not present in search; must verify during execution |
| `src/app/api/auth/client-token/__tests__/route.test.ts` | NEW | route unit test | POST invocation with cookie | same as above | partial |
| `src/app/api/tts/gemini/__tests__/` (and 6 others + transcribe + rehearsal-feedback) | NEW dirs | route unit tests | POST invocation with mocked upstream fetch | same as above | partial |
| `src/components/__tests__/rehearsal-mode-ceiling.test.tsx` | NEW | component unit test (jsdom) | fake timers + setState | `src/components/__tests__/silent-preload.test.tsx` | exact |
| `src/components/__tests__/DegradedModeBanner.test.tsx` | NEW | component unit test (jsdom) | render-with-prop | `src/components/__tests__/silent-preload.test.tsx` | role-match |
| `src/lib/rate-limit.ts` | MOD | — | — | self | extend in place (no rewrite) |
| `src/lib/auth.ts` | MOD | — | — | self — follow `signSessionToken` / `verifySessionToken` shape verbatim | extend in place |
| `src/lib/api-fetch.ts` | MOD | — | — | self — existing `withSecret(init)` wrapper | extend in place |
| `src/middleware.ts` | MOD | — | — | self — existing auth ladder | extend in place |
| `src/app/api/tts/*/route.ts` (7 routes) | MOD | — | — | each other — consolidate via `paid-route-guard.ts` | extend in place + factor |
| `src/app/api/transcribe/route.ts` | MOD | — | — | same pattern as TTS routes | extend in place |
| `src/app/api/rehearsal-feedback/route.ts` | MOD | — | — | same pattern | extend in place (Phase 5 will rewrite body) |
| `src/components/RehearsalMode.tsx` | MOD | — | — | self — surgical edit | extend in place (1,511 lines; DO NOT restructure) |
| `src/lib/screen-wake-lock.ts` | MOD | — | — | self — existing `visibilitychange` listener is the template | extend in place |

---

## Consolidation Analysis — `src/lib/paid-route-guard.ts`

**Decision: YES, extract a shared helper.** I read 5 of the 7 paid-route handlers end-to-end (gemini, elevenlabs, google, deepgram, kokoro, voxtral + transcribe + rehearsal-feedback). All share this *exact* opening structure before upstream-specific logic begins:

```typescript
// Every existing paid-route handler opens with:
// 1. apiKey/provider check (→ 500)
// 2. try { body = await request.json() } catch (→ 400)  — or formData in transcribe
// 3. required-field check (→ 400)
// 4. 2000-char cap on `text` (→ 413)        [6 of 7 TTS routes + rehearsal-feedback]
//                                            [transcribe has a 1MB audio cap instead]
```

Phase 2 adds **4 new preconditions** to every paid route (SAFETY-02/03/05/08/09):

```typescript
// NEW Phase 2 additions, same order in every route:
// 0a. RITUAL_EMERGENCY_DISABLE_PAID check (→ 503 structured body per D-17)
// 0b. requireClientToken(request) (→ 401 client_token_invalid)
// 0c. rateLimit('paid:hour:${userKey}', 60, 3_600_000)  (→ 429)
// 0d. rateLimit('paid:day:${userKey}', 300, 86_400_000) (→ 429)
// 0e. rateLimit('tts:hour:${userKey}' or 'transcribe:hour:...', 100, 3_600_000) (belt-&-suspenders)
// [then the existing 1-4 opening above, then the upstream call, then emit() on success]
```

If each of the 9 paid routes (7 TTS + transcribe + rehearsal-feedback) inlines all four new checks individually, we ship ~50 lines of boilerplate × 9 = ~450 lines of near-identical copy-paste. A code reviewer would (rightly) flag this.

**Recommended helper:** `src/lib/paid-route-guard.ts` exporting a single function:

```typescript
// Returns a NextResponse to short-circuit on, or null if the route should proceed.
// The returned `context` carries the hashedUser (needed for audit emit) so the
// route doesn't re-derive it.
export async function requirePaidRouteGuards(
  request: NextRequest,
  opts: { routeName: "tts:gemini" | "tts:elevenlabs" | ... | "transcribe" | "feedback" }
): Promise<
  | { kind: "deny"; response: NextResponse }
  | { kind: "allow"; hashedUser: string }
>
```

Each route becomes a 3-line prefix:

```typescript
const guard = await requirePaidRouteGuards(request, { routeName: "tts:gemini" });
if (guard.kind === "deny") return guard.response;
const { hashedUser } = guard;
// ... existing route logic ...
// ... emit({ kind: "tts", hashedUser, ... }) on success ...
```

**Analog for the helper itself:** `src/app/api/author/_guard.ts` (mentioned in STRUCTURE.md) — a co-located route-guard helper with `_` prefix convention. Since `paid-route-guard` is imported from 9 places, it belongs in `src/lib/` not colocated with one route. Use `src/lib/rate-limit.ts` header-comment style + `getClientIp` export-shape as the module template.

**Caveat:** CONTEXT.md does not mandate this helper. If the planner considers it scope creep, inlining is acceptable and the `it-just-works` shape is identical — the planner chooses. I am flagging it because the research agent's RESEARCH.md "Known Gap" and the 7-route mechanical repetition in CONTEXT both imply it. See `## Suggestions (out of scope)` at end.

---

## Pattern Assignments

### 1. `src/lib/audit-log.ts` (NEW, utility)

**Analog:** `/home/mcleods777/Masonic-Ritual-AI-Mentor/src/lib/rate-limit.ts`

**Why this analog:** Pure-function module with:
- JSDoc header explaining pilot-scale pragmatism + cold-start caveat (rate-limit.ts lines 1-15)
- Single primary exported function + test-only reset helper (`__resetRateLimitForTests`)
- Module-level state (`const buckets = new Map()`)
- Types exported alongside the functions (`RateLimitResult`)

The ESLint `no-restricted-syntax` rule in `eslint.config.mjs` enforces the PII-key ban (per D-10 + RESEARCH Pattern 3). `emit()` itself is the world's simplest `console.log` wrapper — the complexity is in the `AuditRecord` discriminated union shape (already laid out verbatim in RESEARCH.md Code Examples lines 457-502).

**Header comment pattern** (rate-limit.ts lines 1-15):
```typescript
/**
 * In-memory sliding-window rate limiter.
 *
 * Pilot-scale pragmatism: the app runs on Vercel Fluid Compute, which
 * reuses function instances across concurrent requests, so an in-memory
 * Map survives long enough to meaningfully throttle an attacker hammering
 * a single endpoint. At our scale (a handful of pilot users) this is
 * sufficient to stop accidental misuse and casual abuse.
 *
 * Known limitation: cold-start spawns a new process with an empty map,
 * so a distributed attacker could reset quotas by forcing cold starts.
 * If we outgrow pilot, swap the `hits` Map for Upstash Redis keyed by
 * `${namespace}:${key}` with a TTL of windowMs. The call sites don't
 * need to change.
 */
```

Copy shape for `audit-log.ts`: explain (a) why `console.log` is the destination (Vercel captures stdout; Phase 6 ADMIN-02 adds Log Drain API), (b) the PII invariant (TS union + ESLint rule defense-in-depth), (c) that `emit()` is intentionally synchronous (no await = no silent drop on unhandled rejection — see RESEARCH Anti-Patterns).

**Export shape** (rate-limit.ts lines 21-25, 27-59, 70-73):
```typescript
export interface RateLimitResult { allowed: boolean; remaining: number; retryAfterSeconds: number; }

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult { /* ... */ }

/** Test-only: wipe all buckets between test cases. */
export function __resetRateLimitForTests(): void { buckets.clear(); }
```

For audit-log.ts: export `AuditRecord`, `TTSRecord`, `STTRecord`, `FeedbackRecord` types + `emit(record: AuditRecord): void` + (D-06b) call into `incrementSpendTally(hashedUser, estimatedCostUSD)` from `spend-tally.ts`.

**Side-effect call to spend-tally (D-06b):**
```typescript
// Inside emit(), after the console.log:
// incrementSpendTally(record.hashedUser, record.estimatedCostUSD);
```
Synchronous; same no-await discipline as the console.log itself.

---

### 2. `src/lib/pricing.ts` (NEW, constants module)

**Analog:** `/home/mcleods777/Masonic-Ritual-AI-Mentor/src/lib/styles.ts`

**Why this analog:** styles.ts exports `STYLE_TAG_PATTERN` (a single constant) + `isValidStyleTag` (a thin helper) + `RITUAL_STYLE_WHITELIST` (a readonly tuple) with a long JSDoc justification. Pricing.ts is the same shape: a `PRICING_TABLE` constant, an `estimateCost` helper, and a typed `PricingEntry` union. The `default-voices.ts` shape (inline literal array with inline comments per entry) is the pattern for how to encode per-model metadata.

**Constant-export pattern** (styles.ts lines 23-36):
```typescript
/**
 * Single source of truth for style tag validation. Import this in any
 * author code path that saves a style, and in the dialogue-to-mram
 * ingestion path that reads `{ritual}-styles.json`.
 * ...
 */
export const STYLE_TAG_PATTERN = /^[a-z][a-z ,'-]{0,79}$/;
```

Copy shape for pricing.ts: JSDoc header explaining (a) source-of-truth (provider docs, NOT Vercel invoices), (b) `lastVerified` date stamp per entry, (c) cached-audio is $0 (no emit fires), (d) D-06d Mistral + Voxtral LOW confidence marker, (e) pricing-table is server-only (never imported client-side per RESEARCH Architectural Responsibility Map).

**Per-entry pattern** (from RESEARCH Pitfall 6 + default-voices.ts shape):
```typescript
type PricingEntry =
  | { kind: "per-input-token" | "per-output-token"; usdPerMillion: number; sourceUrl: string; verified: string; notes?: string }
  | { kind: "per-character"; usdPerMillionChars: number; sourceUrl: string; verified: string; notes?: string }
  | { kind: "per-audio-minute"; usdPerMinute: number; sourceUrl: string; verified: string; notes?: string }
  | { kind: "per-audio-token"; usdPerMillion: number; audioTokensPerSec: number; sourceUrl: string; verified: string; notes?: string }
  | { kind: "self-hosted"; usdPerUnit: 0; sourceUrl: string; verified: string; notes?: string };

const PRICING_TABLE: Record<string, PricingEntry> = {
  "gemini-3.1-flash-tts-preview": {
    kind: "per-audio-token",
    usdPerMillion: 20,
    audioTokensPerSec: 25,
    sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing",
    verified: "2026-04-21",
    notes: "+$1/1M input-text tokens. Preview free tier exists; past quota is paid.",
  },
  // ... all 17 rows per RESEARCH §Initial src/lib/pricing.ts Table Values ...
};
```

**Helper export pattern** (styles.ts lines 42-44):
```typescript
export function isValidStyleTag(tag: unknown): tag is string {
  return typeof tag === "string" && STYLE_TAG_PATTERN.test(tag);
}
```

Copy shape for pricing.ts: `export function estimateCost(modelId: string, units: number, unitType: ...): number` — returns 0 for unknown models + `console.warn('[PRICING] unknown model:', modelId)` (matches audit-log's log-prefix convention).

---

### 3. `src/lib/spend-tally.ts` (NEW, utility)

**Analog:** `/home/mcleods777/Masonic-Ritual-AI-Mentor/src/lib/rate-limit.ts`

**Why this analog:** Identical shape — an in-memory Map keyed by `${hashedUser}:${utcDate}` (or `aggregate:${utcDate}`) with a synchronous increment function and a read-and-clear function for the cron. Same cold-start caveat, same Vercel Fluid Compute pragmatism, same `__reset...ForTests` convention.

**Module-state + increment pattern** (copied from rate-limit.ts lines 19-25, 32-50):
```typescript
// Key shape: `${hashedUser}:${utcDate}` (per-user) + `aggregate:${utcDate}` (total-pilot)
// Value: cumulative estimatedCostUSD in the UTC day

const tally = new Map<string, number>();

export function incrementSpendTally(hashedUser: string, estimatedCostUSD: number): void {
  if (!Number.isFinite(estimatedCostUSD) || estimatedCostUSD <= 0) return;
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const userKey = `${hashedUser}:${day}`;
  const aggKey = `aggregate:${day}`;
  tally.set(userKey, (tally.get(userKey) ?? 0) + estimatedCostUSD);
  tally.set(aggKey, (tally.get(aggKey) ?? 0) + estimatedCostUSD);
}

/** Cron reads + clears yesterday's bucket. Returns what it read. */
export function readAndClearSpendForDay(utcDate: string): {
  aggregate: number;
  perUser: Array<{ hashedUser: string; total: number }>;
} { /* ... */ }

export function __resetSpendTallyForTests(): void { tally.clear(); }
```

**Header-comment pattern:** same template as rate-limit.ts — pilot-scale, cold-start caveat, "Phase 6 ADMIN-02 Log Drain API replaces this." Add D-06b explicit note: "alert email body documents that totals reflect warm-container data for the UTC day."

---

### 4. `src/lib/paid-route-guard.ts` (NEW — recommended consolidation)

**Analog:** `/home/mcleods777/Masonic-Ritual-AI-Mentor/src/middleware.ts` for the auth-ladder pattern + `src/app/api/author/_guard.ts` for the route-guard naming convention + `src/app/api/auth/magic-link/request/route.ts:93-121` for the concrete `rateLimit` + `NextResponse.json(...{status: 429, headers: {'Retry-After'}})` shape.

**Rate-limit callsite pattern** (magic-link/request/route.ts lines 93-103):
```typescript
const ip = getClientIp(req);
const ipCheck = rateLimit(`magic-link:ip:${ip}`, IP_LIMIT, IP_WINDOW_MS);
if (!ipCheck.allowed) {
  return NextResponse.json(
    { error: "Too many sign-in requests. Please try again later." },
    {
      status: 429,
      headers: { "Retry-After": String(ipCheck.retryAfterSeconds) },
    },
  );
}
```

Copy verbatim into `paid-route-guard.ts`, but with:
- `userKey = sha256(email).slice(0, 16)` derived from session cookie (cookie → `verifySessionToken` → `email` → sha256); fall back to `getClientIp` when cookie absent (per D-03)
- Per-user hour bucket (60, 3_600_000), per-user day bucket (300, 86_400_000), per-route hour bucket (100, 3_600_000)
- Error body shape:
  - 503: `{ error: "paid_disabled", fallback: <per-route-string> }` (per D-17)
  - 401: `{ error: "client_token_invalid" }` (per D-14)
  - 429: `{ error: "rate_limited" }` + `Retry-After` header

**Kill-switch early-exit pattern** (new — no existing analog):
```typescript
if (process.env.RITUAL_EMERGENCY_DISABLE_PAID === "true") {
  const fallback =
    opts.routeName.startsWith("tts:") ? "pre-baked" :
    opts.routeName === "feedback" ? "diff-only" :
    undefined;
  return {
    kind: "deny",
    response: NextResponse.json(
      fallback ? { error: "paid_disabled", fallback } : { error: "paid_disabled" },
      { status: 503 }
    ),
  };
}
```

Env-var comparison MUST be `=== "true"` string-literal per RESEARCH Assumption A5 (anything like `"1"` or `"yes"` must NOT flip the switch unless explicitly documented).

---

### 5. `src/app/api/auth/client-token/route.ts` (NEW, POST route)

**Analog:** Two-file composite:
- `/home/mcleods777/Masonic-Ritual-AI-Mentor/src/app/api/auth/magic-link/verify/route.ts` for the "cookie → sign a JWT → return it" flow shape
- `/home/mcleods777/Masonic-Ritual-AI-Mentor/src/app/api/auth/magic-link/request/route.ts` for the `export const runtime = "nodejs"` + error-response shape

**Why this analog:** The magic-link/verify route is the only existing endpoint that takes authentication state (in its case a `?t=` query token; in our case a `pilot-session` cookie) and mints a *new* JWT from it. Same jose sign helpers, same "early return null-collapse on any failure."

**Shape** (verify/route.ts lines 25-47 as template):
```typescript
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken, signClientToken } from "@/lib/auth";

export const runtime = "nodejs";

const ALLOWED_ORIGIN_SUFFIXES = [ /* copy from middleware.ts:13-18 */ ];

function isAllowedOrigin(origin: string | null): boolean { /* copy from middleware.ts:20-31 */ }

export async function POST(req: NextRequest) {
  // 1. Same-origin check (D-12)
  const origin = req.headers.get("origin");
  if (origin && !isAllowedOrigin(origin)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  }

  // 2. Verify pilot-session cookie (D-12 gate)
  const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(cookie);
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // 3. Derive hashedUser (sha256(email).slice(0, 16) per D-03)
  const hashedUser = await sha256Hex(session.email).then(h => h.slice(0, 16));

  // 4. Sign + return
  const token = await signClientToken(hashedUser);
  return NextResponse.json({ token, expiresIn: 3600 });
}
```

Note: `isAllowedOrigin` is duplicated from `middleware.ts`. **Suggestion:** extract to `src/lib/origin.ts` (out of scope — not in CONTEXT; flag at end). In-scope: duplicate-inline is acceptable; the planner can decide.

---

### 6. `src/app/api/cron/spend-alert/route.ts` (NEW, GET cron route)

**Analog:** RESEARCH.md Code Examples lines 404-420 (canonical Vercel pattern) + `/home/mcleods777/Masonic-Ritual-AI-Mentor/src/app/api/auth/magic-link/request/route.ts:144-172` for the Resend send pattern.

**Why split analog:** No existing GET route in the codebase does cron-style auth. The canonical pattern is trivially short (10 lines from RESEARCH). The Resend send shape is identical to the existing magic-link use — same import, same `.emails.send()` call, same error-logging convention.

**Canonical shape** (RESEARCH Code Examples, unchanged):
```typescript
import type { NextRequest } from "next/server";
import { Resend } from "resend";
import { readAndClearSpendForDay } from "@/lib/spend-tally";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Read yesterday's UTC day (cron fires at 02:00 UTC, reports the day that just ended)
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const { aggregate, perUser } = readAndClearSpendForDay(yesterday);

  // D-04 thresholds: aggregate > $10 OR any user > $3
  const aggregateExceeded = aggregate > 10;
  const topUsers = perUser.filter(u => u.total > 3);

  if (!aggregateExceeded && topUsers.length === 0) {
    console.log("[CRON] spend-alert: no thresholds crossed, no email sent");
    return Response.json({ success: true, sent: false });
  }

  // Send via Resend (mirror magic-link/request/route.ts pattern)
  // ... build html + text bodies ...
  // ... resend.emails.send({ from, to: SPEND_ALERT_TO, subject, html, text, idempotencyKey: `spend-alert-${yesterday}` }) ...
  // ... log [CRON] success/failure ...
}
```

**Resend send pattern** (magic-link/request/route.ts lines 155-170):
```typescript
const resend = new Resend(apiKey);
const { error } = await resend.emails.send({
  from: fromAddress,
  to: normalizedEmail,
  subject: "Your sign-in link",
  html: renderEmailHtml(link),
  text: renderEmailText(link),
});
if (error) {
  console.error("Resend error:", error);
  return NextResponse.json({ error: "..." }, { status: 500 });
}
```

Copy verbatim, replacing the subject, recipients, and bodies. Add `idempotencyKey: "spend-alert-${yesterday}"` per RESEARCH §Resend v6 idempotency keys (prevents duplicate sends on Vercel cron's at-least-once semantics — see Pitfall 2).

**Email body format** (follow magic-link's plain-HTML convention; renderEmailHtml lines 47-60). Include per D-06:
- Aggregate totals per route
- Top 5 spenders by hashedUser with per-user totals
- Footer note: "Use `scripts/lookup-hashed-user.ts <hash>` locally to reverse-resolve"
- Warm-container caveat per D-06b

---

### 7. `scripts/lookup-hashed-user.ts` (NEW, CLI)

**Analog:** Composite — `/home/mcleods777/Masonic-Ritual-AI-Mentor/scripts/validate-rituals.ts` for size + `#!/usr/bin/env npx tsx` shebang, `/home/mcleods777/Masonic-Ritual-AI-Mentor/scripts/rotate-mram-passphrase.ts:1-33` for the JSDoc header shape.

**Why this analog:** validate-rituals.ts is ~130 lines (the closest-in-size existing script); rotate-mram is 300+ lines (too big). The ~20-line target for lookup-hashed-user is actually smaller than both, but these two show the convention for:
- Shebang `#!/usr/bin/env npx tsx`
- JSDoc header explaining intent + `Usage:` example
- `process.argv.slice(2)` for args
- `process.exit(1)` on errors
- Plain `console.error` for operator output

**Header pattern** (rotate-mram-passphrase.ts lines 1-33):
```typescript
#!/usr/bin/env npx tsx
/**
 * lookup-hashed-user.ts — reverse-resolve a truncated hashedUser back to
 * an email from LODGE_ALLOWLIST.
 *
 * Used when reading a spike alert email and wanting to know which pilot
 * Brother crossed the threshold. The hashedUser value in the alert is
 * sha256(email).slice(0, 16) per D-03.
 *
 * Usage:
 *   LODGE_ALLOWLIST="a@x.com,b@y.com" \
 *     npx tsx scripts/lookup-hashed-user.ts 4f2a8c91234567a
 *
 * Reads LODGE_ALLOWLIST from the environment (same var the auth helper
 * uses). Does not touch `.env.local` — you must source it explicitly or
 * set the var inline. This is deliberate: the script is meant to be run
 * with a full allowlist, not a dev subset.
 */
```

**Body shape** (trivial — ~20 lines):
```typescript
import * as crypto from "node:crypto";

async function main() {
  const [targetHash] = process.argv.slice(2);
  if (!targetHash) {
    console.error("Usage: npx tsx scripts/lookup-hashed-user.ts <16-char-hash>");
    process.exit(1);
  }
  const allowlist = (process.env.LODGE_ALLOWLIST ?? "")
    .split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
  if (allowlist.length === 0) {
    console.error("LODGE_ALLOWLIST is empty or unset.");
    process.exit(1);
  }
  for (const email of allowlist) {
    const hash = crypto.createHash("sha256").update(email).digest("hex").slice(0, 16);
    if (hash === targetHash) {
      console.log(email);
      process.exit(0);
    }
  }
  console.error(`No match for ${targetHash} in LODGE_ALLOWLIST (${allowlist.length} entries).`);
  process.exit(1);
}
main();
```

Hash formula MUST match the one used by `paid-route-guard.ts` (D-03) — they are a hash-pair invariant. A drift between the two breaks the entire reverse-lookup promise. Add a comment noting this.

---

### 8. `docs/runbooks/KILL-SWITCH.md` (NEW, runbook)

**Analog:** `/home/mcleods777/Masonic-Ritual-AI-Mentor/docs/runbooks/SECRET-ROTATION.md` (sibling runbook, Phase 1 precedent).

**Why this analog:** Same folder (`docs/runbooks/`), same Phase 1 D-20 runbook convention, same structure. SECRET-ROTATION.md is the closest real analog to any runbook in the project — and it's adjacent to KILL-SWITCH.md in the same folder so the "See also" cross-references will be trivially easy.

**Heading hierarchy pattern** (SECRET-ROTATION.md lines 1-20):
```markdown
# Kill Switch — Canonical Runbook

Rehearsed playbook for flipping the paid-AI kill switch (SAFETY-08,
RITUAL_EMERGENCY_DISABLE_PAID=true) during a cost-runaway incident.
Use this when... [one paragraph explaining when].

---

## TL;DR

Flip the switch, verify, flip back:
\`\`\`bash
vercel env update RITUAL_EMERGENCY_DISABLE_PAID production --value true --yes
vercel deploy --prod
# Verify:
curl -i -H "X-Client-Secret: $SECRET" -X POST https://masonic-ritual-ai-mentor.vercel.app/api/tts/gemini \
  -d '{"text":"test"}'
# Expect 503 + {"error":"paid_disabled","fallback":"pre-baked"}
\`\`\`
```

Copy shape: `# Title — Canonical Runbook`, intro paragraph naming the D-16 env var + D-20 source decision, `---` separator, `## TL;DR` first section with the canonical command block.

**Required sections** (derived from CONTEXT D-16, D-17, D-18, D-19, D-20 + specifics):
1. **What the kill switch does** — env-var-only, one flip, all 9 paid routes return 503 + structured body (D-17)
2. **Prerequisites** — Vercel CLI logged in, repo linked (mirror SECRET-ROTATION.md §Prerequisites lines 38-54)
3. **Flip the switch** — `vercel env update` + `vercel deploy --prod`
4. **Verify** — curl each paid route; expect 503 + route-specific fallback JSON (per D-17)
5. **User experience during degraded mode** — banner copy (D-18), per-mode inline notes, detection method (per-response, per D-19)
6. **Flip back** — same command with `--value false --yes` OR `vercel env rm`
7. **Hobby-plan cron timing caveat** (per D-05 post-research) — "If this project is ever downgraded to Hobby, the 02:00 UTC cron drifts to 02:00-02:59 UTC. Spike alerts can be up to an hour late. Re-upgrade before prolonged operations."
8. **Rate-limit cold-start caveat** (per RESEARCH Pitfall 4) — "For a sustained high-rate distributed attack across cold-starts, the rate limit is best-effort; flip the kill switch."
9. **Cron retry caveat** (per RESEARCH Pitfall 2) — "Vercel does NOT retry failed cron invocations. If Resend is down on the cron fire, no alert email. Spot-check Vercel logs every few days during the pilot."
10. **Troubleshooting tail** (pattern: bold-prefix paragraphs, Phase 1 PATTERNS.md §4 reference)
11. **See also** footer pointing at `docs/runbooks/SECRET-ROTATION.md`, `src/lib/paid-route-guard.ts` (the route-level 503 emitter), `.env.example`

**Callout style** — bold-prefix paragraphs, no blockquote callouts (per Phase 1 PATTERNS.md §2; no `> **Note:**` style anywhere in existing docs).

**Cross-reference update:** SECRET-ROTATION.md §See also (lines 228-234) gets one new bullet pointing at `docs/runbooks/KILL-SWITCH.md`. Small touch — 1 line added.

---

### 9. `vercel.json` (NEW, config)

**Analog:** RESEARCH Code Examples lines 422-431 (canonical Vercel schema).

**Why this analog:** No `vercel.*` file exists in the repo today. The canonical pattern is fully verified (RESEARCH Confidence: HIGH; three official Vercel docs sources). No codebase precedent exists or is needed.

**File content** (RESEARCH-verified, ship exactly):
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    { "path": "/api/cron/spend-alert", "schedule": "0 2 * * *" }
  ]
}
```

**Footgun:** If this project is ever migrated to `vercel.ts`, install `@vercel/config@^0.2.1` and switch to a named export. Phase 2 explicitly does NOT go there per D-05 post-research.

---

### 10. `src/components/DegradedModeBanner.tsx` (NEW, React component)

**Analog:** `/home/mcleods777/Masonic-Ritual-AI-Mentor/src/components/PilotBanner.tsx`

**Why this analog:** PilotBanner is a 22-line "conditional fixed-top banner" — exactly the shape DegradedModeBanner needs. Server component, zero-JS-if-hidden, amber/zinc theme colors, `role="status"`, one `return null` when the gate is false.

**Shape** (PilotBanner.tsx lines 1-22 as template):
```tsx
"use client"; // <-- DegradedModeBanner needs this (PilotBanner doesn't, but this banner takes a prop/context so it's client)

/**
 * Degraded-mode banner. Shown when the client has received a 503 +
 * { error: 'paid_disabled' } response on any paid route (per D-18, D-19).
 *
 * Soft copy, not alarming (per specifics): "Live AI is paused — using
 * pre-baked audio and word-diff scoring. Contact Shannon for questions."
 *
 * Detection: parent surface flips `degradedMode` state on first 503.
 * This component reads from that state via prop/context; it does not
 * itself fetch or poll.
 */
export default function DegradedModeBanner({ show, onDismiss }: { show: boolean; onDismiss?: () => void }) {
  if (!show) return null;
  return (
    <div role="status" className="w-full bg-amber-950/80 border-b border-amber-800 text-amber-100 text-center text-xs py-2 px-4 tracking-wide">
      Live AI is paused — using pre-baked audio and word-diff scoring.
      {onDismiss && <button onClick={onDismiss} className="ml-4 text-amber-300 underline">Dismiss</button>}
    </div>
  );
}
```

Copy exactly: same `role="status"`, same Tailwind classes (amber-950/80, border-amber-800, text-amber-100, text-center text-xs py-2 px-4 tracking-wide), same "return null" pattern. Swap the env-var check for a prop-driven `show` boolean. Dismiss button per D-18 (re-appears on subsequent 503s).

**Hoisting:** add to `src/app/layout.tsx` next to `PilotBanner` — but the `degradedMode` state needs to come from somewhere the banner can read (React context vs. zustand-style singleton vs. client-side global). Existing codebase has no React Context or global store (per CONVENTIONS.md §State management: "no Redux / Zustand / Jotai"). **Suggestion:** module-scope singleton + `useSyncExternalStore` subscription. Flag at end — the planner chooses the state-plumbing approach.

---

### 11. Test files

All new test files follow Phase 1 D-11 convention (`src/**/__tests__/<name>.test.ts`) and the vitest idioms in Phase 1 PATTERNS.md §"Vitest test conventions." Rather than repeat per-file, here are the three analog templates used:

**Template A — pure-function test** (applies to `pricing.test.ts`, `spend-tally.test.ts`, `rate-limit.test.ts` extensions):
- Analog: `src/lib/__tests__/rehearsal-decision.test.ts`
- Pattern: `import { describe, it, expect } from "vitest"` + `import { thing } from "../source"` + `describe` groups + `beforeEach(() => __reset...ForTests())` for stateful modules.

**Template B — JWT round-trip test** (applies to `client-token.test.ts`):
- Analog: `src/lib/__tests__/auth.test.ts` lines 107-182 (entire `magic-link tokens` + `session tokens` describe blocks)
- Copy verbatim: `round-trips valid token`, `normalizes`, `rejects expired`, `rejects tampered`, `rejects different secret`, **`rejects session token presented as client-token (audience guard)`** (lines 149-153, 177-181 — the cross-audience case is the load-bearing SAFETY-05 test per D-11's `aud: 'client-token'` vs `aud: 'pilot-session'` separation).
- Pragma: `// @vitest-environment node` (auth.test.ts line 1 — keeps jose APIs happy even though they also work in jsdom).

**Template C — globalThis/module spy test** (applies to `audit-log.test.ts`, `screen-wake-lock.test.ts`):
- Analog: `src/lib/__tests__/api-fetch.test.ts` lines 1-67
- Pattern: `beforeEach(() => vi.resetModules())` + `vi.fn()` spy replacing `globalThis.fetch` (or `console.log` for audit-log; `navigator.wakeLock` for screen-wake-lock) + `afterEach` restore.
- Fake timers (for screen-wake-lock inactivity): this will be the first use of `vi.useFakeTimers()` in the repo. Pattern:
  ```typescript
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); });
  // ... vi.advanceTimersByTime(30 * 60 * 1000); ...
  ```
  Vitest 4.1.2 supports this natively (no config change needed).

**Template D — component test (jsdom)** (applies to `rehearsal-mode-ceiling.test.tsx`, `DegradedModeBanner.test.tsx`):
- Analog: `src/components/__tests__/silent-preload.test.tsx`
- Pattern: `@testing-library/react` is NOT in deps (verified via package.json); silent-preload.test.tsx uses manual render. If `@testing-library/react` is needed, the planner adds it; otherwise follow silent-preload's manual approach.

**ESLint fixture file — `src/lib/__tests__/fixtures/banned-emit.ts`:**
- Analog: none in-repo (this is a first).
- Shape per RESEARCH Pattern 3 + Pitfall 3:
  ```typescript
  // This fixture deliberately fails the no-restricted-syntax rule for emit().
  // A test loads ESLint programmatically and asserts the exact rule message fires.
  import { emit } from "../../audit-log";
  emit({ kind: "tts", prompt: "SHOULD FAIL", /* ... */ } as never);
  ```
  Use `as never` to bypass TS so the ESLint rule has something to bite on.

---

### 12. `src/lib/rate-limit.ts` (MODIFIED)

**Analog:** self.

**No signature change.** SAFETY-02 is a caller-side keyspace extension — new callers pass `paid:hour:${userKey}` / `paid:day:${userKey}` / `tts:hour:${userKey}` / etc. The existing `rateLimit(key, limit, windowMs)` shape is unchanged.

**Optional additions** (non-breaking):
- Update the header comment to mention "SAFETY-02: paid-route callers use the `paid:*` + per-route namespaces" (one line added).
- If a `src/lib/__tests__/rate-limit.test.ts` test file doesn't exist (verify during execution), create one that exercises the `__resetRateLimitForTests` path + new callsite keys.

---

### 13. `src/lib/auth.ts` (MODIFIED)

**Analog:** self — follow `signSessionToken` / `verifySessionToken` shape verbatim.

**Verbatim-copy pattern** (auth.ts lines 103-134):

```typescript
// Existing (lines 103-112):
export async function signSessionToken(email: string): Promise<string> {
  return new SignJWT({ email: email.trim().toLowerCase() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());
}

// New (copy above verbatim, change audience + TTL + payload):
const CLIENT_TOKEN_AUDIENCE = "client-token";
export const CLIENT_TOKEN_TTL_SECONDS = 60 * 60; // 1h

export async function signClientToken(hashedUser: string): Promise<string> {
  return new SignJWT({ sub: hashedUser })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(CLIENT_TOKEN_AUDIENCE)
    .setExpirationTime(`${CLIENT_TOKEN_TTL_SECONDS}s`)
    .sign(getSecret());
}
```

```typescript
// Existing (lines 119-134):
export async function verifySessionToken(token: string | undefined): Promise<{ email: string } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: ISSUER,
      audience: SESSION_AUDIENCE,
    });
    const email = payload.email;
    if (typeof email !== "string") return null;
    return { email };
  } catch { return null; }
}

// New (copy above verbatim):
export async function verifyClientToken(token: string | undefined): Promise<{ sub: string } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: ISSUER,
      audience: CLIENT_TOKEN_AUDIENCE,
    });
    const sub = payload.sub;
    if (typeof sub !== "string") return null;
    return { sub };
  } catch { return null; }
}
```

Add constants (`CLIENT_TOKEN_AUDIENCE`, `CLIENT_TOKEN_TTL_SECONDS`) at the top of auth.ts next to the existing `MAGIC_LINK_AUDIENCE` / `SESSION_AUDIENCE` constants (lines 27-28).

**Header-comment update:** extend the existing preamble (lines 1-19) to include a "Three JWT token types" description + the cross-audience invariant (D-11: `aud: 'client-token'` vs `aud: 'pilot-session'` prevents replay).

---

### 14. `src/lib/api-fetch.ts` (MODIFIED)

**Analog:** self.

**Current shape** (api-fetch.ts lines 16-39):
```typescript
const CLIENT_SECRET = process.env.NEXT_PUBLIC_RITUAL_CLIENT_SECRET;

function withSecret(init?: RequestInit): RequestInit {
  if (!CLIENT_SECRET) return init ?? {};
  const merged: RequestInit = { ...init };
  const headers = new Headers(init?.headers);
  headers.set("X-Client-Secret", CLIENT_SECRET);
  merged.headers = headers;
  return merged;
}

export function fetchApi(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, withSecret(init));
}
```

**Extension points** (D-13 + D-15 + Pitfall 5):

1. **In-memory token cache + proactive refresh timer:**
   ```typescript
   let clientToken: string | null = null;
   let refreshTimer: ReturnType<typeof setTimeout> | null = null;

   async function fetchClientToken(): Promise<string | null> {
     const resp = await fetch("/api/auth/client-token", { method: "POST", credentials: "include" });
     if (!resp.ok) return null;
     const { token } = (await resp.json()) as { token: string; expiresIn: number };
     return token;
   }

   async function ensureToken(): Promise<string | null> {
     if (clientToken) return clientToken;
     clientToken = await fetchClientToken();
     if (clientToken) scheduleRefresh();
     return clientToken;
   }

   function scheduleRefresh(): void {
     if (refreshTimer) clearTimeout(refreshTimer);
     refreshTimer = setTimeout(async () => {
       clientToken = await fetchClientToken();
       if (clientToken) scheduleRefresh();
     }, 50 * 60 * 1000); // 50min — 10min safety before 60min expiry
   }
   ```

2. **visibilitychange listener** (D-13 + Pitfall 5): copy the pattern from `screen-wake-lock.ts:65-74` verbatim:
   ```typescript
   // Reset the refresh timer when the tab becomes visible again (browsers
   // throttle setTimeout in background tabs, so a 50-min timer can fire
   // anywhere from 50 to 90+ minutes later. On resume, re-schedule.
   if (typeof document !== "undefined") {
     document.addEventListener("visibilitychange", () => {
       if (document.visibilityState === "visible" && clientToken) {
         scheduleRefresh();
       }
     });
   }
   ```

3. **Attach both headers + 401-retry fallback** (D-15 + Pitfall 5):
   ```typescript
   export async function fetchApi(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
     const token = await ensureToken();
     const enriched = withBothHeaders(init, token);
     const resp = await fetch(input, enriched);

     // Reactive retry on expired client-token (one shot, no infinite loop)
     if (resp.status === 401) {
       const body = await resp.clone().json().catch(() => ({}));
       if (body?.error === "client_token_expired") {
         clientToken = null;
         const fresh = await ensureToken();
         if (fresh) {
           const retryInit = withBothHeaders(init, fresh);
           return fetch(input, retryInit);
         }
       }
     }
     return resp;
   }

   function withBothHeaders(init: RequestInit | undefined, token: string | null): RequestInit {
     const merged: RequestInit = { ...init };
     const headers = new Headers(init?.headers);
     if (CLIENT_SECRET) headers.set("X-Client-Secret", CLIENT_SECRET);
     if (token) headers.set("Authorization", `Bearer ${token}`);
     merged.headers = headers;
     return merged;
   }
   ```

**Header-comment update:** extend the existing preamble (lines 1-14) to document the two-header coexistence (X-Client-Secret + Authorization: Bearer) and name them as different concerns per CONTEXT "Constraints Discovered" §4.

---

### 15. `src/middleware.ts` (MODIFIED)

**Analog:** self — extend existing auth ladder.

**Current flow** (middleware.ts lines 47-122):
1. Root redirect to `/landing.html` (line 51-53)
2. CORS preflight handling (lines 60-73)
3. Shared-secret check for `/api/*` except `/api/auth/*` (lines 77-88)
4. CORS origin allowlist (lines 93-109)
5. Pilot auth gate via session cookie (lines 115-122)

**Phase 2 insertion** (SAFETY-09, D-14): add a new step between (3) and (4) that verifies the `Authorization: Bearer` client-token on `/api/*` except `/api/auth/*`:

```typescript
// Insert after lines 77-88 (shared-secret check), before lines 93-109 (CORS):
if (!pathname.startsWith("/api/auth/")) {
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  const tokenPayload = await verifyClientToken(bearer); // import from @/lib/auth
  if (!tokenPayload) {
    return NextResponse.json(
      { error: "client_token_invalid" },
      { status: 401 }
    );
  }
  // Could attach hashedUser to a header for route handlers to pick up, but
  // route handlers re-verify anyway (D-14 defense-in-depth). Don't bother.
}
```

**Access-Control-Allow-Headers update** (line 69): add `Authorization` to the list:
```typescript
"Access-Control-Allow-Headers": "Content-Type, X-Client-Secret, Authorization",
```

**No carve-out changes to `isPilotPublicPath`** (lines 40-45) — `/api/auth/client-token` is already under `/api/auth/` so it's already covered (per Pitfall 1: keep the endpoint URL stable).

---

### 16. `src/app/api/tts/*/route.ts` (MODIFIED — 7 files) + `src/app/api/transcribe/route.ts` + `src/app/api/rehearsal-feedback/route.ts`

**Analog:** each other — consolidate via `src/lib/paid-route-guard.ts` (see §4 above).

**Per-route diff pattern** (applies identically to all 9 routes):

```typescript
// Add at top of file:
import { requirePaidRouteGuards } from "@/lib/paid-route-guard";
import { emit } from "@/lib/audit-log";
import { estimateCost } from "@/lib/pricing";
import crypto from "node:crypto";

const sha256Hex = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export async function POST(request: NextRequest) {
  // NEW: guard block (replaces nothing — prepends)
  const guard = await requirePaidRouteGuards(request, { routeName: "tts:gemini" });
  if (guard.kind === "deny") return guard.response;
  const { hashedUser } = guard;

  // EXISTING: apiKey check, body parse, field validation, char cap
  // ... unchanged ...

  // EXISTING: upstream call
  const t0 = Date.now();
  const resp = await fetch(upstreamUrl, { /* ... */ });
  const latencyMs = Date.now() - t0;

  // EXISTING: error handling — unchanged, but if we reach success path, emit:
  if (!resp.ok) { /* existing error path */ }

  // NEW: emit audit record after successful upstream call, before returning audio
  // (emit is synchronous + cheap — does not block the response)
  emit({
    kind: "tts",
    timestamp: new Date().toISOString(),
    hashedUser,
    route: "/api/tts/gemini",
    promptHash: sha256Hex(text),
    completionHash: sha256Hex(/* length-or-hash of audio bytes */),
    estimatedCostUSD: estimateCost("gemini-3.1-flash-tts-preview", /* charCount or audio-seconds */),
    latencyMs,
    model: "gemini-3.1-flash-tts-preview",
    voice: voice ?? "default",
    charCount: text.length,
  });

  return new NextResponse(audio, { /* unchanged */ });
}
```

**Per-route specifics:**

| Route | routeName | Audit kind | Model field | Dimension |
|-------|-----------|------------|-------------|-----------|
| `tts/gemini` | `"tts:gemini"` | `"tts"` | `servedBy` (one of 3 fallback models — use the actual model that succeeded) | `text.length` + audio-seconds × 25 tokens/sec |
| `tts/elevenlabs` | `"tts:elevenlabs"` | `"tts"` | `modelId` (from body) | `text.length` |
| `tts/google` | `"tts:google"` | `"tts"` | `voiceName` (derives tier) | `text.length` |
| `tts/deepgram` | `"tts:deepgram"` | `"tts"` | `model` (from body) | `text.length` |
| `tts/kokoro` | `"tts:kokoro"` | `"tts"` | `"kokoro"` (self-hosted, cost $0) | latencyMs only |
| `tts/voxtral` | `"tts:voxtral"` | `"tts"` | `"voxtral-mini-tts-2603"` | `text.length` |
| `transcribe` | `"transcribe"` | `"stt"` | `"groq-whisper-large-v3"` | audio-duration (from blob size or Whisper response) |
| `rehearsal-feedback` | `"feedback"` | `"feedback"` | `provider.model` | input+output tokens (if available from stream; else estimate) |

**Special: rehearsal-feedback** (D-06 + SAFETY-06 server counter): additionally tracks a per-5-min bucket: `rateLimit('feedback:5min:${hashedUser}', 300, 300_000)`. This is the server-side belt-and-suspenders from CONTEXT §SAFETY-06.

**Special: transcribe** uses `formData`, not JSON — the guard helper must handle both. Either (a) make the guard body-agnostic (prefer), or (b) run the guard before any body parsing (recommended — guard only reads headers/cookie, never body).

---

### 17. `src/components/RehearsalMode.tsx` (MODIFIED, surgical)

**Analog:** self — surgical addition only.

**Constraint:** 1,511 lines. DO NOT restructure. Phase 5 COACH-11 will split this file — SAFETY-06 changes must survive the split.

**Current auto-advance shape** (RehearsalMode.tsx lines 214-300, 302-307):
- `advanceInternal(index, gen)` is the recursive walker
- `advanceToLine(index)` is the public entry point that bumps `advanceGenRef`
- `cancelledRef` + `advanceGenRef` are the existing cancel primitives

**SAFETY-06 surgical addition:**

1. **New ref + constant at component scope** (insert near line 102, next to `advanceGenRef`):
   ```typescript
   const stepCountRef = useRef(0);
   const MAX_SESSION_STEPS = parseInt(process.env.NEXT_PUBLIC_RITUAL_MAX_STEPS ?? "200", 10);
   ```

2. **Increment at every `advanceInternal` call** (insert at top of `advanceInternal` callback, line ~218):
   ```typescript
   stepCountRef.current++;
   if (stepCountRef.current > MAX_SESSION_STEPS) {
     console.warn(`[SAFETY-06] Session step ceiling (${MAX_SESSION_STEPS}) reached — halting auto-advance`);
     setRehearsalState("complete");
     return;
   }
   ```

3. **Reset on explicit user navigation** (insert in the "Back"/"Next"/"jumpToLine"/"restartRehearsal" handlers — search for `++advanceGenRef.current` callsites at lines 305, 614, 680 and add `stepCountRef.current = 0` next to the restart-style ones only):
   ```typescript
   // In restartRehearsal (line ~679):
   ++advanceGenRef.current;
   stepCountRef.current = 0; // SAFETY-06: reset step ceiling on explicit restart
   ```

**Important:** the step counter scope is a *single auto-advance chain*, NOT "session lifetime" (per CONTEXT §SAFETY-06 Claude's Discretion). "Explicit user navigation" (Next button, Back button, jumpToLine, restartRehearsal) resets the counter. The auto-advance chain itself does NOT reset it — a runaway loop cannot reset its own counter.

**No other changes to RehearsalMode.tsx.** The test file `src/components/__tests__/rehearsal-mode-ceiling.test.tsx` exercises this via: render component → simulate 201 successful auto-advances → assert the 201st halts.

---

### 18. `src/lib/screen-wake-lock.ts` (MODIFIED)

**Analog:** self — existing `visibilitychange` listener pattern is the template.

**Current shape** (screen-wake-lock.ts lines 26-92):
- Module-level singleton state (`sentinel`, `desired`, `visibilityListenerAttached`)
- `attachVisibilityListener()` wires `document.addEventListener('visibilitychange', ...)` once (idempotent flag)
- `keepScreenAwake()` sets `desired = true` + attaches listener + acquires

**SAFETY-07 addition:** attach an inactivity timer that auto-releases after 30 minutes of no user interaction.

**Copy the `visibilityListenerAttached` idempotent-flag pattern** (lines 28, 65-74):
```typescript
let inactivityListenerAttached = false;
let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 min (Claude's Discretion per D-07)

function resetInactivityTimer(): void {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  if (!desired) return;
  inactivityTimer = setTimeout(() => {
    void releaseSentinel();
    desired = false;
    console.info("[SAFETY-07] Wake lock released after 30 min of inactivity");
  }, INACTIVITY_TIMEOUT_MS);
}

function attachInactivityListener(): void {
  if (inactivityListenerAttached) return;
  if (typeof document === "undefined") return;
  const events = ["keydown", "click", "touchstart", "pointerdown"];
  for (const ev of events) {
    document.addEventListener(ev, resetInactivityTimer, { passive: true });
  }
  inactivityListenerAttached = true;
}
```

**Call the new attach-function from `keepScreenAwake`** (line 77-81):
```typescript
export async function keepScreenAwake(): Promise<void> {
  desired = true;
  attachVisibilityListener();
  attachInactivityListener(); // NEW
  resetInactivityTimer();     // NEW — start the timer
  await acquire();
}
```

**Per D-07 "If released, do NOT auto-reacquire"** — the visibilitychange re-acquire path (lines 68-72) must skip re-acquire after inactivity release. Since inactivity sets `desired = false`, the existing guard `if (desired && document.visibilityState === 'visible')` already does this correctly. No change needed to `attachVisibilityListener`.

**STT activity counts as interaction** (per D-07): SAFETY-07 only covers the passive events listed. If the microphone is recording via STT, `audioChunk`/`result` events do not bubble to `document`. The planner may need to add an explicit `resetInactivityTimer` call from the STT engine — this is out of scope unless the planner can find a clean hook.

---

## Shared Patterns

### Commit message style (applies to all SAFETY-NN commits)

**Source:** Phase 1 CONTEXT D-20 + this Phase 2 CONTEXT "Established Patterns" §Commit convention.

**Pattern:**
```
safety-NN: short imperative subject (lowercase, ≤72 chars)
```

For multi-task infrastructure commits (e.g., one commit that lands D-07 audit-log + D-08 pricing + D-10 ESLint rule together), use `safety-infra: ...` prefix. Examples:
- `safety-01: add audit log emit + pricing table + ESLint PII guard`
- `safety-02: rate-limit userKey extension + paid-route buckets`
- `safety-infra: extract paid-route-guard helper`

**Apply to:** all Phase 2 task commits (2-01-01 through 2-09-01 and beyond).

### Path-alias import convention

**Source:** `tsconfig.json` + CONVENTIONS.md §"Import Organization" + Phase 1 PATTERNS.md.

**Pattern:** `@/*` maps to `./src/*`. Deep relative paths (`../../lib/foo`) forbidden.

**Apply to:** all new files. `paid-route-guard.ts` imports `@/lib/rate-limit`, `@/lib/auth`; the 9 paid routes import `@/lib/paid-route-guard`, `@/lib/audit-log`, `@/lib/pricing`; etc.

### Test convention

**Source:** Phase 1 D-11 + CONVENTIONS.md §"Naming Patterns" §Test files.

**Pattern:** tests in `src/**/__tests__/<name>.test.ts`, mirror source name. Route tests go in `src/app/api/<segment>/__tests__/<name>.test.ts` per STRUCTURE.md §Testing.

**Apply to:** all new test files in this phase.

### JSDoc file-header convention

**Source:** CONVENTIONS.md §"Comments" + Phase 1 PATTERNS.md §"File-header JSDoc".

**Pattern:** every non-trivial module starts with a JSDoc block explaining intent + threat model + cold-start/pilot-scale caveats. See `src/lib/rate-limit.ts:1-15`, `src/lib/auth.ts:1-19`.

**Apply to:** `audit-log.ts`, `pricing.ts`, `spend-tally.ts`, `paid-route-guard.ts`, `client-token/route.ts`, `cron/spend-alert/route.ts`, `KILL-SWITCH.md`.

### Error-body shape

**Source:** CONVENTIONS.md §"Error Handling" §API route layer.

**Pattern:** `NextResponse.json({ error: "..." }, { status: N })`. HTTP status conventions (400 bad JSON, 401 missing secret, 403 forbidden origin, 413 payload too large, 429 rate limited with `Retry-After`, 500 misconfig, 502 upstream failed).

**Apply to:** `paid-route-guard.ts` 429/401/503 responses; `client-token/route.ts` 401/403; `cron/spend-alert/route.ts` 401. Per D-17, 503 responses include `{ error: "paid_disabled", fallback: "..." }` for client UX.

### Vercel env-var convention

**Source:** Phase 1 D-05b + SECRET-ROTATION.md Troubleshooting §"Sign-in returns 401 after rotation" + KILL-SWITCH.md §Flip the switch.

**Pattern:** use `vercel env update NAME production --value <v> --yes` (atomic, no window-of-unset). Trailing-newline footgun: pipe values through `tr -d '\n'`.

**Apply to:** KILL-SWITCH.md + planner's deploy-step task for `CRON_SECRET` / `SPEND_ALERT_TO` / `RITUAL_EMERGENCY_DISABLE_PAID` env vars.

---

## No Analog Found

None critical. Two minor cases where the repo has no precedent:

| File | Why no analog | Recommendation |
|------|---------------|----------------|
| `src/lib/__tests__/fixtures/banned-emit.ts` | First ESLint fixture file in the repo. No existing `fixtures/` subdirectory convention. | Create `src/lib/__tests__/fixtures/` as a new subdir; follow RESEARCH Pattern 3's inline example. |
| `vercel.json` | No `vercel.*` file exists today. | Use the verified canonical schema from RESEARCH Code Examples verbatim. |
| Vitest fake-timers usage (for screen-wake-lock inactivity test) | First use of `vi.useFakeTimers()` in the repo. | Standard vitest pattern; no config change needed on vitest 4.1.2. Document the addition in the test file's JSDoc. |
| Route-handler tests (`__tests__/` under `src/app/api/.../`) | STRUCTURE.md claims these exist but search finds none. | Verify during execution; if the convention exists but is empty, follow it. If totally missing, create and document. |

---

## Suggestions (out of scope — not in CONTEXT, flagged for planner review)

1. **Extract `paid-route-guard.ts` helper** (see Consolidation Analysis above). ~450 lines of route-handler boilerplate avoided; 9 callsites each become a 3-line prefix. CONTEXT mentions this possibility in the orchestrator brief ("plan may consolidate via a shared `src/lib/paid-route-guard.ts` helper (suggest if you see enough commonality)"). **Recommendation: YES — extract.** Five of seven TTS routes I read are near-identical in structure; the repetition cost dominates the abstraction cost.

2. **Extract `src/lib/origin.ts`** — `ALLOWED_ORIGIN_SUFFIXES` + `isAllowedOrigin` are defined in `middleware.ts` (lines 13-31) and will need to be duplicated verbatim into `client-token/route.ts` for the same-origin check (per D-12). Extracting to `src/lib/origin.ts` avoids a known source of drift. **Not in CONTEXT — planner's choice.**

3. **React state plumbing for `DegradedModeBanner`** — no Context/Zustand in the repo today. Options: (a) module-scope singleton + `useSyncExternalStore` in React 19, (b) lift state into `src/app/layout.tsx` and prop-drill, (c) add `zustand` as a dep. **Not in CONTEXT — planner's choice.** Recommendation: (a) because it's zero-dep and uses a standard React 19 primitive; and the `degradedMode` flag has no cross-cutting readers beyond the banner + three paid-route-callsites (which already live in `api-fetch.ts`).

4. **STT activity as wake-lock interaction** (D-07 footnote): the listed events (`keydown`, `click`, `touchstart`, `pointerdown`) don't cover the STT-is-active case. If a user is reciting for 45 minutes straight without touching the screen, the wake-lock releases at minute 30. **Not in CONTEXT — planner's choice.** Recommendation: add an explicit `resetInactivityTimer()` call from STT's "got a chunk" or "got a result" handler, if a clean hook exists. Defer otherwise.

5. **Environment-variable injection for `MAX_SESSION_STEPS`** (SAFETY-06): the 200 default is set via `process.env.NEXT_PUBLIC_RITUAL_MAX_STEPS`. This adds a new env var. CONTEXT Claude's Discretion says "Shannon can override via env var" so this is in-scope; just flag that `.env.example` should gain an entry.

6. **`scripts/__tests__/lookup-hashed-user.test.ts`** — VALIDATION.md task 2-04-04 mentions this. The repo has no script-tests folder today. Recommendation: put the test in `src/lib/__tests__/` and extract the hash-compare logic to a pure function in `src/lib/audit-log.ts` (or a new `src/lib/hash-user.ts`), so the test exercises the helper, not the CLI wrapper. Keeps the vitest test harness consistent.

---

## Metadata

**Analog search scope:**
- `src/lib/*.ts` (rate-limit, auth, api-fetch, styles, default-voices, screen-wake-lock)
- `src/lib/__tests__/*.test.ts` (rehearsal-decision, auth, api-fetch — three templates)
- `src/middleware.ts`
- `src/app/api/**` (magic-link request + verify; all 7 TTS routes; transcribe; rehearsal-feedback)
- `src/components/*.tsx` (PilotBanner, RehearsalMode partial)
- `docs/runbooks/SECRET-ROTATION.md`
- `scripts/rotate-mram-passphrase.ts` + `scripts/validate-rituals.ts`
- `eslint.config.mjs`, `package.json`, `tsconfig.json`

**Files read end-to-end:**
- `/home/mcleods777/Masonic-Ritual-AI-Mentor/src/lib/rate-limit.ts`
- `/home/mcleods777/Masonic-Ritual-AI-Mentor/src/lib/auth.ts`
- `/home/mcleods777/Masonic-Ritual-AI-Mentor/src/middleware.ts`
- `/home/mcleods777/Masonic-Ritual-AI-Mentor/src/lib/api-fetch.ts`
- `/home/mcleods777/Masonic-Ritual-AI-Mentor/src/lib/styles.ts`
- `/home/mcleods777/Masonic-Ritual-AI-Mentor/src/lib/screen-wake-lock.ts`
- `/home/mcleods777/Masonic-Ritual-AI-Mentor/src/app/api/auth/magic-link/request/route.ts`
- `/home/mcleods777/Masonic-Ritual-AI-Mentor/src/app/api/auth/magic-link/verify/route.ts`
- `/home/mcleods777/Masonic-Ritual-AI-Mentor/src/app/api/tts/gemini/route.ts`
- `/home/mcleods777/Masonic-Ritual-AI-Mentor/src/app/api/tts/elevenlabs/route.ts`
- `/home/mcleods777/Masonic-Ritual-AI-Mentor/src/app/api/tts/google/route.ts`
- `/home/mcleods777/Masonic-Ritual-AI-Mentor/src/app/api/tts/deepgram/route.ts`
- `/home/mcleods777/Masonic-Ritual-AI-Mentor/src/app/api/tts/kokoro/route.ts`
- `/home/mcleods777/Masonic-Ritual-AI-Mentor/src/app/api/tts/voxtral/route.ts`
- `/home/mcleods777/Masonic-Ritual-AI-Mentor/src/app/api/transcribe/route.ts`
- `/home/mcleods777/Masonic-Ritual-AI-Mentor/src/app/api/rehearsal-feedback/route.ts`
- `/home/mcleods777/Masonic-Ritual-AI-Mentor/src/components/PilotBanner.tsx`
- `/home/mcleods777/Masonic-Ritual-AI-Mentor/src/lib/__tests__/rehearsal-decision.test.ts` (lines 1-50)
- `/home/mcleods777/Masonic-Ritual-AI-Mentor/src/lib/__tests__/auth.test.ts`
- `/home/mcleods777/Masonic-Ritual-AI-Mentor/src/lib/__tests__/api-fetch.test.ts`
- `/home/mcleods777/Masonic-Ritual-AI-Mentor/docs/runbooks/SECRET-ROTATION.md`
- `/home/mcleods777/Masonic-Ritual-AI-Mentor/scripts/rotate-mram-passphrase.ts`
- `/home/mcleods777/Masonic-Ritual-AI-Mentor/eslint.config.mjs`
- `/home/mcleods777/Masonic-Ritual-AI-Mentor/src/components/RehearsalMode.tsx` (lines 1-120, 280-360 + grep for `advance`)

**Files scanned via grep/ls:**
- `scripts/` directory listing
- `src/lib/__tests__/` directory listing
- `docs/runbooks/` directory listing
- `src/app/api/tts/` directory listing

**Pattern extraction date:** 2026-04-21
