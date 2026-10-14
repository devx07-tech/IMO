import "server-only";
import { createHash, randomInt, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "./supabase-admin";
import type { OrderRow, PaymentStatus } from "./db-types";
import { logAudit } from "./audit";
import { sendAdminAlert, sendOrderNotification } from "./notifications/service";
import { UPI_PROVIDER } from "./payment-provider";
import { parsePaymentMessage } from "./upi-message";
import { formatPaise, LATE_UTR_WINDOW_HOURS, PAYMENT_WINDOW_MINUTES, toPaise } from "./upi";

const UNIQUE_VIOLATION = "23505";
const MIN_BRIDGE_SECRET_LENGTH = 32;

export class PaymentsBusyError extends Error {}

export function bridgeConfigured(): boolean {
  return (process.env.UPI_BRIDGE_SECRET ?? "").length >= MIN_BRIDGE_SECRET_LENGTH;
}

/** Constant-time comparison of the bridge's bearer token with UPI_BRIDGE_SECRET. */
export function verifyBridgeToken(authorization: string | null): boolean {
  const secret = process.env.UPI_BRIDGE_SECRET ?? "";
  if (secret.length < MIN_BRIDGE_SECRET_LENGTH || !authorization?.startsWith("Bearer ")) return false;
  const given = createHash("sha256").update(authorization.slice(7).trim()).digest();
  const expected = createHash("sha256").update(secret).digest();
  return timingSafeEqual(given, expected);
}

/**
 * Releases the unique amount of unpaid orders whose payment window has passed.
 * Orders with a customer-submitted UTR stay open until an admin reviews them.
 */
export async function expireStaleOrders(): Promise<void> {
  const { error } = await supabaseAdmin
    .from("orders")
    .update({ payment_status: "failed", updated_at: new Date().toISOString() })
    .eq("payment_provider", UPI_PROVIDER)
    .eq("payment_status", "pending")
    .is("customer_utr", null)
    .lt("expires_at", new Date().toISOString());
  if (error) console.error("Failed to expire stale UPI orders", error);
}

type NewOrder = Pick<OrderRow, "order_number" | "imo_profile_id" | "package_id" | "credits" | "quantity" | "unit_price" | "customer_phone">;

/**
 * Inserts an order whose amount is the package total minus 1–99 paise, unique
 * among open UPI orders (enforced by a partial unique index). The exact amount
 * is how an incoming payment is matched back to its order.
 */
export async function insertUpiOrder(order: NewOrder, totalPaise: number): Promise<OrderRow> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: open, error: openError } = await supabaseAdmin
      .from("orders")
      .select("amount")
      .eq("payment_provider", UPI_PROVIDER)
      .eq("payment_status", "pending")
      .gte("amount", Number(formatPaise(totalPaise - 99)))
      .lte("amount", Number(formatPaise(totalPaise - 1)));
    if (openError) throw openError;

    const used = new Set((open ?? []).map((row) => toPaise(row.amount)));
    const free: number[] = [];
    for (let offset = 1; offset <= 99; offset++) {
      if (!used.has(totalPaise - offset)) free.push(totalPaise - offset);
    }
    if (free.length === 0) throw new PaymentsBusyError("No free payment amount for this total.");

    const amountPaise = free[randomInt(free.length)];
    const { data, error } = await supabaseAdmin
      .from("orders")
      .insert({
        ...order,
        amount: Number(formatPaise(amountPaise)),
        payment_provider: UPI_PROVIDER,
        payment_status: "pending",
        recharge_status: "waiting",
        expires_at: new Date(Date.now() + PAYMENT_WINDOW_MINUTES * 60_000).toISOString(),
      })
      .select()
      .single();
    if (!error && data) return data;
    // Another order took this amount at the same moment; pick again.
    if (error?.code !== UNIQUE_VIOLATION) throw error ?? new Error("Order insert returned no row.");
  }
  throw new PaymentsBusyError("Could not reserve a unique payment amount.");
}

type ConfirmSource = "auto_bridge" | "customer_utr_bridge" | "admin";

const SOURCE_LABEL: Record<ConfirmSource, string> = {
  auto_bridge: "Automatic (payment notification)",
  customer_utr_bridge: "Automatic (customer UTR matched notification)",
  admin: "Approved by admin",
};

type ConfirmResult = { order: OrderRow } | { error: "utr_used" | "not_open" };

/**
 * Marks an order paid exactly once. The conditional update guards against
 * double confirmation; the unique index stops one UTR paying for two orders.
 */
export async function confirmUpiPayment(params: {
  order: OrderRow;
  source: ConfirmSource;
  utr: string | null;
  eventId?: string | null;
  adminId?: string | null;
  allowFromStatus?: PaymentStatus[];
}): Promise<ConfirmResult> {
  const { order, source, utr, eventId = null, adminId = null } = params;
  const now = new Date().toISOString();
  const { data: updated, error } = await supabaseAdmin
    .from("orders")
    .update({ payment_status: "paid", paid_at: now, updated_at: now, provider_payment_id: utr })
    .eq("id", order.id)
    .eq("payment_provider", UPI_PROVIDER)
    .in("payment_status", params.allowFromStatus ?? ["pending"])
    .select()
    .maybeSingle();

  if (error?.code === UNIQUE_VIOLATION) return { error: "utr_used" };
  if (error) throw error;
  if (!updated) return { error: "not_open" };

  if (eventId) {
    await supabaseAdmin
      .from("upi_payment_events")
      .update({ status: "matched", order_id: updated.id, resolved_at: now })
      .eq("id", eventId);
  }
  await logAudit({
    adminId,
    action: "payment_confirmed",
    entityType: "order",
    entityId: updated.id,
    metadata: { provider: UPI_PROVIDER, source, utr, eventId, amount: updated.amount },
  });
  await sendOrderNotification("order_paid", updated, "telegram", [
    ...(utr ? [`UTR: ${utr}`] : []),
    `Confirmed: ${SOURCE_LABEL[source]}`,
  ]);
  return { order: updated };
}

export async function bridgeLastSeen(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("upi_payment_events")
    .select("received_at")
    .order("received_at", { ascending: false })
    .limit(1);
  return data?.[0]?.received_at ?? null;
}

function bridgeStatusLine(lastSeen: string | null): string {
  const when = lastSeen
    ? new Date(lastSeen).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })
    : "never";
  return `Payment phone last seen: ${when}`;
}

export type BridgeResult = "matched" | "unmatched" | "duplicate" | "ignored";

/** Handles one message forwarded by the payment bridge phone. */
export async function processBridgeMessage(text: string, source: string): Promise<BridgeResult> {
  const parsed = parsePaymentMessage(text);
  const rawText = text.slice(0, 1000);

  if (!parsed.isCredit || parsed.amountPaise === null) {
    // Kept as a heartbeat so the admin page can show the phone is online.
    await supabaseAdmin.from("upi_payment_events").insert({ source, raw_text: rawText, status: "ignored" });
    if (Math.random() < 0.02) {
      const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString();
      await supabaseAdmin.from("upi_payment_events").delete().eq("status", "ignored").lt("received_at", cutoff);
    }
    return "ignored";
  }

  const amount = formatPaise(parsed.amountPaise);
  const { data: event, error: insertError } = await supabaseAdmin
    .from("upi_payment_events")
    .insert({
      source,
      raw_text: rawText,
      amount: Number(amount),
      utr: parsed.utr,
      payer: parsed.payer,
      status: "unmatched",
    })
    .select()
    .single();
  // Same UTR already recorded: this is a second copy of the same payment.
  if (insertError?.code === UNIQUE_VIOLATION) return "duplicate";
  if (insertError || !event) throw insertError ?? new Error("Event insert returned no row.");

  const markDuplicate = async () => {
    await supabaseAdmin.from("upi_payment_events")
      .update({ status: "duplicate", resolved_at: new Date().toISOString() }).eq("id", event.id);
    return "duplicate" as const;
  };

  // 1. The open order reserved for this exact amount.
  const { data: open, error: openError } = await supabaseAdmin
    .from("orders").select("*")
    .eq("payment_provider", UPI_PROVIDER).eq("payment_status", "pending").eq("amount", Number(amount))
    .maybeSingle();
  if (openError) throw openError;
  if (open) {
    const result = await confirmUpiPayment({ order: open, source: "auto_bridge", utr: parsed.utr, eventId: event.id });
    if ("order" in result) return "matched";
    if (result.error === "utr_used") {
      await sendAdminAlert("payment_unmatched", [
        "PAYMENT UTR ALREADY USED",
        "",
        `Amount: ₹${amount}`,
        `UTR: ${parsed.utr}`,
        `Open order with this amount: ${open.order_number}`,
        "This UTR already confirmed another order. Check before approving.",
      ], open.id);
      return "unmatched";
    }
    return markDuplicate();
  }

  // 2. A second copy (e.g. SMS + app notification) of a payment matched moments ago.
  const recent = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: twin } = await supabaseAdmin
    .from("upi_payment_events").select("id, utr")
    .eq("status", "matched").eq("amount", Number(amount)).gte("received_at", recent)
    .limit(1);
  if (twin && twin.length > 0 && (!parsed.utr || !twin[0].utr)) return markDuplicate();

  // 3. A late payment for an order whose customer already submitted this UTR.
  if (parsed.utr) {
    const { data: claimed } = await supabaseAdmin
      .from("orders").select("*")
      .eq("payment_provider", UPI_PROVIDER).eq("customer_utr", parsed.utr).eq("amount", Number(amount))
      .in("payment_status", ["pending", "failed"])
      .maybeSingle();
    if (claimed) {
      const result = await confirmUpiPayment({
        order: claimed, source: "customer_utr_bridge", utr: parsed.utr, eventId: event.id,
        allowFromStatus: ["pending", "failed"],
      });
      if ("order" in result) return "matched";
    }
  }

  // 4. Nothing matched: money arrived but no order is waiting for it.
  const since = new Date(Date.now() - LATE_UTR_WINDOW_HOURS * 3_600_000).toISOString();
  const { data: candidates } = await supabaseAdmin
    .from("orders").select("order_number")
    .eq("payment_provider", UPI_PROVIDER).eq("payment_status", "failed").eq("amount", Number(amount))
    .gte("created_at", since).order("created_at", { ascending: false }).limit(3);
  await sendAdminAlert("payment_unmatched", [
    "PAYMENT RECEIVED - NO OPEN ORDER",
    "",
    `Amount: ₹${amount}`,
    `UTR: ${parsed.utr ?? "not in message"}`,
    ...(parsed.payer ? [`From: ${parsed.payer}`] : []),
    ...(candidates && candidates.length > 0
      ? [`Expired orders with this amount: ${candidates.map((c) => c.order_number).join(", ")}`]
      : ["No recent order has this amount."]),
    "Attach it to the right order in the admin Payments page.",
  ]);
  return "unmatched";
}

export type UtrSubmitResult =
  | { status: "paid"; order: OrderRow }
  | { status: "review"; order: OrderRow }
  | { status: "rejected"; reason: string };

/**
 * A customer says they paid and gives their UTR. Confirms immediately when the
 * payment phone already reported that UTR with the right amount; otherwise the
 * claim is queued for admin review. A UTR alone never confirms a payment.
 */
export async function submitCustomerUtr(order: OrderRow, utr: string): Promise<UtrSubmitResult> {
  if (order.payment_provider !== UPI_PROVIDER) {
    return { status: "rejected", reason: "This order can't take a UPI reference." };
  }
  if (order.payment_status === "paid") return { status: "paid", order };
  const lateCutoff = Date.now() - LATE_UTR_WINDOW_HOURS * 3_600_000;
  if (order.payment_status !== "pending" &&
      !(order.payment_status === "failed" && new Date(order.created_at).getTime() > lateCutoff)) {
    return { status: "rejected", reason: "This order is closed. Please contact support with your UTR." };
  }

  const { data: usedBy } = await supabaseAdmin
    .from("orders").select("id").eq("provider_payment_id", utr).maybeSingle();
  if (usedBy) return { status: "rejected", reason: "This UTR has already been used for another order." };

  const { data: event } = await supabaseAdmin
    .from("upi_payment_events").select("*").eq("utr", utr).maybeSingle();
  if (event?.status === "matched" && event.order_id !== order.id) {
    return { status: "rejected", reason: "This UTR has already been used for another order." };
  }
  if (event && event.status === "unmatched" && toPaise(event.amount ?? 0) === toPaise(order.amount)) {
    const result = await confirmUpiPayment({
      order, source: "customer_utr_bridge", utr, eventId: event.id, allowFromStatus: ["pending", "failed"],
    });
    if ("order" in result) return { status: "paid", order: result.order };
  }

  if (order.customer_utr === utr) return { status: "review", order };

  const { data: updated, error } = await supabaseAdmin
    .from("orders")
    .update({ customer_utr: utr, customer_utr_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", order.id)
    .in("payment_status", ["pending", "failed"])
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!updated) return { status: "rejected", reason: "This order has just changed. Please refresh." };

  await logAudit({
    action: "payment_review_requested", entityType: "order", entityId: order.id,
    metadata: { utr, amount: order.amount },
  });
  const details = [bridgeStatusLine(await bridgeLastSeen())];
  if (event && toPaise(event.amount ?? 0) !== toPaise(order.amount)) {
    details.push(`Warning: payment phone saw ₹${formatPaise(toPaise(event.amount ?? 0))} for this UTR.`);
  }
  await sendOrderNotification("payment_review", updated, "telegram", details);
  return { status: "review", order: updated };
}
