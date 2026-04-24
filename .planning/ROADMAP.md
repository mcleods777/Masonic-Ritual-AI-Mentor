# Roadmap: Masonic Ritual AI Mentor — v1 Invited-Lodge Milestone

**Created:** 2026-04-20
**Milestone:** v1 invited-lodge (brownfield delta on a shipping pilot)
**Granularity:** standard (5-8 phases)
**Core Value:** A Masonic officer can reliably rehearse their ritual parts — at any hour, with no other brother available — and come out of the session more confident that their memorization is accurate to their lodge's working.

## Milestone Goal

Ship the invited-lodge v1: the pilot, hardened and extended so Shannon can personally invite 1-3 outside lodges' officers without lying awake about surprise AI bills, embarrassing LLM hallucinations against authoritative ritual text, or being unable to revoke access cleanly. Every v1 requirement maps to exactly one phase below.

## Phases

- [x] **Phase 1: Pre-invite Hygiene** — Small, zero-risk cleanup that must land before outside lodges are invited (completed 2026-04-21; 2 manual UAT items tracked in 01-HUMAN-UAT.md)
- [ ] **Phase 2: Safety Floor (cost, abuse, auth hardening)** — Per-user rate limits, budget caps, audit log, client-token, kill switch — the layered defense against the three equal-weight fears
- [ ] **Phase 3: Authoring Throughput** — Bake cache, orchestrator, validators, preview server — Shannon-hours reduction so content work doesn't dominate calendar time
- [ ] **Phase 4: Content Coverage** — Bake EA, FC, MM, Installation, and officer lectures in Shannon's lodge's working, with per-line Opus verified
- [ ] **Phase 5: Coach Quality Lift** — Structured, diff-grounded feedback with hallucination filter, gold eval set, dev-only eval UI — the headline pilot complaint addressed
- [ ] **Phase 6: Admin Substrate & Distribution** — Admin dashboard, invite management, stateful revocation, stale-version banner — connective tissue for what Phases 2, 4, 5 emit
- [ ] **Phase 7: Onboarding Polish** — First-run walkthrough, mic check, bug-report, revoked-state UI, session persistence — the first-60-seconds experience for an invited WM

## Phase Details

### Phase 1: Pre-invite Hygiene
**Goal**: The app surface and toolchain is clean, modern, and not-indexed before any outside lodge Brother receives an invitation
**Depends on**: Nothing (first phase)
**Requirements**: HYGIENE-01, HYGIENE-02, HYGIENE-03, HYGIENE-04, HYGIENE-05, HYGIENE-06, HYGIENE-07
**Success Criteria** (what must be TRUE):
  1. `npm ls` shows no `natural`, `uuid`, `@ai-sdk/react`, or `@types/uuid` packages; the production bundle no longer ships their code
  2. `ai` SDK idioms are aligned with v6 conventions across the codebase (codemod run clean)
  3. `X-Robots-Tag: noindex` is present in response headers across all app routes, and `public/landing.html` contains zero real ritual text
  4. Shannon has completed a live magic-link sign-in on an iPhone behind iCloud Private Relay and observed end-to-end success
  5. A test exists that fails if `.mram` routes are ever added back to the middleware matcher
  6. A written shared-secret rotation runbook exists in the repo and has been rehearsed in staging at least once
**Plans**: 7 plans
Plans:
- [ ] 01-03-noindex-PLAN.md — HYGIENE-03: add X-Robots-Tag noindex app-wide + landing meta
- [ ] 01-06-matcher-test-PLAN.md — HYGIENE-06: regression test locking .mram exclusion in middleware matcher
- [ ] 01-04-landing-audit-PLAN.md — HYGIENE-04: audit public/landing.html for ritual text
- [ ] 01-07-rotation-runbook-PLAN.md — HYGIENE-07: write and rehearse secret-rotation runbook
- [ ] 01-05-iphone-verify-PLAN.md — HYGIENE-05: iPhone + iCloud Private Relay magic-link verify
- [ ] 01-02-ai-sdk-codemod-PLAN.md — HYGIENE-02: run AI SDK v6 codemod and bump deps
- [ ] 01-01-package-cleanup-PLAN.md — HYGIENE-01: remove dead packages (natural, uuid, @ai-sdk/react, @types/uuid)
**UI hint**: no

### Phase 2: Safety Floor (cost, abuse, auth hardening)
**Goal**: No invited user can produce a surprise AI bill, no runaway loop can run uncapped overnight, and no compromise of the shared secret alone is sufficient to reach paid routes
**Depends on**: Phase 1 (AI SDK codemod from HYGIENE-02 reduces churn; dead packages from HYGIENE-01 clean first)
**Requirements**: SAFETY-01, SAFETY-02, SAFETY-03, SAFETY-04, SAFETY-05, SAFETY-06, SAFETY-07, SAFETY-08, SAFETY-09
**Success Criteria** (what must be TRUE):
  1. Every paid-route call appears in a PII-free structured audit log record (`{hashed-user, route, promptHash, completionHash, estimated-cost, latency}`) with no request or response body content present
  2. Every paid route (`/api/tts/*`, `/api/transcribe`, `/api/rehearsal-feedback`) returns 429 when the same hashed user exceeds their configured hourly or daily budget
  3. A test invoking paid routes with a valid shared secret but no session JWT is rejected at the route level, not only in middleware
  4. When Shannon flips `RITUAL_EMERGENCY_DISABLE_PAID=true` and redeploys, every paid route returns a static fallback response and pre-baked audio still plays
  5. A runaway-loop simulation (same session firing feedback repeatedly) gets stopped client-side by the session step ceiling, with a server-side 429 as belt-and-suspenders
  6. Shannon receives a Resend alert email the same day total or per-user spend exceeds a configured threshold
**Plans**: 9 plans
Plans:
- [ ] 02-01-PLAN.md — SAFETY-01: audit-log + pricing + spend-tally + ESLint PII guard (Wave 1)
- [ ] 02-02-PLAN.md — SAFETY-02: rate-limit userKey keyspace + paid-route-guard skeleton (Wave 2)
- [ ] 02-03-PLAN.md — SAFETY-03: wire guard + emit into all 9 paid routes (60/hr + 300/day caps) (Wave 6)
- [ ] 02-04-PLAN.md — SAFETY-04: vercel.json cron + Resend spend-alert + lookup-hashed-user CLI (Wave 7)
- [ ] 02-05-PLAN.md — SAFETY-05: client-token JWT endpoint + api-fetch Bearer + middleware verify (Wave 3)
- [ ] 02-06-PLAN.md — SAFETY-06: RehearsalMode session step ceiling (client half; server half in Plan 03) (Wave 8)
- [ ] 02-07-PLAN.md — SAFETY-07: screen-wake-lock inactivity auto-release (Wave 8)
- [ ] 02-08-PLAN.md — SAFETY-08: kill-switch client degraded-mode UX + KILL-SWITCH.md runbook (Wave 4)
- [ ] 02-09-PLAN.md — SAFETY-09: defense-in-depth route-level verification + regression tests (Wave 5)
**UI hint**: no

### Phase 3: Authoring Throughput
**Goal**: Shannon can re-bake a single-line edit in under a minute instead of re-rendering a full ritual, and can bake five rituals' worth of content without weekends lost to serial Gemini calls
**Depends on**: Phase 1 (clean toolchain); otherwise independent of Phase 2 — runs in parallel on calendar time
**Requirements**: AUTHOR-01, AUTHOR-02, AUTHOR-03, AUTHOR-04, AUTHOR-05, AUTHOR-06, AUTHOR-07, AUTHOR-08, AUTHOR-09, AUTHOR-10
**Success Criteria** (what must be TRUE):
  1. A one-line text edit in a dialogue file causes `scripts/bake-all.ts` to re-render exactly one line on the next bake, not the whole ritual
  2. Running `scripts/bake-all.ts --since <git-ref>` only rebakes rituals that changed since that ref; `--resume` picks up cleanly after a crash
  3. No `.mram` with an ultra-short line (e.g. "I do.", "B.") is ever baked with that line silently missing — either it renders through the alternate engine path, or the bake refuses
  4. The cipher/plain parity validator refuses to bake a deliberately-corrupted dialogue pair (different speaker, mismatched action tags, out-of-band word-count ratio)
  5. Bake-time audio-duration anomaly detector flags any baked line whose duration is >3× the ritual's median for its character count
  6. `src/lib/idb-schema.ts` is the single `onupgradeneeded` source of truth, imported by both `storage.ts` and `voice-storage.ts`; a dual-open test confirms all stores exist regardless of which module opens first
  7. Shannon can scrub baked lines in a browser against `localhost:8883` before re-encrypting a `.mram`
**Plans**: 8 plans
Plans:
- [x] 03-01-deps-and-scaffolding-PLAN.md — wave 0: install p-limit/music-metadata/fake-indexeddb + gitignore + wave-0 test scaffolds (2026-04-23, commits 77c07c0 + 73e350c)
- [x] 03-02-idb-schema-PLAN.md — AUTHOR-10: extract idb-schema.ts single source of truth + feedbackTraces store + dual-open test (2026-04-23, commits 43774bd + a90ffe2)
- [x] 03-03-dev-guard-PLAN.md — D-15: extract shared dev-guard.ts + refactor /author/page.tsx to use isDev()
- [x] 03-04-author-validation-PLAN.md — AUTHOR-05 D-08: add bake-band word-ratio hard-fail to cipher/plain parity validator (2026-04-23, commit 76c565f)
- [x] 03-05-cache-migration-PLAN.md — AUTHOR-01 + AUTHOR-03: bump cache key to v3, add modelId, move cache to rituals/_bake-cache/, one-shot migration, lock DEFAULT_MODELS order (2026-04-23, commits 0b0c4ea + 5e32cb9)
- [x] 03-06-bake-integration-PLAN.md — AUTHOR-02/04/05/06/07: wire validator gate + short-line Google TTS + duration-anomaly detector + --verify-audio + line-level _RESUME.json writes (D-06) into build-mram-from-dialogue.ts; new scripts/lib/resume-state.ts + scripts/lib/bake-math.ts (2026-04-23, commits 43209d2 + 332b483 + 04bb0e6)
- [x] 03-07-bake-all-orchestrator-PLAN.md — AUTHOR-02/09: scripts/bake-all.ts with --since/--dry-run/--resume/--parallel + p-limit + _RESUME.json read-side + validator gate + build-mram spawn-arg plumbing + 27 unit tests (2026-04-23, commits 54e7ed5 + 61277b1)
- [x] 03-08-preview-bake-PLAN.md — AUTHOR-08: scripts/preview-bake.ts localhost-only cache scrubber with dev-guard + loopback-only bind + defense-in-depth path-traversal safety (regex gate + path.resolve + fs.realpathSync containment for symlink-escape) + RFC 7233 Range streaming + 20 unit tests (2026-04-23, commits a679360 + 643baf7)
**UI hint**: no

### Phase 4: Content Coverage
**Goal**: Every invited lodge's officer can rehearse EA, FC, MM, Installation, and the core officer lectures in Shannon's lodge's working, with pre-baked Opus audio for every line so a first-time rehearsal never requires live TTS
**Depends on**: Phase 3 (bake cache, orchestrator, validators, and idb-schema must exist before multi-ritual baking is practical)
**Requirements**: CONTENT-01, CONTENT-02, CONTENT-03, CONTENT-04, CONTENT-05, CONTENT-06, CONTENT-07
**Success Criteria** (what must be TRUE):
  1. EA, FC, and MM degree `.mram` files exist with cipher, plain, per-line Gemini audio, and voice cast pinned in metadata
  2. The annual officer installation ceremony `.mram` is baked and uploadable by an invited WM
  3. WM charge, SW duties, JW duties, and any other lodge-designated lectures exist as standalone `.mram` practice units
  4. A verifier script confirms every shipped `.mram` has per-line Opus embedded (no line falls through to live TTS on a first-time rehearsal)
  5. Every shipped `.mram` passes the cipher/plain parity validator before being committed — no phantom scoring failures from cipher-only edits reach users
**Plans**: 8 plans
Plans:
- [ ] 04-01-verifier-release-gate-PLAN.md — CONTENT-06, CONTENT-07: extend verify-mram with --check-audio-coverage + build verify-content release gate (Wave 0, engineering)
- [ ] 04-02-content-checklist-PLAN.md — create 04-CONTENT-CHECKLIST.md ritual-readiness ledger + parseable-markdown shape test (Wave 0, tracking)
- [ ] 04-03-ea-rebake-PLAN.md — CONTENT-01: re-bake 4 existing EA rituals under v3 cache (Wave 1, content-labor)
- [ ] 04-04-fc-authoring-bake-PLAN.md — CONTENT-02: author + bake 4 fresh FC rituals (opening, passing, middle-chamber-lecture, closing) (Wave 1, content-labor)
- [ ] 04-05-mm-authoring-bake-PLAN.md — CONTENT-03: author + bake 4 fresh MM rituals (opening, raising, hiramic-legend, closing) (Wave 1, content-labor)
- [ ] 04-06-installation-authoring-bake-PLAN.md — CONTENT-04: author + bake annual officer installation as single long ritual (Wave 1, content-labor)
- [ ] 04-07-lectures-authoring-bake-PLAN.md — CONTENT-05: author + bake 5-9 officer lectures/charges as standalone practice units (Wave 1, content-labor)
- [ ] 04-08-phase-release-verification-PLAN.md — aggregate verify-content + dogfood on masonicmentor.app + mark CONTENT-01..07 complete (Wave 2, release)
**UI hint**: no

### Phase 5: Coach Quality Lift
**Goal**: An invited lodge's Past Master reads feedback the app produced about his Brother's stumble and cannot find it generic, condescending, or contradictory to the authoritative working — something Shannon will stake his name on
**Depends on**: Phase 2 (rate limits must exist before eval harness hammers the feedback route), Phase 3 (AUTHOR-10 idb-schema must ship before COACH-06 feedbackTraces store lands)
**Requirements**: COACH-01, COACH-02, COACH-03, COACH-04, COACH-05, COACH-06, COACH-07, COACH-08, COACH-09, COACH-10, COACH-11, COACH-12
**Success Criteria** (what must be TRUE):
  1. `RehearsalMode.tsx` is split into setup, advance, and STT-lifecycle submodules before the feedback route is rewritten — the existing auto-advance flow passes tests after the split
  2. Feedback prompt assembly lives in `src/lib/feedback-prompt.ts` client-side; the `/api/rehearsal-feedback` route receives `{variantId, prompt, promptHash}` and nothing else that could reconstruct more than 1-2 expected words
  3. Every successful feedback response conforms to the `{missed_words, substituted_words, inserted_words, suggested_drill, confidence}` schema — the LLM cannot free-form into ritual explanation
  4. An attempt to make the LLM respond with a capitalized word not in the reference line, user attempt, or coaching allowlist is caught by the post-hoc filter and replaced with a diff-derived static message
  5. The `mentor-v1` variant is what invited users see; `roast-v1`/`terse-v1`/`coach-v1` are reachable only inside `/dev/feedback-eval` with the author guard enforced
  6. Shannon's curated gold eval set of ≥50 stumbles passes its release-blocking rubric when run through `scripts/feedback-eval.ts`; regressions block release
  7. Every feedback render shows a "this feedback seems wrong" button that, when tapped, records a rating in the audit log and opens a prefilled mailto to Shannon
  8. When the TTS engine falls back to a non-default engine, the user sees a small banner in Rehearsal/Listen mode indicating degraded playback
**Plans**: TBD
**UI hint**: yes

### Phase 6: Admin Substrate & Distribution
**Goal**: Shannon has a single Shannon-only dashboard that answers "is lodge X active, who is near their cap, which rituals are on stale builds, can I revoke this user right now" — and invited users see a graceful stale-version banner when their `.mram` is out of date
**Depends on**: Phase 2 (audit log is the dashboard's data source), Phase 4 (per-ritual build hashes need content to hash), Phase 5 (feedback-rating aggregation needs ratings)
**Requirements**: ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04, ADMIN-05, ADMIN-06, ADMIN-07
**Success Criteria** (what must be TRUE):
  1. A Shannon-only `/admin` route, gated by magic-link + session JWT + admin allowlist, renders without being discoverable from a non-admin session
  2. The dashboard shows anonymized telemetry: sign-ins by hashed user, paid-route usage, error counts, feedback rating aggregates, spend by route
  3. Shannon can view, add, and remove `LODGE_ALLOWLIST` entries from the dashboard, with last-sign-in timestamp and per-user usage summary visible per email
  4. Removing a user from the allowlist causes their next authenticated request to fail within the same request cycle (stateful revocation, not waiting for a 30-day cookie)
  5. A client that holds an `.mram` whose hash no longer matches `/api/content/latest-hashes` sees a "your ritual has been updated" banner on next load
  6. The current build hash is visible in the UI footer of every page so bug reports can pin an exact version
  7. A redaction unit test fails if any ritual text or raw email address ever reaches the server log
**Plans**: TBD
**UI hint**: yes

### Phase 7: Onboarding Polish
**Goal**: An invited WM who has never seen the tool before clicks the magic link and, within 60 seconds, has been oriented, confirmed his mic works, and is rehearsing — with bug-report, graceful revoke UX, and reload persistence present by construction
**Depends on**: Phase 6 (revoked-state UX ties into ADMIN-04 stateful revocation; bug-report footer uses ADMIN-06 build hash)
**Requirements**: ONBOARD-01, ONBOARD-02, ONBOARD-03, ONBOARD-04, ONBOARD-05
**Success Criteria** (what must be TRUE):
  1. A first-time signed-in user who has no uploaded `.mram` is routed through a walkthrough explaining upload → passphrase → practice before landing on tabs they cannot yet use
  2. Before starting a rehearsal, the user can verify browser mic permission, default device selection, and a successful STT round-trip on a known phrase
  3. A one-tap "Report a bug" action in Navigation opens a prefilled mailto containing the current version hash and anonymized session context, with zero ritual text in the payload
  4. A user whose access has been revoked sees a clear "your access has been removed; contact your sponsor" screen instead of a 401 wall or a redirect loop
  5. A user who reloads the browser mid-rehearsal returns to the line they were on, not to the start of the ritual
**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Pre-invite Hygiene | 7/7 | Complete (UAT pending) | 2026-04-21 |
| 2. Safety Floor | 9/9 | Complete (merged to main PR #68) | 2026-04-22 |
| 3. Authoring Throughput | 8/8 | Execution complete (merge PR pending) | 2026-04-23 |
| 4. Content Coverage | 0/8 | Planned | - |
| 5. Coach Quality Lift | 0/0 | Not started | - |
| 6. Admin Substrate & Distribution | 0/0 | Not started | - |
| 7. Onboarding Polish | 0/0 | Not started | - |

## Coverage

**v1 requirements:** 57 total
**Mapped to phases:** 57 (100%)
**Orphaned:** 0

| Category | Count | Phase |
|----------|-------|-------|
| HYGIENE (01-07) | 7 | Phase 1 |
| SAFETY (01-09) | 9 | Phase 2 |
| AUTHOR (01-10) | 10 | Phase 3 |
| CONTENT (01-07) | 7 | Phase 4 |
| COACH (01-12) | 12 | Phase 5 |
| ADMIN (01-07) | 7 | Phase 6 |
| ONBOARD (01-05) | 5 | Phase 7 |

## Notes

- **Brownfield milestone** — the pilot already ships the full rehearsal loop. No phase re-builds existing capability; every phase is a delta.
- **Parallelism opportunity** — Phase 3 (authoring throughput tooling) and Phase 2 (safety floor) touch disjoint files and can run in parallel on calendar time. The dependency from Phase 5 → Phase 3 is narrow (just AUTHOR-10 idb-schema extract → COACH-06 feedbackTraces store).
- **Phase 4 is Shannon-labor-dominated** — once the tooling in Phase 3 lands, Phase 4 is primarily content baking (ceremony-by-ceremony) rather than engineering work.
- **Phase 4 plan structure** — Wave 0 (engineering + tracking: 04-01, 04-02) → Wave 1 (content labor: 04-03..07, independent, Shannon-picked order) → Wave 2 (release verification: 04-08). Only 04-01, 04-02, 04-08 are fully autonomous; 04-03 through 04-07 include human checkpoints for authoring + scrub judgment.
- **Success criteria for each phase are observable user or system behaviors**, not task completion. Downstream `/gsd-plan-phase` derives must-haves from these criteria.

---
*Roadmap created: 2026-04-20*
*Granularity: standard*
*Phase 4 planned: 2026-04-23*
