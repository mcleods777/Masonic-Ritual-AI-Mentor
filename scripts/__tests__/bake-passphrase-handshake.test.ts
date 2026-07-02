/**
 * scripts/__tests__/bake-passphrase-handshake.test.ts — CR-01 regression:
 * the FIRST un-mocked real-subprocess test in this repo's bake pipeline.
 *
 * Deliberately does NOT import ../bake-all (or anything that imports it)
 * so the module-level `vi.mock("node:child_process", ...)` set up in
 * bake-all.test.ts never applies here — this file spawns a REAL child
 * process running build-mram-from-dialogue.ts and proves the env-first
 * passphrase handshake end-to-end: a child whose stdin is closed
 * ("ignore" — never a TTY) still successfully builds and encrypts a
 * .mram file when MRAM_PASSPHRASE is set, and refuses loudly (never
 * hangs waiting on a keystroke) when it is not.
 *
 * No network/API calls: build-mram-from-dialogue.ts is invoked WITHOUT
 * --with-audio, so this test passes on a machine with no
 * GOOGLE_GEMINI_API_KEY configured.
 */

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { spawn } from "node:child_process";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SCRIPT_PATH = path.join(REPO_ROOT, "scripts", "build-mram-from-dialogue.ts");

// ------------------------------------------------------------
// Minimal valid plain+cipher dialogue pair that passes validateOrFail
// (src/lib/author-validation.ts's validatePair): matching structure
// signature, plain/cipher word-ratio within the [0.5x, 2x] D-08 band.
// Mirrors the passing fixture in scripts/__tests__/validate-or-fail.test.ts.
// ------------------------------------------------------------
const PLAIN_DIALOGUE = `---
jurisdiction: Test Jurisdiction
degree: Test Degree
ceremony: Test Ceremony
---
# Test Ritual

## I. Opening

WM: The lodge is now open.
`;

const CIPHER_DIALOGUE = `# Test Ritual

## I. Opening

WM: Xyzzy plugh remark now.
`;

const TEST_PASSPHRASE = "test-pass-123";
const PBKDF2_ITERATIONS = 310_000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const MAGIC = Buffer.from("MRAM", "ascii");

/** Minimal Node-side decrypt mirroring encryptMRAMNode's binary layout
 *  (scripts/build-mram-from-dialogue.ts) / rotate-mram-passphrase.ts's
 *  decryptMRAM — used ONLY to prove the produced .mram is readable with
 *  the passphrase the child received via env. */
function decryptMram(fileBytes: Buffer, passphrase: string): unknown {
  const magic = fileBytes.subarray(0, MAGIC.length);
  if (!magic.equals(MAGIC)) throw new Error("Not an .mram file");
  let off = MAGIC.length + 1; // skip magic + version byte
  const salt = fileBytes.subarray(off, off + SALT_LENGTH);
  off += SALT_LENGTH;
  const iv = fileBytes.subarray(off, off + IV_LENGTH);
  off += IV_LENGTH;
  const rest = fileBytes.subarray(off);
  const ciphertext = rest.subarray(0, rest.length - AUTH_TAG_LENGTH);
  const authTag = rest.subarray(rest.length - AUTH_TAG_LENGTH);
  const key = crypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, 32, "sha256");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString("utf-8"));
}

interface SpawnResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runChild(env: NodeJS.ProcessEnv, args: string[]): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["tsx", SCRIPT_PATH, ...args], {
      cwd: REPO_ROOT,
      // stdin explicitly closed ("ignore") — never a TTY. Proves the
      // child does not need interactive stdin when MRAM_PASSPHRASE is
      // set (CR-01), and that it refuses loudly (not hangs) when unset.
      stdio: ["ignore", "pipe", "pipe"],
      env,
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr?.on("data", (chunk) => (stderr += chunk.toString()));

    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(
        new Error(
          `child process timed out after 30s — likely hanging on a keystroke ` +
            `it should never wait for.\nstdout:\n${stdout}\nstderr:\n${stderr}`,
        ),
      );
    }, 30_000);

    child.on("exit", (code) => {
      clearTimeout(timeout);
      resolve({ code, stdout, stderr });
    });
    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

describe("CR-01 real-subprocess passphrase handshake (build-mram-from-dialogue.ts)", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it(
    "with MRAM_PASSPHRASE set and stdin not a TTY: exits 0, produces a .mram decryptable with that passphrase",
    async () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bake-handshake-"));
      const plainPath = path.join(tmpDir, "handshake-dialogue.md");
      const cipherPath = path.join(tmpDir, "handshake-dialogue-cipher.md");
      const outPath = path.join(tmpDir, "out.mram");
      fs.writeFileSync(plainPath, PLAIN_DIALOGUE);
      fs.writeFileSync(cipherPath, CIPHER_DIALOGUE);

      const result = await runChild(
        { ...process.env, MRAM_PASSPHRASE: TEST_PASSPHRASE },
        [plainPath, cipherPath, outPath],
      );

      expect(result.code).toBe(0);
      expect(fs.existsSync(outPath)).toBe(true);

      const fileBytes = fs.readFileSync(outPath);
      const decrypted = decryptMram(fileBytes, TEST_PASSPHRASE) as {
        lines: unknown[];
      };
      expect(Array.isArray(decrypted.lines)).toBe(true);
      expect(decrypted.lines.length).toBeGreaterThan(0);
    },
    35_000,
  );

  it(
    "with MRAM_PASSPHRASE unset and stdin not a TTY: exits non-zero and stderr names MRAM_PASSPHRASE (never hangs)",
    async () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bake-handshake-neg-"));
      const plainPath = path.join(tmpDir, "handshake-dialogue.md");
      const cipherPath = path.join(tmpDir, "handshake-dialogue-cipher.md");
      const outPath = path.join(tmpDir, "out.mram");
      fs.writeFileSync(plainPath, PLAIN_DIALOGUE);
      fs.writeFileSync(cipherPath, CIPHER_DIALOGUE);

      const { MRAM_PASSPHRASE: _drop, ...envWithoutPassphrase } = process.env;

      const result = await runChild(envWithoutPassphrase, [
        plainPath,
        cipherPath,
        outPath,
      ]);

      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("MRAM_PASSPHRASE");
      expect(fs.existsSync(outPath)).toBe(false);
    },
    35_000,
  );
});
