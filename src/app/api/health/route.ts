import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

// For uptime monitors (UptimeRobot, Better Stack, etc.). Reports only
// up/down — never configuration details.
export async function GET() {
  let ok = false;
  try {
    const { error } = await supabaseAdmin
      .from("packages")
      .select("id", { count: "exact", head: true });
    ok = !error;
  } catch {
    ok = false;
  }

  return NextResponse.json(
    { status: ok ? "ok" : "degraded" },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
