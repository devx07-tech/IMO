import { NextRequest, NextResponse } from "next/server";
import { retryNotification } from "@/lib/notifications/service";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { logAudit } from "@/lib/audit";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = await getCurrentAdmin();

  const result = await retryNotification(id);

  await logAudit({
    adminId: admin?.adminId,
    action: "notification_retried",
    entityType: "notification",
    entityId: id,
    metadata: { ok: result.ok, error: result.error },
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Retry failed." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
