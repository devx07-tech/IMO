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

export type UpiApp = "upi" | "gpay" | "phonepe" | "paytm";

// App-specific schemes open that app directly (needed on iPhone, which has no
// system chooser for upi://). The generic link shows Android's app chooser.
const APP_PREFIX: Record<UpiApp, string> = {
  upi: "upi://pay",
  gpay: "tez://upi/pay",
  phonepe: "phonepe://pay",
  paytm: "paytmmp://pay",
};

export interface UpiPaymentRequest {
  vpa: string;
  payeeName: string;
  amountPaise: number;
  note: string;
}

/** Builds a UPI deep link with the payee, exact amount and order note prefilled. */
export function buildUpiLink(request: UpiPaymentRequest, app: UpiApp = "upi"): string {
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
  return `${APP_PREFIX[app]}?${params.join("&")}`;
}
