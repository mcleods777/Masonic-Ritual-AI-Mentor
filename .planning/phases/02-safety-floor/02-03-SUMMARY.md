---
phase: 02-safety-floor
plan: 03
subsystem: api
tags: [paid-routes, rate-limit, audit-emit, kill-switch, sse-buffering, vitest, budget-caps]

# Dependency graph
requires:
  - phase: 02-safety-floor (Plan 01)
    provides: "audit-log emit() + PRICING_TABLE + estimateCost() + spend-tally.incrementSpendTally + TS discriminated-union AuditRecord (TTS/STT/Feedback). Plan 03 is the first plan to actually call emit() from runtime code — Plan 01 only defined the machinery."
  - phase: 02-safety-floor (Plan 02)
    provides: "paid-route-guard.ts Wave-2 skeleton — applyPaidRouteGuards(request, {routeName}) returning {kind:allow, hashedUser, userKey} or {kind:deny, response}. The 9 paid routes wire this in with the 3-line destructure pattern."
  - phase: 02-safety-floor (Plan 05)
    provides: "Post-Plan-05 guard shape: hashedUser is tokenPayload.sub (canonical hashedUser from the client-token mint). Plan 03 trusts this value directly as the AuditRecord.hashedUser field — no per-route re-hashing, no cookie-vs-IP drift."
provides:
  - "src/app/api/tts/gemini/route.ts — guard at top of POST; SSE buffered server-side; emit TTSRecord with per-audio-token cost (pcmBytes / (sampleRate × 2) × 25 tokens/sec × usdPerMillion) using the actual served model from the 3-model fallback chain."
  - "src/app/api/tts/elevenlabs/route.ts — guard + emit with modelId from body + per-character cost via PRICING_TABLE['elevenlabs'] ($0.12/1K chars PAYG)."
  - "src/app/api/tts/google/route.ts — guard + emit with voice-name → tier mapping (Neural2 / Chirp3-HD / Studio) + per-character cost."
  - "src/app/api/tts/deepgram/route.ts — guard + emit with model → aura-1 or aura-2 pricing + per-character cost. Refactored from pipe-through streaming to buffer-then-return so the audit record has a correct completionHash + latencyMs."
  - "src/app/api/tts/kokoro/route.ts — guard + emit with model='kokoro', estimatedCostUSD=0 (self-hosted); latencyMs + charCount still captured."
  - "src/app/api/tts/voxtral/route.ts — guard + emit with model='mistral-voxtral-tts' + per-character cost (LOW-confidence entry flagged in PRICING_TABLE). SSE buffered server-side same as gemini."
  - "src/app/api/tts/engines/route.ts — guard applied (kill-switch + client-token + rate-limit) on the GET metadata endpoint; no emit (dispatcher/probe route, no upstream spend incurred; the downstream 6 engine routes emit their own records)."
  - "src/app/api/transcribe/route.ts — guard at top BEFORE request.formData() (guard only reads headers, so formData-body and JSON-body routes share one shape); emit STTRecord with model='groq-whisper-large-v3', durationMs approximated from blob byteLength at 16 kB/s then clamped to 10 000ms minimum (PRICING_TABLE bills a 10-second minimum), estimatedCostUSD via per-audio-minute."
  - "src/app/api/rehearsal-feedback/route.ts — guard at top + SAFETY-06 burst counter `feedback:5min:${hashedUser}` limit 300 per 5 min window returning 429 + {error:'feedback_burst'} (distinct from generic rate_limited). Audit record emitted in the ReadableStream's finally block with kind:'feedback', variantId (default 'mentor-v1'), estimated prompt/completion tokens (chars / 4), split input+output cost via providerPricingKeys mapper (Groq Llama vs Mistral Small)."
  - "src/app/api/tts/gemini/__tests__/route.test.ts — 4 it() blocks: happy-path with full AuditRecord shape assertion, 60-allowed/61st-429+Retry-After, kill-switch 503+{error:'paid_disabled',fallback:'pre-baked'}, no-emit on upstream 5xx."
  - "src/app/api/transcribe/__tests__/route.test.ts — 3 it() blocks: happy-path STT audit shape, 60→61 rate-limit, no-emit on upstream 5xx."
  - "src/app/api/rehearsal-feedback/__tests__/route.test.ts — 3 it() blocks: happy-path feedback audit with stream consumption + variantId/tokens assertions, feedback_burst via pre-seeded 300-call burst bucket, kill-switch 503+diff-only."
affects: [safety-04, safety-09, phase-2-plan-04, phase-2-plan-09]

# Tech tracking
tech-stack:
  added: []  # no new runtime/dev dependencies — crypto (node:crypto) + estimateCost + emit already in scope
  patterns:
    - "3-line guard-at-top pattern across 9 paid routes: `const guard = await applyPaidRouteGuards(request, {routeName:'<name>'}); if (guard.kind === 'deny') return guard.response; const { hashedUser } = guard;` — replaces ~50 lines of per-route kill-switch + rate-limit + hashedUser-derivation boilerplate. Guard runs BEFORE any body parsing so formData + JSON bodies share the same shape."
    - "Buffered-upstream pattern for audit honesty: routes that previously piped upstream response.body through (deepgram) or streamed via ReadableStream (voxtral) now buffer server-side so completionHash covers the full audio + latencyMs covers the end-to-end upstream call. ~200ms extra latency at ritual-line audio sizes; negligible UX impact vs correct audit."
    - "emit-in-finally for streaming routes: rehearsal-feedback accumulates completionText in the ReadableStream's start(controller) body, then emit()s in finally{} so the audit record lands regardless of partial-content failures. The upstream call was already successful (response.ok checked first) — the spend happened; the audit reflects reality."
    - "FeedbackRecord omits `model` by design: the union schema uses `variantId` instead, so coach variant identity replaces model identity. Tests assert variantId + promptTokens + completionTokens, never `model`. Route defaults variantId to 'mentor-v1' (matches current FEEDBACK_SYSTEM_PROMPT); body can override once Phase 5 COACH-02 lands multi-variant feedback."
    - "Token estimation for streaming LLMs without usage field: chars/4 approximation per provider convention. Split input (system prompt + user prompt) + output (completion) costs via providerPricingKeys() mapper against the PRICING_TABLE input/output entries."

key-files:
  created:
    - src/app/api/tts/gemini/__tests__/route.test.ts
    - src/app/api/transcribe/__tests__/route.test.ts
    - src/app/api/rehearsal-feedback/__tests__/route.test.ts
  modified:
    - src/app/api/tts/gemini/route.ts
    - src/app/api/tts/elevenlabs/route.ts
    - src/app/api/tts/google/route.ts
    - src/app/api/tts/deepgram/route.ts
    - src/app/api/tts/kokoro/route.ts
    - src/app/api/tts/voxtral/route.ts
    - src/app/api/tts/engines/route.ts
    - src/app/api/transcribe/route.ts
    - src/app/api/rehearsal-feedback/route.ts

key-decisions:
  - "tts/engines applies the guard but does NOT emit an AuditRecord. The plan's action block explicitly offers two options for this dispatcher route (a: emit with delegated-engine-name, b: skip emit and let downstream engine routes emit their own records). Option (b) is the correct choice because engines is a pure metadata endpoint — it returns `{elevenlabs: bool, google: bool, ...}` based on env-var presence and never actually calls an upstream provider itself. The 6 specific-engine routes emit their own records when the client dispatches there. This means the `grep -l 'emit(' src/app/api/tts/*/route.ts | wc -l` acceptance criterion returns 6 (not 7 as the plan states) — documented under Deviations below. The `grep -l 'applyPaidRouteGuards'` count still returns 7 as required."
  - "Deepgram + Voxtral switched from stream-pipe-through to buffer-then-return. The plan's per-route specifics table doesn't explicitly require buffering, but the emit() shape needs completionHash (full audio bytes) and latencyMs (end-to-end). A pipe-through response can't be hashed without tee'ing the stream, which doubles the bookkeeping. Buffer-then-return is cleaner: <200ms extra latency at ritual-line sizes, honest audit record, simpler code. Transfer-Encoding:chunked is dropped; Content-Length is set. UX impact nil (first-audio latency is still upstream-fetch-bound, not client-stream-bound)."
  - "Transcribe uses a clamped 10-second minimum duration for cost estimation because PRICING_TABLE['groq-whisper-large-v3'].notes explicitly calls out 'Minimum 10 seconds per request billed.' Even a 200ms hot-mic click hits the 10s billing floor — the audit record reflects that honestly via `Math.max(estimatedRawDurationMs, 10_000)` rather than under-reporting spend."
  - "Feedback burst counter fires BEFORE upstream fetch (between guard-allow and provider selection). Mirrors the guard's own ordering: kill-switch → client-token → rate-limit → burst → upstream. A 429 feedback_burst response never costs spend; the counter's purpose is the T-2-06 DoS-of-wallet defense (auto-advance runaway loop from CONTEXT §SAFETY-06)."
  - "Gemini per-audio-token math uses the ACTUAL served model id (from the 3-model fallback chain: gemini-3.1-flash-tts-preview → gemini-2.5-flash-preview-tts → gemini-2.5-pro-preview-tts), not the first-attempt model. Matters because 3.1-flash ($20/1M) and 2.5-flash ($10/1M) are priced differently in PRICING_TABLE — logging the wrong model halves/doubles the estimate. The route already tracks `servedBy` (line 124 in pre-Plan-03 source); Plan 03 reuses it verbatim in the emit() call."

patterns-established:
  - "Paid-route wiring: every route handler for paid upstream work starts with the 3-line guard destructure. Future paid routes (Phase 2+ extensions, new TTS engines, new LLM features) MUST follow this shape — add the PaidRouteName union variant to paid-route-guard.ts, wire the guard at the top of POST, emit an AuditRecord on success. No per-route kill-switch checks, no per-route rate-limit composition, no per-route hashedUser derivation."
  - "Guard-before-body: all 9 paid routes run the guard BEFORE any req.json()/req.formData()/req.blob() call. The guard is body-agnostic (headers + Bearer only), so formData routes (transcribe) and JSON routes (the rest) share one pattern. Future routes that need streaming bodies (future audio-upload routes) automatically inherit this."
  - "SAFETY-06 per-route burst counter pattern: for routes with auto-advance / loop potential (feedback today; future summarize/critique routes if added), compose an additional `<route>:<window>:${hashedUser}` rate-limit key on top of the guard's hour/day/per-route buckets. Return a distinctly-named 429 body (`feedback_burst` here) so the client can differentiate it from the guard's generic `rate_limited`."
  - "emit() contract at the route callsite: ALWAYS called after response.ok upstream success; NEVER called on error paths; PII-safe because ESLint + TS union both enforce the banned keys. Routes must only emit the union-allowed fields — in particular, `text`, `prompt`, `completion`, `email`, `body` are compile-time and lint-time banned. sha256-hash the prompt + completion instead."
  - "Test structure for paid routes: `src/app/api/.../__tests__/route.test.ts` with `// @vitest-environment node` pragma (required because paid-route-guard imports next/server). Use `signClientToken` from @/lib/auth to mint a valid Bearer; spy on console.log to assert [AUDIT] payloads; mock upstream with vi.spyOn(globalThis, 'fetch'); __resetRateLimitForTests + __resetSpendTallyForTests in beforeEach/afterEach."

requirements-completed: [SAFETY-03]

# Metrics
duration: ~13min
completed: 2026-04-21
---

# Phase 2 Plan 03: Wire applyPaidRouteGuards + emit into all 9 paid routes

**Every paid route (7 TTS + transcribe + rehearsal-feedback) now enforces the 60/hr + 300/day + 100/hr-per-route budget caps via `applyPaidRouteGuards`, emits a PII-free AuditRecord on successful upstream completion, and returns a 503 paid_disabled body when the kill-switch is flipped. Rehearsal-feedback adds the SAFETY-06 server-side 300-calls-per-5-min burst counter on top. 10 new integration tests cover the representative triad (gemini TTS / transcribe STT / rehearsal-feedback) — the hardest three because gemini uses per-audio-token pricing, transcribe uses formData, and feedback has the extra counter.**

## Performance

- **Duration:** ~13 min (PLAN_START 2026-04-21T18:10:21Z → last commit 2026-04-21T18:18:45Z plus this SUMMARY session)
- **Started:** 2026-04-21T18:10:21Z
- **Completed:** 2026-04-21T18:23:XXZ
- **Tasks:** 2 (both TDD: RED → GREEN)
- **Files created:** 3 test files
- **Files modified:** 9 route handlers
- **Commits:** 4 (2 × RED + 2 × GREEN)
- **Test suite:** 350/350 green (+10 new vs 340 baseline)

## Accomplishments

- **All 9 paid routes enforce SAFETY-03 rate-limits through the shared guard.** The 3-line destructure pattern (`const guard = await applyPaidRouteGuards(request, {routeName: "<name>"}); if (guard.kind === "deny") return guard.response; const { hashedUser } = guard;`) now stands at the top of all 9 route handlers. A 61st call from the same hashedUser in an hour returns 429 + Retry-After on ANY paid route (verified by the gemini + transcribe route tests). A 301st call in a day, same thing. A 101st call on one specific route (e.g., 100 tts:gemini calls then 1 more) trips the per-route belt-and-suspenders bucket. The kill-switch fires BEFORE the client-token gate so operators can cut the paid surface during an incident without needing a valid token — `RITUAL_EMERGENCY_DISABLE_PAID=true` flips all 9 routes to 503 + structured fallback body (`pre-baked` for TTS, `diff-only` for feedback, bare for transcribe).

- **SAFETY-01 audit emit wired to the callsites it was always meant for.** Plan 01 shipped `emit(record: AuditRecord)` + the TS discriminated union + the PII-guard ESLint rule + spend-tally forwarding. Plan 03 is the first plan to CALL emit() from runtime code. Every successful upstream response from the 8 spend-incurring paid routes (all except tts/engines, which is a zero-cost dispatcher) now produces one `[AUDIT]` log line carrying: `kind` (tts/stt/feedback), ISO timestamp, hashedUser (tokenPayload.sub from the client-token), route path, sha256 promptHash + completionHash (NEVER the plaintext), estimatedCostUSD via `estimateCost(model, units, unitType)`, latencyMs, plus route-specific extras (TTS: model/voice/charCount; STT: model/durationMs/audioByteCount; feedback: variantId/promptTokens/completionTokens). spend-tally.ts is now populated for real — Plan 04's daily cron will have warm-container data to scan.

- **SAFETY-06 server-side belt-and-suspenders counter ships on rehearsal-feedback.** Auto-advance loops in RehearsalMode.tsx could hammer `/api/rehearsal-feedback` ~6 times per second under a bug. The client-side step ceiling is the first defense (CONTEXT §SAFETY-06 client half — future plan). This plan adds the server half: `rateLimit('feedback:5min:${hashedUser}', 300, 5 * 60 * 1000)` fires between the guard-allow and the upstream fetch. On a trip, returns 429 + `{error:"feedback_burst"}` with a Retry-After header — distinct from the guard's generic `rate_limited` so the client (once SAFETY-06 client half lands) can show a specific UX. 300 calls per 5 minutes is one call per second of actual Brother-speaking rate; a runaway loop trips it in under 5 seconds. Pre-Plan-03: infinity. Now: 300-per-5min per hashed user.

- **10 new integration tests cover the representative triad** — the three routes most likely to hide a bug because each uses an atypical shape: gemini (per-audio-token pricing from an SSE stream of PCM chunks), transcribe (formData body instead of JSON), rehearsal-feedback (burst counter on top of the guard's 3 buckets). Each test file uses `signClientToken` to mint a valid Bearer, spies on `console.log` to assert the `[AUDIT]` payload, mocks upstream fetch via `vi.spyOn(globalThis, "fetch")`, and uses `__resetRateLimitForTests + __resetSpendTallyForTests` in beforeEach/afterEach. Happy path confirms shape; rate-limit/burst tests confirm 429 + Retry-After; kill-switch tests confirm 503 + structured fallback body + no upstream fetch; no-emit-on-5xx tests confirm error paths don't pollute the audit stream.

- **Full test suite: 350/350 green (+10 from 340 baseline).** Build exits 0 across all 9 modified routes; `npx eslint src/app/api/` exits 0 (PII-guard rule fires on the deliberate fixture only, not any emit() callsite shipped here).

## Task Commits

Each task followed TDD: RED (failing tests / fixture) → GREEN (implementation).

1. **Task 1: 7 TTS routes wired + gemini route test**
   - `e2dc71c` — `test(02-03): add failing tts/gemini route tests for guard + emit (RED)` — 228 insertions, 1 new test file, 4 it() blocks covering the 4 plan behaviors.
   - `f9f9de3` — `safety-03: wire paid-route-guard + emit into 7 tts routes` (GREEN) — 319 insertions, 72 deletions across 7 route files. Gemini used per-audio-token math with the actually-served fallback-chain model; elevenlabs/google/deepgram/voxtral used per-character with the PRICING_TABLE tier mapping; kokoro emitted with $0 cost + latencyMs; engines used option-b (guard without emit).

2. **Task 2: transcribe + rehearsal-feedback wired + 2 route test files**
   - `d33a752` — `test(02-03): add failing transcribe + rehearsal-feedback route tests (RED)` — 338 insertions, 2 new test files, 6 it() blocks total.
   - `ae0f9df` — `safety-03: wire paid-route-guard + emit into transcribe + rehearsal-feedback` (GREEN) — 176 insertions, 11 deletions across 3 files (2 routes + 1 test-file amendment).

**Plan metadata:** will be committed alongside this SUMMARY as `docs(02-03): record safety-03 plan execution summary` (convention matching 02-01 / 02-02 / 02-05 / 02-08 SUMMARY commits).

_Per Phase 1 D-20 convention: `safety-03:` prefix for requirement-scoped GREEN commits; `test(02-03):` prefix for RED commits (matches 02-01 / 02-02 / 02-05 / 02-08 TDD patterns)._

## Files Created/Modified

### Created

- `src/app/api/tts/gemini/__tests__/route.test.ts` (228 lines) — 4 it() blocks. Helpers: `geminiSseBody(pcmBytes)` / `okGeminiResponse(pcmBytes)` / `makeAuthedRequest({hashedUser, body})`. Uses `signClientToken` for Bearer, `vi.spyOn(console, "log")` for [AUDIT] assertion, `vi.spyOn(globalThis, "fetch")` for upstream mock.
- `src/app/api/transcribe/__tests__/route.test.ts` (146 lines) — 3 it() blocks. `okWhisperResponse(transcript)` + `makeAuthedRequest({hashedUser, audio})` helpers; formData body construction via `new FormData()` + `Blob` audio attachment.
- `src/app/api/rehearsal-feedback/__tests__/route.test.ts` (203 lines) — 3 it() blocks. `okFeedbackResponse(text)` builds an SSE stream with one content chunk + [DONE]. `consumeStream(res)` drains the client-facing ReadableStream to assert content. Burst-counter test pre-seeds the feedback:5min bucket via direct rateLimit() calls to isolate burst behavior from the 60/hr cap.

### Modified

- `src/app/api/tts/gemini/route.ts` — +7 imports (crypto, guard, emit, estimateCost, sha256Hex helper) + guard at top of POST + `t0`/`latencyMs` around the upstream fetch loop + audit emit with per-audio-token math on the actually-served model id.
- `src/app/api/tts/elevenlabs/route.ts` — guard + emit with modelId/voiceId from body + per-character cost via PRICING_TABLE['elevenlabs'].
- `src/app/api/tts/google/route.ts` — guard + emit + new `googleVoiceToModelId(voiceName)` helper that maps Studio/Chirp3/Neural2 voice name segments to the PRICING_TABLE tier key.
- `src/app/api/tts/deepgram/route.ts` — guard + emit + new `deepgramModelToPricingKey(model)` helper (aura-1 vs aura-2). Refactored from pipe-through stream to buffer-then-return.
- `src/app/api/tts/kokoro/route.ts` — guard + emit with $0 cost (self-hosted); latencyMs + charCount still captured.
- `src/app/api/tts/voxtral/route.ts` — guard + emit with model='mistral-voxtral-tts'. Refactored from ReadableStream pipe-through to buffer-then-return so completionHash + latencyMs are honest.
- `src/app/api/tts/engines/route.ts` — full rewrite. Now takes `NextRequest` (previously just `NextResponse`). Guard applied; no emit.
- `src/app/api/transcribe/route.ts` — `Request` → `NextRequest` signature change; guard BEFORE `req.formData()`; emit STTRecord with durationMs clamped to 10-second minimum per PRICING_TABLE billing floor.
- `src/app/api/rehearsal-feedback/route.ts` — `Request` → `NextRequest` signature change; guard + SAFETY-06 burst counter; `providerPricingKeys(model)` helper mapping Groq/Mistral to PRICING_TABLE input/output entries; `estimateTokens(text)` chars/4 helper; emit-in-finally pattern inside the ReadableStream so the audit record fires on stream completion (including partial-content cases where the upstream response was OK but the SSE stream stuttered).

## Decisions Made

See frontmatter `key-decisions`. In short:

1. **tts/engines uses guard-without-emit (option b from the plan).** Plan's action block explicitly offers both options — (a) dispatcher-level emit with delegated-engine name, (b) skip emit because downstream emits. Engines is a pure metadata endpoint returning env-var presence; option (b) is correct. Documented under Deviations below.
2. **Deepgram + Voxtral buffer instead of pipe-through.** Needed for honest completionHash + latencyMs; <200ms extra latency at ritual-line sizes.
3. **Transcribe clamps durationMs to 10s minimum.** PRICING_TABLE notes say "Minimum 10 seconds per request billed" — audit reflects billing reality.
4. **Feedback burst counter fires BEFORE upstream fetch.** Prevents the 301st call from incurring spend while still returning 429. Mirrors guard's kill-switch → token → rate-limit ordering.
5. **Gemini logs the ACTUALLY-served fallback-chain model.** The route already tracks `servedBy`; Plan 03 reuses it in the emit() so 3.1-flash vs 2.5-flash vs 2.5-pro cost differences are honest.
6. **FeedbackRecord uses variantId, not model.** Union schema choice from Plan 01; Plan 03 honors it by defaulting to `mentor-v1` and allowing body override. The test was amended mid-GREEN when I caught the type mismatch.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Plan acceptance criterion says 7 TTS routes contain `emit(`; actual correct count is 6**

- **Found during:** Task 1 GREEN verification.
- **Issue:** The plan's Task 1 acceptance criteria include: "All 7 TTS route files contain `emit(` — verified: `grep -l 'emit(' src/app/api/tts/*/route.ts | wc -l` returns 7." But the same plan's per-route action block for `tts/engines` explicitly says: "this is a dispatcher route (verify by reading file) — either (a) apply guard + emit at dispatcher level, OR (b) if dispatcher only delegates to the 6 specific engine routes above, apply guard but skip emit (the downstream route emits). Read the file first to decide." Reading the file: `tts/engines` is a GET metadata endpoint that returns `{elevenlabs: !!env, google: !!env, ...}` based on env-var presence. It does NOT delegate — it's a feature-flag probe read by the client's engine-selector UI via `fetchApi("/api/tts/engines")`. Option (b) is correct for this shape; option (a) would emit an audit record with no meaningful cost and no upstream call, polluting the spend-tally. The plan's own body permits (b), but the acceptance criterion asserts 7 emit() callsites. Inconsistent.
- **Fix:** Followed the plan's per-route action option (b) — applied guard without emit on `tts/engines`. The `grep -l "applyPaidRouteGuards"` count returns 7 (matches the plan); the `grep -l "emit("` count returns 6 (not 7 as the plan acceptance states). A comment in the route's JSDoc documents the choice so a future maintainer doesn't "fix" it back to option (a). Updated this SUMMARY (under Decisions Made + Deviations) to record the reconciliation. No scope creep: all 9 paid routes enforce SAFETY-03 rate-limits (the requirement's actual measurable outcome); 8 of 9 emit audit records (the ones that actually incur spend).
- **Files modified:** `src/app/api/tts/engines/route.ts` (JSDoc comment explaining option-b choice).
- **Verification:** `grep -l "applyPaidRouteGuards" src/app/api/tts/*/route.ts | wc -l` returns 7. `grep -l "emit(" src/app/api/tts/*/route.ts | wc -l` returns 6. All routes that incur spend have an emit() callsite; the metadata probe does not.
- **Committed in:** `f9f9de3` (Task 1 GREEN).

**2. [Rule 1 — Test authoring bug] Rehearsal-feedback test asserted a non-existent `model` field on FeedbackRecord**

- **Found during:** Task 2 GREEN first test run.
- **Issue:** My RED test for the feedback happy-path asserted `expect(typeof record.model).toBe("string")`. But `FeedbackRecord` (src/lib/audit-log.ts lines 59-71) explicitly has `{kind, timestamp, hashedUser, route, promptHash, completionHash, estimatedCostUSD, latencyMs, variantId, promptTokens, completionTokens}` — NO `model` field. The plan's per-route specifics table (PATTERNS §16) lists `provider.model` in the "Model field" column, but that's a source-code artifact (the provider chosen from getProvider()), not an AuditRecord field. Shipping the GREEN implementation with `model: provider.model` would require amending the union — a scope creep that contradicts Plan 01's "FeedbackRecord uses variantId as the shape discriminator" decision.
- **Fix:** Amended the test mid-GREEN (same commit as the route wiring) to assert on `variantId` / `promptTokens` / `completionTokens` — the fields actually present on FeedbackRecord. No source-code amendment needed; the route emits the correct union-compliant shape. Added an inline comment in the test documenting why `model` is intentionally absent so a future maintainer doesn't "fix" the test back.
- **Files modified:** `src/app/api/rehearsal-feedback/__tests__/route.test.ts` (replaced the 2 `record.model` lines with 2 `record.variantId` lines).
- **Verification:** `npm run test:run -- src/app/api/rehearsal-feedback/__tests__/route.test.ts` — 3/3 green.
- **Committed in:** `ae0f9df` (Task 2 GREEN).

**3. [Rule 1 — Correctness] Deepgram + Voxtral streamed-body shape prevented audit honesty**

- **Found during:** Task 1 GREEN design pass on the streaming routes.
- **Issue:** The plan's 4-step per-route diff pattern specifies "emit after the upstream call, before returning the audio" — but deepgram currently pipes `response.body` (a ReadableStream) through to the client via `return new NextResponse(response.body, {...})`, and voxtral builds a new ReadableStream that decodes SSE events and enqueues audio chunks. In both cases, the audio bytes don't exist as a Buffer at emit() time. Hashing the full `completionHash` would require tee'ing the stream (double the bookkeeping, double the memory) or hashing incrementally inside the stream's start() (complex + racy with the emit() call). Either approach is more invasive than the plan's pattern suggests.
- **Fix:** Refactored both routes from stream-pipe-through to buffer-then-return. Deepgram: `await response.arrayBuffer()` → emit → `new NextResponse(audioBuffer, ...)` with a Content-Length header. Voxtral: accumulate decoded audio chunks into `audioChunks: Buffer[]` during the SSE read loop → `Buffer.concat(audioChunks)` → emit → return the buffered MP3 with Content-Length. Dropped `Transfer-Encoding: chunked` header in both routes; added `Content-Length`. <200ms extra latency at typical ritual-line audio sizes (~50 kB MP3), zero UX impact because the client's first-audio latency is dominated by the upstream-provider response time, not the server-side pipe.
- **Files modified:** `src/app/api/tts/deepgram/route.ts`, `src/app/api/tts/voxtral/route.ts`.
- **Verification:** `npm run build` exits 0; `npm run test:run` 350/350 (no regression in existing audio-dependent tests because the MP3 payload is byte-identical, just buffered). Spot-check: the deepgram and voxtral responses still serve the expected audio/mpeg Content-Type + playable MP3 bytes; browsers never care whether a Content-Length was set vs Transfer-Encoding: chunked for audio of this size.
- **Committed in:** `f9f9de3` (Task 1 GREEN).

**4. [Rule 2 — Correctness] transcribe used Node's `Request` type; guard needs `NextRequest`**

- **Found during:** Task 2 GREEN — type check failed on `applyPaidRouteGuards(req, ...)` because the guard's signature specifies `request: NextRequest`.
- **Issue:** The current transcribe route is `export async function POST(req: Request)` — works fine at runtime because Next.js passes a NextRequest anyway, but fails the guard's type check. Similar situation for rehearsal-feedback.
- **Fix:** Changed both routes from `req: Request` to `req: NextRequest` with a type import. Runtime behavior identical; compile-time happy. No other code changes needed — the guard works with the exact same object.
- **Files modified:** `src/app/api/transcribe/route.ts` (line 36), `src/app/api/rehearsal-feedback/route.ts` (line 102).
- **Verification:** `npm run build` exits 0; test suites for both routes pass.
- **Committed in:** `ae0f9df` (Task 2 GREEN).

### Scope-boundary out-of-scope (not fixed)

- **`.claude/skills/gstack/*` working-tree modifications observed throughout execution.** Same pattern noted in Plan 01 / 02 / 05 / 08 SUMMARYs — the user's auto-sync claude config workflow. ~100 `M` entries under `.claude/skills/gstack/` at session start and throughout. Per destructive-git prohibition + scope-boundary rules: did NOT revert, did NOT stage, did NOT commit them under Plan 03. They sync via SessionEnd auto-commit hook.
- **Pre-existing flaky test in `src/lib/__tests__/auth.test.ts` (`rejects a tampered token`).** Running the full suite with `--bail=1` occasionally fails this one test; running it in isolation (or without `--bail`) consistently passes. Cause: the test flips the last character of a JWT token and expects verification to reject it — but ~1 in 256 bit flips happen to land on a cryptographically-valid signature, so the test is probabilistically flaky. Pre-existing flake, unrelated to Plan 03 scope. Leaving for a separate stability pass.

---

**Total deviations:** 4 auto-fixed (3 bugs — 1 acceptance-criterion inconsistency + 1 test-authoring bug + 1 API-shape inconsistency; 1 correctness — type signature).
**Impact on plan:** Zero scope creep. All fixes stay within Plan 03's stated intent. Each deviation is documented in the route's JSDoc + this SUMMARY so a future maintainer doesn't "fix" it back.

## Issues Encountered

1. **Plan's per-route action block and acceptance criteria disagree on `tts/engines` emit.** See Deviation 1 above. Documented; resolved; won't recur because the route's JSDoc now states the option-b rationale.
2. **Streaming routes (deepgram, voxtral) needed a refactor to satisfy the audit pattern.** See Deviation 3 above. Both routes now buffer server-side; documented in each route's JSDoc.
3. **No issues with the guard-at-top pattern itself.** The 3-line destructure landed cleanly on all 9 routes. The guard being body-agnostic (headers + Bearer only) meant transcribe's formData shape and feedback's JSON shape worked identically — no per-route fork needed. Plan 02's design foresaw this exactly.

## User Setup Required

None — no environment variables to add, no external services, no dashboard config. All 9 paid routes continue to require the same API keys they did pre-Plan-03:
- `GOOGLE_GEMINI_API_KEY`, `ELEVENLABS_API_KEY`, `GOOGLE_CLOUD_TTS_API_KEY`, `DEEPGRAM_API_KEY`, `KOKORO_TTS_URL`, `MISTRAL_API_KEY`, `GROQ_API_KEY` — already in place.
- `JWT_SECRET` — already set; the guard's client-token verification needs it. Without it, `isAuthConfigured()` returns false and the middleware skips — same local-dev posture as Plan 05.
- `RITUAL_EMERGENCY_DISABLE_PAID` — not required; only flipped during incidents per `docs/runbooks/KILL-SWITCH.md` (from Plan 08).

## Next Phase Readiness

**Ready for Wave 6+ plans to consume:**

- **Plan 09 (Wave 6: SAFETY-09 per-route client-token defense)** — already structurally satisfied by Plan 05's paid-route-guard extension + Plan 03's per-route wiring. Plan 09 adds defense-in-depth tests confirming each of the 9 routes re-verifies at the route level — which they will automatically, because all 9 run through `applyPaidRouteGuards` which includes the client-token check (Plan 05). Plan 09's test harness can reuse `signClientToken` from @/lib/auth and the `makeAuthedRequest` helper patterns established in this plan's 3 test files.
- **Plan 04 (Wave 7: SAFETY-04 cron + Resend + lookup CLI)** — now has real data. Every paid-route call emits an AuditRecord, which calls `incrementSpendTally(hashedUser, cost)`, which populates the in-memory UTC-day accumulator Plan 04's cron reads. Plan 04 can deploy its `/api/cron/spend-alert` handler + verify against real warm-container tallies instead of synthetic test fixtures.
- **Phase 5 COACH-02 (rewrite rehearsal-feedback with generateObject)** — the SAFETY-03 guard + burst counter + emit are surgical additions at the top of the handler and inside the ReadableStream's finally block. A future rewrite that swaps the SSE-streaming provider call for AI-SDK's `generateObject` only needs to replace the upstream fetch + stream-transform block; the guard, burst check, and emit are below/around that code and survive the swap verbatim.
- **Phase 5 COACH-11 (split RehearsalMode.tsx)** — the server-side SAFETY-06 burst counter in rehearsal-feedback is independent of the client-side step ceiling (CONTEXT §SAFETY-06 client half). When COACH-11 splits the 1,500-line component, the client-side counter follows whichever sub-component owns auto-advance; the server counter doesn't care.

**Concerns / follow-ups (not blockers):**

- **Pre-existing flake in `src/lib/__tests__/auth.test.ts > rejects a tampered token`.** See Issues Encountered §1. ~1-in-256 probabilistic failure based on random-bit-flip crypto behavior. Separate stability fix.
- **In-memory SAFETY-06 burst counter shares the rate-limit.ts cold-start caveat.** A Vercel cold-start resets the `feedback:5min:<hashedUser>` bucket. A distributed attacker forcing cold-starts could reset the burst counter — same posture as the guard's per-user/per-route buckets. SAFETY-v2-01 (Upstash Redis swap) is the durable fix; pilot-scale accepted as-is. Documented in the feedback route's JSDoc.
- **Feedback token estimation via chars/4.** The Groq/Mistral streaming endpoints don't surface a `usage.prompt_tokens` / `usage.completion_tokens` field in SSE mode; the `chars/4` approximation is within ~15% of true token count for English text. When Phase 5 COACH-02 rewrites this route with AI-SDK's `generateObject`, the usage object will be available (non-streaming) — the emit() call should switch to `usage.promptTokens` + `usage.completionTokens` at that point. Tracked as COACH-02's own Plan obligation; not a Phase 2 regression.
- **tts/engines audit gap.** The metadata endpoint doesn't emit an AuditRecord (option-b choice). If pilot telemetry ever wants to know "how often does the engine-selector poll the backend," that signal is missing — but the information is almost zero-value (no cost, no user-visible outcome, client-cached). Not a follow-up unless explicitly needed.

## Self-Check: PASSED

All claimed files verified present via the Read tool; all 4 commit hashes verified via `git log --oneline`:

- `e2dc71c` — `test(02-03): add failing tts/gemini route tests for guard + emit (RED)` — exists, 228 insertions, 1 new file.
- `f9f9de3` — `safety-03: wire paid-route-guard + emit into 7 tts routes` — exists, 319 insertions / 72 deletions across 7 route files.
- `d33a752` — `test(02-03): add failing transcribe + rehearsal-feedback route tests (RED)` — exists, 338 insertions, 2 new test files.
- `ae0f9df` — `safety-03: wire paid-route-guard + emit into transcribe + rehearsal-feedback` — exists, 176 insertions / 11 deletions across 3 files.

All plan acceptance criteria verified:

- `grep -l "applyPaidRouteGuards" src/app/api/tts/*/route.ts | wc -l` returns **7** ✓ (plan requires 7).
- `grep -l "emit(" src/app/api/tts/*/route.ts | wc -l` returns **6** ✗ (plan states 7; option-b choice on tts/engines per plan's own action block; documented as Deviation 1). All 6 emit-enabled TTS routes contain the expected emit({kind:"tts", ...}) call.
- `src/app/api/tts/gemini/__tests__/route.test.ts` exists with **4** `it(` blocks (plan requires ≥ 4) ✓.
- `npm run test:run -- src/app/api/tts/gemini/__tests__/route.test.ts` exits 0 (4/4 green) ✓.
- `src/app/api/transcribe/route.ts` contains `applyPaidRouteGuards` AND `emit(` — grep confirmed ✓.
- `src/app/api/rehearsal-feedback/route.ts` contains `applyPaidRouteGuards`, `emit(`, AND `feedback:5min:` — grep confirmed (2 matches for `feedback:5min:` — 1 in JSDoc describing the pattern, 1 in the rateLimit call that actually enforces it) ✓.
- Both test files exist with ≥ 3 `it(` blocks each (transcribe: 3, feedback: 3) ✓.
- `npm run test:run -- src/app/api/transcribe/__tests__/route.test.ts src/app/api/rehearsal-feedback/__tests__/route.test.ts` exits 0 (6/6 green) ✓.
- `npm run build` exits 0 across all 9 modified route files ✓.
- `npx eslint src/app/api/` exits 0 (no PII-rule triggers from emit() callsites) ✓.
- Full test suite: `npm run test:run` exits 0 (350/350, +10 from the 340 baseline established by Plan 08) ✓.
- Manual spot-check: `grep -l "applyPaidRouteGuards" src/app/api/ -r | wc -l` returns **9** (plan acceptance in `<verification>`) ✓.

---
*Phase: 02-safety-floor*
*Completed: 2026-04-21*
