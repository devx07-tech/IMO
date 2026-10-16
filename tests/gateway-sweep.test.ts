import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "./fake-supabase";

const mocks = vi.hoisted(() => ({ notify: vi.fn(), audit: vi.fn(), fetch: vi.fn(), rateLimit: vi.fn() }));
const db = vi.hoisted(() => ({ fake: null as unknown as ReturnType<typeof import("./fake-supabase").createFakeSupabase> }));
vi.mock("@/lib/supabase-admin", () => ({ get supabaseAdmin() { return db.fake.client; } }));
vi.mock("@/lib/notifications/service", () => ({ sendOrderNotification: mocks.notify }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.audit }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }));

import { syncPendingGatewayOrders } from "@/lib/payments";

const order = {
  id: "row-1", order_number: "IMO-ABCDE12345", imo_profile_id: "46523623", credits: 100, quantity: 1,
  unit_price: 176, amount: 176, customer_phone: null, payment_provider: "dghost", payment_status: "pending",
  recharge_status: "waiting", provider_order_id: "https://pay.dghost.in/payment3/instant-pay/x", provider_payment_id: null,
  created_at: new Date().toISOString(),
};
const paid = {
  status: "COMPLETED", message: "Transaction Successfully", result: {
    txnStatus: "COMPLETED", orderId: order.order_number, status: "SUCCESS", amount: 176, utr: "416802195610",
  },
};

beforeEach(() => {
  vi.resetAllMocks();
  db.fake = createFakeSupabase();
  vi.stubEnv("DGHOST_USER_TOKEN", "test_user_token");
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.rateLimit.mockResolvedValue({ ok: true, retryAfter: 0 });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("syncPendingGatewayOrders", () => {
  it("confirms a recent pending order the gateway reports paid, with a Telegram alert", async () => {
    db.fake.queue("orders", { data: [order] }, { data: { ...order, payment_status: "paid", provider_payment_id: "416802195610" } });
    mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify(paid)));
    expect(await syncPendingGatewayOrders()).toBe(1);
    const [list] = db.fake.on("orders");
    expect(list.has("eq", "payment_provider", "dghost")).toBe(true);
    expect(list.has("eq", "payment_status", "pending")).toBe(true);
    expect(mocks.notify).toHaveBeenCalledWith("order_paid", expect.anything(), "telegram", expect.anything());
  });
  it("runs at most once a minute", async () => {
    mocks.rateLimit.mockResolvedValue({ ok: false, retryAfter: 30 });
    expect(await syncPendingGatewayOrders()).toBe(0);
    expect(db.fake.queries).toHaveLength(0);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("keeps going when one status check fails", async () => {
    db.fake.queue("orders", { data: [order, { ...order, id: "row-2", order_number: "IMO-ZZZZZ99999" }] });
    mocks.fetch.mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "COMPLETED", result: { status: "PENDING", txnStatus: "PENDING" } })));
    expect(await syncPendingGatewayOrders()).toBe(0);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });
  it("does nothing when the gateway isn't configured", async () => {
    vi.stubEnv("DGHOST_USER_TOKEN", "");
    expect(await syncPendingGatewayOrders()).toBe(0);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
  });
});
