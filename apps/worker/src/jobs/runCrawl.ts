import { Job } from 'bullmq';
import { runCrawl } from '@audit/plugins';
import { prisma, ArtifactType } from '@audit/db';
import { logger } from '@audit/pipeline';
import type { CrawlJobData } from '@audit/pipeline';
import * as fs from 'fs';
import * as path from 'path';

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

    // Save screenshots to database for cross-service access (Railway)
    const storageDir = process.env.LOCAL_STORAGE_DIR || './data/uploads';
    for (const [viewport, screenshotPath] of Object.entries(result.screenshots || {})) {
      if (!screenshotPath) continue;
      try {
        const filePath = path.join(storageDir, screenshotPath as string);
        if (fs.existsSync(filePath)) {
          const data = fs.readFileSync(filePath).toString('base64');
          await prisma.storedFile.upsert({
            where: { key: screenshotPath as string },
            create: { key: screenshotPath as string, data, contentType: 'image/png' },
            update: { data, contentType: 'image/png' },
          });
        }
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

