import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyCashfreeWebhookSignature } from "@/lib/cashfree";
import { sendOrderNotification } from "@/lib/notifications/service";
import { logAudit } from "@/lib/audit";

interface CashfreeWebhookPayload {
  type: string;
  data: {
    order: { order_id: string };
    payment?: { cf_payment_id?: string; payment_status?: string };
  };
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-webhook-signature");
  const timestamp = request.headers.get("x-webhook-timestamp");

  if (!signature || !timestamp) {
    return NextResponse.json({ error: "Missing webhook signature headers." }, { status: 400 });
  }

  let verified: boolean;
  try {
    verified = verifyCashfreeWebhookSignature(rawBody, timestamp, signature);
  } catch (err) {
    console.error("Webhook signature verification error", err);
    return NextResponse.json({ error: "Signature verification failed." }, { status: 500 });
  }

  if (!verified) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  let payload: CashfreeWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const orderNumber = payload.data?.order?.order_id;
  if (!orderNumber) {
    return NextResponse.json({ error: "Webhook payload missing order_id." }, { status: 400 });
  }

  const { data: order, error: fetchError } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("order_number", orderNumber)
    .eq("payment_provider", "cashfree")
    .maybeSingle();

  if (fetchError || !order) {
    console.error("Webhook received for unknown order", orderNumber, fetchError);
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  // Idempotency guard: only the first successful/failed delivery should
  // mutate state and fire a notification. Replays are acknowledged as 200
  // without side effects.
  if (order.payment_status !== "pending") {
    return NextResponse.json({ ok: true, note: "Already processed." });
  }

  if (payload.type === "PAYMENT_SUCCESS_WEBHOOK") {
    // Conditional on payment_status still being "pending" so a concurrent
    // verify-status poll from the client can't double-process the same order.
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("orders")
      .update({
        payment_status: "paid",
        provider_payment_id: payload.data.payment?.cf_payment_id ?? null,
        paid_at: new Date().toISOString(),
        recharge_status: "waiting",
      })
      .eq("id", order.id)
      .eq("payment_status", "pending")
      .select()
      .maybeSingle();

    if (updateError) {
      console.error("Failed to mark order paid", updateError);
      return NextResponse.json({ error: "Failed to update order." }, { status: 500 });
    }

    if (updated) {
      await logAudit({ action: "payment_confirmed", entityType: "order", entityId: updated.id,
        metadata: { provider: "cashfree", source: "signed_webhook", providerPaymentId: updated.provider_payment_id } });
      await sendOrderNotification("order_paid", updated, "telegram");
    }
    return NextResponse.json({ ok: true });
  }

  if (
    payload.type === "PAYMENT_FAILED_WEBHOOK" ||
    payload.type === "PAYMENT_USER_DROPPED_WEBHOOK"
  ) {
    const { error: updateError } = await supabaseAdmin
      .from("orders")
      .update({ payment_status: "failed" })
      .eq("id", order.id)
      .eq("payment_status", "pending");

    if (updateError) {
      console.error("Failed to mark order failed", updateError);
      return NextResponse.json({ error: "Failed to update order." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true, note: "Event type ignored." });
}
