import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { PaymentStatus, RechargeStatus } from "@/lib/db-types";
import { requireAdmin } from "@/lib/auth/current-admin";
import { parseIntParam, sanitizeSearch } from "@/lib/validation";

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

const SEARCH_PHONE_RE = /^[6-9]\d{9}$/;

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const { searchParams } = request.nextUrl;
  const filter = searchParams.get("filter") ?? "all";
  const search = sanitizeSearch(searchParams.get("search"));
  const limit = Math.max(1, parseIntParam(searchParams.get("limit"), 50, 100));
  const offset = parseIntParam(searchParams.get("offset"), 0, 100_000);

  let query = supabaseAdmin
    .from("orders")
    .select(
      "id, order_number, imo_profile_id, credits, quantity, amount, customer_phone, payment_provider, provider_payment_id, payment_status, recharge_status, created_at, paid_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const mapped = FILTER_MAP[filter];
  if (mapped) {
    query = query.eq(mapped.column, mapped.value);
    if (mapped.column === "recharge_status") query = query.eq("payment_status", "paid");
  }

  if (search) {
    // Also matches a Razorpay payment id, or the customer's WhatsApp number.
    query = query.or(
      `order_number.ilike.%${search}%,imo_profile_id.ilike.%${search}%,provider_payment_id.eq.${search}` +
        (SEARCH_PHONE_RE.test(search) ? `,customer_phone.eq.${search}` : "")
    );
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: "Failed to load orders." }, { status: 500 });
  }

  return NextResponse.json({ orders: data, total: count ?? 0 });
}
