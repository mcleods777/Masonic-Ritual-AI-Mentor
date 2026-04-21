# Phase 1: Pre-invite Hygiene - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Clean up the app surface and toolchain so it is ready for outside lodge officers to see it for the first time. Seven ruthless, small-scope tasks (HYGIENE-01..07). No user-visible feature work, no architecture changes, no new runtime capability. The gate before Shannon can send an invitation without wincing.

**In scope:**
- Dead-package removal (HYGIENE-01)
- AI SDK v6 codemod migration (HYGIENE-02)
- App-wide `X-Robots-Tag: noindex` (HYGIENE-03) plus static landing.html noindex
- `public/landing.html` audit for ritual text (HYGIENE-04)
- End-to-end iPhone + iCloud Private Relay magic-link verification (HYGIENE-05)
- Regression test asserting `.mram` stays excluded from middleware matcher (HYGIENE-06)
- Written shared-secret rotation runbook, rehearsed against a Vercel preview deploy (HYGIENE-07)

**Out of scope (belongs to other phases):**
- Per-user rate limits, audit log, kill switch — Phase 2
- Bake cache, orchestrator — Phase 3
- Ritual content baking — Phase 4
- Feedback-LLM rewrite (which will re-run AI SDK v6 migration over its route) — Phase 5
- Admin dashboard, stateful revocation — Phase 6
- First-run walkthrough, mic check — Phase 7

</domain>

<decisions>
## Implementation Decisions

### Secret-rotation runbook (HYGIENE-07)
- **D-01:** The runbook covers rotation of **both `RITUAL_CLIENT_SECRET` and `JWT_SECRET`**, not just the shared secret. Both are authentication gates; a complete runbook must treat them together so Shannon never has a "what about the other one" pause during a real rotation.
- **D-02:** Rotating `JWT_SECRET` **invalidates every live 30-day `pilot-session` cookie** — the runbook must call this out explicitly as an *expected signal, not a bug*. Users will be bounced to `/signin` on their next request. Plan timing accordingly (quiet hours, out-of-band heads-up to the handful of invited lodges).
- **D-03:** Runbook location: `docs/runbooks/SECRET-ROTATION.md` — a **new `docs/runbooks/` folder**. Keeps ops procedures visually distinct from author how-tos (BAKE-WORKFLOW.md, INSTALL-GUIDE.md, NOTION-HOW-TO.md). Future phases (kill switch, revocation) will reuse this folder.
- **D-04:** Rehearsal method: **run the full runbook end-to-end against a Vercel preview deploy** that has its own `RITUAL_CLIENT_SECRET` and `JWT_SECRET` values. Shannon executes every step including env-var update and redeploy; notes any gaps in the runbook from the live execution. Not a table-top read-through, not a production dry-run.
- **D-05:** Runbook form: **Markdown checklist only**, no helper script, no automated test. Keep ceremony minimal; Vercel CLI commands go inline. A script becomes interesting only if Phase 2+ adds more rotation cadence.
- **D-05b (discovered by research, 2026-04-20):** The runbook must use `vercel env update <name> <environment>` (atomic) rather than `vercel env rm` followed by `vercel env add` (has a window where the env var is unset and requests fail). The `vercel env update` verb exists as a first-class CLI command. Also: the project's memory flags two pre-existing footguns the runbook must account for — (a) `vercel env add <NAME> preview` requires an explicit branch (not "all branches") in non-interactive use; (b) values piped via `vercel env add … --value < file` can capture trailing newlines that break auth headers. Runbook includes fixes for both.

### Noindex + landing.html (HYGIENE-03, HYGIENE-04)
- **D-06:** `X-Robots-Tag: noindex, nofollow` is added as a new entry in the existing `SECURITY_HEADERS` array inside `next.config.ts` under the `/:path*` source. Matches the established pattern for CSP, X-Frame-Options, Referrer-Policy. Covers every Next route (pages + API) with one line.
- **D-07:** `public/landing.html` is served statically and bypasses `next.config.ts` `headers()`, so it also gets an inline `<meta name="robots" content="noindex, nofollow">` tag in its `<head>`. Belt-and-suspenders for the one page a search engine is most likely to find.
- **D-08:** Landing.html audit method: **human read of all 622 lines + grep pass against a ritual-term blocklist** (officer role codes `WM`, `SW`, `JW`, `SD`, `JD`, `IG`, `Tyler`, obligation-language words, cipher-style punctuation patterns). Two complementary passes — eyes catch context, grep catches strings buried in canvas draw calls and JS string literals.
- **D-09:** Target state: **keep current marketing copy and redact only flagged content.** If the audit finds nothing ritual-specific, landing.html is untouched save the noindex meta tag. Do not pre-emptively shrink to a minimal splash.

### Middleware matcher regression test (HYGIENE-06)
- **D-10:** Test kind: **unit test** that imports `config.matcher` from `src/middleware.ts`, converts the PCRE-style pattern to a JS regex, and asserts it does not match representative `.mram` paths. No Next.js runtime, no dev server. Fast, deterministic, runs on every `npm test`.
- **D-11:** Test location: **`src/middleware.test.ts`** — co-located with `src/middleware.ts`. Matches this repo's existing vitest convention (tests next to source, no `__tests__/` folder).
- **D-12:** Assertion matrix: the test runs the compiled matcher against **a small representative path set** — `/foo.mram`, `/deeply/nested/path/ritual.mram`, `/ea-degree.mram`, `/hyphen-name.mram`. Each must not match. (Updated 2026-04-20 post-research: uppercase `/FOO.MRAM` was originally in the matrix but research revealed the current matcher regex is lowercase-only; uppercase `.MRAM` would actually fail to be excluded. App URLs are lowercase by convention, so the test stays on lowercase paths and does not guard against uppercase — out of scope for Phase 1.)
- **D-13:** File scope: **just this invariant.** One focused test file whose whole job is to fail if `.mram` is removed from the matcher exclusion. Broader middleware-contract tests (CORS on `/api/*`, `/signin` public, redirects work) are not pulled in here — they can land later if a separate phase needs them.

### Dead-package cleanup (HYGIENE-01)
- **D-14:** Remove exactly the four named packages: `natural`, `uuid`, `@ai-sdk/react`, `@types/uuid`. Do **not** remove `@ai-sdk/anthropic` or `ai` — those are retained for the Phase 5 feedback rewrite (COACH-02 explicitly rewrites `/api/rehearsal-feedback/route.ts` on the AI SDK v6 `generateObject` + AI Gateway pattern).
- **D-15:** Verification before `npm uninstall`: grep for `from "natural"`, `from "uuid"`, `from "@ai-sdk/react"` across `src/`, `scripts/`, `public/` to confirm no live imports. If grep finds anything, stop — either the removal list is wrong or the code needs adjustment first.

### AI SDK v6 codemod (HYGIENE-02)
- **D-16:** Run `npx @ai-sdk/codemod@3.0.4 v6 src/ scripts/` (version-pinned, correct subcommand, explicit source dirs — official canonical form per the v6 migration guide). Updated 2026-04-20 post-research: the original wording `npx @ai-sdk/codemod upgrade v6` was malformed (the `upgrade` subcommand silently ignores the trailing `v6` arg and runs all v4/v5/v6 codemods, not just v6). Verification: `npm run build` + `npm test`. If the codemod produces a broken build, **review the diff and fix by hand in the same commit** — do not revert and defer.
- **D-16b (discovered by research, 2026-04-20):** `grep -r "from ['\"]\\(ai\\|@ai-sdk/\\)" src/ scripts/` returns **zero matches** in the current codebase. The `ai` and `@ai-sdk/anthropic` packages are listed in `package.json` but have no imports. This means the codemod is effectively a **package.json version bump** — no source files change. Phase 5 (COACH-02) will be what actually exercises v6 idioms when `/api/rehearsal-feedback` is rewritten. Plan accordingly: HYGIENE-02 verification is "codemod ran clean, build + test green, package.json shows ai@^6 / @ai-sdk/anthropic@^3" — not "v6 idioms visible in source."
- **D-17:** The codemod runs **after** HYGIENE-01 dead-package removal, to reduce the surface area the codemod walks. (Given D-16b this is belt-and-suspenders; the codemod walks no source either way.)

### Magic-link iPhone verification (HYGIENE-05)
- **D-18:** Shannon personally signs in on an iPhone with iCloud Private Relay enabled. "Done" = one successful end-to-end magic-link round-trip (request email → tap link on phone → land in the app with a valid session cookie). Evidence goes into `01-VERIFICATION.md` as a one-line note with date/time.

### Execution order
- **D-19:** Task order: **03 noindex → 06 matcher test → 04 landing audit → 07 rotation runbook → 05 iPhone verify → 02 AI SDK codemod → 01 package cleanup.** Safe, narrow, low-risk wins land first; the HYGIENE-02/01 pair (the only tasks that can break the build) runs at the end when everything else is green. If the pair breaks, we've already banked six green commits.

### Commit strategy
- **D-20:** **One commit per HYGIENE-XX task.** Seven atomic commits. Each commit message is short, imperative, lowercase, tagged with the requirement ID (e.g., `hygiene-01: remove dead packages (natural, uuid, @ai-sdk/react, @types/uuid)`). Matches this repo's existing commit style and gives clean per-task revert targets.

### Phase-done gate
- **D-21:** Phase 1 is complete when: `npm run build` succeeds, `npm test` passes, `01-VERIFICATION.md` has an evidence entry for each of HYGIENE-01..07 (including Shannon's iPhone check). No preview-deploy soak, no 24h wait — standard pilot rigor.

### Claude's Discretion
- Grep patterns for the ritual-term blocklist in D-08: Claude picks the exact regex set (officer codes are well-defined; obligation-language terms vary). Shannon reviews the list before it runs against landing.html.
- Exact Vercel CLI commands in the rotation runbook (D-05): Claude writes; Shannon validates during the preview-deploy rehearsal (D-04). Any command that fails during rehearsal gets fixed in the runbook before Phase 1 closes.
- Choice of `X-Robots-Tag: noindex` vs `noindex, nofollow` in D-06: Claude defaults to `noindex, nofollow` to also block link-graph crawling of the landing page; flip if Shannon objects.

### Folded Todos
None — no pending todos from prior sessions matched Phase 1 scope.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase definition and requirements
- `.planning/ROADMAP.md` §Phase 1 — Phase goal, success criteria (6 items), dependencies
- `.planning/REQUIREMENTS.md` §Pre-invite Hygiene — HYGIENE-01..07 detailed requirements
- `.planning/PROJECT.md` — Project vision, v1 invite-only constraint, client-owned data plane invariant

### Codebase context (read before planning tests / edits)
- `.planning/codebase/ARCHITECTURE.md` §Middleware, §Security headers — current middleware structure and where security headers live
- `.planning/codebase/STACK.md` — dependency inventory (confirm dead-package status before removal)
- `.planning/codebase/CONVENTIONS.md` — existing test / commit / file-naming conventions

### Files that will be touched
- `src/middleware.ts` §config.matcher (line 125-136) — the matcher asserted by HYGIENE-06 test
- `next.config.ts` §SECURITY_HEADERS (line 29-35) — where HYGIENE-03 X-Robots-Tag gets added
- `public/landing.html` — HYGIENE-04 audit target, also gets HYGIENE-03 inline meta tag
- `package.json` — HYGIENE-01 removals, HYGIENE-02 codemod will also touch
- `docs/` — existing conventions for new `docs/runbooks/` folder (sibling to BAKE-WORKFLOW.md)

### External references
- Vercel AI SDK v6 upgrade docs: `npx @ai-sdk/codemod upgrade v6` — canonical procedure for HYGIENE-02
- Next.js middleware matcher syntax (app router) — for HYGIENE-06 regex compilation

### Existing memory / skills relevant to Phase 1
- `~/.claude/projects/-home-mcleods777-Masonic-Ritual-AI-Mentor/memory/` — hashed-user-id analytics pattern, vercel-env-newline-fix, vercel-cli-env-add-preview-branch-required (the latter two are immediately relevant to the HYGIENE-07 rotation runbook)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SECURITY_HEADERS` array in `next.config.ts:29-35` — HYGIENE-03 extends this by one entry. No structural change, just adding `{ key: "X-Robots-Tag", value: "noindex, nofollow" }`.
- `config.matcher` regex in `src/middleware.ts:134` — HYGIENE-06 test imports this directly. The `.mram` exclusion is already present (`|mram|` in the extension alternation); the test locks it in.
- `docs/` folder with existing `BAKE-WORKFLOW.md`, `INSTALL-GUIDE.md`, `NOTION-HOW-TO.md` — HYGIENE-07 rotation runbook joins this family under a new `docs/runbooks/` subfolder.

### Established Patterns
- **Vitest tests co-located with source.** Tests sit next to the file they test, not in a separate folder. `src/middleware.test.ts` follows this.
- **Security headers via next.config.ts `headers()` function.** Not middleware, not meta tags. HYGIENE-03 honors this.
- **Commit style:** short, imperative, lowercase. Recent examples: `docs: create roadmap ...`, `chore: add project config`. HYGIENE commits follow: `hygiene-01: remove dead packages ...`.
- **Public static assets bypass Next config headers().** Known constraint; informs the decision to add an inline `<meta>` to landing.html (D-07).

### Integration Points
- **HYGIENE-02 codemod** walks `src/` — HYGIENE-01 dead-package removal narrows that surface first (D-17).
- **HYGIENE-06 test** is the only new test file in Phase 1; it runs in the existing vitest config without any `vitest.config.ts` changes.
- **HYGIENE-07 rotation runbook** interacts with Vercel CLI env commands — memory notes flag `vercel-cli-env-add-preview-branch-required` and `vercel-env-newline-fix` as live footguns; runbook must account for both.

### Constraints Discovered
- `public/landing.html` is served outside Next's request pipeline — can't set headers via `next.config.ts` for it alone without rewrite rules. Inline meta tag is simpler and safer (D-07).
- The AI SDK codemod may try to migrate `@ai-sdk/react` imports. Those imports appear to not exist in the current codebase (justifying HYGIENE-01's removal), but the grep verification in D-15 confirms before `npm uninstall` runs.

</code_context>

<specifics>
## Specific Ideas

- **Runbook structure:** checklist pattern resembling existing `docs/BAKE-WORKFLOW.md` — numbered steps, inline CLI commands, callout boxes for "expected behavior" / "if this fails, then X". Shannon is the only reader; no cross-team ceremony.
- **Rehearsal-first, not rotation-first:** HYGIENE-07 completes when the *rehearsal on preview succeeds* — production rotation itself is not in Phase 1 scope; the artifact is the rehearsed procedure, ready when Shannon wants to fire it.
- **Ritual-term grep list must not itself leak ritual text.** When Claude writes the blocklist regex for D-08, avoid checking in any phrase that is itself ritually significant. Prefer officer-code tokens and generic obligation-language words; a full ritual-phrase scanner would itself violate the client-only data plane.

</specifics>

<deferred>
## Deferred Ideas

- **Broader middleware-contract test suite** (CORS on `/api/*`, `/signin` public, `/api/auth/*` bypass, session-less redirect) — user picked narrow scope for HYGIENE-06. Revisit in Phase 2 (Safety Floor) when middleware gains JWT-on-route checks (SAFETY-09) and a broader test suite becomes load-bearing.
- **Production rotation of RITUAL_CLIENT_SECRET and JWT_SECRET** — runbook exists at end of Phase 1 but actual execution is deferred. Not a Phase 1 success criterion.
- **CI "banned dependencies" check** to fail builds if any of `natural`, `uuid`, `@ai-sdk/react`, `@types/uuid` are ever re-added — would be a nice defense-in-depth addition. Deferred; grep-on-PR can cover it manually for v1.
- **Rewriting `/api/rehearsal-feedback` to AI SDK v6 `generateObject` pattern** — this is COACH-02 in Phase 5. HYGIENE-02 codemod gets us to v6 idioms but does not restructure the route.
- **Removing `@ai-sdk/anthropic` and `ai` if they turn out to be fully unused** — kept because Phase 5 COACH-02 explicitly depends on them. Revisit if Phase 5 changes direction.

### Reviewed Todos (not folded)
None — no pending todos were relevant to this phase.

</deferred>

---

*Phase: 01-pre-invite-hygiene*
*Context gathered: 2026-04-20*
