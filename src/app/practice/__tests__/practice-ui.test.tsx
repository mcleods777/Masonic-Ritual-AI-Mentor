import React from "react";
import { expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

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


it("implements strict roving tab keyboard navigation and tab-panel semantics", async () => {
  render(<PracticePage />);
  const rehearsal = await screen.findByRole("tab", { name: "Rehearsal" });
  const listen = screen.getByRole("tab", { name: "Listen" });

  expect(rehearsal.getAttribute("aria-controls")).toBe("practice-panel-rehearsal");
  expect(listen.getAttribute("aria-controls")).toBe("practice-panel-listen");
  expect(document.getElementById("practice-panel-rehearsal")).toBeTruthy();
  expect(document.getElementById("practice-panel-listen")).toBeTruthy();
  expect(rehearsal.tabIndex).toBe(0);
  expect(listen.tabIndex).toBe(-1);
  expect(screen.getByRole("tabpanel").id).toBe("practice-panel-rehearsal");
  expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(rehearsal.id);

  rehearsal.focus();
  fireEvent.keyDown(rehearsal, { key: "ArrowRight" });
  expect(document.activeElement).toBe(listen);
  expect(listen.getAttribute("aria-selected")).toBe("true");
  expect(listen.tabIndex).toBe(0);
  expect(rehearsal.tabIndex).toBe(-1);
  expect(screen.getByRole("tabpanel").id).toBe("practice-panel-listen");

  fireEvent.keyDown(listen, { key: "Home" });
  expect(document.activeElement).toBe(rehearsal);
  fireEvent.keyDown(rehearsal, { key: "End" });
  expect(document.activeElement).toBe(listen);
  fireEvent.keyDown(listen, { key: "ArrowLeft" });
  expect(document.activeElement).toBe(rehearsal);
});
