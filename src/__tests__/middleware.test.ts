/**
 * Regression test for the `.mram` exclusion in the Next.js middleware
 * matcher (HYGIENE-06 / CONTEXT D-10..D-13).
 *
 * This test exists so that a future edit to src/middleware.ts config.matcher
 * that accidentally drops `.mram` from the extension alternation fails CI
 * before it ships. Encrypted ritual binaries are served from /public/ and
 * the middleware must not touch them (no auth, no CORS, no redirect).
 *
 * Uppercase .MRAM is out-of-scope — app URLs are lowercase by convention
 * and the matcher's extension alternation is case-sensitive by design.
 * See .planning/phases/01-pre-invite-hygiene/01-RESEARCH.md Pitfall 2 and
 * CONTEXT D-12 (updated 2026-04-20).
 */
import { describe, it, expect } from "vitest";
import { config } from "../middleware";

describe("middleware matcher — .mram exclusion (HYGIENE-06)", () => {
  // The matcher is a single path-to-regexp string that uses only JS-RegExp-
  // compatible features (character classes, alternation, negative lookahead,
  // escaped dots). Next anchors matcher patterns implicitly at start/end;
  // we replicate that with ^/$ anchors for equivalent behavior in Node.
  const matcherString = config.matcher[0];
  const matcher = new RegExp("^" + matcherString + "$");

  it("does NOT match /foo.mram (flat)", () => {
    expect(matcher.test("/foo.mram")).toBe(false);
  });

  it("does NOT match /deeply/nested/path/ritual.mram (nested)", () => {
    expect(matcher.test("/deeply/nested/path/ritual.mram")).toBe(false);
  });

  it("does NOT match /ea-degree.mram (hyphenated)", () => {
    expect(matcher.test("/ea-degree.mram")).toBe(false);
  });

  it("does NOT match /hyphen-name.mram (hyphenated second case)", () => {
    expect(matcher.test("/hyphen-name.mram")).toBe(false);
  });

  // Sanity: the matcher MUST still match regular app paths, otherwise the
  // negative assertions above are vacuous.
  it("still matches regular app paths (/practice, /api/tts/gemini)", () => {
    expect(matcher.test("/practice")).toBe(true);
    expect(matcher.test("/api/tts/gemini")).toBe(true);
  });

  // Bounds: other listed static extensions remain excluded.
  it("still excludes other listed static extensions", () => {
    expect(matcher.test("/logo.png")).toBe(false);
    expect(matcher.test("/manifest.webmanifest")).toBe(false);
  });
});
