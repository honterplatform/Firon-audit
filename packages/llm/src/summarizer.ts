import { createAnthropicClient } from './openai';
import { logger } from '@audit/pipeline';
import { AuditSummary, AuditSummaryType } from './schemas';

// Define types locally to avoid circular dependency during build
interface LighthouseResult {
  lcp: number;
  cls: number;
  inp: number;
  tbt: number;
  totalBytes: number;
  thirdPartyDomains: string[];
  reportJson: string;
}

interface AxeResult {
  violations: Array<{
    id: string;
    description: string;
    nodes: Array<{
      html: string;
      target: string[];
    }>;
  }>;
  contrastIssues: Array<{
    selector: string;
    ratio: number;
    text: string;
  }>;
  tapTargetIssues: Array<{
    selector: string;
    size: number;
  }>;
  reportJson: string;
}

interface HeuristicsResult {
  findings: Array<{
    issue: string;
    why: string;
    fix: string;
    evidence?: string;
  }>;
}

interface CrawlContent {
  heroHeadline?: string;
  heroSubheadline?: string;
  primaryCtaText?: string;
  secondaryCtas: string[];
  sectionHeadings: string[];
  navItems: string[];
  testimonials: string[];
  trustSignals: string[];
  heroParagraphs: string[];
  bulletPoints: string[];
  pricingSignals: string[];
  heroCtaViewportOffset?: number;
  hasMotion: boolean;
  hasVideo: boolean;
  hasForm: boolean;
  motionSelectors: string[];
  typography?: {
    h1?: {
      fontFamily: string;
      fontSize: number;
      fontWeight: string;
      lineHeight: string;
      letterSpacing: string;
    };
    h2?: {
      fontFamily: string;
      fontSize: number;
      fontWeight: string;
      lineHeight: string;
      letterSpacing: string;
    };
    body?: {
      fontFamily: string;
      fontSize: number;
      fontWeight: string;
      lineHeight: string;
      letterSpacing: string;
    };
    firstParagraph?: {
      fontFamily: string;
      fontSize: number;
      fontWeight: string;
      lineHeight: string;
      letterSpacing: string;
    };
    headingHierarchy: Array<{
      level: number;
      fontSize: number;
      fontWeight: string;
      count: number;
    }>;
  };
  images?: {
    aboveFold: Array<{
      url: string;
      naturalWidth: number;
      naturalHeight: number;
      displayedWidth: number;
      displayedHeight: number;
      fileSize: number;
      format: string;
      hasLazyLoading: boolean;
      hasSrcset: boolean;
      isLcpCandidate: boolean;
    }>;
    belowFold: Array<{
      url: string;
      naturalWidth: number;
      naturalHeight: number;
      displayedWidth: number;
      displayedHeight: number;
      fileSize: number;
      format: string;
      hasLazyLoading: boolean;
      hasSrcset: boolean;
    }>;
    totalImages: number;
    totalImageSize: number;
    lcpImage?: {
      url: string;
      fileSize: number;
      format: string;
      naturalWidth: number;
      naturalHeight: number;
      displayedWidth: number;
      displayedHeight: number;
    };
  };
}

export interface SummarizeInput {
  perf: LighthouseResult;
  a11y: AxeResult;
  heuristics: HeuristicsResult;
  goal: string;
  audience: string;
  primaryCta: string;
  crawl: CrawlContent;
  availability: {
    perf: boolean;
    a11y: boolean;
    heuristics: boolean;
  };
}

export async function summarizeAudit(input: SummarizeInput): Promise<AuditSummaryType> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const isPlaceholderKey =
    !apiKey ||
    apiKey.trim().length === 0 ||
    apiKey.includes('your-key');

  if (isPlaceholderKey) {
    const error = new Error('ANTHROPIC_API_KEY missing or placeholder; cannot produce authenticated summary');
    logger.error('OPENAI summarization unavailable', error);
    throw error;
  }

  logger.info('Starting OpenAI summarization', {
    availability: input.availability,
    findingsCounts: {
      perfViolations: input.perf?.thirdPartyDomains?.length ?? 0,
      a11yViolations: input.a11y?.violations?.length ?? 0,
      heuristicFindings: input.heuristics?.findings?.length ?? 0,
    },
  });

  const client = createAnthropicClient();

  const formatList = (items: string[], fallback: string) =>
    items && items.length > 0 ? items.join('; ') : fallback;

  const truncate = (value?: string, max = 140) =>
    value ? (value.length > max ? `${value.slice(0, max)}…` : value) : undefined;

  const compact = <T>(values: Array<T | undefined | null>) =>
    values.filter((value): value is T => value !== undefined && value !== null && value !== '');

  const heroSnapshotLines = [
    `Headline: ${truncate(input.crawl.heroHeadline) ?? 'Not detected'}`,
    `Subheadline: ${truncate(input.crawl.heroSubheadline) ?? 'Not detected'}`,
    `Primary CTA: ${truncate(input.crawl.primaryCtaText ?? input.primaryCta) ?? 'Not detected'}`,
    `Secondary CTAs: ${formatList(
      compact((input.crawl.secondaryCtas ?? []).map((cta) => truncate(cta, 80))),
      'None detected'
    )}`,
    `Section headings: ${formatList(
      compact((input.crawl.sectionHeadings ?? []).map((heading) => truncate(heading, 80))),
      'None detected'
    )}`,
    `Navigation items: ${formatList(
      compact((input.crawl.navItems ?? []).map((item) => truncate(item, 60))),
      'Not captured'
    )}`,
    `Testimonials: ${formatList(
      compact((input.crawl.testimonials ?? []).map((testimonial) => truncate(testimonial, 100))),
      'None detected'
    )}`,
    `Trust signals: ${formatList(
      compact((input.crawl.trustSignals ?? []).map((signal) => truncate(signal, 80))),
      'None detected'
    )}`,
    `Hero copy: ${formatList(compact((input.crawl.heroParagraphs ?? []).map((p) => truncate(p, 120))), 'Not captured')}`,
    `Bullet points: ${formatList(compact((input.crawl.bulletPoints ?? []).map((point) => truncate(point, 100))), 'None detected')}`,
    `Pricing cues: ${formatList(compact((input.crawl.pricingSignals ?? []).map((signal) => truncate(signal, 80))), 'Not captured')}`,
    `CTA viewport offset: ${
      typeof input.crawl.heroCtaViewportOffset === 'number'
        ? `${Math.round(input.crawl.heroCtaViewportOffset)}px`
        : 'Unknown'
    }`,
    `Motion detected: ${input.crawl.hasMotion ? 'yes' : 'no'}`,
    `Video present: ${input.crawl.hasVideo ? 'yes' : 'no'}`,
    `Lead form present: ${input.crawl.hasForm ? 'yes' : 'no'}`,
  ];

  // Typography analysis
  const typographyLines: string[] = [];
  if (input.crawl.typography) {
    const typo = input.crawl.typography;
    if (typo.h1) {
      typographyLines.push(`H1: ${typo.h1.fontSize.toFixed(1)}px, ${typo.h1.fontWeight}, ${typo.h1.fontFamily}`);
    }
    if (typo.h2) {
      typographyLines.push(`H2: ${typo.h2.fontSize.toFixed(1)}px, ${typo.h2.fontWeight}, ${typo.h2.fontFamily}`);
    }
    if (typo.body) {
      const lineHeightRatio = typo.body.lineHeight !== 'normal' && parseFloat(typo.body.lineHeight) > 0
        ? (parseFloat(typo.body.lineHeight) / typo.body.fontSize).toFixed(2)
        : 'normal';
      typographyLines.push(`Body: ${typo.body.fontSize.toFixed(1)}px, line-height: ${lineHeightRatio}x, ${typo.body.fontFamily}`);
    }
    if (typo.headingHierarchy && typo.headingHierarchy.length > 0) {
      const hierarchyStr = typo.headingHierarchy
        .map(h => `H${h.level}: ${h.fontSize.toFixed(1)}px (${h.count} found)`)
        .join(', ');
      typographyLines.push(`Heading hierarchy: ${hierarchyStr}`);
    }
  }
  if (typographyLines.length > 0) {
    heroSnapshotLines.push(`Typography: ${typographyLines.join(' | ')}`);
  }

  const heroSnapshot = heroSnapshotLines.map((line) => `- ${line}`).join('\n');

  const heuristicSummary =
    input.heuristics.findings.length > 0
      ? input.heuristics.findings
          .slice(0, 8)
          .map(
            (finding, index) =>
              `${index + 1}. ${truncate(finding.issue, 100)} — ${truncate(
                finding.why,
                150
              )}${finding.evidence ? ` (Evidence: ${truncate(finding.evidence, 120)})` : ''}`
          )
          .join('\n')
      : 'None detected.';

  const accessibilityViolations =
    input.a11y.violations.length > 0
      ? input.a11y.violations
          .slice(0, 8)
          .map(
            (violation, index) =>
              `${index + 1}. ${violation.id} — ${truncate(violation.description, 160)}`
          )
          .join('\n')
      : 'No axe violations captured.';

  const contrastSummary =
    input.a11y.contrastIssues.length > 0
      ? input.a11y.contrastIssues
          .slice(0, 5)
          .map(
            (issue, index) =>
              `${index + 1}. ${issue.selector} ratio ${issue.ratio.toFixed(2)}:1 (${truncate(
                issue.text,
                80
              )})`
          )
          .join('\n')
      : 'No contrast issues captured.';

  const tapTargetSummary =
    input.a11y.tapTargetIssues.length > 0
      ? `${input.a11y.tapTargetIssues.length} tap target issues detected.`
      : 'No tap target issues captured.';

  const systemPrompt = `You are Firon Marketing's SEO Audit Agent. You don't just list technical errors — you translate them into high-stakes business liabilities and pitch Firon's specific solutions.

CATEGORIES — assign each finding to EXACTLY one of these:
🔧 "Technical SEO" — Crawlability, indexability, redirects, sitemaps, HTTPS, structured data, robots.txt, canonical tags
🔍 "On-Page SEO" — Title tags, meta descriptions, headings (H1/H2), alt text, content quality, keyword usage, duplicate content
⚡ "Performance" — Core Web Vitals (LCP, CLS, INP, TBT), page speed, image optimization, render-blocking resources
🔗 "Links" — Broken links, redirect chains, internal linking, orphan pages, anchor text

FIRON LIABILITY FRAMEWORKS — use these named frameworks in your "issue" and "why" fields when the data matches:
- "The Identity Void" — missing H1s or meta descriptions on key pages. The homepage is a blank slate to crawlers.
- "The Empty Aisle" — empty metadata on product/service/collection pages. AI robots see empty shelves and send customers to competitors.
- "Identity Collision" — conflicting data signals (multiple H1s, mismatched canonical, inconsistent schema). AI defaults to competitors.
- "Hallucination Risk" — missing FAQ schema or structured attributes. AI has to guess your specs and may feed customers wrong info.
- "The Review Vacuum" — good reputation but not hard-coded into schema. AI skips you for "best" and "most reliable" queries.
- "Sitemap Decay" — 404s and redirects in sitemap. Tells Google the site is poorly maintained, causing crawl budget penalties.
- "The Invisibility Tax" — use this in "why" to frame the cumulative revenue cost. Every day these issues exist, you're paying an invisible tax in lost traffic and wasted ad spend.

FIRON SOLUTION FRAMEWORKS — reference these in your "fix" field:
- "Velocity Engine" — Firon's automated bulk metadata and schema fix across entire catalogs. Turns the lights on overnight.
- "Structured Attribute Model" — machine-readable product/service data that AI requires to confidently recommend you.
- "Answer-First" content — 40-60 word direct-answer paragraphs AI can extract and cite in AI Overviews.
- "The Cluster Bomb" — 50+ interlinked content pieces to saturate the Knowledge Graph and force AI to recognize you as the Source of Truth.

PLAN STRUCTURE — the plan MUST follow Firon's three-phase methodology:
- quickWins = "Phase 1: Infrastructure Sprint" items — fix the technical foundation (metadata, schema, sitemap cleanup). Use Velocity Engine framing.
- next = "Phase 2: AEO & GEO" items — structured data overhaul, AI-optimized content, trust engineering, Answer-First content.
- scaleAuthority = "Phase 3: Scale & Authority" items — content cluster strategy (Cluster Bomb), AI advertising, authority amplification, Knowledge Graph saturation. ALWAYS include 2-3 items here.

TONE:
- Frame every finding as a BUSINESS LIABILITY, not just a technical error
- Connect every issue to lost revenue and competitive disadvantage
- Make the reader feel urgency — "every day this isn't fixed, you're paying the Invisibility Tax"
- Position Firon as the solution, not generic advice

RULES:
- Maximum 8 findings. Issue ≤140 chars, Why ≤400, Fix ≤280.
- Distribute across at least 3 categories. Max 3 per category.
- Use EXACTLY these kind values: "Technical SEO", "On-Page SEO", "Performance", "Links"
- Every finding must be grounded in the provided data. Never fabricate issues.
- Respond with JSON only, no markdown or prose.`;

  const userPrompt = `SEO Audit Data for: ${input.goal}

📸 PAGE CONTENT:
${heroSnapshot}

Heading hierarchy: ${input.crawl.typography?.headingHierarchy?.map(h => `H${h.level}: ${h.count} found`).join(', ') || 'Not detected'}
Navigation items: ${input.crawl.navItems.length > 0 ? input.crawl.navItems.join(', ') : 'None detected'}
Section headings: ${input.crawl.sectionHeadings.length > 0 ? input.crawl.sectionHeadings.slice(0, 8).join(' → ') : 'None detected'}
Images missing alt text: check accessibility violations below

⚡ CORE WEB VITALS:
- Available: ${input.availability.perf ? 'yes' : 'no'}
- LCP: ${input.perf.lcp.toFixed(2)}s (target: <2.5s) ${input.perf.lcp > 2.5 ? '⚠️ SLOW — hurts SEO rankings' : '✅ Good'}
- CLS: ${input.perf.cls.toFixed(3)} (target: <0.1) ${input.perf.cls > 0.1 ? '⚠️ HIGH — hurts SEO rankings' : '✅ Stable'}
- INP: ${input.perf.inp.toFixed(2)}ms (target: <200ms) ${input.perf.inp > 200 ? '⚠️ SLOW' : '✅ Responsive'}
- TBT: ${input.perf.tbt.toFixed(2)}s (target: <0.2s) ${input.perf.tbt > 0.2 ? '⚠️ BLOCKING' : '✅ Good'}
- Total page size: ${(input.perf.totalBytes / 1024 / 1024).toFixed(2)}MB ${input.perf.totalBytes > 2 * 1024 * 1024 ? '⚠️ LARGE' : '✅ OK'}
- Third-party domains: ${input.perf.thirdPartyDomains.length > 0 ? input.perf.thirdPartyDomains.join(', ') : 'None'}

♿ ACCESSIBILITY / TECHNICAL ISSUES:
- Violations (${input.a11y.violations.length}):
${accessibilityViolations}
- Contrast issues: ${contrastSummary}

🔍 HEURISTIC FINDINGS (${input.heuristics.findings.length}):
${heuristicSummary}

🖼️ IMAGES:
${input.crawl.images ? `
- Total: ${input.crawl.images.totalImages} images, ${(input.crawl.images.totalImageSize / (1024 * 1024)).toFixed(2)}MB total
- Above fold: ${input.crawl.images.aboveFold.length}, Below fold: ${input.crawl.images.belowFold.length}
- Missing lazy loading: ${input.crawl.images.belowFold.filter(i => !i.hasLazyLoading).length} below-fold images
- Missing alt text: check accessibility violations
${input.crawl.images.lcpImage ? `- LCP image: ${(input.crawl.images.lcpImage.fileSize / 1024).toFixed(0)}KB, ${input.crawl.images.lcpImage.format}` : ''}
` : 'Not available'}

Generate 5-8 SEO findings using categories: "Technical SEO", "On-Page SEO", "Performance", "Links".
Use Firon's liability frameworks (Identity Void, Empty Aisle, Hallucination Risk, etc.) when the data matches.
Frame findings as business risks, not just technical errors. Connect to the Invisibility Tax.
In the fix field, reference Firon solutions (Velocity Engine, Structured Attribute Model, Cluster Bomb, Answer-First content).
Structure the plan as: quickWins = Phase 1 Infrastructure Sprint, next = Phase 2 AEO & GEO, scaleAuthority = Phase 3 Scale & Authority (ALWAYS include 2-3 items like Cluster Bomb strategy, AI advertising, authority amplification).`;

  const maxRetries = 2;
  let lastError: Error | null = null;
  let lastContent: string | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const messages: Array<{ role: string; content: string }> = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];

      // Add correction prompt on retry
      if (attempt > 0 && lastContent) {
        const correctionPrompt = `The previous response failed validation. Fix the JSON to match the schema:
- findings array max 8 items. Issue ≤140 chars, Why ≤400, Fix ≤280.
- kind must be EXACTLY one of: "Technical SEO", "On-Page SEO", "Performance", "Links"
- Distribute across at least 3 categories. Max 3 per category.
- plan: quickWins (max 5), next (max 5), experiments (max 3)
- Return valid JSON only.`;
        messages.push({ role: 'assistant', content: lastContent });
        messages.push({ role: 'user', content: correctionPrompt });
      }

      // Build Claude messages — system prompt goes in the system param, not in messages
      const systemMsg = messages.find(m => m.role === 'system')?.content || '';
      const claudeMessages = messages.filter(m => m.role !== 'system').map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      // Try primary model, fall back to haiku if overloaded
      let completion;
      try {
        completion = await client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          system: systemMsg + '\n\nIMPORTANT: Respond with valid JSON only. No markdown, no code fences, no prose.',
          messages: claudeMessages,
          temperature: attempt > 0 ? 0.2 : 0.4,
        });
      } catch (modelError: any) {
        if (modelError?.status === 529 || modelError?.message?.includes('Overloaded')) {
          logger.warn('Claude Sonnet overloaded, falling back to Haiku');
          await new Promise(r => setTimeout(r, 2000));
          completion = await client.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 4096,
            system: systemMsg + '\n\nIMPORTANT: Respond with valid JSON only. No markdown, no code fences, no prose.',
            messages: claudeMessages,
            temperature: attempt > 0 ? 0.2 : 0.4,
          });
        } else {
          throw modelError;
        }
      }

      const textBlock = completion.content.find(b => b.type === 'text');
      const content = textBlock?.text;
      if (!content) {
        throw new Error('Empty response from Claude');
      }

      lastContent = content;
      // Strip markdown code fences if present
      const cleaned = content.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
      const json = JSON.parse(cleaned);
      const normalized = normalizeLlmOutput(json);
      const distributed = enforceDistribution(normalized.findings, input);
      const normalizedWithDistribution = { ...normalized, findings: distributed };
      const validated = ensurePlan(AuditSummary.parse(normalizedWithDistribution), input.goal);

      logger.info('Claude summarization succeeded', {
        findings: validated.findings.length,
        quickWins: validated.plan.quickWins.length,
      });
      return validated;
    } catch (error) {
      lastError = error as Error;
      // If this is the last attempt, throw the error
      if (attempt === maxRetries - 1) {
        break;
      }
    }
  }

  throw new Error(`Failed to generate valid audit summary after ${maxRetries} attempts: ${lastError?.message}`);
}

/**
 * Enforces distribution of findings across multiple categories.
 * Ensures no single category has more than 50% of findings, and enforces mandatory categories.
 */
function enforceDistribution(
  findings: NormalizedFinding[],
  input: SummarizeInput
): NormalizedFinding[] {
  if (findings.length === 0) {
    return findings;
  }

  const kindCounts: Record<NormalizedFinding['kind'], number> = {
    'Technical SEO': 0,
    'On-Page SEO': 0,
    'Performance': 0,
    'Links': 0,
  };

  findings.forEach((f) => kindCounts[f.kind]++);

  // Check if distribution is too concentrated (more than 50% in one category)
  const total = findings.length;
  const maxAllowed = Math.ceil(total * 0.5); // Max 50% in one category

  // Check if we need redistribution
  const needsRedistribution = Object.values(kindCounts).some((count) => count > maxAllowed);

  // Check for mandatory categories
  const hasHeadlines =
    Boolean(input.crawl.heroHeadline) ||
    Boolean(input.crawl.heroSubheadline) ||
    Boolean(input.crawl.primaryCtaText) ||
    input.crawl.secondaryCtas.length > 0;
  const needsOnPageSEO = hasHeadlines && kindCounts['On-Page SEO'] === 0;

  // If distribution is good and mandatory categories are met, return as-is
  if (!needsRedistribution && !needsOnPageSEO && total >= 3) {
    // Check if we have at least 2 different categories
    const uniqueCategories = Object.values(kindCounts).filter((count) => count > 0).length;
    if (uniqueCategories >= 2) {
      return findings;
    }
  }

  // Redistribute: reassign some findings to other categories
  const redistributed = findings.map((f) => ({ ...f })); // Deep copy
  const categories: Array<NormalizedFinding['kind']> = [
    'Technical SEO',
    'On-Page SEO',
    'Performance',
    'Links',
  ];

  // Find over-represented category
  let overRepCategory: NormalizedFinding['kind'] | null = null;
  for (const [kind, count] of Object.entries(kindCounts) as Array<
    [NormalizedFinding['kind'], number]
  >) {
    if (count > maxAllowed) {
      overRepCategory = kind;
      break;
    }
  }

  if (overRepCategory) {
    // Reassign some findings from over-represented category
    let reassigned = 0;
    const targetReassign = kindCounts[overRepCategory] - maxAllowed;

    for (let i = 0; i < redistributed.length && reassigned < targetReassign; i++) {
      if (redistributed[i].kind === overRepCategory) {
        // Find a category that needs more findings
        const underRepCategory =
          categories.find((cat) => cat !== overRepCategory && kindCounts[cat] < maxAllowed) ||
          'Performance';

        // Only reassign if it makes semantic sense
        if (canReassign(redistributed[i], overRepCategory, underRepCategory)) {
          redistributed[i].kind = underRepCategory;
          kindCounts[overRepCategory]--;
          kindCounts[underRepCategory]++;
          reassigned++;
        }
      }
    }
  }

  // Ensure mandatory findings exist
  if (needsOnPageSEO) {
    // Convert a Performance finding to On-Page SEO if possible
    const perfFinding = redistributed.find(
      (f) =>
        f.kind === 'Performance' &&
        (f.issue.toLowerCase().includes('cta') ||
          f.issue.toLowerCase().includes('headline') ||
          f.issue.toLowerCase().includes('messaging') ||
          f.issue.toLowerCase().includes('copy') ||
          f.issue.toLowerCase().includes('text'))
    );
    if (perfFinding) {
      perfFinding.kind = 'On-Page SEO';
      kindCounts['Performance']--;
      kindCounts['On-Page SEO']++;
    } else {
      // Convert any finding to On-Page SEO
      const firstFinding = redistributed.find((f) => f.kind !== 'On-Page SEO');
      if (firstFinding) {
        firstFinding.kind = 'On-Page SEO';
        kindCounts[firstFinding.kind]--;
        kindCounts['On-Page SEO']++;
      }
    }
  }

  // Ensure we have at least 2 different categories
  const uniqueCategories = Object.values(kindCounts).filter((count) => count > 0).length;
  if (uniqueCategories < 2 && redistributed.length >= 2) {
    // Convert one finding to a different category
    const dominantCategory = Object.entries(kindCounts).find(
      ([_, count]) => count > 0
    )?.[0] as NormalizedFinding['kind'];
    if (dominantCategory) {
      const otherCategory = categories.find((cat) => cat !== dominantCategory) || 'Performance';
      const firstFinding = redistributed.find((f) => f.kind === dominantCategory);
      if (firstFinding && canReassign(firstFinding, dominantCategory, otherCategory)) {
        firstFinding.kind = otherCategory;
      }
    }
  }

  return redistributed;
}

function canReassign(
  finding: NormalizedFinding,
  from: NormalizedFinding['kind'],
  to: NormalizedFinding['kind']
): boolean {
  // Only reassign if it makes semantic sense
  const issue = finding.issue.toLowerCase();
  const why = finding.why.toLowerCase();
  const fix = finding.fix.toLowerCase();
  const combined = `${issue} ${why} ${fix}`.toLowerCase();

  // On-Page SEO: content, messaging, headings, meta
  if (to === 'On-Page SEO') {
    if (combined.includes('cta') && (combined.includes('copy') || combined.includes('text') || combined.includes('word'))) return true;
    if (combined.includes('headline') || combined.includes('subheadline')) return true;
    if (combined.includes('messaging') || combined.includes('message')) return true;
    if (combined.includes('copy') && !combined.includes('placement')) return true;
    if (combined.includes('testimonial') && combined.includes('content')) return true;
    if (combined.includes('value proposition') && combined.includes('clear')) return true;
    if (combined.includes('trust signal') && combined.includes('content')) return true;
    // Don't reassign typography technical issues to On-Page SEO
    if (combined.includes('typography') && (combined.includes('size') || combined.includes('line-height') || combined.includes('font'))) return false;
  }

  // Technical SEO: accessibility, crawlability, structured data
  if (to === 'Technical SEO') {
    if (combined.includes('accessibility') || combined.includes('contrast') || combined.includes('tap target') || combined.includes('wcag')) return true;
    if (combined.includes('structured data') || combined.includes('schema') || combined.includes('crawl')) return true;
    if (combined.includes('meta') && (combined.includes('tag') || combined.includes('description') || combined.includes('robot'))) return true;
    if (combined.includes('canonical') || combined.includes('sitemap') || combined.includes('robots.txt')) return true;
    if (combined.includes('third-party') || combined.includes('script')) return true;
    if (combined.includes('responsive') || combined.includes('mobile')) return true;
  }

  // Performance: speed, core web vitals, optimization
  if (to === 'Performance') {
    if (combined.includes('performance') || combined.includes('lcp') || combined.includes('cls') || combined.includes('inp') || combined.includes('tbt')) return true;
    if (combined.includes('image') && (combined.includes('optimization') || combined.includes('size') || combined.includes('format') || combined.includes('lazy'))) return true;
    if (combined.includes('optimization') && (combined.includes('speed') || combined.includes('load'))) return true;
    if (combined.includes('typography') && (combined.includes('size') || combined.includes('line-height') || combined.includes('hierarchy'))) return true;
    if (combined.includes('visual hierarchy') || combined.includes('design')) return true;
    if (combined.includes('layout')) return true;
  }

  // Links: navigation, internal/external links, anchors
  if (to === 'Links') {
    if (combined.includes('navigation') || combined.includes('information architecture')) return true;
    if (combined.includes('link') || combined.includes('anchor') || combined.includes('href')) return true;
    if (combined.includes('cta') && (combined.includes('placement') || combined.includes('visible') || combined.includes('position'))) return true;
    if (combined.includes('usability') || combined.includes('user flow')) return true;
    if (combined.includes('trust signal') && combined.includes('placement')) return true;
  }

  // If reassigning from Performance, be more permissive
  if (from === 'Performance') {
    // Typography technical should stay in Performance
    if (to === 'On-Page SEO' && (combined.includes('typography') && (combined.includes('size') || combined.includes('line-height')))) {
      return false;
    }
    // Allow reassignment if semantic match found above
    return true;
  }

  return false;
}

type NormalizedExperiment = {
  hypothesis: string;
  variant: string;
  metric: string;
  risk?: string;
};

type NormalizedPlan = {
  quickWins: string[];
  next: string[];
  experiments: NormalizedExperiment[];
};

type NormalizedFinding = AuditSummaryType['findings'][number];

type NormalizedSummary = {
  findings: NormalizedFinding[];
  plan: NormalizedPlan;
};

function normalizeLlmOutput(raw: unknown): NormalizedSummary {
  const clone =
    raw && typeof raw === 'object' ? JSON.parse(JSON.stringify(raw)) : {};
  const summary: Record<string, unknown> = clone && typeof clone === 'object' ? clone : {};

  const toKey = (value: unknown) =>
    typeof value === 'string' ? value.trim().toLowerCase() : undefined;

  const impactMap: Record<string, NormalizedFinding['impact']> = {
    high: 'High',
    medium: 'Medium',
    low: 'Low',
  };

  const effortMap: Record<string, NormalizedFinding['effort']> = {
    small: 'Small',
    medium: 'Medium',
    large: 'Large',
    low: 'Small',
    minor: 'Small',
    quick: 'Small',
    easy: 'Small',
    high: 'Large',
    heavy: 'Large',
    significant: 'Large',
    major: 'Large',
  };

  const kindMap: Record<string, NormalizedFinding['kind']> = {
    // Exact matches (handle spaces and case)
    'technical seo': 'Technical SEO',
    'technicalseo': 'Technical SEO',
    'on-page seo': 'On-Page SEO',
    'on page seo': 'On-Page SEO',
    'onpageseo': 'On-Page SEO',
    'performance': 'Performance',
    'links': 'Links',
    // Legacy names → new names
    'marketing strategy': 'Technical SEO',
    'marketingstrategy': 'Technical SEO',
    'copywriting': 'On-Page SEO',
    'ux/ui': 'Performance',
    'uxui': 'Performance',
    // Accessibility findings → Technical SEO
    a11y: 'Technical SEO',
    accessibility: 'Technical SEO',
    'structured data': 'Technical SEO',
    schema: 'Technical SEO',
    crawl: 'Technical SEO',
    canonical: 'Technical SEO',
    robots: 'Technical SEO',
    sitemap: 'Technical SEO',
    meta: 'Technical SEO',
    // Typography/design findings → On-Page SEO
    copy: 'On-Page SEO',
    messaging: 'On-Page SEO',
    headline: 'On-Page SEO',
    'value proposition': 'On-Page SEO',
    typography: 'On-Page SEO',
    content: 'On-Page SEO',
    // Performance findings → Performance
    perf: 'Performance',
    speed: 'Performance',
    optimization: 'Performance',
    'image optimization': 'Performance',
    'lcp': 'Performance',
    'cls': 'Performance',
    'inp': 'Performance',
    'tbt': 'Performance',
    design: 'Performance',
    visual: 'Performance',
    layout: 'Performance',
    // Link/navigation findings → Links
    navigation: 'Links',
    link: 'Links',
    anchor: 'Links',
    flow: 'Links',
    usability: 'Links',
    interaction: 'Links',
    // Additional semantic mappings
    seo: 'Technical SEO',
    marketing: 'Technical SEO',
    strategy: 'Technical SEO',
    positioning: 'On-Page SEO',
    funnel: 'Links',
    'business impact': 'Technical SEO',
    conversion: 'On-Page SEO',
    responsive: 'Technical SEO',
    mobile: 'Technical SEO',
    ux: 'Performance',
    ui: 'Performance',
  };

  const rawFindings = Array.isArray(summary.findings) ? summary.findings : [];

  const findings: NormalizedFinding[] = rawFindings.slice(0, 8).map((entry) => {
    const finding = entry && typeof entry === 'object' ? entry : {};

    const issue =
      typeof (finding as any).issue === 'string'
        ? ((finding as any).issue as string).slice(0, 140)
        : '';
    const why =
      typeof (finding as any).why === 'string'
        ? ((finding as any).why as string).slice(0, 400)
        : '';
    const fix =
      typeof (finding as any).fix === 'string'
        ? ((finding as any).fix as string).slice(0, 280)
        : '';

    const impact = impactMap[toKey((finding as any).impact) ?? ''] ?? 'Medium';
    const effort = effortMap[toKey((finding as any).effort) ?? ''] ?? 'Medium';
    // Normalize kind value - handle spaces and special characters
    const kindRaw = typeof (finding as any).kind === 'string' ? (finding as any).kind.trim() : '';
    const kindKey = kindRaw.toLowerCase().replace(/[\/\s]+/g, ' ').trim();
    const kind = kindMap[kindKey] ??
                 (kindRaw === 'Technical SEO' ? 'Technical SEO' :
                  kindRaw === 'On-Page SEO' ? 'On-Page SEO' :
                  kindRaw === 'Performance' ? 'Performance' :
                  kindRaw === 'Links' ? 'Links' : 'On-Page SEO'); // Default to On-Page SEO if unclear

    const evidenceList: unknown[] = Array.isArray((finding as any).evidenceRefs)
      ? ((finding as any).evidenceRefs as unknown[])
      : [];
    const evidenceRefs = evidenceList
      .map((ref: unknown) => (typeof ref === 'string' ? ref.slice(0, 200) : null))
      .filter((ref): ref is string => Boolean(ref))
      .slice(0, 4);

    return {
      issue,
      why,
      fix,
      impact,
      effort,
      kind,
      evidenceRefs,
    };
  });

  const rawPlan = summary.plan && typeof summary.plan === 'object' ? summary.plan : {};

  const normalizeStringArray = (value: unknown, max: number): string[] =>
    Array.isArray(value)
      ? value
          .map((item: unknown) => (typeof item === 'string' ? item.trim() : null))
          .filter((item): item is string => Boolean(item))
          .slice(0, max)
      : [];

  const quickWins = normalizeStringArray((rawPlan as any).quickWins, 5);
  const next = normalizeStringArray((rawPlan as any).next, 5);

  const experimentsRaw = Array.isArray((rawPlan as any).experiments)
    ? ((rawPlan as any).experiments as Array<Record<string, unknown>>)
    : [];
  const experiments: NormalizedExperiment[] = experimentsRaw.slice(0, 3).map((experiment) => ({
    hypothesis: typeof experiment.hypothesis === 'string' ? experiment.hypothesis : '',
    variant: typeof experiment.variant === 'string' ? experiment.variant : '',
    metric: typeof experiment.metric === 'string' ? experiment.metric : '',
    risk: typeof experiment.risk === 'string' ? experiment.risk : undefined,
  }));

  return {
    findings,
    plan: {
      quickWins,
      next,
      experiments,
    },
  };
}

function ensurePlan(summary: AuditSummaryType, goal?: string): AuditSummaryType {
  if (summary.findings.length === 0) {
    return summary;
  }

  const impactScore: Record<NormalizedFinding['impact'], number> = {
    High: 3,
    Medium: 2,
    Low: 1,
  };

  const effortScore: Record<NormalizedFinding['effort'], number> = {
    Small: 3,
    Medium: 2,
    Large: 1,
  };

  const sortedFindings = [...summary.findings].sort((a, b) => {
    const impactDiff = impactScore[b.impact] - impactScore[a.impact];
    if (impactDiff !== 0) return impactDiff;
    return effortScore[b.effort] - effortScore[a.effort];
  });

  const quickWins =
    summary.plan.quickWins.length > 0
      ? summary.plan.quickWins
      : sortedFindings.slice(0, 3).map((f) => `Resolve "${f.issue}" — ${f.fix}`);

  const nextSteps =
    summary.plan.next.length > 0
      ? summary.plan.next
      : sortedFindings.slice(3, 6).map((f) => `Plan follow-up: ${f.issue} (assign to ${f.kind})`);

  // Generate experiments from findings if AI didn't provide any
  const experiments =
    (summary.plan.experiments ?? []).length > 0
      ? summary.plan.experiments ?? []
      : generateExperimentsFromFindings(sortedFindings, goal);

  return {
    ...summary,
    plan: {
      quickWins,
      next: nextSteps,
      experiments,
    },
  };
}

function generateExperimentsFromFindings(
  findings: NormalizedFinding[],
  goal?: string
): Array<{ hypothesis: string; variant: string; metric: string; risk?: string }> {
  const experiments: Array<{ hypothesis: string; variant: string; metric: string; risk?: string }> = [];

  // Look for CTA-related findings
  const ctaFinding = findings.find(
    (f) =>
      f.kind === 'On-Page SEO' &&
      (f.issue.toLowerCase().includes('cta') ||
        f.issue.toLowerCase().includes('call to action') ||
        f.issue.toLowerCase().includes('button'))
  );
  if (ctaFinding) {
    experiments.push({
      hypothesis: `Testing alternative CTA copy and placement will improve conversion rates by making the value proposition clearer and reducing friction.`,
      variant: `Test different CTA text (more action-oriented, benefit-focused) and placement (above vs. below the fold, centered vs. left-aligned).`,
      metric: 'Conversion rate, click-through rate',
      risk: 'Low',
    });
  }

  // Look for headline/messaging findings
  const headlineFinding = findings.find(
    (f) =>
      f.kind === 'On-Page SEO' &&
      (f.issue.toLowerCase().includes('headline') ||
        f.issue.toLowerCase().includes('messaging') ||
        f.issue.toLowerCase().includes('value proposition'))
  );
  if (headlineFinding && experiments.length < 3) {
    experiments.push({
      hypothesis: `Testing headline variations that emphasize different benefits will improve clarity and engagement, leading to higher conversion.`,
      variant: `Test headline variations: benefit-focused, problem-focused, or feature-focused. Test with and without subheadlines.`,
      metric: 'Time on page, scroll depth, conversion rate',
      risk: 'Low',
    });
  }

  // Look for Performance interaction findings that could benefit from motion
  const interactionFinding = findings.find(
    (f) =>
      f.kind === 'Performance' &&
      (f.issue.toLowerCase().includes('static') ||
        f.issue.toLowerCase().includes('interaction') ||
        f.issue.toLowerCase().includes('engagement'))
  );
  if (interactionFinding && experiments.length < 3) {
    experiments.push({
      hypothesis: `Adding subtle animations and micro-interactions will increase engagement and make the page feel more dynamic and professional.`,
      variant: `Test adding hover effects, scroll-triggered animations, loading states, and micro-interactions to key elements (CTAs, images, cards).`,
      metric: 'Engagement rate, time on page, bounce rate',
      risk: 'Medium',
    });
  }

  // Look for trust signal findings
  const trustFinding = findings.find(
    (f) =>
      (f.kind === 'On-Page SEO' || f.kind === 'Technical SEO') &&
      (f.issue.toLowerCase().includes('trust') ||
        f.issue.toLowerCase().includes('testimonial') ||
        f.issue.toLowerCase().includes('social proof'))
  );
  if (trustFinding && experiments.length < 3) {
    experiments.push({
      hypothesis: `Adding trust signals (testimonials, logos, guarantees) above the fold will reduce friction and increase conversion rates.`,
      variant: `Test placement of trust signals: near CTA, in hero section, or as a dedicated section. Test different formats (text testimonials vs. logos vs. numbers).`,
      metric: 'Conversion rate, time to first interaction',
      risk: 'Low',
    });
  }

  // Look for performance/optimization findings
  const perfFinding = findings.find(
    (f) =>
      f.kind === 'Performance' &&
      (f.issue.toLowerCase().includes('performance') ||
        f.issue.toLowerCase().includes('lcp') ||
        f.issue.toLowerCase().includes('slow') ||
        f.issue.toLowerCase().includes('optimize'))
  );
  if (perfFinding && experiments.length < 3) {
    experiments.push({
      hypothesis: `Optimizing page performance (image compression, lazy loading, code splitting) will improve user experience and reduce bounce rates, especially on mobile.`,
      variant: `Test performance optimizations: image compression, lazy loading, code splitting, CDN usage. Measure before/after performance metrics.`,
      metric: 'Bounce rate, time on page, Core Web Vitals (LCP, CLS, INP)',
      risk: 'Low',
    });
  }

  // If we still don't have experiments, create a generic one based on the goal
  if (experiments.length === 0 && findings.length > 0) {
    const topFinding = findings[0];
    experiments.push({
      hypothesis: `Testing improvements to "${topFinding.issue.toLowerCase()}" will improve user experience and conversion rates.`,
      variant: `Implement the suggested fix: ${topFinding.fix}`,
      metric: goal ? `Conversion rate related to: ${goal}` : 'Conversion rate, engagement rate',
      risk: topFinding.effort === 'Large' ? 'Medium' : 'Low',
    });
  }

  // Return max 3 experiments
  return experiments.slice(0, 3);
}
