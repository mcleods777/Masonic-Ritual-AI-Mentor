// @vitest-environment node
/**
 * Wave 0 scaffold for AUTHOR-08 preview server.
 * Implemented by Plan 08 (03-08).
 *
 * Unit surfaces:
 *   - ensureLoopback(host) — throws on non-loopback (D-13/D-15)
 *   - handleOpusRequest — 400 on cacheKey not matching /^[0-9a-f]{64}$/ (T-03-03)
 *   - handleOpusRequest — 206 Partial Content with Content-Range on Range header
 *   - handleOpusRequest — 404 when cache key not present
 *   - assertDevOnly integration — refuses when NODE_ENV=production
 */
import { describe, it } from "vitest";

describe("preview-bake ensureLoopback (D-13/D-15)", () => {
  it.todo("refuses 0.0.0.0 with /loopback/ message (Plan 08)");
  it.todo("refuses 192.168.1.5 with /loopback/ message");
  it.todo("allows 127.0.0.1");
  it.todo("allows ::1");
});

describe("preview-bake handleOpusRequest (T-03-03 path-traversal mitigation)", () => {
  it.todo("rejects cacheKey with .. (path traversal)");
  it.todo("rejects cacheKey with / (absolute path)");
  it.todo("rejects cacheKey shorter than 64 hex");
  it.todo("accepts valid 64-hex-char cacheKey");
});

describe("preview-bake Range handling", () => {
  it.todo("serves 206 with Content-Range when Range: bytes=0-499 present");
  it.todo("serves 200 full body when Range absent");
  it.todo("serves 416 when range start > end");
});

describe("preview-bake dev-guard integration (T-03-02)", () => {
  it.todo("assertDevOnly refuses when NODE_ENV=production");
});
