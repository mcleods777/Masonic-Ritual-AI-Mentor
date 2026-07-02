// @vitest-environment node
/**
 * Tests for scripts/preview-bake.ts (AUTHOR-08).
 *
 * Ported from the abandoned branch's 20-test-verified containment/Range
 * suite (`git show 58eb551:scripts/__tests__/preview-bake.test.ts`), with
 * the branch's ~/.cache references already gone (the Task 1 port reads the
 * canonical rituals/_bake-cache/ location via render-gemini-audio.ts's
 * exported CACHE_DIR, which these tests never touch directly — they pass
 * their own temp dir as `cacheDir` to the exported handler functions).
 *
 * Added beyond the branch suite:
 *   - Production-refusal test (NODE_ENV=production import throws [DEV-GUARD])
 *   - /api/index directory-listing fallback when no _INDEX.json exists
 *     (Wave 3 must not depend on the Wave 4 index-writer)
 *   - /api/index tier field passthrough when _INDEX.json is present
 *   - /api/index best-effort review-file merge
 *
 * Scope: pure unit tests — ensureLoopback, cacheKey regex + path-containment
 * defense-in-depth + Range handler + index-JSON handler, all via mocked
 * req/res objects. No integration test binding a real port (ephemeral
 * ports are irrelevant here since the handlers never call server.listen()
 * directly — the module only listens when run as the direct script).
 *
 * Threat coverage:
 *   - T-03-16 (ensureLoopback — refuse LAN exposure; assertDevOnly — refuse
 *     production) → "ensureLoopback" and "production refusal" describes
 *   - T-03-15 layer 1 (regex gate) → "cacheKey validation" describe
 *   - T-03-15 layer 2 (path-containment, defense-in-depth) → "path-containment" describe
 *   - RFC 7233 Range semantics → "Range handling" describe
 *   - D-08 tier-aware index + informal review-workflow absorption → "handleIndexJson" describe
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import http from "node:http";

// IMPORTANT: importing preview-bake runs `assertDevOnly()` at module load.
// In Vitest, NODE_ENV defaults to "test" → no throw.
import {
  ensureLoopback,
  handleOpusRequest,
  handleIndexJson,
  CACHE_KEY_REGEX,
} from "../preview-bake";

let tmpRoot: string;
beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "preview-bake-test-"));
});
afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
});

/**
 * Build a mock req/res pair for a given URL path. The captured object
 * accumulates statusCode + headers + end() body chunks so assertions can
 * inspect the response without needing a real network socket.
 */
function makeMockPair(urlPath: string, rangeHeader?: string) {
  const req = {
    url: urlPath,
    headers: rangeHeader ? { range: rangeHeader } : {},
  } as unknown as http.IncomingMessage;
  const captured: {
    statusCode?: number;
    headers?: http.OutgoingHttpHeaders;
    body: Buffer[];
  } = { body: [] };
  const res = {
    writeHead(sc: number, h?: http.OutgoingHttpHeaders) {
      captured.statusCode = sc;
      captured.headers = h;
    },
    end(chunk?: string | Buffer) {
      if (chunk) captured.body.push(Buffer.from(chunk as never));
    },
    // fs.createReadStream.pipe(res) needs writable-stream shape. Stub it.
    write(chunk: string | Buffer) {
      captured.body.push(Buffer.from(chunk as never));
      return true;
    },
    on() {
      return res as never;
    },
    once() {
      return res as never;
    },
    emit() {
      return true;
    },
  } as unknown as http.ServerResponse;
  return { req, res, captured };
}

/** Same capture shape, for handlers that only take a `res` argument. */
function makeMockRes() {
  const captured: {
    statusCode?: number;
    headers?: http.OutgoingHttpHeaders;
    body: string;
  } = { body: "" };
  const res = {
    writeHead(sc: number, h?: http.OutgoingHttpHeaders) {
      captured.statusCode = sc;
      captured.headers = h;
    },
    end(chunk?: string | Buffer) {
      if (chunk) captured.body += chunk.toString();
    },
  } as unknown as http.ServerResponse;
  return { res, captured };
}

// ============================================================
// ensureLoopback (T-03-16 mitigation)
// ============================================================
describe("ensureLoopback (T-03-16)", () => {
  it("refuses 0.0.0.0 with /loopback/ in message", () => {
    expect(() => ensureLoopback("0.0.0.0")).toThrow(/loopback/i);
  });
  it("refuses 192.168.1.5 (LAN address)", () => {
    expect(() => ensureLoopback("192.168.1.5")).toThrow(/loopback/i);
  });
  it("refuses :: (IPv6 unspecified)", () => {
    expect(() => ensureLoopback("::")).toThrow(/loopback/i);
  });
  it("accepts 127.0.0.1", () => {
    expect(() => ensureLoopback("127.0.0.1")).not.toThrow();
  });
  it("accepts ::1 (IPv6 loopback)", () => {
    expect(() => ensureLoopback("::1")).not.toThrow();
  });
});

// ============================================================
// Production refusal (T-03-16 — assertDevOnly at module load)
// ============================================================
describe("production refusal (T-03-16, assertDevOnly at module load)", () => {
  it("throws [DEV-GUARD] when NODE_ENV=production at import time", async () => {
    const env = process.env as Record<string, string | undefined>;
    const original = env.NODE_ENV;
    try {
      env.NODE_ENV = "production";
      vi.resetModules();
      await expect(import("../preview-bake")).rejects.toThrow(
        /\[DEV-GUARD\]/,
      );
    } finally {
      if (original === undefined) {
        delete env.NODE_ENV;
      } else {
        env.NODE_ENV = original;
      }
      vi.resetModules();
    }
  });
});

// ============================================================
// handleOpusRequest — cacheKey regex (T-03-15 layer 1 — path-traversal mitigation)
// ============================================================
describe("handleOpusRequest cacheKey validation (T-03-15 layer 1)", () => {
  it("rejects cacheKey with .. (400)", () => {
    const { req, res, captured } = makeMockPair("/a/../../../etc/passwd.opus");
    handleOpusRequest(req, res, tmpRoot);
    // Path shape /a/..... — literal ".." is not 64 hex → 400 after URL
    // decoding (or 404 if the URL regex doesn't match). Either way NOT 200.
    expect([400, 404]).toContain(captured.statusCode);
  });

  it("rejects cacheKey with / (treated as 404 — path does not match route regex)", () => {
    const { req, res, captured } = makeMockPair("/a/foo/bar.opus");
    handleOpusRequest(req, res, tmpRoot);
    // /a/foo/bar.opus does not match /^\/a\/([^/]+)\.opus$/, so the handler
    // falls into the "not a /a/...opus path" 404 branch.
    expect(captured.statusCode).toBe(404);
  });

  it("rejects uppercase hex cacheKey (400 — regex is lowercase only)", () => {
    const upper = "A".repeat(64);
    const { req, res, captured } = makeMockPair(`/a/${upper}.opus`);
    handleOpusRequest(req, res, tmpRoot);
    expect(captured.statusCode).toBe(400);
  });

  it("rejects cacheKey shorter than 64 chars (400)", () => {
    const short = "a".repeat(63);
    const { req, res, captured } = makeMockPair(`/a/${short}.opus`);
    handleOpusRequest(req, res, tmpRoot);
    expect(captured.statusCode).toBe(400);
  });

  it("rejects cacheKey longer than 64 chars (400)", () => {
    const long = "a".repeat(65);
    const { req, res, captured } = makeMockPair(`/a/${long}.opus`);
    handleOpusRequest(req, res, tmpRoot);
    expect(captured.statusCode).toBe(400);
  });

  it("rejects cacheKey with non-hex chars (400)", () => {
    const bad = "z".repeat(64);
    const { req, res, captured } = makeMockPair(`/a/${bad}.opus`);
    handleOpusRequest(req, res, tmpRoot);
    expect(captured.statusCode).toBe(400);
  });

  it("accepts valid 64-hex-char cacheKey + returns 404 for missing file", () => {
    const valid = "a".repeat(64);
    const { req, res, captured } = makeMockPair(`/a/${valid}.opus`);
    handleOpusRequest(req, res, tmpRoot);
    // Valid key but file doesn't exist → 404 (not 400).
    expect(captured.statusCode).toBe(404);
  });

  it("CACHE_KEY_REGEX is exported and matches exactly 64 lowercase hex chars", () => {
    // Sanity — the exported regex itself. Used by the layer-2 test below
    // to confirm layer 2 still fires when layer 1 is satisfied.
    expect(CACHE_KEY_REGEX.test("a".repeat(64))).toBe(true);
    expect(CACHE_KEY_REGEX.test("A".repeat(64))).toBe(false);
    expect(CACHE_KEY_REGEX.test("a".repeat(63))).toBe(false);
  });
});

// ============================================================
// handleOpusRequest — path-containment defense-in-depth (T-03-15 layer 2)
// ============================================================
describe("handleOpusRequest path-containment (T-03-15 layer 2 — defense-in-depth)", () => {
  it("rejects cacheKey that resolves outside cacheDir even with valid hex (symlink attack)", () => {
    // Layer 1 (regex) cannot catch this: the filename IS 64 lowercase hex
    // chars. Only layer 2 (path.resolve/realpathSync startsWith rootAbs +
    // sep) catches the fact that the resolved path escapes the cache dir
    // via a symlink.
    //
    // Strategy: create an "escape-target" file in a sibling dir, then plant
    // a symlink inside cacheDir whose filename is a valid 64-hex cacheKey
    // and whose target is the escape file. handleOpusRequest should refuse
    // with 400 (containment), not serve the escape file with 200.
    const escapeDir = fs.mkdtempSync(path.join(os.tmpdir(), "escape-target-"));
    try {
      const escapeFile = path.join(escapeDir, "secret.opus");
      fs.writeFileSync(escapeFile, Buffer.alloc(100, 0xaa));

      const validKey = "a".repeat(64);
      const linkPath = path.join(tmpRoot, `${validKey}.opus`);
      try {
        fs.symlinkSync(escapeFile, linkPath);
      } catch (err) {
        // Platforms that don't permit symlinks (Windows without dev mode,
        // some CI sandboxes) skip this test with a clear note.
        console.warn(
          `[T-03-15 layer-2 test] symlink creation failed (${(err as Error).message}); ` +
            `skipping containment test — platform does not allow symlinks in the test env.`,
        );
        return;
      }

      const { req, res, captured } = makeMockPair(`/a/${validKey}.opus`);
      handleOpusRequest(req, res, tmpRoot);

      // Layer 1 (regex) passes — valid 64 hex. Layer 2 (containment)
      // catches it: the resolved path is under escapeDir, not tmpRoot.
      // Response MUST be 400 (bad request), NOT 200 (serving the escape file).
      expect(captured.statusCode).toBe(400);
      // And we MUST NOT have exposed the escape file's bytes.
      const totalWritten = captured.body.reduce((s, b) => s + b.length, 0);
      expect(totalWritten).toBeLessThan(100); // never served the 100-byte secret
    } finally {
      try {
        fs.rmSync(escapeDir, { recursive: true, force: true });
      } catch {
        // best-effort
      }
    }
  });

  it("accepts cacheKey that resolves INSIDE cacheDir (sanity — layer-2 doesn't over-reject)", () => {
    // A regular file with a valid hex filename lives under cacheDir.
    // Layer 1 passes. Layer 2 should pass too — response is 200 (file served).
    const validKey = "b".repeat(64);
    const filepath = path.join(tmpRoot, `${validKey}.opus`);
    fs.writeFileSync(filepath, Buffer.alloc(50, 0x11));

    const { req, res, captured } = makeMockPair(`/a/${validKey}.opus`);
    handleOpusRequest(req, res, tmpRoot);

    // Not 400 (containment did not false-positive); 200 (file served).
    expect(captured.statusCode).toBe(200);
  });
});

// ============================================================
// handleOpusRequest — Range handling (RFC 7233)
// ============================================================
describe("handleOpusRequest Range handling (RFC 7233)", () => {
  function seedOpus(size: number): string {
    const key = "a".repeat(64);
    const filepath = path.join(tmpRoot, `${key}.opus`);
    fs.writeFileSync(filepath, Buffer.alloc(size, 0x55));
    return key;
  }

  it("returns 200 + Accept-Ranges when no Range header", () => {
    const key = seedOpus(1000);
    const { req, res, captured } = makeMockPair(`/a/${key}.opus`);
    handleOpusRequest(req, res, tmpRoot);
    expect(captured.statusCode).toBe(200);
    expect(captured.headers!["Content-Type"]).toBe("audio/ogg; codecs=opus");
    expect(captured.headers!["Accept-Ranges"]).toBe("bytes");
    expect(captured.headers!["Content-Length"]).toBe(1000);
  });

  it("returns 206 + Content-Range on bytes=0-99", () => {
    const key = seedOpus(1000);
    const { req, res, captured } = makeMockPair(
      `/a/${key}.opus`,
      "bytes=0-99",
    );
    handleOpusRequest(req, res, tmpRoot);
    expect(captured.statusCode).toBe(206);
    expect(captured.headers!["Content-Range"]).toBe("bytes 0-99/1000");
    expect(captured.headers!["Content-Length"]).toBe(100);
  });

  it("returns 206 on open-ended bytes=500- (to end of file)", () => {
    const key = seedOpus(1000);
    const { req, res, captured } = makeMockPair(
      `/a/${key}.opus`,
      "bytes=500-",
    );
    handleOpusRequest(req, res, tmpRoot);
    expect(captured.statusCode).toBe(206);
    expect(captured.headers!["Content-Range"]).toBe("bytes 500-999/1000");
    expect(captured.headers!["Content-Length"]).toBe(500);
  });

  it("returns 416 on malformed Range: bytes=abc", () => {
    const key = seedOpus(1000);
    const { req, res, captured } = makeMockPair(
      `/a/${key}.opus`,
      "bytes=abc",
    );
    handleOpusRequest(req, res, tmpRoot);
    expect(captured.statusCode).toBe(416);
    expect(captured.headers!["Content-Range"]).toBe("bytes */1000");
  });

  it("returns 416 on out-of-bounds Range: bytes=2000-3000", () => {
    const key = seedOpus(1000);
    const { req, res, captured } = makeMockPair(
      `/a/${key}.opus`,
      "bytes=2000-3000",
    );
    handleOpusRequest(req, res, tmpRoot);
    expect(captured.statusCode).toBe(416);
  });
});

// ============================================================
// handleIndexJson (D-08 tier-aware index + informal review absorption)
// ============================================================
describe("handleIndexJson (D-08 tier-aware index)", () => {
  it("returns 200 with a valid tier-less listing when no _INDEX.json exists (directory-listing fallback)", () => {
    // Wave 3 must not depend on the Wave 4 index-writer (03-08). Seed a
    // bare .opus file with no _INDEX.json sidecar.
    const key = "c".repeat(64);
    fs.writeFileSync(path.join(tmpRoot, `${key}.opus`), Buffer.alloc(10));

    const { res, captured } = makeMockRes();
    handleIndexJson(res, tmpRoot);

    expect(captured.statusCode).toBe(200);
    const body = JSON.parse(captured.body) as {
      rituals: Array<{ slug: string; lines: Array<{ cacheKey: string; tier?: string }> }>;
    };
    expect(body.rituals).toHaveLength(1);
    expect(body.rituals[0]!.lines[0]!.cacheKey).toBe(key);
    expect(body.rituals[0]!.lines[0]!.tier).toBeUndefined();
  });

  it("returns 200 with an empty ritual list when the cache dir itself doesn't exist", () => {
    const missingDir = path.join(tmpRoot, "does-not-exist");
    const { res, captured } = makeMockRes();
    handleIndexJson(res, missingDir);
    expect(captured.statusCode).toBe(200);
    expect(JSON.parse(captured.body)).toEqual({ rituals: [] });
  });

  it("passes through the tier field from _INDEX.json entries", () => {
    const entries = [
      {
        cacheKey: "d".repeat(64),
        model: "gemini-3.1-flash-tts-preview",
        ritualSlug: "ea-opening",
        lineId: 2,
        byteLen: 1234,
        durationMs: 900,
        createdAt: "2026-07-01T00:00:00.000Z",
        tier: "premium",
      },
      {
        cacheKey: "e".repeat(64),
        model: "gemini-2.5-flash-preview-tts",
        ritualSlug: "ea-opening",
        lineId: 4,
        byteLen: 456,
        durationMs: 300,
        createdAt: "2026-07-01T00:00:01.000Z",
        tier: "fallback",
      },
    ];
    fs.writeFileSync(
      path.join(tmpRoot, "_INDEX.json"),
      JSON.stringify(entries),
    );

    const { res, captured } = makeMockRes();
    handleIndexJson(res, tmpRoot, tmpRoot);

    expect(captured.statusCode).toBe(200);
    const body = JSON.parse(captured.body) as {
      rituals: Array<{ slug: string; lines: Array<{ lineId: number; tier?: string }> }>;
    };
    const ritual = body.rituals.find((r) => r.slug === "ea-opening")!;
    const line2 = ritual.lines.find((l) => l.lineId === 2)!;
    const line4 = ritual.lines.find((l) => l.lineId === 4)!;
    expect(line2.tier).toBe("premium");
    expect(line4.tier).toBe("fallback");
  });

  it("falls back to directory listing when _INDEX.json is malformed JSON", () => {
    fs.writeFileSync(path.join(tmpRoot, "_INDEX.json"), "{not valid json");
    const key = "f".repeat(64);
    fs.writeFileSync(path.join(tmpRoot, `${key}.opus`), Buffer.alloc(5));

    const { res, captured } = makeMockRes();
    handleIndexJson(res, tmpRoot);

    expect(captured.statusCode).toBe(200);
    const body = JSON.parse(captured.body) as {
      rituals: Array<{ lines: Array<{ cacheKey: string }> }>;
    };
    expect(body.rituals[0]!.lines[0]!.cacheKey).toBe(key);
  });

  it("merges best-effort review status from rituals/{slug}-review.json when present", () => {
    const ritualsDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "preview-bake-rituals-"),
    );
    try {
      const entries = [
        {
          cacheKey: "1".repeat(64),
          model: "gemini-3.1-flash-tts-preview",
          ritualSlug: "ea-closing",
          lineId: 2,
          byteLen: 100,
          durationMs: 500,
          createdAt: "2026-07-01T00:00:00.000Z",
        },
      ];
      fs.writeFileSync(
        path.join(tmpRoot, "_INDEX.json"),
        JSON.stringify(entries),
      );
      fs.writeFileSync(
        path.join(ritualsDir, "ea-closing-review.json"),
        JSON.stringify({
          version: 1,
          updatedAt: "2026-07-01T00:00:00.000Z",
          lines: {
            "2": {
              status: "approved",
              note: "",
              audioHash: "abc",
              approvedAt: "2026-07-01T00:00:00.000Z",
              flaggedAt: null,
            },
          },
        }),
      );

      const { res, captured } = makeMockRes();
      handleIndexJson(res, tmpRoot, ritualsDir);

      expect(captured.statusCode).toBe(200);
      const body = JSON.parse(captured.body) as {
        rituals: Array<{
          slug: string;
          lines: Array<{ lineId: number; review?: { status?: string } }>;
        }>;
      };
      const line = body.rituals[0]!.lines[0]!;
      expect(line.review?.status).toBe("approved");
    } finally {
      fs.rmSync(ritualsDir, { recursive: true, force: true });
    }
  });

  it("omits the review field (does not fail) when the review file is malformed", () => {
    const ritualsDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "preview-bake-rituals-"),
    );
    try {
      const entries = [
        {
          cacheKey: "2".repeat(64),
          model: "gemini-3.1-flash-tts-preview",
          ritualSlug: "ea-initiation",
          lineId: 5,
          byteLen: 100,
          durationMs: 500,
          createdAt: "2026-07-01T00:00:00.000Z",
        },
      ];
      fs.writeFileSync(
        path.join(tmpRoot, "_INDEX.json"),
        JSON.stringify(entries),
      );
      fs.writeFileSync(
        path.join(ritualsDir, "ea-initiation-review.json"),
        "{not valid json",
      );

      const { res, captured } = makeMockRes();
      handleIndexJson(res, tmpRoot, ritualsDir);

      expect(captured.statusCode).toBe(200);
      const body = JSON.parse(captured.body) as {
        rituals: Array<{ lines: Array<{ review?: unknown }> }>;
      };
      expect(body.rituals[0]!.lines[0]!.review).toBeUndefined();
    } finally {
      fs.rmSync(ritualsDir, { recursive: true, force: true });
    }
  });
});
