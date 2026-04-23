// @vitest-environment node
/**
 * Tests for src/lib/hash-user.ts (SAFETY-04 D-06c + SAFETY-05 D-11).
 *
 * Two helpers, one source of truth:
 *
 *   - `hashedUserFromEmail(email)` — sha256(email.trim().toLowerCase())
 *     .slice(0, 16). Used by the client-token mint route (Plan 05) and
 *     by scripts/lookup-hashed-user.ts (this plan) so both sides of the
 *     hash agree.
 *
 *   - `findEmailByHashedUser(allowlistCsv, targetHash)` — scans a
 *     comma-separated email list, returns the lowercased email whose
 *     hash matches the target (case-insensitive on the hash). Backs
 *     the reverse-lookup CLI.
 *
 * Drift between hashedUserFromEmail() and the lookup CLI breaks the
 * SAFETY-04 operator-runbook promise, so these tests are the
 * regression guard.
 */

import { describe, it, expect } from "vitest";
import { hashedUserFromEmail, findEmailByHashedUser } from "../hash-user";

describe("hashedUserFromEmail", () => {
  it("is case-insensitive and trims whitespace", () => {
    expect(hashedUserFromEmail("a@Example.com")).toBe(
      hashedUserFromEmail("A@example.com"),
    );
    expect(hashedUserFromEmail("  a@example.com  ")).toBe(
      hashedUserFromEmail("a@example.com"),
    );
  });

  it("returns 16 lowercase hex characters", () => {
    const h = hashedUserFromEmail("x@y.com");
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(h.length).toBe(16);
  });
});

describe("findEmailByHashedUser", () => {
  it("finds the email whose hash matches the target", () => {
    const target = hashedUserFromEmail("b@y.com");
    expect(findEmailByHashedUser("a@x.com,b@y.com", target)).toBe("b@y.com");
  });

  it("returns null when no entry matches the target hash", () => {
    expect(findEmailByHashedUser("a@x.com,b@y.com", "ffffffffffffffff")).toBeNull();
  });

  it("ignores whitespace and blank entries in the CSV", () => {
    const target = hashedUserFromEmail("c@z.com");
    expect(
      findEmailByHashedUser(" a@x.com , c@z.com ,, , ", target),
    ).toBe("c@z.com");
  });

  it("treats the target hash as case-insensitive", () => {
    const target = hashedUserFromEmail("d@w.com").toUpperCase();
    expect(findEmailByHashedUser("d@w.com", target)).toBe("d@w.com");
  });

  it("returns the lowercased email when a mixed-case entry matches", () => {
    const target = hashedUserFromEmail("Mixed.Case@Example.com");
    expect(findEmailByHashedUser("Mixed.Case@Example.com", target)).toBe(
      "mixed.case@example.com",
    );
  });
});
