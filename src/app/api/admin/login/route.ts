import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyPassword } from "@/lib/auth/password";
import { ADMIN_SESSION_COOKIE, SESSION_COOKIE_MAX_AGE, createSessionToken } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});

// bcrypt hash of a random throwaway string. Comparing against it when the
// email is unknown keeps response time the same, so timing can't reveal
// which admin emails exist.
const DUMMY_HASH = "$2b$12$SUOCf9mJn3Eh30/kLvaJ/.Wnx3x.JgVXY7ekHIGoUegcZJeOLSl/6";

export async function POST(request: NextRequest) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email and password." }, { status: 400 });
  }

  const { password } = parsed.data;
  const email = parsed.data.email.toLowerCase();

  // Per-account limit on top of the proxy's per-IP limit, so a distributed
  // attacker can't brute-force one admin's password from many IPs.
  const limit = await rateLimit(`login-email:${email}`, 10, 60 * 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many sign-in attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  const { data: admin } = await supabaseAdmin
    .from("admins")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  const passwordOk = await verifyPassword(password, admin?.password_hash ?? DUMMY_HASH);

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
