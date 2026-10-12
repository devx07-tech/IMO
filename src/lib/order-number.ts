import "server-only";
import { randomInt } from "crypto";
import { supabaseAdmin } from "./supabase-admin";

// Crockford base32: no I, L, O or U, so IDs read back over the phone unambiguously.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const LENGTH = 10; // 32^10 ≈ 10^15 — not guessable, effectively collision-free.

export function randomOrderNumber(): string {
  let id = "";
  for (let i = 0; i < LENGTH; i++) id += ALPHABET[randomInt(ALPHABET.length)];
  return `IMO-${id}`;
}

export async function generateUniqueOrderNumber(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = randomOrderNumber();
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("order_number", candidate)
      .maybeSingle();

    if (error) throw error;
    if (!data) return candidate;
  }
  throw new Error("Could not generate a unique order number.");
}
