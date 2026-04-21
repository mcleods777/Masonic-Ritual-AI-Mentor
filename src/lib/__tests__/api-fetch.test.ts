import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Tests for src/lib/api-fetch.ts (extended for SAFETY-05 D-13 + D-15).
 *
 * Extends the Phase 1 X-Client-Secret shape:
 *   1. First fetchApi call bootstraps a client-token via POST /api/auth/client-token.
 *   2. Every subsequent call attaches BOTH X-Client-Secret AND
 *      Authorization: Bearer <token>.
 *   3. Proactive refresh at 50 * 60 * 1000 ms (10-min safety before the 1h expiry).
 *   4. Reactive 401 retry — once, not infinite — when the server reports
 *      `{error:"client_token_expired"}`.
 *   5. visibilitychange listener wired at module import time to reset the
 *      timer when a background tab resumes (browsers throttle setTimeout
 *      in background tabs, so the 50-min fire can slip past 60 min).
 *   6. Graceful degradation: if the bootstrap POST fails, fetchApi still
 *      attaches X-Client-Secret and issues the original request — the
 *      middleware's 401 is the right failure mode, not a client-side crash.
 */

describe("fetchApi (SAFETY-05 extended)", () => {
  const originalFetch = globalThis.fetch;
  const originalSecret = process.env.NEXT_PUBLIC_RITUAL_CLIENT_SECRET;

  beforeEach(() => {
    vi.resetModules();
    vi.useRealTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalSecret === undefined) {
      delete process.env.NEXT_PUBLIC_RITUAL_CLIENT_SECRET;
    } else {
      process.env.NEXT_PUBLIC_RITUAL_CLIENT_SECRET = originalSecret;
    }
    vi.useRealTimers();
  });

  it("attaches X-Client-Secret header when env var is set (Phase 1 behavior preserved)", async () => {
    process.env.NEXT_PUBLIC_RITUAL_CLIENT_SECRET = "test-secret-value";
    const fetchSpy = vi.fn().mockImplementation((input: string) => {
      if (String(input).includes("/api/auth/client-token")) {
        return Promise.resolve(
          new Response(JSON.stringify({ token: "tok-1", expiresIn: 3600 }), {
            status: 200,
          }),
        );
      }
      return Promise.resolve(new Response("ok"));
    });
    globalThis.fetch = fetchSpy as typeof fetch;

    const { fetchApi, __resetApiFetchForTests } = await import("../api-fetch");
    __resetApiFetchForTests();
    await fetchApi("/api/foo", { method: "POST" });

    const fooCall = fetchSpy.mock.calls.find(
      (c) => !String(c[0]).includes("/api/auth/client-token"),
    );
    expect(fooCall).toBeDefined();
    const initArg = fooCall![1] as RequestInit;
    const headers = new Headers(initArg.headers);
    expect(headers.get("X-Client-Secret")).toBe("test-secret-value");
    expect(initArg.method).toBe("POST");
  });

  it("bootstraps a client-token on first call and attaches BOTH headers on every subsequent call", async () => {
    process.env.NEXT_PUBLIC_RITUAL_CLIENT_SECRET = "abc";
    const fetchSpy = vi.fn().mockImplementation((input: string) => {
      if (String(input).includes("/api/auth/client-token")) {
        return Promise.resolve(
          new Response(JSON.stringify({ token: "tok-1", expiresIn: 3600 }), {
            status: 200,
          }),
        );
      }
      return Promise.resolve(new Response("ok"));
    });
    globalThis.fetch = fetchSpy as typeof fetch;

    const { fetchApi, __resetApiFetchForTests } = await import("../api-fetch");
    __resetApiFetchForTests();

    await fetchApi("/api/foo");
    await fetchApi("/api/bar");

    // First call = bootstrap POST + /api/foo. Second call = /api/bar only.
    const bootstrapCalls = fetchSpy.mock.calls.filter((c) =>
      String(c[0]).includes("/api/auth/client-token"),
    );
    expect(bootstrapCalls.length).toBe(1);
    expect((bootstrapCalls[0][1] as RequestInit).method).toBe("POST");
    expect((bootstrapCalls[0][1] as RequestInit).credentials).toBe("include");

    const appCalls = fetchSpy.mock.calls.filter(
      (c) => !String(c[0]).includes("/api/auth/client-token"),
    );
    expect(appCalls.length).toBe(2);
    for (const c of appCalls) {
      const headers = new Headers((c[1] as RequestInit).headers);
      expect(headers.get("X-Client-Secret")).toBe("abc");
      expect(headers.get("Authorization")).toBe("Bearer tok-1");
    }
  });

  it("retries ONCE on 401 + {error:'client_token_expired'} with a fresh token", async () => {
    process.env.NEXT_PUBLIC_RITUAL_CLIENT_SECRET = "abc";
    let tokenSeq = 0;
    let appCallCount = 0;
    const fetchSpy = vi.fn().mockImplementation((input: string) => {
      if (String(input).includes("/api/auth/client-token")) {
        tokenSeq += 1;
        return Promise.resolve(
          new Response(
            JSON.stringify({ token: `tok-${tokenSeq}`, expiresIn: 3600 }),
            { status: 200 },
          ),
        );
      }
      appCallCount += 1;
      if (appCallCount === 1) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: "client_token_expired" }), {
            status: 401,
          }),
        );
      }
      return Promise.resolve(new Response("ok", { status: 200 }));
    });
    globalThis.fetch = fetchSpy as typeof fetch;

    const { fetchApi, __resetApiFetchForTests } = await import("../api-fetch");
    __resetApiFetchForTests();

    const res = await fetchApi("/api/foo");
    expect(res.status).toBe(200);

    // Two /api/auth/client-token calls: initial bootstrap + post-401 refresh.
    const bootstrapCalls = fetchSpy.mock.calls.filter((c) =>
      String(c[0]).includes("/api/auth/client-token"),
    );
    expect(bootstrapCalls.length).toBe(2);
    // Two /api/foo calls: initial (401) + retry (200).
    expect(appCallCount).toBe(2);
    // The retry must carry the fresh token.
    const appCalls = fetchSpy.mock.calls.filter(
      (c) => !String(c[0]).includes("/api/auth/client-token"),
    );
    const retryHeaders = new Headers((appCalls[1][1] as RequestInit).headers);
    expect(retryHeaders.get("Authorization")).toBe("Bearer tok-2");
  });

  it("does NOT retry a second time — a persistent 401 returns as-is (no infinite loop)", async () => {
    process.env.NEXT_PUBLIC_RITUAL_CLIENT_SECRET = "abc";
    const fetchSpy = vi.fn().mockImplementation((input: string) => {
      if (String(input).includes("/api/auth/client-token")) {
        return Promise.resolve(
          new Response(JSON.stringify({ token: "tok-x", expiresIn: 3600 }), {
            status: 200,
          }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ error: "client_token_expired" }), {
          status: 401,
        }),
      );
    });
    globalThis.fetch = fetchSpy as typeof fetch;

    const { fetchApi, __resetApiFetchForTests } = await import("../api-fetch");
    __resetApiFetchForTests();

    const res = await fetchApi("/api/foo");
    expect(res.status).toBe(401);
    // Exactly one retry: /api/foo appears twice, not three+.
    const appCalls = fetchSpy.mock.calls.filter(
      (c) => !String(c[0]).includes("/api/auth/client-token"),
    );
    expect(appCalls.length).toBe(2);
  });

  it("schedules proactive refresh at 50 * 60 * 1000 ms after bootstrap", async () => {
    process.env.NEXT_PUBLIC_RITUAL_CLIENT_SECRET = "abc";
    let tokenSeq = 0;
    const fetchSpy = vi.fn().mockImplementation((input: string) => {
      if (String(input).includes("/api/auth/client-token")) {
        tokenSeq += 1;
        return Promise.resolve(
          new Response(
            JSON.stringify({ token: `tok-${tokenSeq}`, expiresIn: 3600 }),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(new Response("ok"));
    });
    globalThis.fetch = fetchSpy as typeof fetch;

    vi.useFakeTimers();
    const { fetchApi, __resetApiFetchForTests } = await import("../api-fetch");
    __resetApiFetchForTests();

    await fetchApi("/api/foo");
    expect(tokenSeq).toBe(1);

    // Advance 50 minutes — proactive refresh should fire.
    await vi.advanceTimersByTimeAsync(50 * 60 * 1000);
    // Let the microtask queue drain.
    await Promise.resolve();
    await Promise.resolve();
    expect(tokenSeq).toBe(2);
  });

  it("wires a visibilitychange listener at module import time (background-tab resume guard)", async () => {
    process.env.NEXT_PUBLIC_RITUAL_CLIENT_SECRET = "abc";
    const fetchSpy = vi.fn().mockResolvedValue(new Response("ok"));
    globalThis.fetch = fetchSpy as typeof fetch;

    const addSpy = vi.spyOn(document, "addEventListener");
    try {
      await import("../api-fetch");
      const calls = addSpy.mock.calls.filter((c) => c[0] === "visibilitychange");
      expect(calls.length).toBeGreaterThanOrEqual(1);
    } finally {
      addSpy.mockRestore();
    }
  });

  it("degrades gracefully when the bootstrap POST fails (still attaches X-Client-Secret)", async () => {
    process.env.NEXT_PUBLIC_RITUAL_CLIENT_SECRET = "abc";
    const fetchSpy = vi.fn().mockImplementation((input: string) => {
      if (String(input).includes("/api/auth/client-token")) {
        // Bootstrap fails (e.g., user not signed in).
        return Promise.resolve(new Response("nope", { status: 500 }));
      }
      return Promise.resolve(new Response("ok"));
    });
    globalThis.fetch = fetchSpy as typeof fetch;

    const { fetchApi, __resetApiFetchForTests } = await import("../api-fetch");
    __resetApiFetchForTests();

    const res = await fetchApi("/api/foo");
    expect(res.status).toBe(200);

    const appCalls = fetchSpy.mock.calls.filter(
      (c) => !String(c[0]).includes("/api/auth/client-token"),
    );
    expect(appCalls.length).toBe(1);
    const headers = new Headers((appCalls[0][1] as RequestInit).headers);
    expect(headers.get("X-Client-Secret")).toBe("abc");
    // No Authorization header when bootstrap failed.
    expect(headers.get("Authorization")).toBeNull();
  });
});

/**
 * SAFETY-08 degraded-mode detection (D-19) — per-response, no health probe.
 *
 * The paid-route-guard (SAFETY-02, Plan 02) returns 503 with a structured
 * JSON body `{error:"paid_disabled", fallback:<route-specific>}` when the
 * `RITUAL_EMERGENCY_DISABLE_PAID` env var is "true". api-fetch must detect
 * this specific shape and flip the client-side degraded-mode store so the
 * DegradedModeBanner renders. A generic upstream 503 with a different body
 * shape (or no body) must NOT flip the flag.
 */

describe("fetchApi — SAFETY-08 degraded-mode detection", () => {
  const originalFetch = globalThis.fetch;
  const originalSecret = process.env.NEXT_PUBLIC_RITUAL_CLIENT_SECRET;

  beforeEach(() => {
    vi.resetModules();
    vi.useRealTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalSecret === undefined) {
      delete process.env.NEXT_PUBLIC_RITUAL_CLIENT_SECRET;
    } else {
      process.env.NEXT_PUBLIC_RITUAL_CLIENT_SECRET = originalSecret;
    }
    vi.useRealTimers();
  });

  it("calls setDegradedMode(true) on 503 + {error:'paid_disabled'} response", async () => {
    process.env.NEXT_PUBLIC_RITUAL_CLIENT_SECRET = "abc";
    const fetchSpy = vi.fn().mockImplementation((input: string) => {
      if (String(input).includes("/api/auth/client-token")) {
        return Promise.resolve(
          new Response(JSON.stringify({ token: "tok-1", expiresIn: 3600 }), {
            status: 200,
          }),
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({ error: "paid_disabled", fallback: "pre-baked" }),
          { status: 503 },
        ),
      );
    });
    globalThis.fetch = fetchSpy as typeof fetch;

    const { fetchApi, __resetApiFetchForTests } = await import("../api-fetch");
    const { getDegradedMode, __resetDegradedModeForTests } = await import(
      "../degraded-mode-store"
    );
    __resetApiFetchForTests();
    __resetDegradedModeForTests();

    expect(getDegradedMode()).toBe(false);
    const res = await fetchApi("/api/tts/gemini", { method: "POST" });
    expect(res.status).toBe(503);
    expect(getDegradedMode()).toBe(true);
  });

  it("does NOT flip degraded-mode on a 200 response", async () => {
    process.env.NEXT_PUBLIC_RITUAL_CLIENT_SECRET = "abc";
    const fetchSpy = vi.fn().mockImplementation((input: string) => {
      if (String(input).includes("/api/auth/client-token")) {
        return Promise.resolve(
          new Response(JSON.stringify({ token: "tok-1", expiresIn: 3600 }), {
            status: 200,
          }),
        );
      }
      return Promise.resolve(new Response("ok", { status: 200 }));
    });
    globalThis.fetch = fetchSpy as typeof fetch;

    const { fetchApi, __resetApiFetchForTests } = await import("../api-fetch");
    const { getDegradedMode, __resetDegradedModeForTests } = await import(
      "../degraded-mode-store"
    );
    __resetApiFetchForTests();
    __resetDegradedModeForTests();

    await fetchApi("/api/foo");
    expect(getDegradedMode()).toBe(false);
  });

  it("does NOT flip degraded-mode on a generic 503 without paid_disabled body", async () => {
    process.env.NEXT_PUBLIC_RITUAL_CLIENT_SECRET = "abc";
    const fetchSpy = vi.fn().mockImplementation((input: string) => {
      if (String(input).includes("/api/auth/client-token")) {
        return Promise.resolve(
          new Response(JSON.stringify({ token: "tok-1", expiresIn: 3600 }), {
            status: 200,
          }),
        );
      }
      // Upstream provider genuinely 503 — HTML body, not our structured JSON.
      return Promise.resolve(
        new Response("<html>Upstream unavailable</html>", { status: 503 }),
      );
    });
    globalThis.fetch = fetchSpy as typeof fetch;

    const { fetchApi, __resetApiFetchForTests } = await import("../api-fetch");
    const { getDegradedMode, __resetDegradedModeForTests } = await import(
      "../degraded-mode-store"
    );
    __resetApiFetchForTests();
    __resetDegradedModeForTests();

    const res = await fetchApi("/api/foo");
    expect(res.status).toBe(503);
    expect(getDegradedMode()).toBe(false);
  });

  it("does NOT flip degraded-mode on a 503 with JSON body that has a different error code", async () => {
    process.env.NEXT_PUBLIC_RITUAL_CLIENT_SECRET = "abc";
    const fetchSpy = vi.fn().mockImplementation((input: string) => {
      if (String(input).includes("/api/auth/client-token")) {
        return Promise.resolve(
          new Response(JSON.stringify({ token: "tok-1", expiresIn: 3600 }), {
            status: 200,
          }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ error: "upstream_timeout" }), {
          status: 503,
        }),
      );
    });
    globalThis.fetch = fetchSpy as typeof fetch;

    const { fetchApi, __resetApiFetchForTests } = await import("../api-fetch");
    const { getDegradedMode, __resetDegradedModeForTests } = await import(
      "../degraded-mode-store"
    );
    __resetApiFetchForTests();
    __resetDegradedModeForTests();

    await fetchApi("/api/foo");
    expect(getDegradedMode()).toBe(false);
  });
});
