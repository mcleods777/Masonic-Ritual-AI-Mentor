// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { isDev, assertDevOnly } from "../dev-guard";

describe("dev-guard (D-15)", () => {
  const savedEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = savedEnv;
  });

  describe("isDev()", () => {
    it("returns true in development", () => {
      process.env.NODE_ENV = "development";
      expect(isDev()).toBe(true);
    });
    it("returns true in test", () => {
      process.env.NODE_ENV = "test";
      expect(isDev()).toBe(true);
    });
    it("returns true when NODE_ENV is unset", () => {
      delete process.env.NODE_ENV;
      expect(isDev()).toBe(true);
    });
    it("returns false in production", () => {
      process.env.NODE_ENV = "production";
      expect(isDev()).toBe(false);
    });
  });

  describe("assertDevOnly()", () => {
    it("throws Error with [DEV-GUARD] prefix in production", () => {
      process.env.NODE_ENV = "production";
      expect(() => assertDevOnly()).toThrow(/DEV-GUARD/);
      expect(() => assertDevOnly()).toThrow(/NODE_ENV=production/);
    });
    it("does not throw in development", () => {
      process.env.NODE_ENV = "development";
      expect(() => assertDevOnly()).not.toThrow();
    });
    it("does not throw in test", () => {
      process.env.NODE_ENV = "test";
      expect(() => assertDevOnly()).not.toThrow();
    });
    it("does not throw when NODE_ENV is unset", () => {
      delete process.env.NODE_ENV;
      expect(() => assertDevOnly()).not.toThrow();
    });
  });
});
