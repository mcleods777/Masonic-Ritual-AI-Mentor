/**
 * scripts/__tests__/content-checklist.test.ts — shape invariants for the
 * Phase 4 content-readiness ledger.
 *
 * The checklist file (`.planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md`)
 * is hand-edited over weeks while Shannon moves 18+ rituals through the
 * pipeline. These tests exist so accidental drift (stray `[X]`, swapped
 * columns, duplicate slug, dropped group header) is caught at commit time
 * rather than silently breaking the ledger for Plans 04-03..08.
 *
 * Five in-memory fixture tests cover the parser's failure modes (Tests 1-5).
 * Test 6 runs the parser round-trip against the actual on-disk checklist
 * (enabled by Task 2 once the file is seeded).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  parseChecklist,
  validateChecklistShape,
  EXPECTED_GROUPS,
  REQUIRED_COLUMN_HEADERS,
  type ChecklistRow,
} from "../lib/content-checklist";

// -----------------------------------------------------------------------
// Fixture helpers — build small checklist markdown strings inline so each
// test owns its own input without reading from disk.
// -----------------------------------------------------------------------

const HEADER_LINE = `| ${REQUIRED_COLUMN_HEADERS.join(" | ")} |`;
const SEPARATOR_LINE = `|${REQUIRED_COLUMN_HEADERS.map(() => "---").join("|")}|`;

function row(
  slug: string,
  cells: [string, string, string, string, string, string, string, string],
  notes = "",
): string {
  return `| ${slug} | ${cells.join(" | ")} | ${notes} |`;
}

const EIGHT_NOT_STARTED: [string, string, string, string, string, string, string, string] =
  ["[ ]", "[ ]", "[ ]", "[ ]", "[ ]", "[ ]", "[ ]", "[ ]"];

const EIGHT_DONE: [string, string, string, string, string, string, string, string] =
  ["[x]", "[x]", "[x]", "[x]", "[x]", "[x]", "[x]", "[x]"];

const EIGHT_EMDASH: [string, string, string, string, string, string, string, string] =
  ["—", "—", "—", "—", "—", "—", "—", "—"];

/**
 * Build a VALID checklist MD with all 5 groups present, ≥ 14 rows.
 * (4 EA + 4 FC + 4 MM + 1 Installation + 1 lecture = 14 rows.)
 */
function buildValidChecklistMd(): string {
  const ea = [
    row("ea-opening", EIGHT_DONE, "existing; re-bake"),
    row("ea-initiation", EIGHT_DONE, "existing; re-bake"),
    row("ea-explanatory", EIGHT_DONE, "existing; re-bake"),
    row("ea-closing", EIGHT_DONE, "existing; re-bake"),
  ].join("\n");
  const fc = [
    row("fc-opening", EIGHT_NOT_STARTED),
    row("fc-passing", EIGHT_NOT_STARTED),
    row("fc-middle-chamber-lecture", EIGHT_NOT_STARTED),
    row("fc-closing", EIGHT_NOT_STARTED),
  ].join("\n");
  const mm = [
    row("mm-opening", EIGHT_NOT_STARTED),
    row("mm-raising", EIGHT_NOT_STARTED),
    row("mm-hiramic-legend", EIGHT_NOT_STARTED),
    row("mm-closing", EIGHT_NOT_STARTED),
  ].join("\n");
  const installation = row("installation", EIGHT_NOT_STARTED);
  const lec = row("lec-wm-charge", EIGHT_NOT_STARTED);

  return [
    "# fixture",
    "",
    "## EA",
    "",
    HEADER_LINE,
    SEPARATOR_LINE,
    ea,
    "",
    "## FC",
    "",
    HEADER_LINE,
    SEPARATOR_LINE,
    fc,
    "",
    "## MM",
    "",
    HEADER_LINE,
    SEPARATOR_LINE,
    mm,
    "",
    "## Installation",
    "",
    HEADER_LINE,
    SEPARATOR_LINE,
    installation,
    "",
    "## Officer Lectures",
    "",
    HEADER_LINE,
    SEPARATOR_LINE,
    lec,
    "",
  ].join("\n");
}

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

describe("parseChecklist", () => {
  it("parses a valid checklist into a flat row array spanning all 5 groups (Test 1)", () => {
    const md = buildValidChecklistMd();
    const rows = parseChecklist(md);

    expect(rows.length).toBeGreaterThanOrEqual(14);

    const groupsPresent = new Set(rows.map((r) => r.group));
    for (const g of EXPECTED_GROUPS) {
      expect(groupsPresent.has(g)).toBe(true);
    }

    const shape = validateChecklistShape(rows);
    expect(shape.ok).toBe(true);
    expect(shape.errors).toEqual([]);
  });

  it("throws InvalidStatusCell with line number on uppercase [X] (Test 2)", () => {
    const bad: [string, string, string, string, string, string, string, string] = [
      "[X]", // uppercase — must be rejected
      "[ ]",
      "[ ]",
      "[ ]",
      "[ ]",
      "[ ]",
      "[ ]",
      "[ ]",
    ];
    const md = [
      "## EA",
      "",
      HEADER_LINE,
      SEPARATOR_LINE,
      row("ea-opening", EIGHT_DONE),
      row("ea-initiation", bad, "bad status"),
      row("ea-explanatory", EIGHT_DONE),
      row("ea-closing", EIGHT_DONE),
    ].join("\n");

    expect(() => parseChecklist(md)).toThrow(/InvalidStatusCell/);
    try {
      parseChecklist(md);
    } catch (err) {
      const msg = String((err as Error).message);
      expect(msg).toContain("InvalidStatusCell");
      expect(msg).toContain("[X]");
      expect(msg).toMatch(/line \d+/); // line-number context
    }
  });

  it("flags duplicate slugs via validateChecklistShape (Test 3)", () => {
    const md = [
      "## EA",
      "",
      HEADER_LINE,
      SEPARATOR_LINE,
      row("ea-opening", EIGHT_DONE),
      row("ea-initiation", EIGHT_DONE),
      row("ea-explanatory", EIGHT_DONE),
      row("ea-closing", EIGHT_DONE),
      "",
      "## FC",
      "",
      HEADER_LINE,
      SEPARATOR_LINE,
      row("fc-opening", EIGHT_NOT_STARTED),
      row("fc-opening", EIGHT_NOT_STARTED), // duplicate
      row("fc-passing", EIGHT_NOT_STARTED),
      row("fc-closing", EIGHT_NOT_STARTED),
      "",
      "## MM",
      "",
      HEADER_LINE,
      SEPARATOR_LINE,
      row("mm-opening", EIGHT_NOT_STARTED),
      "",
      "## Installation",
      "",
      HEADER_LINE,
      SEPARATOR_LINE,
      row("installation", EIGHT_NOT_STARTED),
      "",
      "## Officer Lectures",
      "",
      HEADER_LINE,
      SEPARATOR_LINE,
      row("lec-wm-charge", EIGHT_NOT_STARTED),
    ].join("\n");

    const rows = parseChecklist(md);
    const shape = validateChecklistShape(rows);
    expect(shape.ok).toBe(false);
    expect(shape.errors.some((e) => e.includes("duplicate slug: fc-opening"))).toBe(true);
  });

  it("flags missing Officer Lectures group via validateChecklistShape (Test 4)", () => {
    const md = [
      "## EA",
      "",
      HEADER_LINE,
      SEPARATOR_LINE,
      row("ea-opening", EIGHT_DONE),
      row("ea-initiation", EIGHT_DONE),
      row("ea-explanatory", EIGHT_DONE),
      row("ea-closing", EIGHT_DONE),
      "",
      "## FC",
      "",
      HEADER_LINE,
      SEPARATOR_LINE,
      row("fc-opening", EIGHT_NOT_STARTED),
      "",
      "## MM",
      "",
      HEADER_LINE,
      SEPARATOR_LINE,
      row("mm-opening", EIGHT_NOT_STARTED),
      "",
      "## Installation",
      "",
      HEADER_LINE,
      SEPARATOR_LINE,
      row("installation", EIGHT_NOT_STARTED),
      // No ## Officer Lectures section.
    ].join("\n");

    const rows = parseChecklist(md);
    const shape = validateChecklistShape(rows);
    expect(shape.ok).toBe(false);
    expect(shape.errors.some((e) => e.includes("missing group: Officer Lectures"))).toBe(true);
  });

  it("throws ColumnHeaderMismatch when baked and scrubbed are swapped (Test 5)", () => {
    // Build a header with `scrubbed` and `baked` in wrong order.
    const swapped = [
      "slug",
      "drafted (plain)",
      "drafted (cipher)",
      "voice-cast",
      "styles",
      "scrubbed", // swapped
      "baked", // swapped
      "verified",
      "shipped",
      "notes",
    ];
    const swappedHeader = `| ${swapped.join(" | ")} |`;
    const swappedSeparator = `|${swapped.map(() => "---").join("|")}|`;
    const md = [
      "## EA",
      "",
      swappedHeader,
      swappedSeparator,
      row("ea-opening", EIGHT_DONE),
    ].join("\n");

    expect(() => parseChecklist(md)).toThrow(/ColumnHeaderMismatch/);
  });

  // -------- Test 6: round-trip on disk --------
  // TODO(04-02 Task 2): flip to `it(...)` once the real checklist file is
  // seeded at .planning/phases/04-content-coverage/04-CONTENT-CHECKLIST.md.
  it.skip("round-trip against on-disk checklist (Test 6)", () => {
    const diskPath = path.resolve(
      __dirname,
      "..",
      "..",
      ".planning",
      "phases",
      "04-content-coverage",
      "04-CONTENT-CHECKLIST.md",
    );
    const md = readFileSync(diskPath, "utf8");
    const rows: ChecklistRow[] = parseChecklist(md);
    const result = validateChecklistShape(rows);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(rows.length).toBeGreaterThanOrEqual(18);
  });
});
