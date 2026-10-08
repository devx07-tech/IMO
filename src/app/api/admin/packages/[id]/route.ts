import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { logAudit } from "@/lib/audit";
import type { PackageRow } from "@/lib/db-types";

const updateSchema = z.object({
  credits: z.number().int().positive().optional(),
  price: z.number().positive().optional(),
  displayOrder: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = await getCurrentAdmin();
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Invalid package update." }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin
    .from("packages")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Package not found." }, { status: 404 });
  }

  const updates: Partial<PackageRow> = { updated_at: new Date().toISOString() };
  if (parsed.data.credits !== undefined) updates.credits = parsed.data.credits;
  if (parsed.data.price !== undefined) updates.price = parsed.data.price;
  if (parsed.data.displayOrder !== undefined) updates.display_order = parsed.data.displayOrder;
  if (parsed.data.active !== undefined) updates.active = parsed.data.active;

  const { data: updated, error } = await supabaseAdmin
    .from("packages")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: "Failed to update package." }, { status: 500 });
  }

  const statusChanged = parsed.data.active !== undefined && parsed.data.active !== existing.active;
  await logAudit({
    adminId: admin?.adminId,
    action: statusChanged
      ? parsed.data.active
        ? "package_activated"
        : "package_disabled"
      : "package_updated",
    entityType: "package",
    entityId: id,
    metadata: parsed.data,
  });

  return NextResponse.json({ package: updated });
}
