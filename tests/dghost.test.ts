import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "./fake-supabase";

const mocks = vi.hoisted(() => ({ notify: vi.fn(), audit: vi.fn(), fetch: vi.fn() }));
const db = vi.hoisted(() => ({ fake: null as unknown as ReturnType<typeof import("./fake-supabase").createFakeSupabase> }));
vi.mock("@/lib/supabase-admin", () => ({ get supabaseAdmin() { return db.fake.client; } }));
vi.mock("@/lib/notifications/service", () => ({ sendOrderNotification: mocks.notify }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.audit }));

import { parseGatewayStatus } from "@/lib/dghost";
import { confirmGatewayPayment } from "@/lib/payments";
import { POST as webhook } from "@/app/api/webhooks/dghost/route";
import { POST as createOrder } from "@/app/api/orders/route";
import { GET as verify } from "@/app/api/orders/verify/route";

const PAYMENT_URL = "https://pay.dghost.in/payment3/instant-pay/0e82d994c34c";
const order = {
  id: "row-1", order_number: "IMO-ABCDE12345", imo_profile_id: "46523623", credits: 100, quantity: 1,
  unit_price: 176, amount: 176, customer_phone: null, payment_provider: "dghost", payment_status: "pending",
  recharge_status: "waiting", provider_order_id: PAYMENT_URL, provider_payment_id: null,
  created_at: new Date().toISOString(),
};
// What the live check-order-status API returns.
const liveStatus = (txnStatus: string, extra: Record<string, unknown> = {}) => ({
  status: "COMPLETED", message: "Transaction", result: {
    txnStatus, resultInfo: txnStatus, orderId: order.order_number, status: txnStatus, amount: 176,
    date: "2026-10-14 22:52:23", ...extra,
  },
});
// A paid order, verbatim from the live API: txnStatus says COMPLETED, status says SUCCESS.
const liveSuccess = (extra: Record<string, unknown> = {}) => ({
  status: "COMPLETED", message: "Transaction Successfully", result: {
    txnStatus: "COMPLETED", resultInfo: "Transaction Success", orderId: order.order_number, status: "SUCCESS",
    amount: 176, date: "2026-10-15 00:21:00", utr: "416802195610", ...extra,
  },
});
const success = parseGatewayStatus(liveSuccess({ paymentApp: "Paytm" }));
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
const sentForm = (call: number) => new URLSearchParams(String(mocks.fetch.mock.calls[call][1].body));

beforeEach(() => {
  vi.resetAllMocks();
  db.fake = createFakeSupabase();
  vi.stubEnv("DGHOST_USER_TOKEN", "test_user_token");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://kamalseller.com");
  vi.stubEnv("PAYMENT_MODE", "");
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("parseGatewayStatus", () => {
  it("reads the live API's wrapped result", () => {
    expect(parseGatewayStatus(liveStatus("PENDING"))).toEqual({
      state: "pending", orderId: "IMO-ABCDE12345", amountPaise: 17600, utr: null, paymentApp: null,
    });
    expect(success).toMatchObject({ state: "success", utr: "416802195610", paymentApp: "Paytm" });
    expect(parseGatewayStatus(liveStatus("FAILURE")).state).toBe("failed");
  });
  it("reads the flat shape from the docs", () => {
    expect(parseGatewayStatus({ status: "SUCCESS", order_id: "IMO-ABCDE12345", amount: "1.00", paymentApp: "Paytm", UTR: "416802195610" }))
      .toEqual({ state: "success", orderId: "IMO-ABCDE12345", amountPaise: 100, utr: "416802195610", paymentApp: "Paytm" });
  });
  it("never reads 'COMPLETED' or a missing order as paid", () => {
    expect(parseGatewayStatus(liveStatus("COMPLETED")).state).toBe("pending");
    expect(parseGatewayStatus({ status: "COMPLETED", message: "Order not found", result: null }).state).toBe("not_found");
    expect(parseGatewayStatus(null).state).toBe("pending");
  });
});

describe("confirmGatewayPayment", () => {
  it("marks a successful payment paid once, keyed by its UTR", async () => {
    db.fake.queue("orders", { data: { ...order, payment_status: "paid", provider_payment_id: "416802195610" } });
    expect((await confirmGatewayPayment(order as never, success, "webhook")).status).toBe("paid");
    const [update] = db.fake.on("orders");
    expect(update.calls[0][1]).toMatchObject({ payment_status: "paid", provider_payment_id: "416802195610" });
    expect(update.has("in", "payment_status", ["pending", "failed"])).toBe(true);
    expect(mocks.notify).toHaveBeenCalledExactlyOnceWith("order_paid", expect.anything(), "telegram",
      expect.arrayContaining(["UTR: 416802195610", "App: Paytm"]));
  });
  it.each([
    [{ amountPaise: 17500 }, "amount"],
    [{ orderId: "IMO-OTHER00000" }, "different order"],
  ])("rejects a mismatched payment %j", async (change, reason) => {
    const result = await confirmGatewayPayment(order as never, { ...success, ...change }, "webhook");
    expect(result).toMatchObject({ status: "mismatch", reason: expect.stringContaining(reason) });
    expect(db.fake.queries).toHaveLength(0);
  });
  it("leaves a pending payment open", async () => {
    expect((await confirmGatewayPayment(order as never, { ...success, state: "pending" }, "redirect")).status).toBe("not_captured");
    expect(db.fake.queries).toHaveLength(0);
  });
  it("never lets one UTR pay two orders", async () => {
    db.fake.queue("orders", { error: { code: "23505" } });
    expect((await confirmGatewayPayment(order as never, success, "webhook")).status).toBe("mismatch");
  });
});

describe("order creation", () => {
  const url = "https://kamalseller.com/api/orders";
  const input = { imoProfileId: "46523623", packageId: "6f1c1b7e-3c2a-4d8e-9a55-0d6f1d2b7c11", quantity: 1 };
  const post = (body: unknown) => new NextRequest(url, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
  const echoOrder = (paymentUrl = PAYMENT_URL) => mocks.fetch.mockImplementationOnce((_url: string, init: { body: URLSearchParams }) =>
    json({ status: true, message: "Order Created Successfully", result: { orderId: init.body.get("order_id"), payment_url: paymentUrl } }, 201));

  it("is the default checkout and is off until the token is set", async () => {
    vi.stubEnv("DGHOST_USER_TOKEN", "");
    expect((await createOrder(post(input))).status).toBe(503);
  });
  it("creates a gateway order for the exact price and returns its payment page", async () => {
    db.fake.queue("packages", { data: { id: input.packageId, credits: 100, price: 176 } });
    db.fake.queue("orders", { data: null }, { data: { ...order, provider_order_id: null } }, { data: order });
    echoOrder();
    const res = await createOrder(post(input));
    expect(res.status).toBe(200);
    expect((await res.json()).order.gateway).toEqual({ paymentUrl: PAYMENT_URL });
    expect(mocks.fetch.mock.calls[0][0]).toBe("https://pay.dghost.in/api/create-order");
    const form = sentForm(0);
    expect(Object.fromEntries(form)).toMatchObject({
      user_token: "test_user_token", amount: "176.00", customer_mobile: "6382371168", expiry_seconds: "1800",
      redirect_url: `https://kamalseller.com/?order=${form.get("order_id")}`,
    });
    const insert = db.fake.on("orders").find((q) => q.calls[0][0] === "insert")!;
    expect(insert.calls[0][1]).toMatchObject({ amount: 176, payment_provider: "dghost", payment_status: "pending" });
    const link = db.fake.on("orders").find((q) => q.calls[0][0] === "update")!;
    expect(link.calls[0][1]).toMatchObject({ provider_order_id: PAYMENT_URL });
  });
  it("refuses a payment page on another host", async () => {
    db.fake.queue("packages", { data: { id: input.packageId, credits: 100, price: 176 } });
    db.fake.queue("orders", { data: null }, { data: { ...order, provider_order_id: null } });
    echoOrder("https://evil.example/pay");
    expect((await createOrder(post(input))).status).toBe(502);
  });
});

describe("webhook", () => {
  const callback = (body: string, type = "application/x-www-form-urlencoded") =>
    webhook(new NextRequest("https://kamalseller.com/api/webhooks/dghost", { method: "POST", body, headers: { "Content-Type": type } }));

  it("confirms from the status API, not from the callback body", async () => {
    db.fake.queue("orders", { data: order });
    mocks.fetch.mockReturnValueOnce(json(liveStatus("PENDING")));
    const res = await callback("status=SUCCESS&order_id=IMO-ABCDE12345&amount=176&UTR=416802195610");
    expect(await res.json()).toEqual({ ok: true, paymentStatus: "pending" });
    expect(mocks.fetch.mock.calls[0][0]).toBe("https://pay.dghost.in/api/check-order-status");
    expect(sentForm(0).get("order_id")).toBe("IMO-ABCDE12345");
    expect(db.fake.on("orders")).toHaveLength(1);
  });
  it("marks the order paid when the gateway confirms it (JSON callback)", async () => {
    db.fake.queue("orders", { data: order }, { data: { ...order, payment_status: "paid" } });
    mocks.fetch.mockReturnValueOnce(json(liveSuccess()));
    const res = await callback(JSON.stringify({ status: "SUCCESS", order_id: "IMO-ABCDE12345" }), "application/json");
    expect(await res.json()).toEqual({ ok: true, paymentStatus: "paid" });
  });
  it("finds the order id when the callback wraps it in result", async () => {
    db.fake.queue("orders", { data: order }, { data: { ...order, payment_status: "paid" } });
    mocks.fetch.mockReturnValueOnce(json(liveSuccess()));
    const res = await callback(JSON.stringify(liveSuccess()), "application/json");
    expect(await res.json()).toEqual({ ok: true, paymentStatus: "paid" });
    expect(sentForm(0).get("order_id")).toBe("IMO-ABCDE12345");
  });
  it("ignores orders that aren't this site's gateway orders without calling the gateway", async () => {
    expect((await callback("order_id=not-ours")).status).toBe(200);
    db.fake.queue("orders", { data: { ...order, payment_provider: "upi" } });
    expect(await (await callback("order_id=IMO-ABCDE12345")).json()).toMatchObject({ ok: true });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});

describe("customer returning from the payment page", () => {
  const check = () => verify(new NextRequest("https://kamalseller.com/api/orders/verify?orderNumber=IMO-ABCDE12345&sync=1"));

  it("asks the gateway and confirms the payment", async () => {
    db.fake.queue("orders", { data: order }, { data: { ...order, payment_status: "paid", provider_order_id: PAYMENT_URL } });
    mocks.fetch.mockReturnValueOnce(json(liveSuccess()));
    const body = await (await check()).json();
    expect(body.order).toMatchObject({ paymentStatus: "paid", gateway: null });
  });
  it("closes the order when the gateway reports failure", async () => {
    db.fake.queue("orders", { data: order }, { data: { ...order, payment_status: "failed" } });
    mocks.fetch.mockReturnValueOnce(json(liveStatus("FAILURE")));
    expect((await (await check()).json()).order.paymentStatus).toBe("failed");
  });
  it("keeps the payment page link while the order is open", async () => {
    db.fake.queue("orders", { data: order });
    mocks.fetch.mockReturnValueOnce(json(liveStatus("PENDING")));
    expect((await (await check()).json()).order.gateway).toEqual({ paymentUrl: PAYMENT_URL });
  });
});
