# Technology Stack

**Analysis Date:** 2026-04-20

## Languages

**Primary:**
- TypeScript 5.9.3 — all app code (`src/**/*.{ts,tsx}`), build scripts (`scripts/*.ts`), and config files (`next.config.ts`, `vitest.config.ts`)
- `strict: true` enabled in `tsconfig.json`; `target: "ES2017"`, `module: "esnext"`, `moduleResolution: "bundler"`
- JSX via `react-jsx` transform (no explicit `import React` required)

**Secondary:**
- JavaScript (ESM) — only for config files: `eslint.config.mjs`, `postcss.config.mjs`
- CSS — Tailwind-generated; single global stylesheet at `src/app/globals.css`
- Markdown — ritual dialogue source files in `rituals/*.md` and docs in `docs/`

## Runtime

**Environment:**
- Node.js — version not pinned in `package.json` (`engines` field absent); `@types/node ^20` in devDependencies suggests Node 20.x as the development target
- Next.js App Router — API route handlers default to the Edge runtime; several routes opt into `export const runtime = "nodejs"` (auth magic-link, author writes, Mistral Voxtral route uses Node streams)
- Client runtime — browser (ES2017+). PWA manifest at `public/manifest.json`

**Package Manager:**
- npm — `package-lock.json` present (349K), no `yarn.lock` / `pnpm-lock.yaml`
- Lockfile: committed

## Frameworks

**Core:**
- Next.js 16.2.3 — App Router, server components, Route Handlers under `src/app/api/**/route.ts`
- React 19.2.3 + React-DOM 19.2.3 — matching versions, functional components only
- Tailwind CSS 4.x — via `@tailwindcss/postcss` plugin in `postcss.config.mjs`; no `tailwind.config.*` file (Tailwind v4 config-less mode; theme lives in `globals.css` via `@theme`)

**Testing:**
- Vitest 4.1.2 with `jsdom` 29.0.1 environment — config in `vitest.config.ts`, test glob `src/**/*.test.{ts,tsx}` and `tests/**/*.test.{ts,tsx}`
- `@testing-library/react` 16.3.2 + `@testing-library/jest-dom` 6.9.1 — component-test matchers
- Run commands: `npm test` (watch), `npm run test:run` (one-shot). No separate coverage command wired up.

**Build/Dev:**
- Turbopack — enabled via `turbopack: {}` in `next.config.ts`
- Webpack override — only for canvas disable (`config.resolve.alias.canvas = false`) so `pdfjs-dist` builds on Vercel without `canvas` node module
- ESLint 9 + `eslint-config-next` 16.1.6 (`core-web-vitals` + `typescript` configs)
- `next-env.d.ts` auto-generated; excluded from ESLint
- TypeScript path alias: `@/*` → `./src/*` (mirrored in `vitest.config.ts` resolve.alias)

## Key Dependencies

**Critical:**
- `next` ^16.2.3, `react` 19.2.3, `react-dom` 19.2.3 — framework core
- `jose` ^6.2.2 — HS256 JWT signing/verifying in `src/lib/auth.ts` (Edge-runtime safe; used by middleware). Powers magic-link tokens and session cookies.
- `resend` ^6.11.0 — transactional email SDK used in `src/app/api/auth/magic-link/request/route.ts` for magic-link delivery
- `pdfjs-dist` ^5.4.624 — client-side PDF parsing in `src/lib/document-parser.ts`; worker served from `public/pdf.worker.min.mjs`
- `mammoth` ^1.11.0 — client-side DOCX → text extraction (dynamic `import("mammoth")` in `src/lib/document-parser.ts`)
- `diff` ^8.0.3 — word-level diffing for accuracy scoring (`src/lib/text-comparison.ts` uses `diffWords`)

**Listed but unused:**
- `@ai-sdk/anthropic` ^3.0.44, `@ai-sdk/react` ^3.0.88, `ai` ^6.0.86 — Vercel AI SDK packages present in `package.json` but no imports found in `src/`. The design doc originally called for Claude; the implementation switched to Groq/Mistral via raw `fetch()`. These packages are currently dead weight in the bundle.
- `natural` ^8.1.0 — NLP toolkit declared but no `require("natural")` or `from "natural"` imports anywhere. Likely leftover from an earlier stemming/tokenizing design.
- `uuid` ^13.0.0 — no imports in `src/` or `scripts/`; `crypto.randomUUID()` is used instead (e.g., `src/lib/storage.ts:188`).

**Infrastructure:**
- `@types/node` ^20, `@types/react` ^19, `@types/react-dom` ^19, `@types/diff` ^7.0.2, `@types/uuid` ^10.0.0 — type stubs

## Configuration

**Environment:**
- `.env` (gitignored) — active runtime secrets, present in repo root
- `.env.example` — canonical list of supported env vars (87 lines, well-documented)
- `.env.local` (gitignored) — dev-only overrides; contains `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` (note: no PostHog SDK is imported — key exists but is currently unused in source)

**Runtime env vars (server, from `src/` grep):**
- AI providers: `GROQ_API_KEY`, `MISTRAL_API_KEY`, `FEEDBACK_MODEL`, `GOOGLE_GEMINI_API_KEY`, `GEMINI_TTS_MODELS`
- TTS providers: `ELEVENLABS_API_KEY`, `GOOGLE_CLOUD_TTS_API_KEY`, `DEEPGRAM_API_KEY`, `KOKORO_TTS_URL`
- Auth: `JWT_SECRET`, `LODGE_ALLOWLIST`, `RESEND_API_KEY`, `MAGIC_LINK_FROM_EMAIL`, `MAGIC_LINK_BASE_URL`
- Client-secret gate: `RITUAL_CLIENT_SECRET` (server) / `NEXT_PUBLIC_RITUAL_CLIENT_SECRET` (client bundle — in `src/lib/api-fetch.ts`)
- Dev-only: `MRAM_AUTHOR_ALLOW_LAN`, `MRAM_PASSPHRASE`, `PILOT_MODE`, `NODE_ENV`

**Build:**
- `next.config.ts` — strict CSP, security headers, webpack canvas-disable, Turbopack on
- `tsconfig.json` — strict mode, bundler module resolution, `@/*` alias
- `postcss.config.mjs` — Tailwind v4 plugin only
- `eslint.config.mjs` — flat config (`defineConfig`) extending Next.js presets
- `vitest.config.ts` — jsdom env, `@` path alias

## Platform Requirements

**Development:**
- Node 20+ (inferred from `@types/node ^20`)
- npm for package management
- Modern browser with Web Crypto API (`crypto.subtle`), IndexedDB, MediaRecorder, Web Speech API — all used in `src/lib/storage.ts`, `src/lib/speech-to-text.ts`, `src/lib/text-to-speech.ts`
- Optional local Kokoro-FastAPI server on port 8880 for free TTS

**Production:**
- Vercel — `.vercel/project.json` pins `projectId: prj_QUCVIP2LACuMV9qY6Lguqt2ZXJQW`, production domain `masonic-ritual-ai-mentor.vercel.app`
- Deploys via `vercel` CLI / git-integrated CI; no GitHub Actions workflow present in repo
- Vercel Fluid Compute assumed by `src/lib/rate-limit.ts` comment — in-memory rate-limit Map survives across warm invocations

---

*Stack analysis: 2026-04-20*
