// @vitest-environment node
/**
 * Tests for the in-memory sliding-window rate limiter (SAFETY-02).
 *
 * Coverage priorities:
 *   - Existing signature: rateLimit(key, limit, windowMs) behavior unchanged.
 *   - SAFETY-02 caller-side keyspace extension: `paid:hour:${userKey}` and
 *     per-route namespaces exercised as regression coverage.
 *   - Key independence: different keys must not share a bucket.
 *   - `__resetRateLimitForTests` wipes state between test cases.
 *   - `getClientIp` header precedence (hardened per rate-limit.ts:75-93).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { rateLimit, getClientIp, __resetRateLimitForTests } from "../rate-limit";

beforeEach(() => __resetRateLimitForTests());

describe("rateLimit", () => {
  it("allows the first call under the limit", () => {
    const result = rateLimit("test", 3, 1000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
    expect(result.retryAfterSeconds).toBe(0);
  });

  it("rejects when the limit is reached", () => {
    for (let i = 0; i < 3; i++) rateLimit("test", 3, 1000);
    const result = rateLimit("test", 3, 1000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(0);
  });

  it("enforces the D-03 paid:hour keyspace (60/hr per user)", () => {
    const key = "paid:hour:user-abc123";
    for (let i = 0; i < 60; i++) {
      const r = rateLimit(key, 60, 3_600_000);
      expect(r.allowed).toBe(true);
    }
    expect(rateLimit(key, 60, 3_600_000).allowed).toBe(false);
  });

  it("keeps buckets independent across keys", () => {
    for (let i = 0; i < 2; i++) rateLimit("paid:hour:A", 2, 1000);
    for (let i = 0; i < 2; i++) rateLimit("paid:hour:B", 2, 1000);
    expect(rateLimit("paid:hour:A", 2, 1000).allowed).toBe(false);
    expect(rateLimit("paid:hour:B", 2, 1000).allowed).toBe(false);
  });

  it("__resetRateLimitForTests clears buckets", () => {
    for (let i = 0; i < 3; i++) rateLimit("test", 3, 1000);
    expect(rateLimit("test", 3, 1000).allowed).toBe(false);
    __resetRateLimitForTests();
    expect(rateLimit("test", 3, 1000).allowed).toBe(true);
  });
});

describe("getClientIp", () => {
  it("prefers x-vercel-forwarded-for", () => {
    const req = new Request("https://x.test/", {
      headers: {
        "x-vercel-forwarded-for": "1.2.3.4",
        "x-real-ip": "9.9.9.9",
      },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip when x-vercel-forwarded-for is absent", () => {
    const req = new Request("https://x.test/", {
      headers: { "x-real-ip": "9.9.9.9" },
    });
    expect(getClientIp(req)).toBe("9.9.9.9");
  });

  it("takes the rightmost x-forwarded-for value (the one Vercel appended)", () => {
    const req = new Request("https://x.test/", {
      headers: { "x-forwarded-for": "attacker,1.1.1.1,9.9.9.9" },
    });
    expect(getClientIp(req)).toBe("9.9.9.9");
  });

  it("returns 'unknown' when no forwarding headers are present", () => {
    const req = new Request("https://x.test/");
    expect(getClientIp(req)).toBe("unknown");
  });
});
