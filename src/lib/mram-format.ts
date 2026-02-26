/**
 * .mram (Masonic Ritual AI Mentor) file format.
 *
 * A single encrypted file that bundles both cipher text (abbreviated/encoded)
 * and plain text for each line of a ritual ceremony.
 *
 * File structure on disk (binary):
 *   [4 bytes] Magic: "MRAM"
 *   [1 byte]  Version (currently 1)
 *   [16 bytes] Salt (for PBKDF2 key derivation)
 *   [12 bytes] IV (for AES-256-GCM)
 *   [rest]    Ciphertext (AES-256-GCM encrypted JSON payload)
 *
 * The JSON payload decrypts to an MRAMDocument.
 */

// ============================================================
// Types
// ============================================================

export interface MRAMDocument {
  format: "MRAM";
  version: number;
  metadata: MRAMMetadata;
  roles: Record<string, string>;
  sections: MRAMSection[];
  lines: MRAMLine[];
}

export interface MRAMMetadata {
  jurisdiction: string;
  degree: string;
  ceremony: string;
  checksum: string; // SHA-256 of JSON.stringify(lines)
}

export interface MRAMSection {
  id: string;
  title: string;
  note?: string; // Optional note describing the section
}

export interface MRAMLine {
  id: number;
  section: string; // References MRAMSection.id
  role: string;    // Key into roles map (e.g., "WM", "SW", "JD")
  gavels: number;  // Number of gavel knocks (leading *)
  action: string | null; // Stage direction text or null
  cipher: string;  // Cipher/abbreviated text (shown to user)
  plain: string;   // Full plain text (used for AI coaching & comparison)
}

// ============================================================
// Constants
// ============================================================

const MAGIC = new Uint8Array([0x4D, 0x52, 0x41, 0x4D]); // "MRAM"
const FORMAT_VERSION = 1;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const PBKDF2_ITERATIONS = 310_000; // OWASP 2023 recommended minimum

// ============================================================
// Key derivation from passphrase
// ============================================================

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as Uint8Array<ArrayBuffer>,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// ============================================================
// Checksum
// ============================================================

async function computeChecksum(lines: MRAMLine[]): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify(lines));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ============================================================
// Encrypt: MRAMDocument + passphrase → .mram binary
// ============================================================

export async function encryptMRAM(
  doc: MRAMDocument,
  passphrase: string
): Promise<ArrayBuffer> {
  // Compute checksum over lines
  doc.metadata.checksum = await computeChecksum(doc.lines);

  const jsonBytes = new TextEncoder().encode(JSON.stringify(doc));

  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(passphrase, salt);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    jsonBytes
  );

  // Assemble: MAGIC + VERSION + SALT + IV + CIPHERTEXT
  const header = new Uint8Array(MAGIC.length + 1 + SALT_LENGTH + IV_LENGTH);
  let offset = 0;
  header.set(MAGIC, offset); offset += MAGIC.length;
  header[offset] = FORMAT_VERSION; offset += 1;
  header.set(salt, offset); offset += SALT_LENGTH;
  header.set(iv, offset);

  const result = new Uint8Array(header.length + ciphertext.byteLength);
  result.set(header, 0);
  result.set(new Uint8Array(ciphertext), header.length);

  return result.buffer;
}

// ============================================================
// Decrypt: .mram binary + passphrase → MRAMDocument
// ============================================================

export async function decryptMRAM(
  data: ArrayBuffer,
  passphrase: string
): Promise<MRAMDocument> {
  const bytes = new Uint8Array(data);
  const headerSize = MAGIC.length + 1 + SALT_LENGTH + IV_LENGTH;

  if (bytes.length < headerSize + 16) {
    throw new Error("Invalid file: too small to be a valid .mram file.");
  }

  // Verify magic bytes
  for (let i = 0; i < MAGIC.length; i++) {
    if (bytes[i] !== MAGIC[i]) {
      throw new Error(
        "Invalid file: not a recognized .mram ritual file. Only properly formatted ritual files are accepted."
      );
    }
  }

  // Read version
  const version = bytes[MAGIC.length];
  if (version !== FORMAT_VERSION) {
    throw new Error(
      `Unsupported file version (${version}). This app supports version ${FORMAT_VERSION}.`
    );
  }

  // Read salt, IV, ciphertext
  let offset = MAGIC.length + 1;
  const salt = bytes.slice(offset, offset + SALT_LENGTH);
  offset += SALT_LENGTH;
  const iv = bytes.slice(offset, offset + IV_LENGTH);
  offset += IV_LENGTH;
  const ciphertext = bytes.slice(offset);

  // Derive key and decrypt
  const key = await deriveKey(passphrase, salt);

  let plainBytes: ArrayBuffer;
  try {
    plainBytes = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext
    );
  } catch {
    throw new Error(
      "Decryption failed. The passphrase is incorrect or the file has been tampered with."
    );
  }

  // Parse JSON
  const json = new TextDecoder().decode(plainBytes);
  let doc: MRAMDocument;
  try {
    doc = JSON.parse(json);
  } catch {
    throw new Error("Decrypted content is not valid JSON. The file may be corrupted.");
  }

  // Validate structure
  if (doc.format !== "MRAM") {
    throw new Error("Invalid document format. Expected MRAM format marker.");
  }

  if (!doc.metadata || !doc.lines || !Array.isArray(doc.lines)) {
    throw new Error("Invalid document structure. Missing required fields.");
  }

  // Verify checksum
  const expectedChecksum = await computeChecksum(doc.lines);
  if (doc.metadata.checksum !== expectedChecksum) {
    throw new Error(
      "Checksum mismatch. The file contents may have been altered."
    );
  }

  return doc;
}

// ============================================================
// Validate .mram file header (quick check without decryption)
// ============================================================

export function isMRAMFile(data: ArrayBuffer): boolean {
  const bytes = new Uint8Array(data);
  if (bytes.length < MAGIC.length) return false;
  for (let i = 0; i < MAGIC.length; i++) {
    if (bytes[i] !== MAGIC[i]) return false;
  }
  return true;
}

// ============================================================
// Convert MRAMDocument lines to RitualSection-compatible format
// ============================================================

export interface MRAMRitualSection {
  id: string;
  degree: string;
  sectionName: string;
  speaker: string | null;
  text: string;        // Plain text (for comparison, TTS, AI)
  cipherText: string;  // Cipher text (for display to user)
  order: number;
  gavels: number;
  action: string | null;
}

export function mramToSections(doc: MRAMDocument): MRAMRitualSection[] {
  const sectionMap = new Map(doc.sections.map((s) => [s.id, s.title]));

  return doc.lines.map((line, index) => ({
    id: `mram-line-${line.id}`,
    degree: doc.metadata.degree,
    sectionName: sectionMap.get(line.section) || "Unknown Section",
    speaker: line.role || null,
    text: line.plain,
    cipherText: line.cipher,
    order: index,
    gavels: line.gavels,
    action: line.action,
  }));
}

/**
 * Build the plain-text-only version for AI context.
 * This reconstructs a readable ritual text from plain lines only —
 * cipher text is NEVER sent to the AI.
 */
export function mramToPlainText(doc: MRAMDocument): string {
  const sectionMap = new Map(doc.sections.map((s) => [s.id, s.title]));
  const lines: string[] = [];
  let currentSection = "";

  for (const line of doc.lines) {
    const sectionTitle = sectionMap.get(line.section) || "";
    if (sectionTitle !== currentSection) {
      currentSection = sectionTitle;
      lines.push(`\n### ${currentSection}\n`);
    }

    const gavels = "*".repeat(line.gavels);
    const action = line.action ? ` [Action: ${line.action}]` : "";
    const prefix = line.role ? `**${line.role}**: ` : "";
    lines.push(`${prefix}${gavels}${gavels ? " " : ""}${action}${action ? " " : ""}${line.plain}`);
  }

  return lines.join("\n").trim();
}
