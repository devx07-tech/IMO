import "server-only";
import { supabaseAdmin } from "./supabase-admin";

// Supabase caps a response's row count. Page through payments so high-volume
// days aren't silently undercounted; accumulate paise to avoid float drift.
export async function readPaidRevenue(start: string, end: string) {
  let paise = 0;
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabaseAdmin.from("orders").select("amount")
      .eq("payment_status", "paid").gte("paid_at", start).lte("paid_at", end)
      .order("id", { ascending: true }).range(offset, offset + 499);
    if (error) return { revenue: 0, error };
    for (const row of data ?? []) paise += Math.round(Number(row.amount) * 100);
    if ((data?.length ?? 0) < 500) return { revenue: paise / 100, error: null };
  }
}
