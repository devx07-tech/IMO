import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/auth/current-admin";
import { logAudit, type AuditAction } from "@/lib/audit";
import { sendOrderNotification } from "@/lib/notifications/service";
import type { OrderRow, RechargeStatus } from "@/lib/db-types";

const actionSchema = z.object({
  action: z.enum(["start", "complete", "fail", "reopen"]),
});

const TRANSITIONS: Record<
  "start" | "complete" | "fail" | "reopen",
  { from: RechargeStatus; to: RechargeStatus; auditAction: AuditAction }
> = {
  start: { from: "waiting", to: "processing", auditAction: "recharge_started" },
  complete: { from: "processing", to: "completed", auditAction: "recharge_completed" },
  fail: { from: "processing", to: "failed", auditAction: "recharge_failed" },
  reopen: { from: "failed", to: "processing", auditAction: "recharge_reopened" },
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const { admin } = auth;
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  const transition = TRANSITIONS[parsed.data.action];

  const { data: order, error: fetchError } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  if (order.payment_status !== "paid") {
    return NextResponse.json(
      { error: "Only paid orders can move through the recharge queue." },
      { status: 400 }
    );
  }

  if (order.recharge_status !== transition.from) {
    return NextResponse.json(
      {
        error: `Cannot perform this action: order is currently "${order.recharge_status}", expected "${transition.from}".`,
      },
      { status: 409 }
    );
  }

  const updates: Partial<OrderRow> = {
    recharge_status: transition.to,
    updated_at: new Date().toISOString(),
  };
  if (transition.to === "completed") {
    updates.completed_at = new Date().toISOString();
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("orders")
    .update(updates)
    .eq("id", id)
    .eq("recharge_status", transition.from)
    .select()
    .maybeSingle();

  if (updateError || !updated) {
    return NextResponse.json(
      { error: "Could not update recharge status. It may have just changed — refresh and try again." },
      { status: 409 }
    );
  }

  await logAudit({
    adminId: admin.adminId,
    action: transition.auditAction,
    entityType: "order",
    entityId: id,
    metadata: { from: transition.from, to: transition.to },
  });

  if (transition.to === "completed") {
    await sendOrderNotification("recharge_completed", updated, "telegram");
  }

  return NextResponse.json({ order: updated });
}
