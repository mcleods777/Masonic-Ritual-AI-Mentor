// @vitest-environment node
/**
 * Tests for src/lib/spend-tally.ts (D-06b).
 *
 * In-memory UTC-day spend accumulator. Same pilot-scale pragmatism as
 * rate-limit.ts (cold-start resets to empty). Covers accumulate →
 * read-and-clear cycle, multi-user aggregation, and defensive handling
 * of non-finite / non-positive cost values.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  incrementSpendTally,
  readAndClearSpendForDay,
  __resetSpendTallyForTests,
} from "../spend-tally";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

describe("spend-tally", () => {
  beforeEach(() => {
    __resetSpendTallyForTests();
  });

  it("accumulates per-user and aggregate totals across multiple increments", () => {
    incrementSpendTally("user1", 1.5);
    incrementSpendTally("user1", 0.25);

    const reading = readAndClearSpendForDay(today());
    expect(reading.aggregate).toBeCloseTo(1.75, 10);
    expect(reading.perUser).toEqual([{ hashedUser: "user1", total: 1.75 }]);
  });

  it("tracks multiple users independently and aggregates correctly", () => {
    incrementSpendTally("alice", 2.0);
    incrementSpendTally("bob", 0.5);
    incrementSpendTally("alice", 0.5);

    const reading = readAndClearSpendForDay(today());
    expect(reading.aggregate).toBeCloseTo(3.0, 10);
    const byUser = Object.fromEntries(
      reading.perUser.map((p) => [p.hashedUser, p.total]),
    );
    expect(byUser.alice).toBeCloseTo(2.5, 10);
    expect(byUser.bob).toBeCloseTo(0.5, 10);
  });

  it("readAndClearSpendForDay clears after reading (idempotent second call returns empty)", () => {
    incrementSpendTally("user1", 1.0);
    const first = readAndClearSpendForDay(today());
    expect(first.aggregate).toBeCloseTo(1.0, 10);

    const second = readAndClearSpendForDay(today());
    expect(second.aggregate).toBe(0);
    expect(second.perUser).toEqual([]);
  });

  it("ignores NaN, Infinity, and negative cost values (no-op)", () => {
    incrementSpendTally("user1", Number.NaN);
    incrementSpendTally("user1", Number.POSITIVE_INFINITY);
    incrementSpendTally("user1", Number.NEGATIVE_INFINITY);
    incrementSpendTally("user1", -0.5);
    incrementSpendTally("user1", 0);

    const reading = readAndClearSpendForDay(today());
    expect(reading.aggregate).toBe(0);
    expect(reading.perUser).toEqual([]);
  });

  it("returns zero reading for a day with no activity", () => {
    const reading = readAndClearSpendForDay("2024-01-01");
    expect(reading.aggregate).toBe(0);
    expect(reading.perUser).toEqual([]);
  });

  it("reading a different day does not clear today's tally", () => {
    incrementSpendTally("user1", 1.0);
    const otherDay = readAndClearSpendForDay("2024-01-01");
    expect(otherDay.aggregate).toBe(0);

    // Today's tally should still be intact
    const t = readAndClearSpendForDay(today());
    expect(t.aggregate).toBeCloseTo(1.0, 10);
  });
});
