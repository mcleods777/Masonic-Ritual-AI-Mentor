---
phase: 03-authoring-throughput
plan: 03
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/lib/dev-guard.ts
  - src/lib/__tests__/dev-guard.test.ts
  - src/app/author/page.tsx
autonomous: true
requirements: [AUTHOR-08]
tags: [dev-only, guard, author-page, refactor, shared-module]

must_haves:
  truths:
    - "src/lib/dev-guard.ts exports two functions: isDev() (boolean, non-throwing) and assertDevOnly() (throws in production)"
    - "assertDevOnly() throws an Error whose message starts with '[DEV-GUARD]' when NODE_ENV === 'production'"
    - "isDev() returns true for NODE_ENV === 'development' and NODE_ENV === 'test' and undefined; returns false only for 'production'"
    - "src/app/author/page.tsx imports isDev from dev-guard.ts (not the inline process.env.NODE_ENV check it had)"
    - "The 'Author tool disabled' JSX banner in author/page.tsx is byte-identical before/after the refactor"
    - "scripts/preview-bake.ts (Plan 08) will import assertDevOnly() from this module — the single-source-of-truth invariant D-15 requires is established by this plan"
  artifacts:
    - path: src/lib/dev-guard.ts
      provides: "shared dev-only guard: isDev() + assertDevOnly() functions"
      contains: "export function assertDevOnly"
      min_lines: 20
    - path: src/lib/__tests__/dev-guard.test.ts
      provides: "unit tests covering NODE_ENV=development/test/production/undefined for both functions"
      contains: "DEV-GUARD"
    - path: src/app/author/page.tsx
      provides: "Ritual Author Review UI — now gated via shared dev-guard instead of inline check"
      contains: 'from "@/lib/dev-guard"'
  key_links:
    - from: src/app/author/page.tsx
      to: src/lib/dev-guard.ts
      via: "import { isDev } from '@/lib/dev-guard'; if (!isDev()) return <disabled banner />"
      pattern: 'isDev\\(\\)'
    - from: "scripts/preview-bake.ts (Plan 08)"
      to: src/lib/dev-guard.ts
      via: "import { assertDevOnly } from '../src/lib/dev-guard'; assertDevOnly() at module load"
      pattern: "assertDevOnly"
---

<objective>
Extract the inline `process.env.NODE_ENV === "production"` check at `src/app/author/page.tsx:220-233` into a new shared module `src/lib/dev-guard.ts` that exports two complementary functions: `isDev()` (non-throwing — used by React components that need to render a "disabled" banner) and `assertDevOnly()` (throwing — used by Node scripts that should refuse to start in production). Refactor `src/app/author/page.tsx` to use `isDev()`. Land full unit test coverage in `src/lib/__tests__/dev-guard.test.ts`.

Purpose: per D-15, both `src/app/author/page.tsx` (current inline guard) AND the Plan-08 `scripts/preview-bake.ts` (new cache-scrubber server) need identical dev-only refusal semantics. D-15 locks "identical guard" via a shared module; this plan creates the module. Plan 08 then imports `assertDevOnly()` to refuse production start AND additionally enforces loopback-only bind as a script-specific layer on top.

Output: one new library module with two exported functions, its unit test file, and a minimal refactor of `author/page.tsx` (import + one conditional changed; JSX banner preserved byte-for-byte).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/03-authoring-throughput/03-CONTEXT.md
@.planning/phases/03-authoring-throughput/03-RESEARCH.md
@.planning/phases/03-authoring-throughput/03-PATTERNS.md
@.planning/phases/03-authoring-throughput/03-VALIDATION.md
@.planning/phases/03-authoring-throughput/03-01-SUMMARY.md
@src/app/author/page.tsx
@src/lib/paid-route-guard.ts
@src/lib/__tests__/hash-user.test.ts
@src/lib/__tests__/dev-guard.test.ts

<interfaces>
<!-- Exact API shape for dev-guard.ts (locked by PATTERNS.md §src/lib/dev-guard.ts) -->

```typescript
// src/lib/dev-guard.ts
export function isDev(): boolean;
export function assertDevOnly(): void;  // throws Error when NODE_ENV === "production"
```

Current author/page.tsx state (lines 220-233 — to be replaced):
```typescript
const isProduction = process.env.NODE_ENV === "production";

if (isProduction) {
  return (
    <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-6 text-red-200">
      <h1 className="text-xl font-semibold mb-2">Author tool disabled</h1>
      <p className="text-sm">
        The ritual review and correction tool only runs in local development.
        It edits plaintext ritual files on disk and is never served from a
        production build.
      </p>
    </div>
  );
}
```

After refactor:
```typescript
import { isDev } from "@/lib/dev-guard";  // add to existing import block
// ...
if (!isDev()) {
  return (
    <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-6 text-red-200">
      <h1 className="text-xl font-semibold mb-2">Author tool disabled</h1>
      <p className="text-sm">
        The ritual review and correction tool only runs in local development.
        It edits plaintext ritual files on disk and is never served from a
        production build.
      </p>
    </div>
  );
}
```

Error message shape (PATTERNS.md §Guard API):
```
[DEV-GUARD] refusing to run in production (NODE_ENV=production). This module is dev-only.
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create src/lib/dev-guard.ts + fill Plan-01 test scaffold</name>
  <files>
    src/lib/dev-guard.ts,
    src/lib/__tests__/dev-guard.test.ts
  </files>
  <read_first>
    src/lib/paid-route-guard.ts (lines 1-30 — analog: guard-helper module with clear single-purpose API),
    src/lib/__tests__/hash-user.test.ts (Template A — small pure-function suite, env-var manipulation in afterEach pattern),
    .planning/phases/03-authoring-throughput/03-PATTERNS.md §src/lib/dev-guard.ts (header + function bodies verbatim),
    .planning/phases/03-authoring-throughput/03-PATTERNS.md §src/lib/__tests__/dev-guard.test.ts (test body verbatim),
    .planning/phases/03-authoring-throughput/03-CONTEXT.md §D-15 (rationale: both /author/page.tsx and preview-bake.ts call same module),
    src/lib/__tests__/dev-guard.test.ts (Wave 0 scaffold from Plan 01 — `it.todo` markers to replace).
  </read_first>
  <behavior>
    - Test 1: `process.env.NODE_ENV = "development"` → `isDev()` returns `true`.
    - Test 2: `process.env.NODE_ENV = "test"` → `isDev()` returns `true`.
    - Test 3: `process.env.NODE_ENV = undefined` → `isDev()` returns `true` (non-production default).
    - Test 4: `process.env.NODE_ENV = "production"` → `isDev()` returns `false`.
    - Test 5: `process.env.NODE_ENV = "production"` → `assertDevOnly()` throws an Error whose message matches `/DEV-GUARD/` AND contains `NODE_ENV=production`.
    - Test 6: `process.env.NODE_ENV = "development"` → `assertDevOnly()` does not throw.
    - Test 7: `process.env.NODE_ENV = undefined` → `assertDevOnly()` does not throw.
    - Test 8: `process.env.NODE_ENV = "test"` → `assertDevOnly()` does not throw.
    - Setup: save `const savedEnv = process.env.NODE_ENV` at describe scope; restore in `afterEach` so tests don't leak state into siblings.
  </behavior>
  <action>
Create `src/lib/dev-guard.ts` with this exact content:

```typescript
/**
 * dev-guard.ts — shared dev-only guard (AUTHOR D-15).
 *
 * Single source of truth for "this code only runs in local development."
 * Both src/app/author/page.tsx (Ritual Author tool) and
 * scripts/preview-bake.ts (Phase 3 cache-scrubber server) call into this
 * module before exposing any editor or cache surface. Extracted from what
 * used to be an inline process.env.NODE_ENV check in /author/page.tsx:220.
 *
 * Two flavors so the call site can pick the ergonomics it needs:
 *   - isDev()         — boolean, non-throwing; React components use this
 *                       to render a "tool disabled" banner gracefully.
 *   - assertDevOnly() — throwing; Node scripts call this at module load
 *                       so a production invocation fails fast instead of
 *                       silently serving dev surface.
 *
 * No dependencies, no module state. Pure stdlib.
 */

/** Returns true when NODE_ENV is not "production" (dev, test, or unset). */
export function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

/** Throw if running in production. Safe to call at module load time. */
export function assertDevOnly(): void {
  if (!isDev()) {
    throw new Error(
      "[DEV-GUARD] refusing to run in production (NODE_ENV=production). " +
        "This module is dev-only.",
    );
  }
}
```

Fill in `src/lib/__tests__/dev-guard.test.ts` (replacing the Plan-01 `it.todo` stubs). Keep the `@vitest-environment node` pragma the scaffold already has:

```typescript
// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { isDev, assertDevOnly } from "../dev-guard";

describe("dev-guard (D-15)", () => {
  const savedEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = savedEnv;
  });

  describe("isDev()", () => {
    it("returns true in development", () => {
      process.env.NODE_ENV = "development";
      expect(isDev()).toBe(true);
    });
    it("returns true in test", () => {
      process.env.NODE_ENV = "test";
      expect(isDev()).toBe(true);
    });
    it("returns true when NODE_ENV is unset", () => {
      delete process.env.NODE_ENV;
      expect(isDev()).toBe(true);
    });
    it("returns false in production", () => {
      process.env.NODE_ENV = "production";
      expect(isDev()).toBe(false);
    });
  });

  describe("assertDevOnly()", () => {
    it("throws Error with [DEV-GUARD] prefix in production", () => {
      process.env.NODE_ENV = "production";
      expect(() => assertDevOnly()).toThrow(/DEV-GUARD/);
      expect(() => assertDevOnly()).toThrow(/NODE_ENV=production/);
    });
    it("does not throw in development", () => {
      process.env.NODE_ENV = "development";
      expect(() => assertDevOnly()).not.toThrow();
    });
    it("does not throw in test", () => {
      process.env.NODE_ENV = "test";
      expect(() => assertDevOnly()).not.toThrow();
    });
    it("does not throw when NODE_ENV is unset", () => {
      delete process.env.NODE_ENV;
      expect(() => assertDevOnly()).not.toThrow();
    });
  });
});
```

Commit: `author-08: extract dev-guard.ts shared dev-only guard (D-15)`
  </action>
  <verify>
    <automated>npx vitest run --no-coverage src/lib/__tests__/dev-guard.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `src/lib/dev-guard.ts` exists and contains both `export function isDev` and `export function assertDevOnly` — verified: `grep -cE "^export function (isDev|assertDevOnly)" src/lib/dev-guard.ts` returns 2.
    - Error message shape: `grep "\\[DEV-GUARD\\]" src/lib/dev-guard.ts` returns ≥ 1 match.
    - Test file has no `.todo` markers remaining: `grep -c "it.todo(" src/lib/__tests__/dev-guard.test.ts` returns 0.
    - `npx vitest run --no-coverage src/lib/__tests__/dev-guard.test.ts` exits 0 with 8 tests passing (4 isDev + 4 assertDevOnly).
    - `npm run build` exits 0.
    - No module-level `process.env` read at import time (the functions read it at call time): `grep -n "process.env.NODE_ENV" src/lib/dev-guard.ts` returns only line(s) inside function bodies, not at module top-level.
  </acceptance_criteria>
  <done>
    `dev-guard.ts` ships with two complementary functions; unit tests cover all four NODE_ENV states for both; Phase 3 Plan 08 (preview-bake) has an `assertDevOnly` to call at module load.
  </done>
</task>

<task type="auto">
  <name>Task 2: Refactor src/app/author/page.tsx to use isDev()</name>
  <files>
    src/app/author/page.tsx
  </files>
  <read_first>
    src/app/author/page.tsx (lines 1-30 for import-ordering reference; lines 200-235 for the exact block being replaced),
    src/lib/dev-guard.ts (Task 1 output — confirm the import path `@/lib/dev-guard` resolves in this Next app),
    .planning/phases/03-authoring-throughput/03-PATTERNS.md §src/app/author/page.tsx (exact line replacement).
  </read_first>
  <action>
Edit `src/app/author/page.tsx`:

**Step 1 — add the import.** At the top of the file, in the existing import block, add:

```typescript
import { isDev } from "@/lib/dev-guard";
```

Place it alphabetically among the other `@/lib/...` imports. If no such aliased imports exist (relative imports only), match the existing style: use `../../lib/dev-guard` instead. Verify whether `@/` aliases work in this file by grepping the first 30 lines for `from "@/"` — if any are present, use `@/lib/dev-guard`; otherwise fall back to a relative path matching existing imports.

**Step 2 — replace the inline guard.** Locate the block at lines 220-233:

```typescript
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction) {
    return (
      <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-6 text-red-200">
        <h1 className="text-xl font-semibold mb-2">Author tool disabled</h1>
        <p className="text-sm">
          The ritual review and correction tool only runs in local development.
          It edits plaintext ritual files on disk and is never served from a
          production build.
        </p>
      </div>
    );
  }
```

Replace with:

```typescript
  if (!isDev()) {
    return (
      <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-6 text-red-200">
        <h1 className="text-xl font-semibold mb-2">Author tool disabled</h1>
        <p className="text-sm">
          The ritual review and correction tool only runs in local development.
          It edits plaintext ritual files on disk and is never served from a
          production build.
        </p>
      </div>
    );
  }
```

**CRITICAL:** the JSX banner content (the `<div>`, `<h1>`, `<p>`) must be BYTE-FOR-BYTE identical to the current state. Only the `const isProduction = ...` line is removed and the `if (isProduction)` becomes `if (!isDev())`. Do not refactor the banner's className, whitespace, or text content.

**Step 3 — verify no stray references to the old variable.** Grep `src/app/author/page.tsx` for `isProduction` — MUST return 0 matches after edit.

**Step 4 — verify the import resolves.** Run `npm run build`. If it errors with "Cannot find module '@/lib/dev-guard'", fall back to a relative import (`../../lib/dev-guard`). Some Next configs don't have `@/` aliased for `src/app/*` files.

Commit: `author-08: wire /author/page.tsx to shared dev-guard (D-15)`
  </action>
  <verify>
    <automated>grep -c "isProduction" src/app/author/page.tsx | grep -q "^0$" && grep -c "isDev" src/app/author/page.tsx | grep -vE "^0$" && grep "Author tool disabled" src/app/author/page.tsx | wc -l | grep -q "^1$" && npm run build</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "isProduction" src/app/author/page.tsx` returns 0 (variable gone).
    - `grep "from .*dev-guard" src/app/author/page.tsx` returns ≥ 1 match (import added).
    - `grep "!isDev()" src/app/author/page.tsx` returns ≥ 1 match (conditional replaced).
    - The banner content is byte-identical: `grep "Author tool disabled" src/app/author/page.tsx | wc -l` returns 1.
    - `grep "The ritual review and correction tool only runs in local development" src/app/author/page.tsx | wc -l` returns 1.
    - `grep "It edits plaintext ritual files on disk" src/app/author/page.tsx | wc -l` returns 1.
    - `npm run build` exits 0 (Next.js build succeeds — import path resolves).
    - `npx vitest run --no-coverage` exits 0 (no regression; author-page unit tests if any, and full suite still green).
  </acceptance_criteria>
  <done>
    The inline NODE_ENV check is gone; `/author/page.tsx` now imports `isDev` from the shared dev-guard module; the "disabled" banner UX is byte-identical; Next build succeeds. Plan 08 (preview-bake.ts) has a working `assertDevOnly()` to call at module load.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Production deployment → /author route | if dev-guard fails, `/author` UI leaks into production and exposes authoring tooling to any user with a URL |
| Node process start → preview-bake.ts (Plan 08) | if `assertDevOnly` doesn't throw in production, the cache-scrubber server would serve unreleased ritual content to anyone who can reach 8883 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-02 | Information Disclosure | src/app/author/page.tsx in production | mitigate | D-15 `isDev()` guard in the component body; returns "Author tool disabled" banner when NODE_ENV === "production". Test file covers all 4 NODE_ENV states. Refactor preserves the banner byte-identical so grep-based prod-deployment smoke tests still match. |
| T-03-02b | Information Disclosure | scripts/preview-bake.ts served in production (Plan 08 consumer) | mitigate | `assertDevOnly()` throws at module load if NODE_ENV === "production"; Plan 08's module-level call means the process never gets far enough to `listen()`. Error message is searchable ([DEV-GUARD] prefix). |
| T-03-02c | Tampering | Future engineer deletes `isDev()` check "because the error message was ugly" | accept | Code-review + this plan's test file are the defense; no runtime-level enforcement possible for a line of source code. Branch-protection rules on main cover the PR-review gate. |
</threat_model>

<verification>
- `npx vitest run --no-coverage src/lib/__tests__/dev-guard.test.ts` — 8 tests pass.
- `npm run build` — Next build succeeds (import path resolves).
- `npx vitest run --no-coverage` (full suite) — no regression.
- `grep "isProduction" src/app/author/page.tsx` — 0 matches.
- `grep "Author tool disabled" src/app/author/page.tsx` — exactly 1 match (banner preserved).
- Banner visual check: in dev, `/author` still loads normally; a `NODE_ENV=production npm run build && npm start` deployment would show the banner (verified by build-time behavior; Shannon may sanity-check via local `NODE_ENV=production` env override run as a manual smoke check).
</verification>

<success_criteria>
- `src/lib/dev-guard.ts` exports `isDev()` and `assertDevOnly()`; both covered by 8 unit tests.
- `src/app/author/page.tsx` uses the shared `isDev()` instead of an inline `process.env.NODE_ENV === "production"` check.
- Banner JSX is byte-identical before/after.
- Full test suite green; Next build succeeds.
- Plan 08 (preview-bake.ts) has a ready-to-import `assertDevOnly()` for its module-load refusal gate.
</success_criteria>

<output>
After completion, create `.planning/phases/03-authoring-throughput/03-03-SUMMARY.md` documenting:
- File paths created/modified
- Final dev-guard.ts API surface (isDev + assertDevOnly)
- Test coverage result (8 passing tests)
- Confirmation that author/page.tsx banner is byte-identical
- Commit SHAs
</output>
