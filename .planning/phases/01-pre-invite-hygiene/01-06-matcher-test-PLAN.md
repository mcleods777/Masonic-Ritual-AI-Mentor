---
phase: 01-pre-invite-hygiene
plan: 02
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/__tests__/middleware.test.ts
autonomous: true
requirements: [HYGIENE-06]
must_haves:
  truths:
    - "A unit test exists that fails if any future edit removes `.mram` from the middleware matcher's extension alternation"
    - "The test covers representative lowercase .mram paths: flat, nested, hyphenated"
    - "The test runs in the existing vitest suite with zero config changes"
  artifacts:
    - path: "src/__tests__/middleware.test.ts"
      provides: "Regression guard for middleware matcher .mram exclusion"
      contains: "import { config } from"
      min_lines: 30
  key_links:
    - from: "src/__tests__/middleware.test.ts"
      to: "src/middleware.ts config.matcher"
      via: "named import of config + new RegExp('^' + matcher + '$')"
      pattern: "import \\{ config \\} from"
---

<objective>
Create a regression test that locks in `.mram` exclusion from the Next.js middleware matcher. If a future edit to src/middleware.ts removes `mram` from the extension alternation, this test fails before the change can ship.

Purpose: HYGIENE-06 — encrypted ritual binaries served from /public/ must never pass through middleware (no auth, no CORS, no redirect). The current matcher already excludes them; this test is the insurance that future refactors cannot silently regress that invariant.
Output: One new test file at `src/__tests__/middleware.test.ts` that vitest auto-discovers.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/01-pre-invite-hygiene/01-CONTEXT.md
@.planning/phases/01-pre-invite-hygiene/01-RESEARCH.md
@.planning/phases/01-pre-invite-hygiene/01-PATTERNS.md
@.planning/phases/01-pre-invite-hygiene/01-VALIDATION.md
@src/middleware.ts
@src/lib/__tests__/rehearsal-decision.test.ts
@vitest.config.ts

<interfaces>
<!-- The named export this test imports and asserts against. -->

From src/middleware.ts (lines 125-136):
```typescript
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     *   - _next/static (build output)
     *   - _next/image (image optimization)
     *   - favicon, apple-touch icons, manifest icons
     *   - static files with extensions (.png, .jpg, .svg, .ico, .txt, .woff2, .mram, .webmanifest)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|apple-touch-icon|icon-|.*\\.(?:png|jpg|jpeg|svg|ico|txt|woff2|mram|webmanifest)).*)",
  ],
};
```

Analog test file pattern (src/lib/__tests__/rehearsal-decision.test.ts lines 1-7, 35-45):
```typescript
import { describe, it, expect } from "vitest";
import { decideLineAction, ... } from "../rehearsal-decision";

describe("decideLineAction — regression: ...", () => {
  // ...regression-intent comment explaining why this test exists...
  it("does NOT enter listening for a user-role row with empty text", () => {
    expect(...).toBe(...);
  });
});
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Write the middleware matcher regression test</name>
  <files>src/__tests__/middleware.test.ts</files>
  <read_first>
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/src/middleware.ts (lines 125-136 — exact matcher string to import)
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/src/lib/__tests__/rehearsal-decision.test.ts (pattern analog: pure-function vitest test, describe/it shape, regression-intent comments)
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-CONTEXT.md (D-10..D-13 — assertion matrix and scope)
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-RESEARCH.md (Pitfall 2 and Code Examples — case-sensitivity note, RegExp construction)
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-PATTERNS.md (section 1 — full import/structure pattern from rehearsal-decision.test.ts)
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/vitest.config.ts (confirm `src/**/*.test.{ts,tsx}` glob picks up src/__tests__/middleware.test.ts)
  </read_first>
  <behavior>
    - The test file imports `config` from `../middleware` (D-11: test at `src/__tests__/middleware.test.ts` — one step up from the test to the source).
    - Test 1: Compiles the matcher string via `new RegExp("^" + config.matcher[0] + "$")` and asserts the compiled regex does NOT match `/foo.mram` (per D-12 updated matrix).
    - Test 2: Asserts the regex does NOT match `/deeply/nested/path/ritual.mram` (nested .mram).
    - Test 3: Asserts the regex does NOT match `/ea-degree.mram` (hyphenated .mram).
    - Test 4: Asserts the regex does NOT match `/hyphen-name.mram` (hyphenated .mram second case per D-12 updated matrix).
    - Test 5 (sanity / positive control): asserts the regex DOES match a regular app path like `/practice` and an API path like `/api/tts/gemini` — ensures the matcher isn't vacuously empty.
    - Test 6 (bounds sanity): asserts other listed static extensions still excluded — `/logo.png` and `/manifest.webmanifest` both do NOT match.
    - The test does NOT assert uppercase `/FOO.MRAM`. Per D-12 (updated 2026-04-20 post-research), uppercase MRAM is out-of-scope for Phase 1 — the current matcher alternation is lowercase-only by design and app URLs are lowercase by convention. Pitfall 2 documents this explicitly.
  </behavior>
  <action>
    Create the file `src/__tests__/middleware.test.ts` (new — the directory `src/__tests__/` does not exist yet, create it). Note D-11 explicitly overrides the broader `src/lib/__tests__/` convention for this case: middleware.ts lives at `src/middleware.ts` so its test lives at `src/__tests__/middleware.test.ts`.

    Exact file contents:

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
     * See .planning/phases/01-pre-invite-hygiene/01-RESEARCH.md Pitfall 2 and
     * CONTEXT D-12 (updated 2026-04-20).
     */
    import { describe, it, expect } from "vitest";
    import { config } from "../middleware";

    describe("middleware matcher — .mram exclusion (HYGIENE-06)", () => {
      // The matcher is a single path-to-regexp string that uses only JS-RegExp-
      // compatible features (character classes, alternation, negative lookahead,
      // escaped dots). Next anchors matcher patterns implicitly at start/end;
      // we replicate that with ^/$ anchors for equivalent behavior in Node.
      const matcherString = config.matcher[0];
      const matcher = new RegExp("^" + matcherString + "$");

      it("does NOT match /foo.mram (flat)", () => {
        expect(matcher.test("/foo.mram")).toBe(false);
      });

      it("does NOT match /deeply/nested/path/ritual.mram (nested)", () => {
        expect(matcher.test("/deeply/nested/path/ritual.mram")).toBe(false);
      });

      it("does NOT match /ea-degree.mram (hyphenated)", () => {
        expect(matcher.test("/ea-degree.mram")).toBe(false);
      });

      it("does NOT match /hyphen-name.mram (hyphenated second case)", () => {
        expect(matcher.test("/hyphen-name.mram")).toBe(false);
      });

      // Sanity: the matcher MUST still match regular app paths, otherwise the
      // negative assertions above are vacuous.
      it("still matches regular app paths (/practice, /api/tts/gemini)", () => {
        expect(matcher.test("/practice")).toBe(true);
        expect(matcher.test("/api/tts/gemini")).toBe(true);
      });

      // Bounds: other listed static extensions remain excluded.
      it("still excludes other listed static extensions", () => {
        expect(matcher.test("/logo.png")).toBe(false);
        expect(matcher.test("/manifest.webmanifest")).toBe(false);
      });
    });
    ```

    Do NOT change vitest.config.ts (the glob `src/**/*.test.{ts,tsx}` already picks up `src/__tests__/middleware.test.ts`). Do NOT change src/middleware.ts (this plan is test-only; any change to middleware.ts is scope creep). Do NOT add a `@vitest-environment node` pragma — the default jsdom env is fine for this pure-logic test.
  </action>
  <verify>
    <automated>cd /home/mcleods777/Masonic-Ritual-AI-Mentor && npm run test:run -- src/__tests__/middleware.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `src/__tests__/middleware.test.ts` exists
    - `npm run test:run -- src/__tests__/middleware.test.ts` exits 0
    - The run reports exactly 6 passing `it()` cases for this file
    - grep `grep -E "import \\{ config \\} from \"../middleware\"" src/__tests__/middleware.test.ts` returns one match
    - grep `grep -c "\\.mram" src/__tests__/middleware.test.ts` returns ≥ 4 (one per path assertion)
    - grep `grep "FOO.MRAM\\|\\.MRAM" src/__tests__/middleware.test.ts` returns no matches (uppercase out of scope per D-12)
    - `npm run test:run` (full suite) exits 0 — new test does not break any existing test
  </acceptance_criteria>
  <done>middleware.test.ts exists, all 6 assertions pass, full suite green.</done>
</task>

<task type="auto">
  <name>Task 2: Commit HYGIENE-06 as a single atomic commit</name>
  <files>src/__tests__/middleware.test.ts</files>
  <read_first>
    - /home/mcleods777/Masonic-Ritual-AI-Mentor/.planning/phases/01-pre-invite-hygiene/01-CONTEXT.md (D-20 commit style)
  </read_first>
  <action>
    Run `npm run test:run` to confirm the whole suite is green, then commit per D-20:

    ```
    git add src/__tests__/middleware.test.ts
    git commit -m "hygiene-06: lock .mram exclusion in middleware matcher with regression test"
    ```

    Commit message is short, imperative, lowercase, prefixed with `hygiene-06:`. Do NOT add Co-Authored-By trailers.

    Do NOT include any other files (the `src/__tests__/` directory gets created implicitly by adding the file; no .gitkeep needed).
  </action>
  <verify>
    <automated>cd /home/mcleods777/Masonic-Ritual-AI-Mentor && git log -1 --format=%s | grep -E "^hygiene-06:" && git diff HEAD~1 --name-only</automated>
  </verify>
  <acceptance_criteria>
    - `git log -1 --format=%s` starts with `hygiene-06:`
    - `git diff HEAD~1 --name-only` lists exactly `src/__tests__/middleware.test.ts`
    - `npm run test:run` exits 0
    - `git status` shows working tree clean
  </acceptance_criteria>
  <done>One commit with the new test file; test suite green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Future code change → middleware matcher | A future refactor of src/middleware.ts edits `config.matcher` and accidentally drops the `.mram` exclusion, causing encrypted ritual binaries to be processed by middleware (auth redirect, CORS enforcement, etc.) which can break direct download or leak metadata |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-1-02 | Tampering (regression) / Information Disclosure | src/middleware.ts config.matcher | mitigate | Regression test compiles the matcher to a JS RegExp and asserts representative `.mram` paths do not match. Any future commit that removes `mram` from the extension alternation will fail this test in CI. Test is narrowly scoped to the invariant (D-13) — broader middleware-contract tests belong to Phase 2. |
</threat_model>

<verification>
Execute `npm run test:run` after the commit. Expected: full suite green, new file's 6 cases pass, no existing test broken.
</verification>

<success_criteria>
- `src/__tests__/middleware.test.ts` exists with 6 passing assertions
- Full test suite (`npm run test:run`) exits 0
- One commit `hygiene-06: ...` on main with exactly one file change
- No change to src/middleware.ts, vitest.config.ts, or any other file
</success_criteria>

<output>
After completion, create `.planning/phases/01-pre-invite-hygiene/01-06-matcher-test-SUMMARY.md` per template.
</output>
