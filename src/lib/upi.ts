// Pure UPI helpers shared by the checkout UI, route handlers and tests.

/** How long a customer has to pay before the order's unique amount is released. */
export const PAYMENT_WINDOW_MINUTES = 30;

/** Common per-transaction UPI limit; larger orders must be split. */
export const MAX_UPI_AMOUNT_PAISE = 100_000_00;

/** Customers may still submit a UTR for this long after an order expires. */
export const LATE_UTR_WINDOW_HOURS = 24;

const VPA_RE = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
const UTR_RE = /^\d{12}$/;

export function toPaise(amount: number | string): number {
  return Math.round(Number(amount) * 100);
}

export function formatPaise(paise: number): string {
  return (paise / 100).toFixed(2);
}

/** UPI reference numbers (UTR / RRN) are 12 digits. */
export function normalizeUtr(input: string | null | undefined): string | null {
  const value = input?.replace(/\s+/g, "") ?? "";
  return UTR_RE.test(value) ? value : null;
}

export interface UpiPaymentRequest {
  vpa: string;
  payeeName: string;
  amountPaise: number;
  note: string;
}

/**
 * Builds the UPI payment link (encoded in the checkout QR code) with the payee,
 * exact amount and order note prefilled. Our Paytm merchant UPI ID only accepts
 * scanned payments, so this link is never opened directly from the website.
 */
export function buildUpiLink(request: UpiPaymentRequest): string {
  if (!VPA_RE.test(request.vpa)) throw new Error("Invalid UPI ID.");
  if (!Number.isSafeInteger(request.amountPaise) || request.amountPaise <= 0) {
    throw new Error("Invalid amount.");
  }
  // '@' stays literal: several UPI apps reject a percent-encoded payee address.
  const params = [
    `pa=${request.vpa}`,
    `pn=${encodeURIComponent(request.payeeName)}`,
    `am=${formatPaise(request.amountPaise)}`,
    "cu=INR",
    `tn=${encodeURIComponent(request.note)}`,
  ];
  return `upi://pay?${params.join("&")}`;
}
