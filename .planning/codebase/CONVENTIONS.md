# Coding Conventions

**Analysis Date:** 2026-04-20

## Naming Patterns

**Files:**
- **React components:** PascalCase `.tsx` — `ListenMode.tsx`, `RehearsalMode.tsx`, `DocumentUpload.tsx`, `PilotBanner.tsx`, `MasonicIcons.tsx`. One default-exported component per file.
- **Library modules:** kebab-case `.ts` — `text-comparison.ts`, `tts-cloud.ts`, `rehearsal-decision.ts`, `performance-history.ts`, `api-fetch.ts`, `mram-format.ts`.
- **API route handlers:** Next.js App Router convention — `src/app/api/<segment>/route.ts`. Private helpers co-located with `_guard.ts` (leading underscore → not a route).
- **Test files:** Mirror source name with `.test.ts` / `.test.tsx`, placed in `__tests__/` subdirectory next to the source. Example: `src/lib/text-comparison.ts` → `src/lib/__tests__/text-comparison.test.ts`.
- **Scripts:** kebab-case `.ts` in `scripts/` — `bake-first-degree.ts`, `build-mram-from-dialogue.ts`, `validate-rituals.ts`.

**Functions:**
- camelCase, descriptive verb-first — `compareTexts`, `decideLineAction`, `signMagicLinkToken`, `verifySessionToken`, `assignVoicesToRoles`, `buildPreamble`, `preloadGeminiRitual`.
- Boolean-returning helpers start with `is` / `looks` / `has` — `isEmailAllowed`, `isAuthConfigured`, `looksLikeEmail`, `isMRAMFile`, `isTTSAvailable`.
- Test-only exports use double-underscore prefix — `__resetRateLimitForTests` in `src/lib/rate-limit.ts`.

**Variables:**
- camelCase locals — `currentIndex`, `voiceMapRef`, `scrollTimeoutRef`.
- UPPER_SNAKE_CASE module-scope constants — `FILLER_WORDS`, `CONTRACTIONS`, `MAX_TEXT_CHARS`, `DEFAULT_GEMINI_MODELS`, `IP_LIMIT`, `EMAIL_WINDOW_MS`, `SESSION_COOKIE_NAME`, `ALLOWED_ORIGIN_SUFFIXES`.
- `useRef` variables suffixed with `Ref` — `cancelledRef`, `pausedRef`, `fileDataRef`, `voiceMapRef`.

**Types / interfaces:**
- PascalCase — `RitualSectionWithCipher`, `MRAMDocument`, `ComparisonResult`, `PracticeSession`, `LineScore`, `RoleVoiceProfile`, `STTEngine`.
- Prefer `interface` for public component props (`ListenModeProps`, `DocumentUploadProps`, `RehearsalModeProps`). Prefer `type` for unions and discriminated types (`PlayState`, `RehearsalState`, `UploadStage`, `STTProvider`).
- Union types for explicit state machines — see `RehearsalState` in `src/components/RehearsalMode.tsx` (11-state union).

## Code Style

**Formatting:**
- **No Prettier config committed** — rely on editor defaults + `eslint-config-next`.
- Observed conventions: 2-space indent, double-quoted strings (`"..."`), trailing commas on multi-line literals, semicolons required.
- Template literals for any string that interpolates (`${provider.authHeader}`).
- Line length ~100ch; longer lines broken at logical clause boundaries.

**Linting:**
- `eslint.config.mjs` uses flat-config (`eslint/config`) composing `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`.
- Globally ignores `.next/**`, `out/**`, `build/**`, `next-env.d.ts`.
- Run with `npm run lint` (no `--fix` convention in scripts — fix manually).

**TypeScript strictness:**
- `"strict": true` in `tsconfig.json` — all strict checks on (`strictNullChecks`, `noImplicitAny`, etc.).
- `"noEmit": true` (Next handles emission).
- Path alias: `"@/*": ["./src/*"]` — use `@/lib/...`, `@/components/...` in every import.
- `skipLibCheck: true`, `moduleResolution: "bundler"`.

## Import Organization

**Order (observed, not enforced by plugin):**
1. External packages first — `import { useState } from "react"`, `import { Resend } from "resend"`, `import { SignJWT } from "jose"`.
2. Next.js-specific — `import type { NextRequest } from "next/server"`, `import Link from "next/link"`.
3. Internal `@/*` aliases grouped — `@/lib/...` then `@/components/...`.
4. Relative imports last — `./MasonicIcons`, `../auth`.

**Type-only imports:**
- Use `import type { ... }` when importing only types — `import type { RitualSectionWithCipher } from "@/lib/storage";`. Enforced style throughout codebase.

**Path Aliases:**
- `@/` always points to `src/`. Never use deep relative paths like `../../lib/foo` — use `@/lib/foo`.

## Error Handling

**Library layer (`src/lib/*.ts`):**
- Return `null` on verification / parse failure rather than throwing — `verifyMagicLinkToken`, `verifySessionToken`, `resolvePairPaths` all return null on failure so callers don't branch on exception types.
- Discriminated-union result objects for validation that needs error messages — `validateVoiceImport` returns `{ valid: true, voices } | { valid: false, error }`. See `src/lib/voice-storage.ts` and tests in `src/lib/__tests__/voice-export-import.test.ts`.
- Throw only for true misconfiguration (`getSecret()` in `src/lib/auth.ts:34` throws if `JWT_SECRET` missing — caught by route layer).

**API route layer (`src/app/api/**/route.ts`):**
- Wrap entire handler body in a top-level `try/catch`. Log with `console.error("<context>:", err)`, return `Response.json({ error: "..." }, { status: 5xx })`. See `src/app/api/rehearsal-feedback/route.ts:197-203`.
- Never leak internal error messages to clients — return generic copy, log details server-side.
- Parse request body inside its own `try { body = await req.json() } catch { return 400 }` — see `src/app/api/auth/magic-link/request/route.ts:74-80`.
- Input size caps on paid AI endpoints enforced before calling upstream — `MAX_TEXT_CHARS = 2000` in `src/app/api/tts/gemini/route.ts:64`, 4000 cap in rehearsal-feedback.
- HTTP status conventions:
  - `400` invalid JSON / bad shape
  - `401` missing/wrong `X-Client-Secret`
  - `403` disallowed origin or CSRF failure
  - `413` payload too large (size cap exceeded)
  - `429` rate limited (always with `Retry-After` header)
  - `500` server-side misconfiguration
  - `502` upstream AI provider failed

**Client layer (React components):**
- `useState<string | null>(null)` for error messages surfaced to the user — see `setError` in `src/components/DocumentUpload.tsx`.
- `err instanceof Error ? err.message : "Fallback copy"` pattern when catching `unknown` from `try/catch`.
- No React error boundaries committed — failures propagate to Next.js default error page.

**Authentication failures:**
- All auth failures collapse to a single "link is no longer valid" / "not signed in" outcome. Callers never distinguish expired vs. tampered vs. wrong-audience. Enforced as comment contract in `src/lib/auth.ts:83-85`.

## Logging

**Framework:** Plain `console.error` / `console.log`. No structured logger committed.

**Patterns:**
- Prefix every log with a short context tag — `console.error("Magic-link request error:", err)`, `console.error("Resend error:", error)`, `console.error("Feedback stream error:", err)`.
- Only log in catch blocks on the server side; never log request bodies or tokens (PII / secret leakage risk).
- Client-side: prefer throwing to UI state (`setError`) over `console.log` for user-facing failures; `console.error` only for fire-and-forget background ops (`listDocuments().catch(console.error)` in `src/app/page.tsx:14`).

## Comments

**When to Comment:**
- **Every non-trivial module starts with a JSDoc block** explaining intent, threat model, or architecture decisions. Examples:
  - `src/lib/auth.ts:1-19` — 19-line preamble covering token lifecycle + rotation behavior.
  - `src/app/api/auth/magic-link/request/route.ts:1-17` — 4-step flow + enumeration resistance rationale.
  - `next.config.ts:1-9` — CSP rationale.
- **Inline comments explain "why", not "what"** — e.g. `src/lib/rate-limit.ts:1-15` documents the in-memory-vs-Redis tradeoff. `src/middleware.ts:82-93` explains why XFF is parsed rightmost-first.
- Code review / audit findings left as inline markers — `CSO Finding 4`, `review decision 3A`, `Eng-review`, `(from plan-eng-review on 2026-04-14)`.

**JSDoc:**
- Used for exported functions in `src/lib/*.ts` — `/** True when the pilot auth gate is configured and should run. */` above `isAuthConfigured`.
- Param / return tags rarely used — types are in the signature. JSDoc is prose-only, describing behavior and edge cases.
- Test files frequently start with a JSDoc comment describing what regression or review finding the test locks down (see `src/lib/__tests__/auth.test.ts:1-12`, `src/components/__tests__/silent-preload.test.tsx:1-8`).

## Function Design

**Size:** Small to medium. Pure logic functions (`decideLineAction`, `planComparisonAction` in `src/lib/rehearsal-decision.ts`) are ~20 lines. API handlers are longer (100-200 lines) but broken into inner helpers (`getProvider`, `renderEmailHtml`, `getBaseUrl`).

**Parameters:**
- Prefer positional params for 1-3 arguments.
- Use a single options object once you hit 4+ — e.g. `planComparisonAction(accuracy, currentIndex, threshold = DEFAULT_AUTO_ADVANCE_THRESHOLD, beatMs = DEFAULT_AUTO_ADVANCE_BEAT_MS)` is borderline; most codebase helpers stop at 3 positional.
- Default values live in the signature, not inside the body.

**Return Values:**
- Pure functions return discriminated unions when the caller needs to branch — `{ kind: "auto-advance" | "judge", ... }` in `planComparisonAction`.
- Async API helpers return `Promise<Payload | null>` (see `verifyMagicLinkToken`) instead of throwing.
- Avoid `Promise<void>` with side-effects hidden in the body — prefer explicit return payloads.

## Module Design

**Exports:**
- **Named exports everywhere in `src/lib/`** — no default exports in library modules. Allows tree-shaking and rename-safe refactors.
- **Default export per React component file** — `export default function RehearsalMode(...)`.
- **Types exported alongside the functions that produce them** — `export interface PracticeSession`, `export type RoleVoiceProfile`.

**Barrel Files:**
- **Not used.** Import directly from the specific module (`import { compareTexts } from "@/lib/text-comparison"`). No `index.ts` re-export files anywhere in `src/lib/` or `src/components/`.

**Constants modules:**
- Shared constants exported from the module that owns them (`SESSION_COOKIE_NAME`, `MAGIC_LINK_TTL_SECONDS` from `src/lib/auth.ts`). No global `constants.ts`.

## React Conventions

**Client vs. Server components:**
- Every interactive component starts with `"use client";` directive on line 1 — `ListenMode.tsx`, `DocumentUpload.tsx`, `RehearsalMode.tsx`, `src/app/page.tsx`.
- Layouts and API routes are server-only (no directive) — `src/app/layout.tsx`.

**State management:**
- `useState` for local UI state; no Redux / Zustand / Jotai in dependencies.
- `useRef` for mutable values that must persist across renders without triggering re-render — generation counters (`playGenRef`), cancellation flags (`cancelledRef`), cached voice maps (`voiceMapRef`).
- `useCallback` / `useMemo` used deliberately where dependencies would otherwise churn child props or recompute expensive derived arrays (`availableRoles` in `ListenMode.tsx:35-41`).

**Effect hygiene:**
- Every `useEffect` with a subscription returns a cleanup function — scroll listeners, timeouts, preload aborts. See `src/components/ListenMode.tsx:54-72`.
- Aborts use an `AbortController`-like contract — `preloadGeminiRitual` returns `{ abort, done }` (see `silent-preload.test.tsx:28-33`).

**Styling:**
- Tailwind v4 utility classes inline on JSX — no CSS modules, no styled-components.
- Theme colors consolidated on `amber-*`/`zinc-*` scale. `"dark"` class hardcoded on `<html>` in `src/app/layout.tsx:42`.

## Commit Message Style

Observed from `git log` (see `src/app/api/rehearsal-feedback` and TTS fix commits):

- **Conventional-Commits prefix required** — `fix(tts):`, `feat(mobile):`, `refactor(tts):`, `docs:`, `chore(voices):`.
- Short imperative subject, no period. ≤72 chars.
- Scope in parens matches the subsystem (`tts`, `bake`, `mram`, `listen`, `voxtral`, `scripts`, `qa`).
- Recent examples:
  - `fix(tts): deeper guard against voice overlap in playAudioBlob`
  - `feat(mobile): keep screen awake during ritual playback + pilot email update`
  - `refactor(tts): remove engine selector + add silent on-mount preload`
  - `feat(bake): Tier 1 + Tier 2 expressive Gemini prompting`
- PR-merge commits include the PR number suffix — `(#67)`, `(#66)`.

---

*Convention analysis: 2026-04-20*
