"use client";

import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { RechargeOrder } from "@/lib/types";
import { TransactionItem } from "./TransactionItem";

interface TransactionLookupProps {
  highlightOrder: RechargeOrder | null;
}

export function TransactionLookup({ highlightOrder }: TransactionLookupProps) {
  const [profileId, setProfileId] = useState(highlightOrder?.profileId ?? "");
  const [orderId, setOrderId] = useState(highlightOrder?.id ?? "");
  const [result, setResult] = useState<RechargeOrder | "not_found" | null>(highlightOrder);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCheck = async () => {
    if (!profileId.trim() || !orderId.trim()) {
      setError("Enter both your Profile ID and Order ID to check status.");
      setResult(null);
      return;
    }
    setError("");
    setLoading(true);

    try {
      const params = new URLSearchParams({
        profileId: profileId.trim(),
        orderId: orderId.trim(),
      });
      const res = await fetch(`/api/orders/lookup?${params.toString()}`);
      const body = await res.json();

      if (!body.order) {
        setResult("not_found");
        return;
      }

      setResult({
        id: body.order.orderNumber,
        profileId: body.order.imoProfileId,
        packageLabel: `${body.order.credits.toLocaleString("en-IN")} Credits`,
        credits: body.order.credits,
        quantity: body.order.quantity,
        amount: body.order.amount,
        paymentStatus: body.order.paymentStatus,
        rechargeStatus: body.order.rechargeStatus,
        createdAt: body.order.createdAt,
      });
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="transaction-history" className="rounded-card bg-surface p-5 shadow-card sm:p-6">
      <h2 className="text-base font-semibold text-foreground">Transaction History</h2>
      <p className="mt-1 text-sm text-muted">
        Enter your Profile ID and Order ID to check a recharge status.
      </p>

      <div className="mt-4 space-y-3">
        <input
          type="text"
          inputMode="numeric"
          placeholder="IMO Profile ID"
          value={profileId}
          onChange={(e) => setProfileId(e.target.value.replace(/[^\d]/g, ""))}
          className="w-full rounded-input border border-border-strong bg-surface px-4 py-2.5 text-sm text-foreground placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
        <input
          type="text"
          placeholder="Order ID (e.g. IMO-10241)"
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
          className="w-full rounded-input border border-border-strong bg-surface px-4 py-2.5 text-sm text-foreground placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
        />

        {error && <p className="text-xs font-medium text-error">{error}</p>}

        <button
          type="button"
          onClick={handleCheck}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-button border border-border-strong px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Search className="h-4 w-4" aria-hidden="true" />
          )}
          Check Status
        </button>
      </div>

      {result === "not_found" && (
        <p className="mt-4 text-sm text-muted">
          No matching order found for that Profile ID and Order ID.
        </p>
      )}

      {result && result !== "not_found" && (
        <div className="mt-4">
          <TransactionItem order={result} />
        </div>
      )}
    </section>
  );
}
