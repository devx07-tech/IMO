import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeOrderNumber } from "@/lib/validation";
import { publicOrder } from "@/lib/public-order";
import { fetchRazorpayPayment, verifyCheckoutSignature } from "@/lib/razorpay";
import { confirmRazorpayPayment } from "@/lib/payments";

const schema = z.object({
  orderNumber: z.string(),
  razorpay_order_id: z.string().min(1).max(64),
  razorpay_payment_id: z.string().min(1).max(64),
  razorpay_signature: z.string().min(1).max(128),
});

/**
 * Razorpay Checkout's success callback. The signature proves the payment came
 * from Razorpay for this order; the payment is then re-fetched from Razorpay
 * so status and amount come from the server, never from the browser.
 */
export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  const orderNumber = parsed.success ? normalizeOrderNumber(parsed.data.orderNumber) : null;
  if (!parsed.success || !orderNumber) return NextResponse.json({ error: "Invalid payment response." }, { status: 400 });
  const { razorpay_order_id: rzpOrderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = parsed.data;

  if (!verifyCheckoutSignature(rzpOrderId, paymentId, signature)) {
    return NextResponse.json({ error: "Payment verification failed." }, { status: 400 });
  }

  const { data: order, error } = await supabaseAdmin
    .from("orders").select("*").eq("order_number", orderNumber).maybeSingle();
  if (error) return NextResponse.json({ error: "Could not check your order." }, { status: 500 });
  if (!order || order.provider_order_id !== rzpOrderId) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  try {
    const payment = await fetchRazorpayPayment(paymentId);
    const result = await confirmRazorpayPayment(order, payment, "checkout");
    if (result.status === "mismatch") {
      console.error("Razorpay payment mismatch", { orderNumber, paymentId, reason: result.reason });
      return NextResponse.json({ error: "Payment could not be matched to this order. Please contact support." }, { status: 409 });
    }
    // Not captured yet: the webhook will confirm it; the page keeps checking.
    return NextResponse.json({ order: publicOrder(result.status === "paid" ? result.order : order) });
  } catch (err) {
    console.error("Razorpay payment confirmation failed", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "We're confirming your payment. This page will update shortly." }, { status: 502 });
  }
}
