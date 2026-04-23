// @vitest-environment node
/**
 * Tests for src/lib/audit-log.ts (SAFETY-01 + D-06b + D-07 + D-09).
 *
 * Covers:
 *   - emit() writes a single console.log line prefixed `[AUDIT]` with a
 *     JSON.stringify'd record as the second argument.
 *   - emit() forwards (hashedUser, estimatedCostUSD) to
 *     spend-tally.incrementSpendTally() synchronously.
 *
 * Shape invariants (compile-time, via the TS discriminated union) are
 * guaranteed by the type system — not asserted at runtime here. The
 * eslint no-restricted-syntax rule is covered by pii-guard / fixture
 * tests in Task 2.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("audit-log emit()", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes one console.log call with `[AUDIT]` prefix and JSON-stringified record", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { emit } = await import("../audit-log");
    const { __resetSpendTallyForTests } = await import("../spend-tally");
    __resetSpendTallyForTests();

    const record = {
      kind: "tts" as const,
      timestamp: "2026-04-21T00:00:00Z",
      hashedUser: "abc123",
      route: "/api/tts/gemini",
      promptHash: "h1",
      completionHash: "h2",
      estimatedCostUSD: 0.001,
      latencyMs: 42,
      model: "gemini-3.1-flash-tts-preview",
      voice: "v1",
      charCount: 100,
    };

    emit(record);

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith("[AUDIT]", JSON.stringify(record));
  });

  it("forwards (hashedUser, estimatedCostUSD) to incrementSpendTally", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { emit } = await import("../audit-log");
    const spendTally = await import("../spend-tally");
    spendTally.__resetSpendTallyForTests();

    const record = {
      kind: "tts" as const,
      timestamp: "2026-04-21T00:00:00Z",
      hashedUser: "user-xyz",
      route: "/api/tts/gemini",
      promptHash: "h1",
      completionHash: "h2",
      estimatedCostUSD: 0.5,
      latencyMs: 10,
      model: "gemini-3.1-flash-tts-preview",
      voice: "v1",
      charCount: 50,
    };

    emit(record);

    // Read back through the spend tally for today; should reflect this emit.
    const today = new Date().toISOString().slice(0, 10);
    const reading = spendTally.readAndClearSpendForDay(today);
    expect(reading.aggregate).toBeCloseTo(0.5, 10);
    expect(reading.perUser).toEqual([{ hashedUser: "user-xyz", total: 0.5 }]);
  });

  it("emits records of different kinds (tts/stt/feedback) without throwing", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { emit } = await import("../audit-log");
    const { __resetSpendTallyForTests } = await import("../spend-tally");
    __resetSpendTallyForTests();

    expect(() =>
      emit({
        kind: "stt",
        timestamp: "t",
        hashedUser: "u",
        route: "/api/transcribe",
        promptHash: "p",
        completionHash: "c",
        estimatedCostUSD: 0.01,
        latencyMs: 1,
        model: "groq-whisper-large-v3",
        durationMs: 1000,
        audioByteCount: 1024,
      }),
    ).not.toThrow();

    expect(() =>
      emit({
        kind: "feedback",
        timestamp: "t",
        hashedUser: "u",
        route: "/api/rehearsal-feedback",
        promptHash: "p",
        completionHash: "c",
        estimatedCostUSD: 0.02,
        latencyMs: 2,
        variantId: "v1",
        promptTokens: 100,
        completionTokens: 50,
      }),
    ).not.toThrow();
  });
});
