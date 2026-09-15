#!/usr/bin/env npx tsx

import { execFileSync } from "node:child_process";
import { findPrivateTreePaths } from "./lib/private-tree-guard";

const stagedOutput = execFileSync(
  "git",
  ["diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR"],
  { encoding: "utf8" },
);
const stagedPaths = stagedOutput.split("\0").filter(Boolean);
const privatePaths = findPrivateTreePaths(stagedPaths);

if (privatePaths.length > 0) {
  console.error("Refusing commit: private ritual paths are staged:");
  for (const filePath of privatePaths) console.error(`  ${filePath}`);
  process.exit(1);
}

console.log("Private-tree guard passed.");
