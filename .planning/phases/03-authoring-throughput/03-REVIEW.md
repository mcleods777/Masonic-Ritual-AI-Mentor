---
phase: 03-authoring-throughput
reviewed: 2026-07-02T17:56:18Z
depth: standard
files_reviewed: 34
files_reviewed_list:
  - docs/BAKE-WORKFLOW.md
  - scripts/__tests__/bake-all.test.ts
  - scripts/__tests__/bake-math.test.ts
  - scripts/__tests__/build-mram-short-line.test.ts
  - scripts/__tests__/cache-manifest.test.ts
  - scripts/__tests__/google-tts.test.ts
  - scripts/__tests__/preview-bake.test.ts
  - scripts/__tests__/render-gemini-audio-cache.test.ts
  - scripts/__tests__/resume-state.test.ts
  - scripts/__tests__/stt-verify.test.ts
  - scripts/__tests__/validate-or-fail.test.ts
  - scripts/bake-all.ts
  - scripts/build-mram-from-dialogue.ts
  - scripts/invalidate-mram-cache.ts
  - scripts/lib/bake-math.ts
  - scripts/lib/cache-manifest.ts
  - scripts/lib/google-tts.ts
  - scripts/lib/resume-state.ts
  - scripts/lib/stt-verify.ts
  - scripts/lib/validate-or-fail.ts
  - scripts/list-ritual-lines.ts
  - scripts/migrate-bake-cache.ts
  - scripts/preview-bake.ts
  - scripts/render-gemini-audio.ts
  - src/lib/__tests__/author-validation.test.ts
  - src/lib/__tests__/dev-guard.test.ts
  - src/lib/__tests__/idb-schema.test.ts
  - src/lib/__tests__/voice-cast.test.ts
  - src/lib/author-validation.ts
  - src/lib/dev-guard.ts
  - src/lib/idb-schema.ts
  - src/lib/storage.ts
  - src/lib/voice-cast.ts
  - src/lib/voice-storage.ts
findings:
  critical: 3
  warning: 8
  info: 8
  total: 19
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-07-02T17:56:18Z
**Depth:** standard
**Files Reviewed:** 34
**Status:** issues_found

## Summary

Reviewed the Phase 3 authoring-throughput implementation: the `bake-all.ts` orchestrator, the short-line/gate pipeline in `build-mram-from-dialogue.ts`, six new `scripts/lib/` modules, the preview server, cache migration/invalidation tooling, the IDB schema extraction, and the accompanying test suites and workflow doc.

The library modules (`cache-manifest`, `resume-state`, `bake-math`, `stt-verify`, `validate-or-fail`, `voice-cast`, `idb-schema`) are solid, well-tested, and their atomic-write and validation contracts hold up under adversarial reading. `preview-bake.ts`'s three-layer path-containment defense is genuinely sound (regex gate, resolve containment, realpath symlink check — all tested, including a live symlink-escape test).

However, the **orchestrator's core interactive contract is broken**. Three critical findings cluster around `bake-all.ts` composing with `build-mram-from-dialogue.ts` under parallelism: (1) children spawned with inherited TTY stdin re-prompt for the passphrase instead of reading `MRAM_PASSPHRASE`, and with `--parallel > 1` multiple children read the same raw-mode TTY concurrently — keystrokes are distributed arbitrarily, so `.mram` files can be silently encrypted under garbled passphrases; (2) the parallel/interactive-fallback refusal (T-03-14) is skipped for the bare default invocation, which is exactly `parallel=4 + on-fallback=ask` — the forbidden combination runs by default; (3) `_INDEX.json` is a read-modify-write file written concurrently by all parallel children, so D-08 provenance entries are silently lost.

The warnings cover a tmp-file rename race in the render cache, a `--resume` state file that is never written on the interruption path it exists for, two functional defects in `invalidate-mram-cache.ts` (including its own documented usage failing to parse), median-pool pollution in the duration gate, a weaker-than-sibling API-key redaction, a first-use key-generation race in `storage.ts`, and a migration that produces dead cache entries for short lines while contradicting the workflow doc about the historical skip threshold.

## Critical Issues

### CR-01: Parallel children re-prompt for the passphrase on a shared raw-mode TTY — `.mram` files can be encrypted under a garbled passphrase

**File:** `scripts/build-mram-from-dialogue.ts:614-621`, `scripts/bake-all.ts:400-403` (also pre-existing in `scripts/bake-first-degree.ts:104-122`)
**Issue:** `bake-all.ts`'s documented contract is "passphrase prompted ONCE here, then passed to every child via the MRAM_PASSPHRASE env var." But the child's `promptPassphrase()` checks `process.stdin.isTTY` **first** and only consults `MRAM_PASSPHRASE` when stdin is *not* a TTY:

```ts
async function promptPassphrase(): Promise<string> {
  if (!process.stdin.isTTY) {
    const envPass = process.env.MRAM_PASSPHRASE;
    if (envPass) return envPass;
    ...
  }
  // TTY path: interactive raw-mode prompt — env var never consulted
```

`bake-all.ts` spawns children with `stdio: ["inherit", "inherit", "inherit"]`, so in any interactive run each child's stdin **is** a TTY and each child prompts again, ignoring the env var. At `--parallel 1` this means the parent's prompt is wasted and the user is re-prompted per ritual (contract violation, annoying). At `--parallel > 1` (the default is 4) it is destructive: multiple children put the same TTY into raw mode and read from it concurrently; keystrokes are delivered to whichever child reads first, so each child assembles an arbitrary substring of what the user types. There is no passphrase confirmation, so children proceed to encrypt `.mram` output files under garbled passphrases — the files are written "successfully" but can never be decrypted with the intended passphrase. That is silent data loss.
Note: the TTY-first ordering pre-exists at the diff base, but `bake-all.ts` (new this phase) is the first caller that fans out multiple TTY-inheriting children, converting a latent annoyance into a corruption path. The bake-all test suite mocks `spawn` entirely, so no test covers the real child passphrase handshake.
**Fix:** Prefer the env var unconditionally in the child (and in `bake-all.ts`'s own `readPassphrase` for symmetry):

```ts
async function promptPassphrase(): Promise<string> {
  const envPass = process.env.MRAM_PASSPHRASE;
  if (envPass) return envPass;          // explicit env always wins
  if (!process.stdin.isTTY) {
    throw new Error("stdin is not a TTY and MRAM_PASSPHRASE is not set. ...");
  }
  // ... interactive prompt unchanged
}
```

Additionally (defense-in-depth), `bakeRitual` in `bake-all.ts` should spawn with `stdio: ["ignore", "inherit", "inherit"]` when `--on-fallback` is `continue`/`abort` — children then have no interactive stdin at all and correctly fall through to the env var even without the child fix.

### CR-02: The forbidden `parallel > 1` + interactive-fallback combination runs by default — the conflict check is disabled exactly when it matters most

**File:** `scripts/bake-all.ts:258-275, 594-602`
**Issue:** `checkParallelFallbackConflict(parallelN, onFallback, flagged)` correctly refuses `--parallel > 1` with `--on-fallback=ask|wait` (T-03-14), but `main()` passes `flagged = flags.parallelFlagPresent || flags.onFallbackFlagPresent`. A bare invocation — `npx tsx scripts/bake-all.ts` or the doc's own TL;DR daily driver `bake-all.ts --changed-only` (docs/BAKE-WORKFLOW.md:17) — has neither flag present, so the check is skipped and the run proceeds with **parallel=4 AND on-fallback=ask**: the exact composition the guard exists to prevent. If any child hits a Gemini tier drop, up to four children can fire the interactive y/N raw-mode prompt concurrently on the shared TTY (and any child prompting pauses invisibly behind three siblings' interleaved progress output). Combined with CR-01, a bare interactive invocation is broken from the first prompt. The docstring rationalizes the skip as avoiding a "confusing surprise" refusal for bare invocations — but silently running the forbidden combination is strictly worse than refusing it.
**Fix:** Never run the conflicting combination. Instead of gating enforcement on `flagged`, resolve the default conflict by picking a safe effective default, e.g. in `main()`:

```ts
// Defaults conflict (parallel=4, on-fallback=ask). If the user touched
// neither flag, degrade parallelism to 1 so "ask" stays safe; if they
// touched either, enforce the refusal unconditionally.
const bothDefault = !flags.parallelFlagPresent && !flags.onFallbackFlagPresent;
const parallelN = bothDefault ? 1 : clampParallel(flags.parallel);
const conflict = checkParallelFallbackConflict(parallelN, flags.onFallback, true);
```

(Or default `onFallback` to `"continue"` whenever `parallelN > 1` and it wasn't explicitly set — either resolution is fine; running 4×ask is not.)

### CR-03: Cross-process read-modify-write race on `_INDEX.json` under `bake-all.ts --parallel` — D-08 provenance entries are silently lost

**File:** `scripts/build-mram-from-dialogue.ts:338-349` (`upsertBakeIndexEntry`), `scripts/bake-all.ts:441-470`
**Issue:** Every freshly rendered line calls `upsertBakeIndexEntry(CACHE_DIR, entry)`, which reads the entire `_INDEX.json`, appends/updates one entry, and rewrites the whole file. The tmp+rename write is atomic **per write**, but the read→modify→write sequence is not serialized across the multiple `build-mram-from-dialogue.ts` child processes that `bake-all.ts --parallel N` runs concurrently against the same shared `rituals/_bake-cache/_INDEX.json`. Two children interleaving (A reads, B reads, A writes, B writes) means the last writer clobbers the other's entries — last-writer-wins data loss in the D-08 tier-aware manifest. Lost entries are never regenerated (index entries are written only on fresh renders; cache hits skip them), so fallback-tier lines vanish from `preview-bake.ts`'s scrubber and from the "candidates for premium upgrade" review workflow the manifest exists to support. The unit tests only exercise single-process upserts, so this never surfaces in the suite.
**Fix:** Serialize index writes across processes. Options in ascending effort:
1. Per-process index shards: each child writes `_INDEX.<pid>.json` (or `_INDEX.<ritualSlug>.json` — one ritual per child, so slug-keyed shards are naturally conflict-free) and `preview-bake.ts`/readers merge `_INDEX*.json`.
2. An advisory lock file around the read-modify-write (`fs.openSync(lockPath, "wx")` with retry).
3. Have the parent `bake-all.ts` own all index writes (children report entries over stdout/IPC).

Option 1 (slug-keyed shard per child) is the smallest change consistent with the existing one-ritual-per-child design.

## Warnings

### WR-01: Cache-entry tmp filename lacks a per-process discriminator — rename race between parallel children crashes the bake

**File:** `scripts/render-gemini-audio.ts:156-160`
**Issue:** `renderLineAudio` stages cache writes as `` `${cachePath}.tmp` `` — no PID component, unlike every other atomic writer in this phase (`resume-state.ts`, `cache-manifest.ts`, `writeBakeIndexAtomic`, the Google-fallback write in `build-mram-from-dialogue.ts:521`, all of which use `.${process.pid}.tmp`). Identical lines shared across rituals ("So mote it be.", "I do.", etc.) with the same role/voice hash to the *same* cache key, so two parallel `bake-all.ts` children can render the same line concurrently and collide on the same `.tmp` path: child A renames it away, child B's `renameSync` then throws ENOENT, which propagates as a fatal bake error (D-01 no-skip policy) and halts that child's whole ritual — a spurious failure of otherwise-good work.
**Fix:** `const tmpPath = `${cachePath}.${process.pid}.tmp`;` (matching the sibling writers).

### WR-02: `--resume` state is never persisted on the interruption path it exists for

**File:** `scripts/bake-all.ts:653-656`
**Issue:** `_RESUME.json` is written only *after* `bakeSelected()` fully resolves, and only when the current run was itself started with `--resume`:

```ts
if (flags.resume) {
  for (const r of results) if (r.ok) completed.add(r.slug);
  if (completed.size > 0) writeCompletedSlugs(completed, startedAt);
}
```

Two consequences: (1) a Ctrl-C/SIGKILL/crash mid-fan-out — the "prior interrupted run" the flag is documented for (`--resume: Skip ritual slugs already completed ... from a prior interrupted run`) — terminates the process before this line ever runs, so no resume state exists to resume from; (2) a first run invoked *without* `--resume` records nothing even when it fails cleanly, so `--resume` on the retry has nothing to skip. As shipped, resume state is only written by a run that (a) passed `--resume` and (b) ran to completion with at least one failure — a narrow slice of the intended use. The per-line content cache softens the cost (re-spawned children mostly cache-hit), but each "skipped" ritual still re-validates, re-spawns, re-probes, and re-encrypts.
**Fix:** Write the resume state incrementally inside `bakeSelected`'s success branch (right after `recordBaked`), unconditionally — cheap, atomic, and it makes both the interrupt path and the no-flag-first-run path work:

```ts
recordBaked(manifestPath, slug);
completedThisRun.add(slug);
writeCompletedSlugs(completedThisRun, startedAt, resumeFile);
```

(Keep the existing end-of-run `clearResumeStateFile()` on full success.)

### WR-03: `invalidate-mram-cache.ts` — its own documented usage fails to parse (space-separated flag values counted as positional args)

**File:** `scripts/invalidate-mram-cache.ts:76-127` (vs. the module's own header at lines 14-18 and docs/BAKE-WORKFLOW.md:85)
**Issue:** `parseArgs` computes `positional = argv.filter((a) => !a.startsWith("--"))`, but the script also accepts space-separated flag values (`--lines 66,75`, `--role WM`) whose *values* don't start with `--` and are therefore also collected as positionals. Results:
- The exact invocation in the module docstring (`... plain.md cipher.md --lines 66,75,83`) yields 3 positionals → hard error `"Need 1 or 2 positional args"`.
- `plain.md --lines 66,75` yields positionals `[plain.md, "66,75"]` → `cipherPath = "66,75"` → confusing `"cipher file not found: 66,75"` exit.

The script fails loudly rather than deleting the wrong entries, but the documented space-separated form (also documented in BAKE-WORKFLOW.md's maintenance table) is unusable; only the `--lines=...` form works with an explicit cipher path. `list-ritual-lines.ts:57-66` solves this exact problem correctly with a `FLAGS_WITH_VALUE` skip set — the fix already exists in a sibling file.
**Fix:** Port the `FLAGS_WITH_VALUE` positional-extraction loop from `list-ritual-lines.ts` into `parseArgs` (skip the token following `--lines`/`--role`).

### WR-04: `invalidate-mram-cache.ts` cannot see (or delete) fallback-tier Gemini cache entries — and the resume path can resurrect the "invalidated" line

**File:** `scripts/invalidate-mram-cache.ts:264-301`
**Issue:** Candidate keys are computed only for `modelId = (readModelsFromEnv() ?? DEFAULT_MODELS)[0]` (plus the `google:` engine key for short lines). But D-08 keep-and-upgrade deliberately keeps renders under *fallback* Gemini model keys (`gemini-2.5-flash-preview-tts`, `gemini-2.5-pro-preview-tts`). For a line whose only cached render is fallback-tier, this script reports "not cached" and deletes nothing. Normally that's just misleading output (the preferred-key bake lookup misses anyway), but it becomes functional when `--resume-state-path` is in play: `tryReadCompletedLineFromCache` (`build-mram-from-dialogue.ts:387-393`) scans the **entire model chain**, so a resumed bake will happily re-embed the very fallback-tier audio the user just tried to invalidate.
**Fix:** Iterate every model in the resolved chain when building candidates:

```ts
for (const m of readModelsFromEnv() ?? DEFAULT_MODELS) {
  candidates.push({ label: m, cacheKey: computeCacheKey(text, style, voice, m, preamble) });
}
```

(For short lines, the padded-prompt key per chain model plus the Google key.)

### WR-05: Duration-anomaly median pool is polluted by gate-failed samples

**File:** `scripts/build-mram-from-dialogue.ts:274 (runDurationAnomalyGate), 525-526 (Google fallback push)`
**Issue:** `runDurationAnomalyGate` appends the current sample to `durationSamples` even when the sample *tripped the gate* — i.e., a measurement the pipeline just classified as anomalous (>3x or <0.3x the ritual median) permanently joins the pool used to judge every subsequent line, dragging the running median toward the failure. On the short-line path this compounds: a gate-failed padded-Gemini render contributes its anomalous sample, then the Google fallback for the same line pushes a second sample (line 526) — one logical line, two pool entries, one of them known-bad. For a ritual with several failing short lines, the median drifts enough to change later gate outcomes in both directions (false passes for slightly-long lines, false trips for normal ones).
**Fix:** Only append the sample when the gate did not trip (and skip the append in `renderShortLineWithGates` when the Gemini sample was already rejected):

```ts
if (!tripped) durationSamples.push({ durationMs, charCount });
return { tripped, detail };
```

### WR-06: `google-tts.ts` key redaction is weaker than its sibling and the key travels in the URL query string

**File:** `scripts/lib/google-tts.ts:45, 57-60` (also `scripts/render-gemini-audio.ts:390, 427-431`)
**Issue:** On a non-OK response, `google-tts.ts` redacts only substrings matching `[?&]key=...` in the response body. If Google's error body echoes the key in any other shape (e.g., `"API key not valid: AIza..."`), it flows unredacted into the thrown error message and from there into bake logs. The same-phase sibling `stt-verify.ts:42-44` does this correctly by splitting on the literal key (`message.split(apiKey).join("REDACTED")`). Separately, both `google-tts.ts` and `render-gemini-audio.ts` put the API key in the URL query string (`?key=${apiKey}`) rather than the supported `X-Goog-Api-Key` request header, which keeps the key out of any URL-logging layer entirely.
**Fix:** In `google-tts.ts`, apply literal-key redaction *in addition to* the pattern redaction: `const redacted = body.split(apiKey).join("REDACTED").replace(/[?&]key=[^&"'\s]*/g, "?key=REDACTED");` — and prefer `headers: { "X-Goog-Api-Key": apiKey }` with a key-free URL in both modules.

### WR-07: `storage.ts` first-use encryption-key race can permanently orphan encrypted records

**File:** `src/lib/storage.ts:23-70`
**Issue:** `getOrCreateKey()` is called per `encrypt()`/`decrypt()` invocation and is check-then-act: read `settings["encryption-key"]`, and if absent, generate a fresh AES-GCM key and `put` it. Two concurrent first-time writers (e.g., two components saving concurrently on a fresh profile, or two tabs) can both observe "no key," each generate a different key, and the second `put` overwrites the first — every record encrypted under the loser's key becomes permanently undecryptable (AES-GCM auth failure), with no recovery path. Low likelihood in a single-user flow, but the failure mode is silent, total data loss for the affected records.
**Fix:** Make key creation race-safe: use `IDBObjectStore.add()` (fails on existing key) instead of `put()`, and on a `ConstraintError` re-read and use the stored winner; or memoize a single in-flight `getOrCreateKey()` promise at module scope so concurrent callers within one tab share one creation.

### WR-08: Cache migration writes dead entries for short lines and contradicts the documented historical skip threshold

**File:** `scripts/migrate-bake-cache.ts:89, 330, 373-380` (vs. docs/BAKE-WORKFLOW.md:203)
**Issue:** Two related problems. (1) For every line with `text.length >= OLD_HARD_SKIP_THRESHOLD_CHARS` the migration computes the new v3 key from the **raw text**. But the Phase-3 bake path never looks up raw-text keys for lines under `SHORT_LINE_MAX_CHARS` (11) — short lines are looked up under the padded instructional prompt (`buildShortLinePrompt`). So any migrated entry for a 5-10-char line is dead weight: copied, counted in the "Migrated: N" success total, and never hit; the bake re-renders those lines anyway. (2) `OLD_HARD_SKIP_THRESHOLD_CHARS = 5` claims to reconstruct "the value that was always the shipped default," but BAKE-WORKFLOW.md:203 describes the old bucket as "`<11 chars → skip`." One of the two is wrong about history: if the doc is right, the 5-10-char band never had old cache entries and the constant silently mis-reconstructs the past (harmlessly today — the lookups just miss — but the migration's reported counts are wrong either way).
**Fix:** Skip (or separately count as "short — will re-render via padded prompt") lines with `text.length < SHORT_LINE_MAX_CHARS` instead of migrating them under raw-text keys, and reconcile the threshold constant with the documented historical value.

## Info

### IN-01: `--dry-run` reports the global cache file count as a per-ritual metric

**File:** `scripts/bake-all.ts:521-530`
**Issue:** `dryRunForRitual` counts **all** `.opus` files in the shared cache dir and prints it as `cache-entries-present` on each ritual's roll-up line — every ritual shows the same number, and none of them reflects that ritual's actual cache coverage (contrast `list-ritual-lines.ts`, which computes real per-line cache status).
**Fix:** Either label it honestly (`cache-entries-total(global)`) or compute per-ritual coverage via `isLineCached` as `list-ritual-lines.ts` does.

### IN-02: Stale comments contradict shipped behavior

**File:** `scripts/bake-all.ts:54-68, 366-368`; `scripts/list-ritual-lines.ts:220`
**Issue:** The bake-all module docstring and `buildMramSpawnArgs` comment assert that `build-mram-from-dialogue.ts` "has no --skip-line-ids / --resume-state-path flags ... as of this plan" — but `--resume-state-path` exists (`build-mram-from-dialogue.ts:684-687`) and is documented in BAKE-WORKFLOW.md. Separately, `list-ritual-lines.ts`'s printed legend still documents "`⨯ hard-skipped (too short)`" — a state D-01 removed and that the script can never emit.
**Fix:** Update the bake-all comments (or wire `--resume-state-path` through for per-line resume); drop the `⨯` legend line.

### IN-03: `ensureLoopback` error message suggests an override that its own caller refuses; garbage `PREVIEW_BAKE_PORT` crashes at listen

**File:** `scripts/preview-bake.ts:59, 76-85, 513-517`
**Issue:** The refusal message says "Set PREVIEW_BAKE_HOST if you need to override" — but the `PREVIEW_BAKE_HOST` value is itself passed through `ensureLoopback`, so the suggested override can never succeed for a non-loopback host (arguably good, but the message is misleading). Also `BIND_PORT = Number(process.env.PREVIEW_BAKE_PORT ?? "8883")` produces `NaN` for a non-numeric value, which `server.listen(NaN, ...)` rejects with an opaque RangeError.
**Fix:** Reword the message ("only 127.0.0.1/::1 are ever accepted; PREVIEW_BAKE_HOST may select between them"); validate the port with a clear error.

### IN-04: Preview index page builds `innerHTML` from unescaped manifest fields

**File:** `scripts/preview-bake.ts:305-324`
**Issue:** The client script concatenates `r.slug`, `l.lineId`, `l.model` straight into `innerHTML`. All data comes from local files on a loopback-only dev tool, so exploitability is minimal, but a malformed/hostile `_INDEX.json` (e.g., restored from an untrusted backup) can inject markup/script into the scrub page.
**Fix:** Use `textContent`/DOM construction, or HTML-escape the interpolated fields.

### IN-05: `wordDiff` is a set diff — duplicated-word errors are invisible to the "strict" STT gate

**File:** `scripts/lib/bake-math.ts:29-42`; `scripts/lib/stt-verify.ts:110-125`
**Issue:** `verifyLineAudio` documents `ok` as "strict — zero missed AND zero inserted words," but `wordDiff` compares word *sets*: a transcript of "I do do" vs expected "I do" (stutter/repetition — a real TTS failure mode) diffs clean, as does a dropped repetition ("so mote it be, so mote it be" → "so mote it be"). Documented as a deliberate design choice, but the strictness claim overstates coverage.
**Fix:** Note the limitation in `verifyLineAudio`'s doc, or compare word multisets/counts if repetition faults matter.

### IN-06: `validateVoiceImport` checks field presence but not types

**File:** `src/lib/voice-storage.ts:213-226`
**Issue:** Required fields are only checked for `!== undefined/null`; a voices file with `duration: "abc"` or `audioBase64: 42` validates and is imported as-is (then cast to `LocalVoice[]`), producing broken records that surface later at playback.
**Fix:** Add `typeof` checks per field (string/number) alongside the presence check.

### IN-07: Validator refusal message can report "(0 issues)" on a structure-parity-only failure

**File:** `scripts/lib/validate-or-fail.ts:47-51`
**Issue:** The header line interpolates `errors.length`, but the refusal also fires when `!result.structureOk` with zero severity-error line issues — printing "validator refused to bake ... (0 issues)" followed by the divergence detail. Confusing, cosmetic only.
**Fix:** `const issueCount = errors.length + (result.structureOk ? 0 : 1);` or reword the header.

### IN-08: `google-tts.ts` header references a "grep guard" the paired test file doesn't contain

**File:** `scripts/lib/google-tts.ts:11-21`; `scripts/__tests__/google-tts.test.ts`
**Issue:** The module header says "see the acceptance-criteria grep guard in the paired test file" as the structural preamble-leak defense. The test file asserts request-body content (good) but contains no source-level guard (e.g., reading `google-tts.ts` and asserting no `voice-cast` import). The documented first defense layer doesn't exist.
**Fix:** Add the source-scan assertion (`expect(fs.readFileSync(".../google-tts.ts","utf8")).not.toMatch(/voice-cast/)`), or drop the claim from the header. Related minor: `src/lib/idb-schema.ts:49-101` `openDB` has no `onblocked` handler, so an old tab holding a v4 connection stalls the v5 upgrade silently — worth a `request.onblocked` log at least.

---

_Reviewed: 2026-07-02T17:56:18Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
