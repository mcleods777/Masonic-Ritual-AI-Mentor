---
phase: 3
slug: authoring-throughput
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-21
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing — detected in package.json) |
| **Config file** | vitest.config.ts (existing) |
| **Quick run command** | `npx vitest run --no-coverage <file>` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick command on affected test file
- **After every plan wave:** Run full suite
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

*Populated by planner per-task; every task gets a row with the commands that prove acceptance criteria.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD-by-planner | | | AUTHOR-XX | | | | | | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/__tests__/idb-schema.test.ts` — new test file, stubs for AUTHOR-10 (D-18 dual-open invariant)
- [ ] `src/lib/__tests__/author-validation.test.ts` — stubs for AUTHOR-05 (D-08 parity validator), extend if file already exists
- [ ] `scripts/__tests__/bake-all.test.ts` — new test file, stubs for AUTHOR-02 (orchestrator unit tests: --since path filtering, _RESUME.json format)
- [ ] `scripts/__tests__/preview-bake.test.ts` — new test file, stubs for AUTHOR-08 (dev-guard refusal, 127.0.0.1 bind)
- [ ] `src/lib/__tests__/dev-guard.test.ts` — new test file, stubs for D-15 (assertDevOnly behavior in production)
- [ ] `npm install fake-indexeddb@6.2.5 --save-dev` — dev-dependency for AUTHOR-10 test
- [ ] `npm install p-limit@7.3.0 --save` — runtime-dependency for AUTHOR-09
- [ ] `npm install music-metadata@11.12.3 --save` — runtime-dependency for AUTHOR-06 duration parsing

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Preview server audio scrub UX at localhost:8883 | AUTHOR-08 | Browser audio-element streaming + seek behavior; no automated E2E harness for Opus Range requests in Phase 3 | 1. Run `npx tsx scripts/preview-bake.ts`. 2. Open http://localhost:8883. 3. Select a ritual → select a line → click play. 4. Verify audio plays and seek bar scrubs smoothly. |
| Google Cloud TTS short-line timbre consistency (D-09) | AUTHOR-04 | Subjective voice-matching; A/B audible comparison only | Shannon listens to 3-5 short lines rendered via GOOGLE_ROLE_VOICES vs their Gemini counterparts; confirms voice register/age matches are tolerable. |
| Resume after mid-bake crash | AUTHOR-02 | Requires inducing crash mid-render; automated harness would need child_process.kill mid-HTTP-call | 1. Start `npx tsx scripts/bake-all.ts` on a fresh ritual. 2. Ctrl-C after 3-5 lines complete. 3. Re-run with `--resume`. 4. Verify completed lines skip, in-flight lines retry, ritual finishes cleanly, _RESUME.json is deleted. |
| `--verify-audio` Whisper round-trip accuracy | AUTHOR-07 | Network call + Whisper probabilistic output; not automatable without mocking Groq (which defeats the test) | Run `bake-all.ts --verify-audio` on 1 ritual; confirm diff report surfaces only plausible mis-transcriptions (<10% false-positive rate). |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (3 new test files + 3 npm installs)
- [ ] No watch-mode flags (use `vitest run`, not `vitest`)
- [ ] Feedback latency < 30s on quick command per-file
- [ ] `nyquist_compliant: true` set in frontmatter once planner populates the per-task map

**Approval:** pending
