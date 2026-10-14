import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { generateUniqueOrderNumber } from "@/lib/order-number";
import { baseupiConfigured, createBaseupiOrder } from "@/lib/baseupi";
import { logAudit } from "@/lib/audit";

const createOrderSchema = z.object({
  imoProfileId: z.string().regex(/^\d{6,15}$/, "Enter a valid Profile ID."),
  packageId: z.string().uuid(),
  quantity: z.number().int().min(1).max(10),
  customerEmail: z.string().trim().email().max(254),
  customerPhone: z
    .string()
    .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number.")
    .optional(),
});

export async function POST(request: NextRequest) {
  const parsed = createOrderSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }

  if (!baseupiConfigured()) {
    return NextResponse.json({ error: "Payments are temporarily unavailable. Please contact support." }, { status: 503 });
  }
  const { imoProfileId, packageId, quantity, customerEmail } = parsed.data;

  const { data: pkg, error: pkgError } = await supabaseAdmin
    .from("packages")
    .select("*")
    .eq("id", packageId)
    .eq("active", true)
    .maybeSingle();

  if (pkgError || !pkg) {
    return NextResponse.json(
      { error: "Selected recharge package is not available." },
      { status: 400 }
    );
  }

  const amount = Math.round(Number(pkg.price) * 100) * quantity / 100;
  const orderNumber = await generateUniqueOrderNumber();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  // Persist before contacting the provider so an early webhook can find the order.
  const { data: order, error: insertError } = await supabaseAdmin
    .from("orders")
    .insert({
      order_number: orderNumber,
      imo_profile_id: imoProfileId,
      package_id: pkg.id,
      credits: pkg.credits,
      quantity,
      unit_price: pkg.price,
      amount,
      payment_provider: "baseupi",
      payment_status: "pending",
      recharge_status: "waiting",
    })
    .select()
    .single();

  if (insertError || !order) {
    console.error("Failed to persist payment order", insertError);
    return NextResponse.json(
      { error: "Could not save your order. Please try again." },
      { status: 500 }
    );
  }

  try {
    const gatewayOrder = await createBaseupiOrder({
      orderNumber, unitPrice: Number(pkg.price), quantity, credits: pkg.credits,
      customerEmail, returnUrl: `${siteUrl}/?order=${orderNumber}`,
    });
    const { error: linkError } = await supabaseAdmin.from("orders")
      .update({ provider_order_id: gatewayOrder.publicOrderId }).eq("id", order.id);
    if (linkError) throw new Error("Could not link provider order.");
    await logAudit({ action: "payment_checkout_created", entityType: "order", entityId: order.id,
      metadata: { provider: "baseupi", providerOrderId: gatewayOrder.publicOrderId, amount } });
    return NextResponse.json({ orderNumber, checkoutUrl: gatewayOrder.checkoutUrl });
  } catch (err) {
    // Leave ambiguous gateway failures pending: a delayed signed webhook may still arrive.
    console.error("BaseUPI order creation failed", err instanceof Error ? err.name : "Unknown error");
    await logAudit({ action: "payment_checkout_failed", entityType: "order", entityId: order.id,
      metadata: { provider: "baseupi" } });
    return NextResponse.json({ error: "Could not start payment. Please try again.", orderNumber }, { status: 502 });
  }
}
