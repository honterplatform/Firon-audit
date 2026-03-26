import { Job } from 'bullmq';
import { processCrawl } from './runCrawl';
import { processLighthouse } from './runLighthouse';
import { processAxe } from './runAxe';
import { processHeuristics } from './runHeuristics';
import { processSummarize } from './runSummarize';
import { processReport } from './runReport';
import { processNotify } from './runNotify';
import { prisma } from '@audit/db';
import { logger } from '@audit/pipeline';
import type { CrawlJobData } from '@audit/pipeline';

export async function processOrchestrator(job: Job<CrawlJobData>) {
  const { runId, target, inputs } = job.data;
  logger.info(`Starting orchestration for ${target}`, { runId });

  try {
    // Step 1: Run crawl
    const crawlResult = await processCrawl(job);

    // Step 2: Run parallel jobs (lighthouse, axe, heuristics)
    const [perfResult, a11yResult, heuristicsResult] = await Promise.allSettled([
      processLighthouse({
        data: { runId, target, inputs, crawlResult },
      } as Job),
      processAxe({
        data: { runId, target, inputs, crawlResult },
      } as Job),
      processHeuristics({
        data: { runId, target, inputs, crawlResult },
      } as Job),
    ]);

    // Check for failures
    const failedJobs: string[] = [];
    if (perfResult.status === 'rejected') {
      const error = perfResult.reason;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      const errorObj = error instanceof Error ? error : new Error(errorMessage);
      logger.error(`Lighthouse failed for ${target}`, errorObj, { runId });
      failedJobs.push('lighthouse');
      
      // Store Lighthouse failure in summaryJson for UI visibility
      try {
        await prisma.auditRun.update({
          where: { id: runId },
          data: {
            summaryJson: {
              lighthouseError: {
                message: errorMessage,
                stack: errorStack,
                timestamp: new Date().toISOString(),
                note: 'Lighthouse analysis failed. The audit will continue with partial results.',
              }
            } as any,
          },
        });
      } catch (updateError) {
        logger.warn('Failed to store Lighthouse error in summaryJson', { runId, error: updateError });
      }
    }
    if (a11yResult.status === 'rejected') {
      logger.warn(`Axe failed for ${target}`, { runId, error: a11yResult.reason });
      failedJobs.push('axe');
    }
    if (heuristicsResult.status === 'rejected') {
      logger.warn(`Heuristics failed for ${target}`, { runId, error: heuristicsResult.reason });
      failedJobs.push('heuristics');
    }

    // Update status to partial if any job failed
    if (failedJobs.length > 0) {
      await prisma.auditRun.update({
        where: { id: runId },
        data: { status: 'partial' },
      });
    }

    // Step 3: Summarize (if we have at least one result)
    if (perfResult.status === 'fulfilled' || a11yResult.status === 'fulfilled' || heuristicsResult.status === 'fulfilled') {
      const summaryResult = await processSummarize({
        data: {
          runId,
          target,
          inputs,
          crawlResult,
          perfResult: perfResult.status === 'fulfilled' ? perfResult.value : undefined,
          a11yResult: a11yResult.status === 'fulfilled' ? a11yResult.value : undefined,
          heuristicsResult: heuristicsResult.status === 'fulfilled' ? heuristicsResult.value : undefined,
        },
      } as Job);

      // Step 4 & 5: Run report generation and notification in parallel (saves ~5-10s)
      const finalSteps: Promise<any>[] = [
        processReport({
          data: { runId, target, inputs, summaryJson: summaryResult },
        } as Job),
      ];

      // Only add notification if callback URL provided
      if (inputs.callbackUrl) {
        finalSteps.push(
          processNotify({
            data: { runId, target, inputs, callbackUrl: inputs.callbackUrl, summaryJson: summaryResult },
          } as Job)
        );
      }

      // Run final steps in parallel
      await Promise.allSettled(finalSteps);

      // Mark as completed
      await prisma.auditRun.update({
        where: { id: runId },
        data: { status: 'completed', completedAt: new Date() },
      });

      logger.info(`Orchestration completed for ${target}`, { runId });
    } else {
      // All jobs failed
      await prisma.auditRun.update({
        where: { id: runId },
        data: { status: 'failed' },
      });
      throw new Error('All analysis jobs failed');
    }
  } catch (error) {
    logger.error(`Orchestration failed for ${target}`, error as Error, { runId });
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    // Store error details in summaryJson for UI display
    await prisma.auditRun.update({
      where: { id: runId },
      data: { 
        status: 'failed',
        summaryJson: {
          error: {
            message: errorMessage,
            stack: errorStack,
            timestamp: new Date().toISOString(),
          }
        } as any,
      },
    });
    throw error;
  }
}

