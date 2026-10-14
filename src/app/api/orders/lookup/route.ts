import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeOrderNumber } from "@/lib/validation";

const FIELDS =
  "order_number, imo_profile_id, credits, quantity, amount, payment_status, recharge_status, created_at, paid_at, completed_at";

/**
 * Customer purchase history. `q` is an Order ID, an IMO ID or the WhatsApp
 * number used at checkout. Only paid (or refunded) orders are listed, with no
 * personal details beyond the IMO ID. Exact matches only, so wildcards can't
 * be used to list other customers' orders; the proxy rate-limits this route.
 */
export async function GET(request: NextRequest) {
  const raw = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (!raw) return NextResponse.json({ error: "Enter your IMO ID, mobile number or Order ID." }, { status: 400 });

  const orderNumber = normalizeOrderNumber(raw);
  const digits = raw.replace(/[\s+-]/g, "").replace(/^91(?=[6-9]\d{9}$)/, "");
  let query = supabaseAdmin.from("orders").select(FIELDS)
    .in("payment_status", ["paid", "refunded"])
    .order("created_at", { ascending: false })
    .limit(20);

  if (orderNumber) {
    query = query.eq("order_number", orderNumber);
  } else if (/^\d{6,15}$/.test(digits)) {
    query = query.or(`imo_profile_id.eq.${digits},customer_phone.eq.${digits}`);
  } else {
    return NextResponse.json({ orders: [] });
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Lookup failed." }, { status: 500 });

  return NextResponse.json({
    orders: (data ?? []).map((order) => ({
      orderNumber: order.order_number,
      imoProfileId: order.imo_profile_id,
      credits: order.credits,
      quantity: order.quantity,
      amount: order.amount,
      paymentStatus: order.payment_status,
      rechargeStatus: order.recharge_status,
      createdAt: order.created_at,
      paidAt: order.paid_at,
      completedAt: order.completed_at,
    })),
  });
}
