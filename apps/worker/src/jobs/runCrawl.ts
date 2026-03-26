import { Job } from 'bullmq';
import { runCrawl } from '@audit/plugins';
import { prisma, ArtifactType } from '@audit/db';
import { logger } from '@audit/pipeline';
import type { CrawlJobData } from '@audit/pipeline';

export async function processCrawl(job: Job<CrawlJobData>) {
  const { runId, target } = job.data;
  logger.info(`Starting crawl for ${target}`, { runId });

  try {
    await prisma.auditRun.update({
      where: { id: runId },
      data: { status: 'running', startedAt: new Date() },
    });

    const result = await runCrawl(target, runId);

    // Store artifacts
    await prisma.artifact.createMany({
      data: [
        {
          runId,
          type: ArtifactType.screenshot,
          path: result.screenshots.desktop,
          metaJson: { viewport: 'desktop' },
        },
        {
          runId,
          type: ArtifactType.screenshot,
          path: result.screenshots.mobile,
          metaJson: { viewport: 'mobile' },
        },
        {
          runId,
          type: ArtifactType.html,
          path: result.html.desktop,
          metaJson: { viewport: 'desktop' },
        },
        {
          runId,
          type: ArtifactType.html,
          path: result.html.mobile,
          metaJson: { viewport: 'mobile' },
        },
        // Store element coordinates as JSON artifact
        {
          runId,
          type: ArtifactType.json,
          path: 'elementCoordinates',
          metaJson: result.elementCoordinates || {},
        },
        // Store blocked status as JSON artifact
        {
          runId,
          type: ArtifactType.json,
          path: 'blockedStatus',
          metaJson: result.blocked || {},
        },
      ],
    });

    logger.info(`Crawl completed for ${target}`, { runId });
    return result;
  } catch (error) {
    logger.error(`Crawl failed for ${target}`, error as Error, { runId });
    await prisma.auditRun.update({
      where: { id: runId },
      data: { status: 'failed' },
    });
    throw error;
  }
}

