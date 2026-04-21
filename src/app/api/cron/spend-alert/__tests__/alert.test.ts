// @vitest-environment node
/**
 * Alert-path tests for GET /api/cron/spend-alert (SAFETY-04, D-04/D-06).
 *
 * Covers the send-email path:
 *   - Aggregate > $10 triggers a Resend send with idempotencyKey =
 *     `spend-alert-${yesterday}`.
 *   - A single user > $3 also triggers a send (even if aggregate ≤ $10).
 *   - Email subject, to-address, and body content match D-06 shape:
 *     * `subject` contains "spend alert"
 *     * `text` contains the warm-container caveat (grep "warm-container")
 *     * `text` references `scripts/lookup-hashed-user.ts`
 *     * `to` is `process.env.SPEND_ALERT_TO`
 *   - When thresholds are NOT crossed, resend is NOT called + response
 *     is `{success:true, sent:false}`.
 *
 * Resend is mocked at the module level so we can inspect what
 * `emails.send` is called with.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const CRON_SECRET = "test-cron-secret-xxxxxxxxxxxxxxxx";

// Mock resend BEFORE importing the route so the route picks up the mock.
const sendMock = vi.fn();
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: sendMock,
    },
  })),
}));

// Dynamic mock for spend-tally so each test controls the reading.
let spendReading: { aggregate: number; perUser: Array<{ hashedUser: string; total: number }> } = {
  aggregate: 0,
  perUser: [],
};
vi.mock("@/lib/spend-tally", () => ({
  readAndClearSpendForDay: vi.fn(() => spendReading),
}));

// Re-import route after mocks are set.
import { GET } from "../route";

function makeRequest(): NextRequest {
  return new NextRequest(
    new URL("http://localhost:3000/api/cron/spend-alert"),
    {
      method: "GET",
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    },
  );
}

function yesterdayUtc(): string {
  return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
}

describe("GET /api/cron/spend-alert — alert body + Resend send", () => {
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
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: "email-id" }, error: null });
    spendReading = { aggregate: 0, perUser: [] };
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
    process.env.SPEND_ALERT_TO = originalTo;
    process.env.MAGIC_LINK_FROM_EMAIL = originalFrom;
    process.env.RESEND_API_KEY = originalResendKey;
    vi.restoreAllMocks();
  });

  it("fires Resend email with idempotencyKey=spend-alert-${yesterday} when aggregate > $10", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    spendReading = {
      aggregate: 15.42,
      perUser: [
        { hashedUser: "aaaaaaaaaaaaaaaa", total: 12.0 },
        { hashedUser: "bbbbbbbbbbbbbbbb", total: 3.42 },
      ],
    };

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; sent: boolean };
    expect(body).toEqual({ success: true, sent: true });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const args = sendMock.mock.calls[0][0] as {
      from: string;
      to: string;
      subject: string;
      html: string;
      text: string;
      idempotencyKey: string;
    };
    expect(args.idempotencyKey).toBe(`spend-alert-${yesterdayUtc()}`);
  });

  it("email body includes subject 'spend alert' + warm-container caveat + lookup CLI pointer + to=SPEND_ALERT_TO", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    spendReading = {
      aggregate: 11.5,
      perUser: [{ hashedUser: "ccccccccccccccc1", total: 11.5 }],
    };

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const args = sendMock.mock.calls[0][0] as {
      from: string;
      to: string;
      subject: string;
      html: string;
      text: string;
      idempotencyKey: string;
    };
    expect(args.subject.toLowerCase()).toContain("spend alert");
    expect(args.text).toContain("warm-container");
    expect(args.text).toContain("scripts/lookup-hashed-user.ts");
    expect(args.to).toBe("shannon@test.example");
    expect(args.from).toBe("noreply@test.example");
  });

  it("fires alert when a single hashedUser > $3 even if aggregate ≤ $10", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    spendReading = {
      aggregate: 4.0,
      perUser: [{ hashedUser: "dddddddddddddddd", total: 4.0 }],
    };

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("returns sent:false and does NOT call Resend when thresholds are not crossed", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    spendReading = {
      aggregate: 2.5,
      perUser: [
        { hashedUser: "eeeeeeeeeeeeeeee", total: 2.0 },
        { hashedUser: "ffffffffffffffff", total: 0.5 },
      ],
    };

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; sent: boolean };
    expect(body).toEqual({ success: true, sent: false });
    expect(sendMock).not.toHaveBeenCalled();
  });
});
