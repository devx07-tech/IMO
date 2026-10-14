"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { useAdminData } from "@/lib/use-admin-data";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import type { OrderRow } from "@/lib/db-types";
import { StatCard } from "@/components/admin/StatCard";
import { OrderDetailDrawer } from "@/components/admin/OrderDetailDrawer";
import { CustomerWhatsAppButton } from "@/components/admin/CustomerWhatsAppButton";
import { PaymentStatusBadge, RechargeStatusBadge } from "@/components/recharge/StatusBadge";

type PaymentOrder = Pick<OrderRow, "id" | "order_number" | "imo_profile_id" | "credits" | "quantity" | "amount" | "customer_phone" |
  "payment_status" | "recharge_status" | "provider_order_id" | "provider_payment_id" | "paid_at" | "created_at">;

interface PaymentOverview {
  configuration: {
    keysConfigured: boolean; mode: "test" | "live" | "unconfigured"; webhookSecretConfigured: boolean;
    telegramConfigured: boolean; webhookUrl: string;
  };
  pending: number; paid: number; failed: number; lastPaidAt: string | null;
  recentOrders: PaymentOrder[];
}

const MODE_LABEL = { live: "Live (real payments)", test: "Test mode (no real money)", unconfigured: "Not configured" } as const;

export default function AdminPaymentsPage() {
  const { data, loading, error, refresh } = useAdminData<PaymentOverview>("/api/admin/payments");
  const [orderId, setOrderId] = useState<string | null>(null);
  const config = data?.configuration;
  const ready = config?.keysConfigured && config.webhookSecretConfigured;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div><h1 className="text-xl font-bold text-foreground">Payments</h1>
          <p className="text-sm text-muted">Razorpay payments. Updates every 15 seconds.</p></div>
        <button type="button" onClick={() => void refresh()} className="rounded-button border border-border-strong px-3 py-2 text-xs font-semibold text-foreground">Refresh</button>
      </div>
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      {loading && !data && <Loader2 className="h-5 w-5 animate-spin text-muted" aria-label="Loading payments" />}
      {data && config && <>
        <section className="rounded-card bg-surface p-5 shadow-card">
          <h2 className="text-base font-semibold text-foreground">Razorpay</h2>
          <p className="mt-1 text-sm text-muted">{!config.keysConfigured
            ? "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are not set on the server, so checkout is switched off."
            : !config.webhookSecretConfigured
              ? "Checkout works, but RAZORPAY_WEBHOOK_SECRET is missing. Add the webhook below so payments are confirmed even if the customer closes the page."
              : "Checkout and webhook are configured."}</p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <Detail label="Mode" value={MODE_LABEL[config.mode]} />
            <Detail label="API keys" value={config.keysConfigured ? "Configured" : "Missing"} />
            <Detail label="Webhook secret" value={config.webhookSecretConfigured ? "Configured" : "Missing"} />
            <Detail label="Telegram alerts" value={config.telegramConfigured ? "Configured" : "Missing credentials"} />
            <Detail label="Last paid order" value={data.lastPaidAt ? formatDateTime(data.lastPaidAt) : "None yet"} />
            <div className="sm:col-span-2"><Detail label="Webhook URL (Razorpay → Settings → Webhooks; events payment.captured and order.paid)" value={config.webhookUrl} /></div>
          </dl>
          {!ready && <p className="mt-3 text-xs text-muted">Keys are managed in the hosting environment (Vercel). See the README section &ldquo;Razorpay setup&rdquo;.</p>}
          <a href="https://dashboard.razorpay.com/app/payments" target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm font-medium text-accent hover:underline">Open Razorpay dashboard</a>
        </section>

        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Awaiting payment" value={data.pending} icon={Clock} tone="warning" />
          <StatCard label="Paid orders" value={data.paid} icon={CheckCircle2} tone="success" />
          <StatCard label="Failed to start" value={data.failed} icon={XCircle} tone="error" />
        </div>

        <section className="rounded-card bg-surface p-5 shadow-card">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold text-foreground">Recent orders</h2>
            <Link href="/admin/orders" className="text-xs font-medium text-accent hover:underline">All orders</Link></div>
          {data.recentOrders.length === 0 ? <p className="text-sm text-muted">No Razorpay orders yet.</p> :
            <div className="overflow-x-auto"><table className="w-full min-w-[860px] text-sm">
              <thead><tr className="border-b border-border text-left text-xs text-muted">
                {["Order", "IMO ID", "Diamonds", "Amount", "Payment", "Razorpay payment", "Recharge", "Customer"].map((label) => <th key={label} className="px-3 py-2 font-medium">{label}</th>)}
              </tr></thead><tbody>{data.recentOrders.map((order) => <tr key={order.id} className="border-b border-border last:border-0">
                <td className="px-3 py-3"><button type="button" onClick={() => setOrderId(order.id)} className="font-semibold text-accent hover:underline">{order.order_number}</button>
                  <p className="text-xs text-muted">{formatDateTime(order.created_at)}</p></td>
                <td className="px-3 py-3">{order.imo_profile_id}</td>
                <td className="px-3 py-3">{(order.credits * order.quantity).toLocaleString("en-IN")}</td>
                <td className="px-3 py-3">{formatCurrency(Number(order.amount))}</td>
                <td className="px-3 py-3"><PaymentStatusBadge status={order.payment_status} /></td>
                <td className="px-3 py-3 font-mono text-xs">{order.provider_payment_id ?? "-"}</td>
                <td className="px-3 py-3"><RechargeStatusBadge status={order.recharge_status} /></td>
                <td className="px-3 py-3"><CustomerWhatsAppButton order={order} compact /></td>
              </tr>)}</tbody>
            </table></div>}
          <p className="mt-4 text-xs text-muted">Paid orders enter the recharge queue. Credit the diamonds in IMO, mark the order completed, then message the customer on WhatsApp.</p>
        </section>
      </>}
      {orderId && <OrderDetailDrawer orderId={orderId} onClose={() => setOrderId(null)} onChanged={refresh} />}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 break-all font-medium text-foreground">{value}</dd></div>;
}
