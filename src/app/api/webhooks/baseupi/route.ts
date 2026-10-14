import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { parseBaseupiPayment, verifyBaseupiSignature } from "@/lib/baseupi";
import { sendOrderNotification } from "@/lib/notifications/service";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const signature = request.headers.get("x-baseupi-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature." }, { status: 401 });
  const rawBody = await request.text();
  try {
    if (!verifyBaseupiSignature(rawBody, signature)) {
      return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });
  }
  let payload: unknown;
  try { payload = JSON.parse(rawBody); } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const payment = parseBaseupiPayment(payload);
  if (!payment) {
    const event = payload as { type?: string; event?: string } | null;
    if (event?.type === "BASEUPI_PAYMENT_SUCCESS" || event?.event === "payment.completed") {
      return NextResponse.json({ error: "Invalid payment payload." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, note: "Event ignored." });
  }
  const { data: order, error } = await supabaseAdmin.from("orders").select("*")
    .eq("order_number", payment.merchant_order_id).eq("payment_provider", "baseupi").maybeSingle();
  if (error) return NextResponse.json({ error: "Order lookup failed." }, { status: 500 });
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  if (Math.round(Number(order.amount) * 100) !== payment.amount_paise ||
      (payment.order_id && order.provider_order_id && payment.order_id !== order.provider_order_id)) {
    return NextResponse.json({ error: "Payment does not match order." }, { status: 409 });
  }
  if (order.payment_status !== "pending") return NextResponse.json({ ok: true });
  const { data: updated, error: updateError } = await supabaseAdmin.from("orders")
    .update({ payment_status: "paid", paid_at: new Date().toISOString() })
    .eq("id", order.id).eq("payment_provider", "baseupi").eq("payment_status", "pending")
    .select().maybeSingle();
  if (updateError) return NextResponse.json({ error: "Payment update failed." }, { status: 500 });
  if (updated) {
    await logAudit({ action: "payment_confirmed", entityType: "order", entityId: updated.id,
      metadata: { provider: "baseupi", amountPaise: payment.amount_paise,
        providerOrderId: payment.order_id ?? updated.provider_order_id, source: "signed_webhook" } });
    await sendOrderNotification("order_paid", updated, "telegram");
  }
  return NextResponse.json({ ok: true });
}
