import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { generateUniqueOrderNumber } from "@/lib/order-number";
import { createCashfreeOrder } from "@/lib/cashfree";

const createOrderSchema = z.object({
  imoProfileId: z.string().regex(/^\d{6,15}$/, "Enter a valid Profile ID."),
  packageId: z.string().uuid(),
  quantity: z.number().int().min(1).max(10),
  customerPhone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number."),
});

export async function POST(request: NextRequest) {
  const parsed = createOrderSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }

  const { imoProfileId, packageId, quantity, customerPhone } = parsed.data;

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

  const amount = Number((pkg.price * quantity).toFixed(2));
  const orderNumber = await generateUniqueOrderNumber();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  let cashfreeOrder;
  try {
    cashfreeOrder = await createCashfreeOrder({
      orderId: orderNumber,
      amount,
      customerId: imoProfileId,
      customerPhone,
      returnUrl: `${siteUrl}/?order=${orderNumber}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Payment gateway error.";
    console.error("Cashfree order creation failed", message);
    return NextResponse.json(
      { error: "Could not start payment. Please try again." },
      { status: 502 }
    );
  }

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
      payment_provider: "cashfree",
      payment_status: "pending",
      provider_order_id: cashfreeOrder.cf_order_id,
      recharge_status: "waiting",
    })
    .select()
    .single();

  if (insertError || !order) {
    console.error("Failed to persist order after Cashfree order creation", insertError);
    return NextResponse.json(
      { error: "Could not save your order. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    orderNumber: order.order_number,
    paymentSessionId: cashfreeOrder.payment_session_id,
    cashfreeEnv: process.env.CASHFREE_ENV === "production" ? "production" : "sandbox",
  });
}
