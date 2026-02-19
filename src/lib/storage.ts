/**
 * Encrypted IndexedDB storage for ritual documents.
 * All ritual text stays on the user's device, encrypted at rest.
 *
 * v2: Supports .mram files with separate cipher/plain text per line.
 *     Cipher text (user-facing) and plain text (AI-facing) are stored
 *     in separate encrypted fields so they never accidentally cross contexts.
 */

import type { MRAMDocument, MRAMRitualSection } from "./mram-format";
import { mramToSections, mramToPlainText } from "./mram-format";

const DB_NAME = "masonic-ritual-mentor";
const DB_VERSION = 2;
const DOCUMENTS_STORE = "documents";
const SECTIONS_STORE = "sections";
const SETTINGS_STORE = "settings";

// ============================================================
// IndexedDB helpers
// ============================================================

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(DOCUMENTS_STORE)) {
        db.createObjectStore(DOCUMENTS_STORE, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(SECTIONS_STORE)) {
        const sectionStore = db.createObjectStore(SECTIONS_STORE, {
          keyPath: "id",
        });
        sectionStore.createIndex("documentId", "documentId", { unique: false });
        sectionStore.createIndex("degree", "degree", { unique: false });
      }

      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
      }
    };
  });
}

// ============================================================
// Web Crypto encryption for ritual text at rest
// ============================================================

async function getOrCreateKey(): Promise<CryptoKey> {
  const db = await openDB();

  // Try to load existing key
  const existingKey = await new Promise<CryptoKey | null>((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, "readonly");
    const store = tx.objectStore(SETTINGS_STORE);
    const request = store.get("encryption-key");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      if (request.result) {
        crypto.subtle
          .importKey("jwk", request.result.value, { name: "AES-GCM", length: 256 }, true, [
            "encrypt",
            "decrypt",
          ])
          .then(resolve)
          .catch(() => resolve(null));
      } else {
        resolve(null);
      }
    };
  });

  if (existingKey) {
    db.close();
    return existingKey;
  }

  // Generate new key
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);

  // Store it
  const jwk = await crypto.subtle.exportKey("jwk", key);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, "readwrite");
    const store = tx.objectStore(SETTINGS_STORE);
    const request = store.put({ key: "encryption-key", value: jwk });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });

  db.close();
  return key;
}

async function encrypt(text: string): Promise<{ ciphertext: ArrayBuffer; iv: Uint8Array }> {
  const key = await getOrCreateKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(text);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return { ciphertext, iv };
}

async function decrypt(ciphertext: ArrayBuffer, iv: Uint8Array): Promise<string> {
  const key = await getOrCreateKey();
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as Uint8Array<ArrayBuffer> }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}

// ============================================================
// Document storage API
// ============================================================

export interface StoredDocument {
  id: string;
  title: string;
  createdAt: string;
  sectionCount: number;
  isMRAM: boolean;
}

interface StoredDocumentRecord {
  id: string;
  title: string;
  rawTextCipher: ArrayBuffer;
  rawTextIv: Uint8Array;
  createdAt: string;
  sectionCount: number;
  isMRAM: boolean;
}

interface StoredSectionRecord {
  id: string;
  documentId: string;
  degree: string;
  sectionName: string;
  speaker: string | null;
  // Plain text (for AI, comparison, TTS)
  textCipher: ArrayBuffer;
  textIv: Uint8Array;
  // Cipher text (for display to user) — only present for .mram documents
  cipherTextCipher?: ArrayBuffer;
  cipherTextIv?: Uint8Array;
  order: number;
  gavels: number;
  action: string | null;
}

/**
 * Save an MRAM document to IndexedDB with encryption.
 * Cipher text and plain text are encrypted into separate fields.
 */
export async function saveMRAMDocument(mramDoc: MRAMDocument): Promise<string> {
  const id = crypto.randomUUID();
  const db = await openDB();

  // Build plain-text-only representation for AI context
  const plainText = mramToPlainText(mramDoc);
  const { ciphertext: rawTextCipher, iv: rawTextIv } = await encrypt(plainText);

  const sections = mramToSections(mramDoc);
  const title = `${mramDoc.metadata.degree} - ${mramDoc.metadata.ceremony}`;

  // Save document record
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DOCUMENTS_STORE, "readwrite");
    const store = tx.objectStore(DOCUMENTS_STORE);
    const request = store.put({
      id,
      title,
      rawTextCipher,
      rawTextIv,
      createdAt: new Date().toISOString(),
      sectionCount: sections.length,
      isMRAM: true,
    } as StoredDocumentRecord);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });

  // Encrypt and save each section (cipher + plain separately)
  for (const section of sections) {
    const { ciphertext: textCipher, iv: textIv } = await encrypt(section.text);
    const { ciphertext: cipherTextCipher, iv: cipherTextIv } = await encrypt(section.cipherText);

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SECTIONS_STORE, "readwrite");
      const store = tx.objectStore(SECTIONS_STORE);
      const request = store.put({
        id: `${id}-${section.id}`,
        documentId: id,
        degree: section.degree,
        sectionName: section.sectionName,
        speaker: section.speaker,
        textCipher,
        textIv,
        cipherTextCipher,
        cipherTextIv,
        order: section.order,
        gavels: section.gavels,
        action: section.action,
      } as StoredSectionRecord);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  db.close();
  return id;
}

/**
 * Section data returned to the UI — includes both cipher and plain text.
 */
export interface RitualSectionWithCipher {
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

/**
 * List all stored documents (metadata only, no decryption)
 */
export async function listDocuments(): Promise<StoredDocument[]> {
  const db = await openDB();
  const docs = await new Promise<StoredDocument[]>((resolve, reject) => {
    const tx = db.transaction(DOCUMENTS_STORE, "readonly");
    const store = tx.objectStore(DOCUMENTS_STORE);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      resolve(
        (request.result as StoredDocumentRecord[]).map((d) => ({
          id: d.id,
          title: d.title,
          createdAt: d.createdAt,
          sectionCount: d.sectionCount,
          isMRAM: d.isMRAM || false,
        }))
      );
    };
  });
  db.close();
  return docs;
}

/**
 * Get sections for a document (decrypted) — returns both cipher and plain text.
 */
export async function getDocumentSections(documentId: string): Promise<RitualSectionWithCipher[]> {
  const db = await openDB();
  const records = await new Promise<StoredSectionRecord[]>((resolve, reject) => {
    const tx = db.transaction(SECTIONS_STORE, "readonly");
    const store = tx.objectStore(SECTIONS_STORE);
    const index = store.index("documentId");
    const request = index.getAll(documentId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as StoredSectionRecord[]);
  });
  db.close();

  // Decrypt each section
  const sections: RitualSectionWithCipher[] = [];
  for (const record of records) {
    const text = await decrypt(record.textCipher, record.textIv);

    // Decrypt cipher text if available (MRAM docs), otherwise use plain text
    let cipherText = text;
    if (record.cipherTextCipher && record.cipherTextIv) {
      cipherText = await decrypt(record.cipherTextCipher, record.cipherTextIv);
    }

    sections.push({
      id: record.id,
      degree: record.degree,
      sectionName: record.sectionName,
      speaker: record.speaker,
      text,
      cipherText,
      order: record.order,
      gavels: record.gavels ?? 0,
      action: record.action ?? null,
    });
  }

  return sections.sort((a, b) => a.order - b.order);
}

/**
 * Get full document plain text only (decrypted) — for AI context.
 * NEVER returns cipher text.
 */
export async function getDocumentPlainText(documentId: string): Promise<string> {
  const db = await openDB();
  const record = await new Promise<StoredDocumentRecord | undefined>((resolve, reject) => {
    const tx = db.transaction(DOCUMENTS_STORE, "readonly");
    const store = tx.objectStore(DOCUMENTS_STORE);
    const request = store.get(documentId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as StoredDocumentRecord | undefined);
  });
  db.close();

  if (!record) throw new Error("Document not found");
  return decrypt(record.rawTextCipher, record.rawTextIv);
}

/**
 * Delete a document and all its sections
 */
export async function deleteDocument(documentId: string): Promise<void> {
  const db = await openDB();

  // Delete document
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DOCUMENTS_STORE, "readwrite");
    const store = tx.objectStore(DOCUMENTS_STORE);
    const request = store.delete(documentId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });

  // Delete sections
  const sections = await new Promise<StoredSectionRecord[]>((resolve, reject) => {
    const tx = db.transaction(SECTIONS_STORE, "readonly");
    const store = tx.objectStore(SECTIONS_STORE);
    const index = store.index("documentId");
    const request = index.getAll(documentId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as StoredSectionRecord[]);
  });

  for (const section of sections) {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SECTIONS_STORE, "readwrite");
      const store = tx.objectStore(SECTIONS_STORE);
      const request = store.delete(section.id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  db.close();
}
