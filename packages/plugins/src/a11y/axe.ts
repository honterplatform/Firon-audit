import { chromium, Page, BrowserContext } from 'playwright';
import type { AxeResult } from '../types';
import { createStorageProvider } from '@audit/pipeline';
import AxeBuilder from '@axe-core/playwright';

export async function runAxe(
  url: string,
  runId: string
): Promise<AxeResult> {
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
  const storage = createStorageProvider();
  const violations: AxeResult['violations'] = [];
  const contrastIssues: AxeResult['contrastIssues'] = [];
  const tapTargetIssues: AxeResult['tapTargetIssues'] = [];
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    context = await browser.newContext({
      viewport: { width: 390, height: 844 }, // Mobile viewport for tap target checks
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
    page = await context.newPage();
    
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

    // Get violations using AxeBuilder (legacy mode prevents context warnings)
    const axeBuilder = new AxeBuilder({ page }).setLegacyMode();
    const axeResults = await axeBuilder.analyze();
    const axeViolations = axeResults.violations || [];
    
    // Capture coordinates for violations
    const violationsWithCoords = await Promise.all(
      axeViolations.map(async (v: any) => {
        const nodesWithCoords = await Promise.all(
          v.nodes.map(async (n: any) => {
            try {
              if (!page) return { html: n.html, target: n.target };
              const element = await page.locator(n.target.join(', ')).first();
              if (await element.isVisible()) {
                const box = await element.boundingBox();
                if (box) {
                  const scrollY = await page.evaluate(() => window.scrollY);
                  return {
                    html: n.html,
                    target: n.target,
                    coordinates: {
                      x: box.x + box.width / 2,
                      y: box.y + scrollY + box.height / 2,
                      width: box.width,
                      height: box.height,
                      viewport: 'mobile' as const, // Axe uses mobile viewport
                    },
                  };
                }
              }
            } catch (err) {
              // Skip if element not found
            }
            return {
              html: n.html,
              target: n.target,
            };
          })
        );
        return {
          id: v.id,
          description: v.description,
          nodes: nodesWithCoords,
        };
      })
    );
    violations.push(...violationsWithCoords);

    // Check contrast issues
    const contrastViolations = axeViolations.filter((v: any) => v.id === 'color-contrast');
    for (const violation of contrastViolations) {
      for (const node of violation.nodes) {
        try {
          if (!page) continue;
          const element = await page.locator((node as any).target.join(', ')).first();
          if (await element.isVisible()) {
            const text = await element.textContent();
            const box = await element.boundingBox();
            // Extract contrast ratio from axe violation data
            const contrastData = (node as any).any?.[0]?.data;
            const ratio = contrastData?.contrastRatio || contrastData?.ratio;
            if (ratio && text) {
              const coordinates = box ? {
                x: box.x + box.width / 2,
                y: box.y + (await page.evaluate(() => window.scrollY)) + box.height / 2,
                width: box.width,
                height: box.height,
                viewport: 'mobile' as const,
              } : undefined;
              contrastIssues.push({
                selector: (node as any).target.join(' > '),
                ratio: typeof ratio === 'number' ? ratio : parseFloat(ratio.toString()),
                text: text.substring(0, 100),
                coordinates,
              });
            }
          }
        } catch (err) {
          // Skip if element not found
        }
      }
    }

    // Check tap targets (mobile viewport)
    if (!page) {
      throw new Error('Page not initialized');
    }
    const interactiveElements = await page.locator('button, a, input, [role="button"], [tabindex]').all();
    for (const element of interactiveElements) {
      if (await element.isVisible()) {
        const box = await element.boundingBox();
        if (box) {
          const minSize = 44; // 44px minimum
          const size = Math.min(box.width, box.height);
          if (size < minSize) {
            const selector = await element.evaluate((el) => {
              const id = el.id ? `#${el.id}` : '';
              const classes = el.className ? `.${el.className.toString().split(' ').join('.')}` : '';
              return `${el.tagName.toLowerCase()}${id}${classes}`;
            });
            const scrollY = await page.evaluate(() => window.scrollY);
            tapTargetIssues.push({
              selector,
              size: Math.round(size),
              coordinates: {
                x: box.x + box.width / 2,
                y: box.y + scrollY + box.height / 2,
                width: box.width,
                height: box.height,
                viewport: 'mobile',
              },
            });
          }
        }
      }
    }

    // Store report
    const report = {
      violations,
      contrastIssues,
      tapTargetIssues,
    };
    const reportJson = JSON.stringify(report, null, 2);
    const reportPath = `runs/${runId}/axe/report.json`;
    await storage.putObject(reportPath, Buffer.from(reportJson), 'application/json');

    return {
      violations,
      contrastIssues,
      tapTargetIssues,
      reportJson: reportPath,
    };
  } finally {
    if (page) {
      await page.close();
    }
    if (context) {
      await context.close();
    }
    await browser.close();
  }
}

