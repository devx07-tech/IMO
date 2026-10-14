import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeOrderNumber } from "@/lib/validation";
import { publicOrder } from "@/lib/public-order";
import { PAYMENT_PROVIDER } from "@/lib/payment-provider";

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

  // Payment is confirmed server-side by the payment bridge or an admin; this
  // endpoint only reports status, and closes the order once its window passes.
  if (order.payment_provider === PAYMENT_PROVIDER && order.payment_status === "pending" &&
      !order.customer_utr && order.expires_at && new Date(order.expires_at).getTime() < Date.now()) {
    const { data: expired } = await supabaseAdmin
      .from("orders")
      .update({ payment_status: "failed", updated_at: new Date().toISOString() })
      .eq("id", order.id)
      .eq("payment_status", "pending")
      .is("customer_utr", null)
      .select()
      .maybeSingle();
    if (expired) return NextResponse.json({ order: publicOrder(expired) });
  }

  return NextResponse.json({ order: publicOrder(order) });
}
