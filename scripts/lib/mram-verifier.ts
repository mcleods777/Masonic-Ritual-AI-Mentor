import * as crypto from "node:crypto";
import type { MRAMDocument } from "../../src/lib/mram-format";

const MAGIC = Buffer.from("MRAM", "ascii");
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 310_000;

export type MramVerificationIssue =
  | "unsupported-format-version"
  | "missing-audio-format"
  | "invalid-audio-format"
  | "missing-voice-cast"
  | "missing-role-voice"
  | "empty-document"
  | "missing-embedded-audio"
  | "invalid-embedded-audio"
  | "checksum-mismatch";

export interface MramVerificationReport {
  schemaVersion: 1;
  valid: boolean;
  formatVersion: number;
  lineCount: number;
  spokenLineCount: number;
  embeddedAudioCount: number;
  issueCounts: Partial<Record<MramVerificationIssue, number>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMramDocument(value: unknown): value is MRAMDocument {
  if (!isRecord(value) || value.format !== "MRAM" || typeof value.version !== "number") {
    return false;
  }
  if (!isRecord(value.metadata) || typeof value.metadata.checksum !== "string") {
    return false;
  }
  if (!isRecord(value.roles) || !Array.isArray(value.sections) || !Array.isArray(value.lines)) {
    return false;
  }
  return value.lines.every(
    (line) =>
      isRecord(line) &&
      typeof line.id === "number" &&
      typeof line.section === "string" &&
      typeof line.role === "string" &&
      typeof line.plain === "string" &&
      typeof line.cipher === "string" &&
      (line.audio === undefined || typeof line.audio === "string"),
  );
}

function isOggOpusBase64(value: string): boolean {
  if (value.length === 0 || value.length % 4 !== 0) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;

  const audio = Buffer.from(value, "base64");
  if (audio.toString("base64") !== value || audio.length < 47) return false;
  if (audio.subarray(0, 4).toString("ascii") !== "OggS" || audio[4] !== 0) {
    return false;
  }

  const segmentCount = audio[26];
  const packetOffset = 27 + segmentCount;
  if (segmentCount === 0 || packetOffset > audio.length) return false;

  let packetLength = 0;
  let packetComplete = false;
  for (let index = 0; index < segmentCount; index++) {
    const segmentLength = audio[27 + index];
    packetLength += segmentLength;
    if (segmentLength < 255) {
      packetComplete = true;
      break;
    }
  }
  if (!packetComplete || packetLength < 19 || packetOffset + packetLength > audio.length) {
    return false;
  }
  return audio.subarray(packetOffset, packetOffset + 8).toString("ascii") === "OpusHead";
}

export function verifyMramDocument(document: MRAMDocument): MramVerificationReport {
  const spokenLines = document.lines.filter((line) => line.plain.trim().length > 0);
  let embeddedAudioCount = 0;
  let missingAudioCount = 0;
  let invalidAudioCount = 0;
  for (const line of spokenLines) {
    if (typeof line.audio !== "string" || line.audio.length === 0) {
      missingAudioCount++;
    } else if (!isOggOpusBase64(line.audio)) {
      invalidAudioCount++;
    } else {
      embeddedAudioCount++;
    }
  }

  const issueCounts: MramVerificationReport["issueCounts"] = {};
  const addIssue = (issue: MramVerificationIssue, count = 1): void => {
    issueCounts[issue] = (issueCounts[issue] ?? 0) + count;
  };

  if (document.version !== 3) addIssue("unsupported-format-version");
  if (spokenLines.length === 0) addIssue("empty-document");
  if (document.metadata.audioFormat === undefined) {
    addIssue("missing-audio-format");
  } else if (document.metadata.audioFormat !== "opus-32k-mono") {
    addIssue("invalid-audio-format");
  }

  const voiceCast = document.metadata.voiceCast;
  if (voiceCast === undefined) {
    addIssue("missing-voice-cast");
  } else {
    const spokenRoles = new Set(spokenLines.map((line) => line.role));
    const missingRoleVoiceCount = [...spokenRoles].filter((role) => {
      const voice = voiceCast[role];
      return typeof voice !== "string" || voice.trim().length === 0;
    }).length;
    if (missingRoleVoiceCount > 0) {
      addIssue("missing-role-voice", missingRoleVoiceCount);
    }
  }

  if (missingAudioCount > 0) {
    addIssue("missing-embedded-audio", missingAudioCount);
  }
  if (invalidAudioCount > 0) {
    addIssue("invalid-embedded-audio", invalidAudioCount);
  }

  return {
    schemaVersion: 1,
    valid: Object.keys(issueCounts).length === 0,
    formatVersion: document.version,
    lineCount: document.lines.length,
    spokenLineCount: spokenLines.length,
    embeddedAudioCount,
    issueCounts,
  };
}

export function verifyMramBuffer(
  buffer: Buffer,
  passphrase: string,
): MramVerificationReport {
  const minimumLength = MAGIC.length + 1 + SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH;
  if (buffer.length < minimumLength || !buffer.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("Invalid MRAM file");
  }

  const headerVersion = buffer[MAGIC.length];
  let offset = MAGIC.length + 1;
  const salt = buffer.subarray(offset, offset + SALT_LENGTH);
  offset += SALT_LENGTH;
  const iv = buffer.subarray(offset, offset + IV_LENGTH);
  offset += IV_LENGTH;
  const remaining = buffer.subarray(offset);
  const ciphertext = remaining.subarray(0, remaining.length - AUTH_TAG_LENGTH);
  const authTag = remaining.subarray(remaining.length - AUTH_TAG_LENGTH);

  const key = crypto.pbkdf2Sync(
    passphrase,
    salt,
    PBKDF2_ITERATIONS,
    32,
    "sha256",
  );
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  let plaintext: Buffer;
  try {
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error("Unable to decrypt MRAM file");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(plaintext.toString("utf8")) as unknown;
  } catch {
    throw new Error("Invalid MRAM payload");
  }
  if (!isMramDocument(parsed)) {
    throw new Error("Invalid MRAM payload");
  }
  const document = parsed;

  const report = verifyMramDocument(document);
  report.formatVersion = headerVersion;
  if (headerVersion !== 3) {
    report.issueCounts["unsupported-format-version"] = 1;
    report.valid = false;
  }
  const checksum = crypto
    .createHash("sha256")
    .update(JSON.stringify(document.lines))
    .digest("hex");
  if (document.metadata.checksum !== checksum) {
    report.issueCounts["checksum-mismatch"] = 1;
    report.valid = false;
  }
  return report;
}
