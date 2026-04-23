# Codebase Concerns

**Analysis Date:** 2026-04-20

## Tech Debt

**Unmounted dead components (~357 LOC):**
- Files: `src/components/TTSEngineSelector.tsx` (168 lines), `src/components/GeminiPreloadPanel.tsx` (188 lines)
- Issue: Both components are exported but not mounted anywhere in the tree (only self-references in grep). The TTS engine selector dropdown was removed in commit `76cabb2` and the preload panel was supplanted by the auto silent-preload shipped in commit `e8d37fc`.
- Impact: Bundle weight, mental-model drift ("what engine am I on?"), and they still reach into `hasLocalVoices` / `fetchEngineAvailability` in `tts-cloud.ts` keeping a chain of helpers alive.
- Fix approach: Delete both `.tsx` files, then strip the `hasLocalVoices` and `fetchEngineAvailability` branches from `src/lib/tts-cloud.ts`. Tracked in `TODOS.md` → "Delete unused TTS engine paths + stranded component files" (P3).

**Five unreachable TTS engine paths:**
- Files: `src/lib/text-to-speech.ts:369-376` (switch dispatch), `src/lib/tts-cloud.ts` (speakElevenLabs/speakDeepgram/speakKokoro/speakGoogleCloud/speakBrowser), `src/app/api/tts/deepgram/route.ts`, `src/app/api/tts/elevenlabs/route.ts`, `src/app/api/tts/google/route.ts`, `src/app/api/tts/kokoro/route.ts`
- Issue: After dropdown removal in `76cabb2`, every returning user converges on `gemini` (see `tts-engine-v2` key bump at `src/lib/text-to-speech.ts:46`). Engines `browser`, `elevenlabs`, `google-cloud`, `deepgram`, `kokoro` are now only reachable as members of the fallback chain (Google Cloud + Browser are, the other three are not).
- Impact: ~400+ lines of unused engine code on disk. `tts-cloud.ts` is now 1,540 lines largely because of dead engine plumbing.
- Fix approach: Deferred deletion tracked in `TODOS.md`; waiting on ~1 week of clean production before deleting.

**Orphan localStorage key `tts-engine`:**
- Files: `src/lib/text-to-speech.ts:40-46`
- Issue: Old key left dormant on returning users' devices after the v2 bump. ~15 bytes orphaned per user.
- Impact: Cosmetic only; no migration telemetry exists to confirm how many users are affected.
- Fix approach: First-run migration telemetry already queued in `TODOS.md` (P4) — read old key once, fire one typed event, requires analytics layer that doesn't yet exist.

**Two IndexedDB modules duplicating schema (`v4`):**
- Files: `src/lib/storage.ts:13-67`, `src/lib/voice-storage.ts:10-81`
- Issue: Both modules open the same `masonic-ritual-mentor` DB at version 4 and each redundantly declares the `documents`, `sections`, `settings`, `voices`, `audioCache` stores in its own `onupgradeneeded`. Required because either module might be the first to open the DB after a bump (explained in comments), but any future schema change has to be mirrored in two places or the app will silently fail for whichever caller lost the race.
- Impact: Schema drift is easy to introduce; a single missed mirror breaks users whose DB upgraded via the "wrong" module first.
- Fix approach: Extract a shared `src/lib/idb-schema.ts` with the single `onupgradeneeded` implementation; import from both modules.

**RehearsalMode.tsx is 1,511 lines:**
- Files: `src/components/RehearsalMode.tsx`
- Issue: Monolithic component combining role picker, STT engine lifecycle (browser + Whisper), TTS playback, generation-counter cancellation, auto-advance state machine, AI coaching feedback, performance tracking, and UI for all 10 `RehearsalState` states.
- Impact: Any change risks cross-state regression. Testing is limited to a single `rehearsal-decision.test.ts` exercising one extracted pure function (`planComparisonAction`); the component itself has no tests.
- Fix approach: Split setup/role-pick screen into its own component; extract the `advanceInternal` generation state machine into a hook (`useRehearsalAdvance`); move STT lifecycle into `useSTT(provider)` hook.

**tts-cloud.ts is 1,540 lines with deep coupling:**
- Files: `src/lib/tts-cloud.ts`
- Issue: Holds shared audio-player state (`currentAudio`, `currentResolve`, `currentAbort`, `playToken`), all 6+ cloud engine implementations, Gemini cache-key versioning, voice-cast assignment, prefetch orchestration, and WAV header patching. Any bug fix in one engine risks regressing the shared-state guards (see the playToken "stale check" at lines 70-78 — added in `9bcb5b4` to fix voice overlap).
- Impact: Hard to reason about concurrent playback. Already had two fixes in the last 3 commits for voice overlap races (`0bcbfd8`, `9bcb5b4`).
- Fix approach: Move shared audio player + `playToken` to `src/lib/audio-player.ts`; each engine file imports `playAudioBlob` + `stopCloudAudio`.

**Gemini cache KEY_VERSION at v5 after 4 breaking changes:**
- Files: `src/lib/tts-cloud.ts:1088-1123`
- Issue: Client-side cache key has been invalidated five times as the server format churned (raw PCM → WAV → chunked → batch → streaming-buffered). Each bump silently discards the user's cached audio with no migration.
- Impact: A format regression re-triggers every cold-cache latency penalty across every user. The inline comment is good archeology but should live in a CHANGELOG.
- Fix approach: Freeze the format with an integration test (`src/lib/__tests__/mram-audio-bake.test.ts` exists but only exercises bake, not playback round-trip).

**Audio bake skips 43 "ultra-short" lines in EA opening:**
- Files: `scripts/build-mram-from-dialogue.ts`, bake evidence in `bake.log` (see lines 38-44, 96-102)
- Issue: Lines <11 chars (e.g. "I do.", "B.", "Begin you.") are hard-skipped at bake time due to a text-token regression in the preview models. Skipped lines fall through to runtime TTS at rehearsal, which re-introduces the cold-cache latency and quota exposure that baking was meant to eliminate.
- Impact: Every EA rehearsal sends at minimum 11-43 runtime `/api/tts/gemini` calls per ceremony per Brother. Per the log: ea-opening=11 skipped, ea-initiation=32 skipped.
- Fix approach: Tracked in `TODOS.md` as "Audit baked-audio coverage to eliminate the silent preload" (P4).

**`src/middleware.ts` approaching its split-threshold:**
- Files: `src/middleware.ts` (137 lines)
- Issue: Mixes root redirect, CORS preflight, shared-secret enforcement, origin allowlist, and pilot auth JWT verification. `TODOS.md` marks 150 lines as the split trigger; we're 13 lines away.
- Impact: Each new auth/routing change makes the request-flow harder to reason about. Edge-runtime constraints on imports reduce options for extraction.
- Fix approach: Tracked in `TODOS.md` as "Split middleware.ts when it exceeds 150 lines" (P3). Extract named composable checks.

## Known Bugs

**Text-token regression on short Gemini TTS prompts:**
- Symptoms: Preview models return 200 OK but emit no audio (or garbled audio) for lines <11 chars when voice-cast preamble is prepended.
- Files: `scripts/build-mram-from-dialogue.ts` (skip rule), `src/app/api/tts/gemini/route.ts:266-281` (diagnostic log for empty-audio 200)
- Trigger: Short utterances like "I do.", "He is.", "B." with the voice-cast preamble format.
- Workaround: Hard-skip at bake time (commit `459ded0`); runtime TTS handles the skipped lines without preamble.

**Gemini preview model ID rotation (historical):**
- Symptoms: 404 responses when model preview lineup shifts silently (hit during early development).
- Files: `src/app/api/tts/gemini/route.ts:126-174`
- Trigger: Google retires or renames any of the three preview TTS models.
- Workaround: `getGeminiModels()` reads `GEMINI_TTS_MODELS` env var for hot-swap without deploy; fallback chain treats 404 the same as 429 (tries next model).

**Voice overlap on rapid line-tap (historical):**
- Symptoms: Two Gemini audio blobs briefly audible simultaneously when user taps line N, then line M before N's fetch resolves.
- Files: `src/lib/tts-cloud.ts:36-95` (playAudioBlob with `playToken` stale check), `src/components/ListenMode.tsx:201-271` (handleLineClick with `playGenRef` stale check)
- Trigger: Fast taps on Listen Mode line bars.
- Workaround: Dual-layer generation counters — one in component (`playGenRef`) and one in shared audio player (`playToken`). Fixed in `0bcbfd8` + deepened in `9bcb5b4`. If a third race path is found, the fix pattern is already in place.

## Security Considerations

**Client-secret is not real auth:**
- Risk: `NEXT_PUBLIC_RITUAL_CLIENT_SECRET` is baked into the JS bundle and visible to anyone who views-source. The header check at `src/middleware.ts:78-88` only blocks drive-by curl abuse, not a determined attacker scripting against the extracted secret.
- Files: `src/lib/api-fetch.ts`, `src/middleware.ts:77-88`
- Current mitigation: Combined with the CORS origin allowlist (same middleware) and rate limits on magic-link only. Endpoint-level rate limits exist for `/api/auth/magic-link/request` only.
- Recommendations: Add the same IP+fingerprint rate limit to `/api/tts/gemini`, `/api/tts/voxtral`, `/api/transcribe`, `/api/rehearsal-feedback`. All are paid upstreams; none currently throttle at this layer.

**No rate limiting on paid TTS/feedback/transcribe endpoints:**
- Risk: An attacker with the client secret (obtainable from the bundle) can burn Gemini, Mistral, Groq, Deepgram, and Google credits by script.
- Files: `src/app/api/tts/gemini/route.ts`, `src/app/api/tts/voxtral/route.ts`, `src/app/api/tts/elevenlabs/route.ts`, `src/app/api/tts/google/route.ts`, `src/app/api/tts/deepgram/route.ts`, `src/app/api/tts/kokoro/route.ts`, `src/app/api/transcribe/route.ts`, `src/app/api/rehearsal-feedback/route.ts`
- Current mitigation: 2000-char body cap on all TTS routes; 1 MB body cap on transcribe; 4000-char cap on feedback `performanceContext`. None enforce per-IP request counts.
- Recommendations: Apply the `rateLimit()` helper from `src/lib/rate-limit.ts` at each route's entry with route-specific limits (e.g. 60 TTS req/min per IP, 10 transcribe req/min, 30 feedback req/min).

**In-memory rate limiter resets on cold start:**
- Risk: Distributed attacker can force Lambda cold starts to reset per-IP quotas on magic-link endpoint.
- Files: `src/lib/rate-limit.ts:1-19`
- Current mitigation: Pilot-scale acceptance (5 Brothers, low cold-start frequency). Eviction cap of 5000 buckets prevents OOM.
- Recommendations: Swap the `buckets` Map for Upstash Redis when pilot expands — call-site interface doesn't change. Already documented inline.

**Stateless magic-link JWTs remain valid after use:**
- Risk: Leaked magic links (forwarded email, browser history, referer header) can be replayed until expiry (24h).
- Files: `src/lib/auth.ts:71-101`, `src/app/api/auth/magic-link/verify/route.ts`
- Current mitigation: Short expiry (24h), `JWT_SECRET` rotation invalidates everything as an emergency kill-switch.
- Recommendations: Tracked in `TODOS.md` as "Stateful one-time-use magic links" (P2) — upgrade to KV/Redis-stored tokens consumed on first use. Triggers when pilot expands beyond 20 users.

**CSP `unsafe-inline` + `unsafe-eval` on scripts and styles:**
- Risk: Permissive CSP because Next.js App Router hydration and Tailwind JIT both need inline execution.
- Files: `next.config.ts:11-27`
- Current mitigation: `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` are all locked. Connect-src whitelists only the three paid upstreams + Resend.
- Recommendations: Nonce-based CSP threading through every Server Component is "not worth the ceremony at pilot scale" per the inline comment. Revisit at jurisdictional scale.

**iCloud Private Relay email mismatch:**
- Risk: iPhone Brothers using iCloud+ may submit relay addresses (`xyz@privaterelay.appleid.com`) that don't match `LODGE_ALLOWLIST` — they'll see the generic success message but never receive the email.
- Files: `src/app/api/auth/magic-link/request/route.ts:136-142`, `src/lib/auth.ts:50-59`
- Current mitigation: None — the enumeration-resistant design means failure is silent by construction.
- Recommendations: Tracked in `TODOS.md` as "Verify iCloud Private Relay behavior during pilot" (P1). Test with one iPhone Brother before wider pilot.

**`/api/author/*` routes are dev-local but reachable behind the guard:**
- Risk: If someone sets `MRAM_AUTHOR_ALLOW_LAN=1` + runs `next dev` on a public interface, arbitrary `rituals/*.md` writes are possible from same-origin browsers.
- Files: `src/app/api/author/_guard.ts:21-78`, `src/app/api/author/pair/route.ts`, `src/app/api/author/mram/route.ts`, `src/app/api/author/suggest-styles/route.ts`
- Current mitigation: `NODE_ENV !== "production"` check hard-blocks in Vercel builds; loopback-host check; CSRF origin-equals-host check.
- Recommendations: Fine as-is for the current ops model. Document that `MRAM_AUTHOR_ALLOW_LAN=1` requires a trusted LAN.

## Performance Bottlenecks

**Cold-cache Gemini TTS latency on non-baked lines:**
- Problem: Lines that weren't baked (43+ ultra-short skips per ritual, plus any user voice-cast override) hit `/api/tts/gemini` at runtime. Server buffers the full SSE stream before returning → 2-5s latency per line.
- Files: `src/app/api/tts/gemini/route.ts:50-59` (intentional batch-via-streaming comment), `src/lib/tts-cloud.ts:1200-1290` (runtime retry path)
- Cause: Preview TTS models only expose `streamGenerateContent` (batch `generateContent` returns 404). Server buffers because chunked-transfer caused Chromium `ERR_REQUEST_RANGE_NOT_SATISFIABLE`. So preview model = streaming required = latency tax.
- Improvement path: The silent on-mount preload in `ListenMode.tsx:301-328` (fires 2.5s after mount, 250ms delay between lines) is the current mitigation. The permanent fix is eliminating the bake skips (P4 in `TODOS.md`).

**Audio stored as base64 in IndexedDB:**
- Problem: Every cached Gemini audio blob is base64-encoded (33% bloat) and stored as a string, not a `Blob`. Same pattern for user-recorded Voxtral voices and baked .mram audio payloads.
- Files: `src/lib/tts-cloud.ts:1125-1168` (base64ToBlob / blobToBase64), `src/lib/voice-storage.ts:19-32` (LocalVoice shape)
- Cause: Historical — base64 strings are universally serializable; Blob-in-IDB requires structured-clone support that wasn't guaranteed across legacy browsers.
- Improvement path: Modern browsers support storing Blob directly. Switching would save ~25% storage and remove the `atob`/`btoa` CPU cost on every cache read/write. Risk: cache invalidation required (already have a cache versioning pattern via KEY_VERSION).

**No HTTP cache on TTS responses:**
- Problem: `/api/tts/gemini/route.ts:290-294` explicitly sets `Cache-Control: no-cache`. All caching is pushed to client IndexedDB. Server re-fetches Gemini every time any client misses its own cache.
- Files: `src/app/api/tts/gemini/route.ts:289-294`, `src/app/api/tts/voxtral/route.ts:175-180`
- Cause: Vercel Fluid Compute's filesystem is ephemeral; server-side caching was explicitly rejected in eng-review decision 1A.
- Improvement path: A shared Redis/KV cache keyed on `(text, style, voice)` would let all users share rendered audio. Deferred until a KV dependency is already justified (magic-link stateful tokens would justify it).

**No prefetch of line N+1 during rehearsal:**
- Problem: While line N plays, line N+1's audio is not pre-warmed. If N+1 isn't in cache, the user waits 2-5s at line boundary.
- Files: `src/lib/tts-cloud.ts:1392-1437` (preloadGeminiRitual exists but only triggered on mount, not incremental)
- Cause: Bake-in shipped (commit `4714a3d`) was thought to eliminate the cold-cache case. Remains a concern for voice-cast overrides.
- Improvement path: Tracked in `TODOS.md` (de-prioritized to P3) as "automatic next-line prefetch."

**Mobile battery drain from wake-lock during playback:**
- Problem: `keepScreenAwake()` prevents screen sleep for the full ceremony duration (up to 13 min for EA Initiation).
- Files: `src/lib/screen-wake-lock.ts`, used in `src/components/ListenMode.tsx:288-294` and `src/components/RehearsalMode.tsx`
- Cause: Intentional — commit `946a41d` added this to stop the screen going dark mid-ritual.
- Improvement path: None — wake lock released on pause/idle already; intended tradeoff.

## Fragile Areas

**Playback cancellation via two-layer generation counters:**
- Files: `src/lib/tts-cloud.ts:15-119` (`playToken`), `src/components/ListenMode.tsx:30` (`playGenRef`), `src/components/RehearsalMode.tsx:102` (`advanceGenRef`)
- Why fragile: Race conditions are caught by two independent counters that must both advance correctly on every interruption (tap, pause, stop, unmount). Two recent commits (`0bcbfd8`, `9bcb5b4`) added stale checks at different layers; a third might still be needed.
- Safe modification: When adding a new interruption path, ALWAYS bump `playGenRef` (or `advanceGenRef`) FIRST, call `stopSpeaking()` SECOND, then verify stale via the captured gen before any async operation resumes. Pattern documented at `ListenMode.tsx:201-222`.
- Test coverage: `src/components/__tests__/silent-preload.test.tsx` exists; no direct test for the race itself.

**`onupgradeneeded` duplicated across two IDB-opening modules:**
- Files: `src/lib/storage.ts:33-67`, `src/lib/voice-storage.ts:46-80`
- Why fragile: Any store added to one module MUST be mirrored exactly in the other, or whichever module loses the open-race will fail for users with a fresh install.
- Safe modification: Copy the new store creation into BOTH modules. Never bump `DB_VERSION` in only one file. Verify by deleting IndexedDB locally, loading once through each module's entry point.
- Test coverage: None for the schema-duplication invariant.

**Gemini SSE parser tolerates two event-separator formats:**
- Files: `src/app/api/tts/gemini/route.ts:229-256`
- Why fragile: Regex `/\r?\n\r?\n/` handles both LF and CRLF because "Google's SSE has been seen to switch between them across model versions." If Google adds a third variant (mixed, escaped, framed), audio extraction silently returns zero chunks and the diagnostic at lines 266-281 fires.
- Safe modification: Any SSE parsing change must keep the `rawAccumulated` diagnostic intact — that's the only way to see format drift in production logs.
- Test coverage: None; relies on live Gemini behavior.

**WAV header patching on streaming audio:**
- Files: `src/lib/tts-cloud.ts:1141-1160` (patchStreamingWavSize)
- Why fragile: Server writes sentinel `0x7FFFFFFE` as RIFF/data dataSize. Client must rewrite offsets 4 and 40 to real sizes before playback, else Chromium issues range requests past the blob end and fails with `ERR_REQUEST_RANGE_NOT_SATISFIABLE`. The KEY_VERSION in the cache key (`v5`) was bumped specifically because v3 cached client-patched headers that didn't match v4's batch layout.
- Safe modification: Don't change the header layout or the sentinel value without bumping KEY_VERSION. Run a manual round-trip test (render → cache → reload → play) before shipping.
- Test coverage: None for the client-side patch path.

**Voice-cast match check on embedded audio:**
- Files: `src/lib/tts-cloud.ts:1186-1195` (embeddedAudio short-circuit), `src/lib/text-to-speech.ts:425-471` (speakAsRole routing)
- Why fragile: Baked .mram audio is rendered with a specific (voice, style) combo at build time. Playing it without verifying the current voice-cast still matches would produce wrong-voice playback. Currently the match check is implicit — `speakGeminiAsRole` only forwards `embeddedAudio` when no user-recorded Voxtral clone overrides the role.
- Safe modification: Any future "override voice" feature must explicitly clear `embeddedAudio` when the override is active, or the short-circuit will play the baked voice regardless.
- Test coverage: `src/lib/__tests__/mram-audio-bake.test.ts` exercises the bake side; runtime match check has no dedicated test.

## Scaling Limits

**Pilot allowlist via env var:**
- Current capacity: Comma-separated `LODGE_ALLOWLIST` env var in Vercel, scale-limited by env-var size caps and the human effort of maintaining a flat list.
- Limit: Breaks down around 100+ members or any multi-lodge jurisdiction.
- Scaling path: Move to a first-class User model in a durable store. Triggered by "when jurisdictional distribution begins" per `TODOS.md`.

**Default voice pool via static files in `/public/voices/`:**
- Current capacity: 15 voices shipped (8 character + 7 Aura-2). Bundle increase is noticeable.
- Files: `src/lib/default-voices.ts:32-48`, `public/voices/*.{wav,mp3}`
- Limit: Each added voice is another ~50-200 KB served to every first-time visitor.
- Scaling path: Lazy-load default voices on Voices-page first visit rather than bundling in first paint.

**Gemini preview model daily quota:**
- Current capacity: Three-model fallback chain gives headroom; each model has its own bucket.
- Files: `src/app/api/tts/gemini/route.ts:36-47`
- Limit: If all three preview models retire simultaneously OR all three hit quota, client falls through to Voxtral silently (no user-visible banner — tracked in `TODOS.md` as a known gap).
- Scaling path: Add stable non-preview models when available, or pre-bake every ritual so runtime quota is irrelevant (the P4 bake-audit goal).

## Dependencies at Risk

**Gemini 3.1 Flash TTS (preview status):**
- Risk: Google can deprecate or rename the preview model without notice. Already observed: model list churn in early development required the fallback-chain pattern.
- Impact: All three fallback preview models retire at once → runtime TTS fails entirely → silent Voxtral fallback (no banner).
- Migration plan: Keep baked audio in every .mram so runtime Gemini is only hit by voice-cast overrides. Full runbook for "all three models retired" tracked in `TODOS.md` P3.

**Voxtral `voxtral-mini-tts-2603` model string:**
- Risk: Hardcoded in `src/app/api/tts/voxtral/route.ts:43`. Mistral rotation would break without a deploy.
- Impact: Voxtral fallback stops working; chain degrades to Google Cloud → Browser.
- Migration plan: Hoist to `process.env.VOXTRAL_MODEL` with default.

**Groq `whisper-large-v3` + `llama-3.3-70b-versatile` hardcoded:**
- Risk: Groq rotates model availability. Today's default is `llama-3.3-70b-versatile` (feedback) and `whisper-large-v3` (transcribe). Both are hardcoded.
- Files: `src/app/api/transcribe/route.ts:57`, `src/app/api/rehearsal-feedback/route.ts:42`, `src/app/api/author/suggest-styles/route.ts:58`
- Impact: Feedback + STT silently fail on model retirement.
- Migration plan: `FEEDBACK_MODEL` env var already overrides the feedback model (good). Add a `WHISPER_MODEL` env var with the same pattern.

## Missing Critical Features

**No user-visible banner when TTS falls back:**
- Problem: When Gemini's 3-model chain exhausts and the client falls through to Voxtral, there is no UI feedback. Brother hears a different voice and doesn't know why.
- Blocks: Trust / debugging. A Brother who thinks "the AI sounds wrong today" has no way to diagnose.
- Tracked in `TODOS.md` as "Voxtral fallback + error banner" (P3, de-prioritized since bake-in covers the common case).

**No Suggest Styles UI in `/author`:**
- Problem: Backend at `src/app/api/author/suggest-styles/route.ts` is live. Frontend requires hand-writing `{ritual}-styles.json`.
- Blocks: The "AI-suggests, author approves" story from the design doc. At 155+ lines per ritual, manual authoring is impractical.
- Tracked in `TODOS.md` as "Full Suggest Styles UI in /author" (P2).

**No one-time-use consumption on magic links:**
- Problem: JWT magic links remain valid for their full 24h window after first use.
- Blocks: Individual link revocation; stronger link-leak story.
- Tracked in `TODOS.md` as "Stateful one-time-use magic links" (P2). Trigger: pilot >20 users.

## Test Coverage Gaps

**Component-level tests are near-zero:**
- Files tested: only `src/components/__tests__/silent-preload.test.tsx`
- Untested: `src/components/RehearsalMode.tsx` (1,511 lines), `src/components/ListenMode.tsx` (504 lines), `src/components/DocumentUpload.tsx`, `src/components/PerformanceTracker.tsx`, `src/components/DiffDisplay.tsx`.
- Risk: The two-layer generation counter race fixes in `0bcbfd8` + `9bcb5b4` have no regression test; any future change to the playback state machine can silently re-introduce voice overlap.
- Priority: High — these are the two components a user actually interacts with.

**Middleware has zero tests:**
- Files: `src/middleware.ts` (137 lines)
- Untested: root redirect, CORS preflight, shared-secret check, origin allowlist, pilot auth gate.
- Risk: Any auth/CORS change can silently break either pilot sign-in or cross-origin preview deploys. The pilot auth gate in particular returns redirects silently — a regression shows up as "Brothers can't sign in" with no server-side error.
- Priority: High — middleware runs on every request and has 5 mutually-affecting checks.

**TTS engine dispatch (`speak`, `speakAsRole`) is untested end-to-end:**
- Files: `src/lib/text-to-speech.ts:364-509`
- Tested: `src/lib/__tests__/tts-fallback.test.ts` (chain decisions), `src/lib/__tests__/tts-role-assignment.test.ts` (voice map)
- Untested: The Voxtral-override branch at `speakAsRole:436-452`, the `getUserRecordedRefAudioForRole` gate, the `embeddedAudio` short-circuit.
- Risk: A change that accidentally always-forwards embeddedAudio (or never forwards it) would silently degrade playback without any test catching it.
- Priority: Medium — baked audio shipping is what kills runtime TTS quota exposure; breaking this silently costs money.

**Rate-limit reset on cold start is not exercised in tests:**
- Files: `src/lib/rate-limit.ts`
- Tested: `src/app/api/auth/magic-link/request/__tests__/route.test.ts` exercises the happy path and rate-limit rejection.
- Untested: Eviction at 5000 buckets; the `__resetRateLimitForTests` helper suggests tests do use it but no destabilization test exists.
- Priority: Low — the in-memory limiter is already documented as a pilot-scale compromise.

**IDB schema upgrade path is not tested:**
- Files: `src/lib/storage.ts`, `src/lib/voice-storage.ts`
- Untested: Users with DB_VERSION=3 upgrading to 4; either module being the first to open.
- Risk: A schema-duplication drift across the two modules breaks the upgrade for whichever module loses the race.
- Priority: Medium — existing users lose data silently if this breaks.

---

*Concerns audit: 2026-04-20*
