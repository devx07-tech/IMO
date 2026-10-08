import { RechargePackage } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

interface OrderSummaryProps {
  profileId: string;
  pkg: RechargePackage | null;
  quantity: number;
}

export function OrderSummary({ profileId, pkg, quantity }: OrderSummaryProps) {
  const total = pkg ? pkg.price * quantity : 0;

  return (
    <div className="rounded-input border border-border bg-background px-4 py-3.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">Profile ID</span>
        <span className="font-medium text-foreground">
          {profileId || "—"}
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between text-sm">
        <span className="text-muted">Recharge</span>
        <span className="font-medium text-foreground">
          {pkg ? `${pkg.credits.toLocaleString("en-IN")} Credits × ${quantity}` : "—"}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <span className="text-sm font-medium text-foreground">Total</span>
        <span className="text-2xl font-bold text-foreground">
          {formatCurrency(total)}
        </span>
      </div>
    </div>
  );
}
