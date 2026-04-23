# Architecture

**Analysis Date:** 2026-04-20

## Pattern Overview

**Overall:** Next.js 16 App Router monolith with a privacy-first, client-heavy design. Server is a thin proxy/auth layer; virtually all ritual data processing lives in the browser.

**Key Characteristics:**
- **Browser-owned data plane.** Ritual text is encrypted at rest in IndexedDB (AES-256-GCM) and only decrypted on-device. The server never sees plaintext ritual content.
- **Server as API-key custodian.** All paid AI endpoints (Gemini TTS, Voxtral, ElevenLabs, Deepgram, Google Cloud TTS, Kokoro, Groq Whisper, Mistral, Anthropic) are reached through `/api/*` proxy routes in `src/app/api/` so secrets stay off the client.
- **Two-binary ceremony format.** A custom encrypted `.mram` container (see `src/lib/mram-format.ts`) bundles cipher text (user-facing), plain text (AI-comparison-facing), optional style tags, and optional pre-rendered Opus audio into one file. Users unlock it with a lodge passphrase.
- **Multi-engine TTS with fallback chain.** The TTS layer in `src/lib/text-to-speech.ts` dispatches to one of seven engines (default Gemini). The Gemini route itself fans out across three preview models on 429/404.
- **Dual auth layers.** Middleware runs both a pilot JWT session gate (magic-link email sign-in) and a shared-secret header check, plus CORS origin allowlisting and CSP headers.
- **Dev-only author tooling.** The `/author` route and `/api/author/*` endpoints refuse to run in production and require loopback origins.

## Layers

**UI layer — pages:**
- Purpose: Route-level composition, data loading from IndexedDB, rendering high-level page chrome.
- Location: `src/app/{route}/page.tsx`
- Contains: Client components (`"use client"`) that orchestrate feature components.
- Depends on: `src/components/*`, `src/lib/storage.ts`, Next.js router.
- Used by: The user (via URL routes).

**UI layer — feature components:**
- Purpose: Ritual practice workflows (rehearsal with STT+diff scoring, listen-through playback, voice management, document upload, performance tracking).
- Location: `src/components/`
- Contains: `RehearsalMode.tsx` (~62 KB, the practice engine), `ListenMode.tsx`, `DocumentUpload.tsx`, `PerformanceTracker.tsx`, `Navigation.tsx`, `DiffDisplay.tsx`, `MasonicIcons.tsx`, `PilotBanner.tsx`, `GeminiPreloadPanel.tsx`, `TTSEngineSelector.tsx` (unmounted).
- Depends on: `src/lib/*` (TTS, STT, storage, comparison, wake lock, performance history).
- Used by: Page components.

**Domain layer — lib modules (`src/lib/`):**
- Purpose: All business logic. Each file owns one concern.
- Location: `src/lib/`
- Key modules:
  - `mram-format.ts` — `.mram` encryption/decryption, format spec, versioning.
  - `storage.ts` — IndexedDB document/section persistence, AES-GCM-at-rest, schema migrations (v4 schema: documents, sections, settings, voices, audioCache).
  - `voice-storage.ts` — parallel IndexedDB owner for the `voices` store (shares DB_VERSION with `storage.ts`).
  - `text-to-speech.ts` — multi-engine TTS dispatcher; persists engine choice in `localStorage` key `tts-engine-v2` (default `gemini`).
  - `tts-cloud.ts` — cloud TTS engine implementations; shared `playAudioBlob` with a monotonic `playToken` race guard; role→voice assignment.
  - `speech-to-text.ts` — Web Speech API engine and Groq Whisper engine (via `/api/transcribe`).
  - `text-comparison.ts` — word-level diff and accuracy scoring for rehearsal.
  - `rehearsal-decision.ts` — state-machine helpers that decide advance/retry/score next action.
  - `performance-history.ts` — session persistence and trend analysis.
  - `dialogue-format.ts`, `dialogue-to-mram.ts`, `author-validation.ts` — author pipeline: parse `{slug}-dialogue.md` pairs into MRAM documents.
  - `voice-cast.ts` — Gemini director's-notes preamble (used at bake time).
  - `styles.ts` — single-source-of-truth `STYLE_TAG_PATTERN` regex for Gemini audio tags.
  - `gavel-sound.ts` — WebAudio gavel-knock playback via `public/sounds/gavel.mp3`.
  - `screen-wake-lock.ts` — idempotent wake-lock with auto-reacquire on visibilitychange.
  - `auth.ts` — jose-based magic-link + session JWT sign/verify; edge-runtime safe.
  - `rate-limit.ts` — in-memory sliding-window limiter for API routes.
  - `api-fetch.ts` — client `fetch` wrapper that attaches `X-Client-Secret`.
  - `audio-utils.ts` — `normalizeAudio` + `encodeWav` for voice-sample handling.
  - `default-voices.ts` — seeds IndexedDB with reference voice samples from `public/voices/`.
- Used by: Components, API routes, scripts.

**Server layer — API routes:**
- Purpose: Proxy paid AI calls, authenticate the pilot, transcribe speech, generate rehearsal feedback. Never serve ritual content.
- Location: `src/app/api/`
- Organization:
  - `api/tts/{engine}/route.ts` — seven engines (`elevenlabs`, `google`, `deepgram`, `kokoro`, `gemini`, `voxtral`, plus `voxtral/voices`, `voxtral/setup`, `voxtral/clone-aura`, and an `engines/route.ts` availability probe).
  - `api/transcribe/route.ts` — Groq Whisper proxy with Masonic vocabulary prompt.
  - `api/rehearsal-feedback/route.ts` — LLM coaching (Groq Llama 3.3 → Mistral fallback) with a roast-style persona.
  - `api/auth/magic-link/request/route.ts`, `api/auth/magic-link/verify/route.ts`, `api/auth/signout/route.ts` — pilot email sign-in.
  - `api/author/{list,pair,mram,suggest-styles}/route.ts` — dev-only ritual authoring; gated by `api/author/_guard.ts`.
- Depends on: `src/lib/auth.ts`, `src/lib/rate-limit.ts`, `src/lib/styles.ts`, `src/lib/mram-format.ts`.
- Used by: The browser (via `src/lib/api-fetch.ts`) and scripts.

**Middleware / edge layer:**
- Purpose: Root redirect (`/` → `/landing.html`), CORS for `/api/*`, shared-secret header check, pilot JWT session gate, origin allowlist.
- Location: `src/middleware.ts`
- Matcher: excludes static assets and `.mram` files; runs on every dynamic path.

**Build/offline scripts (`scripts/`):**
- Purpose: Bake a ritual: parse dialogue MD → validate → Gemini TTS render → embed Opus audio into the encrypted `.mram`. Separate scripts for rotating passphrases, listing lines, invalidating the baked audio cache, benchmarking TTS engines.
- Location: `scripts/*.ts`
- Runtime: Node (tsx / vitest-compatible), never shipped to the client.

## Data Flow

**Ritual upload → practice (end-user path):**

1. User visits `/upload`. `DocumentUpload` (`src/components/DocumentUpload.tsx`) reads a `.mram` file client-side.
2. `decryptMRAM` in `src/lib/mram-format.ts` prompts for the lodge passphrase and derives an AES-GCM key (PBKDF2).
3. Plaintext `MRAMDocument` is converted via `mramToSections` into `RitualSectionWithCipher[]`.
4. `storage.ts` re-encrypts sections with a per-device AES-GCM key (stored in the IndexedDB `settings` store) and writes to the `documents` + `sections` stores.
5. User navigates to `/practice?doc=<id>`. `page.tsx` loads sections, branches on `activeTab` (`rehearsal` | `listen`) to either `RehearsalMode` or `ListenMode`.
6. For each line, `RehearsalMode` either calls `speakAsRole(...)` (AI officer) or gates STT input (user officer), runs `compareTexts` against plain text, renders a `DiffDisplay`, and persists a `PracticeSession` via `performance-history.ts`.

**TTS request path (browser → Gemini):**

1. Component calls `speakGeminiAsRole` in `src/lib/tts-cloud.ts`.
2. `fetchApi` (`src/lib/api-fetch.ts`) POSTs to `/api/tts/gemini` with `X-Client-Secret` header.
3. Middleware validates secret, origin, and session cookie.
4. Route in `src/app/api/tts/gemini/route.ts` appends a `[style]` prefix and calls `streamGenerateContent` against the first available model in `[gemini-3.1-flash-tts-preview, gemini-2.5-flash-preview-tts, gemini-2.5-pro-preview-tts]` (429/404 → fall through).
5. Server buffers SSE PCM chunks, prepends a RIFF header, returns a `Content-Length`-typed WAV.
6. `playAudioBlob` acquires a monotonic `playToken`, plays the blob, re-checks the token before `audio.play()` to prevent voice overlap on rapid taps.

**Pre-baked audio path (zero-API-call playback):**

1. At bake time (`scripts/build-mram-from-dialogue.ts --with-audio`), Gemini is called for every line using the director's-notes preamble from `src/lib/voice-cast.ts` and the `{slug}-voice-cast.json` sidecar.
2. Opus-32k-mono audio is embedded per line in `MRAMLine.audio` (base64) and the cast is pinned in `MRAMMetadata.voiceCast`.
3. At runtime, `speakAsRole` uses the embedded audio directly when engine + voice cast match; otherwise it falls through to IndexedDB `audioCache` or the live API.

**Pilot sign-in flow:**

1. User submits email at `/signin`. `api/auth/magic-link/request/route.ts` checks `LODGE_ALLOWLIST`, signs a 24h JWT, emails via Resend.
2. Link points to `api/auth/magic-link/verify/route.ts`, which exchanges the magic token for a 30-day session JWT in an httpOnly cookie (`pilot-session`).
3. `src/middleware.ts` verifies the cookie on every non-public path.

**State Management:**
- Component-local React state (`useState` / `useRef`) — no global store.
- Persistent state lives in IndexedDB (ritual content, voices, audio cache, performance history) and `localStorage` (TTS engine selection, preferences).
- Cross-module DB schema is coordinated by a shared `DB_VERSION` constant in `src/lib/storage.ts` (keep in lockstep with `src/lib/voice-storage.ts`).

## Key Abstractions

**`MRAMDocument` / `MRAMLine`:**
- Purpose: Canonical ritual representation: cipher text, plain text, speaker role, gavel count, optional action, optional Gemini style tag, optional pre-baked audio.
- Examples: `src/lib/mram-format.ts` lines 23-80.
- Pattern: Versioned binary container (`MRAM` magic + version + salt + IV + AES-GCM JSON).

**`RitualSectionWithCipher`:**
- Purpose: In-memory per-line record after `.mram` decryption — the shape every practice UI consumes.
- Examples: `src/lib/storage.ts`, consumed in `src/components/RehearsalMode.tsx` and `src/components/ListenMode.tsx`.

**`RoleVoiceProfile` / `assignVoicesToRoles`:**
- Purpose: Stable mapping from officer role code (`"WM"`, `"SW"`, `"JD"`, ...) to a voice profile for whichever engine is active.
- Examples: `src/lib/text-to-speech.ts`, `src/lib/tts-cloud.ts`.

**`STTEngine` interface:**
- Purpose: Uniform event-emitter contract over Web Speech API and Groq Whisper so components can swap engines with identical `onResult` / `onEnd` / `onSilence` callbacks.
- Examples: `src/lib/speech-to-text.ts`.

**`STYLE_TAG_PATTERN`:**
- Purpose: Single regex authority for Gemini audio-tag validation used by the TTS route, the author tool, and the MRAM ingestion pipeline.
- Examples: `src/lib/styles.ts`.

**Rehearsal state machine:**
- Purpose: The `RehearsalState` union and helpers in `src/lib/rehearsal-decision.ts` describe the full rehearsal loop: `setup → ready → ai-speaking → user-turn → listening → transcribing|auto-checking → checking → auto-advancing|...`.
- Examples: `src/components/RehearsalMode.tsx` lines 51-60, `src/lib/rehearsal-decision.ts`.

## Entry Points

**Root layout:**
- Location: `src/app/layout.tsx`
- Triggers: Every route.
- Responsibilities: Mount `<PilotBanner>` and `<Navigation>`, load Cinzel + Lato fonts, set metadata, wrap children in `<main>`.

**Home page redirect:**
- Location: `src/middleware.ts` (matcher handles `/`)
- Triggers: GET `/`.
- Responsibilities: 307 redirect to `/landing.html` (static marketing page in `public/`).

**Authenticated pages:**
- Locations: `src/app/{upload,practice,voices,progress,walkthrough}/page.tsx`.
- Triggers: User navigation. All are `"use client"` components that read IndexedDB on mount.

**Sign-in page:**
- Location: `src/app/signin/page.tsx` (server component) + `src/app/signin/SignInForm.tsx` (client form).
- Triggers: Middleware redirects here when `pilot-session` cookie is missing/invalid.

**Dev-only author page:**
- Location: `src/app/author/page.tsx`.
- Triggers: Manual navigation during authoring. Guarded by `_guard.ts`; returns 404 in production.

**API routes:**
- Locations: `src/app/api/**/route.ts` (see Layers above for the full list).
- Triggers: Fetches from client via `src/lib/api-fetch.ts` or direct `fetch`.

**Scripts:**
- Locations: `scripts/*.ts`.
- Triggers: Manual invocation by the author/maintainer (e.g., `tsx scripts/build-mram-from-dialogue.ts`).

## Error Handling

**Strategy:** Return-null on security-sensitive paths, structured `NextResponse.json({ error }, { status })` on API routes, toast/inline error UI in components.

**Patterns:**
- **Auth failures collapse to null.** `verifySessionToken` and `verifyMagicLinkToken` in `src/lib/auth.ts` swallow all failure modes (expired/tampered/wrong audience) and return `null` so callers can't be used for oracle attacks.
- **Fallback chains on paid AI.** `src/app/api/tts/gemini/route.ts` iterates an ordered model list on 429/404. `src/app/api/rehearsal-feedback/route.ts` tries Groq, falls through to Mistral. Client-side, `src/lib/tts-cloud.ts` has a Gemini → Voxtral → browser-TTS fallback.
- **Input size caps on paid endpoints.** TTS routes cap at 2000 chars (`MAX_TEXT_CHARS`) returning 413. `api/transcribe/route.ts` caps at 1 MB.
- **Race-free audio.** `src/lib/tts-cloud.ts` uses the `playToken` monotonic counter to bail stale `audio.play()` calls triggered by rapid user taps.
- **Silent degradation for unsupported APIs.** `src/lib/screen-wake-lock.ts` swallows Wake Lock API errors; playback still works, the screen just may sleep.

## Cross-Cutting Concerns

**Logging:**
- `console.error` / `console.warn` on the server for API failures. No structured logger.
- Diagnostic logging on Gemini TTS parse failures (first 800 chars of raw SSE + event counts) so Vercel logs surface format drift.

**Validation:**
- `STYLE_TAG_PATTERN` regex in `src/lib/styles.ts` gates all style tags.
- JSON body parsing is wrapped in try/catch returning 400 on parse failure.
- Author routes refuse non-slug pair names via a strict regex in `src/app/api/author/_guard.ts`.

**Authentication:**
- Middleware enforces the `pilot-session` JWT cookie on every non-public path when `JWT_SECRET` is configured.
- Shared-secret header (`X-Client-Secret`) additionally gates `/api/*` except `/api/auth/*`.
- Non-allowlisted emails still get 200 from magic-link request to prevent allowlist enumeration.

**Security headers:**
- CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(self), geolocation=()` — all set in `next.config.ts`.
- `connect-src` CSP explicitly allows `api.mistral.ai`, `generativelanguage.googleapis.com`, `texttospeech.googleapis.com`, `api.resend.com`.

**Rate limiting:**
- `src/lib/rate-limit.ts` — in-memory sliding window keyed by client IP (derived via `getClientIp` with XFF-spoofing mitigation). Pilot-scale only; documented upgrade path to Upstash Redis.

---

*Architecture analysis: 2026-04-20*
