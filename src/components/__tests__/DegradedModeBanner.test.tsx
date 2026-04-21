import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { act } from "react";
import DegradedModeBanner from "../DegradedModeBanner";
import {
  setDegradedMode,
  __resetDegradedModeForTests,
} from "@/lib/degraded-mode-store";

/**
 * DegradedModeBanner renders "Live AI is paused..." when the degraded-mode
 * store flag is true; renders nothing when it's false. Dismissable per
 * session via a visible "Dismiss" button, but the store flag is NOT cleared
 * on dismiss — a subsequent setDegradedMode(false) then setDegradedMode(true)
 * re-opens the banner (D-18 semantics).
 */

describe("<DegradedModeBanner />", () => {
  beforeEach(() => {
    __resetDegradedModeForTests();
  });

  afterEach(() => {
    cleanup();
    __resetDegradedModeForTests();
  });

  it("renders nothing when degradedMode is off", () => {
    const { container } = render(<DegradedModeBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a role='status' banner with the soft copy when degradedMode is on", () => {
    act(() => {
      setDegradedMode(true);
    });
    render(<DegradedModeBanner />);
    const banner = screen.getByRole("status");
    expect(banner).toBeTruthy();
    expect(banner.textContent).toContain("Live AI is paused");
  });

  it("disappears after the Dismiss button is clicked (per-session dismiss)", () => {
    act(() => {
      setDegradedMode(true);
    });
    render(<DegradedModeBanner />);
    expect(screen.getByRole("status")).toBeTruthy();
    const btn = screen.getByRole("button", { name: /dismiss/i });
    fireEvent.click(btn);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("reappears on a subsequent setDegradedMode(true) after a false→true transition (D-18 re-trigger)", () => {
    act(() => {
      setDegradedMode(true);
    });
    render(<DegradedModeBanner />);
    // Simulate the store toggling off then back on (e.g., mid-session recovery
    // followed by another paid_disabled response).
    act(() => {
      setDegradedMode(false);
    });
    expect(screen.queryByRole("status")).toBeNull();
    act(() => {
      setDegradedMode(true);
    });
    expect(screen.getByRole("status")).toBeTruthy();
  });
});
