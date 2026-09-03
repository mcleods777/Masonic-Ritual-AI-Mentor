// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { GET } from "../route";

const originalCwd = process.cwd();
const originalNodeEnv = process.env.NODE_ENV;
let projectRoot = "";
let extraTempDirs: string[] = [];

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "diagnostics-route-"));
  process.chdir(projectRoot);
  (process.env as Record<string, string | undefined>).NODE_ENV = "test";
});

afterEach(() => {
  process.chdir(originalCwd);
  (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
  fs.rmSync(projectRoot, { recursive: true, force: true });
  for (const dir of extraTempDirs) fs.rmSync(dir, { recursive: true, force: true });
  extraTempDirs = [];
});

describe("GET /api/author/diagnostics", () => {
  it("returns the sanitized schema without exposing the rituals directory", async () => {
    const response = await GET(
      new Request("http://localhost:3000/api/author/diagnostics", {
        headers: { host: "localhost:3000" },
      }),
    );

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({
      schemaVersion: 1,
      manifestStatus: "missing",
      manifestErrors: [],
      rituals: [],
    });
    expect(text).not.toContain(projectRoot);
  });

  it("is unavailable in production before filesystem diagnostics run", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "diagnostics-outside-"));
    extraTempDirs.push(outside);
    fs.symlinkSync(outside, path.join(projectRoot, "rituals"), "dir");

    const response = await GET(
      new Request("https://masonicmentor.app/api/author/diagnostics", {
        headers: { host: "masonicmentor.app" },
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not available" });
  });
});
