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

// SAFETY-07: inactivity-timer state. After 30 min of no user interaction
// (keydown/click/touchstart/pointerdown on document), the wake lock
// auto-releases and does NOT auto-reacquire — the user must explicitly
// call keepScreenAwake() again. Prevents a left-open tab from burning
// paid TTS/STT calls overnight.
//
// Known limitation (CONTEXT §SAFETY-07 + PATTERNS §18): STT activity
// does not bubble keydown/click/touchstart/pointerdown, so a user
// reciting for >30min without touching the screen will see the wake
// lock release. Rehearsals are typically punctuated by feedback reads,
// which touch the screen; this is an accepted pilot-scale tradeoff. If
// real-world feedback says otherwise, add `resetInactivityTimer()`
// from the STT engine's chunk/result handler.
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
const INACTIVITY_EVENTS = [
  "keydown",
  "click",
  "touchstart",
  "pointerdown",
] as const;

let inactivityListenerAttached = false;
let inactivityTimer: ReturnType<typeof setTimeout> | null = null;

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

// SAFETY-07: restart the inactivity countdown. Called from the DOM event
// listeners and from keepScreenAwake() itself. Early-returns when the
// lock is not desired (i.e., after an inactivity auto-release) so a
// late-arriving keydown does NOT revive the timer — the user must call
// keepScreenAwake() explicitly to re-arm the lock.
function resetInactivityTimer(): void {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  if (!desired) return;
  inactivityTimer = setTimeout(() => {
    void releaseSentinel();
    desired = false; // prevents visibilitychange re-acquire
    console.info(
      "[SAFETY-07] Wake lock released after 30 min of inactivity",
    );
  }, INACTIVITY_TIMEOUT_MS);
}

// SAFETY-07: wire the DOM listeners once (idempotent, mirrors the
// `visibilityListenerAttached` pattern above). Passive listeners — we
// never preventDefault on these events, just restart the timer.
function attachInactivityListener(): void {
  if (inactivityListenerAttached) return;
  if (typeof document === "undefined") return;
  for (const ev of INACTIVITY_EVENTS) {
    document.addEventListener(ev, resetInactivityTimer, { passive: true });
  }
  inactivityListenerAttached = true;
}

/** Request that the screen stays awake. Safe to call repeatedly. */
// SAFETY-07: also arms the inactivity timer. After 30 minutes with no
// `keydown`/`click`/`touchstart`/`pointerdown` on `document`, the lock
// auto-releases and does NOT auto-reacquire (the user must call this
// function again to re-arm). See the INACTIVITY_EVENTS comment above
// for the known STT-recitation caveat.
export async function keepScreenAwake(): Promise<void> {
  desired = true;
  attachVisibilityListener();
  attachInactivityListener();
  resetInactivityTimer();
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
