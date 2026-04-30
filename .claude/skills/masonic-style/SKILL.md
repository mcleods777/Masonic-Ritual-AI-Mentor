---
name: masonic-style
description: House style for the Masonic Ritual Mentor app. Defines the visual identity, color usage, typography, ornament discipline, motion restraint, and copy register for any UI work in this repo. Use whenever generating, redesigning, or critiquing a page, route, or component in this Next.js project. Triggers on tasks involving the upload/bake page, practice page, voices page, progress page, sign-in, walkthrough, or any new UI surface. Pair with the shadcn, frontend-design, web-design-guidelines, vercel-react-best-practices, and vercel-react-view-transitions skills — this skill provides the project-specific guardrails those skills should operate within.
allowed-tools: Read, Edit, Write, Glob, Grep, Bash(npx shadcn@latest *)
---

# Masonic Ritual Mentor — House Style

## Project Identity

Masonic Ritual Mentor is a memorization aid for Freemasons studying ritual work. The audience is Brothers — adults, often over 40, working from encrypted ritual files (`.mram`) decrypted on-device with a lodge passphrase. The product is a tool, not a marketing site. The tone is reverent and fraternal. The visual identity is dark, hermetic, and restrained, with amber/gold as the only chromatic accent.

If a design choice would feel at home on a Stripe landing page or a Y Combinator startup, it is wrong for this app.

## Tech Stack (current as of repo state)

- Next.js 16.2.3 (App Router, RSC enabled, src/ directory)
- React 19
- Tailwind CSS v4 with `@theme` directive in `src/app/globals.css`
- shadcn/ui v4, Radix base, Nova preset, Lucide icons
- `tw-animate-css` and a custom `fade-up` keyframe
- Forced dark mode (`html.dark`, `color-scheme: dark`)
- Auth via email magic link, IndexedDB for encrypted blob storage, Web Speech API for voice

Run `npx shadcn@latest info --json` for live config. Do not assume Tailwind v3 idioms or pre-v4 shadcn paths.

## Routes (do not rename or invent)

`/` (home) · `/signin` · `/upload` (the "bake" page — decrypt + parse + preview) · `/practice` · `/voices` · `/progress` · `/walkthrough` · `/author`

The "bake/preview page" referenced in design conversations is `src/app/upload/page.tsx`. Do not call it anything else.

## Color System

### What exists in `src/app/globals.css`

The theme uses neutral OKLCH grays (achromatic) for surfaces and zinc/amber Tailwind utilities for content. The `:root` and `.dark` blocks define `--background`, `--foreground`, `--card`, etc. as pure-gray OKLCH values; chroma is added at the component level via Tailwind utility classes.

### Use these patterns

- **Surfaces & chrome** — use the shadcn semantic tokens: `bg-background`, `text-foreground`, `bg-card`, `text-muted-foreground`, `border-border`, `bg-popover`. Do not hard-code zinc shades for surfaces; let the tokens carry dark mode.
- **Body text** — `text-zinc-100` for primary copy, `text-zinc-200` for secondary, `text-zinc-400` for tertiary/muted captions. This matches `src/app/page.tsx`.
- **Accent (the only chromatic color)** — `text-amber-400` (interactive/hover), `text-amber-500` (decorative), `bg-amber-600` (default button/CTA), `bg-amber-500` (button hover). Match the existing pattern in `src/app/page.tsx`. The `--gold-300..600` CSS vars are present but unused; do not introduce them in new code.
- **Cipher/mono accent** — `text-amber-500/60` with `font-mono` for index numerals or cipher metadata, per the existing convention in `src/app/page.tsx`.
- **Destructive** — use the shadcn `destructive` token only; do not introduce a separate red.

### Do NOT

- Introduce lapis, royal, or Solomonic blue. The "Deep lapis/charcoal" comment in `globals.css` is aspirational — the codebase is achromatic + amber. If a future redesign adds blue, it must replace amber, not coexist with it.
- Use Tailwind `yellow-*`, `orange-*`, or `gold-*`. The accent is `amber`.
- Add gradients on text or buttons. The existing aesthetic is flat color.
- Introduce a light theme. The app is dark-only by design.
- Use color to encode meaning beyond destructive/success. Information hierarchy is carried by typography and spacing, not color.

## Typography

### Font stack

| Role | Font | CSS variable | Tailwind |
|---|---|---|---|
| Display / wordmark / all-caps section heads | Cinzel | `--font-cinzel` | `font-cinzel` |
| Body / UI | Lato | `--font-lato` | default `body` |
| Code / cipher / mono labels | Geist Mono | `--font-geist-mono` | `font-mono` |
| Sans (utility) | Geist | `--font-sans` | `font-sans` |

All four are already loaded in `src/app/layout.tsx`. Do not add another typeface. Do not add Inter, Roboto, Space Grotesk, Outfit, or DM Sans — these are the AI-default fonts the `frontend-design` skill correctly bans.

### Heading rules

- All `h1`–`h6` automatically use Cinzel via the global rule in `globals.css`. Do not override with `font-sans` or `font-mono` on headings.
- The wordmark and primary section labels are **all caps with letter-spacing**: `uppercase tracking-[0.18em]` to `tracking-[0.24em]`. This is the most important brand cue from the live site — match it.
- Field labels and button labels also follow the all-caps tracked convention: `EMAIL`, `SEND SIGN-IN LINK`, `UPLOAD RITUAL FILE`. Use `uppercase tracking-wider text-xs` for form labels.
- Cinzel is a high-contrast Roman inscription face. It looks best at sizes 18px+. For body-adjacent text, use Lato, not Cinzel.

### Body rules

- Default body is Lato. Do not change `body { font-family }`.
- Single-column reading width for ritual text and prose: `max-w-prose` or `max-w-[65ch]`. Never wider — the user is memorizing and the eye needs short lines.
- Leading: `leading-relaxed` for ritual text passages, `leading-normal` for UI.
- Numerals in cipher contexts (line numbers, section indices, accuracy percentages) use `font-mono` for vertical alignment.

### Cipher / plain-text alignment

The practice and preview flows show cipher text and plain text together. They must align word-for-word. Always use `font-mono` (Geist Mono) for both columns when alignment matters, and use a consistent leading. Do not mix proportional and mono in side-by-side comparison panes.

## Spatial Composition

- **Generous vertical rhythm.** The ritual context implies gravitas. Use `space-y-8` to `space-y-12` for major sections, `gap-6` to `gap-8` inside cards.
- **Single column for reading surfaces** — practice, preview, ritual text. Multi-column layouts are acceptable only for dashboards (progress) and selection grids (voices, ritual section pickers).
- **Card padding** — `p-6` minimum, `p-8` for primary surfaces. Do not crowd.
- **Border radius** — use shadcn's tokens (`rounded-md`, `rounded-lg`). The Nova preset's `--radius: 0.625rem` is fine; do not introduce sharper or pillier alternatives.
- **Borders** — `border-border` (semantic). Use a single hairline; do not stack borders or use double borders.

## Ornament Discipline

This is where most "Masonic" designs go wrong. Restraint is the rule.

- **One ornamental gesture per screen, not many.** A single thin amber rule with a small fleuron above a section header is dignified. A heavy gold border on every card is not.
- **No AI-generated Masonic imagery.** Square-and-compasses, the all-seeing eye, the ashlar, the level — these have specific symbolic meaning and AI image generators get them wrong, often offensively. If a Masonic motif is needed, use a small hand-curated SVG (commit it under `src/components/marks/`) and reuse it. Never `prompt → generate`.
- **No fake aged-paper textures, no parchment backgrounds, no checkerboard tessellations as page backgrounds.** Dark flat surfaces only.
- **No ornate Victorian flourishes.** Cinzel + amber is enough character. Do not add scrollwork, swashes, drop caps, or initial caps.
- **No emoji** in UI copy. Lucide icons only, used sparingly.
- **Lucide icons** at small sizes (`size-4` to `size-5`) and amber on hover/active state, zinc otherwise. Do not introduce another icon set.

## Motion

- **Existing pattern** — `animate-fade-up` (and the two delayed variants) in `globals.css`. Use these for entrance animations of stacked content. They already honor `prefers-reduced-motion`.
- **State transitions** — for page-level state changes (idle → loading → loaded), prefer React's native `<ViewTransition>` API per the `vercel-react-view-transitions` skill. Avoid adding `motion` (formerly Framer Motion) as a dependency unless a transition genuinely needs spring physics.
- **Duration** — 150–300ms for state changes, 400ms maximum for entrance animations. Anything longer is wrong.
- **Easing** — `ease-out` for entrances, `ease-in-out` for state changes. Do not use spring overshoot for serious surfaces.
- **No flashy effects** — no 3D flips, no parallax, no scroll-jacking, no cursor trails, no particle effects, no auto-playing background video.
- **Always honor `prefers-reduced-motion: reduce`.** New animations must include the media query and disable themselves, matching the existing pattern in `globals.css`.

## Copy Register

- **Address** — "Brothers" where contextually appropriate (sign-in, errors that block access). "You" elsewhere.
- **Tone** — formal, fraternal, plain. No exclamation marks except in genuine errors. No marketing copy ("blazing fast", "powerful", "amazing"). No AI-generated filler ("Welcome! Let's get started.").
- **Microcopy** — direct and instructional. "Upload ritual file" not "Drop your file here to begin your journey".
- **Errors** — state what happened and what to do. Do not apologize verbosely. Do not use "Oops!" or "Uh oh!".
- **No emoji.** No party-popper, no sparkles, no padlock. Lucide icons only.
- **Privacy language is plain and confident.** "Your passphrase never leaves this device" is correct. "We take your privacy seriously" is wrong (corporate, evasive).
- **All-caps short labels** — buttons, field labels, status badges. Use sentence case for body copy, paragraphs, and longer button labels.

## The `/upload` Bake Page — Specific Requirements

`src/app/upload/page.tsx` is a three-state machine:

1. **Idle** — drop zone for `.mram` file + passphrase input + submit.
2. **Decrypting / parsing** — determinate progress (decrypt + AES-GCM verify + parse sections + re-encrypt + IndexedDB write).
3. **Preview** — cipher text and plain text side-by-side for visual verification, plus a section selector for what to practice. Confirm-and-continue button advances to `/practice`.

### Required treatments

- **Surface the on-device privacy guarantee in state 1** — small block above or below the passphrase input: "Decryption happens on this device. Your passphrase is never transmitted." Use `text-muted-foreground text-sm` with a single Lucide `Lock` or `ShieldCheck` icon at `size-4` in amber. Do not exaggerate ("military-grade encryption", "bank-level security") — state the fact.
- **Determinate progress in state 2** — a real progress bar tied to actual parsing milestones, not a fake spinner. If you cannot wire real progress, use shadcn `Progress` indeterminate plus a status line ("Decrypting…" → "Parsing sections…" → "Storing securely…"). Do not show a generic spinner alone.
- **Side-by-side preview in state 3** — two columns, both `font-mono`, with synced scroll if practical. Section selector below or in a sidebar. Do not auto-advance to `/practice`; require a confirm action.
- **Transitions between states** — use `<ViewTransition>` (React 19 / Next 16). Crossfade or slide-up at 200–300ms. No flashes, no dramatic motion. Honor `prefers-reduced-motion`.
- **Failure modes are loud and specific** — wrong passphrase → zinc-200 text, amber border on the input, error reads "Passphrase did not decrypt this file." Not "Something went wrong."

### Composition

- Single column, max-width `max-w-2xl` for state 1 and 2.
- State 3 expands to `max-w-6xl` for the side-by-side panes.
- Centered horizontally, top-aligned with comfortable top spacing (`pt-16` or `pt-24`).
- All-caps tracked H1: `UPLOAD RITUAL FILE` (Cinzel, `tracking-[0.2em]`, `text-2xl md:text-3xl`).
- Use shadcn primitives: `Card`, `Input`, `Label`, `Button`, `Progress`, `Alert`. Do not roll custom equivalents.

## Component Conventions

- **Always read** `npx shadcn@latest info --json` before generating components. Use the installed primitives; install missing ones via `npx shadcn@latest add <name>` from the `@shadcn` registry.
- **File placement** — UI primitives in `src/components/ui/` (shadcn-managed). Composed components in `src/components/`. Page-specific components in `src/app/<route>/_components/` if needed.
- **Imports use the `@/` alias** as configured in `components.json`.
- **Server Components by default.** Add `"use client"` only when a component genuinely needs hooks, browser APIs, or event handlers.
- **No CSS-in-JS.** No `styled-components`, no Emotion. Tailwind utility classes + the existing CSS variables only.
- **No `localStorage`/`sessionStorage` for ritual content** — IndexedDB only, encrypted. The privacy model depends on this.

## Things That Look "Masonic" But Are Wrong For This App

- Heavy gold-on-black borders around every element (heavy-handed; the existing site is restrained)
- Old-English / blackletter fonts
- Background tessellated checkerboard ("Mosaic Pavement") as page wallpaper
- Glowing eye animations
- Latin slogans rendered as decorative ornaments
- Compass-and-square watermarks behind text
- Fraternal "lodge interior" stock photography
- Marble or aged-paper textures
- Sepia tone

If a design suggestion fits one of the above, reject it.

## Verification Checklist (run before declaring a redesign done)

1. Headings use Cinzel and are all-caps tracked where appropriate.
2. Body uses Lato; mono uses Geist Mono.
3. Only amber and zinc/gray are present. No blue, yellow, or orange.
4. No imported icon libraries other than Lucide.
5. No new font dependencies in `layout.tsx`.
6. No `localStorage` calls touching ritual content.
7. `prefers-reduced-motion` honored on every new animation.
8. Single column for reading surfaces, `max-w-prose` enforced for prose.
9. No emoji in JSX.
10. No "Oops!", "Welcome!", "Let's get started!" or marketing-voice copy.
11. Privacy/security language is factual, not promotional.
12. Run the `web-design-guidelines` skill against the new code before commit.
13. Run `npx shadcn@latest info --json` and confirm no orphaned imports.

## When in Doubt

Read `src/app/page.tsx` and `src/app/layout.tsx`. Match the patterns there. The home page is the reference implementation of this house style.
