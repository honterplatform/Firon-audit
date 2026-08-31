// Server-side passcode gate for tool endpoints that trigger real cost
// (Chromium crawls, LLM calls). Not intended as a general auth system.
//
// The passcode itself lives in TOOL_PASSCODE (server env, never NEXT_PUBLIC_).
// A visitor unlocks the tool by POSTing the passcode to /api/auth/tool, which
// sets a firon_tool_access cookie. Guarded endpoints then read the cookie and
// constant-time compare it against TOOL_PASSCODE. Cookie is non-HttpOnly so
// the client-side gate can check for its presence, at the cost that anyone
// with browser access to a signed-in machine can read the passcode from
// document.cookie. Acceptable for a shared internal-team passcode.

import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';

export const TOOL_COOKIE = 'firon_tool_access';
export const TOOL_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

function safeStringEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// Validate a passcode against the configured TOOL_PASSCODE. Returns false if
// the env var is missing, so guards fail closed on misconfigured deploys.
export function checkPasscode(input: string): boolean {
  const secret = process.env.TOOL_PASSCODE;
  if (!secret || secret.length < 4) {
    console.warn('[authGuard] TOOL_PASSCODE missing or too short; refusing access.');
    return false;
  }
  if (typeof input !== 'string' || input.length === 0) return false;
  return safeStringEqual(input, secret);
}

// Route guard. Returns null when access is granted, or a 403 NextResponse when
// blocked. Call it at the top of any POST that triggers cost and early-return
// the response if it is truthy.
export function requireToolAccess(request: NextRequest): NextResponse | null {
  const cookie = request.cookies.get(TOOL_COOKIE)?.value ?? '';
  if (checkPasscode(cookie)) return null;
  return NextResponse.json(
    {
      error: 'forbidden',
      message: 'This tool is for Firon Marketing clients. Book a call to see it.',
    },
    { status: 403 },
  );
}
