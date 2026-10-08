"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ClipboardList,
  IndianRupee,
  CheckCircle2,
  Clock,
  Loader2,
  PackageCheck,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { StatCard } from "@/components/admin/StatCard";
import { PaymentStatusBadge, RechargeStatusBadge } from "@/components/recharge/StatusBadge";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import type { PaymentStatus, RechargeStatus } from "@/lib/types";

interface RecentOrder {
  order_number: string;
  imo_profile_id: string;
  credits: number;
  quantity: number;
  amount: number;
  payment_status: PaymentStatus;
  recharge_status: RechargeStatus;
  created_at: string;
}

interface DashboardData {
  todayOrders: number;
  todayRevenue: number;
  paidOrders: number;
  pendingRecharge: number;
  processingRecharge: number;
  completedRecharge: number;
  failedRecharge: number;
  failedPayments: number;
  recentOrders: RecentOrder[];
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/dashboard")
      .then((res) => res.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-error">Failed to load dashboard data.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted">Operational snapshot of today&apos;s recharge activity.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Today's Orders" value={data.todayOrders} icon={ClipboardList} />
        <StatCard
          label="Today's Revenue"
          value={formatCurrency(data.todayRevenue)}
          icon={IndianRupee}
          tone="success"
        />
        <StatCard label="Paid Orders" value={data.paidOrders} icon={CheckCircle2} tone="success" />
        <StatCard label="Failed Payments" value={data.failedPayments} icon={XCircle} tone="error" />
        <StatCard label="Pending Recharge" value={data.pendingRecharge} icon={Clock} tone="warning" />
        <StatCard
          label="Processing Recharge"
          value={data.processingRecharge}
          icon={Loader2}
          tone="warning"
        />
        <StatCard
          label="Completed Recharge"
          value={data.completedRecharge}
          icon={PackageCheck}
          tone="success"
        />
        <StatCard label="Failed Recharge" value={data.failedRecharge} icon={AlertTriangle} tone="error" />
      </div>

      <div className="rounded-card bg-surface p-4 shadow-card sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Recent Orders</h2>
          <Link href="/admin/orders" className="text-xs font-medium text-accent hover:underline">
            View all
          </Link>
        </div>

        {data.recentOrders.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No orders yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="py-2 pr-4 font-medium">Order ID</th>
                  <th className="py-2 pr-4 font-medium">Profile ID</th>
                  <th className="py-2 pr-4 font-medium">Recharge</th>
                  <th className="py-2 pr-4 font-medium">Amount</th>
                  <th className="py-2 pr-4 font-medium">Payment</th>
                  <th className="py-2 pr-4 font-medium">Recharge</th>
                  <th className="py-2 pr-4 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.recentOrders.map((order) => (
                  <tr key={order.order_number} className="border-b border-border last:border-0">
                    <td className="py-2.5 pr-4 font-medium text-foreground">{order.order_number}</td>
                    <td className="py-2.5 pr-4 text-foreground">{order.imo_profile_id}</td>
                    <td className="py-2.5 pr-4 text-foreground">
                      {order.credits.toLocaleString("en-IN")} × {order.quantity}
                    </td>
                    <td className="py-2.5 pr-4 text-foreground">{formatCurrency(order.amount)}</td>
                    <td className="py-2.5 pr-4">
                      <PaymentStatusBadge status={order.payment_status} />
                    </td>
                    <td className="py-2.5 pr-4">
                      <RechargeStatusBadge status={order.recharge_status} />
                    </td>
                    <td className="py-2.5 pr-4 text-muted">{formatDateTime(order.created_at)}</td>
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
