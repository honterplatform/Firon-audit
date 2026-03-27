import { NextRequest, NextResponse } from 'next/server';
import { prisma, FindingKind } from '@audit/db';
import { createStorageProvider } from '@audit/pipeline';

// Map database enum values to display strings
function mapKindToDisplay(kind: FindingKind): string {
  switch (kind) {
    case FindingKind.TechnicalSEO: return 'Technical SEO';
    case FindingKind.OnPageSEO: return 'On-Page SEO';
    case FindingKind.Performance: return 'Performance';
    case FindingKind.Links: return 'Links';
    default: return 'Technical SEO';
  }
}

// Normalize kind values from summaryJson
function normalizeKindFromSummary(kind: string): string {
  const k = kind.toLowerCase().trim();
  if (k.includes('technical')) return 'Technical SEO';
  if (k.includes('on-page') || k.includes('onpage')) return 'On-Page SEO';
  if (k.includes('performance') || k.includes('speed') || k.includes('core web')) return 'Performance';
  if (k.includes('link')) return 'Links';
  return 'Technical SEO';
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await context.params;

    const run = await prisma.auditRun.findUnique({
      where: { id: runId },
      include: {
        findings: {
          orderBy: [
            { impact: 'desc' },
            { createdAt: 'asc' },
          ],
        },
        artifacts: {
          select: {
            id: true,
            type: true,
            path: true,
            metaJson: true,
          },
        },
      },
    });

    if (!run) {
      return NextResponse.json(
        { error: 'Audit run not found' },
        { status: 404 }
      );
    }

    const stats = {
      findingsCount: run.findings.length,
      artifactsCount: run.artifacts.length,
      highImpactFindings: run.findings.filter((f) => f.impact === 'High').length,
    };

    const fallbackFindings = run.findings.map((finding) => {
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
      };
    });

    // Normalize summaryJson findings if they exist
    let normalizedSummaryJson = null;
    if (run.summaryJson) {
      const summary = JSON.parse(JSON.stringify(run.summaryJson)) as any;
      if (summary.findings && Array.isArray(summary.findings)) {
        normalizedSummaryJson = {
          ...summary,
          findings: summary.findings.map((f: any) => ({
            ...f,
            kind: normalizeKindFromSummary(f.kind || 'UX/UI'),
          })),
        };
      } else {
        normalizedSummaryJson = summary;
      }
    }

    // Get screenshot URLs and blocked status from artifacts
    const storage = createStorageProvider();
    const screenshotUrls: Record<string, string> = {};
    let blockedStatus: Record<string, boolean> = {};
    try {
      for (const artifact of run.artifacts) {
        if (artifact.type === 'screenshot') {
          if (artifact.metaJson && typeof artifact.metaJson === 'object' && 'viewport' in artifact.metaJson) {
            const viewport = (artifact.metaJson as Record<string, unknown>).viewport as string;
            try {
              screenshotUrls[viewport] = await storage.getSignedUrl(artifact.path, 3600);
            } catch (error) {
              console.error(`Failed to get signed URL for ${artifact.path}:`, error);
              // Continue processing other artifacts even if one fails
            }
          }
        } else if (artifact.type === 'json' && artifact.path === 'blockedStatus') {
          // Extract blocked status
          if (artifact.metaJson && typeof artifact.metaJson === 'object') {
            blockedStatus = artifact.metaJson as Record<string, boolean>;
          }
        }
      }
    } catch (error) {
      console.error('Error processing screenshot URLs:', error);
      // Don't fail the entire request if screenshot URLs fail
    }

    return NextResponse.json({
      id: run.id,
      target: run.target,
      status: run.status,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      summaryJson: normalizedSummaryJson,
      fallbackFindings,
      stats,
      artifacts: run.artifacts.map((a) => ({
        type: a.type,
        path: a.path,
        meta: a.metaJson ? JSON.parse(JSON.stringify(a.metaJson)) : null,
      })),
      screenshotUrls,
      blockedStatus,
    });
  } catch (error) {
    console.error('Error fetching audit:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: errorMessage,
        ...(process.env.NODE_ENV === 'development' && { stack: errorStack })
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await context.params;
    await prisma.auditRun.delete({ where: { id: runId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete audit' }, { status: 500 });
  }
}

