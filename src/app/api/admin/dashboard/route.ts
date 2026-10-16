import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/auth/current-admin";
import { readPaidRevenue } from "@/lib/payment-summary";
import { syncPendingGatewayOrders } from "@/lib/payments";

function todayBoundsIST(): { start: string; end: string } {
  const dateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
  }).format(new Date());
  return {
    start: `${dateStr}T00:00:00+05:30`,
    end: `${dateStr}T23:59:59.999+05:30`,
  };
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  // Picks up gateway payments whose callback never reached us.
  await syncPendingGatewayOrders().catch((err) => console.error("Pending gateway sweep failed", err));
  const { start, end } = todayBoundsIST();

  const [
    todayOrdersRes,
    todayPaidRes,
    paidOrdersRes,
    pendingRechargeRes,
    processingRechargeRes,
    completedRechargeRes,
    failedRechargeRes,
    failedPaymentsRes,
    recentOrdersRes,
  ] = await Promise.all([
    supabaseAdmin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .gte("created_at", start)
      .lte("created_at", end),
    readPaidRevenue(start, end),
    supabaseAdmin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("payment_status", "paid")
      .gte("paid_at", start)
      .lte("paid_at", end),
    supabaseAdmin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("payment_status", "paid")
      .eq("recharge_status", "waiting"),
    supabaseAdmin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("payment_status", "paid")
      .eq("recharge_status", "processing"),
    supabaseAdmin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("payment_status", "paid")
      .eq("recharge_status", "completed"),
    supabaseAdmin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("payment_status", "paid")
      .eq("recharge_status", "failed"),
    supabaseAdmin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("payment_status", "failed")
      .gte("created_at", start)
      .lte("created_at", end),
    supabaseAdmin
      .from("orders")
      .select(
        "order_number, imo_profile_id, credits, quantity, amount, payment_provider, payment_status, recharge_status, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  if ([todayOrdersRes, todayPaidRes, paidOrdersRes, pendingRechargeRes, processingRechargeRes,
    completedRechargeRes, failedRechargeRes, failedPaymentsRes, recentOrdersRes].some((result) => result.error)) {
    return NextResponse.json({ error: "Failed to load dashboard." }, { status: 500 });
  }

  return NextResponse.json({
    todayOrders: todayOrdersRes.count ?? 0,
    todayRevenue: todayPaidRes.revenue,
    paidOrders: paidOrdersRes.count ?? 0,
    pendingRecharge: pendingRechargeRes.count ?? 0,
    processingRecharge: processingRechargeRes.count ?? 0,
    completedRecharge: completedRechargeRes.count ?? 0,
    failedRecharge: failedRechargeRes.count ?? 0,
    failedPayments: failedPaymentsRes.count ?? 0,
    recentOrders: recentOrdersRes.data ?? [],
  });
}
