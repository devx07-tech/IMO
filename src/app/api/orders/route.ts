import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { generateUniqueOrderNumber } from "@/lib/order-number";
import { logAudit } from "@/lib/audit";
import {
  activePaymentMode, GATEWAY_PAYMENT_WINDOW_SECONDS, GATEWAY_PROVIDER, RAZORPAY_PROVIDER, UPI_PROVIDER,
} from "@/lib/payment-provider";
import { MAX_ORDER_AMOUNT_PAISE, toPaise } from "@/lib/money";
import { publicOrder } from "@/lib/public-order";
import { createRazorpayOrder, razorpayConfigured, razorpayKeyId } from "@/lib/razorpay";
import { expireStaleOrders, insertUpiOrder, PaymentsBusyError } from "@/lib/upi-payments";
import { createGatewayOrder, gatewayConfigured } from "@/lib/dghost";
import { BUSINESS } from "@/lib/business";

const createOrderSchema = z.object({
  imoProfileId: z.string().regex(/^\d{6,15}$/, "Enter a valid Profile ID."),
  packageId: z.string().uuid(),
  quantity: z.number().int().min(1).max(10),
  // Optional: the checkout no longer asks for it, but an API caller may send one.
  whatsapp: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit WhatsApp number.").optional(),
});

export async function POST(request: NextRequest) {
  const parsed = createOrderSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }

  const mode = activePaymentMode();
  if ((mode === RAZORPAY_PROVIDER && !razorpayConfigured()) || (mode === GATEWAY_PROVIDER && !gatewayConfigured())) {
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
  // The gateways' minimum is ₹1; UPI orders also take up to 99 paise off.
  if (amountPaise < 200) {
    return NextResponse.json({ error: "Selected recharge package is not available." }, { status: 400 });
  }
  if (amountPaise > MAX_ORDER_AMOUNT_PAISE) {
    return NextResponse.json(
      { error: "Maximum ₹1,00,000 per payment. Please reduce the quantity." },
      { status: 400 }
    );
  }

  const base = {
    order_number: await generateUniqueOrderNumber(),
    imo_profile_id: imoProfileId,
    package_id: pkg.id,
    credits: pkg.credits,
    quantity,
    unit_price: pkg.price,
    customer_phone: whatsapp ?? null,
  };

  if (mode === UPI_PROVIDER) {
    try {
      await expireStaleOrders();
      const order = await insertUpiOrder(base, amountPaise);
      await logAudit({ action: "payment_checkout_created", entityType: "order", entityId: order.id,
        metadata: { provider: UPI_PROVIDER, amount: order.amount } });
      return NextResponse.json({ order: publicOrder(order) });
    } catch (err) {
      if (err instanceof PaymentsBusyError) {
        return NextResponse.json(
          { error: "Many payments are in progress right now. Please try again in a few minutes." },
          { status: 503 }
        );
      }
      console.error("Failed to create UPI order", err);
      return NextResponse.json({ error: "Could not save your order. Please try again." }, { status: 500 });
    }
  }

  // Persist before contacting the gateway so a webhook can always find the order.
  const { data: order, error: insertError } = await supabaseAdmin
    .from("orders")
    .insert({
      ...base,
      amount: amountPaise / 100,
      payment_provider: mode,
      payment_status: "pending",
      recharge_status: "waiting",
    })
    .select()
    .single();

  if (insertError || !order) {
    console.error("Failed to persist order", insertError);
    return NextResponse.json({ error: "Could not save your order. Please try again." }, { status: 500 });
  }

  if (mode === GATEWAY_PROVIDER) {
    const diamonds = (pkg.credits * quantity).toLocaleString("en-IN");
    const siteUrl = BUSINESS.siteUrl;
    try {
      const paymentUrl = await createGatewayOrder({
        orderNumber: base.order_number,
        amountPaise,
        // The gateway requires a mobile number; the checkout doesn't ask for one.
        mobile: whatsapp ?? BUSINESS.phone,
        // The checkout resumes the order from ?order= and asks the gateway for its status.
        redirectUrl: `${siteUrl}/?order=${encodeURIComponent(base.order_number)}`,
        title: BUSINESS.brand,
        description: `${diamonds} IMO diamonds`,
        expirySeconds: GATEWAY_PAYMENT_WINDOW_SECONDS,
      });
      // provider_order_id holds the gateway's hosted payment page for this order.
      const { data: linked, error: linkError } = await supabaseAdmin
        .from("orders")
        .update({ provider_order_id: paymentUrl, updated_at: new Date().toISOString() })
        .eq("id", order.id)
        .select()
        .single();
      if (linkError || !linked) throw linkError ?? new Error("Could not link gateway order.");

      await logAudit({ action: "payment_checkout_created", entityType: "order", entityId: order.id,
        metadata: { provider: GATEWAY_PROVIDER, amount: linked.amount } });
      return NextResponse.json({ order: publicOrder(linked) });
    } catch (err) {
      console.error("Gateway order creation failed", err instanceof Error ? err.message : err);
      await supabaseAdmin.from("orders")
        .update({ payment_status: "failed", updated_at: new Date().toISOString() })
        .eq("id", order.id).eq("payment_status", "pending").is("provider_order_id", null);
      return NextResponse.json({ error: "Could not start payment. Please try again." }, { status: 502 });
    }
  }

  try {
    const razorpayOrder = await createRazorpayOrder({
      amountPaise,
      receipt: base.order_number,
      notes: { order_number: base.order_number, imo_id: imoProfileId, diamonds: String(pkg.credits * quantity) },
    });
    const { data: linked, error: linkError } = await supabaseAdmin
      .from("orders")
      .update({ provider_order_id: razorpayOrder.id, updated_at: new Date().toISOString() })
      .eq("id", order.id)
      .select()
      .single();
    if (linkError || !linked) throw linkError ?? new Error("Could not link Razorpay order.");

    await logAudit({ action: "payment_checkout_created", entityType: "order", entityId: order.id,
      metadata: { provider: RAZORPAY_PROVIDER, razorpayOrderId: razorpayOrder.id, amount: linked.amount } });
    return NextResponse.json({ order: publicOrder(linked, razorpayKeyId()) });
  } catch (err) {
    console.error("Razorpay order creation failed", err instanceof Error ? err.message : err);
    await supabaseAdmin.from("orders")
      .update({ payment_status: "failed", updated_at: new Date().toISOString() })
      .eq("id", order.id).eq("payment_status", "pending").is("provider_order_id", null);
    return NextResponse.json({ error: "Could not start payment. Please try again." }, { status: 502 });
  }
}
