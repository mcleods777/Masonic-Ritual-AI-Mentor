import { describe, it, expect } from "vitest";
import {
  buildPreamble,
  assemblePrompt,
  validateVoiceCast,
  type VoiceCastFile,
} from "../voice-cast";

describe("buildPreamble", () => {
  const fullCast: VoiceCastFile = {
    version: 1,
    scene: "A lodge in deep of night.",
    roles: {
      WM: {
        profile: "Seasoned mason, late 50s.",
        style: "Measured, authoritative.",
        pacing: "Deliberate.",
        accent: "Educated American.",
        other: "Never theatrical.",
      },
      JD: {
        style: "Crisp, distinct.",
      },
    },
  };

  it("returns empty string when cast is undefined", () => {
    expect(buildPreamble(undefined, "WM")).toBe("");
  });

  it("returns empty string when role is not in cast", () => {
    expect(buildPreamble(fullCast, "Nonexistent")).toBe("");
  });

  it("builds the full three-section preamble when all fields present", () => {
    const p = buildPreamble(fullCast, "WM");
    expect(p).toContain("AUDIO PROFILE: Seasoned mason, late 50s.");
    expect(p).toContain("THE SCENE: A lodge in deep of night.");
    expect(p).toContain("DIRECTOR'S NOTES");
    expect(p).toContain("Style: Measured, authoritative.");
    expect(p).toContain("Pacing: Deliberate.");
    expect(p).toContain("Accent: Educated American.");
    expect(p).toContain("Notes: Never theatrical.");
    expect(p).toContain("TRANSCRIPT");
  });

  it("ends with TRANSCRIPT newline so inline tags + text follow cleanly", () => {
    const p = buildPreamble(fullCast, "WM");
    expect(p.endsWith("TRANSCRIPT\n")).toBe(true);
  });

  it("skips missing fields rather than emitting empty labels", () => {
    const p = buildPreamble(fullCast, "JD");
    expect(p).toContain("Style: Crisp, distinct.");
    expect(p).not.toContain("Pacing:");
    expect(p).not.toContain("Accent:");
    expect(p).not.toContain("AUDIO PROFILE:");
    // Scene still present because it's on the cast, not the role card
    expect(p).toContain("THE SCENE: A lodge in deep of night.");
  });

  it("skips the DIRECTOR'S NOTES block entirely when no director fields set", () => {
    const cast: VoiceCastFile = {
      version: 1,
      roles: {
        WM: { profile: "The Master." },
      },
    };
    const p = buildPreamble(cast, "WM");
    expect(p).toContain("AUDIO PROFILE: The Master.");
    expect(p).not.toContain("DIRECTOR'S NOTES");
    expect(p).toContain("TRANSCRIPT");
  });

  it("returns empty string when the role card is completely empty", () => {
    const cast: VoiceCastFile = {
      version: 1,
      roles: {
        WM: {},
      },
    };
    expect(buildPreamble(cast, "WM")).toBe("");
  });
});

describe("assemblePrompt", () => {
  it("combines preamble + inline style + text", () => {
    expect(
      assemblePrompt(
        "AUDIO PROFILE: x\n\nTRANSCRIPT\n",
        "gravely",
        "So mote it be.",
      ),
    ).toBe("AUDIO PROFILE: x\n\nTRANSCRIPT\n[gravely] So mote it be.");
  });

  it("handles missing style (no bracket wrapper)", () => {
    expect(
      assemblePrompt("AUDIO PROFILE: x\n\nTRANSCRIPT\n", undefined, "Hello."),
    ).toBe("AUDIO PROFILE: x\n\nTRANSCRIPT\nHello.");
  });

  it("handles missing preamble (legacy path stays identical)", () => {
    expect(assemblePrompt("", "gravely", "So mote it be.")).toBe(
      "[gravely] So mote it be.",
    );
    expect(assemblePrompt("", undefined, "So mote it be.")).toBe(
      "So mote it be.",
    );
  });
});

describe("validateVoiceCast", () => {
  it("accepts a well-formed minimal file", () => {
    const result = validateVoiceCast({ version: 1, roles: {} });
    expect(result.ok).toBe(true);
  });

  it("accepts a full file and narrows the type", () => {
    const result = validateVoiceCast({
      version: 1,
      scene: "A lodge.",
      roles: {
        WM: {
          profile: "The Master.",
          style: "Measured.",
          pacing: "Slow.",
          accent: "Neutral American.",
          other: "With gravity.",
        },
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.roles.WM?.profile).toBe("The Master.");
      expect(result.value.scene).toBe("A lodge.");
    }
  });

  it("rejects wrong version", () => {
    const result = validateVoiceCast({ version: 2, roles: {} });
    expect(result.ok).toBe(false);
  });

  it("rejects missing roles", () => {
    const result = validateVoiceCast({ version: 1 });
    expect(result.ok).toBe(false);
  });

  it("rejects non-string fields with a useful error", () => {
    const result = validateVoiceCast({
      version: 1,
      roles: { WM: { profile: 42 } },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("WM");
      expect(result.error).toContain("profile");
    }
  });

  it("ignores unknown fields on role cards (forward-compatible)", () => {
    const result = validateVoiceCast({
      version: 1,
      roles: { WM: { profile: "The Master.", futureField: "whatever" } },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // unknown field stripped, known field preserved
      expect(result.value.roles.WM).toEqual({ profile: "The Master." });
    }
  });

  it("rejects non-object input", () => {
    expect(validateVoiceCast(null).ok).toBe(false);
    expect(validateVoiceCast("string").ok).toBe(false);
    expect(validateVoiceCast(42).ok).toBe(false);
  });
});
