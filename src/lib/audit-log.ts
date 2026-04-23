/**
 * Structured PII-free audit log for paid-route calls (SAFETY-01).
 *
 * Destination: Vercel logs via synchronous `console.log("[AUDIT]", ...)`.
 * Phase 6 ADMIN-02 adds the Log Drain ingest path; Phase 2 emits only.
 *
 * PII invariant (D-10, defense-in-depth):
 *   1. The AuditRecord discriminated union EXCLUDES the keys `prompt`,
 *      `completion`, `email`, `text`, `body`. A TypeScript caller cannot
 *      pass them without an `as never` / `as unknown` escape hatch.
 *   2. eslint.config.mjs bans the same keys as direct object-literal
 *      arguments to emit(). See src/lib/__tests__/fixtures/banned-emit.ts
 *      for the regression fixture.
 *
 * emit() is intentionally SYNCHRONOUS (no await). Vercel captures stdout
 * automatically; making emit async would introduce a silent-drop failure
 * mode on unhandled rejection. Do NOT call emit() from client (browser)
 * code — pricing data is server-only per RESEARCH Architectural
 * Responsibility Map, and there's no log capture from the browser.
 *
 * If you find yourself reaching for `as AuditRecord` near an emit() call,
 * you are the bug. The types and the lint rule are in quiet agreement.
 *
 * Side-effect: emit() calls `incrementSpendTally(hashedUser, cost)` (D-06b)
 * so the SAFETY-04 cron has something to read. The tally is in-memory;
 * cold-start resets. See src/lib/spend-tally.ts for the caveat.
 */

import { incrementSpendTally } from "./spend-tally";

export type TTSRecord = {
  kind: "tts";
  timestamp: string;
  hashedUser: string;
  route: string;
  promptHash: string;
  completionHash: string;
  estimatedCostUSD: number;
  latencyMs: number;
  model: string;
  voice: string;
  charCount: number;
};

export type STTRecord = {
  kind: "stt";
  timestamp: string;
  hashedUser: string;
  route: string;
  promptHash: string;
  completionHash: string;
  estimatedCostUSD: number;
  latencyMs: number;
  model: string;
  durationMs: number;
  audioByteCount: number;
};

export type FeedbackRecord = {
  kind: "feedback";
  timestamp: string;
  hashedUser: string;
  route: string;
  promptHash: string;
  completionHash: string;
  estimatedCostUSD: number;
  latencyMs: number;
  variantId: string;
  promptTokens: number;
  completionTokens: number;
};

export type AuditRecord = TTSRecord | STTRecord | FeedbackRecord;

/**
 * Emit a single audit record to Vercel logs. Synchronous by design.
 * Also feeds the SAFETY-04 cron via spend-tally.
 */
export function emit(record: AuditRecord): void {
  // Synchronous; Vercel captures stdout.
  console.log("[AUDIT]", JSON.stringify(record));
  // D-06b side-effect: feed the cron's spend-tally.
  incrementSpendTally(record.hashedUser, record.estimatedCostUSD);
}
