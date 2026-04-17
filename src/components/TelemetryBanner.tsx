"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  isOptedOutClient,
  setOptOutClient,
} from "@/lib/telemetry-consent";

const DISMISSED_KEY = "mram-telemetry-banner-dismissed";

export default function TelemetryBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only show if PostHog is actually configured; otherwise there's
    // nothing to disclose.
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    if (isOptedOutClient()) return;
    if (typeof localStorage === "undefined") return;
    if (localStorage.getItem(DISMISSED_KEY) === "1") return;
    setVisible(true);
  }, []);

  function acknowledge() {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // ignore storage failures
    }
    setVisible(false);
  }

  function optOut() {
    setOptOutClient(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // ignore
    }
    // Reload so PostHog skips init on the next render
    window.location.reload();
  }

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Telemetry notice"
      className="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-md z-[60] bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl p-4 text-sm text-zinc-200"
    >
      <p className="mb-2 font-semibold text-amber-500">
        Practice activity analytics
      </p>
      <p className="mb-3 text-zinc-300">
        This site records anonymous practice activity (which Brother practiced,
        which role, for how long) so Shannon can improve the tool and, later,
        report aggregate lodge usage. <strong>Ritual content is never captured</strong>,
        and your email is hashed before it leaves your browser.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={acknowledge}
          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-zinc-950 rounded font-medium"
        >
          OK
        </button>
        <button
          onClick={optOut}
          className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded"
        >
          Turn off analytics
        </button>
        <Link
          href="/privacy"
          onClick={acknowledge}
          className="px-3 py-1.5 text-zinc-400 hover:text-zinc-200 underline self-center"
        >
          Learn more
        </Link>
      </div>
    </div>
  );
}
