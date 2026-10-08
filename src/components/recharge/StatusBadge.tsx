import { cn } from "@/lib/utils";
import { PaymentStatus, RechargeStatus } from "@/lib/types";

const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  pending: "Pending",
  paid: "Paid",
  failed: "Failed",
  refunded: "Refunded",
};

const RECHARGE_LABELS: Record<RechargeStatus, string> = {
  waiting: "Waiting",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
};

const TONE_CLASSES: Record<"success" | "warning" | "error" | "neutral", string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  error: "bg-error-soft text-error",
  neutral: "bg-border/60 text-muted",
};

function paymentTone(status: PaymentStatus) {
  if (status === "paid") return "success";
  if (status === "pending") return "warning";
  if (status === "failed") return "error";
  return "neutral";
}

function rechargeTone(status: RechargeStatus) {
  if (status === "completed") return "success";
  if (status === "processing" || status === "waiting") return "warning";
  if (status === "failed") return "error";
  return "neutral";
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const tone = paymentTone(status);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        TONE_CLASSES[tone]
      )}
    >
      {PAYMENT_LABELS[status]}
    </span>
  );
}

export function RechargeStatusBadge({ status }: { status: RechargeStatus }) {
  const tone = rechargeTone(status);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        TONE_CLASSES[tone]
      )}
    >
      {RECHARGE_LABELS[status]}
    </span>
  );
}
