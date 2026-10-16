import "server-only";
import { supabaseAdmin } from "../supabase-admin";
import type { NotificationChannel, OrderRow } from "../db-types";
import { TelegramProvider } from "./telegram-provider";
import { FutureWhatsAppProvider } from "./whatsapp-provider";
import type { NotificationEvent, NotificationProvider } from "./types";
import { paymentProviderLabel } from "../payment-provider";
import { BUSINESS } from "../business";

const providers: Record<string, NotificationProvider> = {
  telegram: new TelegramProvider(),
  whatsapp: new FutureWhatsAppProvider(),
};

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
}

function adminUrl(path: string): string {
  const siteUrl = BUSINESS.siteUrl;
  return `${siteUrl.replace(/\/$/, "")}${path}`;
}

function buildMessage(
  event: NotificationEvent,
  order: OrderRow,
  timestampIso: string,
  details: string[] = []
): string {
  if (event === "order_paid") {
    const diamonds = order.credits * order.quantity;
    return [
      "NEW IMO RECHARGE ORDER - PAID",
      "",
      `IMO ID: ${order.imo_profile_id}`,
      `Diamonds: ${diamonds.toLocaleString("en-IN")} (${order.credits.toLocaleString("en-IN")} × ${order.quantity})`,
      `Amount paid: ₹${Number(order.amount).toFixed(2)}`,
      ...(order.customer_phone ? [`Customer WhatsApp: +91 ${order.customer_phone}`, `Chat: https://wa.me/91${order.customer_phone}`] : []),
      `Order: ${order.order_number}`,
      `Provider: ${paymentProviderLabel(order.payment_provider)}`,
      ...details,
      "",
      "Credit the diamonds, then mark the order completed:",
      adminUrl("/admin/recharges"),
      "",
      formatTimestamp(timestampIso),
    ].join("\n");
  }

  if (event === "payment_review") {
    return [
      "PAYMENT NEEDS REVIEW",
      "",
      `Order: ${order.order_number}`,
      `IMO ID: ${order.imo_profile_id}`,
      `Diamonds: ${(order.credits * order.quantity).toLocaleString("en-IN")}`,
      `Expected amount: ₹${Number(order.amount).toFixed(2)}`,
      `Customer UTR: ${order.customer_utr ?? "-"}`,
      ...(order.customer_phone ? [`Customer WhatsApp: +91 ${order.customer_phone}`] : []),
      ...details,
      "",
      "Find this UTR and exact amount in Paytm for Business or the ICICI account before approving.",
      adminUrl("/admin/payments"),
      "",
      formatTimestamp(timestampIso),
    ].join("\n");
  }

  return [
    "IMO RECHARGE COMPLETED",
    "",
    `Order: ${order.order_number}`,
    `IMO ID: ${order.imo_profile_id}`,
    `Diamonds: ${(order.credits * order.quantity).toLocaleString("en-IN")}`,
    `Status: ${order.recharge_status.toUpperCase()}`,
    "",
    formatTimestamp(timestampIso),
  ].join("\n");
}

/**
 * TELEGRAM_CHAT_ID may list several chats, comma-separated (e.g. the owner and
 * the developer), so everyone who needs to act on a payment hears about it.
 */
export function telegramRecipients(): string[] {
  return (process.env.TELEGRAM_CHAT_ID ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

/**
 * Records and sends one admin notification per recipient. Never throws — a
 * Telegram/WhatsApp failure must never roll back or block the order/payment flow.
 */
async function deliver(params: {
  channel: NotificationChannel;
  event: NotificationEvent;
  orderId: string | null;
  message: (createdAt: string) => string;
}): Promise<void> {
  const recipients = params.channel === "telegram" ? telegramRecipients() : [];
  if (recipients.length === 0) {
    await deliverTo(params, undefined);
    return;
  }
  await Promise.all(recipients.map((recipient) => deliverTo(params, recipient)));
}

async function deliverTo(
  params: {
    channel: NotificationChannel;
    event: NotificationEvent;
    orderId: string | null;
    message: (createdAt: string) => string;
  },
  recipient: string | undefined
): Promise<void> {
  const { channel, event, orderId } = params;

  const { data: notification, error: insertError } = await supabaseAdmin
    .from("notifications")
    .insert({
      order_id: orderId,
      channel,
      event,
      recipient: recipient ?? "unconfigured",
      status: "pending",
      attempts: 0,
    })
    .select()
    .single();

  if (insertError || !notification) {
    console.error("Failed to create notification record", insertError);
    return;
  }

  const message = params.message(notification.created_at);

  if (!recipient) {
    await supabaseAdmin
      .from("notifications")
      .update({
        status: "failed",
        message,
        provider_response: `${channel.toUpperCase()}_CHAT_ID is not configured.`,
        attempts: 1,
      })
      .eq("id", notification.id);
    return;
  }

  try {
    const result = await providers[channel].send({ recipient, message });
    await supabaseAdmin
      .from("notifications")
      .update({
        status: result.ok ? "sent" : "failed",
        message,
        provider_response: result.providerResponse,
        attempts: 1,
        sent_at: result.ok ? new Date().toISOString() : null,
      })
      .eq("id", notification.id);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown notification error";
    console.error("Notification send threw unexpectedly", errorMessage);
    await supabaseAdmin
      .from("notifications")
      .update({
        status: "failed",
        message,
        provider_response: errorMessage,
        attempts: 1,
      })
      .eq("id", notification.id);
  }
}

/** Sends an admin notification for an order event, with optional extra lines. */
export async function sendOrderNotification(
  event: NotificationEvent,
  order: OrderRow,
  channel: NotificationChannel = "telegram",
  details: string[] = []
): Promise<void> {
  await deliver({
    channel,
    event,
    orderId: order.id,
    message: (createdAt) => buildMessage(event, order, createdAt, details),
  });
}

/** Sends a free-form admin alert, e.g. a payment that matched no order. */
export async function sendAdminAlert(
  event: NotificationEvent,
  lines: string[],
  orderId: string | null = null
): Promise<void> {
  await deliver({
    channel: "telegram",
    event,
    orderId,
    message: (createdAt) => [...lines, "", adminUrl("/admin/payments"), "", formatTimestamp(createdAt)].join("\n"),
  });
}

export async function retryNotification(notificationId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: notification, error } = await supabaseAdmin
    .from("notifications")
    .select("*")
    .eq("id", notificationId)
    .single();

  if (error || !notification) {
    return { ok: false, error: "Notification not found." };
  }

  let message = notification.message;
  if (!message) {
    // Older rows didn't store their text; rebuild it from the order.
    if (!notification.order_id) {
      return { ok: false, error: "Notification has no associated order." };
    }
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", notification.order_id)
      .single();
    if (orderError || !order) {
      return { ok: false, error: "Associated order not found." };
    }
    message = buildMessage(notification.event as NotificationEvent, order, notification.created_at);
  }

  // Retry to the chat this row was for; rows from before a chat was configured
  // go to the first configured chat.
  const configured = notification.channel === "telegram" ? telegramRecipients() : [];
  const recipient = configured.includes(notification.recipient)
    ? notification.recipient
    : configured[0];

  if (!recipient) {
    await supabaseAdmin
      .from("notifications")
      .update({
        status: "failed",
        provider_response: `${notification.channel.toUpperCase()}_CHAT_ID is not configured.`,
        attempts: notification.attempts + 1,
      })
      .eq("id", notification.id);
    return { ok: false, error: "Channel is not configured." };
  }

  const provider = providers[notification.channel];

  try {
    const result = await provider.send({ recipient, message });
    await supabaseAdmin
      .from("notifications")
      .update({
        status: result.ok ? "sent" : "failed",
        message,
        provider_response: result.providerResponse,
        attempts: notification.attempts + 1,
        sent_at: result.ok ? new Date().toISOString() : null,
      })
      .eq("id", notification.id);
    return { ok: result.ok, error: result.ok ? undefined : result.providerResponse };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown notification error";
    await supabaseAdmin
      .from("notifications")
      .update({
        status: "failed",
        provider_response: errorMessage,
        attempts: notification.attempts + 1,
      })
      .eq("id", notification.id);
    return { ok: false, error: errorMessage };
  }
}
