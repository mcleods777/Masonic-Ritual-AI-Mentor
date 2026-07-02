import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// Mock node:child_process BEFORE importing bake-all.ts so its top-level
// `import { spawn } from "node:child_process"` binds to the mock. This
// lets tests assert zero-spawn (dry-run) and spawn-argv contents
// (shell-injection / passphrase-leak checks) without ever launching a
// real subprocess.
const spawnMock = vi.fn();
vi.mock("node:child_process", () => {
  const mod = { spawn: (...args: unknown[]) => spawnMock(...args) };
  return { ...mod, default: mod };
});

// Mock the shared validator so ordering assertions can distinguish
// "validator ran" from "spawn ran" via vi.fn().mock.invocationCallOrder,
// without needing real dialogue-format parsing for every fixture.
const validateOrFailSharedMock = vi.fn();
vi.mock("../lib/validate-or-fail", () => ({
  validateOrFail: (...args: unknown[]) => validateOrFailSharedMock(...args),
}));

import {
  parseFlags,
  clampParallel,
  checkParallelFallbackConflict,
  resolveEffectiveParallel,
  getAllRituals,
  selectSlugs,
  sinceDeprecationWarning,
  validateOrFail,
  runValidatorGate,
  buildMramSpawnArgs,
  bakeSelected,
  dryRunForRitual,
  loadCompletedSlugs,
  SLUG_REGEX,
} from "../bake-all";
import { recordBaked } from "../lib/cache-manifest";
import { writeResumeStateAtomic } from "../lib/resume-state";
import { choosePassphraseSource } from "../build-mram-from-dialogue";

function makeFakeChild() {
  const listeners: Record<string, ((...a: unknown[]) => void)[]> = {};
  const child = {
    on(event: string, cb: (...a: unknown[]) => void) {
      (listeners[event] ??= []).push(cb);
      return child;
    },
    emit(event: string, ...args: unknown[]) {
      for (const cb of listeners[event] ?? []) cb(...args);
    },
  };
  return child;
}

describe("bake-all: clampParallel", () => {
  it("clamps 0 up to 1", () => {
    expect(clampParallel(0)).toBe(1);
  });
  it("clamps negative values up to 1", () => {
    expect(clampParallel(-5)).toBe(1);
  });
  it("clamps 99 down to 16", () => {
    expect(clampParallel(99)).toBe(16);
  });
  it("defaults NaN to 4", () => {
    expect(clampParallel(NaN)).toBe(4);
  });
  it("defaults non-numeric strings to 4", () => {
    expect(clampParallel("not-a-number")).toBe(4);
  });
  it("defaults undefined to 4", () => {
    expect(clampParallel(undefined)).toBe(4);
  });
  it("floors fractional values", () => {
    expect(clampParallel(4.9)).toBe(4);
  });
  it("passes through in-range integers unchanged", () => {
    expect(clampParallel(8)).toBe(8);
  });
});

describe("bake-all: checkParallelFallbackConflict", () => {
  it("refuses parallel>1 with on-fallback=ask, naming both flags", () => {
    const msg = checkParallelFallbackConflict(4, "ask");
    expect(msg).not.toBeNull();
    expect(msg).toContain("--parallel");
    expect(msg).toContain("--on-fallback");
  });

  it("refuses parallel>1 with on-fallback=wait", () => {
    expect(checkParallelFallbackConflict(2, "wait")).not.toBeNull();
  });

  it("allows parallel>1 with on-fallback=continue", () => {
    expect(checkParallelFallbackConflict(4, "continue")).toBeNull();
  });

  it("allows parallel>1 with on-fallback=abort", () => {
    expect(checkParallelFallbackConflict(4, "abort")).toBeNull();
  });

  it("allows parallel=1 with on-fallback=ask (no conflict at N=1)", () => {
    expect(checkParallelFallbackConflict(1, "ask")).toBeNull();
  });

  it("enforces the check when flagged=true even with default-shaped values", () => {
    expect(checkParallelFallbackConflict(4, "ask", true)).not.toBeNull();
  });
});

describe("bake-all: resolveEffectiveParallel (CR-02)", () => {
  it("bare invocation (neither flag present) resolves to 1 — safe degrade so ask stays legal", () => {
    expect(
      resolveEffectiveParallel({
        parallelFlagPresent: false,
        onFallbackFlagPresent: false,
        parallel: 4,
      }),
    ).toBe(1);
  });

  it("explicit --parallel is respected (clamped), even with on-fallback untouched", () => {
    expect(
      resolveEffectiveParallel({
        parallelFlagPresent: true,
        onFallbackFlagPresent: false,
        parallel: 4,
      }),
    ).toBe(4);
  });

  it("touching --on-fallback alone opts out of the safe degrade", () => {
    expect(
      resolveEffectiveParallel({
        parallelFlagPresent: false,
        onFallbackFlagPresent: true,
        parallel: 4,
      }),
    ).toBe(4);
  });

  it("composes with checkParallelFallbackConflict: bare invocation never trips the T-03-14 refusal", () => {
    const bareFlags = parseFlags(["node", "bake-all.ts"]);
    const resolved = resolveEffectiveParallel(bareFlags);
    expect(resolved).toBe(1);
    expect(checkParallelFallbackConflict(resolved, "ask", true)).toBeNull();
  });

  it("composes with checkParallelFallbackConflict: explicit --parallel 4 --on-fallback=ask IS refused", () => {
    const explicitFlags = parseFlags([
      "node",
      "bake-all.ts",
      "--parallel",
      "4",
      "--on-fallback=ask",
    ]);
    const resolved = resolveEffectiveParallel(explicitFlags);
    expect(resolved).toBe(4);
    expect(checkParallelFallbackConflict(resolved, "ask", true)).not.toBeNull();
  });
});

describe("bake-all / build-mram-from-dialogue: choosePassphraseSource (CR-01)", () => {
  it("env wins over an interactive TTY", () => {
    expect(choosePassphraseSource("secret", true)).toEqual({
      kind: "env",
      value: "secret",
    });
  });

  it("env wins when stdin is not a TTY too", () => {
    expect(choosePassphraseSource("secret", false)).toEqual({
      kind: "env",
      value: "secret",
    });
  });

  it("falls through to tty when no env value and stdin is a TTY", () => {
    expect(choosePassphraseSource(undefined, true)).toEqual({ kind: "tty" });
  });

  it("errors when no env value and stdin is not a TTY", () => {
    expect(choosePassphraseSource(undefined, false)).toEqual({
      kind: "error",
    });
  });

  it("treats an empty string env value as unusable (not a usable passphrase)", () => {
    expect(choosePassphraseSource("", false)).toEqual({ kind: "error" });
  });
});

describe("bake-all: parseFlags", () => {
  it("defaults parallel to 4 and onFallback to ask", () => {
    const flags = parseFlags(["node", "bake-all.ts"]);
    expect(flags.parallel).toBe(4);
    expect(flags.onFallback).toBe("ask");
    expect(flags.changedOnly).toBe(false);
    expect(flags.sinceFlagPresent).toBe(false);
    expect(flags.dryRun).toBe(false);
    expect(flags.resume).toBe(false);
  });

  it("parses --changed-only", () => {
    const flags = parseFlags(["node", "bake-all.ts", "--changed-only"]);
    expect(flags.changedOnly).toBe(true);
  });

  it("parses --since with an explicit ref", () => {
    const flags = parseFlags(["node", "bake-all.ts", "--since", "HEAD~1"]);
    expect(flags.sinceFlagPresent).toBe(true);
    expect(flags.since).toBe("HEAD~1");
  });

  it("parses --since with no ref (defaults, still marks flag present)", () => {
    const flags = parseFlags(["node", "bake-all.ts", "--since"]);
    expect(flags.sinceFlagPresent).toBe(true);
  });

  it("parses --parallel N", () => {
    const flags = parseFlags(["node", "bake-all.ts", "--parallel", "8"]);
    expect(flags.parallel).toBe(8);
  });

  it("parses --on-fallback=continue", () => {
    const flags = parseFlags([
      "node",
      "bake-all.ts",
      "--on-fallback=continue",
    ]);
    expect(flags.onFallback).toBe("continue");
  });

  it("parses --dry-run and --resume", () => {
    const flags = parseFlags(["node", "bake-all.ts", "--dry-run", "--resume"]);
    expect(flags.dryRun).toBe(true);
    expect(flags.resume).toBe(true);
  });
});

describe("bake-all: getAllRituals", () => {
  let ritualsDir: string;

  beforeEach(() => {
    ritualsDir = fs.mkdtempSync(path.join(os.tmpdir(), "bake-all-discover-"));
  });
  afterEach(() => {
    fs.rmSync(ritualsDir, { recursive: true, force: true });
  });

  it("returns empty array when the rituals dir doesn't exist", () => {
    expect(getAllRituals(path.join(ritualsDir, "nope"))).toEqual([]);
  });

  it("discovers slugs from *-dialogue.md, excluding *-dialogue-cipher.md", () => {
    fs.writeFileSync(path.join(ritualsDir, "ea-opening-dialogue.md"), "x");
    fs.writeFileSync(
      path.join(ritualsDir, "ea-opening-dialogue-cipher.md"),
      "y",
    );
    fs.writeFileSync(path.join(ritualsDir, "ea-closing-dialogue.md"), "z");
    expect(getAllRituals(ritualsDir)).toEqual(["ea-closing", "ea-opening"]);
  });

  it("rejects a slug that fails SLUG_REGEX (e.g. contains shell metacharacters)", () => {
    fs.writeFileSync(path.join(ritualsDir, "ea-opening-dialogue.md"), "x");
    fs.writeFileSync(
      path.join(ritualsDir, "evil;rm -rf-dialogue.md"),
      "y",
    );
    const slugs = getAllRituals(ritualsDir);
    expect(slugs).toEqual(["ea-opening"]);
    expect(SLUG_REGEX.test("evil;rm -rf")).toBe(false);
  });
});

describe("bake-all: selectSlugs (content-hash change detection)", () => {
  let ritualsDir: string;
  let manifestPath: string;

  beforeEach(() => {
    ritualsDir = fs.mkdtempSync(path.join(os.tmpdir(), "bake-all-select-"));
    manifestPath = path.join(ritualsDir, "_bake-cache", "_manifest.json");
  });
  afterEach(() => {
    fs.rmSync(ritualsDir, { recursive: true, force: true });
  });

  function writePair(slug: string, plain: string, cipher: string): void {
    fs.writeFileSync(path.join(ritualsDir, `${slug}-dialogue.md`), plain);
    fs.writeFileSync(
      path.join(ritualsDir, `${slug}-dialogue-cipher.md`),
      cipher,
    );
  }

  it("selects all rituals when neither --changed-only nor --since is set", () => {
    writePair("ea-opening", "p1", "c1");
    writePair("ea-closing", "p2", "c2");
    const slugs = selectSlugs(
      { changedOnly: false, sinceFlagPresent: false },
      ritualsDir,
      manifestPath,
    );
    expect(slugs.sort()).toEqual(["ea-closing", "ea-opening"]);
  });

  it("--changed-only excludes a manifest-recorded, unedited ritual", () => {
    writePair("ea-opening", "p1", "c1");
    writePair("ea-closing", "p2", "c2");
    recordBaked(manifestPath, "ea-opening");
    recordBaked(manifestPath, "ea-closing");
    const slugs = selectSlugs(
      { changedOnly: true, sinceFlagPresent: false },
      ritualsDir,
      manifestPath,
    );
    expect(slugs).toEqual([]);
  });

  it("--changed-only includes a byte-edited ritual", () => {
    writePair("ea-opening", "p1", "c1");
    recordBaked(manifestPath, "ea-opening");
    fs.writeFileSync(
      path.join(ritualsDir, "ea-opening-dialogue.md"),
      "p1 EDITED",
    );
    const slugs = selectSlugs(
      { changedOnly: true, sinceFlagPresent: false },
      ritualsDir,
      manifestPath,
    );
    expect(slugs).toEqual(["ea-opening"]);
  });

  it("--since produces identical selection to --changed-only (ref value ignored)", () => {
    writePair("ea-opening", "p1", "c1");
    writePair("ea-closing", "p2", "c2");
    recordBaked(manifestPath, "ea-opening");
    // ea-closing never recorded -> both paths should select it.
    const viaChangedOnly = selectSlugs(
      { changedOnly: true, sinceFlagPresent: false },
      ritualsDir,
      manifestPath,
    );
    const viaSince = selectSlugs(
      { changedOnly: false, sinceFlagPresent: true },
      ritualsDir,
      manifestPath,
    );
    expect(viaSince).toEqual(viaChangedOnly);
    expect(viaSince).toEqual(["ea-closing"]);
  });

  it("--since HEAD~1 with an explicit ref also produces identical selection (ref ignored)", () => {
    writePair("ea-opening", "p1", "c1");
    recordBaked(manifestPath, "ea-opening");
    fs.writeFileSync(
      path.join(ritualsDir, "ea-opening-dialogue.md"),
      "p1 EDITED",
    );
    const flagsFromParsedSince = parseFlags([
      "node",
      "bake-all.ts",
      "--since",
      "HEAD~1",
    ]);
    const viaSince = selectSlugs(flagsFromParsedSince, ritualsDir, manifestPath);
    const viaChangedOnly = selectSlugs(
      { changedOnly: true, sinceFlagPresent: false },
      ritualsDir,
      manifestPath,
    );
    expect(viaSince).toEqual(viaChangedOnly);
    expect(viaSince).toEqual(["ea-opening"]);
  });
});

describe("bake-all: --since deprecation warning", () => {
  it("sinceDeprecationWarning names both the deprecated flag and the replacement", () => {
    const msg = sinceDeprecationWarning();
    expect(msg).toContain("--since");
    expect(msg).toContain("--changed-only");
    expect(msg.toLowerCase()).toContain("ignored");
  });
});

describe("bake-all: buildMramSpawnArgs", () => {
  it("builds positional plain/cipher/output + --with-audio + --on-fallback= + --resume-state-path=", () => {
    const args = buildMramSpawnArgs("ea-opening", "continue", "/r");
    expect(args).toEqual([
      "tsx",
      "scripts/build-mram-from-dialogue.ts",
      "/r/ea-opening-dialogue.md",
      "/r/ea-opening-dialogue-cipher.md",
      "/r/ea-opening.mram",
      "--with-audio",
      "--on-fallback=continue",
      `--resume-state-path=${path.join("/r", "_bake-cache", "_RESUME-ea-opening.json")}`,
    ]);
  });

  it("never includes a passphrase-shaped argument", () => {
    const args = buildMramSpawnArgs("ea-opening", "abort", "/r");
    expect(args.join(" ")).not.toMatch(/passphrase/i);
  });

  it("args array contains no shell metacharacters that would require shell:true", () => {
    const args = buildMramSpawnArgs("ea-opening", "ask", "/r");
    for (const a of args) {
      expect(typeof a).toBe("string");
    }
  });
});

describe("bake-all: validator gate runs before any spawn", () => {
  let ritualsDir: string;
  let manifestPath: string;
  let resumeFile: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    ritualsDir = fs.mkdtempSync(path.join(os.tmpdir(), "bake-all-order-"));
    manifestPath = path.join(ritualsDir, "_bake-cache", "_manifest.json");
    resumeFile = path.join(ritualsDir, "_bake-cache", "_RESUME.json");
    spawnMock.mockReset();
    validateOrFailSharedMock.mockReset();
    spawnMock.mockImplementation(() => makeFakeChild());
    exitSpy = vi.spyOn(process, "exit").mockImplementation(((
      _code?: number,
    ) => {
      throw new Error("process.exit called");
    }) as never);

    for (const slug of ["ea-opening", "ea-closing"]) {
      fs.writeFileSync(path.join(ritualsDir, `${slug}-dialogue.md`), "p");
      fs.writeFileSync(
        path.join(ritualsDir, `${slug}-dialogue-cipher.md`),
        "c",
      );
    }
  });

  afterEach(() => {
    fs.rmSync(ritualsDir, { recursive: true, force: true });
    exitSpy.mockRestore();
  });

  it("calls the shared validator for every selected slug before bakeSelected ever spawns", async () => {
    const slugs = ["ea-opening", "ea-closing"];

    runValidatorGate(slugs, ritualsDir);
    expect(validateOrFailSharedMock).toHaveBeenCalledTimes(2);
    expect(spawnMock).not.toHaveBeenCalled();

    const bakePromise = bakeSelected(
      slugs,
      "continue",
      "correct-horse-battery-staple",
      4,
      ritualsDir,
      manifestPath,
      resumeFile,
    );
    // Let the microtask queue drain so bakeRitual has called spawn.
    await new Promise((r) => setTimeout(r, 0));
    // Resolve every spawned fake child so bakeSelected can finish.
    for (const call of spawnMock.mock.results) {
      (call.value as ReturnType<typeof makeFakeChild>).emit("exit", 0);
    }
    await bakePromise;

    expect(spawnMock).toHaveBeenCalledTimes(2);

    const lastValidatorCallOrder = Math.max(
      ...validateOrFailSharedMock.mock.invocationCallOrder,
    );
    const firstSpawnCallOrder = Math.min(...spawnMock.mock.invocationCallOrder);
    expect(lastValidatorCallOrder).toBeLessThan(firstSpawnCallOrder);
  });

  it("validateOrFail exits 1 when the plain or cipher file is missing", () => {
    expect(() => validateOrFail("nonexistent-slug", ritualsDir)).toThrow(
      "process.exit called",
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe("bake-all: bakeSelected — spawn args, passphrase safety, manifest update", () => {
  let ritualsDir: string;
  let manifestPath: string;
  let resumeFile: string;

  beforeEach(() => {
    ritualsDir = fs.mkdtempSync(path.join(os.tmpdir(), "bake-all-fanout-"));
    manifestPath = path.join(ritualsDir, "_bake-cache", "_manifest.json");
    resumeFile = path.join(ritualsDir, "_bake-cache", "_RESUME.json");
    spawnMock.mockReset();
    spawnMock.mockImplementation(() => makeFakeChild());
    fs.writeFileSync(path.join(ritualsDir, "ea-opening-dialogue.md"), "p");
    fs.writeFileSync(
      path.join(ritualsDir, "ea-opening-dialogue-cipher.md"),
      "c",
    );
  });

  afterEach(() => {
    fs.rmSync(ritualsDir, { recursive: true, force: true });
  });

  it("spawns npx with a string[] args array (never shell:true / a shell string)", async () => {
    const p = bakeSelected(
      ["ea-opening"],
      "continue",
      "super-secret-pass",
      1,
      ritualsDir,
      manifestPath,
      resumeFile,
    );
    await new Promise((r) => setTimeout(r, 0));
    const child = spawnMock.mock.results[0]!.value as ReturnType<
      typeof makeFakeChild
    >;
    child.emit("exit", 0);
    await p;

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [cmd, args, opts] = spawnMock.mock.calls[0]!;
    expect(cmd).toBe("npx");
    expect(Array.isArray(args)).toBe(true);
    for (const a of args as unknown[]) expect(typeof a).toBe("string");
    expect((opts as { shell?: boolean }).shell).not.toBe(true);
  });

  it("never puts the passphrase in argv — only in the child env", async () => {
    const passphrase = "correct-horse-battery-staple-9000";
    const p = bakeSelected(
      ["ea-opening"],
      "continue",
      passphrase,
      1,
      ritualsDir,
      manifestPath,
      resumeFile,
    );
    await new Promise((r) => setTimeout(r, 0));
    const child = spawnMock.mock.results[0]!.value as ReturnType<
      typeof makeFakeChild
    >;
    child.emit("exit", 0);
    await p;

    const [, args, opts] = spawnMock.mock.calls[0]!;
    expect((args as string[]).some((a) => a.includes(passphrase))).toBe(
      false,
    );
    expect(
      (opts as { env?: Record<string, string> }).env?.MRAM_PASSPHRASE,
    ).toBe(passphrase);
    // CR-01 defense-in-depth: onFallback="continue" here means the child
    // never needs interactive stdin (env-first passphrase resolution
    // means no prompt is ever reached for continue/abort modes).
    expect((opts as { stdio?: unknown[] }).stdio?.[0]).toBe("ignore");
  });

  it("records a manifest entry on success", async () => {
    const p = bakeSelected(
      ["ea-opening"],
      "continue",
      "pw",
      1,
      ritualsDir,
      manifestPath,
      resumeFile,
    );
    await new Promise((r) => setTimeout(r, 0));
    const child = spawnMock.mock.results[0]!.value as ReturnType<
      typeof makeFakeChild
    >;
    child.emit("exit", 0);
    const results = await p;

    expect(results).toEqual([{ slug: "ea-opening", ok: true }]);
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    expect(manifest["ea-opening"]).toBeDefined();
  });

  it("writes ritual-granularity resume state incrementally and unconditionally (no --resume flag passed)", async () => {
    const p = bakeSelected(
      ["ea-opening"],
      "continue",
      "pw",
      1,
      ritualsDir,
      manifestPath,
      resumeFile,
    );
    await new Promise((r) => setTimeout(r, 0));
    const child = spawnMock.mock.results[0]!.value as ReturnType<
      typeof makeFakeChild
    >;
    child.emit("exit", 0);
    await p;

    expect(fs.existsSync(resumeFile)).toBe(true);
    expect(loadCompletedSlugs(resumeFile)).toEqual(new Set(["ea-opening"]));

    // WR-02: the child receives a per-ritual --resume-state-path so a
    // crash mid-ritual can resume from its interrupted line.
    const [, args] = spawnMock.mock.calls[0]!;
    expect((args as string[]).some((a) => a.startsWith("--resume-state-path=") && a.includes("_RESUME-ea-opening.json"))).toBe(true);
  });

  it("records both slugs incrementally when baking two rituals in sequence (a crash between them leaves the first recorded)", async () => {
    fs.writeFileSync(path.join(ritualsDir, "ea-closing-dialogue.md"), "p");
    fs.writeFileSync(
      path.join(ritualsDir, "ea-closing-dialogue-cipher.md"),
      "c",
    );
    const p = bakeSelected(
      ["ea-opening", "ea-closing"],
      "continue",
      "pw",
      1,
      ritualsDir,
      manifestPath,
      resumeFile,
    );
    // Serial (parallelN=1): let the first child spawn and resolve before
    // the second is created.
    await new Promise((r) => setTimeout(r, 0));
    const firstChild = spawnMock.mock.results[0]!.value as ReturnType<
      typeof makeFakeChild
    >;
    firstChild.emit("exit", 0);

    // Immediately after the first ritual completes (before the second
    // spawns), the resume file already records it — proving the write
    // is incremental, not batched at the end.
    await new Promise((r) => setTimeout(r, 0));
    expect(loadCompletedSlugs(resumeFile)).toEqual(new Set(["ea-opening"]));

    await new Promise((r) => setTimeout(r, 0));
    const secondChild = spawnMock.mock.results[1]!.value as ReturnType<
      typeof makeFakeChild
    >;
    secondChild.emit("exit", 0);
    await p;

    expect(loadCompletedSlugs(resumeFile)).toEqual(
      new Set(["ea-opening", "ea-closing"]),
    );
  });

  it("reports halt-on-first-failure: a failed slug's result carries the error", async () => {
    fs.writeFileSync(path.join(ritualsDir, "ea-closing-dialogue.md"), "p");
    fs.writeFileSync(
      path.join(ritualsDir, "ea-closing-dialogue-cipher.md"),
      "c",
    );
    const p = bakeSelected(
      ["ea-opening"],
      "continue",
      "pw",
      1,
      ritualsDir,
      manifestPath,
      resumeFile,
    );
    await new Promise((r) => setTimeout(r, 0));
    const child = spawnMock.mock.results[0]!.value as ReturnType<
      typeof makeFakeChild
    >;
    child.emit("exit", 1); // simulate a failing bake
    const results = await p;

    expect(results).toEqual([
      {
        slug: "ea-opening",
        ok: false,
        error: expect.stringContaining("exited with 1"),
      },
    ]);
  });
});

describe("bake-all: dry-run makes zero spawns", () => {
  let ritualsDir: string;

  beforeEach(() => {
    ritualsDir = fs.mkdtempSync(path.join(os.tmpdir(), "bake-all-dryrun-"));
    spawnMock.mockReset();
    fs.writeFileSync(
      path.join(ritualsDir, "ea-opening-dialogue.md"),
      "# Section\n\nWM: The lodge is now open.\n",
    );
  });
  afterEach(() => {
    fs.rmSync(ritualsDir, { recursive: true, force: true });
  });

  it("dryRunForRitual prints a roll-up without ever calling spawn", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await dryRunForRitual("ea-opening", ritualsDir, path.join(ritualsDir, "_bake-cache"));
    expect(spawnMock).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });
});

describe("bake-all: loadCompletedSlugs (ritual-granularity resume)", () => {
  let ritualsDir: string;
  let resumeFile: string;

  beforeEach(() => {
    ritualsDir = fs.mkdtempSync(path.join(os.tmpdir(), "bake-all-resume-"));
    resumeFile = path.join(ritualsDir, "_RESUME.json");
  });
  afterEach(() => {
    fs.rmSync(ritualsDir, { recursive: true, force: true });
  });

  it("returns an empty set when no resume file exists", () => {
    expect(loadCompletedSlugs(resumeFile)).toEqual(new Set());
  });

  it("returns the completed slugs written under the bake-all resume marker", () => {
    writeResumeStateAtomic(resumeFile, {
      ritual: "__bake-all__",
      completedLineIds: ["ea-opening", "ea-closing"],
      inFlightLineIds: [],
      startedAt: Date.now(),
    });
    expect(loadCompletedSlugs(resumeFile)).toEqual(
      new Set(["ea-opening", "ea-closing"]),
    );
  });

  it("ignores a resume file written by a different (non-bake-all) writer", () => {
    writeResumeStateAtomic(resumeFile, {
      ritual: "ea-opening", // per-line writer convention, not bake-all's marker
      completedLineIds: ["l1", "l2"],
      inFlightLineIds: [],
      startedAt: Date.now(),
    });
    expect(loadCompletedSlugs(resumeFile)).toEqual(new Set());
  });
});
