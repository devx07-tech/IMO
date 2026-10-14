import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { generateUniqueOrderNumber } from "@/lib/order-number";
import { logAudit } from "@/lib/audit";
import { expireStaleOrders, insertUpiOrder, PaymentsBusyError } from "@/lib/upi-payments";
import { MAX_UPI_AMOUNT_PAISE, toPaise } from "@/lib/upi";
import { publicOrder } from "@/lib/public-order";

const createOrderSchema = z.object({
  imoProfileId: z.string().regex(/^\d{6,15}$/, "Enter a valid Profile ID."),
  packageId: z.string().uuid(),
  quantity: z.number().int().min(1).max(10),
});

export async function POST(request: NextRequest) {
  const parsed = createOrderSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }

  const { imoProfileId, packageId, quantity } = parsed.data;

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

  const totalPaise = toPaise(pkg.price) * quantity;
  if (totalPaise > MAX_UPI_AMOUNT_PAISE) {
    return NextResponse.json(
      { error: "UPI allows up to ₹1,00,000 per payment. Please reduce the quantity." },
      { status: 400 }
    );
  }

  try {
    await expireStaleOrders();
    const order = await insertUpiOrder({
      order_number: await generateUniqueOrderNumber(),
      imo_profile_id: imoProfileId,
      package_id: pkg.id,
      credits: pkg.credits,
      quantity,
      unit_price: pkg.price,
    }, totalPaise);

    await logAudit({ action: "payment_checkout_created", entityType: "order", entityId: order.id,
      metadata: { provider: order.payment_provider, amount: order.amount } });
    return NextResponse.json({ order: publicOrder(order) });
  } catch (err) {
    if (err instanceof PaymentsBusyError) {
      return NextResponse.json(
        { error: "Many payments are in progress right now. Please try again in a few minutes." },
        { status: 503 }
      );
    }
    console.error("Failed to create UPI order", err);
    return NextResponse.json(
      { error: "Could not save your order. Please try again." },
      { status: 500 }
    );
  }
}
