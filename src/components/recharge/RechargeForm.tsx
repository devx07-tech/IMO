"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { PaymentFlowState, RechargeOrder, RechargePackage } from "@/lib/types";
import { isValidProfileId, sleep } from "@/lib/utils";
import { normalizeOrderNumber } from "@/lib/validation";
import type { PublicOrder } from "@/lib/public-order";
import { openRazorpayCheckout, type CheckoutSuccess } from "@/lib/razorpay-checkout";
import { ProfileIdInput } from "./ProfileIdInput";
import { RechargePackages } from "./RechargePackages";
import { QuantitySelector } from "./QuantitySelector";
import { OrderSummary } from "./OrderSummary";
import { PaymentButton } from "./PaymentButton";
import { PaymentStatusModal } from "./PaymentStatusModal";
import type { UpiPaymentInfo } from "./UpiPaymentPanel";

interface RechargeFormProps {
  packages: RechargePackage[];
  onViewTransaction: (order: RechargeOrder) => void;
}

function toRechargeOrder(api: PublicOrder): RechargeOrder {
  return {
    id: api.orderNumber,
    profileId: api.imoProfileId,
    packageLabel: `${api.credits.toLocaleString("en-IN")} Credits`,
    credits: api.credits,
    quantity: api.quantity,
    amount: api.amount,
    paymentStatus: api.paymentStatus,
    rechargeStatus: api.rechargeStatus,
    createdAt: api.createdAt,
  };
}

async function fetchOrder(orderNumber: string, sync = false, signal?: AbortSignal): Promise<PublicOrder> {
  const params = new URLSearchParams({ orderNumber, ...(sync ? { sync: "1" } : {}) });
  const res = await fetch(`/api/orders/verify?${params}`, { cache: "no-store", signal });
  const body = await res.json();
  if (!res.ok || !body.order) throw new Error(body.error ?? "Could not check payment status.");
  return body.order as PublicOrder;
}

function setOrderInUrl(orderNumber: string | null) {
  const url = new URL(window.location.href);
  if (orderNumber) url.searchParams.set("order", orderNumber);
  else url.searchParams.delete("order");
  window.history.replaceState(null, "", url);
}

export function RechargeForm({ packages, onViewTransaction }: RechargeFormProps) {
  const [profileId, setProfileId] = useState("");
  const [profileIdError, setProfileIdError] = useState("");
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [packageError, setPackageError] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [flowState, setFlowState] = useState<PaymentFlowState>("idle");
  const [currentOrder, setCurrentOrder] = useState<RechargeOrder | null>(null);
  // The latest unpaid order, so "Try again" reopens the same Razorpay order.
  const [unpaidOrder, setUnpaidOrder] = useState<PublicOrder | null>(null);
  // An open direct-UPI order: amount and payment window for the payment screen.
  const [payment, setPayment] = useState<UpiPaymentInfo | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const submitting = useRef(false);
  const paymentHandled = useRef(false);

  /** Records the server's view of the order; returns true once it's paid. */
  const applyOrder = (api: PublicOrder): boolean => {
    setCurrentOrder(toRechargeOrder(api));
    setUnpaidOrder(api.paymentStatus === "pending" && api.checkout ? api : null);
    setPayment(api.payment ? { orderNumber: api.orderNumber, ...api.payment } : null);
    return api.paymentStatus === "paid";
  };

  /** Screen for a direct-UPI order in its current state. */
  const upiFlowState = (api: PublicOrder): PaymentFlowState => {
    if (api.paymentStatus === "paid") return "success";
    if (api.payment) return api.payment.utrSubmitted ? "pending" : "awaiting_payment";
    return api.paymentStatus === "failed" ? "expired" : "failed";
  };

  // Resume an order after a reload or when the customer comes back to the page.
  useEffect(() => {
    const orderNumber = normalizeOrderNumber(new URLSearchParams(window.location.search).get("order"));
    if (!orderNumber) return;
    const controller = new AbortController();
    async function resume() {
      submitting.current = true;
      setFlowState("verifying");
      try {
        const api = await fetchOrder(orderNumber!, true, controller.signal);
        if (controller.signal.aborted) return;
        const paid = applyOrder(api);
        if (api.paymentMethod === "upi") {
          setFlowState(upiFlowState(api));
        } else {
          setFlowState(paid ? "success" : api.paymentStatus === "pending" ? "failed" : "idle");
          if (!paid && api.paymentStatus !== "pending") setOrderInUrl(null);
        }
      } catch {
        if (controller.signal.aborted) return;
        setFlowState("idle");
        setSubmitError(`Could not check payment. Use Order ID ${orderNumber} in Transaction History before paying again.`);
      } finally {
        if (!controller.signal.aborted) submitting.current = false;
      }
    }
    void resume();
    return () => { controller.abort(); submitting.current = false; };
  }, []);

  // Direct UPI: poll for the payment phone's confirmation, and check at once when
  // the customer switches back from their UPI app.
  const watchedOrder = payment && (flowState === "awaiting_payment" || flowState === "pending") ? payment.orderNumber : null;
  const reviewing = flowState === "pending";
  useEffect(() => {
    if (!watchedOrder) return;
    const controller = new AbortController();
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const api = await fetchOrder(watchedOrder, false, controller.signal);
        if (controller.signal.aborted) return;
        applyOrder(api);
        setFlowState(upiFlowState(api));
      } catch { /* transient; the next tick retries */ }
    };
    const timer = setInterval(() => void check(), reviewing ? 10_000 : 3_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [watchedOrder, reviewing]);

  const selectedPackage = packages.find((p) => p.id === selectedPackageId) ?? null;

  const validate = () => {
    let valid = true;

    if (!profileId.trim()) {
      setProfileIdError("Please enter your IMO ID or mobile number.");
      valid = false;
    } else if (!isValidProfileId(profileId)) {
      setProfileIdError("Enter a valid IMO ID or 10-digit mobile number.");
      valid = false;
    } else {
      setProfileIdError("");
    }

    if (!selectedPackage) {
      setPackageError("Please select a recharge package.");
      valid = false;
    } else {
      setPackageError("");
    }

    return valid;
  };

  /** After Razorpay reports success: confirm on the server, then keep checking briefly. */
  const confirmPayment = async (orderNumber: string, response: CheckoutSuccess) => {
    setFlowState("verifying");
    try {
      const res = await fetch("/api/orders/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber, ...response }),
      });
      const body = await res.json().catch(() => ({}));
      if (body.order && applyOrder(body.order as PublicOrder)) { setFlowState("success"); return; }
    } catch { /* fall through to status checks */ }

    // The webhook may land a moment later; ask Razorpay directly for up to ~45s.
    for (let attempt = 0; attempt < 15; attempt++) {
      await sleep(3000);
      try {
        if (applyOrder(await fetchOrder(orderNumber, true))) { setFlowState("success"); return; }
      } catch { /* transient; retry */ }
    }
    setFlowState("pending");
  };

  const openCheckout = async (order: PublicOrder) => {
    if (!order.checkout) return;
    paymentHandled.current = false;
    setFailureReason(null);
    setFlowState("awaiting_payment");
    try {
      await openRazorpayCheckout({
        ...order.checkout,
        orderNumber: order.orderNumber,
        description: `${(order.credits * order.quantity).toLocaleString("en-IN")} diamonds · IMO ID ${order.imoProfileId}`,
        phone: null,
        onSuccess: (response) => {
          paymentHandled.current = true;
          void confirmPayment(order.orderNumber, response);
        },
        onDismiss: () => { if (!paymentHandled.current) setFlowState("failed"); },
        onFailed: setFailureReason,
      });
    } catch {
      setFlowState("idle");
      setSubmitError("Could not open the payment window. Check your internet connection and try again.");
    }
  };

  const runPaymentFlow = async () => {
    if (submitting.current) return;
    setSubmitError("");
    if (!validate() || !selectedPackage) return;

    submitting.current = true;
    setFlowState("creating_order");

    let createRes: Response;
    try {
      createRes = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imoProfileId: profileId.trim(),
          packageId: selectedPackage.id,
          quantity,
        }),
      });
    } catch {
      setFlowState("idle");
      submitting.current = false;
      setSubmitError("Network error. Please check your connection and try again.");
      return;
    }

    const body = await createRes.json().catch(() => ({}));
    submitting.current = false;
    if (!createRes.ok || !body.order) {
      setFlowState("idle");
      setSubmitError(body.error ?? "Could not start payment. Please try again.");
      return;
    }
    const order = body.order as PublicOrder;
    // Keep the order in the URL so a reload or coming back from a UPI app resumes it.
    setOrderInUrl(order.orderNumber);
    applyOrder(order);
    if (order.checkout) await openCheckout(order);
    else setFlowState(upiFlowState(order));
  };

  const submitUtr = async (utr: string): Promise<string | null> => {
    if (!currentOrder) return "Order not found.";
    try {
      const res = await fetch("/api/orders/utr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber: currentOrder.id, utr }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.order) return body.error ?? "Could not submit your UTR. Please try again.";
      const api = body.order as PublicOrder;
      applyOrder(api);
      setFlowState(upiFlowState(api));
      return null;
    } catch {
      return "Network error. Please try again.";
    }
  };

  const cancelOrder = async (): Promise<string | null> => {
    if (!currentOrder) return "Order not found.";
    try {
      const res = await fetch("/api/orders/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber: currentOrder.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return body.error ?? "Could not cancel the order. Please try again.";
      setOrderInUrl(null);
      setPayment(null);
      setCurrentOrder(null);
      setFlowState("idle");
      return null;
    } catch {
      return "Network error. Please try again.";
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void runPaymentFlow();
  };

  const closeModal = () => {
    // An unpaid order stays resumable from the banner below; anything else is finished.
    if (!payment && !unpaidOrder) setOrderInUrl(null);
    setFlowState("idle");
  };

  const retryPayment = () => {
    if (unpaidOrder) {
      void openCheckout(unpaidOrder);
    } else {
      setOrderInUrl(null);
      setPayment(null);
      setFlowState("idle");
      void runPaymentFlow();
    }
  };

  const viewTransaction = () => {
    setFlowState("idle");
    if (currentOrder) onViewTransaction(currentOrder);
  };

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="rounded-card bg-surface p-5 shadow-card sm:p-6"
      >
        <div className="mx-auto w-full max-w-[480px]">
          <h1 className="text-[24px] font-bold tracking-tight text-foreground sm:text-[26px]">
            IMO Recharge
          </h1>
          <p className="mt-1 text-sm text-muted">
            Recharge your IMO account quickly and securely.
          </p>

          <div className="mt-6 space-y-5">
            <ProfileIdInput
              value={profileId}
              onChange={(value) => {
                setProfileId(value);
                if (profileIdError) setProfileIdError("");
              }}
              error={profileIdError}
            />

          </div>
        </div>

        <div className="mt-6">
          <RechargePackages
            packages={packages}
            selectedId={selectedPackageId}
            onSelect={(id) => {
              setSelectedPackageId(id);
              if (packageError) setPackageError("");
            }}
            error={packageError}
          />
        </div>

        <div className="mx-auto mt-6 w-full max-w-[480px] space-y-6">
          <QuantitySelector quantity={quantity} onChange={setQuantity} />

          <OrderSummary profileId={profileId} pkg={selectedPackage} quantity={quantity} />

          {payment && flowState === "idle" && (
            <button
              type="button"
              onClick={() => setFlowState(payment.utrSubmitted ? "pending" : "awaiting_payment")}
              className="w-full rounded-input border border-warning/40 bg-warning-soft px-4 py-3 text-left text-sm text-foreground"
            >
              Order {payment.orderNumber} is waiting for payment. <span className="font-semibold text-accent">Resume</span>
            </button>
          )}

          {unpaidOrder && flowState === "idle" && (
            <button
              type="button"
              onClick={() => void openCheckout(unpaidOrder)}
              className="w-full rounded-input border border-warning/40 bg-warning-soft px-4 py-3 text-left text-sm text-foreground"
            >
              Order {unpaidOrder.orderNumber} is waiting for payment. <span className="font-semibold text-accent">Pay now</span>
            </button>
          )}

          {submitError && (
            <p className="text-sm font-medium text-error" role="alert">
              {submitError}
            </p>
          )}

          <PaymentButton flowState={flowState} />
        </div>
      </form>

      <PaymentStatusModal
        flowState={flowState}
        order={currentOrder}
        payment={payment}
        onSubmitUtr={submitUtr}
        onCancelOrder={cancelOrder}
        failureReason={failureReason}
        onDone={closeModal}
        onRetry={retryPayment}
        onViewTransaction={viewTransaction}
      />
    </>
  );
}
