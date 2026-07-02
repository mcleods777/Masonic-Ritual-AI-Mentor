# .mram Bake Workflow — Canonical Reference

This is the single source of truth for building encrypted `.mram` ritual files with embedded pre-rendered audio. When in doubt, look here first.

An orchestrator, a per-ritual builder, one canonical audio cache, a passphrase you type interactively, and a set of CLI flags that control what happens when Gemini's preferred TTS model runs out of daily quota mid-ritual — plus (Phase 3) a short-line fallback engine, three correctness gates, a tier-aware bake manifest, and a browser-based scrubber for reviewing audio before you re-encrypt.

---

## TL;DR

Bake everything that changed since the last run (the daily driver):

```bash
GOOGLE_GEMINI_API_KEY=AIza... \
GOOGLE_CLOUD_TTS_API_KEY=AIza... \
GROQ_API_KEY=gsk_... \
npx tsx scripts/bake-all.ts --changed-only
```

Build one ritual with embedded audio directly:

```bash
GOOGLE_GEMINI_API_KEY=AIza... \
GOOGLE_CLOUD_TTS_API_KEY=AIza... \
GROQ_API_KEY=gsk_... \
npx tsx scripts/build-mram-from-dialogue.ts \
  rituals/ea-opening-dialogue.md \
  rituals/ea-opening-dialogue-cipher.md \
  rituals/ea-opening.mram \
  --with-audio
```

If you hit Gemini's daily cap mid-bake on a NORMAL line, the script detects the tier drop, prompts you, and — as of Phase 3 (D-08 keep-and-upgrade) — **keeps** the fallback-tier render in cache rather than deleting it; a later re-bake upgrades just that line to the preferred model once quota resets. Every line, short or long, always gets baked audio — there is no more "too short to bake" skip (D-01).

Scrub what you just baked before re-encrypting:

```bash
npx tsx scripts/preview-bake.ts
# open http://127.0.0.1:8883
```

---

## The scripts

**Primary bake pipeline:**

| Script | Purpose |
|--------|---------|
| `scripts/bake-all.ts` | **Daily driver.** Multi-ritual orchestrator: discovers rituals, selects via `--changed-only` (content-hash, not git), validates every selected pair before spawning anything, fans out to `build-mram-from-dialogue.ts` (one child process per ritual) under a `--parallel N` cap, supports `--dry-run` and ritual-granularity `--resume`. |
| `scripts/build-mram-from-dialogue.ts` | Core builder — one ritual per invocation. What `bake-all.ts` spawns; also fine to run directly for a single ritual. |
| `scripts/bake-first-degree.ts` | Older wrapper — runs the three EA (1st degree) rituals back-to-back with one passphrase prompt. Still works; `bake-all.ts` is the more general daily driver and the one to reach for going forward (any ritual set, `--changed-only`, `--parallel`). |
| `scripts/render-gemini-audio.ts` | Internal — Gemini audio rendering + the canonical content-addressed cache (imported, not run directly). |
| `scripts/lib/google-tts.ts` | Internal — Google Cloud TTS short-line fallback call (D-02). Raw text only, structurally cannot see the preamble builder. |
| `scripts/lib/stt-verify.ts` | Internal — direct Groq Whisper STT round-trip verifier (AUTHOR-07/D-03). |
| `scripts/lib/bake-math.ts` | Internal — pure duration-anomaly math (AUTHOR-06) and the word-diff used by the STT gate. |
| `scripts/lib/validate-or-fail.ts` | Internal — the single shared parity-validator gate both `bake-all.ts` and `build-mram-from-dialogue.ts` call, so it can't drift between the two call sites. |
| `scripts/lib/resume-state.ts` | Internal — atomic `_RESUME.json` read/write, shared contract for both orchestrator-level and (now) per-line resume. |
| `scripts/build-mram.ts` | **Legacy** — single-file paired-text format (cipher + plain lines interleaved in one `.md`). Kept working for older ritual sources; new rituals should use `build-mram-from-dialogue.ts`. |

**Multi-ritual maintenance / migration:**

| Script | Purpose |
|--------|---------|
| `scripts/migrate-bake-cache.ts` | **One-time step** — re-keys every surviving cache entry from the old `~/.cache/masonic-mram-audio/` (v2 key, no `modelId`) location to the canonical `rituals/_bake-cache/` (v3 key, `modelId`-qualified) location, at zero re-render cost, assuming premium provenance. Dry-run by default; `--yes` to execute. Run this once per machine before the first Phase-3-era bake; safe to re-run (idempotent — already-migrated entries are skipped). |
| `scripts/preview-bake.ts` | Localhost-only (127.0.0.1, refuses any other bind) browser scrubber over `rituals/_bake-cache/`. Lists rituals → lines → streams the cached `.opus` for a selected line so you can listen before re-encrypting. Reads the D-08 tier-aware `_INDEX.json` when present (shows a `[fallback]` badge) and falls back to a directory listing when it isn't. Dev-only — refuses to start under `NODE_ENV=production`. |

**Pre-bake validation:**

| Script | Purpose |
|--------|---------|
| `scripts/validate-rituals.ts` | Local-only integration check for `rituals/*-dialogue.md`. Verifies plain + cipher parse, structure parity, round-trip stability, reports speaker breakdowns. Not wired into CI (the plaintext files are gitignored) — run manually after editing either dialogue file. |

**Post-bake inspection:**

| Script | Purpose |
|--------|---------|
| `scripts/verify-mram.ts` | Decrypt and validate a built `.mram` file. Reports format version, metadata, section + line count, role breakdown, checksum, and samples a few lines. Use to confirm a bake produced the file you expected before distributing. |
| `scripts/list-ritual-lines.ts` | Print every line in a ritual with its MRAM id, role, cache status, and text. `✓` = cached (Gemini premium tier), `✓g` = cached via the D-02 Google fallback tier only, `·` = not cached. There is no more `⨯` hard-skip state (D-01). Use to match a problem audio line you heard back to its id, then invalidate + re-bake. Supports `--grep`, `--role`, `--uncached` filters. |

**Post-bake maintenance:**

| Script | Purpose |
|--------|---------|
| `scripts/invalidate-mram-cache.ts` | Delete specific cache entries so the next bake re-renders just those lines. Use when you listened to the baked audio and heard one line you don't like — you don't want to nuke the whole cache. Takes `--lines 66,75,83` (ids from `list-ritual-lines.ts`), supports dry-run by default. For short lines it checks and can delete BOTH the Gemini padded-prompt entry and the Google fallback entry (D-01/D-02) — a short line can have up to two cache files. |
| `scripts/rotate-mram-passphrase.ts` | Re-encrypt one or more `.mram` files with a new passphrase. Use when the old passphrase has leaked or you want to rotate on a schedule. Content bytes (including embedded audio) are preserved; fresh random salt + IV per file so the old ciphertext can't be re-used. Supports `MRAM_OLD_PASSPHRASE` + `MRAM_NEW_PASSPHRASE` env vars for CI. |

See the header comment of each script for complete flags, examples, and gotchas.

---

## Source files per ritual

For each `{slug}` (e.g., `ea-opening`, `ea-initiation`, `ea-closing`) you need:

```
rituals/
├── {slug}-dialogue.md          # plain English, YAML frontmatter required
├── {slug}-dialogue-cipher.md   # cipher/abbreviated, no frontmatter
├── {slug}-styles.json          # OPTIONAL — per-line Gemini style tags
├── {slug}-voice-cast.json      # OPTIONAL — director's-notes preamble + per-role googleVoice pin
└── {slug}.mram                 # OUTPUT — built artifact
```

**Parity is enforced — and now refuses the whole bake, not just a warning.** Every `ROLE: text` speaker line in the plain file must have a matching speaker line in the cipher file, in the same order, with the same speaker, and (AUTHOR-05 D-08) the plain/cipher word-count ratio must stay within `[0.5x, 2x]`. `validate-or-fail.ts` runs this gate at the start of both `bake-all.ts` (before any child spawns) and `build-mram-from-dialogue.ts` (before any API call) — the exact same shared function, so the two can't disagree. There is no bypass flag; the intent is "fix the cipher line," not "ship an `.mram` that scores wrong."

**Frontmatter goes only on the plain file.** The cipher file has no frontmatter by design (avoids lockstep risk). Required fields in the plain frontmatter:

```yaml
---
jurisdiction: Grand Lodge of Iowa
degree: Entered Apprentice
ceremony: Opening on the First Degree
---
```

**Styles sidecar is optional.** Format: `{ "version": 1, "styles": [...] }`. Each entry maps a line (by content hash) to a Gemini prompt-direction string. Supports both single-word tags (`gravely`) and multi-clause directives (`solemnly, with slight tremor`) — lowercase letters, spaces, commas, hyphens, apostrophes allowed, up to 80 chars. If the sidecar is missing, the ritual builds fine with no style direction.

**Voice-cast sidecar is optional but high-impact.** Format: `{ "version": 1, "scene": "...", "roles": { "WM": { "profile": "...", "style": "...", "pacing": "...", "accent": "...", "other": "...", "googleVoice": "en-US-Neural2-D" }, ... } }`. When present, the bake prepends a structured director's-notes preamble to every line that role speaks:

```
AUDIO PROFILE: {profile}
THE SCENE: {scene}

DIRECTOR'S NOTES
Style: {style}
Pacing: {pacing}
Accent: {accent}
Notes: {other}

TRANSCRIPT
[inline style] {line text}
```

This pins each role's character across every line — Gemini holds a much more consistent performance with measured gravitas on the Worshipful Master, crisp officiousness on the Junior Deacon, etc. — than it does with just a single `[gravely]` tag per line. The preamble lives at bake time only; the runtime `/api/tts/gemini` route keeps its lightweight single-tag format for any uncached-line fallback.

**`googleVoice` (D-04, new in Phase 3).** Pin a role's Google Cloud TTS voice for the D-02 short-line fallback engine. If unset, a role's short lines that need the Google fallback use the documented default (`en-US-Neural2-D`) and the bake output flags it once so you know to pin a closer match. This field is engine-routing metadata only — it is structurally never read by the Gemini preamble builder and never appears in a Gemini prompt.

**The cache key incorporates the preamble AND the model that rendered the line (D-07).** Editing a role's card in `{slug}-voice-cast.json` invalidates just the lines that role speaks — other roles' cache entries remain valid. Premium (preferred-model) and fallback-tier (lower-model, or Google-engine) renders of the exact same line coexist under distinct keys — see "Keep-and-upgrade," below.

**Starter template.** `rituals/` is gitignored so no checked-in example file lives there. Copy this template, save it as `rituals/{slug}-voice-cast.json`, and edit to taste. Role codes must match the canonical MRAM role IDs (not the dialogue-file speaker labels) — the canonical set is `WM`, `SW`, `JW`, `SD`, `JD`, `Sec`, `Trs`, `Tyl`, `Ch`, `Vchr`, `ALL`, `C`, `SS`, `JS` (see `ROLE_MAP` in `src/lib/dialogue-to-mram.ts`).

```json
{
  "version": 1,
  "scene": "A lodge of Entered Apprentices opening in deep of night. Low lamplight, officers at their stations, brethren rapt. Nothing theatrical, nothing hurried.",
  "roles": {
    "WM": {
      "profile": "The Worshipful Master — seasoned mason, late 50s. Holds the authority of the East.",
      "style": "Measured, authoritative. Slight gravitas, never theatrical.",
      "pacing": "Deliberate. A small pause after each formal phrase.",
      "accent": "Educated American, hint of old East Coast.",
      "other": "Speaks as one who has said these words a thousand times and still means them.",
      "googleVoice": "en-US-Neural2-D"
    },
    "SW": {
      "profile": "The Senior Warden — the Master's second, steward of the column in the West.",
      "style": "Clear, measured, slightly warmer than the Master. Less distance, same weight.",
      "pacing": "Steady. Responsive to the Master — answers land squarely after the question settles.",
      "accent": "Educated American, neutral.",
      "googleVoice": "en-US-Neural2-A"
    },
    "JW": {
      "profile": "The Junior Warden — watches over the craft at refreshment, station in the South.",
      "style": "Steady, mid-register. A shade lighter than Senior Warden but still formal.",
      "pacing": "Even-tempered.",
      "accent": "Educated American, neutral."
    },
    "SD": {
      "profile": "The Senior Deacon — attends the Master, carries his orders.",
      "style": "Smooth, warm, slightly brighter. The messenger between East and West.",
      "pacing": "Responsive, prompt. Announces without delay but never rushed.",
      "accent": "Educated American, neutral."
    },
    "JD": {
      "profile": "The Junior Deacon — guards the inner door, attends the Wardens.",
      "style": "Crisp, distinct, firm.",
      "pacing": "Brisk but formal. No mumbling, no trailing off.",
      "accent": "Educated American, neutral."
    },
    "Ch": {
      "profile": "The Chaplain — the lodge's voice in prayer.",
      "style": "Reverent, quiet weight. The room drops into stillness when he speaks.",
      "pacing": "Slow. Long breaths between phrases.",
      "accent": "Educated American, softer register."
    },
    "Tyl": {
      "profile": "The Tyler — guards the outer door. Veteran of many lodges.",
      "style": "Laid-back, resonant. Older, a little gravelly.",
      "pacing": "Unhurried. Speaks when spoken to.",
      "accent": "Educated American, perhaps a trace of the old South or Midwest."
    }
  }
}
```

Every field is optional — fill in what you know, leave the rest out. Author effort scales with how many roles speak substantively in the ritual. Expected shape: 5-10 minutes to draft a cast file per ritual once you have the template; a couple more minutes if you're pinning `googleVoice` for every role.

---

## Short-line policy (AUTHOR-04, D-01/D-02/D-03/D-04)

**Every line gets baked audio. There is no more hard-skip.** The old `<11 chars → skip → runtime TTS` bucket is gone entirely — a 2-character line like `"B."` gets exactly as much baked-audio guarantee as a full sentence.

For lines under `SHORT_LINE_MAX_CHARS` (default 11, tune via the env var of the same name):

1. **Gemini first, via instructional padding.** The bake sends Gemini a longer, explicit instruction — `"Say only these exact words, nothing else: B."` — instead of the raw short text. This is the technique documented in the `gemini-tts-speakas-short-line-instructional-prompt` memory skill: a longer PROMPT with a short constrained OUTPUT clears Gemini's text-token-regression failure mode on ultra-short content without changing what's actually spoken. No preamble is applied on this path (an instruction this explicit doesn't benefit from — and can be confused by — a director's-notes preamble layered on top).
2. **Validated before being trusted.** The padded render must pass the duration-anomaly gate (always) and, by default, an STT round-trip check against Groq Whisper (D-03, **provisional** — see below) before the bake accepts it.
3. **On gate failure, Google Cloud TTS fallback (D-02).** The RAW line text — never the padded prompt, never a preamble — goes straight to Google Cloud TTS using the role's pinned `googleVoice` (or the documented default). Google's cache entry is keyed under its own `google:<voice>` model id (D-07) so it never collides with — or masquerades as — a Gemini render.
4. **If BOTH engines fail, the bake refuses.** Non-zero exit, the specific line named in the error. It never silently ships an `.mram` with a missing line.

**D-03 is provisional.** Shannon was AFK for the exact validation-gate decision at plan-review time; the shipped default is duration-anomaly + STT round-trip on every short-line padded render. If that turns out to be too aggressive (false-positive gate trips sending too many lines to the non-Gemini voice), pass `--no-short-line-stt` to downgrade to duration-only validation for short lines. Confirm with Shannon at the next checkpoint whether the default should change.

---

## The three correctness gates

| Gate | Requirement | Fired on | What a failure does |
|------|-------------|----------|----------------------|
| **Parity validator** (AUTHOR-05) | Plain/cipher structure match + `[0.5x, 2x]` word-count band | Every bake, before any API call | Refuses the WHOLE bake — no bypass |
| **Duration anomaly** (AUTHOR-06) | Line's sec/char within `[0.3x, 3.0x]` of the ritual's running median | Every freshly-rendered line, once ≥30 samples exist this run (30-line warm-up window; logs and skips before that) | Short lines: routes to the Google fallback. Normal lines: refuses the bake for that line (no fallback engine exists for lines ≥ `SHORT_LINE_MAX_CHARS`) |
| **STT round-trip** (AUTHOR-07) | Zero missed AND zero inserted words vs. a direct Groq Whisper transcript | Short-line padded renders by default (D-03); any freshly-rendered line with `--verify-audio` | Same as duration anomaly — Google fallback for short lines, bake refusal for normal lines |

None of these run against cache hits — a line only gets gated the run it's actually rendered. A cache entry is only ever written once it passed its gates, so a later cache hit is trusted without re-paying for STT.

---

## Keep-and-upgrade (D-08) — fallback-tier renders are never thrown away

**Old behavior (pre-Phase-3):** a quality-tier drop (Gemini falls to 2.5-flash/pro) that you aborted on deleted the just-rendered cache entry, so the re-run after quota reset re-rendered it from scratch.

**Current behavior:** because the cache key now includes the model id (D-07), a premium render and a fallback-tier render of the exact same line coexist under DIFFERENT keys — they can't collide. So the abort path no longer deletes anything. A re-run's premium-model cache LOOKUP simply misses (it's checking a different key than what's on disk), which naturally triggers a fresh render on the preferred model — no explicit "upgrade" logic needed, it falls out of the key design.

The one case that DOES still delete a cache entry: a **gate failure** on a short-line padded-Gemini render (wrong content, not merely lower-quality content) is deleted before falling back to Google, so a future run doesn't cache-hit invalid audio.

Every fresh render — Gemini premium, Gemini fallback-tier, or Google-engine — gets an entry in `rituals/_bake-cache/_INDEX.json`:

```json
{
  "cacheKey": "…64-hex-chars…",
  "model": "gemini-3.1-flash-tts-preview",
  "ritualSlug": "ea-opening",
  "lineId": 42,
  "byteLen": 18422,
  "durationMs": 1830,
  "createdAt": "2026-07-02T18:04:11.000Z",
  "tier": "premium"
}
```

`tier` is `"premium"` only when the line rendered on the preferred model; anything else — a lower Gemini tier or the Google engine — is `"fallback"`. `scripts/preview-bake.ts` reads this file to show a `[fallback]` badge in the scrubber UI.

---

## CLI flags — `bake-all.ts` (the daily driver)

```
Usage: npx tsx scripts/bake-all.ts [--changed-only] [--since [ref]] \
  [--dry-run] [--resume] [--parallel <N>] \
  [--on-fallback=ask|continue|abort|wait] [--help]
```

| Flag | Default | Behavior |
|------|---------|----------|
| `--changed-only` | off (bakes everything) | Re-bake only rituals whose plain OR cipher dialogue file content-hash changed since the last recorded bake (`rituals/_bake-cache/_manifest.json`). This is the "single-line edit" workflow: edit a line, run `bake-all.ts --changed-only`, only that ritual's changed lines re-render — everything else, in every other ritual, cache-hits. |
| `--since [ref]` | — | **Deprecated compat alias** for `--changed-only`. Prints a warning; the `ref` value is accepted but IGNORED — `git diff` can never see `rituals/*.md` because those files are permanently gitignored, so git-ref-based change detection is impossible here. Use `--changed-only`. |
| `--dry-run` | off | Print a per-ritual roll-up. Still runs the parity-validator gate. Zero spawns, zero API calls. |
| `--resume` | off | Skip ritual slugs already recorded as completed in `rituals/_bake-cache/_RESUME.json` from a prior interrupted run. **Ritual granularity** today (not per-line) — `build-mram-from-dialogue.ts` now supports its own `--resume-state-path` for per-line resume (see below), which a future revision of `bake-all.ts` can wire through to get per-line granularity without changing the underlying `_RESUME.json` contract. |
| `--parallel <N>` | 4 | Max concurrent ritual bakes (each its own `build-mram-from-dialogue.ts` child process). Clamped to `[1, 16]`. |
| `--on-fallback=...` | `ask` | Forwarded to each child verbatim. **Refused when `--parallel > 1` and this is `ask` or `wait`** — an interactive pause on one child while siblings keep running is confusing at best. Use `continue` or `abort` with `--parallel > 1`. |

Passphrase is prompted once here, then passed to every child via the `MRAM_PASSPHRASE` env var — never via argv (visible in `ps` output).

---

## CLI flags — `build-mram-from-dialogue.ts`

```
Usage: npx tsx scripts/build-mram-from-dialogue.ts \
  <plain.md> <cipher.md> <output.mram> \
  [--with-audio] \
  [--on-fallback=ask|continue|abort|wait] \
  [--verify-audio] [--no-short-line-stt] \
  [--resume-state-path=<file>]
```

| Flag | Default | Behavior |
|------|---------|----------|
| `--with-audio` | off | Render every spoken line to Opus and embed the bytes in the encrypted payload. Without this, the `.mram` is text-only (~20-50 KB); with it, ~1-6 MB depending on ritual length. |
| `--on-fallback=ask` | **default** | Prompt once (y/N) the first time Gemini 3.1-flash (the preferred tier) hits quota and a line falls back to 2.5-flash or 2.5-pro. Interactive. Google-engine short-line fallback (D-02) does NOT trigger this prompt — that's expected, documented behavior, not a surprise quality regression. |
| `--on-fallback=continue` | — | Silently continue on the fallback tier. Suitable for CI or "I want the file now, quality can be mixed" scenarios. |
| `--on-fallback=abort` | — | Exit with code 2 on first Gemini quality-tier drop. |
| `--on-fallback=wait` | — | Lock to the preferred model only (no fallback chain). If daily quota exhausts, sleep until midnight Pacific Time and auto-resume. **Best mode for overnight bakes.** |
| `--verify-audio` | off | Run the AUTHOR-07 STT round-trip gate on EVERY freshly-rendered line (not just short ones). A mismatch fails the bake for that line. Costs one Groq call per freshly-rendered line — pennies, but not zero, hence opt-in for normal-length lines. |
| `--no-short-line-stt` | off (STT is ON by default for short lines) | Disable the DEFAULT-ON D-03 STT round-trip check that otherwise always runs on short-line padded-Gemini renders. Downgrades short-line validation to duration-only. See "D-03 is provisional," above. |
| `--resume-state-path=<file>` | unset | Persist per-line bake progress to `<file>` (the same atomic `_RESUME.json` shape `bake-all.ts` uses). On a later run pointed at the same file, lines already marked complete are read directly from the on-disk cache — bypassing a render call entirely — rather than re-validated. If the cache was cleared between runs, this self-heals (falls through to a normal render + gate cycle). |

**Passphrase is never passed on the command line.** It's read interactively with echo disabled (raw-mode stdin), or from `MRAM_PASSPHRASE` env var when stdin is not a TTY (CI, the orchestrator).

---

## CLI flags — `bake-first-degree.ts`

```
Usage: GOOGLE_GEMINI_API_KEY=... npx tsx scripts/bake-first-degree.ts \
  [--on-fallback=ask|continue|abort]
```

| Flag / env | Default | Behavior |
|------------|---------|----------|
| `--on-fallback=...` | `ask` | Passed through to each child build subprocess. If any child aborts with code 2, the wrapper halts the whole sequence. |
| `BAKE_SKIP=` env | — | Comma-separated list of slugs to skip. Example: `BAKE_SKIP=ea-closing` |
| `MRAM_PASSPHRASE` env | — | Non-interactive passphrase (the wrapper normally sets this internally from the one prompt it runs at start). |

Rituals whose source dialogue files don't exist in `rituals/` are silently skipped. `bake-all.ts` supersedes this for general use (any ritual set, `--changed-only`, `--parallel`); this wrapper still works and is fine to keep using for a "just the three EA rituals" habit.

---

## Preview / scrub server — `preview-bake.ts` (AUTHOR-08)

```bash
npx tsx scripts/preview-bake.ts
# http://127.0.0.1:8883
# PREVIEW_BAKE_PORT=9999 npx tsx scripts/preview-bake.ts   # different port
```

A read-only, dev-only, loopback-only HTTP server over `rituals/_bake-cache/`. Opens a page listing every ritual with cached audio, drills into per-line rows, and streams each `.opus` for playback (HTTP Range-request support, so the browser's native audio scrubber works). Where `_INDEX.json` exists, each row shows a `[fallback]` badge for any line that rendered on a non-preferred tier — the fastest way to spot which lines are worth a premium re-bake later. Best-effort merges Shannon's informal `rituals/{slug}-review.json` per-line status when present.

**Workflow:** bake → open `localhost:8883` → listen for anything wrong → note the line id → `invalidate-mram-cache.ts --lines <id>` → re-bake → re-encrypt/ship.

Refuses to bind to anything but `127.0.0.1`/`::1`, and refuses to run at all under `NODE_ENV=production` — it's a local authoring tool, never a deployed surface.

---

## Environment variables

| Variable | Required? | What it controls |
|----------|-----------|-------------------|
| `GOOGLE_GEMINI_API_KEY` (or `GOOGLE_GEMINI_API_KEYS`, comma-separated pool) | yes for `--with-audio` | Gemini API key(s). Get one at [aistudio.google.com](https://aistudio.google.com/). A pool rotates through keys on 429, multiplying effective daily quota. |
| `GOOGLE_CLOUD_TTS_API_KEY` | **now load-bearing** — required for a full `--with-audio` bake that has any short line whose Gemini padded render fails validation (D-02) | Google Cloud TTS key for the short-line fallback engine. Absent → the bake warns at startup and REFUSES any short line that needs the fallback. |
| `GROQ_API_KEY` | **now load-bearing** — required for the D-03 default-on short-line STT gate and `--verify-audio` | Direct Groq Whisper key for the STT round-trip verifier. Absent → the bake warns at startup and silently skips STT checks (duration-anomaly gate still runs). |
| `GEMINI_TTS_MODELS` | optional | Comma-separated override of the 3-model fallback chain. First entry is treated as the "preferred" tier for quality-drop detection. Default: `gemini-3.1-flash-tts-preview,gemini-2.5-flash-preview-tts,gemini-2.5-pro-preview-tts`. |
| `SHORT_LINE_MAX_CHARS` | optional | Threshold (default `11`) below which a line routes through the D-02 short-line path instead of a normal render. |
| `MRAM_PASSPHRASE` | optional | Passphrase when stdin is not a TTY. `bake-all.ts`/`bake-first-degree.ts` use this to share one passphrase across every child. |
| `VOICE_CAST_MIN_LINE_CHARS` | optional | Unrelated, unchanged threshold (default `40`) below which a line skips the voice-cast PREAMBLE (still gets baked audio either way — this only controls whether the director's-notes preamble is attached). |

`XDG_CACHE_HOME` is no longer read by the bake pipeline — the cache moved in-repo (see below). It only matters as the SOURCE location `migrate-bake-cache.ts` reads from during the one-time migration.

---

## The audio cache

**Location (D-06): `rituals/_bake-cache/`** — in-repo, gitignored, next to the ritual content it belongs to. This replaced the old `~/.cache/masonic-mram-audio/` (or `$XDG_CACHE_HOME/masonic-mram-audio/`) location, which is retired.

**One-time migration.** If you have an existing cache at the old location, run the migration once per machine:

```bash
npx tsx scripts/migrate-bake-cache.ts            # dry run — prints the plan
npx tsx scripts/migrate-bake-cache.ts --yes       # execute
```

This re-keys every surviving entry (both the old live cache and Shannon's manual `rituals/_bake-cache/` backup snapshot, deduped) to the new v3 key format at ZERO re-render cost, assuming every surviving entry is premium-tier provenance (the old bake deleted fallback-tier entries on abort, so anything that survived to today was either premium or an un-aborted fallback render — see the script's own header comment for the full assumption). Idempotent — safe to re-run.

**Key (v3, D-07): `sha256(CACHE_KEY_VERSION | text | style | voice | modelId | preamble)`** — content-addressed, and now records provenance. `modelId` is either a Gemini model id (`gemini-3.1-flash-tts-preview`, etc.) or, for the D-02 Google fallback, `google:<voice-name>` (e.g. `google:en-US-Neural2-D`) — so a Gemini render and a Google render of the identical line text can never collide or masquerade as each other.

**Format:** one `.opus` file per cache key. Each file is 32 kbps mono Opus-in-Ogg, ready to ship without re-encoding.

**Atomic writes:** each cache entry is staged as `{key}.opus.tmp` and renamed on completion. Killing the process mid-write leaves nothing corrupt — the rename is the commit point.

**`_INDEX.json`** — the D-08 tier-aware bake manifest, also atomic tmp+rename. One entry per FRESH render (not cache hits) with `{cacheKey, model, ritualSlug, lineId, byteLen, durationMs, createdAt, tier}`. Read by `preview-bake.ts` for the `[fallback]` badge.

**`_manifest.json`** — the content-hash change-detection manifest `bake-all.ts --changed-only` reads/writes. Not the same file as `_INDEX.json` — this one tracks which RITUALS have changed since their last bake, not per-line render provenance.

### What survives Ctrl-C

Every line rendered before you hit Ctrl-C is in cache. Re-running the same command picks up from the first unrendered line — **provided the text, style, voice, AND model haven't changed**.

### What invalidates a cache entry

The cache key changes if any of these change:
- The plain text of the line (for a short line, this means the RAW text — the padded instructional prompt is derived from it and changes in lockstep)
- The per-line style tag in the `{slug}-styles.json` sidecar
- The voice name assigned to the role in `GEMINI_ROLE_VOICES` (or `googleVoice` in the voice-cast sidecar, for the fallback tier)
- The model that actually rendered it (premium vs. fallback vs. Google — D-07)

Any change produces a different SHA-256, which means the old entry is still there on disk but is never hit. If you edit a single word in one line, only that line re-renders; everything else is a cache hit.

### Forcing a full re-render

```bash
rm -rf rituals/_bake-cache/*.opus rituals/_bake-cache/_INDEX.json
```

(Leave `_manifest.json` if you still want `--changed-only` to work off prior selection history, or delete everything for a totally clean slate.) Use this when you want to re-bake everything from scratch.

---

## Gemini quota + tier-drop flow

Every spoken normal-length line is rendered by calling Gemini's `streamGenerateContent` SSE endpoint with the role's assigned voice and the line's style tag. The 3-model fallback chain is:

1. `gemini-3.1-flash-tts-preview` — **preferred**, highest quality, tightest quota
2. `gemini-2.5-flash-preview-tts` — fallback, different quota bucket
3. `gemini-2.5-pro-preview-tts` — fallback, different quota bucket

**On 429 or 404 from a model:** try the next one. Each model has its own separate daily quota, so a 429 on the first doesn't mean the second is also exhausted.

**On 429 from all three:** sleep until next midnight Pacific Time and retry the whole chain. `Intl.DateTimeFormat` with `timeZone: "America/Los_Angeles"` handles DST correctly.

**Per-line tier drop:** a normal line served by any model other than the preferred tier counts as a quality drop. This fires the `--on-fallback` path. Short lines that land on the D-02 Google engine do NOT fire this path (see "Short-line policy," above).

**The prompt fires once per run.** Your decision (continue or abort) covers every subsequent Gemini fallback line in that run — no repeated prompts.

---

## Recognizing a clean vs mixed bake

The final summary prints a per-model/engine breakdown:

```
Audio bake complete:
  Rendered via API:  150
    Per-model/engine breakdown:
      gemini-3.1-flash-tts-preview        150 lines  (preferred)
  Cache hits:        0
  Bytes added (pre-encrypt):  4.87 MB Opus
  Voice cast: WM=Alnilam, SW=Charon, JW=Algenib, SD=Fenrir, ...
```

One model listed under `(preferred)` with the full line count = uniform premium bake. Good to ship.

```
Audio bake complete:
  Rendered via API:  150
    Per-model/engine breakdown:
      gemini-3.1-flash-tts-preview        146 lines  (preferred)
      gemini-2.5-flash-preview-tts          2 lines  (fallback)
      google:en-US-Neural2-D                2 lines  (fallback)
  Cache hits:        0
  Fallback-tier (kept, D-08 keep-and-upgrade): 4 line(s)
    id=94 WM: "B." — google:en-US-Neural2-D
    ...
```

Mixed-tier entries, including any `google:<voice>` lines, are listed under "Fallback-tier (kept...)" — a quick way to see exactly which lines are candidates for a later premium upgrade re-bake.

---

## Typical workflows

### First time setup for a new ritual degree

1. Author `rituals/{slug}-dialogue.md` (plain English) with frontmatter
2. Author `rituals/{slug}-dialogue-cipher.md` (cipher, same line structure)
3. Optional: author `rituals/{slug}-styles.json` for per-line direction, `rituals/{slug}-voice-cast.json` for character preambles + `googleVoice` pins
4. Run the builder once without `--with-audio` to verify structure:
   ```
   npx tsx scripts/build-mram-from-dialogue.ts \
     rituals/{slug}-dialogue.md \
     rituals/{slug}-dialogue-cipher.md \
     rituals/{slug}.mram
   ```
5. If the text-only build works, add `--with-audio` and go.

### Single-line edit re-bake (the everyday case)

Edit the dialogue file, then:

```bash
npx tsx scripts/bake-all.ts --changed-only
```

Only the ritual whose dialogue changed gets re-processed; within it, only the changed line(s) miss cache — everything else, including every OTHER ritual, is untouched. Typical time: seconds.

### Fresh nightly bake of everything

```bash
GOOGLE_GEMINI_API_KEY=AIza... \
GOOGLE_CLOUD_TTS_API_KEY=AIza... \
GROQ_API_KEY=gsk_... \
npx tsx scripts/bake-all.ts --parallel 4 --on-fallback=continue
```

Enter passphrase once. Walk away. Cold-cache time scales with total line count across every ritual; near-instant if you're just rebuilding from cache.

### You hit quota mid-bake and want the cleanest possible resume

1. See the `⚠ Quality-tier drop detected` banner
2. Answer `n` to the prompt (or use `--on-fallback=abort`)
3. Wait for midnight PT (or longer — your call)
4. Re-run the exact same command
5. Lines rendered on preferred tier skip the API; the fallback-tier line(s) automatically upgrade on the re-run (D-08 keep-and-upgrade — no manual cleanup needed)

### You need the file NOW, mixed quality is acceptable

1. Answer `y` to the prompt (or use `--on-fallback=continue`)
2. Bake finishes with mixed-tier audio (fallback-tier lines are KEPT in cache, D-08)
3. Ship it
4. Later, when you want uniform premium: just re-bake — fallback-tier lines automatically try the preferred model again since their premium-key cache lookup still misses

### You want to start the bake before bed and wake up to a finished premium file

```bash
GOOGLE_GEMINI_API_KEY=AIza... npx tsx scripts/bake-first-degree.ts --on-fallback=wait
```

(Or `bake-all.ts --on-fallback=wait --parallel 1` for a broader ritual set — `wait` mode is inherently serial-friendly since it never mixes tiers.)

Enter the passphrase, close the laptop. The bake runs as far as your daily quota lets it, then when the preferred model's quota exhausts, the script sleeps until midnight Pacific Time and auto-resumes. No prompts to answer, no tier degradation.

Practical notes:
- Machine has to stay awake during the sleep. On macOS: `caffeinate -i npx tsx scripts/...`. On Linux: prevent suspend via your power-management settings.
- If you start the bake *after* midnight PT but your quota is already gone from earlier in the day, you'll sleep all the way until the NEXT midnight (~24 hours). Check your quota status first.
- Cache is preserved during the sleep. Ctrl-C at any point is safe — next run resumes where you left off.

### Scrub before you ship

```bash
npx tsx scripts/preview-bake.ts
# http://127.0.0.1:8883
```

Listen through anything you're unsure about, note line ids for anything wrong, `invalidate-mram-cache.ts --lines <ids>`, re-bake, re-encrypt.

---

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success. File written (or `--dry-run`/nothing-to-bake completed cleanly). |
| 1 | Build failure — missing files, invalid args, passphrase problem, parity-validator refusal, both-engines-failed on a short line, duration-anomaly/`--verify-audio` refusal on a normal line, etc. |
| 2 | User (or `--on-fallback=abort`) aborted on a Gemini quality-tier drop. Cache is preserved (D-08 — nothing is deleted); re-running after quota reset upgrades the fallback-tier lines automatically. |

`bake-all.ts` halts the whole run on the first ritual failure and reports both the failure and the remaining "not attempted" rituals. `bake-first-degree.ts` propagates exit 2 from any child.

---

## File format notes

- Format version: `3` (current). v1 and v2 files still decrypt fine — added fields (style, audio, voiceCast, audioFormat) are optional on old readers.
- Encryption: AES-256-GCM + PBKDF2-SHA256, 310,000 iterations, 16-byte salt, 12-byte IV.
- Binary layout: `MAGIC(4) | VERSION(1) | SALT(16) | IV(12) | CIPHERTEXT+AUTHTAG(rest)`.
- Passphrase is never stored anywhere, never written to logs, never transmitted. You lose it, you lose the file.

See `src/lib/mram-format.ts` for the canonical format spec.

---

## Phase 3 UAT — deferred human checks

These three checks need a real `GOOGLE_GEMINI_API_KEY` and are currently blocked by that key's absence on this machine's `.env` as of this plan's execution. They are the human-verification path for the phase's timing/throughput success criteria and should be run by Shannon (or whoever has the key) before the phase is considered fully closed:

1. **Single-line edit re-bakes in under a minute.** Edit one line in an already-fully-baked ritual's dialogue file, run `bake-all.ts --changed-only`, and time it. Expected: seconds, not minutes — only that one line should miss cache.
2. **EA rituals rebake backfills the previously-skipped short lines.** The three existing EA `.mram` files have ~32 lines that were hard-skipped under the old (pre-D-01) threshold logic. Re-bake them (`bake-all.ts --changed-only` won't pick this up since the dialogue text hasn't changed — force it with `invalidate-mram-cache.ts` on the affected line ids, or a full cache clear for those three rituals) and confirm every one of those lines now has embedded audio, with no silent gaps. This is also the natural end-to-end test of the whole D-01/D-02/D-03 short-line path against real ritual content.
3. **Preview-server listen-through.** Start `preview-bake.ts`, open `localhost:8883`, and actually listen to a sample of freshly-baked lines (including a few short/fallback-tier ones) to confirm the scrubber UI and the audio itself both hold up in practice, not just in unit tests.

Track completion of these three in the phase's `HUMAN-UAT.md` file, same convention as prior phases.

---

## Troubleshooting

**"ffmpeg not found in PATH"** — install it:
- macOS: `brew install ffmpeg`
- Ubuntu/Debian: `sudo apt install ffmpeg`
- Windows: `winget install ffmpeg`

`ffprobe` (part of the same ffmpeg suite) is also required as of Phase 3 — it powers the AUTHOR-06 duration-anomaly gate. If `ffmpeg` is in PATH, `ffprobe` almost always is too (same install).

**"GOOGLE_GEMINI_API_KEY env var is required"** — get a key at [aistudio.google.com](https://aistudio.google.com/) and either export it (`export GOOGLE_GEMINI_API_KEY=AIza...`) or prepend it inline.

**"GOOGLE_CLOUD_TTS_API_KEY is not set" warning, then a refusal partway through a bake** — a short line's Gemini padded render failed validation and there's no fallback engine configured. Set `GOOGLE_CLOUD_TTS_API_KEY` (already present in `.env.example`) or accept that any short line needing the fallback will block the bake.

**"GROQ_API_KEY is not set" warning** — the D-03 default-on short-line STT check and `--verify-audio` silently no-op without it (duration-anomaly gate still runs). Set `GROQ_API_KEY` for full validation coverage.

**A short line keeps falling back to Google even though it "should" work on Gemini** — check the bake log for the specific gate that tripped (duration anomaly vs STT mismatch). If it's a persistent, content-correlated failure, consider whether the padded-prompt wording needs adjustment (see the `gemini-tts-speakas-short-line-instructional-prompt` memory skill for alternative phrasings) — this script generates one fixed prompt shape; hand-tuning per-line prompts is out of this phase's scope.

**"stdin is not a TTY and MRAM_PASSPHRASE env var is not set"** — you're running non-interactively (piped stdin, CI, nohup). Either run in a real terminal or set `MRAM_PASSPHRASE`.

**Build hangs after "Pairing and building MRAMDocument..."** — the passphrase prompt is waiting for input. Scroll up; it's not easily visible once the build log has advanced.

**Cache seems stale — I edited a line but the old audio is playing** — the cache key hashes `(text, style, voice, modelId, preamble)`, so any content change invalidates it. If you're seeing old audio anyway, confirm the `.mram` file on the device was re-uploaded after the rebuild — the client caches the decrypted doc in IndexedDB.

**`bake-all.ts --parallel 4 --on-fallback=ask` refuses immediately** — `ask`/`wait` require an interactive single-child prompt, which doesn't compose with concurrent children. Use `--parallel 1`, or `--on-fallback=continue`/`abort` with `--parallel > 1`.

---

## See also

- `README.md` — project overview, includes a shorter version of this doc
- `src/lib/mram-format.ts` — `.mram` binary format definition and encrypt/decrypt logic
- `src/lib/tts-cloud.ts` — `GEMINI_ROLE_VOICES` map (role → voice name)
- `src/lib/voice-cast.ts` — director's-notes preamble builder + `VoiceCastRole`/`VoiceCastFile` schema (including `googleVoice`)
- `scripts/render-gemini-audio.ts` — audio pipeline internals (inline comments document the SSE parsing, WAV assembly, and Opus encoding, plus the canonical `computeCacheKey`)
- `scripts/build-mram-from-dialogue.ts` — the per-ritual bake pipeline (short-line routing, all three gates, the tier-aware bake manifest — all documented inline)
- `scripts/lib/` — `google-tts.ts`, `stt-verify.ts`, `bake-math.ts`, `validate-or-fail.ts`, `resume-state.ts`, `cache-manifest.ts`
- `TODOS.md` — outstanding work on the fallback/error-banner UX
