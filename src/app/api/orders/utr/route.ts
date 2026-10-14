import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeOrderNumber } from "@/lib/validation";
import { normalizeUtr } from "@/lib/upi";
import { publicOrder } from "@/lib/public-order";
import { submitCustomerUtr } from "@/lib/upi-payments";

const schema = z.object({ orderNumber: z.string(), utr: z.string().max(40) });

/** Customer submits the 12-digit UPI reference after paying. */
export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  const orderNumber = parsed.success ? normalizeOrderNumber(parsed.data.orderNumber) : null;
  const utr = parsed.success ? normalizeUtr(parsed.data.utr) : null;
  if (!orderNumber) return NextResponse.json({ error: "Invalid order." }, { status: 400 });
  if (!utr) {
    return NextResponse.json({ error: "Enter the 12-digit UPI reference number (UTR)." }, { status: 400 });
  }

  const { data: order, error } = await supabaseAdmin
    .from("orders").select("*").eq("order_number", orderNumber).maybeSingle();
  if (error) return NextResponse.json({ error: "Could not check your order." }, { status: 500 });
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  try {
    const result = await submitCustomerUtr(order, utr);
    if (result.status === "rejected") {
      return NextResponse.json({ error: result.reason }, { status: 409 });
    }
    return NextResponse.json({ status: result.status, order: publicOrder(result.order) });
  } catch (err) {
    console.error("UTR submission failed", err);
    return NextResponse.json({ error: "Could not submit your UTR. Please try again." }, { status: 500 });
  }
}
