import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/auth/current-admin";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const { data, error } = await supabaseAdmin
    .from("packages")
    .select("*")
    .order("display_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to load packages." }, { status: 500 });
  }

  return NextResponse.json({ packages: data });
}

const createSchema = z.object({
  credits: z.number().int().positive(),
  price: z.number().positive(),
  displayOrder: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const { admin } = auth;
  const parsed = createSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid package data." },
      { status: 400 }
    );
  }

  const { credits, price, displayOrder, active } = parsed.data;

  const { data: pkg, error } = await supabaseAdmin
    .from("packages")
    .insert({ credits, price, display_order: displayOrder, active })
    .select()
    .single();

  if (error || !pkg) {
    return NextResponse.json({ error: "Failed to create package." }, { status: 500 });
  }

  await logAudit({
    adminId: admin.adminId,
    action: "package_created",
    entityType: "package",
    entityId: pkg.id,
    metadata: { credits, price },
  });

  // Customers see the new price list immediately, not after the ISR window.
  revalidatePath("/");

  return NextResponse.json({ package: pkg }, { status: 201 });
}
