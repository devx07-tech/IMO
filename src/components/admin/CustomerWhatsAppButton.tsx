import { MessageCircle } from "lucide-react";
import type { OrderRow } from "@/lib/db-types";
import { BUSINESS } from "@/lib/business";
import { cn } from "@/lib/utils";

type WhatsAppOrder = Pick<OrderRow, "order_number" | "imo_profile_id" | "credits" | "quantity" | "amount" |
  "customer_phone" | "payment_status" | "recharge_status">;

/** The message the admin sends the customer, matching where the order is. */
export function customerMessage(order: WhatsAppOrder): string {
  const diamonds = (order.credits * order.quantity).toLocaleString("en-IN");
  const amount = `₹${Number(order.amount).toLocaleString("en-IN")}`;
  const history = `${BUSINESS.siteUrl}/?history=${order.imo_profile_id}#transaction-history`;
  const details = [`IMO ID: ${order.imo_profile_id}`, `Diamonds: ${diamonds}`, `Amount paid: ${amount}`, `Order: ${order.order_number}`];
  const intro = order.recharge_status === "completed"
    ? "Hi! ✅ Your IMO recharge is complete. The diamonds have been credited to your account."
    : order.recharge_status === "failed"
      ? "Hi! There was a problem crediting your IMO recharge. We're fixing it and will update you shortly."
      : "Hi! We've received your payment. Your diamonds are being credited to your IMO account now.";
  return [intro, "", ...details, "", `Check your purchase history anytime: ${history}`, "", `Thank you for choosing ${BUSINESS.brand}!`].join("\n");
}

export function CustomerWhatsAppButton({ order, compact = false }: { order: WhatsAppOrder; compact?: boolean }) {
  if (order.payment_status !== "paid") return compact ? <span className="text-xs text-muted">-</span> : null;
  const text = encodeURIComponent(customerMessage(order));
  // Without a stored number WhatsApp asks which chat to send it to.
  const href = order.customer_phone ? `https://wa.me/91${order.customer_phone}?text=${text}` : `https://wa.me/?text=${text}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-button bg-[#25D366] font-semibold text-white hover:opacity-90",
        compact ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2 text-xs"
      )}
    >
      <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
      {compact ? (order.customer_phone ? `+91 ${order.customer_phone}` : "WhatsApp") : "Send update on WhatsApp"}
    </a>
  );
}
