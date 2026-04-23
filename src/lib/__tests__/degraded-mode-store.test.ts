// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";

/**
 * Tests for src/lib/degraded-mode-store.ts (SAFETY-08, D-18/D-19).
 *
 * The store is a zero-dep useSyncExternalStore singleton:
 *   - `getDegradedMode(): boolean` — current snapshot
 *   - `setDegradedMode(on: boolean): void` — mutator (idempotent; emits only
 *     when the value changes)
 *   - `subscribeDegradedMode(fn): () => void` — subscribe/unsubscribe
 *   - `__resetDegradedModeForTests(): void` — test-only reset
 *
 * Chosen over React Context because this state has exactly one writer
 * (api-fetch.ts on 503 + paid_disabled) and a handful of readers; Context
 * would need a provider in the root layout for zero real benefit.
 */

describe("degraded-mode-store", () => {
  beforeEach(async () => {
    const mod = await import("../degraded-mode-store");
    mod.__resetDegradedModeForTests();
  });

  it("defaults to off (getDegradedMode returns false)", async () => {
    const { getDegradedMode } = await import("../degraded-mode-store");
    expect(getDegradedMode()).toBe(false);
  });

  it("setDegradedMode(true) flips the flag on; setDegradedMode(false) flips it back", async () => {
    const { getDegradedMode, setDegradedMode } = await import(
      "../degraded-mode-store"
    );
    setDegradedMode(true);
    expect(getDegradedMode()).toBe(true);
    setDegradedMode(false);
    expect(getDegradedMode()).toBe(false);
  });

  it("notifies subscribers when the value changes", async () => {
    const { setDegradedMode, subscribeDegradedMode } = await import(
      "../degraded-mode-store"
    );
    let callCount = 0;
    const unsubscribe = subscribeDegradedMode(() => {
      callCount += 1;
    });
    setDegradedMode(true);
    expect(callCount).toBe(1);
    setDegradedMode(false);
    expect(callCount).toBe(2);
    unsubscribe();
  });

  it("does not notify subscribers when the value is unchanged (idempotent)", async () => {
    const { setDegradedMode, subscribeDegradedMode } = await import(
      "../degraded-mode-store"
    );
    let callCount = 0;
    const unsubscribe = subscribeDegradedMode(() => {
      callCount += 1;
    });
    setDegradedMode(false); // still off — no notification
    setDegradedMode(false); // still off — no notification
    expect(callCount).toBe(0);
    setDegradedMode(true); // change → 1 notification
    setDegradedMode(true); // same → no notification
    expect(callCount).toBe(1);
    unsubscribe();
  });

  it("unsubscribe() stops further notifications", async () => {
    const { setDegradedMode, subscribeDegradedMode } = await import(
      "../degraded-mode-store"
    );
    let callCount = 0;
    const unsubscribe = subscribeDegradedMode(() => {
      callCount += 1;
    });
    setDegradedMode(true);
    expect(callCount).toBe(1);
    unsubscribe();
    setDegradedMode(false);
    expect(callCount).toBe(1); // unchanged after unsubscribe
  });

  it("__resetDegradedModeForTests() clears state and listeners", async () => {
    const { setDegradedMode, subscribeDegradedMode, getDegradedMode, __resetDegradedModeForTests } =
      await import("../degraded-mode-store");
    let callCount = 0;
    subscribeDegradedMode(() => {
      callCount += 1;
    });
    setDegradedMode(true);
    expect(callCount).toBe(1);
    expect(getDegradedMode()).toBe(true);

    __resetDegradedModeForTests();

    expect(getDegradedMode()).toBe(false);
    setDegradedMode(true); // flag moves, but previously-registered listener is gone
    expect(callCount).toBe(1);
  });
});
