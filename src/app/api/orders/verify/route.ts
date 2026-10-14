import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeOrderNumber } from "@/lib/validation";
import { publicOrder } from "@/lib/public-order";
import { razorpayConfigured, razorpayKeyId } from "@/lib/razorpay";
import { syncOrderWithRazorpay } from "@/lib/payments";
import { RAZORPAY_PROVIDER, UPI_PROVIDER } from "@/lib/payment-provider";

/**
 * Order status for the checkout screen. UPI orders close once their payment
 * window passes; for Razorpay orders `sync=1` also asks Razorpay directly.
 */
export async function GET(request: NextRequest) {
  const orderNumber = normalizeOrderNumber(request.nextUrl.searchParams.get("orderNumber"));
  if (!orderNumber) {
    return NextResponse.json({ error: "orderNumber is required." }, { status: 400 });
  }

  const { data: found, error } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (error || !found) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  let order = found;
  if (order.payment_provider === UPI_PROVIDER && order.payment_status === "pending" &&
      !order.customer_utr && order.expires_at && new Date(order.expires_at).getTime() < Date.now()) {
    const { data: expired } = await supabaseAdmin
      .from("orders")
      .update({ payment_status: "failed", updated_at: new Date().toISOString() })
      .eq("id", order.id)
      .eq("payment_status", "pending")
      .is("customer_utr", null)
      .select()
      .maybeSingle();
    if (expired) order = expired;
  }

  if (order.payment_provider === RAZORPAY_PROVIDER && request.nextUrl.searchParams.get("sync") === "1" && razorpayConfigured()) {
    try {
      order = await syncOrderWithRazorpay(order);
    } catch (err) {
      console.error("Razorpay status check failed", err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json({ order: publicOrder(order, razorpayConfigured() ? razorpayKeyId() : undefined) });
}
