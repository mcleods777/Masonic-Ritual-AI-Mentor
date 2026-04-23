// @vitest-environment node
/**
 * Wave 0 scaffold for D-15 assertDevOnly/isDev.
 * Implemented by Plan 03 (03-03).
 */
import { describe, it } from "vitest";

describe("dev-guard (D-15)", () => {
  it.todo("isDev returns true in non-production (Plan 03)");
  it.todo("isDev returns false in production");
  it.todo("assertDevOnly throws in production with DEV-GUARD message");
  it.todo("assertDevOnly does not throw in development");
});
