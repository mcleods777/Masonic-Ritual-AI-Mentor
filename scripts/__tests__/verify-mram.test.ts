import { describe, expect, it } from "vitest";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import type { MRAMDocument } from "../../src/lib/mram-format";
import { encryptMRAM } from "../../src/lib/mram-format";
import { verifyMramBuffer, verifyMramDocument } from "../lib/mram-verifier";

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

function encryptRawDocument(document: MRAMDocument, passphrase: string): Buffer {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(passphrase, salt, 310_000, 32, "sha256");
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(document), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([
    Buffer.from("MRAM", "ascii"),
    Buffer.from([3]),
    salt,
    iv,
    ciphertext,
    cipher.getAuthTag(),
  ]);
}

function validDocument(): MRAMDocument {
  return {
    format: "MRAM",
    version: 3,
    metadata: {
      jurisdiction: "Private Test Jurisdiction",
      degree: "Private Test Degree",
      ceremony: "Private Test Ceremony",
      checksum: "not-used-by-document-validator",
      voiceCast: { WM: "TestVoice" },
      audioFormat: "opus-32k-mono",
    },
    roles: { WM: "Private Role Name" },
    sections: [{ id: "opening", title: "Private Section Title" }],
    lines: [
      {
        id: 1,
        section: "opening",
        role: "WM",
        gavels: 0,
        action: null,
        cipher: "PRIVATE CIPHER",
        plain: "PRIVATE RITUAL TEXT",
        audio: OPUS_AUDIO,
      },
      {
        id: 2,
        section: "opening",
        role: "WM",
        gavels: 1,
        action: "PRIVATE ACTION",
        cipher: "",
        plain: "",
      },
    ],
  };
}

describe("verifyMramDocument", () => {
  it("accepts a fully baked v3 document and returns only sanitized counts", () => {
    const document = validDocument();

    const report = verifyMramDocument(document);

    expect(report).toEqual({
      schemaVersion: 1,
      valid: true,
      formatVersion: 3,
      lineCount: 2,
      spokenLineCount: 1,
      embeddedAudioCount: 1,
      issueCounts: {},
    });

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("PRIVATE");
    expect(serialized).not.toContain("TestVoice");
    expect(serialized).not.toContain("WM");
    expect(serialized).not.toContain("not-used-by-document-validator");
  });

  it("rejects spoken lines without embedded audio without identifying the line", () => {
    const document = validDocument();
    delete document.lines[0].audio;

    const report = verifyMramDocument(document);

    expect(report.valid).toBe(false);
    expect(report.embeddedAudioCount).toBe(0);
    expect(report.issueCounts).toEqual({ "missing-embedded-audio": 1 });
    expect(JSON.stringify(report)).not.toContain("PRIVATE");
    expect(JSON.stringify(report)).not.toContain("WM");
  });

  it("rejects a document with no spoken lines", () => {
    const document = validDocument();
    document.lines = [];

    const report = verifyMramDocument(document);

    expect(report.valid).toBe(false);
    expect(report.issueCounts).toEqual({ "empty-document": 1 });
  });

  it("rejects non-Opus bytes presented as embedded audio", () => {
    const document = validDocument();
    document.lines[0].audio = Buffer.from("not opus audio").toString("base64");

    const report = verifyMramDocument(document);

    expect(report.valid).toBe(false);
    expect(report.embeddedAudioCount).toBe(0);
    expect(report.issueCounts).toEqual({ "invalid-embedded-audio": 1 });
  });

  it("rejects an Ogg-looking blob whose Opus marker is not a valid first packet", () => {
    const document = validDocument();
    document.lines[0].audio = Buffer.from(
      "OggS\0arbitrary bytes before OpusHead",
    ).toString("base64");

    const report = verifyMramDocument(document);

    expect(report.valid).toBe(false);
    expect(report.issueCounts).toEqual({ "invalid-embedded-audio": 1 });
  });

  it.each([
    {
      name: "a non-v3 document",
      mutate: (document: MRAMDocument) => {
        document.version = 2;
      },
      issue: "unsupported-format-version",
    },
    {
      name: "missing audio format metadata",
      mutate: (document: MRAMDocument) => {
        delete document.metadata.audioFormat;
      },
      issue: "missing-audio-format",
    },
    {
      name: "an unrecognized audio format",
      mutate: (document: MRAMDocument) => {
        document.metadata.audioFormat = "mp3-64k-mono" as "opus-32k-mono";
      },
      issue: "invalid-audio-format",
    },
    {
      name: "missing voice-cast metadata",
      mutate: (document: MRAMDocument) => {
        delete document.metadata.voiceCast;
      },
      issue: "missing-voice-cast",
    },
    {
      name: "a spoken role without a pinned voice",
      mutate: (document: MRAMDocument) => {
        document.metadata.voiceCast = {};
      },
      issue: "missing-role-voice",
    },
  ])("rejects $name", ({ mutate, issue }) => {
    const document = validDocument();
    mutate(document);

    const report = verifyMramDocument(document);

    expect(report.valid).toBe(false);
    expect(report.issueCounts).toEqual({ [issue]: 1 });
  });

  it("decrypts and verifies a generated v3 binary without leaking payload values", async () => {
    const encrypted = await encryptMRAM(validDocument(), "fixture-passphrase");

    const report = verifyMramBuffer(Buffer.from(encrypted), "fixture-passphrase");

    expect(report.valid).toBe(true);
    expect(report.formatVersion).toBe(3);
    expect(report.spokenLineCount).toBe(1);
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("PRIVATE");
    expect(serialized).not.toContain("fixture-passphrase");
  });

  it("rejects an authenticated payload with the wrong format marker", async () => {
    const document = validDocument();
    document.format = "NOT-MRAM" as "MRAM";
    const encrypted = await encryptMRAM(document, "fixture-passphrase");

    expect(() =>
      verifyMramBuffer(Buffer.from(encrypted), "fixture-passphrase"),
    ).toThrow("Invalid MRAM payload");
  });

  it("reports a checksum mismatch without returning either checksum", () => {
    const document = validDocument();
    document.metadata.checksum = "0".repeat(64);
    const encrypted = encryptRawDocument(document, "fixture-passphrase");

    const report = verifyMramBuffer(encrypted, "fixture-passphrase");

    expect(report.valid).toBe(false);
    expect(report.issueCounts).toEqual({ "checksum-mismatch": 1 });
    expect(JSON.stringify(report)).not.toContain("0".repeat(64));
  });

  it("rejects a non-v3 binary header even when the authenticated payload claims v3", async () => {
    const encrypted = Buffer.from(
      await encryptMRAM(validDocument(), "fixture-passphrase"),
    );
    encrypted[4] = 2;

    const report = verifyMramBuffer(encrypted, "fixture-passphrase");

    expect(report.valid).toBe(false);
    expect(report.issueCounts).toEqual({ "unsupported-format-version": 1 });
  });

  it("prints a single sanitized JSON report from the CLI", async () => {
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "verify-mram-"));
    try {
      const fixturePath = path.join(tempDirectory, "private-fixture.mram");
      const encrypted = await encryptMRAM(validDocument(), "fixture-passphrase");
      fs.writeFileSync(fixturePath, Buffer.from(encrypted));

      const result = spawnSync(
        "npx",
        ["tsx", "scripts/verify-mram.ts", "--json", fixturePath],
        {
          cwd: path.resolve(__dirname, "..", ".."),
          encoding: "utf8",
          env: { ...process.env, MRAM_PASSPHRASE: "fixture-passphrase" },
        },
      );

      expect(result.status).toBe(0);
      const report = JSON.parse(result.stdout);
      expect(report.valid).toBe(true);
      expect(report.spokenLineCount).toBe(1);
      expect(result.stdout).not.toContain("PRIVATE");
      expect(result.stdout).not.toContain("private-fixture");
      expect(result.stdout.trim().split("\n")).toHaveLength(1);
    } finally {
      fs.rmSync(tempDirectory, { recursive: true, force: true });
    }
  });
});
