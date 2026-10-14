import type { OrderRow } from "./db-types";
import { PAYMENT_PROVIDER } from "./payment-provider";
import { toPaise } from "./upi";

/** The order fields a customer may see, plus what they need to pay an open order. */
export function publicOrder(order: OrderRow) {
  const awaitingPayment = order.payment_provider === PAYMENT_PROVIDER && order.payment_status === "pending";
  return {
    orderNumber: order.order_number,
    imoProfileId: order.imo_profile_id,
    credits: order.credits,
    quantity: order.quantity,
    amount: order.amount,
    paymentStatus: order.payment_status,
    rechargeStatus: order.recharge_status,
    createdAt: order.created_at,
    payment: awaitingPayment
      ? {
          amountPaise: toPaise(order.amount),
          expiresAt: order.expires_at,
          utrSubmitted: Boolean(order.customer_utr),
        }
      : null,
  };
}

export type PublicOrder = ReturnType<typeof publicOrder>;
