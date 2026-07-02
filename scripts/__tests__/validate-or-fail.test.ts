import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { validateOrFail } from "../lib/validate-or-fail";

// Minimal single-line dialogue fixture — matches the format consumed by
// src/lib/dialogue-format.ts's parseDialogue().
function makeSource(speaker: string, text: string): string {
  return `# Test Ritual\n\n## I. Opening\n\n${speaker}: ${text}\n`;
}

describe("validateOrFail", () => {
  let tmpDir: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "validate-or-fail-test-"));
    // process.exit throws instead of actually exiting, so subsequent
    // console.error calls in the same call chain never run past the spy —
    // matches the real early-return-via-exit control flow closely enough
    // for assertion purposes while keeping the test process alive.
    exitSpy = vi.spyOn(process, "exit").mockImplementation(((
      _code?: number,
    ) => {
      throw new Error("process.exit called");
    }) as never);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("does not exit on a clean pair", () => {
    const plainPath = path.join(tmpDir, "clean-dialogue.md");
    const cipherPath = path.join(tmpDir, "clean-dialogue-cipher.md");
    fs.writeFileSync(plainPath, makeSource("WM", "The lodge is now open."));
    fs.writeFileSync(cipherPath, makeSource("WM", "Xyzzy plugh remark now."));

    expect(() => validateOrFail(plainPath, cipherPath)).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("exits 1 and prints a structured report for a corrupted pair (speaker mismatch)", () => {
    const plainPath = path.join(tmpDir, "corrupt-dialogue.md");
    const cipherPath = path.join(tmpDir, "corrupt-dialogue-cipher.md");
    fs.writeFileSync(plainPath, makeSource("WM", "Same text here."));
    // Different speaker -> severity:error structure-speaker issue.
    fs.writeFileSync(cipherPath, makeSource("SW", "Same text here."));

    expect(() => validateOrFail(plainPath, cipherPath, "test-ritual")).toThrow(
      "process.exit called",
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
    const output = errorSpy.mock.calls
      .map((c: unknown[]) => String(c[0]))
      .join("\n");
    expect(output).toContain("test-ritual");
    expect(output).toContain("structure-speaker");
    // Report lists the offending line index.
    expect(output).toMatch(/line \d+/);
  });

  it("exits 1 for a corrupted pair (bake-band word-ratio outlier)", () => {
    const plainPath = path.join(tmpDir, "ratio-dialogue.md");
    const cipherPath = path.join(tmpDir, "ratio-dialogue-cipher.md");
    fs.writeFileSync(
      plainPath,
      makeSource("WM", "one two three four five six seven eight nine ten"),
    );
    fs.writeFileSync(cipherPath, makeSource("WM", "un deux trois quatre"));

    expect(() => validateOrFail(plainPath, cipherPath)).toThrow(
      "process.exit called",
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
    const output = errorSpy.mock.calls
      .map((c: unknown[]) => String(c[0]))
      .join("\n");
    expect(output).toContain("ratio-outlier");
  });
});
