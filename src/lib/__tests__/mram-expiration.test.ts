import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as nodeCrypto from "node:crypto";
import {
  encryptMRAM,
  decryptMRAM,
  MRAMExpiredError,
  type MRAMDocument,
} from "../mram-format";

// Node-side encryptor mirroring scripts/build-mram.ts. Lets tests construct
// .mram blobs without pulling in the CLI. Binary layout:
//   MAGIC(4) | VERSION(1) | SALT(16) | IV(12) | CIPHERTEXT | AUTH_TAG(16)
function encryptMRAMNodeForTest(
  doc: MRAMDocument,
  passphrase: string,
): ArrayBuffer {
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

  const out = Buffer.concat([
    MAGIC,
    Buffer.from([1]),
    salt,
    iv,
    encrypted,
    authTag,
  ]);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
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
        plain: "Hello.",
      },
    ],
  };
}

const PASS = "test-passphrase";

describe("decryptMRAM — expiration enforcement", () => {
  it("decrypts a file with no expiresAt", async () => {
    const blob = encryptMRAMNodeForTest(makeDoc(), PASS);
    const doc = await decryptMRAM(blob, PASS);
    expect(doc.metadata.expiresAt).toBeUndefined();
    expect(doc.lines[0].plain).toBe("Hello.");
  });

  it("decrypts a file whose expiresAt is in the future", async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const blob = encryptMRAMNodeForTest(makeDoc(future), PASS);
    const doc = await decryptMRAM(blob, PASS);
    expect(doc.metadata.expiresAt).toBe(future);
  });

  it("throws MRAMExpiredError when expiresAt is in the past", async () => {
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    const blob = encryptMRAMNodeForTest(makeDoc(past), PASS);
    await expect(decryptMRAM(blob, PASS)).rejects.toBeInstanceOf(
      MRAMExpiredError,
    );
  });

  it("expiration error message includes the date and guidance", async () => {
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    const blob = encryptMRAMNodeForTest(makeDoc(past), PASS);
    try {
      await decryptMRAM(blob, PASS);
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(MRAMExpiredError);
      const message = (err as MRAMExpiredError).message;
      expect(message).toContain(past);
      expect(message).toMatch(/lodge/i);
    }
  });

  it("treats the expiration boundary as strictly in the past", async () => {
    // Freeze time so we can set expiresAt to exactly `now` and assert the
    // <= check fires on equality rather than waiting for the wall clock.
    const now = new Date("2026-06-01T12:00:00Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      const blob = encryptMRAMNodeForTest(makeDoc(now.toISOString()), PASS);
      await expect(decryptMRAM(blob, PASS)).rejects.toBeInstanceOf(
        MRAMExpiredError,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a malformed expiresAt string with a clear error", async () => {
    const blob = encryptMRAMNodeForTest(makeDoc("not-a-date"), PASS);
    await expect(decryptMRAM(blob, PASS)).rejects.toThrow(
      /Invalid expiresAt/i,
    );
  });

  it("surfaces checksum tamper errors before expiration errors", async () => {
    // Construct a doc with a past expiresAt AND a bad checksum. Checksum
    // verification runs first, so callers see the integrity failure (which
    // is the more alarming signal) rather than "it's expired."
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    const doc = makeDoc(past);
    // Encrypt normally so the checksum gets populated...
    const MAGIC = Buffer.from("MRAM", "ascii");
    const linesJson = JSON.stringify(doc.lines);
    doc.metadata.checksum = nodeCrypto
      .createHash("sha256")
      .update(linesJson)
      .digest("hex");
    // ...then corrupt the checksum field and re-encrypt so AES-GCM still
    // validates but the checksum check fails.
    doc.metadata.checksum = "0".repeat(64);

    const jsonBytes = Buffer.from(JSON.stringify(doc), "utf-8");
    const salt = nodeCrypto.randomBytes(16);
    const iv = nodeCrypto.randomBytes(12);
    const key = nodeCrypto.pbkdf2Sync(PASS, salt, 310_000, 32, "sha256");
    const cipher = nodeCrypto.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(jsonBytes), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const out = Buffer.concat([
      MAGIC,
      Buffer.from([1]),
      salt,
      iv,
      encrypted,
      authTag,
    ]);
    const blob = out.buffer.slice(
      out.byteOffset,
      out.byteOffset + out.byteLength,
    );

    await expect(decryptMRAM(blob, PASS)).rejects.toThrow(/Checksum mismatch/);
  });
});

describe("encryptMRAM — expiresAt round-trip", () => {
  // The browser encrypt path (encryptMRAM in mram-format.ts) uses Web Crypto,
  // which Vitest/jsdom provides via Node's webcrypto. This confirms that a
  // doc built in the browser with expiresAt round-trips through decrypt.
  beforeEach(() => {
    // jsdom may not expose crypto.subtle; install Node's webcrypto if needed.
    if (
      typeof globalThis.crypto === "undefined" ||
      typeof globalThis.crypto.subtle === "undefined"
    ) {
      // @ts-expect-error — test shim for environments without subtle crypto
      globalThis.crypto = nodeCrypto.webcrypto;
    }
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes expiresAt into the encrypted payload and reads it back", async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const doc = makeDoc(future);
    const blob = await encryptMRAM(doc, PASS);
    const roundTrip = await decryptMRAM(blob, PASS);
    expect(roundTrip.metadata.expiresAt).toBe(future);
  });
});
