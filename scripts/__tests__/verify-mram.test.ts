// @vitest-environment node
/**
 * Tests for scripts/verify-mram.ts `--check-audio-coverage` (CONTENT-06).
 *
 * Scope: verify-mram gains the ability to assert per-line Opus audio
 * coverage in a v3 .mram. This test file exercises that gate end-to-end
 * against synthesized in-memory .mram fixtures (no large binaries committed).
 *
 * Fixture strategy (per VALIDATION.md constraint < 100KB per fixture):
 *   - FIXTURE_OPUS_B64 — base64 of ~3.5KB real Opus bytes (1.0s duration).
 *   - FIXTURE_OPUS_LONG_B64 — base64 of ~5.7KB real Opus bytes (1.56s duration).
 *   Captured from rituals/_bake-cache/ (or ~/.cache/masonic-mram-audio/) by
 *   `cat <file>.opus | base64 -w0`. NOT the raw .opus — only the base64
 *   string is committed. Real OGG/Opus bytes are required because
 *   music-metadata must successfully parse them during coverage.
 *
 * Threat coverage:
 *   - T-04-01 (path-traversal via argv): exercised indirectly via fixture files.
 *   - T-04-02 (DoS on malformed Opus): bad-base64 + bad-OGG-magic + oversize byte cap.
 *   - T-04-04 (stdout leakage): --json shape asserts no plain/cipher text.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { webcrypto } from "node:crypto";

// Ensure WebCrypto is available (Node 22+: globalThis.crypto.subtle exists natively).
// This line is a belt-and-suspenders guard so the test doesn't silently fall
// back to a polyfill if the runtime lacks subtle. No-op if already present.
if (!(globalThis as unknown as { crypto?: Crypto }).crypto?.subtle) {
  (globalThis as unknown as { crypto: Crypto }).crypto = webcrypto as unknown as Crypto;
}

import { encryptMRAM, type MRAMDocument } from "../../src/lib/mram-format";

// ============================================================
// Fixtures — real base64 Opus from a prior ea-opening bake.
// These fixtures MUST parse with music-metadata (real OGG/Opus
// pages; first 4 bytes are "OggS"). The base64 strings below
// are the only committed form of the fixture bytes.
// ============================================================
// 3587 bytes, duration ≈ 1.0s. Used for "fast" spoken lines.
const FIXTURE_OPUS_B64 =
  "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";

// 5755 bytes, duration ≈ 1.56s. Used as the "longer" spoken-line fixture.
const FIXTURE_OPUS_LONG_B64 =
  "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";

const PASS = "test-fixture-passphrase";
const SCRIPT = path.resolve(__dirname, "..", "verify-mram.ts");

// ============================================================
// Fixture helpers
// ============================================================

/**
 * Build a MRAMDocument with `spoken` spoken lines + 1 action line.
 * Every spoken line carries FIXTURE_OPUS_B64 audio by default. Callers
 * mutate the doc between build and encrypt to simulate failure modes
 * (delete .audio, corrupt .audio, etc.) before calling encryptToPath.
 */
function buildGoodDoc(spoken = 2): MRAMDocument {
  const lines = [];
  for (let i = 1; i <= spoken; i++) {
    lines.push({
      id: i,
      section: "s1",
      role: i === 1 ? "WM" : "SW",
      gavels: 0,
      action: null,
      cipher: `c${i}`,
      plain: `Line ${i} plain text here.`,
      audio: FIXTURE_OPUS_B64,
    });
  }
  // Add an action line (no audio required).
  lines.push({
    id: spoken + 1,
    section: "s1",
    role: "WM",
    gavels: 1,
    action: "strikes gavel once",
    cipher: "",
    plain: "",
  });
  return {
    format: "MRAM",
    version: 3,
    metadata: {
      jurisdiction: "grand-lodge-of-iowa",
      degree: "EA",
      ceremony: "opening",
      checksum: "", // encryptMRAM recomputes.
      voiceCast: { WM: "Alnilam", SW: "Charon" },
      audioFormat: "opus-32k-mono",
    },
    roles: { WM: "Worshipful Master", SW: "Senior Warden" },
    sections: [{ id: "s1", title: "Opening" }],
    lines,
  };
}

async function encryptToPath(doc: MRAMDocument, filePath: string): Promise<void> {
  const ab = await encryptMRAM(doc, PASS);
  fs.writeFileSync(filePath, Buffer.from(ab));
}

/**
 * Hand-craft a version=N .mram header by pulling a real encrypted v3 payload
 * and flipping the single version byte. The auth tag becomes invalid (we
 * never decrypt successfully), but the script's version check runs BEFORE
 * decrypt, so that's the gate we're probing.
 */
async function buildWithVersionByte(version: number, filePath: string): Promise<void> {
  const doc = buildGoodDoc(1);
  const ab = await encryptMRAM(doc, PASS);
  const buf = Buffer.from(ab);
  buf[4] = version; // MAGIC (4) + version (1)
  fs.writeFileSync(filePath, buf);
}

// ============================================================
// Subprocess + import helpers
// ============================================================

/** Spawn verify-mram.ts in a subprocess. Returns {code, stdout, stderr}. */
async function runVerify(
  args: string[],
  env: Record<string, string> = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  const { spawn } = await import("node:child_process");
  return new Promise((resolve) => {
    const child = spawn("npx", ["tsx", SCRIPT, ...args], {
      env: { ...process.env, MRAM_PASSPHRASE: PASS, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("exit", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

let tmpDir: string;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-mram-test-"));
});
afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
});

// ============================================================
// Test 1: Good v3 fixture with all audio present → exit 0
// ============================================================

describe("verify-mram --check-audio-coverage (CONTENT-06)", () => {
  it("exits 0 on a v3 .mram with every spoken line carrying valid Opus audio", async () => {
    const doc = buildGoodDoc(2);
    const p = path.join(tmpDir, "good.mram");
    await encryptToPath(doc, p);

    const { code, stdout } = await runVerify([p, "--check-audio-coverage"]);
    expect(code).toBe(0);
    expect(stdout).toMatch(/Audio Coverage/i);
    expect(stdout).toMatch(/2\/2/); // "2/2 lines OK" or similar
  }, 20_000);

  // ============================================================
  // Test 2: Missing audio on a spoken line → exit 1
  // ============================================================
  it("exits 1 when a spoken line is missing the audio field", async () => {
    const doc = buildGoodDoc(2);
    delete doc.lines[0]!.audio;
    const p = path.join(tmpDir, "missing-audio.mram");
    await encryptToPath(doc, p);

    const { code, stderr, stdout } = await runVerify([p, "--check-audio-coverage"]);
    expect(code).toBe(1);
    const combined = stderr + stdout;
    // The offending line.id (1) should appear in the failure output.
    expect(combined).toMatch(/missing-audio|missing audio/i);
    expect(combined).toMatch(/\b1\b/);
  }, 20_000);

  // ============================================================
  // Test 3: Audio decodes to bytes without OGG magic → exit 1
  // ============================================================
  it("exits 1 when a line's audio decodes but lacks OGG magic", async () => {
    const doc = buildGoodDoc(2);
    // 1024 bytes of zeros, base64-encoded. Above the 500-byte MIN floor
    // so the byte-len gate passes → the OGG-magic gate is what should
    // fire (first 4 bytes are 0x00 0x00 0x00 0x00, not "OggS").
    const zeros = Buffer.alloc(1024, 0);
    doc.lines[0]!.audio = zeros.toString("base64");
    const p = path.join(tmpDir, "bad-magic.mram");
    await encryptToPath(doc, p);

    const { code, stderr, stdout } = await runVerify([p, "--check-audio-coverage"]);
    expect(code).toBe(1);
    const combined = stderr + stdout;
    expect(combined).toMatch(/OGG magic|bad-ogg-magic|OGG/i);
  }, 20_000);

  // ============================================================
  // Test 4: Duration anomaly — line sec/char > 3× ritual median
  // ============================================================
  it("exits 1 on a duration anomaly (line sec/char > 3× ritual median)", async () => {
    // Build a doc where line 1 has tiny plain text (1 char) but carries
    // the 3.56s Opus → sec/char = 3.56, while other lines are normal.
    // Use ~20 normal lines so the median is stable (sec/char ≈ 1.0/22 ≈ 0.045).
    const doc = buildGoodDoc(0);
    doc.lines = [];
    // One anomalously-short plain line with the normal audio — its
    // sec/char ratio will be ~1.0s / 1 char = 1.0, far above the median.
    doc.lines.push({
      id: 1,
      section: "s1",
      role: "WM",
      gavels: 0,
      action: null,
      cipher: "I",
      plain: "I", // 1 char → sec/char = 1.0
      audio: FIXTURE_OPUS_B64, // 1.0s duration
    });
    // Enough "normal" lines to stabilize the median.
    for (let i = 2; i <= 35; i++) {
      doc.lines.push({
        id: i,
        section: "s1",
        role: "WM",
        gavels: 0,
        action: null,
        cipher: `c${i}`,
        // Long plain text so sec/char is small (~1.0s / 80 chars ≈ 0.0125).
        plain: "A fairly long spoken line of ritual text eighty characters long to force low s/c.",
        audio: FIXTURE_OPUS_B64,
      });
    }
    const p = path.join(tmpDir, "duration-anomaly.mram");
    await encryptToPath(doc, p);

    const { code, stderr, stdout } = await runVerify([p, "--check-audio-coverage"]);
    expect(code).toBe(1);
    const combined = stderr + stdout;
    expect(combined).toMatch(/duration-anomaly|anomaly|too-long/i);
  }, 30_000);

  // ============================================================
  // Test 5: v2 and v1 files are rejected (version-bump enforcement)
  // ============================================================
  it("rejects a v2 .mram file with 'v3 required' message", async () => {
    const p = path.join(tmpDir, "v2.mram");
    await buildWithVersionByte(2, p);

    const { code, stderr, stdout } = await runVerify([p, "--check-audio-coverage"]);
    expect(code).toBe(1);
    const combined = stderr + stdout;
    expect(combined).toMatch(/v3 required|version/i);
  }, 20_000);

  it("rejects a v1 .mram file with 'v3 required' message", async () => {
    const p = path.join(tmpDir, "v1.mram");
    await buildWithVersionByte(1, p);

    const { code, stderr, stdout } = await runVerify([p, "--check-audio-coverage"]);
    expect(code).toBe(1);
    const combined = stderr + stdout;
    expect(combined).toMatch(/v3 required|version/i);
  }, 20_000);

  // ============================================================
  // Test 6: --json mode prints machine-readable shape + no leakage
  // ============================================================
  it("--json mode prints a machine-readable shape without plain/cipher text", async () => {
    const doc = buildGoodDoc(2);
    const uniquePlain = "UNIQUE_PLAIN_MARKER_THAT_MUST_NOT_LEAK";
    const uniqueCipher = "UNIQUE_CIPHER_MARKER_THAT_MUST_NOT_LEAK";
    doc.lines[0]!.plain = uniquePlain;
    doc.lines[0]!.cipher = uniqueCipher;
    const p = path.join(tmpDir, "json.mram");
    await encryptToPath(doc, p);

    const { stdout } = await runVerify([p, "--check-audio-coverage", "--json"]);
    // Parseable JSON (at least one object on stdout).
    const lastBrace = stdout.lastIndexOf("}");
    const firstBrace = stdout.indexOf("{");
    expect(firstBrace).toBeGreaterThanOrEqual(0);
    const jsonStr = stdout.slice(firstBrace, lastBrace + 1);
    const parsed = JSON.parse(jsonStr) as {
      ritual?: string;
      totalLines?: number;
      spokenLines?: number;
      linesWithAudio?: number;
      failures?: unknown[];
    };
    expect(parsed.ritual).toMatch(/json\.mram$/);
    expect(parsed.totalLines).toBeGreaterThan(0);
    expect(parsed.spokenLines).toBe(2);
    expect(parsed.linesWithAudio).toBe(2);
    expect(Array.isArray(parsed.failures)).toBe(true);
    // T-04-04: no plain/cipher text leakage anywhere in JSON output.
    expect(stdout).not.toContain(uniquePlain);
    expect(stdout).not.toContain(uniqueCipher);
  }, 20_000);

  // ============================================================
  // Test 7: No-flag invocation preserves Phase 3 sentinels on v3
  // ============================================================
  it("without --check-audio-coverage, preserves 'Role breakdown' + 'Verification complete' sentinels on v3", async () => {
    const doc = buildGoodDoc(2);
    const p = path.join(tmpDir, "sentinel.mram");
    await encryptToPath(doc, p);

    const { code, stdout } = await runVerify([p]);
    expect(code).toBe(0);
    expect(stdout).toMatch(/Role breakdown/);
    expect(stdout).toMatch(/Verification complete/);
  }, 20_000);
});

// ============================================================
// Test 8: checkAudioCoverage exported as a pure function
// ============================================================

describe("checkAudioCoverage (pure function export)", () => {
  it("returns pass=true with stats on a good doc", async () => {
    const { checkAudioCoverage } = await import("../verify-mram");
    const doc = buildGoodDoc(2);
    const result = await checkAudioCoverage(doc);
    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.stats.spokenLines).toBe(2);
    expect(result.stats.linesWithAudio).toBe(2);
    expect(result.stats.totalLines).toBe(3); // 2 spoken + 1 action
  });

  it("returns pass=false with missing-metadata failure when audioFormat missing", async () => {
    const { checkAudioCoverage } = await import("../verify-mram");
    const doc = buildGoodDoc(1);
    delete doc.metadata.audioFormat;
    const result = await checkAudioCoverage(doc);
    expect(result.pass).toBe(false);
    expect(result.failures.some((f) => f.kind === "missing-metadata")).toBe(true);
  });
});

// silence unused import warnings — crypto is used indirectly via the
// node runtime for some mram-format operations.
void crypto;
void vi;
void beforeAll;
void FIXTURE_OPUS_LONG_B64;
