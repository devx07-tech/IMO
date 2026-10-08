"use client";

import { load, type Cashfree } from "@cashfreepayments/cashfree-js";

let cashfreePromise: Promise<Cashfree> | null = null;

export function getCashfree(mode: "sandbox" | "production"): Promise<Cashfree> {
  if (!cashfreePromise) {
    cashfreePromise = load({ mode });
  }
  return cashfreePromise;
}

export async function openCashfreeCheckout(
  paymentSessionId: string,
  mode: "sandbox" | "production"
): Promise<{ cancelled: boolean }> {
  const cashfree = await getCashfree(mode);
  const result = await cashfree.checkout({
    paymentSessionId,
    redirectTarget: "_modal",
  });
  return { cancelled: Boolean(result.error) };
}
