import "server-only";
import { BaseUPI, Webhooks } from "@snc0x/baseupi";
import { z } from "zod";

function client() {
  const key = process.env.BASEUPI_SECRET_KEY;
  if (!key) throw new Error("BASEUPI_SECRET_KEY is not configured.");
  return new BaseUPI(key);
}

export function baseupiConfigured() {
  return Boolean(process.env.BASEUPI_SECRET_KEY && process.env.BASEUPI_WEBHOOK_SECRET);
}

export function validateCheckoutUrl(value: string): string {
  const url = new URL(value);
  if (url.origin !== "https://baseupi.app" || url.username || url.password) {
    throw new Error("Invalid BaseUPI checkout URL.");
  }
  return url.href;
}

export async function createBaseupiOrder(params: {
  orderNumber: string;
  unitPrice: number;
  quantity: number;
  credits: number;
  customerEmail: string;
  returnUrl: string;
}) {
  const order = await client().orders.create({
    merchant_order_id: params.orderNumber,
    customer_email: params.customerEmail,
    redirect_url: params.returnUrl,
    line_items: [{
      name: `${params.credits} IMO Credits`,
      amount_paise: Math.round(params.unitPrice * 100),
      quantity: params.quantity,
    }],
  }, { idempotencyKey: params.orderNumber, signal: AbortSignal.timeout(15000) });
  if (!order.order_id || order.merchant_order_id !== params.orderNumber ||
      order.amount_paise !== Math.round(params.unitPrice * 100) * params.quantity) {
    throw new Error("BaseUPI order response does not match the requested order.");
  }
  return { publicOrderId: order.order_id, checkoutUrl: validateCheckoutUrl(order.checkout_url) };
}

const successData = z.object({
  merchant_order_id: z.string().min(1),
  amount_paise: z.number().int().positive().safe(),
  order_id: z.string().min(1).optional(),
});

// Accept the documented event envelope and the official SDK 1.4 flat payload.
const eventSchema = z.union([
  z.object({ type: z.literal("BASEUPI_PAYMENT_SUCCESS"), data: successData }),
  successData.extend({ event: z.literal("payment.completed"), status: z.literal("COMPLETED") }),
]);

export function verifyBaseupiSignature(rawBody: string, signature: string) {
  const secret = process.env.BASEUPI_WEBHOOK_SECRET;
  if (!secret) throw new Error("BASEUPI_WEBHOOK_SECRET is not configured.");
  // Strict format also rejects trailing junk which Buffer.from(hex) ignores.
  return /^[a-f0-9]{64}$/i.test(signature) &&
    new Webhooks().verifySignature(rawBody, signature, secret);
}

export function parseBaseupiPayment(payload: unknown) {
  const result = eventSchema.safeParse(payload);
  if (!result.success) return null;
  return "data" in result.data ? result.data.data : result.data;
}
