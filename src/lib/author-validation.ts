/**
 * Validation helpers for the /author review tool.
 *
 * Runs the same structural checks as scripts/validate-rituals.ts but
 * returns structured results instead of exiting — so the editor UI can
 * render per-line warnings inline and a roll-up status at the top.
 */

import {
  parseDialogue,
  structureSignature,
  type DialogueDocument,
  type DialogueNode,
  type DialogueWarning,
} from "./dialogue-format";
import { ROLE_MAP } from "./dialogue-to-mram";

export interface PairLineIssue {
  /** 0-indexed position in the paired node list (matches plain.nodes[i]). */
  index: number;
  severity: "error" | "warning";
  kind:
    | "structure-speaker"
    | "structure-kind"
    | "structure-action"
    | "structure-cue"
    | "unknown-role"
    | "empty-text"
    | "ratio-outlier";
  message: string;
}

export interface PairValidationResult {
  structureOk: boolean;
  plainWarnings: DialogueWarning[];
  cipherWarnings: DialogueWarning[];
  lineIssues: PairLineIssue[];
  counts: {
    plainNodes: number;
    cipherNodes: number;
    sections: number;
    spokenLines: number;
    actionLines: number;
    cues: number;
  };
  firstDivergence?: {
    index: number;
    plain: string;
    cipher: string;
  };
}

function nodeKindLabel(n: DialogueNode): string {
  if (n.kind === "section") return `S:${n.id}`;
  if (n.kind === "line") return `L:${n.speaker}:${n.isAction ? "A" : "T"}`;
  return `C:${n.text}`;
}

export function validatePair(
  plainSource: string,
  cipherSource: string,
): PairValidationResult {
  const plain = parseDialogue(plainSource);
  const cipher = parseDialogue(cipherSource);
  return validateParsedPair(plain, cipher);
}

export function validateParsedPair(
  plain: DialogueDocument,
  cipher: DialogueDocument,
): PairValidationResult {
  const lineIssues: PairLineIssue[] = [];

  const sigPlain = structureSignature(plain);
  const sigCipher = structureSignature(cipher);
  const structureOk = sigPlain === sigCipher;

  let firstDivergence: PairValidationResult["firstDivergence"];
  if (!structureOk) {
    const p = sigPlain.split("|");
    const c = sigCipher.split("|");
    for (let i = 0; i < Math.max(p.length, c.length); i++) {
      if (p[i] !== c[i]) {
        firstDivergence = {
          index: i,
          plain: p[i] ?? "(end)",
          cipher: c[i] ?? "(end)",
        };
        break;
      }
    }
  }

  const max = Math.max(plain.nodes.length, cipher.nodes.length);
  let sections = 0;
  let spokenLines = 0;
  let actionLines = 0;
  let cues = 0;

  for (let i = 0; i < max; i++) {
    const p = plain.nodes[i];
    const c = cipher.nodes[i];

    if (!p || !c) {
      lineIssues.push({
        index: i,
        severity: "error",
        kind: "structure-kind",
        message: !p
          ? "plain file is shorter than cipher at this position"
          : "cipher file is shorter than plain at this position",
      });
      continue;
    }

    if (p.kind !== c.kind) {
      lineIssues.push({
        index: i,
        severity: "error",
        kind: "structure-kind",
        message: `node kind mismatch: plain=${nodeKindLabel(p)} cipher=${nodeKindLabel(c)}`,
      });
      continue;
    }

    if (p.kind === "section") {
      sections++;
      continue;
    }

    if (p.kind === "cue" && c.kind === "cue") {
      cues++;
      if (p.text !== c.text) {
        lineIssues.push({
          index: i,
          severity: "error",
          kind: "structure-cue",
          message: `cue text must match across plain and cipher: "${p.text}" vs "${c.text}"`,
        });
      }
      continue;
    }

    if (p.kind === "line" && c.kind === "line") {
      if (p.speaker !== c.speaker) {
        lineIssues.push({
          index: i,
          severity: "error",
          kind: "structure-speaker",
          message: `speaker mismatch: plain="${p.speaker}" cipher="${c.speaker}"`,
        });
      }
      if (p.isAction !== c.isAction) {
        lineIssues.push({
          index: i,
          severity: "error",
          kind: "structure-action",
          message: `action flag mismatch: plain=${p.isAction} cipher=${c.isAction}`,
        });
      }

      if (!ROLE_MAP[p.speaker.toLowerCase()]) {
        lineIssues.push({
          index: i,
          severity: "warning",
          kind: "unknown-role",
          message: `speaker "${p.speaker}" is not in ROLE_MAP — will appear as its literal label in the .mram file`,
        });
      }

      if (p.isAction) {
        actionLines++;
      } else {
        spokenLines++;
        if (!p.text.trim()) {
          lineIssues.push({
            index: i,
            severity: "error",
            kind: "empty-text",
            message: "plain text is empty",
          });
        }
        if (!c.text.trim()) {
          lineIssues.push({
            index: i,
            severity: "error",
            kind: "empty-text",
            message: "cipher text is empty",
          });
        }

        const ratio = c.text.length / Math.max(p.text.length, 1);
        if (p.text.length >= 20 && (ratio > 1.0 || ratio < 0.05)) {
          lineIssues.push({
            index: i,
            severity: "warning",
            kind: "ratio-outlier",
            message:
              ratio > 1.0
                ? `cipher is longer than plain (${c.text.length} vs ${p.text.length} chars) — unusual for a cipher`
                : `cipher is much shorter than expected (${(ratio * 100).toFixed(0)}% of plain length)`,
          });
        }
      }
    }
  }

  return {
    structureOk,
    plainWarnings: plain.warnings,
    cipherWarnings: cipher.warnings,
    lineIssues,
    counts: {
      plainNodes: plain.nodes.length,
      cipherNodes: cipher.nodes.length,
      sections,
      spokenLines,
      actionLines,
      cues,
    },
    firstDivergence,
  };
}
