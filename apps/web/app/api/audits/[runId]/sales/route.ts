import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@audit/db';

const salesSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  phone: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await context.params;
    const body = await request.json();

    // Validate input - all fields are optional
    const parsed = salesSchema.parse(body);

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

    // Store sales contact in database
    const salesContact = await prisma.salesContact.create({
      data: {
        runId,
        name: parsed.name,
        email: parsed.email,
        phone: parsed.phone ?? null,
      },
    });

    console.log('Sales contact stored:', {
      id: salesContact.id,
      runId,
      target: run.target,
      email: parsed.email,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error capturing sales contact:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
