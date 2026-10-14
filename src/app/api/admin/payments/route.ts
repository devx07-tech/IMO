import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/current-admin";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { BUSINESS } from "@/lib/business";
import type { PaymentStatus } from "@/lib/db-types";
import { PAYMENT_PROVIDER } from "@/lib/payment-provider";
import { razorpayConfigured, razorpayMode } from "@/lib/razorpay";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const count = (status: PaymentStatus) => supabaseAdmin.from("orders")
    .select("id", { count: "exact", head: true })
    .eq("payment_provider", PAYMENT_PROVIDER).eq("payment_status", status);
  const results = await Promise.all([
    count("pending"), count("paid"), count("failed"),
    supabaseAdmin.from("orders")
      .select("id, order_number, imo_profile_id, credits, quantity, amount, customer_phone, payment_status, recharge_status, provider_order_id, provider_payment_id, paid_at, created_at")
      .eq("payment_provider", PAYMENT_PROVIDER).order("created_at", { ascending: false }).limit(20),
    supabaseAdmin.from("orders").select("paid_at").eq("payment_provider", PAYMENT_PROVIDER)
      .eq("payment_status", "paid").order("paid_at", { ascending: false }).limit(1),
  ]);
  if (results.some((result) => result.error)) {
    return NextResponse.json({ error: "Failed to load payment overview." }, { status: 500 });
  }
  const [pending, paid, failed, recent, last] = results;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BUSINESS.siteUrl;
  return NextResponse.json({
    configuration: {
      keysConfigured: razorpayConfigured(),
      mode: razorpayMode(),
      webhookSecretConfigured: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET),
      telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
      webhookUrl: `${siteUrl.replace(/\/$/, "")}/api/webhooks/razorpay`,
    },
    pending: pending.count ?? 0, paid: paid.count ?? 0, failed: failed.count ?? 0,
    lastPaidAt: last.data?.[0]?.paid_at ?? null,
    recentOrders: recent.data ?? [],
  });
}
