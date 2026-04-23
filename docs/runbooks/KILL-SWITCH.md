# Kill Switch — Canonical Runbook

Rehearsed playbook for flipping the paid-AI kill switch
(`RITUAL_EMERGENCY_DISABLE_PAID=true`) during a cost-runaway incident or any
moment when Shannon needs to quiet every paid AI call across the app with a
single env-var flip (SAFETY-08, D-16/D-17/D-18/D-19/D-20).

Use this when you see (or suspect) runaway AI spending, a compromised
shared secret flooding paid routes, or a newly-invited Brother whose
sessions pattern is firing dozens of unexpected feedback calls per minute.
Flip first, diagnose after.

---

## TL;DR

Flip, verify, flip back:

```bash
# Flip
vercel env update RITUAL_EMERGENCY_DISABLE_PAID production --value true --yes
vercel deploy --prod

# Verify (replace <url> with production URL)
curl -i -X POST https://<url>/api/tts/gemini \
  -H "X-Client-Secret: $SECRET" \
  -H "Authorization: Bearer <any-bearer>" \
  -d '{"text":"test"}'
# Expect: 503 + {"error":"paid_disabled","fallback":"pre-baked"}

# Flip back (when the incident is contained)
vercel env update RITUAL_EMERGENCY_DISABLE_PAID production --value false --yes
# Or remove entirely:
# vercel env rm RITUAL_EMERGENCY_DISABLE_PAID production --yes
vercel deploy --prod
```

---

## What the kill switch does

- `RITUAL_EMERGENCY_DISABLE_PAID=true` in the production environment causes
  every paid-route handler (7 TTS routes + `/api/transcribe` +
  `/api/rehearsal-feedback`) to return HTTP 503 with a structured JSON body:
  - `/api/tts/*`: `{"error":"paid_disabled","fallback":"pre-baked"}`
  - `/api/rehearsal-feedback`: `{"error":"paid_disabled","fallback":"diff-only"}`
  - `/api/transcribe`: `{"error":"paid_disabled"}`
- The client's `src/lib/api-fetch.ts` flips its in-memory `degradedMode`
  flag on the first 503 + `paid_disabled` response. The
  `DegradedModeBanner` renders app-wide: _"Live AI is paused — using
  pre-baked audio and word-diff scoring."_
- One env var, one redeploy, everything quiet. Shannon does not have to
  diagnose which provider is burning money before cutting.

## Prerequisites

- Vercel CLI logged in: `vercel whoami`
- Repo linked to the project: `vercel link` (if the current dir isn't linked)
- Production access permissions (owner/admin)

## Flip the switch

Use atomic update to avoid the Phase 1 D-05b window-of-unset footgun:

```bash
vercel env update RITUAL_EMERGENCY_DISABLE_PAID production --value true --yes
```

If the variable doesn't exist yet, `add` works too:

```bash
echo -n "true" | vercel env add RITUAL_EMERGENCY_DISABLE_PAID production --yes
```

Pipe via `echo -n` (no trailing newline) per the SECRET-ROTATION.md Vercel
CLI footgun — a stored env value with a stray `\n` will fail the strict
`=== "true"` equality check.

**Comparison is `=== "true"` exactly** (per RESEARCH §Assumption A5).
`1`, `yes`, or any other value does NOT flip the switch. If you make a
typo here, the switch will silently stay off. Check the Vercel dashboard
or `vercel env ls | grep RITUAL_EMERGENCY` to confirm.

Then redeploy so the new env var propagates to the serverless functions:

```bash
vercel deploy --prod
```

## Verify

Curl each paid-route class to confirm 503 + fallback:

```bash
# TTS (any engine)
curl -i -X POST https://<url>/api/tts/gemini \
  -H "X-Client-Secret: $SECRET" -H "Authorization: Bearer $TOKEN" \
  -d '{"text":"test"}'
# Expect 503 + {"error":"paid_disabled","fallback":"pre-baked"}

# Transcribe
curl -i -X POST https://<url>/api/transcribe \
  -H "X-Client-Secret: $SECRET" -H "Authorization: Bearer $TOKEN" \
  --data-binary "@/tmp/silence.wav"
# Expect 503 + {"error":"paid_disabled"}

# Feedback
curl -i -X POST https://<url>/api/rehearsal-feedback \
  -H "X-Client-Secret: $SECRET" -H "Authorization: Bearer $TOKEN" \
  -d '{"variantId":"mentor-v1","prompt":"test","promptHash":"x"}'
# Expect 503 + {"error":"paid_disabled","fallback":"diff-only"}
```

If any of these return non-503 AFTER the deploy completes, the env var
did not propagate — double-check with `vercel env ls` or the Vercel UI.

## User experience during degraded mode

- App-wide banner: "Live AI is paused — using pre-baked audio and word-diff scoring. Contact Shannon for questions." (SAFETY-08, D-18). Dismissable, but reappears on the next 503 + paid_disabled response.
- Rehearsal mode: pre-baked Opus (embedded per line in `.mram`) plays instead of live TTS. Word-diff scoring works; LLM feedback falls back to diff-only text.
- Listen mode: pre-baked audio plays. Live TTS falls through to browser TTS for any line without embedded audio.
- STT input is disabled when `/api/transcribe` returns `paid_disabled` — rehearsal becomes listen-only until the switch flips back.

## Flip back (when the incident is contained)

```bash
vercel env update RITUAL_EMERGENCY_DISABLE_PAID production --value false --yes
vercel deploy --prod
```

Or remove entirely:

```bash
vercel env rm RITUAL_EMERGENCY_DISABLE_PAID production --yes
vercel deploy --prod
```

Verify the switch is OFF by curling a paid route — expect 200 (or the
route's normal behavior), NOT 503 with `paid_disabled`.

Note: the client's `degradedMode` flag is in-memory per-tab; invited users
who had the banner up need to refresh to clear it. Banner is not a hard
state — it is a hint.

## Known caveats

### Hobby-plan cron timing drift (D-05 post-research)

The daily spend-alert cron (`0 2 * * *`) runs at 02:00 UTC on Pro plan
(per-minute accuracy). **If this project is ever downgraded to Hobby,
the schedule drifts to "anywhere in the 02:00-02:59 UTC window."** If
you see a spike-alert email arriving 45 minutes late, check the project
plan tier first. Re-upgrade before any prolonged operations where the
02:00 promise matters.

### Rate-limit is best-effort under sustained attack (RESEARCH §Pitfall 4)

`src/lib/rate-limit.ts` is an in-memory sliding window on Vercel Fluid
Compute. A sustained high-rate distributed attacker can force cold starts
that reset in-memory buckets — bypassing per-user caps. For sustained
attacks, flipping the kill switch is the right move; do not try to
"just" tune rate limits. SAFETY-v2-01 (Upstash Redis swap) is the
durable path but is deferred until pilot outgrows current scale.

### Vercel does NOT retry failed cron invocations (RESEARCH §Pitfall 2)

If Resend is down when the 02:00 cron fires, Shannon gets no alert
email that day — with no retry. Spot-check `vercel logs | grep CRON`
every few days during the pilot. Resend v6 `idempotencyKey` prevents
duplicate alerts if cron fires multiple times, but does nothing for
dropped cron invocations.

### spend-tally warm-container caveat (D-06b)

The cron reads an in-memory counter that resets on cold-start. Alert
email body says "totals reflect warm-container data for the UTC day"
— so a quiet-day alert total of $5 may represent a true-day total of
$15 if there were cold-start gaps. The alert direction is never wrong
(>$10 aggregate means at least $10 was seen on a warm container); the
magnitude is a floor, not a ceiling.

## Troubleshooting

**Expected 503, got 200.** Env var did not propagate. Check:
- `vercel env ls | grep RITUAL_EMERGENCY` — shows the value?
- Did you run `vercel deploy --prod` AFTER the env update?
- Serverless functions need a fresh deploy; updating the env var alone
  doesn't hot-reload running instances.

**Expected 503 with `fallback:"pre-baked"`, got 503 with no body.**
Probably a genuine upstream 503 unrelated to the kill switch. Check
`vercel logs` for the route. Paid-route-guard's kill-switch branch
always includes the structured body; a generic 503 suggests something
else broke.

**Banner doesn't appear.** Check the browser console for any JS error
that would prevent `useSyncExternalStore` from mounting. Hard-refresh
the tab. If the flag is flipped but no banner shows, `DegradedModeBanner`
may not be mounted in `src/app/layout.tsx`.

**Flip back didn't restore normal operation.** Clear the env var entirely
with `vercel env rm` and redeploy. Some env-var states cache at the
edge for up to a minute post-deploy.

## See also

- `docs/runbooks/SECRET-ROTATION.md` — rotating `RITUAL_CLIENT_SECRET`
  and `JWT_SECRET` (different incident class)
- `src/lib/paid-route-guard.ts` — the server-side emitter of the 503
  `paid_disabled` response (SAFETY-08 implementation)
- `src/lib/api-fetch.ts` — the client-side detector + degraded-mode
  flag setter
- `src/lib/degraded-mode-store.ts` — zero-dep useSyncExternalStore
  singleton that DegradedModeBanner reads from
- `.env.example` — the `RITUAL_EMERGENCY_DISABLE_PAID` variable
  placeholder, commented
- `.planning/phases/02-safety-floor/02-CONTEXT.md` — D-16 through D-20
  locked decisions
