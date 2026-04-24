---
phase: 4
slug: content-coverage
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-23
---

# Phase 4 — Validation Strategy

> Per-phase validation contract. See `04-RESEARCH.md` §Validation Architecture for full scenario coverage.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x (already in project; configured via `vitest.config.ts`) |
| **Config file** | `vitest.config.ts` (already includes `scripts/**/*.test.{ts,tsx}` from Phase 3 Plan 01) |
| **Quick run command** | `npx vitest run --no-coverage` |
| **Full suite command** | `npm test` (runs full suite) |
| **Estimated runtime** | ~25s for full suite (517 tests baseline after Phase 3) |

Phase 4 will add ~20-30 tests for the verifier (`scripts/verify-mram.ts` extensions) and ~10 for the release gate (`scripts/verify-content.ts`). No new test framework.

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --no-coverage {touched_test_file}` (under 5s)
- **After every plan wave:** Run `npx vitest run --no-coverage` (full fast run, ~25s)
- **Before `/gsd-verify-work`:** Full suite green + `npm run verify-content` green (local-only)
- **Max feedback latency:** 30s

---

## Per-Task Verification Map

Filled in per plan during planning. Key engineering surfaces needing automated tests:

| Plan | Surface | Scenario | Automated Command |
|------|---------|----------|-------------------|
| 04-01 | `scripts/verify-mram.ts --check-audio-coverage` | Every parsed-dialogue line has an Opus blob in the .mram | `npx vitest run scripts/__tests__/verify-mram.test.ts` |
| 04-01 | `scripts/verify-mram.ts --check-audio-coverage` | Opus duration > 0.3s minimum sanity | same |
| 04-01 | `scripts/verify-mram.ts --check-audio-coverage` | Voice-cast drift: every Opus tagged with same model in metadata | same |
| 04-01 | `scripts/verify-content.ts` release gate | Exits non-zero if any rituals/*.mram fails --check-audio-coverage | `npx vitest run scripts/__tests__/verify-content.test.ts` |
| 04-01 | `scripts/verify-content.ts` release gate | Exits non-zero if any rituals/*-dialogue-cipher.md fails `validatePair` | same |
| 04-01 | `scripts/verify-content.ts` release gate | Exits 0 + prints coverage summary when all pass | same |
| 04-02 | Content checklist `.md` file | Markdown table parses, status values in {drafted, validated, baked, scrubbed, shipped} | `npx vitest run scripts/__tests__/content-checklist.test.ts` |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Extend existing `scripts/__tests__/` test scaffolding (no new config needed — vitest already covers `scripts/**/*.test.ts` from Phase 3)
- [ ] Add `scripts/__tests__/verify-mram.test.ts` (new, for --check-audio-coverage flag)
- [ ] Add `scripts/__tests__/verify-content.test.ts` (new, for release-gate logic)
- [ ] Add `scripts/__tests__/content-checklist.test.ts` (new, for checklist file shape validation)

Existing infrastructure covers everything else — no framework install needed.

---

## Manual-Only Verifications

Content-labor work is not unit-testable. These are human UAT items captured in the per-plan SUMMARY / per-ritual checklist entries:

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Plain/cipher dialogue reads coherently for a trained Mason | CONTENT-01..05 | Semantic judgment about ritual fidelity | Shannon reads through each dialogue file before `bake-all` |
| Per-line Opus pronounces correctly + no voice-cast-scene leak | CONTENT-01..05 | Audio quality judgment | Preview-bake scrub at `http://127.0.0.1:8883` after each bake |
| Installation ceremony voice cast feels right across roles | CONTENT-04 | Consistency judgment across long ritual | Shannon rehearses the full installation on his pilot deployment |
| Officer lecture cadence matches live delivery expectations | CONTENT-05 | Timing + oratorical judgment | Compare against a known-good recorded delivery if available |

---

## Notes

- **No CI coverage for content files:** `rituals/*.md` and `rituals/*.mram` are gitignored by design (copyright; see `.gitignore:110-115`). The release gate (`scripts/verify-content.ts`) is local-only. CI verifies only engineering code.
- **Nyquist discipline applies to engineering surfaces only.** Content-work (dialogue authoring, bake execution, audio scrubbing) is UAT-covered, not unit-tested.
