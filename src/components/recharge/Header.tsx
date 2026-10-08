import { LifeBuoy } from "lucide-react";

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[720px] items-center justify-between px-4 py-3 sm:px-6">
        <div className="leading-tight">
          <p className="text-[19px] font-bold tracking-tight text-foreground sm:text-[20px]">
            IMO Recharge
          </p>
          <p className="text-[11px] text-muted">Powered by Kamal</p>
        </div>

        <a
          href="#support"
          className="inline-flex items-center gap-1.5 rounded-button border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          <LifeBuoy className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Help &amp; Support</span>
        </a>
      </div>
    </header>
  );
}
