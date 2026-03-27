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

const DEMO_HOSTS = ['fironmarketing.com'];

function isDemoTarget(target: string): boolean {
  const host = target.toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '').replace(/^www\./, '');
  return DEMO_HOSTS.includes(host);
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function runDemoAudit(runId: string, target: string) {
  logger.info(`Running demo audit for ${target}`, { runId });

  // Simulate crawl stage
  await prisma.auditRun.update({ where: { id: runId }, data: { status: 'running', startedAt: new Date() } });
  await sleep(3000);

  // Simulate parallel analysis (lighthouse, axe, heuristics)
  await sleep(4000);

  // Simulate summarize
  await sleep(3000);

  const demoFindings = [
    {
      issue: 'Hero section lacks a clear value proposition',
      why: 'Visitors need to understand what Firon offers within 3 seconds. The current hero is visually strong but the headline is too vague to drive conversions.',
      fix: 'Rewrite the hero headline to focus on the specific outcome clients get.',
      impact: 'High' as const,
      effort: 'Small' as const,
      kind: 'OnPageSEO' as const,
    },
    {
      issue: 'No social proof visible above the fold',
      why: 'Trust signals like client logos, testimonials, or case study metrics dramatically increase conversion rates. Without them, visitors bounce before scrolling.',
      fix: 'Add a row of client logos or a short testimonial directly below the hero section.',
      impact: 'High' as const,
      effort: 'Small' as const,
      kind: 'TechnicalSEO' as const,
    },
    {
      issue: 'Mobile navigation is hard to use and hides key pages',
      why: 'Over 60% of traffic comes from mobile devices. The current hamburger menu buries important pages like case studies and pricing, forcing users to dig for critical info.',
      fix: 'Add a sticky bottom navigation bar on mobile with direct links to Services, Case Studies, and Contact.',
      impact: 'Medium' as const,
      effort: 'Small' as const,
      kind: 'Links' as const,
    },
    {
      issue: 'Services section does not connect to client outcomes',
      why: 'Listing services without tying them to results makes Firon look like every other agency. Visitors want to know what they will achieve, not just what you do.',
      fix: 'Reframe each service as a benefit with outcome-focused copy.',
      impact: 'Medium' as const,
      effort: 'Medium' as const,
      kind: 'OnPageSEO' as const,
    },
  ];

  const summaryJson = {
    findings: demoFindings.map(f => ({
      ...f,
      kind: f.kind,
      evidenceRefs: [],
    })),
    plan: {
      quickWins: [
        'Rewrite hero headline with a clear value proposition',
        'Add client logos below the fold',
        'Update CTA button copy and increase contrast',
      ],
      next: [
        'Reframe services as client outcomes',
        'Add case study metrics to build trust',
      ],
      experiments: [{
        hypothesis: 'A specific headline will increase scroll depth by 20%',
        variant: 'Test outcome-focused headline vs current',
        metric: 'Scroll depth and CTA click rate',
      }],
    },
  };

  // Create findings
  for (const f of demoFindings) {
    await prisma.auditFinding.create({ data: { runId, ...f } });
  }

  // Simulate report generation
  await sleep(2000);

  // Mark completed
  await prisma.auditRun.update({
    where: { id: runId },
    data: { status: 'completed', completedAt: new Date(), summaryJson: summaryJson as any },
  });

  logger.info(`Demo audit completed for ${target}`, { runId });
}

export async function processOrchestrator(job: Job<CrawlJobData>) {
  const { runId, target, inputs } = job.data;
  logger.info(`Starting orchestration for ${target}`, { runId });

  try {
    // Demo mode for specific targets
    logger.info(`Checking demo target: "${target}" -> isDemoTarget: ${isDemoTarget(target)}`, { runId });
    if (isDemoTarget(target)) {
      return await runDemoAudit(runId, target);
    }

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

