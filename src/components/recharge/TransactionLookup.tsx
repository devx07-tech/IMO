"use client";

import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { RechargeOrder } from "@/lib/types";
import { TransactionItem } from "./TransactionItem";

interface TransactionLookupProps {
  highlightOrder: RechargeOrder | null;
}

interface HistoryOrder {
  orderNumber: string;
  imoProfileId: string;
  credits: number;
  quantity: number;
  amount: number;
  paymentStatus: RechargeOrder["paymentStatus"];
  rechargeStatus: RechargeOrder["rechargeStatus"];
  createdAt: string;
}

function toRechargeOrder(order: HistoryOrder): RechargeOrder {
  return {
    id: order.orderNumber,
    profileId: order.imoProfileId,
    packageLabel: `${order.credits.toLocaleString("en-IN")} Credits`,
    credits: order.credits,
    quantity: order.quantity,
    amount: order.amount,
    paymentStatus: order.paymentStatus,
    rechargeStatus: order.rechargeStatus,
    createdAt: order.createdAt,
  };
}

export function TransactionLookup({ highlightOrder }: TransactionLookupProps) {
  const [query, setQuery] = useState(highlightOrder?.id ?? "");
  const [results, setResults] = useState<RechargeOrder[] | null>(highlightOrder ? [highlightOrder] : null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const search = async (value: string) => {
    if (!value.trim()) {
      setError("Enter your IMO ID, mobile number or Order ID.");
      setResults(null);
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/orders/lookup?${new URLSearchParams({ q: value.trim() })}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Lookup failed.");
      setResults((body.orders as HistoryOrder[]).map(toRechargeOrder));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Links sent on WhatsApp open the page with ?history=<IMO ID> to show the purchases.
  useEffect(() => {
    const preset = new URLSearchParams(window.location.search).get("history");
    if (!preset || highlightOrder) return;
    async function showPreset(value: string) {
      setQuery(value);
      document.getElementById("transaction-history")?.scrollIntoView({ block: "start" });
      await search(value);
    }
    void showPreset(preset);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on load
  }, []);

  return (
    <section id="transaction-history" className="rounded-card bg-surface p-5 shadow-card sm:p-6">
      <h2 className="text-base font-semibold text-foreground">Transaction History</h2>
      <p className="mt-1 text-sm text-muted">
        Check your purchases and whether the diamonds were credited.
      </p>

      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => { e.preventDefault(); void search(query); }}
      >
        <input
          type="text"
          inputMode="text"
          placeholder="IMO ID, mobile number or Order ID"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-input border border-border-strong bg-surface px-4 py-2.5 text-sm text-foreground placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
        />

        {error && <p className="text-xs font-medium text-error">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-button border border-border-strong px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Search className="h-4 w-4" aria-hidden="true" />
          )}
          Check History
        </button>
      </form>

      {results && results.length === 0 && (
        <p className="mt-4 text-sm text-muted">
          No paid orders found. Check the number, or use the Order ID from your payment.
        </p>
      )}

      {results && results.length > 0 && (
        <div className="mt-4 space-y-3">
          {results.map((order) => <TransactionItem key={order.id} order={order} />)}
        </div>
      )}
    </section>
  );
}
