import { Job } from 'bullmq';
import { runAxe } from '@audit/plugins';
import { prisma, ArtifactType, FindingKind, FindingImpact, FindingEffort } from '@audit/db';
import { logger } from '@audit/pipeline';
import type { AxeJobData } from '@audit/pipeline';

// Only these axe violations are SEO-relevant
const SEO_RELEVANT_VIOLATIONS = new Set([
  'html-has-lang',        // Missing lang attribute
  'html-lang-valid',      // Invalid lang attribute
  'document-title',       // Missing page title
  'image-alt',            // Missing alt text on images
  'link-name',            // Links without discernible text
  'heading-order',        // Heading hierarchy issues
  'meta-viewport',        // Viewport issues (mobile SEO)
  'frame-title',          // Iframes missing title
  'duplicate-id',         // Duplicate IDs (can confuse crawlers)
]);

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

    // Only create findings for SEO-relevant violations
    const findings = [];

    for (const violation of result.violations) {
      if (!SEO_RELEVANT_VIOLATIONS.has(violation.id)) continue;

      const firstNode = violation.nodes[0];
      const coordinates = firstNode?.coordinates;

      // Map to appropriate SEO category
      let kind: FindingKind;
      if (violation.id === 'image-alt') {
        kind = FindingKind.OnPageSEO;
      } else if (violation.id === 'link-name') {
        kind = FindingKind.Links;
      } else if (violation.id === 'heading-order') {
        kind = FindingKind.OnPageSEO;
      } else {
        kind = FindingKind.TechnicalSEO;
      }

      findings.push({
        runId,
        issue: violation.description.substring(0, 140),
        why: `SEO issue: ${violation.id}. This impacts how search engines crawl and index your page.`,
        fix: `Fix this issue to improve search engine visibility. Refer to Google's SEO guidelines for ${violation.id}.`,
        evidenceJson: {
          id: violation.id,
          nodes: violation.nodes.slice(0, 2).map(n => ({
            html: n.html,
            target: n.target,
            coordinates: n.coordinates,
          })),
          coordinates,
        },
        impact: FindingImpact.High as FindingImpact,
        effort: FindingEffort.Small as FindingEffort,
        kind,
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
