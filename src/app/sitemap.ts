import type { MetadataRoute } from "next";
import { BUSINESS } from "@/lib/business";

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["", "/contact", "/privacy", "/terms", "/refund-policy"];
  return paths.map((p) => ({
    url: `${BUSINESS.siteUrl}${p}`,
    changeFrequency: p === "" ? "weekly" : "monthly",
    priority: p === "" ? 1 : 0.5,
  }));
}
