# Architecture Research

**Domain:** Invite-only client-side-encrypted ritual practice app — evolution from private pilot (1 lodge) to invited v1 (≤10 lodges)
**Researched:** 2026-04-20
**Confidence:** HIGH (grounded in existing codebase analysis in `.planning/codebase/`; external research restricted to verifying patterns, not re-designing from scratch)
**Mode:** Brownfield delta — this document does **not** restate the current architecture. It describes the three architectural additions needed to close the v1 gaps identified in `PROJECT.md` → Active, and how they compose with the existing system without breaking the client-only-data-plane invariant.

## Scope

Read-together context (do not duplicate here):
- `.planning/codebase/ARCHITECTURE.md` — current system
- `.planning/codebase/INTEGRATIONS.md` — current external services
- `.planning/codebase/CONCERNS.md` — known fragility and gaps

This research answers only: **How should the existing architecture evolve to support the three v1 gaps?**

1. **LLM feedback quality work** — iterate prompt + model + eval, with production observability, without sending ritual content to a server.
2. **Cost / abuse safeguards layering** — per-user rate limits on top of per-IP; audit log; budget alerting; auth hardening beyond the shared-secret header.
3. **Authoring pipeline evolution** — Shannon bakes 3 Craft degrees + Installation + Officer lectures solo, offline, dev-only.

**Invariant (absolute):** Ritual plaintext (cipher OR plain) must never be transmitted to, stored on, or logged by any server this codebase talks to. Any architectural proposal that violates this is out of scope.

## System Overview — The Delta

The existing architecture has three layers that matter for this milestone:

```
┌──────────────────────────────────────────────────────────────────────┐
│                         BROWSER (trusted)                            │
│  ┌────────────────────────────────────────────────────────────┐      │
│  │  Ritual plaintext lives HERE ONLY. Never leaves.           │      │
│  │  IndexedDB (AES-GCM at rest) + Web Crypto + MediaRecorder  │      │
│  └────────────────────────────────────────────────────────────┘      │
├──────────────────────────────────────────────────────────────────────┤
│                    NEXT.JS API (proxy + custodian)                   │
│  /api/tts/*    /api/transcribe   /api/rehearsal-feedback   /api/auth │
│           (sees transcripts + feedback prompts — NOT ritual)         │
├──────────────────────────────────────────────────────────────────────┤
│                 UPSTREAMS (Gemini, Groq, Mistral, Resend)            │
└──────────────────────────────────────────────────────────────────────┘

OFFLINE (Shannon's laptop)
┌──────────────────────────────────────────────────────────────────────┐
│  scripts/build-mram-from-dialogue.ts --with-audio                    │
│  dialogue.md  →  validate  →  Gemini bake  →  AES-GCM .mram          │
└──────────────────────────────────────────────────────────────────────┘
```

The v1 additions fit in three well-defined seams:

```
┌──────────────────────────────────────────────────────────────────────┐
│                         BROWSER (trusted)                            │
│                                                                      │
│   NEW (Gap 1): Feedback-Quality Harness — on-device                  │
│   ┌──────────────────────────────────────────────────────────┐       │
│   │ feedback-eval/  (client-side eval harness, dev route)    │       │
│   │   - promptVariants[]  - scorer rubric  - a/b runner      │       │
│   └──────────────────────────────────────────────────────────┘       │
│                                                                      │
│   NEW (Gap 2): hashed-user-id, session-bound X-Client-Token          │
├──────────────────────────────────────────────────────────────────────┤
│                    NEXT.JS API (proxy + custodian)                   │
│                                                                      │
│   NEW (Gap 2): rateLimit middleware applied PER ROUTE + per user     │
│   NEW (Gap 2): budget-accounting.ts (in-memory counters + alerts)    │
│   NEW (Gap 2): audit-log.ts (PII-free JSONL → Vercel log drain)      │
│   NEW (Gap 1): /api/rehearsal-feedback emits structured trace event  │
├──────────────────────────────────────────────────────────────────────┤
│                 UPSTREAMS (unchanged)                                │
└──────────────────────────────────────────────────────────────────────┘

OFFLINE (Shannon's laptop) — NEW (Gap 3): bake-throughput tooling
┌──────────────────────────────────────────────────────────────────────┐
│  scripts/bake-all.ts          — batch orchestrator w/ resumability   │
│  scripts/bake-diff.ts         — rebake only changed lines            │
│  scripts/preview-bake.ts      — local audio-preview server           │
│  scripts/feedback-eval.ts     — offline eval harness (see Gap 1)     │
│  rituals/_bake-cache/         — line-hash → audio-blob manifest      │
└──────────────────────────────────────────────────────────────────────┘
```

Every box marked NEW is a thin, composable addition that:
- Does not move any ritual plaintext across the browser/server boundary.
- Reuses the existing `src/lib/` patterns (single-concern modules, typed contracts).
- Is shippable incrementally (none of the three gap-fixes block another).

## Gap 1 — LLM Feedback Quality Architecture

### Problem

From `PROJECT.md`: *"Rehearsal feedback from the coaching LLM is specific to what actually went wrong in the stumble, avoids generic/condescending output, and is something Shannon would stake his name on."*

Current state (`api/rehearsal-feedback/route.ts`): Groq Llama 3.3 → Mistral fallback, roast-style persona, non-streaming, no traces, no evals, no variants, no visibility into which prompt went out or what came back. Iterating prompt quality is blind.

Constraint: the inputs to the feedback LLM are **already non-ritual** (transcription text + diff summary + line number), so they can legitimately reach the server. But the **reference ritual text** that the diff was computed against is plaintext ritual and must stay client-side. This shapes the entire eval architecture.

### Architectural Proposal

**Three-tier pattern: client-side capture → server-side trace → offline eval harness.** Each tier is independently deployable.

#### Tier 1 — Client-side prompt assembly (new)

**New module:** `src/lib/feedback-prompt.ts`
**Purpose:** Single source of truth for what the feedback prompt looks like. Currently that logic lives in the API route; pull it client-side.

**Why client-side:** The diff is already computed client-side (`src/lib/text-comparison.ts`). Let the client assemble the fully-rendered prompt **including** any ritual-derived context (e.g. "the word the user missed was X, the expected word was Y"), then POST only the rendered prompt + a `variantId` to the server. This inverts the current contract: the server stops reconstructing prompts from structured inputs and instead becomes a pure LLM proxy.

**Invariant preservation:** The prompt-assembly function runs in the browser. It CAN reference ritual plaintext because it runs in the trusted zone. What gets POSTed is a string that contains, at most, 1-2 expected words (the ones the user stumbled on) — not a section, not a ceremony. This is the same disclosure surface as today's implementation (the existing route already receives `expectedText` and `transcribedText` strings in the body); we're just moving the composition into the browser so prompt iteration is visible.

**Contract:**
```typescript
// src/lib/feedback-prompt.ts
export type FeedbackVariantId = 'roast-v1' | 'coach-v1' | 'terse-v1' | /* future */;

export function buildFeedbackPrompt(input: {
  variantId: FeedbackVariantId;
  userLineText: string;        // what the user actually said
  expectedLineText: string;    // reference (≤ 1 line — minimal leakage)
  diffHighlights: DiffToken[]; // from text-comparison.ts
  role: OfficerRole;
  lineIndex: number;
}): { variantId: FeedbackVariantId; prompt: string; promptHash: string };
```

#### Tier 2 — Server-side structured trace (new)

**Modified:** `src/app/api/rehearsal-feedback/route.ts`
**New module:** `src/lib/audit-log.ts` (shared with Gap 2)

The route continues to proxy to Groq/Mistral. What's new:

1. It receives `{ variantId, prompt, promptHash, promptLen }` instead of raw diff inputs.
2. Rate limit applied (see Gap 2).
3. On completion, emit one structured trace line via `audit-log.ts`:
   ```
   {"ts":"...","evt":"feedback","userHash":"sha256:…","variantId":"roast-v1",
    "promptHash":"sha256:…","promptLen":412,"model":"llama-3.3-70b-versatile",
    "latencyMs":847,"completionLen":218,"completionHash":"sha256:…",
    "status":"ok"}
   ```
   **Note what is NOT in the trace:** the prompt body, the completion body, the user's transcribed speech, the expected ritual text. Hashes only. The prompt/completion bodies return to the browser and are persisted in the user's IndexedDB (see Tier 3) — *never* in Vercel logs.

**Invariant preservation:** The server's trace contains only opaque hashes + metadata. A post-incident audit can ask "did variant A outperform variant B on session count X?" without ever being able to reconstruct what was said.

#### Tier 3 — Client-side feedback history + offline eval harness (new)

**New IndexedDB store:** `feedbackTraces` (add to the v4→v5 schema bump in `src/lib/idb-schema.ts`)
```typescript
interface FeedbackTrace {
  id: string;
  sessionId: string;
  lineIndex: number;
  variantId: FeedbackVariantId;
  prompt: string;          // full prompt (encrypted at rest with per-device key)
  completion: string;      // full completion (encrypted at rest)
  promptHash: string;      // matches server trace
  rating?: 1 | -1;         // user thumb-up / thumb-down (optional)
  note?: string;           // Shannon-only: "generic", "actually helpful", etc.
  createdAt: number;
}
```

**New dev-only UI route:** `/dev/feedback-eval` (gated identically to `/author` — `NODE_ENV !== 'production'` + loopback origin check reusing `src/app/api/author/_guard.ts`).
- List recent feedback traces with thumb up/down.
- Side-by-side A/B compare: replay the same diff event through two `variantId` values, show both completions.
- Export traces as a bundle for offline eval: `feedback-eval-<date>.json` (the traces stay encrypted-at-rest in IDB; export decrypts them locally and writes to disk under `.planning/eval-runs/` which is gitignored).

**New script:** `scripts/feedback-eval.ts`
- Takes an exported trace bundle + a `variantId` + a list of candidate `variantId`s.
- For each trace, re-issues the diff event through each candidate variant (directly calling Groq/Mistral from the script — bypassing the server route). Outputs a ranked comparison matrix.
- Shannon-rated traces are the gold set.

**Why this shape:** The browser is the only place where ritual-touching prompts legitimately exist in the clear. Storing them encrypted-at-rest in IDB (same AES-GCM key that protects sections) and exporting them explicitly to dev-only disk locations preserves the invariant. The server-side trace is metadata-only and can drive coarse "variant B has 2× thumbs-up rate than variant A" dashboards without touching content.

### Why not Langfuse / Helicone / LangSmith for traces?

Those platforms ingest full prompts and completions. Using them with this app would either (a) require a custom self-hosted deployment inside Vercel, which is disproportionate effort for ≤10 lodges, or (b) mean shipping prompts-containing-expected-ritual-words to a third-party SaaS, which violates the invariant for even the 1-2 expected words. The hashed-trace + IDB-stored-completions pattern gives 80% of the eval value with zero additional SaaS dependencies. When Shannon wants a shareable dashboard, a tiny server-side aggregator over `audit-log.ts` output suffices.

### Component Responsibilities — Gap 1

| Component | Responsibility | Lives |
|-----------|----------------|-------|
| `src/lib/feedback-prompt.ts` (NEW) | Assemble prompt with `variantId`; compute promptHash | Browser |
| `src/app/api/rehearsal-feedback/route.ts` (MODIFIED) | Proxy Groq/Mistral; emit structured trace | Server |
| `src/lib/audit-log.ts` (NEW, shared) | PII-free structured log line emitter | Server |
| `feedbackTraces` IDB store (NEW) | Encrypted-at-rest client-side trace log | Browser |
| `/dev/feedback-eval` (NEW) | A/B replay + rating UI | Dev-only browser |
| `scripts/feedback-eval.ts` (NEW) | Offline batch eval against exported traces | Offline |

## Gap 2 — Cost / Abuse Safeguards Layering

### Problem

From `PROJECT.md` and `CONCERNS.md`:
- No per-user rate limits — only per-IP sliding window, and only on magic-link request.
- No rate limits at all on `/api/tts/*`, `/api/transcribe`, `/api/rehearsal-feedback` beyond body-size caps.
- `X-Client-Secret` is shipped in the bundle; view-source extracts it.
- No audit log. No budget alerting. No admin visibility.

### Architectural Proposal

**Three additions, layered defense:**

#### 2a. Session-bound API token (replaces shared-secret-as-auth)

**New concept:** `X-Client-Token` — a short-lived (1-hour) JWT signed by `JWT_SECRET`, embedded as a claim inside the existing `pilot-session` cookie's lifetime, issued by a new `/api/auth/client-token/route.ts`. The browser fetches it on demand via `src/lib/api-fetch.ts` and caches it in memory only (never localStorage — a short-lived token shouldn't survive a tab close).

**Why not just use the session cookie?** The session cookie is httpOnly; the browser can't read it to scope rate limits client-side or attach a hash. The client-token is a JWT whose `sub` is a hashed user identifier (`sha256(email + JWT_SECRET)` — stable per user, unlinkable without the secret).

**Invariant preservation:** No ritual content touches the token path. The hashed subject is the only user-correlated value that appears in logs.

**Shared-secret stays** — as a cheap first gate that blocks automated drive-bys from even reaching the token check. Two gates, cheap-first.

**Replaces in the middleware:**
```
OLD:  X-Client-Secret (static)         ─────→  accept /api/*
NEW:  X-Client-Secret (static, cheap) ─┐
                                       ├──→  accept /api/* only if BOTH
      X-Client-Token   (per-user,1h) ─┘       pass
```

#### 2b. Per-route, per-user rate limits + budget accounting

**Modified:** `src/lib/rate-limit.ts` — add `userKey` parameter alongside existing IP key.

```typescript
rateLimit({
  identifier: `tts:gemini:user:${userHash}`,
  limit: 120, windowMs: 60_000,
  fallbackIpIdentifier: `tts:gemini:ip:${ip}`,
  fallbackLimit: 240,
});
```

Applied to `/api/tts/*`, `/api/transcribe`, `/api/rehearsal-feedback`. Per-user limits are the primary; per-IP is the fallback (protects against pre-token anonymous bursts).

**New module:** `src/lib/budget-accounting.ts`
- Ring-buffer of `(userHash, route, estimatedCostUSD, ts)` events in memory.
- Hourly + daily aggregates per user and global.
- Thresholds read from env (`BUDGET_ALERT_DAILY_USD`, `BUDGET_ALERT_USER_DAILY_USD`); exceeding threshold triggers a one-shot Resend email to `MAGIC_LINK_FROM_EMAIL` recipient list.
- In-memory only (pilot scale). Documented upgrade path: Upstash Redis with same call signature, same as rate-limit.ts notes today.

**Cost estimation:** Each paid route exports a `estimateCostUSD(body)` helper based on public pricing tables. Called just before the upstream request. Stored in-memory with the audit log line.

**Invariant preservation:** Budget entries store `userHash`, route, chars/tokens, cost. No prompt body, no completion body.

#### 2c. Structured audit log

**New module:** `src/lib/audit-log.ts` (shared with Gap 1)

- Writes one JSONL line per API request to `console.log` (picked up by Vercel log drain — no new infrastructure).
- Schema:
  ```
  { ts, route, userHash, ip, status, latencyMs, cost, reqSizeB, respSizeB,
    rateLimitRemaining, variantId?, promptHash?, model? }
  ```
- No prompt/completion content. `userHash` is the same sha256 used in Gap 1.

**Admin visibility:** An optional future addition is a dev-only `/dev/budget` page that posts a signed request to `/api/admin/budget-summary` which re-reads the in-memory `budget-accounting.ts` counters and returns a dashboard JSON. Out of scope for the delta itself; the data model supports it.

### Auth-hardening Summary (Gap 2)

| Risk | Current mitigation | New mitigation |
|------|-------------------|----------------|
| Drive-by curl | Shared-secret header | Shared-secret + client-token |
| Bundle-extracted secret replayed | CORS origin allowlist | Client-token 1h TTL, tied to session |
| Per-user runaway | None | Per-user rate limit + budget cap |
| Surprise bill | None | Daily budget alert email |
| "Who did what?" | Nothing | PII-free JSONL audit log (`userHash`) |
| Session replay / device theft | 30-day cookie | Unchanged (out of scope for v1 — tracked in CONCERNS) |

### Component Responsibilities — Gap 2

| Component | Responsibility | Lives |
|-----------|----------------|-------|
| `/api/auth/client-token/route.ts` (NEW) | Issue 1h JWT `X-Client-Token` to authed browsers | Server |
| `src/lib/api-fetch.ts` (MODIFIED) | Fetch/cache client-token; attach both headers | Browser |
| `src/middleware.ts` (MODIFIED) | Verify both secret and token on `/api/*` except `/api/auth/*` | Edge |
| `src/lib/rate-limit.ts` (MODIFIED) | Support per-user keys alongside per-IP | Server |
| `src/lib/budget-accounting.ts` (NEW) | Track estimated spend per user per route | Server (in-mem) |
| `src/lib/audit-log.ts` (NEW) | JSONL structured log emitter | Server |

## Gap 3 — Authoring Pipeline Evolution (Offline / Dev-only)

### Problem

From `PROJECT.md` → Active:
- EA, FC, MM full rituals baked
- Installation ceremony baked
- Officer lectures / charges baked as standalone units

Shannon is the sole author, working offline via `scripts/build-mram-from-dialogue.ts --with-audio`. Current pain (from `CONCERNS.md` and `bake.log`):
- 43 ultra-short lines/ceremony silently skipped.
- Full rebake is all-or-nothing — one line style change rebakes the whole ritual.
- No preview step — bake and hope.
- `rituals/_bake-cache/` doesn't exist; every bake hits Gemini for every line.

### Architectural Proposal — NOT hosted authoring

The constraint is explicit: `/author` stays dev-only, no hosted authoring in v1. The proposal is therefore about **offline throughput tooling** — scripts and a local-only preview server that let Shannon bake more rituals per unit of time without shipping hosted authoring.

#### 3a. Line-level bake cache (new)

**New directory (gitignored):** `rituals/_bake-cache/`
**Key:** `sha256(voiceId + styleTag + text + modelId + KEY_VERSION).opus`
**Value:** The raw Gemini Opus blob.

**Why:** The current bake script re-renders every line on every run. With a content-addressed cache:
- A single word-correction rebake touches 1 line instead of 155.
- A style-tag revision rebakes only the affected line.
- A model fallback change (e.g. gemini-3.1 → gemini-2.5) only rebakes lines that actually re-rendered.

**New helper:** `src/lib/bake-cache.ts` (offline-only — lives in `scripts/` or a dedicated `src/lib/offline/` if we want to formalize it).

**Invariant preservation:** The cache is filesystem-local, gitignored, never published. It contains Gemini output (encrypted-container-free audio) keyed by a hash that includes the ritual text. Since these are Shannon's local artifacts, they never leave his machine. A `.gitignore` assertion + `CONTRIBUTING.md` note is the guarantee.

#### 3b. Batch bake orchestrator (new)

**New script:** `scripts/bake-all.ts`

Walks `rituals/*-dialogue.md` pairs, computes a bake plan (what's cached, what's stale, what's new), renders only diffs, and writes `.mram` files. Emits a manifest showing:
```
EA Opening:       0 new, 2 restyled, 153 cached (41s)
EA Initiation:    127 new, 0 restyled, 0 cached (14m)
FC Passing:       155 new (unrendered, queued)
```

**Features:**
- `--since <ref>` — only rebake rituals changed since a git ref.
- `--dry-run` — show the plan without hitting Gemini.
- `--resume` — crash-safe resume via the bake-cache (next run picks up where the crash occurred).
- `--parallel N` — N concurrent Gemini calls (respects the 3-model fallback chain per call).

#### 3c. Local preview server (new)

**New script:** `scripts/preview-bake.ts`

Spawns a tiny local-only Express-style server (Node built-in `http` — no new dep) on `localhost:8883` with a route `/line?doc=<slug>&i=<index>` that streams the Opus blob from `_bake-cache/` for a given line. Purpose: Shannon can scrub through a just-baked ritual in a browser before re-encrypting the `.mram`, catching voice/style regressions without decrypting-and-re-running the app.

A dev-only browser page `/dev/preview?doc=<slug>` can render this as a scrubable line list; it reuses `ListenMode.tsx` rendering logic but fetches from `localhost:8883` instead of embedded `.mram` audio. Dev-only guard same as `/author`.

#### 3d. Ultra-short-line workaround (new, also fixes bug)

Current skip-rule in `build-mram-from-dialogue.ts` silently omits lines <11 chars, creating runtime TTS calls per ceremony per brother (see CONCERNS → "Audio bake skips 43 'ultra-short' lines").

**Architectural fix:** Bake ultra-short lines through an alternate path — Voxtral or Google Cloud TTS — flagged per-line in the `MRAMLine`'s metadata. `speakAsRole` already has the engine-dispatch logic; the only change is the bake-time code path choosing a different engine for lines matching the skip criteria, and recording which engine was used in `MRAMMetadata.voiceCast.perLine`.

**Invariant:** Voxtral/Google API calls happen on Shannon's laptop, not in user browsers, not from production servers. Ritual lines are transmitted to a TTS API in both cases — this is already the existing tradeoff for baking. No change in data disclosure surface.

### Component Responsibilities — Gap 3

| Component | Responsibility | Lives |
|-----------|----------------|-------|
| `rituals/_bake-cache/` (NEW) | Content-addressed Opus cache | Offline fs |
| `src/lib/bake-cache.ts` (NEW) | Cache get/put + key hashing | Offline |
| `scripts/bake-all.ts` (NEW) | Batch orchestrator w/ resumability | Offline |
| `scripts/preview-bake.ts` (NEW) | Local preview server | Offline |
| `scripts/build-mram-from-dialogue.ts` (MODIFIED) | Use cache; alt-engine for ultra-short | Offline |
| `.gitignore` (MODIFIED) | Assert `_bake-cache/` never published | Repo |
| `/dev/preview` (OPTIONAL) | Browser preview UI | Dev-only |

## Data Flow Changes

### Modified flow: feedback generation (Gap 1)

```
OLD:
  RehearsalMode → POST /api/rehearsal-feedback
                  { expectedText, userText, role, ... }
                → route.ts assembles prompt → Groq → completion → client
                  (no trace, no variant, no eval)

NEW:
  RehearsalMode
    → feedback-prompt.ts buildFeedbackPrompt({ variantId:'roast-v1', ... })
       returns { prompt, promptHash, variantId }
    → POST /api/rehearsal-feedback { prompt, promptHash, variantId }
    → route.ts: rate-limit check (per-user)
               → Groq → completion
               → audit-log.ts emits { userHash, variantId, promptHash,
                                      completionHash, cost, latency }
               → respond with completion
    → client: store { prompt, completion } in feedbackTraces IDB (encrypted)
```

### Modified flow: any paid /api/* request (Gap 2)

```
OLD:
  fetchApi(route, body)
    attaches X-Client-Secret
  → middleware:
      check CORS
      check X-Client-Secret == NEXT_PUBLIC_RITUAL_CLIENT_SECRET
      check pilot-session cookie
    → route.ts runs (no rate limit on TTS/transcribe/feedback)

NEW:
  fetchApi(route, body)
    lazily fetches X-Client-Token (1h TTL, in-memory)
    attaches X-Client-Secret + X-Client-Token
  → middleware:
      check CORS
      check X-Client-Secret
      check X-Client-Token (verify JWT, extract userHash)
      check pilot-session cookie
      pass req.userHash downstream
    → route.ts:
        rateLimit({ identifier: `${route}:user:${userHash}`, ... })
        estimateCost + budget-accounting record
        …proceed with existing logic…
        audit-log.emit(...)
```

### New flow: offline feedback eval (Gap 1)

```
Shannon @ /dev/feedback-eval
  → select N traces, rate thumbs up/down (writes to IDB)
  → "Export gold set" → JSON file in .planning/eval-runs/ (gitignored)

Shannon @ shell:
  → scripts/feedback-eval.ts --variants roast-v1,coach-v1,terse-v1
                              --gold-set eval-runs/2026-04-20.json
  → for each (trace, variant): call Groq directly with buildFeedbackPrompt(...)
  → write comparison matrix to .planning/eval-runs/report-*.md
```

### New flow: incremental bake (Gap 3)

```
Shannon @ shell:
  → scripts/bake-all.ts --since HEAD~1 --parallel 4
  → bake-cache.ts computes plan:
      for each line in each ritual pair:
        key = sha256(voice + style + text + modelId + KEY_VERSION)
        cache-hit? use _bake-cache/<key>.opus
        cache-miss? enqueue
  → render queued lines (respecting existing 3-model fallback)
  → assemble .mram per ritual
  → write rituals/<slug>.mram
```

## Suggested Build Order

Dependencies between additions, shortest-path-to-value first:

```
Phase A (Prereqs — enable the other two):
  A.1  Extract src/lib/idb-schema.ts           (CONCERNS item — blocker for any IDB change)
  A.2  src/lib/audit-log.ts                    (shared by Gap 1 + Gap 2)

Phase B (Gap 2 — cost/abuse first; lowest risk to existing users):
  B.1  rate-limit.ts per-user support + apply to existing routes
  B.2  budget-accounting.ts + Resend alert email
  B.3  /api/auth/client-token + api-fetch.ts token attach
  B.4  middleware.ts dual-header verify

Phase C (Gap 3 — unblocks content work):
  C.1  bake-cache.ts + _bake-cache directory
  C.2  build-mram-from-dialogue.ts cache integration
  C.3  scripts/bake-all.ts orchestrator
  C.4  alt-engine path for ultra-short lines
  C.5  scripts/preview-bake.ts (optional polish)

Phase D (Gap 1 — feedback quality, iterative):
  D.1  feedback-prompt.ts (move assembly client-side)
  D.2  /api/rehearsal-feedback variant dispatch + audit trace
  D.3  feedbackTraces IDB store (depends on A.1)
  D.4  /dev/feedback-eval UI
  D.5  scripts/feedback-eval.ts
  D.6  Iterate variants against Shannon-rated gold set
```

**Rationale:**
- A before B/C/D — every gap needs `audit-log.ts`, and Gap 1 needs the IDB schema refactor.
- B before D — Gap 2 rate limits protect the feedback endpoint you're about to iterate on heavily in Gap 1.
- C independent of B/D — Shannon can bake in parallel with eng work on the other two gaps. C blocks content shipping for v1; it should start early in calendar time even though it doesn't gate the others.
- D last — feedback quality is iterative and needs the eval harness + audit traces already in place to measure progress.

## Invariant-Preservation Summary

For every new component, the question: "does ritual plaintext reach a server?"

| Component | Ritual plaintext? | Why safe |
|-----------|-------------------|----------|
| `feedback-prompt.ts` (client) | YES — in browser only | Browser is trusted zone |
| `/api/rehearsal-feedback` (new body shape) | Only the same 1-2-word disclosure surface as today | Unchanged from current; explicitly documented |
| `audit-log.ts` structured lines | NEVER — hashes and metadata only | By construction: schema excludes body fields |
| `feedbackTraces` IDB store | YES — client-side, encrypted-at-rest | Same AES-GCM protection as `sections` store |
| `X-Client-Token` JWT | NEVER — contains only `userHash` claim | By construction |
| `budget-accounting.ts` ring buffer | NEVER — userHash + route + cost | By construction |
| `rate-limit.ts` user keys | NEVER — `sha256(email+secret)` identifier | Hash is one-way |
| `rituals/_bake-cache/` | YES — on Shannon's laptop | Local filesystem, gitignored; already the existing trust model for the bake step |
| `scripts/bake-all.ts` / `preview-bake.ts` | YES — on Shannon's laptop | Offline only; no server deploy involves these |
| `/dev/feedback-eval`, `/dev/preview` | Routes exist only in dev builds | `_guard.ts` pattern — 404 in production |

**No proposal transmits or persists ritual plaintext on any server.** The strictest existing disclosure surface (1-2 expected words in a feedback prompt) is preserved unchanged; everything new tightens the footprint rather than expanding it.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Centralizing eval in a third-party SaaS

**What people do:** Wire Langfuse / Helicone / LangSmith / PromptLayer into the feedback route to get "free" observability.
**Why it's wrong:** Every such platform ingests full prompt + completion text. The feedback prompt includes the expected ritual line(s). Even 1-2 expected words, aggregated across thousands of events, reconstructs the ritual. This is the one invariant violation that kills the trust model with invited lodges.
**Do this instead:** Client-side IDB store for bodies, server-side hashed traces for metadata, offline harness for batch eval. See Gap 1 Tier 3.

### Anti-Pattern 2: Moving rate-limit state to Redis "now, to be ready"

**What people do:** "We're scaling, let's move rate-limit.ts to Upstash Redis while we're in there."
**Why it's wrong:** `CONCERNS.md` and `PROJECT.md` are explicit that pilot-scale in-memory limiter is accepted. Every new dep has a cost: another env var, another SDK, another failure mode, another place secrets leak. The in-memory limiter's interface was designed for swap-in; don't swap until usage demands it.
**Do this instead:** Keep `rate-limit.ts` in-memory. Document the swap-in contract explicitly. Same applies to `budget-accounting.ts`.

### Anti-Pattern 3: Hosted `/author` mode snuck in via "preview"

**What people do:** "We built a local preview server — let's deploy it so outside lodges can preview their bakes before shipping."
**Why it's wrong:** That's hosted authoring, explicitly Out of Scope in `PROJECT.md`. Hosted authoring needs copyright vetting, quality control, and content-review tooling none of which exist. It also blows up the solo-authoring trust model.
**Do this instead:** `preview-bake.ts` binds to localhost-only, guarded identically to `/author`. Production builds strip the route.

### Anti-Pattern 4: One giant rate-limit bucket per user

**What people do:** `rateLimit({ identifier: userHash, limit: 1000, windowMs: 3600_000 })` applied globally.
**Why it's wrong:** A single ceremony can fire 150+ TTS requests, 50+ STT requests, 30+ feedback requests. One bucket makes them compete; a user near quota can't finish their rehearsal because transcription ate the budget.
**Do this instead:** Per-route, per-user buckets (`tts:gemini:user:${h}`, `transcribe:user:${h}`, `feedback:user:${h}`). Limits calibrated per route based on expected ceremony-per-hour throughput.

### Anti-Pattern 5: Eval-driven prompt regression only

**What people do:** Add an eval harness, but only check "does variant B score as-well-as variant A on the current gold set?"
**Why it's wrong:** The current complaint is that feedback is *generic and condescending*. A regression test against the current baseline only prevents getting worse — it doesn't measure whether a new variant actually addresses the complaint.
**Do this instead:** Shannon-rated gold set with qualitative rubric ("specific to the stumble", "non-condescending", "actionable"). Report rubric scores per variant, not just diff-against-baseline.

## Scaling Considerations

Aligned with `PROJECT.md`: pilot-scale (≤10 lodges) is the design target. This is pilot architecture, not scale architecture.

| Scale | What Breaks First | Architectural Response |
|-------|-------------------|------------------------|
| 1 lodge (today) | Nothing | Current + Gap 1/2/3 additions |
| ≤10 lodges (v1 target) | In-memory budget-accounting resets on cold start | Accepted — alert thresholds generous enough that cold-start reset isn't exploited |
| 20+ lodges | `LODGE_ALLOWLIST` env var unwieldy; magic-link JWT replay window | Move allowlist to KV store; stateful one-time magic links (already tracked in CONCERNS) |
| 100+ lodges | Rate-limit + budget-accounting in-memory maps evict under load | Swap `rate-limit.ts` and `budget-accounting.ts` to Upstash Redis (interfaces preserved) |
| Jurisdictional (1000+) | Content-tagging (Shannon's working only) breaks | Out of v1 scope entirely; multi-working requires content-system redesign |

The delta described in this document is explicitly designed to **not** add Redis/KV/Upstash for v1. Every new module has a documented swap-in point for when Shannon crosses a scale threshold.

## Integration Points

### New external integration: none required

All three gaps fit inside the existing integration surface (Groq, Gemini, Mistral, Resend). Gap 2 budget alerts use Resend (already wired). Gap 1 eval harness uses the same Groq/Mistral proxy routes from scripts.

### Modified internal boundaries

| Boundary | Old | New |
|----------|-----|-----|
| Browser ↔ `/api/rehearsal-feedback` | Structured diff body | Rendered prompt + variant id |
| Middleware ↔ route handlers | Header check only | Adds `req.userHash` for rate-limit keying |
| `scripts/build-mram-from-dialogue.ts` ↔ filesystem | Direct Gemini per line | Via `bake-cache.ts` |
| `rate-limit.ts` caller ↔ limiter | Single identifier | Primary user key + fallback IP key |

### Preserved internal boundaries

- **Browser ↔ ritual content**: ritual plaintext never crosses this boundary outward.
- **`/api/tts/*` body cap (2000 chars)**: unchanged — even Gap 1's rendered prompt respects the existing `MAX_TEXT_CHARS`.
- **`.mram` format v3+ backward compatibility**: Gap 3 adds optional metadata fields; does not change the binary format number.
- **`_guard.ts` dev-only gate**: Every new dev route (`/dev/feedback-eval`, `/dev/preview`) reuses the same guard. No new production surface area.

## Sources

This research is grounded primarily in the existing codebase analysis (`.planning/codebase/ARCHITECTURE.md`, `INTEGRATIONS.md`, `CONCERNS.md`) and the project constraints in `PROJECT.md`. External architectural patterns referenced:

- Content-addressed build caches (Bazel, Turborepo, Nx) — informs Gap 3's `_bake-cache/` key design.
- Hashed-subject audit logging (the pattern used in Stripe's idempotency keys and most SOC2-aligned logging) — informs Gap 1/2 audit-log schema.
- Rate-limit-per-route-per-user (the pattern used by OpenAI, Anthropic, and most paid AI APIs themselves) — informs Gap 2's multi-bucket design.
- Client-side eval of LLM outputs (patterns from OpenAI Evals, Promptfoo) — informs Gap 1's offline harness, adapted for the client-only-data-plane constraint.

Confidence is HIGH because the proposal is delta-to-existing, and the existing architecture is thoroughly mapped. The one LOW-confidence area is the estimated cost-per-call table in `budget-accounting.ts` — upstream pricing changes could require periodic recalibration.

---
*Architecture research for: Masonic Ritual AI Mentor v1 evolution*
*Researched: 2026-04-20*
