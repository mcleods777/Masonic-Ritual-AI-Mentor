import { describe, it, expect } from "vitest";
import {
  roleToGroup,
  VOXTRAL_ROLE_OPTIONS,
  GEMINI_ROLE_VOICES,
  getGeminiVoiceForRole,
} from "../tts-cloud";

/**
 * Known-female Gemini voices per Google's published roster. Masonry is a
 * men's fraternity — none of these voices should ever be the selected
 * voice for any Masonic role, lecture, narrator, or feedback line.
 * This set must stay in sync with GEMINI_FEMALE_VOICES in tts-cloud.ts.
 */
const FEMALE_GEMINI_VOICES = new Set([
  "Kore",
  "Zephyr",
  "Aoede",
  "Callirrhoe",
  "Autonoe",
  "Despina",
  "Erinome",
  "Laomedeia",
  "Leda",
  "Pulcherrima",
  "Sulafat",
  "Vindemiatrix",
  "Achernar",
  "Gacrux",
]);

describe("roleToGroup", () => {
  it("maps WM and aliases to group 0", () => {
    expect(roleToGroup("WM")).toBe(0);
    expect(roleToGroup("W.M.")).toBe(0);
    expect(roleToGroup("W. M.")).toBe(0);
    expect(roleToGroup("ALL")).toBe(0);
    expect(roleToGroup("SW/WM")).toBe(0);
  });

  it("maps SW to group 1", () => {
    expect(roleToGroup("SW")).toBe(1);
    expect(roleToGroup("S.W.")).toBe(1);
    expect(roleToGroup("S. W.")).toBe(1);
  });

  it("maps JW to group 2", () => {
    expect(roleToGroup("JW")).toBe(2);
    expect(roleToGroup("J.W.")).toBe(2);
  });

  it("maps deacons to groups 3 and 4", () => {
    expect(roleToGroup("SD")).toBe(3);
    expect(roleToGroup("S.D.")).toBe(3);
    expect(roleToGroup("JD")).toBe(4);
    expect(roleToGroup("J.D.")).toBe(4);
  });

  it("maps secretary to group 5", () => {
    expect(roleToGroup("Sec")).toBe(5);
    expect(roleToGroup("Sec.")).toBe(5);
  });

  it("maps chaplain/prayer to group 6", () => {
    expect(roleToGroup("Chap")).toBe(6);
    expect(roleToGroup("PRAYER")).toBe(6);
    expect(roleToGroup("Prayer")).toBe(6);
  });

  it("maps treasurer to group 7", () => {
    expect(roleToGroup("Treas")).toBe(7);
    expect(roleToGroup("Trs")).toBe(7);
  });

  it("maps marshal/tyler to group 8", () => {
    expect(roleToGroup("Marshal")).toBe(8);
    expect(roleToGroup("Tyler")).toBe(8);
    expect(roleToGroup("T")).toBe(8);
  });

  it("maps candidate/brother to group 9", () => {
    expect(roleToGroup("Candidate")).toBe(9);
    expect(roleToGroup("C")).toBe(9);
    expect(roleToGroup("BR")).toBe(9);
    expect(roleToGroup("Bro")).toBe(9);
  });

  it("maps stewards to group 10", () => {
    expect(roleToGroup("Steward")).toBe(10);
    expect(roleToGroup("SS")).toBe(10);
    expect(roleToGroup("JS")).toBe(10);
  });

  it("maps narrator to group 11 (split from candidate)", () => {
    expect(roleToGroup("Narrator")).toBe(11);
  });

  it("returns -1 for unknown roles", () => {
    expect(roleToGroup("Unknown")).toBe(-1);
    expect(roleToGroup("")).toBe(-1);
    expect(roleToGroup("Past Master")).toBe(-1);
  });
});

describe("getGeminiVoiceForRole — no female voices anywhere", () => {
  it("never returns a female voice for any role in GEMINI_ROLE_VOICES", () => {
    for (const [role, voice] of Object.entries(GEMINI_ROLE_VOICES)) {
      expect(FEMALE_GEMINI_VOICES.has(voice), `role ${role} mapped to female voice ${voice}`).toBe(false);
    }
  });

  it("returns a male voice for every known officer role (exact match)", () => {
    const roles = ["WM", "SW", "JW", "SD", "JD", "Sec", "Trs", "Ch", "Marshal", "Steward", "Candidate", "Narrator"];
    for (const role of roles) {
      const voice = getGeminiVoiceForRole(role);
      expect(FEMALE_GEMINI_VOICES.has(voice), `role ${role} resolved to female voice ${voice}`).toBe(false);
    }
  });

  it("returns a male voice for every Voxtral role-group alias", () => {
    const aliases = [
      "W.M.", "W. M.", "ALL", "All", "SW/WM", "WM/Chaplain",
      "S.W.", "S. W.",
      "J.W.", "J. W.",
      "S.D.", "S. D.", "S(orJ)D", "S/J D",
      "J.D.", "J. D.",
      "S/Sec", "Sec.", "S",
      "Chap", "Chap.", "PRAYER", "Prayer",
      "Tr", "Treas", "Treas.",
      "T", "Tyler",
      "C", "BR", "Bro", "Bro.", "Voucher", "Vchr",
      "SS", "JS",
    ];
    for (const role of aliases) {
      const voice = getGeminiVoiceForRole(role);
      expect(FEMALE_GEMINI_VOICES.has(voice), `alias ${role} resolved to female voice ${voice}`).toBe(false);
    }
  });

  it("returns a male voice for unknown / unmapped roles (lecture speaker fallback)", () => {
    const unmapped = ["Lecturer", "Lecture", "Explanatory", "Past Master", "PM", "GuestSpeaker", "", "???"];
    for (const role of unmapped) {
      const voice = getGeminiVoiceForRole(role);
      expect(FEMALE_GEMINI_VOICES.has(voice), `unmapped role "${role}" resolved to female voice ${voice}`).toBe(false);
    }
  });
});

describe("VOXTRAL_ROLE_OPTIONS", () => {
  it("has an empty-value auto option first", () => {
    expect(VOXTRAL_ROLE_OPTIONS[0].value).toBe("");
    expect(VOXTRAL_ROLE_OPTIONS[0].label).toContain("Auto");
  });

  it("has 13 options total (auto + 12 roles)", () => {
    expect(VOXTRAL_ROLE_OPTIONS.length).toBe(13);
  });

  it("includes all major officer roles", () => {
    const values = VOXTRAL_ROLE_OPTIONS.map((o) => o.value);
    expect(values).toContain("WM");
    expect(values).toContain("SW");
    expect(values).toContain("JW");
    expect(values).toContain("SD");
    expect(values).toContain("JD");
    expect(values).toContain("Sec");
    expect(values).toContain("Chap");
  });
});
