// Two checkouts are supported. Direct UPI (Kamal's own UPI IDs, confirmed by the
// payment phone) is the default; Razorpay is used when PAYMENT_MODE=razorpay
// and the Razorpay keys are set.
export const UPI_PROVIDER = "upi";
export const RAZORPAY_PROVIDER = "razorpay";
export type PaymentMode = typeof UPI_PROVIDER | typeof RAZORPAY_PROVIDER;

/** Server only: which checkout new orders use. */
export function activePaymentMode(): PaymentMode {
  return process.env.PAYMENT_MODE?.trim().toLowerCase() === RAZORPAY_PROVIDER ? RAZORPAY_PROVIDER : UPI_PROVIDER;
}

export function paymentProviderLabel(provider: string): string {
  if (provider === UPI_PROVIDER) return "UPI";
  if (provider === RAZORPAY_PROVIDER) return "Razorpay";
  return `${provider} (legacy)`;
}
