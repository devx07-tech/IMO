import type { MetadataRoute } from "next";
import { BUSINESS } from "@/lib/business";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/pay-test"] },
    sitemap: `${BUSINESS.siteUrl}/sitemap.xml`,
  };
}
