// @vitest-environment node
/**
 * Tests for pilot authentication helpers.
 *
 * Coverage priorities (from plan-eng-review on 2026-04-14):
 *   - JWT round-trip for both magic-link and session tokens
 *   - Expired token rejection
 *   - Tampered token rejection
 *   - Allowlist membership check with normalization
 *   - Enumeration resistance precondition: allowlist returns false for
 *     non-members without throwing (the route layer always returns 200)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isEmailAllowed,
  isAuthConfigured,
  looksLikeEmail,
  signMagicLinkToken,
  verifyMagicLinkToken,
  signSessionToken,
  verifySessionToken,
} from "../auth";

const GOOD_SECRET = "test-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"; // 44 chars

describe("auth helpers", () => {
  let originalSecret: string | undefined;
  let originalAllowlist: string | undefined;

  beforeEach(() => {
    originalSecret = process.env.JWT_SECRET;
    originalAllowlist = process.env.LODGE_ALLOWLIST;
    process.env.JWT_SECRET = GOOD_SECRET;
    process.env.LODGE_ALLOWLIST = "brother.one@example.com, Brother.Two@example.com";
  });

  afterEach(() => {
    process.env.JWT_SECRET = originalSecret;
    process.env.LODGE_ALLOWLIST = originalAllowlist;
  });

  describe("isAuthConfigured", () => {
    it("returns true when JWT_SECRET is set and long enough", () => {
      expect(isAuthConfigured()).toBe(true);
    });

    it("returns false when JWT_SECRET is unset", () => {
      delete process.env.JWT_SECRET;
      expect(isAuthConfigured()).toBe(false);
    });

    it("returns false when JWT_SECRET is too short", () => {
      process.env.JWT_SECRET = "short";
      expect(isAuthConfigured()).toBe(false);
    });
  });

  describe("looksLikeEmail", () => {
    it("accepts typical addresses", () => {
      expect(looksLikeEmail("a@b.co")).toBe(true);
      expect(looksLikeEmail("brother.one+test@example.com")).toBe(true);
    });

    it("rejects non-strings and empty", () => {
      expect(looksLikeEmail(null)).toBe(false);
      expect(looksLikeEmail(undefined)).toBe(false);
      expect(looksLikeEmail(42)).toBe(false);
      expect(looksLikeEmail("")).toBe(false);
    });

    it("rejects malformed addresses", () => {
      expect(looksLikeEmail("no-at-sign")).toBe(false);
      expect(looksLikeEmail("two@@signs.com")).toBe(false);
      expect(looksLikeEmail("no-dot-after@at")).toBe(false);
      expect(looksLikeEmail("spaces in@addr.com")).toBe(false);
    });
  });

  describe("isEmailAllowed", () => {
    it("matches exact allowlisted emails", () => {
      expect(isEmailAllowed("brother.one@example.com")).toBe(true);
    });

    it("is case insensitive", () => {
      expect(isEmailAllowed("BROTHER.ONE@example.com")).toBe(true);
      expect(isEmailAllowed("brother.two@example.com")).toBe(true);
    });

    it("tolerates whitespace in the input", () => {
      expect(isEmailAllowed("  brother.one@example.com  ")).toBe(true);
    });

    it("returns false for non-members without throwing", () => {
      // Enumeration resistance: the route layer relies on a boolean, not on
      // an exception or a distinguishable error.
      expect(isEmailAllowed("stranger@example.com")).toBe(false);
      expect(isEmailAllowed("")).toBe(false);
    });

    it("returns false when LODGE_ALLOWLIST is unset", () => {
      delete process.env.LODGE_ALLOWLIST;
      expect(isEmailAllowed("brother.one@example.com")).toBe(false);
    });
  });

  describe("magic-link tokens", () => {
    it("round-trips a valid token", async () => {
      const token = await signMagicLinkToken("brother.one@example.com");
      const payload = await verifyMagicLinkToken(token);
      expect(payload?.email).toBe("brother.one@example.com");
    });

    it("normalizes email on sign (lowercases + trims)", async () => {
      const token = await signMagicLinkToken("  BROTHER.ONE@example.com  ");
      const payload = await verifyMagicLinkToken(token);
      expect(payload?.email).toBe("brother.one@example.com");
    });

    it("rejects an expired token", async () => {
      // Craft a token whose exp claim is already in the past. jose accepts
      // negative relative times on setExpirationTime.
      const { SignJWT } = await import("jose");
      const expired = await new SignJWT({ email: "brother.one@example.com" })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuer("masonic-ritual-mentor")
        .setAudience("pilot-magic-link")
        .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
        .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
        .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
      expect(await verifyMagicLinkToken(expired)).toBeNull();
    });

    it("rejects a tampered token", async () => {
      const token = await signMagicLinkToken("brother.one@example.com");
      // Flip the last character of the signature
      const tampered = token.slice(0, -1) + (token.slice(-1) === "a" ? "b" : "a");
      const result = await verifyMagicLinkToken(tampered);
      expect(result).toBeNull();
    });

    it("rejects a token signed with a different secret", async () => {
      const token = await signMagicLinkToken("brother.one@example.com");
      process.env.JWT_SECRET = "different-secret-bbbbbbbbbbbbbbbbbbbbb";
      const result = await verifyMagicLinkToken(token);
      expect(result).toBeNull();
    });

    it("rejects a session token presented as a magic-link token (audience guard)", async () => {
      const sessionToken = await signSessionToken("brother.one@example.com");
      const result = await verifyMagicLinkToken(sessionToken);
      expect(result).toBeNull();
    });
  });

  describe("session tokens", () => {
    it("round-trips a valid session token", async () => {
      const token = await signSessionToken("brother.one@example.com");
      const payload = await verifySessionToken(token);
      expect(payload?.email).toBe("brother.one@example.com");
    });

    it("returns null for undefined input (no cookie present)", async () => {
      expect(await verifySessionToken(undefined)).toBeNull();
    });

    it("returns null for empty string input", async () => {
      expect(await verifySessionToken("")).toBeNull();
    });

    it("rejects a tampered session token", async () => {
      const token = await signSessionToken("brother.one@example.com");
      const tampered = token.slice(0, -4) + "xxxx";
      expect(await verifySessionToken(tampered)).toBeNull();
    });

    it("rejects a magic-link token presented as a session (audience guard)", async () => {
      const magicToken = await signMagicLinkToken("brother.one@example.com");
      const result = await verifySessionToken(magicToken);
      expect(result).toBeNull();
    });
  });
});
