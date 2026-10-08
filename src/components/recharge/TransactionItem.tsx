import { RechargeOrder } from "@/lib/types";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { PaymentStatusBadge, RechargeStatusBadge } from "./StatusBadge";

export function TransactionItem({ order }: { order: RechargeOrder }) {
  return (
    <div className="rounded-input border border-border bg-background px-4 py-3.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">{order.id}</span>
        <span className="text-sm font-semibold text-foreground">
          {formatCurrency(order.amount)}
        </span>
      </div>

      <p className="mt-0.5 text-xs text-muted">
        {order.credits.toLocaleString("en-IN")} Credits × {order.quantity}
      </p>

      <div className="mt-2.5 flex items-center gap-2">
        <PaymentStatusBadge status={order.paymentStatus} />
        <RechargeStatusBadge status={order.rechargeStatus} />
      </div>

      <p className="mt-2.5 text-xs text-muted">{formatDateTime(order.createdAt)}</p>
    </div>
  );
}
