# Stack Research — v1 Delta for Masonic Ritual AI Mentor

**Domain:** Privacy-first, invite-only rehearsal web app (Next.js 16 monolith on Vercel Fluid Compute)
**Researched:** 2026-04-20
**Confidence:** HIGH (all recommendations verified against official docs in April 2026)
**Scope:** v1 delta only — read `.planning/codebase/STACK.md` for the existing stack. Every row below answers "what gets *added* or *swapped*" to close the three v1 gaps.

## Gap → Recommendation Summary

| v1 Gap | Top Pick | Confidence | TL;DR |
|--------|----------|------------|-------|
| LLM feedback quality | Vercel AI SDK v6 + AI Gateway (BYOK Groq/Mistral) + Zod structured output | HIGH | The packages are *already installed and dead*. Using them unlocks structured output, provider fallback without hand-rolled try/catch, built-in OTel telemetry, and an observability dashboard Shannon already has a login for. |
| LLM feedback quality — **add a second model tier** | Route "hard stumbles" to Claude Haiku 4.5 via the same Gateway | HIGH | Llama 3.3 70B on Groq stays the default (fast, free-ish, already good for simple diffs). Haiku 4.5 ($1 in / $5 out) kicks in when the diff is big enough that "generic feedback" would hurt trust. One code path (AI SDK), one dashboard (Gateway), <$5/month projected. |
| Cost/abuse — per-user rate limit | **Defer** a full Upstash migration; add **application-level per-email limiter** first (in-memory keyed on `email` instead of IP), then promote to Upstash only when pilot expands past ~30 users | MEDIUM | Upstash free tier (500K commands/mo) is fine at this scale, but adding a network hop for every API call to solve "≤10 lodges" is premature. Per-email in-memory catches the documented threat (script with exfil'd shared secret) at zero infra cost. Keep the call-site interface compatible with `@upstash/ratelimit` v2.0.8 so promotion is a one-line swap. |
| Cost/abuse — budget alerting | **Vercel AI Gateway's built-in observability** (spend graph + per-API-key breakdown) for LLM spend; **Vercel Spend Management** for platform spend | HIGH | Gateway dashboard already shows requests-by-model / spend / logs sortable by API key. No extra tool needed. For TTS spend (Gemini/Google Cloud), add a **weekly digest cron** that hits Google Cloud billing API and emails Shannon — ~20 LOC, no SaaS. |
| Cost/abuse — deeper traces | **Langfuse self-hosted** (optional, Phase 3+) OR **Langfuse Cloud hobby tier** (50K events/mo free) via AI SDK's `experimental_telemetry: { isEnabled: true }` | MEDIUM | Worth it specifically for LLM-feedback-quality trace review ("dogfood verification pipeline" is called out in PROJECT.md). NOT worth it for TTS/STT. Defer until the feedback-rewrite is in flight; skip entirely if Gateway dashboard is enough. |
| Cost/abuse — auth hardening | **Stateful one-time-use magic links** backed by Vercel KV (or Upstash Redis — same SDK surface) + **per-user session-scoped API rate limit** replacing the shared-secret header as the primary gate | HIGH | The shared secret is in the bundle; it's security theater. Already tracked as P2 in TODOS.md. The fix is stateful tokens keyed to a durable store. Re-use that store for rate limits once it exists. |
| Authoring throughput — TTS bake speed | **Concurrency-capped parallel bake** (p-limit, 3-5 concurrent Gemini calls) + **resumable bake state** (per-line `{status, audioHash}` JSON sidecar) | HIGH | Current bake is effectively serial per line. Gemini 3.1 Flash TTS (GA public preview April 15, 2026) is ~2× faster than 2.5-flash-preview-tts per Google's release notes; combining model upgrade + parallelism roughly cuts EA initiation bake from O(30 min) to O(5 min). |
| Authoring throughput — dialogue authoring | **Wire the existing `/api/author/suggest-styles` backend to a real UI** + **add a "cipher preview" companion** using a small local model (optional) | HIGH for UI, LOW for local model | The backend is already live; shipping the UI is 100% in-scope grunt work, not a tech decision. A local model for cipher generation is overkill — keep using the existing server-side path. |
| Authoring throughput — voice-cast iteration | **Per-role audition harness** in `/author` that renders the same 3-5 candidate lines with N voice choices side-by-side | HIGH | Pure UI work on top of existing TTS proxy. No new dependency. Makes "try 5 voices for the SW" a 30-second loop instead of re-baking a full ritual. |

---

## Recommended Stack Delta (Add)

### Core Additions

| Technology | Version | Purpose | Why (delta-specific) |
|------------|---------|---------|----------------------|
| `ai` | ^6.x (currently ^6.0.86 already in `package.json`) | LLM routing, streaming, structured output, telemetry | Already installed, zero imports — this is activating dead weight, not a new dep. v6 codemod migration path is `npx @ai-sdk/codemod upgrade v6`. Replaces the raw `fetch()` in `api/rehearsal-feedback/route.ts` with `generateObject({ model, schema })` for typed feedback. |
| `@ai-sdk/gateway` (AI Gateway provider for AI SDK) | Bundled with `ai@6` / `ai-sdk.dev/providers/ai-sdk-providers/ai-gateway` | Route all LLM calls through one endpoint; BYOK Groq + Mistral + Anthropic | Zero-markup pricing, $5/mo free credits per Vercel team, unified observability. BYOK means existing Groq/Mistral keys keep working — no cost change. |
| `@ai-sdk/anthropic` | ^3.0.44 (already installed) | Claude Haiku 4.5 for "hard stumble" feedback tier | Already in `package.json`, unused. Haiku 4.5 at $1/$5 per 1M tokens is the right call for the 10-20% of feedbacks that Llama 3.3 produces generic output on. Can be provider-routed via AI Gateway; no direct Anthropic key in the Vercel env if using Gateway-only. |
| `zod` | ^3.23.x (new install — compatible with AI SDK v6 requirements) | Structured output schema for feedback JSON | `generateObject({ schema: FeedbackSchema })` gives typed, validated, guaranteed-parseable feedback. Eliminates regex fishing in the current `api/rehearsal-feedback/route.ts` response handling. |
| `p-limit` | ^6.x | Concurrency-cap the Gemini TTS bake | Lowest-ceremony way to parallelize `scripts/build-mram-from-dialogue.ts` without hand-rolling a semaphore. Start at 3 concurrent, tune to Gemini quota. Alternatively `@supercharge/promise-pool`. |

### Supporting Additions (choose per scope)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@upstash/ratelimit` | ^2.0.8 | Distributed per-user rate limiting | **Defer until pilot expands past ~30 active users or a real cold-start quota reset is observed in logs.** Keep the current in-memory `src/lib/rate-limit.ts` interface compatible so this is a drop-in swap. |
| `@upstash/redis` | ^1.35.x (pairs with @upstash/ratelimit) | Backing store for rate limits and stateful magic links | Same "defer" gate. Triggering event: shipping stateful one-time-use magic links (already P2 in `TODOS.md`). Once that exists, rate-limiting for free. |
| `@opentelemetry/sdk-node` + `langfuse-vercel` | Latest (April 2026) | Export AI SDK spans to Langfuse | **Optional.** Turn on only for the "LLM feedback quality" phase while evaluating stumble-specific feedback. Disable after. Gateway's built-in dashboard covers the 80% case. |
| `@vercel/kv` | ^3.x | Small durable KV store (Redis-compatible) | Viable alternative to Upstash for the magic-link + rate-limit store. Native to Vercel, no extra vendor. Free tier is modest. Pick Upstash if you expect to eventually self-host; pick Vercel KV if you want zero ops. |
| `resend` | ^6.11.0 (already installed) | Budget-alert email digest | Re-use existing Resend dependency for the weekly-spend-digest cron. No new dep. |

### Development Tools (delta)

| Tool | Purpose | Notes |
|------|---------|-------|
| `@ai-sdk/codemod` | Automated AI SDK v5→v6 (and raw-fetch → AI SDK) migration | Run once: `npx @ai-sdk/codemod upgrade v6`. The v6 upgrade is explicitly documented as "not expected to have major breaking changes for most users." |
| AI SDK DevTools | Live inspector at `localhost:4983` | Wraps the model with `devToolsMiddleware()`. Useful during the LLM-feedback quality rewrite phase; disable for production. |
| Vercel Spend Management | Platform-level hard spend cap | Free feature, already on the Vercel dashboard. Not a library — a one-time config step that deserves a roadmap line. |

---

## The Big Calls (Prescriptive)

### Call 1: Migrate to Vercel AI SDK v6 + AI Gateway. **YES, DO IT.**

The three dead `package.json` entries (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/react`) are a tell: the original design called for this, the implementation took a shortcut, and the shortcut has now become the coach-quality gap. The migration is:

- **Scope:** `api/rehearsal-feedback/route.ts` (primary) and optionally `api/author/suggest-styles/route.ts` (secondary). TTS and STT routes stay on raw `fetch` — they're binary streaming, not LLM text, and AI SDK doesn't help.
- **Net code change:** *Shrinks* the feedback route by ~40% because the Groq→Mistral fallback becomes declarative (`fallbacks: [...]`) and JSON parsing becomes `generateObject({ schema })`.
- **Cost change:** Zero for Groq/Mistral (BYOK, no markup). Adds ~$1-5/month if Haiku 4.5 is enabled as the "hard stumble" tier on ~20% of feedbacks.
- **Observability upgrade:** Out of the box, Gateway dashboard shows requests by model / API key / project with spend, TTFT, and exportable logs. The current setup has none of this — server logs are `console.error` strings in Vercel's runtime log.
- **Migration cost:** <1 day. The codemod handles most of it.
- **Risk:** The single known compatibility gap is Gemini TTS (Gateway is LLM-only, not TTS). That's fine — Gemini TTS stays on direct `generativelanguage.googleapis.com` calls.

### Call 2: Upstash Redis. **DEFER. Not worth it at ≤10 lodges.**

The `CONCERNS.md` pilot-scale compromise argument is correct. Upstash adds:

- A network hop on every `/api/*` call (~30-80 ms p50 from Vercel Fluid edge locations)
- A third-party dependency to the security model
- Ongoing free-tier management (500K commands/mo is plenty for pilot, but easy to forget and break prod)

For ≤10 lodges, the realistic threat is **"someone extracts the shared secret from the bundle and scripts against the paid routes."** That threat is addressed by:

1. Adding per-*email* in-memory rate limits (not per-IP) — Shannon already has the authenticated email from the JWT in middleware
2. Shipping stateful one-time-use magic links (P2 in TODOS.md)
3. Applying `rateLimit()` to *every* paid route, not just magic-link request (CONCERNS.md shows this is missing on all 8 TTS/transcribe/feedback routes)

None of those need Redis. Redis becomes necessary when (a) the in-memory cold-start-reset attack is measured as real in logs, or (b) the allowlist grows past the env-var practicality bound (~100 users). Neither is true today.

**When to promote:** Trigger is either pilot user count >30, OR the first stateful feature lands (one-time magic links) — at which point you need a durable store *anyway*, so pay for it once.

### Call 3: LLM Observability. **Gateway Dashboard + OPTIONAL Langfuse.**

- **Default:** Use the AI Gateway Overview tab. It already does what 90% of projects need: spend graphs, requests-by-model, time-to-first-token, input/output token counts, exportable per-request logs grouped by API key.
- **Upgrade trigger:** When shipping the LLM feedback-quality work, you'll want to *compare stumble→feedback pairs across model versions* — that's evaluations, and Gateway doesn't do evals. At that point, turn on AI SDK `experimental_telemetry: { isEnabled: true }` and point the OTel exporter at **Langfuse Cloud hobby tier (50K events/mo free, 30-day retention)** or self-host if the data sensitivity warrants it. For a pilot with <5 active users generating feedback a few times per rehearsal, 50K events/mo is ~5000 rehearsal rounds — more than enough.
- **Don't use Helicone.** Helicone was acquired by Mintlify on March 3, 2026 and is in maintenance mode (security fixes only). Use Langfuse (41K+ builders, active OSS) or the Gateway dashboard. This is a big change since the 2025 Helicone-is-the-default-recommendation era.
- **PostHog is also viable.** PostHog LLM Analytics free tier is 100K events/mo (2× Langfuse hobby) with 30-day retention. If PostHog is already going to be wired in for product analytics (the dead env var `NEXT_PUBLIC_POSTHOG_KEY` suggests it was planned), roll LLM observability into the same tool. If not, Langfuse's LLM-specific features (prompt playground, evaluation datasets, LLM-as-a-judge) are better.

### Call 4: Authoring Throughput. **Parallelism + UI polish, no new stack.**

Every authoring-throughput win is in-repo code work, not a new dependency:

1. **Bake parallelism:** Add `p-limit` (~6 LOC change in `scripts/build-mram-from-dialogue.ts`).
2. **Model upgrade:** Put `gemini-3.1-flash-tts-preview` first in `GEMINI_TTS_MODELS` (GA April 15, 2026). The existing 3-model fallback chain handles the rollout gracefully.
3. **Resumable bake state:** Persist a per-line status sidecar so re-bakes skip already-rendered lines. Cuts re-bake time on small edits from O(full ritual) to O(changed lines). Pure disk I/O, no library.
4. **Ship the Suggest Styles UI** (P2 in `TODOS.md` — backend is already live).
5. **Voice-cast audition harness:** side-by-side 5-voice render for a sample line. New `/author/audition` page, ~1 day of React work.

None of these needs a new dependency. "Authoring throughput" is a UX problem, not a tech-stack problem.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Vercel AI SDK v6 + Gateway | **LiteLLM proxy** (OSS, self-hosted) | If you expect to run outside Vercel or need enterprise-grade provider-routing with custom cost-allocation logic. Overkill at ≤10 lodges. |
| Vercel AI SDK v6 + Gateway | **OpenRouter** | If you want cross-provider routing *without* Vercel vendor lock-in and don't care about the Next.js / AI SDK integration. OpenRouter charges a markup (~5%); Gateway doesn't. |
| Gateway dashboard for observability | **Langfuse Cloud (free hobby tier)** | If you need evaluations, datasets, LLM-as-a-judge, or prompt playground. Turn on specifically for the feedback-quality phase. |
| Gateway dashboard for observability | **PostHog LLM Analytics** | If PostHog is already (or about to be) the product-analytics choice. One tool instead of two. |
| In-memory rate limit → future Upstash | **Vercel KV** | If you want zero-new-vendor infra and are already on Vercel for everything. Comparable free tier, native integration, one less dashboard. Pick Upstash if you anticipate ever moving off Vercel. |
| Claude Haiku 4.5 tier-up | **Claude Sonnet 4.5** | If Haiku 4.5 feedback quality is insufficient for "hard stumbles." Sonnet is ~5× more expensive; run an eval before jumping. |
| Claude Haiku 4.5 tier-up | **Llama 4 Scout on Groq** | If cost-per-token matters more than feedback quality. Scout is ~10× cheaper than Haiku 4.5 but benchmarks lower on instruction-following — and instruction-following is what a rehearsal-feedback coach needs. |
| p-limit parallel bake | **Gemini Batch API** | Gemini TTS does not currently expose a batch endpoint — only `streamGenerateContent`. Revisit if Google ships one. |
| `/api/author/suggest-styles` UI | **Local LLM for style suggestion** | If offline authoring must work without any network call. Not a v1 goal per `PROJECT.md` constraints. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **Helicone** (proxy or OSS) | Acquired by Mintlify March 3, 2026 — maintenance mode only, no new features. Their own docs now redirect users to LiteLLM or Portkey. | Langfuse (OSS, active) or Vercel AI Gateway (proxy, free tier, active). |
| **LangSmith (LangChain)** | Requires LangChain adoption. This codebase is not LangChain — it's raw fetch → AI SDK. Adding LangChain to get LangSmith is a huge tax. | AI SDK's built-in OTel + Langfuse. |
| **A full LangChain migration** | LangChain's abstractions are overkill for a project whose LLM surface is "one feedback prompt, one style-suggestion prompt." | AI SDK v6 `generateObject` + Zod schema is the TypeScript-native answer and is already installed. |
| **Raw OpenAI SDK** | The project uses Groq and Mistral, not OpenAI. OpenAI SDK's provider-agnosticism is weak; AI SDK was purpose-built for this. | AI SDK v6 with `@ai-sdk/openai-compatible` if you ever add an OpenAI-compat endpoint. |
| **`natural` package (already in `package.json`)** | Dead weight, no imports found anywhere. Listed in `CONCERNS.md` as cleanup candidate. | Just delete it. The diff library already handles tokenization for the accuracy score. |
| **`uuid` package (already in `package.json`)** | `crypto.randomUUID()` is used everywhere; `uuid` has no imports. | Delete it. |
| **`@ai-sdk/react`** | Only needed for streaming UI hooks (`useChat`, `useCompletion`). Rehearsal feedback is a one-shot request/response, not a chat UI. | Keep `ai` (core) + `@ai-sdk/anthropic`; delete `@ai-sdk/react`. |
| **Keeping the shared-secret header as the primary auth gate** | It's in the JS bundle. Security theater at best. | Per-user JWT session (already exists) + per-user rate limit + stateful one-time magic links. Downgrade the shared secret to "drive-by mitigation only" status in the architecture doc. |
| **Gemini 2.5 preview TTS models as the primary** | Will be deprecated; 3.1 Flash TTS is GA public preview as of April 15, 2026 with better controllability and pacing. | Put `gemini-3.1-flash-tts-preview` first in `GEMINI_TTS_MODELS`; keep 2.5-flash-preview-tts second for quota headroom. |

---

## Stack Patterns by Variant

### If scope is **"LLM feedback quality only" (minimum delta):**
- Adopt AI SDK v6 + AI Gateway (BYOK Groq/Mistral)
- Add Zod for typed feedback schema
- Enable AI Gateway observability (free)
- Add Claude Haiku 4.5 as the "hard-stumble" tier via the same Gateway
- Skip Upstash, skip Langfuse, skip PostHog
- **Estimated extra monthly cost:** $1-5 (Haiku 4.5 on ~20% of rounds)

### If scope is **"LLM feedback + cost/abuse hardening":**
- Everything above, plus:
- Apply in-memory `rateLimit()` to every paid `/api/*` route (per-email, not per-IP)
- Ship stateful one-time-use magic links backed by Vercel KV (or Upstash Redis)
- Weekly spend-digest cron via Resend
- Set Vercel Spend Management cap
- **Estimated extra monthly cost:** ~$5 (AI Gateway paid tier kicks in if >$5/mo LLM spend) + $0 Vercel KV free tier

### If scope is **"full v1 including evals and authoring throughput":**
- Everything above, plus:
- Turn on AI SDK `experimental_telemetry` → Langfuse Cloud hobby tier (free, 50K events/mo) during feedback-quality evaluation
- p-limit parallel bake in `build-mram-from-dialogue.ts`
- `gemini-3.1-flash-tts-preview` prioritized in the fallback chain
- Ship Suggest-Styles UI + voice-cast audition harness
- Resumable bake state sidecar
- **Estimated extra monthly cost:** still $5-10 total; everything stays on free tiers

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `ai@^6.0.86` | `next@^16.2.3`, `react@19.2.3` | AI SDK v6 explicitly supports Next.js 16 App Router. Current `package.json` entry is already at v6. |
| `@ai-sdk/anthropic@^3.0.44` | `ai@^6.x` | Current `package.json` entry — matches AI SDK v6's provider contract. |
| `@upstash/ratelimit@^2.0.8` | `@upstash/redis@^1.35.x` | Version 2.x is the current major; 1.x is legacy. If promoting the in-memory limiter, go straight to 2.x. Works in Next.js Edge runtime (HTTP/REST, not TCP). |
| `zod@^3.23.x` | `ai@^6.x`, `@ai-sdk/anthropic@^3.x` | Zod 3 is what AI SDK v6 targets. Zod 4 is in release candidate; do not adopt yet — AI SDK compatibility is not confirmed. |
| `p-limit@^6.x` | Node 20+ (ESM-only) | Matches the project's Node target. Pure ESM; no CJS fallback. |
| Claude Haiku 4.5 | AI SDK v6 + `@ai-sdk/anthropic` | Haiku 4.5 is the current Anthropic small-tier model as of April 2026. $1/M in, $5/M out; prompt caching cuts this by up to 90%. |
| Gemini 3.1 Flash TTS preview | Existing Gemini route | Added to `GEMINI_TTS_MODELS` env var — no code change needed; fallback chain handles rollout. |

---

## Installation (all adds wired, progressive by scope)

```bash
# Minimum delta — LLM feedback quality upgrade only
npm install zod@^3.23
# (ai, @ai-sdk/anthropic already installed — just activate them)
# Run the migration codemod for any AI SDK v5→v6 idiom drift:
npx @ai-sdk/codemod upgrade v6

# Cleanup of confirmed dead weight (matches CONCERNS.md)
npm uninstall natural uuid @ai-sdk/react @types/uuid

# Authoring throughput
npm install p-limit@^6

# When promoting from in-memory rate limit to Upstash (DEFERRED until pilot expands)
# npm install @upstash/ratelimit@^2.0.8 @upstash/redis@^1.35

# When wiring Langfuse for feedback evaluations (OPTIONAL, phase-scoped)
# npm install langfuse-vercel @opentelemetry/sdk-node @opentelemetry/api
```

---

## Sources

- [Vercel AI SDK v6 announcement (vercel.com/blog/ai-sdk-6)](https://vercel.com/blog/ai-sdk-6) — HIGH; official; April 2026; confirmed v6 feature set, codemod, DevTools
- [Vercel AI Gateway docs (vercel.com/docs/ai-gateway)](https://vercel.com/docs/ai-gateway) — HIGH; official; BYOK, free tier, provider list
- [Vercel AI Gateway pricing (vercel.com/docs/ai-gateway/pricing)](https://vercel.com/docs/ai-gateway/pricing) — HIGH; official; $5/mo free credit, zero markup including BYOK
- [Vercel AI Gateway observability (vercel.com/docs/ai-gateway/capabilities/observability)](https://vercel.com/docs/ai-gateway/capabilities/observability) — HIGH; official; confirms requests-by-model, TTFT, token counts, spend, per-API-key grouping, exportable logs
- [AI SDK v6 migration guide (ai-sdk.dev/docs/migration-guides/migration-guide-6-0)](https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0) — HIGH; official; "not expected to have major breaking changes for most users"
- [AI SDK + Langfuse integration (langfuse.com/integrations/frameworks/vercel-ai-sdk)](https://langfuse.com/integrations/frameworks/vercel-ai-sdk) — HIGH; official Langfuse docs; confirms `experimental_telemetry: { isEnabled: true }` + LangfuseSpanProcessor
- [Langfuse pricing (langfuse.com/pricing)](https://langfuse.com/pricing) — HIGH; official; 50K events/mo free hobby tier, 30-day retention, 2 users; Pro at $199/mo; free self-host
- [@upstash/ratelimit npm (npmjs.com/package/@upstash/ratelimit)](https://www.npmjs.com/package/@upstash/ratelimit) — HIGH; current version 2.0.8 (Jan 2026)
- [Upstash Redis pricing (upstash.com/pricing/redis)](https://upstash.com/pricing/redis) — HIGH; 500K commands/mo + 256 MB free tier
- [Helicone acquisition notice (nolist.ai/item/helicone-gateway)](https://nolist.ai/item/helicone-gateway) — MEDIUM; reports March 3, 2026 Mintlify acquisition + maintenance mode — verified against Helicone's own docs redirect behavior
- [PostHog LLM Analytics (posthog.com/llm-analytics)](https://posthog.com/llm-analytics) — HIGH; official; 100K events/mo free + 30-day retention
- [Anthropic Claude pricing (platform.claude.com/docs/en/about-claude/pricing)](https://platform.claude.com/docs/en/about-claude/pricing) — HIGH; official; Haiku 4.5 at $1/$5 per 1M tokens
- [Gemini 3.1 Flash TTS launch (blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-1-flash-tts/)](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-1-flash-tts/) — HIGH; official; April 15, 2026 GA public preview
- [Groq model deprecation docs (console.groq.com/docs/deprecations)](https://console.groq.com/docs/deprecations) — HIGH; authoritative on what's retired; needed for the "Groq model hardcode risk" concern
- `.planning/codebase/STACK.md` — existing stack (confirmed dead-weight packages)
- `.planning/codebase/CONCERNS.md` — existing security and rate-limiting gaps (sections "Client-secret is not real auth", "No rate limiting on paid TTS/feedback/transcribe endpoints", "In-memory rate limiter resets on cold start")
- `.planning/PROJECT.md` — v1 Active items 41-46 (the three gaps)

---

*Stack research for: Masonic Ritual AI Mentor v1 delta*
*Researched: 2026-04-20*
*Overall confidence: HIGH on AI SDK migration, Gateway use, Helicone avoidance, authoring tactics. MEDIUM on exact Upstash promotion trigger (user-count heuristic). LOW on nothing critical — no LOW-confidence claims are load-bearing for the roadmap.*
