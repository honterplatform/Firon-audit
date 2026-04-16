import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

async function generatePDF(html: string): Promise<Buffer> {
  const pw = require('play' + 'wright');
  const fs = require('fs');
  const path = require('path');

  // Find the FULL chromium binary (not headless_shell — it crashes on PDF generation)
  let executablePath: string | undefined;
  const cacheDir = path.join(process.env.HOME || '/root', '.cache', 'ms-playwright');
  try {
    const entries = fs.readdirSync(cacheDir);
    console.log('PDF: Playwright cache:', entries.join(', '));
    for (const entry of entries) {
      if (entry.startsWith('chromium-') && !entry.includes('headless')) {
        // Full chromium — check for the binary
        const candidates = [
          path.join(cacheDir, entry, 'chrome-linux', 'chrome'),
          path.join(cacheDir, entry, 'chrome-linux64', 'chrome'),
          path.join(cacheDir, entry, 'chrome', 'chrome'),
        ];
        for (const c of candidates) {
          if (fs.existsSync(c)) {
            executablePath = c;
            console.log('PDF: Found full chromium at:', c);
            break;
          }
        }
        // If not found, list contents for debugging
        if (!executablePath) {
          try {
            const sub = fs.readdirSync(path.join(cacheDir, entry));
            console.log(`PDF: Contents of ${entry}:`, sub.join(', '));
            for (const s of sub) {
              try {
                const sub2 = fs.readdirSync(path.join(cacheDir, entry, s));
                console.log(`PDF: Contents of ${entry}/${s}:`, sub2.slice(0, 10).join(', '));
              } catch {}
            }
          } catch {}
        }
        if (executablePath) break;
      }
    }
  } catch (e) {
    console.error('PDF: Error scanning cache:', e);
  }

  console.log('PDF: Using executable:', executablePath || 'playwright default');

  const browser = await pw.chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await context.params;

    let baseUrl = process.env.APP_BASE_URL;
    if (!baseUrl) {
      const host = request.headers.get('host');
      const protocol = request.headers.get('x-forwarded-proto') || 'http';
      baseUrl = `${protocol}://${host}`;
    }

    const reportResponse = await fetch(`${baseUrl}/api/reports/${runId}`, {
      headers: { 'Accept': 'text/html' },
    });

    if (!reportResponse.ok) {
      throw new Error(`Failed to fetch report HTML: ${reportResponse.status}`);
    }

    const html = await reportResponse.text();
    const pdfBuffer = await generatePDF(html);

    return new NextResponse(pdfBuffer as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="firon-audit-${runId}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error('PDF generation error:', error?.message);
    return NextResponse.json(
      { error: 'Failed to generate PDF', details: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
