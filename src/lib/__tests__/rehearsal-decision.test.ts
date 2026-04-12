import { describe, it, expect } from "vitest";
import {
  decideLineAction,
  planComparisonAction,
  DEFAULT_AUTO_ADVANCE_THRESHOLD,
  DEFAULT_AUTO_ADVANCE_BEAT_MS,
} from "../rehearsal-decision";

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

// ============================================================
// planComparisonAction — post-recitation routing
// ============================================================

describe("planComparisonAction — happy path", () => {
  it("exports default threshold of 95", () => {
    expect(DEFAULT_AUTO_ADVANCE_THRESHOLD).toBe(95);
  });

  it("exports default beat of 300ms", () => {
    expect(DEFAULT_AUTO_ADVANCE_BEAT_MS).toBe(300);
  });

  it("auto-advances on perfect 100% match", () => {
    const action = planComparisonAction(100, 5);
    expect(action.kind).toBe("auto-advance");
    if (action.kind === "auto-advance") {
      expect(action.nextIndex).toBe(6);
      expect(action.beatMs).toBe(300);
    }
  });

  it("auto-advances exactly at the threshold (boundary condition)", () => {
    // 95.0 is the smallest value that should auto-advance
    const action = planComparisonAction(95.0, 10);
    expect(action.kind).toBe("auto-advance");
  });

  it("auto-advances just above the threshold", () => {
    const action = planComparisonAction(95.1, 10);
    expect(action.kind).toBe("auto-advance");
  });

  it("routes to judge just below the threshold", () => {
    // 94.9 is the largest value that should NOT auto-advance
    const action = planComparisonAction(94.9, 10);
    expect(action.kind).toBe("judge");
  });

  it("routes to judge on phonetic-match-only score (~80%)", () => {
    // The phonetic forgiveness layer caps matches at 80%. If a user says
    // "tiler" when cipher is "tyler", they score ~80% — phonetically correct
    // but not near-perfect. Should show the judging screen so they can see.
    const action = planComparisonAction(80, 3);
    expect(action.kind).toBe("judge");
  });

  it("routes to judge on total failure (0%)", () => {
    const action = planComparisonAction(0, 0);
    expect(action.kind).toBe("judge");
  });

  it("advances to currentIndex + 1, not some other offset", () => {
    const action = planComparisonAction(100, 42);
    if (action.kind === "auto-advance") {
      expect(action.nextIndex).toBe(43);
    }
  });
});

describe("planComparisonAction — defensive handling", () => {
  it("routes to judge on NaN accuracy (never silently auto-advance on broken comparison)", () => {
    const action = planComparisonAction(NaN, 0);
    expect(action.kind).toBe("judge");
  });

  it("routes to judge on Infinity accuracy", () => {
    const action = planComparisonAction(Infinity, 0);
    expect(action.kind).toBe("judge");
  });

  it("routes to judge on negative Infinity accuracy", () => {
    const action = planComparisonAction(-Infinity, 0);
    expect(action.kind).toBe("judge");
  });

  it("treats negative accuracy as judge", () => {
    const action = planComparisonAction(-5, 0);
    expect(action.kind).toBe("judge");
  });
});

describe("planComparisonAction — custom thresholds", () => {
  it("respects a custom threshold", () => {
    const action = planComparisonAction(85, 0, 80);
    expect(action.kind).toBe("auto-advance");
  });

  it("respects a custom beat duration", () => {
    const action = planComparisonAction(100, 0, 95, 500);
    if (action.kind === "auto-advance") {
      expect(action.beatMs).toBe(500);
    }
  });

  it("strict threshold of 100 means only perfect advances", () => {
    expect(planComparisonAction(99.9, 0, 100).kind).toBe("judge");
    expect(planComparisonAction(100, 0, 100).kind).toBe("auto-advance");
  });
});
