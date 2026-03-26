import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const health: {
    status: 'ok' | 'error';
    checks: Record<string, { status: 'ok' | 'error'; message?: string }>;
  } = {
    status: 'ok',
    checks: {},
  };

  // Check DATABASE_URL
  if (process.env.DATABASE_URL) {
    health.checks.database_url = { status: 'ok' };
    
    // Try to import and test Prisma
    try {
      const { prisma } = await import('@audit/db');
      // Try a simple query
      await prisma.$queryRaw`SELECT 1`;
      health.checks.database_connection = { status: 'ok' };
    } catch (error) {
      health.status = 'error';
      health.checks.database_connection = {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  } else {
    health.status = 'error';
    health.checks.database_url = {
      status: 'error',
      message: 'DATABASE_URL environment variable is not set',
    };
  }

  // Check REDIS_URL (optional)
  if (process.env.REDIS_URL) {
    health.checks.redis_url = { status: 'ok' };
  } else {
    health.checks.redis_url = {
      status: 'ok',
      message: 'REDIS_URL not set (optional)',
    };
  }

  // Check other critical env vars
  const requiredEnvVars = ['STORAGE_PROVIDER', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];
  for (const envVar of requiredEnvVars) {
    if (process.env[envVar]) {
      health.checks[envVar.toLowerCase()] = { status: 'ok' };
    } else {
      health.checks[envVar.toLowerCase()] = {
        status: 'ok',
        message: `${envVar} not set (may be optional)`,
      };
    }
  }

  return NextResponse.json(health, {
    status: health.status === 'ok' ? 200 : 503,
  });
}


