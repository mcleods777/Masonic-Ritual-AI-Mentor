# Requirements: Masonic Ritual AI Mentor (v1 invited-lodge)

**Defined:** 2026-04-20
**Core Value:** A Masonic officer can reliably rehearse their ritual parts — at any hour, with no other brother available — and come out of the session more confident that their memorization is accurate to their lodge's working.

## v1 Requirements

Requirements for the invited-lodge v1 milestone. Grouped by category; each maps to exactly one roadmap phase.

### Pre-invite Hygiene

Cleanup and baseline-hardening work that must land before any outside lodge is invited. Small, ruthless scope.

- [ ] **HYGIENE-01**: Dead package weight removed (`natural`, `uuid`, `@ai-sdk/react`, `@types/uuid`) — bundle no longer ships code paths the app doesn't use
- [ ] **HYGIENE-02**: Vercel AI SDK migrated to v6 via `npx @ai-sdk/codemod upgrade v6` — idioms align for the Phase 2 feedback rewrite
- [ ] **HYGIENE-03**: `X-Robots-Tag: noindex` set app-wide so search engines never index authenticated pages
- [ ] **HYGIENE-04**: `public/landing.html` audited — contains only dummy/redacted text; no real ritual content reaches the public surface
- [ ] **HYGIENE-05**: Magic-link sign-in verified end-to-end on an iPhone behind iCloud Private Relay (regression guard)
- [ ] **HYGIENE-06**: `.mram` routes confirmed excluded from the middleware matcher, with a test that will fail if that invariant regresses
- [ ] **HYGIENE-07**: Shared-secret rotation runbook written and rehearsed in staging — Shannon has a practiced playbook before invitations begin

### Safety (cost + abuse + auth hardening)

Layered defenses against the three fears ranked equal in questioning: surprise AI bills, invited-user misuse, and shared-secret exfiltration.

- [ ] **SAFETY-01**: Structured PII-free audit log (`src/lib/audit-log.ts`) records every paid-route call with `{hashed-user, route, promptHash, completionHash, estimated-cost, latency}` — never request or response bodies
- [ ] **SAFETY-02**: Rate limiter accepts a `userKey` parameter (hashed email) with IP as fallback; applied to every paid route (`/api/tts/*`, `/api/transcribe`, `/api/rehearsal-feedback`)
- [ ] **SAFETY-03**: Per-user daily + hourly budget caps enforced server-side; 429 response when exceeded
- [ ] **SAFETY-04**: Daily spend-spike cron alert emails Shannon via Resend when total or per-user spend exceeds thresholds
- [ ] **SAFETY-05**: Short-lived client token endpoint `/api/auth/client-token` issues a 1h JWT bound to the session with hashed-user `sub`; `src/lib/api-fetch.ts` attaches both this and the shared secret; middleware verifies both
- [ ] **SAFETY-06**: Session-level step ceiling inside `RehearsalMode` prevents runaway auto-advance loops; server-side per-session ceiling returns 429 as a belt-and-suspenders check
- [ ] **SAFETY-07**: Wake-lock auto-releases after an inactivity timeout so a left-open tab can't keep paying for TTS overnight
- [ ] **SAFETY-08**: `RITUAL_EMERGENCY_DISABLE_PAID=true` env var flips the whole app's paid surface to a static fallback message — rehearsed kill switch
- [ ] **SAFETY-09**: Paid-route handlers verify the pilot session JWT directly (not relying solely on middleware) — defense in depth against middleware-skipping paths

### STT Quality Pipeline

The 2026-04-26 CEO review reframed Phase 5: instead of building an LLM coach (the original direction was deleted in PR #69 / commit d660c98), invest in upstream STT quality so the existing diff-based scoring is trustworthy on its own. Strategic doc: `~/.gstack/projects/Masonic-Ritual-AI-Mentor/ceo-plans/2026-04-26-stt-quality-pipeline.md`.

- [ ] **STT-01**: Preview-bake REPL — `scripts/preview-bake.ts` extended with autoplay (spacebar play/pause, arrow keys for prev/next, optional auto-advance on audio end), per-line notes sidecar `rituals/{slug}-review.json`, and line-status state machine (`unmarked` | `flagged-review` | `flagged-regen` | `approved`) with keyboard shortcuts (`a` approve, `f` flag, `r` flag-regen, `n` open note) and filter modes (all / unmarked / flagged / approved). Audio sha256 stored at approval time so a re-bake auto-downgrades `approved` → `unmarked` (release gate hash invalidation).
- [ ] **STT-02**: `verify-content --require-approval` flag refuses to release if any committed ritual has lines with `status !== "approved"`. Wires into Phase 4 release verification.
- [ ] **STT-03**: Whisper STT calls send a `prompt` parameter assembled from a base Masonic vocabulary file plus a per-degree vocabulary stored in `rituals/{slug}-vocabulary.json`. Per-line vocabulary is rejected as too granular (would thrash decoder bias).
- [ ] **STT-04**: Whisper STT calls request `verbose_json` and apply confidence filtering: drop segments where `no_speech_prob > 0.6` or `compression_ratio > 2.4`; flag (but don't drop) segments where `avg_logprob < -1.0`. Thresholds tunable via env config.
- [ ] **STT-05**: Optional LLM post-correction pass (Llama 3.3 70B on Groq) with a strict "preserve stumbles" prompt. Release-blocking validation gate: a 20-recording set (5 fluent + 10 stumbles + 5 mistranscriptions) must show stumble-preservation rate ≥95% before this layer can be enabled in production.
- [ ] **STT-06**: `/dev/whisper-eval` route (Shannon-only, dev-guard gated) runs both Groq Whisper variants (`large-v3` and `distil-large-v3-en`) on every practice utterance during a session, presents blind A/B labels with vote-later sidebar, and persists `{audio, reference, modelA-transcript, modelB-transcript, vote, category}` to JSONL with category breakdowns (proper nouns / archaic / scripture / common).

#### Carried forward from deleted Coach scope

- [ ] **STT-07** (was COACH-12): Voxtral / browser-TTS fallback is surfaced as a small banner when the user is on a non-default engine so silent degradation doesn't masquerade as the default experience

### Coach (DEPRECATED — feature deleted in PR #69)

~~The original Phase 5 direction. The coach feature was removed in PR #69 (commit d660c98). The 2026-04-26 CEO review locked in the STT Quality Pipeline as the replacement. These requirements are kept for historical record and traceability.~~

- ~~**COACH-01**: Prompt assembly moved to `src/lib/feedback-prompt.ts` (client-side); `/api/rehearsal-feedback` receives `{variantId, prompt, promptHash}` instead of raw diff inputs~~ — Obsolete
- ~~**COACH-02**: `/api/rehearsal-feedback/route.ts` rewritten using Vercel AI SDK v6 `generateObject({ schema })` behind Vercel AI Gateway (BYOK Groq + Mistral); structured Zod output replaces regex response parsing~~ — Obsolete
- ~~**COACH-03**: Feedback schema (`{missed_words, substituted_words, inserted_words, suggested_drill, confidence}`) is the only shape the LLM can return — coach cannot free-form into ritual explanation~~ — Obsolete
- ~~**COACH-04**: `mentor-v1` prompt variant is the production default; `roast-v1` / `terse-v1` / `coach-v1` exist only as A/B variants inside the dev-only eval UI — no user-facing persona toggle~~ — Obsolete
- ~~**COACH-05**: Post-hoc hallucinated-noun filter: any capitalized word in the LLM response must appear in the reference line, the user's attempt, or a safe-coaching allowlist — otherwise fall back to a diff-derived static message~~ — Obsolete
- ~~**COACH-06**: `feedbackTraces` IndexedDB store persists `{prompt, completion, rating, note}` encrypted-at-rest with the existing AES-GCM per-device key; never leaves the device~~ — Obsolete (idb-schema slot remains as future-use)
- ~~**COACH-07**: In-app "this feedback seems wrong" button on every feedback render; tap persists the rating + hashed trace id to the audit log and opens a prefilled mailto to Shannon~~ — Obsolete
- ~~**COACH-08**: `/dev/feedback-eval` page (Shannon-only, `_guard.ts` gated) offers thumbs/notes UI for triaging feedback traces exported from IDB~~ — Obsolete
- ~~**COACH-09**: `scripts/feedback-eval.ts` runs the current prompt variant against a local JSON gold set and prints pass/fail + diff against a baseline run~~ — Obsolete
- ~~**COACH-10**: Shannon-rated gold eval set of ≥50 stumbles exists under `evals/feedback/` and must pass a defined rubric before v1 ships (release-blocking regression gate)~~ — Obsolete (analog: STT-05 validation set, but smaller — 20 recordings, narrower scope)
- ~~**COACH-11**: `RehearsalMode.tsx` split into setup / advance / STT-lifecycle submodules before the feedback rewrite — prerequisite, not polish~~ — Obsolete
- ~~**COACH-12**: Voxtral / browser-TTS fallback is surfaced as a small banner when the user is on a non-default engine so silent degradation doesn't masquerade as the default experience~~ — **Carried forward as STT-07**

### Content (ritual coverage in Shannon's working)

All baked in Shannon's lodge's working; all ship with pre-baked Opus per line so live TTS is never required for a first-time rehearsal.

- [ ] **CONTENT-01**: Entered Apprentice (EA) degree baked — cipher + plain + Gemini audio + voice cast pinned
- [ ] **CONTENT-02**: Fellow Craft (FC) degree baked — cipher + plain + audio + voice cast
- [ ] **CONTENT-03**: Master Mason (MM) degree baked — cipher + plain + audio + voice cast
- [ ] **CONTENT-04**: Annual officer installation ceremony baked
- [ ] **CONTENT-05**: Officer lectures / charges baked as standalone practice units (WM charge, SW/JW duties, any core lectures specified by Shannon's lodge)
- [ ] **CONTENT-06**: Every shipped `.mram` verified to have per-line Opus embedded (no live-TTS fallback required for a first-time rehearsal)
- [ ] **CONTENT-07**: Every shipped `.mram` passes the cipher/plain parity validator before release — no phantom scoring failures from cipher-only edits

### Author (offline baking throughput)

Solo-author tooling so Shannon can bake five rituals worth of content without spending weekends on it.

- [x] **AUTHOR-01**: Content-addressed bake cache at `rituals/_bake-cache/` keyed on `sha256(voice + style + text + modelId + KEY_VERSION)`; single-line edits rebake 1 line, not 155 (Phase 3 Plan 05, commits 0b0c4ea + 5e32cb9)
- [ ] **AUTHOR-02**: `scripts/bake-all.ts` orchestrator with `--since <git-ref>`, `--dry-run`, `--resume`, `--parallel N` flags (Phase 3 Plan 06 landed the D-06 line-level resume-state primitive — `scripts/lib/resume-state.ts` + `_RESUME.json` atomic writes in `build-mram-from-dialogue.ts`, commit 04bb0e6; Plan 03-07 will land the orchestrator itself)
- [x] **AUTHOR-03**: `gemini-3.1-flash-tts-preview` prioritized in `GEMINI_TTS_MODELS` fallback chain; older previews retained as fallback (Phase 3 Plan 05, commit 0b0c4ea — D-12 rationale comment pinned + DEFAULT_MODELS exported)
- [x] **AUTHOR-04**: Bake pipeline fixes the ultra-short-line silent-skip bug recorded in `bake.log` — lines below the Gemini minimum now route to Google Cloud TTS via `googleTtsBakeCall()` at bake time and embed OGG_OPUS bytes the same way as the Gemini path (Phase 3 Plan 06, commit 43209d2 — D-09 implementation)
- [x] **AUTHOR-05**: `src/lib/author-validation.ts` cipher/plain parity validator enforces same speaker, same action tags, and a word-count ratio band per line — bake refuses on failure (Phase 3 Plan 04 added the D-08 bake-band severity='error' check in commit 76c565f; Phase 3 Plan 06 wired `validateOrFail()` into build-mram-from-dialogue.ts as the pre-render gate that exits 1 on any severity='error' issue, commit 43209d2)
- [x] **AUTHOR-06**: Audio-duration-anomaly detector flags any baked line whose duration is implausibly short or long given its text length (catches voice-cast preamble leak into the audio) — `addAndCheckAnomaly()` per-ritual rolling median with strict >3.0× / <0.3× hard-fail and first-30-samples skip (Pitfall 6); pure math helpers extracted to `scripts/lib/bake-math.ts` with 12 unit tests (Phase 3 Plan 06, commits 332b483 + 04bb0e6 — D-10 implementation)
- [x] **AUTHOR-07**: Optional STT round-trip diff per line in bake pipeline — cheap last-line-of-defense against audio that doesn't match the text — `--verify-audio` opt-in flag (default off) pipes each Opus through Groq Whisper via direct API call and prints a word-diff roll-up; warn-only, never hard-fails the bake; threshold env-overridable via `VERIFY_AUDIO_DIFF_THRESHOLD` default 2 (Phase 3 Plan 06, commits 332b483 + 04bb0e6 — D-11 implementation)
- [x] **AUTHOR-08**: `scripts/preview-bake.ts` localhost-only server streams cached Opus for in-editor scrubbing before re-encrypting `.mram`; dev-guard identical to `/author/page.tsx` via shared `src/lib/dev-guard.ts` (Plan 03-03 landed the dev-guard primitive; Plan 03-08 landed the 390-line preview-bake.ts on 127.0.0.1:8883 with assertDevOnly() at module load, ensureLoopback() refusing non-loopback hosts, defense-in-depth path-traversal safety (regex gate + path.resolve + fs.realpathSync containment for symlink-escape), RFC 7233 Range streaming, and 20 unit tests — commits a679360 + 643baf7)
- [ ] **AUTHOR-09**: `p-limit` concurrency cap on parallel Gemini TTS calls in `build-mram-from-dialogue.ts`
- [x] **AUTHOR-10**: `src/lib/idb-schema.ts` extracted as the single source of truth for `DB_VERSION` shared between `storage.ts` and `voice-storage.ts`; also houses the new `feedbackTraces` store (Phase 3 Plan 02, commits 43774bd + a90ffe2)

### Admin (Shannon-facing visibility + distribution)

The connective tissue — one dashboard shell serves usage visibility, budget alert detail, invite management, and feedback-on-feedback aggregation.

- [ ] **ADMIN-01**: Admin dashboard shell at `/admin` — Shannon-only, magic-link-gated, hidden from non-admin session JWTs
- [ ] **ADMIN-02**: Dashboard renders anonymized event telemetry: sign-ins, paid-route usage by hashed user, error counts, feedback-rating aggregates, spend-by-route
- [ ] **ADMIN-03**: Invite management UI can view / add / remove `LODGE_ALLOWLIST` entries, with last-sign-in timestamp and per-user usage summary per email
- [ ] **ADMIN-04**: Stateful session with server-side revocation list — lands at the same moment a durable store (Vercel KV or Upstash) is chosen; revocation takes effect within one request
- [ ] **ADMIN-05**: `/api/content/latest-hashes` endpoint returns the current `.mram` build hash per ritual; client shows a "your ritual has been updated" banner when a locally stored `.mram` is stale
- [ ] **ADMIN-06**: Build hash visible in the UI footer so bug reports can pin an exact version
- [ ] **ADMIN-07**: Anonymized event telemetry layer has a redaction unit test that fails if any ritual text or raw email reaches the server log

### Onboard (invited-user polish)

The invite-only gate stays; what changes is the first 60 seconds after an invited WM clicks the magic link.

- [ ] **ONBOARD-01**: First-run flow routes new invited users through a short "here's what this is and how to use it" walkthrough before the practice tabs
- [ ] **ONBOARD-02**: Mic-check pre-rehearsal step verifies browser permission, default mic selection, and STT round-trip before the user starts a rehearsal
- [ ] **ONBOARD-03**: "Report a bug" one-tap mailto in Navigation prefills subject + version hash + anonymized context
- [ ] **ONBOARD-04**: Revoked user sees a graceful "your access has been removed; contact your sponsor" state, not a middleware 401 wall
- [ ] **ONBOARD-05**: Rehearsal session position persists across reloads so a dropped connection or closed tab doesn't force a ritual restart

## v2 Requirements

Deferred to post-v1. Tracked so they don't get forgotten; not in current roadmap.

### Coach (v2)

- **COACH-v2-01**: User-facing persona toggle (mentor / plain / roast) once mentor baseline is proven
- **COACH-v2-02**: Per-user prompt adaptation based on the user's historical error patterns
- **COACH-v2-03**: Anomaly alerts on feedback-rating regressions ("mentor-v1 used to pass; mentor-v2 fails on stumbles like this")
- **COACH-v2-04**: Claude Haiku 4.5 as a production tier (v1 evaluates it only inside the eval harness)

### Safety (v2)

- **SAFETY-v2-01**: Upstash Redis / Vercel KV swap for durable per-user rate-limit state (triggered when pilot >30 users or when stateful sessions land)
- **SAFETY-v2-02**: Stateful one-time magic links (replaces current stateless token) — paired with the SAFETY-v2-01 durable store
- **SAFETY-v2-03**: Webhook / Slack alert destination for spend-spikes in addition to Resend email

### Content (v2)

- **CONTENT-v2-01**: Multi-working content system (UGLE, PHA, Canadian, other US GLs)
- **CONTENT-v2-02**: Appendant body rituals (Scottish Rite, York Rite, etc.) — gated on demand and jurisdictional scope
- **CONTENT-v2-03**: Additional craft content Shannon identifies post-v1 (opening/closing variations, proficiency exams, etc.)

### Author (v2)

- **AUTHOR-v2-01**: Hosted / self-serve `/author` UI (still out of scope by default — only revisit with explicit copyright + review tooling)
- **AUTHOR-v2-02**: Trusted co-author circle with local dev access
- **AUTHOR-v2-03**: Lightweight errata JSON sidecar for one-word fixes without full `.mram` rebake

### Admin (v2)

- **ADMIN-v2-01**: Anomaly alerts ("user X did 10× their normal usage today")
- **ADMIN-v2-02**: Grafana / external-dashboard export of anonymized telemetry

## Out of Scope

Explicitly excluded from v1. Documented to prevent scope creep and carry forward from PROJECT.md.

| Feature | Reason |
|---------|--------|
| Self-serve lodge signup | v1 stays email-invite-only via `LODGE_ALLOWLIST`; self-serve defers until invited model is proven |
| Multi-working content system | One working done well beats three done badly; content-tagging architecture not yet designed |
| Hosted / self-serve authoring UI | Copyright + quality-review concerns; baking stays offline/dev-only in v1 |
| Native iOS / Android apps | PWA + wake-lock covers "officer with phone on the rail"; App Store distribution not justified at ≤10 lodges |
| Appendant bodies (Scottish Rite, York Rite, Shrine, OES) | Craft lodge only in v1; scope and jurisdictional variance |
| Payments / subscriptions | v1 is free to invited lodges; billing complicates the invite-only trust model |
| Social features, leaderboards, shared progress, public profiles | Breaks devotional privacy; anti-feature per research |
| LLM-generated ritual content | Authoritative text is the whole point; hallucinated content = catastrophic trust loss |
| Third-party LLM body-observability (Langfuse Cloud / Helicone / LangSmith) | Ingests full prompt + completion text; violates client-only data plane invariant |
| User-facing persona toggle (roast/mentor/plain) | Keeps roast as a hidden A/B-only variant; user-facing toggle deferred to v2 after mentor baseline is proven |
| Runtime model routing by stumble severity | Haiku 4.5 stays inside the eval harness as a variant; not a production branch |
| Hundreds-of-lodges infrastructure (Redis, per-tenant isolation, billing infra) | Architecture stays pilot-scale; Upstash/KV defers until first feature that justifies durable state |

## Traceability

Each v1 requirement maps to exactly one phase. Populated by `gsd-roadmapper` on 2026-04-20.

| Requirement | Phase | Status |
|-------------|-------|--------|
| HYGIENE-01 | Phase 1 | ✓ Validated (2026-04-21, commit b82aefe) |
| HYGIENE-02 | Phase 1 | ✓ Validated (2026-04-21, commit 005dc82) |
| HYGIENE-03 | Phase 1 | ✓ Validated (2026-04-21, commit 2135496; preview-deploy curl check deferred to UAT) |
| HYGIENE-04 | Phase 1 | ✓ Validated (2026-04-21, commit 2b68c72) |
| HYGIENE-05 | Phase 1 | ⏸ Deferred (Shannon iPhone test pending in 01-HUMAN-UAT.md) |
| HYGIENE-06 | Phase 1 | ✓ Validated (2026-04-21, commit 9cfbb3a) |
| HYGIENE-07 | Phase 1 | ⏸ Partial (runbook written commit 66b4d93; rehearsal pending in 01-HUMAN-UAT.md) |
| SAFETY-01 | Phase 2 | Pending |
| SAFETY-02 | Phase 2 | Pending |
| SAFETY-03 | Phase 2 | Pending |
| SAFETY-04 | Phase 2 | Pending |
| SAFETY-05 | Phase 2 | Pending |
| SAFETY-06 | Phase 2 | Pending |
| SAFETY-07 | Phase 2 | Pending |
| SAFETY-08 | Phase 2 | Pending |
| SAFETY-09 | Phase 2 | Pending |
| STT-01 | Phase 5 | Pending (REPL — user priority) |
| STT-02 | Phase 5 | Pending (release gate `verify-content --require-approval`) |
| STT-03 | Phase 5 | Pending (Whisper prompt biasing) |
| STT-04 | Phase 5 | Pending (verbose_json confidence filter) |
| STT-05 | Phase 5 | Pending (LLM post-correction with 20-recording validation gate) |
| STT-06 | Phase 5 | Pending (A/B harness `/dev/whisper-eval`) |
| STT-07 | Phase 5 | Pending (carried forward from COACH-12 — engine-fallback banner) |
| ~~COACH-01~~ | ~~Phase 5~~ | Obsolete (PR #69 deleted feature; replaced by STT pipeline 2026-04-26) |
| ~~COACH-02~~ | ~~Phase 5~~ | Obsolete |
| ~~COACH-03~~ | ~~Phase 5~~ | Obsolete |
| ~~COACH-04~~ | ~~Phase 5~~ | Obsolete |
| ~~COACH-05~~ | ~~Phase 5~~ | Obsolete |
| ~~COACH-06~~ | ~~Phase 5~~ | Obsolete |
| ~~COACH-07~~ | ~~Phase 5~~ | Obsolete |
| ~~COACH-08~~ | ~~Phase 5~~ | Obsolete |
| ~~COACH-09~~ | ~~Phase 5~~ | Obsolete |
| ~~COACH-10~~ | ~~Phase 5~~ | Obsolete |
| ~~COACH-11~~ | ~~Phase 5~~ | Obsolete |
| ~~COACH-12~~ | ~~Phase 5~~ | Carried forward as STT-07 |
| CONTENT-01 | Phase 4 | Pending |
| CONTENT-02 | Phase 4 | Pending |
| CONTENT-03 | Phase 4 | Pending |
| CONTENT-04 | Phase 4 | Pending |
| CONTENT-05 | Phase 4 | Pending |
| CONTENT-06 | Phase 4 | Pending |
| CONTENT-07 | Phase 4 | Pending |
| AUTHOR-01 | Phase 3 | Complete (03-05, 2026-04-23) |
| AUTHOR-02 | Phase 3 | Complete (03-06 D-06 resume-state primitive + 03-07 bake-all.ts orchestrator, 2026-04-23) |
| AUTHOR-03 | Phase 3 | Complete (03-05, 2026-04-23) |
| AUTHOR-04 | Phase 3 | Complete (03-06, 2026-04-23) |
| AUTHOR-05 | Phase 3 | Complete (03-04 primitive + 03-06 wired, 2026-04-23) |
| AUTHOR-06 | Phase 3 | Complete (03-06, 2026-04-23) |
| AUTHOR-07 | Phase 3 | Complete (03-06, 2026-04-23) |
| AUTHOR-08 | Phase 3 | Complete (03-03 dev-guard primitive + 03-08 preview-bake.ts, 2026-04-23) |
| AUTHOR-09 | Phase 3 | Complete (03-07 clampParallel + pLimit wiring, 2026-04-23) |
| AUTHOR-10 | Phase 3 | Complete (03-02, 2026-04-23) |
| ADMIN-01 | Phase 6 | Pending |
| ADMIN-02 | Phase 6 | Pending |
| ADMIN-03 | Phase 6 | Pending |
| ADMIN-04 | Phase 6 | Pending |
| ADMIN-05 | Phase 6 | Pending |
| ADMIN-06 | Phase 6 | Pending |
| ADMIN-07 | Phase 6 | Pending |
| ONBOARD-01 | Phase 7 | Pending |
| ONBOARD-02 | Phase 7 | Pending |
| ONBOARD-03 | Phase 7 | Pending |
| ONBOARD-04 | Phase 7 | Pending |
| ONBOARD-05 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 52 total (was 57; COACH-01..12 retired, replaced by STT-01..07)
- Mapped to phases: 52 (100%)
- Unmapped: 0

---
*Requirements defined: 2026-04-20*
*Last updated: 2026-04-26 — Phase 5 reframed Coach Quality Lift → STT Quality Pipeline. COACH-01..12 marked obsolete (feature deleted in PR #69). STT-01..07 added. See `~/.gstack/projects/Masonic-Ritual-AI-Mentor/ceo-plans/2026-04-26-stt-quality-pipeline.md`.*
