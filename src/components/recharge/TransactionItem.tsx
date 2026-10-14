import { RechargeOrder } from "@/lib/types";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { PaymentStatusBadge, RechargeStatusBadge } from "./StatusBadge";

const CREDIT_NOTE: Record<RechargeOrder["rechargeStatus"], string> = {
  completed: "Diamonds credited to your IMO account ✅",
  processing: "Crediting your diamonds now",
  waiting: "Payment received. Diamonds will be credited shortly",
  failed: "Recharge issue. Our team will contact you",
};

export function TransactionItem({ order }: { order: RechargeOrder }) {
  const diamonds = order.credits * order.quantity;
  return (
    <div className="rounded-input border border-border bg-background px-4 py-3.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">
          {diamonds.toLocaleString("en-IN")} Diamonds
        </span>
        <span className="text-sm font-semibold text-foreground">
          {formatCurrency(order.amount)}
        </span>
      </div>

      <p className="mt-0.5 text-xs text-muted">
        IMO ID {order.profileId} · {order.credits.toLocaleString("en-IN")} × {order.quantity} · {order.id}
      </p>

      <div className="mt-2.5 flex items-center gap-2">
        <PaymentStatusBadge status={order.paymentStatus} />
        <RechargeStatusBadge status={order.rechargeStatus} />
      </div>

      {order.paymentStatus === "paid" && (
        <p className="mt-2 text-xs font-medium text-foreground">{CREDIT_NOTE[order.rechargeStatus]}</p>
      )}

      <p className="mt-2 text-xs text-muted">{formatDateTime(order.createdAt)}</p>
    </div>
  );
}
