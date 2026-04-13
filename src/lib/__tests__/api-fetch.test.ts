import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("fetchApi", () => {
  const originalFetch = globalThis.fetch;
  const originalSecret = process.env.NEXT_PUBLIC_RITUAL_CLIENT_SECRET;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalSecret === undefined) {
      delete process.env.NEXT_PUBLIC_RITUAL_CLIENT_SECRET;
    } else {
      process.env.NEXT_PUBLIC_RITUAL_CLIENT_SECRET = originalSecret;
    }
  });

  it("attaches X-Client-Secret header when env var is set", async () => {
    process.env.NEXT_PUBLIC_RITUAL_CLIENT_SECRET = "test-secret-value";
    const fetchSpy = vi.fn().mockResolvedValue(new Response("ok"));
    globalThis.fetch = fetchSpy;

    const { fetchApi } = await import("../api-fetch");
    await fetchApi("/api/foo", { method: "POST" });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const initArg = fetchSpy.mock.calls[0][1] as RequestInit;
    const headers = new Headers(initArg.headers);
    expect(headers.get("X-Client-Secret")).toBe("test-secret-value");
    expect(initArg.method).toBe("POST");
  });

  it("passes init through unchanged when env var is unset", async () => {
    delete process.env.NEXT_PUBLIC_RITUAL_CLIENT_SECRET;
    const fetchSpy = vi.fn().mockResolvedValue(new Response("ok"));
    globalThis.fetch = fetchSpy;

    const { fetchApi } = await import("../api-fetch");
    await fetchApi("/api/foo");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const initArg = fetchSpy.mock.calls[0][1] as RequestInit | undefined;
    if (initArg?.headers) {
      const headers = new Headers(initArg.headers);
      expect(headers.get("X-Client-Secret")).toBeNull();
    }
  });

  it("preserves existing headers when adding the secret", async () => {
    process.env.NEXT_PUBLIC_RITUAL_CLIENT_SECRET = "abc";
    const fetchSpy = vi.fn().mockResolvedValue(new Response("ok"));
    globalThis.fetch = fetchSpy;

    const { fetchApi } = await import("../api-fetch");
    await fetchApi("/api/foo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    const initArg = fetchSpy.mock.calls[0][1] as RequestInit;
    const headers = new Headers(initArg.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("X-Client-Secret")).toBe("abc");
  });
});
