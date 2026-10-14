import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";

const API = "https://api.razorpay.com/v1";

export function razorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

/** The public key id; safe to send to the browser for Checkout. */
export function razorpayKeyId(): string {
  const keyId = process.env.RAZORPAY_KEY_ID;
  if (!keyId) throw new Error("RAZORPAY_KEY_ID is not configured.");
  return keyId;
}

export function razorpayMode(): "test" | "live" | "unconfigured" {
  const keyId = process.env.RAZORPAY_KEY_ID ?? "";
  return keyId.startsWith("rzp_live_") ? "live" : keyId.startsWith("rzp_test_") ? "test" : "unconfigured";
}

async function api<T>(path: string, schema: z.ZodType<T>, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !secret) throw new Error("Razorpay keys are not configured.");
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${secret}`).toString("base64")}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const description = (json as { error?: { description?: string } } | null)?.error?.description;
    throw new Error(`Razorpay ${init.method ?? "GET"} ${path} failed: HTTP ${res.status}${description ? ` (${description})` : ""}`);
  }
  return schema.parse(json);
}

const orderSchema = z.object({ id: z.string(), amount: z.number(), currency: z.string(), receipt: z.string().nullable().optional() });

export const paymentSchema = z.object({
  id: z.string(),
  order_id: z.string().nullable(),
  amount: z.number(),
  currency: z.string(),
  status: z.enum(["created", "authorized", "captured", "refunded", "failed"]),
  method: z.string().nullable().optional(),
  vpa: z.string().nullable().optional(),
  acquirer_data: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type RazorpayPayment = z.infer<typeof paymentSchema>;

export async function createRazorpayOrder(params: {
  amountPaise: number;
  receipt: string;
  notes: Record<string, string>;
}) {
  const order = await api("/orders", orderSchema, {
    method: "POST",
    body: { amount: params.amountPaise, currency: "INR", receipt: params.receipt, notes: params.notes },
  });
  if (order.amount !== params.amountPaise || order.currency !== "INR") {
    throw new Error("Razorpay order does not match the requested amount.");
  }
  return order;
}

export async function fetchRazorpayPayment(paymentId: string): Promise<RazorpayPayment> {
  return api(`/payments/${encodeURIComponent(paymentId)}`, paymentSchema);
}

export async function fetchOrderPayments(orderId: string): Promise<RazorpayPayment[]> {
  const list = await api(`/orders/${encodeURIComponent(orderId)}/payments`, z.object({ items: z.array(paymentSchema) }));
  return list.items;
}

/** Captures an authorized payment (only needed if auto-capture is off in the dashboard). */
export async function captureRazorpayPayment(paymentId: string, amountPaise: number): Promise<RazorpayPayment> {
  return api(`/payments/${encodeURIComponent(paymentId)}/capture`, paymentSchema, {
    method: "POST",
    body: { amount: amountPaise, currency: "INR" },
  });
}

function safeEqualHex(expected: string, given: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(given)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(given, "hex"));
}

/** Checkout success signature: HMAC-SHA256(order_id|payment_id, key secret). */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  return safeEqualHex(expected, signature);
}

/** Webhook signature: HMAC-SHA256(raw body, webhook secret). */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature);
}

/** The bank's UPI reference (RRN), when Razorpay reports one. */
export function paymentReference(payment: RazorpayPayment): string | null {
  const rrn = payment.acquirer_data?.rrn;
  return typeof rrn === "string" && rrn ? rrn : null;
}
