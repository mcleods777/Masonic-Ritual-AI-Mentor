/**
 * Convert a pair of dialogue documents (plain + cipher) into an
 * MRAMDocument — the shape consumed by the app's `decryptMRAM()` pipeline.
 *
 * This module is pure data transformation; it does not touch the filesystem
 * or crypto. The CLI wrapper lives at `scripts/build-mram-from-dialogue.ts`.
 */

import {
  structureSignature,
  type DialogueDocument,
} from "./dialogue-format";

import type { MRAMDocument } from "./mram-format";

export interface BuildOptions {
  jurisdiction: string;
  degree: string;
  ceremony: string;
}

/**
 * Map from dialogue speaker label → canonical MRAM role id + display name.
 * Lookup is case-insensitive (see normalizeRole) so `WM`, `wm`, `Wm` all
 * resolve to the same canonical role, preventing typos from silently
 * creating phantom roles in the MRAM output.
 */
export const ROLE_MAP: Record<string, { id: string; display: string }> = {
  wm: { id: "WM", display: "Worshipful Master" },
  sw: { id: "SW", display: "Senior Warden" },
  jw: { id: "JW", display: "Junior Warden" },
  sd: { id: "SD", display: "Senior Deacon" },
  jd: { id: "JD", display: "Junior Deacon" },
  sec: { id: "Sec", display: "Secretary" },
  trs: { id: "Trs", display: "Treasurer" },
  tyler: { id: "Tyl", display: "Tiler" },
  voucher: { id: "Vchr", display: "Voucher" },
  all: { id: "ALL", display: "All Brethren" },
  "wm/chaplain": { id: "Ch", display: "Chaplain (or WM)" },
};

/**
 * Synthetic role used for structural cues like `[if vouched]`, `[else]`,
 * `[end]`, `[prayer — either version]`. These lines carry no spoken text
 * and are emitted so the app can render branch markers in the dialogue flow.
 */
export const CUE_ROLE = { id: "CUE", display: "Structural Cue" };

export function normalizeRole(speaker: string): { id: string; display: string } {
  // Case-insensitive lookup so `WM`, `wm`, `Wm` all resolve to the same
  // canonical entry. Unknown speakers fall through verbatim (preserving the
  // caller's casing) rather than being forced to lowercase.
  return ROLE_MAP[speaker.toLowerCase()] ?? { id: speaker, display: speaker };
}

export function buildFromDialogue(
  plain: DialogueDocument,
  cipher: DialogueDocument,
  opts: BuildOptions,
): MRAMDocument {
  if (structureSignature(plain) !== structureSignature(cipher)) {
    throw new Error(
      "Plain and cipher dialogue documents have divergent structure. " +
        "Run `npx tsx scripts/validate-rituals.ts` to see the diff.",
    );
  }

  const doc: MRAMDocument = {
    format: "MRAM",
    version: 1,
    metadata: {
      jurisdiction: opts.jurisdiction,
      degree: opts.degree,
      ceremony: opts.ceremony,
      checksum: "",
    },
    roles: {},
    sections: [],
    lines: [],
  };

  let lineId = 1;
  let currentSectionId = "s0";
  let sectionCounter = 0;

  for (let i = 0; i < plain.nodes.length; i++) {
    const pNode = plain.nodes[i];
    const cNode = cipher.nodes[i];

    if (pNode.kind === "section") {
      sectionCounter++;
      currentSectionId = `s${sectionCounter}`;
      doc.sections.push({ id: currentSectionId, title: pNode.title });
      continue;
    }

    if (pNode.kind === "line" && cNode.kind === "line") {
      const { id: roleId, display } = normalizeRole(pNode.speaker);
      if (!doc.roles[roleId]) doc.roles[roleId] = display;

      if (pNode.isAction) {
        // Speaker action (e.g. `SW: [due guard given]`) — convention is
        // action text lives in `action`, cipher/plain stay empty.
        doc.lines.push({
          id: lineId++,
          section: currentSectionId,
          role: roleId,
          gavels: 0,
          action: pNode.text,
          cipher: "",
          plain: "",
        });
      } else {
        doc.lines.push({
          id: lineId++,
          section: currentSectionId,
          role: roleId,
          gavels: 0,
          action: null,
          cipher: cNode.text,
          plain: pNode.text,
        });
      }
      continue;
    }

    if (pNode.kind === "cue") {
      if (!doc.roles[CUE_ROLE.id]) doc.roles[CUE_ROLE.id] = CUE_ROLE.display;
      doc.lines.push({
        id: lineId++,
        section: currentSectionId,
        role: CUE_ROLE.id,
        gavels: 0,
        action: pNode.text,
        cipher: "",
        plain: "",
      });
      continue;
    }
  }

  return doc;
}
