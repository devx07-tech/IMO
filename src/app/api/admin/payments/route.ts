import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/current-admin";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { BUSINESS } from "@/lib/business";
import type { PaymentStatus } from "@/lib/db-types";
import { activePaymentMode, UPI_PROVIDER } from "@/lib/payment-provider";
import { bridgeConfigured, bridgeLastSeen } from "@/lib/upi-payments";
import { razorpayConfigured, razorpayMode } from "@/lib/razorpay";

const ORDER_FIELDS =
  "id, order_number, imo_profile_id, credits, quantity, amount, customer_phone, payment_provider, payment_status, recharge_status, provider_payment_id, customer_utr, customer_utr_at, expires_at, paid_at, created_at";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const count = (status: PaymentStatus) => supabaseAdmin.from("orders")
    .select("id", { count: "exact", head: true }).eq("payment_status", status);
  const results = await Promise.all([
    count("pending"), count("paid"), count("failed"),
    supabaseAdmin.from("orders").select(ORDER_FIELDS)
      .eq("payment_provider", UPI_PROVIDER).not("customer_utr", "is", null)
      .in("payment_status", ["pending", "failed"])
      .order("customer_utr_at", { ascending: true }).limit(50),
    supabaseAdmin.from("upi_payment_events")
      .select("id, received_at, amount, utr, payer, raw_text, status")
      .eq("status", "unmatched").order("received_at", { ascending: false }).limit(50),
    supabaseAdmin.from("orders").select(ORDER_FIELDS).order("created_at", { ascending: false }).limit(20),
  ]);
  if (results.some((result) => result.error)) {
    return NextResponse.json({ error: "Failed to load payment overview." }, { status: 500 });
  }
  const [pending, paid, failed, review, unmatched, recent] = results;
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? BUSINESS.siteUrl).replace(/\/$/, "");
  return NextResponse.json({
    mode: activePaymentMode(),
    telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    upi: {
      payeeName: BUSINESS.upi.payeeName,
      merchantId: BUSINESS.upi.merchantId,
      personalId: BUSINESS.upi.personalId,
      routes: BUSINESS.upi.routes,
      bridgeSecretConfigured: bridgeConfigured(),
      bridgeLastSeen: await bridgeLastSeen(),
      bridgeUrl: `${siteUrl}/api/payments/upi-notify`,
    },
    razorpay: {
      keysConfigured: razorpayConfigured(),
      keyMode: razorpayMode(),
      webhookSecretConfigured: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET),
      webhookUrl: `${siteUrl}/api/webhooks/razorpay`,
    },
    pending: pending.count ?? 0, paid: paid.count ?? 0, failed: failed.count ?? 0,
    reviewOrders: review.data ?? [],
    unmatchedEvents: unmatched.data ?? [],
    recentOrders: recent.data ?? [],
  });
}
