import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/current-admin";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { BUSINESS } from "@/lib/business";
import type { PaymentStatus } from "@/lib/db-types";
import { PAYMENT_PROVIDER } from "@/lib/payment-provider";
import { bridgeConfigured, bridgeLastSeen } from "@/lib/upi-payments";

const ORDER_FIELDS =
  "id, order_number, imo_profile_id, amount, payment_status, recharge_status, provider_payment_id, customer_utr, customer_utr_at, expires_at, paid_at, created_at";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const count = (status: PaymentStatus) => supabaseAdmin.from("orders")
    .select("id", { count: "exact", head: true })
    .eq("payment_provider", PAYMENT_PROVIDER).eq("payment_status", status);
  const results = await Promise.all([
    count("pending"), count("paid"), count("failed"),
    supabaseAdmin.from("orders").select(ORDER_FIELDS)
      .eq("payment_provider", PAYMENT_PROVIDER).not("customer_utr", "is", null)
      .in("payment_status", ["pending", "failed"])
      .order("customer_utr_at", { ascending: true }).limit(50),
    supabaseAdmin.from("upi_payment_events")
      .select("id, received_at, amount, utr, payer, raw_text, status")
      .eq("status", "unmatched").order("received_at", { ascending: false }).limit(50),
    supabaseAdmin.from("orders").select(ORDER_FIELDS)
      .eq("payment_provider", PAYMENT_PROVIDER).order("created_at", { ascending: false }).limit(15),
  ]);
  if (results.some((result) => result.error)) {
    return NextResponse.json({ error: "Failed to load payment overview." }, { status: 500 });
  }
  const [pending, paid, failed, review, unmatched, recent] = results;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BUSINESS.siteUrl;
  return NextResponse.json({
    configuration: {
      upiId: BUSINESS.upiId,
      payeeName: BUSINESS.upiPayeeName,
      bridgeSecretConfigured: bridgeConfigured(),
      bridgeLastSeen: await bridgeLastSeen(),
      telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
      bridgeUrl: `${siteUrl.replace(/\/$/, "")}/api/payments/upi-notify`,
    },
    pending: pending.count ?? 0, paid: paid.count ?? 0, failed: failed.count ?? 0,
    reviewOrders: review.data ?? [],
    unmatchedEvents: unmatched.data ?? [],
    recentOrders: recent.data ?? [],
  });
}
