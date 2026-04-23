# Pitfalls Research

**Domain:** Private-pilot → invited-beta AI coaching tool (paid AI APIs; sensitive/private user content; solo-authored authoritative reference text; ≤10-lodge scale)
**Researched:** 2026-04-20
**Confidence:** HIGH for project-specific pitfalls (grounded in `.planning/codebase/CONCERNS.md`, `ARCHITECTURE.md`, `TODOS.md`, and prior CSO audit memory). MEDIUM for ecosystem-general pitfalls (grounded in 2026 industry post-mortems and published research on LLM feedback quality and cost-amplification incidents).

---

## Critical Pitfalls

These are failure modes where, if they happen to an invited lodge, trust is either destroyed immediately or never recovers. Each one is wired to this project's shape (not generic "AI app" advice).

---

### Pitfall 1: Shared-secret abuse multiplied by invite expansion

**What goes wrong:**
The shared `NEXT_PUBLIC_RITUAL_CLIENT_SECRET` header is baked into every bundle a signed-in Brother downloads. Today one secret guards one pilot user (Shannon). As soon as 5–10 lodges are invited, the same secret lives on dozens of laptops, phones, and inboxes (forwarded during onboarding). The first time a Brother's device is compromised, or a curious invitee extracts the secret with DevTools and tries a few curl loops, paid AI upstreams (Gemini TTS, Groq Whisper, Mistral, Anthropic) start burning budget. Because the secret is a single scalar, there is no way to revoke one lodge's access without breaking all of them.

**Why it happens:**
The shared secret pattern (documented in the `llm-api-cost-amp-shared-secret-protection` skill) was designed to stop drive-by curl abuse — the skill itself is explicit that it "does not stop motivated attackers who fetch the bundle and extract the secret." At ≤10 lodges there is no longer plausible deniability that the secret is still obscure — the attack surface is any Brother's device, their roommate, their kid with DevTools, their phone left at a coffee shop.

**Warning signs:**
- Provider dashboards (Gemini, Groq, Mistral) show a spike in requests that doesn't correlate with a scheduled lodge rehearsal night
- `/api/tts/gemini` or `/api/rehearsal-feedback` traffic from IPs/User-Agents that never completed magic-link sign-in (the middleware checks both gates — if the shared secret is bypassed but the JWT cookie is missing, the request will still be blocked; confirming this is working is the first diagnostic)
- Any lodge reports their Brothers can sign in but the app is suddenly slow or failing — could mean the daily quota was consumed by an attacker before the lodge got to it
- A rate-limit spike on one IP that corresponds to a known Brother's home IP (could mean their device was compromised, or could mean someone on the same LAN is scripting)

**Prevention strategy:**
1. **Layer the session JWT check ON TOP OF the shared secret at the route level, not just middleware** — today the middleware does both (`src/middleware.ts`), but per-route defenses (e.g., re-check `pilot-session` cookie inside `/api/rehearsal-feedback/route.ts`) buy a second line of defense if a future middleware refactor accidentally narrows the matcher.
2. **Add per-user (by hashed email from JWT) rate limits on the four paid routes**: `/api/tts/gemini`, `/api/tts/voxtral`, `/api/transcribe`, `/api/rehearsal-feedback`. `CONCERNS.md` already flags that these routes have 2000-char caps but no per-identity throttle. Key the rate limiter on `sha256(email)` from the verified session JWT, not on IP (which NAT breaks).
3. **Add per-user daily budget caps** (e.g., 500 TTS requests/day/user, 100 feedback requests/day/user) that degrade to browser TTS and a fixed "feedback unavailable right now" message when exceeded. A compromised account caps its own damage.
4. **Ship a one-command kill switch** — a Vercel env var like `RITUAL_EMERGENCY_DISABLE_PAID=1` that the middleware reads and 503s the four paid routes. Practice rotating it.
5. **Plan the shared-secret rotation** — document how to rotate `RITUAL_CLIENT_SECRET` + `NEXT_PUBLIC_RITUAL_CLIENT_SECRET` without bricking signed-in Brothers (they'll re-download the bundle on next visit, but anything with an open tab will 401 until reload — this needs to be communicated).

**Phase to address:** Phase 1 (Cost/abuse safeguards) — this is Shannon's explicit Active requirement ("per-invited-user rate limits (not just IP)"), and it's the single largest financial risk from scaling from 1 to 10 lodges.

---

### Pitfall 2: Runaway feedback loop from automated rehearsal

**What goes wrong:**
A Brother leaves their phone on during a 13-minute EA Initiation rehearsal (the longest baked ritual). The STT mishears a line, the state machine auto-advances to the next line (`rehearsal-decision.ts`), but a bug or network blip pins the state machine in a retry loop that fires `/api/rehearsal-feedback` every few seconds for the rest of the night. By morning, 10,000+ Mistral/Groq Llama calls have been made. Or worse: the Brother walked away with the mic hot, background TV audio keeps triggering transcription → feedback cycles.

This is the Masonic-ritual-app analog of the published "$47K agent loop" failure mode — AI systems without stop conditions, step ceilings, or cost circuit breakers keep running on top of infrastructure that wasn't built for autonomy ([AI Agents Horror Stories: How a $47,000 AI Agent Failure](https://techstartups.com/2025/11/14/ai-agents-horror-stories-how-a-47000-failure-exposed-the-hype-and-hidden-risks-of-multi-agent-systems/)). The coaching-feedback loop here isn't a multi-agent loop, but it has the same structural property: a state machine that hits paid APIs with no explicit budget ceiling, and a wake-lock (intentionally added in commit `946a41d`) that prevents the phone from throttling itself to sleep.

**Why it happens:**
- `screen-wake-lock.ts` explicitly keeps the screen awake for the duration of playback (correct behavior for a Brother at the rail; dangerous when combined with an automated retry loop)
- `RehearsalMode.tsx` is a 1,511-line monolith with auto-advance state machine logic spread across many `useEffect`s, and no tests exist on the component (`CONCERNS.md` flags this explicitly)
- There is no session-level ceiling — a rehearsal can call `/api/rehearsal-feedback` once per stumble, and `autoAdvance` can fire it again on each retry, with no "you've asked for feedback 50 times in this session, something is wrong" backstop

**Warning signs:**
- In Vercel logs, repeated `/api/rehearsal-feedback` from the same session within seconds of each other
- Brother's "performance history" shows a single session with hundreds of line-attempts (normal is 20-200)
- Provider dashboard: Groq/Mistral token burn that doesn't correlate with known rehearsal-night attendance

**Prevention strategy:**
1. **Session step ceiling in the state machine** — pass a `sessionRequestCount` ref into `RehearsalMode`; after N `/api/rehearsal-feedback` calls in one session (e.g., 80 — above any legitimate rehearsal), hard-stop with "Session paused — long running session detected. Tap resume to continue."
2. **Server-side per-session budget** — `/api/rehearsal-feedback` accepts a client-supplied `sessionId`, server maintains a per-session counter (in-memory per Vercel instance is fine at pilot scale), returns 429 after N calls. Even if the client state is compromised, the server stops.
3. **Inactivity timeout on wake-lock** — auto-release the wake lock after 2 minutes with no user interaction (tap, scroll, STT result). Requires adding a `lastInteraction` ref to `RehearsalMode`. Once the screen sleeps, most paid-API paths gate behind visibility.
4. **Daily budget metric dashboard** (can be as cheap as a scheduled cron that hits the three provider billing APIs and emails Shannon) — detect a 3× day-over-day spike within hours, not at month-end.

**Phase to address:** Phase 1 (Cost/abuse safeguards) for step ceilings and daily metric. Phase 3 (RehearsalMode refactor + tests) for the state machine correctness.

---

### Pitfall 3: LLM feedback contradicts authoritative ritual text

**What goes wrong:**
The coaching LLM at `/api/rehearsal-feedback/route.ts` (Groq Llama 3.3 → Mistral fallback with a "roast-style persona") tells a Brother "you said 'East' but the correct word is 'West'" — but the correct word was in fact "East" and the diff engine already knew that. Or, the LLM invents a coaching cue like "the SW opens with the word 'Fidelity'" that is flat wrong for the Brother's lodge's working. A Past Master in the invited lodge sees this, and in the time it takes to screenshot, the tool's credibility in that lodge is gone. Word-of-mouth in Masonic circles is small-world and unforgiving — a tool that contradicts the authoritative working is "the AI tool that gets it wrong," permanently.

This is the [sycophancy + hallucination](https://www.mdpi.com/2673-2688/6/2/35) failure mode in its highest-stakes form: the LLM is confident, the user is a domain expert, the reference text exists and is authoritative, and the LLM didn't actually read it.

**Why it happens:**
- Groq Llama 3.3 has no training exposure to any specific lodge's ritual working (jurisdictional variance is large — UGLE ≠ PHA ≠ Canadian ≠ most US GLs; even within US jurisdictions workings differ)
- The current prompt in `rehearsal-feedback/route.ts` presumably passes the plain text + the Brother's attempt + the diff, but if the prompt leaves room for the LLM to "explain the ritual" from general knowledge, it will — and it will be wrong
- There is no eval harness today for feedback quality (the `CONCERNS.md` notes "LLM feedback quality is the headline pilot complaint")
- Masonic officers have decades of memorization. They notice every word. The error rate a Brother can accept in a spellchecker (~5%) is roughly 0% here.

**Warning signs:**
- A single Brother saying "the AI said the wrong thing" — treat as Severity 1, not a one-off
- Feedback output containing ritual-sounding phrases not present in the plain text the Brother is rehearsing (a simple post-hoc check: for every proper noun in the feedback output, require it to appear in the input plain text)
- Feedback that "explains what the degree means" — the tool isn't a ritual tutor, it's a memorization partner; philosophical commentary is off-mission and high-risk

**Prevention strategy:**
1. **Constrain the prompt to be STRICTLY about the diff** — "Given this reference line, this attempt, and this diff, describe ONLY what the Brother should try differently. Do not explain the ritual. Do not suggest what other lines should say. Do not quote any word that is not in the reference line above." This is the structured chain-of-thought + RAG-style grounding approach that the 2026 research literature identifies as reducing hallucinations 30-70% ([Prevent Hallucinations in LLM — Best Practices 2026](https://www.anavcloudsanalytics.ai/blog/prevent-hallucinations-in-llm/)).
2. **Post-hoc validation filter** — after the LLM returns, programmatically verify that every capitalized word in the feedback either (a) appears in the reference text, (b) appears in the Brother's attempt, or (c) is in an allowlist of safe coaching words ("breathing," "pace," "rhythm," role names). If validation fails, return a fallback "you stumbled at word N — try slower" message derived from the diff alone. This is the single most impactful anti-hallucination gate for this domain.
3. **Ship a "this feedback seems wrong" button** in Listen/Rehearsal mode. Every dismissal posts `{session_id, line_id, feedback_text}` to a dev endpoint for Shannon to review. Build this before the invited-beta — it's the only feedback loop that can improve the prompt over time.
4. **Offline eval harness** — curate 50 stumbles from pilot history, run them through the current prompt weekly, have Shannon mark each feedback as "stake my name on it / meh / wrong." Any regression on the "stake my name on it" bucket is a release blocker. Reference prior art: the formal dogfood/trace-review pipeline mentioned in PROJECT.md context.
5. **Consider a smaller, deterministic mode** for high-risk lines (invocations, formal obligations) — the diff + a pre-written coaching cue from the author. The LLM doesn't touch these at all. Authoring labor is bounded because these lines are <5% of any ritual.

**Phase to address:** Phase 2 (LLM feedback quality lift) — this IS the milestone's headline deliverable, and the headline complaint from the pilot.

---

### Pitfall 4: Style tag or voice-cast preamble leaks into baked audio

**What goes wrong:**
The Gemini TTS engine is instructed with a director's-notes preamble (`voice-cast.ts`) and per-line `[style]` prefix tags. Historically (per memory + `CONCERNS.md`), this preamble has leaked into the rendered audio — the Brother hears the AI speaking "Worshipful Master speaking in a calm tone, pause, then speaks" instead of the ritual line itself. At pilot scale with one author (Shannon), this is caught by dogfood. At 10-lodge scale with 155+ lines per ritual and multiple ritual workings (EA, FC, MM, Installation, lectures), a single line with preamble leak is shipped in a distributed `.mram` and every Brother in that lodge hears it for weeks.

**Why it happens:**
- Gemini preview models are moving targets — leak behavior varies across `gemini-3.1-flash-tts-preview`, `gemini-2.5-flash-preview-tts`, `gemini-2.5-pro-preview-tts` (the three in the fallback chain)
- The bake pipeline does not listen to every line before shipping — the author renders audio and moves on
- `STYLE_TAG_PATTERN` validates the style syntax but cannot detect whether a rendered audio blob contains the style text as speech
- Short-line regression (text-token bug, per `bake.log`: EA opening skipped 11 lines, EA initiation skipped 32) means short lines fall through to runtime TTS where the leak surface is different from bake — two parallel failure modes

**Warning signs:**
- Any Brother reports hearing "speaking in a calm tone" or similar stage direction in playback
- Bake log shows audio duration anomalies (a 4-word line that renders to 8 seconds of audio likely contains preamble read-aloud)
- Audio file size for a short line that is significantly larger than peer short lines in the same ritual

**Prevention strategy:**
1. **Automated audio-duration anomaly detector in the bake pipeline** — for each line, compute `duration_ms / char_count`. Flag any line >3× the ritual's median. Shannon listens to each flagged line before publish. Cheap, catches 80%+ of leaks.
2. **Server-side STT round-trip in the bake pipeline (optional, one-time cost at bake, not runtime)** — after rendering a line's audio, send it through Groq Whisper and diff the transcript against the source plain text. Any preamble leak shows up as extra words. Groq Whisper cost per ritual-bake is <$1. This is the definitive catch.
3. **Version-pin the Gemini model per bake** — when a `.mram` is baked, record which Gemini model actually rendered each line in the metadata. If `gemini-2.5-flash-preview-tts` is retired and a Brother's cached audio starts failing, Shannon knows which lodge's `.mram` needs a rebake (not all of them).
4. **Maintain the voice-cast preamble mitigation in `voice-cast.ts` as load-bearing** — `PROJECT.md` flags this already. Any refactor of the bake pipeline must preserve the existing guards; add a test that asserts the preamble is NOT echoed in sample outputs.

**Phase to address:** Phase 2 or 3 (Content bake pipeline hardening — specifically "Craft degree content complete" and "Installation ceremony baked" — this is the gating quality control).

---

### Pitfall 5: Cipher/plain-text parity drift in authored `.mram` files

**What goes wrong:**
A `.mram` contains both the cipher text (what the Brother reads — historically Masonic working uses cipher as a memory aid) and the plain text (what the diff engine compares STT output against). These must stay in lockstep. If Shannon fixes a typo in the plain text but forgets to update the cipher (or vice versa), the Brother sees the old line, speaks the old line perfectly, and the diff engine scores him at 60% accuracy because it's comparing to the new plain text. Invited-lodge Brothers will blame the app, not the author.

**Why it happens:**
- Authoring is solo and offline (`scripts/build-mram-from-dialogue.ts`) and the input is a single `{slug}-dialogue.md` file that the author edits by hand
- `author-validation.ts` validates style tag format but (likely — needs audit) does not validate cipher-to-plain character-level correspondence
- The bake output is binary — there is no human-readable diff between two versions of a `.mram` without a dedicated tool
- "Fix a typo" is a high-frequency operation across 155+ lines × 5 rituals × 1 working; even a 1% slip rate per edit ships bad parity

**Warning signs:**
- A single line in a rehearsal showing consistently poor accuracy across every Brother who tries it (3+ data points = structural error, not performance error)
- Accuracy score of <50% on a line where the Brother visibly spoke the cipher perfectly (dogfood catch)
- Cipher text and plain text for the same line disagree on speaker role, line count, or action markers

**Prevention strategy:**
1. **Authoring-time parity validator** — extend `author-validation.ts` to assert for every line: (a) cipher and plain have the same speaker role, (b) cipher and plain have the same action tags, (c) the word count ratio falls within expected bounds for the cipher style in use. Refuses to bake until clean.
2. **Post-hoc per-line error-rate telemetry from production** — a hash-of-line-id keyed counter `{line_hash: {attempts, accuracy_distribution}}` pushed to a dev endpoint. Any line where the median accuracy across ≥5 Brothers is <70% is a parity-drift suspect. This doubles as the LLM-feedback eval corpus (Pitfall 3).
3. **Bake-time diff summary** — when re-baking an existing ritual, auto-generate a CHANGELOG showing which lines' plain text changed. Shannon reviews before publish.
4. **"Report this line" button** in Rehearsal mode — three taps sends `{line_hash, diff, timestamp}` to the author inbox. Masonic officers are meticulous; let them flag.

**Phase to address:** Phase 3 (Authoring-throughput pitfalls — before publishing Craft degrees to invited lodges).

---

### Pitfall 6: No in-place correction for bad lines already distributed

**What goes wrong:**
Lodge Alpha gets their `.mram` in Week 1. Week 3, Shannon discovers a wrong word. Today the only fix is: re-bake the entire `.mram` (Gemini rendering cost + 10-20 minutes of author time), re-distribute via whatever channel (email attachment? Dropbox link? Magic-link re-download?), and hope every Brother in the lodge re-imports it. Many won't. Brothers rehearse with a silently-wrong version for weeks.

**Why it happens:**
- `.mram` is monolithic — a binary blob bundling text + audio. There is no per-line update mechanism.
- Distribution is implicit/manual today (pilot model). Invited-lodge model presumably keeps the same shape.
- IndexedDB per-device copies of the decrypted sections mean "just re-upload" requires explicit Brother action.

**Warning signs:**
- Shannon finding a content error, mentally calculating the effort to re-distribute, and deciding "I'll fix it next month" — this is the warning sign. It will happen repeatedly once there are 10 lodges.
- Brothers from lodge Alpha and lodge Beta reporting different errors in what is "the same ritual working" because they have different `.mram` versions loaded.

**Prevention strategy:**
1. **Embed `{mram_version, content_hash, build_date}` prominently in the UI** — Listen Mode footer shows "Working v2026.04.20 • build a3f1c2." Any support conversation starts with this string. Brothers on stale versions are immediately obvious.
2. **Server endpoint that advertises the current authoritative hash per working** — on app load, the client fetches `/api/content/latest-hashes` (lightweight, cacheable, no ritual content), compares against local `.mram` hashes, and shows a "Your ritual has been updated" banner if stale. Banner links to re-download.
3. **Magic-link re-download path** — every `.mram` download should be gated by the magic-link session, not distributed by email attachment. That way "re-distribute v2026.04.20" is a single deploy + banner, not a 10-email chain.
4. **Per-line errata JSON sidecar (lighter-weight fix channel)** — for small corrections between full rebakes, a signed `{ritual}-errata.json` with `{line_id, corrected_plain_text}` overrides in memory without rebaking audio. Catches the "one-word typo" case without waiting for a full rebake cycle. Audio stays slightly wrong (the Brother hears the old word in AI officer lines) but the diff is correct — acceptable for the few-weeks gap.

**Phase to address:** Phase 4 (Distribution & operational visibility) — must ship before the first invited lodge, because "we found a typo in your ritual" is a normal-operations event, not an edge case.

---

### Pitfall 7: Copyright / jurisdictional exposure from publishing ritual text

**What goes wrong:**
Many Masonic ritual working documents are copyrighted by Grand Lodges (UGLE most actively; several US GLs likewise). Publishing the plain text of a working, even inside an encrypted `.mram`, can be legally risky depending on the jurisdiction. More acutely: a publicly-indexed landing page, README, or social post that contains ritual text excerpts is a cease-and-desist magnet. The pilot already mitigates this (ritual content is encrypted, client-only, server never sees plaintext, `.mram` files are excluded from the middleware matcher). But scaling to invited lodges means the marketing/onboarding surface grows.

**Why it happens:**
- Demo screenshots, recruiter pitches, blog posts — the natural tendency is to show the product working, which means showing ritual text
- Support conversations leak ritual text in copy-paste back and forth (email, Slack, support form)
- Bug reports that include a stack trace with a rendered `RitualSectionWithCipher` in browser console get pasted into GitHub issues
- Analytics tools (even privacy-respecting ones) can capture innerText of a DOM node — if any one gets added, it breaks the invariant

**Warning signs:**
- A Grand Lodge officer emailing Shannon asking "where did you get your working text?"
- Search engines indexing a preview deploy URL because CSP/robots.txt didn't cover it
- Any marketing material that quotes actual ritual words (even 3-4 in a row)
- A contribution from an external "author" offering to add a new working (means they'd be contributing copyrighted text)

**Prevention strategy:**
1. **Never publish public artifacts containing ritual text** — landing page, screenshots, blog posts, PRs, GitHub issues. Use dummy text ("Brother, attend to the East" style) for all public-facing content. The landing page at `/landing.html` should be audited for this before any invited-lodge announcement.
2. **Require invited lodges to own their working's text** — the trust model is that each lodge authorizes use of their own working's text for their own use. Shannon bakes Shannon's lodge's `.mram` for Shannon's lodge. When lodge Alpha is invited, either (a) they work with their own authoritative text source within their lodge's permission, or (b) they use Shannon's lodge's working as "close enough" with explicit acknowledgment. This is a licensing conversation, not a technical one, but the tech should support it.
3. **`robots.txt` + `X-Robots-Tag: noindex`** on the entire app (not just API). Invited-beta means search engines never need to know the app exists.
4. **No error reporting / telemetry tool (Sentry, PostHog, etc.) that captures innerText, DOM snapshots, or console.log contents** without an explicit redaction layer. The existing type-system anonymization + hashed-user-id analytics pattern noted in PROJECT.md is the right shape — extend it before adding any new observability tool.
5. **`.mram` files are excluded from the middleware matcher today** — preserve that. Any future routing change that starts serving `.mram` through a logged route is a trust-model regression.
6. **Support-ticket template with redaction guidance** — "Please describe what you saw without pasting the line text. Instead, send us the line ID from the URL." Codify in a SUPPORT.md before invites go out.

**Phase to address:** Phase 0 (Pre-invite legal/privacy hardening) — before any outside lodge Brother gets a magic link.

---

## Moderate Pitfalls

These won't destroy trust by themselves but compound — each one adds friction that makes invited Brothers less likely to stick with the tool.

---

### Pitfall 8: Fluid Compute scale-to-zero breaks in-memory rate limit mid-abuse

**What goes wrong:**
The rate limiter at `src/lib/rate-limit.ts` uses an in-memory Map per Vercel instance. Fluid Compute scales to zero when traffic is low (pilot scale). When an abuse burst starts, a brand-new instance spins up with an empty rate-limit Map. The attacker's first 60 requests/min are all free. By the time the old instance ages in, the attacker has scripted a cold-start loop that deliberately triggers new instances.

**Why it happens:**
- Documented scaling limit in `CONCERNS.md` ("In-memory rate limiter resets on cold start")
- Pilot scale made this an acceptable tradeoff; invited-beta increases the attack surface enough that "5 Brothers, low cold-start frequency" no longer holds

**Warning signs:**
- Rate-limit rejection counts in logs that don't monotonically climb (each cold start resets the counter to zero → pattern in logs is "reject, reject, reject, silence, small count, reject")
- Provider dashboards showing burst usage in <30s windows that should have been capped

**Prevention strategy:**
- **At ≤10 lodges, accept the risk IF per-user caps (Pitfall 1) are in place** — a per-user daily cap enforced at the route level doesn't care about Fluid Compute scale-to-zero because the cap is persisted (e.g., in IndexedDB on the client and recorded in Vercel KV on the server at spend time). The IP-based sliding window is defense-in-depth; the per-user daily cap is the load-bearing protection.
- **Plan the Upstash Redis migration as a one-hour upgrade** — `CONCERNS.md` notes the call-site interface doesn't change. The moment pilot expands past 10 lodges or one real abuse incident occurs, flip the switch.

**Phase to address:** Phase 1 (cost/abuse safeguards).

---

### Pitfall 9: No admin visibility into per-lodge / per-user usage

**What goes wrong:**
Shannon can't answer "how many rehearsals did lodge Alpha do last week?" without SSH'ing into Vercel logs and grepping. Worse: he can't answer "is lodge Alpha even using the app, or did they silently bounce after the magic link?" The invited-beta model assumes Shannon is lightly curating the experience; without visibility he's flying blind and bugs go un-noticed for weeks.

**Why it happens:**
- No analytics layer exists today (`CONCERNS.md` explicitly notes this — "requires analytics layer that doesn't yet exist")
- Privacy constraints rule out most off-the-shelf tools (they'd capture ritual text or lodge identifiers)
- Performance-history IndexedDB is per-device — Shannon can't see it

**Warning signs:**
- "How's it going at lodge Beta?" — Shannon doesn't know.
- A pilot user reports a crash from last week; no server log still exists.
- Shannon can't tell if the LLM feedback prompt change he shipped yesterday helped or hurt.

**Prevention strategy:**
1. **Type-system-anonymized event telemetry** (per the existing pattern noted in PROJECT.md context) — events: `rehearsal_started`, `rehearsal_completed`, `feedback_requested`, `feedback_dismissed_as_wrong`, `tts_fallback_engaged`, `line_accuracy_below_threshold`. Payload is hashed user ID + ritual slug + line hash + integer counts. No ritual text, no email, no lodge identifier.
2. **Lightweight admin dashboard behind a Shannon-only magic link** — weekly rollup by `hash(user_id)` and ritual slug. Not per-lodge (that would leak lodge identity) but per-anonymous-user is enough to detect "user X did 200 rehearsals last week" and "user Y signed in once and never returned."
3. **Error reporting that sanitizes** — stack traces only, no rendered state. A redaction layer that strips any string property >50 chars from Error payloads before transmission.

**Phase to address:** Phase 4 (Distribution & operational visibility).

---

### Pitfall 10: No clean way to revoke an invitation

**What goes wrong:**
Lodge Alpha was invited in March. In August, lodge Alpha's WM and Shannon have a disagreement. Shannon wants to revoke their access. Today: (a) remove their emails from `LODGE_ALLOWLIST` env var (requires Vercel redeploy), (b) nothing invalidates their existing 30-day session JWT — they stay signed in until their cookie expires and can use the app freely, (c) their IndexedDB-decrypted `.mram` stays on their device forever because the tool never re-checks authorization against the server.

**Why it happens:**
- `CONCERNS.md` flags "Stateless magic-link JWTs remain valid after use" and "No one-time-use consumption on magic links" — both relate to this
- The architecture is correctly privacy-first (server never has ritual content) which makes "reach out and revoke" difficult by design

**Warning signs:**
- The mental conversation Shannon has when thinking about which lodges to invite: "what if I need to undo this?" That hesitation itself is the warning sign.

**Prevention strategy:**
1. **Stateful session JWT with server-side revocation list** — move session tokens to an Upstash KV-backed model; revocation is a single KV write. Already a P2 in `TODOS.md`. Invited-beta elevates this to a pre-ship requirement, not a future improvement.
2. **Client-side lodge-auth heartbeat** — app checks `/api/auth/verify-allowlist` on every launch; if the email is no longer allowlisted, wipe the IndexedDB and show "Your lodge's access has been withdrawn. Please contact the author." This makes revocation feel authoritative even though ritual data physically lingers on disk until wipe.
3. **"Working expires on date X" baked into every `.mram`** — `.mram` metadata includes an expiry date; after that date, the app refuses to decrypt. Shannon re-bakes + re-distributes annually. This is a belt-and-suspenders revocation mechanism — time-bombs any lodge's access and forces a yearly renewal conversation.

**Phase to address:** Phase 0 or Phase 4 depending on risk appetite — Phase 0 if invited-beta requires strong revocation as a trust signal to hesitant WMs; Phase 4 if it can ship post-invite once real need emerges.

---

### Pitfall 11: Brothers sharing credentials inside a lodge

**What goes wrong:**
Lodge Alpha's Senior Warden forwards his magic link to another Brother who hasn't been set up yet. That Brother clicks, becomes signed in as the SW, and now there are two devices on one account. Performance history collides. Rate limits for SW double-apply to both Brothers. If SW ever needs his account revoked, the forwarded-to Brother loses access too.

Separate failure: the lodge Master shares his lodge passphrase to decrypt `.mram` with a Brother, and the Brother sets up on his own device. Fine in principle (the passphrase is per-lodge, that's correct). But if the passphrase is weak ("lodge123") and the Brother forwards it in a group email, the decryption barrier is gone.

**Why it happens:**
- Magic links and lodge passphrases are the natural channels for "inviting a brother" inside a lodge — the tool doesn't have a first-class "invite another Brother to this lodge" flow
- Masonic culture is familial and cross-sharing of resources is normal; users don't perceive this as a security issue

**Warning signs:**
- Multiple distinct User-Agent strings on the same `hash(user_id)` within 30 days
- A lodge reporting that more Brothers are using the app than were originally allowlisted

**Prevention strategy:**
1. **First-class per-Brother account model** (not per-email) — each Brother gets their own allowlist entry, their own session, their own per-user rate limit. The `LODGE_ALLOWLIST` env var is already per-email; surface this as "every Brother who will use the app needs their own email added" in onboarding docs.
2. **Device-binding on session JWT** — stamp a device fingerprint (stable hash of UA + screen + timezone) into the JWT at issue. If a JWT is used from a different fingerprint, re-challenge for magic link. Defeats casual forwarding.
3. **Passphrase strength requirement at lodge-passphrase setup** — refuse passphrases <12 chars or on a common-password list. The `.mram` at-rest encryption is load-bearing for the trust model.
4. **Lodge onboarding doc** explicitly calls out "each Brother needs their own invitation; please do not share your magic link." Social, not technical, but sets the expectation.

**Phase to address:** Phase 0 (onboarding) for social guidance; Phase 1 (abuse safeguards) for device-binding and per-Brother enforcement.

---

### Pitfall 12: Silent TTS fallback degrades playback without user awareness

**What goes wrong:**
All three Gemini preview models 429/404 simultaneously (Google deprecation event, paid-tier quota exhaustion). Client silently falls through to Voxtral → Google Cloud → browser TTS. A Brother hears a different voice mid-rehearsal, thinks "why does SW sound different today?" and doesn't trust the tool anymore. Worse: the voice-cast profile was designed around Gemini's voice bank; Voxtral's voices don't map the same way, so the Brother hears SW in JW's voice.

This is tracked in `CONCERNS.md` and `TODOS.md` as "No user-visible banner when TTS falls back" — the deprioritization reason ("bake-in covers the common case") holds for baked rituals but breaks for any voice-cast override or runtime render.

**Why it happens:**
- The fallback chain in `tts-cloud.ts` is silent by design (graceful degradation)
- No UI surface was wired for "we're operating in degraded mode"
- Baked audio shipping (commit `4714a3d`) reduced the common-case frequency so the priority dropped

**Warning signs:**
- Brother reports "the voices sound different"
- Logs show Voxtral or browser TTS calls from rehearsal sessions where Gemini should have been in cache

**Prevention strategy:**
- Ship the banner from `TODOS.md` ("Voxtral fallback + error banner"). A 2-minute React change. De-risks the distrust pattern.
- Voice-cast parity between Gemini and Voxtral (map Gemini voices to closest Voxtral voices in the `{ritual}-voice-cast.json` sidecar) so fallback at least plays WM in a WM-like voice.

**Phase to address:** Phase 2 (LLM + AI feedback quality) or Phase 3 (bake pipeline hardening) — whichever touches `tts-cloud.ts` first.

---

## Minor Pitfalls

These are small enough that individually they don't threaten the milestone, but an accumulation erodes polish.

---

### Pitfall 13: Dead-weight npm packages shipped in bundle

**What goes wrong:**
`@ai-sdk/anthropic`, `@ai-sdk/react`, `ai`, `natural`, `uuid` are listed in `package.json` but currently unused (per PROJECT.md memory notes). They increase bundle size for every first-load user. Worse: they represent supply-chain surface — any CVE in these packages affects the app even though the app doesn't use them.

**Why it happens:** Historical exploration left them behind.

**Warning signs:** `npm audit` output that mentions packages you haven't intentionally used in months. Bundle analyzer showing unknown names.

**Prevention strategy:** Delete them with a single commit before invited-beta. Run `npm ci && next build` to verify the app still builds.

**Phase to address:** Phase 0 (pre-invite cleanup).

---

### Pitfall 14: Masonic-vocabulary STT prompt drift across rituals

**What goes wrong:**
`/api/transcribe/route.ts` passes a Masonic vocabulary prompt to Groq Whisper to improve recognition of "Worshipful Master," "Tyler," "cable-tow," etc. If this prompt is tuned for one ritual (say, EA opening) and the Brother is practicing Installation, the specific vocabulary of Installation (different officer titles, different obligations) may be under-weighted. Accuracy dips unexplainedly for some rituals.

**Why it happens:** Single static prompt for the STT route; no per-ritual specialization.

**Warning signs:** A specific ritual shows systematically lower median accuracy than others, controlling for Brother skill.

**Prevention strategy:** Pass a ritual-slug-derived vocabulary hint from the client to `/api/transcribe`. Maintain per-ritual vocabulary strings in the bake pipeline (the author already knows what words appear).

**Phase to address:** Phase 3 (authoring throughput enhancements).

---

### Pitfall 15: IndexedDB schema drift between `storage.ts` and `voice-storage.ts`

**What goes wrong:**
Per `CONCERNS.md`, two modules open the same IDB at version 4 and each declares the store set. Any future schema bump that touches one module but forgets the other silently breaks whichever module loses the open-race.

**Why it happens:** Pragmatic historical choice; the comment explains why, but the invariant is load-bearing and untested.

**Warning signs:** A post-deploy user reports "voices gone" or "rituals gone" depending on which module opened first.

**Prevention strategy:** Extract `src/lib/idb-schema.ts` with the single `onupgradeneeded`; import from both modules. Add a test that opens DB twice under swapped module order and asserts all stores exist.

**Phase to address:** Phase 3 (technical-debt consolidation) or whenever a new IDB store is next added.

---

## Technical Debt Patterns

Shortcuts that shipped (reasonably) for pilot scale, and their expiry dates at invited-beta scale.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Shared `NEXT_PUBLIC_RITUAL_CLIENT_SECRET` as the bundle-level API gate | Zero infra; one env var; stops drive-by curl | Can't revoke per-lodge; doesn't stop motivated attackers; must be rotated app-wide on any leak | Pilot-only (already past that boundary). Invited-beta requires layered per-user caps (Pitfall 1) |
| In-memory per-Vercel-instance rate limiter | No infra dependency; zero cost; simple | Resets on cold start; can't enforce per-user ceilings across instances | Pilot-only. Upgrade to Upstash Redis when abuse first occurs or at >10 lodges, whichever first |
| Single env var `LODGE_ALLOWLIST` as auth data model | Trivial CRUD ("edit the env var"); zero DB | No per-user state (revocation, rate quota, device fingerprint); no lodge grouping; redeploy required to change | Invited-beta tolerable for ≤10 lodges; move to a first-class user model when revocation becomes a real-world event, not a hypothetical |
| Monolithic `RehearsalMode.tsx` (1,511 lines, untested) | Fast initial velocity; no cross-component plumbing | Every future change risks regressing the auto-advance / TTS / STT / generation-counter state machine — the three recent voice-overlap fixes are exactly this risk materializing | Only acceptable while no new feature touches the rehearsal state machine. Phase 2 LLM-quality work WILL touch it; split setup/advance/STT lifecycle before starting |
| Stateless 30-day session JWT with no revocation list | Zero DB; edge-runtime friendly | Can't revoke a lodge; leaked links live 24h; compromised device lives 30 days | Pilot tolerable; invited-beta requires stateful sessions before any lodge has a dispute |
| `.mram` as monolithic binary with no per-line errata channel | Simple mental model; atomic distribution | Any typo fix = full rebake + redistribute; weeks-long windows where lodges run stale content | Only acceptable while total ritual content is stable. Phase 2 LLM-prompt iteration and Phase 3 authoring activity will expose this repeatedly |
| No automated per-line error-rate telemetry | Nothing to build; zero privacy risk | Can't detect parity-drift bugs (Pitfall 5); can't build LLM eval corpus (Pitfall 3); flying blind | Never-quite-acceptable; the absence is the reason the LLM-quality milestone is hard. Build anonymized version in Phase 1 |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Gemini 3.1 Flash TTS preview | Treat it as stable → get surprised by model deprecation / preamble-leak regression | Preserve the 3-model fallback chain, env-var hot-swap, bake-time audio validation (Pitfall 4); also: never render production audio without listening to it |
| Groq Whisper STT | Assume one prompt works for all rituals | Pass per-ritual vocabulary (Pitfall 14); validate `X-Client-Secret` and session JWT at route level even if middleware does so |
| Groq Llama / Mistral feedback LLM | Pass plain text + attempt + "give feedback"; let the LLM narrate | Constrain the prompt HARD (Pitfall 3); post-filter output for hallucinated ritual text; maintain an eval corpus; ship a user-facing "wrong" button |
| Resend (magic-link email) | Assume all email addresses resolve (iCloud Private Relay doesn't — flagged in `CONCERNS.md`) | Test with an iPhone user before wider invite; consider a post-magic-link "did you receive the email?" self-service reset |
| Vercel Fluid Compute | Assume it's always warm; rely on in-memory state for any security invariant | For anything financial (rate limits, quotas), require persistent storage path. Fluid Compute warm-state is a performance benefit, never a correctness assumption |
| IndexedDB | Change schema in one module; forget the other (Pitfall 15) | Single shared `idb-schema.ts` module; test dual-module upgrade path |
| Wake Lock API | Acquire once; never release until unmount | Release on inactivity timeout (Pitfall 2); re-acquire on visibilitychange (already implemented, preserve it) |
| CSP with `unsafe-inline`/`unsafe-eval` | Tighten at every deploy to feel "more secure" | Accept as-is per inline comment; don't introduce third-party script tags that widen connect-src; revisit only at jurisdictional scale |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Base64-encoded audio in IDB (33% bloat) | Storage pressure on older Android devices; slow cold boot of Listen Mode | Migrate to `Blob` storage at next KEY_VERSION bump | Already a tax at pilot scale; felt as annoyance at 10 lodges when a Brother has EA+FC+MM+Installation+lectures cached |
| Bake skips on <11-char lines (43+ runtime hits per ritual) | Cold-cache 2-5s latency on short lines; daily quota bleed on voice-cast overrides | Fix the text-token regression or prepend padding that the server strips post-render | Any day all three Gemini preview models 429 simultaneously → runtime TTS fails entirely |
| No prefetch of line N+1 | 2-5s stall between lines on voice-cast-override sessions | Already in `TODOS.md` P3; ship as part of Phase 2 LLM-quality work | Bake skip + voice-cast override compound to make this felt |
| Default voice pool bundled (~15 voices) | Slow first paint for first-time visitors | Lazy-load on Voices-page first visit | Felt by first-impression quality; relevant when a new lodge's WM opens the app for the first time |
| No HTTP cache on paid TTS responses | Every client cache miss = full provider re-render | Shared Redis/KV cache when Redis is already justified | Deferred; acceptable if bake-audit (Pitfall 4 prereq) is shipped |

---

## Security Mistakes

Beyond OWASP basics — pitfalls that are specific to this AI-proxy + private-content + invited-user shape.

| Mistake | Risk level | Project-specific reason |
|---------|------------|------------------------|
| Treating shared client secret as real auth (Pitfall 1) | HIGH | Baked into bundle; extractable in seconds; guards four paid-AI routes; single point of lodge-wide compromise |
| No per-user rate limits on paid routes | HIGH | One compromised Brother's credentials = uncapped burn rate on Gemini/Mistral/Groq until Shannon notices |
| Stateless session JWTs with no revocation (Pitfall 10) | MEDIUM-HIGH | Invited-lodge trust model assumes Shannon can un-invite; today he can't, for up to 30 days |
| Shared secret rotation without coordination | MEDIUM | Rotating bricks open-tab sessions until reload; no runbook today |
| Any telemetry that captures innerText (Pitfall 7) | HIGH (legal) | Copyright exposure on ritual text |
| Magic-link reuse within 24h expiry (Pitfall 10) | MEDIUM | Forwarded email, browser history, referer headers |
| iCloud Private Relay email mismatch | LOW but embarrassing | Silent sign-in failure for iPhone Brothers; undermines onboarding-quality claim |
| Preamble leak into audio (Pitfall 4) | MEDIUM (trust) | Not a security breach in the info-leakage sense, but a credibility incident |
| Dev-only `/api/author/*` routes if `MRAM_AUTHOR_ALLOW_LAN=1` is ever set on a non-trusted LAN | MEDIUM | Arbitrary file writes to `rituals/*.md` — document the LAN-trust requirement prominently |
| No kill switch for paid AI (Pitfall 1 strategy 4) | MEDIUM | If abuse is detected at 2 AM, Shannon needs a single env-var flip, not a feature-flag refactor |

---

## "Looks Done But Isn't" Checklist

Pre-invite checklist — each item is a thing that looks shipped but has a subtle gap.

- [ ] Shared secret rotation runbook exists and has been executed at least once in staging (Pitfall 1)
- [ ] Per-user daily cap on all four paid routes is enforced and tested with a load script (Pitfall 1)
- [ ] Kill-switch env var wired and documented (Pitfall 1)
- [ ] `/api/rehearsal-feedback` has a session-level step ceiling (Pitfall 2)
- [ ] LLM feedback output is post-filtered for hallucinated proper nouns (Pitfall 3)
- [ ] LLM feedback has a "this is wrong" user-facing button wired to an author inbox (Pitfall 3)
- [ ] An eval corpus of ≥50 stumbles exists; ranked by Shannon; regressions block release (Pitfall 3)
- [ ] Bake pipeline flags audio-duration anomalies per line (Pitfall 4)
- [ ] Authoring-time cipher/plain parity validator exists and blocks bake on failure (Pitfall 5)
- [ ] `.mram` version + build hash is visible in UI on every page (Pitfall 6)
- [ ] Landing page, README, screenshots, social posts contain zero real ritual text (Pitfall 7)
- [ ] `X-Robots-Tag: noindex` on all app routes (Pitfall 7)
- [ ] Telemetry (if added) has an explicit redaction layer; no innerText, no console.log payloads, no email addresses (Pitfalls 7, 9)
- [ ] Stateful session with server-side revocation list exists, OR a conscious decision has been logged to defer (Pitfall 10)
- [ ] `LODGE_ALLOWLIST` has a per-Brother granularity (one email per Brother, not one per lodge) (Pitfall 11)
- [ ] TTS fallback banner shipped OR explicit decision logged that baked audio covers the common case (Pitfall 12)
- [ ] Dead npm packages (`@ai-sdk/anthropic`, `@ai-sdk/react`, `ai`, `natural`, `uuid`) removed (Pitfall 13)
- [ ] iCloud Private Relay sign-in tested on a real iPhone (CONCERNS: "Verify iCloud Private Relay behavior during pilot" P1)
- [ ] `curl` against paid routes without session JWT returns 401 (not just 401 without shared secret) (Pitfall 1 layered defense)
- [ ] Provider spend dashboards (Gemini, Groq, Mistral) bookmarked; daily-spend alert wired to Shannon's email

---

## Pitfall-to-Phase Mapping

Mapping each pitfall to the v1 roadmap phase that should address it. Assumes a plausible 4-phase shape: Phase 0 (pre-invite hardening / cleanup), Phase 1 (cost/abuse safeguards), Phase 2 (LLM feedback quality lift), Phase 3 (authoring throughput + content), Phase 4 (distribution & operational visibility).

| Pitfall | Phase | Verification signal |
|---------|-------|---------------------|
| 1. Shared-secret abuse | Phase 1 | Load test: 1000 curl requests with valid secret but invalid JWT → all 401; per-user cap enforced |
| 2. Runaway feedback loop | Phase 1 | Unit test: `RehearsalMode` session counter trips at N calls; server 429 on session budget |
| 3. LLM contradicts ritual text | Phase 2 | Eval corpus pass rate ≥ threshold; hallucinated-noun post-filter unit tested |
| 4. Preamble leak into audio | Phase 3 | Bake-time STT round-trip diff clean on sample; anomaly detector flags known bad line |
| 5. Cipher/plain parity drift | Phase 3 | Validator rejects a deliberately-corrupted `{slug}-dialogue.md` |
| 6. No in-place correction | Phase 4 | Hash advertisement endpoint live; UI shows build hash; re-download works |
| 7. Copyright / jurisdictional exposure | Phase 0 | Landing page reviewed; `X-Robots-Tag: noindex` in production headers |
| 8. Fluid Compute rate-limit reset | Phase 1 | Per-user cap makes cold-start reset a non-issue for paid routes |
| 9. No admin visibility | Phase 4 | Anonymized dashboard shows last 7-day activity; Shannon can answer "is lodge Alpha active?" |
| 10. No clean revocation | Phase 0 (if strong) or Phase 4 | Revocation test: remove email from allowlist → session invalidates within N minutes |
| 11. Credential sharing within a lodge | Phase 0 (docs) + Phase 1 (device-binding) | Device-fingerprint change forces re-challenge in e2e test |
| 12. Silent TTS fallback | Phase 2 or 3 | Forced fallback triggers visible banner in Listen Mode |
| 13. Dead npm packages | Phase 0 | `npm ls @ai-sdk/anthropic natural uuid` returns empty |
| 14. STT vocab drift | Phase 3 | Per-ritual vocabulary hints shipped; accuracy parity across rituals in dogfood |
| 15. IDB schema drift | Phase 3 | Shared schema module; dual-open test passes |

---

## Sources

**Project-internal (HIGH confidence):**
- `.planning/PROJECT.md` — Core value, Active requirements, Out of Scope, Key Decisions
- `.planning/codebase/CONCERNS.md` — Tech debt, known bugs, security considerations, scaling limits (all 15 sections grounding specific pitfalls)
- `.planning/codebase/ARCHITECTURE.md` — Layer structure, data flow, error handling patterns
- `TODOS.md` — Tracked but unshipped items, especially the P2 "Stateful one-time-use magic links" and P3 "Voxtral fallback + error banner"
- `~/.claude/skills/llm-api-cost-amp-shared-secret-protection/SKILL.md` — Explicit threat model for the shared-secret pattern that this project uses (and the ways it is knowingly insufficient at invited-beta scale)
- `~/.claude/skills/markdown-beats-jsonl-for-llm-transcripts/SKILL.md` — Adjacent pattern relevant to Phase 2 eval corpus shape
- Commits `0bcbfd8`, `9bcb5b4` (voice overlap fixes) and `946a41d` (wake-lock addition) — used as concrete precedents for fragility patterns

**Ecosystem (MEDIUM confidence, from 2026 publications):**
- [The Promises and Pitfalls of Large Language Models as Feedback Providers (MDPI, 2025)](https://www.mdpi.com/2673-2688/6/2/35) — prompt engineering's effect on feedback quality; grounded the Pitfall 3 prompt-constraint strategy
- [LLM Hallucinations in 2026: How to Understand and Tackle AI's Most Persistent Quirk (Lakera)](https://www.lakera.ai/blog/guide-to-hallucinations-in-large-language-models) — hallucination rates (15-52%) in 2026 benchmarks
- [Prevent Hallucinations in LLM — Best Practices 2026 (AnavClouds)](https://www.anavcloudsanalytics.ai/blog/prevent-hallucinations-in-llm/) — RAG/CoT reducing hallucinations 30-70%
- [AI Agents Horror Stories: How a $47,000 AI Agent Failure (TechStartups, 2025)](https://techstartups.com/2025/11/14/ai-agents-horror-stories-how-a-47000-failure-exposed-the-hype-and-hidden-risks-of-multi-agent-systems/) — canonical case study for Pitfall 2 (runaway loops without cost ceilings)
- [The Cost Circuit Breaker: Financial Controls for Production AI Agents (Fountain City Tech)](https://fountaincity.tech/resources/blog/ai-agent-cost-circuit-breaker/) — step ceilings, budget caps, kill switches as standard patterns

**Negative evidence / things NOT found:**
- No evidence of an established "Masonic ritual software" vendor ecosystem with prior-art pitfalls to learn from (MEDIUM confidence the field is genuinely new, not that the search missed it)
- No established standard for AI coaching feedback quality evaluation (HIGH confidence — the research literature frames this as open)

---
*Pitfalls research for: pilot → invited-beta AI coaching tool with paid AI APIs and sensitive user content*
*Researched: 2026-04-20*
