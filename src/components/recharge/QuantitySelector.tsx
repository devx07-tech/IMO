"use client";

import { Minus, Plus } from "lucide-react";

const MIN_QUANTITY = 1;
const MAX_QUANTITY = 10;

interface QuantitySelectorProps {
  quantity: number;
  onChange: (quantity: number) => void;
}

export function QuantitySelector({ quantity, onChange }: QuantitySelectorProps) {
  const decrease = () => onChange(Math.max(MIN_QUANTITY, quantity - 1));
  const increase = () => onChange(Math.min(MAX_QUANTITY, quantity + 1));

  return (
    <div className="flex items-center justify-between">
      <p className="text-sm font-medium text-foreground">Quantity</p>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={decrease}
          disabled={quantity <= MIN_QUANTITY}
          aria-label="Decrease quantity"
          className="flex h-11 w-11 items-center justify-center rounded-input border border-border-strong text-foreground transition-colors enabled:hover:border-accent enabled:hover:text-accent disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <Minus className="h-4 w-4" aria-hidden="true" />
        </button>

        <span
          className="w-8 text-center text-base font-semibold text-foreground"
          aria-live="polite"
        >
          {quantity}
        </span>

        <button
          type="button"
          onClick={increase}
          disabled={quantity >= MAX_QUANTITY}
          aria-label="Increase quantity"
          className="flex h-11 w-11 items-center justify-center rounded-input border border-border-strong text-foreground transition-colors enabled:hover:border-accent enabled:hover:text-accent disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
