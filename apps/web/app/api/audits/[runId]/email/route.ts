import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@audit/db';

const emailSchema = z.object({
  email: z.string().email(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await context.params;
    const body = await request.json();

    // Validate input
    const parsed = emailSchema.parse(body);

    // Verify audit run exists
    const run = await prisma.auditRun.findUnique({
      where: { id: runId },
    });

    if (!run) {
      return NextResponse.json(
        { error: 'Audit run not found' },
        { status: 404 }
      );
    }

    // Get base URL for PDF generation
    let baseUrl = process.env.APP_BASE_URL;
    if (!baseUrl) {
      const host = request.headers.get('host');
      const protocol = request.headers.get('x-forwarded-proto') || 'http';
      baseUrl = `${protocol}://${host}`;
    }

    // Generate PDF
    const pdfResponse = await fetch(`${baseUrl}/api/reports/${runId}/pdf`);
    if (!pdfResponse.ok) {
      throw new Error('Failed to generate PDF');
    }
    const pdfBuffer = await pdfResponse.arrayBuffer();

    // TODO: Implement email sending
    // For now, we'll log it. You can integrate with:
    // - SendGrid
    // - Resend
    // - AWS SES
    // - Nodemailer with SMTP
    console.log('Email audit request:', {
      runId,
      target: run.target,
      email: parsed.email,
      pdfSize: pdfBuffer.byteLength,
      timestamp: new Date().toISOString(),
    });

    // Example email sending (you'll need to implement this):
    // await sendEmail({
    //   to: parsed.email,
    //   subject: `Your UX/UI Audit Report for ${run.target}`,
    //   text: `Your audit report for ${run.target} is attached.`,
    //   attachments: [{
    //     filename: `audit-report-${runId}.pdf`,
    //     content: Buffer.from(pdfBuffer),
    //   }],
    // });

    return NextResponse.json({ success: true, message: 'Audit sent to email' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error sending audit email:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

