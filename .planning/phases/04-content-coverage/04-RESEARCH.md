---
phase: 04-content-coverage
researched: 2026-04-23
domain: content authoring + bake verification + CI content gate
confidence: HIGH (tooling) / MEDIUM (ritual taxonomy — jurisdiction-specific, Shannon-confirmable) / MEDIUM (effort estimates)
nature: Shannon-labor-dominated (content) with a small engineering surface (verifier + CI gate)
depends_on: Phase 3 (execution complete on gsd/phase-3-authoring-throughput; 8/8 plans landed, 517/517 tests, 10/10 AUTHOR-* requirements)
---

# Phase 4: Content Coverage — Research

**Researched:** 2026-04-23
**Domain:** Masonic ritual content authoring + bake verification + content-parity CI gate
**Confidence:** HIGH for the engineering surface; MEDIUM for the ritual taxonomy (jurisdiction-specific — Shannon locks during discuss); MEDIUM for effort estimates (depend on Gemini quota state).

## Summary

Phase 4 is **Shannon-labor-dominated**, not engineering-dominated. Phase 3 shipped every tool needed to bake a ritual fast and safely (content-addressed cache, orchestrator, parity validator, duration-anomaly detector, short-line Google TTS route, line-level resume, `--verify-audio` pass, preview-bake scrubber, `scripts/verify-mram.ts` decrypter). What Phase 4 must produce is **the content itself**: 5+ ritual dialogue pairs (plain + cipher) in Shannon's Grand Lodge of Iowa working, each with voice-cast + styles sidecars, each baked into a `.mram` with per-line Opus embedded, each verified.

The **engineering** slice is three small pieces:
1. **CONTENT-06 verifier** — extend `scripts/verify-mram.ts` (which today checks decryption + checksum + roles + section layout) to also assert per-line Opus coverage: every spoken line with non-trivial `plain` has an `audio` field, bytes decode as Opus, duration is within the AUTHOR-06 sanity band.
2. **CONTENT-07 CI gate** — because `rituals/*.md` is gitignored, the CI gate cannot live in a GitHub Action that checks out the repo. It must be a **local pre-push** (or pre-commit on branches that touch rituals) hook that runs `scripts/validate-rituals.ts` + the new parity validator (`src/lib/author-validation.ts`) — `git diff --name-only` against `rituals/*-dialogue*.md`, bail if the validator fails. Alternatively (recommended): roll CONTENT-07 into the `bake-all.ts` validator-first gate that already exists, and treat the new verifier as the release-gate instead.
3. **Per-ritual readiness checklist** — a single tracking file (`.planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md`) that lists every ritual Phase 4 must ship with a per-ritual status row: dialogue draft written / cipher drafted / voice-cast + styles written / bake run / verifier green / `.mram` distributed. Legible, resumable, idempotent — it IS the plan for Shannon's solo labor.

The **content** slice is Shannon's work, but the planner can make it legible and resumable by creating one plan per ritual (or per degree) that matches the Phase 3 plan skeleton. Each content plan's "tasks" are authoring steps; the verifier is the acceptance criterion.

**Primary recommendation:** Plan structure is **1 engineering plan + 1 checklist plan + 4 content plans** (FC, MM, Installation, Officer Lectures) + **1 verification plan** (EA re-verify + shipping). The engineering plan is Wave 0 (blocks everything); the content plans run in any order Shannon picks — they're independent Gemini-quota-bounded work blocks. The final verification plan is gated on all previous plans landing.

## User Constraints

**No CONTEXT.md exists for Phase 4** — the planner will work from this RESEARCH.md + REQUIREMENTS.md + ROADMAP.md alone. The user's directional steer was: "Full content checklist" — plan the whole Phase 4 content pipeline as a checklist Shannon works through, not just the engineering-shaped pieces. That steer is treated as a **locked constraint** throughout the Recommended Plan Breakdown.

No Claude's Discretion areas are deferred; no Deferred Ideas from discuss exist for this phase.

## Project Constraints (from CLAUDE.md)

- Use `/browse` skill for all web browsing; never use `mcp__claude-in-chrome__*`.
- Skill routing is mandatory when a request matches (office-hours, investigate, ship, etc.). Phase 4 authoring work does not trigger any skill directly, but a human verification or bug-investigation step during content QA should use `/investigate` or `/qa`.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CONTENT-01 | Entered Apprentice (EA) degree baked — cipher + plain + Gemini audio + voice cast pinned | EA is partially done (4 rituals exist: ea-opening, ea-initiation, ea-explanatory, ea-closing; all have `.mram` baked 2026-04-17..22). Phase 4 re-bakes under the v3 cache (per AUTHOR-01 D-02 bumped v2→v3 key) so the existing `.mram`s are cache-invalidated — but the dialogue/cipher/voice-cast/styles files still apply. This is a **re-bake of existing content**, not a fresh-authored item. |
| CONTENT-02 | Fellow Craft (FC) degree baked — cipher + plain + audio + voice cast | FC dialogue pairs do NOT exist yet — fresh authoring. Typical FC structure: opening, passing (initiation), lecture, closing. ~4 scenes. |
| CONTENT-03 | Master Mason (MM) degree baked — cipher + plain + audio + voice cast | MM dialogue pairs do NOT exist yet. Typical MM structure: opening, raising (initiation), middle chamber lecture, Hiramic legend, closing. ~5 scenes. |
| CONTENT-04 | Annual officer installation ceremony baked | Installation dialogue pair does NOT exist yet. Typically 1 scene but long (~1hr when spoken). |
| CONTENT-05 | Officer lectures / charges baked as standalone practice units | Includes WM charge, SW duties, JW duties, + any others Shannon identifies. Each is a standalone `.mram`. Count TBD at discuss-phase (estimate: 5-10 lectures). |
| CONTENT-06 | Every shipped `.mram` verified to have per-line Opus embedded | Engineering: extend `scripts/verify-mram.ts` with a new `--check-audio-coverage` flag that asserts every spoken line has `audio` populated, decodes as Opus, duration plausible. |
| CONTENT-07 | Every shipped `.mram` passes the cipher/plain parity validator before release | Engineering: the validator already exists (src/lib/author-validation.ts + bake-all validator-first gate). What Phase 4 adds is **release gating** — a `npm run verify-content` check that runs validator + verifier across every `.mram` being shipped, exits 1 on any failure. Git CI not viable because ritual content is gitignored. |

## Phase Boundary

### In scope

- Authoring dialogue pairs (plain + cipher `.md`), voice-cast JSON, styles JSON for all rituals in CONTENT-01..05
- Baking each ritual end-to-end via `scripts/bake-all.ts` (uses Phase 3 orchestrator)
- Scrubbing each ritual via `scripts/preview-bake.ts` before re-encryption
- Re-baking EA (cache-invalidated by the v3 key bump per AUTHOR-01 D-02)
- Extending `scripts/verify-mram.ts` with per-line Opus coverage + duration sanity
- Local-only release-gate script (`npm run verify-content`) running validator + verifier across every shipped `.mram`
- Per-ritual readiness tracking file (`04-CONTENT-CHECKLIST.md`)
- Distributing each finalized `.mram` to the pilot (file drop via existing upload-and-unlock flow)

### Out of scope (belongs to other phases)

| Item | Phase | Reason |
|------|-------|--------|
| GitHub Actions CI gate for ritual content | N/A (v2) | Ritual content is gitignored — a CI gate over files CI can't see is architecturally impossible. Release gating is local-only. |
| Per-ritual build-hash tracking + stale-version banner | Phase 6 (ADMIN-05, ADMIN-06) | Dashboard work. Phase 4 ships `.mram`s to Shannon's local pilot upload path; client-side hash detection lands in the admin substrate. |
| Multi-working content system (UGLE, PHA, Canadian, other US GLs) | v2 (CONTENT-v2-01) | Out of scope for v1 per PROJECT.md. Shannon's Grand Lodge of Iowa working only. |
| Appendant bodies (Scottish Rite, York Rite, Shrine, OES) | v2 (CONTENT-v2-02) | Out of scope. Craft lodge only. |
| Self-serve authoring UI for lodges | v2 (AUTHOR-v2-01) | Baking stays offline/dev-only. |
| Errata JSON sidecar (one-word fixes without full rebake) | v2 (AUTHOR-v2-03) | Bake cache + `--since HEAD~1` already makes one-word edits sub-minute; no sidecar needed. |
| LLM feedback quality work | Phase 5 | Coach phase. Independent of content baking. |

## Architectural Responsibility Map

Phase 4 is a multi-tier workflow. The content "capability" decomposes into authoring + baking + verification + distribution responsibilities that live in different tiers.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Dialogue authoring (plain + cipher `.md`) | Author (Shannon, local) | — | Human-in-the-loop; no code. Gitignored local-only content per `.gitignore:110-115`. |
| Voice-cast + styles JSON | Author (Shannon, local) | — | Same. |
| Ritual bake (text → Opus-embedded `.mram`) | Offline Build Script | Gemini TTS API + Google Cloud TTS API (external) | Runs on Shannon's dev laptop via `npm run bake-all`; external APIs called by the orchestrator. Never runs in production/CI. |
| Per-line audio embedding (Opus base64 inside AES-GCM-encrypted `.mram`) | Offline Build Script (`build-mram-from-dialogue.ts`) | — | Byte-embedded in the `.mram` payload before AES-GCM encryption. Client decrypts, extracts audio, short-circuits TTS when `audio` is present (per `deterministic-tts-bake-in-at-build-time` skill). |
| Content validator (cipher/plain parity) | Offline Build Script + Release Gate | Browser `/author` UI | `src/lib/author-validation.ts` is shared between the dev-only `/author` UI and the bake pipeline. Release gate invokes the same module. |
| Verifier (per-line Opus coverage, duration sanity) | Release Gate (local CLI) | — | New script `scripts/verify-mram.ts --check-audio-coverage` — runs locally before Shannon distributes a `.mram`. Not in CI (content not in git). |
| Ritual-readiness tracking | Planning layer (Markdown) | — | `04-CONTENT-CHECKLIST.md` is a plan-layer artifact. Shannon updates rows as he completes steps. |
| Ritual distribution to pilot | Existing browser upload flow | — | No new surface. Shannon emails or shares the `.mram` file; pilots drag-drop-and-passphrase per existing `/practice?doc=<id>` flow. |
| Stale-version banner ("your ritual has been updated") | Deferred to Phase 6 (ADMIN-05) | — | Not in Phase 4 scope. |

**Why this matters:** The primary architectural trap is conflating "CI gate" with "GitHub Actions run." Because `rituals/*.md` is gitignored, a GitHub CI gate can only check scripts, not content. The CONTENT-07 parity validator must run **pre-bake** (in `bake-all.ts`, already done by Phase 3) and **pre-distribution** (in the new `npm run verify-content` release gate). The planner should not propose a GitHub Actions workflow for CONTENT-07 — it would be architecturally non-functional.

## Ritual Taxonomy

### Existing (local, already-baked under v2 cache — need re-bake under v3)

| Ritual slug | Plain lines (speaker-prefixed) | Dialogue `.md` size | Current `.mram` size | Status |
|-------------|---|---|---|---|
| `ea-opening` | 104 | 9.1 KB | 3.7 MB | Baked 2026-04-22 (v2 cache) — re-bake under v3 |
| `ea-initiation` | 139 | 21.5 KB | 8.7 MB | Baked 2026-04-22 (v2 cache) — re-bake under v3 |
| `ea-explanatory` | 36 | 6.4 KB | 2.4 MB | Baked 2026-04-21 (v2 cache) — re-bake under v3 |
| `ea-closing` | 106 | 7.9 KB | 3.1 MB | Baked 2026-04-22 (v2 cache) — re-bake under v3 |

EA total: ~385 spoken lines, ~18 MB `.mram` aggregate, 4 ceremonies.

### Needed (Phase 4 authoring work — dialogue pairs do NOT exist)

These counts are **approximate** — the exact scene breakdown is jurisdiction-specific and **Shannon confirms during discuss-phase**. Sources for the approximate structure are the Grand Lodge of Iowa Iowa Code of Masonic Jurisprudence (the jurisdiction Shannon's EA files already name in frontmatter) and the general US-style 3-degree working patterned after Webb/Cross rituals. `[ASSUMED]` on scene counts; `[VERIFIED: existing EA file layout]` on the naming convention.

| Ritual slug (proposed) | Degree | Description | Line count estimate | Dialogue complexity | Notes |
|---|---|---|---|---|---|
| `fc-opening` | FC | Fellow Craft opening | ~130 | similar to EA | Parallel structure to EA opening |
| `fc-passing` | FC | Fellow Craft passing (initiation into FC) | ~180 | high (longest FC scene) | Contains the winding stairs lecture typically |
| `fc-middle-chamber-lecture` | FC | Middle chamber lecture (often recited during passing but separately rehearsable) | ~60 | medium | Standalone practice unit |
| `fc-closing` | FC | Fellow Craft closing | ~100 | medium | Parallel to EA closing |
| `mm-opening` | MM | Master Mason opening | ~140 | similar to EA | |
| `mm-raising` | MM | Master Mason raising (initiation into MM) | ~220 | very high (longest MM scene — includes Hiramic legend) | Longest single ceremony in the phase |
| `mm-hiramic-legend` | MM | Hiramic legend (often part of raising but separately rehearsable) | ~80 | high | Standalone practice unit; emotionally heavy content |
| `mm-closing` | MM | Master Mason closing | ~100 | medium | |
| `installation` | Installation | Annual officer installation ceremony | ~250 | very high | Longest single ceremony — one year's officers installed in sequence; each has a charge |
| `lec-wm-charge` | Lectures | WM charge to the new Master | ~40 | low | Standalone practice unit |
| `lec-sw-duties` | Lectures | SW duties charge | ~30 | low | |
| `lec-jw-duties` | Lectures | JW duties charge | ~30 | low | |
| `lec-secretary-duties` | Lectures | Secretary duties charge | ~25 | low | |
| `lec-treasurer-duties` | Lectures | Treasurer duties charge | ~25 | low | |
| `lec-chaplain-duties` | Lectures | Chaplain duties charge | ~25 | low | |
| `lec-deacons-duties` | Lectures | SD/JD duties charges (may be 1 or 2 files) | ~40 | low | |
| `lec-stewards-duties` | Lectures | SS/JS duties charges | ~30 | low | |
| `lec-tiler-duties` | Lectures | Tiler duties charge | ~20 | low | |

**Totals (approximate, pending Shannon confirmation):**
- **FC:** 4 `.mram` files, ~470 spoken lines total
- **MM:** 4 `.mram` files, ~540 spoken lines total
- **Installation:** 1 `.mram` file, ~250 spoken lines
- **Lectures:** 5-9 `.mram` files (Shannon's lodge picks which are "core"), ~200-300 lines total
- **Grand total to author + bake:** 14-18 new `.mram` files, ~1,500-1,700 spoken lines of fresh content, plus 4 re-bakes of existing EA content

`[ASSUMED]` Scene-split granularity (whether middle chamber lecture is merged into passing or separate, etc.) — Shannon confirms during discuss-phase. The planner should leave the count flexible rather than over-specify.

### Per-ritual artifact set (what "ready to bake" means)

Every ritual requires a **consistent five-file artifact set** — verified against the existing EA ritual files in `rituals/`:

| File | Purpose | Required | Example |
|---|---|---|---|
| `{slug}-dialogue.md` | Plain-text dialogue with frontmatter (`jurisdiction`, `degree`, `ceremony`) + speaker-prefixed lines (`WM:`, `SW:`, `SD:`, `C:`, etc.) + bracketed action cues (`[gavels: 3]`) + `## CEREMONY:` section marker | REQUIRED | `ea-initiation-dialogue.md` |
| `{slug}-dialogue-cipher.md` | Cipher-text dialogue — structurally identical (same speakers, same order, same action cues) but with ritually-standard abbreviation (`Br SD`, `cdt`, `Wh cms hr?`) | REQUIRED | `ea-initiation-dialogue-cipher.md` |
| `{slug}-voice-cast.json` | Per-role voice profile — v1 schema with `scene` (STAGE DIRECTION ONLY — see pitfall below), `roles: {ROLE: {profile, style, pacing, accent, other?}}` | REQUIRED (baking without a voice-cast gives fallback voices, audibly weaker) | `ea-initiation-voice-cast.json` |
| `{slug}-styles.json` | Per-line style + speakAs overrides — v1 schema with `styles: [{lineHash: sha256(plain), style, speakAs?}]` | OPTIONAL but typically needed after first-pass bake (regressions) | `ea-initiation-styles.json` (has 22 style entries + 6 speakAs overrides for letter exchanges) |
| `{slug}.mram` | AES-256-GCM-encrypted output; embeds cipher + plain + per-line Opus audio. Produced by `build-mram-from-dialogue.ts --with-audio` | OUTPUT (Phase 4 produces) | `ea-initiation.mram` (8.7 MB) |

**Naming convention:** strict `{slug}-dialogue{,-cipher}{.md,-voice-cast.json,-styles.json}` pattern enforced by `bake-all.ts:getAllRituals()` glob. Shannon must NOT deviate.

**Key `.gitignore` invariant** (`.gitignore:110-115`, verified via `git check-ignore`):
```
*.mram
rituals/*.md
rituals/*.txt
rituals/*.json
rituals/*.jsonl
rituals/*.yaml
rituals/*.yml
```
**Every ritual artifact is local-only**, never committed. This is a hard constraint on CI design and distribution: `.mram` files reach pilots by direct file share (email, cloud drop), not by `git pull`.

## Content Authoring Workflow

Shannon's end-to-end process from blank doc → shipped `.mram`. This is the basis for the per-ritual checklist.

### 0. Before starting a new ritual

- Confirm git is on `main` (or a content-authoring branch).
- Run `npm run bake-all -- --dry-run` to confirm tooling is wired and the cache is readable.
- Pull the jurisdiction-specific ritual source Shannon is working from (printed monitor / lodge-officer-provided text).

### 1. Draft the plain dialogue

- Create `rituals/{slug}-dialogue.md` with the frontmatter block + `## CEREMONY: {Title}` section marker + speaker-prefixed lines.
- Speaker codes MUST match those already used (`WM`, `SW`, `JW`, `SD`, `JD`, `SS`, `JS`, `Ch`, `C`, `ALL`) — the role-breakdown test in `scripts/verify-mram.ts` lists every role and a typo becomes a spurious new role.
- Action cues go in brackets: `[gavels: 3]`, `[kneels]`, `[stage direction]`.
- Use standard Masonic punctuation/capitalization: `Worshipful Master` (two words, both capitalized in ritual forms of address); `Senior Warden` similarly; the "G" in `In God` stands up.

### 2. Draft the cipher dialogue

- Create `rituals/{slug}-dialogue-cipher.md`.
- **Must be structurally identical** to the plain file: same number of nodes, same speaker on each line, same action cues in the same order (verified by `structureSignature()` in `src/lib/dialogue-format.ts` — called by `validate-rituals.ts`).
- Cipher pattern: remove vowels, abbreviate common words (`Br` for Brother, `cdt` for candidate, `WM` for Worshipful Master, `&` or `@` for and, etc.) following the jurisdiction's printed cipher convention.
- **Scripture / prayers / invocations stay uncipherd** per existing pattern (see `ea-initiation-dialogue-cipher.md` lines 53-54 where the Psalms-133 invocation is left in plain text).
- **Word-count ratio** must fall in 0.5×..2× of the plain text per AUTHOR-05 D-08 (the bake-band check) — validator will refuse otherwise.

### 3. Validate parity

```bash
npx tsx scripts/validate-rituals.ts
```
Runs `structureSignature()` equality + round-trip stability + bake-band word-ratio + warns on unparseable lines. Fail-fast on any issue. Until this passes, do not proceed.

### 4. Write voice-cast JSON

- Create `rituals/{slug}-voice-cast.json`.
- Include `scene` **as an atmosphere description only** — NO station names, NO role names, NO concrete ritual actions that also appear in dialogue (per skill `gemini-tts-voice-cast-scene-leaks-into-audio` [VERIFIED]). Bad: "the Worshipful Master in the East, officers at their stations." Good: "Low lamplight. The brethren are rapt — every word carries weight."
- For each role that speaks in this ritual, provide `profile`, `style`, `pacing`, `accent`, and optionally `other`. Use prior rituals' voice-casts as reference; reuse role profiles across rituals for consistency (WM should sound like the same person across EA/FC/MM/Installation — cache content-addressable key will share bakes across rituals when voice profile + style + text all match).
- Each role field feeds into `buildPreamble()` in `src/lib/voice-cast.ts`, which becomes part of the Gemini prompt for any line ≥ 40 chars (MIN_PREAMBLE_LINE_CHARS).

### 5. First bake (no styles.json yet, expect some regressions)

```bash
GOOGLE_GEMINI_API_KEYS=... GOOGLE_CLOUD_TTS_API_KEY=... npm run bake-all -- --parallel 4
```
- Orchestrator runs validator on every ritual first (validator-first gate, Phase 3 D-08). Any parity failure halts before one API call ships.
- For each ritual: validator passes → `build-mram-from-dialogue.ts` spawns per-ritual → per-line render via `render-gemini-audio.ts` → Opus bytes embedded → `.mram` encrypted with same passphrase.
- Short lines (< 5 chars like `B.`, `I do.`) auto-route to Google Cloud TTS (AUTHOR-04 D-09). Duration-anomaly detector (AUTHOR-06 D-10) hard-fails on >3×/<0.3× per-ritual-median outliers.
- Expect ~6s/line on fresh bakes, ~0.5s/line on cache hits. Estimate: longest ritual (`mm-raising`, ~220 lines, all fresh) = ~22 min wall clock.
- Progress is durable: `_RESUME.json` is atomically written per line (Phase 3 D-06); `Ctrl-C` is safe, `npm run bake-all -- --resume` picks up cleanly.

### 6. Scrub with preview-bake

```bash
npm run preview-bake
```
- Opens `http://127.0.0.1:8883` (loopback-only, dev-only).
- Shannon scrubs every line for: preamble leak (voice-cast scene leaks into audio), text-token regression (trailing silence / empty audio), word-drops ("On" missing from line start), mispronunciation, voice mismatch (Gemini ↔ Google short-line boundary).
- For each bad line, Shannon either:
  - Adds a style entry in `{slug}-styles.json` with `lineHash` = sha256 of the plain text (use `scripts/list-ritual-lines.ts --grep` to find the line ID); re-bake via `npm run bake-all -- --since HEAD~1` (or manually invalidate the specific line via `scripts/invalidate-mram-cache.ts` first).
  - For letter-exchanges and other short regressing lines: add a `speakAs` entry per the `gemini-tts-speakas-short-line-instructional-prompt` skill pattern (`"Say only this single letter name, nothing else: Bee"`).
  - For persistent text-token regressions: rotate through Tactics 1→2→3 from the `gemini-tts-text-token-regression-recovery-tactics` skill.
  - For preamble-scene leaks: edit the `scene` field in voice-cast (expensive — invalidates ~all preamble-using lines).

### 7. Re-bake after edits

```bash
npm run bake-all -- --since HEAD~1
```
(Assumes Shannon committed the styles edit to capture the `--since` anchor — if rituals/ is gitignored, `--since` doesn't catch content changes. **Workaround:** run the full `npm run bake-all` for the touched ritual slug; cache hits keep it fast.)

Cache hits for unchanged lines mean iterations are sub-minute per corrected line, even on ritual-wide re-bakes.

### 8. Final verification pass

```bash
npm run bake-all -- --verify-audio  # optional STT round-trip diff; warn-only
npx tsx scripts/verify-mram.ts rituals/{slug}.mram  # decrypt + checksum + role breakdown
# NEW in Phase 4:
npx tsx scripts/verify-mram.ts rituals/{slug}.mram --check-audio-coverage  # assert every spoken line has audio
```

### 9. Ship to pilot

Shannon distributes `.mram` file via direct share. Pilots drag-drop at `/practice`, type passphrase, get instant-playback rehearsal with zero runtime TTS cost.

### 10. Update the checklist

Shannon marks the ritual row `✓ shipped` in `04-CONTENT-CHECKLIST.md` and commits that (the checklist IS committed — planning-layer file).

## Engineering Surfaces

### CONTENT-06 verifier design (extending `scripts/verify-mram.ts`)

**Current state [VERIFIED: scripts/verify-mram.ts:55-260]:** The script decrypts, checksum-verifies, prints metadata + role breakdown + section breakdown + first/last 3 lines. It does NOT currently check audio presence or audio validity.

**Proposed extension:** add a `--check-audio-coverage` flag (or make audio-coverage a default, gate the existing display behind `--summary`).

**What the verifier MUST assert:**
1. **Line coverage:** for every line where `plain.trim().length > 0` AND `role !== "CUE"`, `line.audio` is present, non-empty, and valid base64.
2. **Opus decode sanity:** `Buffer.from(line.audio, 'base64')` yields bytes; the first 4 bytes match OGG magic (`OggS` = `0x4F 0x67 0x67 0x53`).
3. **Duration plausibility (optional but recommended):** parse Opus duration via `music-metadata` (already a Phase 3 dependency — AUTHOR-06 uses it for anomaly detection); assert duration is within `[0.2s, 60s]` for any single line. Implausibly short = bake artifact; implausibly long = voice-cast leak.
4. **Character-length / duration ratio sanity:** reuse `isDurationAnomaly()` from `scripts/lib/bake-math.ts` — per-ritual rolling median with strict >3×/<0.3× thresholds. Same logic as AUTHOR-06 D-10 bake-time check; a belt-and-suspenders run at verify time in case the `.mram` was somehow generated outside the orchestrator.
5. **Metadata presence:** `metadata.audioFormat === "opus-32k-mono"` (per `deterministic-tts-bake-in-at-build-time` skill); `metadata.voiceCast` is a non-empty object (per MRAMDocument v3 shape).

**Output format:**
- **Exit code:** 0 on success, 1 on any coverage failure.
- **Stdout:** per-ritual summary table (lines checked, missing-audio count, duration-anomalies count, OK count). Same visual format as existing `verify-mram.ts` — extended section titled `=== Audio Coverage ===`.
- **Structured JSON (optional, behind `--json` flag):** machine-readable output for the release-gate script to consume.

**Where it lives:** modified `scripts/verify-mram.ts`. No new file. The checksum, role-breakdown, and section code stays as-is.

**Integration with bake-all:** bake-all already runs duration-anomaly detection at bake time (AUTHOR-06). The verifier at verify time is a belt-and-suspenders — it catches `.mram` files that were generated pre-D-10 (e.g., the existing 4 EA `.mram`s baked on 2026-04-17..22 under the v2 cache), or `.mram` files that somehow reached the distribution step with missing audio.

### CONTENT-07 release gate design

**Architectural reality:** `rituals/*-dialogue*.md` is gitignored. A GitHub Actions CI gate **cannot** check content. The CONTENT-07 requirement "every shipped `.mram` passes the cipher/plain parity validator before release" has to be enforced locally by Shannon, pre-distribution.

**Proposed shape:**

- A new `scripts/verify-content.ts` entrypoint OR a new `npm run verify-content` script alias.
- Behavior:
  1. Discover every `rituals/*.mram`.
  2. For each `.mram`:
     - Run `validatePair()` (Phase 3 validator from `src/lib/author-validation.ts`) on the paired dialogue files. Fail if either file is missing or validator returns any `severity: "error"` issue.
     - Run the extended `verify-mram.ts --check-audio-coverage`. Fail if any line is missing audio or any duration-anomaly triggers.
  3. Print a per-ritual pass/fail summary.
  4. Exit 1 on any failure.
- Shannon runs `npm run verify-content` locally before each pilot distribution round. The **pre-push git hook** can optionally call this if Shannon wants belt-and-suspenders (but because ritual content isn't pushed, the hook is really protecting against "accidentally commit a `.mram` that's incomplete" — which the `.gitignore` already prevents).

**What CONTENT-07 is NOT:**
- NOT a GitHub Actions workflow (rituals are gitignored — architecturally impossible).
- NOT a new validator — the validator already exists in `src/lib/author-validation.ts` and runs at bake time.
- NOT a replacement for the bake-time validator gate — it's an additional release-time check.

**Alternative framing:** The planner can choose to treat CONTENT-07 as **implicitly satisfied by AUTHOR-05**, since the bake-time validator already refuses on parity failures — no unvalidated `.mram` can be produced. Under that framing, CONTENT-07 becomes a documentation / invariant-tracking requirement rather than a code requirement: add a note to the checklist that every `.mram` row is evidence CONTENT-07 was enforced (because it was baked, and baking requires validator pass). This is defensible and reduces Phase 4's engineering surface to just CONTENT-06's verifier + the checklist. **Recommended framing** for minimum engineering work; the full release-gate script is a defensible expansion if Shannon wants it.

### Content-as-code tracking file (`04-CONTENT-CHECKLIST.md`)

**Purpose:** single source of truth for Phase 4 content readiness. Lives in `.planning/phases/04-content-coverage/` alongside PLAN files. Committed to git; updated as Shannon works.

**Proposed shape:**

```markdown
# Phase 4: Content Coverage — Ritual Readiness Checklist

**Updated:** <date>
**Shipping target:** 18 rituals (4 EA re-bakes + 14 fresh authoring)

## EA (Entered Apprentice) — re-bake under v3 cache

| Slug | Plain draft | Cipher draft | Voice cast | Styles | Bake | Verify | Shipped |
|------|------------|--------------|------------|--------|------|--------|---------|
| ea-opening | ✓ (existing) | ✓ (existing) | ✓ (existing) | ✓ (existing) | [ ] re-bake needed (v3 cache) | [ ] | [ ] |
| ea-initiation | ✓ | ✓ | ✓ | ✓ | [ ] re-bake needed | [ ] | [ ] |
| ea-explanatory | ✓ | ✓ | ✓ | ✓ | [ ] re-bake needed | [ ] | [ ] |
| ea-closing | ✓ | ✓ | ✓ | ✓ | [ ] re-bake needed | [ ] | [ ] |

## FC (Fellow Craft) — fresh authoring

| Slug | Plain draft | Cipher draft | Voice cast | Styles | Bake | Verify | Shipped |
|------|------------|--------------|------------|--------|------|--------|---------|
| fc-opening | [ ] | [ ] | [ ] | — | [ ] | [ ] | [ ] |
| fc-passing | [ ] | [ ] | [ ] | — | [ ] | [ ] | [ ] |
| ... | ... | ... | ... | ... | ... | ... | ... |

## MM (Master Mason) — fresh authoring

<same structure>

## Installation — fresh authoring

<same structure>

## Officer Lectures — fresh authoring

<same structure; Shannon picks which lectures are in scope during discuss>
```

**Why this structure:** each column is a clear done/not-done boolean; each row is a single unit of Shannon's work; the whole file is resumable (Shannon can Ctrl-C, come back a week later, see exactly where he is). The planner treats this file as the authoritative ledger — the `.mram` on disk is the artifact, the checklist row is the ledger entry.

## Voice Casting Strategy

### Reuse across rituals (content-addressable cache side-effect)

**Key insight [VERIFIED: existing ea-*-voice-cast.json files + gemini-tts-voice-cast-scene-leaks-into-audio skill]:** Voice profile + style + text + voice (Gemini voice ID) all participate in the cache key. If WM role uses identical `profile`/`style`/`pacing`/`accent` across EA/FC/MM/Installation, and the same line text is spoken in multiple rituals, the bake hits cache on the second ritual and spends zero API calls.

**Practical pattern:**
- Create a canonical role profile per role (WM, SW, JW, SD, JD, SS, JS, Ch, C) and **copy it verbatim** across every ritual's voice-cast JSON.
- The `scene` field CAN differ per ritual (EA initiation has different atmosphere than MM raising) — scene is per-ritual; role profiles are reused.
- This also ensures **tonal consistency** — pilots hear the same WM across all three degrees, reinforcing the rehearsal fidelity.

### Gemini voice IDs per role [VERIFIED: src/lib/tts-cloud.ts `getGeminiVoiceForRole()` function used by scripts/list-ritual-lines.ts]

The bake pipeline already maps role → Gemini voice via `GEMINI_ROLE_VOICES` (defined in `src/lib/tts-cloud.ts`). Phase 4 should NOT change this mapping; it's load-bearing for the EA bakes already shipped. If Shannon wants to change a voice, he knows it invalidates every line under that role.

### Google Cloud TTS role mapping (short-line route) [VERIFIED: AUTHOR-04 D-09 + Phase 3 Plan 06 SUMMARY]

Phase 3 shipped `GOOGLE_ROLE_VOICES` as a parallel table — short lines (`B.`, `I do.`) route through Google Cloud TTS at bake time with voice chosen to roughly match the Gemini timbre per role. Phase 4 uses this unchanged. If Shannon wants a specific role's short lines to sound different, that's a styles-file override (speakAs) or a voice-cast edit, not a mapping change.

### "No scene leaks" rule (CRITICAL)

The single load-bearing voice-cast authoring rule [VERIFIED: `gemini-tts-voice-cast-scene-leaks-into-audio` skill]:

**The `scene` field must contain ONLY atmosphere (lighting, pacing mood, stillness level). It must NOT contain station names, role names, or any noun/phrase that also appears in dialogue.**

Bad:
```json
"scene": "Low lamplight, the Worshipful Master in the East, officers at their stations."
```

Good:
```json
"scene": "Low lamplight. The brethren are rapt — every word carries weight. Nothing theatrical, nothing hurried."
```

The former caused a real incident in EA opening (line 87 "JD: On the right of the Worshipful Master in the East" baked with "officers at their stations" spoken phantom-content; docs rebuild re-rendered ~100 lines). Phase 4 Shannon must resist the temptation to describe the lodge physically in `scene`.

**Detection pattern during scrubbing:** if Shannon hears a phrase in audio that he didn't write, `grep` the voice-cast file for that phrase BEFORE assuming stochastic hallucination. Most "hallucinations" are literal preamble copies.

## Pitfalls and Known Hazards

### P1: Voice-cast scene leak into audio
**Skill:** `gemini-tts-voice-cast-scene-leaks-into-audio` [VERIFIED]
**What goes wrong:** Gemini TTS conditions on the whole prompt (preamble + style + text). If `scene` contains phrases that overlap dialogue content, audio can include phantom content or drop opening words.
**Detection:** hear a phrase you didn't write → grep voice-cast for it.
**Prevention:** keep `scene` abstract. Per-line style tags (like `"speak only the exact words given"`) do NOT fix this — confirmed by direct test.
**Cost of broad fix:** `scene` is part of cache key → changing it invalidates every preamble-using line (~long lines only).

### P2: Short-line text-token regression
**Skill:** `gemini-tts-speakas-short-line-instructional-prompt` [VERIFIED]
**What goes wrong:** Short lines (`B.`, `I do.`, `Light.`) regress with `200 OK` + empty SSE audio; bake log spins through retry rounds.
**Detection:** bake log shows `text-token regression (empty audio stream)` repeating on the same line across all keys.
**Prevention:** use `speakAs` in styles JSON: `{"lineHash": "<sha>", "style": "formal", "speakAs": "Say only this single letter name, nothing else: Bee"}`. The `scripts/list-ritual-lines.ts --grep` tool surfaces the lineHash.
**Fallback:** short lines auto-route to Google Cloud TTS if < 5 chars (AUTHOR-04 D-09) — but a 6-char line can still regress; `speakAs` is the proper fix.

### P3: Text-token regression on medium lines
**Skill:** `gemini-tts-text-token-regression-recovery-tactics` [VERIFIED]
**What goes wrong:** Same 200-OK-empty-audio, on a non-short line that shouldn't hit the short-line policy.
**Recovery tactics (escalation order):**
1. Fresh retry (Ctrl-C + re-run — same command; sometimes the stochastic serving state clears).
2. Style-tag shift — adding a style changes the cache key + prompt bytes (`"factual report"`, `"formal question"`, `"direct, measured, not slow"`). Avoid double-negative styles (`"do not spell letters"` makes it worse).
3. `speakAs` instructional prompt — full natural-language override per P2 pattern.
**Accelerator:** `GEMINI_RETRY_BACKOFF_MS=3000,5000` shortens retry cycles from ~5 min to ~8s so failed attempts tier-drop fast.
**Hash-collision trap:** if the same plain text appears in multiple line instances (e.g., `"Who comes here?"` spoken by SD, JW, SW, WM), styles key on `sha256(plain)` — the style lands on the FIRST occurrence only. Fix: use `invalidate-mram-cache.ts --lines=<id>` to target a specific instance, NOT a styles entry.

### P4: Gemini preview quota exhaustion
**Skill:** `gemini-tts-preview-quota-and-fallback-chain` [VERIFIED]
**What goes wrong:** `gemini-3.1-flash-tts-preview` returns 429 after ~30 min of testing even with billing enabled.
**Mitigation already in place:** Phase 3 D-12 pinned the 3-model fallback chain (3.1-flash → 2.5-flash → 2.5-pro); each has a separate quota bucket.
**Reset window:** midnight Pacific Time, not UTC. For overnight-bake strategy, use `--on-fallback=wait` on `bake-first-degree.ts` (or equivalent flag on `bake-all.ts`) — script sleeps until reset.
**Operational guidance:** don't run Phase 4 bakes during daytime dev testing; start large bakes at night. Use `GOOGLE_GEMINI_API_KEYS` (comma-separated pool) to rotate through multiple keys.

### P5: Ultra-short-line silent-skip
**Already mitigated:** AUTHOR-04 D-09 — lines < 5 chars auto-route to Google Cloud TTS at bake time. No line silently drops.
**Residual risk:** Google Cloud TTS mispronouncing single letters (`B.` → unclear phoneme). Phase 4 Shannon covers this via speakAs overrides in styles JSON for letter-exchanges — the existing `ea-initiation-styles.json` has 6 such overrides (Bee, Oh, Ay, Zee, Bo, Az).

### P6: Cipher-plain structural drift
**Already mitigated:** `validate-rituals.ts` enforces `structureSignature()` equality; `author-validation.ts` enforces speaker + action-cue + word-count-band parity per line; bake-all runs validator-first across every ritual before one API call.
**Residual risk:** Shannon edits the cipher file without updating the plain, structure drifts, validator fails, bake aborts. That IS the intended behavior — but it can waste Shannon's time if the failure is detected only after prep steps.
**Best practice:** edit plain + cipher TOGETHER in a single session; run `npm run validate-rituals` before every bake attempt.

### P7: Cache key bump invalidates existing EA bakes
**Context:** AUTHOR-01 D-02 bumped `CACHE_KEY_VERSION` v2 → v3. Every existing cached `.opus` file under v2 is stranded (Phase 3 migration copied but keys don't match — cache misses on first lookup).
**Impact on Phase 4:** the four existing EA `.mram` files (`ea-opening.mram`, `ea-initiation.mram`, `ea-explanatory.mram`, `ea-closing.mram`) were baked on 2026-04-17..22 under the v2 cache. On first Phase 4 bake, ALL lines across these four rituals cache-miss and re-render (~385 lines × ~6s/line = ~40 min wall clock, 385 API calls, if all pass on 3.1-flash first try).
**Budget:** this one-time re-bake burn is the single largest API cost in Phase 4. Plan accordingly — don't do it in the middle of a dev session.

### P8: Content-gitignored breaks `--since` flag
**What goes wrong:** `bake-all.ts --since HEAD~1` uses `git diff --name-only` to find changed rituals. But rituals are gitignored — `git diff` reports nothing ever changed.
**Mitigation:** `--since` is useful for scripts/library changes (e.g., `render-gemini-audio.ts` edits trigger full rebake of everything that uses the cache). For ritual-content edits, Shannon runs bake for a specific ritual slug directly: `npm run bake-all ea-initiation` (if the orchestrator supports positional slug arg — [VERIFIED: `scripts/bake-all.ts:getAllRituals()` supports default = all, and `getChangedRituals` filters by git-diff — need positional slug arg to target one). The planner should verify whether bake-all currently accepts a positional ritual-slug filter, and add it if not.
**Workaround if not:** `npx tsx scripts/build-mram-from-dialogue.ts rituals/{slug}-dialogue.md rituals/{slug}-dialogue-cipher.md rituals/{slug}.mram --with-audio`.

### P9: Voice-cast drift between EA and FC/MM
**What goes wrong:** Shannon writes a fresh voice-cast for FC that has a slightly different WM profile than EA. Per-role cache isolation is voice + style + text + preamble + model + KEY_VERSION — if any field differs, cache misses. That's fine for correctness, but it wastes quota re-rendering lines that sound identical to the EA version.
**Mitigation:** copy role profiles verbatim from `ea-initiation-voice-cast.json` for each role that appears in the new ritual. Only edit the `scene` field.

### P10: Passphrase drift across rituals
**What goes wrong:** If Shannon picks a different passphrase per ritual, pilots must remember N passphrases or need N uploads with N prompts. Breaks UX.
**Mitigation:** single passphrase across every `.mram` — use `MRAM_PASSPHRASE` env var for all bakes in a session. Existing `bake-first-degree.ts` prompts once and reuses across all four EA rituals; `bake-all.ts` should inherit this pattern via the env var.

### P11: `.mram` file size growth from aggressive voice choices
**Observation:** existing EA files range 2.4 MB (explanatory, 36 lines) to 8.7 MB (initiation, 139 lines). MM raising at ~220 lines would extrapolate to ~14 MB. That's at 32 kbps mono Opus, the standard for speech.
**Residual concern:** total .mram footprint if all 18 Phase 4 rituals are installed ≈ 100 MB. Fine on desktop; a lot for a mobile PWA over cellular. Mitigation is out of Phase 4 scope (Phase 6 admin might add lazy-load-by-ritual if it matters).

### P12: Shannon burning out on content work
**Not a technical pitfall but worth naming:** 14 fresh rituals × ~2-4 hours each of authoring work = 28-56 hours of solo Shannon time before any baking starts. Shannon's lodge cadence may not permit a sprint.
**Mitigation (planning-layer):** the per-ritual checklist is explicitly designed to be resumable across weeks. The plan structure should make "author one ritual" the atomic unit, not "author one degree."

## Code Examples

Verified patterns from existing rituals and Phase 3 infrastructure.

### Example: voice-cast JSON structure (extracted from `ea-initiation-voice-cast.json`)

```json
{
  "version": 1,
  "scene": "Low lamplight. The brethren are rapt — every word carries weight. Nothing theatrical, nothing hurried. Every word lands on a room that has gone quiet.",
  "roles": {
    "WM": {
      "profile": "The Worshipful Master — seasoned mason, late 50s. Holds the authority of the East.",
      "style": "Measured, authoritative. Carries the weight of receiving a new Brother; slightly warmer than in opening, but no less grave.",
      "pacing": "Deliberate. Pauses after formal phrases, longer pauses before the obligation itself.",
      "accent": "Educated American, hint of old East Coast."
    },
    "SD": {
      "profile": "The Senior Deacon — conducts the candidate around the lodge. The hand on the blindfolded Brother's shoulder.",
      "style": "Warm, reassuring, firm enough to guide.",
      "pacing": "Calm, protective pacing. Gives the candidate time to breathe between instructions.",
      "accent": "Educated American, neutral."
    }
  }
}
```

### Example: styles + speakAs override (extracted from `ea-initiation-styles.json`)

```json
{
  "version": 1,
  "styles": [
    {"lineHash": "97a6cc9f45cfe06584daac0656aac6d53356cced926f1db294f89768f9c7a501", "style": "reverently"},
    {"lineHash": "be651d5a8e97690fbb1fafd9b89ea7bb5458b27b1d24a449c67ca762317ac1df",
     "style": "formal",
     "speakAs": "Say only this single letter name, nothing else: Bee"}
  ]
}
```

### Example: dialogue frontmatter + first scene (extracted from `ea-explanatory-dialogue.md`)

```markdown
---
jurisdiction: Grand Lodge of Iowa
degree: Entered Apprentice
ceremony: Explanatory Lecture on the First Degree
---

## CEREMONY: Entered Apprentice Explanatory Lecture

Q: My brother, in passing through the forms and ceremonies of your initiation...
A: For two reasons: first, that I should carry nothing offensive or defensive into the lodge...
```

### Example: the single-pass bake command Shannon runs per ritual

```bash
# Full bake with all gates + verify
GOOGLE_GEMINI_API_KEYS=AIza...,AIza... GOOGLE_CLOUD_TTS_API_KEY=AIza... \
  MRAM_PASSPHRASE="your-ritual-passphrase" \
  npm run bake-all -- --parallel 4 --verify-audio

# Incremental single-ritual bake (after a styles edit)
npx tsx scripts/build-mram-from-dialogue.ts \
  rituals/fc-passing-dialogue.md \
  rituals/fc-passing-dialogue-cipher.md \
  rituals/fc-passing.mram \
  --with-audio

# Post-bake verify
npx tsx scripts/verify-mram.ts rituals/fc-passing.mram
# (Phase 4 extension:)
npx tsx scripts/verify-mram.ts rituals/fc-passing.mram --check-audio-coverage
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cipher/plain parity check | Custom regex + ad-hoc fail list | `src/lib/author-validation.ts:validatePair()` (Phase 3) | Already enforces speaker + action cue + word-ratio band; has 10 unit tests |
| Bake orchestration | Manual per-ritual builds | `npm run bake-all` (Phase 3) | Validator-first gate + resume + concurrency + since-ref already wired |
| Opus encoding | `ffmpeg` CLI spawn | Gemini/Google both return Opus natively; `render-gemini-audio.ts` handles the bytes | No re-encoding. Opus bytes from the API are cache-stored as-is. |
| Cache invalidation logic | `rm` loops in shell | `scripts/invalidate-mram-cache.ts` | Per-line, per-slug, per-model invalidation + deletion of all model-variant entries |
| `.mram` decryption + checksum | Custom Node script | `scripts/verify-mram.ts` (existing) | Already handles magic bytes, PBKDF2, AES-GCM, SHA-256 checksum |
| Dialogue file parsing | Regex splitting on `:` | `src/lib/dialogue-format.ts:parseDialogue()` | Handles frontmatter, sections, action cues, CUE roles, preserves warnings |
| Pre-bake line listing | grep | `scripts/list-ritual-lines.ts` | Shows ID + role + cache status symbol (✓/·/⨯) + speakAs marker (🎤); supports `--grep`/`--role`/`--uncached` filters |
| Single-degree bake wrapper | Shell script | `scripts/bake-first-degree.ts` (existing pattern) | Reuse this pattern for `bake-second-degree.ts` / `bake-third-degree.ts` / `bake-installation.ts` / `bake-lectures.ts` — or fold into `bake-all.ts --degree ea/fc/mm/...` |
| Per-ritual readiness tracking | Ad-hoc text file | `04-CONTENT-CHECKLIST.md` (this phase's planning-layer artifact) | Commit-tracked; resumable; visible in the planning tree |

**Key insight:** Phase 3 already built 80% of the Phase 4 engineering work. Phase 4 adds ~200 lines of `verify-mram.ts` extension + ~50 lines of `verify-content.ts` orchestration + one Markdown checklist. The bulk is content labor.

## Runtime State Inventory

> Phase 4 involves fresh content authoring + rebaking existing EA content under the v3 cache, not renames or refactors. However, because the v2→v3 cache bump has already stranded EA artifacts, there IS runtime state to inventory.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | (a) `rituals/_bake-cache/` currently empty — no v2→v3 migration has happened yet because no new bake has run. (b) Legacy `~/.cache/masonic-mram-audio/` may still contain v2-keyed `.opus` files from pre-Phase-3 bakes — harmless, `scripts/render-gemini-audio.ts:migrateLegacyCacheIfNeeded` will copy on first bake. | None — first bake triggers migration. No Phase 4 data-migration step needed. |
| Live service config | None — no external service holds ritual-specific state outside the `.mram` file itself. | None. |
| OS-registered state | None. | None. |
| Secrets/env vars | Required: `GOOGLE_GEMINI_API_KEY` (or `GOOGLE_GEMINI_API_KEYS` pool), `GOOGLE_CLOUD_TTS_API_KEY`, `GROQ_API_KEY` (for `--verify-audio` only), `MRAM_PASSPHRASE` (single ritual passphrase reused across all `.mram`s). All already in Shannon's `.env` from Phase 2/3. | None — reuse existing env. |
| Build artifacts / installed packages | The 4 existing EA `.mram` files (`ea-opening.mram`, `ea-initiation.mram`, `ea-explanatory.mram`, `ea-closing.mram`) baked under v2 cache. These files are DISTRIBUTED versions — pilots may have them installed. First Phase 4 bake produces v3-cache-baked `.mram`s with the same filename; pilots re-upload to get the fresh version (existing upload flow covers this; Phase 6 ADMIN-05 adds the stale-version banner). | Shannon re-distributes after first bake. No v2-shipped `.mram` needs deletion. |

**Nothing found in most categories:** verified by direct filesystem inspection + git log + `.gitignore` review.

## State of the Art

Phase 4 builds on Phase 3 tooling and Gemini/Google TTS APIs. No technology shift is needed.

| Old approach | Current approach | When changed | Impact |
|--------------|------------------|--------------|--------|
| Manual per-line re-rendering on edit | Content-addressed cache (AUTHOR-01) | Phase 3 (2026-04-23) | Single-line edit = 1 API call, not 155 |
| Serial Gemini calls per ritual | `p-limit`-capped parallelism (AUTHOR-09) | Phase 3 (2026-04-23) | 4× speedup on warm-quota runs |
| Silent ultra-short-line skips | Google Cloud TTS auto-route (AUTHOR-04) | Phase 3 (2026-04-23) | Every spoken line baked; no runtime TTS |
| No cipher/plain drift detection | Validator-first bake gate (AUTHOR-05) | Phase 3 (2026-04-23) | Parity violation fails bake before API cost |
| No audio-duration sanity check | Per-ritual rolling-median anomaly detector (AUTHOR-06) | Phase 3 (2026-04-23) | Catches voice-cast scene leak into audio |
| STT round-trip not verified | Optional `--verify-audio` Whisper diff (AUTHOR-07) | Phase 3 (2026-04-23) | Warn-only; ~$0.01/ritual when run |
| In-browser preview unavailable | `scripts/preview-bake.ts` localhost-only (AUTHOR-08) | Phase 3 (2026-04-23) | Scrub audio before re-encrypting |
| Line-level resume unsupported | `_RESUME.json` atomic writes (D-06) | Phase 3 (2026-04-23) | Ctrl-C-safe mid-bake |

**Deprecated / outdated:**
- `scripts/bake-first-degree.ts` — superseded by `scripts/bake-all.ts`. Shannon may still use it for single-degree convenience, but the orchestrator is the go-forward tool. Phase 4 planner can choose to leave bake-first-degree.ts intact (low maintenance cost) OR remove it (but that's a Phase 3 cleanup, not Phase 4 scope).
- Cache at `~/.cache/masonic-mram-audio/` — migrated out by Phase 3 D-01. Directory may still exist but is not read/written after first bake under v3.

## Dogfooding Loop

**How Shannon rehearses a ritual on his own deployed pilot to catch audio glitches before it goes to pilot users:**

Phase 3's `preview-bake.ts` covers cache scrubbing (per-line Opus playback from the local cache, before re-encryption). The remaining loop is **rehearsal-fidelity** on a deployed `.mram`:

1. **Local bake + scrub:** Shannon runs `bake-all` → `preview-bake` → fixes issues → re-bakes. Covered by Phase 3.
2. **Local upload to dev pilot:** Shannon runs `next dev`, opens `http://localhost:3000/practice`, drags-drops the fresh `.mram`, types passphrase. Rehearses one full ceremony as each role.
3. **Deploy-preview upload to production:** Shannon uploads the same `.mram` to `masonicmentor.app` (production Vercel deploy), signs in with his admin magic link, rehearses the same ceremony. Catches any encoding/decoding drift between local and production environments (there shouldn't be any — the `.mram` is byte-identical and client-side-decrypted — but belt-and-suspenders).
4. **Shannon rehearses as pilot-user:** as one of the allowlisted emails, sign in via magic link, verify the upload-and-rehearse flow works end-to-end as a pilot would experience it.

**No new engineering needed** for the dogfooding loop — existing pilot flow covers it. The planner should include a per-ritual "dogfood" step in the checklist: `✓ dogfooded on masonicmentor.app` column alongside `✓ shipped`.

## Environment Availability

Phase 4 inherits Phase 3's environment. All tools are already installed and have been used end-to-end in Phase 3 verification (517/517 tests passing across 43 files).

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node 22+ | All scripts | ✓ | (per Phase 3) | — |
| `tsx` | All `npx tsx scripts/*` invocations | ✓ | (dev-dep) | — |
| `p-limit` | `bake-all.ts` concurrency cap | ✓ | 7.3.0 (Phase 3 added) | — |
| `music-metadata` | AUTHOR-06 duration-anomaly; Phase 4 verifier audio-coverage check | ✓ | (Phase 3 added) | — |
| Google Gemini API key(s) | Long-line TTS bake | ✓ (Shannon's existing) | — | `GOOGLE_GEMINI_API_KEYS` pool for quota rotation |
| Google Cloud TTS API key | Short-line (<5 char) TTS bake | ✓ (Shannon's existing) | — | — |
| Groq API key | `--verify-audio` Whisper round-trip | ✓ (Shannon's existing) | — | Warn-only; bake succeeds without it |
| `MRAM_PASSPHRASE` env var | `.mram` encryption in bake, decryption in verify | ✓ | — | Interactive TTY prompt if not set |
| `git` | `bake-all --since` | ✓ | — | Irrelevant for Phase 4 because ritual content is gitignored |
| Vercel CLI | Deploy `.mram` to pilot (optional) | ✓ (Shannon uses) | — | Direct file share |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

**Confidence:** HIGH — verified by Phase 3 execution completing successfully with this exact environment.

## Validation Architecture

Phase 4 uses **Nyquist validation** (per `.planning/config.json:workflow.nyquist_validation: true`). Each engineering surface has an automated test that runs in < 30 seconds. Content-labor work (ritual authoring) is verified by the verifier + preview-bake scrubbing and is covered by human UAT, not unit tests.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `vitest` (Phase 3 baseline: 517 tests across 43 files, all green) |
| Config file | `vitest.config.ts` (repo root) |
| Quick run command | `npx vitest run --no-coverage <pattern>` (single file or glob) |
| Full suite command | `npx vitest run --no-coverage` |
| Phase gate | Full suite green before `/gsd-verify-work` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONTENT-01..05 | EA/FC/MM/Installation/Lectures baked with per-line Opus | manual / human | `npx tsx scripts/verify-mram.ts rituals/{slug}.mram --check-audio-coverage` (per ritual, Shannon runs) | Requires CONTENT-06 verifier to exist; content is human-authored |
| CONTENT-06 | Verifier asserts every spoken line has `audio`; detects missing coverage | unit | `npx vitest run --no-coverage scripts/__tests__/verify-mram.test.ts` | ❌ Wave 0 (no test file exists for verify-mram.ts today) |
| CONTENT-06 | Verifier decodes Opus bytes correctly; detects corrupted/truncated audio | unit | same as above | ❌ Wave 0 |
| CONTENT-06 | Verifier duration-anomaly detection (reuses `scripts/lib/bake-math.ts:isDurationAnomaly`) | unit (already exists for bake-math) + new integration | `npx vitest run --no-coverage scripts/__tests__/verify-mram.test.ts -t anomaly` | ❌ Wave 0 |
| CONTENT-07 | Release-gate script runs validator + verifier across all `.mram`s; exits 1 on any failure | unit (pure orchestration) | `npx vitest run --no-coverage scripts/__tests__/verify-content.test.ts` | ❌ Wave 0 (script doesn't exist yet) |
| CONTENT-07 | Bake-time validator gate already verified (Phase 3 AUTHOR-05) | already covered | `npx vitest run --no-coverage src/lib/__tests__/author-validation.test.ts` | ✅ (10 tests) |
| Checklist file integrity | Checklist markdown parses; every required ritual row exists | manual (it's a planning doc, not code) | N/A — visual inspection | N/A |

### Sampling Rate

- **Per task commit:** `npx vitest run --no-coverage scripts/__tests__/verify-mram.test.ts` (Phase 4 fast check) + `npx vitest run --no-coverage src/lib/__tests__/author-validation.test.ts` (Phase 3 baseline not regressed)
- **Per wave merge:** `npx vitest run --no-coverage scripts/__tests__/` (all script tests)
- **Phase gate:** Full suite `npx vitest run --no-coverage` green — total grows from 517 baseline to ~530+ with new tests; no pre-existing test should regress.

### Wave 0 Gaps

- [ ] `scripts/__tests__/verify-mram.test.ts` — new file; covers CONTENT-06 behavior (audio coverage, Opus decode, duration sanity, metadata shape)
- [ ] `scripts/__tests__/verify-content.test.ts` — new file; covers CONTENT-07 release-gate orchestration (discover `.mram`s, pair-validate, verify each, aggregate pass/fail)
- [ ] Test fixtures: a deliberately-broken `.mram` (one line missing `audio`) + a known-good `.mram`. **Challenge:** test-fixture `.mram` files are 3-8 MB; committing them bloats the repo. **Mitigation:** synthesize tiny fixture `.mram` files on-the-fly in the test (encrypt 2-3 lines with a known passphrase) OR store fixtures in `scripts/__tests__/fixtures/` with size caps (each < 100KB — feasible by limiting audio to single-line samples).

*(No framework install needed — vitest is Phase 3 baseline.)*

## Recommended Plan Breakdown

The recommended plan structure matches Phase 4's labor-split: **1 engineering plan (Wave 0, blocks everything) + 1 checklist plan (Wave 0, parallel to engineering) + 4 content plans (Wave 1+, any order) + 1 verification plan (Wave Final)**.

```
Phase 4: Content Coverage
├── Wave 0 (blocks everything; engineering + tracking)
│   ├── 04-01-verifier-and-release-gate-PLAN.md
│   │     → Extend scripts/verify-mram.ts with --check-audio-coverage
│   │     → Add scripts/verify-content.ts (release-gate orchestrator)
│   │     → Add npm run verify-content alias in package.json
│   │     → Unit tests: scripts/__tests__/verify-mram.test.ts + verify-content.test.ts
│   │     → Fixture strategy: synthesize tiny .mram at test-time from a 2-line dialogue
│   │     → Requirements: CONTENT-06, CONTENT-07
│   │
│   └── 04-02-content-checklist-PLAN.md
│         → Create .planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md
│         → Seed rows for EA (4 re-bakes), FC (4 fresh), MM (4 fresh), Installation (1), Lectures (5-9 — Shannon finalizes set)
│         → Add column helpers + legend + instructions for Shannon
│         → Document the edit-commit-propagate loop (checklist IS the ledger)
│         → Requirements: none directly — supports all CONTENT-* tracking
│
├── Wave 1 (content work; plans independent; run in any Shannon-picked order)
│   ├── 04-03-ea-rebake-PLAN.md
│   │     → Re-bake 4 existing EA rituals under v3 cache (one-time burn ~40 min)
│   │     → Verify each via --check-audio-coverage
│   │     → Update checklist rows
│   │     → Requirements: CONTENT-01
│   │
│   ├── 04-04-fc-authoring-and-bake-PLAN.md
│   │     → Author fc-opening, fc-passing, fc-middle-chamber-lecture, fc-closing
│   │     → Each: plain draft → cipher draft → voice-cast → bake → scrub → styles → rebake → verify
│   │     → Requirements: CONTENT-02
│   │
│   ├── 04-05-mm-authoring-and-bake-PLAN.md
│   │     → Author mm-opening, mm-raising, mm-hiramic-legend (if split from raising), mm-closing
│   │     → Same per-ritual pipeline as FC
│   │     → Requirements: CONTENT-03
│   │
│   ├── 04-06-installation-authoring-and-bake-PLAN.md
│   │     → Author installation (single long ritual)
│   │     → Same per-ritual pipeline
│   │     → Requirements: CONTENT-04
│   │
│   └── 04-07-lectures-authoring-and-bake-PLAN.md
│         → Author 5-9 officer-lecture units (Shannon picks which during discuss)
│         → Simpler per-ritual (shorter, typically single-role)
│         → Requirements: CONTENT-05
│
└── Wave Final (all prior plans complete before this runs)
    └── 04-08-phase-release-verification-PLAN.md
          → Run `npm run verify-content` across all 18 shipped .mram files
          → Dogfood each on masonicmentor.app (upload + rehearse one full ceremony per ritual)
          → Close out checklist — all rows "shipped"
          → Update STATE.md, ROADMAP.md, REQUIREMENTS.md (CONTENT-01..07 → Complete)
          → Requirements: all CONTENT-* final verification
```

**Total plans:** 8.

**Wave structure rationale:**
- **Wave 0 must land first** (verifier + checklist) — all later plans depend on the verifier for per-ritual acceptance and on the checklist for progress tracking.
- **Wave 1 plans are independent** — content work on FC doesn't block MM; Shannon can work on whichever ritual his mental bandwidth supports on a given day. The checklist is the join table.
- **Wave Final is strictly blocked** on every Wave 1 plan completing — it's the "all-rituals verified, all shipped" gate that closes the phase.

**Per-content-plan task shape (per Wave 1 plan):** each plan's tasks are per-ritual authoring pipeline steps. One task = "author and bake fc-opening"; subtasks = draft plain → draft cipher → validate parity → write voice-cast → first bake → scrub preview → styles edits → re-bake → verify → update checklist. The task acceptance criterion is `verify-mram.ts --check-audio-coverage` passing + `validate-rituals.ts` clean + the corresponding checklist row updated.

**Alternative plan structures considered and rejected:**

- **One plan per ritual (18 plans total):** too granular. Per-ritual authoring is a unit of Shannon-labor; clustering by degree matches his mental model (he'll batch write all of FC in one focused session).
- **One plan for "all content" (1 plan total):** too coarse. Loses per-ritual resumability; the checklist helps but the plan structure should mirror it.
- **Merge verifier + checklist into Wave 1 content plans:** violates Wave 0 principle — verifier is a dependency for content plans' acceptance criterion. Must land first.
- **Skip Wave Final:** risk of drift between individual ritual "done" claims and the aggregate phase completion. The Wave Final plan is cheap (mostly documentation) and provides the closing evidence.

## Cost + Effort Estimates

### Shannon-labor (calendar time)

Per fresh ritual, rough authoring effort assuming Shannon has the printed/memorized text in front of him:

| Step | Time per ritual (avg line count ~100) |
|---|---|
| Draft plain dialogue | 1-2 hours (careful transcription from printed source) |
| Draft cipher dialogue | 0.5-1 hour (applying jurisdiction cipher conventions) |
| Validate parity + fix drift | 15-30 minutes |
| Write voice-cast JSON | 15 minutes (copy role profiles from EA; write scene atmosphere) |
| First bake + wait | 10-20 minutes wall-clock (plus Gemini time)
| Scrub in preview-bake | 30-60 minutes (listen to every line) |
| Styles edits + re-bakes | 30-60 minutes (multiple iterations for regression-prone lines) |
| Verify + dogfood | 15 minutes |
| **Per-ritual total** | **3-5 hours** |

**Phase 4 aggregate Shannon-time:**
- 4 EA re-bakes: ~1 hour each (no fresh authoring; just bake + scrub + verify) = 4 hours
- 4 FC fresh: ~4 hours each = 16 hours
- 4 MM fresh: ~4-5 hours each = 16-20 hours
- 1 Installation fresh: ~6-8 hours (longest) = 8 hours
- 5-9 Lecture shorts: ~1.5-2 hours each = 8-18 hours

**Grand total estimate:** 52-66 hours of Shannon-time, spread across ~4-8 weeks of calendar time assuming 8-15 hours/week of content labor. **Calendar-time is the binding constraint, not engineering.**

### API cost ($ estimate)

Using Gemini TTS preview pricing [CITED: https://ai.google.dev/gemini-api/docs/pricing — preview tier is free within daily caps; if Shannon hits a paid tier, Gemini TTS is roughly $0.06 per 1M characters input; for a typical ritual's preamble-prefixed prompt volume ~60-80K input chars per 100-line ritual, that's ~$0.005/ritual] and Google Cloud TTS Studio pricing [CITED: https://cloud.google.com/text-to-speech/pricing — Studio voices $0.000016 per char for standard; short lines average ~20 chars × ~20 short lines/ritual × $0.000016 = ~$0.006/ritual].

| Cost center | Per ritual | Phase 4 total (18 rituals) |
|---|---|---|
| Gemini TTS (long lines via preview) | free within daily cap; $0.001-0.01 if paid | $0-$0.20 |
| Google Cloud TTS (short lines) | $0.005-0.01 | $0.10-0.20 |
| Groq Whisper (`--verify-audio`) | $0.01/ritual × at most 1 verify-pass | $0.18 |
| **Phase 4 API total** | **$0.02-0.05** | **$0.30-0.60** |

`[ASSUMED]` These estimates assume Shannon runs most bakes on free/preview Gemini tier. If he's rate-limited and falls to paid, costs rise proportionally — but even at paid-tier volumes, Phase 4 is a sub-dollar phase. Dwarfed by Phase 5 (coach LLM per-user-session costs).

### Wall-clock (real time spent on API calls, not Shannon-time)

| Activity | Time |
|---|---|
| Full cold bake per ritual (~100 lines × ~6s fresh) | 10-20 min |
| Per-line re-bake after cache warm | ~6-10s |
| `--verify-audio` per ritual | +~2 min (Groq Whisper) |
| Full Phase 4 bake (all 18 rituals, cold cache, no parallelism across rituals) | ~5-7 hours |
| Full Phase 4 bake with `--parallel 4` per-line (current orchestrator) | ~4-5 hours |
| **Estimated total wall-clock time across all bake sessions** | **~6-8 hours across the phase, split across 8+ sessions** |

**Not the binding constraint.** Shannon's authoring time dwarfs wall-clock API time.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Phase 4 ritual scope is EA + FC + MM + Installation + 5-9 lectures ≈ 14-18 fresh rituals | Ritual Taxonomy | Over/under-scoping — Shannon confirms exact lecture set during discuss |
| A2 | FC scene count is ~4 (opening, passing, middle chamber lecture, closing) and MM is ~4 (opening, raising, Hiramic legend, closing) | Ritual Taxonomy | Jurisdiction-specific; Iowa GL may split/merge scenes differently. Confirm from Shannon's lodge's working. |
| A3 | Typical line count per ritual ~100-220 | Ritual Taxonomy / Cost | Off by ≤2× is plausible; doesn't change plan structure, only wall-clock estimates |
| A4 | CONTENT-07 is acceptable to enforce locally (no GitHub CI gate) | CONTENT-07 Design | Low — architectural constraint (rituals gitignored) makes GH Actions impossible. If Shannon rejects local-only, Phase 4 needs to explore "ship minimal ritual fixtures in git for CI" which is a separate large decision. |
| A5 | Shannon wants CONTENT-06 verifier extended into existing `verify-mram.ts` rather than a new file | Engineering Surfaces | Low — a new file is trivially substitutable if Shannon prefers. |
| A6 | The existing EA bakes must be re-baked under v3 cache before Phase 4 ships | Phase 3 state | Very low — AUTHOR-01 D-02 explicitly bumped v2→v3 for correctness; Phase 3 Plan 05 comments explicitly call out the re-bake cost. |
| A7 | The per-ritual authoring pipeline in Content Authoring Workflow is the right order | Content Authoring Workflow | Low — matches existing EA workflow Shannon has used for ea-initiation + ea-closing. |
| A8 | bake-all.ts currently takes `--since`/`--dry-run`/`--resume`/`--parallel` but NOT positional slug arg for single-ritual targeting | Pitfall P8 | Medium — verifiable by reading `scripts/bake-all.ts:parseFlags`. If positional arg exists, P8 mitigation simplifies; if not, planner can add it as a tiny enhancement in Wave 0. |
| A9 | The checklist file is a planning-layer artifact (committed to git); the `.mram` files it tracks are not (gitignored) | Content-as-code tracking | Very low — matches Phase 1/2/3 planning file conventions. |
| A10 | Per-ritual effort estimate of 3-5 hours is representative | Cost + Effort Estimates | Medium — wide variance depending on how fluently Shannon writes cipher and how regression-prone the specific ritual is. Real data will be generated by the first fresh ritual baked. |

## Open Questions

1. **Exact lecture set** — Which officer lectures are "core" for Shannon's lodge? Likely WM charge + SW/JW duties; possibly Secretary, Treasurer, Chaplain, Deacons, Stewards, Tiler. Count ranges 5-9; individual units are small (~25-40 lines each).
   - What we know: REQUIREMENTS.md says "any core lectures specified by Shannon's lodge"
   - What's unclear: the specific list
   - Recommendation: discuss-phase asks Shannon to enumerate. Plan structure accommodates either end of 5-9.

2. **FC vs MM scene split** — Are middle-chamber-lecture and Hiramic-legend separate rehearsal units, or embedded in passing/raising? Standalone is better for practice (more granular rehearsal units) but means more bakes.
   - What we know: The existing EA pattern SPLIT explanatory lecture out from initiation (see `ea-explanatory-dialogue.md` — separate file, separate `.mram`).
   - What's unclear: Shannon's preference for FC and MM split.
   - Recommendation: discuss-phase confirms; default to SPLIT to match EA precedent and give finer-grained practice units.

3. **Installation scope** — Is this the full annual installation (all officers installed in sequence, ~1hr) or just the WM installation (~20 min)? Big delta in line count.
   - What we know: REQUIREMENTS.md says "Annual officer installation ceremony"
   - What's unclear: "annual" could mean all officers or just the key ones
   - Recommendation: discuss-phase confirms scope; the estimated 250-line count assumes full.

4. **Pilot distribution mechanism** — Once a ritual is baked and verified, how does Shannon push it to pilots? Currently: direct file share (email/drop). Phase 6 will add ADMIN-05 latest-hashes endpoint, but that's deferred. For Phase 4 UX, does Shannon want an interim "upload-new-version" channel (like a shared Dropbox folder, or emailing each pilot)?
   - What we know: Pilots use drag-and-drop upload at `/practice`
   - What's unclear: the distribution channel
   - Recommendation: out-of-scope for Phase 4; existing pattern works. Phase 6 formalizes.

5. **Voice-cast authorial reuse** — Should Shannon write one "canonical" voice-cast JSON that all rituals include-by-reference, or copy role profiles verbatim into each ritual file?
   - What we know: Current files each have their own self-contained voice-cast
   - What's unclear: whether a shared `rituals/_voice-cast-canonical.json` is worth building
   - Recommendation: defer. Copy-paste works; a shared schema adds complexity for limited benefit at 18-ritual scale. Revisit for Phase 4 v2 / other-jurisdiction content.

## Security Domain

Phase 4 introduces zero new user-facing surfaces. The content authoring pipeline is dev-only (per AUTHOR-08 dev-guard), bake scripts run on Shannon's local machine, and `.mram` artifacts are encrypted with AES-256-GCM + PBKDF2 before distribution (existing mechanism). No new attack surface.

### Applicable ASVS categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No new auth surface — Phase 4 is content/bake only |
| V3 Session Management | no | Same |
| V4 Access Control | yes (indirectly) | `.mram` passphrase remains the single secret; Shannon must keep MRAM_PASSPHRASE out of git and env commits (existing Phase 2 discipline) |
| V5 Input Validation | yes | Dialogue file parsing uses `parseDialogue()` with hardened warnings path (Phase 3); no user input at runtime |
| V6 Cryptography | yes | `.mram` encryption unchanged — AES-256-GCM + PBKDF2-SHA256 310K iterations (OWASP 2023 min) |

### Known threat patterns for this phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Shannon accidentally commits `rituals/*.md` / `.mram` | Information Disclosure | `.gitignore:110-115` already excludes; pre-commit hook optional belt-and-suspenders |
| `.mram` distributed with missing audio (degraded rehearsal UX) | Denial of Service (quality) | CONTENT-06 verifier + Wave 0 tests |
| Passphrase reused across pilots or leaked via env dump | Information Disclosure | Documented discipline (already Phase 2); `MRAM_PASSPHRASE` env var discipline; no change for Phase 4 |
| Ritual content exposed via server-side log | Information Disclosure | ESLint PII rule (Phase 2 D-09/D-10) prevents any route from ever logging ritual text; bake pipeline is local-only |
| Voice-cast scene leak causes audio hallucination | Integrity (content) | Skill-based authoring discipline + AUTHOR-06 duration-anomaly detector catches extreme leaks |

## Sources

### Primary (HIGH confidence)

- `scripts/verify-mram.ts` [VERIFIED: local file, 263 lines] — existing decrypter + checksum verifier (Phase 4 verifier extends this)
- `scripts/validate-rituals.ts` [VERIFIED: local file, 333 lines] — existing cipher/plain structure validator
- `scripts/bake-all.ts` [VERIFIED: local file, 486 lines per Phase 3 SUMMARY] — Phase 3 orchestrator entrypoint
- `src/lib/author-validation.ts` [VERIFIED: local file, 249 lines per Phase 3 verification] — cipher/plain parity validator (speaker + action + word-ratio gates)
- `src/lib/mram-format.ts` [VERIFIED: local file] — MRAM format v3 with optional `audio` field per line + `metadata.voiceCast` + `metadata.audioFormat`
- `rituals/ea-initiation-voice-cast.json` [VERIFIED: local file] — voice-cast JSON v1 schema example
- `rituals/ea-initiation-styles.json` [VERIFIED: local file] — styles JSON v1 schema with speakAs overrides example
- `.gitignore` [VERIFIED: local file lines 110-115] — ritual content exclusion pattern
- `.planning/phases/03-authoring-throughput/03-CONTEXT.md` [VERIFIED: local file, 275 lines] — Phase 3 locked decisions D-01..D-21 that Phase 4 inherits
- `.planning/phases/03-authoring-throughput/03-VERIFICATION.md` [VERIFIED: local file] — Phase 3 success criteria status (7/7 structurally verified)
- `.planning/REQUIREMENTS.md` [VERIFIED: local file] — CONTENT-01..07 requirement definitions
- `.planning/ROADMAP.md` [VERIFIED: local file] — Phase 4 goal + success criteria (5 items)

### Secondary (MEDIUM-HIGH confidence — skill references authored from real project incidents)

- `~/.claude/skills/deterministic-tts-bake-in-at-build-time/SKILL.md` [VERIFIED: fetched + read] — architectural pattern for bake-at-build-time; 100:1 API savings; Opus at 32kbps; cache-key strategy
- `~/.claude/skills/gemini-tts-voice-cast-scene-leaks-into-audio/SKILL.md` [VERIFIED] — P1 voice-cast scene-leak pitfall + mitigation (keep scene abstract)
- `~/.claude/skills/gemini-tts-preview-quota-and-fallback-chain/SKILL.md` [VERIFIED] — P4 preview quota pitfall + 3-model fallback chain + midnight-PT reset
- `~/.claude/skills/gemini-tts-text-token-regression-recovery-tactics/SKILL.md` [VERIFIED] — P3 medium-line regression + 3 escalation tactics (retry, style shift, speakAs)
- `~/.claude/skills/gemini-tts-speakas-short-line-instructional-prompt/SKILL.md` [VERIFIED] — P2 short-line speakAs pattern for letter-exchanges

### Tertiary (verify before relying)

- `[CITED: https://ai.google.dev/gemini-api/docs/pricing]` — Gemini TTS pricing (preview free within cap; paid tier ~$0.06/1M input chars). Not re-verified for this phase; estimates based on stable pricing model.
- `[CITED: https://cloud.google.com/text-to-speech/pricing]` — Google Cloud TTS Studio voices pricing. Same caveat.
- `[ASSUMED]` Iowa GL jurisdiction-specific ritual scene splits — Shannon's lodge's working is the authority.

## Metadata

**Confidence breakdown:**
- **Engineering surfaces (verifier + release gate + checklist):** HIGH — every upstream tool exists; work is additive and <300 LOC total.
- **Ritual taxonomy (scene counts, lecture set):** MEDIUM — jurisdiction-specific; Shannon confirms during discuss.
- **Pitfalls and hazards:** HIGH — every major pitfall is backed by a `~/.claude/skills/` entry with real-project incident citations.
- **Effort estimates:** MEDIUM — Shannon's authoring pace will be observed during Wave 1; planners can revise.
- **Plan breakdown:** HIGH — Wave 0 engineering + Wave 1 content + Wave Final verification matches the labor split cleanly.
- **CI design (local, not GH Actions):** HIGH — architectural constraint (gitignored rituals) forces this.

**Research date:** 2026-04-23
**Valid until:** 30 days (stable — tooling is Phase-3-complete, no framework churn expected)

## RESEARCH COMPLETE
