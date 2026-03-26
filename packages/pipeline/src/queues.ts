import { Queue, QueueOptions } from 'bullmq';
import IORedis from 'ioredis';

// Export queue client creation for web app
export function createQueueClient() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  
  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: 3,
    connectTimeout: 10000, // 10 second timeout
    lazyConnect: false, // Connect immediately
    retryStrategy: (times) => {
      // Retry up to 3 times with exponential backoff
      if (times > 3) {
        return null; // Stop retrying after 3 attempts
      }
      return Math.min(times * 200, 2000); // Max 2 seconds between retries
    },
    enableReadyCheck: true,
    enableOfflineQueue: false, // Don't queue commands when offline
  });

  // Handle connection errors
  connection.on('error', (err) => {
    console.error('Redis connection error:', err);
  });

  connection.on('close', () => {
    console.warn('Redis connection closed');
  });

  connection.on('connect', () => {
    console.log('Redis connected');
  });

  const queueOptions: QueueOptions = {
    connection,
    defaultJobOptions: {
      attempts: 2, // Reduced from 3 to 2 for faster failure detection
      backoff: {
        type: 'exponential',
        delay: 1000, // Reduced from 2000ms to 1000ms for faster retries
      },
      removeOnComplete: {
        age: 3600, // Keep completed jobs for 1 hour
        count: 100, // Keep last 100 completed jobs
      },
      removeOnFail: {
        age: 86400, // Keep failed jobs for 24 hours
      },
    },
  };

  return {
    crawlQueue: new Queue('run-crawl', queueOptions),
    connection,
  };
}

