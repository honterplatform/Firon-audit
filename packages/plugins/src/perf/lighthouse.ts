import type { LighthouseResult } from '../types';
import { createStorageProvider } from '@audit/pipeline';
import { chromium } from 'playwright';

type LighthouseFn = typeof import('lighthouse')['default'];
type ChromeLauncherModule = typeof import('chrome-launcher');

let lighthouseFn: LighthouseFn | null = null;
let chromeLauncherModule: ChromeLauncherModule | null = null;

async function loadLighthouseModules() {
  if (!lighthouseFn || !chromeLauncherModule) {
    // Use Function constructor to preserve dynamic import() - TypeScript won't transform this
    const dynamicImport = new Function('specifier', 'return import(specifier)');
    
    const [lighthouseImport, chromeLauncherImport] = await Promise.all([
      dynamicImport('lighthouse/core/index.cjs') as Promise<{ default: LighthouseFn }>,
      dynamicImport('chrome-launcher') as Promise<ChromeLauncherModule>,
    ]);
    lighthouseFn = lighthouseImport.default;
    chromeLauncherModule = chromeLauncherImport as ChromeLauncherModule;
  }

  if (!lighthouseFn || !chromeLauncherModule) {
    throw new Error('Failed to load Lighthouse dependencies');
  }

  return { lighthouse: lighthouseFn, chromeLauncher: chromeLauncherModule };
}

async function getPlaywrightChromePath(): Promise<string> {
  try {
    const executablePath = chromium.executablePath();
    console.log(`Using Playwright's Chromium for Lighthouse: ${executablePath}`);
    return executablePath;
  } catch (error) {
    console.error('Failed to get Playwright Chromium path:', error);
    throw new Error('Playwright Chromium not available');
  }
}

async function findChromePath(): Promise<string> {
  // Priority 1: Use Playwright's bundled Chromium (most reliable)
  try {
    const playwrightPath = await getPlaywrightChromePath();
    return playwrightPath;
  } catch (error) {
    console.warn('Playwright Chromium not available, trying alternatives...');
  }

  // Priority 2: Check CHROME_PATH environment variable
  if (process.env.CHROME_PATH) {
    const fs = await import('fs/promises');
    try {
      await fs.access(process.env.CHROME_PATH);
      console.log(`Using CHROME_PATH from environment: ${process.env.CHROME_PATH}`);
      return process.env.CHROME_PATH;
    } catch {
      console.warn(`CHROME_PATH set but file not found: ${process.env.CHROME_PATH}`);
    }
  }

  // Priority 3: Try to find chromium in PATH
  try {
    const { execSync } = await import('child_process');
    const chromiumPath = execSync('which chromium || which chromium-browser || which google-chrome || which google-chrome-stable', { 
      encoding: 'utf-8', 
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000
    }).trim();
    if (chromiumPath) {
      console.log(`Found Chrome via which: ${chromiumPath}`);
      return chromiumPath;
    }
  } catch {
    // Continue to try static paths
  }

  // Priority 4: Try common Chrome locations
  const fs = await import('fs/promises');
  const possiblePaths = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];

  for (const path of possiblePaths) {
    try {
      await fs.access(path);
      console.log(`Found Chrome at static path: ${path}`);
      return path;
    } catch {
      // Continue to next path
    }
  }

  throw new Error('No Chrome/Chromium installation found');
}

export async function runLighthouse(
  url: string,
  runId: string
): Promise<LighthouseResult> {
  const { lighthouse, chromeLauncher } = await loadLighthouseModules();
  
  // Get Chrome path (Playwright's Chromium is preferred)
  let chromePath: string;
  try {
    chromePath = await findChromePath();
    console.log(`✓ Lighthouse will use Chrome at: ${chromePath}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to find Chrome for Lighthouse. ` +
      `Playwright Chromium and system Chrome not available. ` +
      `Error: ${errorMsg}`
    );
  }

  const launchOptions = {
    chromeFlags: [
      '--headless',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-http2', // Match crawler settings
    ],
    chromePath,
  };

  let chrome;
  try {
    chrome = await chromeLauncher.launch(launchOptions);
  } catch (launchError: any) {
    const errorMessage = launchError?.message || String(launchError);
    throw new Error(
      `Failed to launch Chrome for Lighthouse at ${chromePath}. ` +
      `Error: ${errorMessage}`
    );
  }

  const options = {
    logLevel: 'error' as const,
    output: 'json' as const,
    onlyCategories: ['performance'],
    port: chrome.port,
  };

  try {
    const runnerResult = await lighthouse(url, options);
    await chrome.kill();

    if (!runnerResult) {
      throw new Error('Lighthouse returned no results');
    }

    const report = runnerResult.lhr;
    const metrics = report.audits;

    const lcp = (metrics['largest-contentful-paint']?.numericValue || 0) / 1000;
    const cls = metrics['cumulative-layout-shift']?.numericValue || 0;
    const inp = (metrics['interaction-to-next-paint']?.numericValue || 0) / 1000;
    const tbt = (metrics['total-blocking-time']?.numericValue || 0) / 1000;
    const totalBytes = (metrics['total-byte-weight']?.numericValue || 0);

    // Extract third-party domains
    const thirdPartyDomains: string[] = [];
    if (metrics['third-party-summary']?.details) {
      const details = metrics['third-party-summary'].details as any;
      if (details.items) {
        thirdPartyDomains.push(...details.items.map((item: any) => item.entity || item.url).filter(Boolean));
      }
    }

    // Store full report
    const storage = createStorageProvider();
    const reportJson = JSON.stringify(report, null, 2);
    const reportPath = `runs/${runId}/lighthouse/report.json`;
    await storage.putObject(reportPath, Buffer.from(reportJson), 'application/json');

    return {
      lcp,
      cls,
      inp,
      tbt,
      totalBytes,
      thirdPartyDomains: [...new Set(thirdPartyDomains)],
      reportJson: reportPath,
    };
  } catch (error) {
    await chrome.kill();
    throw error;
  }
}

