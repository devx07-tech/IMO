import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

const API_VERSION = "2023-08-01";

function baseUrl(): string {
  return process.env.CASHFREE_ENV === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";
}

function authHeaders(): Record<string, string> {
  const appId = process.env.CASHFREE_APP_ID;
  const secretKey = process.env.CASHFREE_SECRET_KEY;

  if (!appId || !secretKey) {
    throw new Error(
      "CASHFREE_APP_ID / CASHFREE_SECRET_KEY are not configured. Add them to .env.local."
    );
  }

  return {
    "x-client-id": appId,
    "x-client-secret": secretKey,
    "x-api-version": API_VERSION,
    "Content-Type": "application/json",
  };
}

export interface CreateCashfreeOrderParams {
  orderId: string;
  amount: number;
  customerId: string;
  customerPhone: string;
  returnUrl: string;
}

export interface CashfreeOrderResponse {
  cf_order_id: string;
  order_id: string;
  order_status: string;
  payment_session_id: string;
}

export async function createCashfreeOrder(
  params: CreateCashfreeOrderParams
): Promise<CashfreeOrderResponse> {
  const res = await fetch(`${baseUrl()}/orders`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      order_id: params.orderId,
      order_amount: params.amount,
      order_currency: "INR",
      customer_details: {
        customer_id: params.customerId,
        customer_phone: params.customerPhone,
      },
      order_meta: {
        return_url: params.returnUrl,
      },
    }),
  });

  const body = await res.json();

  if (!res.ok) {
    throw new Error(
      `Cashfree order creation failed: ${body?.message ?? res.statusText}`
    );
  }

  return body as CashfreeOrderResponse;
}

export interface CashfreeOrderStatus {
  order_id: string;
  order_status: "ACTIVE" | "PAID" | "EXPIRED" | "TERMINATED" | string;
}

export async function fetchCashfreeOrderStatus(
  orderId: string
): Promise<CashfreeOrderStatus> {
  const res = await fetch(`${baseUrl()}/orders/${encodeURIComponent(orderId)}`, {
    method: "GET",
    headers: authHeaders(),
  });

  const body = await res.json();

  if (!res.ok) {
    throw new Error(
      `Cashfree order status lookup failed: ${body?.message ?? res.statusText}`
    );
  }

  return body as CashfreeOrderStatus;
}

/**
 * Verifies a Cashfree webhook using the raw request body (must be the
 * untouched bytes, not a re-serialized JSON object) and the signature /
 * timestamp headers Cashfree sends with every webhook delivery.
 */
export function verifyCashfreeWebhookSignature(
  rawBody: string,
  timestamp: string,
  signature: string
): boolean {
  const secretKey = process.env.CASHFREE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("CASHFREE_SECRET_KEY is not configured.");
  }

  const expected = createHmac("sha256", secretKey)
    .update(timestamp + rawBody)
    .digest("base64");

  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature);

  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}
