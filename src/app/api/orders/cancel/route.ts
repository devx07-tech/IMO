import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeOrderNumber } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { PAYMENT_PROVIDER } from "@/lib/payment-provider";

const schema = z.object({ orderNumber: z.string() });

/**
 * Customer cancels an order they haven't paid. Orders with a submitted UTR
 * can't be cancelled because a payment claim is being checked. If money
 * arrives later anyway it shows up as an unmatched payment for the admin.
 */
export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  const orderNumber = parsed.success ? normalizeOrderNumber(parsed.data.orderNumber) : null;
  if (!orderNumber) return NextResponse.json({ error: "Invalid order." }, { status: 400 });

  const { data: cancelled, error } = await supabaseAdmin
    .from("orders")
    .update({ payment_status: "failed", updated_at: new Date().toISOString() })
    .eq("order_number", orderNumber)
    .eq("payment_provider", PAYMENT_PROVIDER)
    .eq("payment_status", "pending")
    .is("customer_utr", null)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Could not cancel the order. Please try again." }, { status: 500 });

  if (!cancelled) {
    const { data: order } = await supabaseAdmin
      .from("orders").select("payment_status, customer_utr").eq("order_number", orderNumber).maybeSingle();
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    if (order.payment_status === "paid") {
      return NextResponse.json({ error: "This order is already paid and can't be cancelled." }, { status: 409 });
    }
    if (order.customer_utr) {
      return NextResponse.json({ error: "We're checking the payment you reported, so this order can't be cancelled." }, { status: 409 });
    }
    // Already closed (expired or cancelled before): nothing left to do.
    return NextResponse.json({ ok: true });
  }

  await logAudit({ action: "order_cancelled", entityType: "order", entityId: cancelled.id, metadata: { by: "customer" } });
  return NextResponse.json({ ok: true });
}
