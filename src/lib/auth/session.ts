import { SignJWT, jwtVerify } from "jose";

export const ADMIN_SESSION_COOKIE = "imo_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface AdminSessionPayload {
  adminId: string;
  email: string;
}

function getSecretKey(): Uint8Array {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new Error("ADMIN_SESSION_SECRET is not set.");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: AdminSessionPayload): Promise<string> {
  return new SignJWT({ email: payload.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.adminId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(
  token: string
): Promise<AdminSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
      return null;
    }
    return { adminId: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_MAX_AGE = SESSION_TTL_SECONDS;
