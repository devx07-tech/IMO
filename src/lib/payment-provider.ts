export const PAYMENT_PROVIDERS = ["baseupi", "cashfree"] as const;
export type PaymentProvider = typeof PAYMENT_PROVIDERS[number];

export function paymentProviderLabel(provider: string): string {
  return provider === "baseupi" ? "BaseUPI" : provider === "cashfree" ? "Cashfree" : provider;
}

export function isPaymentProvider(value: string): value is PaymentProvider {
  return PAYMENT_PROVIDERS.some((provider) => provider === value);
}
