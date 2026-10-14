"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { useAdminData } from "@/lib/use-admin-data";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import type { OrderRow } from "@/lib/db-types";
import { StatCard } from "@/components/admin/StatCard";
import { OrderDetailDrawer } from "@/components/admin/OrderDetailDrawer";
import { PaymentStatusBadge, RechargeStatusBadge } from "@/components/recharge/StatusBadge";

interface PaymentOverview {
  configuration: {
    apiKeyConfigured: boolean; webhookSecretConfigured: boolean; telegramConfigured: boolean;
    expectedReceiver: string; merchantPhone: string; webhookUrl: string;
  };
  pending: number; paid: number; failed: number; lastConfirmedAt: string | null;
  recentOrders: Pick<OrderRow, "id" | "order_number" | "imo_profile_id" | "amount" | "payment_status" | "recharge_status" | "provider_order_id" | "paid_at" | "created_at">[];
}

export default function AdminPaymentsPage() {
  const { data, loading, error, refresh } = useAdminData<PaymentOverview>("/api/admin/payments");
  const [orderId, setOrderId] = useState<string | null>(null);
  const config = data?.configuration;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div><h1 className="text-xl font-bold text-foreground">Payments</h1>
          <p className="text-sm text-muted">BaseUPI setup and payment activity. Updates every 15 seconds.</p></div>
        <button type="button" onClick={() => void refresh()} className="rounded-button border border-border-strong px-3 py-2 text-xs font-semibold text-foreground">Refresh</button>
      </div>
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      {loading && !data && <Loader2 className="h-5 w-5 animate-spin text-muted" aria-label="Loading payments" />}
      {data && config && <>
        <section className="rounded-card bg-surface p-5 shadow-card">
          <h2 className="text-base font-semibold text-foreground">BaseUPI configuration</h2>
          <p className="mt-1 text-sm text-muted">{config.apiKeyConfigured && config.webhookSecretConfigured
            ? "Server keys are configured. Confirm the receiver and Android bridge in BaseUPI before accepting live payments."
            : "Checkout is unavailable until both BaseUPI server keys are configured on this host."}</p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <Detail label="API key" value={config.apiKeyConfigured ? "Configured" : "Missing"} />
            <Detail label="Webhook secret" value={config.webhookSecretConfigured ? "Configured" : "Missing"} />
            <Detail label="Expected UPI receiver" value={config.expectedReceiver} />
            <Detail label="Merchant phone" value={config.merchantPhone} />
            <Detail label="Telegram alerts" value={config.telegramConfigured ? "Configured" : "Missing credentials"} />
            <Detail label="Latest payment confirmation" value={data.lastConfirmedAt ? formatDateTime(data.lastConfirmedAt) : "No confirmed BaseUPI payments yet"} />
            <div className="sm:col-span-2"><Detail label="Register this webhook in BaseUPI" value={config.webhookUrl} /></div>
          </dl>
          <p className="mt-4 text-xs text-muted">Keys are managed in the host environment. This page does not verify Android bridge connectivity or the receiver saved in BaseUPI.</p>
          <a href="https://baseupi.app/docs" target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm font-medium text-accent hover:underline">Open BaseUPI setup instructions</a>
        </section>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Pending BaseUPI payments" value={data.pending} icon={Clock} tone="warning" />
          <StatCard label="Paid BaseUPI orders" value={data.paid} icon={CheckCircle2} tone="success" />
          <StatCard label="Failed BaseUPI payments" value={data.failed} icon={XCircle} tone="error" />
        </div>
        <section className="rounded-card bg-surface p-5 shadow-card">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold text-foreground">Recent BaseUPI orders</h2>
            <Link href="/admin/orders" className="text-xs font-medium text-accent hover:underline">All orders</Link></div>
          {data.recentOrders.length === 0 ? <p className="text-sm text-muted">No BaseUPI orders yet.</p> :
            <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm">
              <thead><tr className="border-b border-border text-left text-xs text-muted">
                {['Order', 'IMO ID', 'Amount', 'Payment', 'Recharge', 'Paid at'].map((label) => <th key={label} className="px-3 py-2 font-medium">{label}</th>)}
              </tr></thead><tbody>{data.recentOrders.map((order) => <tr key={order.id} className="border-b border-border last:border-0">
                <td className="px-3 py-3"><button type="button" onClick={() => setOrderId(order.id)} className="font-semibold text-accent hover:underline">{order.order_number}</button></td>
                <td className="px-3 py-3">{order.imo_profile_id}</td><td className="px-3 py-3">{formatCurrency(order.amount)}</td>
                <td className="px-3 py-3"><PaymentStatusBadge status={order.payment_status} /></td>
                <td className="px-3 py-3"><RechargeStatusBadge status={order.recharge_status} /></td>
                <td className="px-3 py-3 text-muted">{order.paid_at ? formatDateTime(order.paid_at) : "Awaiting confirmation"}</td>
              </tr>)}</tbody>
            </table></div>}
          <p className="mt-4 text-xs text-muted">Confirmed payments enter the recharge queue. Complete the IMO recharge before marking the order completed. A pending payment must be confirmed before recharge actions are available.</p>
        </section>
      </>}
      {orderId && <OrderDetailDrawer orderId={orderId} onClose={() => setOrderId(null)} onChanged={refresh} />}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 break-all font-medium text-foreground">{value}</dd></div>;
}
