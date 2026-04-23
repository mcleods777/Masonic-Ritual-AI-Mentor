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
import { type StylesFile, isValidStyleTag, hashLineText } from "./styles";

export interface BuildOptions {
  jurisdiction: string;
  degree: string;
  ceremony: string;
  /**
   * Optional styles sidecar payload. Keys are sha256(line.plain) — any
   * entry whose hash doesn't match a current line is treated as an
   * orphan and dropped with a warning (review decision 7A). Entries
   * with invalid style tags are dropped too.
   */
  styles?: StylesFile;
}

/**
 * Report accumulator for styles ingestion. Returned alongside MRAMDocument
 * when building a styled ritual so the CLI can surface dropped orphans.
 */
export interface StyleIngestionReport {
  applied: number;
  dropped: { reason: "orphan" | "invalid-tag"; lineHash: string; style: string }[];
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
  ss: { id: "SS", display: "Senior Steward" },
  js: { id: "JS", display: "Junior Steward" },
  c: { id: "C", display: "Candidate" },
  ch: { id: "Ch", display: "Chaplain" },
  chp: { id: "Ch", display: "Chaplain" },
  voucher: { id: "Vchr", display: "Voucher" },
  all: { id: "ALL", display: "All Brethren" },
  // Legacy compound labels — always resolve to plain Chaplain.
  "wm/chaplain": { id: "Ch", display: "Chaplain" },
  "wm/chp": { id: "Ch", display: "Chaplain" },
  "wm/ch": { id: "Ch", display: "Chaplain" },
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

export async function buildFromDialogue(
  plain: DialogueDocument,
  cipher: DialogueDocument,
  opts: BuildOptions,
): Promise<{ doc: MRAMDocument; report: StyleIngestionReport }> {
  if (structureSignature(plain) !== structureSignature(cipher)) {
    throw new Error(
      "Plain and cipher dialogue documents have divergent structure. " +
        "Run `npx tsx scripts/validate-rituals.ts` to see the diff.",
    );
  }

  // Pre-hash every plain line + build the styles lookup.
  // Per review decision 12A: keys are sha256(plain text), not lineId,
  // so insert/delete doesn't orphan suffix styles.
  const plainLineHashes = new Map<number, string>();
  const styleByHash = new Map<string, string>();
  const report: StyleIngestionReport = { applied: 0, dropped: [] };

  if (opts.styles) {
    // Validate every entry before using it. Invalid tags are dropped
    // with a report entry — never silently passed to Gemini.
    for (const entry of opts.styles.styles) {
      if (!isValidStyleTag(entry.style)) {
        report.dropped.push({
          reason: "invalid-tag",
          lineHash: entry.lineHash,
          style: entry.style,
        });
        continue;
      }
      styleByHash.set(entry.lineHash, entry.style);
    }
  }

  if (styleByHash.size > 0) {
    // Only hash lines when we have a styles file to match against.
    // Skips the crypto.subtle round-trip on unstyled builds.
    for (let i = 0; i < plain.nodes.length; i++) {
      const n = plain.nodes[i];
      if (n.kind === "line" && !n.isAction) {
        plainLineHashes.set(i, await hashLineText(n.text));
      }
    }
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
        const hash = plainLineHashes.get(i);
        const style = hash ? styleByHash.get(hash) : undefined;
        if (style && hash) {
          report.applied++;
          // Mark this hash as consumed so we can detect orphans below.
          styleByHash.delete(hash);
        }
        doc.lines.push({
          id: lineId++,
          section: currentSectionId,
          role: roleId,
          gavels: 0,
          action: null,
          cipher: cNode.text,
          plain: pNode.text,
          ...(style ? { style } : {}),
        });
      }
      continue;
    }

    if (pNode.kind === "cue") {
      if (!doc.roles[CUE_ROLE.id]) doc.roles[CUE_ROLE.id] = CUE_ROLE.display;

      // Gavel cues: `[gavels: N]` carries the knock count for this line
      // transition. The parser stores them as generic cues with text
      // "gavels: N"; the transformer interprets them here. All other cue
      // text (`if vouched`, `else`, `end`, `prayer — either version`,
      // etc.) keeps the existing behavior (gavels: 0, CUE role, cue text
      // in the `action` field).
      const gavelMatch = /^gavels:\s*(\d+)$/i.exec(pNode.text);
      if (gavelMatch) {
        const n = parseInt(gavelMatch[1], 10);
        if (n > 0) {
          doc.lines.push({
            id: lineId++,
            section: currentSectionId,
            role: CUE_ROLE.id,
            gavels: n,
            action: null,
            cipher: "",
            plain: "",
          });
          continue;
        }
        // gavels: 0 is pointless — skip the cue entirely. The parser
        // could have warned about this in a future version, but for now
        // we silently elide it.
        continue;
      }

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

  // Any styles still in the map didn't match a current line — orphans.
  // Collected for the caller's report; dropped from the build silently
  // (the warning happens in the CLI or author UI that renders the report).
  for (const [lineHash, style] of styleByHash) {
    report.dropped.push({ reason: "orphan", lineHash, style });
  }

  return { doc, report };
}
