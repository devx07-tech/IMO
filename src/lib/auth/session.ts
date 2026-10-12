import { SignJWT, jwtVerify } from "jose";

export const ADMIN_SESSION_COOKIE = "imo_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24; // 24 hours

export interface AdminSessionPayload {
  adminId: string;
  email: string;
  /** Token issue time, in seconds since epoch. */
  issuedAt: number;
}

function getSecretKey(): Uint8Array {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("ADMIN_SESSION_SECRET must be set to at least 32 characters.");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: Omit<AdminSessionPayload, "issuedAt">): Promise<string> {
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
    const { payload } = await jwtVerify(token, getSecretKey(), { algorithms: ["HS256"] });
    if (
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.iat !== "number"
    ) {
      return null;
    }
    return { adminId: payload.sub, email: payload.email, issuedAt: payload.iat };
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_MAX_AGE = SESSION_TTL_SECONDS;
