import { chromium } from 'playwright';
import type { HeuristicsResult, HeuristicFinding, HeuristicPass } from '../types';
import { discoverPageSamples } from '../crawl/sitemap';

export async function runHeuristics(
  url: string,
  crawlResult: {
    selectors: { h1?: string; firstCta?: string; heroBbox?: any };
    content?: {
      typography?: {
        h1?: { fontSize: number; fontWeight: string; lineHeight: string };
        h2?: { fontSize: number; fontWeight: string };
        body?: { fontSize: number; lineHeight: string };
        firstParagraph?: { fontSize: number; lineHeight: string };
        headingHierarchy: Array<{ level: number; fontSize: number; fontWeight: string }>;
      };
      images?: {
        aboveFold: Array<{ url: string; naturalWidth: number; naturalHeight: number; displayedWidth: number; displayedHeight: number; fileSize: number; format: string; hasLazyLoading: boolean; hasSrcset: boolean; isLcpCandidate: boolean }>;
        belowFold: Array<{ url: string; naturalWidth: number; naturalHeight: number; displayedWidth: number; displayedHeight: number; fileSize: number; format: string; hasLazyLoading: boolean; hasSrcset: boolean }>;
        totalImages: number;
        totalImageSize: number;
        lcpImage?: { url: string; fileSize: number; format: string; naturalWidth: number; naturalHeight: number; displayedWidth: number; displayedHeight: number };
      };
    };
  }
): Promise<HeuristicsResult> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--disable-dev-shm-usage', '--no-sandbox', '--disable-setuid-sandbox', '--disable-http2'],
  });
  const findings: HeuristicFinding[] = [];
  const passes: HeuristicPass[] = [];
  const origin = new URL(url).origin;

  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    // 'networkidle' never settles on Shopify/heavy-tracker sites. Use
    // domcontentloaded + a hydration grace period instead.
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    // ═══════════════════════════════════════════════════════
    // TECHNICAL SEO
    // ═══════════════════════════════════════════════════════

    // Title tag (homepage)
    const title = await page.title();
    if (!title || title.trim().length === 0) {
      findings.push({ issue: 'Homepage missing title tag', why: 'The homepage title tag is the #1 on-page ranking factor. Without it, search engines cannot properly index or display the page in SERPs.', fix: 'Add a unique, descriptive <title> tag (50-60 characters) with the primary keyword.' });
    } else if (title.length > 70) {
      findings.push({ issue: `Homepage title tag too long (${title.length} chars)`, why: 'Titles over 70 characters get truncated in SERPs, cutting off keywords and reducing CTR.', fix: `Shorten to under 70 characters. Current: "${title.substring(0, 70)}..."`, evidence: `${title.length} characters` });
    } else {
      passes.push({ title: 'Meta title length is on point', detail: `"${title}" — ${title.length} characters, within the SERP-safe range (≤70).`, category: 'On-Page SEO' });
    }

    // Meta description (homepage)
    const metaDesc = await page.$eval('meta[name="description"]', (el) => el.getAttribute('content')).catch(() => null);
    if (!metaDesc || metaDesc.trim().length === 0) {
      findings.push({ issue: 'Homepage missing meta description', why: 'Without a homepage meta description, Google auto-generates snippets that may not convey value, reducing CTR from SERPs by up to 30%.', fix: 'Add a compelling meta description (120-140 chars) with the primary keyword and a call-to-action.' });
    } else if (metaDesc.length > 140) {
      findings.push({ issue: `Homepage meta description too long (${metaDesc.length} chars)`, why: 'Descriptions over 140 characters get truncated, potentially cutting off the CTA.', fix: 'Shorten to 120-140 characters. Front-load keywords and value prop.', evidence: `${metaDesc.length} characters` });
    } else {
      passes.push({ title: 'Meta description is tight', detail: `${metaDesc.length} characters — fits inside SERP snippets without truncation.`, category: 'On-Page SEO' });
    }

    // Canonical tag (homepage)
    const canonical = await page.$eval('link[rel="canonical"]', (el) => el.getAttribute('href')).catch(() => null);
    if (!canonical) {
      findings.push({ issue: 'Homepage missing canonical tag', why: 'Without a canonical tag, search engines may index duplicate versions of this page (trailing slashes, query params, etc.), diluting ranking signals and wasting crawl budget.', fix: 'Add a self-referencing <link rel="canonical"> tag pointing to the preferred URL.' });
    } else {
      passes.push({ title: 'Canonical tag is in place', detail: `Points to ${canonical} — search engines will consolidate ranking signals correctly.`, category: 'Technical SEO' });
    }

    // HTML lang
    const htmlLang = await page.$eval('html', (el) => el.getAttribute('lang')).catch(() => null);
    if (!htmlLang) {
      findings.push({ issue: 'Missing HTML lang attribute', why: 'The lang attribute helps search engines serve pages to the right audience and is required for proper internationalization.', fix: 'Add lang="en" (or appropriate language code) to the <html> tag.' });
    } else {
      passes.push({ title: 'HTML lang attribute is set', detail: `Declared as "${htmlLang}" — proper language signal for indexing and accessibility.`, category: 'Technical SEO' });
    }

    // Viewport
    const viewport = await page.$eval('meta[name="viewport"]', (el) => el.getAttribute('content')).catch(() => null);
    if (!viewport) {
      findings.push({ issue: 'Missing viewport meta tag', why: 'Without a viewport tag, pages fail mobile-friendliness tests. Google uses mobile-first indexing, so this directly impacts rankings.', fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.' });
    } else {
      passes.push({ title: 'Viewport meta is configured', detail: 'Mobile-friendliness signal is correctly declared for mobile-first indexing.', category: 'Technical SEO' });
    }

    // Robots noindex
    const robotsMeta = await page.$eval('meta[name="robots"]', (el) => el.getAttribute('content')).catch(() => null);
    if (robotsMeta && robotsMeta.toLowerCase().includes('noindex')) {
      findings.push({ issue: 'Page is set to noindex', why: 'The robots meta tag is blocking search engines from indexing this page. It will not appear in search results.', fix: 'Remove the noindex directive if this page should be indexed.' });
    }

    // HTTPS check
    if (new URL(url).protocol === 'http:') {
      findings.push({ issue: 'Site is not using HTTPS', why: 'HTTPS is a confirmed Google ranking signal. HTTP sites are marked as "Not Secure" in browsers, reducing trust and hurting rankings.', fix: 'Migrate to HTTPS with a valid SSL certificate. Set up 301 redirects from HTTP to HTTPS.' });
    }

    // ═══════════════════════════════════════════════════════
    // ROBOTS.TXT & SITEMAP VALIDATION (via fetch, not browser navigation)
    // ═══════════════════════════════════════════════════════

    // Robots.txt
    try {
      const robotsResp = await fetch(`${origin}/robots.txt`, { signal: AbortSignal.timeout(5000) });
      if (!robotsResp.ok) {
        findings.push({ issue: 'Missing or inaccessible robots.txt', why: 'robots.txt tells search engines which pages to crawl. Without it, crawlers may waste budget on irrelevant pages or miss important ones.', fix: 'Create a robots.txt at the site root with proper Allow/Disallow directives and a Sitemap reference.' });
      } else {
        const robotsTxt = await robotsResp.text();
        if (!robotsTxt.toLowerCase().includes('sitemap')) {
          findings.push({ issue: 'robots.txt missing Sitemap reference', why: 'Including a Sitemap directive in robots.txt helps search engines discover your sitemap faster, improving crawl efficiency.', fix: 'Add "Sitemap: https://yoursite.com/sitemap.xml" to robots.txt.' });
        }
      }
    } catch { /* timeout/network error is fine */ }

    // Sitemap.xml
    try {
      const sitemapResp = await fetch(`${origin}/sitemap.xml`, { signal: AbortSignal.timeout(5000) });
      if (!sitemapResp.ok) {
        findings.push({ issue: 'Missing or inaccessible sitemap.xml', why: 'An XML sitemap helps search engines discover and index all important pages. Without it, pages may be missed during crawling.', fix: 'Generate and submit a sitemap.xml listing all indexable pages. Submit it to Google Search Console.' });
      } else {
        const sitemapContent = await sitemapResp.text();
        const urlCount = (sitemapContent.match(/<loc>/gi) || []).length;
        if (urlCount === 0) {
          findings.push({ issue: 'Sitemap.xml exists but contains no URLs', why: 'An empty sitemap provides no value to search engines and may signal a misconfiguration.', fix: 'Populate the sitemap with all indexable page URLs.' });
        }
      }
    } catch { /* timeout/network error is fine */ }

    // ═══════════════════════════════════════════════════════
    // ON-PAGE SEO
    // ═══════════════════════════════════════════════════════

    // H1 heading
    const h1Elements = await page.locator('h1').all();
    if (h1Elements.length === 0) {
      findings.push({ issue: 'Missing H1 heading', why: 'The H1 signals the main topic to search engines. Missing H1s weaken on-page SEO and reduce topical clarity.', fix: 'Add a single H1 heading with the primary keyword for this page.' });
    } else if (h1Elements.length > 1) {
      findings.push({ issue: `Multiple H1 headings (${h1Elements.length})`, why: 'Multiple H1s dilute the topical signal and confuse page hierarchy. Best practice is exactly one H1 per page.', fix: 'Keep one H1 for the main heading. Convert extras to H2 or H3.', evidence: `Found ${h1Elements.length} H1 elements` });
    }

    // Heading hierarchy — only check MAIN CONTENT headings (ignore nav, footer, sidebar, widgets)
    const headingData = await page.evaluate(() => {
      const headings: Array<{ level: number; text: string; inMainContent: boolean }> = [];
      document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => {
        const inNav = !!h.closest('nav, header nav, [role="navigation"]');
        const inFooter = !!h.closest('footer, [role="contentinfo"]');
        const inSidebar = !!h.closest('aside, [role="complementary"]');
        const inWidget = !!h.closest('[class*="widget"], [class*="sidebar"], [class*="footer"], [class*="menu"]');
        const inMainContent = !inNav && !inFooter && !inSidebar && !inWidget;
        headings.push({ level: parseInt(h.tagName[1]), text: (h.textContent || '').trim().substring(0, 60), inMainContent });
      });
      return headings;
    });

    // Only check hierarchy for main content headings
    const mainContentHeadings = headingData.filter(h => h.inMainContent);
    if (mainContentHeadings.length > 1) {
      for (let i = 1; i < mainContentHeadings.length; i++) {
        if (mainContentHeadings[i].level > mainContentHeadings[i - 1].level + 1) {
          const fromLevel = mainContentHeadings[i - 1].level;
          const toLevel = mainContentHeadings[i].level;

          const levelCounts: Record<number, number> = {};
          mainContentHeadings.forEach(h => { levelCounts[h.level] = (levelCounts[h.level] || 0) + 1; });
          const levelSummary = Object.entries(levelCounts).map(([l, c]) => `H${l}: ${c}`).join(', ');

          const skipExamples = mainContentHeadings
            .filter(h => h.level === toLevel)
            .slice(0, 3)
            .map(h => `"${h.text}"`)
            .join(', ');

          findings.push({
            issue: `Homepage main content skips H${fromLevel} to H${toLevel}`,
            why: `The main content area skips from H${fromLevel} to H${toLevel}, breaking semantic hierarchy. Found in main content: ${levelSummary}. (Footer, nav, and sidebar headings are excluded from this check.)`,
            fix: `Review the main content heading structure. Ensure it follows H1 → H2 → H3 without skipping levels.`,
            evidence: `H${toLevel} examples in main content: ${skipExamples}`,
          });
          break;
        }
      }
    }

    // Images missing alt text
    const imageAltData = await page.evaluate(() => {
      let missingAlt = 0, total = 0;
      document.querySelectorAll('img').forEach((img) => { total++; if (!img.getAttribute('alt')) missingAlt++; });
      return { missingAlt, total };
    });
    if (imageAltData.missingAlt > 0) {
      findings.push({ issue: `${imageAltData.missingAlt} image(s) missing alt text`, why: 'Alt text is a ranking factor for image search and helps search engines understand visual content. Missing alt text is lost SEO value.', fix: `Add descriptive alt text to all ${imageAltData.missingAlt} images. Use keywords naturally where relevant.`, evidence: `${imageAltData.missingAlt} of ${imageAltData.total} images` });
    }

    // Open Graph tags
    const ogData = await page.evaluate(() => {
      return {
        hasTitle: !!document.querySelector('meta[property="og:title"]')?.getAttribute('content'),
        hasDesc: !!document.querySelector('meta[property="og:description"]')?.getAttribute('content'),
        hasImage: !!document.querySelector('meta[property="og:image"]')?.getAttribute('content'),
      };
    });
    if (!ogData.hasTitle || !ogData.hasDesc || !ogData.hasImage) {
      const missing = [!ogData.hasTitle && 'og:title', !ogData.hasDesc && 'og:description', !ogData.hasImage && 'og:image'].filter(Boolean);
      findings.push({ issue: `Missing Open Graph tags (${missing.join(', ')})`, why: 'OG tags control how your page appears when shared on social media and messaging apps. Poor previews reduce sharing engagement and referral traffic.', fix: `Add missing OG tags: ${missing.join(', ')}. Include a 1200x630px image for social sharing.` });
    }

    // Twitter Card tags
    const hasTwitterCard = await page.evaluate(() => !!document.querySelector('meta[name="twitter:card"]'));
    if (!hasTwitterCard) {
      findings.push({ issue: 'Missing Twitter/X Card meta tags', why: 'Twitter Card tags control how your page appears when shared on X (Twitter). Without them, shared links show plain text instead of rich previews.', fix: 'Add <meta name="twitter:card" content="summary_large_image"> along with twitter:title, twitter:description, and twitter:image.' });
    }

    // ═══════════════════════════════════════════════════════
    // STRUCTURED DATA & SCHEMA MARKUP
    // ═══════════════════════════════════════════════════════

    const schemaData = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      const schemas: Array<{ type: string; raw: string; parsed?: any }> = [];
      scripts.forEach((s) => {
        try {
          const data = JSON.parse(s.textContent || '');
          // A single JSON-LD <script> may contain a top-level object OR an @graph array of nodes.
          const nodes: any[] = Array.isArray(data['@graph']) ? data['@graph'] : [data];
          for (const node of nodes) {
            if (!node || typeof node !== 'object') continue;
            const type = node['@type'] || (Array.isArray(data['@graph']) ? 'Graph' : 'Unknown');
            schemas.push({
              type: Array.isArray(type) ? type.join(',') : type,
              raw: (s.textContent || '').substring(0, 200),
              parsed: node,
            });
          }
        } catch { schemas.push({ type: 'Invalid JSON', raw: (s.textContent || '').substring(0, 100) }); }
      });
      return schemas;
    });

    // Collect all schema types from homepage
    const homepageSchemaTypes = schemaData.map(s => s.type);
    const orgNode = schemaData.find(s => /organization|localbusiness|company/i.test(s.type) && s.parsed);

    if (schemaData.length === 0) {
      findings.push({ issue: 'No structured data (JSON-LD) on homepage', why: 'The homepage has no structured data. Rich results (stars, FAQs, breadcrumbs) require schema markup. This also helps AI search engines understand your content.', fix: 'Add JSON-LD structured data to the homepage: Organization schema (brand info), FAQ schema, Breadcrumb schema, and Service/Product schema as relevant.' });
    } else {
      if (!orgNode) {
        findings.push({ issue: 'Homepage missing Organization schema', why: 'Organization schema tells search engines and AI assistants who you are. This strengthens your Knowledge Panel and brand entity in Google.', fix: 'Add Organization JSON-LD with name, url, logo, description, sameAs (social profiles), and contactPoint.' });
      } else {
        // We have an Organization schema — now check whether sameAs is populated.
        const sameAsRaw = orgNode.parsed?.sameAs;
        const sameAsList: string[] = Array.isArray(sameAsRaw)
          ? sameAsRaw.filter((u: any) => typeof u === 'string' && u.length > 0)
          : typeof sameAsRaw === 'string' && sameAsRaw.length > 0 ? [sameAsRaw] : [];

        if (sameAsList.length === 0) {
          findings.push({
            issue: 'Organization schema is missing sameAs',
            why: 'The sameAs property links your organization to its official social profiles (LinkedIn, X, GitHub, etc.). AI search engines specifically use sameAs to resolve your entity and trust your brand. Without it, the schema can\'t do its strongest job.',
            fix: 'Add a sameAs array to your Organization JSON-LD with full URLs to your official LinkedIn, X/Twitter, YouTube, GitHub, and any other authoritative profiles.',
            evidence: 'Organization node present, sameAs absent or empty',
          });
        } else {
          passes.push({
            title: 'Organization schema includes sameAs',
            detail: `Linked to ${sameAsList.length} ${sameAsList.length === 1 ? 'profile' : 'profiles'} — AI search engines can resolve your brand entity with high confidence.`,
            category: 'Technical SEO',
            evidence: sameAsList.slice(0, 5).join(', '),
          });
        }
      }
      if (!homepageSchemaTypes.some(t => /faq/i.test(t))) {
        findings.push({ issue: 'Homepage missing FAQ schema', why: 'FAQ schema can display expandable Q&A directly in search results, increasing SERP real estate and click-through rates.', fix: 'Add FAQ schema for common questions. Each Q&A pair becomes a rich result in Google.' });
      }
      if (!homepageSchemaTypes.some(t => /breadcrumb/i.test(t))) {
        findings.push({ issue: 'Homepage missing Breadcrumb schema', why: 'Breadcrumb schema displays navigation paths in SERPs, improving user orientation and click-through.', fix: 'Add BreadcrumbList JSON-LD that reflects your site navigation hierarchy.' });
      }
      if (schemaData.some(s => s.type === 'Invalid JSON')) {
        findings.push({ issue: 'Invalid JSON-LD on homepage', why: 'Malformed JSON-LD is ignored by search engines. Your structured data provides zero SEO benefit.', fix: 'Validate your JSON-LD at schema.org or Google Rich Results Test.' });
      }
    }

    // ═══════════════════════════════════════════════════════
    // INNER PAGE CRAWL (check product/service pages for schema + meta)
    // ═══════════════════════════════════════════════════════

    try {
      // Find product or inner page links from homepage
      const innerPageUrl = await page.evaluate((currentOrigin: string) => {
        const links = Array.from(document.querySelectorAll('a[href]'));
        const candidates: string[] = [];
        for (const a of links) {
          const href = a.getAttribute('href') || '';
          try {
            const linkUrl = new URL(href, window.location.origin);
            if (linkUrl.origin !== currentOrigin) continue;
            const path = linkUrl.pathname.toLowerCase();
            // Look for product, service, or collection pages
            if (path.match(/\/(product|item|shop|store|collection|service|work|case|portfolio)\//i) ||
                path.match(/\/products\//i) ||
                path.match(/\/collections\//i)) {
              candidates.push(linkUrl.href);
            }
          } catch {}
        }
        // If no product pages found, try any internal page that isn't the homepage
        if (candidates.length === 0) {
          for (const a of links) {
            const href = a.getAttribute('href') || '';
            try {
              const linkUrl = new URL(href, window.location.origin);
              if (linkUrl.origin !== currentOrigin) continue;
              if (linkUrl.pathname !== '/' && linkUrl.pathname.length > 1 && !linkUrl.pathname.startsWith('/#')) {
                candidates.push(linkUrl.href);
              }
            } catch {}
          }
        }
        return candidates[0] || null;
      }, origin);

      if (innerPageUrl) {
        await page.goto(innerPageUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(500);

        const innerPagePath = new URL(innerPageUrl).pathname;

        // Check inner page meta description
        const innerMeta = await page.$eval('meta[name="description"]', (el) => el.getAttribute('content')).catch(() => null);
        if (!innerMeta || innerMeta.trim().length === 0) {
          findings.push({ issue: `Inner page missing meta description (${innerPagePath})`, why: `The page at ${innerPagePath} has no meta description. Each page needs a unique meta description to rank effectively and attract clicks from SERPs.`, fix: `Add a unique, compelling meta description to ${innerPagePath}. Avoid auto-generated or templated descriptions.`, evidence: `Page: ${innerPagePath}` });
        } else if (metaDesc && innerMeta.trim() === metaDesc.trim()) {
          findings.push({ issue: 'Duplicate meta descriptions across pages', why: `The homepage and ${innerPagePath} share the same meta description. Duplicate metas reduce click-through because Google shows the same snippet for different pages.`, fix: 'Write unique meta descriptions for each page targeting that page\'s specific keywords and content.', evidence: `Homepage and ${innerPagePath} have identical meta descriptions` });
        }

        // Check inner page schema
        const innerSchemaData = await page.evaluate(() => {
          const scripts = document.querySelectorAll('script[type="application/ld+json"]');
          const schemas: string[] = [];
          scripts.forEach((s) => {
            try {
              const data = JSON.parse(s.textContent || '');
              if (data['@type']) schemas.push(data['@type']);
              if (data['@graph'] && Array.isArray(data['@graph'])) {
                data['@graph'].forEach((item: any) => { if (item['@type']) schemas.push(item['@type']); });
              }
            } catch {}
          });
          return schemas;
        });

        const isProductPage = innerPageUrl.toLowerCase().match(/product|item|shop|store/);
        if (isProductPage && !innerSchemaData.some(t => /product/i.test(t))) {
          findings.push({ issue: `Product page missing Product schema (${innerPagePath})`, why: 'Product schema enables rich results (price, availability, reviews) in SERPs. Without it, your products appear as plain blue links while competitors show rich cards.', fix: `Add Product JSON-LD to ${innerPagePath} with name, price, availability, image, and aggregateRating.`, evidence: `Page: ${innerPagePath}, Schema found: ${innerSchemaData.join(', ') || 'none'}` });
        } else if (!isProductPage && innerSchemaData.length === 0) {
          findings.push({ issue: `Inner page has no structured data (${innerPagePath})`, why: `The page at ${innerPagePath} has no JSON-LD schema. Adding relevant schema (Service, Article, FAQ) helps search engines and AI understand page content.`, fix: `Add appropriate JSON-LD schema to ${innerPagePath} based on its content type.`, evidence: `Page: ${innerPagePath}` });
        }

        // Navigate back to homepage for remaining checks
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(500);
      }
    } catch {
      // Inner page crawl failed — non-critical, continue
    }

    // ═══════════════════════════════════════════════════════
    // SITEMAP-BASED PAGE-TYPE RUBRICS (blog post)
    // ═══════════════════════════════════════════════════════

    try {
      const samples = await discoverPageSamples(origin);

      if (samples.blog) {
        await page.goto(samples.blog, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(800);
        const blogPath = new URL(samples.blog).pathname;

        const blog = await page.evaluate(() => {
          const title = document.title || '';
          const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
          const h1Count = document.querySelectorAll('h1').length;
          const h2Count = document.querySelectorAll('h2').length;
          const h3Count = document.querySelectorAll('h3').length;

          // Prefer main content containers for word count; fall back to body.
          const contentEl =
            document.querySelector('article') ||
            document.querySelector('main') ||
            document.querySelector('.post-content, .entry-content, .article-body, [class*="article"], [class*="post-body"]') ||
            document.body;
          const text = (contentEl?.textContent || '').replace(/\s+/g, ' ').trim();
          const wordCount = text ? text.split(/\s+/).length : 0;

          // Schemas
          const scripts = document.querySelectorAll('script[type="application/ld+json"]');
          const schemaTypes: string[] = [];
          scripts.forEach((s) => {
            try {
              const data = JSON.parse(s.textContent || '');
              const nodes: any[] = Array.isArray(data['@graph']) ? data['@graph'] : [data];
              for (const node of nodes) {
                const t = node?.['@type'];
                if (typeof t === 'string') schemaTypes.push(t);
                else if (Array.isArray(t)) schemaTypes.push(...t.filter((x) => typeof x === 'string'));
              }
            } catch { /* ignore invalid */ }
          });

          // FAQ section heuristic: any heading or section mentioning "FAQ" / "Frequently asked"
          const allText = (document.body?.textContent || '').toLowerCase();
          const headingMatches = Array.from(document.querySelectorAll('h1,h2,h3,h4')).some((h) => {
            const t = (h.textContent || '').toLowerCase();
            return t.includes('faq') || t.includes('frequently asked');
          });
          const hasFaqSection = headingMatches || /frequently asked questions/.test(allText);

          return { title, metaDesc, h1Count, h2Count, h3Count, wordCount, schemaTypes, hasFaqSection };
        });

        const sample = `Sampled: ${blogPath}`;

        // H1 count
        if (blog.h1Count === 0) {
          findings.push({ issue: `Blog post is missing an H1 (${blogPath})`, why: 'Blog posts need exactly one H1 — it tells search engines and AI engines what the article is about. No H1 means weaker topical signals and lower visibility.', fix: `Add a single, descriptive <h1> at the top of ${blogPath} that matches the page's primary keyword.`, evidence: sample });
        } else if (blog.h1Count > 1) {
          findings.push({ issue: `Blog post has multiple H1s (${blog.h1Count} found on ${blogPath})`, why: 'Multiple H1s split topical authority and confuse search engines about the article subject.', fix: `Keep exactly one H1 on ${blogPath}; demote the rest to H2.`, evidence: sample });
        } else {
          passes.push({ title: 'Blog posts use a single H1', detail: `Verified on ${blogPath} — clean topical signal for search engines.`, category: 'On-Page SEO', evidence: sample });
        }

        // Subheadings (H2/H3)
        if (blog.h2Count === 0 && blog.h3Count === 0) {
          findings.push({ issue: `Blog post has no H2 or H3 subheadings (${blogPath})`, why: 'Long-form posts without subheadings are hard to scan and lose featured-snippet opportunities. Subheadings also help AI engines summarize and excerpt your content.', fix: `Break ${blogPath} into 4–8 sections using descriptive H2 headings; use H3 for sub-sections where useful.`, evidence: sample });
        } else {
          passes.push({ title: 'Blog posts use a clear subheading hierarchy', detail: `${blogPath} has ${blog.h2Count} H2${blog.h2Count === 1 ? '' : 's'}${blog.h3Count ? ` and ${blog.h3Count} H3${blog.h3Count === 1 ? '' : 's'}` : ''} — readable and snippet-friendly.`, category: 'On-Page SEO', evidence: sample });
        }

        // Word count
        if (blog.wordCount < 1000) {
          findings.push({ issue: `Blog post is under 1,000 words (${blog.wordCount} on ${blogPath})`, why: 'Posts under ~1,000 words underperform in competitive SERPs and rarely get cited by AI search. Depth correlates strongly with rankings and AI inclusion.', fix: `Expand ${blogPath} with use cases, examples, and FAQs. Aim for 1,200–2,000 words of substantive content.`, evidence: `${blog.wordCount} words, ${sample}` });
        } else {
          passes.push({ title: 'Blog posts have substantive depth', detail: `${blogPath} runs ${blog.wordCount.toLocaleString()} words — enough body for AI engines and ranking competitiveness.`, category: 'On-Page SEO', evidence: sample });
        }

        // Meta title length on the blog post
        if (!blog.title || blog.title.trim().length === 0) {
          findings.push({ issue: `Blog post missing title tag (${blogPath})`, why: 'Without a title tag the post can\'t rank or be displayed in SERPs.', fix: `Add a unique title to ${blogPath} under 70 characters.`, evidence: sample });
        } else if (blog.title.length > 70) {
          findings.push({ issue: `Blog post title is too long (${blog.title.length} chars on ${blogPath})`, why: 'Titles over 70 characters get truncated in SERPs, cutting off keywords.', fix: `Shorten the title on ${blogPath} to ≤70 characters.`, evidence: `${blog.title.length} chars on ${blogPath}` });
        } else {
          passes.push({ title: 'Blog post titles are SERP-safe', detail: `${blogPath} title is ${blog.title.length} characters — within the ≤70 sweet spot.`, category: 'On-Page SEO', evidence: sample });
        }

        // Meta description on the blog post
        if (!blog.metaDesc || blog.metaDesc.trim().length === 0) {
          findings.push({ issue: `Blog post missing meta description (${blogPath})`, why: 'Without a meta description Google auto-generates snippets — typically the first text on the page, which often isn\'t the strongest hook.', fix: `Add a unique 120–140 character meta description to ${blogPath}.`, evidence: sample });
        } else if (blog.metaDesc.length > 140) {
          findings.push({ issue: `Blog post meta description is too long (${blog.metaDesc.length} chars on ${blogPath})`, why: 'Descriptions over 140 characters get truncated in SERPs, often cutting off the CTA.', fix: `Shorten ${blogPath}'s meta description to ≤140 characters.`, evidence: `${blog.metaDesc.length} chars on ${blogPath}` });
        } else {
          passes.push({ title: 'Blog post meta descriptions are tight', detail: `${blogPath} meta description is ${blog.metaDesc.length} characters — fits SERP snippets cleanly.`, category: 'On-Page SEO', evidence: sample });
        }

        // FAQ section
        if (blog.hasFaqSection) {
          passes.push({ title: 'Blog posts include FAQ-style sections', detail: `Detected on ${blogPath} — strong fit for AI Overviews and People-Also-Ask placements.`, category: 'On-Page SEO', evidence: sample });
        } else {
          findings.push({ issue: `Blog post has no FAQ section (${blogPath})`, why: 'FAQ-style sections are heavily favored by AI Overviews and Google\'s People-Also-Ask block. Without them, you miss those high-visibility surfaces.', fix: `Add a short FAQ section to ${blogPath} answering 3–5 common questions about the topic, paired with FAQPage schema.`, evidence: sample });
        }

        // FAQ schema on the blog post
        if (blog.schemaTypes.some((t) => /faq/i.test(t))) {
          passes.push({ title: 'Blog posts ship with FAQ schema', detail: `${blogPath} has FAQ JSON-LD — Q&A rich results are eligible.`, category: 'Technical SEO', evidence: sample });
        } else {
          findings.push({ issue: `Blog post missing FAQ schema (${blogPath})`, why: 'FAQ schema unlocks expandable Q&A in Google SERPs and is the primary signal AI engines use to extract authoritative answers from your post.', fix: `Add FAQPage JSON-LD on ${blogPath} matching the questions in the post body.`, evidence: sample });
        }

        // Article / NewsArticle schema
        const hasArticleSchema = blog.schemaTypes.some((t) => /^(article|newsarticle|blogposting|techarticle)$/i.test(t));
        if (hasArticleSchema) {
          passes.push({ title: 'Blog posts use Article schema', detail: `${blogPath} declares Article/BlogPosting JSON-LD — AI engines can resolve byline, publish date, and topic.`, category: 'Technical SEO', evidence: sample });
        } else {
          findings.push({ issue: `Blog post missing Article schema (${blogPath})`, why: 'Article (or BlogPosting/NewsArticle) schema gives AI engines author, publish date, and topical context. Without it, your posts are harder to cite and rank for news/feature SERP features.', fix: `Add Article or BlogPosting JSON-LD on ${blogPath} with headline, author, datePublished, and image.`, evidence: sample });
        }

        // Navigate back to homepage for any remaining checks downstream
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(500);
      } else if (samples.sitemapFound) {
        // We have a sitemap but no blog URL matched — surface as info-level for now via a pass marker
        passes.push({ title: 'Sitemap discovered', detail: `Indexed ${samples.discoveredCount} URLs. No blog posts detected — if a blog exists, ensure post URLs match a standard pattern (/blog/*, /posts/*, /articles/*).`, category: 'Technical SEO' });
      }

      // ───────────────── PRODUCT PAGE RUBRIC ─────────────────
      if (samples.product) {
        await page.goto(samples.product, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(800);
        const productPath = new URL(samples.product).pathname;

        const prod = await page.evaluate(() => {
          const title = document.title || '';
          const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
          const h1Count = document.querySelectorAll('h1').length;
          const scripts = document.querySelectorAll('script[type="application/ld+json"]');
          const schemaTypes: string[] = [];
          scripts.forEach((s) => {
            try {
              const data = JSON.parse(s.textContent || '');
              const nodes: any[] = Array.isArray(data['@graph']) ? data['@graph'] : [data];
              for (const node of nodes) {
                const t = node?.['@type'];
                if (typeof t === 'string') schemaTypes.push(t);
                else if (Array.isArray(t)) schemaTypes.push(...t.filter((x) => typeof x === 'string'));
              }
            } catch { /* ignore */ }
          });
          return { title, metaDesc, h1Count, schemaTypes };
        });

        const psample = `Sampled: ${productPath}`;

        // H1 count
        if (prod.h1Count === 0) {
          findings.push({ issue: `Product page is missing an H1 (${productPath})`, why: 'Without an H1, the product\'s primary keyword has no anchor. Search engines and AI engines can\'t tell what the page is selling.', fix: `Add a single <h1> to ${productPath} that contains the product name.`, evidence: psample });
        } else if (prod.h1Count > 1) {
          findings.push({ issue: `Product page has multiple H1s (${prod.h1Count} on ${productPath})`, why: 'Multiple H1s dilute the product\'s topical focus and confuse rankings.', fix: `Keep exactly one H1 on ${productPath}; demote the rest to H2.`, evidence: psample });
        } else {
          passes.push({ title: 'Product pages use a single H1', detail: `Verified on ${productPath} — clear topical anchor for each product.`, category: 'On-Page SEO', evidence: psample });
        }

        // Meta title
        if (!prod.title || prod.title.trim().length === 0) {
          findings.push({ issue: `Product page missing title tag (${productPath})`, why: 'Without a title, the product can\'t rank or display in SERPs.', fix: `Add a unique title under 70 characters to ${productPath}.`, evidence: psample });
        } else if (prod.title.length > 70) {
          findings.push({ issue: `Product page title too long (${prod.title.length} chars on ${productPath})`, why: 'Titles over 70 chars get truncated, losing the product name or category at the end.', fix: `Shorten ${productPath} title to ≤70 characters.`, evidence: `${prod.title.length} chars on ${productPath}` });
        } else {
          passes.push({ title: 'Product page titles are SERP-safe', detail: `${productPath} title is ${prod.title.length} characters — within the ≤70 range.`, category: 'On-Page SEO', evidence: psample });
        }

        // Meta description
        if (!prod.metaDesc || prod.metaDesc.trim().length === 0) {
          findings.push({ issue: `Product page missing meta description (${productPath})`, why: 'Templated or missing meta descriptions hurt CTR from SERPs. Each product needs a unique selling hook.', fix: `Write a unique 120–140 character description for ${productPath}.`, evidence: psample });
        } else if (prod.metaDesc.length > 140) {
          findings.push({ issue: `Product page meta description too long (${prod.metaDesc.length} chars on ${productPath})`, why: 'Descriptions over 140 chars truncate in SERPs and cut the CTA.', fix: `Shorten ${productPath} meta description to ≤140 characters.`, evidence: `${prod.metaDesc.length} chars on ${productPath}` });
        } else {
          passes.push({ title: 'Product meta descriptions are tight', detail: `${productPath} meta description is ${prod.metaDesc.length} characters — fits SERP snippets cleanly.`, category: 'On-Page SEO', evidence: psample });
        }

        // Product schema (nice-to-have — emit as pass when present)
        if (prod.schemaTypes.some((t) => /^product$/i.test(t))) {
          passes.push({ title: 'Product pages ship Product schema', detail: `${productPath} declares Product JSON-LD — eligible for price/availability/review rich results.`, category: 'Technical SEO', evidence: psample });
        }

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(500);
      }

      // ───────────────── COLLECTION PAGE RUBRIC ─────────────────
      if (samples.collection) {
        await page.goto(samples.collection, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(800);
        const collectionPath = new URL(samples.collection).pathname;

        const coll = await page.evaluate(() => {
          const title = document.title || '';
          const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
          const h1Count = document.querySelectorAll('h1').length;

          // Intro copy: paragraphs inside <main> that aren't inside a card/link
          // (a rough proxy for collection-page body copy vs the product grid itself).
          const mainEl = document.querySelector('main') || document.body;
          let bodyCopy = '';
          if (mainEl) {
            const paragraphs = Array.from(mainEl.querySelectorAll('p, h2, h3'));
            for (const p of paragraphs) {
              // Skip paragraphs nested inside product cards / anchor wraps
              if (p.closest('a, [data-product], .product-card, .product-item, [class*="product-card"]')) continue;
              const t = (p.textContent || '').replace(/\s+/g, ' ').trim();
              if (t.length > 20) bodyCopy += t + ' ';
              if (bodyCopy.length > 1500) break;
            }
          }
          return { title, metaDesc, h1Count, bodyCopyLength: bodyCopy.trim().length };
        });

        const csample = `Sampled: ${collectionPath}`;

        // H1
        if (coll.h1Count === 0) {
          findings.push({ issue: `Collection page missing an H1 (${collectionPath})`, why: 'Collection pages without H1s lose the chance to rank for category-level keywords (e.g. "men\'s running shoes") that drive bulk product discovery.', fix: `Add a descriptive <h1> to ${collectionPath} matching the category keyword.`, evidence: csample });
        } else if (coll.h1Count > 1) {
          findings.push({ issue: `Collection page has multiple H1s (${coll.h1Count} on ${collectionPath})`, why: 'Multiple H1s blur the category focus and weaken category-keyword rankings.', fix: `Keep one H1 on ${collectionPath}; demote the rest to H2.`, evidence: csample });
        } else {
          passes.push({ title: 'Collection pages use a single H1', detail: `Verified on ${collectionPath} — strong category-keyword anchor.`, category: 'On-Page SEO', evidence: csample });
        }

        // Body copy ≥120 chars
        if (coll.bodyCopyLength < 120) {
          findings.push({ issue: `Collection page has thin body copy (${coll.bodyCopyLength} chars on ${collectionPath})`, why: 'Collection pages with only a product grid look thin to Google. A short intro paragraph (≥120 chars) of contextual copy signals topical relevance and competes for category SERPs.', fix: `Add ${120 - coll.bodyCopyLength}+ more characters of category-introducing copy near the H1 on ${collectionPath}.`, evidence: `${coll.bodyCopyLength} chars, ${csample}` });
        } else {
          passes.push({ title: 'Collection pages include intro copy', detail: `${collectionPath} has ${coll.bodyCopyLength} characters of category context — competitive for category SERPs.`, category: 'On-Page SEO', evidence: csample });
        }

        // Meta title
        if (!coll.title || coll.title.trim().length === 0) {
          findings.push({ issue: `Collection page missing title tag (${collectionPath})`, why: 'Without a title the collection can\'t rank or display in SERPs.', fix: `Add a unique title under 70 characters to ${collectionPath}.`, evidence: csample });
        } else if (coll.title.length > 70) {
          findings.push({ issue: `Collection page title too long (${coll.title.length} chars on ${collectionPath})`, why: 'Titles over 70 chars truncate in SERPs and lose category keywords.', fix: `Shorten ${collectionPath} title to ≤70 characters.`, evidence: `${coll.title.length} chars on ${collectionPath}` });
        } else {
          passes.push({ title: 'Collection page titles are SERP-safe', detail: `${collectionPath} title is ${coll.title.length} characters.`, category: 'On-Page SEO', evidence: csample });
        }

        // Meta description
        if (!coll.metaDesc || coll.metaDesc.trim().length === 0) {
          findings.push({ issue: `Collection page missing meta description (${collectionPath})`, why: 'No meta description means Google auto-generates one from product card text — usually a poor selling pitch for the category as a whole.', fix: `Write a 120–140 character meta description for ${collectionPath} that pitches the category.`, evidence: csample });
        } else if (coll.metaDesc.length > 140) {
          findings.push({ issue: `Collection page meta description too long (${coll.metaDesc.length} chars on ${collectionPath})`, why: 'Descriptions over 140 chars get truncated in SERPs.', fix: `Shorten ${collectionPath} meta description to ≤140 characters.`, evidence: `${coll.metaDesc.length} chars on ${collectionPath}` });
        } else {
          passes.push({ title: 'Collection meta descriptions are tight', detail: `${collectionPath} meta description is ${coll.metaDesc.length} characters.`, category: 'On-Page SEO', evidence: csample });
        }

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(500);
      }
    } catch (err) {
      // Sitemap-based rubric failed — non-critical, continue
    }

    // ═══════════════════════════════════════════════════════
    // AI SEARCH READINESS (GEO)
    // ═══════════════════════════════════════════════════════

    // llms.txt check (via fetch)
    let hasLlmsTxt = false;
    try {
      const llmsResp = await fetch(`${origin}/llms.txt`, { signal: AbortSignal.timeout(5000) });
      hasLlmsTxt = llmsResp.ok;
    } catch { /* fine */ }
    if (!hasLlmsTxt) {
      findings.push({ issue: 'Missing llms.txt file', why: 'llms.txt is an emerging standard that tells AI crawlers (ChatGPT, Perplexity, Claude) how to interpret your site. Early adoption signals authority to AI search engines.', fix: 'Create an /llms.txt file describing your brand, services, and key content. Include your value proposition, target audience, and primary offerings in a structured format.' });
    }

    // Semantic HTML quality
    const semanticData = await page.evaluate(() => {
      const hasMain = !!document.querySelector('main');
      const hasNav = !!document.querySelector('nav');
      const hasArticle = !!document.querySelector('article');
      const hasSection = document.querySelectorAll('section').length;
      const hasHeader = !!document.querySelector('header');
      const hasFooter = !!document.querySelector('footer');
      const divCount = document.querySelectorAll('div').length;
      const semanticCount = (hasMain ? 1 : 0) + (hasNav ? 1 : 0) + (hasArticle ? 1 : 0) + hasSection + (hasHeader ? 1 : 0) + (hasFooter ? 1 : 0);
      return { hasMain, hasNav, hasArticle, hasSection, hasHeader, hasFooter, divCount, semanticCount };
    });
    if (!semanticData.hasMain) {
      findings.push({ issue: 'Missing <main> landmark element', why: 'The <main> element helps search engines and AI crawlers identify the primary content of the page, separating it from navigation, headers, and footers. This improves content extraction accuracy.', fix: 'Wrap the primary page content in a <main> element.' });
    }
    if (semanticData.divCount > 50 && semanticData.semanticCount < 5) {
      findings.push({ issue: 'Low semantic HTML usage (div-heavy structure)', why: 'Pages built primarily with <div> elements provide weak signals to search engines and AI crawlers about content structure. Semantic HTML (section, article, aside, nav) improves content understanding.', fix: 'Replace generic <div> elements with semantic HTML5 tags: <section>, <article>, <aside>, <nav>, <header>, <footer>.' });
    }

    // Content depth / thin content
    const contentData = await page.evaluate(() => {
      const main = document.querySelector('main') || document.body;
      const text = (main.innerText || '').replace(/\s+/g, ' ').trim();
      const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;

      // Check for duplicate text blocks
      const paragraphs = Array.from(document.querySelectorAll('p, li')).map(el => (el.textContent || '').trim()).filter(t => t.length > 50);
      const seen = new Map<string, number>();
      let duplicateBlocks = 0;
      for (const p of paragraphs) {
        const normalized = p.toLowerCase().replace(/\s+/g, ' ');
        seen.set(normalized, (seen.get(normalized) || 0) + 1);
      }
      for (const [, count] of seen) {
        if (count > 1) duplicateBlocks++;
      }

      // Check for Q&A / FAQ content structure
      const hasQuestionPatterns = paragraphs.some(p => /^(what|how|why|when|where|who|can|does|is|are)\s/i.test(p));
      const hasFaqSection = !!document.querySelector('[class*="faq"], [id*="faq"], [data-faq]');

      return { wordCount, duplicateBlocks, hasQuestionPatterns, hasFaqSection, paragraphCount: paragraphs.length };
    });

    if (contentData.wordCount < 300) {
      findings.push({ issue: `Thin content detected (${contentData.wordCount} words)`, why: 'Pages with fewer than 300 words typically lack the depth needed to rank for competitive keywords. Google favors comprehensive content that thoroughly covers a topic.', fix: 'Expand page content to at least 500-800 words. Add detailed service descriptions, use cases, benefits, and supporting evidence.', evidence: `${contentData.wordCount} words on page` });
    }

    if (contentData.duplicateBlocks > 2) {
      findings.push({ issue: `${contentData.duplicateBlocks} duplicate content block(s) on page`, why: 'Repeated text blocks on the same page signal low content quality to search engines and dilute topical relevance. AI crawlers may also extract duplicate information.', fix: 'Remove or rewrite duplicate paragraphs. Each section should have unique, purposeful content.' });
    }

    if (!contentData.hasFaqSection && !contentData.hasQuestionPatterns) {
      findings.push({ issue: 'No FAQ or Q&A content structure detected', why: 'Pages with question-and-answer content are more likely to appear in AI search results (ChatGPT, Perplexity) and Google\'s "People Also Ask" featured snippets. This is critical for GEO visibility.', fix: 'Add an FAQ section addressing common questions about your services. Structure with clear questions as headings and concise answers. Pair with FAQ schema markup.' });
    }

    // ═══════════════════════════════════════════════════════
    // LINKS
    // ═══════════════════════════════════════════════════════

    const linkData = await page.evaluate(() => {
      const links = document.querySelectorAll('a');
      let emptyHref = 0, hashOnly = 0, internalNofollow = 0, externalCount = 0, internalCount = 0;
      const broken: string[] = [];
      const currentHost = window.location.hostname;

      links.forEach((a) => {
        const href = a.getAttribute('href');
        if (!href || href === '') { emptyHref++; return; }
        if (href === '#') { hashOnly++; return; }
        try {
          const linkUrl = new URL(href, window.location.origin);
          if (linkUrl.hostname === currentHost) {
            internalCount++;
            if (a.getAttribute('rel')?.includes('nofollow')) internalNofollow++;
          } else {
            externalCount++;
          }
        } catch { /* invalid URL */ }
      });

      // Check for descriptive anchor text
      let genericAnchorCount = 0;
      links.forEach((a) => {
        const text = (a.textContent || '').trim().toLowerCase();
        if (['click here', 'read more', 'learn more', 'here', 'link', 'more'].includes(text)) genericAnchorCount++;
      });

      return { emptyHref, hashOnly, internalNofollow, externalCount, internalCount, genericAnchorCount, total: links.length };
    });

    if (linkData.emptyHref > 0) {
      findings.push({ issue: `${linkData.emptyHref} link(s) with empty href`, why: 'Empty href links waste crawl budget and provide no link equity. They create dead ends for crawlers.', fix: 'Add proper href attributes to all links, or convert to buttons.' });
    }

    if (linkData.internalNofollow > 0) {
      findings.push({ issue: `${linkData.internalNofollow} internal link(s) with nofollow`, why: 'Adding nofollow to internal links prevents PageRank from flowing to your own pages, which is almost always unintentional and wastes link equity.', fix: 'Remove rel="nofollow" from internal links. Reserve nofollow for external links you don\'t want to endorse.' });
    }

    if (linkData.genericAnchorCount > 3) {
      findings.push({ issue: `${linkData.genericAnchorCount} links using generic anchor text`, why: 'Anchor text like "click here" or "read more" provides no topical context to search engines. Descriptive anchor text is a ranking signal.', fix: 'Replace generic text with descriptive anchors that include relevant keywords (e.g., "view our SEO case studies" instead of "click here").', evidence: `${linkData.genericAnchorCount} generic anchors found` });
    }

    if (linkData.internalCount < 3) {
      findings.push({ issue: 'Very few internal links on page', why: 'Internal links distribute PageRank and help search engines discover and understand the relationship between pages. Sparse internal linking weakens site authority.', fix: 'Add contextual internal links to related pages. Aim for 3-10 internal links per page pointing to relevant content.' });
    }

    // ═══════════════════════════════════════════════════════
    // BRAND AUTHORITY (GEO / AI PERCEPTION)
    // ═══════════════════════════════════════════════════════

    // Gather page context for AI analysis
    const pageContext = await page.evaluate(() => {
      const title = document.title || '';
      const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
      const h1 = document.querySelector('h1')?.textContent?.trim() || '';
      const headings = Array.from(document.querySelectorAll('h2')).slice(0, 5).map(h => h.textContent?.trim()).filter(Boolean);
      return { title, metaDesc, h1, headings };
    });

    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const hostname = new URL(url).hostname.replace(/^www\./, '');
        const brandName = hostname.split('.')[0];

        const geoAnalysis = await ai.messages.create({
          model: 'claude-sonnet-5',
          max_tokens: 800,
          temperature: 0,
          messages: [{
            role: 'user',
            content: `Analyze this brand for AI search visibility. The website is ${hostname}.
Page title: "${pageContext.title}"
Meta description: "${pageContext.metaDesc}"
H1: "${pageContext.h1}"
Key sections: ${pageContext.headings.join(', ')}

Answer in JSON format:
{
  "brandAuthority": {
    "known": true/false,
    "description": "1-sentence description of what they do or 'Unknown brand'",
    "recommended": true/false,
    "authorityScore": 1-10 (how authoritative is this brand in AI recommendations)
  },
  "competitors": {
    "topCompetitors": ["name1", "name2", "name3"],
    "competitorAdvantages": "1-2 sentences on what competitors do better for online visibility",
    "trafficThreats": "1-2 sentences on where competitors are likely stealing traffic"
  },
  "contentGaps": {
    "missingTopics": ["topic1", "topic2", "topic3"],
    "recommendation": "1-2 sentences on content this site should create to compete"
  }
}

Respond with JSON only.`
          }],
        });

        const textBlock = geoAnalysis.content.find((b: any) => b.type === 'text') as any;
        if (textBlock?.text) {
          try {
            const cleaned = (textBlock.text as string).replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
            const data = JSON.parse(cleaned);

            // Brand Authority findings
            if (data.brandAuthority) {
              const ba = data.brandAuthority;
              if (!ba.known) {
                findings.push({
                  issue: 'Brand not recognized by AI search engines',
                  why: `AI assistants (ChatGPT, Claude, Perplexity) have no knowledge of "${brandName}". As search shifts to AI-powered recommendations, invisible brands lose traffic to competitors that AI does recommend.`,
                  fix: 'Build brand entity: publish original research, get featured in industry publications, add Organization schema, and establish presence on Wikipedia, Crunchbase, LinkedIn, and industry directories.',
                  evidence: `AI perception: "${ba.description}"`,
                });
              } else if (!ba.recommended || ba.authorityScore < 5) {
                findings.push({
                  issue: `Low AI authority score (${ba.authorityScore}/10)`,
                  why: `AI assistants know "${brandName}" but rate it ${ba.authorityScore}/10 for authority. Brands scoring below 7 are rarely recommended by AI search engines, losing traffic to higher-authority competitors.`,
                  fix: 'Strengthen authority signals: publish case studies with metrics, get third-party reviews, earn mentions in industry publications, and ensure consistent NAP (name, address, phone) across the web.',
                  evidence: `AI perception: "${ba.description}"`,
                });
              }
            }

            // Competitive Threat findings
            if (data.competitors) {
              const comp = data.competitors;
              if (comp.topCompetitors && comp.topCompetitors.length > 0) {
                findings.push({
                  issue: `${comp.topCompetitors.length} competitors threatening search visibility`,
                  why: `${comp.competitorAdvantages || 'Competitors have stronger online presence.'} ${comp.trafficThreats || ''}`.trim(),
                  fix: `Analyze what ${comp.topCompetitors.slice(0, 2).join(' and ')} are doing for SEO. Create content targeting their ranking keywords. Build backlinks from the same industry sources they use.`,
                  evidence: `Top competitors: ${comp.topCompetitors.join(', ')}`,
                });
              }
            }

            // Content Gap findings
            if (data.contentGaps) {
              const gaps = data.contentGaps;
              if (gaps.missingTopics && gaps.missingTopics.length > 0) {
                findings.push({
                  issue: `${gaps.missingTopics.length} content gaps vs competitors`,
                  why: `Competitors are ranking for topics this site doesn't cover. Missing content means missing search traffic and AI recommendations for these subjects.`,
                  fix: `Create content for: ${gaps.missingTopics.join(', ')}. ${gaps.recommendation || ''}`.trim(),
                  evidence: `Missing topics: ${gaps.missingTopics.join(', ')}`,
                });
              }
            }
          } catch { /* JSON parse error, skip */ }
        }
      } catch { /* API error, skip — non-critical check */ }
    }

    // ═══════════════════════════════════════════════════════
    // PERFORMANCE / IMAGE SEO
    // ═══════════════════════════════════════════════════════

    const imageData = crawlResult.content?.images;
    if (imageData) {
      const belowFoldWithoutLazy = imageData.belowFold.filter((img) => !img.hasLazyLoading);
      if (belowFoldWithoutLazy.length > 0) {
        findings.push({ issue: `${belowFoldWithoutLazy.length} below-fold image(s) missing lazy loading`, why: 'Non-lazy images below the fold delay page load, hurting Core Web Vitals (LCP) which is a Google ranking signal.', fix: `Add loading="lazy" to ${belowFoldWithoutLazy.length} below-fold images.` });
      }

      if (imageData.lcpImage && imageData.lcpImage.fileSize > 250 * 1024) {
        const lcp = imageData.lcpImage;
        findings.push({ issue: `LCP image too large (${(lcp.fileSize / 1024).toFixed(0)}KB)`, why: 'Google uses LCP as a ranking signal. A large LCP image directly suppresses search rankings.', fix: `Compress to under 100KB. Use WebP/AVIF. Current: ${(lcp.fileSize / 1024).toFixed(0)}KB, ${lcp.format}.` });
      }

      if (imageData.totalImageSize > 2 * 1024 * 1024) {
        findings.push({ issue: `Total images ${(imageData.totalImageSize / (1024 * 1024)).toFixed(1)}MB`, why: 'Excessive image weight hurts Core Web Vitals and mobile search rankings.', fix: 'Compress all images, convert to WebP/AVIF, implement lazy loading. Target 50%+ reduction.' });
      }
    }

    await page.close();
  } finally {
    await browser.close();
  }

  return { findings, passes };
}
