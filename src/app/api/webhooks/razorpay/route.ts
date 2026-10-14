import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { paymentSchema, verifyWebhookSignature } from "@/lib/razorpay";
import { confirmRazorpayPayment } from "@/lib/payments";

export const runtime = "nodejs";

const eventSchema = z.object({
  event: z.string(),
  payload: z.object({ payment: z.object({ entity: paymentSchema }).optional() }).passthrough(),
});

const HANDLED = new Set(["payment.captured", "payment.authorized", "order.paid"]);

/**
 * Razorpay webhook (payment.captured / order.paid). Verified with
 * RAZORPAY_WEBHOOK_SECRET over the raw body. Confirmation is idempotent, so
 * Razorpay's retries and the checkout callback can't double-confirm.
 */
export async function POST(request: NextRequest) {
  const signature = request.headers.get("x-razorpay-signature");
  const rawBody = await request.text();
  if (!signature || !verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let json: unknown;
  try { json = JSON.parse(rawBody); } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const eventName = (json as { event?: unknown } | null)?.event;
  if (typeof eventName !== "string" || !HANDLED.has(eventName)) {
    return NextResponse.json({ ok: true, note: "Event ignored." });
  }
  const parsed = eventSchema.safeParse(json);
  if (!parsed.success || !parsed.data.payload.payment) {
    console.error("Unrecognised Razorpay payment webhook", parsed.success ? "missing payment" : parsed.error.issues.slice(0, 3));
    return NextResponse.json({ error: "Unrecognised payload." }, { status: 400 });
  }

  const payment = parsed.data.payload.payment.entity;
  if (!payment.order_id) return NextResponse.json({ ok: true, note: "Payment without order ignored." });

  const { data: order, error } = await supabaseAdmin
    .from("orders").select("*").eq("provider_order_id", payment.order_id).maybeSingle();
  if (error) return NextResponse.json({ error: "Order lookup failed." }, { status: 500 });
  // Payments for other websites on the same Razorpay account land here too.
  if (!order) return NextResponse.json({ ok: true, note: "Order not on this site." });

  try {
    const result = await confirmRazorpayPayment(order, payment, "webhook");
    if (result.status === "mismatch") {
      console.error("Razorpay webhook mismatch", { orderNumber: order.order_number, paymentId: payment.id, reason: result.reason });
    }
    return NextResponse.json({ ok: true, result: result.status });
  } catch (err) {
    console.error("Razorpay webhook processing failed", err instanceof Error ? err.message : err);
    // A 5xx makes Razorpay retry the webhook.
    return NextResponse.json({ error: "Processing failed." }, { status: 500 });
  }
}
