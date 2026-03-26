import { Queue, QueueOptions } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

const queueOptions: QueueOptions = {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      age: 3600, // Keep completed jobs for 1 hour
      count: 100,
    },
    removeOnFail: {
      age: 86400, // Keep failed jobs for 24 hours
    },
  },
};

export const crawlQueue = new Queue('run-crawl', queueOptions);
export const lighthouseQueue = new Queue('run-lighthouse', queueOptions);
export const axeQueue = new Queue('run-axe', queueOptions);
export const heuristicsQueue = new Queue('run-heuristics', queueOptions);
export const summarizeQueue = new Queue('run-summarize', queueOptions);
export const reportQueue = new Queue('run-report', queueOptions);
export const notifyQueue = new Queue('run-notify', queueOptions);

export async function closeQueues() {
  await Promise.all([
    crawlQueue.close(),
    lighthouseQueue.close(),
    axeQueue.close(),
    heuristicsQueue.close(),
    summarizeQueue.close(),
    reportQueue.close(),
    notifyQueue.close(),
  ]);
  await connection.quit();
}

