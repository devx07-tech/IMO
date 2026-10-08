import "server-only";
import { randomInt } from "crypto";
import { supabaseAdmin } from "./supabase-admin";

function randomOrderNumber(): string {
  return `IMO-${randomInt(10000, 99999)}`;
}

export async function generateUniqueOrderNumber(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = randomOrderNumber();
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("order_number", candidate)
      .maybeSingle();

    if (error) throw error;
    if (!data) return candidate;
  }
  throw new Error("Could not generate a unique order number after 10 attempts.");
}
