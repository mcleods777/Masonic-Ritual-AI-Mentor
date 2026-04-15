# TODOS

Items tracked for future work. Grouped by component. Priority from P0 (blocker)
through P4 (nice-to-have). Completed items move to the bottom section.

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
