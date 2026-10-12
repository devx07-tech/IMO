"use client";

import { cn } from "@/lib/utils";
import { HelpVideoButton } from "./HelpVideoButton";

interface ProfileIdInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

export function ProfileIdInput({ value, onChange, error }: ProfileIdInputProps) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5">
        <label htmlFor="profile-id" className="text-sm font-medium text-foreground">
          IMO ID / Mobile Number
        </label>
        <HelpVideoButton
          src="/help/imo-id-guide.mp4"
          title="IMO ID / Mobile Number help"
          description="Enter your IMO ID, or the mobile number linked to your IMO account."
          triggerClassName="flex h-5 w-5 items-center justify-center rounded-full text-muted transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          iconClassName="h-4 w-4"
        />
      </div>

      <input
        id="profile-id"
        name="profileId"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="Enter IMO ID or mobile number"
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

      {error ? (
        <p id="profile-id-error" className="mt-1.5 text-xs font-medium text-error">
          {error}
        </p>
      ) : (
        <p id="profile-id-helper" className="mt-1.5 text-xs text-muted">
          Recharge will be credited to this account only.
        </p>
      )}
    </div>
  );
}
