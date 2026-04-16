import { chromium } from 'playwright-core';
import * as fs from 'fs';
import * as path from 'path';

function findChromium(): string | undefined {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    // Playwright cache locations (Railway/Linux)
    ...findPlaywrightChromium(),
    // System chromium (nixpacks/apt)
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter((p): p is string => typeof p === 'string' && p.length > 0);

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

function findPlaywrightChromium(): string[] {
  const paths: string[] = [];
  const cacheDir = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(process.env.HOME || '/root', '.cache', 'ms-playwright');
  try {
    if (!fs.existsSync(cacheDir)) return paths;
    const entries = fs.readdirSync(cacheDir);
    console.log('PDF: Playwright cache entries:', entries.join(', '));
    for (const entry of entries) {
      // Prefer full chromium (not headless_shell) — it supports page.pdf()
      if (entry.startsWith('chromium-') && !entry.includes('headless')) {
        const chromePath = path.join(cacheDir, entry, 'chrome-linux', 'chrome');
        paths.push(chromePath);
      }
    }
    // Only use headless_shell as last resort
    for (const entry of entries) {
      if (entry.includes('headless')) {
        const headlessPath = path.join(cacheDir, entry, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
        paths.push(headlessPath);
      }
    }
  } catch (e) {
    console.error('PDF: Error scanning Playwright cache:', e);
  }
  return paths;
}

export async function generatePDFFromHTML(html: string): Promise<Buffer> {
  const executablePath = findChromium();
  console.log('PDF: Using chromium at:', executablePath || 'auto-detect');

  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const pdfData = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
    });

    return Buffer.from(pdfData);
  } finally {
    await browser.close();
  }
}

export async function generatePDF(reportUrl: string): Promise<Buffer> {
  const executablePath = findChromium();

  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(reportUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    const pdfData = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
    });

    return Buffer.from(pdfData);
  } finally {
    await browser.close();
  }
}
