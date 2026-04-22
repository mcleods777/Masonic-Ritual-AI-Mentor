# Phase 1: Pre-invite Hygiene - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-20
**Phase:** 01-pre-invite-hygiene
**Areas discussed:** Secret-rotation runbook, Noindex + landing.html audit, Middleware matcher test, Execution order + rollback

---

## Gray area selection

| Area | Offered | Selected |
|------|---------|----------|
| Secret-rotation runbook | ☐ | ✓ |
| Noindex + landing.html audit | ☐ | ✓ |
| Middleware matcher test | ☐ | ✓ |
| Execution order + rollback | ☐ | ✓ |

User selected all four presented areas. (A fifth and sixth — Package cleanup scope, HYGIENE-05 evidence format — were considered but pruned from the presentation in favor of the four highest-leverage gray areas.)

---

## Area 1: Secret-rotation runbook (HYGIENE-07)

### Q1: Which secrets does the rotation runbook cover?

| Option | Description | Selected |
|--------|-------------|----------|
| RITUAL_CLIENT_SECRET only | The requirement names this one specifically. Scoped. | |
| RITUAL_CLIENT_SECRET + JWT_SECRET | Both gate auth. JWT rotation invalidates live sessions — expected signal. | ✓ |
| All env-driven secrets | Shared secret + JWT + upstream API keys. Broad. | |

**User's choice:** RITUAL_CLIENT_SECRET + JWT_SECRET
**Notes:** Runbook must explicitly call out that JWT rotation bounces every live session cookie — expected, not a bug.

### Q2: Where does the runbook live?

| Option | Description | Selected |
|--------|-------------|----------|
| docs/SECRET-ROTATION.md | Matches existing docs/ convention. | |
| New docs/runbooks/ folder | Signals "ops procedure" distinct from how-to guides. Scales. | ✓ |
| Inline in .planning/ | Treat as planning artifact. | |

**User's choice:** New docs/runbooks/ folder
**Notes:** New folder. Future ops runbooks (kill switch in Phase 2, revocation in Phase 6) will live here.

### Q3: What does "rehearsed in staging" mean in practice?

| Option | Description | Selected |
|--------|-------------|----------|
| Vercel preview deploy rotation | Full runbook against a preview env with its own secrets. | ✓ |
| Table-top walkthrough | Read aloud, no real rotation. | |
| Dry-run against production | Rotate live at quiet hour, rollback ready. | |

**User's choice:** Vercel preview deploy rotation
**Notes:** End-to-end execution against preview — closest to prod without user risk.

### Q4: What form does the runbook take?

| Option | Description | Selected |
|--------|-------------|----------|
| Markdown checklist only | Cheapest, easy to update. | ✓ |
| Markdown + helper script | Automates mechanical steps. | |
| Markdown + automated test | Verifies rotation took effect. | |

**User's choice:** Markdown checklist only
**Notes:** Keep ceremony minimal. Revisit if rotation cadence grows.

---

## Area 2: Noindex + landing.html audit (HYGIENE-03, HYGIENE-04)

### Q1: Where does X-Robots-Tag: noindex get set for app routes?

| Option | Description | Selected |
|--------|-------------|----------|
| next.config.ts headers() | Add to SECURITY_HEADERS, one line, covers every route. | ✓ |
| src/middleware.ts | Set in middleware. Mixes SEO into auth code. | |
| Meta tag in src/app/layout.tsx | Only covers HTML routes. | |

**User's choice:** next.config.ts headers()
**Notes:** Matches existing pattern for CSP / X-Frame-Options / Referrer-Policy.

### Q2: Does the static landing.html also need noindex coverage?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — meta tag in landing.html | public/* bypasses next.config headers(); inline meta is simplest. | ✓ |
| Yes — next.config rewrite/header rule for /landing.html | Central, but needs explicit source. | |
| No — leave landing.html indexable | v1 is invite-only; generic landing might be fine to find. | |

**User's choice:** Yes — meta tag in landing.html itself
**Notes:** Belt-and-suspenders on the one page search engines are most likely to reach.

### Q3: How do we audit landing.html for ritual text?

| Option | Description | Selected |
|--------|-------------|----------|
| Human read + grep against known terms | Two complementary passes. | ✓ |
| Human read only | Eyes-on review. | |
| Replace body entirely with minimal placeholder | Zero leak surface. | |

**User's choice:** Human read + grep against known terms
**Notes:** Officer role codes, obligation-language words, cipher-style punctuation patterns in the grep list.

### Q4: What's the target state of landing.html after audit?

| Option | Description | Selected |
|--------|-------------|----------|
| Keep current copy, redact only flagged text | Preserve marketing/aesthetic if nothing ritual-specific. | ✓ |
| Shrink to minimal invite-only splash | Most conservative. | |
| Add a "contact Shannon" hook only | Middle ground. | |

**User's choice:** Keep current copy, redact only flagged text
**Notes:** Audit first; redact only what fires.

---

## Area 3: Middleware matcher regression test (HYGIENE-06)

### Q1: What kind of test guards the .mram exclusion?

| Option | Description | Selected |
|--------|-------------|----------|
| Unit test against the matcher regex | Import config.matcher, compile to JS regex, assert no match. | ✓ |
| Integration test via Next.js test harness | Fetch /foo.mram, assert no auth redirect. | |
| Both — unit + integration | Belt and suspenders. | |

**User's choice:** Unit test against the matcher regex
**Notes:** Fast, deterministic, no Next.js runtime. Runs on every `npm test`.

### Q2: Where does the test file live?

| Option | Description | Selected |
|--------|-------------|----------|
| src/middleware.test.ts | Co-located with middleware.ts. Matches vitest convention. | ✓ |
| tests/middleware.test.ts (new top-level) | Cleaner src/ tree; needs vitest config changes. | |
| src/lib/__tests__/middleware.test.ts | __tests__ subfolder; not currently used. | |

**User's choice:** src/middleware.test.ts
**Notes:** Co-located, matches repo convention.

### Q3: What does the test assert?

| Option | Description | Selected |
|--------|-------------|----------|
| Matcher excludes .mram, representative path matrix | /foo.mram, nested, hyphen, uppercase. | ✓ |
| Single path only (/test.mram) | One assertion. Misses edge cases. | |
| Representative paths + guard against new auth paths | Scan codebase for new route.ts gating .mram. | |

**User's choice:** Matcher excludes .mram and tests representative paths
**Notes:** Small matrix catches narrow-regex regressions.

### Q4: Test file scope — just this invariant, or broader middleware contract?

| Option | Description | Selected |
|--------|-------------|----------|
| Just the .mram invariant | Narrow, focused, one-purpose file. | ✓ |
| Broader middleware contract tests | Also test CORS, public paths, redirects. | |

**User's choice:** Just the .mram invariant
**Notes:** Broader middleware tests deferred (noted in deferred ideas).

---

## Area 4: Execution order + rollback

### Q1: In what order should the 7 HYGIENE tasks execute?

| Option | Description | Selected |
|--------|-------------|----------|
| Safe-first, risky pair last | 03 → 06 → 04 → 07 → 05 → 02 → 01 | ✓ |
| Codemod first, cleanup, then safe tasks | Risky pair up front. | |
| Parallel where possible | Independents in parallel, 02+01 sequential after. | |

**User's choice:** Safe-first, risky pair last
**Notes:** Six green commits banked before HYGIENE-02/01 (the only tasks that can break the build).

### Q2: Commit granularity within Phase 1?

| Option | Description | Selected |
|--------|-------------|----------|
| One commit per HYGIENE-XX | Seven atomic commits; clean per-task revert. | ✓ |
| One commit per logical unit | Grouped commits. | |
| Single squash at phase end | One commit. Worst for bisect. | |

**User's choice:** One commit per HYGIENE-XX
**Notes:** Messages tagged with requirement ID, short imperative lowercase per repo style.

### Q3: If the AI SDK v6 codemod (HYGIENE-02) produces a broken build, what's the posture?

| Option | Description | Selected |
|--------|-------------|----------|
| Review diff, fix by hand, commit | Codemod edge cases are mechanical. | ✓ |
| Revert codemod, pin ai SDK version, defer v6 to Phase 5 | Phase 5 re-does this region. | |
| Revert and hand-port the 1–2 call sites | ai SDK only in api/rehearsal-feedback today. | |

**User's choice:** Review diff, fix by hand, commit
**Notes:** We want v6 idioms in tree now so Phase 5 isn't also paying migration tax.

### Q4: What's the "Phase 1 done" gate before moving to Phase 2?

| Option | Description | Selected |
|--------|-------------|----------|
| Build + test suite green + verification doc signed off | npm run build + npm test + 01-VERIFICATION.md entries. | ✓ |
| Build + test + deploy to preview | Also exercise noindex + magic-link on preview. | |
| Build + test + preview + 24h soak | Paranoid; probably overkill. | |

**User's choice:** Build + test suite green + verification doc signed off
**Notes:** 01-VERIFICATION.md has a one-line evidence entry per HYGIENE-XX including Shannon's iPhone check.

---

## Claude's Discretion

- Exact regex content for the ritual-term blocklist (D-08). Shannon reviews before grep runs against landing.html.
- Exact Vercel CLI command sequence in the rotation runbook (D-05). Validated during preview-deploy rehearsal.
- `X-Robots-Tag: noindex` vs `noindex, nofollow` (D-06). Defaulted to `noindex, nofollow`.

## Deferred Ideas

- Broader middleware-contract test suite — revisit in Phase 2 when SAFETY-09 adds route-level JWT checks.
- Production rotation execution — runbook exists in Phase 1; actual rotation is out of scope.
- CI "banned dependencies" check — grep-on-PR covers it manually for v1.
- `@ai-sdk/anthropic` / `ai` package removal — retained for Phase 5 COACH-02.
- Rewriting `/api/rehearsal-feedback` to AI SDK v6 `generateObject` — that's COACH-02 in Phase 5, not Phase 1.
