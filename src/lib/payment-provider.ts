// Every new order is paid through Razorpay Checkout.
export const PAYMENT_PROVIDER = "razorpay";

export function paymentProviderLabel(provider: string): string {
  return provider === PAYMENT_PROVIDER ? "Razorpay" : `${provider} (legacy)`;
}
