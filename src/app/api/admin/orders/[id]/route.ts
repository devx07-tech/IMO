import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/auth/current-admin";
import { logAudit } from "@/lib/audit";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const { id } = await params;

  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const { data: auditLogs } = await supabaseAdmin
    .from("audit_logs")
    .select("*")
    .eq("entity_type", "order")
    .eq("entity_id", id)
    .order("created_at", { ascending: false });

  const { data: notifications } = await supabaseAdmin
    .from("notifications")
    .select("*")
    .eq("order_id", id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ order, auditLogs: auditLogs ?? [], notifications: notifications ?? [] });
}

const updateSchema = z.object({
  adminNotes: z.string().max(2000),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const { admin } = auth;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .update({ admin_notes: parsed.data.adminNotes, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error || !order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  await logAudit({
    adminId: admin.adminId,
    action: "order_note_updated",
    entityType: "order",
    entityId: id,
  });

  return NextResponse.json({ order });
}
