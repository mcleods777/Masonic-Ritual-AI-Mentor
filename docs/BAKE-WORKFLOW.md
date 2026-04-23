# .mram Bake Workflow — Canonical Reference

This is the single source of truth for building encrypted `.mram` ritual files with embedded pre-rendered audio. When in doubt, look here first.

Two scripts, one audio cache, a passphrase you type interactively, and a set of CLI flags that control what happens when Gemini's preferred TTS model runs out of daily quota mid-ritual.

---

## TL;DR

Build one ritual with embedded audio:

```bash
GOOGLE_GEMINI_API_KEY=AIza... \
npx tsx scripts/build-mram-from-dialogue.ts \
  rituals/ea-opening-dialogue.md \
  rituals/ea-opening-dialogue-cipher.md \
  rituals/ea-opening.mram \
  --with-audio
```

Bake all three EA rituals with one passphrase prompt:

```bash
GOOGLE_GEMINI_API_KEY=AIza... npx tsx scripts/bake-first-degree.ts
```

If you hit Gemini's daily cap mid-bake, the script detects the tier drop, prompts you, and on abort deletes the contaminated cache entry so your re-run after midnight PT produces a uniform premium bake.

---

## The scripts

**Primary bake pipeline:**

| Script | Purpose |
|--------|---------|
| `scripts/build-mram-from-dialogue.ts` | Core builder — one ritual per invocation |
| `scripts/bake-first-degree.ts` | Wrapper — runs all EA (1st degree) rituals back-to-back with one passphrase. Parallel FC / MM scripts will follow when those degrees are added. |
| `scripts/render-gemini-audio.ts` | Internal — audio rendering pipeline (imported, not run directly) |
| `scripts/build-mram.ts` | **Legacy** — single-file paired-text format (cipher + plain lines interleaved in one `.md`). Kept working for older ritual sources; new rituals should use `build-mram-from-dialogue.ts`. |

The wrapper is what you'd normally use. The builder is what you reach for if you only have one ritual to rebuild.

**Pre-bake validation:**

| Script | Purpose |
|--------|---------|
| `scripts/validate-rituals.ts` | Local-only integration check for `rituals/*-dialogue.md`. Verifies plain + cipher parse, structure parity, round-trip stability, reports speaker breakdowns. Not wired into CI (the plaintext files are gitignored) — run manually after editing either dialogue file. |

**Post-bake inspection:**

| Script | Purpose |
|--------|---------|
| `scripts/verify-mram.ts` | Decrypt and validate a built `.mram` file. Reports format version, metadata, section + line count, role breakdown, checksum, and samples a few lines. Use to confirm a bake produced the file you expected before distributing. |
| `scripts/list-ritual-lines.ts` | Print every line in a ritual with its MRAM id, role, cache status, and text. Use to match a problem audio line you heard back to its id, then invalidate + re-bake. Supports `--grep`, `--role`, `--uncached` filters. |

**Post-bake maintenance:**

| Script | Purpose |
|--------|---------|
| `scripts/invalidate-mram-cache.ts` | Delete specific cache entries so the next bake re-renders just those lines. Use when you listened to the baked audio and heard one line you don't like — you don't want to nuke the whole cache. Takes `--lines 66,75,83` (ids from `list-ritual-lines.ts`), supports dry-run by default. |
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
├── {slug}-voice-cast.json      # OPTIONAL — director's-notes preamble per role
└── {slug}.mram                 # OUTPUT — built artifact
```

**Parity is enforced.** Every `ROLE: text` speaker line in the plain file must have a matching speaker line in the cipher file, in the same order, with the same speaker. The builder validates this before encrypting and refuses to write a mismatched pair.

**Frontmatter goes only on the plain file.** The cipher file has no frontmatter by design (avoids lockstep risk). Required fields in the plain frontmatter:

```yaml
---
jurisdiction: Grand Lodge of Iowa
degree: Entered Apprentice
ceremony: Opening on the First Degree
---
```

**Styles sidecar is optional.** Format: `{ "version": 1, "styles": [...] }`. Each entry maps a line (by content hash) to a Gemini prompt-direction string. Supports both single-word tags (`gravely`) and multi-clause directives (`solemnly, with slight tremor`) — lowercase letters, spaces, commas, hyphens, apostrophes allowed, up to 80 chars. If the sidecar is missing, the ritual builds fine with no style direction.

**Voice-cast sidecar is optional but high-impact.** Format: `{ "version": 1, "scene": "...", "roles": { "WM": { "profile": "...", "style": "...", "pacing": "...", "accent": "...", "other": "..." }, ... } }`. When present, the bake prepends a structured director's-notes preamble to every line that role speaks:

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

**The cache key incorporates the preamble.** Editing a role's card in `{slug}-voice-cast.json` invalidates just the lines that role speaks — other roles' cache entries remain valid. The cache key version (`v2`) bumps automatically; old entries from before the preamble feature miss cleanly and re-render on next bake.

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
      "other": "Speaks as one who has said these words a thousand times and still means them."
    },
    "SW": {
      "profile": "The Senior Warden — the Master's second, steward of the column in the West.",
      "style": "Clear, measured, slightly warmer than the Master. Less distance, same weight.",
      "pacing": "Steady. Responsive to the Master — answers land squarely after the question settles.",
      "accent": "Educated American, neutral."
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

Every field is optional — fill in what you know, leave the rest out. Author effort scales with how many roles speak substantively in the ritual. Expected shape: 5-10 minutes to draft a cast file per ritual once you have the template.

---

## CLI flags — `build-mram-from-dialogue.ts`

```
Usage: npx tsx scripts/build-mram-from-dialogue.ts \
  <plain.md> <cipher.md> <output.mram> \
  [--with-audio] \
  [--on-fallback=ask|continue|abort]
```

| Flag | Default | Behavior |
|------|---------|----------|
| `--with-audio` | off | Render every spoken line to Opus via Gemini TTS and embed the bytes in the encrypted payload. Without this, the `.mram` is text-only (~20-50 KB); with it, ~1-6 MB depending on ritual length. |
| `--on-fallback=ask` | **default** | Prompt once (y/N) the first time Gemini 3.1-flash (the preferred tier) hits quota and the bake falls back to 2.5-flash or 2.5-pro. Interactive. |
| `--on-fallback=continue` | — | Silently continue on the fallback tier. Suitable for CI or "I want the file now, quality can be mixed" scenarios. |
| `--on-fallback=abort` | — | Exit with code 2 on first fallback. Suitable for "I demand uniform premium quality" scenarios. |
| `--on-fallback=wait` | — | Lock to the preferred model only (no fallback chain at all). If daily quota exhausts, sleep until midnight Pacific Time and auto-resume. Zero prompts, zero degradation. **Best mode for overnight bakes** — start before bed, wake up to a finished uniform-premium bake. |

**Passphrase is never passed on the command line.** It's read interactively with echo disabled (raw-mode stdin), or from `MRAM_PASSPHRASE` env var when stdin is not a TTY (CI, the wrapper script).

---

## CLI flags — `bake-first-degree.ts`

```
Usage: GOOGLE_GEMINI_API_KEY=... npx tsx scripts/bake-first-degree.ts \
  [--on-fallback=ask|continue|abort]
```

| Flag / env | Default | Behavior |
|------------|---------|----------|
| `--on-fallback=...` | `ask` | Passed through to each child build subprocess. If any child aborts with code 2, the wrapper halts the whole sequence (mixing tiers across rituals has the same consistency problem as mixing within one). |
| `BAKE_SKIP=` env | — | Comma-separated list of slugs to skip. Example: `BAKE_SKIP=ea-closing` |
| `MRAM_PASSPHRASE` env | — | Non-interactive passphrase (the wrapper normally sets this internally from the one prompt it runs at start). |

Rituals whose source dialogue files don't exist in `rituals/` are silently skipped — a pilot lead working on only some degrees won't see phantom errors.

---

## Environment variables

| Variable | Required? | What it controls |
|----------|-----------|------------------|
| `GOOGLE_GEMINI_API_KEY` | yes for `--with-audio` | Gemini API key. Get one at [aistudio.google.com](https://aistudio.google.com/). |
| `GEMINI_TTS_MODELS` | optional | Comma-separated override of the 3-model fallback chain. First entry is treated as the "preferred" tier for quality-drop detection. Default: `gemini-3.1-flash-tts-preview,gemini-2.5-flash-preview-tts,gemini-2.5-pro-preview-tts`. |
| `MRAM_PASSPHRASE` | optional | Passphrase when stdin is not a TTY. The wrapper script uses this to share one passphrase across three builds. |
| `XDG_CACHE_HOME` | optional | Override the cache root. Default: `~/.cache/`. |

---

## The audio cache

**Location:** `~/.cache/masonic-mram-audio/` (or `$XDG_CACHE_HOME/masonic-mram-audio/`).

**Key:** `sha256(CACHE_KEY_VERSION | text | style | voice)` — content-addressed. The cache entry does NOT record which Gemini model rendered it.

**Format:** one `.opus` file per cache key. Each file is 32 kbps mono Opus-in-Ogg, ready to ship without re-encoding.

**Atomic writes:** each cache entry is staged as `{key}.opus.tmp` and renamed on completion. Killing the process mid-write leaves nothing corrupt — the rename is the commit point.

### What survives Ctrl-C

Every line rendered before you hit Ctrl-C is in cache. Re-running the same command picks up from the first unrendered line. The 150-line EA Initiation that took you 13 minutes fresh will be a full cache-hit (and complete in under 10 seconds of text-to-MRAM encoding) on the second run — **provided the text, style, and voice haven't changed**.

### What invalidates a cache entry

The cache key changes if any of these change:
- The plain text of the line
- The per-line style tag in the `{slug}-styles.json` sidecar
- The voice name assigned to the role in `GEMINI_ROLE_VOICES`

Any change produces a different SHA-256, which means the old entry is still there on disk but is never hit. If you edit a single word in one line, only that line re-renders; everything else is a cache hit.

### Forcing a full re-render

```bash
rm -rf ~/.cache/masonic-mram-audio/
```

Use this when you want to re-bake everything from scratch — e.g., you accepted a mixed-tier bake via `--on-fallback=continue` and later decide you want uniform premium quality.

### Cache vs provenance

**The cache does not remember which Gemini model rendered each entry.** A fallback-tier entry looks identical to a premium-tier entry on disk. This is why the abort path specifically deletes the just-rendered entry — otherwise it'd cache-hit the degraded bytes on re-run.

---

## Gemini quota + tier-drop flow

Every spoken line is rendered by calling Gemini's `streamGenerateContent` SSE endpoint with the role's assigned voice and the line's style tag. The 3-model fallback chain is:

1. `gemini-3.1-flash-tts-preview` — **preferred**, highest quality, tightest quota
2. `gemini-2.5-flash-preview-tts` — fallback, different quota bucket
3. `gemini-2.5-pro-preview-tts` — fallback, different quota bucket

**On 429 or 404 from a model:** try the next one. Each model has its own separate daily quota, so a 429 on the first doesn't mean the second is also exhausted.

**On 429 from all three:** sleep until next midnight Pacific Time and retry the whole chain. `Intl.DateTimeFormat` with `timeZone: "America/Los_Angeles"` handles DST correctly.

**Per-line tier drop:** a line served by any model other than the preferred tier counts as a quality drop. This fires the `--on-fallback` path.

**The prompt fires once per run.** Your decision (continue or abort) covers every subsequent fallback line in that run — no repeated prompts.

---

## The resume guarantee

When you abort on a tier drop (either via `--on-fallback=abort` or by answering N to the prompt), the script:

1. Deletes the just-rendered fallback-tier cache entry for the line that triggered detection
2. Prints a summary: "N line(s) already rendered on `{preferred model}` remain cached"
3. Exits with code 2

When you re-run the same command after midnight PT (or after your quota has otherwise reset):

- Lines rendered on the preferred tier before the abort → cache hits, free
- The triggering line → fresh API call on the preferred tier (its contaminated cache entry was deleted)
- Lines after the abort point → fresh API calls on the preferred tier

Net: you pay API cost for exactly the lines that didn't render on the preferred tier, and you get a uniform premium bake.

When you continue through the prompt, the fallback-tier entries are kept in cache — re-runs hit them. To force fresh renders later, `rm -rf ~/.cache/masonic-mram-audio/`.

---

## Recognizing a clean vs mixed bake

The final summary prints a per-model breakdown:

```
Audio bake complete:
  Rendered via API:  150
    Per-model breakdown:
      gemini-3.1-flash-tts-preview        150 lines  (preferred)
  Cache hits:        0
  Bytes added (pre-encrypt):  4.87 MB Opus
  Voice cast: WM=Alnilam, SW=Charon, JW=Algenib, SD=Fenrir, ...
```

One model listed under `(preferred)` with the full line count = uniform premium bake. Good to ship.

```
Audio bake complete:
  Rendered via API:  150
    Per-model breakdown:
      gemini-3.1-flash-tts-preview        118 lines  (preferred)
      gemini-2.5-flash-preview-tts         32 lines  (fallback)
  Cache hits:        0
```

Two entries, one under `(fallback)` = mixed-tier bake. User accepted this via `--on-fallback=continue` or by answering Y to the prompt. Audibly inconsistent but shippable for time-sensitive distribution.

---

## Typical workflows

### First time setup for a new ritual degree

1. Author `rituals/{slug}-dialogue.md` (plain English) with frontmatter
2. Author `rituals/{slug}-dialogue-cipher.md` (cipher, same line structure)
3. Optional: author `rituals/{slug}-styles.json` for per-line direction
4. Run the builder once without `--with-audio` to verify structure:
   ```
   npx tsx scripts/build-mram-from-dialogue.ts \
     rituals/{slug}-dialogue.md \
     rituals/{slug}-dialogue-cipher.md \
     rituals/{slug}.mram
   ```
5. If the text-only build works, add `--with-audio` and go.

### Rebuilding one ritual after editing a few lines

Just re-run with `--with-audio`. Edited lines re-render; unchanged lines cache-hit. Typical time: seconds to a minute, depending on how many lines changed.

### Fresh nightly bake of all 3 EA rituals

```bash
GOOGLE_GEMINI_API_KEY=AIza... npx tsx scripts/bake-first-degree.ts
```

Enter passphrase once. Walk away. ~25-30 min cold; near-instant if you're just rebuilding from cache.

### You hit quota mid-bake and want the cleanest possible resume

1. See the `⚠ Quality-tier drop detected` banner
2. Answer `n` to the prompt (or use `--on-fallback=abort`)
3. Wait for midnight PT (or longer — your call)
4. Re-run the exact same command
5. Lines rendered on preferred tier skip the API; everything else renders fresh on preferred tier

### You need the file NOW, mixed quality is acceptable

1. Answer `y` to the prompt (or use `--on-fallback=continue`)
2. Bake finishes with mixed-tier audio
3. Ship it
4. Later, when you want uniform premium: `rm -rf ~/.cache/masonic-mram-audio/` and re-bake

### You want to start the bake before bed and wake up to a finished premium file

```bash
GOOGLE_GEMINI_API_KEY=AIza... npx tsx scripts/bake-first-degree.ts --on-fallback=wait
```

Enter the passphrase, close the laptop. The bake runs as far as your daily quota lets it, then when the preferred model's quota exhausts, the script sleeps until midnight Pacific Time and auto-resumes. No prompts to answer, no tier degradation. If your quota resets before you wake up, you'll find a finished uniform-premium bake in the morning.

Practical notes:
- Machine has to stay awake during the sleep. On macOS: `caffeinate -i npx tsx scripts/bake-first-degree.ts --on-fallback=wait`. On Linux: prevent suspend via your power-management settings.
- If you start the bake *after* midnight PT but your quota is already gone from earlier in the day, you'll sleep all the way until the NEXT midnight (~24 hours). Check your quota status first.
- Cache is preserved during the sleep. Ctrl-C at any point is safe — next run resumes where you left off.

---

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success. File written. |
| 1 | Build failure — missing files, invalid args, passphrase problem, etc. |
| 2 | User (or `--on-fallback=abort`) aborted on a quality-tier drop. Cache is preserved and cleaned; re-running after quota reset produces a uniform premium bake. |

The wrapper `bake-first-degree.ts` propagates exit 2 from any child. CI pipelines can distinguish "bake failed" (1) from "user chose to wait for quota" (2).

---

## File format notes

- Format version: `3` (current). v1 and v2 files still decrypt fine — added fields (style, audio, voiceCast, audioFormat) are optional on old readers.
- Encryption: AES-256-GCM + PBKDF2-SHA256, 310,000 iterations, 16-byte salt, 12-byte IV.
- Binary layout: `MAGIC(4) | VERSION(1) | SALT(16) | IV(12) | CIPHERTEXT+AUTHTAG(rest)`.
- Passphrase is never stored anywhere, never written to logs, never transmitted. You lose it, you lose the file.

See `src/lib/mram-format.ts` for the canonical format spec.

---

## Troubleshooting

**"ffmpeg not found in PATH"** — install it:
- macOS: `brew install ffmpeg`
- Ubuntu/Debian: `sudo apt install ffmpeg`
- Windows: `winget install ffmpeg`

**"GOOGLE_GEMINI_API_KEY env var is required"** — get a key at [aistudio.google.com](https://aistudio.google.com/) and either export it (`export GOOGLE_GEMINI_API_KEY=AIza...`) or prepend it inline (`GOOGLE_GEMINI_API_KEY=... npx tsx scripts/...`).

**"stdin is not a TTY and MRAM_PASSPHRASE env var is not set"** — you're running non-interactively (piped stdin, CI, nohup). Either run in a real terminal or set `MRAM_PASSPHRASE`.

**Build hangs after "Pairing and building MRAMDocument..."** — the passphrase prompt is waiting for input. Scroll up; it's not easily visible once the build log has advanced.

**Cache seems stale — I edited a line but the old audio is playing** — the cache key hashes `(text, style, voice)`, so any content change invalidates it. If you're seeing old audio anyway, confirm the `.mram` file on the device was re-uploaded after the rebuild — the client caches the decrypted doc in IndexedDB.

---

## See also

- `README.md` — project overview, includes a shorter version of this doc
- `src/lib/mram-format.ts` — `.mram` binary format definition and encrypt/decrypt logic
- `src/lib/tts-cloud.ts` — `GEMINI_ROLE_VOICES` map (role → voice name)
- `scripts/render-gemini-audio.ts` — audio pipeline internals (inline comments document the SSE parsing, WAV assembly, and Opus encoding)
- `TODOS.md` — outstanding work on the fallback/error-banner UX
