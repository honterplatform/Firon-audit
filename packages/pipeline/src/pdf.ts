import puppeteer from 'puppeteer';

import type { Browser } from 'puppeteer';

/**
 * Generate PDF from HTML string directly (more stable than navigating to URL)
 */
export async function generatePDFFromHTML(html: string): Promise<Buffer> {
  let browser: Browser | null = null;
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Try multiple Chrome paths in order of preference
      const fs = await import('fs/promises');
      const path = await import('path');
      const os = await import('os');
      
      // PRIORITIZE SYSTEM CHROME (newer, more stable) over Puppeteer's bundled Chrome
      const possibleChromePaths = [
        // System Chrome (preferred - newer version, more stable)
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
        // Puppeteer's bundled Chrome (fallback)
        '/Users/axel/.cache/puppeteer/chrome/mac_arm-121.0.6167.85/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
      ];
      
      let executablePath: string | undefined;
      for (const chromePath of possibleChromePaths) {
        try {
          await fs.access(chromePath);
          executablePath = chromePath;
          console.log(`[Attempt ${attempt}/${maxRetries}] Using Chrome at: ${chromePath}`);
          break;
        } catch {
          // Continue to next path
        }
      }
      
      // Launch browser with minimal flags for maximum stability
      // Using system Chrome (newer version) should be more stable
      browser = await puppeteer.launch({
        headless: true, // Use old headless mode (more compatible)
        ...(executablePath && { executablePath }), // Force use of system Chrome
        args: [
          // Minimal flags for stability
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--disable-extensions',
          '--disable-default-apps',
          '--disable-infobars',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
        ],
        timeout: 30000, // Reduced timeout for faster failure detection
        ignoreDefaultArgs: ['--disable-extensions'], // Don't override our flags
      });

      // Verify browser launched successfully
      if (!browser || !browser.connected) {
        throw new Error('Browser failed to launch or disconnected immediately');
      }

      // Monitor browser disconnection with more details
      let browserDisconnected = false;
      browser.on('disconnected', () => {
        browserDisconnected = true;
        console.error(`[Attempt ${attempt}] Browser disconnected unexpectedly`);
        try {
          const process = (browser as any).process();
          if (process) {
            console.error(`Browser process info: exitCode=${process.exitCode}, signalCode=${process.signalCode}`);
          }
        } catch (e) {
          // Ignore errors getting process info
        }
      });

      // Quick check - don't wait too long
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check browser connection after wait
      if (!browser || !browser.connected || browserDisconnected) {
        throw new Error('Browser disconnected during initialization wait');
      }

      // If we get here, browser is stable - continue with PDF generation
      console.log(`[Attempt ${attempt}] Browser launched successfully`);
      
      const page = await browser.newPage();
    
    // Set viewport for consistent rendering
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Set reasonable timeouts
    page.setDefaultNavigationTimeout(30000);
    page.setDefaultTimeout(30000);
    
    console.log('Setting HTML content directly (no navigation needed)...');
    
    // Set HTML content directly - this avoids navigation issues
    try {
      // Use 'domcontentloaded' for faster initial load, then wait for resources separately
      await page.setContent(html, {
        waitUntil: 'domcontentloaded', // Faster initial load
        timeout: 30000,
      });
      console.log('HTML content set successfully');
      
      // Wait for external resources (Tailwind CDN, images) to load
      // Use a simple timeout instead of waiting for network idle
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (contentError: any) {
      console.error('Error setting HTML content:', contentError);
      
      // Handle ErrorEvent objects (WebSocket errors)
      const errorMessage = contentError?.message || 
                          (contentError?.[Symbol.for('kMessage')] as string) ||
                          (contentError?.[Symbol.for('kError')]?.message as string) ||
                          'Unknown error';
      
      if (!browser || !browser.connected) {
        throw new Error(`Browser disconnected while setting content: ${errorMessage}`);
      }
      if (page.isClosed()) {
        throw new Error(`Page was closed while setting content: ${errorMessage}`);
      }
      throw new Error(`Failed to set HTML content: ${errorMessage}`);
    }

    // Verify browser is still connected
    if (!browser || !browser.connected) {
      throw new Error('Browser disconnected after setting content');
    }
    if (page.isClosed()) {
      throw new Error('Page was closed after setting content');
    }

    // Wait a moment for rendering
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('Generating PDF...');
    
    // Generate PDF
    let pdfData: Buffer | Uint8Array;
    try {
      pdfData = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '0.5in',
          right: '0.5in',
          bottom: '0.5in',
          left: '0.5in',
        },
        preferCSSPageSize: false,
        timeout: 30000,
      });
      console.log('PDF generation completed successfully');
    } catch (pdfError: any) {
      const errorMessage = pdfError?.message || String(pdfError);
      console.error('PDF generation error:', errorMessage);
      
      if (page.isClosed()) {
        throw new Error(`Page was closed during PDF generation: ${errorMessage}`);
      }
      if (!browser || !browser.connected) {
        const process = (browser as any)?.process();
        const exitInfo = process ? ` (exit code: ${process.exitCode}, signal: ${process.signalCode})` : '';
        throw new Error(`Browser disconnected during PDF generation${exitInfo}: ${errorMessage}`);
      }
      
      throw new Error(`PDF generation failed: ${errorMessage}`);
    }

      // Success! Clean up and return
      await browser.close().catch((err) => {
        console.error('Error closing browser:', err);
      });
      
      return Buffer.from(pdfData);
      
    } catch (error: any) {
      lastError = error;
      console.error(`[Attempt ${attempt}/${maxRetries}] PDF generation failed:`, error.message);
      
      // Clean up failed browser instance
      if (browser) {
        try {
          await browser.close();
        } catch (e) {
          // Ignore cleanup errors
        }
        browser = null;
      }
      
      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        const waitTime = attempt * 1000; // 1s, 2s, 3s
        console.log(`[Attempt ${attempt}] Retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  // If all retries failed, throw the last error
  throw new Error(`PDF generation failed after ${maxRetries} attempts: ${lastError?.message || 'Browser failed to launch'}`);
}

/**
 * Generate PDF from URL (legacy method - may have navigation issues)
 */
export async function generatePDF(reportUrl: string): Promise<Buffer> {
  let browser: Browser | null = null;
  try {
    // Try multiple Chrome paths in order of preference
    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');
    
    // Function to find Chrome in Puppeteer's cache directory
    const findPuppeteerChrome = async (): Promise<string | undefined> => {
      try {
        const cacheDir = path.join(os.homedir(), '.cache', 'puppeteer', 'chrome');
        const entries = await fs.readdir(cacheDir, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const chromeDir = path.join(cacheDir, entry.name, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
            try {
              await fs.access(chromeDir);
              return chromeDir;
            } catch {
              // Try alternative path structure
              const altChromeDir = path.join(cacheDir, entry.name, 'chrome-mac-x64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
              try {
                await fs.access(altChromeDir);
                return altChromeDir;
              } catch {
                // Continue searching
              }
            }
          }
        }
      } catch {
        // Cache directory doesn't exist or can't be read
      }
      return undefined;
    };
    
    const possibleChromePaths = [
      // Try to find Puppeteer's installed Chrome dynamically
      await findPuppeteerChrome(),
      // System Chrome
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      // Alternative system Chrome path
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    ].filter((p): p is string => p !== undefined);
    
    let executablePath: string | undefined;
    for (const chromePath of possibleChromePaths) {
      try {
        await fs.access(chromePath);
        executablePath = chromePath;
        console.log(`Using Chrome at: ${chromePath}`);
        break;
      } catch {
        // Continue to next path
      }
    }
    
    // Launch browser with new headless mode and minimal stable flags
    // SIGTRAP crashes are often caused by incompatible flags or old headless mode
    // Using new headless mode and minimal flags to avoid conflicts
    browser = await puppeteer.launch({
      headless: 'new', // Use new headless mode (more stable, avoids SIGTRAP)
      ...(executablePath && { executablePath }), // Use found Chrome, or let Puppeteer find it automatically
      args: [
        // Essential stability flags only
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // Use /tmp instead of /dev/shm (prevents crashes)
        '--disable-gpu', // Disable GPU (prevents GPU-related crashes)
        '--disable-software-rasterizer', // Force software rendering
        '--disable-extensions', // Disable extensions
        '--no-first-run', // Skip first run
        '--disable-default-apps', // Disable default apps
        '--disable-infobars', // Disable info bars
        '--disable-breakpad', // Disable crash reporting (can cause SIGTRAP)
        '--single-process', // Use single process (more stable for PDF generation)
      ],
      timeout: 60000, // 60 second timeout for browser launch
      // Note: Using minimal flags to avoid conflicts that cause SIGTRAP
      // bufferutil and utf-8-validate are installed to handle WebSocket properly
    });

    // Verify browser launched successfully
    if (!browser || !browser.connected) {
      throw new Error('Browser failed to launch or disconnected immediately');
    }

    // Monitor browser disconnection with more details
    browser.on('disconnected', () => {
      console.error('Browser disconnected unexpectedly');
      // Try to get process info if available
      try {
        const process = (browser as any).process();
        if (process) {
          console.error(`Browser process info: exitCode=${process.exitCode}, signalCode=${process.signalCode}`);
        }
      } catch (e) {
        // Ignore errors getting process info
      }
    });

    // Wait a moment for browser to be fully ready
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check browser connection before creating page
    if (!browser.connected) {
      throw new Error('Browser disconnected before page creation');
    }

    const page = await browser.newPage();
    
    // Monitor page errors
    page.on('error', (error) => {
      console.error('Page error:', error);
    });
    
    page.on('pageerror', (error) => {
      console.error('Page JavaScript error:', error);
    });
    
    // Set reasonable timeouts before navigation
    page.setDefaultNavigationTimeout(45000); // 45 seconds for navigation (less than API timeout)
    page.setDefaultTimeout(45000); // 45 seconds for all operations
    
    // Navigate to the report URL - use domcontentloaded for faster initial load
    // This reduces the chance of browser disconnecting due to long waits
    try {
      // Check browser connection before navigation
      if (!browser || !browser.connected) {
        throw new Error('Browser disconnected before navigation');
      }

      console.log(`Navigating to report URL: ${reportUrl}`);
      
      // Set viewport for consistent rendering
      await page.setViewport({ width: 1920, height: 1080 });
      
      // Navigate with error handling - catch "Target closed" errors immediately
      let response: any;
      try {
        response = await page.goto(reportUrl, { 
          waitUntil: 'domcontentloaded', // Faster initial load
          timeout: 40000, // 40 second timeout
        });
      } catch (gotoError: any) {
        // Check if browser disconnected during navigation
        if (!browser || !browser.connected) {
          throw new Error(`Browser disconnected during navigation: ${gotoError?.message || 'Unknown error'}`);
        }
        if (page.isClosed()) {
          throw new Error(`Page was closed during navigation: ${gotoError?.message || 'Unknown error'}`);
        }
        // If it's a "Target closed" error, browser likely crashed
        if (gotoError?.message?.includes('Target closed') || gotoError?.message?.includes('Protocol error')) {
          throw new Error(`Browser target closed during navigation. This usually means the browser process crashed. Original error: ${gotoError?.message}`);
        }
        // Re-throw other navigation errors
        throw gotoError;
      }
      
      console.log(`Navigation completed. Status: ${response?.status()}, Browser connected: ${browser.connected}`);
      
      // Immediately check connection after navigation
      if (!browser || !browser.connected) {
        throw new Error('Browser disconnected immediately after navigation');
      }
      if (page.isClosed()) {
        throw new Error('Page was closed immediately after navigation');
      }
      
      if (!response || !response.ok()) {
        console.warn(`Page returned status ${response?.status()}, continuing anyway`);
      }
      
      // Wait for complete state with shorter timeout and connection checks
      try {
        // Use a promise that resolves when readyState is complete OR browser disconnects
        await Promise.race([
          page.waitForFunction('document.readyState === "complete"', { timeout: 8000 }),
          new Promise<void>((_, reject) => {
            // Check connection every 500ms - fail fast if disconnected
            const checkInterval = setInterval(() => {
              if (!browser || !browser.connected) {
                clearInterval(checkInterval);
                reject(new Error('Browser disconnected during readyState wait'));
              }
              if (page.isClosed()) {
                clearInterval(checkInterval);
                reject(new Error('Page closed during readyState wait'));
              }
            }, 500);
            // Clear interval after timeout
            setTimeout(() => {
              clearInterval(checkInterval);
            }, 8000);
          }),
        ]);
        console.log('Page readyState is complete');
      } catch (readyStateError: any) {
        // If readyState check fails, check connection immediately
        if (!browser || !browser.connected) {
          throw new Error(`Browser disconnected: ${readyStateError?.message || 'During readyState check'}`);
        }
        if (page.isClosed()) {
          throw new Error(`Page was closed: ${readyStateError?.message || 'During readyState check'}`);
        }
        console.warn('readyState check timed out or failed, but browser is still connected. Proceeding...');
      }
      
      // Final connection verification
      if (!browser || !browser.connected) {
        throw new Error('Browser disconnected after readyState check');
      }
      if (page.isClosed()) {
        throw new Error('Page was closed after readyState check');
      }
      
      // Minimal wait for resources (reduced from 2000ms to 500ms)
      await new Promise(resolve => setTimeout(resolve, 500));
      
      console.log('Navigation and page load completed successfully');
      
    } catch (navError: any) {
      const errorMessage = navError?.message || String(navError);
      console.error('Navigation error:', errorMessage);
      
      // Check connection status to provide better error message
      if (!browser || !browser.connected) {
        throw new Error(`Browser disconnected during navigation: ${errorMessage}`);
      }
      if (page.isClosed()) {
        throw new Error(`Page was closed during navigation: ${errorMessage}`);
      }
      
      // Re-throw navigation errors
      throw new Error(`Navigation failed: ${errorMessage}`);
    }

    // CRITICAL: Final verification before PDF generation
    console.log('Final check before PDF generation...');
    console.log(`Browser connected: ${browser?.connected}, Page closed: ${page.isClosed()}`);
    
    if (!browser) {
      throw new Error('Browser instance is null, cannot generate PDF');
    }
    if (page.isClosed()) {
      throw new Error('Page is closed, cannot generate PDF');
    }
    if (!browser.connected) {
      // Try to get more information about why browser disconnected
      const process = (browser as any).process();
      if (process) {
        const exitCode = process.exitCode;
        const signal = process.signalCode;
        throw new Error(`Browser is disconnected (exit code: ${exitCode}, signal: ${signal}), cannot generate PDF`);
      }
      throw new Error('Browser is disconnected, cannot generate PDF');
    }

    console.log('Starting PDF generation...');
    
    // Generate PDF - wrap in try-catch to handle session errors gracefully
    let pdfData: Buffer | Uint8Array;
    try {
      pdfData = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '0.5in',
          right: '0.5in',
          bottom: '0.5in',
          left: '0.5in',
        },
        preferCSSPageSize: false,
        timeout: 30000, // 30 second timeout for PDF generation
      });
      console.log('PDF generation completed successfully');
    } catch (pdfError: any) {
      // Enhanced error handling for session issues
      const errorMessage = pdfError?.message || String(pdfError);
      console.error('PDF generation error:', errorMessage);
      
      // Check if page/browser was closed during PDF generation
      if (page.isClosed()) {
        throw new Error(`Page was closed during PDF generation: ${errorMessage}`);
      }
      if (!browser || !browser.connected) {
        // Try to get more information about browser disconnection
        const process = (browser as any)?.process();
        const exitInfo = process ? ` (exit code: ${process.exitCode}, signal: ${process.signalCode})` : '';
        throw new Error(`Browser disconnected during PDF generation${exitInfo}: ${errorMessage}`);
      }
      
      // Check for specific session errors
      if (errorMessage.includes('Session closed') || errorMessage.includes('page has been closed')) {
        throw new Error(`PDF generation failed: Page session was closed. This may be due to a timeout or navigation issue. Original error: ${errorMessage}`);
      }
      
      // Re-throw the original error with context
      throw new Error(`PDF generation failed: ${errorMessage}`);
    }

    return Buffer.from(pdfData);
  } catch (error) {
    console.error('Puppeteer PDF generation error:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close().catch((err) => {
        console.error('Error closing browser:', err);
      });
    }
  }
}

