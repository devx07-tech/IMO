"use client";

import { useState } from "react";
import { Check, Gem, RefreshCw } from "lucide-react";
import { RechargePackage } from "@/lib/types";
import { cn, formatCurrency } from "@/lib/utils";

interface RechargePackagesProps {
  packages: RechargePackage[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  error?: string;
}

export function RechargePackages({
  packages,
  selectedId,
  onSelect,
  error,
}: RechargePackagesProps) {
  const [refreshing, setRefreshing] = useState(false);

  const activePackages = packages
    .filter((pkg) => pkg.active)
    .sort((a, b) => a.order - b.order);

  const handleRefresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    window.setTimeout(() => setRefreshing(false), 700);
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Select Recharge</p>
        <button
          type="button"
          onClick={handleRefresh}
          aria-label="Refresh package prices"
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-accent-soft hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", refreshing && "animate-spin")}
            aria-hidden="true"
          />
        </button>
      </div>

      <div
        role="radiogroup"
        aria-label="Select recharge package"
        aria-describedby={error ? "package-error" : undefined}
        className="grid grid-cols-3 gap-x-2.5 gap-y-4 sm:grid-cols-4 lg:grid-cols-6"
      >
        {activePackages.map((pkg) => {
          const selected = pkg.id === selectedId;
          return (
            <button
              key={pkg.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSelect(pkg.id)}
              className={cn(
                "group relative flex flex-col items-center justify-center gap-1 rounded-input border bg-surface px-2 py-3.5 text-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                selected
                  ? "border-accent bg-accent-soft shadow-[0_0_0_1px_var(--accent)]"
                  : "border-border-strong hover:border-accent/50 hover:bg-accent-soft/40"
              )}
            >
              {selected && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                  Selected
                </span>
              )}

              {selected && (
                <Check
                  className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-accent"
                  aria-hidden="true"
                />
              )}

              <Gem
                className={cn(
                  "h-4 w-4 transition-colors",
                  selected ? "text-accent" : "text-muted group-hover:text-accent/70"
                )}
                aria-hidden="true"
              />
              <span className="text-[14px] font-semibold leading-tight text-foreground sm:text-[15px]">
                {pkg.credits.toLocaleString("en-IN")}
              </span>
              <span className="text-[13px] font-medium text-accent">
                {formatCurrency(pkg.price)}
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <p id="package-error" className="mt-1.5 text-xs font-medium text-error">
          {error}
        </p>
      )}
    </div>
  );
}
