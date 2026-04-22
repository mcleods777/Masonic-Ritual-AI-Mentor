# Feature Research

**Domain:** AI-coached ritual memorization — pilot → invited small beta (≤10 lodges)
**Researched:** 2026-04-20
**Confidence:** MEDIUM–HIGH (ecosystem patterns are well-documented; Masonic-specific specifics are author-authoritative only)

---

## Framing

This milestone is **brownfield**. The pilot already ships:

- Rehearsal mode (TTS + STT + word-level diff + LLM feedback)
- Listen mode (pre-baked or live-TTS playback)
- Upload / passphrase unlock / IndexedDB persistence
- Magic-link auth + `LODGE_ALLOWLIST` + shared-secret header
- Per-session performance history at `/progress`
- Voice cloning + seven-engine TTS dispatcher
- Dev-only `/author` baking pipeline (solo, offline)

Research question is NOT "what should an AI-memorization tool do?" (we already know).
Research question IS: **what does a product need when you stop being its only user and start inviting outside officers?**

The research below divides features along two axes:

1. **Stage expectation:** Table stakes vs differentiator vs anti-feature for a pilot → invited-beta transition.
2. **v1 gap alignment:** Does this feature attack content-baking throughput, LLM feedback quality, or cost/abuse safeguards — the three declared gaps?

Every feature is annotated with its **current pilot status** (Shipped / Partial / Missing) and its **v1 disposition** (In-scope / Deferred / Anti-feature).

---

## Feature Landscape

### Table Stakes (Invited Users Expect These)

Missing any of these makes the product feel unready for outside officers, even though the pilot already works for Shannon alone.

| Feature | Why Expected at This Stage | Complexity | Pilot Status | v1 Disposition | Notes |
|---|---|---|---|---|---|
| **Magic-link auth that works on first try** | Outside officer gets the email, clicks, arrives signed-in — no support loop | LOW | Shipped | In-scope (polish) | Resend delivery already works; v1 is about checking edge cases (expired link, wrong browser, Gmail clipping) |
| **Lodge passphrase unlock on mobile** | Officer opens the `.mram` on their phone with fat thumbs and an email-forwarded passphrase | LOW | Shipped | In-scope (verify) | Passphrase UX on mobile needs QA pass — not a feature, a bar to clear |
| **First-run "what do I do" screen** | Officer lands on `/upload` with no prior context, needs to know the next action | LOW | Missing (exists as `/walkthrough` but not auto-routed) | In-scope | Route new-session users to walkthrough automatically or inline-embed first steps on `/upload` |
| **Graceful "you've been revoked" state** | Shannon removes a lodge from `LODGE_ALLOWLIST`; that user's existing session needs to stop working without crashing | LOW | Missing | In-scope | Middleware already has the gate; need a reasonable 403 UI rather than a redirect loop |
| **Bug-report path** | Outside officer hits a bug — they will not file a GitHub issue; they need a one-tap "tell Shannon" | LOW | Missing | In-scope | `mailto:` with pre-filled subject + session ID + browser UA. Do NOT ship ritual content in the payload |
| **Admin visibility for Shannon** | Shannon needs to know: who signed in recently, how many sessions, which LLM calls spiked, what errors happened | MEDIUM | Missing | In-scope | Minimal dashboard: sign-ins, API call counts, error counts, per-user caps status. Privacy-respecting (hashed user ID, no ritual text) |
| **Per-user usage caps** | A curious officer running a loop must not create a surprise bill | MEDIUM | Partial (IP-based limiter only) | In-scope | Switch from IP-keyed to user-keyed (hashed email) + daily/weekly caps on paid routes |
| **Budget alerting** | Shannon wants an email when daily spend crosses $X | LOW | Missing | In-scope | Can be as simple as a Vercel cron that tallies API route counters and emails Shannon on threshold |
| **Error reporting telemetry** | When an invited officer hits an uncaught exception, Shannon needs to see it before the officer emails him | MEDIUM | Missing | In-scope | Lightweight — window.onerror + unhandledrejection → `/api/error-log` endpoint with hashed user + stack, no ritual text |
| **LLM feedback that is actually specific** | Invited officer uses rehearsal coaching, sees "try harder" generic roast, loses trust. Must name the actual stumble | HIGH | Partial (Groq → Mistral fallback works; output quality weak) | In-scope (headline gap) | Prompt engineering + eval dataset + few-shot exemplars + structured output (what was missed, where, suggested reinforcement) |
| **Feedback-on-feedback** | Officer flags "that feedback was useless" → Shannon gets a signal for prompt iteration | LOW | Missing | In-scope | Thumbs-up/thumbs-down on each feedback response; server stores hashed user + feedback ID + rating + (optional) text reason; never the underlying ritual text |
| **Pre-baked audio as default** | Outside officers should get instant playback, not the latency + cost of live TTS | MEDIUM | Partial (pipeline exists; coverage incomplete) | In-scope | Every shipped `.mram` must ship with pre-baked Opus for every line. Live TTS becomes the fallback, not the primary path |
| **Session persistence across reloads** | Officer refreshes mid-rehearsal, does not lose their place | MEDIUM | Partial (IndexedDB persists content, not rehearsal position) | In-scope (polish) | Store current line index per doc+role in IndexedDB; restore on mount |
| **Progress view that survives revoke** | Officer who practiced 30 times last month wants to see that history | LOW | Shipped | In-scope (verify) | `/progress` already persists locally; confirm it survives a revoke gracefully (local-only data is fine to retain) |
| **"Is my mic even working?" check** | STT-based practice is useless with a muted mic or wrong device | LOW | Missing | In-scope | Pre-rehearsal mic-check step: speak a known phrase, show transcription back, confirm before starting |

### Differentiators (Why This Product vs Anki + a Recording)

These are where Masonic Ritual AI Mentor is meaningfully different from generic memorization tooling.

| Feature | Value Proposition | Complexity | Pilot Status | v1 Disposition |
|---|---|---|---|---|
| **Role-aware TTS (other officers are voiced)** | Rehearsal partner fidelity — the user is the officer, the AI is the floor | HIGH | Shipped | In-scope (maintain) |
| **Word-level diff scoring against authoritative text** | Unlike flashcards, the system knows *exactly* where you stumbled | HIGH | Shipped | In-scope (leverage for feedback) |
| **Lodge-working awareness** | Ritual text is baked to one lodge's working — not a generic transcription | HIGH | Shipped (Shannon's lodge) | In-scope (expand coverage: EA/FC/MM + Installation + officer lectures) |
| **Client-side data plane** | Ritual text never leaves the device in plaintext — a meaningful trust claim to invited lodges | HIGH | Shipped | In-scope (maintain — do not break) |
| **Offline practice** | Once the `.mram` is unlocked and audio is pre-baked, the officer can practice on a plane or at a lodge with bad wifi | MEDIUM | Partial (needs PWA service worker + embedded audio coverage) | In-scope |
| **Role-swap practice** | Officer can practice WM, then SW, then JW against the same baked ritual, without re-uploading | LOW | Shipped | In-scope (verify) |
| **Gavel / action cues** | Ritual has non-speech events (gavel knocks, standing, sign-giving). These are modeled, not ignored | MEDIUM | Shipped (gavel count + action field) | In-scope (maintain) |
| **Voice cloning for lodge-specific reference voices** | Eventually, the IM's voice in the user's lodge could voice the prompts. Strong "this feels like my lodge" differentiator | HIGH | Shipped (Voxtral + /voices) | In-scope (keep available; not required for v1) |
| **Structured feedback (diff-grounded, not free-form LLM)** | Feedback cites the specific word-level diff, not a general vibe. Addresses the "generic/condescending" complaint | MEDIUM | Missing | In-scope (headline gap) |
| **Reference-voice-grounded few-shot for LLM coaching** | Feedback LLM is primed with exemplars from Shannon's own coaching voice — trusted tone by construction | MEDIUM | Missing | In-scope (headline gap) |
| **Privacy-respecting admin analytics** | Unlike generic SaaS dashboards, this one must not see ritual text — hashed user IDs and event counts only | MEDIUM | Missing | In-scope |
| **Pre-baked zero-API-call playback** | Invited officer's 20-minute listen-through session costs Shannon $0 in TTS calls | HIGH | Shipped (per-line Opus embedded in `.mram`) | In-scope (expand coverage) |

### Anti-Features (Requested, Problematic at This Stage)

These are features that a well-meaning advisor or officer might suggest, but that harm the product at the invited-beta stage.

| Feature | Surface Appeal | Why Problematic | Alternative |
|---|---|---|---|
| **Social / leaderboards / rankings** | "Gamify it — let officers compete" | Ritual memorization is a private devotional act; leaderboards trivialize it. Also exposes who is behind in their parts — a political minefield in a lodge | No social surface. Personal progress only, visible only to the user. `/progress` already does this |
| **Shared progress / "my officers' accuracy"** | "The WM wants to see if his officers are practicing" | Breaks the devotional privacy boundary; invites coercive dynamics; also requires server-side ritual correlation | Each officer sees their own progress. If a lodge wants group accountability, that happens in person |
| **Public user profiles** | "Let officers find each other" | Masonic discretion norms; no one wants their practice stats indexed. Also increases attack surface | No profiles. Email is used only for auth |
| **Native mobile app (iOS/Android)** | "It's an app, ship it to the store" | App Store review, ritual-content policy risk, signing keys, build pipeline — all yak-shaving for zero user benefit over PWA | PWA with manifest, wake-lock, add-to-home-screen. Already mostly works |
| **Payments / subscriptions** | "If lodges pay, you'll know they value it" | No payment infra to maintain, no refund handling, no Stripe webhook drama. Also changes trust dynamics: free + invited = gift; paid = vendor | Free to invited lodges. Revisit only after WAY past 10-lodge scale |
| **Hosted / self-serve authoring** | "Let each lodge bake their own ritual" | Quality control, copyright review, ritual-text scrutiny — none of which scale to crowd. Also a content-moderation obligation | Solo authoring stays. Baking-throughput *tooling* (below) helps Shannon go faster, not others |
| **Multi-working support (UGLE, PHA, Canadian, Scottish Rite) from day one** | "Why not support every working?" | Requires a content-tagging architecture not yet designed; one good working beats three mediocre ones; jurisdictional scrutiny differs by GL | Shannon's lodge's working only in v1. Multi-working is a post-v1 architecture discussion |
| **Self-serve lodge signup / public registration** | "Let word-of-mouth drive growth" | Opens attack surface, content-leak risk, ritual-text-as-public-good debates. Also mismatched to trust-based invite model | `LODGE_ALLOWLIST` + Shannon's personal vetting. Growth comes from successful invited lodges |
| **Real-time collaboration (two officers practicing the same line together)** | "Like a video call but for ritual" | Massive complexity (WebRTC, turn servers, sync state); wrong model anyway — ritual practice is individual rehearsal, not duet | No. If two officers want to practice together, they meet at the lodge |
| **LLM-generated ritual content ("fill in the blanks")** | "Let the AI help write the missing parts" | Authoritative text is literally the whole point; generated text is the opposite of authoritative. Catastrophic trust loss on first hallucination | LLM is used only for feedback *about* the user's performance against a baked, human-verified text |
| **Voice-cloning users' own voices as the TTS for their own role** | "Hear yourself doing it right" | Feedback dynamic is wrong — the point is to *produce* the words, not listen to yourself already saying them. Also uncanny and expensive | Reserved for lodge-reference voices (e.g., the IM's actual voice), not self-voicing |
| **Public marketing analytics / "X lodges are using us"** | "Social proof for future invites" | Lodge identities are sensitive; making the user list public breaks the trust compact | Shannon's private admin dashboard only. External comms say "small invited pilot" |
| **Generic-purpose LLM chat ("ask anything about ritual")** | "Like ChatGPT but Masonic" | Hallucination risk, authority-claim risk, ritual-secrecy boundary issues. Also scope-sprawl | LLM is constrained to one job: feedback-on-stumble, grounded in the diff |
| **Fancy skins / theming system** | "Let each lodge have their own theme" | Complexity tax, maintenance tax, zero learning benefit | Keep the existing Cinzel + Lato + neutral palette. One good theme beats a theming system |
| **Third-party integrations (Google Calendar, Outlook, Slack)** | "Remind officers to practice" | Each integration is an OAuth flow + maintenance tax. Masonic calendars are local to the lodge | System-level calendar via `ics` download at most, and only if asked |
| **Discussion forum / comments on rituals** | "Officers can ask questions" | Content moderation, ritual-text-in-plaintext leakage, scope creep | If officers have questions, they ask their mentor/WM. Not a feature |

---

## v1 Gap-Specific Features

The three declared gaps each need concrete feature work. Below is what to build for each.

### Gap 1: Content-Baking Throughput (Shannon's solo authoring speed)

Goal: Shannon bakes EA, FC, MM, Installation, and officer lectures without burning weeks on each. **Author-tooling only, not self-serve.**

| Feature | Pilot Status | v1 Disposition | Value |
|---|---|---|---|
| **Batch-bake script for multiple dialogues** | Partial (per-file script exists) | In-scope | Run `npm run bake -- --all` across a directory of `{slug}-dialogue.md` pairs; parallelizes Gemini calls with a shared rate limiter |
| **Dialogue-md linter pre-flight** | Partial (`author-validation.ts` exists) | In-scope | Fail fast if speaker codes don't match voice cast, style tags are malformed, or action fields are unparsed — before wasting Gemini calls |
| **Style-tag suggest for new lines** | Shipped (`api/author/suggest-styles`) | In-scope (verify) | Already exists; make sure it's wired to the batch flow |
| **Audio cache invalidation scoped to changed lines** | Missing | In-scope | Invalidation script already exists (`scripts/invalidate-audio.ts`) but scoping it to "only these N lines changed" saves hours. Content-hash per line → re-bake only deltas |
| **Bake-preview UI** | Missing | In-scope | Local `/author/preview` that plays baked Opus for the line you're editing, so Shannon can sanity-check voice-cast assignment without a full re-run |
| **Line-level regeneration** | Missing | In-scope | `npm run bake -- --line <slug>:<line_id>` — re-bake one line with a new voice-cast preamble override, inject into the existing `.mram` |
| **Voice-cast pinning audit** | Partial | In-scope | Script that diffs `{slug}-voice-cast.json` against `MRAMMetadata.voiceCast` across all shipped `.mram` files, flags drift |
| **Baking progress + cost ticker** | Missing | In-scope | During `--with-audio`, print live tally: lines baked, Gemini calls, estimated cost, ETA |
| **Dialogue-md templating for Installation / lectures** | Missing | In-scope | Reference dialogue-md skeletons per ritual type (three-degree work vs installation vs lecture) so Shannon starts from structure, not a blank file |

Deferred / anti-feature:

- **Self-serve web authoring UI** — anti-feature (see above)
- **Collaborative authoring circle** — deferred (post-v1)
- **Auto-parse Mackey / reference texts** — deferred; lodge-working variance makes this unreliable

### Gap 2: LLM Feedback Quality (the "generic/condescending" complaint)

Goal: Feedback is specific to the actual stumble, trustworthy enough that Shannon will stake his name on it when the WM from an invited lodge reads it.

| Feature | Pilot Status | v1 Disposition | Value |
|---|---|---|---|
| **Structured feedback output schema** | Missing | In-scope | LLM returns JSON (`{missed_words, substituted_words, inserted_words, suggested_drill, confidence}`), not free-form roast. UI renders structure, not prose |
| **Diff-grounded prompting** | Partial (prompt has access to diff) | In-scope | Prompt explicitly cites the word-level diff in the user message; feedback LLM *must* reference specific missed words. System prompt forbids generic output |
| **Few-shot exemplars from Shannon's own coaching** | Missing | In-scope | 10–20 curated (stumble → ideal feedback) pairs from Shannon's own teaching voice. Primes Gemini/Groq into the right tone by construction |
| **Eval dataset (gold-standard stumbles + ideal feedback)** | Missing | In-scope | ~30 hand-annotated rehearsal traces with gold feedback; regression test that new prompt/model changes don't regress the eval |
| **Feedback-on-feedback UI (thumbs up/down)** | Missing | In-scope (table-stake duplicate) | Signal for prompt iteration; also a privacy-clean telemetry source (hashed user + rating, never the ritual text) |
| **Trace-review pipeline** | Available from prior AI work | In-scope (reuse) | Log every feedback call with input diff + output, review a sample weekly, catch regressions |
| **Persona toggle (roast / mentor / plain)** | Missing | Deferred | Tempting but adds dimensions to the eval matrix; default to "mentor" voice for v1, add toggles post-v1 if signal demands it |
| **A/B comparison harness** | Missing | Deferred | Structured A/B on prompt variants is nice-to-have; for v1, Shannon's dogfooding + eval dataset + thumbs signal is enough |
| **Audio-grounded feedback (TTS of the feedback itself)** | Missing | Deferred | Reading feedback is fine; voicing it is premium. Not v1 |
| **Model routing by stumble severity** | Missing | Deferred | "Big stumbles get Gemini Pro, small get Groq" is a cost-quality knob, but adds testing burden. v1 keeps one route |
| **Reference-ritual-aware prompting** | Missing | In-scope | Prompt includes the authoritative reference line (plain text) alongside the user's attempt — not just the diff. Lets the LLM cite what *should* have been said |

Anti-features:

- **Roast-only persona** — the existing "roast-style persona" appears to BE the problem. The persona isn't a differentiator at this stage; it's an obstacle to invited-officer trust. Make mentor voice the default; keep roast as a hidden toggle or remove entirely.
- **LLM-generated ritual correctness claims** — the LLM must NOT say "the correct word was X." The diff says that. The LLM comments on *why it mattered* and *how to drill it*.

### Gap 3: Cost / Abuse Safeguards (layered defense)

Goal: Shannon can invite a lodge without lying awake wondering if someone is burning his API budget.

| Feature | Pilot Status | v1 Disposition | Value |
|---|---|---|---|
| **Pre-baked-audio-first default** | Partial | In-scope | Live TTS becomes fallback only. Every shipped `.mram` has Opus for every line |
| **Per-user daily cap on paid routes** | Missing | In-scope | Hashed-email-keyed counter, sliding window. 429 with friendly "you've hit today's limit — try tomorrow" message |
| **Per-user per-hour burst cap** | Missing | In-scope | Catches runaway scripts faster than daily caps |
| **Per-lodge aggregate cap** | Missing | In-scope | Sum across all users in a lodge; catches a lodge-wide spike |
| **Budget alert cron** | Missing | In-scope | Vercel cron tallies daily API counters, emails Shannon on threshold |
| **Kill switch for paid routes** | Missing | In-scope | Env-var-flipped "emergency mode" that rejects all paid TTS/LLM calls with a static "practice offline" message. Pre-baked audio still works |
| **Auth hardening beyond shared-secret** | Partial | In-scope | Per-route: require valid JWT session AND shared secret. Rotate shared-secret on a cadence. Consider short-lived signed tokens per call |
| **Rate-limit visibility for admin** | Missing | In-scope | Admin dashboard shows who's near their cap, who's been rate-limited today |
| **Audit log of paid API calls** | Missing | In-scope | Append-only log: timestamp, hashed user, route, token count / char count, cost estimate. Queryable by Shannon |
| **Invite management UI** | Missing | In-scope | Shannon-only route to view current `LODGE_ALLOWLIST`, add/remove emails, see per-email last-sign-in + usage. Replaces editing env vars |
| **Invite revocation flow** | Missing | In-scope | Remove from allowlist → current sessions get 403 on next API call → graceful UI |
| **Telemetry privacy boundary** | Partial (pattern exists in codebase) | In-scope | All telemetry uses hashed user IDs; no ritual text ever leaves the device; add an explicit audit step to verify |
| **Anomaly alerts** | Missing | Deferred (v1.x) | "User X did 10× their normal" — nice-to-have, not v1. Simple thresholds suffice for ≤10 lodges |
| **Upstash Redis migration for rate limiting** | Missing | Deferred | Architecturally correct but not needed at ≤10 lodges on Fluid Compute. Defer until in-memory proves insufficient |
| **Credit / token quota per lodge** | Missing | Deferred | Closer to a billing model; premature for free-to-invited phase |

---

## Feature Dependencies

```
Pre-baked audio coverage (Gap 1 + Gap 3)
    └──requires──> Content baking throughput tooling (Gap 1)
    └──enables───> Per-user usage caps being tolerable (users mostly hit cache)
    └──enables───> Offline practice
    └──enables───> Kill switch being non-catastrophic (fallback still works)

Per-user usage caps (Gap 3)
    └──requires──> Hashed-user-ID keying (privacy pattern already in codebase)
    └──requires──> Switching rate limiter from IP to user (changes `rate-limit.ts`)
    └──enables───> Admin dashboard "who's near cap" view

Admin dashboard (Table stake + Gap 3)
    └──requires──> Telemetry endpoint that is privacy-clean
    └──requires──> Shannon-only route gating (admin allowlist, not just pilot allowlist)
    └──enables───> Budget alert cron (same data source)
    └──enables───> Invite management UI (same dashboard shell)
    └──enables───> Feedback-on-feedback aggregation view

Structured LLM feedback output (Gap 2)
    └──requires──> Prompt re-engineering with few-shot exemplars
    └──requires──> Eval dataset of stumbles (hand-curated, ~30)
    └──enables───> Trace-review pipeline (gold-standard comparison)
    └──enables───> A/B prompt testing post-v1
    └──conflicts with──> Current "roast-style persona" (likely displaced)

Feedback-on-feedback UI (Gap 2)
    └──requires──> Feedback call instrumentation (request_id)
    └──enables───> Prompt iteration driven by real invited-user signal
    └──enables───> LLM feedback quality regression detection

Invite management UI (Gap 3)
    └──requires──> Admin dashboard shell
    └──requires──> `LODGE_ALLOWLIST` becoming DB-backed, not env-var-backed
    └──enables───> Invite revocation flow

Bug-report path (Table stake)
    └──requires──> Nothing (mailto: is zero-infra)
    └──enables───> Invited-officer trust loop — they can reach Shannon without feeling like they're imposing
```

### Dependency Notes

- **Pre-baked audio coverage is upstream of nearly everything cost-related.** If EA/FC/MM/Installation ship fully pre-baked, the cost model shifts from "live TTS per session" to "near-zero marginal cost." This is the single highest-leverage v1 investment.
- **Admin dashboard is the connective tissue.** Four separate table-stake features (usage visibility, budget alerts, invite management, feedback-on-feedback aggregation) all share a dashboard shell. Build the shell once.
- **LLM feedback is a self-contained vertical.** Few-shot exemplars + eval dataset + structured output can be built independently of the dashboard and content work. Good candidate for parallel phase.
- **`LODGE_ALLOWLIST` currently in env vars is a hard dependency on editor-deploy for invite changes.** Moving this to DB-backed is a prerequisite for anything like an invite management UI.

---

## MVP Definition (this milestone = v1)

### Launch With (v1)

Ruthlessly minimal list. Every item here directly addresses a declared gap or a table-stake-at-invite-stage.

- [ ] **EA, FC, MM baked + Installation + officer lectures** — core content coverage gap
- [ ] **Structured, diff-grounded LLM feedback with few-shot exemplars + eval dataset** — feedback quality gap
- [ ] **Feedback-on-feedback thumbs UI + server-side aggregation** — quality signal loop
- [ ] **Per-user (hashed-email-keyed) daily + hourly caps on paid routes** — cost gap
- [ ] **Admin dashboard for Shannon:** recent sign-ins, per-user API usage, error count, per-feedback-rating tally — visibility gap
- [ ] **Budget alert cron** — cost gap
- [ ] **Kill switch for paid routes** — cost gap
- [ ] **Auth hardening (session + shared secret both required; secret rotation)** — abuse gap
- [ ] **Invite management UI + revocation flow** — abuse gap
- [ ] **Audit log of paid API calls** — cost + abuse gap
- [ ] **Error reporting telemetry with privacy boundary** — table stake
- [ ] **Bug-report mailto path** — table stake
- [ ] **First-run "what do I do" onboarding** — table stake
- [ ] **Mic-check pre-rehearsal step** — table stake
- [ ] **Session position persistence across reloads** — table stake
- [ ] **Baking throughput tooling:** batch-bake, line-level regen, dialogue-md linter pre-flight, cost ticker — author throughput gap
- [ ] **Pre-baked audio coverage verified across all shipped content** — cost gap + differentiator

### Add After Validation (v1.x)

- [ ] **Persona toggle (mentor / plain / roast)** — add only if invited users ask for variation
- [ ] **Anomaly alerts (X times normal)** — add when threshold alerts generate too much noise
- [ ] **PWA offline mode polish + add-to-homescreen** — if real invited users want it
- [ ] **Voice cloning with lodge reference voices (IM, PGM, etc.)** — if a lodge volunteers a reference voice
- [ ] **A/B harness for prompt variants** — when feedback-on-feedback signal is strong enough to drive it

### Future Consideration (v2+)

- [ ] **Multi-working support (UGLE, PHA, etc.)** — requires content-tagging architecture
- [ ] **Upstash Redis rate limiting** — when in-memory proves insufficient
- [ ] **Shared-authoring circle** — only with a designed review workflow
- [ ] **Native mobile** — only if PWA genuinely insufficient
- [ ] **Appendant-body rituals (Scottish Rite, York Rite)** — scope + jurisdictional variance
- [ ] **Self-serve lodge signup** — only after invited-beta model is proven

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---|---|---|---|
| EA/FC/MM content baked | HIGH | HIGH (authoring labor) | P1 |
| Installation + officer lectures baked | HIGH | HIGH | P1 |
| Structured LLM feedback | HIGH | MEDIUM | P1 |
| Few-shot exemplars | HIGH | LOW (10–20 hand-curated pairs) | P1 |
| Eval dataset | MEDIUM (internal) / HIGH (quality) | MEDIUM (~30 annotated cases) | P1 |
| Feedback-on-feedback thumbs | MEDIUM | LOW | P1 |
| Per-user daily caps | HIGH (Shannon's peace of mind) | MEDIUM (refactor rate-limit.ts) | P1 |
| Admin dashboard (minimal) | HIGH (Shannon) | MEDIUM | P1 |
| Budget alert cron | HIGH (Shannon) | LOW | P1 |
| Kill switch | HIGH (Shannon) | LOW | P1 |
| Auth hardening | HIGH | MEDIUM | P1 |
| Invite management UI | MEDIUM (Shannon) | MEDIUM | P1 |
| Audit log | MEDIUM (Shannon) | LOW | P1 |
| Error reporting | MEDIUM | LOW | P1 |
| Bug-report mailto | MEDIUM | LOW (near-zero) | P1 |
| First-run onboarding | MEDIUM | LOW | P1 |
| Mic-check step | MEDIUM | LOW | P1 |
| Session position persistence | LOW | LOW | P2 |
| Baking throughput tooling | HIGH (Shannon — unblocks P1 content) | MEDIUM | P1 |
| Pre-baked audio coverage | HIGH | HIGH (depends on content) | P1 |
| Persona toggle | LOW | LOW | P3 |
| Anomaly alerts | LOW | MEDIUM | P3 |
| PWA offline polish | MEDIUM | MEDIUM | P2 |
| Voice cloning (lodge refs) | LOW (v1) / HIGH (v1.x) | MEDIUM | P3 |
| A/B prompt harness | LOW (v1) | HIGH | P3 |

**Priority key:**
- **P1** — Must ship for v1. Blocks the milestone.
- **P2** — Ship if time permits. Does not block v1.
- **P3** — Defer. Revisit post-v1 based on invited-user signal.

---

## Competitor Feature Analysis

| Feature | Anki (spaced repetition) | Language-learning AI (Langua, LinguaLive) | Masonic Ritual AI Mentor |
|---|---|---|---|
| Scoring user's performance | Self-rated (user says "hard/easy") | Pronunciation + semantic scoring | Word-level diff against authoritative text — objective |
| Domain-authoritative content | User-authored decks (no authority) | Generic language corpora | Per-lodge baked ritual working — authoritative |
| Privacy / data plane | AnkiWeb sync server-side (opt-in) | Typically cloud-sent for LLM scoring | Client-owned; server never sees ritual text |
| Offline | Yes (core design) | Usually no (cloud LLM required) | Yes, when pre-baked audio is present |
| Role-based practice | No (cards are scalar) | No | Yes — multi-speaker, user takes any role |
| Invite / trust model | Free, public | Freemium | Invite-only, personally vetted |
| AI-coached feedback | No native feedback | Yes — tone, grammar | Yes — diff-grounded, ritual-specific (this is the differentiation) |
| Gamification | Minimal (streaks) | Heavy (XP, leagues) | None — deliberate anti-feature |
| Admin / cost controls | N/A (user-pays or free) | Subscription-gated | Shannon-paid + layered safeguards (this milestone) |
| Authoring model | Crowd + user | Centralized corpora | Solo, offline, dev-only |

Our product is the only one in this tri-cornered space (diff-authoritative + client-privacy + AI-coached) that a Masonic officer would actually trust with their ritual text. Cost and invite model reflect that positioning.

---

## Confidence Assessment

| Area | Confidence | Reason |
|---|---|---|
| Table stakes at invite stage | HIGH | General SaaS/beta ecosystem patterns are well-documented; the admin-visibility / bug-report / caps pattern is universal |
| LLM feedback quality approach | MEDIUM-HIGH | Research confirms few-shot + structured output + eval dataset is the standard playbook; domain-specific gold dataset is author-specific |
| Anti-features (no social/rankings/native) | HIGH | Masonic privacy norms + stated constraints + Shannon's explicit out-of-scope list all align |
| Authoring throughput features | MEDIUM | Inferred from `/author` pipeline inspection; actual bottleneck-per-ritual is Shannon-specific and should be verified with him |
| Cost safeguard layering | HIGH | 2026 LLM cost-control best practices are well-established (per-virtual-key budgets, hierarchical caps, kill switches) |
| Differentiator list | HIGH | Directly observable from existing architecture + market gap |

---

## Sources

Ecosystem-pattern research:

- [LLM cost safeguards / per-user rate limits / budget alerts 2026 best practices](https://portkey.ai/blog/budget-limits-and-alerts-in-llm-apps/)
- [Agent runaway costs — setting LLM budget limits](https://relayplane.com/blog/agent-runaway-costs-2026)
- [LLM cost forecasting — token budgets and rate limits](https://dailybitsbyai.com/uncategorized/llm-cost-forecasting-control-token-budgets-and-rate-limits/)
- [Reduce LLM cost and latency — 2026 guide](https://www.getmaxim.ai/articles/reduce-llm-cost-and-latency-a-comprehensive-guide-for-2026/)
- [Few-shot AI-generated feedback evaluation (PT education, mixed-methods)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12811036/)
- [Evaluating trust in AI, human, and co-produced feedback](https://arxiv.org/pdf/2504.10961)
- [Comparing GenAI and teacher feedback — student perceptions](https://www.tandfonline.com/doi/full/10.1080/02602938.2025.2502582)
- [AI effectiveness in language testing and feedback](https://www.sciencedirect.com/science/article/pii/S2590291125006205)
- [Assessing LLMs for automated feedback in programming problems](https://arxiv.org/html/2503.14630)
- [Anki — privacy, offline, spaced repetition architecture reference](https://apps.ankiweb.net/)
- [SaaS user management 2026 patterns](https://www.zluri.com/blog/saas-user-management)
- [Beta program invite/onboarding patterns (Centercode release notes)](https://whatsnew.centercode.com/weekly-patch---april-5-2026-2omIrS)

Internal / authoritative for this project:

- `.planning/PROJECT.md` — Active requirements, out-of-scope list
- `.planning/codebase/ARCHITECTURE.md` — Pilot architecture and shipped capabilities
- `.planning/codebase/STACK.md`, `.planning/codebase/INTEGRATIONS.md`, `.planning/codebase/CONCERNS.md` — referenced for existing patterns

---

*Feature research for: Masonic Ritual AI Mentor v1 (invited small beta, ≤10 lodges)*
*Researched: 2026-04-20*
