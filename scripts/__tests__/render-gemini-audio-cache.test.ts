// @vitest-environment node
/**
 * Tests for AUTHOR-01 cache key v3 + modelId (D-02) and legacy-cache
 * migration (D-01). Covers scripts/render-gemini-audio.ts.
 *
 * Scope: pure-logic computeCacheKey tests + migration helper using isolated
 * tmpdirs. The migration helper accepts (cacheDir, oldDir = OLD_CACHE_DIR)
 * so tests pass isolated tmp dirs for both NEW and OLD — never touches the
 * developer's real ~/.cache/masonic-mram-audio/. The load-bearing COPY test
 * is in scope because of that second parameter.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  computeCacheKey,
  migrateLegacyCacheIfNeeded,
  __resetMigrationFlagForTests,
} from "../render-gemini-audio";

// Helper: fresh tmp dir per test, cleaned in afterEach.
let tmpRoot: string;
beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bake-cache-test-"));
  __resetMigrationFlagForTests(); // allow per-test migrations
});
afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    // swallow — tmp cleanup best-effort
  }
});

describe("computeCacheKey v3 + modelId (AUTHOR-01 D-02)", () => {
  it("produces a 64-hex-char sha256 string", () => {
    const key = computeCacheKey(
      "hello",
      undefined,
      "Charon",
      "gemini-3.1-flash-tts-preview",
      "",
    );
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic (same inputs → same key)", () => {
    const a = computeCacheKey(
      "hello",
      undefined,
      "Charon",
      "gemini-3.1-flash-tts-preview",
      "",
    );
    const b = computeCacheKey(
      "hello",
      undefined,
      "Charon",
      "gemini-3.1-flash-tts-preview",
      "",
    );
    expect(a).toBe(b);
  });

  it("changes when modelId changes (D-02 invariant)", () => {
    const k1 = computeCacheKey(
      "hello",
      undefined,
      "Charon",
      "gemini-3.1-flash-tts-preview",
      "",
    );
    const k2 = computeCacheKey(
      "hello",
      undefined,
      "Charon",
      "gemini-2.5-pro-preview-tts",
      "",
    );
    expect(k1).not.toBe(k2);
  });

  it("changes when text changes", () => {
    const k1 = computeCacheKey(
      "hello",
      undefined,
      "Charon",
      "gemini-3.1-flash-tts-preview",
      "",
    );
    const k2 = computeCacheKey(
      "world",
      undefined,
      "Charon",
      "gemini-3.1-flash-tts-preview",
      "",
    );
    expect(k1).not.toBe(k2);
  });

  it("changes when voice changes", () => {
    const k1 = computeCacheKey(
      "hello",
      undefined,
      "Charon",
      "gemini-3.1-flash-tts-preview",
      "",
    );
    const k2 = computeCacheKey(
      "hello",
      undefined,
      "Alnilam",
      "gemini-3.1-flash-tts-preview",
      "",
    );
    expect(k1).not.toBe(k2);
  });
});

describe("CACHE_KEY_VERSION v3 regression guard (AUTHOR-01 D-02)", () => {
  it("render-gemini-audio.ts declares CACHE_KEY_VERSION = \"v3\"", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../render-gemini-audio.ts"),
      "utf8",
    );
    expect(src).toMatch(/CACHE_KEY_VERSION = "v3"/);
    // Hard-guard against reverting to v2.
    expect(src).not.toMatch(/CACHE_KEY_VERSION = "v2";/);
  });
});

describe("migrateLegacyCacheIfNeeded (AUTHOR-01 D-01)", () => {
  it("skips migration when new cache already has a .opus entry (one-shot)", async () => {
    // Seed new cache with an existing .opus; migration should no-op.
    const seededKey = "a".repeat(64);
    fs.writeFileSync(
      path.join(tmpRoot, `${seededKey}.opus`),
      Buffer.from("seeded"),
    );
    const oldTmp = fs.mkdtempSync(path.join(os.tmpdir(), "bake-old-"));
    try {
      // Even with an OLD populated with files, migration must skip because NEW has an entry.
      fs.writeFileSync(
        path.join(oldTmp, "b".repeat(64) + ".opus"),
        Buffer.from("leg"),
      );
      const before = fs.readdirSync(tmpRoot).sort();
      await migrateLegacyCacheIfNeeded(tmpRoot, oldTmp);
      const after = fs.readdirSync(tmpRoot).sort();
      expect(after).toEqual(before);
    } finally {
      try {
        fs.rmSync(oldTmp, { recursive: true, force: true });
      } catch {
        // swallow
      }
    }
  });

  it("COPIES .opus entries from OLD to NEW when NEW is empty and OLD has entries (load-bearing)", async () => {
    // The core AUTHOR-01 D-01 guarantee: developers with a pre-Phase-3 legacy
    // cache at ~/.cache/masonic-mram-audio/ get their entries copied (not moved)
    // into rituals/_bake-cache/ on first bake.
    const oldTmp = fs.mkdtempSync(path.join(os.tmpdir(), "bake-old-"));
    try {
      const key1 = "a".repeat(64);
      const key2 = "b".repeat(64);
      fs.writeFileSync(path.join(oldTmp, `${key1}.opus`), Buffer.from("AAA"));
      fs.writeFileSync(path.join(oldTmp, `${key2}.opus`), Buffer.from("BBB"));
      // Also put a non-.opus file to confirm filter skips it.
      fs.writeFileSync(path.join(oldTmp, "unrelated.txt"), "noise");

      expect(fs.readdirSync(tmpRoot)).toEqual([]); // NEW starts empty

      await migrateLegacyCacheIfNeeded(tmpRoot, oldTmp);

      // BOTH .opus files present in NEW.
      const newFiles = fs.readdirSync(tmpRoot).sort();
      expect(newFiles).toContain(`${key1}.opus`);
      expect(newFiles).toContain(`${key2}.opus`);
      // Byte-identical copy.
      expect(fs.readFileSync(path.join(tmpRoot, `${key1}.opus`))).toEqual(
        Buffer.from("AAA"),
      );
      expect(fs.readFileSync(path.join(tmpRoot, `${key2}.opus`))).toEqual(
        Buffer.from("BBB"),
      );
      // Filter excluded the non-opus file.
      expect(newFiles).not.toContain("unrelated.txt");
      // COPY (not move): OLD still has the files.
      expect(fs.existsSync(path.join(oldTmp, `${key1}.opus`))).toBe(true);
      expect(fs.existsSync(path.join(oldTmp, `${key2}.opus`))).toBe(true);
    } finally {
      try {
        fs.rmSync(oldTmp, { recursive: true, force: true });
      } catch {
        // swallow
      }
    }
  });

  it("no-ops silently when OLD does not exist", async () => {
    const nonexistentOld = path.join(tmpRoot, "does-not-exist");
    await expect(
      migrateLegacyCacheIfNeeded(tmpRoot, nonexistentOld),
    ).resolves.not.toThrow();
    expect(fs.readdirSync(tmpRoot)).toEqual([]); // NEW untouched
  });

  it("no-ops silently when OLD exists but is empty", async () => {
    const emptyOld = fs.mkdtempSync(path.join(os.tmpdir(), "bake-empty-old-"));
    try {
      await expect(
        migrateLegacyCacheIfNeeded(tmpRoot, emptyOld),
      ).resolves.not.toThrow();
      expect(fs.readdirSync(tmpRoot)).toEqual([]);
    } finally {
      try {
        fs.rmSync(emptyOld, { recursive: true, force: true });
      } catch {
        // swallow
      }
    }
  });

  it("creates the cache dir if missing", async () => {
    const missingDir = path.join(tmpRoot, "does-not-exist-yet");
    const emptyOld = fs.mkdtempSync(path.join(os.tmpdir(), "bake-empty-old-"));
    try {
      expect(fs.existsSync(missingDir)).toBe(false);
      await migrateLegacyCacheIfNeeded(missingDir, emptyOld);
      expect(fs.existsSync(missingDir)).toBe(true);
    } finally {
      try {
        fs.rmSync(emptyOld, { recursive: true, force: true });
      } catch {
        // swallow
      }
    }
  });

  it("is idempotent across repeated calls (module-level guard)", async () => {
    // First call runs (empty OLD → no-op); second call short-circuits on migrationRan.
    const emptyOld = fs.mkdtempSync(path.join(os.tmpdir(), "bake-empty-old-"));
    try {
      await migrateLegacyCacheIfNeeded(tmpRoot, emptyOld);
      const after1 = fs.readdirSync(tmpRoot).sort();
      await migrateLegacyCacheIfNeeded(tmpRoot, emptyOld);
      const after2 = fs.readdirSync(tmpRoot).sort();
      expect(after2).toEqual(after1);
    } finally {
      try {
        fs.rmSync(emptyOld, { recursive: true, force: true });
      } catch {
        // swallow
      }
    }
  });
});

describe("AUTHOR-03 D-12 DEFAULT_MODELS rationale comment", () => {
  it("scripts/render-gemini-audio.ts contains the D-12 rationale comment", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../render-gemini-audio.ts"),
      "utf8",
    );
    expect(src).toMatch(/AUTHOR-03 D-12/);
    // Pin first entry
    expect(src).toMatch(/gemini-3\.1-flash-tts-preview/);
  });
});
