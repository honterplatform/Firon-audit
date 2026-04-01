import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@audit/db';
import { auditLeadAlert } from '@/app/lib/slack';

const leadSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).optional(),
  company: z.string().optional(),
  selectedCategories: z.array(z.string()).optional(),
  categoryOrder: z.array(z.string()).optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await context.params;
    const body = await request.json();

    // Validate input
    const parsed = leadSchema.parse(body);

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

    // Store lead information
    // For now, we'll log it and could store in a leads table later
    // Notify Slack
    auditLeadAlert({ name: parsed.name, email: parsed.email, target: run.target, runId, type: 'lead' });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error capturing lead:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

