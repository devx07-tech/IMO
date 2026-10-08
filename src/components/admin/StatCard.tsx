import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: "neutral" | "success" | "warning" | "error";
}

const TONE_CLASSES: Record<NonNullable<StatCardProps["tone"]>, string> = {
  neutral: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  error: "bg-error-soft text-error",
};

export function StatCard({ label, value, icon: Icon, tone = "neutral" }: StatCardProps) {
  return (
    <div className="rounded-card bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted">{label}</p>
        <span className={cn("flex h-7 w-7 items-center justify-center rounded-full", TONE_CLASSES[tone])}>
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}
