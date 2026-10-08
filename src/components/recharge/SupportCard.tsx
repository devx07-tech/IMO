import { MessageCircle } from "lucide-react";
import { buildWhatsAppLink } from "@/lib/utils";

const SUPPORT_WHATSAPP = "+91 63823 71168";

export function SupportCard() {
  const whatsappLink = buildWhatsAppLink(
    SUPPORT_WHATSAPP,
    "Hi, I need help with my IMO Recharge order."
  );

  return (
    <section id="support" className="rounded-card bg-surface p-5 shadow-card sm:p-6">
      <h2 className="text-base font-semibold text-foreground">Need Help?</h2>
      <p className="mt-1 text-sm text-muted">
        Contact our support team for recharge or payment assistance.
      </p>

      <a
        href={whatsappLink}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 flex items-center justify-center gap-2 rounded-button border border-border-strong px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:border-success hover:text-success focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <MessageCircle className="h-4 w-4" aria-hidden="true" />
        WhatsApp Support
      </a>
    </section>
  );
}
