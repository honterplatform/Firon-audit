import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@audit/db';

const updateSchema = z.object({
  contactStatus: z
    .enum(['new_lead', 'contacted', 'no_response', 'responded', 'closed'])
    .optional(),
  notes: z.string().optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ contactId: string }> }
) {
  try {
    const { contactId } = await context.params;
    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const contact = await prisma.salesContact.update({
      where: { id: contactId },
      data: {
        ...(parsed.contactStatus !== undefined && {
          contactStatus: parsed.contactStatus,
        }),
        ...(parsed.notes !== undefined && { notes: parsed.notes }),
      },
    });

    return NextResponse.json({ success: true, contact });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error updating contact:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
