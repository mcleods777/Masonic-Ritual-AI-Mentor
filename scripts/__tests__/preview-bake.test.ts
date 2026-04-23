// @vitest-environment node
/**
 * Tests for scripts/preview-bake.ts (AUTHOR-08).
 *
 * Scope: pure unit tests — ensureLoopback, cacheKey regex + path-containment
 * defense-in-depth + Range handler via mocked req/res objects. No integration
 * test binding a real port.
 *
 * Threat coverage:
 *   - T-03-01 (ensureLoopback — refuse LAN exposure) → "ensureLoopback" describe
 *   - T-03-03 layer 1 (regex gate) → "cacheKey validation" describe
 *   - T-03-03 layer 2 (path-containment, defense-in-depth) → "path-containment" describe
 *   - RFC 7233 Range semantics → "Range handling" describe
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import http from "node:http";

// IMPORTANT: importing preview-bake runs `assertDevOnly()` at module load.
// In Vitest, NODE_ENV defaults to "test" → no throw.
import {
  ensureLoopback,
  handleOpusRequest,
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

// ============================================================
// ensureLoopback (T-03-01 mitigation)
// ============================================================
describe("ensureLoopback (D-15, T-03-01)", () => {
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
// handleOpusRequest — cacheKey regex (T-03-03 layer 1 — path-traversal mitigation)
// ============================================================
describe("handleOpusRequest cacheKey validation (T-03-03 layer 1)", () => {
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
// handleOpusRequest — path-containment defense-in-depth (T-03-03 layer 2)
// ============================================================
describe("handleOpusRequest path-containment (T-03-03 layer 2 — defense-in-depth)", () => {
  it("rejects cacheKey that resolves outside cacheDir even with valid hex (symlink attack)", () => {
    // Layer 1 (regex) cannot catch this: the filename IS 64 lowercase hex
    // chars. Only layer 2 (path.resolve startsWith rootAbs + sep) catches
    // the fact that the resolved path escapes the cache dir via a symlink.
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
          `[T-03-03 layer-2 test] symlink creation failed (${(err as Error).message}); ` +
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
