import "server-only";
import { supabaseAdmin } from "../supabase-admin";
import type { OrderRow } from "../db-types";
import { TelegramProvider } from "./telegram-provider";
import { FutureWhatsAppProvider } from "./whatsapp-provider";
import type { NotificationEvent, NotificationProvider } from "./types";
import { paymentProviderLabel } from "../payment-provider";

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

function buildMessage(event: NotificationEvent, order: OrderRow, timestampIso: string): string {
  const recharge = `${order.credits.toLocaleString("en-IN")} Credits`;

  if (event === "order_paid") {
    return [
      "NEW IMO RECHARGE ORDER",
      "",
      `Order: ${order.order_number}`,
      `IMO ID: ${order.imo_profile_id}`,
      `Recharge: ${recharge}`,
      `Quantity: ${order.quantity}`,
      `Amount: ₹${order.amount}`,
      `Payment: ${order.payment_status.toUpperCase()}`,
      `Provider: ${paymentProviderLabel(order.payment_provider)}`,
      ...(order.provider_order_id ? [`Provider order: ${order.provider_order_id}`] : []),
      `Recharge: ${order.recharge_status.toUpperCase()}`,
      "",
      formatTimestamp(timestampIso),
    ].join("\n");
  }

  return [
    "IMO RECHARGE COMPLETED",
    "",
    `Order: ${order.order_number}`,
    `IMO ID: ${order.imo_profile_id}`,
    `Recharge: ${recharge}`,
    `Status: ${order.recharge_status.toUpperCase()}`,
    "",
    formatTimestamp(timestampIso),
  ].join("\n");
}

/**
 * Sends an admin notification for an order event. Writes a row to the
 * notifications table either way. Never throws — a Telegram/WhatsApp
 * failure must never roll back or block the order/payment flow.
 */
export async function sendOrderNotification(
  event: NotificationEvent,
  order: OrderRow,
  channel: "telegram" | "whatsapp" = "telegram"
): Promise<void> {
  const recipient =
    channel === "telegram" ? process.env.TELEGRAM_CHAT_ID : undefined;

  const { data: notification, error: insertError } = await supabaseAdmin
    .from("notifications")
    .insert({
      order_id: order.id,
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

  if (!recipient) {
    await supabaseAdmin
      .from("notifications")
      .update({
        status: "failed",
        provider_response: `${channel.toUpperCase()}_CHAT_ID is not configured.`,
        attempts: 1,
      })
      .eq("id", notification.id);
    return;
  }

  const message = buildMessage(event, order, notification.created_at);
  const provider = providers[channel];

  try {
    const result = await provider.send({ recipient, message });
    await supabaseAdmin
      .from("notifications")
      .update({
        status: result.ok ? "sent" : "failed",
        provider_response: result.providerResponse,
        attempts: 1,
        sent_at: result.ok ? new Date().toISOString() : null,
      })
      .eq("id", notification.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown notification error";
    console.error("Notification send threw unexpectedly", message);
    await supabaseAdmin
      .from("notifications")
      .update({
        status: "failed",
        provider_response: message,
        attempts: 1,
      })
      .eq("id", notification.id);
  }
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

  const recipient =
    notification.channel === "telegram" ? process.env.TELEGRAM_CHAT_ID : undefined;

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

  const message = buildMessage(
    notification.event as NotificationEvent,
    order,
    notification.created_at
  );
  const provider = providers[notification.channel];

  try {
    const result = await provider.send({ recipient, message });
    await supabaseAdmin
      .from("notifications")
      .update({
        status: result.ok ? "sent" : "failed",
        provider_response: result.providerResponse,
        attempts: notification.attempts + 1,
        sent_at: result.ok ? new Date().toISOString() : null,
      })
      .eq("id", notification.id);
    return { ok: result.ok, error: result.ok ? undefined : result.providerResponse };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown notification error";
    await supabaseAdmin
      .from("notifications")
      .update({
        status: "failed",
        provider_response: message,
        attempts: notification.attempts + 1,
      })
      .eq("id", notification.id);
    return { ok: false, error: message };
  }
}
