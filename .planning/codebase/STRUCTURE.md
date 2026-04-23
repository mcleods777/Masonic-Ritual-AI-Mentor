# Codebase Structure

**Analysis Date:** 2026-04-20

## Directory Layout

```
Masonic-Ritual-AI-Mentor/
├── src/
│   ├── app/                     # Next.js App Router pages + API routes
│   │   ├── layout.tsx           # Root layout (fonts, nav, banner)
│   │   ├── page.tsx             # Home (unused — middleware redirects to /landing.html)
│   │   ├── globals.css          # Tailwind entry + custom CSS vars
│   │   ├── favicon.ico
│   │   ├── signin/              # Pilot magic-link sign-in
│   │   │   ├── page.tsx         # Server component wrapper
│   │   │   └── SignInForm.tsx   # Client form
│   │   ├── upload/page.tsx      # .mram upload & decrypt
│   │   ├── practice/page.tsx    # Rehearsal + Listen mode tabs
│   │   ├── voices/page.tsx      # Voice cloning & assignment (Voxtral)
│   │   ├── progress/page.tsx    # Performance tracker view
│   │   ├── walkthrough/page.tsx # User-facing how-it-works
│   │   ├── author/page.tsx      # DEV-ONLY ritual authoring UI
│   │   └── api/
│   │       ├── auth/
│   │       │   ├── magic-link/request/route.ts
│   │       │   ├── magic-link/verify/route.ts
│   │       │   └── signout/route.ts
│   │       ├── tts/
│   │       │   ├── engines/route.ts       # Availability probe
│   │       │   ├── gemini/route.ts        # Google Gemini 3.x TTS (default)
│   │       │   ├── google/route.ts        # Google Cloud TTS Neural2
│   │       │   ├── elevenlabs/route.ts
│   │       │   ├── deepgram/route.ts
│   │       │   ├── kokoro/route.ts
│   │       │   └── voxtral/
│   │       │       ├── route.ts           # Mistral Voxtral TTS
│   │       │       ├── voices/route.ts
│   │       │       ├── setup/route.ts
│   │       │       └── clone-aura/route.ts
│   │       ├── transcribe/route.ts        # Groq Whisper STT
│   │       ├── rehearsal-feedback/route.ts # Groq Llama → Mistral coaching
│   │       └── author/                    # DEV-ONLY
│   │           ├── _guard.ts              # Gate: NODE_ENV + loopback + CSRF
│   │           ├── list/route.ts
│   │           ├── pair/route.ts
│   │           ├── mram/route.ts
│   │           └── suggest-styles/route.ts
│   ├── components/              # Feature-level React components
│   │   ├── RehearsalMode.tsx    # 62 KB — practice engine with STT + scoring
│   │   ├── ListenMode.tsx       # Full-ceremony playback
│   │   ├── DocumentUpload.tsx   # .mram drag-drop + passphrase prompt
│   │   ├── DiffDisplay.tsx      # Word-level accuracy diff renderer
│   │   ├── PerformanceTracker.tsx
│   │   ├── Navigation.tsx       # Top/bottom responsive nav bar
│   │   ├── PilotBanner.tsx
│   │   ├── MasonicIcons.tsx     # Role SVG icons
│   │   ├── TTSEngineSelector.tsx # UNMOUNTED — Gemini is default
│   │   ├── GeminiPreloadPanel.tsx # UNMOUNTED
│   │   └── __tests__/
│   │       └── silent-preload.test.tsx
│   ├── lib/                     # Domain logic — one concern per file
│   │   ├── mram-format.ts       # .mram binary format + crypto
│   │   ├── storage.ts           # IndexedDB (documents/sections/settings/audioCache)
│   │   ├── voice-storage.ts     # IndexedDB (voices store — shares DB_VERSION)
│   │   ├── text-to-speech.ts    # Multi-engine TTS dispatcher
│   │   ├── tts-cloud.ts         # 56 KB — cloud TTS engine impls + audio race guard
│   │   ├── speech-to-text.ts    # Web Speech + Groq Whisper STT
│   │   ├── text-comparison.ts   # Word-level diff accuracy scoring
│   │   ├── rehearsal-decision.ts # Advance/retry state-machine helpers
│   │   ├── performance-history.ts # Session persistence & trends
│   │   ├── dialogue-format.ts   # Parse/serialize {slug}-dialogue.md
│   │   ├── dialogue-to-mram.ts  # Build MRAMDocument from dialogue files
│   │   ├── author-validation.ts # Side-by-side validation for /author UI
│   │   ├── voice-cast.ts        # Gemini director's-notes preamble
│   │   ├── styles.ts            # STYLE_TAG_PATTERN regex (SSoT)
│   │   ├── default-voices.ts    # Seed IndexedDB from public/voices/*
│   │   ├── document-parser.ts   # Legacy PDF/DOCX/TXT parser + ROLE_DISPLAY_NAMES
│   │   ├── gavel-sound.ts       # WebAudio gavel knocks
│   │   ├── screen-wake-lock.ts  # Mobile screen-awake wrapper
│   │   ├── audio-utils.ts       # normalizeAudio + encodeWav
│   │   ├── auth.ts              # jose magic-link & session JWTs
│   │   ├── rate-limit.ts        # In-memory sliding-window limiter
│   │   ├── api-fetch.ts         # fetch() wrapper with X-Client-Secret
│   │   └── __tests__/           # Vitest specs (13 files)
│   └── middleware.ts            # Root redirect, CORS, pilot JWT gate
├── scripts/                     # Offline Node scripts (tsx)
│   ├── build-mram-from-dialogue.ts  # Dialogue MD → MRAM (with optional --with-audio)
│   ├── build-mram.ts             # Legacy build path
│   ├── render-gemini-audio.ts    # Bake audio only
│   ├── invalidate-mram-cache.ts
│   ├── rotate-mram-passphrase.ts
│   ├── validate-rituals.ts
│   ├── list-ritual-lines.ts
│   ├── bake-first-degree.ts      # Composite workflow
│   ├── benchmark-tts.ts
│   └── verify-mram.ts
├── rituals/                     # Author inputs + outputs (dev-only content)
│   ├── ea-opening-dialogue.md           # Plain text
│   ├── ea-opening-dialogue-cipher.md    # Cipher text
│   ├── ea-opening-styles.json           # Per-line Gemini style tags
│   ├── ea-opening-voice-cast.json       # Role → Gemini voice
│   ├── ea-opening.mram                  # Baked encrypted output
│   ├── ea-initiation-*.{md,json,mram}
│   ├── ea-closing-*.{md,json,mram}
│   └── ea-explanatory-*.{md,json,mram}
├── files/                       # Raw source uploads used to seed authoring
│   ├── EA_Initiation.txt
│   ├── EA_Closing.txt
│   ├── ea-initiation-cipher.txt
│   ├── EA_Closing_Cipher.txt
│   └── masonic-voices-*.json
├── public/                      # Static assets
│   ├── landing.html             # Marketing page (root redirect target)
│   ├── manifest.json            # PWA manifest
│   ├── role-icons/              # PNG icons per officer (wm, sw, jw, sd, jd, etc.)
│   ├── sounds/gavel.mp3
│   ├── voices/                  # Reference voice samples (mp3/wav)
│   ├── pdf.worker.min.mjs       # pdfjs-dist worker
│   └── pretext.js, pretext-test.html
├── docs/                        # Human-readable docs
│   ├── BAKE-WORKFLOW.md
│   ├── INSTALL-GUIDE.md
│   ├── NOTION-HOW-TO.md
│   ├── pilot-email.{html,md}
│   ├── diagrams/
│   └── install-guide-images/
├── .planning/codebase/          # Codebase maps (this directory)
├── .claude/                     # Project-local Claude config
├── .gstack/                     # gstack skill metadata
├── .vercel/                     # Vercel deploy scratch
├── .next/                       # Build output (gitignored)
├── next.config.ts               # Next + CSP + security headers
├── next-env.d.ts
├── tsconfig.json                # Paths alias: @/* → ./src/*
├── tsconfig.tsbuildinfo
├── eslint.config.mjs
├── postcss.config.mjs
├── vitest.config.ts
├── package.json
├── package-lock.json
├── README.md
├── TODOS.md                     # Active work list
├── CLAUDE.md                    # Project instructions for Claude Code
├── bake.log
├── .env                         # Secrets (gitignored)
├── .env.example
└── .env.local
```

## Directory Purposes

**`src/app/`:**
- Purpose: Next.js App Router routes. Every direct child directory is a URL segment; each contains a `page.tsx` (and optionally client-only siblings like `SignInForm.tsx`).
- Contains: Page components (most `"use client"`), route handlers under `api/`.
- Key files: `layout.tsx`, `middleware.ts` (sibling of `app/`, at `src/` root).

**`src/components/`:**
- Purpose: Feature-level UI components that span multiple pages or encapsulate significant workflow logic.
- Contains: Large orchestration components (`RehearsalMode.tsx`, `ListenMode.tsx`), smaller presentation (`Navigation.tsx`, `PilotBanner.tsx`, `DiffDisplay.tsx`, `MasonicIcons.tsx`).
- Key files: `RehearsalMode.tsx` (the single biggest component in the app).

**`src/lib/`:**
- Purpose: All domain logic. No JSX, no React (except test files). Each file owns exactly one concern — prefer adding a new file over growing an existing one.
- Contains: Storage, crypto, TTS/STT, comparison, auth, format parsing, audio utilities.
- Key files: `mram-format.ts`, `storage.ts`, `text-to-speech.ts`, `tts-cloud.ts`, `speech-to-text.ts`, `rehearsal-decision.ts`.

**`src/app/api/`:**
- Purpose: Server-side proxy and auth endpoints. Secrets are read from `process.env` here; never from client code.
- Contains: One subdirectory per external provider or concern.
- Key files: `tts/gemini/route.ts`, `transcribe/route.ts`, `rehearsal-feedback/route.ts`, `auth/magic-link/verify/route.ts`, `author/_guard.ts`.

**`scripts/`:**
- Purpose: Author/build-time Node scripts run with `tsx` (never shipped to client).
- Contains: The ritual bake pipeline and maintenance tools.
- Key files: `build-mram-from-dialogue.ts` (main bake), `render-gemini-audio.ts`.

**`rituals/`:**
- Purpose: Author workspace — dialogue source + sidecar JSONs + baked `.mram` outputs.
- Contains: `{slug}-dialogue.md`, `{slug}-dialogue-cipher.md`, `{slug}-styles.json`, `{slug}-voice-cast.json`, `{slug}.mram` per ceremony.
- Key files: `ea-opening.mram`, `ea-initiation.mram`, `ea-closing.mram`, `ea-explanatory.mram`.

**`files/`:**
- Purpose: Raw source materials imported once at authoring time (plain text ritual uploads, exported voices JSON).
- Contains: Historical inputs before they were split into dialogue/cipher pairs.

**`public/`:**
- Purpose: Static assets served verbatim at the URL root.
- Contains: `landing.html` (the real homepage), role icons, gavel sound, voice samples, PDF worker.

**`docs/`:**
- Purpose: Human-readable workflow and pilot documentation (not loaded by code).

**`.planning/codebase/`:**
- Purpose: Generated codebase-map docs (this file, `ARCHITECTURE.md`, etc.) for other Claude agents to consume.

## Key File Locations

**Entry Points:**
- `src/middleware.ts` — first thing every request hits; handles root redirect, auth, CORS.
- `src/app/layout.tsx` — root layout for all routes.
- `src/app/signin/page.tsx` — unauthenticated entry point.
- `src/app/upload/page.tsx` — new-user flow start.
- `src/app/practice/page.tsx` — primary app workflow.
- `public/landing.html` — marketing home (root redirect target).

**Configuration:**
- `next.config.ts` — CSP and security headers.
- `tsconfig.json` — `@/*` path alias to `./src/*`.
- `vitest.config.ts` — test runner config.
- `eslint.config.mjs` — flat-config lint rules.
- `postcss.config.mjs` — Tailwind v4 pipeline.
- `.env` / `.env.local` / `.env.example` — environment variables (secrets gitignored).

**Core Logic:**
- `src/lib/mram-format.ts` — ritual file format.
- `src/lib/storage.ts` — client-side encrypted persistence.
- `src/lib/text-to-speech.ts` + `src/lib/tts-cloud.ts` — multi-engine audio playback.
- `src/lib/speech-to-text.ts` — STT engines.
- `src/lib/text-comparison.ts` + `src/lib/rehearsal-decision.ts` — rehearsal scoring.
- `src/lib/auth.ts` — JWT helpers.
- `src/components/RehearsalMode.tsx` — central workflow component.

**Testing:**
- `src/lib/__tests__/*.test.ts` — unit specs for lib modules.
- `src/components/__tests__/*.test.tsx` — component specs.
- `src/app/api/auth/magic-link/request/__tests__/route.test.ts` — colocated API route spec.
- `vitest.config.ts` — jsdom environment.

## Naming Conventions

**Files:**
- **React components** — PascalCase with `.tsx` extension (e.g., `RehearsalMode.tsx`, `DocumentUpload.tsx`).
- **Library modules** — kebab-case with `.ts` extension (e.g., `mram-format.ts`, `text-to-speech.ts`, `screen-wake-lock.ts`).
- **API routes** — always `route.ts` (Next.js convention), placed in a directory whose name is the URL segment.
- **Page components** — always `page.tsx` (Next.js convention).
- **Tests** — `*.test.ts` or `*.test.tsx`, placed in a `__tests__/` subdirectory adjacent to the code under test.
- **Scripts** — kebab-case `.ts` files in `scripts/` (e.g., `build-mram-from-dialogue.ts`).
- **Private helpers** in API routes — prefix `_` (e.g., `src/app/api/author/_guard.ts`).

**Directories:**
- **Page routes** — lowercase, single word or kebab-case (e.g., `practice`, `signin`, `walkthrough`).
- **API groupings** — lowercase, match the provider or concern name (e.g., `tts`, `auth`, `author`).
- **Tests** — always `__tests__/`.

**Ritual content slugs:**
- lowercase-kebab, 1-64 chars, matches `/^[a-z0-9][a-z0-9-]{0,63}$/` (enforced by `src/app/api/author/_guard.ts`).
- Sidecar files follow the `{slug}-dialogue.md` / `{slug}-dialogue-cipher.md` / `{slug}-styles.json` / `{slug}-voice-cast.json` / `{slug}.mram` pattern.

**Identifiers:**
- Role codes — uppercase ritual abbreviations (`WM`, `SW`, `JW`, `SD`, `JD`, `Sec`, `Tr`, `Chap`, `Tyler`, `Candidate`).
- Style tags — lowercase, match `STYLE_TAG_PATTERN` (`/^[a-z][a-z ,'-]{0,79}$/`).

## Where to Add New Code

**New page route:**
- Create `src/app/{segment}/page.tsx` as a `"use client"` component.
- If the route requires auth, nothing extra — middleware handles it by default.
- If the route is public (like `/signin`), add it to `isPilotPublicPath` in `src/middleware.ts`.
- Add a nav entry to `navItems` in `src/components/Navigation.tsx` if user-visible.

**New API route:**
- Create `src/app/api/{segment}/route.ts` with `POST` / `GET` exports.
- Read secrets only via `process.env`; never hardcode.
- If the endpoint calls a paid upstream, add the host to the `connect-src` CSP in `next.config.ts`.
- Cap input size and validate body shape before the upstream call.
- Consider using `src/lib/rate-limit.ts` with an appropriate key namespace.

**New TTS engine:**
- Add a route handler at `src/app/api/tts/{engine}/route.ts`.
- Add engine implementation in `src/lib/tts-cloud.ts` (`speak{Engine}`, `speak{Engine}AsRole`).
- Register the engine name in the `TTSEngineName` union and dispatcher in `src/lib/text-to-speech.ts`.
- Update `src/app/api/tts/engines/route.ts` availability probe if needed.

**New feature component:**
- Create `src/components/{ComponentName}.tsx` (PascalCase `.tsx`).
- If it's a major workflow, add an adjacent test in `src/components/__tests__/`.
- If it needs state persisted to IndexedDB, extend `src/lib/storage.ts` and bump `DB_VERSION` (keep `src/lib/voice-storage.ts` in lockstep — both modules must create the same stores).

**New domain logic:**
- Create a new file in `src/lib/` (prefer a new file over growing an existing one).
- Use kebab-case naming.
- Add a colocated `src/lib/__tests__/{name}.test.ts`.
- Import in components via the `@/lib/{name}` alias.

**New ritual:**
- Drop `{slug}-dialogue.md` + `{slug}-dialogue-cipher.md` into `rituals/`.
- Optionally create `{slug}-styles.json` and `{slug}-voice-cast.json` sidecars.
- Run `scripts/build-mram-from-dialogue.ts {slug}` (optionally `--with-audio`).
- The baked `{slug}.mram` is what users upload.

**New script:**
- Create `scripts/{name}.ts` (kebab-case).
- Use `tsx` to run; never import from code that assumes a browser env.

**New voice sample:**
- Drop the file (mp3/wav) into `public/voices/`.
- Register it in `src/lib/default-voices.ts` so it seeds new users' IndexedDB.

## Special Directories

**`.next/`:**
- Purpose: Next.js build output + dev cache.
- Generated: Yes.
- Committed: No (gitignored).

**`.vercel/`:**
- Purpose: Vercel CLI project linking.
- Generated: Yes.
- Committed: No (gitignored).

**`node_modules/`:**
- Purpose: npm dependencies.
- Generated: Yes.
- Committed: No.

**`.planning/codebase/`:**
- Purpose: Generated codebase maps (consumed by other GSD agents).
- Generated: Yes (by `/gsd-map-codebase`).
- Committed: Up to the team — currently tracked.

**`.claude/`:**
- Purpose: Project-local Claude Code config + gstack skill registrations.
- Generated: Partially (gstack binaries are rebuilt).
- Committed: Yes (config, skill configs).

**`.gstack/`:**
- Purpose: gstack skill metadata and state.
- Committed: Yes.

**`rituals/`:**
- Purpose: Author source files and baked `.mram` outputs.
- Contains secrets? No — dialogue and cipher files are plaintext, `.mram` files are encrypted with a lodge-specific passphrase.
- Committed: Yes (this is the authoritative ritual source).

**`files/`:**
- Purpose: Historical raw inputs used to seed `rituals/`. Not actively read by code.
- Committed: Yes.

**`.env` / `.env.local`:**
- Purpose: Environment secrets (JWT_SECRET, GOOGLE_GEMINI_API_KEY, GROQ_API_KEY, MISTRAL_API_KEY, RESEND_API_KEY, LODGE_ALLOWLIST, RITUAL_CLIENT_SECRET, etc.).
- Committed: NO — gitignored.

---

*Structure analysis: 2026-04-20*
