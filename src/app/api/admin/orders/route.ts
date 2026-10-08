import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { PaymentStatus, RechargeStatus } from "@/lib/db-types";

type OrderFilter =
  | { column: "payment_status"; value: PaymentStatus }
  | { column: "recharge_status"; value: RechargeStatus };

const FILTER_MAP: Record<string, OrderFilter> = {
  paid: { column: "payment_status", value: "paid" },
  pending_payment: { column: "payment_status", value: "pending" },
  failed_payment: { column: "payment_status", value: "failed" },
  waiting_recharge: { column: "recharge_status", value: "waiting" },
  processing: { column: "recharge_status", value: "processing" },
  completed: { column: "recharge_status", value: "completed" },
  failed_recharge: { column: "recharge_status", value: "failed" },
};

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const filter = searchParams.get("filter") ?? "all";
  const search = searchParams.get("search")?.trim();
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 100);
  const offset = Number(searchParams.get("offset") ?? 0);

  let query = supabaseAdmin
    .from("orders")
    .select(
      "id, order_number, imo_profile_id, credits, quantity, amount, payment_status, recharge_status, created_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const mapped = FILTER_MAP[filter];
  if (mapped) {
    query = query.eq(mapped.column, mapped.value);
  }

  if (search) {
    query = query.or(
      `order_number.ilike.%${search}%,imo_profile_id.ilike.%${search}%`
    );
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: "Failed to load orders." }, { status: 500 });
  }

  return NextResponse.json({ orders: data, total: count ?? 0 });
}
