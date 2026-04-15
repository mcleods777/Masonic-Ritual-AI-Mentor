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

export const runtime = "nodejs";

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
  <p>Click the link below to sign in. The link expires in 10 minutes.</p>
  <p style="margin: 32px 0;"><a href="${link}" style="display: inline-block; padding: 12px 24px; background: #c9962c; color: #fff; text-decoration: none; font-weight: bold; letter-spacing: 0.06em;">Sign in</a></p>
  <p style="font-size: 12px; color: #888;">If you did not request this, you can safely ignore this email. Your address is not added to any list.</p>
</body>
</html>`;
}

function renderEmailText(link: string): string {
  return [
    "Masonic Ritual Mentor",
    "",
    "Click the link below to sign in. The link expires in 10 minutes.",
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

  // Enumeration-resistant path: always return the same message whether or
  // not the email is on the allowlist. The work below only runs for
  // allowlisted emails.
  const genericOk = NextResponse.json({
    ok: true,
    message: "If your email is on the pilot list, a sign-in link is on its way.",
  });

  if (!isEmailAllowed(email)) {
    return genericOk;
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.MAGIC_LINK_FROM_EMAIL;
  if (!apiKey || !fromAddress) {
    console.error("Magic-link request: RESEND_API_KEY or MAGIC_LINK_FROM_EMAIL not set");
    return NextResponse.json({ error: "Email is not configured on the server." }, { status: 500 });
  }

  try {
    const token = await signMagicLinkToken(email);
    const link = `${getBaseUrl(req)}/api/auth/magic-link/verify?t=${encodeURIComponent(token)}`;

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: fromAddress,
      to: email,
      subject: "Your sign-in link",
      html: renderEmailHtml(link),
      text: renderEmailText(link),
    });

    if (error) {
      console.error("Resend error:", error);
      return NextResponse.json(
        { error: "Could not send the email. Please try again." },
        { status: 500 },
      );
    }

    return genericOk;
  } catch (err) {
    console.error("Magic-link request error:", err);
    return NextResponse.json(
      { error: "Could not send the email. Please try again." },
      { status: 500 },
    );
  }
}
