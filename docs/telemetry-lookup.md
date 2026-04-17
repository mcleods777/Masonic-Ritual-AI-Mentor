# Telemetry Lookup — Operator Runbook

**Audience:** You (Shannon), the operator. Not the Custodian, not Brothers,
not other developers.

**Problem it solves:** In PostHog, every Brother appears as an opaque 16-hex
identifier (e.g. `6e3237aac0cd64e7`), not an email. This is the privacy model
— PostHog cannot un-hash anyone. Even a breach of PostHog would leak no
identifying information. But when you're reviewing pilot activity and need to
know "is Brother Smith actually practicing, or has he gone silent," you need
a way to match hashes to people on your own machine.

This runbook documents that process.

See also: `PRIVACY.md` (user-facing privacy policy), `src/lib/user-id.ts`
(the hash function), `scripts/whois.ts` (the lookup script).

---

## Quick reference

```bash
cd ~/Masonic-Ritual-AI-Mentor

# Print the full email -> hash table (reads LODGE_ALLOWLIST from .env.local)
npx tsx scripts/whois.ts --all

# Hash one email
npx tsx scripts/whois.ts --email brother@example.com

# Reverse: saw a hash in PostHog, want to know who
npx tsx scripts/whois.ts --hash 6e3237aac0cd64e7

# Use a custom email list (not from LODGE_ALLOWLIST)
npx tsx scripts/whois.ts --all --emails brother.a@x.com,brother.b@y.com
```

Exit codes:
- `0` — success
- `1` — usage error (missing flag, no allowlist found)
- `2` — hash not found in the allowlist (reverse lookup failed)

---

## One-time setup before the pilot begins

When you onboard the 8 pilot Brothers (5 friends + 2 strangers + 1 pain case),
capture their hashes ONCE and keep the lookup table where you'll find it.

### 1. Put all pilot emails in `.env.local`

```
LODGE_ALLOWLIST=brother.one@example.com, brother.two@example.com, ...
```

(You already have this — it's used by the magic-link sign-in flow. Same list
works for the lookup script.)

### 2. Generate the lookup table

```bash
cd ~/Masonic-Ritual-AI-Mentor
npx tsx scripts/whois.ts --all > ~/Documents/mram-pilot-roster.txt
```

The output is a plain-text table:

```
email                        hash
--------------------------   ----------------
brother.alice@example.com    a1b2c3d4e5f6g7h8
brother.bob@example.com      9988776655443322
...
```

### 3. Store the table somewhere private

Options, in order of best practice:

- **Password manager** (1Password, Bitwarden) — create a secure note titled
  "MRAM pilot roster" and paste the table. Best: survives machine loss,
  searchable, encrypted at rest, synced across devices.
- **Local encrypted folder** (Documents/private/, or `age`-encrypted file).
- **Plain text file outside the repo** (e.g., `~/Documents/mram-pilot-roster.txt`).
  Fine for pilot scale if you trust your disk encryption. Never commit.

### 4. NEVER commit the table

The table effectively de-anonymizes PostHog. Anyone with both this table and
PostHog access could reconstruct per-Brother activity. Keep them separate.

---

## Day-to-day workflows

### A. "I see activity from hash X — who is this?"

You're looking at PostHog's Activity log or a specific event and see
`distinct_id: 6e3237aac0cd64e7`.

```bash
npx tsx scripts/whois.ts --hash 6e3237aac0cd64e7
```

- Prints the email if it matches a Brother in `LODGE_ALLOWLIST`.
- Prints `unknown (not in LODGE_ALLOWLIST)` if no match. This usually means
  one of:
  - The hash is YOUR hash (sign-in from your own dev or admin email).
  - You've added a new Brother to the pilot but haven't updated
    `LODGE_ALLOWLIST` locally. Re-pull or update your `.env.local`.
  - A stale event from a Brother who was removed.

### B. "Is Brother Smith practicing this week?"

You know the email, you want to see his activity.

1. Compute his hash:
   ```bash
   npx tsx scripts/whois.ts --email brother.smith@example.com
   # → 4f8b3c2a1d6e9f7a
   ```

2. In PostHog, go to **Persons** (left sidebar) and search for
   `4f8b3c2a1d6e9f7a`. Click through to his person page. You'll see:
   - Total events
   - First seen / last seen dates
   - Per-event timeline
   - Properties he's associated with

3. Or build a filter in any Insight: `distinct_id = 4f8b3c2a1d6e9f7a`.

### C. "Per-Brother weekly usage report"

For a pilot retro or to decide if a Brother is actually engaged.

1. In PostHog, create an Insight (Trends) on event
   `ritual.practice.started`.
2. Breakdown by `distinct_id`.
3. Set date range (last 7 days, last 30 days).
4. Eyeball which hashes are active and which are missing.
5. Cross-reference the hashes against your private lookup table.

You can also export the Insight as CSV and do the cross-reference in a
spreadsheet locally.

### D. "Who signed in but never practiced?"

Funnel analysis in PostHog:
1. Step 1: `auth.sign_in.succeeded`
2. Step 2: `ritual.practice.started`

Anyone who completes Step 1 but not Step 2 is a drop-off. Their `distinct_id`
is visible in the funnel detail view. Reverse-lookup each one — these
Brothers may need a nudge, or the product has a rough edge between sign-in
and practice that's losing them.

### E. "Pain case Brother — did he reach for the tool?"

Your most important data point pre-Custodian meeting. Make a saved Insight
scoped to just the pain-case Brother's hash, with events
`ritual.practice.started`, `ritual.line.passed`, `ritual.line.failed` over
time. Check it daily leading up to his ritual deadline.

If he opens the tool unprompted in the 30 days before the deadline, wedge
hypothesis validated. If not, wedge hypothesis fails — bring that honestly
to the Custodian meeting anyway.

---

## Things to keep in mind

### Hashes are deterministic but one-way

- The same email always produces the same hash (so your lookup table stays
  valid as long as the Brother's email doesn't change).
- Given a hash, you cannot derive an email without also knowing the email
  list. PostHog has hashes and no email list. You have both, separately.

### Emails must be normalized identically

`hashEmail()` in `src/lib/user-id.ts` does `trim().toLowerCase()` before
hashing. `scripts/whois.ts` does the same. If a Brother types
`BROTHER.SMITH@Example.com` vs `brother.smith@example.com` at sign-in, they
hash identically — no mismatch. But if you ever change the normalization
logic, existing hashes would orphan. Don't change it.

### Adding a Brother mid-pilot

1. Add his email to `LODGE_ALLOWLIST` in Vercel (prod) and `.env.local`
   (local).
2. Re-run `npx tsx scripts/whois.ts --all` and update your lookup table
   note.
3. His first sign-in will create the hash in PostHog automatically — no
   action needed on the PostHog side.

### Removing a Brother mid-pilot

1. Remove his email from `LODGE_ALLOWLIST`. He'll no longer be able to sign
   in; existing sessions expire in 30 days.
2. His PostHog events remain (by design — data retention is 12 months,
   aggregated events are useful even after a Brother leaves).
3. If you need to proactively expire him: rotate `JWT_SECRET` in Vercel,
   which invalidates every session in seconds. Use only if he's lost his
   device or you have a specific security concern.

### What to do if your lookup table leaks

Low-impact event, but handle it cleanly:

1. The leaked table exposes which hashes correspond to which emails. It does
   NOT expose ritual content, passphrases, or practice-specific data (only
   that Brother X has been identified with hash Y).
2. If a Brother's email itself is sensitive (not already public), advise
   them.
3. Rotate by replacing emails: ask affected Brothers to sign in with a new
   email and remove the old email from `LODGE_ALLOWLIST`. New email → new
   hash → old leak is obsolete.
4. Tell the Custodian if already engaged. This is the kind of honest
   disclosure that builds trust.

---

## If the lookup workflow becomes annoying

The lookup script adds ~30 seconds per investigation. For a 5-8 person
pilot that's fine. If the pilot grows or you find yourself doing it
constantly, two escalations:

### Nickname tier (Option 2)

Attach opaque nicknames (`B1`, `B2`, `WM_SmithLodge`) to each person in
PostHog as a `display_name` property. PostHog sees nicknames but no
identifying info. Still hash-primary, but easier to scan in dashboards.

Implementation: add a one-line `posthog.people.set({ display_name: 'B1' })`
after `identifyUser()` in `src/components/PostHogProvider.tsx`, fed from a
small client-side map (hash → nickname) compiled at build time from an
env var.

### First-name tier (Option 3)

Attach first names directly. Easiest to use, but amends the privacy model —
`PRIVACY.md` currently says "Brother names — never captured." If you take
this path:

1. Update `PRIVACY.md` to reflect the change.
2. Disclose to the Custodian at the meeting (not hidden).
3. Get affirmative opt-in from each Brother via the privacy page.

**Recommendation: stay on Option 1 through the Custodian meeting.** The
stricter posture is trivially defensible; walking it back is easier than
walking it forward. Open the discussion with the Custodian, then decide.

---

## If PostHog itself is down or you can't log in

The script works offline. Hashes are computed deterministically from
emails + the same hash function in the app. You can always:

- Know your own activity's distinct_id: hash your own email.
- Compute what a Brother's distinct_id would be, in advance of any PostHog
  access.
- Verify the hash function hasn't drifted by running both `whois.ts --email
  <addr>` and checking the app's sign-in flow.

---

## Changelog

| Date       | Change                                                 |
|------------|--------------------------------------------------------|
| 2026-04-16 | Initial runbook. Pilot-ready telemetry tier shipped.   |
