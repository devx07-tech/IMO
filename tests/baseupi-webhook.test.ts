import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), update: vi.fn() };
  return { query, from: vi.fn(), notify: vi.fn(), audit: vi.fn() };
});
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock("@/lib/notifications/service", () => ({ sendOrderNotification: mocks.notify }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.audit }));
import { POST } from "@/app/api/webhooks/baseupi/route";

const order = { id: "row-1", order_number: "IMO-12345", amount: 30, payment_provider: "baseupi", provider_order_id: "ord_test", payment_status: "pending" };

function request(overrides = {}, validSignature = true) {
  const raw = JSON.stringify({ event: "payment.completed", status: "COMPLETED", merchant_order_id: order.order_number, order_id: "ord_test", amount_paise: 3000, ...overrides });
  const signature = validSignature ? createHmac("sha256", "test-secret").update(raw).digest("hex") : "a".repeat(64);
  return new NextRequest("https://kamalseller.com/api/webhooks/baseupi", { method: "POST", body: raw, headers: { "x-baseupi-signature": signature } });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("BASEUPI_WEBHOOK_SECRET", "test-secret");
  mocks.from.mockReturnValue(mocks.query);
  mocks.query.select.mockReturnValue(mocks.query);
  mocks.query.eq.mockReturnValue(mocks.query);
  mocks.query.update.mockReturnValue(mocks.query);
});
afterEach(() => vi.unstubAllEnvs());

describe("BaseUPI payment processing", () => {
  it("rejects forged requests before accessing the database", async () => {
    expect((await POST(request({}, false))).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it.each([{ amount_paise: 1 }, { order_id: "ord_other" }])("rejects mismatched payments %j", async (payload) => {
    mocks.query.maybeSingle.mockResolvedValueOnce({ data: order, error: null });
    expect((await POST(request(payload))).status).toBe(409);
    expect(mocks.query.update).not.toHaveBeenCalled();
  });
  it("marks the matching order paid and sends one notification", async () => {
    const paid = { ...order, payment_status: "paid" };
    mocks.query.maybeSingle.mockResolvedValueOnce({ data: order, error: null }).mockResolvedValueOnce({ data: paid, error: null });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.query.eq).toHaveBeenCalledWith("payment_provider", "baseupi");
    expect(mocks.query.eq).toHaveBeenCalledWith("payment_status", "pending");
    expect(mocks.notify).toHaveBeenCalledExactlyOnceWith("order_paid", paid, "telegram");
    expect(mocks.audit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      action: "payment_confirmed", entityType: "order", entityId: paid.id,
      metadata: expect.objectContaining({ provider: "baseupi", source: "signed_webhook", amountPaise: 3000 }),
    }));
  });
  it("acknowledges replayed payments without duplicate notification", async () => {
    mocks.query.maybeSingle.mockResolvedValueOnce({ data: { ...order, payment_status: "paid" }, error: null });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.query.update).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("does not send a second notification when another request won the update", async () => {
    mocks.query.maybeSingle.mockResolvedValueOnce({ data: order, error: null }).mockResolvedValueOnce({ data: null, error: null });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it("returns a retryable error on database failure", async () => {
    mocks.query.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "unavailable" } });
    expect((await POST(request())).status).toBe(500);
  });
  it("rejects malformed success events", async () => {
    expect((await POST(request({ amount_paise: "3000" }))).status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
