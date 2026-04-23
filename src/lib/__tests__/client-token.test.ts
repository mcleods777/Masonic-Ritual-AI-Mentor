// @vitest-environment node
/**
 * Tests for the 1h client-token (SAFETY-05, D-11).
 *
 * Round-trip + cross-audience + tamper + expiry coverage for the third JWT
 * audience this codebase mints. Mirrors the Phase 1 auth.test.ts "audience
 * guard" tests that already block session<->magic-link swaps: Phase 2 adds
 * the third audience and the same cross-audience rejections.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  CLIENT_TOKEN_TTL_SECONDS,
  signClientToken,
  verifyClientToken,
  signSessionToken,
  signMagicLinkToken,
} from "../auth";

const GOOD_SECRET = "test-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"; // 44 chars

describe("client-token helpers", () => {
  let originalSecret: string | undefined;

  beforeEach(() => {
    originalSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = GOOD_SECRET;
  });

  afterEach(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  it("CLIENT_TOKEN_TTL_SECONDS equals 1 hour (D-11)", () => {
    expect(CLIENT_TOKEN_TTL_SECONDS).toBe(60 * 60);
  });

  it("round-trips a valid client-token with sub = hashedUser", async () => {
    const hashedUser = "u0123456789abcdef";
    const token = await signClientToken(hashedUser);
    const payload = await verifyClientToken(token);
    expect(payload?.sub).toBe(hashedUser);
  });

  it("rejects a session token presented as a client-token (cross-audience)", async () => {
    const sessionToken = await signSessionToken("brother.one@example.com");
    const result = await verifyClientToken(sessionToken);
    expect(result).toBeNull();
  });

  it("rejects a magic-link token presented as a client-token (cross-audience)", async () => {
    const magicToken = await signMagicLinkToken("brother.one@example.com");
    const result = await verifyClientToken(magicToken);
    expect(result).toBeNull();
  });

  it("returns null for undefined input", async () => {
    expect(await verifyClientToken(undefined)).toBeNull();
  });

  it("returns null for an invalid / malformed token string", async () => {
    expect(await verifyClientToken("invalid-token")).toBeNull();
    expect(await verifyClientToken("")).toBeNull();
  });

  it("rejects a client-token signed with a different JWT_SECRET", async () => {
    const token = await signClientToken("u0123456789abcdef");
    process.env.JWT_SECRET = "different-secret-bbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const result = await verifyClientToken(token);
    expect(result).toBeNull();
  });

  it("rejects an expired client-token (exp in the past)", async () => {
    // Craft a token with a past exp claim using jose directly — mirrors the
    // pattern used in auth.test.ts magic-link "rejects an expired token"
    // (avoids waiting on real time or juggling fake timers).
    const { SignJWT } = await import("jose");
    const expired = await new SignJWT({ sub: "u0123456789abcdef" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("masonic-ritual-mentor")
      .setAudience("client-token")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
    expect(await verifyClientToken(expired)).toBeNull();
  });

  it("rejects a tampered client-token", async () => {
    const token = await signClientToken("u0123456789abcdef");
    const tampered = token.slice(0, -4) + "xxxx";
    expect(await verifyClientToken(tampered)).toBeNull();
  });
});
