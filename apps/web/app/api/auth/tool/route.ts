// Passcode entry endpoint for the tool gate.
//
// POST { passcode }: on match, sets the firon_tool_access cookie so subsequent
// scan-triggering POSTs pass requireToolAccess.
// DELETE:            clears the cookie (log out).

import { NextRequest, NextResponse } from 'next/server';
import {
  checkPasscode,
  TOOL_COOKIE,
  TOOL_COOKIE_MAX_AGE,
} from '@/app/lib/authGuard';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const passcode =
    typeof (body as { passcode?: unknown } | null)?.passcode === 'string'
      ? ((body as { passcode: string }).passcode as string)
      : '';

  if (!checkPasscode(passcode)) {
    return NextResponse.json({ error: 'invalid_passcode' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(TOOL_COOKIE, passcode, {
    path: '/',
    maxAge: TOOL_COOKIE_MAX_AGE,
    sameSite: 'lax',
    // Non-HttpOnly on purpose so the client-side FironOnly wrapper can gate
    // rendering without a network round-trip on every mount.
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(TOOL_COOKIE);
  return res;
}
