"use client";

import { useState, type FormEvent } from "react";
import { PaymentFlowState, RechargeOrder, RechargePackage } from "@/lib/types";
import { isValidPhone, isValidProfileId, sleep } from "@/lib/utils";
import { openCashfreeCheckout } from "@/lib/cashfree-client";
import { ProfileIdInput } from "./ProfileIdInput";
import { PhoneInput } from "./PhoneInput";
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

async function pollOrderStatus(orderNumber: string, attempts = 4): Promise<VerifyOrderResponse> {
  let last: VerifyOrderResponse | null = null;
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(`/api/orders/verify?orderNumber=${encodeURIComponent(orderNumber)}`);
    const body = await res.json();
    last = body.order as VerifyOrderResponse;
    if (last.paymentStatus !== "pending") return last;
    await sleep(1500);
  }
  return last as VerifyOrderResponse;
}

export function RechargeForm({ packages, onViewTransaction }: RechargeFormProps) {
  const [profileId, setProfileId] = useState("");
  const [profileIdError, setProfileIdError] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [packageError, setPackageError] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [flowState, setFlowState] = useState<PaymentFlowState>("idle");
  const [currentOrder, setCurrentOrder] = useState<RechargeOrder | null>(null);
  const [submitError, setSubmitError] = useState("");

  const selectedPackage = packages.find((p) => p.id === selectedPackageId) ?? null;

  const validate = () => {
    let valid = true;

    if (!profileId.trim()) {
      setProfileIdError("Please enter your IMO Profile ID.");
      valid = false;
    } else if (!isValidProfileId(profileId)) {
      setProfileIdError("Enter a valid Profile ID.");
      valid = false;
    } else {
      setProfileIdError("");
    }

    if (!phone.trim()) {
      setPhoneError("Please enter your mobile number.");
      valid = false;
    } else if (!isValidPhone(phone)) {
      setPhoneError("Enter a valid 10-digit mobile number.");
      valid = false;
    } else {
      setPhoneError("");
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
    setSubmitError("");
    if (!validate() || !selectedPackage) return;

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
          customerPhone: phone.trim(),
        }),
      });
    } catch {
      setFlowState("idle");
      setSubmitError("Network error. Please check your connection and try again.");
      return;
    }

    if (!createRes.ok) {
      const body = await createRes.json().catch(() => ({}));
      setFlowState("idle");
      setSubmitError(body.error ?? "Could not start payment. Please try again.");
      return;
    }

    const { orderNumber, paymentSessionId, cashfreeEnv } = await createRes.json();

    setFlowState("awaiting_payment");
    try {
      await openCashfreeCheckout(paymentSessionId, cashfreeEnv);
    } catch {
      // fall through to verification regardless — Cashfree may still have processed the payment
    }

    setFlowState("verifying");
    const result = await pollOrderStatus(orderNumber);
    const order = toRechargeOrder(result);

    setCurrentOrder(order);
    setFlowState(
      order.paymentStatus === "paid"
        ? "success"
        : order.paymentStatus === "failed"
          ? "failed"
          : "pending"
    );
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

            <PhoneInput
              value={phone}
              onChange={(value) => {
                setPhone(value);
                if (phoneError) setPhoneError("");
              }}
              error={phoneError}
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
