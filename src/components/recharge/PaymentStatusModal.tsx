"use client";

import type { ReactNode } from "react";
import { CheckCircle2, Clock, Loader2, ShieldAlert, XCircle } from "lucide-react";
import { PaymentFlowState, RechargeOrder } from "@/lib/types";
import { PaymentStatusBadge, RechargeStatusBadge } from "./StatusBadge";

interface PaymentStatusModalProps {
  flowState: PaymentFlowState;
  order: RechargeOrder | null;
  onDone: () => void;
  onRetry: () => void;
  onViewTransaction: () => void;
}

export function PaymentStatusModal({
  flowState,
  order,
  onDone,
  onRetry,
  onViewTransaction,
}: PaymentStatusModalProps) {
  if (flowState === "idle") return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 px-4 backdrop-blur-sm"
    >
      <div className="max-h-[calc(100dvh-2rem)] w-full max-w-[400px] overflow-y-auto rounded-card bg-surface p-6 shadow-card">
        {flowState === "creating_order" && (
          <LoadingState title="Creating your order" subtitle="Please wait a moment..." />
        )}

        {flowState === "awaiting_payment" && (
          <LoadingState title="Complete your payment" subtitle="Pay in the Razorpay window using UPI, card or net banking." />
        )}

        {flowState === "verifying" && (
          <LoadingState title="Confirming your payment..." subtitle="This won't take long." />
        )}

        {flowState === "success" && order && (
          <div className="text-center">
            <CheckCircle2
              className="mx-auto h-14 w-14 text-success"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <h2 className="mt-4 text-xl font-bold text-foreground">
              Payment Successful
            </h2>
            <p className="mt-1 text-sm text-muted">
              Your recharge request has been received.
            </p>

            <div className="mt-5 space-y-2.5 rounded-input border border-border bg-background px-4 py-3.5 text-left text-sm">
              <Row label="Order ID" value={order.id} />
              <Row label="IMO Profile ID" value={order.profileId} />
              <Row
                label="Recharge Amount"
                value={`${order.credits.toLocaleString("en-IN")} Credits × ${order.quantity}`}
              />
              <Row label="Payment" value={<PaymentStatusBadge status={order.paymentStatus} />} />
              <Row label="Recharge" value={<RechargeStatusBadge status={order.rechargeStatus} />} />
            </div>

            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={onDone}
                className="w-full rounded-button bg-accent px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                Done
              </button>
              <button
                type="button"
                onClick={onViewTransaction}
                className="w-full rounded-button px-4 py-2.5 text-sm font-medium text-accent transition-colors hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                View Transaction
              </button>
            </div>
          </div>
        )}

        {flowState === "pending" && order && (
          <div className="text-center">
            <Clock
              className="mx-auto h-14 w-14 text-warning"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <h2 className="mt-4 text-xl font-bold text-foreground">Confirming Your Payment</h2>
            <p className="mt-1 text-sm text-muted">
              Razorpay is still confirming your payment. Don&apos;t pay again: your recharge starts as
              soon as it&apos;s confirmed. Keep your Order ID to check the status in Transaction History.
            </p>

            <div className="mt-5 space-y-2.5 rounded-input border border-border bg-background px-4 py-3.5 text-left text-sm">
              <Row label="Order ID" value={order.id} />
              <Row label="IMO Profile ID" value={order.profileId} />
              <Row label="Payment" value={<PaymentStatusBadge status={order.paymentStatus} />} />
              <Row label="Recharge" value={<RechargeStatusBadge status={order.rechargeStatus} />} />
            </div>

            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={onDone}
                className="w-full rounded-button bg-accent px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                Done
              </button>
              <button
                type="button"
                onClick={onViewTransaction}
                className="w-full rounded-button px-4 py-2.5 text-sm font-medium text-accent transition-colors hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                View Transaction
              </button>
            </div>
          </div>
        )}

        {flowState === "failed" && (
          <div className="text-center">
            <XCircle
              className="mx-auto h-14 w-14 text-error"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <h2 className="mt-4 text-xl font-bold text-foreground">Payment Not Completed</h2>
            <p className="mt-1 text-sm text-muted">
              Your payment wasn&apos;t completed. If money was deducted, don&apos;t pay again: it&apos;s
              confirmed automatically within a few minutes and shows in Transaction History.
            </p>

            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={onRetry}
                className="w-full rounded-button bg-accent px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={onDone}
                className="w-full rounded-button px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LoadingState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center py-4 text-center">
      <Loader2 className="h-10 w-10 animate-spin text-accent" aria-hidden="true" />
      <h2 className="mt-4 text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted">{subtitle}</p>
      <div className="mt-4 flex items-center gap-1.5 text-xs text-muted">
        <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
        Do not close or refresh this page
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
