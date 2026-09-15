import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  readResumeState,
  writeResumeStateAtomic,
  type ResumeState,
} from "../lib/resume-state";

describe("resume-state", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "resume-state-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("readResumeState", () => {
    it("returns null when the file is missing", () => {
      const filePath = path.join(tmpDir, "_RESUME.json");
      expect(readResumeState(filePath)).toBeNull();
    });

    it("returns null on malformed JSON", () => {
      const filePath = path.join(tmpDir, "_RESUME.json");
      fs.writeFileSync(filePath, "{ not valid json");
      expect(readResumeState(filePath)).toBeNull();
    });

    it("returns null when required fields have the wrong type", () => {
      const filePath = path.join(tmpDir, "_RESUME.json");
      fs.writeFileSync(
        filePath,
        JSON.stringify({
          ritual: 123, // wrong type — should be string
          completedLineIds: [],
          inFlightLineIds: [],
          startedAt: Date.now(),
        }),
      );
      expect(readResumeState(filePath)).toBeNull();
    });

    it("returns null when completedLineIds is not an array", () => {
      const filePath = path.join(tmpDir, "_RESUME.json");
      fs.writeFileSync(
        filePath,
        JSON.stringify({
          ritual: "ea-opening",
          completedLineIds: "not-an-array",
          inFlightLineIds: [],
          startedAt: Date.now(),
        }),
      );
      expect(readResumeState(filePath)).toBeNull();
    });

    it("returns null for a bare-null JSON document", () => {
      const filePath = path.join(tmpDir, "_RESUME.json");
      fs.writeFileSync(filePath, "null");
      expect(readResumeState(filePath)).toBeNull();
    });
  });

  describe("writeResumeStateAtomic + readResumeState round-trip", () => {
    it("round-trips a well-formed state", () => {
      const filePath = path.join(tmpDir, "_RESUME.json");
      const state: ResumeState = {
        ritual: "ea-opening",
        completedLineIds: ["l1", "l2"],
        inFlightLineIds: ["l3"],
        startedAt: 1700000000000,
      };
      writeResumeStateAtomic(filePath, state);
      expect(readResumeState(filePath)).toEqual(state);
    });

    it("creates missing parent directories", () => {
      const filePath = path.join(tmpDir, "nested", "dir", "_RESUME.json");
      const state: ResumeState = {
        ritual: "ea-closing",
        completedLineIds: [],
        inFlightLineIds: [],
        startedAt: Date.now(),
      };
      writeResumeStateAtomic(filePath, state);
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it("leaves no tmp file behind after a successful write", () => {
      const filePath = path.join(tmpDir, "_RESUME.json");
      const state: ResumeState = {
        ritual: "ea-initiation",
        completedLineIds: ["a"],
        inFlightLineIds: [],
        startedAt: Date.now(),
      };
      writeResumeStateAtomic(filePath, state);
      const tmpFiles = fs
        .readdirSync(tmpDir)
        .filter((f) => f.endsWith(".tmp"));
      expect(tmpFiles).toEqual([]);
    });

    it("overwrites a prior state on re-write", () => {
      const filePath = path.join(tmpDir, "_RESUME.json");
      writeResumeStateAtomic(filePath, {
        ritual: "ea-opening",
        completedLineIds: ["l1"],
        inFlightLineIds: [],
        startedAt: 1,
      });
      writeResumeStateAtomic(filePath, {
        ritual: "ea-opening",
        completedLineIds: ["l1", "l2"],
        inFlightLineIds: [],
        startedAt: 2,
      });
      expect(readResumeState(filePath)).toEqual({
        ritual: "ea-opening",
        completedLineIds: ["l1", "l2"],
        inFlightLineIds: [],
        startedAt: 2,
      });
    });
  });
});
