import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/auth/session";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { logAudit } from "@/lib/audit";

export async function POST() {
  const admin = await getCurrentAdmin();
  if (admin) {
    await logAudit({
      adminId: admin.adminId,
      action: "admin_logout",
      entityType: "admin",
      entityId: admin.adminId,
    });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.delete(ADMIN_SESSION_COOKIE);
  return response;
}
