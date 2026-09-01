import type { MetadataRoute } from "next";

// Root URL is intentionally omitted: `/` now 308-redirects to
// https://fironmarketing.com/insights/ai-readiness-audit (see next.config.mjs).
// The tool itself lives at /run behind a passcode gate and is noindex, so it
// does not belong in the sitemap either.
export default function sitemap(): MetadataRoute.Sitemap {
  return [];
}
