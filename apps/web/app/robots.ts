import type { MetadataRoute } from "next";

const SITE_URL = "https://audit.fironmarketing.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // /run is the internal tool page and is passcode-gated.
        // Per-audit result URLs are user-specific reports.
        // /api routes are not meant for indexing.
        disallow: ["/run", "/audits/", "/api/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
