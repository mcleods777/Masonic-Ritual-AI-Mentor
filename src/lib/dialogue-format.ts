/**
 * Parser for the "dialogue" ritual format — the conversational,
 * narrator-free form used in `rituals/*-dialogue.md` files.
 *
 * Format spec:
 *
 *   # Title                       H1: document title (first only)
 *   any prose before first ##     collected as preamble
 *   ## I. Section Title           H2: section header
 *   ---                           section divider (ignored)
 *   SPEAKER: utterance            a spoken line
 *   SPEAKER: [stage action]       a ritual action performed by that speaker
 *   [standalone bracketed cue]    a structural cue (branch, prayer alt, etc.)
 *   (blank line)                  ignored
 *
 * SPEAKER is `[A-Za-z][A-Za-z0-9/]*` — letters, digits, and `/` so that
 * compound roles like `WM/Chaplain` are valid.
 *
 * This format is deliberately minimal so that an LLM can consume it with
 * near-zero structural overhead (it matches transcript/screenplay shape
 * that LLMs are heavily trained on), while still being trivially parseable
 * by a regex into structured records.
 */

export interface DialogueSection {
  kind: "section";
  /** URL-safe slug derived from the title. */
  id: string;
  title: string;
  /** 1-indexed source line number. */
  lineNo: number;
}

export interface DialogueSpokenLine {
  kind: "line";
  speaker: string;
  /** Utterance text, with action brackets stripped if `isAction` is true. */
  text: string;
  /** True if the text was wrapped in `[...]` — i.e. a stage action by the speaker. */
  isAction: boolean;
  lineNo: number;
}

export interface DialogueCue {
  kind: "cue";
  /** Cue text with surrounding brackets stripped and whitespace trimmed. */
  text: string;
  lineNo: number;
}

export type DialogueNode = DialogueSection | DialogueSpokenLine | DialogueCue;

/**
 * A line inside a section that didn't match any known shape (speaker,
 * cue, divider, header). Collected so callers can surface warnings instead
 * of silently dropping content — useful for catching hidden-character bugs
 * where a BOM or RTL mark prevents the speaker regex from matching.
 */
export interface DialogueWarning {
  lineNo: number;
  line: string;
  reason: string;
}

/**
 * Metadata extracted from a YAML-style frontmatter block at the very top
 * of a plain dialogue file:
 *
 *   ---
 *   jurisdiction: Grand Lodge of Iowa
 *   degree: Entered Apprentice
 *   ceremony: Opening on the First Degree
 *   ---
 *
 * The build pipeline reads these fields from the plain dialogue file and
 * feeds them into MRAMDocument.metadata. Cipher dialogue files do NOT
 * carry their own frontmatter — they inherit from the plain file at build
 * time (simpler authoring, no lockstep risk between two frontmatter blocks).
 */
export interface DialogueMetadata {
  jurisdiction?: string;
  degree?: string;
  ceremony?: string;
}

export interface DialogueDocument {
  title: string;
  preamble: string[];
  nodes: DialogueNode[];
  warnings: DialogueWarning[];
  metadata?: DialogueMetadata;
}

// Speaker: letter start, then letters/digits/slash.
const SPEAKER_RE = /^([A-Za-z][A-Za-z0-9/]*):\s+(.+)$/;
const H1_RE = /^# (.+)$/;
const H2_RE = /^## (.+)$/;
const DIVIDER_RE = /^-{3,}$/;
const FRONTMATTER_KV_RE = /^([a-zA-Z][a-zA-Z0-9_]*)\s*:\s*(.*)$/;
const BRACKETED_RE = /^\[(.+)\]$/;

/**
 * Extract a YAML-style frontmatter block from the top of the source if
 * present. A frontmatter block is delimited by a `---` line as the first
 * non-whitespace line of the file, followed by `key: value` pairs, closed
 * by another `---` line. If the file has no frontmatter, returns
 * `{metadata: undefined, remainingLines: allLines}`.
 *
 * This is deliberately a tiny single-file YAML subset — we do NOT use a
 * full YAML parser because (a) the format we need is trivial (flat
 * string-keyed scalars), (b) a full YAML parser is a supply-chain and
 * attack-surface expansion we don't need, and (c) ambiguous YAML features
 * like anchors, tags, and nested mappings have no place in ritual metadata.
 *
 * Known limitations vs full YAML:
 *   - No nested mappings
 *   - No multi-line values (| > folding)
 *   - No arrays
 *   - Quoted strings: unquoted only, surrounding quotes stripped if present
 *   - Comments not supported inside frontmatter
 *
 * All values are returned as strings — consumers validate types.
 */
interface FrontmatterResult {
  metadata?: DialogueMetadata;
  remainingLines: string[];
  /** 0-indexed offset into the original source for remaining line numbers. */
  lineOffset: number;
  /** Any parse warnings (malformed keys, ignored lines inside the block). */
  warnings: DialogueWarning[];
}

function extractFrontmatter(source: string): FrontmatterResult {
  const lines = source.split(/\r?\n/);
  const warnings: DialogueWarning[] = [];

  // Find first non-empty line
  let firstIdx = 0;
  while (firstIdx < lines.length && lines[firstIdx].trim() === "") {
    firstIdx++;
  }

  // If the first non-empty line isn't exactly `---`, there's no frontmatter
  if (firstIdx >= lines.length || lines[firstIdx].trim() !== "---") {
    return {
      metadata: undefined,
      remainingLines: lines,
      lineOffset: 0,
      warnings: [],
    };
  }

  // Walk forward looking for the closing `---`
  const openLineNo = firstIdx + 1;
  let closeIdx = -1;
  for (let i = firstIdx + 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      closeIdx = i;
      break;
    }
  }

  if (closeIdx === -1) {
    // Unclosed frontmatter — treat as a parse error and emit a warning.
    // The rest of the file is still parsed, but metadata is undefined.
    warnings.push({
      lineNo: openLineNo,
      line: lines[firstIdx],
      reason: "Frontmatter block opened with '---' but never closed",
    });
    return {
      metadata: undefined,
      remainingLines: lines,
      lineOffset: 0,
      warnings,
    };
  }

  // Parse key: value pairs between firstIdx and closeIdx
  const metadata: Record<string, string> = {};
  for (let i = firstIdx + 1; i < closeIdx; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed) continue; // blank lines allowed inside frontmatter
    const kv = FRONTMATTER_KV_RE.exec(trimmed);
    if (!kv) {
      warnings.push({
        lineNo: i + 1,
        line: raw,
        reason: "Frontmatter line does not match 'key: value' format",
      });
      continue;
    }
    const key = kv[1];
    let value = kv[2].trim();
    // Strip surrounding single or double quotes if present
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    metadata[key] = value;
  }

  return {
    metadata: metadata as DialogueMetadata,
    remainingLines: lines.slice(closeIdx + 1),
    lineOffset: closeIdx + 1,
    warnings,
  };
}

export function parseDialogue(source: string): DialogueDocument {
  const fm = extractFrontmatter(source);
  const lines = fm.remainingLines;
  const nodes: DialogueNode[] = [];
  const warnings: DialogueWarning[] = [...fm.warnings];
  let title = "";
  const preamble: string[] = [];
  let seenFirstSection = false;
  // Track used section slugs to produce unique ids on collision. Two
  // sections with titles that slugify to the same string (e.g. "The
  // Opening" and "The Opening!") both get a valid id instead of silently
  // sharing one. The first collision becomes `foo-2`, the next `foo-3`.
  const usedSectionIds = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    // Line numbers are reported in terms of the original source file, so
    // warnings and node.lineNo remain accurate even when frontmatter was
    // stripped from the head of the file.
    const lineNo = i + 1 + fm.lineOffset;

    if (!line) continue;
    if (DIVIDER_RE.test(line)) continue;

    const h1 = H1_RE.exec(line);
    if (h1) {
      if (!title) title = h1[1];
      else preamble.push(line);
      continue;
    }

    const h2 = H2_RE.exec(line);
    if (h2) {
      seenFirstSection = true;
      const sectionTitle = h2[1];
      const baseSlug = slugify(sectionTitle);
      // Dedup: if the slug is already used, append -2, -3, ... until unique
      let id = baseSlug;
      let suffix = 2;
      while (usedSectionIds.has(id)) {
        id = `${baseSlug}-${suffix}`;
        suffix++;
      }
      usedSectionIds.add(id);
      nodes.push({
        kind: "section",
        id,
        title: sectionTitle,
        lineNo,
      });
      continue;
    }

    // Everything before the first `##` is prose preamble — do not try to
    // parse speaker lines or cues out of it, or we'll misread documentation
    // like "Format: `SPEAKER: ...`" as an actual speaker utterance.
    if (!seenFirstSection) {
      preamble.push(line);
      continue;
    }

    const speaker = SPEAKER_RE.exec(line);
    if (speaker) {
      const speakerName = speaker[1];
      const rawText = speaker[2].trim();
      const bracketed = BRACKETED_RE.exec(rawText);
      nodes.push({
        kind: "line",
        speaker: speakerName,
        text: bracketed ? bracketed[1].trim() : rawText,
        isAction: !!bracketed,
        lineNo,
      });
      continue;
    }

    const cue = BRACKETED_RE.exec(line);
    if (cue) {
      nodes.push({
        kind: "cue",
        text: cue[1].trim(),
        lineNo,
      });
      continue;
    }

    // Line inside a section didn't match any known shape. Record a warning
    // so callers can surface it — silent drops have burned us when a BOM or
    // RTL char prevented the speaker regex from matching.
    warnings.push({
      lineNo,
      line,
      reason: "Line inside section does not match speaker/cue/divider syntax",
    });
  }

  return {
    title,
    preamble,
    nodes,
    warnings,
    metadata: fm.metadata,
  };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Serialize a DialogueDocument back to markdown. Structure-preserving
 * (speakers, cues, sections, and action flags survive a round-trip). Exact
 * byte-for-byte equality with the original source is NOT guaranteed — the
 * parser is lenient about whitespace and divider placement.
 */
export function serializeDialogue(doc: DialogueDocument): string {
  const out: string[] = [];

  // Frontmatter first if metadata was set. Round-trip stable — parse +
  // serialize + parse produces the same metadata object.
  if (doc.metadata && Object.keys(doc.metadata).length > 0) {
    out.push("---");
    for (const [key, value] of Object.entries(doc.metadata)) {
      if (value === undefined) continue;
      out.push(`${key}: ${value}`);
    }
    out.push("---");
    out.push("");
  }

  if (doc.title) {
    out.push(`# ${doc.title}`);
    out.push("");
  }
  if (doc.preamble.length) {
    out.push(...doc.preamble);
    out.push("");
  }

  let firstSectionSeen = false;
  for (const node of doc.nodes) {
    if (node.kind === "section") {
      if (firstSectionSeen) {
        out.push("");
        out.push("---");
        out.push("");
      } else {
        out.push("---");
        out.push("");
        firstSectionSeen = true;
      }
      out.push(`## ${node.title}`);
      out.push("");
    } else if (node.kind === "line") {
      const text = node.isAction ? `[${node.text}]` : node.text;
      out.push(`${node.speaker}: ${text}`);
    } else {
      out.push(`[${node.text}]`);
    }
  }

  return out.join("\n") + "\n";
}

/**
 * Compute a deterministic signature of the document's structure (speakers,
 * sections, cues, action flags) while ignoring text content. Used to verify
 * plain and cipher variants of the same ritual stay in lockstep.
 */
export function structureSignature(doc: DialogueDocument): string {
  const parts: string[] = [];
  for (const node of doc.nodes) {
    if (node.kind === "section") {
      parts.push(`S:${node.id}`);
    } else if (node.kind === "line") {
      parts.push(`L:${node.speaker}:${node.isAction ? "A" : "T"}`);
    } else {
      parts.push(`C:${node.text}`);
    }
  }
  return parts.join("|");
}

/**
 * Extract only the spoken lines (omits sections, cues, and stage actions).
 * Useful for feeding the mentor AI a clean transcript.
 */
export function spokenLines(doc: DialogueDocument): DialogueSpokenLine[] {
  return doc.nodes.filter(
    (n): n is DialogueSpokenLine => n.kind === "line" && !n.isAction,
  );
}

/**
 * Count utterances per speaker (spoken lines + action lines).
 */
export function speakerBreakdown(doc: DialogueDocument): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const node of doc.nodes) {
    if (node.kind === "line") {
      counts[node.speaker] = (counts[node.speaker] ?? 0) + 1;
    }
  }
  return counts;
}

/**
 * Pair plain and cipher documents line-for-line. Returns one record per
 * matching node. Throws if the two documents do not share structure.
 */
export interface PairedLine {
  section: string;
  speaker: string;
  plain: string;
  cipher: string;
  isAction: boolean;
}

export function pairPlainCipher(
  plain: DialogueDocument,
  cipher: DialogueDocument,
): PairedLine[] {
  if (structureSignature(plain) !== structureSignature(cipher)) {
    throw new Error("Plain and cipher documents have divergent structure");
  }

  const pairs: PairedLine[] = [];
  let currentSection = "";

  for (let i = 0; i < plain.nodes.length; i++) {
    const p = plain.nodes[i];
    const c = cipher.nodes[i];

    if (p.kind === "section") {
      currentSection = p.title;
      continue;
    }
    if (p.kind !== "line" || c.kind !== "line") continue;

    pairs.push({
      section: currentSection,
      speaker: p.speaker,
      plain: p.text,
      cipher: c.text,
      isAction: p.isAction,
    });
  }

  return pairs;
}
