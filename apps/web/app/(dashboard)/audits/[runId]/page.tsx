import { notFound } from 'next/navigation';
import { prisma, FindingKind } from '@audit/db';
import { createStorageProvider } from '@audit/pipeline';
import { AuditRunViewer } from '@/app/components/AuditRunViewer';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Map database enum values to display strings
function mapKindToDisplay(kind: FindingKind): 'Technical SEO' | 'On-Page SEO' | 'Performance' | 'Links' {
  switch (kind) {
    case FindingKind.TechnicalSEO:
      return 'Technical SEO';
    case FindingKind.OnPageSEO:
      return 'On-Page SEO';
    case FindingKind.Performance:
      return 'Performance';
    case FindingKind.Links:
      return 'Links';
    default:
      return 'Performance';
  }
}

// Normalize kind values from summaryJson (handles old enum values)
function normalizeKindFromSummary(kind: string): 'Technical SEO' | 'On-Page SEO' | 'Performance' | 'Links' {
  const kindLower = kind.toLowerCase().trim();
  // Map new Prisma enum values (case-insensitive)
  if (kindLower === 'technicalseo' || kindLower === 'technical seo') {
    return 'Technical SEO';
  }
  if (kindLower === 'onpageseo' || kindLower === 'on-page seo' || kindLower === 'on page seo') {
    return 'On-Page SEO';
  }
  if (kindLower === 'performance' || kindLower === 'perf' || kindLower === 'speed') {
    return 'Performance';
  }
  if (kindLower === 'links' || kindLower === 'link') {
    return 'Links';
  }
  // Map old values to new SEO categories
  if (kindLower === 'marketing strategy' || kindLower === 'marketingstrategy') {
    return 'Technical SEO';
  }
  if (kindLower === 'copywriting' || kindLower === 'copy' || kindLower === 'messaging' || kindLower === 'headline' || kindLower === 'cta') {
    return 'On-Page SEO';
  }
  if (kindLower === 'ux/ui' || kindLower === 'uxui' || kindLower === 'a11y' || kindLower === 'accessibility' || kindLower === 'ux' || kindLower === 'ui' || kindLower === 'usability' || kindLower === 'design' || kindLower === 'visual') {
    return 'Performance';
  }
  // Map Motion and Generalist to Performance as fallback
  if (kindLower === 'motion' || kindLower === 'animation' || kindLower === 'transition' || kindLower === 'generalist' || kindLower === 'general') {
    return 'Performance';
  }
  // Default fallback
  return 'Performance';
}

export default async function AuditDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;

  const run = await prisma.auditRun.findUnique({
    where: { id: runId },
    include: {
      findings: {
        orderBy: [
          { impact: 'desc' },
          { createdAt: 'asc' },
        ],
      },
      artifacts: true,
    },
  });

  if (!run) {
    notFound();
  }

  const storage = createStorageProvider();
  const screenshotUrls: Record<string, string> = {};
  let elementCoordinates: Record<string, { x: number; y: number; width: number; height: number; viewport: string }> = {};
  let blockedStatus: Record<string, boolean> = {};

  for (const artifact of run.artifacts) {
    if (artifact.type === 'screenshot') {
      if (artifact.metaJson && typeof artifact.metaJson === 'object' && 'viewport' in artifact.metaJson) {
        const viewport = (artifact.metaJson as Record<string, unknown>).viewport as string;
        try {
          screenshotUrls[viewport] = await storage.getSignedUrl(artifact.path, 3600);
        } catch (error) {
          console.error(`Failed to get signed URL for ${artifact.path}:`, error);
        }
      }
    } else if (artifact.type === 'json' && artifact.path === 'elementCoordinates') {
      // Extract element coordinates from JSON artifact
      if (artifact.metaJson && typeof artifact.metaJson === 'object') {
        elementCoordinates = artifact.metaJson as Record<string, { x: number; y: number; width: number; height: number; viewport: string }>;
      }
    } else if (artifact.type === 'json' && artifact.path === 'blockedStatus') {
      // Extract blocked status from JSON artifact
      if (artifact.metaJson && typeof artifact.metaJson === 'object') {
        blockedStatus = artifact.metaJson as Record<string, boolean>;
        console.log('Found blocked status artifact:', blockedStatus);
      }
    }
  }

  // Normalize summaryJson findings if they exist
  let normalizedSummaryJson = null;
  if (run.summaryJson) {
    const summary = JSON.parse(JSON.stringify(run.summaryJson)) as any;
    if (summary.findings && Array.isArray(summary.findings)) {
      normalizedSummaryJson = {
        ...summary,
        findings: summary.findings.map((f: any) => ({
          ...f,
          kind: normalizeKindFromSummary(f.kind || 'Performance'),
        })),
      };
    } else {
      normalizedSummaryJson = summary;
    }
  }

  const initialRun = {
    id: run.id,
    target: run.target,
    status: run.status,
    startedAt: run.startedAt ? run.startedAt.toISOString() : null,
    completedAt: run.completedAt ? run.completedAt.toISOString() : null,
    summaryJson: normalizedSummaryJson,
    fallbackFindings: run.findings.map((finding) => {
      const evidenceJson = finding.evidenceJson as unknown;
      let evidenceRefs: string[] = [];

      if (evidenceJson) {
        if (Array.isArray(evidenceJson)) {
          evidenceRefs = evidenceJson.filter((value): value is string => typeof value === 'string');
        } else if (typeof evidenceJson === 'object') {
          // Handle different evidenceJson structures
          const evidence = evidenceJson as Record<string, unknown>;
          
          // LLM findings: { evidenceRefs: string[] }
          if ('evidenceRefs' in evidence && Array.isArray(evidence.evidenceRefs)) {
            evidenceRefs = evidence.evidenceRefs
              .filter((value): value is string => typeof value === 'string')
              .slice(0, 4);
          }
          // Heuristic findings: { evidence: string }
          else if ('evidence' in evidence && typeof evidence.evidence === 'string') {
            evidenceRefs = [evidence.evidence];
          }
          // Axe findings: { selector, ratio, text, id, nodes, etc. }
          else if ('selector' in evidence || 'id' in evidence) {
            // Extract relevant evidence information
            if (evidence.selector && typeof evidence.selector === 'string') {
              evidenceRefs.push(`Selector: ${evidence.selector}`);
            }
            if (evidence.ratio && typeof evidence.ratio === 'number') {
              evidenceRefs.push(`Ratio: ${evidence.ratio.toFixed(2)}:1`);
            }
            if (evidence.text && typeof evidence.text === 'string') {
              evidenceRefs.push(evidence.text.substring(0, 100));
            }
            if (evidence.id && typeof evidence.id === 'string') {
              evidenceRefs.push(`Violation: ${evidence.id}`);
            }
            evidenceRefs = evidenceRefs.slice(0, 4);
          }
          // Legacy format: { refs: string[] }
          else if ('refs' in evidence && Array.isArray(evidence.refs)) {
            evidenceRefs = evidence.refs
              .filter((value): value is string => typeof value === 'string')
              .slice(0, 4);
          }
        }
      }

      return {
        issue: finding.issue,
        why: finding.why,
        fix: finding.fix,
        impact: finding.impact,
        effort: finding.effort,
        kind: mapKindToDisplay(finding.kind),
        evidenceRefs,
        evidenceJson: evidenceJson as any, // Preserve full evidenceJson for coordinates
      };
    }),
    stats: {
      findingsCount: run.findings.length,
      artifactsCount: run.artifacts.length,
      highImpactFindings: run.findings.filter((f) => f.impact === 'High').length,
    },
    artifacts: run.artifacts.map((artifact) => ({
      type: artifact.type,
      path: artifact.path,
      meta: artifact.metaJson ? JSON.parse(JSON.stringify(artifact.metaJson)) : null,
    })),
  };

  return <AuditRunViewer runId={runId} initialRun={initialRun} screenshotUrls={screenshotUrls} elementCoordinates={elementCoordinates} blockedStatus={blockedStatus} />;
}

