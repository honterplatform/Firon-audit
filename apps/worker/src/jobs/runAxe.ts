import { Job } from 'bullmq';
import { runAxe } from '@audit/plugins';
import { prisma, ArtifactType, FindingKind, FindingImpact, FindingEffort } from '@audit/db';
import { logger } from '@audit/pipeline';
import type { AxeJobData } from '@audit/pipeline';

export async function processAxe(job: Job<AxeJobData>) {
  const { runId, target } = job.data;
  logger.info(`Starting axe for ${target}`, { runId });

  try {
    const result = await runAxe(target, runId);

    // Store artifact
    await prisma.artifact.create({
      data: {
        runId,
        type: ArtifactType.json,
        path: result.reportJson,
        metaJson: {
          violationsCount: result.violations.length,
          contrastIssuesCount: result.contrastIssues.length,
          tapTargetIssuesCount: result.tapTargetIssues.length,
        },
      },
    });

    // Create findings for critical issues
    const findings = [];

    // Contrast issues
    for (const issue of result.contrastIssues.slice(0, 3)) {
      findings.push({
        runId,
        issue: `Low contrast ratio: ${issue.ratio.toFixed(2)}:1`,
        why: `Text with contrast ratio ${issue.ratio.toFixed(2)}:1 fails WCAG AA standards (requires 4.5:1 for normal text).`,
        fix: 'Increase text contrast by using darker text or lighter background. Aim for at least 4.5:1 for normal text, 3:1 for large text.',
        evidenceJson: {
          selector: issue.selector,
          ratio: issue.ratio,
          text: issue.text.substring(0, 100),
          coordinates: issue.coordinates,
        },
        impact: FindingImpact.High as FindingImpact,
        effort: FindingEffort.Small as FindingEffort,
        kind: FindingKind.UXUI as FindingKind,
      });
    }

    // Tap target issues
    if (result.tapTargetIssues.length > 0) {
      findings.push({
        runId,
        issue: `${result.tapTargetIssues.length} tap target(s) too small (<44px)`,
        why: 'Interactive elements smaller than 44x44px are difficult to tap on mobile devices, leading to poor usability.',
        fix: 'Increase tap target size to at least 44x44px. Use padding or min-width/min-height CSS properties.',
        evidenceJson: {
          issues: result.tapTargetIssues.slice(0, 5).map(issue => ({
            selector: issue.selector,
            size: issue.size,
            coordinates: issue.coordinates,
          })),
        },
        impact: FindingImpact.Medium as FindingImpact,
        effort: FindingEffort.Small as FindingEffort,
        kind: FindingKind.UXUI as FindingKind,
      });
    }

    // Critical violations
    for (const violation of result.violations.slice(0, 3)) {
      // Get coordinates from first node if available
      const firstNode = violation.nodes[0];
      const coordinates = firstNode?.coordinates;
      findings.push({
        runId,
        issue: violation.description.substring(0, 140),
        why: `Accessibility violation: ${violation.id}. This affects users with assistive technologies.`,
        fix: 'Fix the accessibility violation following WCAG guidelines. Refer to axe-core documentation for specific remediation steps.',
        evidenceJson: {
          id: violation.id,
          nodes: violation.nodes.slice(0, 2).map(n => ({
            html: n.html,
            target: n.target,
            coordinates: n.coordinates,
          })),
          coordinates, // Store coordinates for easy access
        },
        impact: FindingImpact.High as FindingImpact,
        effort: FindingEffort.Medium as FindingEffort,
        kind: FindingKind.UXUI as FindingKind,
      });
    }

    if (findings.length > 0) {
      await prisma.auditFinding.createMany({ data: findings });
    }

    logger.info(`Axe completed for ${target}`, { runId });
    return result;
  } catch (error) {
    logger.error(`Axe failed for ${target}`, error as Error, { runId });
    throw error;
  }
}

