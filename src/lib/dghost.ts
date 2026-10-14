import "server-only";
import { z } from "zod";
import { toPaise } from "./money";

// dghost UPI gateway (pay.dghost.in). Orders are created with the account's
// user token and paid on the gateway's hosted page; payment is only ever
// trusted from the check-order-status API, never from a webhook or redirect.
const API = "https://pay.dghost.in";
const PAYMENT_HOST = "pay.dghost.in";

export function gatewayConfigured(): boolean {
  return Boolean(process.env.DGHOST_USER_TOKEN?.trim());
}

async function post(path: string, params: Record<string, string>): Promise<{ status: number; json: unknown }> {
  const token = process.env.DGHOST_USER_TOKEN?.trim();
  if (!token) throw new Error("DGHOST_USER_TOKEN is not configured.");
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ user_token: token, ...params }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const createSchema = z.object({
  status: z.literal(true),
  result: z.object({ orderId: z.string(), payment_url: z.string() }),
});

/** Creates the gateway order and returns its hosted payment page URL. */
export async function createGatewayOrder(params: {
  orderNumber: string;
  amountPaise: number;
  mobile: string;
  redirectUrl: string;
  title: string;
  description: string;
  expirySeconds: number;
}): Promise<string> {
  const { status, json } = await post("/api/create-order", {
    order_id: params.orderNumber,
    amount: (params.amountPaise / 100).toFixed(2),
    customer_mobile: params.mobile,
    redirect_url: params.redirectUrl,
    remark1: params.title,
    remark2: params.description,
    expiry_seconds: String(params.expirySeconds),
  });
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    const message = (json as { message?: unknown } | null)?.message;
    throw new Error(`Gateway create-order failed: HTTP ${status}${typeof message === "string" ? ` (${message})` : ""}`);
  }
  if (parsed.data.result.orderId !== params.orderNumber) {
    throw new Error("Gateway order does not match the requested order.");
  }
  const url = new URL(parsed.data.result.payment_url);
  if (url.protocol !== "https:" || url.host !== PAYMENT_HOST) {
    throw new Error(`Gateway returned an unexpected payment URL host: ${url.host}`);
  }
  return url.toString();
}

export type GatewayState = "success" | "pending" | "failed" | "not_found";

export interface GatewayStatus {
  state: GatewayState;
  orderId: string | null;
  amountPaise: number | null;
  utr: string | null;
  paymentApp: string | null;
}

function text(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * Reads a status response. The live API wraps the transaction in `result`
 * ({ status: "COMPLETED", result: { txnStatus, orderId, amount, ... } }) while
 * the docs show a flat { status, order_id, amount, UTR }; both are accepted.
 * Only an explicit SUCCESS counts as paid.
 */
export function parseGatewayStatus(json: unknown): GatewayStatus {
  const root = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const result = root.result && typeof root.result === "object" ? (root.result as Record<string, unknown>) : null;
  const txn = result ?? root;
  const status = (text(txn.txnStatus) ?? text(txn.status) ?? "").toUpperCase();
  const amount = text(txn.amount);
  const state: GatewayState =
    !result && /not found/i.test(text(root.message) ?? "") ? "not_found"
      : status === "SUCCESS" ? "success"
        : ["FAILURE", "FAILED", "EXPIRED", "CANCELLED"].includes(status) ? "failed"
          : "pending";
  return {
    state,
    orderId: text(txn.orderId) ?? text(txn.order_id),
    amountPaise: amount !== null && Number.isFinite(Number(amount)) ? toPaise(amount) : null,
    utr: text(txn.UTR) ?? text(txn.utr) ?? text(txn.bankRRN) ?? text(txn.rrn),
    paymentApp: text(txn.paymentApp) ?? text(txn.payment_app),
  };
}

export async function fetchGatewayStatus(orderNumber: string): Promise<GatewayStatus> {
  const { status, json } = await post("/api/check-order-status", { order_id: orderNumber });
  if (status >= 500 || json === null) throw new Error(`Gateway status check failed: HTTP ${status}`);
  return parseGatewayStatus(json);
}
