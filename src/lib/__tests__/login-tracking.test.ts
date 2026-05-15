// @vitest-environment node
/**
 * Tests for login + activity tracking.
 *
 * The Upstash Redis SDK is mocked at module-load time so the module's
 * `new Redis(...)` constructor returns our in-memory fake. The fake
 * implements just the surface we use: get, set, sadd, smembers.
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";

const fakeStore = new Map<string, unknown>();
const fakeSets = new Map<string, Set<string>>();

vi.mock("@upstash/redis", () => {
  class Redis {
    constructor(opts: { url: string; token: string }) {
      void opts;
    }
    async get<T = unknown>(key: string): Promise<T | null> {
      return (fakeStore.get(key) as T | undefined) ?? null;
    }
    async set(key: string, value: unknown): Promise<"OK"> {
      fakeStore.set(key, value);
      return "OK";
    }
    async sadd(key: string, member: string): Promise<number> {
      let set = fakeSets.get(key);
      if (!set) {
        set = new Set();
        fakeSets.set(key, set);
      }
      const before = set.size;
      set.add(member);
      return set.size - before;
    }
    async smembers(key: string): Promise<string[]> {
      const set = fakeSets.get(key);
      return set ? [...set] : [];
    }
  }
  return { Redis };
});

import {
  recordLogin,
  recordHeartbeat,
  finalizeSession,
  getAllActivity,
  isLoginTrackingConfigured,
  isOnline,
  SESSION_TIMEOUT_MS,
  __resetLoginTrackingForTests,
} from "../login-tracking";

describe("login-tracking", () => {
  let originalUrl: string | undefined;
  let originalToken: string | undefined;

  beforeEach(() => {
    originalUrl = process.env.KV_REST_API_URL;
    originalToken = process.env.KV_REST_API_TOKEN;
    process.env.KV_REST_API_URL = "https://test.upstash.io";
    process.env.KV_REST_API_TOKEN = "test-token";
    fakeStore.clear();
    fakeSets.clear();
    __resetLoginTrackingForTests();
  });

  afterEach(() => {
    process.env.KV_REST_API_URL = originalUrl;
    process.env.KV_REST_API_TOKEN = originalToken;
    vi.useRealTimers();
  });

  describe("isLoginTrackingConfigured", () => {
    it("is true when KV env vars are set", () => {
      expect(isLoginTrackingConfigured()).toBe(true);
    });

    it("is false when KV env vars are unset", () => {
      delete process.env.KV_REST_API_URL;
      delete process.env.KV_REST_API_TOKEN;
      __resetLoginTrackingForTests();
      expect(isLoginTrackingConfigured()).toBe(false);
    });
  });

  describe("recordLogin", () => {
    it("creates a record on first login", async () => {
      await recordLogin("Brother.One@Example.com");
      const all = await getAllActivity();
      expect(all).toHaveLength(1);
      expect(all[0]).toMatchObject({
        email: "brother.one@example.com",
        loginCount: 1,
        totalActiveMs: 0,
      });
      expect(all[0].currentSessionStart).toBeTruthy();
      expect(all[0].firstLoginAt).toBe(all[0].lastLoginAt);
    });

    it("increments loginCount and refreshes timestamps on subsequent logins", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      await recordLogin("brother@example.com");
      vi.setSystemTime(new Date("2026-01-02T00:00:00Z"));
      await recordLogin("brother@example.com");
      const [u] = await getAllActivity();
      expect(u.loginCount).toBe(2);
      expect(u.firstLoginAt).toBe("2026-01-01T00:00:00.000Z");
      expect(u.lastLoginAt).toBe("2026-01-02T00:00:00.000Z");
    });

    it("normalizes email casing and whitespace", async () => {
      await recordLogin("  Brother@Example.COM  ");
      const [u] = await getAllActivity();
      expect(u.email).toBe("brother@example.com");
    });

    it("is a no-op when KV is unconfigured", async () => {
      delete process.env.KV_REST_API_URL;
      delete process.env.KV_REST_API_TOKEN;
      __resetLoginTrackingForTests();
      await recordLogin("brother@example.com");
      __resetLoginTrackingForTests();
      process.env.KV_REST_API_URL = "https://test.upstash.io";
      process.env.KV_REST_API_TOKEN = "test-token";
      expect(await getAllActivity()).toEqual([]);
    });
  });

  describe("recordHeartbeat", () => {
    it("accumulates active time within an open session", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
      await recordLogin("brother@example.com");

      vi.setSystemTime(new Date("2026-01-01T12:01:00Z")); // +60s
      await recordHeartbeat("brother@example.com");
      vi.setSystemTime(new Date("2026-01-01T12:02:00Z")); // +60s
      await recordHeartbeat("brother@example.com");

      const [u] = await getAllActivity();
      expect(u.totalActiveMs).toBe(120_000);
      expect(u.loginCount).toBe(1);
    });

    it("starts a fresh session after a long gap and does not credit the gap", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
      await recordLogin("brother@example.com");
      vi.setSystemTime(new Date("2026-01-01T12:01:00Z"));
      await recordHeartbeat("brother@example.com");

      // 30 minutes later — well past SESSION_TIMEOUT_MS.
      vi.setSystemTime(new Date("2026-01-01T12:31:00Z"));
      await recordHeartbeat("brother@example.com");

      const [u] = await getAllActivity();
      // Only the first 60s was credited; the 30-min gap was not.
      expect(u.totalActiveMs).toBe(60_000);
      expect(u.currentSessionStart).toBe("2026-01-01T12:31:00.000Z");
    });

    it("caps a single heartbeat's credit at the per-tick cap", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
      await recordLogin("brother@example.com");
      // Advance just under SESSION_TIMEOUT_MS — still a continuous session,
      // but the gap is large. Credit must be capped, not the full gap.
      vi.setSystemTime(new Date(Date.now() + SESSION_TIMEOUT_MS - 1));
      await recordHeartbeat("brother@example.com");
      const [u] = await getAllActivity();
      expect(u.totalActiveMs).toBeLessThanOrEqual(90_000);
    });

    it("is a no-op when no record exists", async () => {
      await recordHeartbeat("never-logged-in@example.com");
      expect(await getAllActivity()).toEqual([]);
    });
  });

  describe("finalizeSession", () => {
    it("clears currentSessionStart but keeps history", async () => {
      await recordLogin("brother@example.com");
      await finalizeSession("brother@example.com");
      const [u] = await getAllActivity();
      expect(u.currentSessionStart).toBeNull();
      expect(u.loginCount).toBe(1);
    });

    it("is idempotent on records with no open session", async () => {
      await recordLogin("brother@example.com");
      await finalizeSession("brother@example.com");
      await finalizeSession("brother@example.com");
      const [u] = await getAllActivity();
      expect(u.currentSessionStart).toBeNull();
    });
  });

  describe("isOnline", () => {
    it("is true when a session is open and lastSeen is within the timeout", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
      await recordLogin("brother@example.com");
      const [u] = await getAllActivity();
      expect(isOnline(u, Date.now() + 30_000)).toBe(true);
    });

    it("is false after the timeout elapses without a heartbeat", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
      await recordLogin("brother@example.com");
      const [u] = await getAllActivity();
      expect(isOnline(u, Date.now() + SESSION_TIMEOUT_MS + 1_000)).toBe(false);
    });

    it("is false after finalizeSession", async () => {
      await recordLogin("brother@example.com");
      await finalizeSession("brother@example.com");
      const [u] = await getAllActivity();
      expect(isOnline(u)).toBe(false);
    });
  });
});
