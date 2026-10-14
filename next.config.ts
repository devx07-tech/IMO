import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Razorpay Checkout loads from checkout.razorpay.com and talks to api.razorpay.com
// (plus its CDN and telemetry hosts), so *.razorpay.com is allowed.
const RAZORPAY = "https://*.razorpay.com";

const contentSecurityPolicy = [
  "default-src 'self'",
  // Next.js injects inline bootstrap scripts; dev mode also needs eval for HMR.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} ${RAZORPAY}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${RAZORPAY}`,
  "font-src 'self'",
  "media-src 'self'",
  `connect-src 'self' ${RAZORPAY}`,
  `frame-src ${RAZORPAY}`,
  `form-action 'self' ${RAZORPAY}`,
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
