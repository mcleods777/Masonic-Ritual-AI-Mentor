/**
 * scripts/lib/content-checklist.ts — parser for the Phase 4 content ledger.
 *
 * Reads `.planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md` — a
 * hand-edited markdown table that tracks per-ritual readiness across the
 * content pipeline (drafted plain → drafted cipher → voice-cast → styles →
 * baked → scrubbed → verified → shipped). The parser is the integrity
 * guarantee: Shannon edits the file by hand over weeks; a typo in a status
 * cell (`[X]` for `[x]`) must be caught by the shape test in vitest, not
 * silently treated as "not done."
 *
 * 04-02 parser contract (locked; 04-07 descope protocol depends on this
 * contract being strict). Only these four strings are legal status cells:
 *
 *   `[ ]`  not started
 *   `[~]`  in progress
 *   `[x]`  done
 *   `—`    not applicable / descoped (U+2014 EM DASH)
 *
 * Any other value — including `[X]` (uppercase x), `[ x]` (stray space),
 * `~~slug~~` (strikethrough), `-` (ASCII hyphen), or `—` (any other dash) —
 * causes `parseChecklist` to throw `InvalidStatusCell`. This strictness is
 * deliberate: Plan 04-07 needed a way to descope officer lectures without
 * extending the parser, and the `—` em-dash cell is precisely the "not
 * applicable" escape hatch that covers that case.
 *
 * Pure parser: no fs, no process. Callers read the file and pass the string.
 */
export type StatusCell = "[ ]" | "[~]" | "[x]" | "—";

export interface ChecklistRow {
  group: "EA" | "FC" | "MM" | "Installation" | "Officer Lectures";
  slug: string;
  drafted_plain: StatusCell;
  drafted_cipher: StatusCell;
  voice_cast: StatusCell;
  styles: StatusCell;
  baked: StatusCell;
  scrubbed: StatusCell;
  verified: StatusCell;
  shipped: StatusCell;
  notes: string;
}

export const EXPECTED_GROUPS = [
  "EA",
  "FC",
  "MM",
  "Installation",
  "Officer Lectures",
] as const;

export const REQUIRED_COLUMN_HEADERS = [
  "slug",
  "drafted (plain)",
  "drafted (cipher)",
  "voice-cast",
  "styles",
  "baked",
  "scrubbed",
  "verified",
  "shipped",
  "notes",
] as const;

const ALLOWED_STATUSES: readonly StatusCell[] = ["[ ]", "[~]", "[x]", "—"];

type GroupName = (typeof EXPECTED_GROUPS)[number];

function isKnownGroup(name: string): name is GroupName {
  return (EXPECTED_GROUPS as readonly string[]).includes(name);
}

function isStatusCell(cell: string): cell is StatusCell {
  return (ALLOWED_STATUSES as readonly string[]).includes(cell);
}

/**
 * Split a markdown table row on `|`, drop leading/trailing empty pipe-cells
 * (standard markdown tables start and end with `|`), trim each cell.
 */
function splitTableRow(line: string): string[] {
  const parts = line.split("|").map((c) => c.trim());
  // Markdown `| a | b |` → ['', 'a', 'b', ''] → trim the empty edges.
  if (parts.length > 0 && parts[0] === "") parts.shift();
  if (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
  return parts;
}

function isSeparatorRow(cells: string[]): boolean {
  // `|---|---|` — every cell is dashes (one or more) with optional colons.
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

/**
 * Parse the checklist markdown into a flat `ChecklistRow[]` across all
 * groups. Throws on structural / value errors with line-number context.
 */
export function parseChecklist(sourceMd: string): ChecklistRow[] {
  const lines = sourceMd.split(/\r?\n/);
  const rows: ChecklistRow[] = [];
  let currentGroup: GroupName | null = null;
  let headerParsed = false;
  let expectingSeparator = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNumber = i + 1;
    const trimmed = line.trim();

    // Detect group heading (`## GroupName`).
    const headingMatch = /^##\s+([^\n]+?)\s*$/.exec(trimmed);
    if (headingMatch) {
      const name = headingMatch[1]!.trim();
      // Only `## EA`, `## FC`, `## MM`, `## Installation`, `## Officer Lectures`
      // are recognized. Other `##` sections (like the `## Aggregate` footer)
      // terminate the current table but don't cause a throw — they're narrative.
      if (isKnownGroup(name)) {
        currentGroup = name;
        headerParsed = false;
        expectingSeparator = false;
      } else {
        currentGroup = null;
        headerParsed = false;
        expectingSeparator = false;
      }
      continue;
    }

    // Not inside a known group → skip.
    if (currentGroup === null) continue;

    // Skip non-table lines.
    if (!trimmed.startsWith("|")) {
      // Allow blank lines / prose between the header and the table.
      continue;
    }

    const cells = splitTableRow(line);

    // First pipe-row under a group header is the column header row.
    if (!headerParsed) {
      if (cells.length !== REQUIRED_COLUMN_HEADERS.length) {
        throw new Error(
          `ColumnHeaderMismatch: group "${currentGroup}" at line ${lineNumber} — expected ${REQUIRED_COLUMN_HEADERS.length} columns, got ${cells.length}`,
        );
      }
      const actual = cells.map((c) => c.toLowerCase());
      const expected = REQUIRED_COLUMN_HEADERS.map((c) => c.toLowerCase());
      for (let c = 0; c < expected.length; c++) {
        if (actual[c] !== expected[c]) {
          throw new Error(
            `ColumnHeaderMismatch: group "${currentGroup}" at line ${lineNumber} — column ${c} expected "${expected[c]}", got "${actual[c]}"`,
          );
        }
      }
      headerParsed = true;
      expectingSeparator = true;
      continue;
    }

    // Second pipe-row is the `|---|---|` separator.
    if (expectingSeparator) {
      if (!isSeparatorRow(cells)) {
        throw new Error(
          `MalformedTable: group "${currentGroup}" at line ${lineNumber} — expected separator row "|---|...|", got "${line}"`,
        );
      }
      expectingSeparator = false;
      continue;
    }

    // Data row.
    if (cells.length !== REQUIRED_COLUMN_HEADERS.length) {
      throw new Error(
        `MalformedRow: group "${currentGroup}" at line ${lineNumber} — expected ${REQUIRED_COLUMN_HEADERS.length} cells, got ${cells.length}`,
      );
    }

    const [
      slug,
      draftedPlain,
      draftedCipher,
      voiceCast,
      styles,
      baked,
      scrubbed,
      verified,
      shipped,
      notes,
    ] = cells;

    // Status columns (indices 1..8 inclusive) MUST match an allowed value.
    const statusCellsToCheck: Array<{ name: string; value: string }> = [
      { name: "drafted (plain)", value: draftedPlain! },
      { name: "drafted (cipher)", value: draftedCipher! },
      { name: "voice-cast", value: voiceCast! },
      { name: "styles", value: styles! },
      { name: "baked", value: baked! },
      { name: "scrubbed", value: scrubbed! },
      { name: "verified", value: verified! },
      { name: "shipped", value: shipped! },
    ];

    for (const check of statusCellsToCheck) {
      if (!isStatusCell(check.value)) {
        throw new Error(
          `InvalidStatusCell: group "${currentGroup}" slug "${slug}" column "${check.name}" at line ${lineNumber} — got "${check.value}"; allowed: ${ALLOWED_STATUSES.map((s) => `"${s}"`).join(", ")}`,
        );
      }
    }

    rows.push({
      group: currentGroup,
      slug: slug!,
      drafted_plain: draftedPlain as StatusCell,
      drafted_cipher: draftedCipher as StatusCell,
      voice_cast: voiceCast as StatusCell,
      styles: styles as StatusCell,
      baked: baked as StatusCell,
      scrubbed: scrubbed as StatusCell,
      verified: verified as StatusCell,
      shipped: shipped as StatusCell,
      notes: notes!,
    });
  }

  return rows;
}

/**
 * Shape invariants run against the parsed rows:
 *   (a) All 5 expected groups present.
 *   (b) No duplicate slugs across groups.
 *   (c) EA group contains exactly the 4 Phase 3 ritual slugs.
 * Returns `{ok: false, errors: [...]}` on any violation; callers decide
 * whether to surface to the human or fail fast in vitest.
 */
export function validateChecklistShape(
  rows: ChecklistRow[],
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  // (a) All 5 groups present.
  const groupsPresent = new Set(rows.map((r) => r.group));
  for (const g of EXPECTED_GROUPS) {
    if (!groupsPresent.has(g)) {
      errors.push(`missing group: ${g}`);
    }
  }

  // (b) No duplicate slugs.
  const slugCounts = new Map<string, number>();
  for (const r of rows) {
    slugCounts.set(r.slug, (slugCounts.get(r.slug) ?? 0) + 1);
  }
  for (const [slug, count] of slugCounts.entries()) {
    if (count > 1) {
      errors.push(`duplicate slug: ${slug}`);
    }
  }

  // (c) EA group has exactly the 4 EA slugs per RESEARCH.md §Ritual Taxonomy.
  const expectedEA = [
    "ea-opening",
    "ea-initiation",
    "ea-explanatory",
    "ea-closing",
  ];
  const actualEA = rows.filter((r) => r.group === "EA").map((r) => r.slug);
  for (const s of expectedEA) {
    if (!actualEA.includes(s)) {
      errors.push(`EA group missing expected slug: ${s}`);
    }
  }
  for (const s of actualEA) {
    if (!expectedEA.includes(s)) {
      errors.push(`EA group contains unexpected slug: ${s}`);
    }
  }

  return { ok: errors.length === 0, errors };
}
