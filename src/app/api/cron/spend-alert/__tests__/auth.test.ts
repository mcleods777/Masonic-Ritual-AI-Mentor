// @vitest-environment node
/**
 * Auth-gate tests for GET /api/cron/spend-alert (SAFETY-04, D-05).
 *
 * The cron endpoint is publicly reachable; only a request carrying
 * `Authorization: Bearer ${process.env.CRON_SECRET}` may invoke it.
 * Everything else returns 401. This protects the Resend-send side-effect
 * from being triggered by a stray curl or attacker who guesses the URL.
 *
 * Covers:
 *   - Missing Authorization header → 401.
 *   - Wrong bearer value → 401.
 *   - Correct bearer + no thresholds crossed → 200 + {success:true, sent:false}.
 *     (Thresholds are NOT crossed because spend-tally is empty; we verify
 *     no Resend call was made.)
 */

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../route";
import { __resetSpendTallyForTests } from "@/lib/spend-tally";

const CRON_SECRET = "test-cron-secret-xxxxxxxxxxxxxxxx";

function makeRequest(authHeader?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers["authorization"] = authHeader;
  return new NextRequest(
    new URL("http://localhost:3000/api/cron/spend-alert"),
    { method: "GET", headers },
  );
}

describe("GET /api/cron/spend-alert — auth gate", () => {
  let originalSecret: string | undefined;
  let originalTo: string | undefined;
  let originalFrom: string | undefined;
  let originalResendKey: string | undefined;

  beforeEach(() => {
    originalSecret = process.env.CRON_SECRET;
    originalTo = process.env.SPEND_ALERT_TO;
    originalFrom = process.env.MAGIC_LINK_FROM_EMAIL;
    originalResendKey = process.env.RESEND_API_KEY;
    process.env.CRON_SECRET = CRON_SECRET;
    process.env.SPEND_ALERT_TO = "shannon@test.example";
    process.env.MAGIC_LINK_FROM_EMAIL = "noreply@test.example";
    process.env.RESEND_API_KEY = "re_test_key";
    __resetSpendTallyForTests();
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
    process.env.SPEND_ALERT_TO = originalTo;
    process.env.MAGIC_LINK_FROM_EMAIL = originalFrom;
    process.env.RESEND_API_KEY = originalResendKey;
    __resetSpendTallyForTests();
    vi.restoreAllMocks();
  });

  it("returns 401 when Authorization header is absent", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const req = makeRequest(undefined);
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 401 when Authorization header is an incorrect bearer", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const req = makeRequest("Bearer wrong-secret");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 200 + {success:true, sent:false} when bearer is correct and thresholds not crossed", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const req = makeRequest(`Bearer ${CRON_SECRET}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; sent: boolean };
    expect(body).toEqual({ success: true, sent: false });
  });
});
