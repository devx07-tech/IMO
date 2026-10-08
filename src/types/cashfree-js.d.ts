declare module "@cashfreepayments/cashfree-js" {
  export interface CashfreeCheckoutOptions {
    paymentSessionId: string;
    redirectTarget?: "_self" | "_blank" | "_modal" | HTMLElement;
  }

  export interface CashfreeCheckoutResult {
    error?: { message: string };
    redirect?: boolean;
    paymentDetails?: { paymentMessage: string };
  }

  export interface Cashfree {
    checkout(options: CashfreeCheckoutOptions): Promise<CashfreeCheckoutResult>;
  }

  export function load(config: { mode: "sandbox" | "production" }): Promise<Cashfree>;
}
