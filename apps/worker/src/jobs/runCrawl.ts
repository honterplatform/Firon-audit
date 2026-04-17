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

    // Save screenshots to database for cross-service access (Railway).
    // Use the in-memory buffer from the crawler so this works regardless of
    // the configured storage provider (local/supabase/s3/data-url).
    for (const viewport of ['desktop', 'mobile'] as const) {
      const screenshotPath = result.screenshots?.[viewport];
      const buffer = result.screenshotBuffers?.[viewport];
      if (!screenshotPath || !buffer) continue;
      try {
        const data = buffer.toString('base64');
        await prisma.storedFile.upsert({
          where: { key: screenshotPath },
          create: { key: screenshotPath, data, contentType: 'image/png' },
          update: { data, contentType: 'image/png' },
        });
        logger.info(`Saved ${viewport} screenshot to DB`, { key: screenshotPath, bytes: buffer.length });
      } catch (e) {
        logger.warn(`Failed to save ${viewport} screenshot to DB`, { error: (e as Error).message });
      }
    }

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

