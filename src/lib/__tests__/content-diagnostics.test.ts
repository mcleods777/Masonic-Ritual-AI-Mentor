// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as crypto from "node:crypto";
import {
  buildContentDiagnostics,
  resolveContainedRitualsDirectory,
} from "../server/content-diagnostics";

const cleanup: string[] = [];

afterEach(() => {
  for (const dir of cleanup.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

describe("buildContentDiagnostics", () => {
  it("returns sanitized availability and bake-currentness without content, hashes, or paths", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "content-project-"));
    const ritualsDir = path.join(projectRoot, "rituals");
    const cacheDir = path.join(ritualsDir, "_bake-cache");
    cleanup.push(projectRoot);
    fs.mkdirSync(cacheDir, { recursive: true });

    const plain = "SECRET_PLAIN_MARKER";
    const cipher = "SECRET_CIPHER_MARKER";
    fs.writeFileSync(path.join(ritualsDir, "ea-opening-dialogue.md"), plain);
    fs.writeFileSync(path.join(ritualsDir, "ea-opening-dialogue-cipher.md"), cipher);
    fs.writeFileSync(path.join(ritualsDir, "ea-opening.mram"), "MRAM");
    fs.writeFileSync(
      path.join(cacheDir, "_manifest.json"),
      JSON.stringify({
        "ea-opening": {
          slug: "ea-opening",
          plainHash: sha256(plain),
          cipherHash: sha256(cipher),
          bakedAt: "2026-09-01T12:00:00.000Z",
        },
      }),
    );

    const result = buildContentDiagnostics(projectRoot);
    expect(result).toEqual({
      schemaVersion: 1,
      manifestStatus: "valid",
      manifestErrors: [],
      rituals: [
        {
          slug: "ea-opening",
          assets: {
            plain: true,
            cipher: true,
            mram: true,
            voiceCast: false,
            styles: false,
          },
          bake: {
            recorded: true,
            bakedAt: "2026-09-01T12:00:00.000Z",
            sourcesCurrent: true,
          },
        },
      ],
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("SECRET_PLAIN_MARKER");
    expect(serialized).not.toContain("SECRET_CIPHER_MARKER");
    expect(serialized).not.toContain(sha256(plain));
    expect(serialized).not.toContain(projectRoot);
  });

  it("does not follow ritual asset symlinks outside the contained directory", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "content-project-"));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "content-outside-"));
    const ritualsDir = path.join(projectRoot, "rituals");
    const cacheDir = path.join(ritualsDir, "_bake-cache");
    cleanup.push(projectRoot, outside);
    fs.mkdirSync(cacheDir, { recursive: true });

    const outsidePlain = path.join(outside, "secret.md");
    const cipher = "SAFE_CIPHER_FIXTURE";
    fs.writeFileSync(outsidePlain, "OUTSIDE_SECRET_CONTENT");
    fs.symlinkSync(outsidePlain, path.join(ritualsDir, "ea-opening-dialogue.md"));
    fs.writeFileSync(path.join(ritualsDir, "ea-opening-dialogue-cipher.md"), cipher);
    fs.writeFileSync(
      path.join(cacheDir, "_manifest.json"),
      JSON.stringify({
        "ea-opening": {
          slug: "ea-opening",
          plainHash: sha256("OUTSIDE_SECRET_CONTENT"),
          cipherHash: sha256(cipher),
          bakedAt: "2026-09-01T12:00:00.000Z",
        },
      }),
    );

    const result = buildContentDiagnostics(projectRoot);
    expect(result.rituals[0].assets.plain).toBe(false);
    expect(result.rituals[0].bake.sourcesCurrent).toBe(false);
    expect(JSON.stringify(result)).not.toContain("OUTSIDE_SECRET_CONTENT");
    expect(JSON.stringify(result)).not.toContain(outside);
  });

  it("rejects manifest entries containing unexpected raw-content fields", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "content-project-"));
    const cacheDir = path.join(projectRoot, "rituals", "_bake-cache");
    cleanup.push(projectRoot);
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(
      path.join(cacheDir, "_manifest.json"),
      JSON.stringify({
        "ea-opening": {
          slug: "ea-opening",
          plainHash: "a".repeat(64),
          cipherHash: "b".repeat(64),
          bakedAt: "2026-09-01T12:00:00.000Z",
          plainText: "SECRET_MUST_NOT_BE_ACCEPTED",
        },
      }),
    );

    const result = buildContentDiagnostics(projectRoot);
    expect(result.manifestStatus).toBe("invalid");
    expect(result.manifestErrors).toEqual(["invalid-entry"]);
    expect(result.rituals).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("SECRET_MUST_NOT_BE_ACCEPTED");
  });
});

describe("resolveContainedRitualsDirectory", () => {
  it("rejects traversal and symlink escapes outside the project root", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "content-root-"));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "content-outside-"));
    cleanup.push(projectRoot, outside);
    fs.symlinkSync(outside, path.join(projectRoot, "rituals-link"), "dir");

    expect(() => resolveContainedRitualsDirectory(projectRoot, "../outside")).toThrow(
      /outside project root/i,
    );
    expect(() => resolveContainedRitualsDirectory(projectRoot, outside)).toThrow(
      /outside project root/i,
    );
    expect(() =>
      resolveContainedRitualsDirectory(projectRoot, "rituals-link"),
    ).toThrow(/outside project root/i);
  });
});
