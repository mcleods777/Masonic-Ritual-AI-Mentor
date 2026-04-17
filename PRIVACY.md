# Privacy — Masonic Ritual Mentor

How this application handles your data. Plain language, no legalese.

The authoritative implementation lives in:

- `src/lib/log.ts` (event-name and property types — what can and cannot be captured)
- `src/lib/posthog-server.ts` (server-side capture)
- `src/components/PostHogProvider.tsx` (client-side init — `autocapture: false`, session recording never enabled)
- `src/lib/telemetry-consent.ts` (opt-out cookie)

## Ritual content

Your ritual file (the `.mram` archive) is decrypted in your browser using
AES-256-GCM with a key derived from your passphrase via PBKDF2. The decrypted
ritual exists only in your device's memory during a practice session. It is
**never transmitted to any server — ours or anyone else's**. If our servers
were seized tomorrow, no ritual content would be found on them.

Transcripts of your spoken practice are sent to a third-party speech-to-text
provider (currently Groq's Whisper) for the sole purpose of returning an
accuracy score, then discarded. They are not retained, not logged by us, and
not fed into the telemetry pipeline.

## Practice activity analytics

We use [PostHog](https://posthog.com/) (EU-hosted) to capture anonymous event
data so we can understand whether Brothers are actually using the tool and
where they get stuck. This is how we know the pilot is working and how a
future Grand Lodge memo can show real usage data.

### What IS captured

- Enumerated event names (see `LogEventName` in `src/lib/log.ts`). Examples:
  `auth.sign_in.succeeded`, `ritual.practice.started`, `ritual.line.passed`,
  `ritual.line.failed`.
- An opaque user ID — the first 16 hex chars of SHA-256 of your lowercased
  email. Not reversible to your email in any practical sense.
- Role indicator (`WM`, `SW`, `JW`, etc.) when you're practicing a role.
- Opaque document ID, section and line index, duration in milliseconds,
  accuracy score (0-100).
- Error type (one of `network`, `auth`, `validation`, `unknown`) on failures.
- Anonymous page views.

### What is NEVER captured

- Ritual text, decrypted or otherwise.
- Passphrases.
- Your raw email address.
- Lodge names or numbers.
- Voice recordings or speech-to-text transcripts.
- DOM element contents (PostHog autocapture is explicitly disabled).
- Session recordings (not enabled, never enabled — would capture ritual
  content on-screen).

The type system enforces the capture/never-capture split: `log()` and
`logServerEvent()` accept only enumerated names and a fixed-shape properties
object. There is no way for a future developer to accidentally pass free-text
ritual content through this interface.

### Where the data lives

- Events: PostHog Cloud EU region.
- Anonymous page views: `@vercel/analytics` *(deferred — not enabled in this round)*.
- Errors: Sentry *(deferred — not enabled in this round)*.

### Retention

- Events: 12 months rolling, then aggregated and discarded.

### Custodian transparency

On request from a Worshipful Master or Custodian of Ritual, we will show the
full event schema and a redacted sample of the last 100 events for any lodge
under their jurisdiction. This is part of the service, not a one-off favor.

## Opting out

At any time, visit `/privacy` and click "Turn analytics OFF." This sets a
cookie (`mram-telemetry-optout=1`) that both the client and server respect.
Opted-out Brothers are excluded from all aggregated reporting, including any
future "your lodge practiced X hours" dashboards shown to a Worshipful Master.

Opt-out happens entirely in your browser. No request goes to our servers to
disable tracking — the next request simply won't be captured.

## AGPL v3

This application is open source under AGPL v3. You can read exactly what is
captured by reading the source files listed at the top of this document. If
you run a modified version for network users, the AGPL requires you to make
your modifications available to those users.

## Changes

This policy will be updated to reflect material changes. The git history of
this file is the change log.
