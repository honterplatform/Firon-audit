import { chromium, Browser } from 'playwright';
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
        aboveFold: Array<{
          url: string;
          naturalWidth: number;
          naturalHeight: number;
          displayedWidth: number;
          displayedHeight: number;
          fileSize: number;
          format: string;
          hasLazyLoading: boolean;
          hasSrcset: boolean;
          isLcpCandidate: boolean;
        }>;
        belowFold: Array<{
          url: string;
          naturalWidth: number;
          naturalHeight: number;
          displayedWidth: number;
          displayedHeight: number;
          fileSize: number;
          format: string;
          hasLazyLoading: boolean;
          hasSrcset: boolean;
        }>;
        totalImages: number;
        totalImageSize: number;
        lcpImage?: {
          url: string;
          fileSize: number;
          format: string;
          naturalWidth: number;
          naturalHeight: number;
          displayedWidth: number;
          displayedHeight: number;
        };
      };
    };
  }
): Promise<HeuristicsResult> {
  const browser = await chromium.launch({ 
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-http2', // Disable HTTP/2 to avoid protocol errors
    ],
  });
  const findings: HeuristicFinding[] = [];

  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      extraHTTPHeaders: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
      },
    });
    
    // Add stealth techniques to avoid bot detection
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
      (window as any).chrome = { runtime: {} };
    });
    
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    // Check 1: No visible CTA above the fold
    const viewportHeight = 900;
    const ctaElements = await page.locator('button, a[role="button"], input[type="submit"], .btn, [class*="button"], a[href*="#"], a[href*="/"]').all();
    let visibleCtaAboveFold = false;
    let firstCtaViewportOffset: number | null = null;
    for (const el of ctaElements) {
      if (await el.isVisible()) {
        const box = await el.boundingBox();
        if (box && box.y < viewportHeight && box.y + box.height > 0) {
          const text = await el.textContent();
          if (text && text.trim().length > 0) {
            visibleCtaAboveFold = true;
            break;
          }
        }
        if (box && firstCtaViewportOffset === null) {
          firstCtaViewportOffset = box.y;
        }
      }
    }
    if (!visibleCtaAboveFold) {
      findings.push({
        issue: 'No visible CTA above the fold',
        why: 'Users need a clear next action when they first land on the page. Without a visible CTA, conversion rates suffer.',
        fix: 'Add a prominent, clearly labeled button or link above the fold that guides users to the primary action.',
        evidence: 'No clickable CTA elements found in viewport (0-900px from top)',
      });
    }
    if (firstCtaViewportOffset !== null && firstCtaViewportOffset > viewportHeight * 0.75) {
      findings.push({
        issue: 'Primary CTA appears below the fold',
        why: 'If the main CTA sits far below the initial viewport, visitors may miss the primary action before scrolling.',
        fix: 'Reposition the primary CTA higher in the hero or add a secondary CTA above the fold to guide first-time visitors.',
        evidence: `First CTA detected at ${Math.round(firstCtaViewportOffset)}px from top (viewport height ${viewportHeight}px)`,
      });
    }

    // Check 2: Missing/duplicate H1
    const h1Elements = await page.locator('h1').all();
    if (h1Elements.length === 0) {
      findings.push({
        issue: 'Missing H1 heading',
        why: 'H1 headings are critical for SEO and accessibility. Pages should have exactly one H1.',
        fix: 'Add a single, descriptive H1 heading that clearly communicates the page purpose.',
      });
    } else if (h1Elements.length > 1) {
      findings.push({
        issue: 'Multiple H1 headings found',
        why: 'Multiple H1s dilute SEO value and confuse screen readers. Pages should have exactly one H1.',
        fix: 'Keep only one H1 for the main page heading. Convert others to H2 or lower-level headings.',
        evidence: `Found ${h1Elements.length} H1 elements`,
      });
    }

    // Check 3: More than 3 primary CTAs in hero
    const heroArea = crawlResult.selectors.heroBbox || { y: 0, height: viewportHeight };
    const heroCTAs: string[] = [];
    for (const el of ctaElements) {
      if (await el.isVisible()) {
        const box = await el.boundingBox();
        if (box && box.y >= heroArea.y && box.y < heroArea.y + Math.min(heroArea.height, viewportHeight)) {
          const isNavItem = await el.evaluate((node) =>
            Boolean(node.closest('nav,[role="navigation"],header nav'))
          );
          if (isNavItem) {
            continue;
          }
          const text = await el.textContent();
          const trimmed = text?.trim() ?? '';
          if (trimmed.length < 2) {
            continue;
          }
          if (!heroCTAs.includes(trimmed)) {
            heroCTAs.push(trimmed);
          }
        }
      }
    }
    if (heroCTAs.length > 3) {
      findings.push({
        issue: 'Too many primary CTAs in hero section',
        why: 'Multiple CTAs create decision paralysis and reduce conversion rates. Focus on one primary action.',
        fix: 'Reduce to 1-2 CTAs in the hero: one primary and optionally one secondary. Move other actions lower on the page.',
        evidence: `Found ${heroCTAs.length} CTAs: ${heroCTAs.slice(0, 3).join(', ')}${heroCTAs.length > 3 ? '...' : ''}`,
      });
    }

    // Check 4: Nav entropy - primary nav has >7 items without grouping
    const navElements = await page.locator('nav, [role="navigation"], header nav, .nav, .navigation').first();
    if (await navElements.isVisible()) {
      const navLinks = await navElements.locator('a, [role="link"]').all();
      const visibleLinks = [];
      for (const link of navLinks) {
        if (await link.isVisible()) {
          const text = await link.textContent();
          if (text && text.trim().length > 0) {
            visibleLinks.push(text.trim());
          }
        }
      }
      if (visibleLinks.length > 7) {
        const hasGroups = await navElements.locator('[role="menubar"], .nav-group, .dropdown, [aria-haspopup]').count() > 0;
        if (!hasGroups) {
          findings.push({
            issue: 'Primary navigation has too many items without grouping',
            why: 'Navigation with >7 items becomes overwhelming and hard to scan. Users struggle to find what they need.',
            fix: 'Group related items into dropdowns, use mega menus, or prioritize and hide less important items.',
            evidence: `Found ${visibleLinks.length} navigation items without grouping`,
          });
        }
      }
    }

    // Check 5: Images above fold missing alt
    const imageElements = await page.locator('img').all();
    let missingAltCount = 0;
    for (const img of imageElements) {
      if (await img.isVisible()) {
        const box = await img.boundingBox();
        if (box && box.y < viewportHeight) {
          const alt = await img.getAttribute('alt');
          if (alt === null || alt === '') {
            missingAltCount++;
          }
        }
      }
    }
    if (missingAltCount > 0) {
      findings.push({
        issue: 'Images above the fold missing alt text',
        why: 'Alt text is essential for screen readers and SEO. Images without alt text are inaccessible.',
        fix: 'Add descriptive alt text to all images. Use empty alt="" only for decorative images.',
        evidence: `Found ${missingAltCount} image(s) above the fold without alt text`,
      });
    }

    // Check 6: Button affordance - non-button elements styled as buttons with no role
    const buttonLikeElements = await page.locator('[class*="button"], [class*="btn"], a, div, span').all();
    const buttonLikeIssues: string[] = [];
    for (const el of buttonLikeElements) {
      const tagName = await el.evaluate((e) => e.tagName.toLowerCase());
      if (tagName !== 'button' && tagName !== 'input') {
        const classes = await el.getAttribute('class') || '';
        const hasButtonClass = /button|btn/i.test(classes);
        const role = await el.getAttribute('role');
        const isClickable = await el.evaluate((e: HTMLElement) => {
          const style = window.getComputedStyle(e);
          return style.cursor === 'pointer' || (e as any).onclick !== null;
        });
        if (hasButtonClass || isClickable) {
          if (role !== 'button' && tagName !== 'a') {
            const text = await el.textContent();
            if (text && text.trim().length > 0) {
              buttonLikeIssues.push(text.trim().substring(0, 30));
              if (buttonLikeIssues.length >= 3) break;
            }
          }
        }
      }
    }
    if (buttonLikeIssues.length > 0) {
      findings.push({
        issue: 'Non-button elements styled as buttons without proper role',
        why: 'Elements that look like buttons but lack the button role or semantic HTML confuse screen readers and keyboard navigation.',
        fix: 'Use <button> elements or add role="button" and proper keyboard handlers (Enter, Space) to interactive elements.',
        evidence: `Found elements styled as buttons: ${buttonLikeIssues.join(', ')}${buttonLikeIssues.length >= 3 ? '...' : ''}`,
      });
    }

    // Check 7: Hero motion / interactive cues
    const motionPresence = await page.evaluate(() => {
      const motionSelectors = [
        'video',
        'lottie-player',
        '[data-motion]',
        '[data-animate]',
        '[class*="animate"]',
        '[class*="motion"]',
        'canvas[data-controller="lottie"]',
      ];
      if (document.querySelector(motionSelectors.join(','))) {
        return { hasMotion: true, selectors: motionSelectors };
      }
      const animatedNodes = Array.from(document.querySelectorAll('*')).slice(0, 400);
      for (const node of animatedNodes) {
        const style = window.getComputedStyle(node as Element);
        const animationDuration = style.animationDuration || (style as any).webkitAnimationDuration;
        const transitionDuration = style.transitionDuration || (style as any).webkitTransitionDuration;
        if (
          (animationDuration && animationDuration !== '0s' && animationDuration !== '0ms') ||
          (transitionDuration && transitionDuration !== '0s' && transitionDuration !== '0ms')
        ) {
          return { hasMotion: true, selectors: [] };
        }
      }
      return { hasMotion: false, selectors: [] };
    });

    if (!motionPresence.hasMotion) {
      findings.push({
        issue: 'Hero feels static',
        why: 'Pages without motion cues or interactive feedback can feel lifeless, reducing perceived polish and engagement.',
        fix: 'Introduce subtle motion (e.g., micro-interactions on CTAs, animated hero media, staggered content reveals) to guide attention and signal interactivity.',
      });
    }

    // Check 8: Trust signals and testimonials
    const trustEvidence = await page.evaluate(() => {
      const clean = (value?: string | null) => (value || '').replace(/\s+/g, ' ').trim();
      const trustSelectors = [
        '[data-testimonial]',
        '.testimonial',
        '.testimonials',
        'blockquote',
        'q',
        '[class*="testimonial"]',
        '[class*="logos"]',
        '[class*="trust"]',
        '[data-trust]',
        '[data-partners]',
      ];
      const testimonials = Array.from(document.querySelectorAll(trustSelectors.join(',')))
        .map((node) => clean(node.textContent))
        .filter((text) => text.length > 40);
      return testimonials.slice(0, 3);
    });

    if (trustEvidence.length === 0) {
      findings.push({
        issue: 'No testimonials or trust signals detected',
        why: 'Without social proof, visitors may hesitate to believe claims, which hurts conversions for cold traffic.',
        fix: 'Add testimonials, logos, ratings, or case snippets above the fold to build credibility quickly.',
      });
    }

    // Check 9: Pricing clarity signal
    const pricingPresence = await page.evaluate(() => {
      const clean = (value?: string | null) => (value || '').replace(/\s+/g, ' ').trim();
      const pricingMarkers = Array.from(
        document.querySelectorAll('section, div, span, p, li, h2, h3')
      )
        .map((node) => clean(node.textContent))
        .filter((text) => /pricing|plans|package|per month|per year|\$\d|€\d|£\d/i.test(text));
      return pricingMarkers.slice(0, 3);
    });

    if (pricingPresence.length === 0) {
      findings.push({
        issue: 'Pricing or plan details are hard to find',
        why: 'If pricing or plan structure is hidden or absent, visitors may bounce to competitors instead of starting a trial.',
        fix: 'Surface pricing or plan information (or a clear link to it) near the primary CTA or in navigation.',
      });
    }

    // Check 10: Form availability in hero
    const heroFormPresent = await page.evaluate(() => {
      const hero = document.querySelector('[data-hero], section.hero, .hero, main section, header') || document.body;
      if (!hero) return false;
      return Boolean(hero.querySelector('form, input[type="email"], input[type="text"], textarea, select'));
    });

    if (!heroFormPresent) {
      findings.push({
        issue: 'No lead capture form in or near the hero',
        why: 'If the goal is to generate signups or demos, a lightweight capture option near the hero increases conversions for ready visitors.',
        fix: 'Add a micro-form or email capture near the primary CTA to remove friction for high-intent visitors.',
      });
    }

    // Typography heuristics
    const typography = crawlResult.content?.typography;
    if (typography) {
      // Check body text size
      if (typography.body && typography.body.fontSize > 0) {
        if (typography.body.fontSize < 16) {
          findings.push({
            issue: 'Body text is too small (<16px)',
            why: 'Text smaller than 16px is harder to read, especially on mobile devices, reducing accessibility and user engagement. Small text increases cognitive load and eye strain.',
            fix: `Increase body text to at least 16px (currently ${typography.body.fontSize.toFixed(1)}px). For better readability, consider 18px for body text.`,
            evidence: `Body font size: ${typography.body.fontSize.toFixed(1)}px`,
          });
        }
      }

      // Check heading hierarchy
      if (typography.headingHierarchy && typography.headingHierarchy.length > 0) {
        const h1Data = typography.headingHierarchy.find(h => h.level === 1);
        const h2Data = typography.headingHierarchy.find(h => h.level === 2);
        
        // Check if H1 is smaller than H2 (incorrect hierarchy)
        if (h1Data && h2Data && h1Data.fontSize < h2Data.fontSize) {
          findings.push({
            issue: 'Heading hierarchy is reversed (H1 smaller than H2)',
            why: 'Visual hierarchy should match semantic hierarchy. When H1 appears smaller than H2, it confuses users and breaks expectations, reducing scannability and visual clarity.',
            fix: `Make H1 larger than H2. H1 should be the most prominent (recommended: ${Math.max(32, h2Data.fontSize * 1.2).toFixed(0)}px+), H2 should be smaller but still prominent.`,
            evidence: `H1: ${h1Data.fontSize.toFixed(1)}px, H2: ${h2Data.fontSize.toFixed(1)}px`,
          });
        }

        // Check if H1 is too small
        if (h1Data && h1Data.fontSize > 0 && h1Data.fontSize < 24) {
          findings.push({
            issue: 'H1 heading is too small (<24px)',
            why: 'H1 headings should be visually prominent to establish clear hierarchy and grab attention. Small H1s fail to create visual impact and reduce the page\'s ability to communicate key messages.',
            fix: `Increase H1 size to at least 24px (preferably 32-48px for hero sections). Currently ${h1Data.fontSize.toFixed(1)}px.`,
            evidence: `H1 font size: ${h1Data.fontSize.toFixed(1)}px`,
          });
        }

        // Check if heading sizes are too similar (poor hierarchy)
        if (h1Data && h2Data && h1Data.fontSize > 0 && h2Data.fontSize > 0) {
          const sizeRatio = h1Data.fontSize / h2Data.fontSize;
          if (sizeRatio < 1.2 && sizeRatio > 0.8) {
            findings.push({
              issue: 'Heading sizes are too similar (poor visual hierarchy)',
              why: 'When heading sizes are too similar, users struggle to distinguish importance levels. Clear size differences improve scannability and help users navigate content faster.',
              fix: `Increase size difference between H1 and H2. H1 should be at least 20% larger than H2 (current ratio: ${(sizeRatio * 100).toFixed(0)}%). Aim for H1 to be 1.5-2x larger than H2.`,
              evidence: `H1: ${h1Data.fontSize.toFixed(1)}px, H2: ${h2Data.fontSize.toFixed(1)}px (ratio: ${(sizeRatio * 100).toFixed(0)}%)`,
            });
          }
        }
      }

      // Check line-height for readability
      if (typography.body && typography.body.lineHeight && typography.body.lineHeight !== 'normal') {
        const lineHeightValue = parseFloat(typography.body.lineHeight);
        const fontSize = typography.body.fontSize;
        if (!isNaN(lineHeightValue) && lineHeightValue > 0 && fontSize > 0) {
          const lineHeightRatio = lineHeightValue / fontSize;
          if (lineHeightRatio < 1.4) {
            findings.push({
              issue: 'Line height is too tight (poor readability)',
              why: 'Tight line spacing makes text harder to read, especially for body copy. Adequate line height improves readability, reduces eye strain, and helps users scan content more effectively.',
              fix: `Increase line-height to at least 1.5x font size (current: ${lineHeightRatio.toFixed(2)}x). For body text, aim for 1.5-1.75x font size.`,
              evidence: `Line-height: ${lineHeightValue.toFixed(1)}px, Font size: ${fontSize.toFixed(1)}px (ratio: ${lineHeightRatio.toFixed(2)}x)`,
            });
          }
        }
      }

      // Check if first paragraph has different styling (good practice)
      if (typography.firstParagraph && typography.body) {
        const paraSize = typography.firstParagraph.fontSize;
        const bodySize = typography.body.fontSize;
        if (paraSize > 0 && bodySize > 0 && paraSize === bodySize && paraSize < 18) {
          // This is not necessarily an issue, but we can note if the first paragraph could be more prominent
          // We'll skip adding a finding for this as it's more of a design preference
        }
      }
    }

    // Image optimization heuristics
    const imageData = crawlResult.content?.images;
    if (imageData) {
      // Check 1: Unoptimized above-the-fold images (large file size)
      const largeAboveFoldImages = imageData.aboveFold.filter((img: { fileSize: number; displayedWidth: number; displayedHeight: number }) => {
        // Check if image is >200KB and displayed size is reasonable
        if (img.fileSize > 200 * 1024) {
          const displayedArea = img.displayedWidth * img.displayedHeight;
          // If displayed area is less than 500x500px, it's likely unoptimized
          return displayedArea < 500 * 500;
        }
        return false;
      });

      if (largeAboveFoldImages.length > 0) {
        const largest = largeAboveFoldImages.reduce((prev, current) => 
          current.fileSize > prev.fileSize ? current : prev
        );
        findings.push({
          issue: 'Large unoptimized images above the fold',
          why: `Images above the fold with large file sizes (${(largest.fileSize / 1024).toFixed(0)}KB) slow down page load and hurt LCP, especially on slower connections. This directly impacts user experience and SEO.`,
          fix: `Optimize images above the fold. Compress "${largest.url.substring(largest.url.lastIndexOf('/') + 1)}" (${(largest.fileSize / 1024).toFixed(0)}KB) to reduce file size. Aim for <100KB for above-the-fold images. Use tools like ImageOptim, TinyPNG, or WebP format.`,
          evidence: `Found ${largeAboveFoldImages.length} large image(s) above the fold. Largest: ${(largest.fileSize / 1024).toFixed(0)}KB`,
        });
      }

      // Check 2: LCP image optimization
      if (imageData.lcpImage) {
        const lcp = imageData.lcpImage;
        if (lcp.fileSize > 250 * 1024) {
          findings.push({
            issue: 'LCP (Largest Contentful Paint) image is too large',
            why: `The LCP image (${(lcp.fileSize / 1024).toFixed(0)}KB) is likely the largest element on the page. Large LCP images significantly delay page load and hurt Core Web Vitals scores, directly impacting SEO and user experience.`,
            fix: `Optimize the LCP image "${lcp.url.substring(lcp.url.lastIndexOf('/') + 1)}". Compress to <100KB if possible, use WebP or AVIF format, ensure proper sizing (${lcp.displayedWidth}x${lcp.displayedHeight}px displayed from ${lcp.naturalWidth}x${lcp.naturalHeight}px natural), and consider using responsive images with srcset.`,
            evidence: `LCP image: ${(lcp.fileSize / 1024).toFixed(0)}KB, Format: ${lcp.format}, Size: ${lcp.naturalWidth}x${lcp.naturalHeight}px (displayed: ${lcp.displayedWidth}x${lcp.displayedHeight}px)`,
          });
        }

        // Check if LCP image is displayed smaller than natural size (waste of bandwidth)
        if (lcp.naturalWidth > lcp.displayedWidth * 1.5 || lcp.naturalHeight > lcp.displayedHeight * 1.5) {
          findings.push({
            issue: 'LCP image is significantly larger than displayed size',
            why: `The LCP image is ${lcp.naturalWidth}x${lcp.naturalHeight}px but only displayed at ${lcp.displayedWidth}x${lcp.displayedHeight}px. This wastes bandwidth and slows page load without improving visual quality.`,
            fix: `Serve a properly sized LCP image. Use srcset with multiple sizes or serve an image close to the displayed size (${lcp.displayedWidth}x${lcp.displayedHeight}px). This can reduce file size by 50-70%.`,
            evidence: `Natural: ${lcp.naturalWidth}x${lcp.naturalHeight}px, Displayed: ${lcp.displayedWidth}x${lcp.displayedHeight}px`,
          });
        }
      }

      // Check 3: Missing lazy loading on below-the-fold images
      const belowFoldWithoutLazy = imageData.belowFold.filter((img: { hasLazyLoading: boolean }) => !img.hasLazyLoading);
      if (belowFoldWithoutLazy.length > 0) {
        findings.push({
          issue: 'Below-the-fold images missing lazy loading',
          why: `Images below the fold that load immediately delay the critical rendering path and waste bandwidth. Lazy loading defers non-critical images until they're needed, improving initial page load performance.`,
          fix: `Add loading="lazy" to ${belowFoldWithoutLazy.length} image(s) below the fold. This defers loading until users scroll near them, improving initial page load time and reducing bandwidth usage.`,
          evidence: `Found ${belowFoldWithoutLazy.length} image(s) below the fold without lazy loading`,
        });
      }

      // Check 4: Missing responsive images (srcset)
      const aboveFoldWithoutSrcset = imageData.aboveFold.filter((img: { hasSrcset: boolean; fileSize: number }) => !img.hasSrcset && img.fileSize > 50 * 1024);
      if (aboveFoldWithoutSrcset.length > 0) {
        findings.push({
          issue: 'Above-the-fold images missing responsive srcset',
          why: 'Images without srcset serve the same large image to all devices, wasting bandwidth on mobile devices. Responsive images serve appropriately sized images based on device and screen density.',
          fix: `Add srcset with multiple image sizes for ${aboveFoldWithoutSrcset.length} image(s) above the fold. This ensures mobile devices download smaller images, improving load time and reducing data usage.`,
          evidence: `Found ${aboveFoldWithoutSrcset.length} image(s) above the fold without srcset`,
        });
      }

      // Check 5: Suboptimal image format (PNG instead of WebP for photos)
      const pngImages = imageData.aboveFold.filter((img: { format: string; fileSize: number; displayedWidth: number; displayedHeight: number }) => 
        img.format === 'png' && 
        img.fileSize > 50 * 1024 &&
        // Likely a photo if it's large and not a small icon
        img.displayedWidth > 100 && img.displayedHeight > 100
      );
      if (pngImages.length > 0) {
        findings.push({
          issue: 'Using PNG format for large images (consider WebP)',
          why: `PNG images (${pngImages.length} found) are typically larger than WebP or JPEG for photographic content. WebP can reduce file sizes by 25-35% with the same visual quality, improving load times.`,
          fix: `Convert ${pngImages.length} PNG image(s) to WebP format. WebP provides better compression for photographic content. Use JPEG for photos if WebP isn't supported, or provide fallbacks with <picture> element.`,
          evidence: `Found ${pngImages.length} PNG image(s) above the fold that could be optimized`,
        });
      }

      // Check 6: Total image size is very large
      if (imageData.totalImageSize > 2 * 1024 * 1024) { // >2MB
        findings.push({
          issue: 'Total page image size is very large',
          why: `Total image size is ${(imageData.totalImageSize / (1024 * 1024)).toFixed(1)}MB across ${imageData.totalImages} images. This significantly impacts page load time, especially on slower connections, and can hurt Core Web Vitals scores.`,
          fix: `Optimize all images. Compress images, use modern formats (WebP/AVIF), implement lazy loading for below-the-fold images, and use responsive images with srcset. Aim to reduce total image size by 50%+.`,
          evidence: `Total: ${(imageData.totalImageSize / (1024 * 1024)).toFixed(1)}MB across ${imageData.totalImages} images`,
        });
      }
    }

    await page.close();
  } finally {
    await browser.close();
  }

  return { findings };
}

