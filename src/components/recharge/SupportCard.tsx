import { MessageCircle, Phone } from "lucide-react";
import { buildWhatsAppLink } from "@/lib/utils";
import { HelpVideoButton } from "./HelpVideoButton";

const IMO_SUPPORT_LINK = "https://call.imo.im/kamalseller";
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

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <a
            href={IMO_SUPPORT_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-1 items-center justify-center gap-2 rounded-button px-4 py-3 text-sm font-semibold text-white shadow-soft transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 bg-gradient-to-r from-accent to-[#3b8bff] hover:shadow-[0_8px_20px_rgba(13,110,253,0.35)] focus-visible:ring-accent"
          >
            <Phone className="h-4 w-4 transition-transform duration-200 group-hover:rotate-12" aria-hidden="true" />
            IMO Support
          </a>
          <HelpVideoButton src="/help/imo-support-guide.mp4" title="IMO Support video guide" />
        </div>
        <a
          href={whatsappLink}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center justify-center gap-2 rounded-button px-4 py-3 text-sm font-semibold text-white shadow-soft transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 bg-gradient-to-r from-success to-[#22c55e] hover:shadow-[0_8px_20px_rgba(22,163,74,0.35)] focus-visible:ring-success"
        >
          <MessageCircle className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" aria-hidden="true" />
          WhatsApp Support
        </a>
      </div>
    </section>
  );
}
