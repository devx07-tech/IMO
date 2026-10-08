"use client";

import { useState } from "react";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProfileIdInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

export function ProfileIdInput({ value, onChange, error }: ProfileIdInputProps) {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5">
        <label htmlFor="profile-id" className="text-sm font-medium text-foreground">
          IMO Profile ID
        </label>
        <button
          type="button"
          onClick={() => setShowHelp((prev) => !prev)}
          aria-expanded={showHelp}
          aria-controls="profile-id-help"
          className="flex h-5 w-5 items-center justify-center rounded-full text-muted transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <HelpCircle className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">What is my Profile ID?</span>
        </button>
      </div>

      <input
        id="profile-id"
        name="profileId"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="Enter your Profile ID"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
        aria-invalid={Boolean(error)}
        aria-describedby="profile-id-helper profile-id-error"
        className={cn(
          "w-full rounded-input border bg-surface px-4 py-3 text-base text-foreground placeholder:text-muted/70 transition-colors focus:outline-none focus:ring-2 focus:ring-accent/40",
          error
            ? "border-error focus:border-error"
            : "border-border-strong focus:border-accent"
        )}
      />

      {showHelp && (
        <p
          id="profile-id-help"
          className="mt-2 rounded-input bg-accent-soft px-3 py-2 text-xs text-foreground/80"
        >
          You can find your Profile ID inside your IMO profile.
        </p>
      )}

      {error ? (
        <p id="profile-id-error" className="mt-1.5 text-xs font-medium text-error">
          {error}
        </p>
      ) : (
        <p id="profile-id-helper" className="mt-1.5 text-xs text-muted">
          Recharge will be credited to this profile only.
        </p>
      )}
    </div>
  );
}
