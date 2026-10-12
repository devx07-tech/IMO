import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/auth/session";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logAudit } from "@/lib/audit";

export async function POST() {
  const admin = await getCurrentAdmin();
  if (admin) {
    // Server-side revocation: a copied/stolen cookie stops working too, not
    // just the one in this browser. This signs the admin out on every device.
    await supabaseAdmin
      .from("admins")
      .update({ sessions_valid_after: new Date().toISOString() })
      .eq("id", admin.adminId);

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
