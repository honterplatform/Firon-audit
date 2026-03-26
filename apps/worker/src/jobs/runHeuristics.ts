import { Job } from 'bullmq';
import { runHeuristics } from '@audit/plugins';
import { prisma, FindingKind, FindingImpact, FindingEffort } from '@audit/db';
import { logger } from '@audit/pipeline';
import type { HeuristicsJobData } from '@audit/pipeline';

export async function processHeuristics(job: Job<HeuristicsJobData>) {
  const { runId, target, crawlResult } = job.data;
  logger.info(`Starting heuristics for ${target}`, { runId });

  try {
    const result = await runHeuristics(target, crawlResult);

    // Create findings
    const findings = result.findings.map((f) => ({
      runId,
      issue: f.issue,
      why: f.why,
      fix: f.fix,
      evidenceJson: f.evidence ? { evidence: f.evidence } : undefined,
      impact: FindingImpact.Medium as FindingImpact,
      effort: FindingEffort.Small as FindingEffort,
      kind: FindingKind.UXUI as FindingKind,
    }));

    if (findings.length > 0) {
      await prisma.auditFinding.createMany({ data: findings });
    }

    logger.info(`Heuristics completed for ${target}`, { runId, findingsCount: findings.length });
    return result;
  } catch (error) {
    logger.error(`Heuristics failed for ${target}`, error as Error, { runId });
    throw error;
  }
}

