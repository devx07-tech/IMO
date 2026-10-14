import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import type { OrderRow } from "./db-types";
import { logAudit } from "./audit";
import { sendOrderNotification } from "./notifications/service";
import { GATEWAY_PROVIDER, RAZORPAY_PROVIDER } from "./payment-provider";
import { toPaise } from "./money";
import {
  captureRazorpayPayment,
  fetchOrderPayments,
  paymentReference,
  type RazorpayPayment,
} from "./razorpay";
import { fetchGatewayStatus, type GatewayStatus } from "./dghost";

const UNIQUE_VIOLATION = "23505";

export type ConfirmSource = "checkout" | "webhook" | "status_check";

const SOURCE_LABEL: Record<ConfirmSource, string> = {
  checkout: "Razorpay checkout",
  webhook: "Razorpay webhook",
  status_check: "Razorpay status check",
};

export type ConfirmResult =
  | { status: "paid"; order: OrderRow }
  | { status: "not_captured" }
  | { status: "mismatch"; reason: string };

/**
 * Marks an order paid for a Razorpay payment, exactly once. The payment must
 * belong to the order's Razorpay order, be for the exact amount, and be
 * captured; an authorized payment is captured first. Safe to call repeatedly
 * from the checkout callback, the webhook and status checks.
 */
export async function confirmRazorpayPayment(
  order: OrderRow,
  payment: RazorpayPayment,
  source: ConfirmSource
): Promise<ConfirmResult> {
  if (order.payment_provider !== RAZORPAY_PROVIDER || !order.provider_order_id ||
      payment.order_id !== order.provider_order_id) {
    return { status: "mismatch", reason: "Payment belongs to a different order." };
  }
  if (payment.currency !== "INR" || payment.amount !== toPaise(order.amount)) {
    return { status: "mismatch", reason: "Payment amount does not match the order." };
  }
  if (order.payment_status === "paid") {
    return order.provider_payment_id === payment.id
      ? { status: "paid", order }
      : { status: "mismatch", reason: "Order was already paid by another payment." };
  }

  let captured = payment;
  if (captured.status === "authorized") {
    captured = await captureRazorpayPayment(payment.id, payment.amount);
  }
  if (captured.status !== "captured") return { status: "not_captured" };

  const now = new Date().toISOString();
  const { data: updated, error } = await supabaseAdmin
    .from("orders")
    .update({ payment_status: "paid", paid_at: now, updated_at: now, provider_payment_id: captured.id })
    .eq("id", order.id)
    .in("payment_status", ["pending", "failed"])
    .select()
    .maybeSingle();
  if (error?.code === UNIQUE_VIOLATION) {
    return { status: "mismatch", reason: "This payment already confirmed another order." };
  }
  if (error) throw error;
  if (!updated) {
    // Another request (checkout callback vs webhook) confirmed it first.
    const { data: current } = await supabaseAdmin.from("orders").select("*").eq("id", order.id).single();
    return current?.payment_status === "paid" && current.provider_payment_id === captured.id
      ? { status: "paid", order: current }
      : { status: "mismatch", reason: "Order is no longer awaiting payment." };
  }

  const reference = paymentReference(captured);
  await logAudit({
    action: "payment_confirmed",
    entityType: "order",
    entityId: updated.id,
    metadata: { provider: RAZORPAY_PROVIDER, source, paymentId: captured.id, method: captured.method, reference, amount: updated.amount },
  });
  await sendOrderNotification("order_paid", updated, "telegram", [
    `Payment ID: ${captured.id}`,
    ...(captured.method ? [`Method: ${captured.method.toUpperCase()}${captured.vpa ? ` (${captured.vpa})` : ""}`] : []),
    ...(reference ? [`UPI/Bank ref: ${reference}`] : []),
    `Confirmed by: ${SOURCE_LABEL[source]}`,
  ]);
  return { status: "paid", order: updated };
}

/**
 * Asks Razorpay whether an open order has been paid (used when the checkout
 * callback or webhook hasn't arrived yet).
 */
export async function syncOrderWithRazorpay(order: OrderRow): Promise<OrderRow> {
  if (order.payment_status !== "pending" || !order.provider_order_id) return order;
  const payments = await fetchOrderPayments(order.provider_order_id);
  const paid = payments.find((p) => p.status === "captured" || p.status === "authorized");
  if (!paid) return order;
  const result = await confirmRazorpayPayment(order, paid, "status_check");
  return result.status === "paid" ? result.order : order;
}

export type GatewayConfirmSource = "redirect" | "webhook" | "status_check";

const GATEWAY_SOURCE_LABEL: Record<GatewayConfirmSource, string> = {
  redirect: "UPI gateway (customer returned)",
  webhook: "UPI gateway webhook",
  status_check: "UPI gateway status check",
};

/**
 * Marks a gateway order paid, exactly once, from a check-order-status result:
 * it must be SUCCESS for this order and the exact amount. The UTR is stored as
 * the payment id, so one UTR can never pay two orders.
 */
export async function confirmGatewayPayment(
  order: OrderRow,
  status: GatewayStatus,
  source: GatewayConfirmSource
): Promise<ConfirmResult> {
  if (order.payment_provider !== GATEWAY_PROVIDER || status.orderId !== order.order_number) {
    return { status: "mismatch", reason: "Payment belongs to a different order." };
  }
  if (status.state !== "success") return { status: "not_captured" };
  if (status.amountPaise !== toPaise(order.amount)) {
    return { status: "mismatch", reason: "Payment amount does not match the order." };
  }
  if (order.payment_status === "paid") return { status: "paid", order };

  const now = new Date().toISOString();
  const { data: updated, error } = await supabaseAdmin
    .from("orders")
    .update({ payment_status: "paid", paid_at: now, updated_at: now, provider_payment_id: status.utr })
    .eq("id", order.id)
    .in("payment_status", ["pending", "failed"])
    .select()
    .maybeSingle();
  if (error?.code === UNIQUE_VIOLATION) {
    return { status: "mismatch", reason: "This UTR already confirmed another order." };
  }
  if (error) throw error;
  if (!updated) {
    // The webhook and the customer's return raced; the other one confirmed it.
    const { data: current } = await supabaseAdmin.from("orders").select("*").eq("id", order.id).single();
    return current?.payment_status === "paid"
      ? { status: "paid", order: current }
      : { status: "mismatch", reason: "Order is no longer awaiting payment." };
  }

  await logAudit({
    action: "payment_confirmed",
    entityType: "order",
    entityId: updated.id,
    metadata: { provider: GATEWAY_PROVIDER, source, utr: status.utr, paymentApp: status.paymentApp, amount: updated.amount },
  });
  await sendOrderNotification("order_paid", updated, "telegram", [
    ...(status.utr ? [`UTR: ${status.utr}`] : []),
    ...(status.paymentApp ? [`App: ${status.paymentApp}`] : []),
    `Confirmed by: ${GATEWAY_SOURCE_LABEL[source]}`,
  ]);
  return { status: "paid", order: updated };
}

/**
 * Asks the gateway whether an open order has been paid. A payment reported as
 * failed closes the order; a later success (e.g. via the webhook) still confirms it.
 */
export async function syncOrderWithGateway(order: OrderRow, source: GatewayConfirmSource): Promise<OrderRow> {
  if (order.payment_provider !== GATEWAY_PROVIDER || order.payment_status === "paid" || order.payment_status === "refunded") {
    return order;
  }
  const status = await fetchGatewayStatus(order.order_number);
  if (status.state === "failed" && order.payment_status === "pending") {
    const { data: failed } = await supabaseAdmin
      .from("orders")
      .update({ payment_status: "failed", updated_at: new Date().toISOString() })
      .eq("id", order.id)
      .eq("payment_status", "pending")
      .select()
      .maybeSingle();
    return failed ?? order;
  }
  const result = await confirmGatewayPayment(order, status, source);
  if (result.status === "mismatch") {
    console.error("Gateway payment mismatch", { orderNumber: order.order_number, reason: result.reason, utr: status.utr });
  }
  return result.status === "paid" ? result.order : order;
}
