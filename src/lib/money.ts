/** Rupees to integer paise without floating-point drift. */
export function toPaise(amount: number | string): number {
  return Math.round(Number(amount) * 100);
}

/** Largest single payment we accept. */
export const MAX_ORDER_AMOUNT_PAISE = 100_000_00;
