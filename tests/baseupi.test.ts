import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBaseupiOrder, parseBaseupiPayment, validateCheckoutUrl, verifyBaseupiSignature } from "@/lib/baseupi";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("BaseUPI webhook authentication", () => {
  it("accepts the raw body signature and rejects tampering and malformed signatures", () => {
    vi.stubEnv("BASEUPI_WEBHOOK_SECRET", "test-only-secret");
    const raw = '{"event":"payment.completed","amount_paise":3000}';
    const signature = createHmac("sha256", "test-only-secret").update(raw).digest("hex");
    expect(verifyBaseupiSignature(raw, signature)).toBe(true);
    expect(verifyBaseupiSignature(raw.replace("3000", "9000"), signature)).toBe(false);
    expect(verifyBaseupiSignature(raw, signature + "junk")).toBe(false);
    expect(verifyBaseupiSignature(raw, "x")).toBe(false);
  });

  it("fails closed without the webhook secret", () => {
    vi.stubEnv("BASEUPI_WEBHOOK_SECRET", "");
    expect(() => verifyBaseupiSignature("{}", "a".repeat(64))).toThrow();
  });

  it("validates both published event formats and rejects unconfirmed or invalid amounts", () => {
    const data = { merchant_order_id: "IMO-12345", amount_paise: 3000 };
    expect(parseBaseupiPayment({ type: "BASEUPI_PAYMENT_SUCCESS", data })).toEqual(data);
    expect(parseBaseupiPayment({ event: "payment.completed", status: "COMPLETED", ...data })).toMatchObject(data);
    expect(parseBaseupiPayment({ event: "payment.completed", status: "PENDING", ...data })).toBeNull();
    expect(parseBaseupiPayment({ type: "BASEUPI_PAYMENT_SUCCESS", data: { ...data, amount_paise: "3000" } })).toBeNull();
    expect(parseBaseupiPayment({ type: "BASEUPI_PAYMENT_SUCCESS", data: { ...data, amount_paise: 0 } })).toBeNull();
  });
});

describe("BaseUPI checkout", () => {
  it.each(["https://evil.example/pay", "http://baseupi.app/pay", "https://baseupi.app.evil.example/pay", "javascript:alert(1)", "https://user@baseupi.app/pay"])("rejects unsafe redirects: %s", (url) => {
    expect(() => validateCheckoutUrl(url)).toThrow();
  });

  it("sends server-priced line items and binds the checkout response to the order", async () => {
    vi.stubEnv("BASEUPI_SECRET_KEY", "test-api-key");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      order_id: "ord_test", merchant_order_id: "IMO-12345", amount_paise: 6000,
      checkout_url: "https://baseupi.app/pay/ord_test",
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const params = { orderNumber: "IMO-12345", unitPrice: 30, quantity: 2, credits: 10, customerEmail: "buyer@example.com", returnUrl: "https://kamalseller.com/?order=IMO-12345" };
    expect(await createBaseupiOrder(params)).toEqual({ publicOrderId: "ord_test", checkoutUrl: "https://baseupi.app/pay/ord_test" });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://baseupi.app/api/v1/orders");
    expect(options.headers["Idempotency-Key"]).toBe("IMO-12345");
    expect(JSON.parse(options.body).line_items).toEqual([{ name: "10 IMO Credits", amount_paise: 3000, quantity: 2 }]);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      order_id: "ord_test", merchant_order_id: "IMO-12345", amount_paise: 1,
      checkout_url: "https://baseupi.app/pay/ord_test",
    }), { status: 200 }));
    await expect(createBaseupiOrder(params)).rejects.toThrow("does not match");
  });
});
