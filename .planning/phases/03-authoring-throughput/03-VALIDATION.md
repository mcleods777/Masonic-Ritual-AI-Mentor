---
phase: 3
slug: authoring-throughput
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-01
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing project test runner) |
| **Config file** | vitest.config.ts (03-01 Task 1 extends include glob to `scripts/**/*.test.ts`) |
| **Quick run command** | `npx vitest run <targeted test file>` (per-task, see map) |
| **Full suite command** | `npm run test:run` |
| **Estimated runtime** | ~60 seconds (full suite); <30s per targeted file |

---

## Sampling Rate

- **After every task commit:** Run the task's targeted `<automated>` command (see map)
- **After every plan wave:** Run `npm run test:run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds per task (targeted runs); full suite reserved for wave gates

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | AUTHOR-01, AUTHOR-08 | — | Cache/audio artifacts cannot be committed to git | CLI | `node -e` deps check + `grep vitest.config.ts` + `git check-ignore rituals/_bake-cache/deadbeef.opus` | ✅ | ⬜ pending |
| 03-01-02 | 01 | 1 | AUTHOR-06 | — | N/A (pure math, no I/O) | unit | `npx vitest run scripts/__tests__/bake-math.test.ts` | ❌ W0 | ⬜ pending |
| 03-01-03 | 01 | 1 | AUTHOR-08 | T: prod exposure | Module throws when NODE_ENV=production | unit | `npx vitest run src/lib/__tests__/dev-guard.test.ts` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 2 | AUTHOR-01, AUTHOR-03 | — | modelId in cache key prevents tier collision; model chain regression-locked | unit | `npx vitest run scripts/__tests__/render-gemini-audio-cache.test.ts` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 2 | AUTHOR-01 | T: key leak in errors | `?key=...` redacted from error output; dry-run by default | CLI | `npx tsc --noEmit && npx tsx scripts/migrate-bake-cache.ts --help \| grep dry-run/--yes` | ✅ | ⬜ pending |
| 03-03-01 | 03 | 2 | AUTHOR-05 | — | Corrupted dialogue pair refused before any API call | unit | `npx vitest run src/lib/__tests__/author-validation.test.ts` | ❌ W0 | ⬜ pending |
| 03-03-02 | 03 | 2 | AUTHOR-05 | — | Shared gate cannot drift between bake call sites | unit | `npx vitest run scripts/__tests__/validate-or-fail.test.ts` | ❌ W0 | ⬜ pending |
| 03-04-01 | 04 | 2 | AUTHOR-10 | — | Guarded createObjectStore (6 contains() guards) | source+type | `npx tsc --noEmit && grep -c "objectStoreNames.contains" src/lib/idb-schema.ts` ≥6 | ✅ | ⬜ pending |
| 03-04-02 | 04 | 2 | AUTHOR-10 | — | Single DB_VERSION source of truth | targeted suite | `npx tsc --noEmit && ! grep DB_VERSION (non-idb-schema) && npx vitest run src/lib/__tests__/` | ✅ | ⬜ pending |
| 03-04-03 | 04 | 2 | AUTHOR-10 | — | Dual-open order-independence; v4→v5 data preserved | unit | `npx vitest run src/lib/__tests__/idb-schema.test.ts` | ❌ W0 | ⬜ pending |
| 03-05-01 | 05 | 2 | AUTHOR-04 | — | googleVoice sidecar pin round-trips | unit | `npx vitest run src/lib/__tests__/voice-cast.test.ts` | ❌ W0 | ⬜ pending |
| 03-05-02 | 05 | 2 | AUTHOR-04 | T: preamble spoken aloud | google-tts.ts never imports voice-cast preamble | unit+source | `npx vitest run scripts/__tests__/google-tts.test.ts && ! grep voice-cast scripts/lib/google-tts.ts` | ❌ W0 | ⬜ pending |
| 03-05-03 | 05 | 2 | AUTHOR-07 | — | STT round-trip helper verifies short-line audio | unit | `npx vitest run scripts/__tests__/stt-verify.test.ts` | ❌ W0 | ⬜ pending |
| 03-06-01 | 06 | 3 | AUTHOR-02, AUTHOR-09 | T: git-diff blindness | Content-hash manifest (no git calls) detects changes in gitignored files | unit+source | `npx vitest run scripts/__tests__/resume-state.test.ts scripts/__tests__/cache-manifest.test.ts && ! grep git cache-manifest.ts` | ❌ W0 | ⬜ pending |
| 03-06-02 | 06 | 3 | AUTHOR-02, AUTHOR-09 | — | `--resume` recovers after crash; parallelism clamped [1,16] | unit+CLI | `npx vitest run scripts/__tests__/bake-all.test.ts && npx tsx scripts/bake-all.ts --dry-run` | ❌ W0 | ⬜ pending |
| 03-07-01 | 07 | 3 | AUTHOR-08 | T: path traversal, symlink escape, LAN bind | 3-layer containment; loopback-only; dev-guard | source+type | `npx tsc --noEmit && grep assertDevOnly/realpathSync/8883 scripts/preview-bake.ts` | ✅ | ⬜ pending |
| 03-07-02 | 07 | 3 | AUTHOR-08 | T: same as 03-07-01 | 20-test containment/Range suite incl. no-`_INDEX.json` fallback | unit | `npx vitest run scripts/__tests__/preview-bake.test.ts` | ❌ W0 | ⬜ pending |
| 03-08-01 | 08 | 4 | AUTHOR-04 | — | No silent short-line drops (MIN_BAKE_LINE_CHARS hard-skip removed) | unit+source | `npx tsc --noEmit && ! grep MIN_BAKE_LINE_CHARS && npx vitest run scripts/__tests__/build-mram-short-line.test.ts` | ❌ W0 | ⬜ pending |
| 03-08-02 | 08 | 4 | AUTHOR-05, AUTHOR-06, AUTHOR-07 | — | Abort path never deletes cache entries | unit+source | `npx vitest run scripts/__tests__/build-mram-short-line.test.ts && ! grep deleteCacheEntry in handleAbort` | ❌ W0 | ⬜ pending |
| 03-08-03 | 08 | 4 | AUTHOR-01 (docs) | — | N/A (runbook) | source | `grep bake-all/_bake-cache/8883 docs/BAKE-WORKFLOW.md` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*File Exists: ✅ = target exists on main today; ❌ W0 = created by the task itself (test-with-implementation pattern)*

---

## Wave 0 Requirements

Existing vitest infrastructure covers the phase; no framework install needed. Test files marked ❌ W0 above are created inside their owning task (each task ships its implementation and test together), so no separate Wave 0 stub pass is required beyond 03-01 Task 1's vitest.config.ts include-glob extension, which must land before any `scripts/__tests__/` file can run.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Browser scrub of baked lines | AUTHOR-08 | Requires human listening judgment | Open scrub page against `localhost:8883`, audit baked lines before re-encrypting `.mram` |
| Single-line rebake < 1 min end-to-end | AUTHOR-01/02 | Needs `GOOGLE_GEMINI_API_KEY` (absent on this machine) + wall-clock timing | Edit one dialogue line, run bake, time it (deferred to phase HUMAN-UAT per 03-08 Task 3) |
| EA short-line backfill listen-through | AUTHOR-04 | Human audio-quality judgment | Bake an ultra-short line via the Google TTS path and listen (deferred to phase HUMAN-UAT) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (test-with-implementation pattern; no orphan stubs)
- [x] No watch-mode flags
- [x] Feedback latency < 30s per task (03-04 Task 2 narrowed to targeted suite per plan-check warning 2)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-02 (plan-check pass: 0 blockers; warnings 1–4 remediated)
