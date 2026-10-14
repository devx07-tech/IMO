import type { OrderRow } from "./db-types";
import { PAYMENT_PROVIDER } from "./payment-provider";
import { toPaise } from "./money";

/**
 * The order fields a customer may see. An unpaid order also carries what the
 * browser needs to (re)open Razorpay Checkout; the key id is public.
 */
export function publicOrder(order: OrderRow, razorpayKeyId?: string) {
  const payable = order.payment_provider === PAYMENT_PROVIDER && order.payment_status === "pending" &&
    order.provider_order_id && razorpayKeyId;
  return {
    orderNumber: order.order_number,
    imoProfileId: order.imo_profile_id,
    credits: order.credits,
    quantity: order.quantity,
    amount: order.amount,
    paymentStatus: order.payment_status,
    rechargeStatus: order.recharge_status,
    createdAt: order.created_at,
    checkout: payable
      ? { keyId: razorpayKeyId, razorpayOrderId: order.provider_order_id!, amountPaise: toPaise(order.amount) }
      : null,
  };
}

export type PublicOrder = ReturnType<typeof publicOrder>;
