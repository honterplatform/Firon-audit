// Discover URLs from a site's sitemap(s) and classify them by page type.
// Best-effort, regex-based — sitemap.xml is a small, stable format so we
// avoid an XML parser dependency.

export type PageType = 'blog' | 'product' | 'collection' | 'other';

export interface DiscoveredUrl {
  url: string;
  type: PageType;
}

export interface PageSamples {
  blog?: string;
  product?: string;
  collection?: string;
  discoveredCount: number;
  sitemapFound: boolean;
}

const MAX_SUBSITEMAPS = 5;
const MAX_URLS = 500;
const FETCH_TIMEOUT_MS = 8000;

async function fetchText(url: string): Promise<string | null> {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    const resp = await fetch(url, {
      signal: ctl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FironAuditBot/1.0)',
        'Accept': 'application/xml, text/xml, text/plain, */*',
      },
    });
    clearTimeout(timer);
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  }
}

function extractLocs(xml: string): string[] {
  const out: string[] = [];
  // Tolerant of whitespace, CDATA, namespaces
  const re = /<loc>\s*(?:<!\[CDATA\[)?([^<\]\s]+?)(?:\]\]>)?\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out.push(m[1].trim());
  }
  return out;
}

function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex[\s>]/i.test(xml);
}

async function readSitemapUrlsFromRobots(origin: string): Promise<string[]> {
  const robots = await fetchText(`${origin}/robots.txt`);
  if (!robots) return [];
  const out: string[] = [];
  for (const line of robots.split(/\r?\n/)) {
    const m = line.match(/^\s*Sitemap:\s*(\S+)/i);
    if (m) out.push(m[1].trim());
  }
  return out;
}

async function collectFromSitemap(sitemapUrl: string, seen: Set<string>, urls: string[]): Promise<void> {
  if (seen.has(sitemapUrl) || seen.size > MAX_SUBSITEMAPS + 1) return;
  seen.add(sitemapUrl);
  const xml = await fetchText(sitemapUrl);
  if (!xml) return;
  if (isSitemapIndex(xml)) {
    const childSitemaps = extractLocs(xml).slice(0, MAX_SUBSITEMAPS);
    for (const child of childSitemaps) {
      if (urls.length >= MAX_URLS) return;
      await collectFromSitemap(child, seen, urls);
    }
  } else {
    for (const u of extractLocs(xml)) {
      urls.push(u);
      if (urls.length >= MAX_URLS) return;
    }
  }
}

export function classifyUrl(url: string): PageType {
  let path: string;
  try { path = new URL(url).pathname.toLowerCase(); }
  catch { return 'other'; }

  // Skip non-content paths
  if (/\.(pdf|xml|jpg|jpeg|png|gif|webp|svg|css|js|ico|zip)$/i.test(path)) return 'other';
  if (path === '/' || path === '') return 'other';
  if (path.includes('/wp-admin') || path.includes('/api/') || path.includes('/feed')) return 'other';

  // Product (Shopify, WooCommerce, generic)
  if (/^\/products?\/[^/]+\/?$/.test(path) || /^\/shop\/[^/]+\/?$/.test(path)) return 'product';
  if (/^\/store\/product\/[^/]+\/?$/.test(path)) return 'product';

  // Collection / category index
  if (/^\/collections?\/[^/]+\/?$/.test(path)) return 'collection';
  if (/^\/categor(y|ies)\/[^/]+\/?$/.test(path)) return 'collection';
  if (/^\/shop\/categor(y|ies)\/[^/]+\/?$/.test(path)) return 'collection';

  // Blog / article / news / posts
  if (/^\/(blog|posts?|articles?|news|insights|stories|resources)\/[^/]+/.test(path)) return 'blog';

  return 'other';
}

export async function discoverPageSamples(origin: string): Promise<PageSamples & { samples: DiscoveredUrl[] }> {
  const seen = new Set<string>();
  const collected: string[] = [];

  // Try robots.txt-declared sitemaps first
  const robotsSitemaps = await readSitemapUrlsFromRobots(origin);
  for (const sm of robotsSitemaps.slice(0, MAX_SUBSITEMAPS)) {
    if (collected.length >= MAX_URLS) break;
    await collectFromSitemap(sm, seen, collected);
  }

  // Fall back to common defaults if robots didn't list any (or they yielded nothing)
  if (collected.length === 0) {
    for (const fallback of [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`, `${origin}/sitemap-index.xml`]) {
      if (collected.length >= MAX_URLS) break;
      await collectFromSitemap(fallback, seen, collected);
      if (collected.length > 0) break;
    }
  }

  const sitemapFound = collected.length > 0;

  // Classify and pick first sample per type
  const samples: DiscoveredUrl[] = [];
  const picked: Record<PageType, string | undefined> = { blog: undefined, product: undefined, collection: undefined, other: undefined };
  for (const url of collected) {
    const type = classifyUrl(url);
    if (type !== 'other' && !picked[type]) {
      picked[type] = url;
      samples.push({ url, type });
    }
    if (picked.blog && picked.product && picked.collection) break;
  }

  return {
    blog: picked.blog,
    product: picked.product,
    collection: picked.collection,
    discoveredCount: collected.length,
    sitemapFound,
    samples,
  };
}
