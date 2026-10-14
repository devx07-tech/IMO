import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import type { OrderRow } from "./db-types";
import { logAudit } from "./audit";
import { sendOrderNotification } from "./notifications/service";
import { RAZORPAY_PROVIDER } from "./payment-provider";
import { toPaise } from "./money";
import {
  captureRazorpayPayment,
  fetchOrderPayments,
  paymentReference,
  type RazorpayPayment,
} from "./razorpay";

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
