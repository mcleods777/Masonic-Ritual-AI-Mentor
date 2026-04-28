---
name: masonic-style
description: House style for the Masonic Ritual Mentor app AND its internal bake-preview voice-director tool. Defines the visual identity, color usage, typography, ornament discipline, motion restraint, and copy register for any UI work in this repo. Use whenever generating, redesigning, or critiquing a page, route, or component in this Next.js project — and also for any visual work in scripts/preview-bake.ts (the bake tool follows the same look with documented carve-outs for system mono and the no-React/Tailwind/shadcn constraint). Triggers on tasks involving the upload/bake page, practice page, voices page, progress page, sign-in, walkthrough, the bake-preview tool, or any new UI surface. Pair with the shadcn, frontend-design, web-design-guidelines, vercel-react-best-practices, and vercel-react-view-transitions skills — this skill provides the project-specific guardrails those skills should operate within.
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

## The Bake Preview Tool — Carve-outs

The internal voice-director surface at `scripts/preview-bake.ts` (launched via `npm run preview-bake`) is a separate dev tool, not part of the Next.js app. It is read-only, localhost-only (`127.0.0.1`), gated by `assertDevOnly`, and meant to be used by project maintainers to review baked `.mram` files. It still adheres to the visual identity above, but with a few intentional carve-outs.

### Stack — what is and isn't

The bake tool is **a single ~4000-line Node `http.createServer` script that returns one server-rendered HTML string**. There is no React, no Next.js, no Tailwind, no shadcn, no Vite, no build step. The entire HTML/CSS/JS lives inside one backtick template literal in `handleIndexRequest()`. Edits land directly on `scripts/preview-bake.ts` and take effect after a server restart.

This is deliberate. The bake tool is project-internal, ships only to maintainers, and the dependency-free design means no migration debt as the main app evolves. Treat it as a separate codebase that happens to share the same visual language.

### What does and doesn't apply from the rules above

| Rule from above | Applies to bake tool? |
|---|---|
| Cinzel for headings, Lato for body | Yes — both fonts loaded from Google Fonts directly via `<link>` (the bake tool can't use `next/font/google`). |
| Geist Mono for cipher / mono | **No** — bake tool intentionally uses `ui-monospace, 'SF Mono', Menlo, monospace` (system mono). Geist + Geist Mono are deliberately omitted to keep the bake page's font payload small. Don't add them. |
| Amber + zinc only, no other chroma | Yes, with the same green/red exception for semantic success/destructive (e.g. `session-promote`, `session-delete`, status pills). |
| shadcn primitives, `Card`/`Input`/`Button` | **No** — bake tool uses vanilla HTML form elements styled with inline CSS. Don't introduce shadcn here; there's no React runtime. |
| Tailwind utility classes | **No** — bake tool has no Tailwind. Style with the inline `<style>` block, using the existing `--zinc-*`, `--amber-*`, `--surface-*`, `--border-subtle` custom properties. New tokens go at the top of `:root` alongside them. |
| Lucide icons | **No** — bake tool uses Unicode glyphs (`▸`, `↻`, `+`, `−`, `✓`) for chevrons/spinners. Don't import an icon library. |
| `<ViewTransition>` / `animate-fade-up` | **No** — bake tool has no React. Use plain CSS transitions in the 120–200ms range. |
| `prefers-reduced-motion` honored | Yes — bake tool has a global `@media (prefers-reduced-motion: reduce)` guard near the top of the inline `<style>`. New transitions/animations inherit from it; nothing extra needed. |
| `localStorage` not for ritual content | Yes — bake tool uses localStorage **only** for director-note overrides + saved profiles (user preferences, not ritual content). Don't store cipher or plain text from `.mram` documents in localStorage. |
| Single column for reading surfaces | Sanctioned exception — bake tool is a workbench/dashboard, multi-column grid for parameter cells is appropriate per the "dashboards and selection grids" carve-out. |
| `📝` emoji on note button | Grandfathered. Don't add **new** emoji elsewhere in the bake tool. Other Unicode glyphs (`▸ ↻ +`) are not emoji and are fine. |

### Editing traps

These are the bake-tool-specific footguns. Watch for them when working in `scripts/preview-bake.ts`.

1. **Backticks inside the outer template.** The entire HTML response is one backtick template literal. A literal `` ` `` anywhere inside it — including in CSS or JS comments — silently terminates the template mid-string. The TS errors that follow point at lines 200+ away from the actual cause. **Use straight quotes (`"..."`) in comments inside the served HTML/CSS/JS.**
2. **`tsx` does not hot-reload.** After editing this file, the running server is still serving the old code from memory. Kill the actual port-bound process (`fuser -k 4757/tcp` is reliable) and restart `npm run preview-bake`. The recorded PID file usually points at the parent shell, not the bound child — don't trust it for `kill`.
3. **Director's note CSS lives between roughly lines 2027 and 2400** in the inline `<style>` block. The HTML template for the panel is in `renderLine()` around line 4239. The tag palette data lives at `RITUAL_TAG_PALETTE` (line ~2514, in the served `<script>` block, so it's a browser-side constant, not a Node export). Plan large CSS changes around the existing structure rather than rewriting it; the file is too long for a clean rewrite.

### Director's note panel — design contract

After the Phase-1/2/3 redesign (commits `d730d73`, `b010d94`, `b8b77ae` on the `redesign/bake-preview-gui` branch), the panel follows this hierarchy:

- **Hero** — the spoken-text textarea on `--surface-elevated`. The visual focus.
- **Tag palette** — collapsed behind a left-anchored `+ Insert tag` disclosure. Default closed. Inserts at cursor with auto-spacing.
- **Parameter rail** — auto-fit grid of one-control-per-cell combobox cells (Style/Pace/Accent/Model end with `(custom prose…)` which reveals a free-text input only when picked). Voice and Profile (override) keep their existing single-control patterns.
- **Action bar** — info span (left), apply-to-flagged-regen / apply-to-role / clear (zinc-quiet), `Try these settings` (the only solid amber button on the panel).

If a future change adds a new "knob" to the Director's note, prefer extending the parameter rail with another combobox cell over inventing a new visual treatment. The amber-600 fill stays reserved for the primary CTA.

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

### Universal (1–13) — applies to both the main app and the bake tool

1. Headings use Cinzel and are all-caps tracked where appropriate.
2. Body uses Lato; mono uses Geist Mono *(main app)* or system mono *(bake tool — Geist Mono is intentionally not loaded there; see Bake Preview Tool carve-outs)*.
3. Only amber and zinc/gray are present. No blue, yellow, or orange. Green/red used only for semantic success/destructive states.
4. No imported icon libraries other than Lucide *(main app)* / no icon library at all *(bake tool — Unicode glyphs only)*.
5. No new font dependencies in `layout.tsx`.
6. No `localStorage` calls touching ritual content.
7. `prefers-reduced-motion` honored on every new animation.
8. Single column for reading surfaces, `max-w-prose` enforced for prose.
9. No new emoji in JSX (the bake tool's `📝` note button is grandfathered).
10. No "Oops!", "Welcome!", "Let's get started!" or marketing-voice copy.
11. Privacy/security language is factual, not promotional.
12. Run the `web-design-guidelines` skill against the new code before commit (main app only — the bake tool has no TSX surface to scan).
13. Run `npx shadcn@latest info --json` and confirm no orphaned imports (main app only).

### Main-app-only (14)

14. Use shadcn primitives (`Card`, `Input`, `Label`, `Button`, etc.) for new surfaces; do not roll custom equivalents.

### Bake-tool-only (15–20)

When the change lands in `scripts/preview-bake.ts`, also verify:

15. No literal backticks inside the outer HTML template (including in CSS/JS comments inside the served block) — they terminate the outer template literal mid-string. Use straight quotes in comments.
16. No React, Tailwind, shadcn, or build-time dependency added; new CSS lives inside the inline `<style>` block, new browser JS inside the inline `<script>` block.
17. Color tokens use the existing `--zinc-*`, `--amber-*`, `--surface-card`, `--surface-elevated`, `--border-subtle` custom properties. New tokens are added at the top of `:root` alongside them; no inline hex literals.
18. The Director's note panel's hierarchy is preserved: hero (spoken text) → tag-palette disclosure (collapsed by default) → parameter rail (combobox-with-custom) → action bar (one solid amber CTA).
19. Mobile (<640px) does not break the per-line layout — the `.line` row stacks via the existing `@media (max-width: 640px)` rule rather than collapsing the body column.
20. After editing, restart `npm run preview-bake` (kill the bound child via `fuser -k <PORT>/tcp`) before reviewing the change in a browser — `tsx` does not hot-reload.

## When in Doubt

Read `src/app/page.tsx` and `src/app/layout.tsx`. Match the patterns there. The home page is the reference implementation of this house style.
