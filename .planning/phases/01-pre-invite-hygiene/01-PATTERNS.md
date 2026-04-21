# Phase 1: Pre-invite Hygiene - Pattern Map

**Mapped:** 2026-04-20
**Files analyzed:** 6 (3 new, 3 modified)
**Analogs found:** 6 / 6 (100% — all files have strong existing analogs)

---

## File Classification

| File | New/Modified | Role | Data Flow | Closest Analog | Match Quality |
|------|--------------|------|-----------|----------------|---------------|
| `src/__tests__/middleware.test.ts` | NEW | unit test (vitest) | read-only import + pure-function regex assertions | `src/lib/__tests__/rehearsal-decision.test.ts` | exact (same framework, same "pure-logic + it.each + no mocks" shape) |
| `docs/runbooks/SECRET-ROTATION.md` | NEW | operational runbook | human-procedure doc, inline CLI | `docs/BAKE-WORKFLOW.md` | exact (same heading hierarchy, inline code fences, troubleshooting tail) |
| `.planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md` | NEW | phase evidence log | append-only human notes | `.planning/phases/01-pre-invite-hygiene/01-VALIDATION.md` (structure reference only) | partial — no prior VERIFICATION.md exists in repo; planner to follow .planning convention |
| `next.config.ts` | MODIFIED | config | build-time → Vercel edge headers | n/a — file is its own analog; add one row to existing `SECURITY_HEADERS` array | trivial |
| `public/landing.html` | MODIFIED | static asset | served verbatim at `/landing.html` | n/a — file is its own analog; insert one `<meta>` line in existing `<head>` | trivial |
| `package.json` | MODIFIED | build config | npm dependency manifest | n/a — standard `npm uninstall` / `npm install` semantics | trivial |

**Data flow notes:**
- `src/__tests__/middleware.test.ts` imports `config` from `../middleware` (one step up from the test file, since middleware.ts lives at `src/middleware.ts` and the test lives in the `__tests__/` subdirectory of src/).
- CONTEXT D-11 (updated 2026-04-20 post-pattern-mapping) locked the test at `src/__tests__/middleware.test.ts` to match the repo's actual test convention (`src/lib/__tests__/rehearsal-decision.test.ts` is the exemplar). The vitest glob `src/**/*.test.{ts,tsx}` picks this up without any config change.

---

## Pattern Assignments

### 1. `src/__tests__/middleware.test.ts` (unit test, pure-function regex assertions)

**Analog:** `/home/mcleods777/Masonic-Ritual-AI-Mentor/src/lib/__tests__/rehearsal-decision.test.ts`

**Why this analog:** Pure-function unit test. No network, no DOM, no mocks, no env setup. Just `import { thing } from "../source"` then `describe → it → expect`. Uses `describe` groups to cluster related assertions and inline comments to explain regression intent. The auth.test.ts file is a secondary reference for the `@vitest-environment node` pragma (not strictly required here since middleware doesn't touch DOM, but consistent with "test what you import" — middleware.ts doesn't import DOM globals).

**Imports pattern** (rehearsal-decision.test.ts lines 1-7):

```typescript
import { describe, it, expect } from "vitest";
import {
  decideLineAction,
  planComparisonAction,
  DEFAULT_AUTO_ADVANCE_THRESHOLD,
  DEFAULT_AUTO_ADVANCE_BEAT_MS,
} from "../rehearsal-decision";
```

For the new middleware test (at `src/__tests__/middleware.test.ts`), import only `config` (the named export at `src/middleware.ts:125-136`) from the parent directory:

```typescript
import { describe, it, expect } from "vitest";
import { config } from "../middleware";
```

**Core pattern — describe/it with regression comments** (rehearsal-decision.test.ts lines 35-45):

```typescript
describe("decideLineAction — regression: empty-text rows don't hang the rehearsal", () => {
  // This is the bug that blocked swapping ea-opening.mram to the dialogue-
  // sourced build: action-only lines like `SW: [due guard given]` (stored
  // as role=SW, plain="", cipher="", action="due guard given") made the
  // rehearsal enter listening mode on lines that cannot be recited.

  it("does NOT enter listening for a user-role row with empty text", () => {
    expect(
      decideLineAction({ speaker: "SW", text: "" }, "SW"),
    ).toBe("silent-advance");
  });
```

Copy shape: named `describe` with regression-intent comment + flat `it` blocks. The middleware test's single purpose is "fail if `.mram` is removed from the matcher exclusion" (D-13), so one focused `describe` block with 3-5 `it` assertions plus a sanity positive-match.

**Optional `it.each` pattern for repeated assertions** — not present in rehearsal-decision.test.ts but referenced in RESEARCH.md Code Examples. Acceptable vitest idiom; either style is fine. For Phase 1 stylistic consistency with the repo, prefer explicit `it()` blocks per assertion (matches rehearsal-decision.test.ts).

**Optional JSDoc preamble** (auth.test.ts lines 1-12):

```typescript
// @vitest-environment node
/**
 * Tests for pilot authentication helpers.
 *
 * Coverage priorities (from plan-eng-review on 2026-04-14):
 *   - JWT round-trip for both magic-link and session tokens
 *   - Expired token rejection
 *   ...
 */
```

For the new middleware test, mirror this form: a JSDoc block stating intent ("Regression test for HYGIENE-06 — locks in `.mram` exclusion from middleware matcher per CONTEXT D-10..D-13") and a 2-3 line note on the case-sensitivity finding from RESEARCH.md Pitfall 2 (per CONTEXT D-12 updated 2026-04-20, the matrix is lowercase-only; drop uppercase `.MRAM`).

**No `@vitest-environment node` pragma needed** — the test has no DOM interaction and the default jsdom environment (from `vitest.config.ts`) costs nothing. Add the pragma only if a future import pulls in Node-only APIs.

**Error handling:** Not applicable — pure assertion test, no try/catch, no async cleanup. If an assertion fails, vitest reports. Zero error-handling code in either analog.

**Assertion matrix** (per CONTEXT D-12, corrected 2026-04-20):

```typescript
// From CONTEXT D-12: lowercase-only assertion matrix. Uppercase .MRAM is
// out-of-scope for Phase 1 — app URLs are lowercase by convention and the
// current matcher's extension alternation is case-sensitive.
const cases = [
  "/foo.mram",
  "/deeply/nested/path/ritual.mram",
  "/ea-degree.mram",
  "/hyphen-name.mram",
];
```

---

### 2. `docs/runbooks/SECRET-ROTATION.md` (operational runbook)

**Analog:** `/home/mcleods777/Masonic-Ritual-AI-Mentor/docs/BAKE-WORKFLOW.md`

**Why this analog:** Only existing doc in the repo that is a **procedural/operational** reference (versus INSTALL-GUIDE.md which is an end-user walkthrough and NOTION-HOW-TO.md which is a how-to). BAKE-WORKFLOW.md has the exact structure a rotation runbook needs: top-summary → TL;DR → mechanism sections → "typical workflows" step-by-step → troubleshooting tail. Second analog is INSTALL-GUIDE.md (for the "Part 1 / Part 2 / …" checklist flavor) — use it as the secondary reference for the numbered-step sections.

**Heading hierarchy pattern** (BAKE-WORKFLOW.md lines 1-10):

```markdown
# .mram Bake Workflow — Canonical Reference

This is the single source of truth for building encrypted `.mram` ritual files...

---

## TL;DR

Build one ritual with embedded audio:

```bash
GOOGLE_GEMINI_API_KEY=AIza... \
npx tsx scripts/build-mram-from-dialogue.ts \
  ...
```
```

Copy shape: `# Title — Purpose suffix`, one-line-then-paragraph opening, horizontal rule separators between top-level sections, `## TL;DR` as the first working section with a fenced code block showing the one-line canonical command.

**Inline CLI code-fence pattern** (BAKE-WORKFLOW.md lines 11-20, 149-156, 173-175):

````markdown
```bash
GOOGLE_GEMINI_API_KEY=AIza... \
npx tsx scripts/build-mram-from-dialogue.ts \
  rituals/ea-opening-dialogue.md \
  rituals/ea-opening-dialogue-cipher.md \
  rituals/ea-opening.mram \
  --with-audio
```
````

Use fenced `bash` blocks with the exact command form the operator should paste. Multi-line commands use `\` continuation. Env vars are inline-prefix style (`GOOGLE_GEMINI_API_KEY=... npx tsx ...`), matching both BAKE-WORKFLOW.md and the RESEARCH.md rotation examples (which use `printf "%s" ... | vercel env update ...`).

**"Typical workflows" section pattern** (BAKE-WORKFLOW.md lines 302-356):

```markdown
## Typical workflows

### First time setup for a new ritual degree

1. Author `rituals/{slug}-dialogue.md` (plain English) with frontmatter
2. Author `rituals/{slug}-dialogue-cipher.md` (cipher, same line structure)
...
5. If the text-only build works, add `--with-audio` and go.

### Rebuilding one ritual after editing a few lines

Just re-run with `--with-audio`. Edited lines re-render; unchanged lines cache-hit.
```

Copy shape: `### Scenario name` as H3, numbered list of imperative steps, inline code spans in backticks, occasional fenced-block for multi-line commands. Each scenario is self-contained and skimmable.

**Troubleshooting tail pattern** (BAKE-WORKFLOW.md lines 383-396):

```markdown
## Troubleshooting

**"ffmpeg not found in PATH"** — install it:
- macOS: `brew install ffmpeg`
- Ubuntu/Debian: `sudo apt install ffmpeg`

**"GOOGLE_GEMINI_API_KEY env var is required"** — get a key at [aistudio.google.com]...

**"stdin is not a TTY and MRAM_PASSPHRASE env var is not set"** — you're running non-interactively...
```

Copy shape: bold-wrapped error-string-or-symptom, em-dash, one-line explanation, bullets for platform-specific fixes. Each entry is 1-3 lines, scannable on a scroll-through.

**"See also" footer pattern** (BAKE-WORKFLOW.md lines 400-406):

```markdown
## See also

- `README.md` — project overview, includes a shorter version of this doc
- `src/lib/mram-format.ts` — `.mram` binary format definition and encrypt/decrypt logic
- `scripts/render-gemini-audio.ts` — audio pipeline internals
- `TODOS.md` — outstanding work on the fallback/error-banner UX
```

Close SECRET-ROTATION.md with pointers to `src/lib/auth.ts` (for the `pilot-session` cookie lifecycle called out in D-02), `src/middleware.ts` (for `RITUAL_CLIENT_SECRET` gate), and `.env.example` (for the variable list).

**Callout style for expected behavior** — BAKE-WORKFLOW.md uses bold-prefix paragraphs (e.g., "**Parity is enforced.**", "**Passphrase is never passed on the command line.**"). The runbook should use this shape to call out the D-02 invariant:

```markdown
**Rotating `JWT_SECRET` invalidates every live `pilot-session` cookie.**
This is expected. Users will be bounced to `/signin` on their next request.
Plan timing accordingly — quiet hours, and send an out-of-band heads-up to
the invited lodges before you run the rotation.
```

No admonition/callout-block syntax (`> **Note:**` blockquotes) is used anywhere in the existing docs — stick to the bold-prefix paragraph form.

---

### 3. `.planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md` (phase evidence log)

**Analog:** No prior VERIFICATION.md exists in `.planning/phases/`. Closest structural reference is the sibling `01-VALIDATION.md` in the same directory (see `.planning/phases/01-pre-invite-hygiene/01-VALIDATION.md`), which has the same YAML frontmatter + section-header style the rest of `.planning/` uses.

**Frontmatter pattern** (01-VALIDATION.md lines 1-8):

```markdown
---
phase: 1
slug: pre-invite-hygiene
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-20
---

# Phase 1 — Validation Strategy
```

The VERIFICATION file should use matching frontmatter shape, with fields appropriate to an evidence log (`status`, `created`, `last_updated`).

**Suggested structure** (derived from CONTEXT D-21 + the validation-strategy table in 01-VALIDATION.md):

```markdown
---
phase: 1
slug: pre-invite-hygiene
status: in-progress
created: 2026-04-20
last_updated: 2026-04-20
---

# Phase 1 — Verification Evidence

One entry per HYGIENE-XX as verifications land. Phase-done gate (D-21) fires
when all seven entries are green AND `npm run build` + `npm run test:run`
both pass.

## HYGIENE-01 — Dead-package removal
**Status:** ⬜ pending | ✅ verified
**Date:** YYYY-MM-DD HH:MM
**Evidence:** `npm ls natural uuid @ai-sdk/react @types/uuid` → all "empty"; `npm run build` + `npm run test:run` green.

## HYGIENE-02 — AI SDK v6 codemod
...
## HYGIENE-07 — Secret-rotation runbook rehearsed
**Status:** ⬜ pending
**Date:** YYYY-MM-DD HH:MM
**Evidence:** Runbook executed end-to-end against preview deploy `<preview-url>`; notes:
```

No existing repo file exactly matches this shape — planner drafts the header scaffolding and leaves one-line-evidence slots for the seven HYGIENE-XX items. Populated incrementally during execution, not all at once.

---

### 4. `next.config.ts` (modified — one array entry added)

**Analog:** self. The existing `SECURITY_HEADERS` array literal already has the exact shape the new entry adopts (`{ key, value }` objects).

**Current state** (next.config.ts lines 29-35):

```typescript
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
];
```

**Target state** (one entry added per CONTEXT D-06):

```typescript
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];
```

No structural change to `headers()` function at line 43. The existing `source: "/:path*"` block applies the new header app-wide. Trailing comma present on existing last entry → new entry also has trailing comma (matches existing style).

---

### 5. `public/landing.html` (modified — meta tag + optional redactions)

**Analog:** self. Existing `<head>` block already follows standard HTML5 meta-tag ordering (charset first, viewport, then the app-specific tags).

**Current state** (landing.html lines 3-7):

```html
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Masonic Ritual Mentor</title>
  <link rel="manifest" href="/manifest.json">
```

**Target state** (per CONTEXT D-07 + RESEARCH Pattern 3):

```html
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Masonic Ritual Mentor</title>
  <link rel="manifest" href="/manifest.json">
```

Insert the `<meta name="robots">` line immediately after viewport and before `<title>` — this keeps the meta group contiguous and places it high in `<head>` so crawlers that parse partial content still see it (per RESEARCH Pattern 3 reasoning).

**Optional redaction pass** — per CONTEXT D-09, only touch content if the D-08 grep blocklist (RESEARCH Code Examples) finds flagged ritual text. If it finds nothing, the meta-tag addition is the only change.

**Indent style:** existing `<head>` uses 2-space indent with trailing `>` (no self-closing slash). Match exactly — don't introduce XHTML-style `<meta ... />`.

---

### 6. `package.json` (modified — four removals + version bumps)

**Analog:** self. Standard npm manifest semantics.

**Current state** (package.json lines 13-27, 28-43):

```json
"dependencies": {
  "@ai-sdk/anthropic": "^3.0.44",
  "@ai-sdk/react": "^3.0.88",
  "ai": "^6.0.86",
  "diff": "^8.0.3",
  "jose": "^6.2.2",
  "mammoth": "^1.11.0",
  "natural": "^8.1.0",
  "next": "^16.2.3",
  "pdfjs-dist": "^5.4.624",
  "react": "19.2.3",
  "react-dom": "19.2.3",
  "resend": "^6.11.0",
  "uuid": "^13.0.0"
},
"devDependencies": {
  ...
  "@types/uuid": "^10.0.0",
  ...
}
```

**Target state** (per CONTEXT D-14 + RESEARCH Code Examples):

1. Remove from `dependencies`: `@ai-sdk/react`, `natural`, `uuid`.
2. Remove from `devDependencies`: `@types/uuid`.
3. Keep `@ai-sdk/anthropic` and `ai` — Phase 5 COACH-02 uses them.
4. Codemod + explicit bump may update `ai` and `@ai-sdk/anthropic` to the latest v6 / v3 patch versions respectively (per RESEARCH A3 + Code Examples: `npm install ai@^6.0.168 @ai-sdk/anthropic@^3.0.71`).

**Command sequence** (from RESEARCH Code Examples, HYGIENE-01 block):

```bash
npm uninstall natural uuid @ai-sdk/react @types/uuid
# After HYGIENE-02 codemod:
npm install ai@^6.0.168 @ai-sdk/anthropic@^3.0.71
# Verify:
npm run build
npm run test:run
```

No manual JSON editing — let npm manage the file. Confirm post-state by diffing `package.json` after the two commands land.

---

## Shared Patterns

### Commit message style (applies to all seven HYGIENE-XX commits)

**Source:** CONVENTIONS.md §"Commit Message Style" + CONTEXT D-20.

**Pattern:**
```
hygiene-NN: short imperative subject (lowercase, ≤72 chars)
```

The CONVENTIONS.md doc reads Conventional-Commits (e.g., `fix(tts):`, `feat(mobile):`) but recent `.planning` commits (ROADMAP, REQUIREMENTS) use the plain `docs: create roadmap ...` / `chore: add project config` style. CONTEXT D-20 overrides with a hygiene-prefix form — e.g., `hygiene-01: remove dead packages (natural, uuid, @ai-sdk/react, @types/uuid)`. Planner follows D-20 exactly.

**Apply to:** All seven HYGIENE-XX task commits (1-01 through 1-07).

### Path-alias import convention

**Source:** `/home/mcleods777/Masonic-Ritual-AI-Mentor/tsconfig.json` + CONVENTIONS.md §"Import Organization".

**Pattern:** `@/*` maps to `./src/*`. Deep relative paths (`../../lib/foo`) are forbidden.

**Apply to:** `src/middleware.test.ts` — the test sits at `src/middleware.test.ts` and imports from `./middleware` (single-step relative is idiomatic for sibling imports; `@/middleware` would also work but sibling relative is clearer for a co-located test). The existing `src/lib/__tests__/*.test.ts` files all use `../<name>` for the same reason.

### File-header JSDoc for non-trivial source files

**Source:** CONVENTIONS.md §"Comments" + `/home/mcleods777/Masonic-Ritual-AI-Mentor/src/lib/__tests__/auth.test.ts:1-12`.

**Pattern:** JSDoc block explaining intent, regression reference, or threat model — not param/return tags.

**Apply to:** `src/middleware.test.ts` — header should reference CONTEXT D-10..D-13 and the HYGIENE-06 requirement ID. Example:

```typescript
/**
 * Regression test for the `.mram` exclusion in the Next.js middleware
 * matcher (HYGIENE-06 / CONTEXT D-10..D-13).
 *
 * This test exists so that a future edit to src/middleware.ts config.matcher
 * that accidentally drops `.mram` from the extension alternation fails CI
 * before it ships. Encrypted ritual binaries are served from /public/ and
 * the middleware must not touch them (no auth, no CORS, no redirect).
 *
 * Uppercase .MRAM is out-of-scope — app URLs are lowercase by convention
 * and the matcher's extension alternation is case-sensitive by design.
 * See .planning/phases/01-pre-invite-hygiene/01-RESEARCH.md Pitfall 2.
 */
```

### Vitest test conventions

**Source:** All seven existing `src/lib/__tests__/*.test.ts` files.

**Pattern:**
- Named imports from `"vitest"` — `import { describe, it, expect } from "vitest";`
- `describe` groups nest one level (not two).
- `it` blocks use short descriptive strings (present-tense, no "should").
- Env-var setup via `beforeEach`/`afterEach` only when the code under test reads `process.env` (middleware test does not — skip the setup).
- No `vi.mock()` or module-mocks when testing pure logic (none of the auth/rehearsal-decision/api-fetch tests mock dependencies of the source; they mock `globalThis.fetch` only when the code calls it).

**Apply to:** `src/middleware.test.ts` — pure-logic test, no mocks, no env setup.

---

## No Analog Found

None. All six files have strong existing analogs or are modifications of files that serve as their own analog.

---

## Metadata

**Analog search scope:**
- `src/` for test file patterns (`*.test.{ts,tsx}`)
- `docs/` for runbook/operational doc patterns
- `.planning/` for phase-level doc patterns

**Files scanned (key ones read):**
- `/home/mcleods777/Masonic-Ritual-AI-Mentor/src/middleware.ts`
- `/home/mcleods777/Masonic-Ritual-AI-Mentor/src/lib/__tests__/rehearsal-decision.test.ts`
- `/home/mcleods777/Masonic-Ritual-AI-Mentor/src/lib/__tests__/auth.test.ts`
- `/home/mcleods777/Masonic-Ritual-AI-Mentor/src/lib/__tests__/api-fetch.test.ts`
- `/home/mcleods777/Masonic-Ritual-AI-Mentor/docs/BAKE-WORKFLOW.md`
- `/home/mcleods777/Masonic-Ritual-AI-Mentor/docs/INSTALL-GUIDE.md` (secondary reference)
- `/home/mcleods777/Masonic-Ritual-AI-Mentor/next.config.ts`
- `/home/mcleods777/Masonic-Ritual-AI-Mentor/public/landing.html` (head block only)
- `/home/mcleods777/Masonic-Ritual-AI-Mentor/package.json`
- `/home/mcleods777/Masonic-Ritual-AI-Mentor/vitest.config.ts`
- `/home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/codebase/CONVENTIONS.md`
- `/home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/codebase/STRUCTURE.md`
- `/home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-CONTEXT.md`
- `/home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-RESEARCH.md`
- `/home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-VALIDATION.md`

**Pattern extraction date:** 2026-04-20
