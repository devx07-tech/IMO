import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("packages")
    .select("id, credits, price, active, display_order")
    .eq("active", true)
    .order("display_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to load packages." }, { status: 500 });
  }

  return NextResponse.json({ packages: data });
}
