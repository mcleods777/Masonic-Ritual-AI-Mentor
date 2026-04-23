// @vitest-environment node
/**
 * Tests for POST /api/auth/client-token (SAFETY-05, D-11/D-12).
 *
 * Gates the route enforces:
 *   1. Origin header (when present) must match ALLOWED_ORIGIN_SUFFIXES — otherwise 403.
 *   2. pilot-session cookie must verify — otherwise 401.
 *
 * Happy path: returns {token, expiresIn: 3600} where the token verifies
 * with `sub = hashedUserFromEmail(session.email)`.
 */

import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../route";
import {
  SESSION_COOKIE_NAME,
  signSessionToken,
  verifyClientToken,
} from "@/lib/auth";
import { hashedUserFromEmail } from "@/lib/hash-user";

const GOOD_SECRET = "test-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"; // 44 chars

function makeRequest(opts: {
  cookie?: string;
  origin?: string | null;
}): NextRequest {
  const headers: Record<string, string> = {};
  if (opts.cookie) headers["cookie"] = opts.cookie;
  if (opts.origin !== undefined && opts.origin !== null) {
    headers["origin"] = opts.origin;
  }
  return new NextRequest(
    new URL("http://localhost:3000/api/auth/client-token"),
    { method: "POST", headers },
  );
}

describe("POST /api/auth/client-token", () => {
  let originalSecret: string | undefined;

  beforeEach(() => {
    originalSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = GOOD_SECRET;
  });

  afterEach(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  it("issues a 1h client-token when cookie + allowed origin present", async () => {
    const email = "Brother.One@Example.com";
    const sessionToken = await signSessionToken(email);
    const req = makeRequest({
      cookie: `${SESSION_COOKIE_NAME}=${sessionToken}`,
      origin: "https://masonic-ritual-ai-mentor.vercel.app",
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; expiresIn: number };
    expect(body.expiresIn).toBe(3600);
    expect(typeof body.token).toBe("string");

    const verified = await verifyClientToken(body.token);
    expect(verified).not.toBeNull();
    expect(verified?.sub).toBe(hashedUserFromEmail(email));
  });

  it("returns 401 {error:'Not signed in'} when pilot-session cookie missing", async () => {
    const req = makeRequest({
      origin: "https://masonic-ritual-ai-mentor.vercel.app",
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Not signed in" });
  });

  it("returns 401 when pilot-session cookie is invalid / tampered", async () => {
    const req = makeRequest({
      cookie: `${SESSION_COOKIE_NAME}=not-a-valid-token`,
      origin: "https://masonic-ritual-ai-mentor.vercel.app",
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 {error:'Forbidden origin'} for disallowed origin", async () => {
    const sessionToken = await signSessionToken("brother.one@example.com");
    const req = makeRequest({
      cookie: `${SESSION_COOKIE_NAME}=${sessionToken}`,
      origin: "https://attacker.com",
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: "Forbidden origin" });
  });

  it("allows request when Origin header absent (same-origin non-fetch)", async () => {
    const sessionToken = await signSessionToken("brother.one@example.com");
    const req = makeRequest({
      cookie: `${SESSION_COOKIE_NAME}=${sessionToken}`,
      origin: null,
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; expiresIn: number };
    expect(body.expiresIn).toBe(3600);
  });

  it("accepts preview-deploy *.vercel.app origins", async () => {
    const sessionToken = await signSessionToken("brother.one@example.com");
    const req = makeRequest({
      cookie: `${SESSION_COOKIE_NAME}=${sessionToken}`,
      origin: "https://masonic-ritual-ai-mentor-git-feature.vercel.app",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});
