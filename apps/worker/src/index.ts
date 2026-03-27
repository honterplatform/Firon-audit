import './loadEnv';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { processOrchestrator } from './jobs/orchestrator';
import { logger } from '@audit/pipeline';
import { execSync } from 'child_process';

// Lighthouse will use Playwright's Chromium automatically
// No need for complex Chrome detection - removed for simplicity
logger.info('Lighthouse configured to use Playwright\'s bundled Chromium');

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
logger.info(`Connecting to Redis: ${redisUrl.replace(/:[^:@]+@/, ':****@')}`); // Log URL with masked password

const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
});

connection.on('connect', () => {
  logger.info('Redis connection established');
});

connection.on('ready', () => {
  logger.info('Redis connection ready');
});

connection.on('error', (err) => {
  logger.error('Redis connection error', err);
});

connection.on('close', () => {
  logger.warn('Redis connection closed');
});

const worker = new Worker(
  'run-crawl',
  async (job) => {
    return await processOrchestrator(job);
  },
  {
    connection,
    concurrency: 5, // Increased from 2 to 5 for better throughput
    limiter: {
      max: 10, // Increased from 5 to 10 audits per minute
      duration: 60000,
    },
  }
);

worker.on('completed', (job) => {
  logger.info(`Job ${job.id} completed`, { runId: job.data.runId });
});

worker.on('failed', (job, err) => {
  logger.error(`Job ${job?.id} failed`, err, { runId: job?.data.runId });
});

worker.on('error', (err) => {
  logger.error('Worker error', err);
});

logger.info('Worker started and listening for jobs (v2)');

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down worker');
  await worker.close();
  await connection.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down worker');
  await worker.close();
  await connection.quit();
  process.exit(0);
});

// deploy 1774621695
