/**
 * Screen Wake Lock — keep mobile screens awake during ritual playback.
 *
 * Wraps the Web Wake Lock API (navigator.wakeLock) with:
 *   - silent no-op when unsupported (older iOS, locked-down browsers)
 *   - automatic re-acquire when the tab becomes visible again (browsers
 *     release the lock on tab hide and never restore it automatically)
 *   - idempotent acquire/release so callers don't need to track state
 *
 * Browser support: Chrome 84+, Edge 84+, Firefox 126+, Safari 16.4+.
 * Below those versions, request() throws — we swallow it. Practical
 * meaning: modern iOS (April 2023+) and all recent Android stay awake;
 * very old devices fall back to the OS default.
 */

type WakeLockSentinel = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: "release", cb: () => void) => void;
};

type WakeLockAPI = {
  request: (type: "screen") => Promise<WakeLockSentinel>;
};

let sentinel: WakeLockSentinel | null = null;
let desired = false;
let visibilityListenerAttached = false;

function getApi(): WakeLockAPI | null {
  if (typeof navigator === "undefined") return null;
  const api = (navigator as { wakeLock?: WakeLockAPI }).wakeLock;
  return api ?? null;
}

async function acquire(): Promise<void> {
  const api = getApi();
  if (!api) return;
  if (sentinel && !sentinel.released) return;
  try {
    const next = await api.request("screen");
    sentinel = next;
    next.addEventListener("release", () => {
      // Browser released the lock (e.g., tab hidden). If the caller
      // still wants it, we'll re-acquire on the next visible event.
      if (sentinel === next) sentinel = null;
    });
  } catch {
    // Unsupported, permission denied, or transient failure — stay quiet.
    // Playback works regardless; the screen just may sleep.
  }
}

async function releaseSentinel(): Promise<void> {
  if (!sentinel) return;
  const current = sentinel;
  sentinel = null;
  try {
    await current.release();
  } catch {
    // Already released or transient — nothing to do.
  }
}

function attachVisibilityListener(): void {
  if (visibilityListenerAttached) return;
  if (typeof document === "undefined") return;
  document.addEventListener("visibilitychange", () => {
    if (desired && document.visibilityState === "visible") {
      void acquire();
    }
  });
  visibilityListenerAttached = true;
}

/** Request that the screen stays awake. Safe to call repeatedly. */
export async function keepScreenAwake(): Promise<void> {
  desired = true;
  attachVisibilityListener();
  await acquire();
}

/** Release the wake lock. Safe to call even if never acquired. */
export async function allowScreenSleep(): Promise<void> {
  desired = false;
  await releaseSentinel();
}

/** Whether the Wake Lock API is present in this browser. */
export function isWakeLockSupported(): boolean {
  return getApi() !== null;
}
