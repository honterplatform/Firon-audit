import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function getPrismaClient(): PrismaClient {
const databaseUrl = process.env.DATABASE_URL;
  
  // During build time, DATABASE_URL might not be available
  // Use a placeholder if not set (will fail at runtime if actually used)
  const url = databaseUrl || 'postgresql://placeholder:placeholder@localhost:5432/placeholder';

  const client = new PrismaClient({
    datasources: {
      db: {
        url: url,
      },
    },
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

  // Don't connect during build - only validate connection at runtime
  if (process.env.NEXT_PHASE !== 'phase-production-build') {
    // Only validate in non-build contexts
  }

  return client;
}

// Use a getter to make it truly lazy
function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = getPrismaClient();
  }
  return globalForPrisma.prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return getPrisma()[prop as keyof PrismaClient];
  },
});

if (process.env.NODE_ENV !== 'production') {
  // Initialize on first access in non-production
  getPrisma();
}

export * from '@prisma/client';

