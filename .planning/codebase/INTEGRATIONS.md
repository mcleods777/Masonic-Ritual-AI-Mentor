# External Integrations

**Analysis Date:** 2026-04-20

## APIs & External Services

**LLM / AI feedback:**
- Groq (primary) — Llama 3.3 70B Versatile and Whisper Large v3
  - Endpoint (chat): `https://api.groq.com/openai/v1/chat/completions`
  - Endpoint (STT): `https://api.groq.com/openai/v1/audio/transcriptions`
  - Client: raw `fetch()` with Bearer auth (no SDK)
  - Auth: `GROQ_API_KEY`
  - Used in: `src/app/api/rehearsal-feedback/route.ts` (streaming chat), `src/app/api/transcribe/route.ts` (Whisper STT), `src/app/api/author/suggest-styles/route.ts` (non-streaming chat)
  - Model override: `FEEDBACK_MODEL` env var
- Mistral AI (fallback) — Mistral Small Latest
  - Endpoint: `https://api.mistral.ai/v1/chat/completions`
  - Auth: `MISTRAL_API_KEY`
  - Used in: same three routes as Groq; `getProvider()` helper picks Groq first, Mistral second

**Text-to-Speech (7 engines, all proxied through Next.js API routes to keep keys server-side):**
- Google Gemini 3.1 Flash TTS (default engine)
  - Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse`
  - Auth: `GOOGLE_GEMINI_API_KEY` (query-string `?key=...`)
  - Fallback chain: `gemini-3.1-flash-tts-preview` → `gemini-2.5-flash-preview-tts` → `gemini-2.5-pro-preview-tts` on 429/404 (override via `GEMINI_TTS_MODELS` comma-separated env var)
  - Used in: `src/app/api/tts/gemini/route.ts`
- Mistral Voxtral TTS — voice cloning via ref_audio
  - Endpoints: `https://api.mistral.ai/v1/audio/speech` (synthesize), `https://api.mistral.ai/v1/audio/voices` (CRUD voice profiles)
  - Auth: `MISTRAL_API_KEY`
  - Model: `voxtral-mini-tts-2603`, streaming mp3
  - Used in: `src/app/api/tts/voxtral/{route,voices,setup,clone-aura}/route.ts`
- ElevenLabs TTS
  - Endpoint: `https://api.elevenlabs.io/v1/text-to-speech/{voiceId}`
  - Auth: `ELEVENLABS_API_KEY` via `xi-api-key` header
  - Model: `eleven_multilingual_v2`
  - Used in: `src/app/api/tts/elevenlabs/route.ts`
- Google Cloud Text-to-Speech (Neural2)
  - Endpoint: `https://texttospeech.googleapis.com/v1/text:synthesize?key=...`
  - Auth: `GOOGLE_CLOUD_TTS_API_KEY` (query-string)
  - Used in: `src/app/api/tts/google/route.ts`
- Deepgram Aura-2
  - Endpoint: `https://api.deepgram.com/v1/speak?model={model}&encoding=mp3`
  - Auth: `DEEPGRAM_API_KEY` via `Authorization: Token ...`
  - Retry: 2 attempts with 500/1500ms backoff on 429/5xx
  - Used in: `src/app/api/tts/deepgram/route.ts`
- Kokoro TTS (self-hosted, OpenAI-compatible)
  - Endpoint: `${KOKORO_TTS_URL}/v1/audio/speech` (defaults to `http://localhost:8880`)
  - Auth: none (local service)
  - Used in: `src/app/api/tts/kokoro/route.ts`
- Browser Web Speech API — no network call; uses `SpeechSynthesisUtterance`

**Engine availability probe:**
- `GET /api/tts/engines` returns `{ elevenlabs, google, deepgram, kokoro, voxtral, gemini }` booleans based on env-var presence, consumed client-side by `src/components/TTSEngineSelector.tsx` and `src/lib/text-to-speech.ts`

**Email (transactional):**
- Resend
  - Client: `resend` SDK ^6.11.0 (`new Resend(apiKey).emails.send(...)`)
  - Auth: `RESEND_API_KEY`
  - Sender: `MAGIC_LINK_FROM_EMAIL` (must be verified domain; `onboarding@resend.dev` allowed for initial testing)
  - Used in: `src/app/api/auth/magic-link/request/route.ts` — only for magic-link sign-in emails

**Fonts:**
- Google Fonts via `next/font/google` — `Cinzel` and `Lato` loaded in `src/app/layout.tsx`
- CSP whitelists `fonts.googleapis.com` (stylesheet) and `fonts.gstatic.com` (woff2) in `next.config.ts`

## Data Storage

**Databases:**
- None — there is no server-side database. The app is radically client-side.
- IndexedDB (browser) — primary data store in `src/lib/storage.ts` and `src/lib/voice-storage.ts`
  - DB name: `masonic-ritual-mentor`, current version 4
  - Object stores: `documents`, `sections`, `settings`, `voices`, `audioCache`
  - All ritual text encrypted at rest with AES-256-GCM using a per-device key stored in the `settings` store

**File Storage:**
- Local filesystem only (dev-only) — `src/app/api/author/mram/route.ts` writes encrypted `.mram` files into `rituals/` directory. The `_guard.ts` at `src/app/api/author/_guard.ts` blocks this in production (`NODE_ENV === "production"`) and off-loopback.
- Static `.mram` assets — none shipped by default; `.gitignore` excludes `*.mram` and `rituals/*.{md,txt,json}`
- Static public assets — `public/voices/*.{mp3,wav}` (pre-baked sample voices), `public/sounds/gavel.mp3`, `public/role-icons/*.png`

**Caching:**
- Per-request in-memory sliding-window rate-limit map — `src/lib/rate-limit.ts` (not a cache, but in-memory server state)
- IndexedDB `audioCache` object store — caches Gemini TTS WAV output keyed by text+voice+style (version 4 schema)
- No Redis / Upstash / Vercel KV currently wired; `rate-limit.ts` comments note Upstash as the swap-in target when pilot outgrows single-process memory.

## Authentication & Identity

**Auth Provider:**
- Custom magic-link email auth — implementation in `src/lib/auth.ts`
  - JWT library: `jose` (Edge-runtime safe)
  - Algorithm: HS256
  - Two token types:
    - Magic-link token (24h TTL, audience `pilot-magic-link`) — mailed via Resend
    - Session token (30-day TTL, audience `pilot-session`) — httpOnly cookie `pilot-session`
  - Issuer: `masonic-ritual-mentor`
- Allowlist-based — `LODGE_ALLOWLIST` env var (comma-separated emails). Non-allowlisted addresses still receive a generic 200 to prevent enumeration (see `src/app/api/auth/magic-link/request/route.ts`).
- Gate is opt-in: when `JWT_SECRET` is unset, `isAuthConfigured()` returns false and `src/middleware.ts` skips the auth check (local-dev convenience).
- Magic-link rate limits: 5/hour per IP, 3/hour per email (`src/app/api/auth/magic-link/request/route.ts`).
- Kill switch: rotating `JWT_SECRET` invalidates every outstanding link and session within seconds.

**Cost-abuse protection (pseudo-auth):**
- Shared-secret gate — `RITUAL_CLIENT_SECRET` server-side, `NEXT_PUBLIC_RITUAL_CLIENT_SECRET` client-side. Middleware (`src/middleware.ts`) requires `X-Client-Secret` header to match on all `/api/*` except `/api/auth/*`. Documented in `.env.example` as NOT strong auth — purpose is stopping drive-by curl scripts from burning paid API credits.

## Monitoring & Observability

**Error Tracking:**
- None — no Sentry, Rollbar, Datadog, or similar SDK
- Server errors go to `console.error(...)` (visible in Vercel function logs). 16 occurrences across 5 files:
  - `src/app/api/transcribe/route.ts`, `src/app/api/rehearsal-feedback/route.ts`, `src/app/api/tts/voxtral/route.ts`, `src/app/api/tts/gemini/route.ts`, `src/app/practice/page.tsx`

**Analytics:**
- PostHog — env vars `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` (EU-hosted) are set in `.env.local` but **no `posthog-js` package is installed and no imports exist in `src/`**. The key is declared but not currently wired up. `TODOS.md` line 185 notes "no posthog/mixpanel/amplitude imports" — this is a pending integration.

**Logs:**
- Vercel function logs — `console.error / console.warn / console.log` only
- No structured logging (pino, winston) in use

## CI/CD & Deployment

**Hosting:**
- Vercel — production URL `masonic-ritual-ai-mentor.vercel.app`
- `.vercel/project.json` pins `orgId: team_eutuiNuv1LruKwotUMw3j23u`, `projectId: prj_QUCVIP2LACuMV9qY6Lguqt2ZXJQW`

**CI Pipeline:**
- None inside the repo — no `.github/workflows/`, no CircleCI, no GitLab CI, no Vercel-specific `vercel.json` build hooks
- Deployment is either git-triggered (via Vercel's GitHub integration) or direct `vercel` CLI pushes
- Tests are run manually (`npm run test:run`); not blocking deploys

## Environment Configuration

**Required env vars (for full functionality):**
- `GROQ_API_KEY` — STT (Whisper) + LLM feedback (required — nothing else can supply Whisper)
- `GOOGLE_GEMINI_API_KEY` — default TTS engine
- `JWT_SECRET` (≥32 chars) — pilot auth gate
- `LODGE_ALLOWLIST` — comma-separated pilot emails
- `RESEND_API_KEY` + `MAGIC_LINK_FROM_EMAIL` — magic-link email delivery
- `RITUAL_CLIENT_SECRET` + `NEXT_PUBLIC_RITUAL_CLIENT_SECRET` — paired shared secret for API gate

**Optional env vars:**
- `MISTRAL_API_KEY` — fallback LLM + Voxtral TTS + voice cloning
- `ELEVENLABS_API_KEY`, `DEEPGRAM_API_KEY`, `GOOGLE_CLOUD_TTS_API_KEY`, `KOKORO_TTS_URL` — additional TTS engines
- `FEEDBACK_MODEL` — override default Llama/Mistral model name
- `GEMINI_TTS_MODELS` — override default Gemini fallback chain
- `PILOT_MODE=true` — show pilot banner
- `MAGIC_LINK_BASE_URL` — override base URL inferred from `x-forwarded-host`

**Dev-only env vars:**
- `MRAM_AUTHOR_ALLOW_LAN=1` — allow `/api/author/*` off loopback (normally localhost-only)
- `MRAM_PASSPHRASE` — skip interactive passphrase prompt in baking scripts

**Secrets location:**
- Local: `.env` (gitignored) and `.env.local` (gitignored)
- Production: Vercel environment variables (`vercel env add ...`); `.env.vercel-temp` listed in `.gitignore` suggests occasional pull via `vercel env pull`
- Gitignore protections: `.env`, `.env*.local`, `*.pem`, `*.credentials`, `credentials.json`, `gitkey`

## Webhooks & Callbacks

**Incoming:**
- `GET /api/auth/magic-link/verify?t=<token>` — user clicks magic-link email, server verifies JWT, sets `pilot-session` httpOnly cookie, redirects. This is a link-callback, not a third-party webhook.

**Outgoing:**
- None — no webhook posts from this app to any third party

## Pre-rendered Audio Pipeline

Not a runtime integration, but a distinctive build-time external call pattern worth noting:
- `scripts/render-gemini-audio.ts` and `scripts/bake-first-degree.ts` call Gemini TTS at build time to pre-render every ritual line's audio, embed the encrypted Opus bytes into the `.mram` file (v3 format, see `src/lib/mram-format.ts`), and ship audio-baked rituals to users. This means shipped pilot installs can play ritual audio offline with zero runtime Gemini API calls, and the Gemini key is only spent once per ritual-edit cycle.

---

*Integration audit: 2026-04-20*
