// Three checkouts are supported. The dghost UPI gateway (pay.dghost.in) is the
// default; PAYMENT_MODE=upi uses Kamal's own UPI IDs confirmed by the payment
// phone, and PAYMENT_MODE=razorpay uses Razorpay (when its keys are set).
export const GATEWAY_PROVIDER = "dghost";
export const UPI_PROVIDER = "upi";
export const RAZORPAY_PROVIDER = "razorpay";
export type PaymentMode = typeof GATEWAY_PROVIDER | typeof UPI_PROVIDER | typeof RAZORPAY_PROVIDER;

/** How long a gateway order's payment page stays open. */
export const GATEWAY_PAYMENT_WINDOW_SECONDS = 30 * 60;

/** Server only: which checkout new orders use. */
export function activePaymentMode(): PaymentMode {
  const mode = process.env.PAYMENT_MODE?.trim().toLowerCase();
  if (mode === UPI_PROVIDER || mode === RAZORPAY_PROVIDER) return mode;
  return GATEWAY_PROVIDER;
}

export function paymentProviderLabel(provider: string): string {
  if (provider === GATEWAY_PROVIDER) return "UPI gateway";
  if (provider === UPI_PROVIDER) return "UPI";
  if (provider === RAZORPAY_PROVIDER) return "Razorpay";
  return `${provider} (legacy)`;
}
