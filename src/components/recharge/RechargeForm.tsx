"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { PaymentFlowState, RechargeOrder, RechargePackage } from "@/lib/types";
import { isValidProfileId, sleep } from "@/lib/utils";
import { normalizeOrderNumber } from "@/lib/validation";
import { ProfileIdInput } from "./ProfileIdInput";
import { RechargePackages } from "./RechargePackages";
import { QuantitySelector } from "./QuantitySelector";
import { OrderSummary } from "./OrderSummary";
import { PaymentButton } from "./PaymentButton";
import { PaymentStatusModal } from "./PaymentStatusModal";

interface RechargeFormProps {
  packages: RechargePackage[];
  onViewTransaction: (order: RechargeOrder) => void;
}

interface VerifyOrderResponse {
  orderNumber: string;
  imoProfileId: string;
  credits: number;
  quantity: number;
  amount: number;
  paymentStatus: "pending" | "paid" | "failed" | "refunded";
  rechargeStatus: "waiting" | "processing" | "completed" | "failed";
  createdAt: string;
}

function toRechargeOrder(api: VerifyOrderResponse): RechargeOrder {
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

async function pollOrderStatus(orderNumber: string, attempts = 10, signal?: AbortSignal): Promise<VerifyOrderResponse> {
  let last: VerifyOrderResponse | null = null;
  for (let i = 0; i < attempts; i++) {
    signal?.throwIfAborted();
    const res = await fetch(`/api/orders/verify?orderNumber=${encodeURIComponent(orderNumber)}`, { cache: "no-store", signal });
    const body = await res.json();
    if (!res.ok || !body.order) throw new Error(body.error ?? "Could not check payment status.");
    last = body.order as VerifyOrderResponse;
    if (last.paymentStatus !== "pending") return last;
    await sleep(1500);
  }
  return last as VerifyOrderResponse;
}

export function RechargeForm({ packages, onViewTransaction }: RechargeFormProps) {
  const [profileId, setProfileId] = useState("");
  const [profileIdError, setProfileIdError] = useState("");
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [packageError, setPackageError] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [flowState, setFlowState] = useState<PaymentFlowState>("idle");
  const [currentOrder, setCurrentOrder] = useState<RechargeOrder | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const submitting = useRef(false);

  useEffect(() => {
    const orderNumber = normalizeOrderNumber(new URLSearchParams(window.location.search).get("order"));
    if (!orderNumber) return;
    const controller = new AbortController();
    async function checkReturnedPayment() {
      submitting.current = true;
      setFlowState("verifying");
      try {
        const result = await pollOrderStatus(orderNumber!, 10, controller.signal);
        if (controller.signal.aborted) return;
        const order = toRechargeOrder(result);
        setCurrentOrder(order);
        setFlowState(order.paymentStatus === "paid" ? "success" : order.paymentStatus === "failed" ? "failed" : "pending");
      } catch {
        if (controller.signal.aborted) return;
        setFlowState("idle");
        setSubmitError(`Could not check payment. Use Order ID ${orderNumber} in Transaction History before paying again.`);
      } finally {
        if (!controller.signal.aborted) submitting.current = false;
      }
    }
    void checkReturnedPayment();
    return () => { controller.abort(); submitting.current = false; };
  }, []);

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
          customerEmail: customerEmail.trim(),
        }),
      });
    } catch {
      setFlowState("idle");
      submitting.current = false;
      setSubmitError("Network error. Please check your connection and try again.");
      return;
    }

    if (!createRes.ok) {
      const body = await createRes.json().catch(() => ({}));
      setFlowState("idle");
      submitting.current = false;
      setSubmitError(body.error ?? "Could not start payment. Please try again.");
      return;
    }

    try {
      const { orderNumber, checkoutUrl } = await createRes.json();
      const url = new URL(checkoutUrl);
      if (url.origin !== "https://baseupi.app" || url.username || url.password || !normalizeOrderNumber(orderNumber)) {
        throw new Error("Invalid checkout response.");
      }
      setFlowState("awaiting_payment");
      // Preserve the order for browser Back as well as the provider redirect.
      const returnUrl = new URL(window.location.href);
      returnUrl.searchParams.set("order", orderNumber);
      window.history.replaceState(null, "", returnUrl);
      window.location.assign(url.href);
    } catch {
      submitting.current = false;
      setFlowState("idle");
      setSubmitError("Could not open checkout. Please try again.");
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void runPaymentFlow();
  };

  const closeModal = () => {
    setFlowState("idle");
  };

  const retryPayment = () => {
    setFlowState("idle");
    void runPaymentFlow();
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
            <div>
              <label htmlFor="customer-email" className="text-sm font-medium text-foreground">Email for payment</label>
              <input
                id="customer-email" type="email" required maxLength={254} autoComplete="email"
                value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)}
                placeholder="you@example.com"
                className="mt-2 w-full rounded-input border border-border-strong bg-surface px-4 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
              <p className="mt-1 text-xs text-muted">Used by BaseUPI for your payment checkout.</p>
            </div>
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
        onDone={closeModal}
        onRetry={retryPayment}
        onViewTransaction={viewTransaction}
      />
    </>
  );
}
