# Phase 3: Authoring Throughput - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-01
**Phase:** 3-authoring-throughput
**Areas discussed:** Ultra-short-line policy, Cache canonicalization & key migration

---

## Ultra-short-line policy

### Q1: How should lines below the Gemini minimum (<11 chars, e.g. "I do.") get baked audio?

| Option | Description | Selected |
|--------|-------------|----------|
| Google Cloud TTS fallback | Route ultra-short lines to Google Cloud TTS (line-94 experiment path); different voice than Gemini cast | |
| Gemini padded-prompt trick | Instructional padding per memory skill; voice-consistent but historically fragile | |
| Try Gemini padded, fall back to Google | Attempt Gemini first, auto-fallthrough to Google on validation failure | |
| You decide | Claude picks during planning | |

**User's choice:** Free-text: "all lines get baked audio"
**Notes:** User answered the deeper question first — locked the constraint that no line is ever left to runtime TTS (removes the current hard-skip classification; makes Phase 4 CONTENT-06 hold by construction). Engine mechanism asked as follow-up.

### Q2: Which engine path bakes the ultra-short lines?

| Option | Description | Selected |
|--------|-------------|----------|
| Try Gemini padded, fall back to Google (Recommended) | Gemini instructional padding first; auto-fallback to Google Cloud TTS on validation failure; bake never skips | ✓ |
| Google Cloud TTS directly | All <11-char lines straight to Google; simpler, every short line non-Gemini voice | |
| You decide | Claude picks during planning | |

**User's choice:** Try Gemini padded, fall back to Google

### Q3: What validation gates the Gemini padded render before acceptance?

| Option | Description | Selected |
|--------|-------------|----------|
| Duration + STT round-trip (Recommended) | Duration-anomaly check plus STT round-trip diff on short lines | (✓ provisional) |
| Duration check only | Cheaper; wrong-words render of right length slips through | |
| You decide | Claude picks during planning | |

**User's choice:** No response (60s timeout — user AFK). Proceeded with the recommended option, flagged as PROVISIONAL in CONTEXT.md D-03; user invited to downgrade to duration-only at plan review.

### Q4: Which voice does the Google Cloud TTS fallback use?

| Option | Description | Selected |
|--------|-------------|----------|
| Per-role closest match (Recommended) | Pinned Google voice per role in voice-cast.json, chosen to sound closest to that role's Gemini voice | ✓ |
| Single neutral voice | One fixed Google voice for all short-line fallbacks | |
| You decide | Claude picks during planning | |

**User's choice:** Per-role closest match

---

## Cache canonicalization & key migration

### Q1: What is rituals/_bake-cache/ (873 .opus files, no code references)?

| Option | Description | Selected |
|--------|-------------|----------|
| Manual backup of ~/.cache | Copied the cache into the repo folder as a backup | ✓ |
| From another machine/session | May contain renders the live cache doesn't have | |
| Don't remember | Treat as untrusted superset | |

**User's choice:** Manual backup of ~/.cache
**Notes:** Backup (873) is a superset of live (475) — preserves renders later invalidated locally; treated as migration input.

### Q2: Where does the canonical bake cache live going forward?

| Option | Description | Selected |
|--------|-------------|----------|
| rituals/_bake-cache/ (Recommended) | Repo-adjacent, gitignored; lives next to content; formalizes the manual-backup habit | ✓ |
| Keep ~/.cache/masonic-mram-audio/ | XDG-conventional; manual backup remains the durability story | |
| You decide | Claude picks during planning | |

**User's choice:** rituals/_bake-cache/

### Q3: How does model provenance get into the cache without re-rendering everything?

| Option | Description | Selected |
|--------|-------------|----------|
| Add modelId + migrate in place (Recommended) | One-time re-key of all existing entries assuming premium 3.1-flash; zero re-render cost | ✓ |
| Sidecar provenance manifest | Keep current key; manifest maps key → model; deviates from AUTHOR-01 spec | |
| Add modelId, orphan old entries | Cleanest provenance; days of quota + real cost to rebuild | |
| You decide | Claude picks during planning | |

**User's choice:** Add modelId + migrate in place

### Q4: How are fallback-tier renders treated once modelId is in the key?

| Option | Description | Selected |
|--------|-------------|----------|
| Keep degraded, upgrade later (Recommended) | Degraded renders cached under own key; .mram records fallback lines; later re-bake upgrades only those | ✓ |
| Keep delete-on-fallback | Cache only ever premium; quota-limited bakes re-pay for fallback lines | |
| You decide | Claude picks during planning | |

**User's choice:** Keep degraded, upgrade later

---

## Claude's Discretion

- Orchestrator design (AUTHOR-02/09): hash-based change detection (git-ref impossible on gitignored sources), parallelism × `--on-fallback=ask` interaction, p-limit cap value
- Preview server (AUTHOR-08): design the localhost:8883 scrubber, building on existing `rituals/*-review.json` / `_sessions/` workflow
- idb-schema extraction (AUTHOR-10): mechanical
- Parity validator wiring (AUTHOR-05): extend existing validators into a refusing bake gate
- Duration-anomaly thresholds (AUTHOR-06)
- STT engine for the D-03 round-trip check

## Deferred Ideas

- Errata JSON sidecar (AUTHOR-v2-03), hosted author UI (AUTHOR-v2-01), co-author circle (AUTHOR-v2-02) — post-v1
- `.mram.backup-*` clutter auto-prune — optional orchestrator nicety, planner may fold in
