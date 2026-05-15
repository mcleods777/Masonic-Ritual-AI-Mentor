/**
 * Activity heartbeat endpoint.
 *
 * Lives under /api/auth/* so middleware bypasses both the shared-secret
 * gate and the client-token gate (this is a session-cookie-only path,
 * just like /api/auth/client-token). Returns 401 on missing/invalid
 * session so the client can quietly stop pinging.
 *
 * Called every ~60s by HeartbeatClient while the tab is visible. The
 * call is intentionally lightweight: no body, no response payload, just
 * a KV write through src/lib/login-tracking.ts.
 *
 * If KV is unconfigured the recordHeartbeat() call is a no-op and we
 * still return 204 so the client doesn't think it's an error.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { recordHeartbeat } from "@/lib/login-tracking";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(cookie);
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  await recordHeartbeat(session.email);
  return new NextResponse(null, { status: 204 });
}
