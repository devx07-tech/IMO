import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchCashfreeOrderStatus } from "@/lib/cashfree";
import { sendOrderNotification } from "@/lib/notifications/service";
import type { OrderRow } from "@/lib/db-types";
import { normalizeOrderNumber } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

function publicOrder(order: OrderRow) {
  return {
    orderNumber: order.order_number,
    imoProfileId: order.imo_profile_id,
    credits: order.credits,
    quantity: order.quantity,
    amount: order.amount,
    paymentStatus: order.payment_status,
    rechargeStatus: order.recharge_status,
    createdAt: order.created_at,
  };
}

export async function GET(request: NextRequest) {
  const orderNumber = normalizeOrderNumber(request.nextUrl.searchParams.get("orderNumber"));
  if (!orderNumber) {
    return NextResponse.json({ error: "orderNumber is required." }, { status: 400 });
  }

  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (error || !order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  // BaseUPI payments are confirmed only by the signed webhook.
  if (order.payment_status !== "pending" || order.payment_provider !== "cashfree") {
    return NextResponse.json({ order: publicOrder(order) });
  }

  // Webhook hasn't landed yet — ask Cashfree directly as a fallback so the
  // customer isn't stuck on "Verifying payment..." indefinitely.
  let cashfreeStatus;
  try {
    cashfreeStatus = await fetchCashfreeOrderStatus(orderNumber);
  } catch (err) {
    console.error("Cashfree status lookup failed during verify", err);
    return NextResponse.json({ order: publicOrder(order) });
  }

  if (cashfreeStatus.order_status === "PAID") {
    const { data: updated } = await supabaseAdmin
      .from("orders")
      .update({
        payment_status: "paid",
        paid_at: new Date().toISOString(),
        recharge_status: "waiting",
      })
      .eq("id", order.id)
      .eq("payment_status", "pending")
      .select()
      .maybeSingle();

    if (updated) {
      await logAudit({ action: "payment_confirmed", entityType: "order", entityId: updated.id,
        metadata: { provider: "cashfree", source: "provider_status" } });
      await sendOrderNotification("order_paid", updated, "telegram");
      return NextResponse.json({ order: publicOrder(updated) });
    }
  } else if (
    cashfreeStatus.order_status === "EXPIRED" ||
    cashfreeStatus.order_status === "TERMINATED"
  ) {
    const { data: updated } = await supabaseAdmin
      .from("orders")
      .update({ payment_status: "failed" })
      .eq("id", order.id)
      .eq("payment_status", "pending")
      .select()
      .maybeSingle();

    if (updated) {
      return NextResponse.json({ order: publicOrder(updated) });
    }
  }

  return NextResponse.json({ order: publicOrder(order) });
}
