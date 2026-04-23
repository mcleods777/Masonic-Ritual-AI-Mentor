/**
 * Daily spend-alert cron (SAFETY-04, D-04/D-05/D-06/D-06b).
 *
 * Fires at 02:00 UTC via vercel.json crons. Reads the in-memory
 * spend-tally (populated by every emit() call in src/lib/audit-log.ts)
 * and, if total-pilot spend > $10 OR any hashed user > $3 for yesterday's
 * UTC day, sends a Resend alert email to SPEND_ALERT_TO.
 *
 * Cron semantics: Vercel does NOT retry failed cron invocations (per
 * RESEARCH §Pitfall 2). Resend v6 idempotencyKey prevents duplicate
 * delivery if Vercel's at-least-once ever duplicates. 24h idempotency
 * window is exactly right for a daily cron.
 *
 * Hobby-plan caveat: On Hobby tier, 0 2 * * * actually runs somewhere
 * in 02:00-02:59 UTC. Project is expected on Pro (per-minute accuracy);
 * downgrade degrades the 02:00 promise silently. Documented in
 * docs/runbooks/KILL-SWITCH.md.
 *
 * Warm-container caveat (D-06b): spend-tally is in-memory; a cold-start
 * between emit() calls and the 02:00 read loses data. Alert body says so.
 */

import type { NextRequest } from "next/server";
import { Resend } from "resend";
import { readAndClearSpendForDay } from "@/lib/spend-tally";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  // 1. Auth (RESEARCH canonical pattern — exact-string compare).
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error("[CRON] spend-alert: unauthorized invocation");
    return new Response("Unauthorized", { status: 401 });
  }

  // 2. Read yesterday's UTC day (cron fires at 02:00 UTC, reporting the
  //    day that just ended).
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const { aggregate, perUser } = readAndClearSpendForDay(yesterday);

  // 3. D-04 thresholds: aggregate > $10 OR any user > $3.
  const aggregateExceeded = aggregate > 10;
  const topUsers = perUser
    .filter((u) => u.total > 3)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  if (!aggregateExceeded && topUsers.length === 0) {
    console.log(
      `[CRON] spend-alert ${yesterday}: no thresholds crossed ` +
        `(aggregate=$${aggregate.toFixed(4)}, ${perUser.length} users)`,
    );
    return Response.json({ success: true, sent: false });
  }

  // 4. Build email body (D-06).
  const textLines: string[] = [
    `Masonic Ritual Mentor spend alert — ${yesterday} (UTC)`,
    "",
    `Aggregate pilot spend: $${aggregate.toFixed(4)}${aggregateExceeded ? " [> $10 threshold]" : ""}`,
    "",
    "Top spenders (> $3):",
    ...topUsers.map(
      (u, i) => `  ${i + 1}. ${u.hashedUser}  $${u.total.toFixed(4)}`,
    ),
    "",
    "Use `scripts/lookup-hashed-user.ts <hash>` locally to reverse-resolve.",
    "",
    "Note: totals reflect warm-container data for the UTC day (D-06b).",
    "Cold-start gaps between emit() and this cron can under-report.",
    "",
    "If this fires unexpectedly, consider flipping the kill switch:",
    "  vercel env update RITUAL_EMERGENCY_DISABLE_PAID production --value true --yes",
    "See docs/runbooks/KILL-SWITCH.md",
  ];
  const text = textLines.join("\n");
  const escapeHtml = (c: string): string =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c;
  const html = `<pre style="font-family:monospace;white-space:pre-wrap;">${text
    .replace(/[&<>]/g, escapeHtml)}</pre>`;

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.SPEND_ALERT_TO;
  const from = process.env.MAGIC_LINK_FROM_EMAIL;
  if (!apiKey || !to || !from) {
    console.error(
      "[CRON] spend-alert: missing env vars (RESEND_API_KEY / SPEND_ALERT_TO / MAGIC_LINK_FROM_EMAIL)",
    );
    return Response.json(
      { success: false, error: "misconfigured" },
      { status: 500 },
    );
  }

  // 5. Send via Resend (idempotencyKey prevents dupes in 24h per
  //    RESEARCH Pitfall 2). Resend v6 takes idempotencyKey as the
  //    second (options) argument, not inside the email payload.
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send(
    {
      from,
      to,
      subject: `Masonic Ritual Mentor spend alert — ${yesterday}`,
      html,
      text,
    },
    { idempotencyKey: `spend-alert-${yesterday}` },
  );
  if (error) {
    console.error("[CRON] spend-alert: Resend error", error);
    return Response.json(
      { success: false, error: "resend_failed" },
      { status: 502 },
    );
  }
  console.log(
    `[CRON] spend-alert ${yesterday}: email sent ` +
      `(aggregate=$${aggregate.toFixed(4)}, flagged users=${topUsers.length})`,
  );
  return Response.json({ success: true, sent: true });
}
