/**
 * Silent on-mount preload behavior for ListenMode and RehearsalMode.
 *
 * Covers the 2026-04-20 UI-subtraction PR: after the visible
 * "Preload audio" button is removed, the components silently warm
 * IndexedDB for any ritual lines that lack baked audio. Tests here
 * verify that behavior directly, via a mocked preloadGeminiRitual.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { act } from "react";
import type { RitualSectionWithCipher } from "@/lib/storage";

// jsdom doesn't implement scrollIntoView; ListenMode uses it when
// the current line changes. Stub it so the component tree mounts.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

// Mock everything that would hit real APIs or the audio subsystem.
const preloadMock = vi.fn();
const abortMock = vi.fn();

vi.mock("@/lib/tts-cloud", async () => {
  const actual = await vi.importActual<typeof import("@/lib/tts-cloud")>("@/lib/tts-cloud");
  return {
    ...actual,
    preloadGeminiRitual: (...args: unknown[]) => {
      preloadMock(...args);
      return { abort: abortMock, done: Promise.resolve() };
    },
    VOXTRAL_ROLE_OPTIONS: [],
  };
});

vi.mock("@/lib/text-to-speech", () => ({
  speakAsRole: vi.fn(async () => {}),
  assignVoicesToRoles: vi.fn(() => new Map()),
  stopSpeaking: vi.fn(),
  isTTSAvailable: vi.fn(() => true),
  getLastTTSError: vi.fn(() => null),
  clearLastTTSError: vi.fn(),
}));

vi.mock("@/lib/gavel-sound", () => ({
  playGavelKnocks: vi.fn(async () => {}),
  countGavelMarks: vi.fn(() => 0),
  warmAudioContext: vi.fn(),
}));

import ListenMode from "../ListenMode";

function makeSection(overrides: Partial<RitualSectionWithCipher>): RitualSectionWithCipher {
  return {
    id: "s1",
    ritualId: "r1",
    order: 0,
    type: "dialogue",
    textCipher: "",
    textIv: "",
    text: "Hello brethren",
    speaker: "WM",
    style: undefined,
    audioCipher: undefined,
    audioIv: undefined,
    audio: undefined,
    ...overrides,
  } as RitualSectionWithCipher;
}

describe("ListenMode silent preload", () => {
  beforeEach(() => {
    preloadMock.mockClear();
    abortMock.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("only preloads lines where section.audio is undefined", () => {
    const sections: RitualSectionWithCipher[] = [
      makeSection({ id: "s1", text: "Line with bake", audio: "BASE64" }),
      makeSection({ id: "s2", text: "Line without bake", audio: undefined }),
      makeSection({ id: "s3", text: "Another gap line", audio: undefined }),
    ];

    render(<ListenMode sections={sections} />);

    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(preloadMock).toHaveBeenCalledTimes(1);
    const [lines] = preloadMock.mock.calls[0];
    expect(lines).toHaveLength(2);
    expect((lines as { text: string }[]).map((l) => l.text)).toEqual([
      "Line without bake",
      "Another gap line",
    ]);
  });

  it("does not call preload if no lines are missing baked audio", () => {
    const sections: RitualSectionWithCipher[] = [
      makeSection({ id: "s1", audio: "BASE64A" }),
      makeSection({ id: "s2", audio: "BASE64B" }),
    ];

    render(<ListenMode sections={sections} />);

    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(preloadMock).not.toHaveBeenCalled();
  });

  it("honors the 2.5s delay before firing", () => {
    const sections: RitualSectionWithCipher[] = [
      makeSection({ audio: undefined }),
    ];

    render(<ListenMode sections={sections} />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(preloadMock).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(preloadMock).toHaveBeenCalledTimes(1);
  });

  it("cancels the scheduled preload if unmounted before the delay elapses", () => {
    const sections: RitualSectionWithCipher[] = [
      makeSection({ audio: undefined }),
    ];

    const { unmount } = render(<ListenMode sections={sections} />);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    unmount();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(preloadMock).not.toHaveBeenCalled();
  });

  it("aborts an in-flight preload on unmount", () => {
    const sections: RitualSectionWithCipher[] = [
      makeSection({ audio: undefined }),
    ];

    const { unmount } = render(<ListenMode sections={sections} />);

    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(preloadMock).toHaveBeenCalledTimes(1);

    unmount();

    expect(abortMock).toHaveBeenCalled();
  });
});
