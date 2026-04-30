# Masonic Ritual AI Mentor

## What This Is

A private, invite-only web app that helps Masonic officers memorize and rehearse their ritual parts with an AI practice partner. A user unlocks their lodge's encrypted ritual file, takes any officer role, and practices — the app voices the other officers with TTS, listens while they speak via STT, and scores accuracy with a word-level diff against the authoritative text. The candidate's relationship is with the ritual text itself: the diff is the feedback. It is built for Shannon's lodge plus a small number of invited lodges who want to adopt it.

## Core Value

A Masonic officer can reliably rehearse their ritual parts — at any hour, with no other brother available — and come out of the session more confident that their memorization is accurate to their lodge's working.

## Requirements

### Validated

<!-- Existing capabilities inferred from the codebase map (see .planning/codebase/). These shipped to the pilot and are relied upon. -->

- ✓ **Encrypted ritual delivery** — `.mram` binary format (AES-256-GCM + PBKDF2) bundling cipher text, plain text, style tags, and optional pre-rendered Opus audio — existing
- ✓ **Client-side ritual data plane** — ritual content decrypted only on-device; re-encrypted at rest in IndexedDB with a per-device key; server never sees plaintext — existing
- ✓ **Ritual upload + practice flow** — drag-drop `.mram` → passphrase unlock → persist sections → Rehearsal and Listen modes at `/practice?doc=<id>` — existing
- ✓ **Rehearsal engine with AI officers** — Role-based TTS playback for non-user roles; STT capture + word-level diff scoring + `DiffDisplay` for the user's role; rehearsal state machine in `src/lib/rehearsal-decision.ts` — existing
- ✓ **Listen-through mode** — Full-ceremony playback using pre-baked audio when available, live TTS otherwise — existing
- ✓ **Multi-engine TTS (Gemini default)** — Dispatcher in `src/lib/text-to-speech.ts` across Gemini (3-model fallback chain), Google Cloud TTS, ElevenLabs, Deepgram, Kokoro, Voxtral, browser — existing
- ✓ **STT via Groq Whisper + Web Speech** — Unified `STTEngine` interface; `api/transcribe/route.ts` proxies Groq with Masonic vocabulary prompt — existing
- ✗ **Rehearsal coaching LLM** — *removed in PR #69 (commit d660c98)*. Original `/api/rehearsal-feedback` route + roast-persona feedback flow deleted. Replacement direction: STT Quality Pipeline (see Active). The candidate's relationship is with the ritual text (diff), not with an AI commentator.
- ✓ **Pilot authentication** — magic-link sign-in via Resend, 30-day session JWT in httpOnly cookie, `LODGE_ALLOWLIST` gate, shared-secret header on `/api/*` — existing
- ✓ **Offline authoring pipeline** — dev-only `/author` UI + `scripts/build-mram-from-dialogue.ts --with-audio` bakes `{slug}-dialogue.md` pairs into Gemini-voiced `.mram` files — existing
- ✓ **Performance tracking** — per-session IndexedDB history with trend analysis at `/progress` — existing
- ✓ **Voice management / cloning** — Voxtral voice setup + cloning at `/voices` — existing
- ✓ **Race-free audio playback** — monotonic `playToken` guard in `tts-cloud.ts` prevents voice overlap on rapid taps — existing
- ✓ **Mobile screen wake lock** — idempotent wake-lock with auto-reacquire on visibilitychange — existing
- ✓ **Hardened request path** — CSP, security headers, CORS origin allowlist, shared-secret header, sliding-window rate limit, origin-spoofing-resistant client-IP derivation — existing
- ✓ **Vercel deployment** — `masonic-ritual-ai-mentor.vercel.app`, Fluid Compute assumed by in-memory rate limiter — existing

### Active

<!-- v1 public-launch scope: invite-only beyond Shannon's lodge. Hypotheses until shipped. -->

- [ ] **Craft degree content complete** — EA, FC, and MM degree rituals fully baked (text + cipher + Gemini audio) in Shannon's lodge's working
- [ ] **Installation ceremony baked** — Annual officer installation ritual available for practice in Shannon's lodge's working
- [ ] **Officer lectures / charges baked** — Individual lectures and charges (WM, SW, JW duties, etc.) available as standalone practice units
- [ ] **STT Quality Pipeline** — Replaces deleted Phase 5 (Coach Quality Lift, removed PR #69). Make the upstream STT signal trustworthy so the existing diff-based scoring doesn't need an LLM commentator: (1) preview-bake REPL with autoplay + per-line notes/flag/approve state + hash-invalidation on regen, (2) Whisper `verbose_json` confidence filter, (3) Masonic-vocabulary prompt biasing (base + per-degree sidecar), (4) optional LLM post-correction with a "preserve stumbles" prompt + 20-recording validation gate, (5) A/B harness comparing Groq Whisper variants. Strategic detail: `~/.gstack/projects/Masonic-Ritual-AI-Mentor/ceo-plans/2026-04-26-stt-quality-pipeline.md`
- [ ] **Cost safeguards** — Pre-baked-audio-first defaults, per-user/per-day caps on paid AI routes, budget alerting so a runaway loop or curious user can't produce a surprise bill
- [ ] **Abuse safeguards** — Per-invited-user rate limits (not just IP), monitoring/visibility for unusual usage spikes, and auth hardening so the shared-secret header isn't the only gate on `/api/*`
- [ ] **Invite-friendly onboarding polish** — The existing magic-link + lodge-passphrase flow works reliably end-to-end for an outside lodge's officer on first contact (no hand-holding required, but staying in the current architecture)

### Out of Scope

<!-- Explicitly excluded from v1 with reasoning — prevents re-adding. -->

- **Self-serve lodge signup** — v1 stays email-invite-only via `LODGE_ALLOWLIST`; public/self-serve registration defers until the invited-lodge model is proven
- **Multi-working content system** — v1 bakes Shannon's lodge's working only; supporting UGLE, PHA, Canadian, other US GL workings from day one is deferred (would require content-tagging architecture not yet designed)
- **Hosted / self-serve authoring** — `.mram` baking stays offline and dev-only; no public `/author` UI in v1 (copyright + quality control concerns, and ritual-text scrutiny requires a trusted author)
- **Native mobile apps** — PWA only; no iOS or Android App Store builds in v1 (wake-lock and screen-awake work well enough in mobile browser)
- **Appendant bodies** — Craft lodge only; no Scottish Rite, York Rite, Shrine, OES rituals (scope and jurisdictional variance)
- **Payments / subscriptions** — v1 is free to invited lodges; no billing infrastructure (scale doesn't justify it, and billing complicates the invite-only trust model)
- **Hundreds-of-lodges scale** — Architecture stays pilot-scale (in-memory rate limit, single Vercel project); Redis/Upstash migration defers until real demand appears

## Context

**Technical environment:**
- Next.js 16.2.3 App Router monolith, TypeScript 5.9.3 strict, React 19.2.3, Tailwind 4 (config-less).
- Deployed on Vercel Fluid Compute at `masonic-ritual-ai-mentor.vercel.app`.
- Browser-owned data plane: Web Crypto (AES-GCM) + IndexedDB + Web Speech API + MediaRecorder.
- Seven TTS engines wired; Gemini is the default with a three-preview-model fallback chain.
- Paid AI surface: Gemini TTS, Google Cloud TTS, ElevenLabs, Deepgram, Kokoro (self-host), Voxtral (Mistral), Groq Whisper STT. Groq Llama / Mistral are still SDK-installed but no longer wired (the rehearsal-feedback route was removed in PR #69). Phase 5 STT pipeline may re-enable Groq Llama in the post-correction pass — gated by validation set.

**Prior exploration and incidents (from memory):**
- Prior CSO audit remediated unauthenticated API proxy risk, CORS, secrets exposure, Next.js CVEs; layered-defenses instincts come from there.
- Gemini TTS voice-cast preamble has historically leaked into audio — `voice-cast.ts` and bake pipeline are the load-bearing mitigations.
- Formal dogfood/trace-review verification pipeline used on prior AI work is available and should be reused for LLM feedback quality work.
- Type-system anonymization + hashed-user-id analytics pattern exists in this codebase for privacy-preserving telemetry.

**Known soft spots going into v1:**
- `TTSEngineSelector.tsx` and `GeminiPreloadPanel.tsx` are currently unmounted (Gemini-default flow bypasses them) — if ever remounted, behavior needs re-verification.
- `@ai-sdk/anthropic`, `@ai-sdk/react`, `ai`, `natural`, `uuid` in `package.json` are dead weight; cleanup candidate.
- Rate limiter is in-memory per Vercel instance — fine for pilot but a known upgrade path.
- ~~LLM feedback quality is the headline pilot complaint~~ — Coach feature was removed in PR #69. Replacement direction (per 2026-04-26 CEO review) is the STT Quality Pipeline: make the upstream signal trustworthy so the diff is feedback enough.

**Users:**
- v0/pilot user is Shannon (WM/officer in his lodge).
- v1 users are officers at 1–3 invited outside lodges, each brought in by email invitation.

## Constraints

- **Jurisdiction**: v1 ritual content is Shannon's lodge's working only — other workings defer to post-v1 with a content-system redesign.
- **Authoring**: All `.mram` baking is solo (Shannon), offline, dev-only. No public author tool in v1; no shared authoring circle.
- **Scale**: Designed for pilot-scale throughput (handful of lodges, low QPS). Architecture may fail at hundreds-of-lodges and that's acceptable for v1.
- **Tech stack**: Next.js 16 App Router on Vercel stays. No framework migrations during v1.
- **Security**: Ritual content must never reach the server in plaintext — the client-owned data plane is load-bearing for trust with invited lodges. Any v1 feature that would break that invariant is out of scope.
- **Budget**: v1 is free to invited lodges. Cost safeguards exist to cap Shannon's personal AI-bill exposure, not to monetize.
- **Timeline**: No hard deadline. Ship when quality bar is met, not by a specific date.
- **Privacy**: Pilot allowlist is sensitive (enumeration protected by 200-on-non-allowlisted). Analytics/telemetry added for v1 must not leak ritual content or lodge identities server-side.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| v1 stays email-invite-only (no self-serve signup) | Proven architecture, keeps trust model tight, lets Shannon personally vet outside lodges | — Pending |
| v1 covers Shannon's lodge's working only | Avoids premature multi-working content architecture; one good working beats three mediocre ones | — Pending |
| Solo authoring only; `/author` stays dev-only | Author quality is critical; shared authoring needs copyright + review tooling not in scope | — Pending |
| Native mobile deferred to post-v1 | PWA + wake-lock covers the "officer with phone on the rail" use case | — Pending |
| ~~LLM feedback quality is the coach-quality investment; TTS/STT/diff judged good enough~~ → Reversed 2026-04-26 | Coach feature deleted in PR #69. New direction: invest in STT quality so the diff itself becomes trustworthy. Candidate's relationship is with the ritual text, not with an AI commentator. | Validated 2026-04-26 (CEO review) |
| Cost/abuse safeguards layered (pre-bake + per-user caps + monitoring + auth hardening) | Three equal-weight fears: surprise bill, invited-user misuse, shared-secret exfiltration | Validated (Phase 2 shipped) |
| Stay on Vercel Fluid Compute + in-memory rate limit | Pilot scale (≤10 lodges) doesn't justify Redis/Upstash migration yet | — Pending |
| Phase 5 reframed: Coach Quality Lift → STT Quality Pipeline (2026-04-26) | Better product position: a faithful mirror of the ritual text beats an AI grader for the devotional/memorization use case. Lower latency, lower cost, no hallucination risk. See ceo-plans/2026-04-26-stt-quality-pipeline.md | Validated 2026-04-26 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-26 after CEO review reframed Phase 5 from Coach Quality Lift → STT Quality Pipeline. Coach feature was already removed in PR #69; the new direction makes the upstream STT signal trustworthy rather than rebuilding an LLM commentator.*
