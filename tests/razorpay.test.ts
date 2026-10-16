import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "./fake-supabase";

const mocks = vi.hoisted(() => ({ notify: vi.fn(), audit: vi.fn(), fetch: vi.fn() }));
const db = vi.hoisted(() => ({ fake: null as unknown as ReturnType<typeof import("./fake-supabase").createFakeSupabase> }));
vi.mock("@/lib/supabase-admin", () => ({ get supabaseAdmin() { return db.fake.client; } }));
vi.mock("@/lib/notifications/service", () => ({ sendOrderNotification: mocks.notify }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.audit }));

import { verifyCheckoutSignature, verifyWebhookSignature } from "@/lib/razorpay";
import { confirmRazorpayPayment } from "@/lib/payments";
import { POST as webhook } from "@/app/api/webhooks/razorpay/route";
import { POST as pay } from "@/app/api/orders/pay/route";
import { POST as createOrder } from "@/app/api/orders/route";
import { GET as lookup } from "@/app/api/orders/lookup/route";

const KEY_SECRET = "test_key_secret";
const WEBHOOK_SECRET = "test_webhook_secret";
const order = {
  id: "row-1", order_number: "IMO-ABCDE12345", imo_profile_id: "46523623", credits: 100, quantity: 1,
  unit_price: 176, amount: 176, customer_phone: "9876543210", payment_provider: "razorpay",
  payment_status: "pending", recharge_status: "waiting", provider_order_id: "order_TEST1", provider_payment_id: null,
};
const payment = {
  id: "pay_TEST1", order_id: "order_TEST1", amount: 17600, currency: "INR", status: "captured",
  method: "upi", vpa: "customer@okaxis", acquirer_data: { rrn: "412345678901" },
};
const hmac = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest("hex");
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(url, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { "Content-Type": "application/json", ...headers } });

beforeEach(() => {
  vi.resetAllMocks();
  db.fake = createFakeSupabase();
  vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_KEY");
  vi.stubEnv("RAZORPAY_KEY_SECRET", KEY_SECRET);
  vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", WEBHOOK_SECRET);
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("signatures", () => {
  it("accepts only the checkout signature for this order and payment", () => {
    const sig = hmac(KEY_SECRET, "order_TEST1|pay_TEST1");
    expect(verifyCheckoutSignature("order_TEST1", "pay_TEST1", sig)).toBe(true);
    expect(verifyCheckoutSignature("order_OTHER", "pay_TEST1", sig)).toBe(false);
    expect(verifyCheckoutSignature("order_TEST1", "pay_TEST1", "a".repeat(64))).toBe(false);
    expect(verifyCheckoutSignature("order_TEST1", "pay_TEST1", "not-hex")).toBe(false);
  });
  it("verifies webhooks over the raw body and fails closed without a secret", () => {
    const body = '{"event":"payment.captured"}';
    expect(verifyWebhookSignature(body, hmac(WEBHOOK_SECRET, body))).toBe(true);
    expect(verifyWebhookSignature(`${body} `, hmac(WEBHOOK_SECRET, body))).toBe(false);
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "");
    expect(verifyWebhookSignature(body, hmac("", body))).toBe(false);
  });
});

describe("confirmRazorpayPayment", () => {
  it("marks a captured payment paid once and sends the Telegram alert", async () => {
    db.fake.queue("orders", { data: { ...order, payment_status: "paid", provider_payment_id: "pay_TEST1" } });
    const result = await confirmRazorpayPayment(order as never, payment as never, "webhook");
    expect(result.status).toBe("paid");
    const [update] = db.fake.on("orders");
    expect(update.calls[0][1]).toMatchObject({ payment_status: "paid", provider_payment_id: "pay_TEST1" });
    expect(update.has("in", "payment_status", ["pending", "failed"])).toBe(true);
    expect(mocks.notify).toHaveBeenCalledExactlyOnceWith("order_paid", expect.objectContaining({ payment_status: "paid" }), "telegram",
      expect.arrayContaining(["Payment ID: pay_TEST1", "UPI/Bank ref: 412345678901"]));
  });
  it.each([
    [{ order_id: "order_OTHER" }, "different order"],
    [{ amount: 100 }, "amount"],
    [{ currency: "USD" }, "amount"],
  ])("rejects a mismatched payment %j", async (change, reason) => {
    const result = await confirmRazorpayPayment(order as never, { ...payment, ...change } as never, "webhook");
    expect(result).toMatchObject({ status: "mismatch", reason: expect.stringContaining(reason) });
    expect(db.fake.queries).toHaveLength(0);
  });
  it("captures an authorized payment before confirming", async () => {
    mocks.fetch.mockReturnValueOnce(json({ ...payment, status: "captured" }));
    db.fake.queue("orders", { data: { ...order, payment_status: "paid" } });
    expect((await confirmRazorpayPayment(order as never, { ...payment, status: "authorized" } as never, "checkout")).status).toBe("paid");
    expect(mocks.fetch.mock.calls[0][0]).toBe("https://api.razorpay.com/v1/payments/pay_TEST1/capture");
  });
  it("leaves the order open while a payment is not captured", async () => {
    expect((await confirmRazorpayPayment(order as never, { ...payment, status: "failed" } as never, "webhook")).status).toBe("not_captured");
    expect(db.fake.on("orders")).toHaveLength(0);
  });
  it("is idempotent when the webhook and checkout callback race", async () => {
    const paid = { ...order, payment_status: "paid", provider_payment_id: "pay_TEST1" };
    db.fake.queue("orders", { data: null }, { data: paid });
    expect((await confirmRazorpayPayment(order as never, payment as never, "webhook")).status).toBe("paid");
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it("never lets one payment pay two orders", async () => {
    db.fake.queue("orders", { error: { code: "23505" } });
    expect((await confirmRazorpayPayment(order as never, payment as never, "webhook")).status).toBe("mismatch");
  });
});

describe("webhook route", () => {
  const event = (name: string, entity: unknown = payment) => JSON.stringify({ event: name, payload: { payment: { entity } } });
  const request = (body: string, signature = hmac(WEBHOOK_SECRET, body)) =>
    new NextRequest("https://kamalseller.shop/api/webhooks/razorpay", { method: "POST", body, headers: { "x-razorpay-signature": signature } });

  it("rejects forged webhooks before touching the database", async () => {
    expect((await webhook(request(event("payment.captured"), "a".repeat(64)))).status).toBe(401);
    expect(db.fake.queries).toHaveLength(0);
  });
  it("confirms the matching order on payment.captured", async () => {
    db.fake.queue("orders", { data: order }, { data: { ...order, payment_status: "paid" } });
    const res = await webhook(request(event("payment.captured")));
    expect(await res.json()).toEqual({ ok: true, result: "paid" });
    expect(db.fake.on("orders")[0].has("eq", "provider_order_id", "order_TEST1")).toBe(true);
  });
  it("acknowledges unrelated events and payments for other sites", async () => {
    expect((await webhook(request(JSON.stringify({ event: "refund.created", payload: {} })))).status).toBe(200);
    db.fake.queue("orders", { data: null });
    expect(await (await webhook(request(event("order.paid")))).json()).toMatchObject({ ok: true, note: "Order not on this site." });
  });
});

describe("checkout callback", () => {
  const url = "https://kamalseller.shop/api/orders/pay";
  const body = (signature: string) => ({ orderNumber: order.order_number, razorpay_order_id: "order_TEST1", razorpay_payment_id: "pay_TEST1", razorpay_signature: signature });
  it("rejects a bad signature without calling Razorpay", async () => {
    expect((await pay(post(url, body("a".repeat(64))))).status).toBe(400);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("re-fetches the payment from Razorpay before confirming", async () => {
    db.fake.queue("orders", { data: order }, { data: { ...order, payment_status: "paid", provider_payment_id: "pay_TEST1" } });
    mocks.fetch.mockReturnValueOnce(json(payment));
    const res = await pay(post(url, body(hmac(KEY_SECRET, "order_TEST1|pay_TEST1"))));
    expect(res.status).toBe(200);
    expect((await res.json()).order.paymentStatus).toBe("paid");
    expect(mocks.fetch.mock.calls[0][0]).toBe("https://api.razorpay.com/v1/payments/pay_TEST1");
  });
});

describe("order creation", () => {
  beforeEach(() => vi.stubEnv("PAYMENT_MODE", "razorpay"));
  const url = "https://kamalseller.shop/api/orders";
  const input = { imoProfileId: "46523623", packageId: "6f1c1b7e-3c2a-4d8e-9a55-0d6f1d2b7c11", quantity: 1, whatsapp: "9876543210" };
  it("treats the WhatsApp number as optional but rejects an invalid one", async () => {
    expect((await createOrder(post(url, { ...input, whatsapp: "12345" }))).status).toBe(400);
  });
  it("is unavailable until Razorpay keys are set", async () => {
    vi.stubEnv("RAZORPAY_KEY_SECRET", "");
    expect((await createOrder(post(url, input))).status).toBe(503);
  });
  it("creates a Razorpay order for the exact package price", async () => {
    db.fake.queue("packages", { data: { id: input.packageId, credits: 100, price: 176 } });
    db.fake.queue("orders", { data: null }, { data: order }, { data: order });
    mocks.fetch.mockReturnValueOnce(json({ id: "order_TEST1", amount: 17600, currency: "INR", receipt: order.order_number }));
    const res = await createOrder(post(url, input));
    expect(res.status).toBe(200);
    const insert = db.fake.on("orders").find((q) => q.calls[0][0] === "insert")!;
    expect(insert.calls[0][1]).toMatchObject({ amount: 176, customer_phone: "9876543210", payment_provider: "razorpay" });
    const [, init] = mocks.fetch.mock.calls[0];
    expect(JSON.parse(init.body)).toMatchObject({ amount: 17600, currency: "INR" });
    expect((await res.json()).order.checkout).toEqual({ keyId: "rzp_test_KEY", razorpayOrderId: "order_TEST1", amountPaise: 17600 });
  });
  it("caps a single payment at ₹1,00,000", async () => {
    db.fake.queue("packages", { data: { id: input.packageId, credits: 10000, price: 17500 } });
    expect((await createOrder(post(url, { ...input, quantity: 6 }))).status).toBe(400);
  });
});

describe("purchase history lookup", () => {
  const get = (q: string) => lookup(new NextRequest(`https://kamalseller.shop/api/orders/lookup?q=${encodeURIComponent(q)}`));
  it("finds paid orders by IMO ID or WhatsApp number", async () => {
    db.fake.queue("orders", { data: [{ ...order, payment_status: "paid", paid_at: null, completed_at: null, created_at: "2026-10-14T00:00:00Z" }] });
    const res = await get("+91 98765 43210");
    expect((await res.json()).orders).toHaveLength(1);
    const [query] = db.fake.on("orders");
    expect(query.has("or", "imo_profile_id.eq.9876543210,customer_phone.eq.9876543210")).toBe(true);
    expect(query.has("in", "payment_status", ["paid", "refunded"])).toBe(true);
  });
  it("matches an Order ID exactly and ignores anything else", async () => {
    db.fake.queue("orders", { data: [] });
    await get("imo-abcde12345");
    expect(db.fake.on("orders")[0].has("eq", "order_number", "IMO-ABCDE12345")).toBe(true);
    expect(await (await get("%,or(")).json()).toEqual({ orders: [] });
  });
});
