# Phase 3 Authoring Throughput — Human UAT Follow-Up

**Date:** 2026-05-07 (two weeks after ship date 2026-04-23)
**Branch under review:** `gsd/phase-3-authoring-throughput`
**Filed by:** automated follow-up audit

---

## Audit Findings

A two-week check was run today. Findings:

| Signal | Result |
|---|---|
| `gsd/phase-3-authoring-throughput` branch exists (local) | **NO** |
| `gsd/phase-3-authoring-throughput` branch exists (remote) | **NO** |
| `03-HUMAN-UAT.md` exists in `.planning/phases/03-authoring-throughput/` | **NO** |
| `rituals/_bake-cache/` populated by a real bake run | **NO** |
| Post-2026-04-23 commits touching the bake pipeline | **NONE FOUND** |

The Phase 3 branch and its UAT tracking file have not been pushed to this repository. No evidence of a real Gemini-backed bake run exists. All three UAT items are in an **unknown / effectively pending** state.

---

## The Three Unconfirmed Items

These were the end-to-end claims from Phase 3 that required a live Gemini bake to verify:

### Item 1 — Single-line edit → single-line rebake under 60 s wall-clock

**Why it matters:** The core authoring-throughput promise is that a small change doesn't re-bake the entire corpus. If incremental rebake silently falls back to a full bake, authors will hit 5–15 minute round-trips and the phase goal is unmet.

**How to verify:**
1. Make a one-line change to any ritual `.mram` source file.
2. Run `npm run bake` (or the single-ritual bake command).
3. Confirm wall-clock time is under 60 s and that only the changed ritual's output was regenerated.

---

### Item 2 — 5-ritual `bake-all --parallel 4` throughput + Ctrl-C → `--resume` cycle

**Why it matters:** Parallel baking is the primary throughput multiplier. The `--resume` flag is the safety net when a bake is interrupted mid-run. If either is broken, authors working on large corpora have no reliable path.

**How to verify (start here — easiest to validate):**

Smoke test first (no Gemini calls, safe to run anywhere):
```bash
npm run bake-all -- --parallel 4 --dry-run
```
This should print the planned bake order for all rituals without hitting the API. Confirm it shows 5 rituals queued across 4 workers.

Real run:
```bash
npm run bake-all -- --parallel 4
```
1. Let it start at least 2 rituals.
2. Press Ctrl-C to interrupt.
3. Confirm a resume-state file is written (check `rituals/_bake-cache/` or wherever the phase persists resume state).
4. Re-run with `--resume` and confirm it skips completed rituals and picks up where it left off.

---

### Item 3 — Preview server scrubbing UX against a real bake

**Why it matters:** The preview server is the author's feedback loop. If it shows stale or unscrubbed output after a real bake, the UX claim is false regardless of what the engineering tests assert.

**How to verify:**
1. Run a real bake for at least one ritual.
2. Start the preview server (`npm run preview` or equivalent).
3. Navigate to the baked ritual and confirm: (a) output is current, (b) scrubbing (seeking through the ritual audio/text) works correctly against the freshly baked content.

---

## Recommended Next Step

**Item 2 is the easiest entry point.** The `--dry-run` smoke test requires no Gemini keys and takes under a minute. Running it first confirms the parallel scheduler is wired up correctly before spending API quota on a real bake.

Once Item 2's real run is complete, the `_bake-cache/` directory will be populated, which also unblocks Items 1 and 3 (they can be verified in the same bake session).

---

## What Happens After UAT Passes

1. Update (or create) `.planning/phases/03-authoring-throughput/03-HUMAN-UAT.md` with `result: pass` for each item and the observed metrics.
2. Merge `gsd/phase-3-authoring-throughput` to `main`.
3. Phase 3 is complete; proceed to Phase 4.

---

*This file was written by an automated audit on 2026-05-07. No code was modified.*
