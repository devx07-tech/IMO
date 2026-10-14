import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/auth/current-admin";
import { logAudit } from "@/lib/audit";
import { normalizeOrderNumber } from "@/lib/validation";
import { PAYMENT_PROVIDER } from "@/lib/payment-provider";
import { confirmUpiPayment } from "@/lib/upi-payments";
import { toPaise } from "@/lib/upi";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("attach"), orderNumber: z.string() }),
  z.object({ action: z.literal("dismiss") }),
]);

/** Resolve a received payment that matched no order: attach it to an order, or dismiss it. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid action." }, { status: 400 });

  const { data: event, error } = await supabaseAdmin
    .from("upi_payment_events").select("*").eq("id", id).maybeSingle();
  if (error || !event) return NextResponse.json({ error: "Payment not found." }, { status: 404 });
  if (event.status !== "unmatched") {
    return NextResponse.json({ error: "This payment has already been resolved." }, { status: 409 });
  }

  if (parsed.data.action === "dismiss") {
    await supabaseAdmin.from("upi_payment_events")
      .update({ status: "dismissed", resolved_at: new Date().toISOString() })
      .eq("id", id).eq("status", "unmatched");
    await logAudit({ adminId: auth.admin.adminId, action: "payment_event_dismissed", entityType: "payment_event", entityId: id,
      metadata: { amount: event.amount, utr: event.utr } });
    return NextResponse.json({ ok: true });
  }

  const orderNumber = normalizeOrderNumber(parsed.data.orderNumber);
  if (!orderNumber) return NextResponse.json({ error: "Enter a valid Order ID." }, { status: 400 });
  const { data: order } = await supabaseAdmin
    .from("orders").select("*").eq("order_number", orderNumber).maybeSingle();
  if (!order || order.payment_provider !== PAYMENT_PROVIDER) {
    return NextResponse.json({ error: "UPI order not found." }, { status: 404 });
  }
  // The money received must cover the order; never attach a smaller payment.
  if (toPaise(event.amount ?? 0) < toPaise(order.amount)) {
    return NextResponse.json({ error: `Received ₹${event.amount} is less than the order amount ₹${order.amount}.` }, { status: 409 });
  }

  const result = await confirmUpiPayment({
    order, source: "admin", utr: event.utr, eventId: event.id, adminId: auth.admin.adminId,
    allowFromStatus: ["pending", "failed"],
  });
  if ("error" in result) {
    return NextResponse.json({
      error: result.error === "utr_used"
        ? "This UTR already confirmed another order."
        : "That order is not waiting for payment.",
    }, { status: 409 });
  }
  return NextResponse.json({ order: result.order });
}
