import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/auth/current-admin";
import { parseIntParam } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const { searchParams } = request.nextUrl;
  const limit = Math.max(1, parseIntParam(searchParams.get("limit"), 50, 100));
  const offset = parseIntParam(searchParams.get("offset"), 0, 100_000);

  const { data, error, count } = await supabaseAdmin
    .from("notifications")
    .select("*, orders(order_number)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: "Failed to load notifications." }, { status: 500 });
  }

  return NextResponse.json({ notifications: data, total: count ?? 0 });
}
