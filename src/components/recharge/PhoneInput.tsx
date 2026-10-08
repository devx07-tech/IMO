"use client";

import { cn } from "@/lib/utils";

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

export function PhoneInput({ value, onChange, error }: PhoneInputProps) {
  return (
    <div>
      <label htmlFor="customer-phone" className="mb-1.5 block text-sm font-medium text-foreground">
        Mobile Number
      </label>

      <input
        id="customer-phone"
        name="customerPhone"
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        placeholder="10-digit mobile number"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, "").slice(0, 10))}
        aria-invalid={Boolean(error)}
        aria-describedby="customer-phone-helper customer-phone-error"
        className={cn(
          "w-full rounded-input border bg-surface px-4 py-3 text-base text-foreground placeholder:text-muted/70 transition-colors focus:outline-none focus:ring-2 focus:ring-accent/40",
          error
            ? "border-error focus:border-error"
            : "border-border-strong focus:border-accent"
        )}
      />

      {error ? (
        <p id="customer-phone-error" className="mt-1.5 text-xs font-medium text-error">
          {error}
        </p>
      ) : (
        <p id="customer-phone-helper" className="mt-1.5 text-xs text-muted">
          Used only for payment confirmation via Cashfree.
        </p>
      )}
    </div>
  );
}
