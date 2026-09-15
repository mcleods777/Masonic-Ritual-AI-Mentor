import { describe, it, expect } from "vitest";
import { validateVoiceImport, type LocalVoice } from "../voice-storage";

function makeVoice(overrides: Partial<LocalVoice> = {}): LocalVoice {
  return {
    id: `voice-${Date.now()}-test`,
    name: "Test Voice",
    audioBase64: "dGVzdA==",
    mimeType: "audio/wav",
    duration: 5,
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeExportJson(
  voices: LocalVoice[],
  overrides: Record<string, unknown> = {}
): string {
  return JSON.stringify({
    format: "masonic-ritual-mentor-voices",
    version: 1,
    exportedAt: new Date().toISOString(),
    voices,
    ...overrides,
  });
}

describe("validateVoiceImport", () => {
  it("accepts a valid export file", () => {
    const json = makeExportJson([makeVoice()]);
    const result = validateVoiceImport(json);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.voices).toHaveLength(1);
  });

  it("accepts multiple voices", () => {
    const json = makeExportJson([
      makeVoice({ name: "A", role: "WM" }),
      makeVoice({ name: "B", role: "SW" }),
      makeVoice({ name: "C" }),
    ]);
    const result = validateVoiceImport(json);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.voices).toHaveLength(3);
  });

  it("rejects malformed JSON", () => {
    const result = validateVoiceImport("not json {{{");
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain("not valid JSON");
  });

  it("rejects wrong format string", () => {
    const result = validateVoiceImport(
      JSON.stringify({ format: "wrong", version: 1, voices: [makeVoice()] })
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain("not a voice profiles file");
  });

  it("rejects unsupported version", () => {
    const result = validateVoiceImport(
      makeExportJson([makeVoice()], { version: 99 })
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain("version 99");
  });

  it("rejects empty voices array", () => {
    const result = validateVoiceImport(makeExportJson([]));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain("no voice profiles");
  });

  it("rejects missing voices field", () => {
    const result = validateVoiceImport(
      JSON.stringify({ format: "masonic-ritual-mentor-voices", version: 1 })
    );
    expect(result.valid).toBe(false);
  });

  it("rejects voice missing name", () => {
    const voice = makeVoice();
    delete (voice as Record<string, unknown>).name;
    const result = validateVoiceImport(makeExportJson([voice]));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain("missing required field 'name'");
  });

  it("rejects voice missing audioBase64", () => {
    const voice = makeVoice();
    delete (voice as Record<string, unknown>).audioBase64;
    const result = validateVoiceImport(makeExportJson([voice]));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain("audioBase64");
  });

  it("rejects voice missing duration", () => {
    const voice = makeVoice();
    delete (voice as Record<string, unknown>).duration;
    const result = validateVoiceImport(makeExportJson([voice]));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain("duration");
  });

  it("accepts voice with undefined role (optional field)", () => {
    const voice = makeVoice({ role: undefined });
    const result = validateVoiceImport(makeExportJson([voice]));
    expect(result.valid).toBe(true);
  });

  it("preserves all voice fields through validation", () => {
    const voice = makeVoice({ name: "Brother McLeod", role: "WM", duration: 7.5 });
    const json = makeExportJson([voice]);
    const result = validateVoiceImport(json);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.voices[0].name).toBe("Brother McLeod");
      expect(result.voices[0].role).toBe("WM");
      expect(result.voices[0].duration).toBe(7.5);
      expect(result.voices[0].audioBase64).toBe("dGVzdA==");
    }
  });

  it("identifies which voice entry has the error", () => {
    const voices = [makeVoice({ name: "Good" }), makeVoice()];
    delete (voices[1] as Record<string, unknown>).mimeType;
    const result = validateVoiceImport(makeExportJson(voices));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toContain("Voice entry 2");
  });
});
