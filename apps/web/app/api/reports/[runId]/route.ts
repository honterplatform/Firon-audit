import { NextRequest, NextResponse } from 'next/server';
import { prisma, FindingKind } from '@audit/db';
import { createStorageProvider } from '@audit/pipeline';
import { AuditTable } from '@/app/components/AuditTable';

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
          where: {
            type: 'screenshot',
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

    if (!run.summaryJson) {
      return NextResponse.json(
        { error: 'Audit summary not yet available' },
        { status: 202 }
      );
    }

    const storage = createStorageProvider();
    // Normalize summaryJson findings to ensure kind values use new assignment values
    const rawSummary = run.summaryJson as any;
    const summary = rawSummary && rawSummary.findings && Array.isArray(rawSummary.findings)
      ? {
          ...rawSummary,
          findings: rawSummary.findings.map((f: any) => ({
            ...f,
            kind: normalizeKindFromSummary(f.kind || 'UX/UI'),
          })),
        }
      : rawSummary;

    // Get screenshot URLs — prefer inline data URLs from StoredFile so the PDF
    // renders correctly when the HTML is captured by a headless browser that
    // can't reach /api/storage paths on a relative basis.
    const screenshotUrls: Record<string, string> = {};
    for (const artifact of run.artifacts) {
      if (artifact.metaJson && typeof artifact.metaJson === 'object' && 'viewport' in artifact.metaJson) {
        const viewport = artifact.metaJson.viewport as string;
        const stored = await prisma.storedFile.findUnique({ where: { key: artifact.path } }).catch(() => null);
        if (stored) {
          screenshotUrls[viewport] = `data:${stored.contentType};base64,${stored.data}`;
        } else {
          try {
            screenshotUrls[viewport] = await storage.getSignedUrl(artifact.path, 3600);
          } catch (error) {
            console.error(`Failed to get signed URL for ${artifact.path}:`, error);
          }
        }
      }
    }

    const cleanTarget = run.target.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const completedDate = run.completedAt ? new Date(run.completedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'N/A';

    const impactColor = (impact: string) => {
      if (impact === 'High') return 'background:#3B1111;color:#FF6B6B;';
      if (impact === 'Medium') return 'background:#3B2E11;color:#FBBF24;';
      return 'background:#113B1E;color:#4ADE80;';
    };

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>SEO Audit Report - ${cleanTarget}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; background:#0A0A0A; color:#E0E0E0; padding:40px; }
    .container { max-width:800px; margin:0 auto; }
    .header { text-align:center; margin-bottom:48px; padding-bottom:32px; border-bottom:1px solid #212121; }
    .logo { font-size:24px; font-weight:700; color:#fff; letter-spacing:2px; margin-bottom:8px; }
    .title { font-size:32px; font-weight:300; color:#fff; margin-bottom:8px; }
    .subtitle { font-size:14px; color:#888; }
    .meta { display:flex; justify-content:space-between; margin-bottom:40px; padding:20px; background:#0F0F0F; border:1px solid #212121; border-radius:12px; }
    .meta-item { text-align:center; }
    .meta-label { font-size:11px; color:#666; text-transform:uppercase; letter-spacing:0.1em; margin-bottom:4px; }
    .meta-value { font-size:24px; font-weight:300; color:#FB3B24; }
    .meta-value-white { font-size:24px; font-weight:300; color:#fff; }
    .section-title { font-size:24px; font-weight:300; color:#fff; margin-bottom:24px; margin-top:48px; }
    .finding { background:#0F0F0F; border:1px solid #212121; border-radius:12px; padding:20px; margin-bottom:16px; }
    .finding-header { display:flex; gap:8px; margin-bottom:12px; }
    .badge { display:inline-block; padding:2px 10px; border-radius:999px; font-size:10px; text-transform:uppercase; letter-spacing:0.05em; }
    .finding-title { font-size:16px; font-weight:500; color:#F5F5F5; margin-bottom:8px; }
    .finding-why-label { font-size:10px; color:#888; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px; }
    .finding-why { font-size:13px; color:#CCC; line-height:1.6; margin-bottom:12px; }
    .finding-fix-label { font-size:10px; color:#888; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px; }
    .finding-fix { font-size:13px; color:#CCC; line-height:1.6; }
    .phase { background:#0F0F0F; border:1px solid #212121; border-radius:12px; padding:20px; margin-bottom:16px; }
    .phase-badge { display:inline-block; padding:3px 10px; border-radius:999px; font-size:11px; font-weight:500; margin-bottom:8px; }
    .phase-title { font-size:18px; font-weight:500; color:#fff; margin-bottom:12px; }
    .phase-item { font-size:13px; color:#CCC; line-height:1.6; padding:4px 0; }
    .phase-arrow { color:#FB3B24; margin-right:8px; }
    .footer { text-align:center; margin-top:48px; padding-top:32px; border-top:1px solid #212121; }
    .footer-text { font-size:12px; color:#666; }
    .cta { display:inline-block; padding:12px 24px; background:#FB3B24; color:#fff; text-decoration:none; border-radius:999px; font-size:14px; margin-top:16px; }
    .screenshot-wrap { margin-bottom:40px; border:1px solid #212121; border-radius:12px; overflow:hidden; background:#0F0F0F; }
    .screenshot-wrap img { display:block; width:100%; height:auto; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="${process.env.APP_BASE_URL || 'https://audit.fironmarketing.com'}/Logo.svg" alt="Firon" style="height:32px;margin:0 auto 8px auto;display:block;" />
      <div class="title">AI Readiness Report</div>
      <div class="subtitle">${cleanTarget} &mdash; ${completedDate}</div>
    </div>

    ${screenshotUrls.desktop ? `
    <div class="screenshot-wrap">
      <img src="${screenshotUrls.desktop}" alt="${cleanTarget} homepage screenshot" />
    </div>` : ''}

    <div class="meta">
      <div class="meta-item">
        <div class="meta-label">Total Findings</div>
        <div class="meta-value-white">${summary.findings.length}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">High Impact</div>
        <div class="meta-value">${summary.findings.filter((f: any) => f.impact === 'High').length}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Categories</div>
        <div class="meta-value-white">${new Set(summary.findings.map((f: any) => f.kind)).size}</div>
      </div>
    </div>

    <div class="section-title">Findings</div>
    ${summary.findings.map((f: any) => `
      <div class="finding">
        <div class="finding-header">
          <span class="badge" style="${impactColor(f.impact)}">${f.impact} Impact</span>
          <span class="badge" style="background:#1A1A1A;color:#888;">${f.effort} Effort</span>
          <span class="badge" style="background:#1A1A1A;color:#888;">${f.kind}</span>
        </div>
        <div class="finding-title">${escapeHtml(f.issue)}</div>
        <div class="finding-why-label">Why This Matters</div>
        <div class="finding-why">${escapeHtml(f.why)}</div>
        <div class="finding-fix-label">How to Fix</div>
        <div class="finding-fix">${escapeHtml(f.fix)}</div>
      </div>
    `).join('')}

    ${summary.plan ? `
    <div class="section-title">Action Plan</div>
    ${summary.plan.quickWins?.length > 0 ? `
    <div class="phase">
      <span class="phase-badge" style="background:rgba(251,59,36,0.15);color:#FB3B24;">Phase 1</span>
      <div class="phase-title">Infrastructure Sprint</div>
      ${summary.plan.quickWins.map((item: string) => `<div class="phase-item"><span class="phase-arrow">&rarr;</span>${escapeHtml(item)}</div>`).join('')}
    </div>` : ''}
    ${summary.plan.next?.length > 0 ? `
    <div class="phase">
      <span class="phase-badge" style="background:rgba(251,191,36,0.15);color:#FBBF24;">Phase 2</span>
      <div class="phase-title">AEO &amp; GEO</div>
      ${summary.plan.next.map((item: string) => `<div class="phase-item"><span class="phase-arrow" style="color:#FBBF24;">&rarr;</span>${escapeHtml(item)}</div>`).join('')}
    </div>` : ''}
    ${(summary.plan.scaleAuthority?.length > 0) ? `
    <div class="phase">
      <span class="phase-badge" style="background:rgba(74,222,128,0.15);color:#4ADE80;">Phase 3</span>
      <div class="phase-title">Scale &amp; Authority</div>
      ${summary.plan.scaleAuthority.map((item: string) => `<div class="phase-item"><span class="phase-arrow" style="color:#4ADE80;">&rarr;</span>${escapeHtml(item)}</div>`).join('')}
    </div>` : ''}
    ` : ''}

    <div class="footer">
      <div class="footer-text">This report was generated by Firon Marketing&apos;s AI Audit Platform.</div>
      <div class="footer-text" style="margin-top:8px;">hello@fironmarketing.com</div>
    </div>
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
      },
    });
  } catch (error) {
    console.error('Error generating report:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

function getImpactColor(impact: string): string {
  switch (impact) {
    case 'High':
      return 'bg-red-100 text-red-800';
    case 'Medium':
      return 'bg-yellow-100 text-yellow-800';
    case 'Low':
      return 'bg-green-100 text-green-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

