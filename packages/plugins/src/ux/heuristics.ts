import { chromium } from 'playwright';
import type { HeuristicsResult, HeuristicFinding } from '../types';

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
  const origin = new URL(url).origin;

  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    // ═══════════════════════════════════════════════════════
    // TECHNICAL SEO
    // ═══════════════════════════════════════════════════════

    // Title tag
    const title = await page.title();
    if (!title || title.trim().length === 0) {
      findings.push({ issue: 'Missing page title tag', why: 'The title tag is the #1 on-page ranking factor. Without it, search engines cannot properly index or display the page in SERPs.', fix: 'Add a unique, descriptive <title> tag (50-60 characters) with the primary keyword.' });
    } else if (title.length > 60) {
      findings.push({ issue: `Title tag too long (${title.length} chars)`, why: 'Titles over 60 characters get truncated in SERPs, cutting off keywords and reducing CTR.', fix: `Shorten to under 60 characters. Current: "${title.substring(0, 60)}..."`, evidence: `${title.length} characters` });
    }

    // Meta description
    const metaDesc = await page.$eval('meta[name="description"]', (el) => el.getAttribute('content')).catch(() => null);
    if (!metaDesc || metaDesc.trim().length === 0) {
      findings.push({ issue: 'Missing meta description', why: 'Without a meta description, Google auto-generates snippets that may not convey value, reducing CTR from SERPs by up to 30%.', fix: 'Add a compelling meta description (120-155 chars) with the primary keyword and a call-to-action.' });
    } else if (metaDesc.length > 160) {
      findings.push({ issue: `Meta description too long (${metaDesc.length} chars)`, why: 'Descriptions over 160 characters get truncated, potentially cutting off the CTA.', fix: 'Shorten to 120-155 characters. Front-load keywords and value prop.', evidence: `${metaDesc.length} characters` });
    }

    // Canonical tag
    const canonical = await page.$eval('link[rel="canonical"]', (el) => el.getAttribute('href')).catch(() => null);
    if (!canonical) {
      findings.push({ issue: 'Missing canonical tag', why: 'Without a canonical tag, search engines may index duplicate versions of this page (trailing slashes, query params, etc.), diluting ranking signals and wasting crawl budget.', fix: 'Add a self-referencing <link rel="canonical"> tag pointing to the preferred URL.' });
    }

    // HTML lang
    const htmlLang = await page.$eval('html', (el) => el.getAttribute('lang')).catch(() => null);
    if (!htmlLang) {
      findings.push({ issue: 'Missing HTML lang attribute', why: 'The lang attribute helps search engines serve pages to the right audience and is required for proper internationalization.', fix: 'Add lang="en" (or appropriate language code) to the <html> tag.' });
    }

    // Viewport
    const viewport = await page.$eval('meta[name="viewport"]', (el) => el.getAttribute('content')).catch(() => null);
    if (!viewport) {
      findings.push({ issue: 'Missing viewport meta tag', why: 'Without a viewport tag, pages fail mobile-friendliness tests. Google uses mobile-first indexing, so this directly impacts rankings.', fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.' });
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

    // Heading hierarchy
    const headingData = await page.evaluate(() => {
      const headings: Array<{ level: number; text: string }> = [];
      document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => {
        headings.push({ level: parseInt(h.tagName[1]), text: (h.textContent || '').trim().substring(0, 80) });
      });
      return headings;
    });
    if (headingData.length > 1) {
      for (let i = 1; i < headingData.length; i++) {
        if (headingData[i].level > headingData[i - 1].level + 1) {
          findings.push({ issue: 'Heading hierarchy skips levels', why: 'Skipping heading levels (e.g., H1 → H3) breaks semantic structure. Search engines rely on hierarchy to understand content organization.', fix: 'Ensure headings follow H1 → H2 → H3 order without skipping.' });
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
      const schemas: Array<{ type: string; raw: string }> = [];
      scripts.forEach((s) => {
        try {
          const data = JSON.parse(s.textContent || '');
          const type = data['@type'] || (Array.isArray(data['@graph']) ? 'Graph' : 'Unknown');
          schemas.push({ type, raw: (s.textContent || '').substring(0, 200) });
        } catch { schemas.push({ type: 'Invalid JSON', raw: (s.textContent || '').substring(0, 100) }); }
      });
      return schemas;
    });

    if (schemaData.length === 0) {
      findings.push({ issue: 'No structured data (JSON-LD) found', why: 'Structured data enables rich results in SERPs (stars, FAQs, breadcrumbs, sitelinks) which can increase CTR by 20-30%. It also helps AI search engines understand your content.', fix: 'Add JSON-LD structured data: Organization schema (brand info), FAQ schema (common questions), Breadcrumb schema (navigation), and Service/Product schema as relevant.' });
    } else {
      const types = schemaData.map(s => s.type);
      if (!types.some(t => /organization|localbusiness|company/i.test(t))) {
        findings.push({ issue: 'Missing Organization schema markup', why: 'Organization schema tells search engines and AI assistants who you are, your logo, social profiles, and contact info. This strengthens your Knowledge Panel and brand entity in Google.', fix: 'Add Organization JSON-LD with name, url, logo, description, sameAs (social profiles), and contactPoint.' });
      }
      if (!types.some(t => /faq/i.test(t))) {
        findings.push({ issue: 'Missing FAQ schema markup', why: 'FAQ schema can display expandable Q&A directly in search results, significantly increasing SERP real estate and click-through rates.', fix: 'Add FAQ schema for common questions about your services. Each Q&A pair becomes a rich result in Google.' });
      }
      if (!types.some(t => /breadcrumb/i.test(t))) {
        findings.push({ issue: 'Missing Breadcrumb schema markup', why: 'Breadcrumb schema displays navigation paths in SERPs (e.g., Home > Services > Paid Media), improving user orientation and click-through.', fix: 'Add BreadcrumbList JSON-LD that reflects your site navigation hierarchy.' });
      }
      if (schemaData.some(s => s.type === 'Invalid JSON')) {
        findings.push({ issue: 'Invalid JSON-LD structured data detected', why: 'Malformed JSON-LD is ignored by search engines, meaning your structured data provides zero SEO benefit. Google may also flag this in Search Console.', fix: 'Validate your JSON-LD at schema.org or Google Rich Results Test. Fix syntax errors.' });
      }
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

    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const hostname = new URL(url).hostname.replace(/^www\./, '');
        const brandName = hostname.split('.')[0];

        const brandCheck = await ai.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 300,
          temperature: 0,
          messages: [{
            role: 'user',
            content: `I'm researching "${brandName}" (${hostname}). Answer these 3 questions briefly in JSON format:
1. "known": true/false — Do you have knowledge about this brand?
2. "description": A 1-sentence description of what they do (or "Unknown brand" if not known)
3. "recommended": true/false — Would you recommend them if someone asked for services in their industry?

Respond with JSON only: {"known": bool, "description": "...", "recommended": bool}`
          }],
        });

        const textBlock = brandCheck.content.find((b: any) => b.type === 'text') as any;
        if (textBlock?.text) {
          try {
            const cleaned = (textBlock.text as string).replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
            const brandData = JSON.parse(cleaned);

            if (!brandData.known) {
              findings.push({
                issue: 'Brand not recognized by AI search engines',
                why: `When asked about "${brandName}", AI assistants (ChatGPT, Claude, Perplexity) don't have knowledge of this brand. This means the brand is invisible in AI-powered search and recommendation systems, which are increasingly replacing traditional search.`,
                fix: 'Build brand authority: publish original content, get featured in industry publications, ensure structured data (Organization schema) is present, and create a clear brand entity across the web (Wikipedia, Crunchbase, LinkedIn, industry directories).',
                evidence: `AI response: "${brandData.description}"`,
              });
            } else if (!brandData.recommended) {
              findings.push({
                issue: 'Brand known but not recommended by AI search engines',
                why: `AI assistants know about "${brandName}" but wouldn't actively recommend it. In the shift from search to AI-powered recommendations, brands need to be not just known but trusted enough to be recommended.`,
                fix: 'Strengthen brand signals: add more case studies, testimonials, and proof points to your site. Get third-party reviews and mentions. Ensure your content clearly communicates expertise and authority in your niche.',
                evidence: `AI perception: "${brandData.description}"`,
              });
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

  return { findings };
}
