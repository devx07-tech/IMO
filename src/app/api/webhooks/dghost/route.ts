import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeOrderNumber } from "@/lib/validation";
import { gatewayConfigured } from "@/lib/dghost";
import { syncOrderWithGateway } from "@/lib/payments";
import { GATEWAY_PROVIDER } from "@/lib/payment-provider";

export const runtime = "nodejs";

/** order_id from a JSON or form-encoded callback body, or the query string. */
async function callbackOrderId(request: NextRequest): Promise<string | null> {
  const fromQuery = request.nextUrl.searchParams.get("order_id");
  if (request.method !== "POST") return fromQuery;
  const raw = await request.text();
  try {
    type Ids = { order_id?: unknown; orderId?: unknown };
    const json = JSON.parse(raw) as Ids & { result?: Ids };
    // Flat, or wrapped in `result` like the status API.
    const id = json?.order_id ?? json?.orderId ?? json?.result?.order_id ?? json?.result?.orderId;
    if (typeof id === "string") return id;
  } catch { /* not JSON */ }
  const form = new URLSearchParams(raw);
  return form.get("order_id") ?? form.get("orderId") ?? fromQuery;
}

/**
 * dghost payment callback. The gateway doesn't sign callbacks, so the body is
 * only a hint: the order's status is fetched from check-order-status and
 * confirmed from that. Safe to receive repeatedly or from anyone.
 */
async function handle(request: NextRequest) {
  if (!gatewayConfigured()) return NextResponse.json({ error: "Gateway not configured." }, { status: 503 });
  const orderNumber = normalizeOrderNumber(await callbackOrderId(request));
  if (!orderNumber) return NextResponse.json({ ok: true, note: "No order on this site." });

  const { data: order, error } = await supabaseAdmin
    .from("orders").select("*").eq("order_number", orderNumber).maybeSingle();
  if (error) return NextResponse.json({ error: "Order lookup failed." }, { status: 500 });
  if (!order || order.payment_provider !== GATEWAY_PROVIDER) {
    return NextResponse.json({ ok: true, note: "No order on this site." });
  }

  try {
    const updated = await syncOrderWithGateway(order, "webhook");
    return NextResponse.json({ ok: true, paymentStatus: updated.payment_status });
  } catch (err) {
    console.error("Gateway webhook processing failed", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Processing failed." }, { status: 500 });
  }
}

export const POST = handle;
export const GET = handle;
