---
status: partial
phase: 03-authoring-throughput
source: [03-VERIFICATION.md]
started: 2026-07-02T19:05:00Z
updated: 2026-07-02T19:05:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Single-line dialogue edit re-bakes in under a minute
expected: Editing one line in an existing ritual's dialogue file, then running `bake-all.ts --changed-only`, re-renders only that one line (cache-hit for all others) and completes in well under a minute.
result: [pending]

### 2. Bake five rituals' worth of content in parallel without manual babysitting
expected: Running `bake-all.ts --parallel 4` (or the bare default) against 5 rituals completes cleanly with correctly-decryptable .mram outputs and no lost _INDEX provenance entries. (All three previously-blocking defects CR-01/02/03 are closed with regression tests — this should now pass live.)
result: [pending]

### 3. Scrub baked lines in a browser against localhost:8883 before re-encrypting a .mram
expected: `npx tsx scripts/preview-bake.ts`, open http://localhost:8883, browse a ritual's lines, and audibly confirm a rendered line before re-encrypting.
result: [pending]

### 4. EA rituals rebake backfills the 32 previously-skipped short lines
expected: Re-baking the existing EA rituals produces audio for every previously-missing ultra-short line via the Gemini-padded/Google-fallback path.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
