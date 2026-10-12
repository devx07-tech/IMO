import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeOrderNumber } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("orderId");

  if (!raw?.trim()) {
    return NextResponse.json(
      { error: "orderId is required." },
      { status: 400 }
    );
  }

  // Exact match only: a malformed ID can never match, and LIKE wildcards
  // (% and _) can't be used to enumerate other customers' orders.
  const orderNumber = normalizeOrderNumber(raw);
  if (!orderNumber) {
    return NextResponse.json({ order: null });
  }

  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select(
      "order_number, imo_profile_id, credits, quantity, amount, payment_status, recharge_status, created_at"
    )
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Lookup failed." }, { status: 500 });
  }

  if (!order) {
    return NextResponse.json({ order: null });
  }

  return NextResponse.json({
    order: {
      orderNumber: order.order_number,
      imoProfileId: order.imo_profile_id,
      credits: order.credits,
      quantity: order.quantity,
      amount: order.amount,
      paymentStatus: order.payment_status,
      rechargeStatus: order.recharge_status,
      createdAt: order.created_at,
    },
  });
}
