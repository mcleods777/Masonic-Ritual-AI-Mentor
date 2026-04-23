# TODOS

Items tracked for future work. Grouped by component. Priority from P0 (blocker)
through P4 (nice-to-have). Completed items move to the bottom section.

## TTS / Gemini

### Fallback plan if `gemini-3.1-flash-tts-preview` is pulled or renamed
**Priority:** P3
**What:** Write a short runbook for what happens if Google fully removes
or breaking-changes all three Gemini TTS preview models (3.1-flash,
2.5-flash, 2.5-pro). Most of the original concern shipped 2026-04-18 —
this TODO is now about the long-tail what-if.

**Status update (2026-04-18):**
- ✅ 3-model fallback chain shipped in `src/app/api/tts/gemini/route.ts`
  via `getGeminiModels()` — returns `[3.1-flash, 2.5-flash, 2.5-pro]` and
  the route silently retries on 429 or 404 across all three.
- ✅ Hot-swap via env var: `GEMINI_TTS_MODELS` (comma-separated) overrides
  the chain at runtime so ops can re-order or swap in new model IDs
  without a deploy.
- ⏳ Still no user-visible error banner (eng-review decision 13A) — when
  all three Gemini models fail, the client falls through to Voxtral
  silently. A banner that says "Gemini TTS is degraded, falling back" on
  styled lines is still on the wishlist.
- ⏳ Still no published runbook for "all three models gone." Today's
  fallback chain buys headroom but not coverage if Google retires the
  whole preview lineup at once.

**Why:** The remaining gaps are low-frequency, high-context items.
Documentation only. Trigger if Google announces deprecation of the
2.5-flash preview line.

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

### Voxtral fallback + error banner + automatic next-line prefetch
**Priority:** P3 (de-prioritized 2026-04-19 — bake-in shipped)
**What:** Two remaining polish items from the original eng-review:
  - 2A/13A: error banner on styled lines when Gemini falls back to
    Voxtral. Today the fallback is silent — Brother hears Voxtral and
    doesn't know why.
  - 12A: automatic prefetch of line N+1 while N plays (cancels on
    pause/seek).

**Status update (2026-04-19):**
- ✅ Audio bake-in at build time shipped. .mram files built with
  `--with-audio` embed pre-rendered Opus audio per line. At playback,
  zero API call per Brother per rehearsal. This collapses the case
  that motivated prefetch + streaming in the first place — cold-cache
  latency doesn't exist when audio is already on device.
- ✅ Voxtral fallback works (chain: Gemini all 3 models → Voxtral → Google
  Cloud → browser). Voxtral has 15 default character voices in the pool.
- ⏳ Error banner: still not started. Less critical now that the common
  path (embedded audio) doesn't hit the fallback chain at all.
- ⏳ Automatic next-line prefetch: still not started. Only relevant for
  Brothers who override the canonical voice cast AND haven't hit
  preload. Edge case.

**Why:** Banner closes a confusion gap for Brothers who pick a non-baked
voice cast and hear Voxtral on Gemini failures. Auto-prefetch closes the
cold-cache latency gap for that same edge case.

**Depends on / blocked by:** nothing.

---

### Skip Voxtral in fallback chain when no user-recorded voices exist
**Priority:** P3
**What:** When `speakAsRole` enters the fallback chain (Gemini → Voxtral
→ Google Cloud → Browser) and there are zero user-recorded voices in
IndexedDB, skip the Voxtral attempt and go straight to Google Cloud.

**Why:** Today, Voxtral fires even when Brother hasn't recorded any
voices. With the 15 default voices restored as a pool, this is fine for
playback. But before the user records anything, every Voxtral fallback
adds ~500ms of latency before delivering the same outcome a faster
fallback would give. Skipping when the pool is empty of user voices
trims the dead-end latency.

**Pros:** Faster perceived recovery from a Gemini failure. No user-
visible behavior change (audio sounds the same).

**Cons:** Tiny gain (~500ms) on a rare path (only fires when all 3
Gemini models 429). Adds a conditional in the fallback path.

**Context:** Discussed during the post-ship debug session 2026-04-18
after default voices were repurposed. The optimization assumes "user
hasn't recorded" means "Voxtral has nothing personalized to add" — which
is true today but might change if we add other Voxtral-specific
features.

**Depends on / blocked by:** nothing.

---

### Delete unused TTS engine paths + stranded component files
**Priority:** P3
**What:** After the dropdown-removal PR lands, delete:
- `src/components/TTSEngineSelector.tsx` (169 lines, unmounted)
- `src/components/GeminiPreloadPanel.tsx` (189 lines, unmounted)
- Every engine branch in `src/lib/text-to-speech.ts` and
  `src/lib/tts-cloud.ts` except Gemini and Voxtral (Deepgram,
  Kokoro, Google Cloud, Browser, ElevenLabs — all unreachable after UI
  removal).
- `fetchEngineAvailability`, `hasLocalVoices`, `preloadGeminiRitual`,
  `countCachedGeminiLines` if they become dead after the auto-preload
  refactor.

**Why:** The shallow-scope dropdown-removal PR leaves ~400+ lines of
dead code on disk. CLAUDE.md says no half-finished implementations;
this item closes the loop.

**Pros:** Mental model matches reality. Smaller bundle. No "mystery
engines" for a future reader to wonder about. Test matrix shrinks to
2 sources (baked Gemini + Voxtral override).

**Cons:** Non-trivial diff (~10 files touched). Existing
`tts-fallback.test.ts` rewrites entirely. Small risk of breaking a
path we didn't realize was still used (mitigated by end-to-end QA).

**Context:** Proposed as "Deep — boil the lake" option during
eng-review on 2026-04-20. User chose "Shallow" to keep the current
PR minimal. This TODO captures the deferred work.

**Depends on / blocked by:** the shallow-scope dropdown removal PR
must land and bake in production first. Run after ~1 week of clean
production use confirms baked Gemini + Voxtral-override flow covers
all real rehearsals.

---

### First-run migration telemetry for tts-engine key-bump
**Priority:** P4
**What:** Once an analytics layer lands in this repo, instrument the
key-bump from `tts-engine` → `tts-engine-v2` (shipped 2026-04-20 CEO
review). On first load, read the old key once. If non-gemini, fire one
event tagged with the old engine name using the typed-event-names PII-safe
pattern.

**Why:** Tells us whether 2% or 40% of returning users were locked into
non-gemini engines before the bump. Directly shapes priority of the
"delete unused TTS engine paths" TODO. Today the only signal is the
console.warn from cherry-pick #7 of the same PR.

**Pros:** Converts a gut-feel priority ("should we actually delete Deepgram/
Kokoro/GoogleCloud/Browser/ElevenLabs?") into data.

**Cons:** Dependent on analytics layer existing. Scaffolding a full
typed-event channel for one event is overkill.

**Context:** CEO-review cherry-pick 2020-04-20, initially accepted then
downgraded to DEFERRED after grep confirmed no `src/lib/analytics.ts`,
no posthog/mixpanel/amplitude imports. Once the first product-analytics
layer is added (could be for any feature), add this event in the same PR.

**Depends on / blocked by:** an analytics layer in `src/` (typed-event-
names pattern, per gstack skill).

---

### Audit baked-audio coverage to eliminate the silent preload
**Priority:** P4
**What:** Verify every playable line in every `.mram` file has audio
bytes embedded. Revisit the ultra-short-line skip rule in
`scripts/build-mram-from-dialogue.ts` (commit 459ded0) and any other
bake filters. Goal: `section.audio` is always defined for any line
the player might reach.

**Why:** The shallow-scope PR adds a silent on-mount preload as a
runtime safety net for lines missing from the bake. If the bake is
100% complete, the preload is dead code — it will never find a
missing line to preload. Close the gaps, delete the preload.

**Pros:** Zero cold-start latency on any line, ever. Zero runtime
Gemini API calls on any rehearsal or listen session. Zero quota risk
per Brother per session.

**Cons:** Revisiting ultra-short line skip rules means finding out
why they were skipped in the first place (likely TTS model refuses
or returns garbage for 1-2 syllable lines). May require per-line
voice tuning or accepting some lines play via Browser TTS.

**Context:** Proposed during 2026-04-20 eng-review. Auto-preload is
the current fix; this TODO is the permanent fix.

**Depends on / blocked by:** production data on how often lines
actually hit the preload path. Measure first, then decide if the
investment is worth it.

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
