"use client";

// Loads Razorpay Checkout (checkout.js) on demand and opens the payment window.

export interface CheckoutSuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open(): void;
  on(event: "payment.failed", handler: (response: unknown) => void): void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
let loading: Promise<void> | null = null;

function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { loading = null; script.remove(); reject(new Error("Could not load Razorpay.")); };
    document.head.appendChild(script);
  });
  return loading;
}

export async function openRazorpayCheckout(params: {
  keyId: string;
  razorpayOrderId: string;
  amountPaise: number;
  orderNumber: string;
  description: string;
  phone: string | null;
  onSuccess: (response: CheckoutSuccess) => void;
  onDismiss: () => void;
  /** A payment attempt failed; the window stays open so the customer can retry. */
  onFailed: (reason: string) => void;
}): Promise<void> {
  await loadCheckout();
  if (!window.Razorpay) throw new Error("Could not load Razorpay.");
  const checkout = new window.Razorpay({
    key: params.keyId,
    order_id: params.razorpayOrderId,
    amount: params.amountPaise,
    currency: "INR",
    name: "IMO Recharge",
    description: params.description,
    notes: { order_number: params.orderNumber },
    prefill: params.phone ? { contact: `+91${params.phone}` } : {},
    theme: { color: "#0d6efd" },
    retry: { enabled: true },
    modal: { confirm_close: true, ondismiss: params.onDismiss },
    handler: params.onSuccess,
  });
  checkout.on("payment.failed", (response) => {
    const error = (response as { error?: { description?: string } } | null)?.error;
    params.onFailed(error?.description || "The payment was declined.");
  });
  checkout.open();
}
