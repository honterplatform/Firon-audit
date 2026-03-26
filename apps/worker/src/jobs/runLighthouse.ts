import { Job } from 'bullmq';
import { runLighthouse } from '@audit/plugins';
import { prisma, ArtifactType, FindingKind, FindingImpact, FindingEffort } from '@audit/db';
import { logger } from '@audit/pipeline';
import type { LighthouseJobData } from '@audit/pipeline';

export async function processLighthouse(job: Job<LighthouseJobData>) {
  const { runId, target } = job.data;
  logger.info(`Starting Lighthouse for ${target}`, { runId });

  try {
    const result = await runLighthouse(target, runId);

    // Store artifact
    await prisma.artifact.create({
      data: {
        runId,
        type: ArtifactType.json,
        path: result.reportJson,
        metaJson: {
          lcp: result.lcp,
          cls: result.cls,
          inp: result.inp,
          tbt: result.tbt,
          totalBytes: result.totalBytes,
          thirdPartyDomains: result.thirdPartyDomains,
        },
      },
    });

    // Create performance findings for poor metrics
    const findings = [];

    // LCP (Largest Contentful Paint) - target: <2.5s
    if (result.lcp > 2.5) {
      findings.push({
        runId,
        issue: `LCP is slow (${result.lcp.toFixed(2)}s), impacting user experience`,
        why: `LCP of ${result.lcp.toFixed(2)}s exceeds the recommended 2.5s threshold. Slow LCP directly impacts user experience, increases bounce rates, and hurts SEO rankings. Users perceive the page as slow, reducing engagement and conversions.`,
        fix: `Optimize LCP by: 1) Optimize the largest content element (usually an image or text block), 2) Reduce server response time, 3) Eliminate render-blocking resources, 4) Preload key resources, 5) Improve resource load times (use CDN, compress images, optimize fonts).`,
        evidenceJson: { lcp: result.lcp, threshold: 2.5, metric: 'LCP' },
        impact: (result.lcp > 4.0 ? FindingImpact.High : FindingImpact.Medium) as FindingImpact,
        effort: FindingEffort.Medium as FindingEffort,
        kind: FindingKind.MarketingStrategy as FindingKind,
      });
    }

    // CLS (Cumulative Layout Shift) - target: <0.1
    if (result.cls > 0.1) {
      findings.push({
        runId,
        issue: `High layout shift (CLS: ${result.cls.toFixed(3)}), causing visual instability`,
        why: `CLS of ${result.cls.toFixed(3)} exceeds the recommended 0.1 threshold. Layout shifts cause poor user experience, make content hard to read, and can lead to accidental clicks. High CLS increases bounce rates and hurts SEO.`,
        fix: `Reduce CLS by: 1) Set size attributes on images and video elements, 2) Reserve space for ads, embeds, and iframes, 3) Avoid inserting content above existing content (use transform animations instead), 4) Prefer transform animations to position changes, 5) Load web fonts with font-display.`,
        evidenceJson: { cls: result.cls, threshold: 0.1, metric: 'CLS' },
        impact: (result.cls > 0.25 ? FindingImpact.High : FindingImpact.Medium) as FindingImpact,
        effort: FindingEffort.Medium as FindingEffort,
        kind: FindingKind.UXUI as FindingKind,
      });
    }

    // INP (Interaction to Next Paint) - target: <200ms
    if (result.inp > 200) {
      findings.push({
        runId,
        issue: `Slow interactions (INP: ${result.inp.toFixed(0)}ms), affecting responsiveness`,
        why: `INP of ${result.inp.toFixed(0)}ms exceeds the recommended 200ms threshold. Slow interactions make the page feel unresponsive and laggy, reducing user satisfaction and increasing frustration. Poor INP directly impacts user engagement.`,
        fix: `Improve INP by: 1) Reduce JavaScript execution time, 2) Optimize event handlers and callbacks, 3) Break up long tasks, 4) Use web workers for heavy computations, 5) Minimize main thread blocking, 6) Optimize third-party script loading.`,
        evidenceJson: { inp: result.inp, threshold: 200, metric: 'INP' },
        impact: (result.inp > 500 ? FindingImpact.High : FindingImpact.Medium) as FindingImpact,
        effort: FindingEffort.Medium as FindingEffort,
        kind: FindingKind.UXUI as FindingKind,
      });
    }

    // TBT (Total Blocking Time) - target: <200ms
    if (result.tbt > 0.2) {
      findings.push({
        runId,
        issue: `High blocking time (TBT: ${result.tbt.toFixed(2)}s), delaying interactivity`,
        why: `TBT of ${result.tbt.toFixed(2)}s exceeds the recommended 0.2s threshold. High blocking time delays page interactivity, making the page feel unresponsive. This directly impacts user experience and can increase bounce rates.`,
        fix: `Reduce TBT by: 1) Minimize main thread work, 2) Break up long JavaScript tasks, 3) Reduce JavaScript execution time, 4) Optimize third-party scripts, 5) Defer non-critical JavaScript, 6) Use code splitting and lazy loading.`,
        evidenceJson: { tbt: result.tbt, threshold: 0.2, metric: 'TBT' },
        impact: (result.tbt > 0.6 ? FindingImpact.High : FindingImpact.Medium) as FindingImpact,
        effort: FindingEffort.Medium as FindingEffort,
        kind: FindingKind.MarketingStrategy as FindingKind,
      });
    }

    // Total page size - warn if very large
    if (result.totalBytes > 3 * 1024 * 1024) { // >3MB
      findings.push({
        runId,
        issue: `Large page size (${(result.totalBytes / (1024 * 1024)).toFixed(1)}MB), affecting load time`,
        why: `Total page size of ${(result.totalBytes / (1024 * 1024)).toFixed(1)}MB is very large. Large pages take longer to download, especially on slower connections, increasing bounce rates and hurting user experience. This directly impacts conversions and SEO.`,
        fix: `Reduce page size by: 1) Optimize images (compress, use WebP/AVIF, implement lazy loading), 2) Minify and compress JavaScript and CSS, 3) Remove unused code, 4) Use code splitting, 5) Enable Gzip/Brotli compression, 6) Reduce third-party script size.`,
        evidenceJson: { totalBytes: result.totalBytes, totalMB: (result.totalBytes / (1024 * 1024)).toFixed(1) },
        impact: (result.totalBytes > 5 * 1024 * 1024 ? FindingImpact.High : FindingImpact.Medium) as FindingImpact,
        effort: FindingEffort.Medium as FindingEffort,
        kind: FindingKind.MarketingStrategy as FindingKind,
      });
    }

    if (findings.length > 0) {
      await prisma.auditFinding.createMany({ data: findings });
    }

    logger.info(`Lighthouse completed for ${target}`, { runId, findingsCount: findings.length });
    return result;
  } catch (error) {
    logger.error(`Lighthouse failed for ${target}`, error as Error, { runId });
    throw error;
  }
}

