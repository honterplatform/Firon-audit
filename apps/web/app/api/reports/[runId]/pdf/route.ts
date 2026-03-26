import { NextRequest, NextResponse } from 'next/server';
import { generatePDFFromHTML } from '@audit/pipeline';

// Force Node.js runtime (required for Puppeteer)
export const runtime = 'nodejs';
export const maxDuration = 60; // 60 seconds max for PDF generation

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await context.params;

    // Get base URL from environment variable or construct from request
    let baseUrl = process.env.APP_BASE_URL;
    if (!baseUrl) {
      const host = request.headers.get('host');
      const protocol = request.headers.get('x-forwarded-proto') || 'http';
      baseUrl = `${protocol}://${host}`;
    }
    
    // Fetch HTML from report route instead of navigating to it
    // This avoids navigation issues that cause SIGTRAP crashes
    console.log(`Fetching HTML from report route: ${baseUrl}/api/reports/${runId}`);
    const reportResponse = await fetch(`${baseUrl}/api/reports/${runId}`, {
      headers: {
        'Accept': 'text/html',
      },
    });
    
    if (!reportResponse.ok) {
      throw new Error(`Failed to fetch report HTML: ${reportResponse.status} ${reportResponse.statusText}`);
    }
    
    const html = await reportResponse.text();
    console.log(`Fetched HTML (${html.length} characters), generating PDF from HTML...`);
    
    // Generate PDF from HTML directly (avoids navigation issues)
    const pdfBuffer = await generatePDFFromHTML(html);

    return new NextResponse(pdfBuffer as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="audit-report-${runId}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error('Error generating PDF:', error);
    
    // Handle various error types including ErrorEvent
    let errorMessage = 'Unknown error';
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (error?.[Symbol.for('kMessage')]) {
      // ErrorEvent object from WebSocket
      errorMessage = error[Symbol.for('kMessage')] as string;
      const innerError = error[Symbol.for('kError')];
      if (innerError instanceof Error) {
        errorMessage = `${errorMessage}: ${innerError.message}`;
      }
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else if (error?.message) {
      errorMessage = error.message;
    }
    
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('PDF generation error details:', { errorMessage, errorStack, errorType: error?.constructor?.name });
    
    return NextResponse.json(
      { 
        error: 'Failed to generate PDF',
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}

