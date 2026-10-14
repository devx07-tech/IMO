"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, Loader2, Smartphone, XCircle } from "lucide-react";
import { useAdminData } from "@/lib/use-admin-data";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import type { OrderRow, UpiPaymentEventRow } from "@/lib/db-types";
import { StatCard } from "@/components/admin/StatCard";
import { OrderDetailDrawer } from "@/components/admin/OrderDetailDrawer";
import { PaymentStatusBadge, RechargeStatusBadge } from "@/components/recharge/StatusBadge";

type PaymentOrder = Pick<OrderRow, "id" | "order_number" | "imo_profile_id" | "amount" | "payment_status" | "recharge_status" |
  "provider_payment_id" | "customer_utr" | "customer_utr_at" | "expires_at" | "paid_at" | "created_at">;

interface PaymentOverview {
  configuration: {
    upiId: string; payeeName: string; bridgeSecretConfigured: boolean; bridgeLastSeen: string | null;
    telegramConfigured: boolean; bridgeUrl: string;
  };
  pending: number; paid: number; failed: number;
  reviewOrders: PaymentOrder[];
  unmatchedEvents: Pick<UpiPaymentEventRow, "id" | "received_at" | "amount" | "utr" | "payer" | "raw_text" | "status">[];
  recentOrders: PaymentOrder[];
}

// The bridge phone sends a heartbeat every 15 minutes; allow some slack.
const BRIDGE_ONLINE_MS = 20 * 60_000;

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Action failed.");
  return data;
}

export default function AdminPaymentsPage() {
  const { data, loading, error, refresh } = useAdminData<PaymentOverview>("/api/admin/payments");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [attachTo, setAttachTo] = useState<Record<string, string>>({});
  const config = data?.configuration;
  // Date.now() is read during render on purpose: the page refreshes every 15 seconds.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const bridgeOnline = Boolean(config?.bridgeLastSeen && now - new Date(config.bridgeLastSeen).getTime() < BRIDGE_ONLINE_MS);

  const run = async (key: string, url: string, body: unknown) => {
    setBusy(key); setActionError("");
    try { await postJson(url, body); setConfirming(null); await refresh(); }
    catch (err) { setActionError(err instanceof Error ? err.message : "Action failed."); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div><h1 className="text-xl font-bold text-foreground">Payments</h1>
          <p className="text-sm text-muted">Direct UPI payments to {config?.upiId ?? "your UPI ID"}. Updates every 15 seconds.</p></div>
        <button type="button" onClick={() => void refresh()} className="rounded-button border border-border-strong px-3 py-2 text-xs font-semibold text-foreground">Refresh</button>
      </div>
      {(error || actionError) && <p role="alert" className="text-sm text-error">{actionError || error}</p>}
      {loading && !data && <Loader2 className="h-5 w-5 animate-spin text-muted" aria-label="Loading payments" />}
      {data && config && <>
        <section className="rounded-card bg-surface p-5 shadow-card">
          <div className="flex items-center gap-2">
            <Smartphone className={bridgeOnline ? "h-5 w-5 text-success" : "h-5 w-5 text-error"} aria-hidden="true" />
            <h2 className="text-base font-semibold text-foreground">Automatic confirmation</h2>
          </div>
          <p className="mt-1 text-sm text-muted">{!config.bridgeSecretConfigured
            ? "UPI_BRIDGE_SECRET is not set on the server, so payments can't be confirmed automatically. Customers can still pay and submit their UTR for your review."
            : bridgeOnline
              ? "The payment phone is online. Payments are matched to orders by their exact amount and confirmed automatically."
              : "The payment phone hasn't checked in for over 20 minutes. Check that it is on, connected and the forwarding app is running. Until then, approve payments from the review list."}</p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <Detail label="Receiving UPI ID" value={config.upiId} />
            <Detail label="Payee name shown to customers" value={config.payeeName} />
            <Detail label="Payment phone last seen" value={config.bridgeLastSeen ? formatDateTime(config.bridgeLastSeen) : "Never"} />
            <Detail label="Bridge secret" value={config.bridgeSecretConfigured ? "Configured" : "Missing"} />
            <Detail label="Telegram alerts" value={config.telegramConfigured ? "Configured" : "Missing credentials"} />
            <div className="sm:col-span-2"><Detail label="Payment phone forwards notifications to" value={config.bridgeUrl} /></div>
          </dl>
          <p className="mt-3 text-xs text-muted">Setup steps for the payment phone are in the project README under &ldquo;Payment phone (automatic confirmation)&rdquo;.</p>
        </section>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Waiting for payment" value={data.pending} icon={Clock} tone="warning" />
          <StatCard label="Needs review" value={data.reviewOrders.length} icon={AlertTriangle} tone="warning" />
          <StatCard label="Unmatched payments" value={data.unmatchedEvents.length} icon={XCircle} tone="error" />
          <StatCard label="Paid UPI orders" value={data.paid} icon={CheckCircle2} tone="success" />
        </div>

        <section className="rounded-card bg-surface p-5 shadow-card">
          <h2 className="text-base font-semibold text-foreground">Needs review</h2>
          <p className="mt-1 text-xs text-muted">The customer submitted a UTR but no payment notification confirmed it. Open Paytm for Business, find this UTR and exact amount, then approve. Never approve on the UTR alone.</p>
          {data.reviewOrders.length === 0 ? <p className="mt-3 text-sm text-muted">Nothing to review.</p> :
            <ul className="mt-3 divide-y divide-border">{data.reviewOrders.map((order) => (
              <li key={order.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm">
                  <button type="button" onClick={() => setOrderId(order.id)} className="font-semibold text-accent hover:underline">{order.order_number}</button>
                  <span className="text-muted"> · IMO {order.imo_profile_id}</span>
                  <p className="mt-0.5 text-foreground">Expected <strong>₹{Number(order.amount).toFixed(2)}</strong> · UTR <strong className="font-mono">{order.customer_utr}</strong></p>
                  <p className="text-xs text-muted">Submitted {order.customer_utr_at ? formatDateTime(order.customer_utr_at) : "-"}{order.payment_status === "failed" ? " · after the order expired" : ""}</p>
                </div>
                <div className="flex gap-2">
                  {confirming === order.id ? (
                    <button type="button" disabled={busy !== null} onClick={() => void run(order.id, `/api/admin/orders/${order.id}/payment`, { action: "approve" })}
                      className="rounded-button bg-success px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">
                      {busy === order.id ? "Approving..." : `I received ₹${Number(order.amount).toFixed(2)} — approve`}
                    </button>
                  ) : (
                    <button type="button" onClick={() => setConfirming(order.id)} className="rounded-button bg-accent px-3 py-2 text-xs font-semibold text-white">Approve</button>
                  )}
                  <button type="button" disabled={busy !== null} onClick={() => void run(`${order.id}:reject`, `/api/admin/orders/${order.id}/payment`, { action: "reject" })}
                    className="rounded-button border border-border-strong px-3 py-2 text-xs font-semibold text-error disabled:opacity-60">
                    {busy === `${order.id}:reject` ? "Rejecting..." : "Reject"}
                  </button>
                </div>
              </li>))}</ul>}
        </section>

        <section className="rounded-card bg-surface p-5 shadow-card">
          <h2 className="text-base font-semibold text-foreground">Unmatched payments</h2>
          <p className="mt-1 text-xs text-muted">Money that reached your UPI ID but matched no open order, usually a late or wrong-amount payment. Attach it to the right order or dismiss it.</p>
          {data.unmatchedEvents.length === 0 ? <p className="mt-3 text-sm text-muted">No unmatched payments.</p> :
            <ul className="mt-3 divide-y divide-border">{data.unmatchedEvents.map((event) => (
              <li key={event.id} className="flex flex-col gap-3 py-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 text-sm">
                  <p className="text-foreground"><strong>₹{Number(event.amount ?? 0).toFixed(2)}</strong>{event.payer ? ` from ${event.payer}` : ""} · UTR {event.utr ?? "not in message"}</p>
                  <p className="text-xs text-muted">{formatDateTime(event.received_at)}</p>
                  <p className="mt-1 truncate text-xs text-muted" title={event.raw_text}>{event.raw_text}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <input aria-label="Order ID to attach" placeholder="IMO-..." value={attachTo[event.id] ?? ""}
                    onChange={(e) => setAttachTo((prev) => ({ ...prev, [event.id]: e.target.value }))}
                    className="w-36 rounded-input border border-border-strong bg-surface px-2 py-1.5 text-xs text-foreground" />
                  <button type="button" disabled={busy !== null || !attachTo[event.id]?.trim()}
                    onClick={() => void run(event.id, `/api/admin/payments/events/${event.id}`, { action: "attach", orderNumber: attachTo[event.id] })}
                    className="rounded-button bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">{busy === event.id ? "Attaching..." : "Attach"}</button>
                  <button type="button" disabled={busy !== null}
                    onClick={() => void run(`${event.id}:dismiss`, `/api/admin/payments/events/${event.id}`, { action: "dismiss" })}
                    className="rounded-button border border-border-strong px-3 py-1.5 text-xs font-semibold text-muted disabled:opacity-60">Dismiss</button>
                </div>
              </li>))}</ul>}
        </section>

        <section className="rounded-card bg-surface p-5 shadow-card">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold text-foreground">Recent UPI orders</h2>
            <Link href="/admin/orders" className="text-xs font-medium text-accent hover:underline">All orders</Link></div>
          {data.recentOrders.length === 0 ? <p className="text-sm text-muted">No UPI orders yet.</p> :
            <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm">
              <thead><tr className="border-b border-border text-left text-xs text-muted">
                {["Order", "IMO ID", "Amount", "Payment", "UTR", "Recharge", "Paid at"].map((label) => <th key={label} className="px-3 py-2 font-medium">{label}</th>)}
              </tr></thead><tbody>{data.recentOrders.map((order) => <tr key={order.id} className="border-b border-border last:border-0">
                <td className="px-3 py-3"><button type="button" onClick={() => setOrderId(order.id)} className="font-semibold text-accent hover:underline">{order.order_number}</button></td>
                <td className="px-3 py-3">{order.imo_profile_id}</td><td className="px-3 py-3">{formatCurrency(Number(order.amount))}</td>
                <td className="px-3 py-3"><PaymentStatusBadge status={order.payment_status} /></td>
                <td className="px-3 py-3 font-mono text-xs">{order.provider_payment_id ?? order.customer_utr ?? "-"}</td>
                <td className="px-3 py-3"><RechargeStatusBadge status={order.recharge_status} /></td>
                <td className="px-3 py-3 text-muted">{order.paid_at ? formatDateTime(order.paid_at) : order.payment_status === "pending" ? "Awaiting payment" : "-"}</td>
              </tr>)}</tbody>
            </table></div>}
          <p className="mt-4 text-xs text-muted">Confirmed payments enter the recharge queue. Complete the IMO recharge before marking the order completed.</p>
        </section>
      </>}
      {orderId && <OrderDetailDrawer orderId={orderId} onClose={() => setOrderId(null)} onChanged={refresh} />}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 break-all font-medium text-foreground">{value}</dd></div>;
}
