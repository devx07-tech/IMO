import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: NextRequest) {
  const profileId = request.nextUrl.searchParams.get("profileId")?.trim();
  const orderId = request.nextUrl.searchParams.get("orderId")?.trim();

  if (!profileId || !orderId) {
    return NextResponse.json(
      { error: "Both profileId and orderId are required." },
      { status: 400 }
    );
  }

  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select(
      "order_number, imo_profile_id, credits, quantity, amount, payment_status, recharge_status, created_at"
    )
    .eq("imo_profile_id", profileId)
    .ilike("order_number", orderId)
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
