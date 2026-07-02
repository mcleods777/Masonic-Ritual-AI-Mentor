import { describe, it, expect, afterEach } from "vitest";
import { isDev, assertDevOnly } from "../dev-guard";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

function setNodeEnv(value: string | undefined) {
  if (value === undefined) {
    delete (process.env as Record<string, string | undefined>).NODE_ENV;
  } else {
    process.env.NODE_ENV = value;
  }
}

afterEach(() => {
  setNodeEnv(ORIGINAL_NODE_ENV);
});

describe("isDev", () => {
  it("returns true when NODE_ENV is undefined", () => {
    setNodeEnv(undefined);
    expect(isDev()).toBe(true);
  });

  it("returns true when NODE_ENV is any value other than 'production'", () => {
    setNodeEnv("development");
    expect(isDev()).toBe(true);
    setNodeEnv("test");
    expect(isDev()).toBe(true);
  });

  it("returns false when NODE_ENV === 'production'", () => {
    setNodeEnv("production");
    expect(isDev()).toBe(false);
  });
});

describe("assertDevOnly", () => {
  it("throws an Error whose message contains '[DEV-GUARD]' when NODE_ENV === 'production'", () => {
    setNodeEnv("production");
    expect(() => assertDevOnly()).toThrow(/\[DEV-GUARD\]/);
  });

  it("does not throw when NODE_ENV !== 'production'", () => {
    setNodeEnv("development");
    expect(() => assertDevOnly()).not.toThrow();
    setNodeEnv(undefined);
    expect(() => assertDevOnly()).not.toThrow();
  });
});
