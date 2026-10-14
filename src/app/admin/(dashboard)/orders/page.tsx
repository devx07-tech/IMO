"use client";

import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { PaymentStatusBadge, RechargeStatusBadge } from "@/components/recharge/StatusBadge";
import { formatCurrency, formatDateTime, cn } from "@/lib/utils";
import type { PaymentStatus, RechargeStatus } from "@/lib/types";
import { OrderDetailDrawer } from "@/components/admin/OrderDetailDrawer";
import { useAdminData } from "@/lib/use-admin-data";
import { paymentProviderLabel } from "@/lib/payment-provider";

interface OrderListItem {
  id: string;
  order_number: string;
  imo_profile_id: string;
  credits: number;
  quantity: number;
  amount: number;
  payment_provider: string;
  payment_status: PaymentStatus;
  recharge_status: RechargeStatus;
  created_at: string;
}

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "paid", label: "Paid" },
  { key: "pending_payment", label: "Pending Payment" },
  { key: "failed_payment", label: "Failed Payment" },
  { key: "waiting_recharge", label: "Waiting Recharge" },
  { key: "processing", label: "Processing" },
  { key: "completed", label: "Completed" },
  { key: "failed_recharge", label: "Failed Recharge" },
];

export default function AdminOrdersPage() {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const params = new URLSearchParams({ filter, offset: String(offset), limit: "50" });
  if (search.trim()) params.set("search", search.trim());
  const { data, loading, error, refresh: loadOrders } = useAdminData<{ orders: OrderListItem[]; total: number }>(`/api/admin/orders?${params}`);
  const orders = data?.orders ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Orders</h1>
        <p className="text-sm text-muted">All recharge orders, searchable by Order ID, IMO ID, WhatsApp number, payment ID or UTR.</p>
        <p className="mt-1 text-xs text-muted">Payment updates refresh every 15 seconds.</p>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={() => void loadOrders()} className="text-xs font-semibold text-accent hover:underline">Refresh</button>
      </div>
      {error && <p role="alert" className="text-sm text-error">{error}</p>}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => { setFilter(f.key); setOffset(0); }}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                filter === f.key
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border-strong text-muted hover:border-accent/50"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Order ID, IMO ID, WhatsApp or pay_..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
            className="w-full rounded-input border border-border-strong bg-surface py-2 pl-9 pr-3 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>
      </div>

      <div className="rounded-card bg-surface shadow-card">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        ) : orders.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted">No orders match this filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="px-4 py-3 font-medium">Order ID</th>
                  <th className="px-4 py-3 font-medium">Profile ID</th>
                  <th className="px-4 py-3 font-medium">Recharge</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Provider</th>
                  <th className="px-4 py-3 font-medium">Payment</th>
                  <th className="px-4 py-3 font-medium">Recharge</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-b border-border last:border-0 hover:bg-background/60">
                    <td className="px-4 py-3 font-medium text-foreground">{order.order_number}</td>
                    <td className="px-4 py-3 text-foreground">{order.imo_profile_id}</td>
                    <td className="px-4 py-3 text-foreground">
                      {order.credits.toLocaleString("en-IN")} × {order.quantity}
                    </td>
                    <td className="px-4 py-3 text-foreground">{formatCurrency(order.amount)}</td>
                    <td className="px-4 py-3 text-foreground">{paymentProviderLabel(order.payment_provider)}</td>
                    <td className="px-4 py-3">
                      <PaymentStatusBadge status={order.payment_status} />
                    </td>
                    <td className="px-4 py-3">
                      <RechargeStatusBadge status={order.recharge_status} />
                    </td>
                    <td className="px-4 py-3 text-muted">{formatDateTime(order.created_at)}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setSelectedOrderId(order.id)}
                        className="text-xs font-semibold text-accent hover:underline"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 text-xs text-muted">
        <span>{data?.total ?? 0} matching orders{orders.length > 0 ? ` · Showing ${offset + 1}–${offset + orders.length}` : ""}</span>
        <div className="flex gap-3">
          <button type="button" disabled={offset === 0 || loading} onClick={() => setOffset((value) => Math.max(0, value - 50))} className="font-semibold text-accent disabled:opacity-40">Previous</button>
          <button type="button" disabled={loading || offset + 50 >= (data?.total ?? 0)} onClick={() => setOffset((value) => value + 50)} className="font-semibold text-accent disabled:opacity-40">Next</button>
        </div>
      </div>

      {selectedOrderId && (
        <OrderDetailDrawer
          orderId={selectedOrderId}
          onClose={() => setSelectedOrderId(null)}
          onChanged={loadOrders}
        />
      )}
    </div>
  );
}
