import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { processBridgeMessage, verifyBridgeToken } from "@/lib/upi-payments";

export const runtime = "nodejs";

// Forwarders send either JSON ({ title, text, app }) or the plain message text.
const jsonSchema = z.object({
  title: z.string().max(500).optional(),
  text: z.string().max(2000),
  app: z.string().max(100).optional(),
});

/**
 * Payment bridge: the Android phone signed in to Paytm for Business forwards
 * every payment notification here with `Authorization: Bearer <UPI_BRIDGE_SECRET>`.
 */
export async function POST(request: NextRequest) {
  if (!verifyBridgeToken(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const raw = await request.text();
  if (raw.length > 4000) return NextResponse.json({ error: "Message too large." }, { status: 413 });

  let text = raw.trim();
  let source = "bridge";
  if (text.startsWith("{")) {
    let parsedJson: unknown = null;
    try { parsedJson = JSON.parse(text); } catch { /* handled below */ }
    const parsed = jsonSchema.safeParse(parsedJson);
    if (!parsed.success) return NextResponse.json({ error: "Invalid message." }, { status: 400 });
    text = [parsed.data.title, parsed.data.text].filter(Boolean).join(" - ");
    if (parsed.data.app) source = `bridge:${parsed.data.app}`.slice(0, 100);
  }
  if (!text) return NextResponse.json({ error: "Empty message." }, { status: 400 });

  try {
    const result = await processBridgeMessage(text, source);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error("Payment bridge message failed", err);
    // 500 lets the forwarder app retry.
    return NextResponse.json({ error: "Could not process message." }, { status: 500 });
  }
}
