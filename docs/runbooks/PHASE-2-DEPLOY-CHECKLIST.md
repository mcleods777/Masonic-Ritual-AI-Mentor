# Phase 2 Deploy Checklist

One-time env-var provisioning + post-deploy smoke tests for Phase 2
(Safety Floor). Run when Phase 2 merges to a `preview` or `production`
Vercel environment.

## Required new env vars

Atomic-update pattern (avoids Phase 1 D-05b window-of-unset footgun):

### CRON_SECRET — for SAFETY-04 cron auth

```bash
# Generate a strong value locally (64 hex chars = 256 bits):
SECRET=$(openssl rand -hex 32)
echo -n "$SECRET" | vercel env add CRON_SECRET production --yes
echo -n "$SECRET" | vercel env add CRON_SECRET preview --yes
# Note: pipe via `echo -n` (no trailing newline) per D-05b Vercel CLI footgun
```

### SPEND_ALERT_TO — recipient of daily spend-alert email

```bash
echo -n "shannon@example.com" | vercel env add SPEND_ALERT_TO production --yes
echo -n "shannon@example.com" | vercel env add SPEND_ALERT_TO preview --yes
```

### MAGIC_LINK_FROM_EMAIL — should already be set (reused by cron as `from`)

Verify:

```bash
vercel env ls | grep MAGIC_LINK_FROM_EMAIL
```

## Post-deploy smoke tests

### Cron registration (verify Vercel picked up vercel.json)

1. Open Vercel Dashboard → Project → Settings → Cron Jobs.
2. Confirm `/api/cron/spend-alert` appears with schedule `0 2 * * *`.
3. Click "Run" to fire a one-shot invocation. Tail the logs:
   ```bash
   vercel logs --since 10m | grep CRON
   ```
   Expected: a `[CRON] spend-alert YYYY-MM-DD: no thresholds crossed`
   line (because spend-tally starts empty on a fresh instance).

### Kill switch end-to-end (belongs to Plan 08's runbook but verify now)

1. `vercel env update RITUAL_EMERGENCY_DISABLE_PAID preview --value true --yes`
2. Redeploy preview.
3. `curl -i -X POST https://<preview-url>/api/tts/gemini -H "X-Client-Secret: $CLIENT_SECRET" -d '{"text":"test"}'` → expect `503 {"error":"paid_disabled","fallback":"pre-baked"}`.
4. Flip back: `vercel env update RITUAL_EMERGENCY_DISABLE_PAID preview --value false --yes` (or `vercel env rm`).

### Reverse-lookup CLI (SAFETY-04 D-06c)

```bash
# Compute the hash Shannon will see in an alert for a known pilot user:
node -e 'console.log(require("crypto").createHash("sha256").update("shannon@example.com").digest("hex").slice(0,16))'
# Then:
LODGE_ALLOWLIST="shannon@example.com,brother2@example.com" \
  npx tsx scripts/lookup-hashed-user.ts <paste-hash-here>
# Expected: prints the matched email; exit 0.
```

## Known caveats (covered in docs/runbooks/KILL-SWITCH.md)

- Hobby-plan cron drift: if Vercel project is downgraded to Hobby, 02:00 UTC → 02:00-02:59 UTC window (RESEARCH §Surprise 3).
- Cron no-retry: one failed invocation = one silently-missed alert day (RESEARCH §Pitfall 2).
- spend-tally warm-container caveat: cold-start between emit() and 02:00 read can under-report (D-06b). Alert email body says so.
- Rate-limit cold-start: a distributed attacker forcing cold starts resets in-memory buckets; flip kill switch if it happens (RESEARCH §Pitfall 4).

## See also

- `docs/runbooks/SECRET-ROTATION.md` — rotating RITUAL_CLIENT_SECRET / JWT_SECRET
- `docs/runbooks/KILL-SWITCH.md` (Plan 08) — flipping RITUAL_EMERGENCY_DISABLE_PAID
- `.planning/phases/02-safety-floor/02-CONTEXT.md` — D-04, D-05, D-06, D-06b locked decisions
