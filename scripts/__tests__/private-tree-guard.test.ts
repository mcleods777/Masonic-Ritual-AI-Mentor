import { describe, expect, it } from "vitest";
import { findPrivateTreePaths } from "../lib/private-tree-guard";

describe("findPrivateTreePaths", () => {
  it("returns every staged path inside the rituals tree", () => {
    expect(
      findPrivateTreePaths([
        "src/app/page.tsx",
        "rituals/ea.txt",
        "rituals/nested/lecture.mram",
      ]),
    ).toEqual(["rituals/ea.txt", "rituals/nested/lecture.mram"]);
  });
});
