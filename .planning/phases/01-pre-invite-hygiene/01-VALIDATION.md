---
phase: 1
slug: pre-invite-hygiene
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-20
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Phase 1 is primarily hygiene and cleanup — only one new automated test (HYGIENE-06). Manual verifications are explicit (Shannon iPhone, runbook rehearsal, landing audit).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.2 + jsdom 29.0.1 |
| **Config file** | `vitest.config.ts` (existing — no change) |
| **Quick run command** | `npm run test:run` |
| **Full suite command** | `npm run test:run` |
| **Estimated runtime** | ~5 seconds |

Watch mode (`npm test`) is available for local dev but not used as the phase gate. `test:run` is the canonical non-watch invocation and is the only command the gate runs.

---

## Sampling Rate

- **After every task commit:** Run `npm run test:run`
- **After every plan wave:** Run `npm run build && npm run test:run`
- **Before `/gsd-verify-work`:** `npm run build && npm run test:run` must be green + VERIFICATION.md evidence entries must exist for all seven HYGIENE-XX requirements
- **Max feedback latency:** 60 seconds (build + test combined; vitest is ~5s, Next build is ~30-45s)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-03-01 | 03 | 1 | HYGIENE-03 | T-1-01 (info disclosure: search indexing) | `X-Robots-Tag: noindex, nofollow` in every app-route response header | build + manual curl | `npm run build` + `curl -I https://<preview>.vercel.app/ \| grep -i x-robots-tag` | ✅ (existing build) / ❌ curl = manual | ⬜ pending |
| 1-06-01 | 06 | 1 | HYGIENE-06 | T-1-02 (private ritual content behind middleware) | `.mram` paths do not match middleware matcher regex | unit | `npm run test:run src/middleware.test.ts` | ❌ Wave 0 — this task creates the test file | ⬜ pending |
| 1-04-01 | 04 | 1 | HYGIENE-04 | T-1-03 (ritual text leakage on static landing page) | `public/landing.html` contains no ritual text; inline noindex meta present | manual (human read + grep blocklist) | Grep blocklist against `public/landing.html`; expected zero matches | ❌ manual | ⬜ pending |
| 1-07-01 | 07 | 1 | HYGIENE-07 | T-1-04 (shared-secret exfiltration without rotation playbook) | `docs/runbooks/SECRET-ROTATION.md` exists; rehearsed on preview deploy; preview app still works after rotation | manual (runbook rehearsal on preview) | Follow runbook end-to-end on a Vercel preview deploy; record outcome in VERIFICATION.md | ❌ manual | ⬜ pending |
| 1-05-01 | 05 | 1 | HYGIENE-05 | T-1-05 (magic-link regression on real-world mobile Safari + Private Relay) | Magic-link request → email receipt → tap → authenticated session, all on iPhone with iCloud Private Relay enabled | manual (Shannon device test) | None — Shannon signs off with timestamped evidence in VERIFICATION.md | ❌ manual | ⬜ pending |
| 1-02-01 | 02 | 1 | HYGIENE-02 | T-1-06 (codemod break hidden behind green build) | `npm run build` and `npm run test:run` both pass after `@ai-sdk/codemod` run; `package.json` reflects v6 versions | smoke | `npm run build && npm run test:run && node -e "const p=require('./package.json'); process.exit(p.dependencies.ai.startsWith('^6.')?0:1)"` | ✅ (existing build + test) | ⬜ pending |
| 1-01-01 | 01 | 1 | HYGIENE-01 | T-1-07 (orphan packages bloating install surface) | `natural`, `uuid`, `@ai-sdk/react`, `@types/uuid` absent from `package.json` dependencies and devDependencies | smoke | `npm ls natural uuid @ai-sdk/react @types/uuid 2>&1 \| grep -E "(empty\|missing)"` + `npm run build && npm run test:run` | ✅ (existing build + test) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Sampling continuity note:** Tasks 1-03, 1-04, 1-05, 1-07 are all manual. This is 4 consecutive manual tasks — outside Nyquist's "no 3 consecutive tasks without automated verify" rule. Phase 1 is a hygiene phase where manual checks are appropriate (human audit of landing.html, human iPhone test, human rehearsal of a runbook). Automated surrogates are not feasible without inventing scope (e.g., Playwright for the iPhone test). This is a documented accepted gap — see Validation Sign-Off below.

---

## Wave 0 Requirements

- [ ] `src/middleware.test.ts` — created inside task 1-06-01 (HYGIENE-06), no separate Wave 0 task needed
- [ ] No `conftest` / shared-fixture equivalent needed — vitest auto-discovers; the single new test has no shared state
- [ ] No framework install needed — vitest 4.1.2 already in devDependencies

*No Wave 0 preamble tasks required. HYGIENE-06 creates its own test file inline.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `X-Robots-Tag` appears in real response headers on a deployed preview | HYGIENE-03 | No automated HTTP-level integration test exists in repo today; adding one is scope creep | After deploy to preview: `curl -I https://<preview-url>.vercel.app/` — expect `x-robots-tag: noindex, nofollow` |
| `public/landing.html` contains no ritual text | HYGIENE-04 | Ritual-term blocklist requires human judgment for false positives; codifying a full blocklist would itself leak ritual vocabulary | Human read of all 622 lines + grep against blocklist regex; evidence = short note in VERIFICATION.md |
| Magic-link flow works on iPhone + iCloud Private Relay | HYGIENE-05 | Requires real device with Private Relay enabled; Shannon personally | Request magic-link email from iPhone → open in Mail → tap link → land in authenticated app. Evidence = timestamped line in VERIFICATION.md |
| Secret-rotation runbook executes cleanly end-to-end | HYGIENE-07 | Exercises real Vercel CLI against a real preview deploy; outcome is "did it work?" not "did tests pass?" | Shannon runs the runbook on a fresh preview deploy, notes any step that required deviation, updates runbook before committing |

*Manual verifications are tracked in `01-VERIFICATION.md` (created during execution), one line per requirement with date/time.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or acknowledged manual path (manual paths documented above)
- [ ] Sampling continuity: **ACCEPTED GAP** — Phase 1 has 4 consecutive manual-only tasks (1-03, 1-04, 1-05, 1-07). Automating these would require scope-creep (Playwright for device test, ritual-vocabulary-as-code for landing audit, Vercel CLI mocking for runbook rehearsal). Gap is explicit; v1 accepts manual verification for hygiene work.
- [x] Wave 0 covers all MISSING references — no Wave 0 tasks needed
- [x] No watch-mode flags in gate commands
- [x] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter — **pending**: flag stays `false` until all manual VERIFICATION.md entries are signed off

**Approval:** pending — will flip to `nyquist_compliant: true` and `wave_0_complete: true` when Phase 1 executes and VERIFICATION.md collects evidence for all seven HYGIENE-XX items.
