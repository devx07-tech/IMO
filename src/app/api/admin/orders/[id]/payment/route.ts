import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/auth/current-admin";
import { logAudit } from "@/lib/audit";
import { PAYMENT_PROVIDER } from "@/lib/payment-provider";
import { confirmUpiPayment } from "@/lib/upi-payments";

const schema = z.object({ action: z.enum(["approve", "reject"]) });

/**
 * Manual payment decision for a UPI order, made after checking Paytm for
 * Business. Approve marks it paid (using the customer's UTR, if any); reject
 * closes it and clears the claim.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid action." }, { status: 400 });

  const { data: order, error } = await supabaseAdmin.from("orders").select("*").eq("id", id).maybeSingle();
  if (error || !order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  if (order.payment_provider !== PAYMENT_PROVIDER) {
    return NextResponse.json({ error: "Only UPI orders can be reviewed here." }, { status: 400 });
  }
  if (order.payment_status !== "pending" && order.payment_status !== "failed") {
    return NextResponse.json({ error: `Payment is already ${order.payment_status}.` }, { status: 409 });
  }

  if (parsed.data.action === "approve") {
    const utr = order.customer_utr;
    const { data: event } = utr
      ? await supabaseAdmin.from("upi_payment_events").select("id, status").eq("utr", utr).maybeSingle()
      : { data: null };
    const result = await confirmUpiPayment({
      order, source: "admin", utr, adminId: auth.admin.adminId,
      eventId: event?.status === "unmatched" ? event.id : null,
      allowFromStatus: ["pending", "failed"],
    });
    if ("error" in result) {
      return NextResponse.json({
        error: result.error === "utr_used"
          ? "This UTR already confirmed another order. Do not approve."
          : "Payment status just changed. Refresh and try again.",
      }, { status: 409 });
    }
    return NextResponse.json({ order: result.order });
  }

  const { data: updated, error: updateError } = await supabaseAdmin.from("orders")
    .update({ payment_status: "failed", customer_utr: null, customer_utr_at: null, updated_at: new Date().toISOString() })
    .eq("id", id).in("payment_status", ["pending", "failed"]).select().maybeSingle();
  if (updateError || !updated) {
    return NextResponse.json({ error: "Payment status just changed. Refresh and try again." }, { status: 409 });
  }
  await logAudit({ adminId: auth.admin.adminId, action: "payment_rejected", entityType: "order", entityId: id,
    metadata: { rejectedUtr: order.customer_utr, amount: order.amount } });
  return NextResponse.json({ order: updated });
}
