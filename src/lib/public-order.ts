import type { OrderRow } from "./db-types";
import { RAZORPAY_PROVIDER, UPI_PROVIDER } from "./payment-provider";
import { toPaise } from "./money";

/**
 * The order fields a customer may see. An unpaid order also carries what the
 * browser needs to pay it: Razorpay Checkout details (the key id is public) or
 * the exact UPI amount and payment window.
 */
export function publicOrder(order: OrderRow, razorpayKeyId?: string) {
  const pending = order.payment_status === "pending";
  const razorpay = pending && order.payment_provider === RAZORPAY_PROVIDER && order.provider_order_id && razorpayKeyId;
  const upi = pending && order.payment_provider === UPI_PROVIDER;
  return {
    orderNumber: order.order_number,
    imoProfileId: order.imo_profile_id,
    credits: order.credits,
    quantity: order.quantity,
    amount: order.amount,
    paymentStatus: order.payment_status,
    rechargeStatus: order.recharge_status,
    createdAt: order.created_at,
    paymentMethod: order.payment_provider,
    checkout: razorpay
      ? { keyId: razorpayKeyId, razorpayOrderId: order.provider_order_id!, amountPaise: toPaise(order.amount) }
      : null,
    payment: upi
      ? { amountPaise: toPaise(order.amount), expiresAt: order.expires_at, utrSubmitted: Boolean(order.customer_utr) }
      : null,
  };
}

export type PublicOrder = ReturnType<typeof publicOrder>;
