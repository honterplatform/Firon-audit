import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@audit/db';

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
    console.log('Lead captured:', {
      runId,
      target: run.target,
      email: parsed.email,
      name: parsed.name,
      company: parsed.company,
      selectedCategories: parsed.selectedCategories || [],
      categoryOrder: parsed.categoryOrder || [],
      timestamp: new Date().toISOString(),
    });

    // TODO: Store in database if you add a Lead model
    // await prisma.lead.create({
    //   data: {
    //     runId,
    //     email: parsed.email,
    //     name: parsed.name,
    //     company: parsed.company,
    //   },
    // });

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

