import React from "react";
import { expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ list: vi.fn(), sections: vi.fn() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("doc=synthetic") }));
vi.mock("@/lib/storage", () => ({ listDocuments: mocks.list, getDocumentSections: mocks.sections }));
vi.mock("@/components/RehearsalMode", () => ({ default: () => <div>Active synthetic rehearsal</div> }));
vi.mock("@/components/ListenMode", () => ({ default: () => <div>Active synthetic listening</div> }));
import PracticePage from "../page";

const docs = [
  { id: "synthetic", title: "Entered Apprentice Opening", createdAt: "2030-01-01T00:00:00.000Z", sectionCount: 2, isMRAM: true },
  { id: "second", title: "Entered Apprentice Closing", createdAt: "2030-01-01T00:00:00.000Z", sectionCount: 2, isMRAM: true },
];

beforeEach(() => {
  mocks.list.mockResolvedValue(docs);
  mocks.sections.mockResolvedValue([{ id: "1", speaker: "WM", text: "Welcome" }, { id: "2", speaker: "Ch", text: "Prayer" }]);
});
afterEach(() => cleanup());

it("presents ritual title, section context, and labeled document switcher", async () => {
  render(<PracticePage />);
  expect(await screen.findByRole("heading", { name: "Entered Apprentice Opening" })).toBeTruthy();
  expect(screen.getByText("Practice workspace")).toBeTruthy();
  expect(screen.getByText("Practice / Entered Apprentice Opening")).toBeTruthy();
  expect(screen.getByLabelText("Switch ritual document")).toBeTruthy();
});

it("exposes compact mode tabs with an explicit active state", async () => {
  render(<PracticePage />);
  expect((await screen.findByRole("tab", { name: "Rehearsal" })).getAttribute("aria-selected")).toBe("true");
  expect(screen.getByRole("tab", { name: "Listen" }).getAttribute("aria-selected")).toBe("false");
});
