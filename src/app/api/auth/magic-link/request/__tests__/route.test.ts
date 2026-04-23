// @vitest-environment node
/**
 * Tests for /api/auth/magic-link/request.
 *
 * Critical security property (from plan-eng-review): non-allowlisted
 * emails must receive the SAME response as allowlisted emails. Any
 * observable difference (status code, body, headers, timing beyond a
 * reasonable bound) enables allowlist enumeration.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock Resend to avoid real network calls. The module is imported inside
// the route handler, so vi.mock hoists before the route loads.
const sendMock = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

import { POST } from "../route";
import { NextRequest } from "next/server";
import { __resetRateLimitForTests } from "@/lib/rate-limit";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest(new URL("http://localhost:3000/api/auth/magic-link/request"), {
    method: "POST",
    headers: { "Content-Type": "application/json", host: "localhost:3000" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/auth/magic-link/request", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: "test-email-id" }, error: null });
    process.env.JWT_SECRET = "test-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    process.env.LODGE_ALLOWLIST =
      "brother.one@example.com, brother.two@example.com";
    process.env.RESEND_API_KEY = "re_test_fake";
    process.env.MAGIC_LINK_FROM_EMAIL = "mentor@example.com";
    __resetRateLimitForTests();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("sends an email for an allowlisted address", async () => {
    const res = await POST(
      makeRequest({ email: "brother.one@example.com" }),
    );
    expect(res.status).toBe(200);
    expect(sendMock).toHaveBeenCalledOnce();
    const callArgs = sendMock.mock.calls[0][0];
    expect(callArgs.to).toBe("brother.one@example.com");
    expect(callArgs.html).toContain("/api/auth/magic-link/verify?t=");
    expect(callArgs.text).toContain("/api/auth/magic-link/verify?t=");
  });

  it("returns 200 with no Resend call for a non-allowlisted email (enumeration resistance)", async () => {
    const res = await POST(makeRequest({ email: "stranger@example.com" }));
    expect(res.status).toBe(200);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns indistinguishable success bodies for allowlisted and non-allowlisted", async () => {
    const allowed = await POST(
      makeRequest({ email: "brother.one@example.com" }),
    );
    const stranger = await POST(makeRequest({ email: "stranger@example.com" }));

    expect(allowed.status).toBe(stranger.status);
    const a = await allowed.json();
    const b = await stranger.json();
    expect(a).toEqual(b);
  });

  it("rejects invalid JSON body with 400", async () => {
    const res = await POST(makeRequest("not-json"));
    expect(res.status).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects malformed emails with 400 (not silently allowed)", async () => {
    const res = await POST(makeRequest({ email: "not-an-email" }));
    expect(res.status).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects non-string email fields", async () => {
    const res = await POST(makeRequest({ email: 42 }));
    expect(res.status).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns 500 when RESEND_API_KEY is not configured but user is allowlisted", async () => {
    delete process.env.RESEND_API_KEY;
    const res = await POST(
      makeRequest({ email: "brother.one@example.com" }),
    );
    expect(res.status).toBe(500);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns 500 when Resend reports an error for an allowlisted email", async () => {
    sendMock.mockResolvedValueOnce({
      data: null,
      error: { message: "Domain not verified" },
    });
    const res = await POST(
      makeRequest({ email: "brother.one@example.com" }),
    );
    expect(res.status).toBe(500);
  });

  it("rate-limits per email after 3 requests in the window", async () => {
    for (let i = 0; i < 3; i++) {
      const res = await POST(
        makeRequest({ email: "brother.one@example.com" }),
      );
      expect(res.status).toBe(200);
    }
    const blocked = await POST(
      makeRequest({ email: "brother.one@example.com" }),
    );
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
  });

  it("rate-limits per IP after 5 requests across different emails", async () => {
    // Different emails from same IP (default "unknown" in tests). The
    // per-email limit is 3, so we need at least 2 distinct emails to
    // reach the 5-request IP cap without tripping the email cap first.
    const emails = [
      "brother.one@example.com", // allowlisted, 3 hits
      "stranger@example.com",    // non-allowlisted, 2 hits = 5 total
    ];
    await POST(makeRequest({ email: emails[0] }));
    await POST(makeRequest({ email: emails[0] }));
    await POST(makeRequest({ email: emails[0] }));
    await POST(makeRequest({ email: emails[1] }));
    const fifth = await POST(makeRequest({ email: emails[1] }));
    expect(fifth.status).toBe(200);

    // 6th request from same IP with a fresh email should 429 on the IP cap
    const blocked = await POST(
      makeRequest({ email: "another@example.com" }),
    );
    expect(blocked.status).toBe(429);
  });
});
