import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/validation";

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/admin/:path*",
    "/api/orders",
    "/api/orders/lookup",
    "/api/orders/verify",
    "/api/orders/pay",
    "/api/orders/utr",
    "/api/orders/cancel",
    "/api/payments/upi-notify",
    "/api/webhooks/dghost",
  ],
};

const MINUTE = 60_000;

function tooMany(retryAfter: number) {
  return NextResponse.json(
    { error: "Too many requests. Please try again shortly." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}

/**
 * CSRF defence for cookie-authenticated admin mutations: browsers always send
 * Origin on cross-site POST/PATCH/DELETE, so reject any that isn't ours.
 */
function isCrossSiteMutation(request: NextRequest): boolean {
  if (request.method === "GET" || request.method === "HEAD") return false;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== request.nextUrl.host;
  } catch {
    return true;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const ip = getClientIp(request.headers);

  if (pathname === "/api/orders" && request.method === "POST") {
    const r = await rateLimit(`orders:${ip}`, 10, MINUTE);
    if (!r.ok) return tooMany(r.retryAfter);
  }
  if (pathname === "/api/orders/lookup") {
    const r = await rateLimit(`lookup:${ip}`, 20, MINUTE);
    if (!r.ok) return tooMany(r.retryAfter);
  }
  if (pathname === "/api/orders/verify") {
    // The checkout polls this every few seconds while a payment is confirmed.
    const r = await rateLimit(`verify:${ip}`, 120, MINUTE);
    if (!r.ok) return tooMany(r.retryAfter);
  }
  if (pathname === "/api/orders/pay" && request.method === "POST") {
    const r = await rateLimit(`pay:${ip}`, 20, MINUTE);
    if (!r.ok) return tooMany(r.retryAfter);
  }
  if (pathname === "/api/orders/utr") {
    // Slows down guessing UTRs against open orders.
    const r = await rateLimit(`utr:${ip}`, 6, 10 * MINUTE);
    if (!r.ok) return tooMany(r.retryAfter);
  }
  if (pathname === "/api/orders/cancel") {
    const r = await rateLimit(`cancel:${ip}`, 10, 10 * MINUTE);
    if (!r.ok) return tooMany(r.retryAfter);
  }
  if (pathname === "/api/payments/upi-notify") {
    const r = await rateLimit(`bridge:${ip}`, 120, MINUTE);
    if (!r.ok) return tooMany(r.retryAfter);
    // Authenticated by its own bearer secret in the route handler.
    return NextResponse.next();
  }
  if (pathname === "/api/webhooks/dghost") {
    // Each callback triggers a status check with the gateway.
    const r = await rateLimit(`dghost:${ip}`, 60, MINUTE);
    if (!r.ok) return tooMany(r.retryAfter);
    // Public: the route re-checks every callback with the gateway.
    return NextResponse.next();
  }
  if (pathname === "/api/admin/login" && request.method === "POST") {
    const r = await rateLimit(`login:${ip}`, 5, 10 * MINUTE);
    if (!r.ok) return tooMany(r.retryAfter);
  }

  if (pathname.startsWith("/api/orders")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/admin/") && isCrossSiteMutation(request)) {
    return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });
  }

  const isPublicAdminRoute =
    pathname === "/admin/login" || pathname === "/api/admin/login";

  if (isPublicAdminRoute) {
    return NextResponse.next();
  }

  // Fast signature/expiry check at the edge. Route handlers and the admin
  // layout additionally check revocation against the database.
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}
