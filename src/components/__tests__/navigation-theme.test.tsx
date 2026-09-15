import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import Navigation from "../Navigation";

const pathname = vi.hoisted(() => ({ value: "/practice" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
}));

vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <a {...props}>{children}</a>
  ),
}));

afterEach(() => cleanup());

it("uses the muted-gold navigation treatment for desktop and mobile active states", () => {
  const { container } = render(<Navigation />);
  const nav = container.querySelector("nav");
  const practiceLinks = screen.getAllByRole("link", { name: /practice/i });

  expect(nav?.classList.contains("ritual-navigation")).toBe(true);
  expect(practiceLinks).toHaveLength(1);
  expect(practiceLinks[0].classList.contains("ritual-navigation__item--active")).toBe(true);
  expect(practiceLinks[0].classList.contains("text-amber-400")).toBe(false);
  expect(screen.getByRole("link", { name: /ritual mentor/i }).classList.contains("ritual-navigation__logo")).toBe(true);

});
