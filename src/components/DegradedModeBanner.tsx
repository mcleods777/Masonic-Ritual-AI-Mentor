"use client";

/**
 * Degraded-mode banner (SAFETY-08, D-18).
 *
 * Renders a soft-copy amber ribbon when the degraded-mode store flag is on —
 * the flag is set by src/lib/api-fetch.ts the first time any paid route
 * responds with 503 + `{error:"paid_disabled"}` (per-response detection per
 * D-19; no dedicated health probe).
 *
 * Copy is DELIBERATELY soft (D-18): "Live AI is paused — using pre-baked
 * audio and word-diff scoring." No "ERROR" or "DOWN" language. An invited
 * Past Master seeing this during a kill-switch incident should understand
 * the app is in a paused state, not broken.
 *
 * Shape follows PATTERNS §10 verbatim from src/components/PilotBanner.tsx —
 * same amber-950/80 bg, border-amber-800, text-amber-100, role="status",
 * and thin-ribbon dimensions. Mounted next to PilotBanner in src/app/layout.tsx
 * so the two banners stack naturally when both fire.
 *
 * Dismiss semantics (D-18): dismissable per session via the inline "Dismiss"
 * button — but the store flag is NOT cleared on dismiss. A subsequent
 * false→true transition in the store (e.g., another paid_disabled response
 * after a brief recovery) re-opens the banner. Dismiss state lives in a
 * component-local useState so a remount also re-opens.
 *
 * Client component — reads a client-only store via useSyncExternalStore. The
 * `() => false` SSR snapshot ensures the server never renders the banner on
 * first HTML (avoids hydration flicker).
 */

import { useSyncExternalStore, useState } from "react";
import {
  getDegradedMode,
  subscribeDegradedMode,
} from "@/lib/degraded-mode-store";

function useDegradedMode(): boolean {
  return useSyncExternalStore(
    subscribeDegradedMode,
    getDegradedMode,
    () => false, // SSR snapshot — never degraded on first server render
  );
}

export default function DegradedModeBanner() {
  const on = useDegradedMode();

  // D-18 re-trigger via derive-during-render pattern (React 19 idiom): track
  // the store value at the moment we dismissed. If the store flips off and
  // back on, `lastDismissedAt` won't match the new `on` transition and the
  // component re-opens. This avoids the useEffect+setState cascading-render
  // anti-pattern flagged by react-hooks/set-state-in-effect.
  //
  // `dismissedWhileOn` true  → banner currently suppressed by user.
  // When `on` transitions true→false the store listener re-renders; we reset
  // `dismissedWhileOn` so the next true transition re-opens the banner.
  const [dismissedAt, setDismissedAt] = useState<boolean | null>(null);

  // If the store is off, clear any stale dismissal (derived during render —
  // safe because setState-during-render bails out when the value is
  // unchanged; identical to the useSyncExternalStore-caller pattern).
  if (!on && dismissedAt !== null) {
    setDismissedAt(null);
  }

  const dismissed = on && dismissedAt === true;

  if (!on || dismissed) return null;

  return (
    <div
      role="status"
      className="w-full bg-amber-950/80 border-b border-amber-800 text-amber-100 text-center text-xs py-2 px-4 tracking-wide"
    >
      Live AI is paused — using pre-baked audio and word-diff scoring. Contact
      Shannon for questions.
      <button
        type="button"
        onClick={() => setDismissedAt(true)}
        className="ml-4 text-amber-300 underline"
        aria-label="Dismiss"
      >
        Dismiss
      </button>
    </div>
  );
}
