---
status: partial
phase: 03-authoring-throughput
source: [03-VERIFICATION.md]
started: 2026-04-23T22:15:00Z
updated: 2026-04-23T22:15:00Z
---

## Current Test

[awaiting human testing — all three items require real Gemini-backed bake activity, appropriately deferred to early Phase 4 content work]

## Tests

### 1. Single-line edit → single-line rebake (SC1 end-to-end timing)
expected: Edit one line in `rituals/ea-opening-dialogue.md`, run `npm run bake-all -- --since HEAD~1`, observe: exactly ONE line rebakes (cache hit for all other lines), total wall-clock < 60s including validator + git-diff + Gemini call for the edited line.
result: [pending]

### 2. Multi-ritual throughput without weekends lost (SC2 end-to-end)
expected: Run `npm run bake-all -- --parallel 4` against 5 rituals fresh (empty cache); confirm the orchestrator completes without manual retry logic; `--resume` after Ctrl-C picks up within the same ritual at the last completed line.
result: [pending]

### 3. Preview server scrubbing UX (SC7 end-to-end)
expected: After a real bake, `npm run preview-bake` at http://127.0.0.1:8883 lists rituals and plays every cached line; scrubbing a suspect line's audio against the dialogue source either catches a problem or approves it for re-encryption.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
