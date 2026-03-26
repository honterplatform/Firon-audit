import { NextRequest, NextResponse } from 'next/server';
import { prisma, FindingKind } from '@audit/db';
import { createStorageProvider } from '@audit/pipeline';
import { AuditTable } from '@/app/components/AuditTable';

// Map database enum values to display strings
function mapKindToDisplay(kind: FindingKind): string {
  switch (kind) {
    case FindingKind.MarketingStrategy:
      return 'Marketing Strategy';
    case FindingKind.Copywriting:
      return 'Copywriting';
    case FindingKind.UXUI:
      return 'UX/UI';
    default:
      return 'UX/UI';
  }
}

// Normalize kind values from summaryJson (handles old enum values)
function normalizeKindFromSummary(kind: string): string {
  const kindLower = kind.toLowerCase().trim();
  // Map old enum values to new assignment values
  if (kindLower === 'performance' || kindLower === 'perf' || kindLower === 'speed') {
    return 'Marketing Strategy';
  }
  if (kindLower === 'a11y' || kindLower === 'accessibility' || kindLower === 'ux' || kindLower === 'ui' || kindLower === 'usability' || kindLower === 'design' || kindLower === 'visual') {
    return 'UX/UI';
  }
  if (kindLower === 'copy' || kindLower === 'messaging' || kindLower === 'headline' || kindLower === 'cta') {
    return 'Copywriting';
  }
  // Check for new values (case-insensitive)
  if (kindLower === 'marketing strategy' || kindLower === 'marketingstrategy') {
    return 'Marketing Strategy';
  }
  if (kindLower === 'copywriting') {
    return 'Copywriting';
  }
  if (kindLower === 'ux/ui' || kindLower === 'uxui') {
    return 'UX/UI';
  }
  // Map Motion and Generalist to UX/UI as fallback
  if (kindLower === 'motion' || kindLower === 'animation' || kindLower === 'transition' || kindLower === 'generalist' || kindLower === 'general') {
    return 'UX/UI';
  }
  // Default fallback
  return 'UX/UI';
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

    // Get signed URLs for screenshots
    const screenshotUrls: Record<string, string> = {};
    for (const artifact of run.artifacts) {
      if (artifact.metaJson && typeof artifact.metaJson === 'object' && 'viewport' in artifact.metaJson) {
        const viewport = artifact.metaJson.viewport as string;
        try {
          screenshotUrls[viewport] = await storage.getSignedUrl(artifact.path, 3600);
        } catch (error) {
          console.error(`Failed to get signed URL for ${artifact.path}:`, error);
        }
      }
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Audit Report - ${run.target}</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50 p-8">
  <div class="max-w-7xl mx-auto bg-white shadow-lg rounded-lg p-8">
    <h1 class="text-3xl font-bold mb-4">UX/UI Audit Report</h1>
    <div class="mb-6">
      <p class="text-gray-600"><strong>Target:</strong> ${run.target}</p>
      <p class="text-gray-600"><strong>Status:</strong> ${run.status}</p>
      <p class="text-gray-600"><strong>Completed:</strong> ${run.completedAt ? new Date(run.completedAt).toLocaleString() : 'N/A'}</p>
    </div>

    ${Object.keys(screenshotUrls).length > 0 ? `
    <div class="mb-8">
      <h2 class="text-2xl font-semibold mb-4">Screenshots</h2>
      <div class="grid grid-cols-2 gap-4">
        ${Object.entries(screenshotUrls).map(([viewport, url]) => `
          <div>
            <h3 class="font-medium mb-2 capitalize">${viewport}</h3>
            <img src="${url}" alt="${viewport} screenshot" class="border rounded-lg shadow-md max-w-full" />
          </div>
        `).join('')}
      </div>
    </div>
    ` : ''}

    <div class="mb-8">
      <h2 class="text-2xl font-semibold mb-4">Findings</h2>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Issue</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Why</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fix</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Impact</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Effort</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assign To</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            ${summary.findings.map((f: any) => `
              <tr>
                <td class="px-6 py-4 text-sm font-medium text-gray-900">${escapeHtml(f.issue)}</td>
                <td class="px-6 py-4 text-sm text-gray-500 max-w-md">${escapeHtml(f.why)}</td>
                <td class="px-6 py-4 text-sm text-gray-500 max-w-md">${escapeHtml(f.fix)}</td>
                <td class="px-6 py-4 text-sm">
                  <span class="px-2 py-1 text-xs rounded-full ${getImpactColor(f.impact)}">${f.impact}</span>
                </td>
                <td class="px-6 py-4 text-sm text-gray-500">${f.effort}</td>
                <td class="px-6 py-4 text-sm text-gray-500">${f.kind || 'UX/UI'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
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

