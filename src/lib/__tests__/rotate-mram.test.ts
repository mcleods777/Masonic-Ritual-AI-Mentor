import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as nodeCrypto from "node:crypto";
import { decryptMRAM, MRAMExpiredError, type MRAMDocument } from "../mram-format";

// Mirrors scripts/build-mram.ts and scripts/rotate-mram.ts encryption layout:
//   MAGIC(4) | VERSION(1) | SALT(16) | IV(12) | CIPHERTEXT | AUTH_TAG(16)
function encryptMRAMNodeForTest(doc: MRAMDocument, passphrase: string): Buffer {
  const MAGIC = Buffer.from("MRAM", "ascii");
  const linesJson = JSON.stringify(doc.lines);
  doc.metadata.checksum = nodeCrypto
    .createHash("sha256")
    .update(linesJson)
    .digest("hex");

  const jsonBytes = Buffer.from(JSON.stringify(doc), "utf-8");
  const salt = nodeCrypto.randomBytes(16);
  const iv = nodeCrypto.randomBytes(12);
  const key = nodeCrypto.pbkdf2Sync(passphrase, salt, 310_000, 32, "sha256");

  const cipher = nodeCrypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(jsonBytes), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([MAGIC, Buffer.from([1]), salt, iv, encrypted, authTag]);
}

function makeDoc(expiresAt?: string): MRAMDocument {
  return {
    format: "MRAM",
    version: 1,
    metadata: {
      jurisdiction: "Test Jurisdiction",
      degree: "Test Degree",
      ceremony: "Test Ceremony",
      checksum: "",
      ...(expiresAt ? { expiresAt } : {}),
    },
    roles: { WM: "Worshipful Master" },
    sections: [{ id: "s1", title: "Test" }],
    lines: [
      {
        id: 1,
        section: "s1",
        role: "WM",
        gavels: 0,
        action: null,
        cipher: "Hi.",
        plain: "Hello, brethren.",
      },
    ],
  };
}

function bufferToArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rotateScript = path.join(repoRoot, "scripts", "rotate-mram.ts");

function runRotate(args: string[]): { status: number | null; stderr: string; stdout: string } {
  const result = spawnSync("npx", ["tsx", rotateScript, ...args], {
    cwd: repoRoot,
    encoding: "utf-8",
    env: { ...process.env },
  });
  return {
    status: result.status,
    stderr: result.stderr ?? "",
    stdout: result.stdout ?? "",
  };
}

describe("rotate-mram CLI", () => {
  let tmpDir: string;
  const oldPass = "old-pass-123";
  const newPass = "new-pass-456";

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rotate-mram-test-"));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("rotates an expired file to a new passphrase and fresh expiry", async () => {
    const pastExpiry = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const expiredBlob = encryptMRAMNodeForTest(makeDoc(pastExpiry), oldPass);
    const inputPath = path.join(tmpDir, "expired-in.mram");
    const outputPath = path.join(tmpDir, "expired-out.mram");
    fs.writeFileSync(inputPath, expiredBlob);

    const { status, stderr } = runRotate([
      inputPath,
      outputPath,
      "--old-pass",
      oldPass,
      "--new-pass",
      newPass,
      "--expires-in",
      "30d",
    ]);

    expect(status, stderr).toBe(0);
    expect(stderr).toMatch(/EXPIRED/);

    const rotated = fs.readFileSync(outputPath);
    const doc = await decryptMRAM(bufferToArrayBuffer(rotated), newPass);

    expect(doc.lines[0].plain).toBe("Hello, brethren.");

    expect(doc.metadata.expiresAt).toBeDefined();
    const newExpiry = new Date(doc.metadata.expiresAt!);
    expect(newExpiry.getTime()).toBeGreaterThan(Date.now());
    const daysUntil =
      (newExpiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(daysUntil).toBeGreaterThan(29);
    expect(daysUntil).toBeLessThan(31);
  }, 30_000);

  it("rejects the old passphrase on the rotated file", async () => {
    const blob = encryptMRAMNodeForTest(makeDoc(), oldPass);
    const inputPath = path.join(tmpDir, "reject-in.mram");
    const outputPath = path.join(tmpDir, "reject-out.mram");
    fs.writeFileSync(inputPath, blob);

    const { status } = runRotate([
      inputPath,
      outputPath,
      "--old-pass",
      oldPass,
      "--new-pass",
      newPass,
      "--expires-in",
      "7d",
    ]);
    expect(status).toBe(0);

    const rotated = fs.readFileSync(outputPath);
    await expect(
      decryptMRAM(bufferToArrayBuffer(rotated), oldPass),
    ).rejects.toThrow(/passphrase is incorrect/i);
  }, 30_000);

  it("clears expiresAt with --no-expires", async () => {
    const futureExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const blob = encryptMRAMNodeForTest(makeDoc(futureExpiry), oldPass);
    const inputPath = path.join(tmpDir, "clear-in.mram");
    const outputPath = path.join(tmpDir, "clear-out.mram");
    fs.writeFileSync(inputPath, blob);

    const { status } = runRotate([
      inputPath,
      outputPath,
      "--old-pass",
      oldPass,
      "--new-pass",
      newPass,
      "--no-expires",
    ]);
    expect(status).toBe(0);

    const rotated = fs.readFileSync(outputPath);
    const doc = await decryptMRAM(bufferToArrayBuffer(rotated), newPass);
    expect(doc.metadata.expiresAt).toBeUndefined();
  }, 30_000);

  it("refuses to overwrite the input path", () => {
    const blob = encryptMRAMNodeForTest(makeDoc(), oldPass);
    const samePath = path.join(tmpDir, "same.mram");
    fs.writeFileSync(samePath, blob);

    const { status, stderr } = runRotate([
      samePath,
      samePath,
      "--old-pass",
      oldPass,
      "--new-pass",
      newPass,
    ]);
    expect(status).not.toBe(0);
    expect(stderr).toMatch(/same file/i);
  }, 30_000);

  it("is silenced by MRAMExpiredError when decrypted with the library path after rotation past expiry", async () => {
    // A rotated file with a 1-hour expiry should still decrypt fine today and
    // surface MRAMExpiredError only after that moment — this test just
    // confirms the error type is the one the UI expects.
    expect(MRAMExpiredError).toBeDefined();
    const nearPast = new Date(Date.now() - 1000).toISOString();
    const blob = encryptMRAMNodeForTest(makeDoc(nearPast), oldPass);
    await expect(
      decryptMRAM(bufferToArrayBuffer(blob), oldPass),
    ).rejects.toThrow(MRAMExpiredError);
  });
});
