# Phase 4: Content Coverage — Ritual Readiness Checklist

**Updated:** 2026-04-23 (seeded by Plan 04-02)
**Shipping target:** 21 rituals (4 EA re-bakes + 4 FC + 4 MM + 1 Installation + 8 Lectures seed; Shannon finalizes lecture count in Plan 04-07 Task 1)

**Status legend:**
- `[ ]` not started
- `[~]` in progress
- `[x]` done
- `—` not applicable (U+2014 EM DASH)

**Columns:** plain draft → cipher draft → voice-cast JSON → styles JSON (N/A for some short lectures) → first bake → scrub in preview-bake → `verify-content` green → shipped to pilot.

> **Edit protocol:** update this file AT THE END of every ritual's pipeline step. Commit
> with prefix `content-NN: {slug} {step}-complete` (e.g., `content-04: fc-opening baked`).
> Rows in this file ARE the ledger; `.mram` files on disk are gitignored.
>
> **Status cell values are parser-constrained.** Only `[ ]`, `[~]`, `[x]`, `—` are legal —
> `scripts/lib/content-checklist.ts:parseChecklist` throws `InvalidStatusCell` on anything
> else (e.g., `[X]`, `~~strikethrough~~`, `-` ASCII hyphen). For descoping a lecture in
> Plan 04-07, set every status cell in the row to `—` and write the reason in the notes
> column (see Plan 04-07 Task 4 for the protocol). Do NOT wrap slugs with `~~`.

## EA

| slug | drafted (plain) | drafted (cipher) | voice-cast | styles | baked | scrubbed | verified | shipped | notes |
|------|-----------------|------------------|------------|--------|-------|----------|----------|---------|-------|
| ea-opening | [x] | [x] | [x] | [x] | [ ] | [ ] | [ ] | [ ] | existing; needs v3-cache re-bake |
| ea-initiation | [x] | [x] | [x] | [x] | [ ] | [ ] | [ ] | [ ] | existing; needs v3-cache re-bake |
| ea-explanatory | [x] | [x] | [x] | [x] | [ ] | [ ] | [ ] | [ ] | existing; needs v3-cache re-bake |
| ea-closing | [x] | [x] | [x] | [x] | [ ] | [ ] | [ ] | [ ] | existing; needs v3-cache re-bake |

## FC

| slug | drafted (plain) | drafted (cipher) | voice-cast | styles | baked | scrubbed | verified | shipped | notes |
|------|-----------------|------------------|------------|--------|-------|----------|----------|---------|-------|
| fc-opening | [ ] | [ ] | [ ] | — | [ ] | [ ] | [ ] | [ ] | parallel to ea-opening structure |
| fc-passing | [ ] | [ ] | [ ] | — | [ ] | [ ] | [ ] | [ ] | longest FC scene; winding stairs lecture embedded |
| fc-middle-chamber-lecture | [ ] | [ ] | [ ] | — | [ ] | [ ] | [ ] | [ ] | standalone practice unit per EA precedent |
| fc-closing | [ ] | [ ] | [ ] | — | [ ] | [ ] | [ ] | [ ] | parallel to ea-closing |

## MM

| slug | drafted (plain) | drafted (cipher) | voice-cast | styles | baked | scrubbed | verified | shipped | notes |
|------|-----------------|------------------|------------|--------|-------|----------|----------|---------|-------|
| mm-opening | [ ] | [ ] | [ ] | — | [ ] | [ ] | [ ] | [ ] | |
| mm-raising | [ ] | [ ] | [ ] | — | [ ] | [ ] | [ ] | [ ] | longest single ceremony; Hiramic legend embedded |
| mm-hiramic-legend | [ ] | [ ] | [ ] | — | [ ] | [ ] | [ ] | [ ] | standalone practice unit; emotional content |
| mm-closing | [ ] | [ ] | [ ] | — | [ ] | [ ] | [ ] | [ ] | |

## Installation

| slug | drafted (plain) | drafted (cipher) | voice-cast | styles | baked | scrubbed | verified | shipped | notes |
|------|-----------------|------------------|------------|--------|-------|----------|----------|---------|-------|
| installation | [ ] | [ ] | [ ] | — | [ ] | [ ] | [ ] | [ ] | annual officer installation; single long ritual |

## Officer Lectures

| slug | drafted (plain) | drafted (cipher) | voice-cast | styles | baked | scrubbed | verified | shipped | notes |
|------|-----------------|------------------|------------|--------|-------|----------|----------|---------|-------|
| lec-wm-charge | [ ] | [ ] | [ ] | — | [ ] | [ ] | [ ] | [ ] | Shannon's lodge: core |
| lec-sw-duties | [ ] | [ ] | [ ] | — | [ ] | [ ] | [ ] | [ ] | core |
| lec-jw-duties | [ ] | [ ] | [ ] | — | [ ] | [ ] | [ ] | [ ] | core |
| lec-secretary-duties | [ ] | [ ] | [ ] | — | [ ] | [ ] | [ ] | [ ] | Shannon's lodge confirms which lectures are shipped |
| lec-treasurer-duties | [ ] | [ ] | [ ] | — | [ ] | [ ] | [ ] | [ ] | |
| lec-chaplain-duties | [ ] | [ ] | [ ] | — | [ ] | [ ] | [ ] | [ ] | |
| lec-deacons-duties | [ ] | [ ] | [ ] | — | [ ] | [ ] | [ ] | [ ] | SD/JD may split into 2 files |
| lec-stewards-duties | [ ] | [ ] | [ ] | — | [ ] | [ ] | [ ] | [ ] | SS/JS may split into 2 files |
| lec-tiler-duties | [ ] | [ ] | [ ] | — | [ ] | [ ] | [ ] | [ ] | shortest; typically ~20 lines |

## Aggregate

_This section is human-maintained; Plan 04-08 crosschecks it against parsed rows._

- **Rituals planned:** 21 (4 EA + 4 FC + 4 MM + 1 Installation + 8 Lectures seed; lecture count finalizable during Wave 1 Plan 04-07 Task 1 checkpoint)
- **Shannon-lodge descope protocol:** for lectures Shannon's lodge does NOT separately rehearse, set every status cell in the row to `—` (em-dash) and rewrite the notes column to `descoped: post-v1 — <one-sentence reason>`. The `—` em-dash is the parser-legal "not applicable" cell; do NOT use `~~strikethrough~~` (the 04-02 parser throws on anything outside `[ ]|[~]|[x]|—`). Descoped rows stay in the checklist for audit trail.
- **Plan 04-08 gate:** every row must have `shipped = [x]` OR `shipped = —` with a `descoped: post-v1 — …` notes entry before Phase 4 closes.
