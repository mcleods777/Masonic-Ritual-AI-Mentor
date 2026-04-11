import { describe, it, expect } from "vitest";
import { decideLineAction } from "../rehearsal-decision";

describe("decideLineAction — basic routing", () => {
  it("listens when the speaker matches the user's role and text is present", () => {
    expect(
      decideLineAction(
        { speaker: "SW", text: "Brother Senior Warden, all present are Masons." },
        "SW",
      ),
    ).toBe("user-turn");
  });

  it("speaks when another speaker has text", () => {
    expect(
      decideLineAction(
        { speaker: "WM", text: "What is the first great care of Masons?" },
        "SW",
      ),
    ).toBe("ai-speaks");
  });

  it("silently advances when there is no speaker", () => {
    expect(
      decideLineAction({ speaker: null, text: "Stage direction text" }, "SW"),
    ).toBe("silent-advance");
  });
});

describe("decideLineAction — regression: empty-text rows don't hang the rehearsal", () => {
  // This is the bug that blocked swapping ea-opening.mram to the dialogue-
  // sourced build: action-only lines like `SW: [due guard given]` (stored
  // as role=SW, plain="", cipher="", action="due guard given") made the
  // rehearsal enter listening mode on lines that cannot be recited.

  it("does NOT enter listening for a user-role row with empty text", () => {
    expect(
      decideLineAction({ speaker: "SW", text: "" }, "SW"),
    ).toBe("silent-advance");
  });

  it("does NOT enter listening for a user-role row with whitespace-only text", () => {
    expect(
      decideLineAction({ speaker: "SW", text: "   \n\t  " }, "SW"),
    ).toBe("silent-advance");
  });

  it("does NOT speak an empty-text row even when the speaker is set", () => {
    expect(
      decideLineAction({ speaker: "WM", text: "" }, "SW"),
    ).toBe("silent-advance");
  });

  it("treats structural cues (CUE role) as silent advances regardless of user role", () => {
    // A CUE-role line has empty plain/cipher and its cue text lives in
    // the action field — which cleanRitualText doesn't see from `text`.
    expect(
      decideLineAction({ speaker: "CUE", text: "" }, "SW"),
    ).toBe("silent-advance");
    expect(
      decideLineAction({ speaker: "CUE", text: "" }, "CUE"),
    ).toBe("silent-advance");
  });

  it("treats gavel-only text as silent (cleanRitualText strips leading asterisks)", () => {
    // cleanRitualText strips gavel markers; if that's all the text had,
    // what remains is empty and the row should advance silently.
    expect(
      decideLineAction({ speaker: "WM", text: "***" }, "SW"),
    ).toBe("silent-advance");
  });

  it("treats [Action: ...] markup as silent (cleanRitualText removes action tags)", () => {
    expect(
      decideLineAction(
        { speaker: "SW", text: "[Action: due guard given]" },
        "SW",
      ),
    ).toBe("silent-advance");
  });
});

describe("decideLineAction — selectedRole matters", () => {
  it("same section routes differently for different user roles", () => {
    const section = { speaker: "WM", text: "It is my will and pleasure..." };
    expect(decideLineAction(section, "WM")).toBe("user-turn");
    expect(decideLineAction(section, "SW")).toBe("ai-speaks");
    expect(decideLineAction(section, "JD")).toBe("ai-speaks");
  });

  it("never enters user-turn when selectedRole is null", () => {
    // Before a role is selected, every spoken line routes to ai-speaks
    // (or silent-advance for empty rows).
    expect(
      decideLineAction({ speaker: "WM", text: "hello" }, null),
    ).toBe("ai-speaks");
    expect(
      decideLineAction({ speaker: "SW", text: "" }, null),
    ).toBe("silent-advance");
    expect(
      decideLineAction({ speaker: null, text: "stage direction" }, null),
    ).toBe("silent-advance");
  });
});
