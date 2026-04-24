---
phase: 03-authoring-throughput
reviewed: 2026-04-23T22:15:00Z
asvs_level: 1
threats_total: 28
threats_closed: 28
threats_open: 0
block_on: high
status: secured
---

# Phase 3: Security Audit — Initial Threat Register

**Scope:** 8 plans (03-01 through 03-08), threat models extracted from each PLAN.md
`<threat_model>` block. Mitigations verified against code state on
`gsd/phase-3-authoring-throughput` including the 7 `fix(03):` commits from the
code-review-fix pass (HI-01, HI-02, ME-01..05, landed 2026-04-23T21:40Z).

**Method:** Each threat classified by plan disposition (mitigate / accept / transfer).
`mitigate` threats grep-verified in cited files; `accept` threats verified in the
"Accepted Risks" log below. No implementation file was modified by this audit.

**Note on duplicate IDs:** Plans 03, 06, 07, 08 reference some of the same threat
IDs (e.g. T-03-04 appears in Plans 04, 06, 07 — each layer hardens the same
cipher/plain-drift mitigation at a different point in the pipeline). The register
below keeps every instance and suffixes with plan-qualifier where the same ID
means materially different things in different plans (e.g. T-03-08 in Plan 07 vs
T-03-08 in Plan 08).

## Threat Register

| Threat ID | Plan | Category | Component | Disposition | Status | Evidence |
|-----------|------|----------|-----------|-------------|--------|----------|
| T-03-INFRA-01 | 01 | Information Disclosure | `rituals/_bake-cache/` contents | mitigate | CLOSED | `.gitignore:72-73` (`rituals/_bake-cache/*` + `!rituals/_bake-cache/.gitignore`); `rituals/_bake-cache/.gitignore:3-4` (`*` / `!.gitignore`) |
| T-03-INFRA-02 | 01 | Tampering | new npm deps (p-limit, music-metadata, fake-indexeddb) | accept | CLOSED | See Accepted Risks §1 |
| T-03-INFRA-03 | 01 | Denial of Service | ESM-only deps break Next build | mitigate | CLOSED | `npx tsx` sanity check passed in Plan-01 SUMMARY; `npm run build` exits 0 in every downstream plan (01..08) |
| T-03-02-01 | 02 | Information Disclosure | FeedbackTrace interface grows PII keys | mitigate | CLOSED | `src/lib/idb-schema.ts:44-54` — only id/documentId/sectionId/lineId/variantId/promptHash/completionHash/timestamp/ratingSignal; type-level + runtime key-absence test at `src/lib/__tests__/idb-schema.test.ts` (5 passing tests) |
| T-03-02-02 | 02 | Tampering | schema drift between idb-schema.ts and consumer modules | mitigate | CLOSED | `src/lib/storage.ts` imports `openDB` from `./idb-schema` (grep returns 1 match); `src/lib/voice-storage.ts` same; 0 `indexedDB.open(` calls outside `idb-schema.ts:64` |
| T-03-02-03 | 02 | Denial of Service | v4→v5 upgrade corrupts existing user data | mitigate | CLOSED | `src/lib/idb-schema.ts:69-109` onupgradeneeded is purely additive (`if (!contains)` guards); `idb-schema.test.ts` "v4-on-disk opens as v5 without data loss" test passes (seeds v4 doc, upgrades, asserts readable) |
| T-03-02 (Plan 03) | 03 | Information Disclosure | /author page in production | mitigate | CLOSED | `src/app/author/page.tsx:30` imports `isDev`; line 221 `if (!isDev())` returns disabled banner; `src/lib/dev-guard.ts:21-23` `isDev()` returns `NODE_ENV !== "production"`; 8 passing tests in `src/lib/__tests__/dev-guard.test.ts` |
| T-03-02b | 03 | Information Disclosure | preview-bake.ts served in production | mitigate | CLOSED | `src/lib/dev-guard.ts:26-33` `assertDevOnly()` throws `[DEV-GUARD]`; `scripts/preview-bake.ts:33` imports + `:36` calls at module load |
| T-03-02c | 03 | Tampering | Future engineer deletes isDev() check | accept | CLOSED | See Accepted Risks §2 |
| T-03-04 (Plan 04) | 04 | Tampering | cipher/plain drift ships silently to invited users | mitigate | CLOSED | `src/lib/author-validation.ts:197-228` D-08 bake-band check emits `severity: "error"` + `kind: "ratio-outlier"` on word-ratio outside [0.5×, 2×]; 10 passing tests in `src/lib/__tests__/author-validation.test.ts` |
| T-03-04b (Plan 04) | 04 | Data Integrity | false-positive hard-fail on ultra-short ciphers | accept | CLOSED | See Accepted Risks §3 |
| T-03-04c | 04 | Confused Deputy | Plan 06/07 ignore severity="error" issues | mitigate | CLOSED | `scripts/lib/validate-or-fail.ts:46` filters `severity === "error"` and `process.exit(1)`; `scripts/bake-all.ts:48,218-225,377,387` calls shared gate; `scripts/build-mram-from-dialogue.ts:57,531` calls shared gate (HI-01 extraction) |
| T-03-05 (Plan 05) | 05 | Information Disclosure / Integrity | Cache poisoning via SHA collision / stale modelId | mitigate | CLOSED | `scripts/render-gemini-audio.ts:65` `CACHE_KEY_VERSION = "v3"`; `:690` computeCacheKey signature includes `modelId: string`; `:697` sha256 material includes `${modelId}` between voice and preamble; 13 passing tests in `scripts/__tests__/render-gemini-audio-cache.test.ts` |
| T-03-05b | 05 | Tampering | Malicious file dropped in `rituals/_bake-cache/` | accept | CLOSED | See Accepted Risks §4 |
| T-03-05c | 05 | Data Loss | Migration fs.cp copy fails mid-operation | mitigate | CLOSED | `scripts/render-gemini-audio.ts:92-121` — `migrationPromise` guard + COPY (not move) preserves OLD location; one-shot skip when NEW has any `.opus` (line 105 `hasAny` check); rollback is `rm -rf rituals/_bake-cache/*`; 6 migration tests passing (ME-01 made it re-entrant/concurrent-safe) |
| T-03-04 (Plan 06) | 06 | Tampering | validator hard-fail treated as advisory → corrupted .mram ships | mitigate | CLOSED | `scripts/build-mram-from-dialogue.ts:531` calls `validateOrFail(plainPath, cipherPath)` before passphrase prompt / API calls; shared with bake-all.ts via `scripts/lib/validate-or-fail.ts` (HI-01) |
| T-03-05 (Plan 06) | 06 | Information Disclosure | GOOGLE_CLOUD_TTS_API_KEY logged during error path | mitigate | CLOSED | `scripts/build-mram-from-dialogue.ts:184-190` redacts `?key=<value>` via `.replace(/[?&]key=[^&"'\s]*/g, "?key=REDACTED")` before throwing; body-slice capped at 500 chars |
| T-03-06 | 06 | Information Disclosure | --verify-audio sends ritual dialogue text to Groq Whisper | mitigate | CLOSED | Opt-in flag, default off (`scripts/build-mram-from-dialogue.ts:433` `rawArgs.includes("--verify-audio")`); documented in header JSDoc per D-11; existing Phase-2 provider (/api/transcribe); `api.groq.com/openai/v1/audio/transcriptions` call site at `:303` is gated by the flag |
| T-03-04b (Plan 06) | 06 | Tampering | voice-cast scene preamble leaks into short-line Google TTS | mitigate | CLOSED | `scripts/build-mram-from-dialogue.ts:157-190` googleTtsBakeCall body is strictly `{input: {text}, voice: {languageCode, name}, audioConfig: {audioEncoding: "OGG_OPUS"}}` — no preamble, no style, no voice-cast scene |
| T-03-10 | 06 | Tampering | partial _RESUME.json write → unreadable state file | mitigate | CLOSED | `scripts/lib/resume-state.ts:66-68` writes `{path}.{pid}.tmp` then `fs.renameSync` (POSIX-atomic within same dir); `readResumeState` returns null on schema divergence → orchestrator treats as "start fresh"; 7 passing tests in `scripts/__tests__/bake-helpers.test.ts` |
| T-03-04 (Plan 07) | 07 | Tampering | validator hard-fail treated as advisory | mitigate | CLOSED | `scripts/bake-all.ts:377,387` — every discovered ritual passes `validateOrFail(slug)` BEFORE any `bakeRitual()` spawn (belt-and-suspenders on top of Plan-06's in-process gate) |
| T-03-07 | 07 | Tampering | _RESUME.json points to stale line IDs after dialogue edit | mitigate | CLOSED | `scripts/bake-all.ts:409,430-440` — refuses resume when `priorState.ritual !== slug` with clear error message directing "rm _RESUME.json and start fresh"; dialogueChecksum primitive exported (line ~234) for future crash-resume guard |
| T-03-08 (Plan 07) | 07 | Denial of Service | --parallel 999 exhausts Gemini quota + memory | mitigate | CLOSED | `scripts/bake-all.ts:137` `clampParallel` clamps to [1, 16] with default 4; 9 passing test cases covering boundary + NaN + non-numeric in `scripts/__tests__/bake-all.test.ts` |
| T-03-09 | 07 | Information Disclosure | git diff output leaked to logs | accept | CLOSED | See Accepted Risks §5 |
| T-03-11 | 07 | Tampering | spawn argv shell-injection if ritual slug contains shell metachars | mitigate | CLOSED | `scripts/bake-all.ts:292` `spawn("npx", args, ...)` with `args` as `string[]` (declared at `:266`); ritual slugs come from regex `/-dialogue(-cipher)?\.md$/` — cannot contain shell metachars by construction; `buildMramSpawnArgs "passes args as separate argv elements"` test locks the contract |
| T-03-01 | 08 | Information Disclosure | Preview server binds to 0.0.0.0 → LAN exposure | mitigate | CLOSED | `scripts/preview-bake.ts:38` `BIND_HOST = "127.0.0.1"` hardcoded; `:51-61` `ensureLoopback(host)` throws on anything other than `127.0.0.1` / `::1`; `:390-393` runs the guard BEFORE `server.listen()` even when `PREVIEW_BAKE_HOST` env is set; 5 passing loopback-refusal tests |
| T-03-02 (Plan 08) | 08 | Information Disclosure | Preview server runs in production | mitigate | CLOSED | `scripts/preview-bake.ts:33,36` imports and calls `assertDevOnly()` at module load — process exits with `[DEV-GUARD]` before `server.listen()` ever reached |
| T-03-03 | 08 | Tampering | Path-traversal via `/a/../../../etc/passwd.opus` OR symlink-escape | mitigate | CLOSED | **Defense-in-depth 3 layers:** (1) URL regex `/^\/a\/([^/]+)\.opus$/` at `:96` disallows slashes in cacheKey position; (2) `CACHE_KEY_REGEX = /^[0-9a-f]{64}$/` at `:67` before `path.join`; (3) `resolved.startsWith(rootAbs + path.sep)` at `:128` AND `fs.realpathSync(resolved).startsWith(realRoot + path.sep)` at `:150-163` catches symlink-escape. 20 passing tests including symlink-escape fixture |
| T-03-08 (Plan 08) | 08 | Denial of Service | Large Range reads exhaust memory or disk I/O | accept | CLOSED | See Accepted Risks §6 |

**Total threats:** 28 (25 mitigate + 6 accept; Plan 03 T-03-02 / Plan 06 T-03-04 / Plan 07 T-03-04 are repeated instances of cross-plan references — counted separately because each plan claimed them as its own mitigation and each has a distinct code-site evidence pin).

## Closed Threats

### Mitigate (22 instances, all verified)

Each `mitigate` threat above has concrete file:line evidence. Highlights:

- **T-03-02 / T-03-02b / T-03-02 (Plan 08):** The shared `src/lib/dev-guard.ts`
  module is the single primitive for dev-only enforcement across three
  consumers — `src/app/author/page.tsx` (banner), `scripts/preview-bake.ts`
  (module-load throw), and any future Node script that needs `assertDevOnly()`.
  Banner JSX preserved byte-identical pre/post refactor per T-03-02c accept
  rationale (grep-based deploy smoke tests still fire).

- **T-03-04 (three instances):** Shared `scripts/lib/validate-or-fail.ts`
  (landed via HI-01 fix) is imported by both `scripts/bake-all.ts` (orchestrator
  pre-flight over every ritual) and `scripts/build-mram-from-dialogue.ts`
  (per-ritual sub-process). The orchestrator fails FAST — zero API spend on
  corrupted rituals. The per-process gate is belt-and-suspenders. No `--force`
  override in Phase 3 per CONTEXT D-08.

- **T-03-03 (preview-bake path traversal):** Three independent layers.
  The layer-2b `fs.realpathSync` containment check was added during Plan-08
  Task 2 (Rule 1 auto-fix) after the symlink-escape test surfaced a false-pass
  against a symlink planted inside cacheDir. Without layer 2b, a valid-hex
  filename inside cacheDir whose target is outside cacheDir would pass the
  `path.resolve`-based layer 2a check (path.resolve does not dereference
  symlinks). The realpath check catches it.

- **T-03-05 / T-03-05c (cache migration):** Post-fix, `migrationPromise`
  (ME-01) replaced the module-scoped `let migrationRan = false` with a memoized
  Promise — re-entrant and concurrent-safe. OLD location (~/.cache/...) is
  preserved for rollback; `rm -rf rituals/_bake-cache/*` resets the migration.

- **T-03-10 (_RESUME.json atomic writes):** `writeResumeStateAtomic` writes to
  `{path}.{pid}.tmp` then renames. `fs.renameSync` is atomic on POSIX within
  the same directory. `readResumeState` returns null on any schema divergence
  — orchestrator treats null as "start fresh", preserving forensic evidence
  rather than auto-deleting on corruption.

- **T-03-01 (preview-bake loopback):** Three-gate refusal: hardcoded default,
  `ensureLoopback` called on env-override, unit tests cover `0.0.0.0` /
  `192.168.1.5` / `::` all throwing.

- **T-03-11 (spawn argv shell-injection):** `spawn("npx", args, ...)` with
  `args` as an array (never a string). Combined with filesystem-derived ritual
  slugs (regex-matched `/-dialogue(-cipher)?\.md$/`), shell metachars cannot
  enter by construction.

All mitigate evidence is in the Threat Register table.

### Accept (6 instances, documented below)

## Accepted Risks

### §1 — T-03-INFRA-02 (Plan 01): npm supply-chain risk on new deps

**Threat:** p-limit, music-metadata, fake-indexeddb could ship malicious code.
**Rationale for accept:** All three are from well-known npm authors (Sindre
Sorhus, Borewit, dumbmatter), verified on npm registry 2026-04-21.
package-lock.json records integrity hashes. Solo-dev pilot, not a shared build
system — risk bounded by developer's review of install output.
**Owner:** Shannon (solo dev). **Review trigger:** any future `npm audit`
advisory on these three packages.

### §2 — T-03-02c (Plan 03): Future engineer deletes isDev() check

**Threat:** A future edit removes the dev-guard call.
**Rationale for accept:** No runtime enforcement possible for "a line of source
code still exists." Defenses are: (a) 8 unit tests in
`src/lib/__tests__/dev-guard.test.ts` catching behavior regression, (b) banner
JSX preserved byte-identical so prod-deployment grep smoke tests still match,
(c) code review + branch protection on `main`.
**Owner:** Shannon. **Review trigger:** future PRs touching `src/app/author/*`
or `src/lib/dev-guard.ts`.

### §3 — T-03-04b (Plan 04): False-positive hard-fail on legitimate ultra-short ciphers

**Threat:** D-08 band `[0.5×, 2×]` trips on `"B."` for `"Bone of my bone"` (ratio 4).
**Rationale for accept:** By design per CONTEXT.md §D-08. Shannon reviews
validator output and either (a) rewrites the cipher to stay in band (e.g. use
`"Bo."` for ratio 2 — pass), or (b) accepts the refusal and carries the line as
runtime TTS. No `--force` escape hatch in Phase 3.
**Owner:** Shannon. **Review trigger:** if validator refusal rate during Phase
4 content coverage exceeds Shannon's patience threshold.

### §4 — T-03-05b (Plan 05): Malicious file dropped in rituals/_bake-cache/

**Threat:** Attacker with disk-write access to the cache dir serves arbitrary
Opus bytes via the cache hit path.
**Rationale for accept:** At the point an attacker can write files into
`rituals/_bake-cache/`, they already own the dev machine — same threat surface
as any other source file. Not in Phase 3 scope. Phase 6 ADMIN-05 per-ritual
build hashes will provide end-to-end integrity for the invited-user-facing side.
**Owner:** Shannon. **Review trigger:** Phase 6 ADMIN-05.

### §5 — T-03-09 (Plan 07): git diff output leaked to logs

**Threat:** `git diff --name-only` output sent to developer stderr could
include fragments of ritual filenames.
**Rationale for accept:** Ritual slugs are filesystem-derived and already in
the git repo — nothing reveals private information. Output goes to developer's
stderr, not any network surface.
**Owner:** Shannon. **Review trigger:** none — structural accept.

### §6 — T-03-08 (Plan 08): Large Range reads on preview-bake exhaust memory/IO

**Threat:** Browser client requests huge Range, server streams large response.
**Rationale for accept:** Loopback-only server on Shannon's dev machine. Worst
case: Ctrl-C the server. No persistent state to corrupt. The LAN-exposure
(T-03-01) mitigation is the ceiling on who can send these requests.
**Owner:** Shannon. **Review trigger:** none — structural accept.

## Open Threats

None. All 28 threats in the Phase 3 threat register are CLOSED (22 mitigated
with file:line evidence + 6 accepted-and-documented).

## Audit Trail

| Date | Action | By | Threats Verified | Status |
|------|--------|----|--------|---------|
| 2026-04-23T22:15Z | Initial Phase 3 threat register + audit | gsd-secure-phase | 28 / 28 | secured |

Audit scope:
- All 8 PLAN.md `<threat_model>` blocks parsed.
- All 8 SUMMARY.md "Threat Model Mitigation Verification" sections cross-checked.
- Implementation state includes 7 `fix(03):` commits (HI-01, HI-02, ME-01..05)
  that landed 2026-04-23T21:40Z; mitigations verified against CURRENT code, not
  pre-fix state.
- No SUMMARY file raised a `## Threat Flags` section or flagged new attack
  surface during execution — no unregistered flags to log.
- No implementation file was modified by this audit.

## Notes

1. **No unregistered threat flags.** SUMMARY files 01..08 all carry a "Threat
   Model Mitigation Verification" section that references only the threat IDs
   already declared in their corresponding PLAN.md. No new attack surface was
   raised mid-execution.

2. **Cross-plan threat ID reuse is intentional.** Threat IDs like T-03-04 appear
   in Plans 04, 06, and 07 — each plan owns a different code-site mitigation of
   the same underlying concern (cipher/plain drift). The HI-01 fix explicitly
   unifies the gate primitive (`scripts/lib/validate-or-fail.ts`) but leaves the
   three call-sites (validator in Plan 04, pre-API in Plan 06's build-mram,
   pre-spawn in Plan 07's bake-all) as distinct defense layers.

3. **T-03-08 ID collision between Plans 07 and 08.** The ID `T-03-08` is reused
   across plans with DIFFERENT meanings: Plan 07 `T-03-08` = "--parallel 999
   quota DoS" (mitigate via clampParallel), Plan 08 `T-03-08` = "Large Range
   reads" (accept). I kept both as-is (plan-qualified) rather than renumbering
   — renaming is out of audit scope. Future phases should avoid this collision;
   phase-wide unique IDs would be cleaner.

4. **HI-01 fix validates the PLAN.md intent.** Plan 06's threat model cited
   "validator hard-fail treated as advisory" and Plan 07 cited the same, but
   the original code had two separate `validateOrFail` implementations in
   build-mram-from-dialogue.ts and bake-all.ts. The review-fix pass extracted a
   shared `scripts/lib/validate-or-fail.ts` — this is now the literal "single
   source of truth" the PLAN.md threat model claimed as the mitigation. Without
   HI-01 the mitigation was present-but-duplicated (a silent-drift risk); after
   HI-01 it's structurally unified.

5. **Layer-2b realpath containment (T-03-03) exists only because the Plan-08
   test suite caught it.** The PLAN.md text described layer 2 as
   `path.resolve(opusPath).startsWith(path.resolve(cacheDir) + path.sep)`.
   `path.resolve` does NOT dereference symlinks, so a symlink with a valid-hex
   name inside cacheDir pointing outside would have passed layer 2a. The
   symlink-escape test in `scripts/__tests__/preview-bake.test.ts` exposed this
   during Plan 08 Task 2; the Rule 1 auto-fix added `fs.realpathSync` as
   layer 2b. The mitigation in this audit reflects the ACTUAL three-layer
   defense, not the two-layer description in the PLAN.md text.

6. **ME-01 migration concurrency (T-03-05c) was materially strengthened.** The
   original `let migrationRan = false` module-scoped boolean was not safe
   against concurrent calls (two renderLineAudio invocations in parallel both
   pass the guard before either sets it, leading to racing `fs.cp` operations).
   The fix replaced the boolean with a memoized `migrationPromise` — both
   concurrent callers now await the same Promise. Tests remained green through
   the change; the mitigation is strictly stronger.
