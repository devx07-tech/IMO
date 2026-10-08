export function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-surface">
      <div className="mx-auto max-w-[720px] px-4 py-6 text-center sm:px-6">
        <p className="text-sm font-semibold text-foreground">IMO Recharge</p>
        <p className="mt-0.5 text-xs text-muted">Powered by Kamal</p>
        <p className="mt-1 text-xs text-muted">Secure online recharge service.</p>
        <p className="mt-3 text-xs text-muted">© 2026 Kamal</p>

        <div className="mt-3 flex items-center justify-center gap-3 text-xs text-muted">
          <span>Terms</span>
          <span aria-hidden="true">•</span>
          <span>Privacy</span>
          <span aria-hidden="true">•</span>
          <span>Refund Policy</span>
          <span aria-hidden="true">•</span>
          <span>Contact</span>
        </div>
      </div>
    </footer>
  );
}
