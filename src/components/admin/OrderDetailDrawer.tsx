"use client";

import { useState, type ReactNode } from "react";
import { Loader2, X } from "lucide-react";
import { PaymentStatusBadge, RechargeStatusBadge } from "@/components/recharge/StatusBadge";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import type { OrderRow, AuditLogRow, NotificationRow } from "@/lib/db-types";
import { useAdminData } from "@/lib/use-admin-data";
import { paymentProviderLabel } from "@/lib/payment-provider";

interface OrderDetailDrawerProps {
  orderId: string;
  onClose: () => void;
  onChanged?: () => void;
}

interface DetailResponse {
  order: OrderRow;
  auditLogs: AuditLogRow[];
  notifications: NotificationRow[];
}

const RECHARGE_ACTIONS: Record<string, { action: string; label: string; tone: string }[]> = {
  waiting: [{ action: "start", label: "Start Recharge", tone: "bg-accent hover:bg-accent-dark" }],
  processing: [
    { action: "complete", label: "Mark Completed", tone: "bg-success hover:bg-success" },
    { action: "fail", label: "Mark Failed", tone: "bg-error hover:bg-error" },
  ],
  failed: [{ action: "reopen", label: "Resume Recharge", tone: "bg-accent hover:bg-accent-dark" }],
  completed: [],
};

export function OrderDetailDrawer({ orderId, onClose, onChanged }: OrderDetailDrawerProps) {
  const { data, loading, error, refresh: load } = useAdminData<DetailResponse>(`/api/admin/orders/${orderId}`);
  const [draftNotes, setDraftNotes] = useState<string | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  const saveNotes = async () => {
    setSavingNotes(true);
    setActionError("");
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminNotes: draftNotes ?? data?.order.admin_notes ?? "" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not save note.");
      await load();
      setDraftNotes(null);
      onChanged?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not save note.");
    } finally { setSavingNotes(false); }
  };

  const runAction = async (action: string) => {
    setActionPending(action);
    setActionError("");
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/recharge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Action failed.");
      await load(); onChanged?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Action failed.");
    } finally { setActionPending(null); }
  };

  const order = data?.order;
  const actions = order?.payment_status === "paid" ? RECHARGE_ACTIONS[order.recharge_status] ?? [] : [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-foreground/40" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="order-details-heading" className="relative flex h-full w-full max-w-[460px] flex-col bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="order-details-heading" className="text-base font-semibold text-foreground">Order Details</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-background"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {(error || actionError) && <p role="alert" className="mb-3 text-sm text-error">{actionError || error}</p>}
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            </div>
          ) : !order ? <p className="text-sm text-muted">Order details are unavailable.</p> : (
            <div className="space-y-6">
              <section className="space-y-2.5 rounded-input border border-border bg-background px-4 py-3.5 text-sm">
                <Row label="Order ID" value={order.order_number} />
                <Row label="IMO ID" value={order.imo_profile_id} />
                <Row label="Credits" value={order.credits.toLocaleString("en-IN")} />
                <Row label="Quantity" value={String(order.quantity)} />
                <Row label="Unit Price" value={formatCurrency(order.unit_price)} />
                <Row label="Total" value={formatCurrency(order.amount)} strong />
                <Row label="Payment Provider" value={paymentProviderLabel(order.payment_provider)} />
                {order.provider_order_id && <Row label="Provider Order ID" value={order.provider_order_id} />}
                <Row label="Payment Status" value={<PaymentStatusBadge status={order.payment_status} />} />
                {order.provider_payment_id && (
                  <Row label="Provider Payment ID" value={order.provider_payment_id} />
                )}
                <Row label="Recharge Status" value={<RechargeStatusBadge status={order.recharge_status} />} />
                <Row label="Created" value={formatDateTime(order.created_at)} />
                {order.paid_at && <Row label="Paid" value={formatDateTime(order.paid_at)} />}
                {order.completed_at && <Row label="Completed" value={formatDateTime(order.completed_at)} />}
              </section>

              {order.payment_provider === "baseupi" && order.payment_status === "pending" && (
                <p className="rounded-input bg-background p-3 text-xs text-muted">Waiting for a signed BaseUPI payment confirmation. Check the Android bridge if payment has reached your UPI account. This order cannot enter the recharge queue until payment is confirmed.</p>
              )}

              {actions.length > 0 && (
                <section>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                    Recharge Actions
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {actions.map((a) => (
                      <button
                        key={a.action}
                        type="button"
                        disabled={actionPending !== null}
                        onClick={() => runAction(a.action)}
                        className="rounded-button bg-accent px-3.5 py-2 text-xs font-semibold text-white transition-colors enabled:hover:bg-accent-dark disabled:opacity-60"
                      >
                        {actionPending === a.action ? "Working..." : a.label}
                      </button>
                    ))}
                  </div>
                </section>
              )}

              <section>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Admin Notes
                </p>
                <textarea
                  aria-label="Admin notes"
                  value={draftNotes ?? order.admin_notes ?? ""}
                  onChange={(e) => setDraftNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-input border border-border-strong bg-surface px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
                  placeholder="Internal note for this order..."
                />
                <button
                  type="button"
                  onClick={saveNotes}
                  disabled={savingNotes}
                  className="mt-2 rounded-button border border-border-strong px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
                >
                  {savingNotes ? "Saving..." : "Save Note"}
                </button>
              </section>

              <section>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Notifications
                </p>
                {data.notifications.length === 0 ? (
                  <p className="text-xs text-muted">No notifications sent for this order yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {data.notifications.map((n) => (
                      <li key={n.id} className="flex items-center justify-between text-xs">
                        <span className="text-foreground">
                          {n.channel} · {n.event}
                        </span>
                        <span
                          className={
                            n.status === "sent"
                              ? "text-success"
                              : n.status === "failed"
                                ? "text-error"
                                : "text-warning"
                          }
                        >
                          {n.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Audit History
                </p>
                {data.auditLogs.length === 0 ? (
                  <p className="text-xs text-muted">No audit events yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.auditLogs.map((log) => (
                      <li key={log.id} className="text-xs">
                        <span className="font-medium text-foreground">{log.action}</span>
                        <span className="text-muted"> — {formatDateTime(log.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className={strong ? "break-all text-right text-base font-bold text-foreground" : "break-all text-right font-medium text-foreground"}>
        {value}
      </span>
    </div>
  );
}
