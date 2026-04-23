/**
 * Magic-link request endpoint.
 *
 * Flow:
 *   1. Receive { email } from sign-in form
 *   2. Validate email shape
 *   3. If the email is on LODGE_ALLOWLIST, sign a magic-link JWT and send
 *      it via Resend.
 *   4. Regardless of allowlist membership, return 200 with a generic
 *      "check your inbox" response. This prevents allowlist enumeration.
 *      The worst-case for a non-member is they see the same success
 *      message but never receive an email.
 *
 * Error handling: if Resend fails for an allowlisted email, we return 500
 * with a generic message. The Brother will see "something went wrong" and
 * can retry. For the pilot's 5-person scale, this is acceptable.
 */

import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import {
  isEmailAllowed,
  looksLikeEmail,
  signMagicLinkToken,
} from "@/lib/auth";
import { hashEmail } from "@/lib/user-id";
import { logServerEvent } from "@/lib/posthog-server";
import {
  TELEMETRY_OPTOUT_COOKIE,
  isOptedOutFromCookieValue,
} from "@/lib/telemetry-consent";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Rate limits: protect allowlisted pilot addresses from inbox bombing and
// slow down casual abuse before Resend's own quotas kick in. Picked to be
// invisible to legitimate use (a Brother clicking "resend link" once or
// twice) while blocking scripted hammering.
const IP_LIMIT = 5;            // requests per IP
const IP_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const EMAIL_LIMIT = 3;         // requests per email
const EMAIL_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function getBaseUrl(req: NextRequest): string {
  const envUrl = process.env.MAGIC_LINK_BASE_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

function renderEmailHtml(link: string): string {
  // Intentionally plain. No images. No tracking pixels. No inline CSS
  // that might look like marketing. Brothers should see this as a
  // utility email from a peer, not a SaaS notification.
  return `<!doctype html>
<html>
<body style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto; padding: 40px 20px; color: #222;">
  <h1 style="font-size: 20px; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 24px;">Masonic Ritual Mentor</h1>
  <p>Click the link below to sign in. The link expires in 24 hours.</p>
  <p style="margin: 32px 0;"><a href="${link}" style="display: inline-block; padding: 12px 24px; background: #c9962c; color: #fff; text-decoration: none; font-weight: bold; letter-spacing: 0.06em;">Sign in</a></p>
  <p style="font-size: 12px; color: #888;">If you did not request this, you can safely ignore this email. Your address is not added to any list.</p>
</body>
</html>`;
}

function renderEmailText(link: string): string {
  return [
    "Masonic Ritual Mentor",
    "",
    "Click the link below to sign in. The link expires in 24 hours.",
    "",
    link,
    "",
    "If you did not request this, you can safely ignore this email.",
  ].join("\n");
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = (body as { email?: unknown })?.email;

  if (!looksLikeEmail(email)) {
    return NextResponse.json(
      { error: "Please enter a valid email address." },
      { status: 400 },
    );
  }

  // Per-IP rate limit first (cheap, blocks scripted attackers before we
  // even normalize the email).
  const ip = getClientIp(req);
  const ipCheck = rateLimit(`magic-link:ip:${ip}`, IP_LIMIT, IP_WINDOW_MS);
  if (!ipCheck.allowed) {
    return NextResponse.json(
      { error: "Too many sign-in requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(ipCheck.retryAfterSeconds) },
      },
    );
  }

  // Per-email rate limit. Same generic copy regardless of whether the
  // email is allowlisted (no enumeration via error timing).
  const normalizedEmail = email.trim().toLowerCase();
  const emailCheck = rateLimit(
    `magic-link:email:${normalizedEmail}`,
    EMAIL_LIMIT,
    EMAIL_WINDOW_MS,
  );
  if (!emailCheck.allowed) {
    return NextResponse.json(
      { error: "Too many sign-in requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(emailCheck.retryAfterSeconds) },
      },
    );
  }

  // Enumeration-resistant path: always return the same message whether or
  // not the email is on the allowlist. Both branches also do comparable
  // work so response timing doesn't leak allowlist membership — signing a
  // throwaway JWT takes the same ~ms whether the email will actually be
  // sent or not. The Resend call itself is the remaining asymmetry; at
  // pilot scale (5 Brothers) timing analysis of a ~100ms Resend round-trip
  // is impractical but not impossible, which is acceptable for the threat
  // model here.
  const genericOk = NextResponse.json({
    ok: true,
    message: "If your email is on the pilot list, a sign-in link is on its way.",
  });

  if (!isEmailAllowed(email)) {
    // Sign a throwaway token so non-allowlisted requests don't return in
    // sub-ms (which would otherwise be a trivial timing oracle). The token
    // is discarded — no email is ever sent.
    await signMagicLinkToken(normalizedEmail);
    return genericOk;
  }

  const optedOut = isOptedOutFromCookieValue(
    req.cookies.get(TELEMETRY_OPTOUT_COOKIE)?.value,
  );
  const distinctId = hashEmail(email);

  await logServerEvent({
    distinctId,
    name: "auth.magic_link.requested",
    optedOut,
  });

  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.MAGIC_LINK_FROM_EMAIL;
  if (!apiKey || !fromAddress) {
    console.error("Magic-link request: RESEND_API_KEY or MAGIC_LINK_FROM_EMAIL not set");
    return NextResponse.json({ error: "Email is not configured on the server." }, { status: 500 });
  }

  try {
    const token = await signMagicLinkToken(normalizedEmail);
    const link = `${getBaseUrl(req)}/api/auth/magic-link/verify?t=${encodeURIComponent(token)}`;

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: fromAddress,
      to: normalizedEmail,
      subject: "Your sign-in link",
      html: renderEmailHtml(link),
      text: renderEmailText(link),
    });

    if (error) {
      console.error("Resend error:", error);
      await logServerEvent({
        distinctId,
        name: "auth.magic_link.sent",
        props: { error_type: "network" },
        optedOut,
      });
      return NextResponse.json(
        { error: "Could not send the email. Please try again." },
        { status: 500 },
      );
    }

    await logServerEvent({
      distinctId,
      name: "auth.magic_link.sent",
      optedOut,
    });
    return genericOk;
  } catch (err) {
    console.error("Magic-link request error:", err);
    await logServerEvent({
      distinctId,
      name: "auth.magic_link.sent",
      props: { error_type: "unknown" },
      optedOut,
    });
    return NextResponse.json(
      { error: "Could not send the email. Please try again." },
      { status: 500 },
    );
  }
}
