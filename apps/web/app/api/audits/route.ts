import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Lazy imports to avoid initialization errors
async function getPrisma() {
  try {
    const { prisma } = await import('@audit/db');
    return prisma;
  } catch (error) {
    console.error('Failed to import Prisma client:', error);
    throw new Error(`Failed to import Prisma client: ${error instanceof Error ? error.message : 'Unknown error'}. Make sure Prisma client is generated (run: pnpm --filter @audit/db db:generate)`);
  }
}

async function getAuditRunStatus() {
  try {
    const { AuditRunStatus } = await import('@audit/db');
    return AuditRunStatus;
  } catch (error) {
    console.error('Failed to import AuditRunStatus:', error);
    throw new Error(`Failed to import AuditRunStatus: ${error instanceof Error ? error.message : 'Unknown error'}. Make sure Prisma client is generated.`);
  }
}

// Cache queue client to reuse Redis connection
let cachedQueueClient: Awaited<ReturnType<typeof import('@audit/pipeline').createQueueClient>> | null = null;

// Try to use Redis queue if available
async function getQueueClient() {
  try {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      if (!cachedQueueClient) {
        const { createQueueClient } = await import('@audit/pipeline');
        cachedQueueClient = createQueueClient();
      }
      return cachedQueueClient;
    }
  } catch (error) {
    console.warn('Redis not available:', error);
  }
  return null;
}

const auditInputSchema = z.object({
  target: z.string().url(),
  goal: z.string().min(1).optional(),
  audience: z.string().min(1).optional(),
  primaryCta: z.string().min(1).optional(),
  fidelity: z.enum(['quick', 'full']).optional(),
  callbackUrl: z.string().url().optional(),
});

const IDEMPOTENCY_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const prisma = await getPrisma();
    const audits = await prisma.auditRun.findMany({
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        target: true,
        status: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
      },
    });

    return NextResponse.json({
      audits,
      total: audits.length,
    });
  } catch (error) {
    console.error('Error fetching audits:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check critical environment variables first
    if (!process.env.DATABASE_URL) {
      console.error('DATABASE_URL is not set');
      return NextResponse.json(
        { 
          error: 'Database configuration missing',
          message: 'DATABASE_URL environment variable is not set. Please configure it in Railway settings.',
        },
        { status: 500 }
      );
    }

    // Parse request body with error handling
    let body;
    try {
      body = await request.json();
    } catch (error) {
      console.error('Failed to parse request body:', error);
      return NextResponse.json(
        { 
          error: 'Invalid request body',
          message: 'Request body must be valid JSON.',
        },
        { status: 400 }
      );
    }
    const idempotencyKey = request.headers.get('Idempotency-Key');

    // Validate with Zod
    const parsed = auditInputSchema.parse(body);
    const normalizedInputs = {
      target: parsed.target,
      goal: parsed.goal ?? 'Improve conversions',
      audience: parsed.audience ?? 'Primary visitors',
      primaryCta: parsed.primaryCta ?? 'Primary action',
      fidelity: parsed.fidelity ?? 'full',
    };

    // Try to get Prisma client with better error handling
    let prisma;
    let AuditRunStatus;
    try {
      prisma = await getPrisma();
      AuditRunStatus = await getAuditRunStatus();
    } catch (error) {
      console.error('Failed to initialize Prisma:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return NextResponse.json(
        { 
          error: 'Database initialization failed',
          message: `Failed to connect to database: ${errorMessage}. Please check DATABASE_URL and ensure the database is accessible.`,
        },
        { status: 500 }
      );
    }

    // Check idempotency
    if (idempotencyKey) {
      try {
        const existing = await prisma.auditRun.findFirst({
          where: {
            target: normalizedInputs.target,
            createdAt: {
              gte: new Date(Date.now() - IDEMPOTENCY_WINDOW_MS),
            },
            status: {
              in: ['queued', 'running'],
            },
          },
          orderBy: { createdAt: 'desc' },
        });

        if (existing) {
          return NextResponse.json(
            {
              runId: existing.id,
              statusUrl: `/api/audits/${existing.id}`,
              message: 'Audit already in progress',
            },
            { status: 202 }
          );
        }
      } catch (error) {
        console.error('Error checking idempotency:', error);
        // Continue to create new audit if idempotency check fails
      }
    }

    // Create audit run
    let run;
    try {
      run = await prisma.auditRun.create({
        data: {
          target: normalizedInputs.target,
          inputsJson: normalizedInputs,
          status: AuditRunStatus.queued,
        },
      });
    } catch (error) {
      console.error('Error creating audit run:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Check if it's a database connection error
      if (errorMessage.includes('P1001') || errorMessage.includes('connect') || errorMessage.includes('ECONNREFUSED')) {
        return NextResponse.json(
          { 
            error: 'Database connection failed',
            message: 'Unable to connect to the database. Please check DATABASE_URL and ensure the database is running and accessible.',
          },
          { status: 500 }
        );
      }
      
      throw error; // Re-throw to be caught by outer catch
    }

    // Try to use Redis queue if available
    const queueClient = await getQueueClient();
    
    if (queueClient) {
      // Use Redis queue (async processing - recommended)
      try {
        const { crawlQueue, connection } = queueClient;
        
        // Ensure connection is ready with timeout
        if (connection.status !== 'ready') {
          console.log('Redis connection not ready, status:', connection.status);
          // Try to connect if not connected
          if (connection.status === 'end' || connection.status === 'close') {
            try {
              await Promise.race([
                connection.connect(),
                new Promise((_, reject) => 
                  setTimeout(() => reject(new Error('Redis connection timeout')), 5000)
                )
              ]);
            } catch (connectError) {
              console.error('Redis connect failed:', connectError);
              throw new Error('Failed to connect to Redis. Please check REDIS_URL.');
            }
          }
          // Wait a bit for connection to be ready (with timeout)
          await Promise.race([
            new Promise((resolve) => {
              const checkReady = () => {
                if (connection.status === 'ready') {
                  resolve(undefined);
                } else {
                  setTimeout(checkReady, 100);
                }
              };
              checkReady();
            }),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Redis connection timeout')), 5000)
            )
          ]);
        }
        
        // Test connection with a ping (with timeout)
        try {
          await Promise.race([
            connection.ping(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Redis ping timeout')), 5000)
            )
          ]);
        } catch (pingError) {
          console.error('Redis ping failed:', pingError);
          throw new Error('Redis connection is not available. Please check REDIS_URL.');
        }
        
        // Check if workers are available (in development, fall back if no workers)
        if (process.env.NODE_ENV === 'development') {
          try {
            const workers = await connection.smembers('bull:run-crawl:workers');
            if (workers.length === 0) {
              console.log('No workers available, falling back to synchronous processing');
              throw new Error('No workers available');
            }
          } catch (workerCheckError) {
            // Fall through to synchronous processing
            throw workerCheckError;
          }
        }
        
        // Add job to queue
        await crawlQueue.add('crawl', {
          runId: run.id,
          target: normalizedInputs.target,
          inputs: normalizedInputs,
        });

        return NextResponse.json(
          {
            runId: run.id,
            statusUrl: `/api/audits/${run.id}`,
            message: 'Audit queued for processing',
          },
          { status: 202 }
        );
      } catch (error) {
        // If Redis fails or no workers available, fall back to synchronous processing in development
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const shouldFallback = process.env.NODE_ENV === 'development' && (
          errorMessage.includes('No workers available') ||
          errorMessage.includes('Redis') ||
          errorMessage.includes('connection') ||
          errorMessage.includes('timeout')
        );
        
        if (shouldFallback) {
          console.log('Redis queue failed or no workers available, falling back to synchronous processing:', errorMessage);
          
          // Process in background without blocking the response
          setImmediate(async () => {
            try {
              // Use require for CommonJS modules
              const path = await import('path');
              const workerPath = path.resolve(process.cwd(), '..', '..', 'apps', 'worker', 'dist', 'jobs', 'orchestrator.js');
              // @ts-ignore - __non_webpack_require__ is a webpack global
              const nodeRequire = typeof __non_webpack_require__ !== 'undefined' ? __non_webpack_require__ : require;
              const { processOrchestrator } = nodeRequire(workerPath);
              
              const mockJob = {
                data: {
                  runId: run.id,
                  target: normalizedInputs.target,
                  inputs: normalizedInputs,
                },
              } as any;
              
              await processOrchestrator(mockJob);
            } catch (syncError) {
              console.error('Synchronous audit processing failed:', syncError);
              const errorMessage = syncError instanceof Error ? syncError.message : String(syncError);
              const errorStack = syncError instanceof Error ? syncError.stack : undefined;
              
              await prisma.auditRun.update({
                where: { id: run.id },
                data: { 
                  status: AuditRunStatus.failed,
                  summaryJson: {
                    error: {
                      message: errorMessage,
                      stack: errorStack,
                      timestamp: new Date().toISOString(),
                    }
                  } as any,
                },
              });
            }
          });
          
          return NextResponse.json(
            {
              runId: run.id,
              statusUrl: `/api/audits/${run.id}`,
              message: 'Audit processing started (synchronous mode - Redis unavailable)',
            },
            { status: 202 }
          );
        }
        console.error('Failed to enqueue job:', error);
        
        // Check if it's a rate limit error
        const isRateLimitError = errorMessage.includes('max requests limit exceeded') || 
                                 errorMessage.includes('MAXREQERR');
        
        // Check if it's a connection error
        const isConnectionError = errorMessage.includes('Connection is closed') ||
                                 errorMessage.includes('ECONNREFUSED') ||
                                 errorMessage.includes('ENOTFOUND') ||
                                 errorMessage.includes('not available');
        
        // Mark as failed
        await prisma.auditRun.update({
          where: { id: run.id },
          data: { status: AuditRunStatus.failed },
        });
        
        if (isRateLimitError) {
          return NextResponse.json(
            { 
              error: 'Redis rate limit exceeded',
              message: 'Your Redis instance has exceeded its monthly request limit. Please create a new Redis instance at https://upstash.com (free tier available) and update REDIS_URL in Railway.',
              runId: run.id,
            },
            { status: 503 }
          );
        }
        
        // For connection errors, fall back to synchronous processing (development mode)
        if (isConnectionError && process.env.NODE_ENV === 'development') {
          console.log('Redis connection failed, falling back to synchronous processing');
          
          // Process in background without blocking the response
          // Use dynamic require to avoid webpack bundling issues
          setImmediate(async () => {
            try {
              // Use dynamic path construction to avoid webpack static analysis
              const path = await import('path');
              const fs = await import('fs');
              // Go up two levels from apps/web to monorepo root
              const workerPath = path.join(process.cwd(), '..', '..', 'apps', 'worker', 'dist', 'jobs', 'orchestrator.js');
              // Verify file exists
              if (!fs.existsSync(workerPath)) {
                throw new Error(`Worker file not found at: ${workerPath}. Current working directory: ${process.cwd()}`);
              }
              // Use __non_webpack_require__ to bypass webpack's require handling
              // @ts-ignore - __non_webpack_require__ is a webpack global
              const nodeRequire = typeof __non_webpack_require__ !== 'undefined' ? __non_webpack_require__ : require;
              const { processOrchestrator } = nodeRequire(workerPath);
              
              const mockJob = {
                data: {
                  runId: run.id,
                  target: normalizedInputs.target,
                  inputs: normalizedInputs,
                },
              } as any;
              
              await processOrchestrator(mockJob);
            } catch (syncError) {
              console.error('Synchronous audit processing failed:', syncError);
              const errorMessage = syncError instanceof Error ? syncError.message : String(syncError);
              const errorStack = syncError instanceof Error ? syncError.stack : undefined;
              
              await prisma.auditRun.update({
                where: { id: run.id },
                data: { 
                  status: AuditRunStatus.failed,
                  summaryJson: {
                    error: {
                      message: errorMessage,
                      stack: errorStack,
                      timestamp: new Date().toISOString(),
                    }
                  } as any,
                },
              });
            }
          });
          
          return NextResponse.json(
            {
              runId: run.id,
              statusUrl: `/api/audits/${run.id}`,
              message: 'Audit processing started (synchronous mode - Redis unavailable)',
            },
            { status: 202 }
          );
        }
        
        if (isConnectionError) {
          return NextResponse.json(
            { 
              error: 'Redis connection failed',
              message: `Unable to connect to Redis: ${errorMessage}. Please verify REDIS_URL is correct and the Redis instance is running.`,
              runId: run.id,
            },
            { status: 503 }
          );
        }
        
        return NextResponse.json(
          { 
            error: 'Failed to queue audit job',
            message: `${errorMessage}. Please check your REDIS_URL and ensure the Redis instance is accessible.`,
            runId: run.id,
          },
          { status: 503 }
        );
      }
    } else {
      // No Redis - process synchronously (useful for development)
      console.log('Redis not available, processing audit synchronously');
      
      // Process in background without blocking the response
      // Use dynamic require to avoid webpack bundling issues
      setImmediate(async () => {
        try {
          // Use dynamic path construction to avoid webpack static analysis
          const path = await import('path');
          const fs = await import('fs');
          // Go up two levels from apps/web to monorepo root
          const workerPath = path.join(process.cwd(), '..', '..', 'apps', 'worker', 'dist', 'jobs', 'orchestrator.js');
          // Verify file exists
          if (!fs.existsSync(workerPath)) {
            throw new Error(`Worker file not found at: ${workerPath}. Current working directory: ${process.cwd()}`);
          }
          // Use __non_webpack_require__ to bypass webpack's require handling
          // @ts-ignore - __non_webpack_require__ is a webpack global
          const nodeRequire = typeof __non_webpack_require__ !== 'undefined' ? __non_webpack_require__ : require;
          const { processOrchestrator } = nodeRequire(workerPath);
          
          // Create a mock job object with the data
          const mockJob = {
            data: {
              runId: run.id,
              target: normalizedInputs.target,
              inputs: normalizedInputs,
            },
          } as any;
          
          await processOrchestrator(mockJob);
        } catch (error) {
          console.error('Synchronous audit processing failed:', error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          const errorStack = error instanceof Error ? error.stack : undefined;
          
      await prisma.auditRun.update({
        where: { id: run.id },
            data: { 
              status: AuditRunStatus.failed,
              summaryJson: {
                error: {
                  message: errorMessage,
                  stack: errorStack,
                  timestamp: new Date().toISOString(),
                }
              } as any,
            },
          });
        }
      });
      
      return NextResponse.json(
        {
          runId: run.id,
          statusUrl: `/api/audits/${run.id}`,
          message: 'Audit processing started (synchronous mode - no Redis)',
        },
        { status: 202 }
      );
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error creating audit:', error);
    
    // Provide more detailed error information
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    // Check for common error patterns
    let userFriendlyMessage = errorMessage;
    if (errorMessage.includes('P1001') || errorMessage.includes('Can\'t reach database server')) {
      userFriendlyMessage = 'Database connection failed. Please check DATABASE_URL.';
    } else if (errorMessage.includes('P2002') || errorMessage.includes('Unique constraint')) {
      userFriendlyMessage = 'A similar audit is already in progress.';
    } else if (errorMessage.includes('P2025') || errorMessage.includes('Record to update not found')) {
      userFriendlyMessage = 'Audit record not found.';
    }
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: userFriendlyMessage,
        // Include detailed error in production for debugging (but not stack)
        ...(process.env.NODE_ENV === 'production' && { details: errorMessage }),
        // Include stack only in development
        ...(process.env.NODE_ENV === 'development' && { stack: errorStack })
      },
      { status: 500 }
    );
  }
}
