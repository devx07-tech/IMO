// Every new order is paid by direct UPI to our merchant UPI ID.
export const PAYMENT_PROVIDER = "upi";

export function paymentProviderLabel(provider: string): string {
  return provider === PAYMENT_PROVIDER ? "UPI (Paytm)" : `${provider} (legacy)`;
}
