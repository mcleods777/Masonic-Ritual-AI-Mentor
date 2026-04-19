/**
 * Tests for the v3 .mram format with embedded audio.
 *
 * Covers the round-trip: build an MRAMDocument with audio on some lines,
 * run it through mramToSections, verify the audio field survives. Also
 * checks backwards compat — a v2 doc (no audio field) still produces
 * valid sections with audio undefined.
 */
import { describe, it, expect } from "vitest";
import { mramToSections, type MRAMDocument } from "../mram-format";

function makeDoc(lines: Partial<Parameters<typeof mramToSections>[0]["lines"][number]>[]): MRAMDocument {
  return {
    format: "MRAM",
    version: 1,
    metadata: {
      jurisdiction: "Test Lodge",
      degree: "Entered Apprentice",
      ceremony: "Opening",
      checksum: "abc",
    },
    roles: { WM: "Worshipful Master", SW: "Senior Warden" },
    sections: [{ id: "s1", title: "Test Section" }],
    lines: lines.map((partial, i) => ({
      id: partial.id ?? i + 1,
      section: partial.section ?? "s1",
      role: partial.role ?? "WM",
      gavels: partial.gavels ?? 0,
      action: partial.action ?? null,
      cipher: partial.cipher ?? "test cipher",
      plain: partial.plain ?? "test plain",
      ...(partial.style ? { style: partial.style } : {}),
      ...(partial.audio ? { audio: partial.audio } : {}),
    })),
  };
}

describe("mramToSections — v3 audio field", () => {
  it("carries the audio field through when present", () => {
    const doc = makeDoc([
      { role: "WM", plain: "First line", audio: "SGVsbG8gd29ybGQ=" },
      { role: "SW", plain: "Second line" },
    ]);

    const sections = mramToSections(doc);

    expect(sections).toHaveLength(2);
    expect(sections[0].audio).toBe("SGVsbG8gd29ybGQ=");
    expect(sections[1].audio).toBeUndefined();
  });

  it("omits the audio field entirely when the line has no audio", () => {
    const doc = makeDoc([
      { role: "WM", plain: "No audio here" },
    ]);

    const sections = mramToSections(doc);

    expect("audio" in sections[0]).toBe(false);
  });

  it("combines style + audio without conflict", () => {
    const doc = makeDoc([
      { role: "WM", plain: "Styled + audio", style: "gravely", audio: "YWJjZA==" },
    ]);

    const sections = mramToSections(doc);

    expect(sections[0].style).toBe("gravely");
    expect(sections[0].audio).toBe("YWJjZA==");
  });

  it("handles a mix of v2-style (style only), v3-style (style + audio), and bare lines", () => {
    const doc = makeDoc([
      { role: "WM", plain: "Line 1 — bare" },
      { role: "SW", plain: "Line 2 — style", style: "whispered" },
      { role: "WM", plain: "Line 3 — audio", audio: "MTIz" },
      { role: "SW", plain: "Line 4 — both", style: "firm", audio: "NDU2" },
    ]);

    const sections = mramToSections(doc);

    expect(sections[0].style).toBeUndefined();
    expect(sections[0].audio).toBeUndefined();

    expect(sections[1].style).toBe("whispered");
    expect(sections[1].audio).toBeUndefined();

    expect(sections[2].style).toBeUndefined();
    expect(sections[2].audio).toBe("MTIz");

    expect(sections[3].style).toBe("firm");
    expect(sections[3].audio).toBe("NDU2");
  });
});

describe("MRAMMetadata — v3 voice cast", () => {
  it("preserves voiceCast when present", () => {
    const doc: MRAMDocument = {
      format: "MRAM",
      version: 1,
      metadata: {
        jurisdiction: "Test",
        degree: "EA",
        ceremony: "Opening",
        checksum: "x",
        voiceCast: { WM: "Alnilam", SW: "Charon" },
        audioFormat: "opus-32k-mono",
      },
      roles: {},
      sections: [],
      lines: [],
    };

    // Round-trip through JSON.stringify to simulate encryption/decryption.
    const reparsed: MRAMDocument = JSON.parse(JSON.stringify(doc));

    expect(reparsed.metadata.voiceCast).toEqual({ WM: "Alnilam", SW: "Charon" });
    expect(reparsed.metadata.audioFormat).toBe("opus-32k-mono");
  });

  it("voiceCast and audioFormat are optional (v1/v2 compat)", () => {
    const doc: MRAMDocument = {
      format: "MRAM",
      version: 1,
      metadata: {
        jurisdiction: "Test",
        degree: "EA",
        ceremony: "Opening",
        checksum: "x",
      },
      roles: {},
      sections: [],
      lines: [],
    };

    expect(doc.metadata.voiceCast).toBeUndefined();
    expect(doc.metadata.audioFormat).toBeUndefined();
  });
});
