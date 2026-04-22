/**
 * In-memory UTC-day spend accumulator (D-06b).
 *
 * Same pilot-scale pragmatism as src/lib/rate-limit.ts: we run on Vercel
 * Fluid Compute, which reuses function instances across concurrent
 * requests, so an in-memory Map survives long enough to catch meaningful
 * spike-day totals in the next cron run (SAFETY-04). Phase 6 ADMIN-02
 * replaces this with a Log Drain aggregation; Phase 2 accepts the
 * cold-start caveat.
 *
 * Known limitation: cold-start spawns a new process with an empty tally,
 * so totals reflect "warm-container data for the UTC day" — NOT the true
 * total. The SAFETY-04 alert email body documents this inline.
 *
 * emit() in src/lib/audit-log.ts calls incrementSpendTally() on every
 * audit record. The cron reads + clears the day's bucket after sending
 * its alert.
 *
 * Keyspace:
 *   `aggregate:${YYYY-MM-DD}` → aggregate USD spent across all users
 *   `${hashedUser}:${YYYY-MM-DD}` → per-user USD spent
 */

const tally = new Map<string, number>();

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Add `estimatedCostUSD` to today's (UTC) aggregate bucket and the
 * per-user bucket for `hashedUser`. Silently ignores non-finite and
 * non-positive costs to avoid poisoning the tally with bad data from
 * malformed audit records.
 */
export function incrementSpendTally(hashedUser: string, estimatedCostUSD: number): void {
  if (!Number.isFinite(estimatedCostUSD) || estimatedCostUSD <= 0) return;
  const day = todayUtc();
  const userKey = `${hashedUser}:${day}`;
  const aggKey = `aggregate:${day}`;
  tally.set(userKey, (tally.get(userKey) ?? 0) + estimatedCostUSD);
  tally.set(aggKey, (tally.get(aggKey) ?? 0) + estimatedCostUSD);
}

export interface SpendReading {
  aggregate: number;
  perUser: Array<{ hashedUser: string; total: number }>;
}

/**
 * Read and clear the tally for a specific UTC day (YYYY-MM-DD).
 * Returns the aggregate total + per-user totals in the order they appear
 * in the underlying Map (insertion order). Idempotent: calling twice
 * returns 0 the second time.
 *
 * Used by the SAFETY-04 cron (Plan 04) to compute spend-alert thresholds.
 */
export function readAndClearSpendForDay(utcDate: string): SpendReading {
  const aggKey = `aggregate:${utcDate}`;
  const aggregate = tally.get(aggKey) ?? 0;
  const suffix = `:${utcDate}`;
  const perUser: Array<{ hashedUser: string; total: number }> = [];

  for (const [key, total] of tally.entries()) {
    if (key === aggKey) continue;
    if (!key.endsWith(suffix)) continue;
    const hashedUser = key.slice(0, key.length - suffix.length);
    perUser.push({ hashedUser, total });
  }

  // Clear everything we just read.
  tally.delete(aggKey);
  for (const entry of perUser) {
    tally.delete(`${entry.hashedUser}${suffix}`);
  }

  return { aggregate, perUser };
}

/** Test-only: wipe all tally buckets between test cases. */
export function __resetSpendTallyForTests(): void {
  tally.clear();
}
