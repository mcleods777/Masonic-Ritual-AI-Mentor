# Project Research Summary

**Project:** Masonic Ritual AI Mentor — v1 (invited-lodge milestone)
**Domain:** Privacy-first, invite-only AI rehearsal coach (brownfield Next.js 16 monolith on Vercel)
**Researched:** 2026-04-20
**Confidence:** HIGH

## Executive Summary

This is a brownfield milestone. The pilot already ships the whole rehearsal loop (encrypted `.mram` + client-side data plane + multi-engine TTS + STT + word-level diff + coaching LLM + magic-link auth + `LODGE_ALLOWLIST`). Research question is narrow and consistent across all four dimensions: **how does this architecture evolve to support 1–3 invited outside lodges without breaking the invariant that ritual plaintext never reaches the server?** Three gaps drive scope — content coverage (EA/FC/MM + Installation + lectures), LLM feedback quality (the #1 pilot complaint, currently a roast-persona Groq Llama→Mistral fallback with no evals or traces), and layered cost/abuse safeguards (pre-bake-first, per-user caps, budget alerts, auth hardening beyond the shared-secret header).

The research produced a single high-conviction path. **Activate the already-installed-but-dead `ai` + `@ai-sdk/anthropic` packages behind Vercel AI Gateway (BYOK Groq/Mistral + optional Haiku 4.5 for hard stumbles), with structured-output Zod feedback**, protected by **per-user (hashed-email) rate limits + session-bound client token + PII-free audit log + budget-alert cron**, fed by **content-addressed bake cache + batch orchestrator + localhost-only preview** on the authoring side. Every recommendation is delta — no framework migrations, no Redis, no third-party LLM observability SaaS at v1. All three gap fixes compose without breaking the browser-owned data plane.

Key risks are concentrated and named. The single highest-stakes failure mode is the LLM inventing or contradicting authoritative ritual text in front of an invited Past Master — word-of-mouth in Masonic circles is small-world and unforgiving. The second-highest is shared-secret abuse amplifying into a surprise AI bill once the bundle lives on dozens of devices. The third is content-parity drift (cipher vs. plain) in solo-authored files, which shows up as phantom scoring failures that Brothers will blame the app for. Each has a specific, layered mitigation across prompt constraint + post-hoc validation + eval corpus + per-user caps + parity validator — and all three feed into the same "Shannon-facing admin visibility + audit log" substrate that the roadmap should build once and reuse.

## Key Findings

### Recommended Stack

The stack delta is small and opinionated. Three packages already in `package.json` but unused (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/react`) are the tell — the original design called for AI SDK, the shortcut path became the feedback-quality gap. Activate them, add `zod` and `p-limit`, delete `natural` / `uuid` / `@ai-sdk/react`. Everything else is configuration.

**Core technologies (add/activate):**
- **Vercel AI SDK v6** (`ai@^6`) — Replace raw fetch in `/api/rehearsal-feedback` with `generateObject({ model, schema })`; declarative Groq→Mistral fallback; built-in OTel. Already installed. Run `npx @ai-sdk/codemod upgrade v6`.
- **Vercel AI Gateway (BYOK)** — Zero-markup router; $5/mo free credits; unified dashboard (spend / requests-by-model / TTFT / per-API-key logs). Keeps existing Groq/Mistral keys. Gateway is LLM-only — Gemini TTS stays on direct API.
- **`@ai-sdk/anthropic` + Claude Haiku 4.5** — Second tier for "hard stumbles" where Llama 3.3 produces generic output. $1/$5 per 1M tokens; projected <$5/mo at pilot scale.
- **`zod@^3.23`** — Structured feedback schema (`{missed_words, substituted_words, inserted_words, suggested_drill, confidence}`) — eliminates regex response parsing.
- **`p-limit@^6`** — Concurrency-cap parallel Gemini bake in `build-mram-from-dialogue.ts`; combined with `gemini-3.1-flash-tts-preview` (GA April 15, 2026) cuts EA initiation bake from ~30 min → ~5 min.
- **No new infra.** Upstash Redis, Vercel KV, Langfuse, Helicone, LangSmith, PostHog are all explicitly deferred or rejected at ≤10-lodge scale.

See `.planning/research/STACK.md` for version pins, alternatives, and the installation progression by scope.

### Expected Features

Features divide along a brownfield axis (Shipped / Partial / Missing) × a stage axis (table-stakes-at-invite vs. differentiator vs. anti-feature). The pilot already ships every differentiator (role-aware TTS, diff scoring, client-side data plane, pre-baked audio, voice cloning, offline practice). The gap is table stakes for invited users plus the three declared v1 gaps.

**Must have (table stakes — missing or partial at pilot):**
- First-run "what do I do" onboarding + mic-check pre-rehearsal step
- Per-user (hashed-email-keyed) daily + hourly caps on paid routes
- Admin dashboard shell (sign-ins, API usage, error counts, feedback ratings) — connective tissue for 4 separate table-stake features
- Budget alert cron + kill switch for paid routes
- Auth hardening (session + shared secret both required; rotation runbook)
- Invite management UI + revocation flow (currently env-var redeploy only)
- Error reporting telemetry with privacy boundary + one-tap bug-report mailto
- Graceful "you've been revoked" state
- Session position persistence across reloads

**Must have (v1 gap deliverables):**
- EA / FC / MM + Installation + officer lectures baked in Shannon's lodge's working
- Structured, diff-grounded LLM feedback with few-shot exemplars + eval dataset + thumbs-up/down UI
- Pre-baked audio coverage verified across all shipped content (the cost-model inversion)
- Baking throughput tooling: batch-bake, line-level regen, dialogue-md linter pre-flight, cost ticker

**Should have (differentiators — mostly already shipped, maintain):**
- Client-side data plane (the trust claim to invited lodges)
- Diff-grounded feedback rather than free-form LLM narration (directly addresses "generic/condescending" complaint)
- Privacy-respecting admin analytics (hashed user IDs, no ritual text server-side)

**Defer (v1.x or v2):**
- Persona toggle (mentor / plain / roast)
- Anomaly alerts ("X did 10× their normal")
- A/B prompt harness (Shannon's dogfood + eval dataset + thumbs signal is sufficient for v1)
- Voice cloning with lodge reference voices (keep available; not required)
- Upstash Redis / stateful one-time magic links (promote when pilot >30 users OR abuse incident)
- Multi-working support (UGLE / PHA / Canadian)

**Anti-features (explicitly reject):**
- Social / leaderboards / shared progress — breaks devotional privacy; political minefield in a lodge
- LLM-generated ritual content — authoritative text is the whole point; first hallucination = catastrophic trust loss
- Self-serve authoring / hosted `/author` — copyright + quality review + scope explosion
- Keeping roast-only persona — appears to BE the feedback-quality problem; default to mentor voice

See `.planning/research/FEATURES.md` for the full matrix with pilot-status and P1/P2/P3 prioritization.

### Architecture Approach

The architecture delta fits into three well-defined seams that compose without breaking the browser-owned data plane. Every new component has been invariant-audited (see `ARCHITECTURE.md` § "Invariant-Preservation Summary" — no proposal transmits or persists ritual plaintext on any server).

**Major components (new or modified):**
1. **`src/lib/feedback-prompt.ts` (NEW, client-side)** — Moves prompt assembly from the API route into the browser. Route receives `{variantId, prompt, promptHash}`, not raw diff inputs. Enables variant-swap experimentation without changing the server contract.
2. **`src/lib/audit-log.ts` (NEW, server)** — PII-free JSONL structured logs (userHash, route, promptHash, completionHash, cost, latency — never bodies). Shared substrate for feedback eval (Gap 1) and cost/abuse visibility (Gap 2). Writes to `console.log`; Vercel log drain is the transport.
3. **`feedbackTraces` IndexedDB store (NEW, client)** — Encrypted-at-rest (same AES-GCM key as `sections`) store of `{prompt, completion, rating, note}` tuples. Powers `/dev/feedback-eval` A/B UI and exports to `scripts/feedback-eval.ts` for offline batch runs against a Shannon-rated gold set.
4. **Client-token + per-route per-user rate limits (MODIFIED middleware + rate-limit.ts)** — Short-lived (1h) JWT `X-Client-Token` with hashed-user `sub`, layered on top of the existing shared secret. `rateLimit()` gains a `userKey` parameter with IP as fallback; applied to every paid route (currently absent on TTS/transcribe/feedback).
5. **`src/lib/budget-accounting.ts` (NEW, server)** — In-memory per-user ring buffer of estimated-cost events; hourly + daily aggregates; Resend alert on threshold. Interface designed for later Upstash swap.
6. **`rituals/_bake-cache/` + `scripts/bake-all.ts` (NEW, offline)** — Content-addressed Opus cache keyed on `sha256(voice + style + text + modelId + KEY_VERSION)`. Single-line edits rebake 1 line, not 155. Orchestrator supports `--since <git-ref>`, `--resume`, `--parallel N`.
7. **`scripts/preview-bake.ts` (NEW, offline)** — Localhost-only server streaming cached Opus for in-editor scrubbing before re-encrypting `.mram`. Dev-only guard identical to existing `/author/_guard.ts`.

Dependencies and suggested build order are in `ARCHITECTURE.md` § "Suggested Build Order" (Phase A shared prereqs → B cost/abuse → C authoring → D feedback quality). Phase C (authoring) is independent of B/D and should start in calendar time alongside them because content labor is the longest pole.

See `.planning/research/ARCHITECTURE.md` for contracts, data-flow diagrams, anti-patterns, and the scale-threshold table for when each in-memory component should be swapped to a durable store.

### Critical Pitfalls

From `PITFALLS.md` — ordered by "what will destroy trust first if it happens to an invited lodge."

1. **LLM contradicts authoritative ritual text (Pitfall 3).** A Past Master sees the coach invent a wrong word or hallucinate a line and the tool's credibility is permanently gone in that lodge. Prevention is layered: (a) constrain the prompt to diff-only — no ritual explanation, no quoting words not in the reference line; (b) post-hoc validation filter — every capitalized word in the feedback must appear in the reference text, the user's attempt, or a safe-coaching allowlist; (c) user-facing "this feedback seems wrong" button wired to an author inbox; (d) Shannon-rated eval corpus of ≥50 stumbles as a release-blocking regression gate. Belongs in Phase 2.
2. **Shared-secret abuse amplified by invite expansion (Pitfall 1).** `NEXT_PUBLIC_RITUAL_CLIENT_SECRET` is extractable in seconds from the bundle; ≤10 lodges = dozens of devices = no longer plausibly obscure. Prevention: session JWT check *inside* paid routes (not just middleware), per-hashed-email rate limits + daily budget caps, a single-env-var kill switch, and a rehearsed secret-rotation runbook. Belongs in Phase 1.
3. **Runaway feedback loop / session without stop condition (Pitfall 2).** Wake-lock + auto-advance + mic-hot-on-table = 10,000+ Mistral calls by morning (the published $47K-agent-loop failure mode, scaled down). Prevention: session-level step ceiling in `RehearsalMode`, server-side per-session budget 429, inactivity timeout on wake-lock, day-over-day spend-spike cron alert. Phase 1.
4. **Style-tag / voice-cast preamble leaks into baked audio (Pitfall 4).** A Brother hears "Worshipful Master speaking in a calm tone" read aloud; the leak ships to entire lodges because bake is distributed. Prevention: audio-duration-anomaly detector (cheap, catches 80%), STT round-trip diff in bake pipeline (definitive, <$1 per ritual), version-pin Gemini model per line in `.mram` metadata. Phase 3.
5. **Cipher/plain parity drift in authored `.mram` (Pitfall 5).** Typo fix in plain text forgets cipher update; Brother scores 60% while speaking perfectly. Prevention: authoring-time validator (same speaker / action tags / word-count-ratio) blocking bake on failure; per-line error-rate telemetry from production (doubles as LLM eval corpus); bake-time CHANGELOG between versions. Phase 3.
6. **Copyright/jurisdictional exposure on marketing surface (Pitfall 7).** Ritual text in screenshots, blog posts, or any telemetry that captures innerText. Prevention: `X-Robots-Tag: noindex` app-wide; landing-page audit for dummy-text-only; explicit no-innerText rule on any future analytics tool; `.mram` routes excluded from middleware matcher (preserve existing). Phase 0.
7. **No in-place correction for distributed `.mram` (Pitfall 6).** Typo found in Week 3 means full rebake + redistribute + hope Brothers re-import. Prevention: build-hash visible in UI footer, `/api/content/latest-hashes` endpoint for stale-version banner, lightweight errata JSON sidecar for one-word fixes without full rebake. Phase 4.

See `.planning/research/PITFALLS.md` for Moderate (8–12), Minor (13–15), the Technical Debt table, the Integration Gotchas matrix, the "Looks Done But Isn't" pre-invite checklist, and the full pitfall→phase mapping.

## Convergences and Divergences

### High-conviction convergences (all four dimensions agree)

These are where STACK, FEATURES, ARCHITECTURE, and PITFALLS independently point to the same conclusion. Treat these as settled.

- **Activate the dead AI SDK packages first.** STACK says the migration is <1 day and shrinks the feedback route ~40%. ARCHITECTURE designs the `feedback-prompt.ts` + variant-dispatch around AI SDK primitives. FEATURES makes "structured, diff-grounded feedback" a P1. PITFALLS identifies the current unstructured-prose output as the vector for hallucinated ritual claims. Every path through the research converges on "turn on the AI SDK + AI Gateway, schema-first."
- **Defer Upstash Redis / stateful KV.** STACK: "not worth a network hop for ≤10 lodges." ARCHITECTURE: in-memory with documented swap-in contract. FEATURES: "Upstash migration" is explicitly deferred. PITFALLS: at pilot scale, per-user daily caps make Fluid Compute cold-start reset a non-issue — the caps are the load-bearing protection, not the window. The one-line promotion path is preserved.
- **Per-user (hashed-email) rate limits + budget caps are Phase 1.** All four research files agree this is the single highest-leverage cost/abuse control and that IP-based limiting is insufficient.
- **Anti-hosted-authoring.** STACK doesn't propose any self-serve tool. FEATURES lists self-serve authoring as an anti-feature. ARCHITECTURE restricts all new preview tooling to localhost + `_guard.ts`. PITFALLS (Pitfall 7) makes the copyright/jurisdictional case for keeping it offline.
- **Few-shot exemplars + Shannon-rated gold eval set are the LLM-quality unlock.** FEATURES P1, ARCHITECTURE's Tier-3 offline harness, PITFALLS' release-blocking regression gate, STACK's observability plan all assume this corpus exists.
- **Pre-baked audio coverage is upstream of nearly everything cost-related.** If every shipped `.mram` has Opus per line, the cost model inverts from "per-rehearsal TTS spend" to "near-zero marginal." This one investment enables tolerable per-user caps, non-catastrophic kill switches, and offline practice.

### Divergences / tensions that need an explicit resolution

These are where research files don't agree or where a tempting recommendation from one dimension violates a constraint surfaced by another. Resolve these at roadmap time — don't let them sit.

- **LLM observability tool choice.** STACK offers Langfuse Cloud hobby tier as an optional upgrade for prompt-quality evaluations ("turn on `experimental_telemetry`, point OTel at Langfuse"). **ARCHITECTURE explicitly rejects this**: every such platform ingests full prompt + completion text, the feedback prompt includes expected ritual words, and even 1–2 words aggregated across thousands of events is a reconstruction risk. PITFALLS 7 reinforces: any telemetry that captures innerText is a copyright-and-trust red line. **Resolution: reject third-party LLM-body observability for v1.** Use the AI Gateway dashboard (metadata-only) + the client-side `feedbackTraces` IDB store + the offline `scripts/feedback-eval.ts` harness. A tiny server-side aggregator over `audit-log.ts` hashes fills any remaining gap. Langfuse comes back onto the table only if the project ever self-hosts AND decides sensitive bodies are acceptable at that deployment boundary — not at v1.
- **Claude Haiku 4.5 as "hard stumble" tier.** STACK recommends it (<$5/mo, better instruction-following than Llama 3.3 on complex diffs). FEATURES P3s "model routing by stumble severity" as deferred ("adds testing burden; v1 keeps one route"). **Resolution: ship Haiku 4.5 as a second variant inside the existing variant-dispatch mechanism, not as a runtime severity router.** Pick the variant from the `variantId` that the eval harness selects per-case during tuning, so it's a prompt-engineering knob (Phase 2) rather than a runtime branch. Shannon-rated eval determines whether Haiku earns a production slot at all.
- **"Persona toggle."** FEATURES defers it to v1.x; PITFALLS argues the roast persona is actively causing the quality problem. **Resolution: drop the roast default in v1** (make "mentor" voice the default variant in `feedback-prompt.ts`); keep roast as a hidden variantId available for A/B comparison in `/dev/feedback-eval` only. No user-facing toggle in v1.
- **When to revoke-harden auth.** PITFALLS 10 suggests "Phase 0 if invited-beta requires strong revocation as a trust signal, Phase 4 otherwise." ARCHITECTURE Phase B places client-token issuance in Phase 1. FEATURES P1s "invite management UI + revocation flow." **Resolution: ship client-token + per-user rate limits in Phase 1 (mechanically sufficient to block a revoked user's paid calls within the next API request), and ship the full stateful-session-with-revocation-list + invite management UI in Phase 4 when the admin dashboard shell lands anyway.** The P1 mechanism is "good enough" revocation; the Phase 4 work is the polish.
- **RehearsalMode.tsx refactor timing.** PITFALLS flags this as a pre-v1 requirement ("Phase 2 LLM-quality work WILL touch it; split setup/advance/STT lifecycle before starting") because the current 1,511-line monolith risks regressing auto-advance. ARCHITECTURE doesn't call it out explicitly. **Resolution: treat the RehearsalMode split as a Phase 2 prerequisite, not a nice-to-have** — bundle it with the `feedback-prompt.ts` client-side move. The session-step-ceiling from PITFALLS 2 is the excuse to touch it; do the split in the same PR.
- **`LODGE_ALLOWLIST` env var vs. DB-backed.** FEATURES notes DB-backing is prereq for the Invite Management UI. ARCHITECTURE accepts env-var through v1. PITFALLS tolerates at ≤10 lodges. **Resolution: stay on env var for v1**, surface the per-Brother granularity guidance in onboarding docs, and promote to a durable store at the same moment client-tokens evolve to stateful sessions (natural paired transition in Phase 4 or post-v1).

## Implications for Roadmap

### Suggested phase structure

Five phases. Phase 0 is ruthlessly small (pre-invite cleanup that blocks absolutely nothing else). Phase 1 is the cost/abuse safety floor — ship before anything iterative. Phase 2 is the LLM-quality vertical — the headline user-facing win. Phase 3 is content + authoring — runs in parallel with Phase 2 on calendar time because it's Shannon's labor, not eng work on shared files. Phase 4 ships the admin substrate that 4 separate features have been waiting on.

### Phase 0 — Pre-invite hygiene
**Rationale:** Short, zero-risk, unblocks invitations. Anything in here that slips into a later phase is easy to forget once heads-down on LLM work.
**Delivers:**
- Delete `natural`, `uuid`, `@ai-sdk/react` (keep `ai` + `@ai-sdk/anthropic`)
- Run `npx @ai-sdk/codemod upgrade v6` (no functional change; aligns idioms)
- `X-Robots-Tag: noindex` across the app; audit `/landing.html` for any real ritual text
- iCloud Private Relay magic-link test on a real iPhone
- Confirm `.mram` routes stay excluded from the middleware matcher; add a test
- Document the shared-secret rotation runbook (from PITFALLS); rehearse it in staging
**Avoids:** Pitfalls 7 (copyright), 13 (dead packages), Integration Gotcha (iCloud Private Relay).
**Research flag:** None — standard hygiene.

### Phase 1 — Cost/abuse safety floor
**Rationale:** Cannot invite another lodge until the runaway-loop and shared-secret-amplification failure modes are bounded. Also the shared substrate (`audit-log.ts`, rate-limit per-user key) that Phases 2 and 4 reuse.
**Delivers:**
- `src/lib/audit-log.ts` (shared; PII-free JSONL via `console.log`)
- `src/lib/rate-limit.ts` gains per-user key + IP fallback; applied to every paid route
- `src/lib/budget-accounting.ts` + daily/per-user thresholds + Resend alert cron
- `/api/auth/client-token` (1h JWT with hashed-user `sub`); `src/lib/api-fetch.ts` attaches both headers; middleware verifies both
- Session-level step ceiling in `RehearsalMode` + server-side per-session 429; inactivity timeout on wake-lock
- `RITUAL_EMERGENCY_DISABLE_PAID` kill-switch env var wired into middleware
**Uses:** `ai@^6` (Phase 0 codemod), Zod (rate-limit config), Resend (alerts — already installed).
**Avoids:** Pitfalls 1, 2, 8, 11 (layered defense).
**Research flag:** None — CONCERNS.md + PITFALLS already ground the design.

### Phase 2 — LLM feedback quality lift
**Rationale:** The headline pilot complaint. The dimension Shannon said he'd stake his name on when inviting an outside lodge's WM. Must come after Phase 1 because every iteration hammers the route being rate-limited.
**Delivers:**
- RehearsalMode.tsx split (setup / advance / STT lifecycle) — prereq, not polish
- `src/lib/feedback-prompt.ts` with variants (default `mentor-v1`; `coach-v1`, `terse-v1`, `roast-v1` for A/B only)
- `/api/rehearsal-feedback/route.ts` rewritten on AI SDK v6 + `generateObject({ schema: FeedbackSchema })` behind AI Gateway (BYOK Groq/Mistral; Claude Haiku 4.5 as second-tier variant)
- `feedbackTraces` IDB store (requires `idb-schema.ts` extract — CONCERNS prereq)
- `/dev/feedback-eval` A/B UI (thumbs + notes; guard identical to `/author`)
- `scripts/feedback-eval.ts` offline batch-eval harness
- Shannon-rated gold set of ≥50 stumbles (the release gate)
- Post-hoc hallucinated-noun validation filter (capitalized word must appear in reference/attempt/allowlist, else fall back to diff-derived static message)
- User-facing "this feedback seems wrong" button → author inbox endpoint
- Voxtral fallback banner in Listen/Rehearsal (PITFALLS 12, `TODOS.md` P3)
**Uses:** `ai@^6`, `@ai-sdk/anthropic`, `zod`, AI Gateway dashboard (observability).
**Implements:** ARCHITECTURE Gap 1 (three-tier client→server-hash→offline-eval pattern).
**Avoids:** Pitfalls 3 (hallucination against authoritative text), 12 (silent fallback).
**Research flag:** Deeper prompt-engineering research may be useful once the gold set exists and a baseline variant is measured. `/gsd-research-phase` on "few-shot exemplar structure for domain-authoritative-text coaching" could help; skip if Shannon's dogfood ratings converge quickly.

### Phase 3 — Content + authoring throughput (runs in parallel with Phase 2 on calendar time)
**Rationale:** Content labor is the longest pole. Baking EA + FC + MM + Installation + lectures is Shannon-hours, not eng-hours; it should not serialize behind Phase 2. No shared files with Phase 2 except the Gemini TTS model list.
**Delivers:**
- `rituals/_bake-cache/` + `src/lib/bake-cache.ts` (content-addressed; gitignored)
- `scripts/bake-all.ts` orchestrator (`--since`, `--dry-run`, `--resume`, `--parallel N`)
- `gemini-3.1-flash-tts-preview` prioritized in `GEMINI_TTS_MODELS`; 2.5 kept as fallback
- `build-mram-from-dialogue.ts` uses cache + alternate-engine path for ultra-short lines (fixes the silent-skip bug in `bake.log`)
- `p-limit` concurrency cap on Gemini calls
- `author-validation.ts` cipher/plain parity validator (speaker / actions / word-count ratio)
- Bake-time audio-duration-anomaly detector; optional STT round-trip diff per line
- Per-ritual vocabulary hint for `/api/transcribe`
- `scripts/preview-bake.ts` local preview (localhost; dev-only guard)
- `src/lib/idb-schema.ts` extract (shared between `storage.ts` and `voice-storage.ts`) — enables Phase 2's IDB schema bump
- Content bakes: EA, FC, MM, Installation, officer lectures (Shannon labor; ongoing)
**Uses:** `p-limit@^6`; existing Gemini + Voxtral + Groq Whisper.
**Avoids:** Pitfalls 4 (preamble leak), 5 (parity drift), 14 (STT vocab drift), 15 (IDB schema drift).
**Research flag:** None — pattern is well-scoped; content labor is the constraint, not knowledge.

### Phase 4 — Admin substrate + distribution polish
**Rationale:** Connective tissue. Four table-stake features share the same dashboard shell (usage visibility, budget alerts detail, invite management, feedback-on-feedback aggregation). Also houses the stale-version banner and full stateful-session revocation — both of which need a Shannon-only admin surface anyway.
**Delivers:**
- Admin dashboard shell (Shannon-only magic-link-gated route); reads anonymized event telemetry + `audit-log.ts` output
- Invite management UI (view / add / remove emails; last-sign-in + per-user usage)
- Stateful session with server-side revocation list (promotes to durable store — this is the trigger event for Vercel KV or Upstash, per STACK's "defer until" rule)
- `/api/content/latest-hashes` endpoint + "your ritual has been updated" client banner
- `.mram` version + build hash in UI footer
- First-run onboarding routing; mic-check step; bug-report mailto; "you've been revoked" UI
- Anonymized event telemetry (hashed-user-keyed; redaction-layer unit-tested against PITFALLS 7)
**Uses:** Vercel KV or Upstash (first durable-store need triggers the "one-line swap").
**Avoids:** Pitfalls 6 (no in-place correction), 9 (no admin visibility), 10 (no clean revocation).
**Research flag:** Light — dashboard shell patterns are standard. `/gsd-research-phase` optional on "Vercel KV vs. Upstash at first-durable-store moment" if the team wants to revisit STACK's call.

### Phase ordering rationale

- **Phase 0 before anything iterative** because dead packages and noindex are the kind of thing that gets skipped when the team is heads-down in a prompt rewrite.
- **Phase 1 before Phase 2** because the first use of a rewritten feedback route is exactly where you want rate limits already in place — and Phase 2's eval harness will fire hundreds of variant-A/B calls.
- **Phase 2 and Phase 3 in parallel on calendar time** — they touch disjoint files (feedback route + client IDB vs. bake scripts + MRAM file layout) except for the `idb-schema.ts` extract (Phase 3 produces; Phase 2 consumes — sequence within the parallel window).
- **Phase 4 last** because it depends on `audit-log.ts` (Phase 1), the feedback-rating signal (Phase 2), and the per-ritual hash story (Phase 3). It also lands at the moment durable-store is first justified by a feature (stateful sessions), so Upstash/KV enters the architecture exactly once.

### Research flags

**Needs deeper research during planning:**
- **Phase 2 (optionally):** Few-shot exemplar structure / stumble taxonomy for domain-authoritative-text coaching. Triggered once the gold-set baseline is measured. Skip if Shannon's dogfood ratings converge quickly on a mentor-v1 variant.
- **Phase 4 (optionally):** Vercel KV vs. Upstash at the first-durable-store moment. STACK makes a call, but the team may want to revisit at decision time with current pricing.

**Standard patterns (skip research):**
- **Phase 0, 1, 3.** All patterns are either already designed in `ARCHITECTURE.md` or standard industry shapes (AI SDK migration, per-user rate limits, content-addressed caches, post-hoc validation filters).

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All delta recommendations verified against official 2026 docs (AI SDK v6 release notes, AI Gateway pricing, Langfuse pricing, Helicone acquisition, Gemini 3.1 Flash TTS launch, Claude Haiku 4.5 pricing, Groq deprecation docs). No LOW-confidence claim is load-bearing for the roadmap. |
| Features | MEDIUM–HIGH | Table-stakes-at-invite patterns are universal and well-documented; anti-feature calls align with Masonic privacy norms and stated constraints. Shannon-specific bottlenecks on authoring throughput are inferred from pipeline inspection and should be confirmed with him during Phase 3 planning. |
| Architecture | HIGH | Grounded in existing `.planning/codebase/*` analysis; external patterns (content-addressed caches, hashed-subject audit logs, per-route/per-user rate limits, client-side LLM eval) are standard. One LOW-confidence dependency: the cost-per-call estimator in `budget-accounting.ts` depends on upstream pricing tables that drift. |
| Pitfalls | HIGH (project-specific), MEDIUM (ecosystem) | Project-specific pitfalls grounded in CONCERNS.md, TODOS.md, bake.log, commit history, and Shannon's own stated pilot complaints. Ecosystem pitfalls grounded in 2026 post-mortems (the $47K-agent-loop piece) and academic LLM-feedback quality research. |

**Overall confidence:** HIGH.

### Gaps to address during planning

- **Shannon-specific authoring bottleneck confirmation.** FEATURES inferred bake-time pain from pipeline inspection. Confirm during Phase 3 kickoff with him whether line-level regen, batch orchestrator, or preview-bake is the highest-value first slice — might change the order within Phase 3.
- **Gold-eval rubric definition.** Phase 2 requires Shannon's rated corpus of ≥50 stumbles. The rubric itself ("stake my name on it" / "meh" / "wrong" + qualitative axes "specific to the stumble" / "non-condescending" / "actionable") needs to be frozen *before* any variant tuning, or else baseline measurement drifts. Produce the rubric as a Phase 2 Task 1 artifact.
- **Cost-per-call estimator currency.** `budget-accounting.ts` will need quarterly recalibration as upstream pricing changes. Add a note in the runbook; not a roadmap item but a recurring operational duty.
- **"What triggers full stateful sessions?" threshold.** ARCHITECTURE places this in Phase 4; PITFALLS 10 suggests Phase 0 if invited-beta requires strong revocation as a trust signal. Decide at roadmap time based on the specific outside lodges in Shannon's invite queue — a hesitant WM might want this sooner; a trusting one might not.
- **Whether Haiku 4.5 earns a production variant slot.** Assume "maybe" until the Phase 2 eval measures it. If Llama 3.3 + the structured prompt + few-shot exemplars already passes Shannon's rubric, Haiku doesn't ship — keeps v1 cheaper and simpler. Budget $5/mo in planning; be willing to spend $0.

## Sources

### Primary (HIGH confidence)
- `.planning/research/STACK.md` — v1 delta recommendations, version compatibility, installation progression, alternatives
- `.planning/research/FEATURES.md` — table stakes / differentiators / anti-features; v1 gap-specific feature lists; dependencies; MVP definition; prioritization matrix
- `.planning/research/ARCHITECTURE.md` — invariant-preserving component designs; data-flow diagrams; build order; anti-patterns; scaling thresholds
- `.planning/research/PITFALLS.md` — critical/moderate/minor pitfalls with project-specific prevention strategies; technical-debt expiry table; pre-invite checklist; pitfall→phase mapping
- `.planning/PROJECT.md` — v1 Active requirements, Out of Scope, Key Decisions, Constraints
- `.planning/codebase/*` (ARCHITECTURE, STACK, CONCERNS, INTEGRATIONS, STRUCTURE, TESTING, CONVENTIONS) — existing-system truth

### Secondary (MEDIUM confidence)
- 2026 industry publications on LLM cost safeguards, runaway-loop post-mortems, few-shot feedback evaluation, hallucination prevention (full URL list in source files' Sources sections)
- AI SDK v6 official docs + migration guide + AI Gateway capabilities docs + Langfuse integration docs

### Tertiary (LOW confidence — none load-bearing)
- Ecosystem heuristics around invite-only beta onboarding (Centercode, Zluri) — used only for cross-checking table-stake patterns

---
*Research completed: 2026-04-20*
*Ready for roadmap: yes*
