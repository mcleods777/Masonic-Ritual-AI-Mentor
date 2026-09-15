import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { encryptMRAM, type MRAMDocument } from "../../src/lib/mram-format";
import { verifyMramDirectory } from "../lib/content-release";

function opusFixtureBase64(): string {
  const page = Buffer.alloc(47);
  page.write("OggS", 0, "ascii");
  page[4] = 0;
  page[26] = 1;
  page[27] = 19;
  page.write("OpusHead", 28, "ascii");
  page[36] = 1;
  return page.toString("base64");
}

const OPUS_AUDIO = opusFixtureBase64();

function documentWith(privateText: string): MRAMDocument {
  return {
    format: "MRAM",
    version: 3,
    metadata: {
      jurisdiction: "PRIVATE JURISDICTION",
      degree: "PRIVATE DEGREE",
      ceremony: "PRIVATE CEREMONY",
      checksum: "",
      voiceCast: { WM: "TestVoice" },
      audioFormat: "opus-32k-mono",
    },
    roles: { WM: "PRIVATE ROLE" },
    sections: [{ id: "section", title: "PRIVATE SECTION" }],
    lines: [
      {
        id: 1,
        section: "section",
        role: "WM",
        gavels: 0,
        action: null,
        cipher: "PRIVATE CIPHER",
        plain: privateText,
        audio: OPUS_AUDIO,
      },
    ],
  };
}

describe("verifyMramDirectory", () => {
  it("aggregates all direct MRAM files into a sanitized release report", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "content-release-"));
    try {
      for (const [name, text] of [
        ["alpha.mram", "PRIVATE ALPHA TEXT"],
        ["beta.mram", "PRIVATE BETA TEXT"],
      ] as const) {
        const encrypted = await encryptMRAM(documentWith(text), "fixture-passphrase");
        fs.writeFileSync(path.join(directory, name), Buffer.from(encrypted));
      }

      const report = verifyMramDirectory(directory, "fixture-passphrase");

      expect(report).toEqual({
        schemaVersion: 1,
        valid: true,
        fileCount: 2,
        passedFileCount: 2,
        failedFileCount: 0,
        lineCount: 2,
        spokenLineCount: 2,
        embeddedAudioCount: 2,
        issueCounts: {},
      });
      const serialized = JSON.stringify(report);
      expect(serialized).not.toContain("PRIVATE");
      expect(serialized).not.toContain("alpha");
      expect(serialized).not.toContain("beta");
      expect(serialized).not.toContain("TestVoice");
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("refuses to follow a symlinked rituals directory", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "content-release-link-"));
    try {
      const target = path.join(root, "outside");
      const linkedDirectory = path.join(root, "rituals");
      fs.mkdirSync(target);
      const encrypted = await encryptMRAM(
        documentWith("PRIVATE OUTSIDE TEXT"),
        "fixture-passphrase",
      );
      fs.writeFileSync(path.join(target, "outside.mram"), Buffer.from(encrypted));
      fs.symlinkSync(target, linkedDirectory, "dir");

      const report = verifyMramDirectory(linkedDirectory, "fixture-passphrase");

      expect(report.valid).toBe(false);
      expect(report.fileCount).toBe(0);
      expect(report.issueCounts).toEqual({ "unsafe-rituals-directory": 1 });
      expect(JSON.stringify(report)).not.toContain("outside");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails the whole release when any MRAM lacks required audio", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "content-release-fail-"));
    try {
      const valid = documentWith("PRIVATE VALID TEXT");
      const invalid = documentWith("PRIVATE INVALID TEXT");
      delete invalid.lines[0].audio;
      fs.writeFileSync(
        path.join(directory, "valid.mram"),
        Buffer.from(await encryptMRAM(valid, "fixture-passphrase")),
      );
      fs.writeFileSync(
        path.join(directory, "invalid.mram"),
        Buffer.from(await encryptMRAM(invalid, "fixture-passphrase")),
      );

      const report = verifyMramDirectory(directory, "fixture-passphrase");

      expect(report.valid).toBe(false);
      expect(report.fileCount).toBe(2);
      expect(report.passedFileCount).toBe(1);
      expect(report.failedFileCount).toBe(1);
      expect(report.issueCounts).toEqual({ "missing-embedded-audio": 1 });
      expect(JSON.stringify(report)).not.toContain("PRIVATE");
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("fails closed when no MRAM files are present", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "content-release-empty-"));
    try {
      const report = verifyMramDirectory(directory, "fixture-passphrase");

      expect(report.valid).toBe(false);
      expect(report.fileCount).toBe(0);
      expect(report.issueCounts).toEqual({ "no-mram-files": 1 });
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("counts but never follows a symlinked MRAM entry", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "content-release-file-link-"));
    try {
      const rituals = path.join(root, "rituals");
      fs.mkdirSync(rituals);
      const encrypted = await encryptMRAM(
        documentWith("PRIVATE SYMLINK TARGET"),
        "fixture-passphrase",
      );
      const target = path.join(root, "target.mram");
      fs.writeFileSync(target, Buffer.from(encrypted));
      fs.symlinkSync(target, path.join(rituals, "linked.mram"));

      const report = verifyMramDirectory(rituals, "fixture-passphrase");

      expect(report.valid).toBe(false);
      expect(report.fileCount).toBe(1);
      expect(report.failedFileCount).toBe(1);
      expect(report.issueCounts).toEqual({ "unreadable-mram-file": 1 });
      expect(JSON.stringify(report)).not.toContain("linked");
      expect(JSON.stringify(report)).not.toContain("target");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("runs the aggregate release CLI with one sanitized JSON line", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "content-release-cli-"));
    try {
      const rituals = path.join(root, "rituals");
      fs.mkdirSync(rituals);
      const encrypted = await encryptMRAM(
        documentWith("PRIVATE CLI TEXT"),
        "fixture-passphrase",
      );
      fs.writeFileSync(path.join(rituals, "private-name.mram"), Buffer.from(encrypted));

      const repositoryRoot = path.resolve(__dirname, "..", "..");
      const result = spawnSync(
        "/usr/bin/npx",
        ["--yes", "tsx", path.join(repositoryRoot, "scripts", "verify-content-release.ts"), "--json"],
        {
          cwd: root,
          encoding: "utf8",
          env: {
            ...process.env,
            MRAM_PASSPHRASE: "fixture-passphrase",
            npm_config_script_shell: "/bin/sh",
          },
        },
      );

      expect(result.status).toBe(0);
      const report = JSON.parse(result.stdout);
      expect(report.valid).toBe(true);
      expect(report.fileCount).toBe(1);
      expect(result.stdout.trim().split("\n")).toHaveLength(1);
      expect(result.stdout).not.toContain("PRIVATE");
      expect(result.stdout).not.toContain("private-name");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
