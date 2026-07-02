/**
 * Regression test for CR-03 — the unlocked cross-process read-modify-write
 * on the shared rituals/_bake-cache/_INDEX.json. Under bake-all.ts
 * --parallel N, multiple build-mram-from-dialogue.ts children used to
 * read-modify-write the SAME shared _INDEX.json concurrently; the
 * last-writer-wins race silently dropped a sibling child's D-08
 * tier/provenance entries (fallback-tier lines never regenerate an index
 * entry, since index writes only happen on a fresh render).
 *
 * Fix (see 03-REVIEW.md, code review Option 1): each child owns an
 * EXCLUSIVE per-slug shard (_INDEX.<slug>.json), so there is no
 * cross-process contention on a single file by construction. Readers
 * (readBakeIndex) merge _INDEX.json + every shard. The parent
 * consolidates shards into a canonical _INDEX.json after a clean wave
 * (consolidateBakeIndex).
 *
 * All fixtures use fs.mkdtempSync temp dirs — never rituals/ real content
 * — and make zero API calls (these are pure filesystem-level tests of the
 * index read/write/merge/consolidate helpers).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  readBakeIndex,
  upsertBakeIndexEntry,
  consolidateBakeIndex,
  bakeIndexShardPath,
  type BakeIndexEntry,
} from "../build-mram-from-dialogue";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bake-index-shard-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function entry(overrides: Partial<BakeIndexEntry> = {}): BakeIndexEntry {
  return {
    cacheKey: "abc123",
    model: "gemini-3.1-flash",
    ritualSlug: "ea-opening",
    lineId: 1,
    byteLen: 1000,
    durationMs: 500,
    createdAt: new Date().toISOString(),
    tier: "premium",
    ...overrides,
  };
}

describe("CR-03: interleaved-writer no-loss (concurrent children, DIFFERENT slugs)", () => {
  it("keeps BOTH slugs' entries when two children's upserts interleave A-reads/B-reads/A-writes/B-writes", () => {
    // Simulates the concrete race from CR-03: two children baking DIFFERENT
    // rituals ("ea-opening" and "ea-closing") race to upsert their first
    // line's index entry. Under the OLD shared-_INDEX.json implementation,
    // both children would readBakeIndex() (both seeing an empty/stale
    // file), then both write their own upserted array back — whichever
    // child's write landed LAST would win, silently dropping the other
    // child's entry. The per-slug shard design defeats this interleave:
    // each child writes to a DISTINCT file
    // (_INDEX.ea-opening.json vs _INDEX.ea-closing.json), so there is no
    // shared mutable state for the interleave to corrupt.
    const entryA = entry({ ritualSlug: "ea-opening", lineId: 1, cacheKey: "aaa111" });
    const entryB = entry({ ritualSlug: "ea-closing", lineId: 1, cacheKey: "bbb222" });

    // Explicit A-reads / B-reads / A-writes / B-writes interleave order.
    // (upsertBakeIndexEntry itself does the read-modify-write; calling the
    // two upserts back-to-back against the same cacheDir, one per slug,
    // IS the interleave — each call only ever touches its own slug's
    // shard file, so there is no shared read that either call's write
    // could stomp on.)
    upsertBakeIndexEntry(tmpDir, entryA); // "A reads" (empty shard) + "A writes"
    upsertBakeIndexEntry(tmpDir, entryB); // "B reads" (empty shard) + "B writes"

    const merged = readBakeIndex(tmpDir);
    const slugs = merged.map((e) => e.ritualSlug).sort();
    expect(slugs).toEqual(["ea-closing", "ea-opening"]);
    expect(merged.find((e) => e.ritualSlug === "ea-opening")?.cacheKey).toBe("aaa111");
    expect(merged.find((e) => e.ritualSlug === "ea-closing")?.cacheKey).toBe("bbb222");
  });

  it("each slug lands in its own distinct shard file on disk", () => {
    upsertBakeIndexEntry(tmpDir, entry({ ritualSlug: "ea-opening" }));
    upsertBakeIndexEntry(tmpDir, entry({ ritualSlug: "ea-closing" }));

    const files = fs.readdirSync(tmpDir).sort();
    expect(files).toContain("_INDEX.ea-opening.json");
    expect(files).toContain("_INDEX.ea-closing.json");
    // No shared _INDEX.json is written by upsert — only consolidation
    // writes that file.
    expect(files).not.toContain("_INDEX.json");
  });
});

describe("CR-03: same-slug upsert idempotency", () => {
  it("two upserts for the same (ritualSlug,lineId,cacheKey) leave exactly one entry (the later one)", () => {
    upsertBakeIndexEntry(tmpDir, entry({ byteLen: 1000 }));
    upsertBakeIndexEntry(tmpDir, entry({ byteLen: 2000 }));
    const merged = readBakeIndex(tmpDir);
    expect(merged).toHaveLength(1);
    expect(merged[0].byteLen).toBe(2000);
  });

  it("a second lineId for the same slug appends within that slug's shard", () => {
    upsertBakeIndexEntry(tmpDir, entry({ lineId: 1 }));
    upsertBakeIndexEntry(tmpDir, entry({ lineId: 2 }));
    const merged = readBakeIndex(tmpDir);
    expect(merged).toHaveLength(2);
    const shard = JSON.parse(
      fs.readFileSync(bakeIndexShardPath(tmpDir, "ea-opening"), "utf8"),
    ) as BakeIndexEntry[];
    expect(shard).toHaveLength(2);
  });
});

describe("CR-03: fallback-tier survival (D-08 provenance)", () => {
  it("readBakeIndex returns a fallback-tier entry written to its own shard alongside a premium-tier entry in a different shard", () => {
    upsertBakeIndexEntry(
      tmpDir,
      entry({ ritualSlug: "ea-opening", tier: "fallback", model: "google:en-US-Neural2-D" }),
    );
    upsertBakeIndexEntry(
      tmpDir,
      entry({ ritualSlug: "ea-closing", tier: "premium", model: "gemini-3.1-flash" }),
    );

    const merged = readBakeIndex(tmpDir);
    const fallbackEntry = merged.find((e) => e.ritualSlug === "ea-opening");
    const premiumEntry = merged.find((e) => e.ritualSlug === "ea-closing");
    expect(fallbackEntry?.tier).toBe("fallback");
    expect(premiumEntry?.tier).toBe("premium");
  });
});

describe("CR-03: parent consolidation", () => {
  it("consolidateBakeIndex writes the full union to _INDEX.json and removes every shard", () => {
    upsertBakeIndexEntry(tmpDir, entry({ ritualSlug: "ea-opening", lineId: 1, cacheKey: "aaa" }));
    upsertBakeIndexEntry(tmpDir, entry({ ritualSlug: "ea-opening", lineId: 2, cacheKey: "bbb" }));
    upsertBakeIndexEntry(tmpDir, entry({ ritualSlug: "ea-closing", lineId: 1, cacheKey: "ccc" }));

    consolidateBakeIndex(tmpDir);

    const files = fs.readdirSync(tmpDir);
    expect(files).toContain("_INDEX.json");
    expect(files.some((f) => f.startsWith("_INDEX.") && f !== "_INDEX.json")).toBe(false);
    expect(files.some((f) => f.endsWith(".tmp"))).toBe(false);

    const consolidated = JSON.parse(
      fs.readFileSync(path.join(tmpDir, "_INDEX.json"), "utf8"),
    ) as BakeIndexEntry[];
    expect(consolidated).toHaveLength(3);

    // readBakeIndex still returns the same union purely from the
    // consolidated file now that every shard is gone.
    const merged = readBakeIndex(tmpDir);
    expect(merged).toHaveLength(3);
    const slugs = merged.map((e) => e.ritualSlug).sort();
    expect(slugs).toEqual(["ea-closing", "ea-opening", "ea-opening"]);
  });

  it("consolidation is idempotent — running it twice with no new shard writes yields the same union", () => {
    upsertBakeIndexEntry(tmpDir, entry({ ritualSlug: "ea-opening" }));
    consolidateBakeIndex(tmpDir);
    const first = readBakeIndex(tmpDir);
    consolidateBakeIndex(tmpDir);
    const second = readBakeIndex(tmpDir);
    expect(second).toEqual(first);
  });

  it("a shard entry written AFTER a prior consolidation still surfaces (shard wins over same-key legacy entry)", () => {
    upsertBakeIndexEntry(tmpDir, entry({ ritualSlug: "ea-opening", byteLen: 1000 }));
    consolidateBakeIndex(tmpDir);
    // Simulates a later bake re-rendering the same line with an updated
    // byteLen, written to a fresh shard (consolidation already removed
    // the prior shard).
    upsertBakeIndexEntry(tmpDir, entry({ ritualSlug: "ea-opening", byteLen: 9999 }));

    const merged = readBakeIndex(tmpDir);
    expect(merged).toHaveLength(1);
    expect(merged[0].byteLen).toBe(9999);
  });
});
