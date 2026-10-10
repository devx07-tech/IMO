import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/api/orders", "/api/orders/lookup"],
};

function tooMany(retryAfter: number) {
  return NextResponse.json(
    { error: "Too many requests. Please try again shortly." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  if (pathname === "/api/orders" && request.method === "POST") {
    const r = rateLimit(`orders:${ip}`, 10, 60_000);
    if (!r.ok) return tooMany(r.retryAfter);
  }
  if (pathname === "/api/orders/lookup") {
    const r = rateLimit(`lookup:${ip}`, 20, 60_000);
    if (!r.ok) return tooMany(r.retryAfter);
  }
  if (pathname === "/api/admin/login" && request.method === "POST") {
    const r = rateLimit(`login:${ip}`, 5, 10 * 60_000);
    if (!r.ok) return tooMany(r.retryAfter);
  }

  if (pathname === "/api/orders" || pathname === "/api/orders/lookup") {
    return NextResponse.next();
  }

  const isPublicAdminRoute =
    pathname === "/admin/login" || pathname === "/api/admin/login";

  if (isPublicAdminRoute) {
    return NextResponse.next();
  }

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
