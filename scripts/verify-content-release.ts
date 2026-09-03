#!/usr/bin/env npx tsx
/**
 * Release gate for every direct rituals/*.mram asset. Output is aggregate
 * only: no filenames, ritual text, metadata values, roles, hashes, or paths.
 *
 * Usage: npx tsx scripts/verify-content-release.ts [--json]
 */

import * as path from "node:path";
import {
  verifyMramDirectory,
  type ContentReleaseReport,
} from "./lib/content-release";
import { readMramPassphrase } from "./lib/passphrase";

function printHumanReport(report: ContentReleaseReport): void {
  console.log(report.valid ? "Content release verification: PASS" : "Content release verification: FAIL");
  console.log(`MRAM files: ${report.fileCount}`);
  console.log(`Passing files: ${report.passedFileCount}`);
  console.log(`Failing files: ${report.failedFileCount}`);
  console.log(`Lines: ${report.lineCount}`);
  console.log(`Spoken lines: ${report.spokenLineCount}`);
  console.log(`Verified embedded Opus: ${report.embeddedAudioCount}`);
  const issues = Object.entries(report.issueCounts);
  if (issues.length > 0) {
    console.log("Issues:");
    for (const [code, count] of issues) console.log(`  ${code}: ${count}`);
  }
}

async function main(): Promise<void> {
  const arguments_ = process.argv.slice(2);
  const json = arguments_.includes("--json");
  if (arguments_.some((argument) => argument !== "--json") || arguments_.filter((argument) => argument === "--json").length > 1) {
    console.error("Usage: npx tsx scripts/verify-content-release.ts [--json]");
    process.exitCode = 1;
    return;
  }

  try {
    const passphrase = await readMramPassphrase();
    if (!passphrase) throw new Error("Passphrase unavailable");
    const report = verifyMramDirectory(path.resolve("rituals"), passphrase);
    if (json) console.log(JSON.stringify(report));
    else printHumanReport(report);
    if (!report.valid) process.exitCode = 1;
  } catch {
    const failure = {
      schemaVersion: 1 as const,
      valid: false as const,
      error: "verification-failed" as const,
    };
    if (json) console.log(JSON.stringify(failure));
    else console.error("Content release verification: FAIL (verification-failed)");
    process.exitCode = 1;
  }
}

void main();
