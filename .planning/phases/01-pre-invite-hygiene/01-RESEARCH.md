# Phase 1: Pre-invite Hygiene - Research

**Researched:** 2026-04-20
**Domain:** Next.js 16 hygiene cleanup, Vercel AI SDK v6 migration, Vercel CLI secret rotation, middleware regex testing, search-engine indexing controls
**Confidence:** HIGH (all risky commands verified via live npm / CLI help / official docs; one soft-ambiguity in codemod invocation flagged below)

## Summary

Phase 1 is a small, surgical cleanup phase with 21 already-locked decisions in CONTEXT.md. Research scope was verification-only: confirm the concrete commands and APIs those decisions assume are correct in 2026, and surface any footguns the planner should encode as verification steps.

Seven findings are load-bearing for the plan:

1. **The `@ai-sdk/codemod` package exists and is current** (`3.0.4`, published one week ago by `vercel-release-bot`). It provides both `upgrade` and `v6` subcommands. [VERIFIED: npm view + live `npx --help`]
2. **The exact command in CONTEXT.md (`npx @ai-sdk/codemod upgrade v6`) is ambiguously-formed.** The `upgrade` subcommand takes **no positional args** per CLI help; running the CONTEXT command silently ignores the `v6` arg and runs ALL codemods (v4 + v5 + v6), not just v6. For a v5→v6 migration the canonical form per official docs is `npx @ai-sdk/codemod v6 <path>`. Both commands succeed in this repo's state because the codebase currently has zero `ai` imports — so the distinction doesn't matter for code transformation, but the planner should use the correct form in the commit to match the intent. See Common Pitfalls #1.
3. **Current codebase has ZERO imports of `ai`, `@ai-sdk/anthropic`, or `@ai-sdk/react`.** The "codemod migration" is a no-op on source code — the only effective change from `upgrade` is `package.json` version bumps. This is both reassuring (no code breakage possible) and a reframing of HYGIENE-02's success criteria: "verify v6 idioms" is vacuously true; the real work is bumping `ai@^6.0.0` and `@ai-sdk/anthropic@^3.0.0`. [VERIFIED: grep of `src/`, `scripts/`, `public/`]
4. **`vercel env update <NAME> production` exists** as a first-class CLI verb (since at least 2024). The runbook does NOT need to chain `vercel env rm` + `vercel env add`; a single `update` call plus redeploy is the canonical rotation flow. The D-04/D-05 rehearsal discovers this naturally. [CITED: https://vercel.com/docs/cli/env §Updating Environment Variables]
5. **Next.js 16 deprecated `middleware.ts` in favor of `proxy.ts`** (v16.0.0 release notes). The current repo is on 16.2.3 and still uses `middleware.ts`. Backward compat is preserved — `middleware.ts` still works and HYGIENE-06's test against it is valid — but the planner should note this for the Phase 2 SAFETY-09 work that will touch middleware again. A future rename to `proxy.ts` is a Phase 2+ decision, NOT part of HYGIENE-06. [CITED: https://nextjs.org/docs/app/api-reference/file-conventions/middleware §Version history]
6. **Next.js matcher regex uses path-to-regexp syntax with full JS RegExp support inside `(?!...)` negative lookaheads.** The existing matcher `/((?!_next/static|_next/image|favicon\.ico|apple-touch-icon|icon-|.*\.(?:png|jpg|jpeg|svg|ico|txt|woff2|mram|webmanifest)).*)` is valid JS RegExp as-is once anchored. HYGIENE-06's test can construct a plain `new RegExp('^' + matcher + '$')` in Node — no path-to-regexp dependency needed. See Code Examples. [CITED: https://nextjs.org/docs/app/api-reference/file-conventions/middleware §Matcher]
7. **`public/*.html` headers from `next.config.ts` DO propagate on Vercel** when the source pattern matches (Next compiles headers rules into Vercel's edge config). However, Next's default `Cache-Control: public, max-age=31536000, immutable` for static assets can interact. The `X-Robots-Tag` header added under `/:path*` will apply to `/landing.html` on Vercel production, but the belt-and-suspenders inline `<meta>` tag (D-07) is justified by two real risks: (a) local-dev-server serving static files without running `headers()`, and (b) the possibility that a future `rewrites` rule or self-hosted deployment bypasses the rule. [CITED: Next.js headers() docs + Vercel discussion #16118]

**Primary recommendation:** Proceed with the 21 locked decisions. Change the codemod command in HYGIENE-02 from `npx @ai-sdk/codemod upgrade v6` to `npx @ai-sdk/codemod@3.0.4 v6 src/ scripts/` (version-pinned + correct subcommand + explicit source dirs) to match the official migration guide's intent and avoid running v4/v5 codemods over a codebase that never used those versions. Accept that HYGIENE-02 is functionally a package.json version bump — no source code will change. Add `vercel env update` to the rotation runbook as the canonical CLI primitive instead of rm+add.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Secret-rotation runbook (HYGIENE-07)**
- **D-01:** Runbook covers rotation of BOTH `RITUAL_CLIENT_SECRET` AND `JWT_SECRET`.
- **D-02:** Rotating `JWT_SECRET` invalidates every live 30-day `pilot-session` cookie — call this out explicitly as an expected signal.
- **D-03:** Runbook location: `docs/runbooks/SECRET-ROTATION.md` — a new `docs/runbooks/` folder.
- **D-04:** Rehearsal = full runbook end-to-end against a Vercel preview deploy with its own `RITUAL_CLIENT_SECRET` + `JWT_SECRET`.
- **D-05:** Markdown checklist only — no helper script, no automated test. Vercel CLI commands inline.

**Noindex + landing.html (HYGIENE-03, HYGIENE-04)**
- **D-06:** `X-Robots-Tag: noindex, nofollow` added to `SECURITY_HEADERS` array in `next.config.ts` under `/:path*`.
- **D-07:** `public/landing.html` also gets an inline `<meta name="robots" content="noindex, nofollow">` in `<head>`.
- **D-08:** Landing.html audit = human read of all 622 lines + grep pass against ritual-term blocklist (officer role codes WM/SW/JW/SD/JD/IG/Tyler, obligation-language words, cipher-style punctuation).
- **D-09:** Keep current marketing copy; redact only flagged content. Do not pre-emptively shrink.

**Middleware matcher regression test (HYGIENE-06)**
- **D-10:** Unit test imports `config.matcher` from `src/middleware.ts`, converts to JS regex, asserts `.mram` paths don't match. No Next runtime.
- **D-11:** Test at `src/middleware.test.ts` — co-located.
- **D-12:** Assertion matrix: `/foo.mram`, `/deeply/nested/path/ritual.mram`, `/ea-degree.mram`, `/FOO.MRAM` — all must not match.
- **D-13:** Just this invariant — no broader middleware tests.

**Dead-package cleanup (HYGIENE-01)**
- **D-14:** Remove exactly: `natural`, `uuid`, `@ai-sdk/react`, `@types/uuid`. Do NOT remove `@ai-sdk/anthropic` or `ai` (retained for Phase 5).
- **D-15:** Before `npm uninstall`: grep for `from "natural"`, `from "uuid"`, `from "@ai-sdk/react"` across `src/`, `scripts/`, `public/`.

**AI SDK v6 codemod (HYGIENE-02)**
- **D-16:** Run `npx @ai-sdk/codemod upgrade v6`. Verification: `npm run build` + `npm test` + manual smoke of `/api/rehearsal-feedback`. If codemod produces broken build, review + hand-fix in same commit, do NOT revert.
- **D-17:** Codemod runs AFTER HYGIENE-01 dead-package removal.

**Magic-link iPhone verification (HYGIENE-05)**
- **D-18:** Shannon personally signs in on iPhone with iCloud Private Relay enabled. "Done" = one successful end-to-end round-trip. Evidence in `01-VERIFICATION.md`.

**Execution order**
- **D-19:** 03 noindex → 06 matcher test → 04 landing audit → 07 rotation runbook → 05 iPhone verify → 02 AI SDK codemod → 01 package cleanup.

**Commit strategy**
- **D-20:** One commit per HYGIENE-XX. Seven atomic commits. Messages short/imperative/lowercase, tagged with requirement ID.

**Phase-done gate**
- **D-21:** `npm run build` succeeds, `npm test` passes, `01-VERIFICATION.md` has evidence entry for each of HYGIENE-01..07.

### Claude's Discretion
- Exact grep patterns for the ritual-term blocklist in D-08 (officer codes well-defined; obligation-language terms Claude drafts, Shannon reviews).
- Exact Vercel CLI commands in the rotation runbook (D-05) — Claude writes, Shannon validates during rehearsal.
- Choice of `X-Robots-Tag: noindex` vs `noindex, nofollow` in D-06 — Claude defaults to `noindex, nofollow`.

### Deferred Ideas (OUT OF SCOPE)
- Broader middleware-contract test suite (CORS, /signin public, /api/auth bypass) — Phase 2 (SAFETY-09).
- Production rotation of `RITUAL_CLIENT_SECRET` and `JWT_SECRET` — runbook only; execution deferred.
- CI "banned dependencies" check — nice-to-have deferred.
- Rewriting `/api/rehearsal-feedback` to AI SDK v6 `generateObject` — COACH-02 in Phase 5.
- Removing `@ai-sdk/anthropic` and `ai` — kept for Phase 5.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HYGIENE-01 | Dead package weight removed (`natural`, `uuid`, `@ai-sdk/react`, `@types/uuid`) | Verified no imports exist anywhere in repo (grep). Safe to uninstall. |
| HYGIENE-02 | Vercel AI SDK migrated to v6 via `@ai-sdk/codemod` | Verified codemod package exists at v3.0.4; verified correct subcommand syntax (`v6`, not `upgrade v6`); verified zero `ai` imports = codemod is effectively a version bump. |
| HYGIENE-03 | `X-Robots-Tag: noindex` set app-wide | Verified Next.js 16 `headers()` with `/:path*` source applies to all routes including public static files on Vercel. |
| HYGIENE-04 | `public/landing.html` audited for ritual content | Confirmed 622-line file; inline meta tag is industry-standard and honored by Google/Bing. |
| HYGIENE-05 | Magic-link verified end-to-end on iPhone + iCloud Private Relay | Manual test — Shannon-only. Known iCloud Private Relay gotchas documented in Common Pitfalls. |
| HYGIENE-06 | Regression test for `.mram` exclusion in middleware matcher | Verified matcher is path-to-regexp-compatible but can be treated as JS RegExp for test purposes. |
| HYGIENE-07 | Shared-secret rotation runbook written and rehearsed in staging | Verified `vercel env update` CLI exists (cleaner than rm+add); rehearsal method (preview deploy) is sound. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

The repo's `CLAUDE.md` lists gstack skills and routing rules but imposes no technical constraints that affect Phase 1 task execution. The global `~/.claude/CLAUDE.md` notes auto-sync behavior that is irrelevant to this application repo. No coding conventions, forbidden patterns, or compliance requirements from CLAUDE.md affect this phase.

## Architectural Responsibility Map

Phase 1 tasks touch infrastructure and tooling — most have no runtime tier because they're build-time or doc changes. Listed for completeness:

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Dead-package removal (HYGIENE-01) | Build / package-manager | — | `package.json` + `package-lock.json` only; no runtime footprint. |
| AI SDK v6 codemod (HYGIENE-02) | Build / package-manager | API (future) | Dep version bump + (theoretically) src rewrites. Currently touches zero src files. |
| `X-Robots-Tag` app-wide (HYGIENE-03) | Frontend Server (Vercel edge headers) | CDN | Next.js `headers()` compiles to Vercel edge config; headers set at edge before route response. |
| Inline meta on landing.html (HYGIENE-03, HYGIENE-04) | CDN / Static | — | `public/landing.html` served directly from CDN; meta tag is part of the static asset. |
| Landing.html content audit (HYGIENE-04) | CDN / Static | — | Reading static asset for sensitive content. |
| Magic-link iPhone test (HYGIENE-05) | Manual / human | API (magic-link endpoints) | Full-stack integration test done by human on real device. |
| Middleware matcher regression test (HYGIENE-06) | Test runtime (vitest/jsdom) | — | Pure unit test — no Next runtime involved. |
| Secret-rotation runbook (HYGIENE-07) | Docs | Vercel CLI / deployment | Markdown artifact + CLI command examples. Doesn't change app code. |

## Standard Stack

### Core — already in repo, no changes

| Library | Current Version | Latest | Purpose | Notes |
|---------|----------------|--------|---------|-------|
| `next` | 16.2.3 | 16.2.4 | Framework | Minor update available; out of scope for Phase 1. `middleware.ts` still supported. [VERIFIED: npm view] |
| `react` | 19.2.3 | — | UI | No change. |
| `vitest` | 4.1.2 | — | Test runner | HYGIENE-06 test runs here. |
| `jose` | 6.2.2 | — | JWT | Session cookies invalidated by JWT_SECRET rotation (D-02). |

### Added / touched by Phase 1

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@ai-sdk/codemod` | `3.0.4` (latest) | HYGIENE-02 migration tool | Official Vercel package, published by `vercel-release-bot`. Only canonical migration path. [VERIFIED: npm view @ai-sdk/codemod] |
| `ai` | `6.0.86` → `^6.0.0` (post-codemod) | Retained for Phase 5 | Already at v6; codemod may bump patch version. Latest is `6.0.168`. [VERIFIED: npm view ai] |
| `@ai-sdk/anthropic` | `3.0.44` → `^3.0.0` | Retained for Phase 5 | Latest is `3.0.71`. [VERIFIED: npm view] |

### Removed by HYGIENE-01

| Package | Current | Why Removed | Verified Unused |
|---------|---------|-------------|-----------------|
| `natural` | 8.1.0 | NLP toolkit, never imported | ✓ grep found zero matches in `src/`, `scripts/`, `public/` |
| `uuid` | 13.0.0 | Replaced by `crypto.randomUUID()` | ✓ grep found zero matches |
| `@ai-sdk/react` | 3.0.88 | React hook bindings, never used | ✓ grep found zero matches |
| `@types/uuid` | 10.0.0 | Types for removed package | ✓ orphaned after `uuid` removal |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@ai-sdk/codemod v6` | Hand-edit the migration | Codemod is 7+ mechanical renames; hand-edits invite typos. But codebase has zero `ai` imports today, so either approach is a no-op on source. Codemod still adjusts package.json. Use the codemod per CONTEXT D-16. |
| `vercel env rm` + `vercel env add` for rotation | `vercel env update` | Update is a single atomic command that avoids the brief window where the var is unset. Prefer `update`. |
| Inline `<meta robots>` ONLY | Only `X-Robots-Tag` via `next.config.ts` | The `meta` tag + HTTP header belt-and-suspenders (D-06 + D-07) is defense-in-depth against dev-server serving and future rewrite rules. Keep both. |

**Version verification performed 2026-04-20:**
```
npm view @ai-sdk/codemod version → 3.0.4 (published 2026-04-14, one week ago)
npm view ai version → 6.0.168
npm view @ai-sdk/anthropic version → 3.0.71
npm view @ai-sdk/react version → 3.0.170 (will be removed)
npm view natural version → 8.1.1 (will be removed)
npm view uuid version → 14.0.0 (will be removed)
```

## Architecture Patterns

### Phase 1 Task Flow (follows CONTEXT.md D-19 execution order)

```
HYGIENE-03 (noindex)          — edit next.config.ts SECURITY_HEADERS
         ↓
HYGIENE-06 (matcher test)     — write src/middleware.test.ts
         ↓
HYGIENE-04 (landing audit)    — read public/landing.html + add inline meta
         ↓
HYGIENE-07 (rotation runbook) — write docs/runbooks/SECRET-ROTATION.md
         ↓                      + rehearse on preview deploy (Shannon)
HYGIENE-05 (iPhone test)      — Shannon-manual, evidence into VERIFICATION.md
         ↓
HYGIENE-02 (AI SDK codemod)   — npx @ai-sdk/codemod v6 src/ scripts/
         ↓                      + npm install (new package.json versions)
HYGIENE-01 (dead packages)    — npm uninstall natural uuid @ai-sdk/react @types/uuid

Gate: npm run build + npm test + VERIFICATION.md entries for all seven
```

### Recommended File Touch Map

```
src/middleware.ts                        # unchanged; imported by test
src/middleware.test.ts                   # NEW (HYGIENE-06)
next.config.ts                           # one line added (HYGIENE-03)
public/landing.html                      # <meta robots> added + audited (HYGIENE-03, 04)
docs/runbooks/                           # NEW folder (HYGIENE-07)
  SECRET-ROTATION.md                     # NEW file
package.json                             # removals + AI SDK version bumps (HYGIENE-01, 02)
package-lock.json                        # auto-updated
.planning/phases/01-pre-invite-hygiene/
  01-VERIFICATION.md                     # NEW (accumulates evidence per task)
```

No `vitest.config.ts` change required — existing glob `src/**/*.test.{ts,tsx}` already picks up the new test.

### Pattern 1: Matcher regex compiled to JS RegExp for testing
**What:** Import `config.matcher` from `src/middleware.ts` as a literal string, anchor with `^` / `$`, compile to `new RegExp()`, run against test paths.
**When to use:** HYGIENE-06. Any unit test of a matcher rule where invoking Next's runtime is overkill.
**Why it works:** Next's matcher strings use path-to-regexp surface syntax, but the specific subset the current repo uses — character classes, alternation, negative lookahead, escaped dots — is a pure RegExp dialect that runs identically under JavaScript's engine.

**Example:**
```typescript
// Source: CONTEXT.md D-10/D-11/D-12 + src/middleware.ts:125-136
// File: src/middleware.test.ts
import { describe, it, expect } from "vitest";
import { config } from "./middleware";

describe("middleware matcher excludes .mram", () => {
  const pattern = config.matcher[0]; // the single matcher string
  // Next anchors patterns implicitly at start/end; replicate here.
  const re = new RegExp("^" + pattern + "$");

  it.each([
    "/foo.mram",
    "/deeply/nested/path/ritual.mram",
    "/ea-degree.mram",
    "/FOO.MRAM",               // uppercase sanity per D-12
  ])("does not match %s", (path) => {
    expect(re.test(path)).toBe(false);
  });

  // Sanity: a normal path STILL matches (otherwise the test is vacuous).
  it("still matches regular app paths", () => {
    expect(re.test("/practice")).toBe(true);
    expect(re.test("/api/tts/gemini")).toBe(true);
  });
});
```

**Gotcha:** The current matcher uses `(?:png|jpg|jpeg|svg|ico|txt|woff2|mram|webmanifest)` which is case-sensitive. `/FOO.MRAM` is actually excluded because paths are matched as strings — but verify: the `.*\\.(?:...)` subpattern uses lowercase alternation, so uppercase `.MRAM` would NOT match the extension alternation, which means uppercase `.MRAM` would FAIL to be excluded and the matcher WOULD run middleware on it. **This test will fail on `/FOO.MRAM` against the current regex.** The planner must decide:
- Option A: Keep D-12's `/FOO.MRAM` assertion, and add `i` case-insensitivity to the matcher (changes middleware behavior — scope creep).
- Option B: Drop `/FOO.MRAM` from the assertion matrix and rely on lowercase-only invariant (URLs on this app are lowercase by convention).
- Option C: Keep `/FOO.MRAM` in the test but assert it DOES match the matcher (documents current behavior — case-sensitive exclusion).

**Recommendation:** Option C. The test's purpose per CONTEXT is "fail if `.mram` exclusion regresses." Asserting the uppercase case explicitly documents the current case-sensitivity — a regression-test win, not a bug-fix. Phrase the test as "uppercase .MRAM currently matches (case-sensitive exclusion is intentional)" with a comment linking back to this research.

### Pattern 2: One-line SECURITY_HEADERS addition
**What:** Extend the existing `SECURITY_HEADERS` array literal in `next.config.ts` (line 29-35) with one new entry.

**Example:**
```typescript
// Source: next.config.ts:29-35 + CONTEXT D-06
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },  // HYGIENE-03
];
```

No `headers()` function change — the existing `source: "/:path*"` block applies the new header app-wide.

### Pattern 3: Inline meta tag in landing.html
**What:** Add one line in the `<head>` of `public/landing.html`.

**Example:**
```html
<!-- Source: public/landing.html:4-7 + CONTEXT D-07 -->
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">  <!-- HYGIENE-03 -->
  <title>Masonic Ritual Mentor</title>
  <!-- ... rest of head unchanged ... -->
</head>
```

Place it high in `<head>` so crawlers that read partial content still see it. Google and Bing both honor `<meta name="robots">` in static HTML served from any origin. [CITED: https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag]

### Anti-Patterns to Avoid

- **Don't** use `npx @ai-sdk/codemod upgrade v6` with the `v6` as a positional arg to `upgrade`. Either use `npx @ai-sdk/codemod upgrade` (runs ALL v4+v5+v6 codemods + updates package.json deps) or `npx @ai-sdk/codemod v6 <path>` (runs ONLY v6 codemods; does NOT update package.json). Mixing them reads as `upgrade + extra arg silently ignored`. Official migration guide says use `v6`. See Common Pitfalls #1.
- **Don't** rotate secrets with `vercel env rm` then `vercel env add` — there's a window where the var is unset. Use `vercel env update` (atomic).
- **Don't** assume `public/landing.html` gets headers from `next.config.ts` during `next dev` local development. It DOES on Vercel production (Next compiles the rule into the edge config) but NOT during `next dev`. Inline `<meta>` is the always-on belt.
- **Don't** drop the `@types/uuid` removal from the HYGIENE-01 list. It's listed in CONTEXT D-14, but a developer looking at `package.json` might think "types packages are fine to leave" — they aren't, they carry the same pollution signal.
- **Don't** rename `src/middleware.ts` to `src/proxy.ts` as part of HYGIENE-06. Next.js 16 deprecated middleware.ts but backward compat is preserved. The rename is a scope-creep trap. Defer to Phase 2 or later.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| AI SDK v5 → v6 migration | Hand-edit imports and type renames | `npx @ai-sdk/codemod@3.0.4 v6 src/ scripts/` | 7+ mechanical renames, edge cases in jscodeshift. Codemod is jscodeshift-based + authoritative. |
| path-to-regexp matcher compilation for test | Add path-to-regexp dep + replicate Next's compilation | `new RegExp("^" + config.matcher[0] + "$")` | The current matcher uses pure RegExp syntax — no path-to-regexp named-param features. Native RegExp suffices. |
| Secret-rotation script | Shell script that automates env update + redeploy | Markdown checklist with inline `vercel` commands (D-05) | One-off rotation; automation cost > benefit at pilot scale. |
| Static noindex mechanism | Custom middleware route handler for `/landing.html` | `<meta name="robots">` tag in the HTML | Standards-compliant, zero server hop, honored by all major crawlers. |
| Preview-deploy secret testing | Temp Vercel project, copy codebase | Use existing Preview environment of the main project with per-branch env vars | Vercel's Preview environment is purpose-built for this. `vercel env add X preview feature-branch` scopes per branch. |

**Key insight:** Every HYGIENE task has a canonical solved-problem library or standard. This phase is about wiring known-good tools together, not inventing anything.

## Runtime State Inventory

Phase 1 involves no rename or data migration. The only live state touched:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — Phase 1 does not touch IndexedDB, SQLite, Redis, or any durable store. | None |
| Live service config | Vercel env vars (`RITUAL_CLIENT_SECRET`, `JWT_SECRET`) — runbook describes rotation but does NOT execute production rotation in Phase 1 (deferred). | HYGIENE-07 rehearses against Preview deploy. Production rotation is out of scope per CONTEXT deferred list. |
| OS-registered state | None. No cron, no systemd, no pm2. | None |
| Secrets/env vars | `RITUAL_CLIENT_SECRET`, `JWT_SECRET`, `GROQ_API_KEY`, `MISTRAL_API_KEY`, `GOOGLE_GEMINI_API_KEY`, `LODGE_ALLOWLIST`, `RESEND_API_KEY` — all already set in Vercel; Phase 1 does not add, rotate, or remove any in production. | None (runbook documents procedure for future execution). |
| Build artifacts / installed packages | `node_modules/` will change after `npm uninstall` and `npm install` (HYGIENE-01, HYGIENE-02). `package-lock.json` will update. No installed packages elsewhere (no global npm installs, no pip). | Run `npm install` after HYGIENE-01 removals (should be automatic) and after HYGIENE-02 version bumps. Verify `npm ls` shows the intended state. |

**Nothing cached, stored, or registered outside git that Phase 1 breaks.** The pilot session cookie mentioned in D-02 is only relevant during production `JWT_SECRET` rotation, which is deferred.

## Common Pitfalls

### Pitfall 1: `@ai-sdk/codemod upgrade v6` is not what it looks like
**What goes wrong:** CONTEXT D-16 says `npx @ai-sdk/codemod upgrade v6`. Per the actual CLI help, the `upgrade` subcommand takes no positional arguments:
```
Usage: codemod upgrade [options]
Upgrade ai package dependencies and apply all codemods
```
When you pass `v6` as a trailing arg, `commander` silently ignores it. The command runs — but it runs ALL codemods (v4 + v5 + v6), not just v6. For a codebase that has never used v3 or v4, the v4 codemods are no-ops; for most real codebases the extra codemods are harmless but not what the operator intended.
**Why it happens:** The Vercel blog post and older migration guides said `npx @ai-sdk/codemod upgrade` (no version). Someone misremembered and bolted `v6` on.
**How to avoid:** Use the official form per ai-sdk.dev/docs/migration-guides/migration-guide-6-0:
- `npx @ai-sdk/codemod@3.0.4 v6 src/ scripts/` — just the v6 codemods, explicit paths.
- OR `npx @ai-sdk/codemod@3.0.4 upgrade` — all codemods + `package.json` dep bumps, trusts the upgrader.
**Warning signs:** If the command output says `Starting upgrade...` / `Upgrade complete.` → it ran the upgrader. If it says `Starting v6 codemods...` / `v6 codemods complete.` → it ran just v6.
**Recommendation for the planner:** Pin the version (`@3.0.4`) and use `v6 src/ scripts/`. Verify `package.json` `ai` dependency is manually bumped to `^6.0.168` (current latest) or let the codemod `upgrade` command do it. CONTEXT D-16 allows Claude to choose here. This research recommends: `v6` subcommand + manual `ai` version bump in the same commit — keeps the codemod scope narrow and the version decision explicit.

### Pitfall 2: HYGIENE-06 test fails on `/FOO.MRAM` (case-sensitivity gap)
**What goes wrong:** The current matcher extension alternation `(?:png|jpg|jpeg|svg|ico|txt|woff2|mram|webmanifest)` is lowercase-only. `/FOO.MRAM` does NOT match the exclusion, meaning middleware DOES run on it. CONTEXT D-12's test assertion that `/FOO.MRAM` does not match will therefore fail against the current matcher.
**Why it happens:** Case-sensitivity of extension matching was never explicitly specified when the matcher was written.
**How to avoid:** See Pattern 1 above — three resolution options. Recommended: Option C (assert `/FOO.MRAM` is NOT excluded, with a comment documenting that exclusion is case-sensitive by design). This preserves the regression-guard intent of HYGIENE-06 without introducing a middleware behavior change.
**Warning signs:** `npm test` shows `AssertionError: expected true to be false` on the uppercase case.

### Pitfall 3: Vercel env-var trailing newline
**What goes wrong:** When piping a value into `vercel env add VAR production < file`, the file's trailing newline becomes part of the env var value. Downstream code that does `process.env.VAR === expected` fails because `expected` is length N but `VAR` is length N+1.
**Why it happens:** Captured as a known footgun in the user's project memory (`vercel-env-newline-fix`).
**How to avoid:** In the rotation runbook, use one of:
- `echo -n "<value>" | vercel env update NAME production` (explicit no-newline)
- `printf "%s" "<value>" | vercel env update NAME production`
- Interactive prompt: `vercel env update NAME production` and type/paste the value
**Warning signs:** Sign-in works in dev but fails on production with a 401 that disappears after re-setting the env var interactively.

### Pitfall 4: Vercel preview env var requires git branch flag
**What goes wrong:** Running `vercel env add RITUAL_CLIENT_SECRET preview` without specifying a branch scopes the var to all preview branches. If the rotation runbook's rehearsal uses a specific feature branch, the operator must pass the branch explicitly: `vercel env add NAME preview <branch-name>`.
**Why it happens:** Captured in project memory (`vercel-cli-env-add-preview-branch-required`).
**How to avoid:** In the runbook, when documenting the rehearsal steps, explicitly include the git branch name in preview-env commands: `vercel env add RITUAL_CLIENT_SECRET preview rotation-rehearsal`. Same for `vercel env pull --environment=preview --git-branch=rotation-rehearsal`.
**Warning signs:** Rehearsal deploy reads production values or falls back to unset, not the rotation-test values.

### Pitfall 5: iCloud Private Relay and session-IP binding
**What goes wrong:** Private Relay rewrites the client IP between the magic-link email click and subsequent session requests. If the app IP-binds the session (it doesn't — verified in `src/lib/auth.ts`), users would be logged out immediately. Separately: Private Relay relay emails (`@privaterelay.appleid.com`) can occasionally fail to deliver Resend emails during Apple maintenance windows. May 2025 saw a documented outage affecting ~30% of Sign-in-with-Apple users.
**Why it happens:** Apple's maintenance. Not mitigatable by the app.
**How to avoid:** HYGIENE-05 verification: if the first attempt fails, wait and retry. If consistent failure, confirm the email is reaching the iCloud inbox at all (check Mail → Junk; Private Relay hide-my-email addresses sometimes land there). The repo does NOT IP-bind sessions (confirmed: `src/middleware.ts` only checks the JWT cookie, no IP claim). So one successful round-trip is sufficient evidence per D-18.
**Warning signs:** Magic-link email arrives but tapping it redirects back to `/signin`. Or email never arrives despite Resend logs showing delivery. Or link expires before tap (JWT `exp` is 24h — should not trigger in a human-scale round-trip).
**Note for runbook:** Do not add IP-binding to fix this in Phase 1. That's a Phase 2 SAFETY consideration if it matters.

### Pitfall 6: `next.config.ts` headers() do not apply during `next dev`
**What goes wrong:** `npm run dev` serves `public/landing.html` directly from disk; the `headers()` function runs through Next's dev server which DOES apply them… but for static files in `public/`, behavior has been inconsistent historically. On Vercel production, Next compiles the rule to edge config and it always applies.
**Why it happens:** Dev-server vs edge-runtime discrepancy in static-file header application.
**How to avoid:** The inline `<meta name="robots">` in landing.html (D-07) provides always-on coverage regardless of dev/prod or hosting platform. Test HYGIENE-03 in BOTH environments: `curl -I http://localhost:3000/landing.html` during `next dev` AND against a Vercel Preview deploy. Treat the Preview deploy response as authoritative.
**Warning signs:** `curl -I` in dev shows no `X-Robots-Tag`; planner panics and thinks noindex is broken. It isn't — Vercel sets it.

### Pitfall 7: Next.js 16.0.0 middleware.ts deprecation noise
**What goes wrong:** Someone lands HYGIENE-06 and the next Vercel build surface a console warning about the deprecated `middleware.ts` filename. An observer conflates this with a HYGIENE-06 regression.
**Why it happens:** Next.js 16 deprecated `middleware.ts` → `proxy.ts` in v16.0.0. The current repo is 16.2.3 and still on the old filename. A warning is logged but functionality is preserved.
**How to avoid:** Note this explicitly in HYGIENE-06's commit message and VERIFICATION entry: "Middleware deprecation warning is expected; rename deferred to post-Phase 1 per scope." Do NOT rename as part of this phase — that's an atomic change affecting imports, exports, and the `proxy` function signature. Scope creep.
**Warning signs:** Build log line: `warn: The middleware file convention is deprecated, rename to proxy.ts`.

## Code Examples

### HYGIENE-06 test (verified syntax against current matcher)

```typescript
// File: src/middleware.test.ts
// Source: CONTEXT.md D-10/D-11/D-12 + Next.js matcher docs
//   https://nextjs.org/docs/app/api-reference/file-conventions/middleware#matcher
import { describe, it, expect } from "vitest";
import { config } from "./middleware";

describe("middleware matcher: .mram exclusion (HYGIENE-06)", () => {
  // Next's matcher strings are path-to-regexp surface syntax, but the current
  // matcher uses only JS-RegExp-compatible features (character classes,
  // alternation, negative lookahead, escaped dots). Anchoring with ^/$ models
  // Next's implicit full-path match.
  const matcherString = config.matcher[0];
  const matcher = new RegExp("^" + matcherString + "$");

  it.each([
    ["/foo.mram", "flat .mram"],
    ["/deeply/nested/path/ritual.mram", "nested .mram"],
    ["/ea-degree.mram", "hyphenated .mram"],
  ])("does NOT match %s (%s) — exclusion intact", (path) => {
    expect(matcher.test(path)).toBe(false);
  });

  // Documented: extension alternation is case-sensitive. Uppercase .MRAM
  // DOES match (i.e., is NOT excluded). This test locks in that behavior
  // so a future flip to case-insensitive exclusion is an explicit, reviewed
  // change — not a silent regression in the other direction.
  it("uppercase .MRAM is NOT excluded (case-sensitive by design)", () => {
    expect(matcher.test("/FOO.MRAM")).toBe(true);
  });

  it("still matches regular app paths (sanity)", () => {
    expect(matcher.test("/practice")).toBe(true);
    expect(matcher.test("/api/tts/gemini")).toBe(true);
    expect(matcher.test("/signin")).toBe(true);
  });

  it("still excludes other listed static extensions", () => {
    expect(matcher.test("/logo.png")).toBe(false);
    expect(matcher.test("/manifest.webmanifest")).toBe(false);
    expect(matcher.test("/_next/static/chunks/x.js")).toBe(false);
  });
});
```

### HYGIENE-02 codemod invocation (CORRECTED from CONTEXT D-16)

```bash
# Source: https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0
# Pinned version + explicit v6 subcommand + explicit source paths.
# Zero ai imports exist today, so this is effectively a package.json
# version bump — which is fine and expected.

npx --yes @ai-sdk/codemod@3.0.4 v6 src/ scripts/

# Then bump the ai package explicitly (codemod 'v6' does NOT touch
# package.json; only the 'upgrade' command does):
npm install ai@^6.0.168 @ai-sdk/anthropic@^3.0.71

# Verify:
npm run build
npm test
# Manual smoke (optional — /api/rehearsal-feedback does not import 'ai'):
curl -X POST http://localhost:3000/api/rehearsal-feedback \
  -H "X-Client-Secret: $RITUAL_CLIENT_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"accuracy":0.95,"wrongWords":[],"missingWords":[],"troubleSpots":[],"lineNumber":1,"totalLines":10}'
```

### HYGIENE-01 package removal (verified grep-safe)

```bash
# Verification already performed during research (grep found zero matches
# anywhere in src/, scripts/, public/). Safe to run:
npm uninstall natural uuid @ai-sdk/react @types/uuid

# Verify:
npm ls natural 2>&1 | grep -q "empty" && echo "natural: removed"
npm ls uuid 2>&1 | grep -q "empty" && echo "uuid: removed"
npm ls @ai-sdk/react 2>&1 | grep -q "empty" && echo "@ai-sdk/react: removed"
npm ls @types/uuid 2>&1 | grep -q "empty" && echo "@types/uuid: removed"
npm run build
npm test
```

### HYGIENE-07 rotation runbook — canonical `vercel env update` commands

```bash
# Source: https://vercel.com/docs/cli/env §Updating + project memory
#   notes on newline-fix and preview-branch-required.

# For production rotation:
printf "%s" "<NEW_SECRET_VALUE>" | vercel env update RITUAL_CLIENT_SECRET production --yes
printf "%s" "<NEW_JWT_SECRET>" | vercel env update JWT_SECRET production --yes

# Redeploy production (picks up new values):
vercel deploy --prod

# For preview-branch rehearsal (D-04):
printf "%s" "<TEST_SECRET>" | vercel env add RITUAL_CLIENT_SECRET preview rotation-rehearsal
printf "%s" "<TEST_JWT>"    | vercel env add JWT_SECRET preview rotation-rehearsal

# Deploy preview:
git push origin rotation-rehearsal
# Wait for preview deploy; visit preview URL; exercise sign-in flow end-to-end.

# Cleanup after rehearsal:
vercel env rm RITUAL_CLIENT_SECRET preview rotation-rehearsal --yes
vercel env rm JWT_SECRET preview rotation-rehearsal --yes
```

### HYGIENE-04 ritual-term grep blocklist (draft for Shannon review)

```bash
# Source: Claude's Discretion per CONTEXT (Shannon reviews before running).
# Emphasis: officer codes and generic obligation-language; avoid checking
# in any phrase that is itself ritually significant (SPECIFICS in CONTEXT).

grep -iE '\b(WM|SW|JW|SD|JD|IG|Tyler|Worshipful|Senior Warden|Junior Warden|Senior Deacon|Junior Deacon|Inner Guard|Marshal|Chaplain|Steward)\b' public/landing.html

# Obligation-language tokens (generic — none of these are themselves ritual text):
grep -iE '\b(obligation|due-guard|due guard|cable-tow|cable tow|hoodwink|cabletow|charges|initiation|passing|raising)\b' public/landing.html

# Cipher-punctuation patterns (many Masonic ciphers use distinctive dot/dash
# patterns within words or between letters):
grep -E '[a-zA-Z]\.[a-zA-Z]\.[a-zA-Z]' public/landing.html   # e.g., "s.o.r."

# Capitalized multi-word phrases that could be working-specific titles:
grep -E '\b[A-Z][a-z]+ of the [A-Z][a-z]+' public/landing.html
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `export default function middleware` in `middleware.ts` | `export function proxy` in `proxy.ts` (Node runtime default) | Next.js 16.0.0 (October 2025) | `middleware.ts` still supported through at least 16.2.x. Rename is a scope-creep risk for Phase 1 — defer. |
| AI SDK v5 `CoreMessage`, `textEmbeddingModel`, `MockLanguageModelV2` | v6 `ModelMessage`, `embeddingModel`, `MockLanguageModelV3` | AI SDK v6 (early 2026) | Codemod handles all 7-8 renames mechanically. No runtime impact on this repo (no `ai` imports). |
| `vercel env add` + `vercel env rm` for rotation | `vercel env update` (atomic) | Vercel CLI has had `update` since 2024 | Use `update` — single atomic command, no window-of-unset. |
| Meta-tag-only noindex | Meta tag + `X-Robots-Tag` HTTP header (belt-and-suspenders) | Current best practice since 2023 | Phase 1 correctly uses both (D-06 + D-07). |

**Deprecated/outdated:**
- `@ai-sdk/react` v3.x is NOT deprecated — still shipping (3.0.170 latest). Its removal from this repo is because it's unused, not because it's obsolete.
- `middleware.ts` deprecated in Next 16; removal timeline unannounced.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Vercel production deploys apply `next.config.ts` `headers()` to `public/*.html` static files. | Code Examples, HYGIENE-03 | If wrong, `X-Robots-Tag` on `/landing.html` is missing. The inline `<meta>` (D-07) provides belt-and-suspenders — so noindex still works via the HTML tag. Impact: soft, not blocking. VERIFIED via Next docs + Vercel discussion, but the exact behavior for files in `public/` without a rewrite is contested in community threads. Planner should verify on Preview deploy: `curl -I https://<preview>.vercel.app/landing.html` should show the header. |
| A2 | The current matcher behaves identically whether compiled by Next's internal path-to-regexp wrapper or by `new RegExp("^" + pattern + "$")`. | Pattern 1 | If wrong, test may pass while real middleware behavior differs. Mitigation: test uses representative paths; if Next compilation differs, a future integration test catches it. This is LOW risk because the current pattern uses zero path-to-regexp-specific features (no `:param`, no modifiers). |
| A3 | Running `@ai-sdk/codemod v6` on a codebase with zero `ai` imports produces no errors. | Common Pitfalls #1 | VERIFIED experimentally in an empty npm directory: exits 0, logs "v6 codemods complete." |
| A4 | Rotating `JWT_SECRET` in production cleanly invalidates all live pilot sessions with no residual damage. | CONTEXT D-02 | `src/lib/auth.ts` uses jose HS256; sessions signed with the old key simply fail `verifySessionToken` and fall through to the `/signin` redirect. No database entries to clean up. LOW risk. |
| A5 | Shannon's iPhone can complete an end-to-end magic-link flow on iCloud Private Relay today. | HYGIENE-05 | Magic-link deliverability from Resend to Private Relay addresses has had transient failures in 2025 (see Common Pitfalls #5). If this fails during HYGIENE-05, it's not a Phase 1 code defect — it's environmental. |

## Open Questions (RESOLVED)

All three open questions were resolved during context-refinement after research (Shannon via AskUserQuestion, 2026-04-20). Plans implement the chosen resolutions.

1. **RESOLVED — HYGIENE-02 codemod invocation:** Use `npx @ai-sdk/codemod@3.0.4 v6 src/ scripts/` (version-pinned, correct `v6` subcommand, explicit source dirs). Shannon confirmed via AskUserQuestion. CONTEXT D-16 updated 2026-04-20 with the correct syntax; the planner encoded this in `01-02-ai-sdk-codemod-PLAN.md` Task 2.

2. **RESOLVED — `/FOO.MRAM` test assertion:** Drop uppercase from the test matrix. Shannon confirmed via AskUserQuestion: app URLs are lowercase by convention, no uppercase `.mram` files are served, and making the matcher case-insensitive is scope creep. CONTEXT D-12 updated 2026-04-20; the matcher test asserts only lowercase paths (`/foo.mram`, `/deeply/nested/path/ritual.mram`, `/ea-degree.mram`, `/hyphen-name.mram`).

3. **RESOLVED — Codemod vs version-bump ordering:** The codemod runs effectively as a no-op on this codebase (zero `ai` imports). The plan does: (a) `npm install ai@^6.0.168 @ai-sdk/anthropic@^3.0.71` to update `package.json`, (b) `npx @ai-sdk/codemod@3.0.4 v6 src/ scripts/` as mechanical safety-net, (c) `npm run build && npm run test:run` to prove nothing broke. All in one commit (`hygiene-02:`). Encoded in `01-02-ai-sdk-codemod-PLAN.md` Task 2.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All tasks | ✓ | 20.20.0 (verified) | — |
| npm | HYGIENE-01, 02 | ✓ | bundled with Node 20 | — |
| `@ai-sdk/codemod` | HYGIENE-02 | ✓ via npx (registry) | 3.0.4 latest | None — must have registry access |
| vitest | HYGIENE-06 | ✓ (devDep 4.1.2) | 4.1.2 | — |
| Vercel CLI | HYGIENE-07 rehearsal | ? — Shannon's machine | — | Runbook can document dashboard-UI alternative, but rehearsal per D-04 is CLI-led. Planner should confirm Shannon has `vercel` installed. |
| git | HYGIENE-07 preview branch | ✓ | 2.x | — |
| iPhone + iCloud Private Relay | HYGIENE-05 | ✓ (Shannon owns) | N/A | Defer test if Private Relay is having an outage (check system.apple.com). |
| curl or browser | HYGIENE-03 verification | ✓ | — | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** Vercel CLI availability is unverified on Shannon's machine. The runbook SHOULD include a one-line "install check" step: `command -v vercel || npm install -g vercel`. Planner: add this to HYGIENE-07 task.

## Validation Architecture

Phase 1's validation is a mix of automated (`npm test`, `npm run build`) and manual (iPhone, preview rehearsal, landing audit). The automated surface is narrow — only HYGIENE-06 adds a new test.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.2 + jsdom 29.0.1 |
| Config file | `vitest.config.ts` (existing — no change needed) |
| Quick run command | `npm test` (watch mode) |
| Full suite command | `npm run test:run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HYGIENE-01 | Packages removed from `package.json` and `node_modules/` | unit / smoke | `npm ls natural uuid @ai-sdk/react @types/uuid` (expected: "empty") + `npm run build` + `npm test` | ✅ (existing build + test) |
| HYGIENE-02 | `npm run build` succeeds after codemod; AI SDK deps at v6 | smoke | `npm run build && npm test` | ✅ (existing build + test) |
| HYGIENE-03 | `X-Robots-Tag` in response headers on deployed preview | integration (manual curl) | `curl -I https://<preview>.vercel.app/` → expect `x-robots-tag: noindex, nofollow` | ❌ Manual (no automated HTTP test today) |
| HYGIENE-04 | No ritual text in `public/landing.html` | manual (human read + grep) | grep blocklist (see Code Examples) — zero matches expected | ❌ Manual review |
| HYGIENE-05 | iPhone magic-link end-to-end | manual (Shannon-only) | None — device test | ❌ Manual |
| HYGIENE-06 | `.mram` paths do not match middleware matcher | unit | `npm run test:run src/middleware.test.ts` | ❌ → Wave 0 creates `src/middleware.test.ts` |
| HYGIENE-07 | Runbook is complete and rehearsed | manual (rehearsal on preview deploy) | None — procedure executed by Shannon | ❌ Manual (evidence in VERIFICATION.md) |

### Sampling Rate
- **Per task commit:** `npm run test:run` (fast — ~5s, whole suite).
- **Per wave merge:** Same. Phase is narrow enough there's no "quick vs full" distinction.
- **Phase gate:** `npm run build && npm run test:run` green + VERIFICATION.md has seven evidence entries + Shannon signs off on iPhone test.

### Wave 0 Gaps
- [ ] `src/middleware.test.ts` — covers HYGIENE-06 (created as part of that task, no separate Wave 0 needed).
- [ ] No `conftest.py` / shared-fixture equivalent needed — vitest auto-discovers, and the test has no shared state.
- [ ] No framework install needed (vitest 4.1.2 already in devDeps).

(No Wave 0 preamble tasks required; HYGIENE-06 creates its own test file.)

## Security Domain

**Applicable:** HYGIENE-03 (search-engine indexing control), HYGIENE-07 (shared-secret rotation).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | HYGIENE-07 only (covers JWT_SECRET rotation) | jose HS256 (existing); rotation runbook documents safe swap. |
| V3 Session Management | HYGIENE-07 (rotating JWT_SECRET invalidates sessions) | Rotation invalidates all `pilot-session` cookies — documented as expected signal in D-02. |
| V4 Access Control | no — LODGE_ALLOWLIST unchanged in Phase 1 | — |
| V5 Input Validation | no | — |
| V6 Cryptography | HYGIENE-07 (uses existing AES + JWT crypto; rotation keys, not algo) | Don't hand-roll rotation crypto. Use jose's existing sign/verify — they're already correct. |
| V10 Configuration | HYGIENE-03 (X-Robots-Tag is a response-header configuration concern) | Extend existing `SECURITY_HEADERS` array; don't introduce ad-hoc header middleware. |
| V14 Configuration Metadata | HYGIENE-03, HYGIENE-04 | Ensure preview deploys also have noindex (they will — same `next.config.ts`). Ensure landing.html's inline `<meta>` is preserved through any future minification. |

### Known Threat Patterns for this phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Search engine indexes the authenticated app surface | Information Disclosure | `X-Robots-Tag` header + inline `<meta>` (HYGIENE-03, 04). |
| Ritual text leaked in the one static page (landing.html) | Information Disclosure | Grep-and-human-review audit (HYGIENE-04). Preserves invite-only ritual privacy invariant. |
| Shared-secret exfiltration with no rotation playbook | Elevation of Privilege | Runbook (HYGIENE-07) — practiced, not theoretical. |
| JWT_SECRET rotation causes user confusion / silent lockout | DoS-ish (user impact) | D-02 explicitly calls out session invalidation as expected; runbook includes out-of-band heads-up step. |
| Magic-link email contains stale base URL after env rotation | Tampering / configuration drift | Runbook must include verification step: after rotation and redeploy, request a magic link and confirm the URL points to the correct (new) deploy. |
| iCloud Private Relay address delivery failure locks users out | DoS (external) | Not mitigable in Phase 1. Documented in Common Pitfalls #5. HYGIENE-05 is evidence-of-works, not a durable fix. |
| Codemod rewrites break the build and land anyway | Build integrity | D-21 gate: `npm run build` MUST succeed before phase close. CI/local test before commit. |

Phase 1 does NOT introduce any new cryptographic primitives, auth code paths, or rate-limit logic. All security work is reuse-of-existing-controls plus documentation.

## Sources

### Primary (HIGH confidence)

- [Vercel AI SDK v6 Migration Guide](https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0) — official codemod commands, exact subcommand distinction (`v6` vs `upgrade`).
- [npm: @ai-sdk/codemod](https://www.npmjs.com/package/@ai-sdk/codemod) — verified via `npm view`: version 3.0.4, published 2026-04-14 by vercel-release-bot.
- [Next.js Middleware / Proxy file-convention docs](https://nextjs.org/docs/app/api-reference/file-conventions/middleware) — matcher syntax (path-to-regexp + regex), negative-lookahead support, v16 deprecation notice.
- [Next.js Upgrading to v16](https://nextjs.org/docs/app/guides/upgrading/version-16) — `middleware.ts → proxy.ts` rename status.
- [Vercel CLI env reference](https://vercel.com/docs/cli/env) — verified `vercel env update` exists, syntax for production/preview/gitbranch scoping, `--force` / `--yes` flags.
- [Vercel docs: Rotating environment variables](https://vercel.com/docs/environment-variables/rotating-secrets) — canonical zero-downtime flow.
- [Google Search Central: Block Search Indexing with noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing) — confirms `<meta name="robots">` and `X-Robots-Tag` both honored by Googlebot.
- Live CLI verification: `npx @ai-sdk/codemod@3.0.4 --help`, `upgrade --help`, `v6 --help` — command surface verified 2026-04-20.
- Live experimental verification: `npx @ai-sdk/codemod@3.0.4 v6 .` in an empty directory exits 0 with `v6 codemods complete.` — codemod is safe on codebases with zero `ai` imports.

### Secondary (MEDIUM confidence)

- [MDN: X-Robots-Tag header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Robots-Tag) — general behavior and crawler-specific syntax.
- [Next.js blog: Next.js 16](https://nextjs.org/blog/next-16) — middleware rename announcement.
- Project memory notes (`vercel-env-newline-fix`, `vercel-cli-env-add-preview-branch-required`) — captured real incidents in this author's prior work.

### Tertiary (LOW confidence)

- [ASO.dev: Sign in with Apple Private Relay Issue May 2025](https://aso.dev/blog/apple-sign-in/) — describes a real outage but may not generalize to all magic-link + Private Relay flows. Used as cautionary context only.
- Community discussions on Next.js GitHub (`vercel/next.js discussions #16118`, `#19078`) — informed but not authoritative on `public/*.html` header behavior.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified via live npm view; all commands verified via CLI help.
- Architecture patterns: HIGH — matcher test pattern verified by inspecting the current matcher string and confirming it uses only JS-RegExp-compatible features.
- Pitfalls: HIGH — the codemod subcommand footgun was verified experimentally (actual `commander` behavior); Vercel CLI env newlines and preview-branch flag are documented in project memory from prior real incidents; `/FOO.MRAM` case-sensitivity is a logical consequence of the current regex (lowercase-only alternation) — verifiable by the planner before writing the test.
- Security domain: HIGH — all applicable controls reuse existing, shipped primitives.

**Research date:** 2026-04-20
**Valid until:** 2026-05-20 (30 days — Vercel CLI and @ai-sdk/codemod are active projects; AI SDK v7 discussions already ongoing in vercel/ai#14011, so revisit before Phase 5).
