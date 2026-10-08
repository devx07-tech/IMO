import "server-only";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, verifySessionToken, type AdminSessionPayload } from "./session";

export async function getCurrentAdmin(): Promise<AdminSessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
