import { describe, it, expect } from "vitest";
import {
  parseDialogue,
  serializeDialogue,
  structureSignature,
  spokenLines,
  speakerBreakdown,
  pairPlainCipher,
} from "../dialogue-format";

// Synthetic fixture — intentionally NOT real ritual content so this test
// can run in CI without depending on the gitignored rituals/ files.
const SAMPLE_PLAIN = `# Sample Dialogue

A brief preamble.

---

## I. First Section

A: Hello, friend.
B: Hello to you.
A: [raises hand in greeting]
[if it is morning]
A: Good morning.
[else]
A: Good evening.
[end]

---

## II. Second Section

A: Farewell.
B: Until next time.
`;

const SAMPLE_CIPHER = `# Sample Dialogue

A brief preamble.

---

## I. First Section

A: Hi, frd.
B: Hi t u.
A: [rs hd]
[if it is morning]
A: Gd mrn.
[else]
A: Gd evn.
[end]

---

## II. Second Section

A: Frwl.
B: Utl nxt tm.
`;

describe("parseDialogue — structure", () => {
  it("extracts the H1 title", () => {
    expect(parseDialogue(SAMPLE_PLAIN).title).toBe("Sample Dialogue");
  });

  it("collects preamble prose", () => {
    const doc = parseDialogue(SAMPLE_PLAIN);
    expect(doc.preamble).toContain("A brief preamble.");
  });

  it("identifies both sections", () => {
    const doc = parseDialogue(SAMPLE_PLAIN);
    const sections = doc.nodes.filter((n) => n.kind === "section");
    expect(sections).toHaveLength(2);
    expect(sections[0].kind === "section" && sections[0].title).toBe(
      "I. First Section",
    );
    expect(sections[1].kind === "section" && sections[1].title).toBe(
      "II. Second Section",
    );
  });

  it("generates url-safe section ids", () => {
    const doc = parseDialogue(SAMPLE_PLAIN);
    const first = doc.nodes.find((n) => n.kind === "section");
    expect(first?.kind === "section" && first.id).toBe("i-first-section");
  });
});

describe("parseDialogue — lines and cues", () => {
  it("parses speaker lines", () => {
    const doc = parseDialogue(SAMPLE_PLAIN);
    const lines = doc.nodes.filter((n) => n.kind === "line");
    expect(lines.length).toBeGreaterThanOrEqual(6);
    const first = lines[0];
    expect(first.kind === "line" && first.speaker).toBe("A");
    expect(first.kind === "line" && first.text).toBe("Hello, friend.");
    expect(first.kind === "line" && first.isAction).toBe(false);
  });

  it("marks SPEAKER: [bracketed] as an action", () => {
    const doc = parseDialogue(SAMPLE_PLAIN);
    const actions = doc.nodes.filter(
      (n) => n.kind === "line" && n.isAction,
    );
    expect(actions).toHaveLength(1);
    const a = actions[0];
    expect(a.kind === "line" && a.text).toBe("raises hand in greeting");
    expect(a.kind === "line" && a.speaker).toBe("A");
  });

  it("parses standalone bracketed cues", () => {
    const doc = parseDialogue(SAMPLE_PLAIN);
    const cues = doc.nodes.filter((n) => n.kind === "cue");
    expect(cues).toHaveLength(3);
    expect(cues.map((c) => c.kind === "cue" && c.text)).toEqual([
      "if it is morning",
      "else",
      "end",
    ]);
  });

  it("handles compound speakers with slash (WM/Chaplain)", () => {
    const doc = parseDialogue("## S\nWM/Chaplain: Let us pray.\n");
    const lines = doc.nodes.filter((n) => n.kind === "line");
    expect(lines).toHaveLength(1);
    expect(lines[0].kind === "line" && lines[0].speaker).toBe("WM/Chaplain");
  });

  it("records source line numbers", () => {
    const doc = parseDialogue("## S\n\nA: hi\n");
    const line = doc.nodes.find((n) => n.kind === "line");
    expect(line?.lineNo).toBe(3);
  });
});

describe("parseDialogue — edge cases", () => {
  it("handles empty input", () => {
    const doc = parseDialogue("");
    expect(doc.title).toBe("");
    expect(doc.nodes).toHaveLength(0);
    expect(doc.preamble).toHaveLength(0);
  });

  it("ignores --- dividers", () => {
    const doc = parseDialogue("## A\n---\n## B\n");
    const sections = doc.nodes.filter((n) => n.kind === "section");
    expect(sections).toHaveLength(2);
  });

  it("preserves multi-word cue text verbatim", () => {
    const doc = parseDialogue("## S\n[prayer — either version]\n");
    const cues = doc.nodes.filter((n) => n.kind === "cue");
    expect(cues[0].kind === "cue" && cues[0].text).toBe(
      "prayer — either version",
    );
  });

  it("does NOT parse a line that lacks a space after the colon", () => {
    // "A:hello" without space — not a valid speaker line per spec
    const doc = parseDialogue("A:hello\n");
    expect(doc.nodes.filter((n) => n.kind === "line")).toHaveLength(0);
  });

  it("warns on unparseable lines inside sections (no silent drops)", () => {
    // Regression guard: a line that looks like it should parse but doesn't
    // (hidden BOM, missing space after colon, typo) must surface as a
    // warning. Silent drops are a data-loss bug because plain and cipher
    // could drop the same line and pass the structure-signature check.
    const src = `## I. Section

A: This is fine.
not a valid speaker line
B: Also fine.
`;
    const doc = parseDialogue(src);
    expect(doc.warnings.length).toBeGreaterThanOrEqual(1);
    const warn = doc.warnings[0];
    expect(warn.line).toBe("not a valid speaker line");
    expect(warn.reason).toMatch(/speaker/i);
    // Valid lines still parse
    const lines = doc.nodes.filter((n) => n.kind === "line");
    expect(lines).toHaveLength(2);
  });

  it("does NOT warn on preamble prose (preamble is free-form)", () => {
    const src = `# Title

Preamble prose with a colon: no warning expected here.
More free-form text.

## I. Section

A: Hi.
`;
    const doc = parseDialogue(src);
    expect(doc.warnings).toHaveLength(0);
  });

  it("does NOT misread SPEAKER: looking text in the preamble", () => {
    // Regression: the preamble sometimes contains documentation like
    //   Format: `SPEAKER: utterance`
    // which must NOT be parsed as a real speaker line. Anything before
    // the first `##` is prose preamble, period.
    const src = `# Title

Format: \`SPEAKER: utterance\`, one per line.
Note: colons in prose are normal prose.

## I. Real Section

A: This is the first real line.
`;
    const doc = parseDialogue(src);
    const lines = doc.nodes.filter((n) => n.kind === "line");
    expect(lines).toHaveLength(1);
    expect(lines[0].kind === "line" && lines[0].speaker).toBe("A");
    // Preamble should capture the prose verbatim
    expect(doc.preamble.some((p) => p.startsWith("Format:"))).toBe(true);
    expect(doc.preamble.some((p) => p.startsWith("Note:"))).toBe(true);
  });
});

describe("serializeDialogue — round trip", () => {
  it("preserves structure through parse → serialize → parse", () => {
    const doc1 = parseDialogue(SAMPLE_PLAIN);
    const emitted = serializeDialogue(doc1);
    const doc2 = parseDialogue(emitted);
    expect(structureSignature(doc2)).toBe(structureSignature(doc1));
    expect(doc2.nodes.length).toBe(doc1.nodes.length);
    expect(doc2.title).toBe(doc1.title);
  });

  it("preserves text content through round trip", () => {
    const doc1 = parseDialogue(SAMPLE_PLAIN);
    const doc2 = parseDialogue(serializeDialogue(doc1));
    for (let i = 0; i < doc1.nodes.length; i++) {
      const a = doc1.nodes[i];
      const b = doc2.nodes[i];
      expect(a.kind).toBe(b.kind);
      if (a.kind === "line" && b.kind === "line") {
        expect(b.speaker).toBe(a.speaker);
        expect(b.text).toBe(a.text);
        expect(b.isAction).toBe(a.isAction);
      }
    }
  });
});

describe("structureSignature", () => {
  it("matches for two files with same structure and different text", () => {
    const plain = parseDialogue(SAMPLE_PLAIN);
    const cipher = parseDialogue(SAMPLE_CIPHER);
    expect(structureSignature(plain)).toBe(structureSignature(cipher));
  });

  it("differs when speakers change", () => {
    const a = parseDialogue("## S\nA: x\nB: y\n");
    const b = parseDialogue("## S\nA: x\nA: y\n");
    expect(structureSignature(a)).not.toBe(structureSignature(b));
  });

  it("differs when a line changes from spoken to action", () => {
    const spoken = parseDialogue("## S\nA: hello\n");
    const action = parseDialogue("## S\nA: [hello]\n");
    expect(structureSignature(spoken)).not.toBe(structureSignature(action));
  });

  it("differs when cues differ", () => {
    const a = parseDialogue("## S\n[if x]\nA: hi\n");
    const b = parseDialogue("## S\n[if y]\nA: hi\n");
    expect(structureSignature(a)).not.toBe(structureSignature(b));
  });
});

describe("speakerBreakdown", () => {
  it("counts lines per speaker", () => {
    const doc = parseDialogue(SAMPLE_PLAIN);
    const counts = speakerBreakdown(doc);
    expect(counts.A).toBeGreaterThanOrEqual(4); // hello + action + morning/evening + farewell
    expect(counts.B).toBe(2);
  });
});

describe("spokenLines", () => {
  it("excludes actions and cues", () => {
    const doc = parseDialogue(SAMPLE_PLAIN);
    const spoken = spokenLines(doc);
    // All spoken lines, no actions
    expect(spoken.every((l) => !l.isAction)).toBe(true);
    // No non-line nodes
    expect(spoken.every((l) => l.kind === "line")).toBe(true);
  });
});

describe("pairPlainCipher", () => {
  it("pairs lines from matching documents", () => {
    const plain = parseDialogue(SAMPLE_PLAIN);
    const cipher = parseDialogue(SAMPLE_CIPHER);
    const pairs = pairPlainCipher(plain, cipher);
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs[0]).toMatchObject({
      section: "I. First Section",
      speaker: "A",
      plain: "Hello, friend.",
      cipher: "Hi, frd.",
      isAction: false,
    });
  });

  it("preserves action flag in pairs", () => {
    const plain = parseDialogue(SAMPLE_PLAIN);
    const cipher = parseDialogue(SAMPLE_CIPHER);
    const pairs = pairPlainCipher(plain, cipher);
    const actionPair = pairs.find((p) => p.isAction);
    expect(actionPair).toBeDefined();
    expect(actionPair?.plain).toBe("raises hand in greeting");
    expect(actionPair?.cipher).toBe("rs hd");
  });

  it("throws when structures diverge", () => {
    const a = parseDialogue("## S\nA: hi\n");
    const b = parseDialogue("## S\nB: hi\n");
    expect(() => pairPlainCipher(a, b)).toThrow(/divergent structure/);
  });
});

// ============================================================
// YAML frontmatter parsing (PR #34a)
// ============================================================

describe("parseDialogue — YAML frontmatter", () => {
  it("extracts a valid frontmatter block", () => {
    const src = `---
jurisdiction: Grand Lodge of Iowa
degree: Entered Apprentice
ceremony: Opening on the First Degree
---

# EA Opening

## I. First Section

WM: Hello.
`;
    const doc = parseDialogue(src);
    expect(doc.metadata).toBeDefined();
    expect(doc.metadata?.jurisdiction).toBe("Grand Lodge of Iowa");
    expect(doc.metadata?.degree).toBe("Entered Apprentice");
    expect(doc.metadata?.ceremony).toBe("Opening on the First Degree");
    // Body still parses normally
    expect(doc.title).toBe("EA Opening");
    expect(doc.nodes.filter((n) => n.kind === "line")).toHaveLength(1);
  });

  it("returns metadata undefined when no frontmatter present", () => {
    const src = `# Title

## I. Section

A: hi.
`;
    const doc = parseDialogue(src);
    expect(doc.metadata).toBeUndefined();
  });

  it("extracts partial frontmatter (missing fields)", () => {
    // The parser populates what's there; a downstream consumer (like the
    // build script) is responsible for enforcing required fields.
    const src = `---
jurisdiction: Grand Lodge of Iowa
---

## I. Section

A: hi.
`;
    const doc = parseDialogue(src);
    expect(doc.metadata?.jurisdiction).toBe("Grand Lodge of Iowa");
    expect(doc.metadata?.degree).toBeUndefined();
    expect(doc.metadata?.ceremony).toBeUndefined();
  });

  it("warns and does not set metadata on unclosed frontmatter", () => {
    const src = `---
jurisdiction: Iowa
degree: EA

## Actually this is a section

A: hi.
`;
    const doc = parseDialogue(src);
    expect(doc.metadata).toBeUndefined();
    expect(doc.warnings.length).toBeGreaterThan(0);
    expect(doc.warnings[0].reason).toMatch(/never closed/i);
  });

  it("strips surrounding single and double quotes from values", () => {
    const src = `---
jurisdiction: "Grand Lodge of Iowa"
degree: 'Entered Apprentice'
ceremony: Opening on the First Degree
---

## I. S

A: hi.
`;
    const doc = parseDialogue(src);
    expect(doc.metadata?.jurisdiction).toBe("Grand Lodge of Iowa");
    expect(doc.metadata?.degree).toBe("Entered Apprentice");
    expect(doc.metadata?.ceremony).toBe("Opening on the First Degree");
  });

  it("tolerates blank lines inside the frontmatter block", () => {
    const src = `---

jurisdiction: Iowa

degree: EA

---

## I. S

A: hi.
`;
    const doc = parseDialogue(src);
    expect(doc.metadata?.jurisdiction).toBe("Iowa");
    expect(doc.metadata?.degree).toBe("EA");
  });

  it("warns on malformed key-value lines but keeps parsing", () => {
    const src = `---
jurisdiction: Iowa
not-a-valid-line-no-colon
degree: EA
---

## I. S

A: hi.
`;
    const doc = parseDialogue(src);
    expect(doc.metadata?.jurisdiction).toBe("Iowa");
    expect(doc.metadata?.degree).toBe("EA");
    expect(doc.warnings.some((w) => w.reason.match(/key: value/))).toBe(true);
  });

  it("passes through extra unknown fields without erroring", () => {
    const src = `---
jurisdiction: Iowa
degree: EA
ceremony: Opening
extraField: something else
---

## I. S

A: hi.
`;
    const doc = parseDialogue(src);
    expect(doc.metadata?.jurisdiction).toBe("Iowa");
    // Extra field survives via the underlying Record<string, string> shape
    expect((doc.metadata as Record<string, string>)?.extraField).toBe(
      "something else",
    );
  });

  it("does NOT interpret mid-document `---` as frontmatter", () => {
    // Section dividers and mid-document --- lines must not be mistaken
    // for frontmatter. Frontmatter only counts at the very top.
    const src = `# Title

## I. First

A: hi.

---

## II. Second

B: bye.
`;
    const doc = parseDialogue(src);
    expect(doc.metadata).toBeUndefined();
    // Both sections parse normally
    expect(doc.nodes.filter((n) => n.kind === "section")).toHaveLength(2);
  });

  it("reports original line numbers after frontmatter is stripped", () => {
    // A warning on a line AFTER the frontmatter block should report the
    // line number in the original source, not in the frontmatter-stripped
    // remainder.
    const src = `---
jurisdiction: Iowa
---

## I. S

not-a-speaker-line-that-generates-a-warning
`;
    const doc = parseDialogue(src);
    expect(doc.warnings).toHaveLength(1);
    // The warning should reference line 7 of the original source
    expect(doc.warnings[0].lineNo).toBe(7);
  });
});

describe("parseDialogue — slugify collision dedup", () => {
  it("gives distinct ids to sections that collapse to the same slug", () => {
    const src = `## The Opening

A: hi.

## The Opening!

B: hi.

## The Opening?

C: hi.
`;
    const doc = parseDialogue(src);
    const sections = doc.nodes.filter((n) => n.kind === "section");
    const ids = sections.map((s) => s.kind === "section" && s.id);
    expect(ids).toEqual(["the-opening", "the-opening-2", "the-opening-3"]);
  });

  it("keeps unique ids untouched when slugs don't collide", () => {
    const src = `## First

A: hi.

## Second

B: hi.
`;
    const doc = parseDialogue(src);
    const sections = doc.nodes.filter((n) => n.kind === "section");
    const ids = sections.map((s) => s.kind === "section" && s.id);
    expect(ids).toEqual(["first", "second"]);
  });
});

describe("serializeDialogue — frontmatter round-trip", () => {
  it("round-trips frontmatter through parse → serialize → parse", () => {
    const original = `---
jurisdiction: Grand Lodge of Iowa
degree: Entered Apprentice
ceremony: Opening
---

## I. S

A: hello.
`;
    const doc1 = parseDialogue(original);
    const text = serializeDialogue(doc1);
    const doc2 = parseDialogue(text);
    expect(doc2.metadata).toEqual(doc1.metadata);
  });

  it("emits no frontmatter when doc.metadata is undefined", () => {
    // The serializer emits `---` as a section divider before sections —
    // that's NOT frontmatter. Check semantically: parse the output and
    // confirm metadata is still undefined. A real frontmatter block
    // would survive the round-trip and populate metadata.
    const src = `## I. S\nA: hi.\n`;
    const doc1 = parseDialogue(src);
    expect(doc1.metadata).toBeUndefined();
    const text = serializeDialogue(doc1);
    const doc2 = parseDialogue(text);
    expect(doc2.metadata).toBeUndefined();
  });
});
