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
});
