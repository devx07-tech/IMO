import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-surface">
      <div className="mx-auto max-w-[720px] px-4 py-6 text-center sm:px-6">
        <p className="text-sm font-semibold text-foreground">IMO Recharge</p>
        <p className="mt-0.5 text-xs text-muted">Powered by Kamal</p>
        <p className="mt-1 text-xs text-muted">Secure online recharge service.</p>
        <p className="mt-3 text-xs text-muted">© 2026 Kamal Seller</p>

        <div className="mt-3 flex items-center justify-center gap-3 text-xs text-muted">
          <Link href="/terms" className="transition-colors hover:text-accent">
            Terms
          </Link>
          <span aria-hidden="true">•</span>
          <Link href="/privacy" className="transition-colors hover:text-accent">
            Privacy
          </Link>
          <span aria-hidden="true">•</span>
          <Link href="/refund-policy" className="transition-colors hover:text-accent">
            Refund Policy
          </Link>
          <span aria-hidden="true">•</span>
          <Link href="/contact" className="transition-colors hover:text-accent">
            Contact
          </Link>
        </div>
      </div>
    </footer>
  );
}
