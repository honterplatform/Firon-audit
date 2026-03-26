import { chromium, Browser, Page } from 'playwright';
import type { CrawlResult } from '../types';
import { createStorageProvider } from '@audit/pipeline';

export async function runCrawl(
  url: string,
  runId: string
): Promise<CrawlResult> {
  const browser = await chromium.launch({ 
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-http2', // Disable HTTP/2 to avoid protocol errors on problematic sites
    ],
  });
  const storage = createStorageProvider();
  const results: Partial<CrawlResult> = {
    screenshots: {} as any,
    html: {} as any,
    selectors: {},
    content: {
      secondaryCtas: [],
      sectionHeadings: [],
      navItems: [],
      testimonials: [],
      trustSignals: [],
      heroParagraphs: [],
      bulletPoints: [],
      pricingSignals: [],
      motionSelectors: [],
      hasMotion: false,
      hasVideo: false,
      hasForm: false,
    },
  };

  // Helper function to create a desktop page with stealth settings
  const createDesktopStealthPage = async () => {
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
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
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      (window as any).chrome = { runtime: {} };
      const originalQuery = (window.navigator as any).permissions?.query;
      (window.navigator as any).permissions = {
        query: (parameters: any) =>
          parameters.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
            : originalQuery?.(parameters),
      };
    });

    return page;
  };

  // Helper function to create a mobile page with stealth settings
  const createMobileStealthPage = async () => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
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
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    });

    return page;
  };

  // Retry logic for page navigation with timeout and error handling
  const navigateWithRetry = async (targetUrl: string, createPageFn: () => Promise<Page>, maxRetries = 3): Promise<Page> => {
    let lastError: Error | null = null;
    let currentPage: Page | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Create or recreate page
        if (currentPage) {
          try {
            await currentPage.close();
          } catch (e) {
            // Ignore close errors
          }
        }
        currentPage = await createPageFn();

        // Use increasingly lenient strategies: networkidle → load → domcontentloaded
        let strategy: 'networkidle' | 'load' | 'domcontentloaded';
        let timeout: number;
        
        if (attempt === 1) {
          strategy = 'domcontentloaded'; // Start with most lenient
          timeout = 30000; // 30 seconds
        } else if (attempt === 2) {
          strategy = 'domcontentloaded';
          timeout = 45000; // 45 seconds
        } else {
          strategy = 'domcontentloaded';
          timeout = 60000; // 60 seconds
        }
        
        console.log(`[Attempt ${attempt}/${maxRetries}] Navigating to ${targetUrl} with ${strategy}, timeout: ${timeout}ms`);
        
        try {
          const navigationPromise = currentPage.goto(targetUrl, { waitUntil: strategy, timeout });
          await navigationPromise;
          console.log(`[Attempt ${attempt}] Navigation successful with ${strategy}`);
          
          // Wait a bit for any dynamic content
          await currentPage.waitForTimeout(1000);
          return currentPage; // Success
        } catch (navError: any) {
          const errorMsg = navError.message || String(navError);
          console.warn(`[Attempt ${attempt}] Navigation error: ${errorMsg}`);
          
          // If timeout, just return the page anyway (partial load is better than failure)
          if (errorMsg.includes('timeout') || errorMsg.includes('Timeout')) {
            console.warn(`[Attempt ${attempt}] Timeout - accepting partial page load`);
            // Give it a moment to settle
            try {
              await currentPage.waitForTimeout(2000);
            } catch (e) {
              // Ignore
            }
            return currentPage;
          }
          
          throw navError;
        }
      } catch (error: any) {
        lastError = error;
        const errorMessage = error?.message || String(error);
        
        console.error(`[Attempt ${attempt}/${maxRetries}] Navigation failed: ${errorMessage}`);
        
        // If it's the last attempt, return the page anyway if we have one
        if (attempt === maxRetries && currentPage) {
          console.warn(`All retries exhausted, returning partially loaded page`);
          return currentPage;
        }
        
        // Wait before retry
        if (attempt < maxRetries) {
          const waitTime = 2000; // 2 seconds
          console.log(`Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
      }
    }
    
    // If all retries failed and we somehow still don't have a page
    if (currentPage) {
      try {
        await currentPage.close();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    throw new Error(`Failed to navigate to ${targetUrl} after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
  };

  try {
    // Desktop viewport - Navigate with retry logic
    const desktopPage = await navigateWithRetry(url, createDesktopStealthPage);

    // Track network requests to get image file sizes
    const imageRequests = new Map<string, number>();
    desktopPage.on('response', (response) => {
      const url = response.url();
      const contentType = response.headers()['content-type'] || '';
      if (contentType.startsWith('image/')) {
        const contentLength = response.headers()['content-length'];
        if (contentLength) {
          imageRequests.set(url, parseInt(contentLength, 10));
        }
      }
    });
    
    // Check if we got an "Access Denied" or blocked page
    const isBlocked = await desktopPage.evaluate(() => {
      const bodyText = document.body?.textContent?.toLowerCase() || '';
      const title = document.title?.toLowerCase() || '';
      const html = document.documentElement?.innerHTML?.toLowerCase() || '';
      
      const blockedIndicators = [
        'access denied',
        'access forbidden',
        'blocked',
        'forbidden',
        'you don\'t have permission',
        'cloudflare',
        'checking your browser',
        'please wait',
        'ddos protection',
        'bot protection',
        'captcha',
        'challenge',
      ];
      
      return blockedIndicators.some(indicator => 
        bodyText.includes(indicator) || 
        title.includes(indicator) || 
        html.includes(indicator)
      );
    });
    
    if (isBlocked) {
      console.warn(`Desktop page appears to be blocked for ${url}. Continuing with screenshot anyway.`);
      if (!results.blocked) {
        results.blocked = {};
      }
      results.blocked.desktop = true;
      console.log('Blocked status set:', results.blocked);
    }
    
    await desktopPage.waitForTimeout(2000);

    // Scroll to top to ensure we capture from the beginning
    await desktopPage.evaluate(() => window.scrollTo(0, 0));
    await desktopPage.waitForTimeout(500);

    // Capture FULL PAGE screenshot - we'll show only top 500px in UI
    const desktopScreenshot = await desktopPage.screenshot({
      fullPage: true, // Capture entire homepage
    });
    const desktopScreenshotPath = `runs/${runId}/screens/desktop.png`;
    await storage.putObject(desktopScreenshotPath, Buffer.from(desktopScreenshot), 'image/png');
    results.screenshots!.desktop = desktopScreenshotPath;

    const desktopHtml = await desktopPage.content();
    const desktopHtmlPath = `runs/${runId}/html/desktop.html`;
    await storage.putObject(desktopHtmlPath, Buffer.from(desktopHtml), 'text/html');
    results.html!.desktop = desktopHtmlPath;

    const contentSnapshot = await desktopPage.evaluate(() => {
      const clean = (value?: string | null) => (value || '').replace(/\s+/g, ' ').trim();

      const heroCandidates = Array.from(
        document.querySelectorAll(
          '[data-hero], section.hero, .hero, main section, main div, header, main'
        )
      ) as HTMLElement[];
      const hero =
        heroCandidates.find((el) => {
          const rect = el.getBoundingClientRect();
          return rect.top >= 0 && rect.top < window.innerHeight * 0.75;
        }) || document.querySelector('main') || document.body;

      const heroHeadline =
        hero &&
        clean(
          hero.querySelector('h1, h2, [data-headline], .headline, .title, .Heading')?.textContent || ''
        );
      const heroSubheadline =
        hero &&
        clean(
          hero.querySelector(
            'p, h3, [data-subheadline], .subheadline, .subtitle, .lead, .Description'
          )?.textContent || ''
        );

      const heroCtaNodes = hero
        ? Array.from(
            hero.querySelectorAll('a, button, [role="button"], input[type="submit"]')
          )
        : [];
      const heroCtas = heroCtaNodes.map((node) => clean(node.textContent));
      const heroCtasFiltered = heroCtas.filter((text) => text.length > 1);
      const primaryCtaText = heroCtasFiltered[0] || null;
      const secondaryCtas = heroCtasFiltered.slice(1, 5);

      let heroCtaViewportOffset: number | null = null;
      if (heroCtaNodes.length > 0) {
        const firstCtaRect = heroCtaNodes[0].getBoundingClientRect();
        heroCtaViewportOffset = firstCtaRect?.top ?? null;
      }

      const sectionHeadings = Array.from(
        document.querySelectorAll('main h2, main h3, [data-section-title]')
      )
        .map((node) => clean(node.textContent))
        .filter((text) => text.length > 1)
        .filter((text, idx, arr) => arr.indexOf(text) === idx)
        .slice(0, 10);

      const heroParagraphs = hero
        ? Array.from(hero.querySelectorAll('p'))
            .map((node) => clean(node.textContent))
            .filter((text) => text.length > 20)
            .slice(0, 4)
        : [];

      const bulletPoints = Array.from(document.querySelectorAll('main li'))
        .map((node) => clean(node.textContent))
        .filter((text) => text.length > 10 && text.length < 200)
        .slice(0, 12);

      const navItems = Array.from(
        document.querySelectorAll('nav a, [role="navigation"] a, header nav a')
      )
        .map((node) => clean(node.textContent))
        .filter((text) => text.length > 1)
        .filter((text, idx, arr) => arr.indexOf(text) === idx)
        .slice(0, 10);

      const pricingSignals = Array.from(
        document.querySelectorAll('section, div, span, p, li, h2, h3')
      )
        .map((node) => clean(node.textContent))
        .filter((text) => /pricing|plans|package|per month|per year|\$\d|€\d|£\d/i.test(text))
        .filter((text, idx, arr) => arr.indexOf(text) === idx)
        .slice(0, 8);

      const testimonialCandidates = Array.from(
        document.querySelectorAll(
          '[data-testimonial], .testimonial, .testimonials, blockquote, q, [class*="testimonial"]'
        )
      );
      const testimonials = testimonialCandidates
        .map((node) => clean(node.textContent))
        .filter((text) => text.length > 30)
        .filter((text, idx, arr) => arr.indexOf(text) === idx)
        .slice(0, 5);

      const trustSignalCandidates = Array.from(
        document.querySelectorAll('section, div, p, span, li, strong, em')
      );
      const trustSignals = trustSignalCandidates
        .map((node) => clean(node.textContent))
        .filter((text) => /trusted by|as seen on|featured in|awards|partners|backed by/i.test(text))
        .filter((text, idx, arr) => arr.indexOf(text) === idx)
        .slice(0, 5);

      const trustLogoTexts = Array.from(
        document.querySelectorAll('img[alt], svg[aria-label], figure figcaption')
      )
        .map((node) => clean((node.getAttribute && node.getAttribute('alt')) || node.textContent))
        .filter((text) => /trusted|partner|featured|award|clients|logos|backed/i.test(text))
        .filter((text, idx, arr) => arr.indexOf(text) === idx)
        .slice(0, 5);

      trustSignals.push(...trustLogoTexts);

      const mediaNodes = Array.from(
        document.querySelectorAll(
          'video, lottie-player, canvas[data-controller="lottie"], iframe[src*="youtube"], iframe[src*="vimeo"], img[src*=".gif"]'
        )
      );
      const hasVideo = mediaNodes.some((node) => node.tagName.toLowerCase() === 'video' || node instanceof HTMLIFrameElement);

      const animatedNodes = Array.from(document.querySelectorAll('*')).slice(0, 500);
      const motionSelectors: string[] = [];
      let hasMotion = false;
      for (const node of animatedNodes) {
        const style = window.getComputedStyle(node);
        const animationDuration = style.animationDuration || style.webkitAnimationDuration;
        const transitionDuration = style.transitionDuration || style.webkitTransitionDuration;
        const isAnimated =
          (animationDuration && animationDuration !== '0s' && animationDuration !== '0ms') ||
          (transitionDuration && transitionDuration !== '0s' && transitionDuration !== '0ms');
        if (isAnimated) {
          hasMotion = true;
          const cls = typeof node.className === 'string' ? node.className : '';
          motionSelectors.push(node.id ? `#${node.id}` : cls ? `.${cls.split(' ').join('.')}` : node.tagName.toLowerCase());
          if (motionSelectors.length >= 5) break;
        }
      }

      if (!hasMotion) {
        hasMotion = mediaNodes.length > 0;
      }

      const forms = Array.from(document.querySelectorAll('form, input[type="email"], input[type="text"], textarea'));
      const hasForm = forms.length > 0;

      // Typography analysis
      const getComputedStyles = (element: Element | null) => {
        if (!element) return undefined;
        const style = window.getComputedStyle(element);
        return {
          fontFamily: style.fontFamily.split(',')[0].replace(/['"]/g, '').trim(),
          fontSize: parseFloat(style.fontSize) || 0,
          fontWeight: style.fontWeight || 'normal',
          lineHeight: style.lineHeight || 'normal',
          letterSpacing: style.letterSpacing || 'normal',
        };
      };

      const h1Element = document.querySelector('h1');
      const h2Element = document.querySelector('h2');
      const bodyElement = document.body || document.documentElement;
      const firstParagraph = document.querySelector('main p, body > p, .hero p, section p');

      // Analyze heading hierarchy
      const headingHierarchy: Array<{ level: number; fontSize: number; fontWeight: string; count: number }> = [];
      for (let level = 1; level <= 6; level++) {
        const headings = Array.from(document.querySelectorAll(`h${level}`));
        if (headings.length > 0) {
          const firstHeading = headings[0];
          const style = window.getComputedStyle(firstHeading);
          headingHierarchy.push({
            level,
            fontSize: parseFloat(style.fontSize) || 0,
            fontWeight: style.fontWeight || 'normal',
            count: headings.length,
          });
        }
      }

      const h1Styles = getComputedStyles(h1Element);
      const h2Styles = getComputedStyles(h2Element);
      const bodyStyles = getComputedStyles(bodyElement);
      const firstParagraphStyles = getComputedStyles(firstParagraph);

      const typographyData = {
        ...(h1Styles && { h1: h1Styles }),
        ...(h2Styles && { h2: h2Styles }),
        ...(bodyStyles && { body: bodyStyles }),
        ...(firstParagraphStyles && { firstParagraph: firstParagraphStyles }),
        headingHierarchy,
      };

      // Image analysis
      const viewportHeight = window.innerHeight;
      const images = Array.from(document.querySelectorAll('img')) as HTMLImageElement[];
      const imageData: Array<{
        url: string;
        naturalWidth: number;
        naturalHeight: number;
        displayedWidth: number;
        displayedHeight: number;
        format: string;
        hasLazyLoading: boolean;
        hasSrcset: boolean;
        boundingRect: { top: number; bottom: number };
      }> = [];

      for (const img of images) {
        try {
          if (!img.complete || img.naturalWidth === 0) continue;
          
          const rect = img.getBoundingClientRect();
          const src = img.currentSrc || img.src || '';
          if (!src || src.startsWith('data:')) continue;

          const format = src.match(/\.(jpg|jpeg|png|gif|webp|avif|svg)(\?|$)/i)?.[1]?.toLowerCase() || 'unknown';
          const hasLazyLoading = img.loading === 'lazy' || img.hasAttribute('data-lazy') || img.hasAttribute('data-src');
          const hasSrcset = img.hasAttribute('srcset') || img.hasAttribute('data-srcset');

          imageData.push({
            url: src,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            displayedWidth: rect.width,
            displayedHeight: rect.height,
            format,
            hasLazyLoading,
            hasSrcset,
            boundingRect: { top: rect.top, bottom: rect.bottom },
          });
        } catch (e) {
          // Skip images that can't be analyzed
        }
      }

      // Find LCP candidate (largest image in viewport)
      let lcpCandidate: (typeof imageData)[0] | null = null;
      let largestArea = 0;
      for (const img of imageData) {
        if (img.boundingRect.top < viewportHeight && img.boundingRect.top >= 0) {
          const area = img.displayedWidth * img.displayedHeight;
          if (area > largestArea) {
            largestArea = area;
            lcpCandidate = img;
          }
        }
      }

      return {
        heroHeadline: heroHeadline || null,
        heroSubheadline: heroSubheadline || null,
        primaryCtaText,
        secondaryCtas,
        sectionHeadings,
        navItems,
        testimonials,
        trustSignals,
        heroParagraphs,
        bulletPoints,
        pricingSignals,
        heroCtaViewportOffset,
        hasMotion,
        hasVideo,
        hasForm,
        motionSelectors,
        typography: typographyData,
        imageData,
        lcpCandidate: lcpCandidate ? {
          url: lcpCandidate.url,
          naturalWidth: lcpCandidate.naturalWidth,
          naturalHeight: lcpCandidate.naturalHeight,
          displayedWidth: lcpCandidate.displayedWidth,
          displayedHeight: lcpCandidate.displayedHeight,
          format: lcpCandidate.format,
        } : null,
      };
    });

    // Process image data with file sizes from network requests
    const viewportHeight = 900;
    const aboveFoldImages: Array<{
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
    }> = [];
    const belowFoldImages: Array<{
      url: string;
      naturalWidth: number;
      naturalHeight: number;
      displayedWidth: number;
      displayedHeight: number;
      fileSize: number;
      format: string;
      hasLazyLoading: boolean;
      hasSrcset: boolean;
    }> = [];

    let totalImageSize = 0;
    const lcpCandidateUrl = contentSnapshot.lcpCandidate?.url;

    if (contentSnapshot.imageData) {
      for (const img of contentSnapshot.imageData) {
        const fileSize = imageRequests.get(img.url) || 0;
        totalImageSize += fileSize;

        const isAboveFold = img.boundingRect.top < viewportHeight && img.boundingRect.bottom > 0;
        const isLcpCandidate = lcpCandidateUrl === img.url;

        const imageInfo = {
          url: img.url,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          displayedWidth: img.displayedWidth,
          displayedHeight: img.displayedHeight,
          fileSize,
          format: img.format,
          hasLazyLoading: img.hasLazyLoading,
          hasSrcset: img.hasSrcset,
        };

        if (isAboveFold) {
          aboveFoldImages.push({
            ...imageInfo,
            isLcpCandidate,
          });
        } else {
          belowFoldImages.push(imageInfo);
        }
      }
    }

    results.content = {
      heroHeadline: contentSnapshot.heroHeadline || undefined,
      heroSubheadline: contentSnapshot.heroSubheadline || undefined,
      primaryCtaText: contentSnapshot.primaryCtaText || undefined,
      secondaryCtas: contentSnapshot.secondaryCtas ?? [],
      sectionHeadings: contentSnapshot.sectionHeadings ?? [],
      navItems: contentSnapshot.navItems ?? [],
      testimonials: contentSnapshot.testimonials ?? [],
      trustSignals: contentSnapshot.trustSignals ?? [],
      heroParagraphs: contentSnapshot.heroParagraphs ?? [],
      bulletPoints: contentSnapshot.bulletPoints ?? [],
      pricingSignals: contentSnapshot.pricingSignals ?? [],
      heroCtaViewportOffset: contentSnapshot.heroCtaViewportOffset ?? undefined,
      hasMotion: contentSnapshot.hasMotion ?? false,
      hasVideo: contentSnapshot.hasVideo ?? false,
      hasForm: contentSnapshot.hasForm ?? false,
      motionSelectors: contentSnapshot.motionSelectors ?? [],
      typography: contentSnapshot.typography || undefined,
      images: contentSnapshot.imageData && contentSnapshot.imageData.length > 0 ? {
        aboveFold: aboveFoldImages,
        belowFold: belowFoldImages,
        totalImages: contentSnapshot.imageData.length,
        totalImageSize,
        lcpImage: contentSnapshot.lcpCandidate ? {
          url: contentSnapshot.lcpCandidate.url,
          fileSize: imageRequests.get(contentSnapshot.lcpCandidate.url) || 0,
          format: contentSnapshot.lcpCandidate.format,
          naturalWidth: contentSnapshot.lcpCandidate.naturalWidth,
          naturalHeight: contentSnapshot.lcpCandidate.naturalHeight,
          displayedWidth: contentSnapshot.lcpCandidate.displayedWidth,
          displayedHeight: contentSnapshot.lcpCandidate.displayedHeight,
        } : undefined,
      } : undefined,
    };

    // Extract selectors and coordinates
    results.elementCoordinates = {};
    
    const h1 = await desktopPage.locator('h1').first();
    if (await h1.isVisible()) {
      results.selectors!.h1 = await h1.textContent() || undefined;
      const h1Selector = await h1.evaluate((el) => {
        const id = el.id ? `#${el.id}` : '';
        const classes = el.className ? `.${el.className.toString().split(' ').filter((c: string) => c).join('.')}` : '';
        return `h1${id}${classes}`;
      });
      const h1Box = await h1.boundingBox();
      if (h1Box) {
        // Get full page dimensions for percentage calculation
        const pageHeight = await desktopPage.evaluate(() => document.documentElement.scrollHeight);
        const viewportHeight = desktopPage.viewportSize()?.height || 1080;
        const scrollY = await desktopPage.evaluate(() => window.scrollY);
        results.elementCoordinates[h1Selector] = {
          x: h1Box.x + h1Box.width / 2,
          y: h1Box.y + scrollY + h1Box.height / 2,
          width: h1Box.width,
          height: h1Box.height,
          viewport: 'desktop',
        };
      }
    }

    const buttons = desktopPage.locator('button, a[role="button"], input[type="submit"], .btn, [class*="button"]');
    const buttonCount = await buttons.count();
    for (let i = 0; i < Math.min(buttonCount, 10); i++) {
      const btn = buttons.nth(i);
      if (await btn.isVisible()) {
        const text = await btn.textContent();
        if (text && text.trim().length > 0) {
          const btnSelector = await btn.evaluate((el) => {
            const id = el.id ? `#${el.id}` : '';
            const classes = el.className ? `.${el.className.toString().split(' ').filter((c: string) => c).join('.')}` : '';
            return `${el.tagName.toLowerCase()}${id}${classes}`;
          });
          results.selectors!.firstCta = btnSelector;
          
          const btnBox = await btn.boundingBox();
          if (btnBox) {
            const scrollY = await desktopPage.evaluate(() => window.scrollY);
            results.elementCoordinates[btnSelector] = {
              x: btnBox.x + btnBox.width / 2,
              y: btnBox.y + scrollY + btnBox.height / 2,
              width: btnBox.width,
              height: btnBox.height,
              viewport: 'desktop',
            };
          }
          break;
        }
      }
    }

    // Hero area bbox (first viewport area)
    const heroElement = await desktopPage.locator('main, [role="main"], .hero, header, body > div').first();
    if (await heroElement.isVisible()) {
      const box = await heroElement.boundingBox();
      if (box) {
        results.selectors!.heroBbox = {
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
        };
      }
    }
    
    // Capture coordinates for key content elements (headings, CTAs, images)
    const keySelectors = [
      'h1', 'h2', 'h3',
      'button', 'a[role="button"]', '.btn', '[class*="button"]',
      'img[src]',
      'nav', 'header',
      'form', 'input[type="email"]', 'input[type="text"]',
    ];
    
    for (const selector of keySelectors) {
      try {
        const elements = await desktopPage.locator(selector).all();
        for (let i = 0; i < Math.min(elements.length, 5); i++) {
          const element = elements[i];
          if (await element.isVisible()) {
            const elementSelector = await element.evaluate((el) => {
              const id = el.id ? `#${el.id}` : '';
              const classes = el.className ? `.${el.className.toString().split(' ').filter((c: string) => c).join('.')}` : '';
              return `${el.tagName.toLowerCase()}${id}${classes}`;
            });
            const box = await element.boundingBox();
            if (box && !results.elementCoordinates[elementSelector]) {
              const scrollY = await desktopPage.evaluate(() => window.scrollY);
              results.elementCoordinates[elementSelector] = {
                x: box.x + box.width / 2,
                y: box.y + scrollY + box.height / 2,
                width: box.width,
                height: box.height,
                viewport: 'desktop',
              };
            }
          }
        }
      } catch (err) {
        // Skip if selector fails
      }
    }

    await desktopPage.close();

    // Mobile viewport - Navigate with retry logic
    const mobilePage = await navigateWithRetry(url, createMobileStealthPage);
    
    // Check if we got an "Access Denied" or blocked page
    const isMobileBlocked = await mobilePage.evaluate(() => {
      const bodyText = document.body?.textContent?.toLowerCase() || '';
      const title = document.title?.toLowerCase() || '';
      const html = document.documentElement?.innerHTML?.toLowerCase() || '';
      
      const blockedIndicators = [
        'access denied',
        'access forbidden',
        'blocked',
        'forbidden',
        'you don\'t have permission',
        'cloudflare',
        'checking your browser',
        'please wait',
        'ddos protection',
        'bot protection',
        'captcha',
        'challenge',
      ];
      
      return blockedIndicators.some(indicator => 
        bodyText.includes(indicator) || 
        title.includes(indicator) || 
        html.includes(indicator)
      );
    });
    
    if (isMobileBlocked) {
      console.warn(`Mobile page appears to be blocked for ${url}. Continuing with screenshot anyway.`);
      if (!results.blocked) {
        results.blocked = {};
      }
      results.blocked.mobile = true;
    }
    
    await mobilePage.waitForTimeout(2000);

    // Scroll to top to ensure we capture from the beginning
    await mobilePage.evaluate(() => window.scrollTo(0, 0));
    await mobilePage.waitForTimeout(500);

    // Capture FULL PAGE screenshot - we'll show only top 500px in UI
    const mobileScreenshot = await mobilePage.screenshot({
      fullPage: true, // Capture entire homepage
    });
    const mobileScreenshotPath = `runs/${runId}/screens/mobile.png`;
    await storage.putObject(mobileScreenshotPath, Buffer.from(mobileScreenshot), 'image/png');
    results.screenshots!.mobile = mobileScreenshotPath;

    const mobileHtml = await mobilePage.content();
    const mobileHtmlPath = `runs/${runId}/html/mobile.html`;
    await storage.putObject(mobileHtmlPath, Buffer.from(mobileHtml), 'text/html');
    results.html!.mobile = mobileHtmlPath;

    await mobilePage.close();
  } finally {
    await browser.close();
  }

  return results as CrawlResult;
}

