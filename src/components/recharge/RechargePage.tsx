"use client";

import { useState } from "react";
import { RechargeOrder, RechargePackage } from "@/lib/types";
import { RechargeForm } from "./RechargeForm";
import { SupportCard } from "./SupportCard";
import { TransactionLookup } from "./TransactionLookup";

interface RechargePageProps {
  packages: RechargePackage[];
}

export function RechargePage({ packages }: RechargePageProps) {
  const [highlightOrder, setHighlightOrder] = useState<RechargeOrder | null>(null);
  const [lookupKey, setLookupKey] = useState(0);

  const handleViewTransaction = (order: RechargeOrder) => {
    setHighlightOrder(order);
    setLookupKey((k) => k + 1);
    document
      .getElementById("transaction-history")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="space-y-5">
      <RechargeForm packages={packages} onViewTransaction={handleViewTransaction} />
      <SupportCard />
      <TransactionLookup key={lookupKey} highlightOrder={highlightOrder} />
    </div>
  );
}
