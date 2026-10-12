import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "../supabase-admin";
import { ADMIN_SESSION_COOKIE, verifySessionToken, type AdminSessionPayload } from "./session";

/**
 * Returns the signed-in admin, or null. Beyond the JWT signature check (which
 * the proxy also does), this confirms the admin still exists and the token
 * wasn't issued before their sessions were revoked (logout / password reset).
 */
export async function getCurrentAdmin(): Promise<AdminSessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await verifySessionToken(token);
  if (!session) return null;

  const { data: admin, error } = await supabaseAdmin
    .from("admins")
    .select("id, sessions_valid_after")
    .eq("id", session.adminId)
    .maybeSingle();

  if (error || !admin) return null;

  const validAfterSeconds = Math.floor(new Date(admin.sessions_valid_after).getTime() / 1000);
  if (session.issuedAt < validAfterSeconds) return null;

  return session;
}

/**
 * For admin route handlers: auth is enforced here as well as in the proxy so
 * a proxy misconfiguration (or matcher gap) can't expose admin APIs.
 */
export async function requireAdmin(): Promise<
  { admin: AdminSessionPayload; response?: never } | { admin?: never; response: NextResponse }
> {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return { response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  }
  return { admin };
}
