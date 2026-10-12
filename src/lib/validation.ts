// Pure input helpers shared by route handlers, the proxy and client pages.
// Kept dependency-free so they can be unit tested and imported anywhere.

// Legacy orders use IMO-12345; new orders use IMO- plus 10 Crockford base32 chars.
const ORDER_NUMBER_RE = /^IMO-[0-9A-Z]{5,12}$/;

/** Upper-cases and validates a customer-typed order number, or returns null. */
export function normalizeOrderNumber(input: string | null | undefined): string | null {
  const value = input?.trim().toUpperCase();
  if (!value || !ORDER_NUMBER_RE.test(value)) return null;
  return value;
}

/**
 * Only allows post-login redirects to admin pages on this origin. Rejects
 * absolute URLs, protocol-relative `//host` and backslash tricks.
 */
export function safeAdminRedirect(next: string | null | undefined): string {
  if (!next || !next.startsWith("/admin") || next.includes("\\") || next.startsWith("//")) {
    return "/admin";
  }
  return next;
}

/**
 * Strips everything except characters that appear in order numbers and
 * profile IDs, so admin search text can't inject PostgREST filter syntax
 * (commas, parentheses, dots) or LIKE wildcards into `.or()` / `.ilike()`.
 */
export function sanitizeSearch(input: string | null | undefined): string {
  return (input ?? "").replace(/[^0-9A-Za-z-]/g, "").slice(0, 40);
}

/** Parses a non-negative integer query param, clamped to max. */
export function parseIntParam(value: string | null, fallback: number, max: number): number {
  const n = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(n, max);
}

/**
 * Best client IP available. Vercel sets x-real-ip itself (clients can't
 * override it); the first x-forwarded-for hop is the fallback elsewhere.
 */
export function getClientIp(headers: Headers): string {
  return (
    headers.get("x-real-ip")?.trim() ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}
