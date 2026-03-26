import { Job } from 'bullmq';
import { logger } from '@audit/pipeline';
import type { NotifyJobData } from '@audit/pipeline';

export async function processNotify(job: Job<NotifyJobData>) {
  const { callbackUrl, summaryJson, runId } = job.data;
  logger.info(`Sending webhook notification for ${runId}`, { callbackUrl });

  try {
    const response = await fetch(callbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        runId,
        status: 'completed',
        summary: summaryJson,
      }),
    });

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.statusText}`);
    }

    logger.info(`Webhook notification sent successfully for ${runId}`);
    return { success: true };
  } catch (error) {
    logger.error(`Webhook notification failed for ${runId}`, error as Error, { callbackUrl });
    throw error;
  }
}

