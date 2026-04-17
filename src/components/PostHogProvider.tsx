"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { isOptedOutClient } from "@/lib/telemetry-consent";
import { identifyUser } from "@/lib/log";

// Privacy-critical init options:
//   autocapture: false — we never capture DOM element clicks/keystrokes,
//     because ritual text on-screen could leak.
//   capture_pageview: true — anonymous per-page navigation only.
//   Session recording is NOT enabled and must never be enabled. It would
//     capture ritual content. If this constraint ever changes, route
//     design through the Custodian first.
export default function PostHogProvider({
  initialUserId,
  children,
}: {
  initialUserId?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;
    if (isOptedOutClient()) return;
    const host =
      process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";

    // Prevent double-init on HMR or navigation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((posthog as any).__loaded) {
      if (initialUserId) identifyUser(initialUserId);
      return;
    }

    posthog.init(key, {
      api_host: host,
      persistence: "localStorage+cookie",
      capture_pageview: true,
      autocapture: false,
    });

    if (initialUserId) {
      identifyUser(initialUserId);
    }
  }, [initialUserId]);

  return <>{children}</>;
}
