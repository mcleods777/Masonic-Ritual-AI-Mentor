import * as fs from "node:fs";
import * as path from "node:path";
import {
  verifyMramBuffer,
  type MramVerificationIssue,
} from "./mram-verifier";

export type ContentReleaseIssue =
  | MramVerificationIssue
  | "no-mram-files"
  | "unreadable-mram-file"
  | "unsafe-rituals-directory";

export interface ContentReleaseReport {
  schemaVersion: 1;
  valid: boolean;
  fileCount: number;
  passedFileCount: number;
  failedFileCount: number;
  lineCount: number;
  spokenLineCount: number;
  embeddedAudioCount: number;
  issueCounts: Partial<Record<ContentReleaseIssue, number>>;
}

export function verifyMramDirectory(
  directory: string,
  passphrase: string,
): ContentReleaseReport {
  let directoryStat: fs.Stats;
  try {
    directoryStat = fs.lstatSync(directory);
  } catch {
    directoryStat = {} as fs.Stats;
  }
  if (!directoryStat.isDirectory?.() || directoryStat.isSymbolicLink?.()) {
    return {
      schemaVersion: 1,
      valid: false,
      fileCount: 0,
      passedFileCount: 0,
      failedFileCount: 0,
      lineCount: 0,
      spokenLineCount: 0,
      embeddedAudioCount: 0,
      issueCounts: { "unsafe-rituals-directory": 1 },
    };
  }

  const candidates = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.name.endsWith(".mram"));

  const issueCounts: ContentReleaseReport["issueCounts"] = {};
  let passedFileCount = 0;
  let failedFileCount = 0;
  let lineCount = 0;
  let spokenLineCount = 0;
  let embeddedAudioCount = 0;

  for (const candidate of candidates) {
    if (!candidate.isFile() || candidate.isSymbolicLink()) {
      failedFileCount++;
      issueCounts["unreadable-mram-file"] =
        (issueCounts["unreadable-mram-file"] ?? 0) + 1;
      continue;
    }

    try {
      const report = verifyMramBuffer(
        fs.readFileSync(path.join(directory, candidate.name)),
        passphrase,
      );
      lineCount += report.lineCount;
      spokenLineCount += report.spokenLineCount;
      embeddedAudioCount += report.embeddedAudioCount;
      if (report.valid) passedFileCount++;
      else failedFileCount++;
      for (const [issue, count] of Object.entries(report.issueCounts)) {
        const typedIssue = issue as ContentReleaseIssue;
        issueCounts[typedIssue] = (issueCounts[typedIssue] ?? 0) + (count ?? 0);
      }
    } catch {
      failedFileCount++;
      issueCounts["unreadable-mram-file"] =
        (issueCounts["unreadable-mram-file"] ?? 0) + 1;
    }
  }

  if (candidates.length === 0) issueCounts["no-mram-files"] = 1;

  return {
    schemaVersion: 1,
    valid: failedFileCount === 0 && candidates.length > 0,
    fileCount: candidates.length,
    passedFileCount,
    failedFileCount,
    lineCount,
    spokenLineCount,
    embeddedAudioCount,
    issueCounts,
  };
}
