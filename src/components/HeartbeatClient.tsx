"use client";

/**
 * Fires a POST /api/auth/heartbeat every 60s while the tab is visible.
 *
 * Used by the login-tracking module to compute "time on app" and
 * "currently online" for the /admin page.
 *
 * Behavior:
 *   - Only pings while document.visibilityState === "visible". Hidden
 *     tabs do not count as active time.
 *   - On tab foreground, fires an immediate heartbeat then resumes the
 *     interval. Background-tab throttling means the next scheduled tick
 *     could be much later than 60s; an immediate tick on visibility
 *     gives an accurate boundary for the previous active window.
 *   - On 401 (no session — e.g. /signin page), permanently stops. The
 *     next sign-in will mount a fresh component instance.
 *   - Same-origin fetch with credentials so the httpOnly session cookie
 *     rides along. No client-token, no X-Client-Secret — /api/auth/* is
 *     the existing carve-out in middleware.
 */

import { useEffect } from "react";

const HEARTBEAT_INTERVAL_MS = 60 * 1000;

export default function HeartbeatClient() {
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function ping(): Promise<void> {
      if (stopped) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      try {
        const resp = await fetch("/api/auth/heartbeat", {
          method: "POST",
          credentials: "include",
        });
        if (resp.status === 401) {
          stopped = true;
          if (timer) clearInterval(timer);
          timer = null;
        }
      } catch {
        // Network blip — next tick will retry.
      }
    }

    function startInterval() {
      if (timer) return;
      timer = setInterval(ping, HEARTBEAT_INTERVAL_MS);
    }

    function onVisibilityChange() {
      if (stopped) return;
      if (document.visibilityState === "visible") {
        void ping();
        startInterval();
      } else if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    void ping();
    startInterval();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return null;
}
