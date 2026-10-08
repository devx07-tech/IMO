"use client";

import { useEffect, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";
import type { NotificationRow } from "@/lib/db-types";

interface NotificationItem extends NotificationRow {
  orders: { order_number: string } | null;
}

const STATUS_CLASSES: Record<string, string> = {
  sent: "bg-success-soft text-success",
  failed: "bg-error-soft text-error",
  pending: "bg-warning-soft text-warning",
};

export default function AdminNotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const load = () => {
    fetch("/api/admin/notifications")
      .then((res) => res.json())
      .then((body) => setNotifications(body.notifications ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const retry = async (id: string) => {
    setRetryingId(id);
    await fetch(`/api/admin/notifications/${id}/retry`, { method: "POST" });
    setRetryingId(null);
    setLoading(true);
    load();
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Notifications</h1>
        <p className="text-sm text-muted">Admin notification delivery log (Telegram, WhatsApp).</p>
      </div>

      <div className="rounded-card bg-surface shadow-card">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        ) : notifications.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted">No notifications yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="px-4 py-3 font-medium">Order</th>
                  <th className="px-4 py-3 font-medium">Event</th>
                  <th className="px-4 py-3 font-medium">Channel</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {notifications.map((n) => (
                  <tr key={n.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {n.orders?.order_number ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-foreground">{n.event}</td>
                    <td className="px-4 py-3 capitalize text-foreground">{n.channel}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-xs font-medium",
                          STATUS_CLASSES[n.status]
                        )}
                      >
                        {n.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted">{formatDateTime(n.created_at)}</td>
                    <td className="px-4 py-3">
                      {n.status === "failed" && (
                        <button
                          type="button"
                          onClick={() => retry(n.id)}
                          disabled={retryingId === n.id}
                          className="flex items-center gap-1 text-xs font-semibold text-accent hover:underline disabled:opacity-60"
                        >
                          <RotateCcw className="h-3 w-3" aria-hidden="true" />
                          {retryingId === n.id ? "Retrying..." : "Retry"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
