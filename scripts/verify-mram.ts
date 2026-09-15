#!/usr/bin/env npx tsx
/**
 * Decrypt and validate one .mram file without printing ritual content,
 * metadata values, role names, hashes, passphrases, or filesystem paths.
 *
 * Usage: npx tsx scripts/verify-mram.ts [--json] <file.mram>
 */

import * as fs from "node:fs";
import { verifyMramBuffer, type MramVerificationReport } from "./lib/mram-verifier";
import { readMramPassphrase } from "./lib/passphrase";

interface FailureReport {
  schemaVersion: 1;
  valid: false;
  error: "verification-failed";
}

function printHumanReport(report: MramVerificationReport): void {
  console.log(report.valid ? "MRAM verification: PASS" : "MRAM verification: FAIL");
  console.log(`Format version: ${report.formatVersion}`);
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
  const rawArguments = process.argv.slice(2);
  const json = rawArguments.includes("--json");
  const positional = rawArguments.filter((argument) => argument !== "--json");
  if (positional.length !== 1 || rawArguments.some((argument) => argument.startsWith("--") && argument !== "--json")) {
    console.error("Usage: npx tsx scripts/verify-mram.ts [--json] <file.mram>");
    process.exitCode = 1;
    return;
  }

  try {
    const filePath = positional[0];
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Invalid input");
    const passphrase = await readMramPassphrase();
    if (!passphrase) throw new Error("Passphrase unavailable");
    const report = verifyMramBuffer(fs.readFileSync(filePath), passphrase);
    if (json) console.log(JSON.stringify(report));
    else printHumanReport(report);
    if (!report.valid) process.exitCode = 1;
  } catch {
    const failure: FailureReport = {
      schemaVersion: 1,
      valid: false,
      error: "verification-failed",
    };
    if (json) console.log(JSON.stringify(failure));
    else console.error("MRAM verification: FAIL (verification-failed)");
    process.exitCode = 1;
  }
}

void main();
