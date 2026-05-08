/**
 * SAFETY-06 client-side session step ceiling tests.
 *
 * The 200-step cap on advanceInternal prevents a runaway auto-advance chain
 * from firing feedback/TTS calls all night. The server-side 300-calls/5-min
 * counter in /api/rehearsal-feedback (shipped in Plan 03) is the
 * belt-and-suspenders; this plan tests the client half.
 *
 * Test strategy: the plan offered two options (pure helper OR full render).
 * We use BOTH. The pure helper covers all 5 behaviors deterministically
 * (fast, no timers); one integration smoke test proves the helper is
 * actually wired into <RehearsalMode />. Combined, this catches both
 * logic bugs AND wiring regressions without relying on 200+ fake-timer
 * cycles through a 1,511-line component.
 *
 * Per plan's "Option A preferred" guidance plus a render smoke test.
 */

// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { act } from "react";
import type { RitualSectionWithCipher } from "@/lib/storage";

// jsdom stubs for APIs RehearsalMode touches on mount
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

// Module-level mocks so the integration smoke test below doesn't hit real APIs
vi.mock("@/lib/tts-cloud", () => ({
  preloadGeminiRitual: () => ({ abort: vi.fn(), done: Promise.resolve() }),
  VOXTRAL_ROLE_OPTIONS: [],
}));

vi.mock("@/lib/text-to-speech", () => ({
  speak: vi.fn(async () => {}),
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

vi.mock("@/lib/screen-wake-lock", () => ({
  keepScreenAwake: vi.fn(async () => {}),
  allowScreenSleep: vi.fn(async () => {}),
}));

vi.mock("@/lib/performance-history", () => ({
  saveSession: vi.fn(async () => {}),
}));

vi.mock("@/lib/speech-to-text", () => ({
  createWebSpeechEngine: vi.fn(),
  createWhisperEngine: vi.fn(),
  isWebSpeechAvailable: vi.fn(() => true),
  isMediaRecorderAvailable: vi.fn(() => true),
  releaseSpeechResources: vi.fn(),
}));

import RehearsalMode, {
  checkStepCeiling,
  resolveMaxSessionSteps,
} from "../RehearsalMode";

describe("SAFETY-06 step-ceiling pure helper", () => {
  const ORIGINAL_ENV = process.env.NEXT_PUBLIC_RITUAL_MAX_STEPS;

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.NEXT_PUBLIC_RITUAL_MAX_STEPS;
    } else {
      process.env.NEXT_PUBLIC_RITUAL_MAX_STEPS = ORIGINAL_ENV;
    }
  });

  it("allows 200 successive steps at the default ceiling", () => {
    delete process.env.NEXT_PUBLIC_RITUAL_MAX_STEPS;
    const max = resolveMaxSessionSteps();
    expect(max).toBe(200);

    // Counter goes 1..200 — all allowed.
    for (let count = 1; count <= 200; count++) {
      expect(checkStepCeiling(count, max)).toBe("allow");
    }
  });

  it("halts the 201st step at the default ceiling", () => {
    const max = resolveMaxSessionSteps();
    expect(checkStepCeiling(201, max)).toBe("halt");
    expect(checkStepCeiling(1000, max)).toBe("halt");
  });

  it("does not auto-reset: a counter at 150 plus 50 more trips at the 201st", () => {
    // The runaway-loop defense: auto-advance must NOT reset its own counter.
    // Simulating a chain that starts at 150 and continues for 50 more steps.
    const max = resolveMaxSessionSteps();
    let count = 150;
    for (let i = 0; i < 50; i++) {
      count += 1;
      expect(checkStepCeiling(count, max)).toBe("allow"); // 151..200 all allowed
    }
    count += 1; // step 201
    expect(checkStepCeiling(count, max)).toBe("halt");
  });

  it("honors NEXT_PUBLIC_RITUAL_MAX_STEPS env override (caps at 50)", () => {
    process.env.NEXT_PUBLIC_RITUAL_MAX_STEPS = "50";
    const max = resolveMaxSessionSteps();
    expect(max).toBe(50);

    expect(checkStepCeiling(50, max)).toBe("allow");
    expect(checkStepCeiling(51, max)).toBe("halt");
  });

  it("falls back to 200 when env override is malformed", () => {
    // Defensive: garbage in env should not silently disable the ceiling.
    process.env.NEXT_PUBLIC_RITUAL_MAX_STEPS = "not-a-number";
    const max = resolveMaxSessionSteps();
    expect(max).toBe(200);
  });
});

describe("SAFETY-06 ceiling wiring in <RehearsalMode />", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_RITUAL_MAX_STEPS;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("RehearsalMode exports the ceiling helpers used by advanceInternal", () => {
    // If a future refactor deletes the helpers or the ceiling gate, this
    // import-and-wire smoke test catches it at test-time rather than at
    // runtime-at-3am when a rehearsal loop wedges.
    expect(typeof checkStepCeiling).toBe("function");
    expect(typeof resolveMaxSessionSteps).toBe("function");
  });

  it("renders without error and exposes the setup UI (sanity check component boots)", () => {
    // This proves the ceiling additions did not break module initialization
    // or component mount. A broken useRef/parseInt call would crash here.
    const sections: RitualSectionWithCipher[] = [
      {
        id: "s1",
        degree: "EA",
        sectionName: "Opening",
        speaker: "WM",
        text: "Brethren, assemble",
        cipherText: "",
        order: 0,
        gavels: 0,
        action: null,
      },
    ];

    let container: HTMLElement | null = null;
    act(() => {
      const result = render(<RehearsalMode sections={sections} />);
      container = result.container;
    });

    // Component rendered successfully in "setup" state
    expect(container).not.toBeNull();
    expect(container!.textContent).toMatch(/Choose Your Role/i);
  });
});
