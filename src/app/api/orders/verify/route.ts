import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeOrderNumber } from "@/lib/validation";
import { publicOrder } from "@/lib/public-order";
import { razorpayConfigured, razorpayKeyId } from "@/lib/razorpay";
import { syncOrderWithRazorpay } from "@/lib/payments";

/** Order status for the checkout screen. `sync=1` also asks Razorpay directly. */
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
  if (request.nextUrl.searchParams.get("sync") === "1" && razorpayConfigured()) {
    try {
      order = await syncOrderWithRazorpay(found);
    } catch (err) {
      console.error("Razorpay status check failed", err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json({ order: publicOrder(order, razorpayConfigured() ? razorpayKeyId() : undefined) });
}
