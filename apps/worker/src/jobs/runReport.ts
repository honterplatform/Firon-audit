import { Job } from 'bullmq';
import { prisma } from '@audit/db';
import { logger } from '@audit/pipeline';
import type { ReportJobData } from '@audit/pipeline';

export async function processReport(job: Job<ReportJobData>) {
  const { runId } = job.data;
  logger.info(`Report generation completed for ${runId}`, { runId });
  // Report generation is handled by the API route, this job just marks completion
  return { runId };
}

