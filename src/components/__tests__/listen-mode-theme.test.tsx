import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ListenMode from "../ListenMode";

vi.mock("@/lib/text-to-speech", () => ({
  speakAsRole: vi.fn(), assignVoicesToRoles: vi.fn(() => new Map()), stopSpeaking: vi.fn(), isTTSAvailable: vi.fn(() => true),
}));
vi.mock("@/lib/gavel-sound", () => ({ playGavelKnocks: vi.fn(), countGavelMarks: vi.fn(() => 0), warmAudioContext: vi.fn() }));
vi.mock("@/lib/tts-cloud", () => ({ preloadGeminiRitual: vi.fn(() => ({ abort: vi.fn() })) }));
vi.mock("@/lib/screen-wake-lock", () => ({ keepScreenAwake: vi.fn(), allowScreenSleep: vi.fn() }));
vi.mock("@/lib/document-parser", () => ({ cleanRitualText: (text: string) => text }));
vi.mock("@/lib/ui-polish", () => ({ getRoleDisplayName: (role: string) => role, isListenLineSpeaking: (state: string) => state === "playing" }));
vi.mock("../MasonicIcons", () => ({ getRoleIcon: vi.fn(() => null) }));

afterEach(() => cleanup());
Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { value: vi.fn(), configurable: true });

const sections = [
  { id: "one", speaker: "WM", text: "First line", cipherText: "", gavels: 0, degree: "EA", sectionName: "Opening", order: 0, action: "speak" },
  { id: "two", speaker: "SD", text: "Second line", cipherText: "", gavels: 0, degree: "EA", sectionName: "Opening", order: 1, action: "speak" },
];

it("renders every listen row with the approved script-line hook and keeps CSS selectors wired", () => {
  const { container } = render(<ListenMode sections={sections} />);
  const rows = [...container.querySelectorAll("#listen-line-0, #listen-line-1")];
  const css = readFileSync(resolve(__dirname, "../../app/globals.css"), "utf8");

  expect(rows).toHaveLength(2);
  expect(rows.every((row) => row.classList.contains("script-line"))).toBe(true);
  expect(css).toMatch(/\.practice-workspace \.script-line\s*\{/);
  expect(css).toMatch(/\.practice-workspace \.script-line\.opacity-30\s*\{\s*opacity:\s*1/);
});
