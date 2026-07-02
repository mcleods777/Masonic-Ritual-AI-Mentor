import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  hashFile,
  getChangedRituals,
  recordBaked,
} from "../lib/cache-manifest";

// Fixture layout mirrors the real convention:
//   <ritualsDir>/_bake-cache/_manifest.json   (manifestPath)
//   <ritualsDir>/{slug}-dialogue.md
//   <ritualsDir>/{slug}-dialogue-cipher.md
// getChangedRituals/recordBaked derive ritualsDir from
// dirname(dirname(manifestPath)) — no git invocation anywhere.
describe("cache-manifest", () => {
  let ritualsDir: string;
  let manifestPath: string;

  beforeEach(() => {
    ritualsDir = fs.mkdtempSync(path.join(os.tmpdir(), "cache-manifest-test-"));
    manifestPath = path.join(ritualsDir, "_bake-cache", "_manifest.json");
  });

  afterEach(() => {
    fs.rmSync(ritualsDir, { recursive: true, force: true });
  });

  function writeDialoguePair(slug: string, plainText: string, cipherText: string): void {
    fs.writeFileSync(path.join(ritualsDir, `${slug}-dialogue.md`), plainText);
    fs.writeFileSync(
      path.join(ritualsDir, `${slug}-dialogue-cipher.md`),
      cipherText,
    );
  }

  describe("hashFile", () => {
    it("returns a 64-char hex sha256 digest of file bytes", () => {
      const filePath = path.join(ritualsDir, "sample.txt");
      fs.writeFileSync(filePath, "hello world");
      const hash = hashFile(filePath);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("is deterministic for identical bytes", () => {
      const p1 = path.join(ritualsDir, "a.txt");
      const p2 = path.join(ritualsDir, "b.txt");
      fs.writeFileSync(p1, "same content");
      fs.writeFileSync(p2, "same content");
      expect(hashFile(p1)).toBe(hashFile(p2));
    });

    it("differs when bytes differ", () => {
      const p1 = path.join(ritualsDir, "a.txt");
      const p2 = path.join(ritualsDir, "b.txt");
      fs.writeFileSync(p1, "content one");
      fs.writeFileSync(p2, "content two");
      expect(hashFile(p1)).not.toBe(hashFile(p2));
    });
  });

  describe("getChangedRituals", () => {
    it("treats every slug as changed against a fresh (nonexistent) manifest", () => {
      writeDialoguePair("ea-opening", "plain one", "cipher one");
      writeDialoguePair("ea-closing", "plain two", "cipher two");
      const changed = getChangedRituals(manifestPath, ["ea-opening", "ea-closing"]);
      expect(changed.sort()).toEqual(["ea-closing", "ea-opening"]);
    });

    it("excludes a slug recorded by recordBaked with no subsequent edit", () => {
      writeDialoguePair("ea-opening", "plain one", "cipher one");
      recordBaked(manifestPath, "ea-opening");
      const changed = getChangedRituals(manifestPath, ["ea-opening"]);
      expect(changed).toEqual([]);
    });

    it("includes only the slug whose plain file bytes were edited after recording", () => {
      writeDialoguePair("ea-opening", "plain one", "cipher one");
      writeDialoguePair("ea-closing", "plain two", "cipher two");
      recordBaked(manifestPath, "ea-opening");
      recordBaked(manifestPath, "ea-closing");

      // Edit only ea-opening's plain file.
      fs.writeFileSync(
        path.join(ritualsDir, "ea-opening-dialogue.md"),
        "plain one EDITED",
      );

      const changed = getChangedRituals(manifestPath, ["ea-opening", "ea-closing"]);
      expect(changed).toEqual(["ea-opening"]);
    });

    it("includes a slug whose cipher file bytes were edited (plain untouched)", () => {
      writeDialoguePair("ea-opening", "plain one", "cipher one");
      recordBaked(manifestPath, "ea-opening");

      fs.writeFileSync(
        path.join(ritualsDir, "ea-opening-dialogue-cipher.md"),
        "cipher one EDITED",
      );

      const changed = getChangedRituals(manifestPath, ["ea-opening"]);
      expect(changed).toEqual(["ea-opening"]);
    });

    it("treats a never-recorded slug as changed even when others are unchanged", () => {
      writeDialoguePair("ea-opening", "plain one", "cipher one");
      writeDialoguePair("ea-closing", "plain two", "cipher two");
      recordBaked(manifestPath, "ea-opening");
      // ea-closing was never recordBaked.
      const changed = getChangedRituals(manifestPath, ["ea-opening", "ea-closing"]);
      expect(changed).toEqual(["ea-closing"]);
    });
  });

  describe("recordBaked", () => {
    it("writes the manifest atomically (no leftover tmp file)", () => {
      writeDialoguePair("ea-opening", "plain one", "cipher one");
      recordBaked(manifestPath, "ea-opening");
      const cacheDir = path.dirname(manifestPath);
      const tmpFiles = fs
        .readdirSync(cacheDir)
        .filter((f) => f.endsWith(".tmp"));
      expect(tmpFiles).toEqual([]);
      expect(fs.existsSync(manifestPath)).toBe(true);
    });

    it("stamps a bakedAt ISO timestamp", () => {
      writeDialoguePair("ea-opening", "plain one", "cipher one");
      recordBaked(manifestPath, "ea-opening");
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      expect(manifest["ea-opening"].bakedAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
    });

    it("re-hashes files at record time rather than trusting stale hashes", () => {
      writeDialoguePair("ea-opening", "plain v1", "cipher v1");
      recordBaked(manifestPath, "ea-opening");
      const manifestV1 = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

      fs.writeFileSync(
        path.join(ritualsDir, "ea-opening-dialogue.md"),
        "plain v2",
      );
      recordBaked(manifestPath, "ea-opening");
      const manifestV2 = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

      expect(manifestV2["ea-opening"].plainHash).not.toBe(
        manifestV1["ea-opening"].plainHash,
      );
    });

    it("upserts without clobbering other slugs' entries", () => {
      writeDialoguePair("ea-opening", "plain one", "cipher one");
      writeDialoguePair("ea-closing", "plain two", "cipher two");
      recordBaked(manifestPath, "ea-opening");
      recordBaked(manifestPath, "ea-closing");
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      expect(Object.keys(manifest).sort()).toEqual(["ea-closing", "ea-opening"]);
    });
  });

  describe("no git invocation", () => {
    it("works correctly outside of any git repository", () => {
      // ritualsDir (tmpdir) is not a git repo — if this module shelled
      // out to git, these calls would throw or behave unexpectedly.
      writeDialoguePair("ea-opening", "plain one", "cipher one");
      expect(() => getChangedRituals(manifestPath, ["ea-opening"])).not.toThrow();
      expect(() => recordBaked(manifestPath, "ea-opening")).not.toThrow();
    });
  });
});
