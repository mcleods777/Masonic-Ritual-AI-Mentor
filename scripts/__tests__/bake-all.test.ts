// @vitest-environment node
/**
 * Tests for scripts/bake-all.ts (AUTHOR-02, AUTHOR-09).
 *
 * Scope: pure helpers only — parseFlags, clampParallel, getChangedRituals
 * (with tmp git repo fixture), dialogueChecksum, buildMramSpawnArgs (the
 * argv that the orchestrator passes to every build-mram sub-process —
 * including --resume-state-path/--ritual-slug/--skip-line-ids per D-06),
 * and clearResumeStateFile (the orchestrator-side _RESUME.json cleanup).
 * Per-line _RESUME.json WRITES are tested in scripts/__tests__/bake-helpers.test.ts
 * (Plan 06), because build-mram is the writer.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

import {
  parseFlags,
  clampParallel,
  getChangedRituals,
  dialogueChecksum,
  buildMramSpawnArgs,
  clearResumeStateFile,
} from "../bake-all";
import {
  readResumeState,
  writeResumeStateAtomic,
  type ResumeState,
} from "../lib/resume-state";

// ============================================================
// Shared tmp dir helper
// ============================================================
let tmpRoot: string;
let cwdSaved: string;
beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bake-all-test-"));
  cwdSaved = process.cwd();
});
afterEach(() => {
  process.chdir(cwdSaved);
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
});

// ============================================================
// parseFlags (AUTHOR-02)
// ============================================================
describe("bake-all flag parsing (AUTHOR-02)", () => {
  it("returns defaults when no flags given", () => {
    const f = parseFlags(["node", "bake-all.ts"]);
    expect(f.sinceFlagPresent).toBe(false);
    expect(f.since).toBeUndefined();
    expect(f.dryRun).toBe(false);
    expect(f.resume).toBe(false);
    expect(f.parallel).toBe(4);
    expect(f.verifyAudio).toBe(false);
  });

  it("--since <ref> parses value", () => {
    const f = parseFlags(["node", "bake-all.ts", "--since", "main"]);
    expect(f.sinceFlagPresent).toBe(true);
    expect(f.since).toBe("main");
  });

  it("--since with no following value defaults to HEAD~1", () => {
    const f = parseFlags(["node", "bake-all.ts", "--since"]);
    expect(f.sinceFlagPresent).toBe(true);
    expect(f.since).toBe("HEAD~1");
  });

  it("--dry-run + --resume + --verify-audio all recognized", () => {
    const f = parseFlags([
      "node",
      "bake-all.ts",
      "--dry-run",
      "--resume",
      "--verify-audio",
    ]);
    expect(f.dryRun).toBe(true);
    expect(f.resume).toBe(true);
    expect(f.verifyAudio).toBe(true);
  });

  it("--parallel <N> parses the numeric value", () => {
    const f = parseFlags(["node", "bake-all.ts", "--parallel", "8"]);
    expect(f.parallel).toBe(8);
  });
});

// ============================================================
// clampParallel (AUTHOR-09 D-07)
// ============================================================
describe("bake-all clampParallel (AUTHOR-09 D-07)", () => {
  it("default when undefined = 4", () => {
    expect(clampParallel(undefined)).toBe(4);
  });
  it("clamps 0 to 1", () => {
    expect(clampParallel(0)).toBe(1);
  });
  it("clamps negative to 1", () => {
    expect(clampParallel(-5)).toBe(1);
  });
  it("passes 1 through", () => {
    expect(clampParallel(1)).toBe(1);
  });
  it("passes 4 through", () => {
    expect(clampParallel(4)).toBe(4);
  });
  it("passes 16 through", () => {
    expect(clampParallel(16)).toBe(16);
  });
  it("clamps 17 to 16", () => {
    expect(clampParallel(17)).toBe(16);
  });
  it("clamps 99 to 16", () => {
    expect(clampParallel(99)).toBe(16);
  });
  it("NaN and non-numeric string fall back to 4", () => {
    expect(clampParallel(NaN)).toBe(4);
    expect(clampParallel("not a number")).toBe(4);
  });
});

// ============================================================
// getChangedRituals (AUTHOR-02 D-04, Pitfall 5)
// ============================================================
describe("bake-all getChangedRituals (AUTHOR-02 D-04)", () => {
  function runGit(args: string[], cwd: string) {
    execFileSync("git", args, { cwd, stdio: "ignore" });
  }

  function seedRepoWithRituals(
    root: string,
    rituals: Record<string, string>,
  ) {
    runGit(["init", "-q"], root);
    // Ensure commits work regardless of global git user config in CI.
    runGit(["config", "user.email", "t@t.t"], root);
    runGit(["config", "user.name", "t"], root);
    // Avoid refname issues on older git versions (default branch varies).
    runGit(["checkout", "-q", "-b", "main"], root);
    fs.mkdirSync(path.join(root, "rituals"));
    for (const [name, body] of Object.entries(rituals)) {
      fs.writeFileSync(path.join(root, "rituals", name), body);
    }
    runGit(["add", "rituals"], root);
    runGit(["commit", "-q", "-m", "initial"], root);
  }

  it("returns slugs for rituals whose dialogue files changed since ref", () => {
    seedRepoWithRituals(tmpRoot, {
      "a-dialogue.md": "## s\nWM: hello\n",
      "a-dialogue-cipher.md": "## s\nWM: h\n",
      "b-dialogue.md": "## s\nSW: world\n",
      "b-dialogue-cipher.md": "## s\nSW: w\n",
    });
    fs.writeFileSync(
      path.join(tmpRoot, "rituals", "a-dialogue.md"),
      "## s\nWM: hello modified\n",
    );
    runGit(["add", "."], tmpRoot);
    runGit(["commit", "-q", "-m", "edit a"], tmpRoot);

    process.chdir(tmpRoot);
    const slugs = getChangedRituals("HEAD~1");
    expect(slugs).toEqual(["a"]);
  });

  it("catches cipher-only changes (validators must still fire)", () => {
    seedRepoWithRituals(tmpRoot, {
      "c-dialogue.md": "## s\nWM: hello\n",
      "c-dialogue-cipher.md": "## s\nWM: h\n",
    });
    fs.writeFileSync(
      path.join(tmpRoot, "rituals", "c-dialogue-cipher.md"),
      "## s\nWM: h2\n",
    );
    runGit(["add", "."], tmpRoot);
    runGit(["commit", "-q", "-m", "cipher-only edit"], tmpRoot);

    process.chdir(tmpRoot);
    const slugs = getChangedRituals("HEAD~1");
    expect(slugs).toEqual(["c"]);
  });

  it("excludes deleted files (--diff-filter=d)", () => {
    seedRepoWithRituals(tmpRoot, {
      "d-dialogue.md": "## s\nWM: hello\n",
      "d-dialogue-cipher.md": "## s\nWM: h\n",
      "e-dialogue.md": "## s\nSW: keep\n",
      "e-dialogue-cipher.md": "## s\nSW: k\n",
    });
    fs.unlinkSync(path.join(tmpRoot, "rituals", "d-dialogue.md"));
    fs.unlinkSync(path.join(tmpRoot, "rituals", "d-dialogue-cipher.md"));
    runGit(["add", "-A"], tmpRoot);
    runGit(["commit", "-q", "-m", "delete d"], tmpRoot);

    process.chdir(tmpRoot);
    const slugs = getChangedRituals("HEAD~1");
    expect(slugs).not.toContain("d");
  });

  it("throws a clear message when not in a git repo", () => {
    // tmpRoot has no .git
    process.chdir(tmpRoot);
    expect(() => getChangedRituals("HEAD~1")).toThrow(/git repo/);
  });
});

// ============================================================
// dialogueChecksum
//
// NOTE: bake-all.ts resolves RITUALS_DIR = path.resolve("rituals") ONCE at
// module-load time using the test runner's cwd (the repo root). We can't
// redirect it via chdir for a single test. These tests write to the real
// rituals/ dir using unique slugs prefixed `__bake-all-test-{pid}-` and
// clean up in a finally block — avoids clobbering any real ritual files.
// ============================================================
describe("bake-all dialogueChecksum", () => {
  const realRitualsDir = path.resolve("rituals");

  it("returns stable sha256 for identical file", () => {
    fs.mkdirSync(realRitualsDir, { recursive: true });
    const slug = `__bake-all-test-${process.pid}-checksum-a`;
    const filePath = path.join(realRitualsDir, `${slug}-dialogue.md`);
    fs.writeFileSync(filePath, "hello\n");
    try {
      const a = dialogueChecksum(slug);
      const b = dialogueChecksum(slug);
      expect(a).toBe(b);
      expect(a).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  });

  it("changes when file content changes", () => {
    fs.mkdirSync(realRitualsDir, { recursive: true });
    const slug = `__bake-all-test-${process.pid}-checksum-b`;
    const filePath = path.join(realRitualsDir, `${slug}-dialogue.md`);
    fs.writeFileSync(filePath, "a\n");
    try {
      const a = dialogueChecksum(slug);
      fs.writeFileSync(filePath, "b\n");
      const b = dialogueChecksum(slug);
      expect(a).not.toBe(b);
    } finally {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  });
});

// ============================================================
// buildMramSpawnArgs (AUTHOR-02 D-06 — sub-process arg plumbing)
// ============================================================
describe("bake-all buildMramSpawnArgs (AUTHOR-02 D-06)", () => {
  it("emits --resume-state-path and --ritual-slug on every call", () => {
    const args = buildMramSpawnArgs(
      "ea-opening",
      { verifyAudio: false },
      [],
      "/tmp/custom-resume.json",
    );
    expect(args).toContain("--resume-state-path");
    expect(args).toContain("/tmp/custom-resume.json");
    expect(args).toContain("--ritual-slug");
    expect(args).toContain("ea-opening");
    // NOT set when skipLineIds is empty and verifyAudio is false.
    expect(args).not.toContain("--skip-line-ids");
    expect(args).not.toContain("--verify-audio");
  });

  it("emits the 3 positional paths build-mram-from-dialogue.ts requires", () => {
    const args = buildMramSpawnArgs("ea-opening", { verifyAudio: false }, []);
    // build-mram-from-dialogue.ts: Usage: <plain.md> <cipher.md> <output.mram>
    expect(args).toContain("rituals/ea-opening-dialogue.md");
    expect(args).toContain("rituals/ea-opening-dialogue-cipher.md");
    expect(args).toContain("rituals/ea-opening.mram");
  });

  it("emits --with-audio so the baker renders Opus (not structure-only)", () => {
    const args = buildMramSpawnArgs("ea-opening", { verifyAudio: false }, []);
    expect(args).toContain("--with-audio");
  });

  it("emits --skip-line-ids with comma-joined IDs when skip list is non-empty", () => {
    const args = buildMramSpawnArgs(
      "ea-opening",
      { verifyAudio: false },
      ["1", "2", "5"],
    );
    const idx = args.indexOf("--skip-line-ids");
    expect(idx).toBeGreaterThanOrEqual(0);
    // Value follows the flag as a separate argv element (Pitfall 5 analog).
    expect(args[idx + 1]).toBe("1,2,5");
  });

  it("emits --verify-audio when flag is true", () => {
    const args = buildMramSpawnArgs(
      "ea-opening",
      { verifyAudio: true },
      [],
    );
    expect(args).toContain("--verify-audio");
  });

  it("passes args as separate argv elements (no shell-quoting)", () => {
    // Every arg should be a standalone array element; no single element
    // contains "<whitespace>--" (which would indicate shell-string packing
    // rather than argv separation). Pitfall 5 analog for the
    // orchestrator → build-mram boundary.
    const args = buildMramSpawnArgs("my-ritual", { verifyAudio: true }, [
      "a",
      "b",
    ]);
    for (const el of args) {
      expect(el).not.toMatch(/\s--/);
    }
  });

  it("--resume reads _RESUME.json and passes completedLineIds via --skip-line-ids (end-to-end)", () => {
    // Integration fixture: seed a state file, read it, build spawn args.
    const stateFile = path.join(tmpRoot, "_RESUME.json");
    const state: ResumeState = {
      ritual: "x",
      completedLineIds: ["1", "2"],
      inFlightLineIds: ["3"],
      startedAt: Date.now(),
    };
    writeResumeStateAtomic(stateFile, state);

    const read = readResumeState(stateFile);
    expect(read).not.toBeNull();
    expect(read!.completedLineIds).toEqual(["1", "2"]);

    const args = buildMramSpawnArgs(
      "x",
      { verifyAudio: false },
      read!.completedLineIds,
    );
    const idx = args.indexOf("--skip-line-ids");
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(args[idx + 1]).toBe("1,2");
    // In-flight lines (3) are NOT passed — they retry on next invocation.
    expect(args[idx + 1]).not.toContain("3");
  });
});

// ============================================================
// clearResumeStateFile — _RESUME.json deleted after ritual completes cleanly
// ============================================================
describe("bake-all clearResumeStateFile (AUTHOR-02 D-06)", () => {
  it("_RESUME.json is deleted after ritual completes cleanly", () => {
    // Seed the state file at the orchestrator's expected path.
    // clearResumeStateFile() uses path.resolve("rituals/_bake-cache/_RESUME.json")
    // — a module-level constant. To exercise it, chdir into tmpRoot so
    // path.resolve yields the seeded state path.
    //
    // NOTE: Node resolves module-level `path.resolve(...)` once at import
    // time (via the real cwd), so the constant embedded in bake-all.ts is
    // frozen to the repo's CACHE_DIR. We can't redirect it by chdir. The
    // contract being tested here is "unlinkSync removes the file at
    // RESUME_FILE," so seed the file at exactly that real path (under a
    // temp subtree is ideal, but not reachable). Instead we mirror the
    // behavior: create a file at the real RESUME_FILE path, exercise the
    // helper, and restore the original file if it existed.
    const realCacheDir = path.resolve("rituals/_bake-cache");
    const realResumeFile = path.join(realCacheDir, "_RESUME.json");
    fs.mkdirSync(realCacheDir, { recursive: true });
    const hadPrior = fs.existsSync(realResumeFile);
    const priorContents = hadPrior
      ? fs.readFileSync(realResumeFile, "utf8")
      : null;
    try {
      const state: ResumeState = {
        ritual: "x",
        completedLineIds: ["1"],
        inFlightLineIds: [],
        startedAt: Date.now(),
      };
      writeResumeStateAtomic(realResumeFile, state);
      expect(fs.existsSync(realResumeFile)).toBe(true);

      clearResumeStateFile();

      expect(fs.existsSync(realResumeFile)).toBe(false);
    } finally {
      if (hadPrior && priorContents !== null) {
        fs.writeFileSync(realResumeFile, priorContents);
      }
    }
  });

  it("is a no-op when _RESUME.json is absent", () => {
    // Guard against accidental test-side deletion of a real prior state.
    const realCacheDir = path.resolve("rituals/_bake-cache");
    const realResumeFile = path.join(realCacheDir, "_RESUME.json");
    const hadPrior = fs.existsSync(realResumeFile);
    const priorContents = hadPrior
      ? fs.readFileSync(realResumeFile, "utf8")
      : null;
    try {
      if (hadPrior) fs.unlinkSync(realResumeFile);
      expect(() => clearResumeStateFile()).not.toThrow();
    } finally {
      if (hadPrior && priorContents !== null) {
        fs.writeFileSync(realResumeFile, priorContents);
      }
    }
  });
});
