#!/usr/bin/env npx tsx
/**
 * build-mram.ts — Build a .mram encrypted ritual file from paired cipher/plain text.
 *
 * Input format: A markdown file where each spoken line appears TWICE in a row:
 *   1. Cipher (abbreviated) version
 *   2. Plain (full English) version
 *
 * Sections are marked with ### headings.
 * Notes are **Note:** lines.
 * Lines without a speaker prefix are stage directions or special text.
 *
 * Usage:
 *   npx tsx scripts/build-mram.ts <input.md> <output.mram> [passphrase]
 *
 * If passphrase is omitted, you'll be prompted.
 *
 * Example:
 *   npx tsx scripts/build-mram.ts ritual-ea-opening.md ea-opening.mram "MyLodgePass123"
 */

import * as fs from "fs";
import * as crypto from "crypto";
import * as readline from "readline";

// ============================================================
// Types (mirrors src/lib/mram-format.ts)
// ============================================================

interface MRAMDocument {
  format: "MRAM";
  version: number;
  metadata: {
    jurisdiction: string;
    degree: string;
    ceremony: string;
    checksum: string;
  };
  roles: Record<string, string>;
  sections: { id: string; title: string; note?: string }[];
  lines: {
    id: number;
    section: string;
    role: string;
    gavels: number;
    action: string | null;
    cipher: string;
    plain: string;
  }[];
}

// ============================================================
// Parser: paired cipher/plain markdown → MRAMDocument
// ============================================================

// Speaker pattern — matches lines like **WM**: or **Tyler**: or **Vchr**:
const SPEAKER_PATTERN =
  /^\*{0,2}(WM|SW|JW|SD|JD|Sec|Trs|Tyl|Tyler|Ch|Chap|ALL|All|BR|Bro|Bros|Voucher|Vchr|Marshal|Candidate|S|T|PRAYER)\*{0,2}\s*:\s*/i;

// Known roles with display names
const ROLE_MAP: Record<string, string> = {
  WM: "Worshipful Master",
  SW: "Senior Warden",
  JW: "Junior Warden",
  SD: "Senior Deacon",
  JD: "Junior Deacon",
  Sec: "Secretary",
  Trs: "Treasurer",
  Tyl: "Tiler",
  Tyler: "Tiler",
  Ch: "Chaplain",
  Chap: "Chaplain",
  ALL: "All Brethren",
  All: "All Brethren",
  BR: "Brother",
  Bro: "Brother",
  Bros: "Brethren",
  Voucher: "Voucher",
  Vchr: "Voucher",
  Marshal: "Marshal",
  Candidate: "Candidate",
  T: "Tiler",
  S: "Secretary",
};

function normalizeRole(role: string): string {
  // Normalize variants to canonical form
  const upper = role.toUpperCase();
  if (upper === "TYLER" || upper === "TYL") return "Tyl";
  if (upper === "VOUCHER" || upper === "VCHR") return "Vchr";
  if (upper === "CHAP") return "Ch";
  if (upper === "TRS") return "Trs";
  if (upper === "ALL") return "ALL";
  // Return as-is for standard abbreviations
  return role;
}

/**
 * Count leading gavel marks (* ** ***) and strip them from text.
 */
function extractGavels(text: string): { gavels: number; text: string } {
  const match = text.match(/^(\*{1,3})\s*/);
  if (match) {
    return { gavels: match[1].length, text: text.slice(match[0].length) };
  }
  return { gavels: 0, text };
}

/**
 * Extract action text from parentheses at the start of a line.
 * Actions look like: ( Opens door ) or ( Deacons rise )
 */
function extractAction(text: string): { action: string | null; text: string } {
  // Match leading parenthesized stage direction
  const match = text.match(/^\(\s*([^)]+)\s*\)\s*/);
  if (match) {
    const remaining = text.slice(match[0].length).trim();
    // If the entire line is a stage direction, return it as action with empty text
    if (!remaining) {
      return { action: match[1].trim(), text: "" };
    }
    return { action: match[1].trim(), text: remaining };
  }
  return { action: null, text };
}

interface ParsedLine {
  role: string;
  gavels: number;
  action: string | null;
  rawText: string;
}

function parseSpeakerLine(line: string): ParsedLine | null {
  const speakerMatch = line.match(SPEAKER_PATTERN);
  if (!speakerMatch) return null;

  const role = normalizeRole(speakerMatch[1]);
  let text = line.slice(speakerMatch[0].length).trim();

  const { gavels, text: afterGavels } = extractGavels(text);
  text = afterGavels;

  const { action, text: afterAction } = extractAction(text);
  text = afterAction;

  return { role, gavels, action, rawText: text };
}

function parseDocument(content: string): MRAMDocument {
  const lines = content.split("\n");

  const doc: MRAMDocument = {
    format: "MRAM",
    version: 1,
    metadata: {
      jurisdiction: "Grand Lodge of Iowa",
      degree: "Entered Apprentice",
      ceremony: "Opening on the First Degree",
      checksum: "",
    },
    roles: {},
    sections: [],
    lines: [],
  };

  const rolesUsed = new Set<string>();
  let currentSectionId = "s0";
  let sectionCounter = 0;
  let lineId = 1;

  // Collect paired lines: each speaker line appears twice (cipher then plain)
  const speakerLines: { cipher: ParsedLine; plain: ParsedLine; section: string }[] = [];
  // Buffer for collecting non-speaker blocks (PRAYER text, etc.)
  let specialBuffer: { cipher: string[]; plain: string[]; section: string; role: string } | null = null;

  // First pass: identify sections and collect all lines
  const rawParsedLines: {
    type: "section" | "note" | "speaker" | "special" | "separator" | "empty";
    content: string;
    parsed?: ParsedLine;
  }[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      rawParsedLines.push({ type: "empty", content: "" });
      continue;
    }

    if (trimmed === "---") {
      rawParsedLines.push({ type: "separator", content: "---" });
      continue;
    }

    // Section heading
    if (trimmed.startsWith("### ")) {
      rawParsedLines.push({ type: "section", content: trimmed.replace(/^###\s*/, "") });
      continue;
    }

    // Note
    if (trimmed.startsWith("**Note:") || trimmed.startsWith("*Note:")) {
      const noteText = trimmed.replace(/^\*{1,2}Note:\*{0,2}\s*/, "");
      rawParsedLines.push({ type: "note", content: noteText });
      continue;
    }

    // Speaker line
    const parsed = parseSpeakerLine(trimmed);
    if (parsed) {
      rawParsedLines.push({ type: "speaker", content: trimmed, parsed });
      continue;
    }

    // Special text (PRAYER, standalone actions in parens, etc.)
    rawParsedLines.push({ type: "special", content: trimmed });
  }

  // Second pass: pair cipher/plain lines
  // Speaker lines come in consecutive pairs: cipher first, plain second.
  // We identify pairs by matching consecutive speaker lines with the same role.
  let i = 0;
  while (i < rawParsedLines.length) {
    const entry = rawParsedLines[i];

    if (entry.type === "section") {
      sectionCounter++;
      currentSectionId = `s${sectionCounter}`;
      const sectionEntry: { id: string; title: string; note?: string } = {
        id: currentSectionId,
        title: entry.content,
      };
      // Check if next non-empty line is a note
      let j = i + 1;
      while (j < rawParsedLines.length && rawParsedLines[j].type === "empty") j++;
      if (j < rawParsedLines.length && rawParsedLines[j].type === "note") {
        sectionEntry.note = rawParsedLines[j].content;
      }
      doc.sections.push(sectionEntry);
      i++;
      continue;
    }

    if (entry.type === "note" || entry.type === "separator" || entry.type === "empty") {
      i++;
      continue;
    }

    if (entry.type === "speaker" && entry.parsed) {
      // Look for the next speaker line (skipping empties) to form a pair
      let j = i + 1;
      while (j < rawParsedLines.length && rawParsedLines[j].type === "empty") j++;

      if (j < rawParsedLines.length && rawParsedLines[j].type === "speaker" && rawParsedLines[j].parsed) {
        // This is a cipher/plain pair
        const cipherLine = entry.parsed;
        const plainLine = rawParsedLines[j].parsed!;

        rolesUsed.add(cipherLine.role);

        doc.lines.push({
          id: lineId++,
          section: currentSectionId,
          role: cipherLine.role,
          gavels: cipherLine.gavels || plainLine.gavels,
          action: cipherLine.action || plainLine.action,
          cipher: cipherLine.rawText,
          plain: plainLine.rawText,
        });

        i = j + 1;
        continue;
      }

      // Unpaired speaker line — treat as a cipher-only line (shouldn't happen in well-formed input)
      console.warn(`Warning: Unpaired speaker line at position ${i}: ${entry.content}`);
      i++;
      continue;
    }

    if (entry.type === "special") {
      // Collect consecutive special lines as a block (e.g., PRAYER text)
      // These come in pairs too: cipher then plain
      const specialLines: string[] = [];
      let j = i;
      while (j < rawParsedLines.length && (rawParsedLines[j].type === "special" || rawParsedLines[j].type === "empty")) {
        if (rawParsedLines[j].type === "special") {
          specialLines.push(rawParsedLines[j].content);
        }
        j++;
      }

      // Special blocks like PRAYER don't follow cipher/plain pairing
      // They're just plain text blocks — use the same text for both
      if (specialLines.length > 0) {
        const fullText = specialLines.join("\n");
        doc.lines.push({
          id: lineId++,
          section: currentSectionId,
          role: "PRAYER",
          gavels: 0,
          action: null,
          cipher: fullText,
          plain: fullText,
        });
      }

      i = j;
      continue;
    }

    i++;
  }

  // Build roles map from used roles
  for (const role of rolesUsed) {
    doc.roles[role] = ROLE_MAP[role] || role;
  }
  // Always include PRAYER if used
  if (doc.lines.some((l) => l.role === "PRAYER")) {
    doc.roles["PRAYER"] = "Prayer";
  }

  return doc;
}

// ============================================================
// Encryption (Node.js crypto — compatible with Web Crypto in browser)
// ============================================================

const MAGIC = Buffer.from("MRAM", "ascii");
const FORMAT_VERSION = 1;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const PBKDF2_ITERATIONS = 310_000;

function encryptMRAM(doc: MRAMDocument, passphrase: string): Buffer {
  // Compute checksum
  const linesJson = JSON.stringify(doc.lines);
  doc.metadata.checksum = crypto.createHash("sha256").update(linesJson).digest("hex");

  const jsonBytes = Buffer.from(JSON.stringify(doc), "utf-8");

  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);

  // Derive key with PBKDF2
  const key = crypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, 32, "sha256");

  // Encrypt with AES-256-GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(jsonBytes), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Assemble: MAGIC + VERSION + SALT + IV + CIPHERTEXT + AUTH_TAG
  // Note: Web Crypto's AES-GCM appends the auth tag to ciphertext automatically.
  // Node.js separates them. We concatenate ciphertext + authTag so the browser
  // can decrypt the whole blob as one piece.
  return Buffer.concat([
    MAGIC,
    Buffer.from([FORMAT_VERSION]),
    salt,
    iv,
    encrypted,
    authTag,
  ]);
}

// ============================================================
// CLI
// ============================================================

async function promptPassphrase(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  return new Promise((resolve) => {
    rl.question("Enter passphrase for .mram file: ", (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error("Usage: npx tsx scripts/build-mram.ts <input.md> <output.mram> [passphrase]");
    console.error("");
    console.error("Input format: Markdown with paired cipher/plain lines.");
    console.error("Each speaker line appears twice — cipher first, then plain text.");
    process.exit(1);
  }

  const inputPath = args[0];
  const outputPath = args[1];
  let passphrase = args[2];

  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }

  if (!passphrase) {
    passphrase = await promptPassphrase();
    if (!passphrase) {
      console.error("Error: Passphrase cannot be empty.");
      process.exit(1);
    }
  }

  console.error(`Reading ${inputPath}...`);
  const content = fs.readFileSync(inputPath, "utf-8");

  console.error("Parsing paired cipher/plain format...");
  const doc = parseDocument(content);

  console.error(`  Jurisdiction: ${doc.metadata.jurisdiction}`);
  console.error(`  Degree: ${doc.metadata.degree}`);
  console.error(`  Ceremony: ${doc.metadata.ceremony}`);
  console.error(`  Sections: ${doc.sections.length}`);
  console.error(`  Lines: ${doc.lines.length}`);
  console.error(`  Roles: ${Object.keys(doc.roles).join(", ")}`);

  console.error("Encrypting...");
  const encrypted = encryptMRAM(doc, passphrase);

  fs.writeFileSync(outputPath, encrypted);
  console.error(`Written ${encrypted.length} bytes to ${outputPath}`);
  console.error("Done.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
