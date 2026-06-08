# Phase 3: Authoring Throughput - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-21
**Phase:** 03-authoring-throughput
**Areas discussed:** Cache & orchestrator, Bake correctness gates, Preview server, idb-schema unification

---

## Cache & Orchestrator

### Q1: Cache location

| Option | Description | Selected |
|--------|-------------|----------|
| `rituals/_bake-cache/` + gitignore | Per-repo, co-located with content; survives machine moves with repo; gitignored. Migrate existing `~/.cache` entries on first run via copy. | ✓ |
| `rituals/_bake-cache/` + check in | Cache committed to git; survives clones. Adds ~50-100MB per ritual; rebake corrupts diffs. | |
| Keep `~/.cache/masonic-mram-audio/` | No migration; off-tree, XDG-honoring. Diverges from spec wording. | |

### Q2: Cache key formula

| Option | Description | Selected |
|--------|-------------|----------|
| Add modelId, bump KEY_VERSION to v3 | `sha256(KEY_VERSION + text + style + voice + modelId + preamble)`. Honest re-bake on first run. | ✓ |
| Add modelId, keep v2 key | Reuses entries; risk of silent stale 2.5-pro-tagged-as-3.1-flash hits. | |
| Skip modelId in key | Treats 3.1-flash and 2.5-flash as interchangeable; saves re-bakes; quality drift invisible. | |

### Q3: --since semantics

| Option | Description | Selected |
|--------|-------------|----------|
| `git diff <ref> -- rituals/*-dialogue.md` | Re-bake any ritual whose dialogue files changed since `<ref>`. Default `<ref>` = `HEAD~1`. | ✓ |
| Ritual-level mtime check | Filesystem mtime; misleading after fresh clone. | |
| All rituals, cache decides | Always scan all; rely on cache. Slowest pre-scan; no per-ritual progress. | |

### Q4: --parallel default

| Option | Description | Selected |
|--------|-------------|----------|
| 4 | Conservative against Gemini preview rate limits (~6-10 RPM). Headroom for fallback. | ✓ |
| 8 | More aggressive; higher 429 rate; quality risk via fallback chain. | |
| 1 (sequential) | Slowest; no contention with sleep-until-midnight-PT pattern. | |

---

## Bake Correctness Gates

### Q5: Short-line policy (AUTHOR-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-route to Google Cloud TTS | Lines below `MIN_BAKE_LINE_CHARS` render via Google Cloud TTS at bake time; embedded same as Gemini. Bake never silently produces missing audio. | ✓ |
| Refuse-to-bake with clear error | Bake exits with too-short list; Shannon rewrites OR passes `--allow-short-runtime-tts`. Loud failure; no quiet drop. | |
| Auto-route to browser TTS via runtime path (current) | Mark line as 'render at runtime' in MRAMLine flag; existing behavior, made explicit + counted. | |

### Q6: AUTHOR-05 cipher/plain word-count ratio

| Option | Description | Selected |
|--------|-------------|----------|
| ±50% band, hard-fail bake | Plain word count must be in 0.5×–2× cipher word count. Wide enough for legitimate cipher abbreviations. | ✓ |
| ±25% band, hard-fail | Tighter; more false positives on abbreviation. | |
| Warn-only at any ratio | Print warning; never refuse. Doesn't satisfy success criterion 4. | |

### Q7: AUTHOR-06 audio-duration anomaly

| Option | Description | Selected |
|--------|-------------|----------|
| `>3× OR <0.3×` median, refuse bake | Catches both ends: leak (long) + cropped (short). Per-ritual median per char. Hard-fail. | ✓ |
| `>3×` only, refuse bake | Spec-literal; only catches leak. | |
| `>3× OR <0.3×`, warn + auto-rebake once | Self-healing for transient glitches. Hides repeat failures behind silent retry. | |

### Q8: AUTHOR-07 STT round-trip diff

| Option | Description | Selected |
|--------|-------------|----------|
| `--verify-audio` flag, opt-in, warn-only | Off by default (~$0.01/ritual). Run on final pre-ship pass; results surface for review. | ✓ |
| Always-on, sample 10% of lines, warn-only | Free-tier Whisper; ~15 lines/ritual. Less predictable cost per bake. | |
| Always-on every line, refuse-bake on diff | Most rigorous, most expensive; false positives block ship. | |

---

## Preview Server

### Q9: Architecture

| Option | Description | Selected |
|--------|-------------|----------|
| Standalone Node script, separate from Next dev | `scripts/preview-bake.ts` runs `http.createServer` on `:8883`. Independent of Next dev. <1s boot. | ✓ |
| Next dev API route | `/api/preview-bake` under Next dev. Coupled to rebuild cycles. | |
| Express/Fastify mini-server | Adds framework dep; heavier than the job needs. | |

### Q10: Content scope

| Option | Description | Selected |
|--------|-------------|----------|
| Read-only cache scrubber | Lists rituals → lists baked lines → plays Opus from cache. No re-render, no `.mram` modification. | ✓ |
| Cache scrubber + re-render single line | Adds 'rebake this line' button; introduces API key handling in preview server. | |
| Full author-mode (read + edit + rebake) | Out of scope for AUTHOR-08; rebuilds `/author`. | |

### Q11: Dev-guard

| Option | Description | Selected |
|--------|-------------|----------|
| Extract shared `src/lib/dev-guard.ts` | One source of truth; `/author` and `preview-bake.ts` both import. | ✓ |
| Inline duplicate in `preview-bake.ts` | Two places to keep in sync; brittle. | |
| Bind to 127.0.0.1 + NODE_ENV check only | Skip the file-level guard; minimal but doesn't share invariant with `/author`. | |

---

## idb-schema Unification

### Q12: Module scope

| Option | Description | Selected |
|--------|-------------|----------|
| `DB_NAME`, `DB_VERSION`, store names, single `onupgradeneeded` | `idb-schema.ts` owns constants AND upgrade handler. Eliminates dual-open ordering risk. | ✓ |
| Only constants | Each module keeps own `openDB()`; upgrade handlers still duplicated. | |
| Constants + per-store schema descriptors, modules wire up | Schema as data; helper-applied. Most flexible; overkill for 6 stores. | |

### Q13: feedbackTraces store schema

| Option | Description | Selected |
|--------|-------------|----------|
| `keyPath:'id'`, indexes on `documentId` + `timestamp` + `variantId` | Phase 5 list-by-ritual / filter-by-variant / sort-by-time. PII-free. | ✓ |
| `keyPath:'id'`, single timestamp index | Minimal; Phase 5 filters in-memory. | |
| Defer schema design — Phase 3 lands empty store | Phase 5 designs schema when adding first writer. Pushes design into already-heavy phase. | |

### Q14: Test approach

| Option | Description | Selected |
|--------|-------------|----------|
| Vitest + `fake-indexeddb`, dual-open both orderings | New test file asserts all 6 stores exist regardless of which module opens first. | ✓ |
| Vitest + manual IDBDatabase mock | Hand-roll; fragile; mock divergence has masked bugs historically. | |
| Manual smoke test only | Eyeball IndexedDB DevTools; not regression-resistant. | |

---

## Closing Question

| Option | Description | Selected |
|--------|-------------|----------|
| I'm ready for context | Write CONTEXT.md with all 14 decisions captured. | ✓ |
| Explore more gray areas | Surface 2-4 additional gray areas (model fallback ordering, retry/backoff tuning, etc.). | |

---

## Claude's Discretion

- Exact `_INDEX.json` field ordering and on-disk format (D-03)
- `_RESUME.json` exact format (D-06)
- Initial `GOOGLE_ROLE_VOICES` mapping (D-09) — Shannon reviews during execution
- Exact `--dry-run` output format (D-05)
- Validator failure messaging copy (D-08)
- Whether `--verify-audio` writes diff report to file (D-11)
- Default threshold `N` for "diff > N words" warn (D-11) — defaults to `2`

## Deferred Ideas

- Errata JSON sidecar (AUTHOR-v2-03)
- Hosted `/author` UI (AUTHOR-v2-01)
- Trusted co-author circle (AUTHOR-v2-02)
- `--force` override on validator failures
- Auto-evict cache on duration-anomaly trigger
- Always-on STT verify with sampling
- Re-render trigger in preview server
- Web dialogue editor in preview server
- `feedbackTraces` storing prompt/completion bodies
- `scripts/bake-all.ts --watch` mode
- Per-API-key `--parallel` accounting
