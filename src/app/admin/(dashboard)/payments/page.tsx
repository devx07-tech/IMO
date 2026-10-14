"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, Loader2, Smartphone, XCircle } from "lucide-react";
import { useAdminData } from "@/lib/use-admin-data";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import type { OrderRow, UpiPaymentEventRow } from "@/lib/db-types";
import { paymentProviderLabel } from "@/lib/payment-provider";
import { StatCard } from "@/components/admin/StatCard";
import { OrderDetailDrawer } from "@/components/admin/OrderDetailDrawer";
import { CustomerWhatsAppButton } from "@/components/admin/CustomerWhatsAppButton";
import { PaymentStatusBadge, RechargeStatusBadge } from "@/components/recharge/StatusBadge";

type PaymentOrder = Pick<OrderRow, "id" | "order_number" | "imo_profile_id" | "credits" | "quantity" | "amount" | "customer_phone" |
  "payment_provider" | "payment_status" | "recharge_status" | "provider_payment_id" | "customer_utr" | "customer_utr_at" |
  "expires_at" | "paid_at" | "created_at">;

interface PaymentOverview {
  mode: "dghost" | "upi" | "razorpay";
  telegramConfigured: boolean;
  upi: {
    payeeName: string; merchantId: string; personalId: string; routes: Record<string, "merchant" | "personal">;
    bridgeSecretConfigured: boolean; bridgeLastSeen: string | null; bridgeUrl: string;
  };
  gateway: { tokenConfigured: boolean; webhookUrl: string };
  razorpay: { keysConfigured: boolean; keyMode: "test" | "live" | "unconfigured"; webhookSecretConfigured: boolean; webhookUrl: string };
  pending: number; paid: number; failed: number;
  reviewOrders: PaymentOrder[];
  unmatchedEvents: Pick<UpiPaymentEventRow, "id" | "received_at" | "amount" | "utr" | "payer" | "raw_text" | "status">[];
  recentOrders: PaymentOrder[];
}

// The payment phone sends a heartbeat every 15 minutes; allow some slack.
const BRIDGE_ONLINE_MS = 20 * 60_000;
const MODE_LABEL: Record<PaymentOverview["mode"], string> = {
  dghost: "UPI gateway (pay.dghost.in)", upi: "direct UPI (Kamal's UPI IDs)", razorpay: "Razorpay",
};
const ROUTE_LABEL: Record<string, string> = { qr: "Scanned QR", paytm: "Paytm app", gpay: "Google Pay", phonepe: "PhonePe", other: "Other UPI apps" };

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
  // Date.now() is read during render on purpose: the page refreshes every 15 seconds.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const upi = data?.upi;
  const bridgeOnline = Boolean(upi?.bridgeLastSeen && now - new Date(upi.bridgeLastSeen).getTime() < BRIDGE_ONLINE_MS);

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
          <p className="text-sm text-muted">{data ? `Checkout: ${MODE_LABEL[data.mode]}. ` : ""}Updates every 15 seconds.</p></div>
        <button type="button" onClick={() => void refresh()} className="rounded-button border border-border-strong px-3 py-2 text-xs font-semibold text-foreground">Refresh</button>
      </div>
      {(error || actionError) && <p role="alert" className="text-sm text-error">{actionError || error}</p>}
      {loading && !data && <Loader2 className="h-5 w-5 animate-spin text-muted" aria-label="Loading payments" />}
      {data && upi && <>
        {data.mode === "dghost" ? (
          <section className="rounded-card bg-surface p-5 shadow-card">
            <h2 className="text-base font-semibold text-foreground">UPI gateway (pay.dghost.in)</h2>
            <p className="mt-1 text-sm text-muted">{data.gateway.tokenConfigured
              ? "Customers pay on the gateway's payment page. Each payment is confirmed by asking the gateway for the order's status when the customer returns, and when the gateway's webhook arrives."
              : "DGHOST_USER_TOKEN is not set on the server, so checkout is turned off. Add it in Vercel and redeploy."}</p>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <Detail label="API token" value={data.gateway.tokenConfigured ? "Configured" : "Missing"} />
              <Detail label="Telegram alerts" value={data.telegramConfigured ? "Configured" : "Missing credentials"} />
              <div className="sm:col-span-2"><Detail label="Webhook URL (paste into the gateway dashboard under Developers → Webhook URL)" value={data.gateway.webhookUrl} /></div>
            </dl>
          </section>
        ) : data.mode === "upi" ? (
          <section className="rounded-card bg-surface p-5 shadow-card">
            <div className="flex items-center gap-2">
              <Smartphone className={bridgeOnline ? "h-5 w-5 text-success" : "h-5 w-5 text-error"} aria-hidden="true" />
              <h2 className="text-base font-semibold text-foreground">Direct UPI and automatic confirmation</h2>
            </div>
            <p className="mt-1 text-sm text-muted">{!upi.bridgeSecretConfigured
              ? "UPI_BRIDGE_SECRET is not set on the server, so payments can't be confirmed automatically. Customers can still pay and submit their UTR for your review."
              : bridgeOnline
                ? "The payment phone is online. Payments are matched to orders by their exact amount and confirmed automatically."
                : "The payment phone hasn't checked in for over 20 minutes. Check that it is on, connected and MacroDroid is running. Until then, approve payments from the review list."}</p>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <Detail label="Merchant UPI ID (Paytm for Business)" value={upi.merchantId} />
              <Detail label="Personal UPI ID (ICICI)" value={upi.personalId} />
              <Detail label="Payee name shown to customers" value={upi.payeeName} />
              <Detail label="Payment phone last seen" value={upi.bridgeLastSeen ? formatDateTime(upi.bridgeLastSeen) : "Never"} />
              <Detail label="Bridge secret" value={upi.bridgeSecretConfigured ? "Configured" : "Missing"} />
              <Detail label="Telegram alerts" value={data.telegramConfigured ? "Configured" : "Missing credentials"} />
              <div className="sm:col-span-2"><Detail label="Which ID each option pays to"
                value={Object.entries(upi.routes).map(([route, id]) => `${ROUTE_LABEL[route] ?? route} → ${id}`).join(" · ")} /></div>
              <div className="sm:col-span-2"><Detail label="Payment phone forwards notifications and bank SMS to" value={upi.bridgeUrl} /></div>
            </dl>
            <p className="mt-3 text-xs text-muted">Setup steps for the payment phone are in the README under &ldquo;Payment phone&rdquo;.</p>
          </section>
        ) : (
          <section className="rounded-card bg-surface p-5 shadow-card">
            <h2 className="text-base font-semibold text-foreground">Razorpay</h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <Detail label="Mode" value={data.razorpay.keyMode === "live" ? "Live (real payments)" : data.razorpay.keyMode === "test" ? "Test mode (no real money)" : "Not configured"} />
              <Detail label="Webhook secret" value={data.razorpay.webhookSecretConfigured ? "Configured" : "Missing"} />
              <Detail label="Telegram alerts" value={data.telegramConfigured ? "Configured" : "Missing credentials"} />
              <div className="sm:col-span-2"><Detail label="Webhook URL (events payment.captured and order.paid)" value={data.razorpay.webhookUrl} /></div>
            </dl>
          </section>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Waiting for payment" value={data.pending} icon={Clock} tone="warning" />
          <StatCard label="Needs review" value={data.reviewOrders.length} icon={AlertTriangle} tone="warning" />
          <StatCard label="Unmatched payments" value={data.unmatchedEvents.length} icon={XCircle} tone="error" />
          <StatCard label="Paid orders" value={data.paid} icon={CheckCircle2} tone="success" />
        </div>

        <section className="rounded-card bg-surface p-5 shadow-card">
          <h2 className="text-base font-semibold text-foreground">Needs review</h2>
          <p className="mt-1 text-xs text-muted">The customer submitted a UTR but no notification or bank SMS confirmed it. Find this UTR and exact amount in Paytm for Business or the ICICI account, then approve. Never approve on the UTR alone.</p>
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
          <p className="mt-1 text-xs text-muted">Money that reached a UPI ID but matched no open order, usually a late or wrong-amount payment. Attach it to the right order or dismiss it.</p>
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
          <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold text-foreground">Recent orders</h2>
            <Link href="/admin/orders" className="text-xs font-medium text-accent hover:underline">All orders</Link></div>
          {data.recentOrders.length === 0 ? <p className="text-sm text-muted">No orders yet.</p> :
            <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm">
              <thead><tr className="border-b border-border text-left text-xs text-muted">
                {["Order", "IMO ID", "Diamonds", "Amount", "Method", "Payment", "Reference", "Recharge", "Customer"].map((label) => <th key={label} className="px-3 py-2 font-medium">{label}</th>)}
              </tr></thead><tbody>{data.recentOrders.map((order) => <tr key={order.id} className="border-b border-border last:border-0">
                <td className="px-3 py-3"><button type="button" onClick={() => setOrderId(order.id)} className="font-semibold text-accent hover:underline">{order.order_number}</button>
                  <p className="text-xs text-muted">{formatDateTime(order.created_at)}</p></td>
                <td className="px-3 py-3">{order.imo_profile_id}</td>
                <td className="px-3 py-3">{(order.credits * order.quantity).toLocaleString("en-IN")}</td>
                <td className="px-3 py-3">{formatCurrency(Number(order.amount))}</td>
                <td className="px-3 py-3 text-xs">{paymentProviderLabel(order.payment_provider)}</td>
                <td className="px-3 py-3"><PaymentStatusBadge status={order.payment_status} /></td>
                <td className="px-3 py-3 font-mono text-xs">{order.provider_payment_id ?? order.customer_utr ?? "-"}</td>
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
