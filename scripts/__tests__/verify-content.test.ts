// @vitest-environment node
/**
 * Tests for scripts/verify-content.ts — release gate (CONTENT-07).
 *
 * Scope: multi-ritual discovery + pairing + validator propagation +
 * audio-coverage propagation + aggregate exit-code semantics. The gate
 * runs against a tmpdir-rooted rituals directory (`--rituals-dir <path>`)
 * so tests never touch the real rituals/ folder.
 *
 * Fixtures: reuses the base64 Opus bytes from verify-mram.test.ts (real
 * OGG/Opus ~3.5KB, duration ≈ 1.0s). Captured the same way; committed
 * only as the base64 string.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { webcrypto } from "node:crypto";

// Ensure WebCrypto is available at module load.
if (!(globalThis as unknown as { crypto?: Crypto }).crypto?.subtle) {
  (globalThis as unknown as { crypto: Crypto }).crypto = webcrypto as unknown as Crypto;
}

import { encryptMRAM, type MRAMDocument } from "../../src/lib/mram-format";

// Reuse a single real Opus fixture (1.0s duration, ~3.5KB). Keeping
// this inlined in both test files preserves the Plan-01 mandate that
// fixtures are committed ONLY as base64 strings, not .opus binaries.
const FIXTURE_OPUS_B64 =
  "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";

const PASS = "test-fixture-passphrase";
const SCRIPT = path.resolve(__dirname, "..", "verify-content.ts");

// ============================================================
// Fixture helpers — per-ritual file set (dialogue.md + cipher.md + .mram)
// ============================================================

/**
 * Minimal dialogue body used for both plain and cipher.
 * Structure: one section, two spoken lines by WM.
 */
const GOOD_DIALOGUE = `# Test Ritual

## I. Opening

WM: The lodge is now open.
WM: All rise.
`;

/**
 * A cipher file whose first speaker differs from plain. validatePair
 * reports `severity: 'error'` + `kind: 'structure-speaker'` → the
 * release gate must record this ritual as `validator-fail`.
 */
const SPEAKER_MISMATCH_CIPHER = `# Test Ritual

## I. Opening

SW: The lodge is now open.
WM: All rise.
`;

async function writeRitualFiles(
  dir: string,
  slug: string,
  opts: {
    plain?: string;
    cipher?: string;
    mramDoc?: MRAMDocument;
    skipDialogue?: boolean;
    skipMram?: boolean;
  } = {},
): Promise<void> {
  const plain = opts.plain ?? GOOD_DIALOGUE;
  const cipher = opts.cipher ?? GOOD_DIALOGUE;
  if (!opts.skipDialogue) {
    fs.writeFileSync(path.join(dir, `${slug}-dialogue.md`), plain);
    fs.writeFileSync(path.join(dir, `${slug}-dialogue-cipher.md`), cipher);
  }
  if (!opts.skipMram) {
    const doc = opts.mramDoc ?? buildGoodDoc();
    const ab = await encryptMRAM(doc, PASS);
    fs.writeFileSync(path.join(dir, `${slug}.mram`), Buffer.from(ab));
  }
}

function buildGoodDoc(): MRAMDocument {
  return {
    format: "MRAM",
    version: 3,
    metadata: {
      jurisdiction: "grand-lodge-of-iowa",
      degree: "EA",
      ceremony: "opening",
      checksum: "",
      voiceCast: { WM: "Alnilam" },
      audioFormat: "opus-32k-mono",
    },
    roles: { WM: "Worshipful Master" },
    sections: [{ id: "s1", title: "Opening" }],
    lines: [
      {
        id: 1,
        section: "s1",
        role: "WM",
        gavels: 0,
        action: null,
        cipher: "The lodge is now open.",
        plain: "The lodge is now open.",
        audio: FIXTURE_OPUS_B64,
      },
      {
        id: 2,
        section: "s1",
        role: "WM",
        gavels: 0,
        action: null,
        cipher: "All rise.",
        plain: "All rise.",
        audio: FIXTURE_OPUS_B64,
      },
    ],
  };
}

async function runGate(
  ritualsDir: string,
  extraArgs: string[] = [],
): Promise<{ code: number; stdout: string; stderr: string }> {
  const { spawn } = await import("node:child_process");
  return new Promise((resolve) => {
    const child = spawn(
      "npx",
      ["tsx", SCRIPT, "--rituals-dir", ritualsDir, ...extraArgs],
      {
        env: { ...process.env, MRAM_PASSPHRASE: PASS },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("exit", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

let ritualsDir: string;
beforeEach(() => {
  ritualsDir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-content-test-"));
});
afterEach(() => {
  try {
    fs.rmSync(ritualsDir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
});

// ============================================================
// Test 1: Two good rituals → exit 0, both PASS in summary
// ============================================================

describe("verify-content release gate (CONTENT-07)", () => {
  it("exits 0 when all rituals pass validator + audio-coverage", async () => {
    await writeRitualFiles(ritualsDir, "ritual-a");
    await writeRitualFiles(ritualsDir, "ritual-b");

    const { code, stdout } = await runGate(ritualsDir);
    expect(code).toBe(0);
    expect(stdout).toMatch(/ritual-a.*PASS|PASS.*ritual-a/);
    expect(stdout).toMatch(/ritual-b.*PASS|PASS.*ritual-b/);
  }, 30_000);

  // ============================================================
  // Test 2: Ritual-A fails validator → exits 1, ritual-A FAIL "validator"
  // ============================================================
  it("exits 1 when a ritual's dialogue/cipher pair fails validatePair", async () => {
    await writeRitualFiles(ritualsDir, "ritual-a", {
      cipher: SPEAKER_MISMATCH_CIPHER,
    });
    await writeRitualFiles(ritualsDir, "ritual-b");

    const { code, stdout } = await runGate(ritualsDir);
    expect(code).toBe(1);
    expect(stdout).toMatch(/ritual-a.*FAIL|FAIL.*ritual-a/);
    expect(stdout).toMatch(/validator/i);
  }, 30_000);

  // ============================================================
  // Test 3: Ritual-B has a .mram with a line missing audio → exits 1
  // ============================================================
  it("exits 1 when a ritual's .mram fails audio-coverage", async () => {
    await writeRitualFiles(ritualsDir, "ritual-a");
    const badDoc = buildGoodDoc();
    delete badDoc.lines[0]!.audio;
    await writeRitualFiles(ritualsDir, "ritual-b", { mramDoc: badDoc });

    const { code, stdout } = await runGate(ritualsDir);
    expect(code).toBe(1);
    expect(stdout).toMatch(/ritual-b.*FAIL|FAIL.*ritual-b/);
    expect(stdout).toMatch(/audio-coverage|audio/i);
  }, 30_000);

  // ============================================================
  // Test 4: Ritual-C lacks a paired -dialogue.md → missing-dialogue-pair
  // ============================================================
  it("exits 1 when a .mram has no paired -dialogue.md", async () => {
    // Write ONLY the .mram for ritual-c (no dialogue pair).
    await writeRitualFiles(ritualsDir, "ritual-c", { skipDialogue: true });

    const { code, stdout } = await runGate(ritualsDir);
    expect(code).toBe(1);
    expect(stdout).toMatch(/ritual-c.*FAIL|FAIL.*ritual-c/);
    expect(stdout).toMatch(/missing-dialogue-pair|missing/i);
  }, 30_000);

  // ============================================================
  // Test 5: Aggregate — 1 pass + 2 fail → all three appear, exit 1
  // ============================================================
  it("surfaces every ritual's result even when some fail (no early abort)", async () => {
    await writeRitualFiles(ritualsDir, "ritual-pass"); // good
    await writeRitualFiles(ritualsDir, "ritual-val-fail", {
      cipher: SPEAKER_MISMATCH_CIPHER,
    }); // validator-fail
    const badDoc = buildGoodDoc();
    delete badDoc.lines[0]!.audio;
    await writeRitualFiles(ritualsDir, "ritual-audio-fail", { mramDoc: badDoc }); // audio-fail

    const { code, stdout } = await runGate(ritualsDir);
    expect(code).toBe(1);
    // All three rituals must appear in the summary (order-independent).
    expect(stdout).toMatch(/ritual-pass/);
    expect(stdout).toMatch(/ritual-val-fail/);
    expect(stdout).toMatch(/ritual-audio-fail/);
    // The pass-row must be PASS; fails must be FAIL.
    expect(stdout).toMatch(/ritual-pass.*PASS|PASS.*ritual-pass/);
  }, 40_000);
});
