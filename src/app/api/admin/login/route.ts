import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyPassword } from "@/lib/auth/password";
import { ADMIN_SESSION_COOKIE, SESSION_COOKIE_MAX_AGE, createSessionToken } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email and password." }, { status: 400 });
  }

  const { email, password } = parsed.data;

  const { data: admin } = await supabaseAdmin
    .from("admins")
    .select("*")
    .eq("email", email.toLowerCase())
    .maybeSingle();

  const passwordOk = admin ? await verifyPassword(password, admin.password_hash) : false;

  if (!admin || !passwordOk) {
    await logAudit({
      action: "admin_login_failed",
      entityType: "admin",
      metadata: { email },
    });
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const token = await createSessionToken({ adminId: admin.id, email: admin.email });

  await supabaseAdmin
    .from("admins")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", admin.id);

  await logAudit({
    adminId: admin.id,
    action: "admin_login",
    entityType: "admin",
    entityId: admin.id,
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE,
  });
  return response;
}
