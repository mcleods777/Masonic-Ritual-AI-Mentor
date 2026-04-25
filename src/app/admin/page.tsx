/**
 * Admin dashboard — list of pilot users with login + activity stats.
 *
 * Server component. Two gates run in order:
 *   1. Pilot session cookie must verify (otherwise the request would have
 *      been redirected to /signin by middleware before reaching here, but
 *      we re-check defensively in case the gate is unconfigured).
 *   2. The authenticated email must appear in ADMIN_ALLOWLIST. Otherwise
 *      we 404 via notFound() so the route is indistinguishable from a
 *      missing path to a non-admin (avoids leaking that an admin page
 *      exists).
 *
 * Tracking-unconfigured stance: if KV credentials are absent the page
 * still renders, but with an explicit setup note in place of the table.
 */

import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin-auth";
import {
  getAllActivity,
  isLoginTrackingConfigured,
  isOnline,
  SESSION_TIMEOUT_MS,
  type UserActivity,
} from "@/lib/login-tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0m";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function formatRelative(iso: string, nowMs: number): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  const diff = nowMs - ms;
  if (diff < 60_000) return "just now";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatAbsolute(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export default async function AdminPage() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(cookie);
  if (!session || !isAdminEmail(session.email)) {
    notFound();
  }

  const configured = isLoginTrackingConfigured();
  const activity = configured ? await getAllActivity() : [];
  // Async server component renders once per request; impurity does not apply.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();

  const sorted: UserActivity[] = [...activity].sort((a, b) => {
    return Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt);
  });

  const onlineCount = sorted.filter((u) => isOnline(u, nowMs)).length;

  return (
    <div className="text-amber-50">
      <h1 className="font-cinzel text-2xl mb-2">Pilot activity</h1>
      <p className="text-sm text-amber-200/70 mb-6">
        {configured
          ? `${sorted.length} ${sorted.length === 1 ? "Brother" : "Brothers"} have signed in. ${onlineCount} online now (heartbeat within the last ${Math.round(SESSION_TIMEOUT_MS / 60_000)} min).`
          : "Login tracking is not configured."}
      </p>

      {!configured ? (
        <div className="rounded border border-amber-800 bg-amber-950/40 p-4 text-sm text-amber-100">
          <p className="mb-2 font-semibold">Setup required</p>
          <p className="mb-2">
            Set the following environment variables to enable login tracking:
          </p>
          <ul className="list-disc list-inside font-mono text-xs space-y-1">
            <li>KV_REST_API_URL</li>
            <li>KV_REST_API_TOKEN</li>
          </ul>
          <p className="mt-3">
            On Vercel: provision a KV (Upstash) store from the Storage tab and
            it will populate both variables automatically.
          </p>
        </div>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-amber-200/70">
          No sign-ins recorded yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded border border-amber-900/60">
          <table className="w-full text-sm">
            <thead className="bg-amber-950/60 text-amber-200">
              <tr>
                <th className="text-left px-3 py-2 font-normal">Email</th>
                <th className="text-left px-3 py-2 font-normal">Status</th>
                <th className="text-left px-3 py-2 font-normal">Last seen</th>
                <th className="text-left px-3 py-2 font-normal">Last login</th>
                <th className="text-right px-3 py-2 font-normal">Logins</th>
                <th className="text-right px-3 py-2 font-normal">Time on app</th>
                <th className="text-left px-3 py-2 font-normal">First login</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((u) => {
                const online = isOnline(u, nowMs);
                return (
                  <tr key={u.email} className="border-t border-amber-900/40">
                    <td className="px-3 py-2 font-mono text-xs">{u.email}</td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          online
                            ? "text-green-400"
                            : "text-amber-200/50"
                        }
                      >
                        {online ? "● online" : "○ offline"}
                      </span>
                    </td>
                    <td className="px-3 py-2" title={formatAbsolute(u.lastSeenAt)}>
                      {formatRelative(u.lastSeenAt, nowMs)}
                    </td>
                    <td className="px-3 py-2" title={formatAbsolute(u.lastLoginAt)}>
                      {formatRelative(u.lastLoginAt, nowMs)}
                    </td>
                    <td className="px-3 py-2 text-right">{u.loginCount}</td>
                    <td className="px-3 py-2 text-right">
                      {formatDuration(u.totalActiveMs)}
                    </td>
                    <td className="px-3 py-2 text-amber-200/70" title={formatAbsolute(u.firstLoginAt)}>
                      {formatAbsolute(u.firstLoginAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
