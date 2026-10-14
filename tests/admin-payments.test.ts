import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn(), or: vi.fn(), limit: vi.fn(), gte: vi.fn(), lte: vi.fn(), update: vi.fn(), not: vi.fn(), in: vi.fn(), is: vi.fn(), maybeSingle: vi.fn(), then: vi.fn() },
  from: vi.fn(), execute: vi.fn(), auth: vi.fn(), audit: vi.fn(), notify: vi.fn(),
}));
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock("@/lib/auth/current-admin", () => ({ requireAdmin: mocks.auth }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.audit }));
vi.mock("@/lib/notifications/service", () => ({ sendOrderNotification: mocks.notify, sendAdminAlert: vi.fn() }));
import { GET as listOrders } from "@/app/api/admin/orders/route";
import { GET as payments } from "@/app/api/admin/payments/route";
import { GET as dashboard } from "@/app/api/admin/dashboard/route";
import { POST as recharge } from "@/app/api/admin/orders/[id]/recharge/route";
import { readPaidRevenue } from "@/lib/payment-summary";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ admin: { adminId: "admin-1" } });
  mocks.from.mockReturnValue(mocks.query);
  for (const method of ["select", "eq", "order", "range", "or", "limit", "gte", "lte", "update", "not", "in", "is"] as const) {
    mocks.query[method].mockReturnValue(mocks.query);
  }
  mocks.execute.mockResolvedValue({ data: [], count: 0, error: null });
  mocks.query.then.mockImplementation((resolve, reject) => mocks.execute().then(resolve, reject));
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("admin payment access and configuration", () => {
  it.each([payments, dashboard])("requires admin authentication", async (handler) => {
    mocks.auth.mockResolvedValue({ response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) });
    expect((await handler()).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("reports readiness without returning secret values", async () => {
    vi.stubEnv("UPI_BRIDGE_SECRET", "private-bridge-secret-do-not-return-0123456789");
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_live_PUBLICKEY");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "private-key-secret-do-not-return");
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "private-webhook-secret-do-not-return");
    vi.stubEnv("DGHOST_USER_TOKEN", "private-gateway-token-do-not-return");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://kamalseller.com");
    const response = await payments();
    const body = await response.json();
    expect(body.mode).toBe("dghost");
    expect(body.gateway).toEqual({ tokenConfigured: true, webhookUrl: "https://kamalseller.com/api/webhooks/dghost" });
    expect(body.upi).toMatchObject({ merchantId: "paytm.s2sovgg@pty", personalId: "kamal6382371168@okicici", bridgeSecretConfigured: true, bridgeUrl: "https://kamalseller.com/api/payments/upi-notify" });
    expect(body.razorpay).toMatchObject({ keysConfigured: true, keyMode: "live", webhookSecretConfigured: true });
    expect(JSON.stringify(body)).not.toContain("private-");
  });
  it("reports missing credentials and database failures accurately", async () => {
    vi.stubEnv("UPI_BRIDGE_SECRET", ""); vi.stubEnv("RAZORPAY_KEY_ID", ""); vi.stubEnv("RAZORPAY_KEY_SECRET", "");
    vi.stubEnv("PAYMENT_MODE", "razorpay");
    const body = await (await payments()).json();
    expect(body.mode).toBe("razorpay");
    expect(body.upi.bridgeSecretConfigured).toBe(false);
    expect(body.razorpay).toMatchObject({ keysConfigured: false, keyMode: "unconfigured" });
    mocks.execute.mockResolvedValueOnce({ data: null, error: { message: "unavailable" } });
    expect((await payments()).status).toBe(500);
  });
});

describe("admin order and revenue correlation", () => {
  it("totals revenue across pages in paise", async () => {
    mocks.execute.mockResolvedValueOnce({ data: Array.from({ length: 500 }, () => ({ amount: 30.10 })), error: null })
      .mockResolvedValueOnce({ data: [{ amount: 90.25 }], error: null });
    expect(await readPaidRevenue("start", "end")).toEqual({ revenue: 15140.25, error: null });
    expect(mocks.query.range).toHaveBeenCalledWith(0, 499);
    expect(mocks.query.range).toHaveBeenCalledWith(500, 999);
  });
  it.each(["waiting_recharge", "processing", "completed", "failed_recharge"])("restricts %s to confirmed paid orders", async (filter) => {
    const res = await listOrders(new NextRequest(`https://kamalseller.com/api/admin/orders?filter=${filter}&offset=50&limit=50`));
    expect(res.status).toBe(200);
    expect(mocks.query.eq).toHaveBeenCalledWith("payment_status", "paid");
    expect(mocks.query.range).toHaveBeenCalledWith(50, 99);
  });
  it("keeps pending payment searches outside the recharge queue", async () => {
    await listOrders(new NextRequest("https://kamalseller.com/api/admin/orders?filter=pending_payment"));
    expect(mocks.query.eq).toHaveBeenCalledWith("payment_status", "pending");
    expect(mocks.query.eq).not.toHaveBeenCalledWith("payment_status", "paid");
  });
  it("finds orders by the customer's WhatsApp number", async () => {
    await listOrders(new NextRequest("https://kamalseller.com/api/admin/orders?search=9876543210"));
    expect(mocks.query.or).toHaveBeenCalledWith(expect.stringContaining("customer_phone.eq.9876543210"));
  });
  it("counts payments on the confirmation day in India time", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-14T20:00:00Z"));
    expect((await dashboard()).status).toBe(200);
    expect(mocks.query.gte.mock.calls.filter(([column]) => column === "paid_at")).toHaveLength(2);
    expect(mocks.query.gte).toHaveBeenCalledWith("paid_at", "2026-10-15T00:00:00+05:30");
  });
});

describe("recharge payment guard", () => {
  const context = { params: Promise.resolve({ id: "row-1" }) };
  const request = () => new NextRequest("https://kamalseller.com/api/admin/orders/row-1/recharge", {
    method: "POST", body: JSON.stringify({ action: "start" }), headers: { "Content-Type": "application/json" },
  });
  it("blocks recharge of an unconfirmed order", async () => {
    mocks.query.maybeSingle.mockResolvedValueOnce({ data: { id: "row-1", payment_provider: "razorpay", payment_status: "pending", recharge_status: "waiting" }, error: null });
    expect((await recharge(request(), context)).status).toBe(400);
    expect(mocks.query.update).not.toHaveBeenCalled();
  });
  it("rechecks payment state on the conditional recharge update", async () => {
    const order = { id: "row-1", payment_provider: "razorpay", payment_status: "paid", recharge_status: "waiting" };
    mocks.query.maybeSingle.mockResolvedValueOnce({ data: order, error: null }).mockResolvedValueOnce({ data: { ...order, recharge_status: "processing" }, error: null });
    expect((await recharge(request(), context)).status).toBe(200);
    expect(mocks.query.eq).toHaveBeenCalledWith("payment_status", "paid");
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "recharge_started", entityId: "row-1" }));
  });
});
