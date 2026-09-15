import { describe, expect, it } from "vitest";
import {
  getRoleDisplayName,
  isListenLineSpeaking,
  isRehearsalLineSpeaking,
} from "../ui-polish";

describe("UI polish role/status behavior", () => {
  it("expands abbreviated source identifiers to full role names", () => {
    expect(getRoleDisplayName("WM")).toBe("Worshipful Master");
    expect(getRoleDisplayName("Ch")).toBe("Chaplain");
    expect(getRoleDisplayName("SW")).toBe("Senior Warden");
    expect(getRoleDisplayName("Tyl")).toBe("Tyler");
  });

  it("preserves unknown role identifiers for display", () => {
    expect(getRoleDisplayName("CustomRole")).toBe("CustomRole");
  });

  it("shows NOW SPEAKING only while Listen audio is actually playing", () => {
    expect(isListenLineSpeaking("playing", null)).toBe(true);
    expect(isListenLineSpeaking("paused", null)).toBe(false);
    expect(isListenLineSpeaking("finished", null)).toBe(false);
    expect(isListenLineSpeaking("playing", 2)).toBe(false);
  });

  it("shows NOW SPEAKING for active rehearsal voice states, not setup or errors", () => {
    expect(isRehearsalLineSpeaking("ai-speaking")).toBe(true);
    expect(isRehearsalLineSpeaking("listening")).toBe(true);
    expect(isRehearsalLineSpeaking("user-turn")).toBe(false);
    expect(isRehearsalLineSpeaking("checking")).toBe(false);
    expect(isRehearsalLineSpeaking("setup")).toBe(false);
  });
});
