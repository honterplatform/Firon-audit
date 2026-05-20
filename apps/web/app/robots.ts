import type { MetadataRoute } from "next";

const SITE_URL = "https://audit.fironmarketing.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Per-audit result URLs are user-specific reports — keep them out of
        // search indexes. /api routes aren't meant for indexing either.
        disallow: ["/audits/", "/api/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
