# TODOS

Items tracked for future work. Grouped by component. Priority from P0 (blocker)
through P4 (nice-to-have). Completed items move to the bottom section.

## TTS / Gemini

### Fallback plan if `gemini-3.1-flash-tts-preview` is pulled or renamed
**Priority:** P3
**What:** Document and stub a runbook for what happens if Google renames,
rate-limits, or deprecates the `gemini-3.1-flash-tts-preview` endpoint.

**Why:** Model was released 2026-04-15 (preview tier). Preview models get
renamed, throttled, or pulled with modest notice. If this happens mid-pilot,
the Gemini engine returns 404 and styled rituals lose expression. Per
eng-review decision 13A, the rehearsal runtime will show a user-visible
error banner on styled lines when Gemini fails — so the app degrades
gracefully, but the author needs to know what happened.

**Pros:** A 5-minute runbook saves hours of debugging during a live pilot
outage. Low cost now, high cost later if we need it.

**Cons:** Google's preview-model lifecycle is opaque — we can't fully
predict what breaks.

**Context:** Model ID pinned in `src/app/api/tts/gemini/route.ts` as
`GEMINI_MODEL`. Simplest fix path when this fires: add a `GEMINI_TTS_MODEL`
env var so ops can swap the model ID without a deploy. Ship the env var
only when needed, not preemptively.

**Depends on / blocked by:** nothing — documentation / runbook only.

---

### Full Suggest Styles UI in /author
**Priority:** P2
**What:** Build the inline per-line Accept / Edit / Skip UI for the
Suggest Styles mode in `/author`. The API route is live at
`/api/author/suggest-styles`, the build pipeline reads `{ritual}-styles.json`,
but the author currently has to hand-write the JSON.

**Why:** Ship completes the "AI-suggests, author approves" story from the
design doc. Without the UI, the author-in-the-loop feedback loop doesn't
exist — it's just hand-authored styles with an LLM you have to invoke
via curl.

**Pros:** Closes the feature's authoring loop. Makes per-line direction
actually usable at ritual scale (155+ lines).

**Cons:** Non-trivial UI work: per-line inline editor, batch progress
indicator, Accept / Edit / Skip buttons per row, validation inline with
`STYLE_TAG_PATTERN`, atomic write to `rituals/{ritual}-styles.json`.
~150-200 lines of React.

**Context:** Backend route (`src/app/api/author/suggest-styles/route.ts`)
ships with per-line best-effort (decision 5A) and concurrency limit of 5
(decision 13A). UI can hit it with any line batch shape. Existing `/author`
page patterns cover the save flow. Add a "Suggest Styles" button next to
"Encrypt & Save" that toggles the per-line editor view.

**Depends on / blocked by:** nothing — backend is ready.

---

### Voxtral fallback + error banner + prefetch + streaming
**Priority:** P2
**What:** Ship the polish decisions from eng-review that aren't yet wired:
  - 2A/13A: rehearsal runtime catches Gemini errors, falls back to Voxtral
    silently on unstyled lines, shows an error banner on styled lines.
  - 11A: stream audio from `/api/tts/gemini` instead of blob-at-end.
  - 12A: prefetch line N+1 while N plays, aborts on pause/seek.

**Why:** These are the difference between "Gemini works" and "Gemini feels
next-level." Cold-cache latency on a 10s Obligation line is currently
~3s without streaming + prefetch.

**Pros:** User experience lands at the quality bar promised by the design.

**Cons:** Prefetch logic lives in RehearsalMode and is the most complex
piece. Streaming requires swapping `generateContent` for `streamGenerateContent`
in the Gemini route.

**Context:** v1 ships functional but without the streaming/prefetch polish.
This TODO tracks the polish pass.

**Depends on / blocked by:** nothing.

---

## Auth & Distribution

### Stateful one-time-use magic links
**Priority:** P2
**What:** Upgrade magic-link tokens from stateless JWT to stateful tokens stored
in Vercel KV or Upstash Redis, consumed on first use.

**Why:** Stateless JWT tokens remain valid for their full expiry window (10 min)
even after being used. If a link leaks (forwarded email, browser history,
referer header, shared device), it can be re-used until it expires. One-time
consumption eliminates replay.

**Pros:** Stronger security story for the Custodian at jurisdictional scale.
Enables individual link revocation.

**Cons:** Adds a dependency (KV or Redis). One more vendor in the privacy
story to describe. Read/write latency on every magic-link request (cheap but
non-zero).

**Context:** Stateless JWT was accepted for the 5-person pilot during the
plan-eng-review on 2026-04-14 with the understanding that short expiry plus
5 trusted Brothers is acceptable risk. When distribution expands beyond the
pilot (i.e., after the Custodian greenlights jurisdictional distribution),
this upgrade becomes a real concern.

**Trigger:** When jurisdictional distribution begins, or when pilot scope
grows past ~20 users.

---

### Split middleware.ts when it exceeds 150 lines
**Priority:** P3
**What:** Refactor `src/middleware.ts` into named composable checks
(`checkRootRedirect`, `checkApiSharedSecret`, `checkCorsOrigin`,
`checkPilotAuth`) called in sequence, when the file exceeds 150 lines.

**Why:** The middleware currently has root redirect + API shared-secret +
CORS. Phase A adds the pilot auth gate. Subsequent auth/routing work will
keep adding to it. A single-file middleware becomes hard to reason about
and to test once it passes ~150 lines.

**Pros:** Each check becomes independently testable. Order is explicit.
Easier to trace request flow during debugging.

**Cons:** Slight indirection. Edge runtime has constraints on what imports
are allowed in middleware; new composable files must respect that.

**Context:** Discussed in plan-eng-review on 2026-04-14. Accepted to keep
Phase A minimal but flagged to trigger on line count.

**Trigger:** `wc -l src/middleware.ts` exceeds 150.

---

### Verify iCloud Private Relay behavior during pilot
**Priority:** P1
**What:** Test the magic-link sign-in flow with at least one iPhone Brother
who has iCloud Private Relay enabled (the default on iCloud+ subscriptions).

**Why:** iPhone users with Private Relay sometimes submit their email as a
relay address (e.g., `xyz@privaterelay.appleid.com`) instead of their real
email. If the Brother's real Gmail is on `LODGE_ALLOWLIST` but Safari submits
the relay address, the allowlist check fails silently (returns 200 like any
non-allowlisted address) and the Brother never gets the email. He will
assume the system is broken.

**Pros:** Catches this class of failure before pilot Brothers hit it. Shapes
the Custodian story (if it's a real problem, the memo needs to address it).

**Cons:** None. Cheap to test.

**Context:** Flagged in plan-eng-review on 2026-04-14 as a critical gap in
the user-flow coverage diagram.

**How to test:** Ask one iPhone-using Brother in the pilot to go through the
sign-in flow. If it works, move on. If it doesn't, either (a) disable Private
Relay on the site via the relevant header, (b) ask Brothers to check their
"hide my email" setting and use their real address, or (c) accept both the
relay and real address on the allowlist.

---

## Completed

<!-- Items completed will be moved here with version and date. -->
