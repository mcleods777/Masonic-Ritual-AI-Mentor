// @vitest-environment jsdom
/**
 * Tests for src/lib/screen-wake-lock.ts SAFETY-07 inactivity auto-release.
 *
 * First use of `vi.useFakeTimers()` in this repo (02-PATTERNS §11, §18).
 * Pattern: Template C — module-level global replacement via
 * `Object.defineProperty(navigator, "wakeLock", ...)` + `vi.resetModules()`
 * between tests so the module-singleton state (`sentinel`, `desired`,
 * `inactivityTimer`, `visibilityListenerAttached`, `inactivityListenerAttached`)
 * is freshly initialized per `it` block.
 *
 * Behavior under test (per 02-CONTEXT §SAFETY-07 / 02-PATTERNS §18):
 *   1. keepScreenAwake() requests the Wake Lock API with "screen".
 *   2. After 30min of no user interaction, the sentinel auto-releases AND
 *      a console.info with "[SAFETY-07]" prefix is emitted.
 *   3. A keydown (or any of click/touchstart/pointerdown) before the 30min
 *      mark resets the timer.
 *   4. After auto-release, `desired=false` so the existing visibilitychange
 *      re-acquire path does NOT fire when the tab becomes visible.
 *   5. Listeners attach exactly once across multiple keepScreenAwake calls
 *      (idempotent flag, same pattern as `visibilityListenerAttached`).
 *   6. After auto-release, a mere keydown does NOT reacquire the lock —
 *      explicit keepScreenAwake() is required (CONTEXT: "do NOT auto-reacquire").
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MockSentinel = {
  released: boolean;
  release: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
};

let releaseSpy: ReturnType<typeof vi.fn>;
let requestSpy: ReturnType<typeof vi.fn>;
let originalWakeLockDescriptor: PropertyDescriptor | undefined;

function makeSentinel(): MockSentinel {
  return {
    released: false,
    release: releaseSpy,
    addEventListener: vi.fn(),
  };
}

describe("screen-wake-lock SAFETY-07 inactivity release", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    releaseSpy = vi.fn().mockResolvedValue(undefined);
    requestSpy = vi.fn().mockImplementation(async () => makeSentinel());
    originalWakeLockDescriptor = Object.getOwnPropertyDescriptor(
      navigator,
      "wakeLock",
    );
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: { request: requestSpy },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalWakeLockDescriptor) {
      Object.defineProperty(navigator, "wakeLock", originalWakeLockDescriptor);
    } else {
      // @ts-expect-error — removing dynamically-added property
      delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
    }
  });

  it("acquires the wake lock when keepScreenAwake is called", async () => {
    const { keepScreenAwake } = await import("../screen-wake-lock");
    await keepScreenAwake();
    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(requestSpy).toHaveBeenCalledWith("screen");
  });

  it("auto-releases the sentinel after 30 min of inactivity and logs [SAFETY-07]", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const { keepScreenAwake } = await import("../screen-wake-lock");
    await keepScreenAwake();

    // Advance wall-clock 30 minutes with no user interaction.
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);

    expect(releaseSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalled();
    const logged = infoSpy.mock.calls.flat().join(" ");
    expect(logged).toContain("[SAFETY-07]");
  });

  it("resets the inactivity timer when a keydown fires before the 30-min mark", async () => {
    const { keepScreenAwake } = await import("../screen-wake-lock");
    await keepScreenAwake();

    // Fast-forward 29 minutes (1 min before the deadline).
    await vi.advanceTimersByTimeAsync(29 * 60 * 1000);
    expect(releaseSpy).not.toHaveBeenCalled();

    // User interacts — timer should reset.
    document.dispatchEvent(new Event("keydown"));

    // Fast-forward another 29 minutes. Total wall-clock: 58 min.
    // Time since last interaction: 29 min < 30 min threshold.
    await vi.advanceTimersByTimeAsync(29 * 60 * 1000);
    expect(releaseSpy).not.toHaveBeenCalled();

    // Now advance past the 30-min-since-keydown mark.
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    expect(releaseSpy).toHaveBeenCalledTimes(1);
  });

  it("does NOT auto-reacquire on visibilitychange after inactivity release", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { keepScreenAwake } = await import("../screen-wake-lock");
    await keepScreenAwake();
    expect(requestSpy).toHaveBeenCalledTimes(1);

    // Release via inactivity.
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(releaseSpy).toHaveBeenCalledTimes(1);

    // Simulate the tab becoming visible again. Since inactivity set
    // desired=false, the existing guard `if (desired && ...)` must skip
    // the re-acquire path.
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.runAllTicks();

    // requestSpy must NOT have been called a second time.
    expect(requestSpy).toHaveBeenCalledTimes(1);
  });

  it("attaches inactivity listeners exactly once across multiple keepScreenAwake calls", async () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const { keepScreenAwake } = await import("../screen-wake-lock");

    await keepScreenAwake();
    await keepScreenAwake();
    await keepScreenAwake();

    // Four inactivity events should each appear exactly once (not three
    // times despite three keepScreenAwake invocations).
    const events = ["keydown", "click", "touchstart", "pointerdown"];
    for (const ev of events) {
      const calls = addSpy.mock.calls.filter((c) => c[0] === ev);
      expect(calls.length).toBe(1);
    }
  });

  it("does NOT reacquire the wake lock on a keydown after inactivity release", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { keepScreenAwake } = await import("../screen-wake-lock");
    await keepScreenAwake();
    expect(requestSpy).toHaveBeenCalledTimes(1);

    // Inactivity release.
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(releaseSpy).toHaveBeenCalledTimes(1);

    // User interaction after release should NOT trigger a new acquire —
    // `resetInactivityTimer` early-returns when `desired=false`, and the
    // event listener only calls `resetInactivityTimer`, not `acquire`.
    document.dispatchEvent(new Event("keydown"));
    await vi.runAllTicks();

    expect(requestSpy).toHaveBeenCalledTimes(1);
  });
});
