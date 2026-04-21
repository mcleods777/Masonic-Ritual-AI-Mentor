# Secret Rotation — Canonical Runbook

Rehearsed playbook for rotating the pilot's two authentication secrets — `RITUAL_CLIENT_SECRET` (the `x-client-secret` header gating `/api/*`) and `JWT_SECRET` (signs the `pilot-session` cookie). Use this every time either secret must change: suspected exfiltration, staff change, routine 90-day rotation, or a lost device that needs an emergency kill.

Both secrets are rotated together by default. If only one is suspected to be leaked, rotating just that one is fine — skip the sibling's `vercel env update` line. `JWT_SECRET` rotation has a user-visible side effect (see the callout below); plan timing accordingly.

---

## TL;DR

Standard production rotation of both secrets:

```bash
printf "%s" "<NEW_RITUAL_CLIENT_SECRET>" | vercel env update RITUAL_CLIENT_SECRET production --yes
printf "%s" "<NEW_JWT_SECRET>" | vercel env update JWT_SECRET production --yes
vercel deploy --prod
```

Three commands, atomic. No window where the env var is unset. The redeploy picks up both new values and invalidates every live `pilot-session` cookie (expected — see below).

---

## What gets rotated and why

| Secret | Role | What a leaked value lets an attacker do |
|--------|------|------------------------------------------|
| `RITUAL_CLIENT_SECRET` | Shared secret verified by `src/middleware.ts` against the `x-client-secret` request header on every `/api/*` request (except `/api/auth/*`). String equality check. | Hit paid AI routes (`/api/rehearsal-feedback`, `/api/tts/*`) without any session at all — pure rate-theft. |
| `JWT_SECRET` | HS256 signing key for both magic-link tokens and `pilot-session` cookies, via `jose` in `src/lib/auth.ts`. Required to be ≥32 bytes. | Forge valid session cookies for any email (including one outside `LODGE_ALLOWLIST`) and bypass the allowlist gate entirely. |

Both are authentication gates for the pilot. Treat a rotation of either one as a security-critical operation.

**Rotating `JWT_SECRET` invalidates every live `pilot-session` cookie.** This is expected, not a bug. `verifySessionToken` fails for every cookie signed with the old key, returns `null`, and middleware redirects the user to `/signin` on their next request. There is no server-side state to clean up — the JWT is stateless. Users re-request a magic link, tap it, and receive a fresh 30-day cookie. Plan timing accordingly (quiet hours) and send an out-of-band heads-up to the invited lodges before a production rotation so the redirects don't look like an outage.

---

## Prerequisites

Run these checks before starting. Each one is a ~1-second sanity check.

```bash
command -v vercel || npm install -g vercel@latest
vercel whoami
cat .vercel/project.json
```

- `command -v vercel` must print a path. If not, install the CLI globally.
- `vercel whoami` must print your email (Shannon's). If it says "not logged in", run `vercel login` and complete the browser flow.
- `cat .vercel/project.json` must show the `masonic-ritual-ai-mentor` project. If missing or wrong, you're in the wrong directory or the project is not linked — `vercel link` to fix.
- You need write access to the project's environment variables on Vercel (Shannon has this as project owner; anyone else needs to be invited first).

Have `openssl` available locally to generate new values:

```bash
command -v openssl
```

---

## Generating new secret values

Run these locally. Do not commit the output. Paste directly into the `vercel env update` command via stdin in the next section — do not write to disk unless you are using a password manager.

```bash
# RITUAL_CLIENT_SECRET — 32 random bytes, hex-encoded (64 chars).
# Middleware does string equality; any 32+ chars of entropy works.
openssl rand -hex 32

# JWT_SECRET — 32 random bytes, base64-encoded.
# jose HS256 accepts any ≥32-byte key; base64 keeps it copy-pasteable.
openssl rand -base64 32 | tr -d '\n'
```

**Never pipe `openssl ... | vercel env update` directly with a trailing newline.** `openssl rand -base64` emits a trailing `\n`. The `tr -d '\n'` strip above is required — otherwise the captured env value has a stray newline and every auth check fails with 401. See Troubleshooting.

---

## Typical workflows — Production rotation

The canonical path. Atomic, no window-of-unset, one redeploy.

1. Send an out-of-band heads-up to invited lodges: "Pilot sign-in will reset at HH:MM UTC. Re-sign-in takes 30 seconds — tap the fresh magic-link email." Schedule for quiet hours.

2. Generate two new values using the `openssl` commands above. Store in a password manager (1Password, Bitwarden) temporarily. Do not commit, do not put in any `.env` file checked into git, do not email.

3. Run the TL;DR block, substituting the new values:

   ```bash
   printf "%s" "<NEW_RITUAL_CLIENT_SECRET>" | vercel env update RITUAL_CLIENT_SECRET production --yes
   printf "%s" "<NEW_JWT_SECRET>" | vercel env update JWT_SECRET production --yes
   ```

   Each command returns in ~1 second and is atomic — the env var is replaced in place, never unset. No redeploy has happened yet; the running production still uses the old values.

4. Trigger a production redeploy:

   ```bash
   vercel deploy --prod
   ```

   Or push a trivial commit to `main` if the project's standard deploy path is git-triggered (check `.vercel/project.json` or the project's Git settings). Wait for the deploy to complete — monitor via the URL printed by the CLI or the Vercel dashboard.

5. Verify end-to-end on the production URL:

   ```bash
   # Should return 200 (static signin page is unauthenticated)
   curl -I https://masonic-ritual-ai-mentor.vercel.app/signin

   # Should return 401 (API route requires the new secret, and we're not sending it)
   curl -I https://masonic-ritual-ai-mentor.vercel.app/api/rehearsal-feedback
   ```

   Then do a full sign-in round-trip on a test device: request magic link → tap link in email → confirm landing in the app. Verify the new cookie is valid for 30 days.

6. Confirm old cookies are invalidated. Open an existing browser tab or device that still has a `pilot-session` cookie from before the rotation. Refresh. Expected: redirect to `/signin`. If instead the session works, something is cached — hard-refresh and check again; if it persists the redeploy did not propagate.

7. Delete the temporary copies of the new secret values from the password manager once you've confirmed the rotation landed. Production Vercel is now the only copy — which is the point.

---

## Typical workflows — Rehearsal on preview deploy

This is the HYGIENE-07 rehearsal workflow. Run this once before sending any outside invitation, and re-run it any time the runbook is materially edited. It proves the full procedure works on Shannon's machine against a real deploy, with zero production risk.

1. Create a rehearsal branch from current main:

   ```bash
   git checkout -b rotation-rehearsal
   git commit --allow-empty -m "chore: trigger rehearsal preview"
   git push origin rotation-rehearsal
   ```

   Pushing to a non-main branch spawns a Vercel preview deploy. Note the preview URL (Vercel CLI or the project's PR comment prints it).

2. Add preview-scoped secrets. **The branch argument is required** (see Troubleshooting); without it the value applies to all preview branches.

   ```bash
   printf "%s" "$(openssl rand -hex 32)" | vercel env add RITUAL_CLIENT_SECRET preview rotation-rehearsal
   printf "%s" "$(openssl rand -base64 32 | tr -d '\n')" | vercel env add JWT_SECRET preview rotation-rehearsal
   ```

3. Trigger a preview redeploy so the new env values land in the build:

   ```bash
   git commit --allow-empty -m "chore: re-deploy with preview secrets"
   git push origin rotation-rehearsal
   ```

4. Open the preview URL. Request a magic link at `/signin`. Tap the link. Confirm sign-in works and you land in the app with a valid preview-session cookie.

5. Now rotate the preview secrets. **Three things MUST be explicit at this step — read all three before running the commands.**

   (a) **Window-of-unset risk, named.** Between `vercel env rm` and `vercel env add` the preview app has NO secret set — requests hitting the preview during that window fail with 401. This is the SAME FOOTGUN that production rotation avoids by using the atomic `vercel env update` verb. For production, ALWAYS use `vercel env update`. The rm+add path below is only acceptable because the preview branch is Shannon-only during rehearsal.

   (b) **CLI limitation that forces rm+add on preview branches, documented.** `vercel env update` (CLI v51.x as of 2026-04) cannot scope to a specific git branch inside the preview environment — running `vercel env update NAME preview rotation-rehearsal` either errors on the extra arg or rotates the value across all preview branches. Rotating a preview-branch-scoped secret therefore requires `vercel env rm NAME preview rotation-rehearsal --yes` followed by `vercel env add NAME preview rotation-rehearsal`. Treat this as a known Vercel CLI asymmetry between production and preview-branch scopes, not a runbook defect.

   (c) **Mitigation for the window-of-unset, recommended.** During this rehearsal Shannon is the only user of the preview branch, so the unset window is harmless — the rm+add pair takes under 2 seconds and no other traffic is hitting this preview. If this runbook is ever reused to rotate a preview-branch secret that multiple users touch (e.g., a stakeholder preview used by pilot lodges), do one of: (i) pause that preview's traffic first — announce downtime or DNS-black-hole it, then rotate; or (ii) bring up a second preview on a fresh branch, swap whatever shared URL / DNS record points the stakeholders at the new preview, then rotate the old preview's secret after it has no live users.

   With all three acknowledged, run the rotation:

   ```bash
   vercel env rm RITUAL_CLIENT_SECRET preview rotation-rehearsal --yes
   printf "%s" "$(openssl rand -hex 32)" | vercel env add RITUAL_CLIENT_SECRET preview rotation-rehearsal

   vercel env rm JWT_SECRET preview rotation-rehearsal --yes
   printf "%s" "$(openssl rand -base64 32 | tr -d '\n')" | vercel env add JWT_SECRET preview rotation-rehearsal
   ```

6. Trigger another preview redeploy so the rotated values propagate:

   ```bash
   git commit --allow-empty -m "chore: re-deploy after rotation rehearsal"
   git push origin rotation-rehearsal
   ```

7. Re-verify sign-in works on the preview URL. The old `pilot-session` cookie in your browser is now invalid (as expected — that's the D-02 signal). Clear the cookie or open a fresh incognito window, request a new magic link, tap, confirm.

8. Cleanup. Remove the preview-scoped env vars and (optionally) the branch:

   ```bash
   vercel env rm RITUAL_CLIENT_SECRET preview rotation-rehearsal --yes
   vercel env rm JWT_SECRET preview rotation-rehearsal --yes
   git checkout main
   git branch -D rotation-rehearsal
   git push origin --delete rotation-rehearsal
   ```

9. Record the outcome in `.planning/phases/01-pre-invite-hygiene/01-VERIFICATION.md` under `## HYGIENE-07` — note the preview URL used, the date, any runbook edits that surfaced.

---

## Rollback

If the rotation breaks something unexpectedly in production (sign-in fails, `/api/*` returns 401 for legitimate clients, magic links don't arrive), rotate back to the **old** value using the same atomic verb. You do still need the old value — don't throw it away during step 7 of the production rotation until you've fully verified the new one.

```bash
printf "%s" "<OLD_RITUAL_CLIENT_SECRET>" | vercel env update RITUAL_CLIENT_SECRET production --yes
printf "%s" "<OLD_JWT_SECRET>" | vercel env update JWT_SECRET production --yes
vercel deploy --prod
```

Users who had re-signed-in during the broken window will have their brand-new cookies invalidated on rollback (same D-02 signal in reverse). Send the same heads-up: "Pilot sign-in reset a second time — re-sign-in required."

If rollback itself fails (couldn't restore the old value, deploy broken, etc.) — halt, do not try more CLI commands, open the Vercel dashboard's project → Settings → Environment Variables and edit directly in the web UI. The web UI is the ultimate fallback.

---

## Troubleshooting

**"Sign-in returns 401 after rotation"** — the new secret captured a trailing newline. `echo` and `cat file` both append `\n`; the middleware's string-equality check fails when the stored env value has extra bytes. Re-rotate using `printf "%s" "<value>"` (no `\n`) or use `vercel env update` interactively (Vercel prompts for the value and strips the newline itself). Cross-reference the project-memory note `vercel-env-newline-fix`.

**"Preview rehearsal reads production env values"** — the `vercel env add NAME preview` command was run without the explicit branch argument. Without it, the value scopes to all preview branches — but in non-interactive mode the CLI may also error or behave inconsistently. Remove and re-add with the branch name: `vercel env rm NAME preview --yes && vercel env add NAME preview <branch-name>`. Cross-reference project-memory note `vercel-cli-env-add-preview-branch-required`.

**"`vercel env update` is not a recognized command"** — Vercel CLI is below v32-ish. Upgrade: `npm install -g vercel@latest`. Re-verify with `vercel --version` (should be ≥ 32.x; current production rotations have been rehearsed against v51.x).

**"Magic-link email never arrives after rotation"** — the rotation itself does not affect email delivery; this is a Resend or inbox issue. Check Resend logs (dashboard → Emails) for the outbound attempt, then iCloud Junk / Spam / Private Relay redirect. Some iCloud accounts briefly reject Resend during Private Relay transitions. See `.planning/phases/01-pre-invite-hygiene/01-RESEARCH.md` Pitfall 5.

**"New deploy serves old env values"** — the deploy happened before the env update propagated, or Vercel served a pre-built cached output. Force a fresh build: `vercel deploy --prod --force`. Watch the deploy log for the line where env vars are injected; confirm the build timestamp is after the `env update` timestamp.

**"`openssl rand -base64 32` output has a trailing newline in my password manager"** — this is the footgun from the Generating section. Always pipe through `tr -d '\n'` before capturing, or manually trim the trailing newline in the password manager entry. If you paste into `vercel env update` interactively the CLI strips it for you, but if you pipe it via stdin the newline survives into the stored env value.

**"`vercel env add NAME preview` fails with 'requires a git branch argument' in CI/non-interactive"** — always pass the explicit branch: `vercel env add NAME preview rotation-rehearsal`. Interactive usage (no branch arg) prompts you; non-interactive requires the arg.

**"Rotation claimed to succeed but the old value is still active"** — you rotated the wrong environment. `vercel env update NAME production` changes production; `vercel env update NAME preview` changes preview (all branches); `vercel env update NAME development` changes the local `.env.local` defaults if you've pulled those. Check `vercel env ls` to list what's set where, then re-run with the right scope.

---

## See also

- `src/lib/auth.ts` — `pilot-session` cookie lifecycle and `JWT_SECRET` usage via `jose` HS256 (`signSessionToken`, `verifySessionToken`). The `getSecret()` helper enforces the ≥32-byte length invariant.
- `src/middleware.ts` — `RITUAL_CLIENT_SECRET` check against the `x-client-secret` header on `/api/*` (except `/api/auth/*`). String equality; no timing-safe compare because the secret is high-entropy and middleware runs on the edge.
- `.env.example` — full environment variable list for the project; both secrets appear here as empty-value placeholders with comments.
- `.planning/phases/01-pre-invite-hygiene/01-RESEARCH.md` — research notes on the rotation procedure, the `vercel env update` vs `rm`/`add` tradeoff, and the two known CLI footguns (trailing newline, preview branch arg).
- `.planning/PROJECT.md` — the client-owned data plane invariant and why rotation is the v1 kill-switch for compromised devices.
- Vercel CLI docs: https://vercel.com/docs/cli/env — canonical reference for the `vercel env` subcommands (`add`, `rm`, `ls`, `update`, `pull`).
