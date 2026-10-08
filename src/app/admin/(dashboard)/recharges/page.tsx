"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { OrderDetailDrawer } from "@/components/admin/OrderDetailDrawer";

interface QueueOrder {
  id: string;
  order_number: string;
  imo_profile_id: string;
  credits: number;
  quantity: number;
  amount: number;
  created_at: string;
}

const SECTIONS: { key: string; title: string; action?: { action: string; label: string } }[] = [
  { key: "waiting_recharge", title: "Waiting", action: { action: "start", label: "Start" } },
  { key: "processing", title: "Processing", action: { action: "complete", label: "Complete" } },
  { key: "failed_recharge", title: "Failed", action: { action: "reopen", label: "Resume" } },
  { key: "completed", title: "Completed" },
];

export default function RechargeQueuePage() {
  const [data, setData] = useState<Record<string, QueueOrder[]>>({});
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const load = useCallback(() => {
    return Promise.all(
      SECTIONS.map((s) =>
        fetch(`/api/admin/orders?filter=${s.key}&limit=25`)
          .then((res) => res.json())
          .then((body) => [s.key, body.orders ?? []] as const)
      )
    )
      .then((results) => setData(Object.fromEntries(results)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runAction = async (orderId: string, action: string) => {
    setPending(orderId);
    await fetch(`/api/admin/orders/${orderId}/recharge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setPending(null);
    setLoading(true);
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Recharge Queue</h1>
          <p className="text-sm text-muted">Paid orders requiring recharge work.</p>
        </div>
        <Link href="/admin/orders" className="text-xs font-medium text-accent hover:underline">
          All orders
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
          {SECTIONS.map((section) => (
            <div key={section.key} className="rounded-card bg-surface p-4 shadow-card">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">{section.title}</h2>
                <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium text-muted">
                  {data[section.key]?.length ?? 0}
                </span>
              </div>

              {!data[section.key] || data[section.key].length === 0 ? (
                <p className="py-6 text-center text-xs text-muted">Nothing here.</p>
              ) : (
                <ul className="space-y-2.5">
                  {data[section.key].map((order) => (
                    <li key={order.id} className="rounded-input border border-border bg-background p-3">
                      <button
                        type="button"
                        onClick={() => setSelectedOrderId(order.id)}
                        className="text-left"
                      >
                        <p className="text-sm font-semibold text-foreground hover:text-accent">
                          {order.order_number}
                        </p>
                        <p className="text-xs text-muted">IMO: {order.imo_profile_id}</p>
                        <p className="text-xs text-muted">
                          {order.credits.toLocaleString("en-IN")} × {order.quantity} ·{" "}
                          {formatCurrency(order.amount)}
                        </p>
                        <p className="text-[11px] text-muted">{formatDateTime(order.created_at)}</p>
                      </button>

                      {section.action && (
                        <button
                          type="button"
                          disabled={pending === order.id}
                          onClick={() => runAction(order.id, section.action!.action)}
                          className="mt-2 w-full rounded-button bg-accent px-2.5 py-1.5 text-xs font-semibold text-white transition-colors enabled:hover:bg-accent-dark disabled:opacity-60"
                        >
                          {pending === order.id ? "Working..." : section.action.label}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {selectedOrderId && (
        <OrderDetailDrawer
          orderId={selectedOrderId}
          onClose={() => setSelectedOrderId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
