import { Job } from 'bullmq';
import { summarizeAudit } from '@audit/llm';
import { prisma, FindingKind, FindingImpact, FindingEffort } from '@audit/db';
import { logger } from '@audit/pipeline';
import type { SummarizeJobData, LighthouseResult, AxeResult, HeuristicsResult, CrawlResult } from '@audit/pipeline';

// Map schema kind values to database enum values
function mapKindToDbEnum(kind: string): FindingKind {
  switch (kind) {
    case 'Marketing Strategy':
      return FindingKind.MarketingStrategy;
    case 'Copywriting':
      return FindingKind.Copywriting;
    case 'UX/UI':
      return FindingKind.UXUI;
    // Map Motion and Generalist to UXUI
    case 'Motion':
    case 'Generalist':
      return FindingKind.UXUI;
    default:
      return FindingKind.UXUI;
  }
}

export async function processSummarize(job: Job<SummarizeJobData>) {
  const { runId, target, inputs, perfResult, a11yResult, heuristicsResult, crawlResult } = job.data;
  logger.info(`Starting summarization for ${target}`, { runId });

  try {
    const emptyPerf: LighthouseResult = perfResult ?? {
      lcp: 0,
      cls: 0,
      inp: 0,
      tbt: 0,
      totalBytes: 0,
      thirdPartyDomains: [],
      reportJson: '',
    };

    const emptyA11y: AxeResult = a11yResult ?? {
      violations: [],
      contrastIssues: [],
      tapTargetIssues: [],
      reportJson: '',
    };

    const emptyHeuristics: HeuristicsResult = heuristicsResult ?? {
      findings: [],
    };

    const summary = await summarizeAudit({
      perf: emptyPerf,
      a11y: emptyA11y,
      heuristics: emptyHeuristics,
      goal: inputs.goal,
      audience: inputs.audience,
      primaryCta: inputs.primaryCta,
      crawl: {
        heroHeadline: crawlResult?.content?.heroHeadline,
        heroSubheadline: crawlResult?.content?.heroSubheadline,
        primaryCtaText: crawlResult?.content?.primaryCtaText,
        secondaryCtas: crawlResult?.content?.secondaryCtas ?? [],
        sectionHeadings: crawlResult?.content?.sectionHeadings ?? [],
        navItems: crawlResult?.content?.navItems ?? [],
        testimonials: crawlResult?.content?.testimonials ?? [],
        trustSignals: crawlResult?.content?.trustSignals ?? [],
        heroParagraphs: crawlResult?.content?.heroParagraphs ?? [],
        bulletPoints: crawlResult?.content?.bulletPoints ?? [],
        pricingSignals: crawlResult?.content?.pricingSignals ?? [],
        heroCtaViewportOffset: crawlResult?.content?.heroCtaViewportOffset,
        hasMotion: crawlResult?.content?.hasMotion ?? false,
        hasVideo: crawlResult?.content?.hasVideo ?? false,
        hasForm: crawlResult?.content?.hasForm ?? false,
        motionSelectors: crawlResult?.content?.motionSelectors ?? [],
        typography: crawlResult?.content?.typography,
        images: crawlResult?.content?.images,
      },
      availability: {
        perf: Boolean(perfResult),
        a11y: Boolean(a11yResult),
        heuristics: Boolean(heuristicsResult),
      },
    });

    // Store summary
    await prisma.auditRun.update({
      where: { id: runId },
      data: { summaryJson: summary },
    });

    // Map LLM findings to database (merge with existing heuristic findings)
    // Try to match findings to element coordinates from crawl
    const elementCoordinates: CrawlResult['elementCoordinates'] = crawlResult?.elementCoordinates || {};
    
    const llmFindings = summary.findings
      .map((f) => {
        // Try to find coordinates from evidenceRefs (selectors)
        let coordinates: any = undefined;
        for (const ref of f.evidenceRefs || []) {
          if (ref.includes('Selector:')) {
            const selector = ref.replace('Selector:', '').trim();
            // Try exact match first
            if (elementCoordinates[selector]) {
              coordinates = elementCoordinates[selector];
              break;
            }
            // Try partial match (e.g., "h1" matches "h1#id.class")
            for (const [key, coord] of Object.entries(elementCoordinates)) {
              if (key.includes(selector) || selector.includes(key.split('#')[0].split('.')[0])) {
                coordinates = coord;
                break;
              }
            }
          }
        }
        
        // Also check issue text for common selectors
        if (!coordinates) {
          const issueLower = f.issue.toLowerCase();
          if (issueLower.includes('h1') || issueLower.includes('headline')) {
            for (const [key, coord] of Object.entries(elementCoordinates)) {
              if (key.includes('h1')) {
                coordinates = coord;
                break;
              }
            }
          } else if (issueLower.includes('cta') || issueLower.includes('button')) {
            for (const [key, coord] of Object.entries(elementCoordinates)) {
              if (key.includes('button') || key.includes('btn')) {
                coordinates = coord;
                break;
              }
            }
          }
        }
        
        // Ensure kind is always defined - fallback to UXUI if missing or invalid
        const kindValue = f.kind && typeof f.kind === 'string' ? f.kind.trim() : 'UX/UI';
        
        return {
          runId,
          issue: f.issue,
          why: f.why,
          fix: f.fix,
          evidenceJson: {
            evidenceRefs: f.evidenceRefs,
            coordinates, // Store coordinates for pin placement
          },
          impact: f.impact as FindingImpact,
          effort: f.effort as FindingEffort,
          kind: mapKindToDbEnum(kindValue),
        };
      })
      .filter((f) => {
        // Final safety check - ensure all required fields are present
        return f.issue && f.why && f.fix && f.kind;
      });

    if (llmFindings.length > 0) {
      await prisma.auditFinding.createMany({ data: llmFindings });
    }

    logger.info(`Summarization completed for ${target}`, { runId });
    return summary;
  } catch (error) {
    logger.error(`Summarization failed for ${target}`, error as Error, { runId });
    throw error;
  }
}

