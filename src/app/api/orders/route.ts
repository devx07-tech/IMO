import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { generateUniqueOrderNumber } from "@/lib/order-number";
import { logAudit } from "@/lib/audit";
import { PAYMENT_PROVIDER } from "@/lib/payment-provider";
import { MAX_ORDER_AMOUNT_PAISE, toPaise } from "@/lib/money";
import { publicOrder } from "@/lib/public-order";
import { createRazorpayOrder, razorpayConfigured, razorpayKeyId } from "@/lib/razorpay";

const createOrderSchema = z.object({
  imoProfileId: z.string().regex(/^\d{6,15}$/, "Enter a valid Profile ID."),
  packageId: z.string().uuid(),
  quantity: z.number().int().min(1).max(10),
  whatsapp: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit WhatsApp number."),
});

export async function POST(request: NextRequest) {
  const parsed = createOrderSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }

  if (!razorpayConfigured()) {
    return NextResponse.json({ error: "Payments are temporarily unavailable. Please contact support." }, { status: 503 });
  }

  const { imoProfileId, packageId, quantity, whatsapp } = parsed.data;

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

  const amountPaise = toPaise(pkg.price) * quantity;
  // Razorpay's minimum order is ₹1.
  if (amountPaise < 100) {
    return NextResponse.json({ error: "Selected recharge package is not available." }, { status: 400 });
  }
  if (amountPaise > MAX_ORDER_AMOUNT_PAISE) {
    return NextResponse.json(
      { error: "Maximum ₹1,00,000 per payment. Please reduce the quantity." },
      { status: 400 }
    );
  }

  const orderNumber = await generateUniqueOrderNumber();
  // Persist before contacting Razorpay so a webhook can always find the order.
  const { data: order, error: insertError } = await supabaseAdmin
    .from("orders")
    .insert({
      order_number: orderNumber,
      imo_profile_id: imoProfileId,
      package_id: pkg.id,
      credits: pkg.credits,
      quantity,
      unit_price: pkg.price,
      amount: amountPaise / 100,
      customer_phone: whatsapp,
      payment_provider: PAYMENT_PROVIDER,
      payment_status: "pending",
      recharge_status: "waiting",
    })
    .select()
    .single();

  if (insertError || !order) {
    console.error("Failed to persist order", insertError);
    return NextResponse.json({ error: "Could not save your order. Please try again." }, { status: 500 });
  }

  try {
    const razorpayOrder = await createRazorpayOrder({
      amountPaise,
      receipt: orderNumber,
      notes: { order_number: orderNumber, imo_id: imoProfileId, diamonds: String(pkg.credits * quantity) },
    });
    const { data: linked, error: linkError } = await supabaseAdmin
      .from("orders")
      .update({ provider_order_id: razorpayOrder.id, updated_at: new Date().toISOString() })
      .eq("id", order.id)
      .select()
      .single();
    if (linkError || !linked) throw linkError ?? new Error("Could not link Razorpay order.");

    await logAudit({ action: "payment_checkout_created", entityType: "order", entityId: order.id,
      metadata: { provider: PAYMENT_PROVIDER, razorpayOrderId: razorpayOrder.id, amount: linked.amount } });
    return NextResponse.json({ order: publicOrder(linked, razorpayKeyId()) });
  } catch (err) {
    console.error("Razorpay order creation failed", err instanceof Error ? err.message : err);
    await supabaseAdmin.from("orders")
      .update({ payment_status: "failed", updated_at: new Date().toISOString() })
      .eq("id", order.id).eq("payment_status", "pending").is("provider_order_id", null);
    return NextResponse.json({ error: "Could not start payment. Please try again." }, { status: 502 });
  }
}
