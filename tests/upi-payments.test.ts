import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "./fake-supabase";

const mocks = vi.hoisted(() => ({ notify: vi.fn(), alert: vi.fn(), audit: vi.fn(), auth: vi.fn() }));
const db = vi.hoisted(() => ({ fake: null as unknown as ReturnType<typeof import("./fake-supabase").createFakeSupabase> }));
vi.mock("@/lib/supabase-admin", () => ({ get supabaseAdmin() { return db.fake.client; } }));
vi.mock("@/lib/notifications/service", () => ({ sendOrderNotification: mocks.notify, sendAdminAlert: mocks.alert }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.audit }));
vi.mock("@/lib/auth/current-admin", () => ({ requireAdmin: mocks.auth }));

import { POST as bridge } from "@/app/api/payments/upi-notify/route";
import { POST as submitUtr } from "@/app/api/orders/utr/route";
import { POST as createOrder } from "@/app/api/orders/route";
import { GET as verify } from "@/app/api/orders/verify/route";
import { POST as cancelOrder } from "@/app/api/orders/cancel/route";
import { POST as decide } from "@/app/api/admin/orders/[id]/payment/route";
import { POST as resolveEvent } from "@/app/api/admin/payments/events/[id]/route";

const SECRET = "s".repeat(40);
const order = {
  id: "row-1", order_number: "IMO-ABCDE12345", imo_profile_id: "1234567", credits: 10, quantity: 1,
  unit_price: 30, amount: 29.37, payment_provider: "upi", payment_status: "pending", recharge_status: "waiting",
  provider_payment_id: null, customer_utr: null, customer_utr_at: null,
  expires_at: new Date(Date.now() + 600_000).toISOString(), created_at: new Date().toISOString(),
};

function bridgeRequest(body: string, token = SECRET) {
  return new NextRequest("https://kamalseller.com/api/payments/upi-notify", {
    method: "POST", body, headers: { authorization: `Bearer ${token}` },
  });
}
function jsonRequest(url: string, body: unknown) {
  return new NextRequest(url, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  vi.resetAllMocks();
  db.fake = createFakeSupabase();
  vi.stubEnv("UPI_BRIDGE_SECRET", SECRET);
  mocks.auth.mockResolvedValue({ admin: { adminId: "admin-1" } });
});
afterEach(() => vi.unstubAllEnvs());

describe("payment bridge endpoint", () => {
  it("rejects requests without the bridge secret before touching the database", async () => {
    expect((await bridge(bridgeRequest("Received ₹29.37", "wrong"))).status).toBe(401);
    expect(db.fake.queries).toHaveLength(0);
  });
  it("stays closed when the server secret is missing or too short", async () => {
    vi.stubEnv("UPI_BRIDGE_SECRET", "short");
    expect((await bridge(bridgeRequest("Received ₹29.37", "short"))).status).toBe(401);
  });
  it("records non-payment messages as a heartbeat only", async () => {
    const res = await bridge(bridgeRequest(JSON.stringify({ text: "ping" })));
    expect(await res.json()).toEqual({ ok: true, result: "ignored" });
    expect(db.fake.on("orders")).toHaveLength(0);
  });
  it("confirms the open order reserved for the exact amount", async () => {
    db.fake.queue("upi_payment_events", { data: { id: "evt-1" } });
    db.fake.queue("orders", { data: order }, { data: { ...order, payment_status: "paid", provider_payment_id: "412345678901" } });
    const res = await bridge(bridgeRequest(JSON.stringify({ title: "Payment Received", text: "₹29.37 received from Ramesh. UPI Ref No 412345678901", app: "paytm" })));
    expect(await res.json()).toEqual({ ok: true, result: "matched" });
    const [lookup, update] = db.fake.on("orders");
    expect(lookup.has("eq", "amount", 29.37)).toBe(true);
    expect(lookup.has("eq", "payment_status", "pending")).toBe(true);
    expect(update.has("in", "payment_status", ["pending"])).toBe(true);
    expect(update.calls[0][1]).toMatchObject({ payment_status: "paid", provider_payment_id: "412345678901" });
    expect(mocks.notify).toHaveBeenCalledExactlyOnceWith("order_paid", expect.objectContaining({ payment_status: "paid" }), "telegram", ["UTR: 412345678901", "Confirmed: Automatic (payment notification)"]);
  });
  it("drops a second copy of the same UTR", async () => {
    db.fake.queue("upi_payment_events", { error: { code: "23505" } });
    const res = await bridge(bridgeRequest("₹29.37 received. UTR 412345678901"));
    expect(await res.json()).toEqual({ ok: true, result: "duplicate" });
    expect(db.fake.on("orders")).toHaveLength(0);
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it("alerts the admin when money arrives with no open order", async () => {
    db.fake.queue("upi_payment_events", { data: { id: "evt-2" } }, { data: [] });
    db.fake.queue("orders", { data: null }, { data: null }, { data: [{ order_number: "IMO-EXPIRED001" }] });
    const res = await bridge(bridgeRequest("Received ₹29.37 from Ramesh. UPI Ref 412345678901"));
    expect(await res.json()).toEqual({ ok: true, result: "unmatched" });
    expect(mocks.alert).toHaveBeenCalledWith("payment_unmatched", expect.arrayContaining([
      "Amount: ₹29.37", "UTR: 412345678901", "Expired orders with this amount: IMO-EXPIRED001",
    ]));
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it("returns 500 so the phone retries when the database fails", async () => {
    db.fake.queue("upi_payment_events", { error: { code: "XX000", message: "down" } });
    expect((await bridge(bridgeRequest("Received ₹29.37"))).status).toBe(500);
  });
});

describe("customer UTR submission", () => {
  const url = "https://kamalseller.com/api/orders/utr";
  it("rejects malformed UTRs", async () => {
    expect((await submitUtr(jsonRequest(url, { orderNumber: order.order_number, utr: "123" }))).status).toBe(400);
    expect(db.fake.queries).toHaveLength(0);
  });
  it("auto-confirms when the payment phone already saw this UTR and amount", async () => {
    db.fake.queue("orders", { data: order }, { data: null }, { data: { ...order, payment_status: "paid" } });
    db.fake.queue("upi_payment_events", { data: { id: "evt-1", status: "unmatched", amount: 29.37, order_id: null } });
    const res = await submitUtr(jsonRequest(url, { orderNumber: order.order_number, utr: "412345678901" }));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("paid");
  });
  it("queues an unverified UTR for admin review instead of trusting it", async () => {
    db.fake.queue("orders", { data: order }, { data: null }, { data: { ...order, customer_utr: "412345678901" } });
    db.fake.queue("upi_payment_events", { data: null }, { data: [] });
    const res = await submitUtr(jsonRequest(url, { orderNumber: order.order_number, utr: "412345678901" }));
    const body = await res.json();
    expect(body.status).toBe("review");
    expect(body.order.paymentStatus).toBe("pending");
    expect(db.fake.on("orders").some((q) => q.calls.some(([m, v]) => m === "update" && (v as { payment_status?: string }).payment_status === "paid"))).toBe(false);
    expect(mocks.notify).toHaveBeenCalledWith("payment_review", expect.anything(), "telegram", expect.any(Array));
  });
  it("refuses a UTR that already paid another order", async () => {
    db.fake.queue("orders", { data: order }, { data: { id: "other" } });
    const res = await submitUtr(jsonRequest(url, { orderNumber: order.order_number, utr: "412345678901" }));
    expect(res.status).toBe(409);
  });
});

describe("order creation", () => {
  const url = "https://kamalseller.com/api/orders";
  const body = { imoProfileId: "1234567", packageId: "6f1c1b7e-3c2a-4d8e-9a55-0d6f1d2b7c11", quantity: 1, whatsapp: "9876543210" };
  it("reserves a unique amount 1-99 paise below the package total", async () => {
    db.fake.queue("packages", { data: { id: body.packageId, credits: 10, price: 30 } });
    const taken = Array.from({ length: 98 }, (_, i) => ({ amount: (2901 + i) / 100 }));
    // expire, order-number check, open amounts, insert
    db.fake.queue("orders", { data: null }, { data: null }, { data: taken }, { data: { ...order, amount: 29.99 } });
    const res = await createOrder(jsonRequest(url, body));
    expect(res.status).toBe(200);
    const insert = db.fake.on("orders").find((q) => q.calls[0][0] === "insert")!;
    expect(insert.calls[0][1]).toMatchObject({ amount: 29.99, payment_provider: "upi", payment_status: "pending", customer_phone: "9876543210" });
    expect((await res.json()).order.payment).toMatchObject({ amountPaise: 2999 });
  });
  it("accepts an order without a WhatsApp number", async () => {
    db.fake.queue("packages", { data: { id: body.packageId, credits: 10, price: 30 } });
    db.fake.queue("orders", { data: null }, { data: null }, { data: [] }, { data: { ...order, amount: 29.5 } });
    expect((await createOrder(jsonRequest(url, { ...body, whatsapp: undefined }))).status).toBe(200);
    const insert = db.fake.on("orders").find((q) => q.calls[0][0] === "insert")!;
    expect(insert.calls[0][1]).toMatchObject({ customer_phone: null });
  });
  it("asks the customer to retry when every amount slot is busy", async () => {
    db.fake.queue("packages", { data: { id: body.packageId, credits: 10, price: 30 } });
    const taken = Array.from({ length: 99 }, (_, i) => ({ amount: (2901 + i) / 100 }));
    db.fake.queue("orders", { data: null }, { data: null }, { data: taken });
    expect((await createOrder(jsonRequest(url, body))).status).toBe(503);
  });
  it("caps a single UPI payment at ₹1,00,000", async () => {
    db.fake.queue("packages", { data: { id: body.packageId, credits: 10000, price: 17500 } });
    expect((await createOrder(jsonRequest(url, { ...body, quantity: 6 }))).status).toBe(400);
  });
});

describe("order status", () => {
  it("expires an unpaid order after its payment window", async () => {
    const stale = { ...order, expires_at: new Date(Date.now() - 1000).toISOString() };
    db.fake.queue("orders", { data: stale }, { data: { ...stale, payment_status: "failed" } });
    const res = await verify(new NextRequest(`https://kamalseller.com/api/orders/verify?orderNumber=${order.order_number}`));
    const body = await res.json();
    expect(body.order.paymentStatus).toBe("failed");
    expect(body.order.payment).toBeNull();
  });
});

describe("customer cancel", () => {
  const url = "https://kamalseller.com/api/orders/cancel";
  it("cancels only an unpaid order with no reported payment", async () => {
    db.fake.queue("orders", { data: { id: "row-1" } });
    const res = await cancelOrder(jsonRequest(url, { orderNumber: order.order_number }));
    expect(res.status).toBe(200);
    const [update] = db.fake.on("orders");
    expect(update.calls[0][1]).toMatchObject({ payment_status: "failed" });
    expect(update.has("eq", "payment_status", "pending")).toBe(true);
    expect(update.has("is", "customer_utr", null)).toBe(true);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "order_cancelled" }));
  });
  it.each([
    [{ payment_status: "paid", customer_utr: null }, "already paid"],
    [{ payment_status: "pending", customer_utr: "412345678901" }, "checking the payment"],
  ])("refuses to cancel %j", async (state, message) => {
    db.fake.queue("orders", { data: null }, { data: state });
    const res = await cancelOrder(jsonRequest(url, { orderNumber: order.order_number }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain(message);
  });
});

describe("admin payment decisions", () => {
  const context = { params: Promise.resolve({ id: "row-1" }) };
  it("requires an admin", async () => {
    mocks.auth.mockResolvedValue({ response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) });
    expect((await decide(jsonRequest("https://kamalseller.com/x", { action: "approve" }), context)).status).toBe(401);
  });
  it("approves with the customer's UTR", async () => {
    const claimed = { ...order, customer_utr: "412345678901" };
    db.fake.queue("orders", { data: claimed }, { data: { ...claimed, payment_status: "paid", provider_payment_id: "412345678901" } });
    db.fake.queue("upi_payment_events", { data: null });
    const res = await decide(jsonRequest("https://kamalseller.com/x", { action: "approve" }), context);
    expect(res.status).toBe(200);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "payment_confirmed", adminId: "admin-1" }));
  });
  it("refuses to approve when the UTR already paid another order", async () => {
    db.fake.queue("orders", { data: { ...order, customer_utr: "412345678901" } }, { error: { code: "23505" } });
    db.fake.queue("upi_payment_events", { data: null });
    expect((await decide(jsonRequest("https://kamalseller.com/x", { action: "approve" }), context)).status).toBe(409);
  });
  it("never attaches a received payment smaller than the order", async () => {
    db.fake.queue("upi_payment_events", { data: { id: "evt-1", status: "unmatched", amount: 10, utr: null } });
    db.fake.queue("orders", { data: order });
    const res = await resolveEvent(jsonRequest("https://kamalseller.com/x", { action: "attach", orderNumber: order.order_number }), { params: Promise.resolve({ id: "evt-1" }) });
    expect(res.status).toBe(409);
  });
});
