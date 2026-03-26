import { createOpenAIClient } from './openai';
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
  const apiKey = process.env.OPENAI_API_KEY;
  const isPlaceholderKey =
    !apiKey ||
    apiKey.trim().length === 0 ||
    apiKey.includes('your-openai-key');

  if (isPlaceholderKey) {
    const error = new Error('OPENAI_API_KEY missing or placeholder; cannot produce authenticated summary');
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

  const client = createOpenAIClient();

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

  const systemPrompt = `🧑‍💼 ROLE & EXPERTISE
You are an AI Web Audit Agent specializing in UX/UI, Marketing Strategy, Copywriting, and Motion Design. You are modeled after a senior Web Creative Director with over 15 years of hands-on experience leading cross-functional teams in:
- UX/UI design systems & component libraries
- High-converting websites, landing pages, and funnels
- Email marketing strategy, design, and automation flows
- Front-end development with responsive, scalable code
- Conversion rate optimization (CRO), A/B testing, and behavioral design
- Brand systems, marketing psychology, and persuasive design patterns

You have deep experience working with growth teams, marketers, and product designers. You understand the business behind the pixels — not just how it looks, but why it works. You are equally fluent in design, development, and marketing — and your feedback reflects this hybrid expertise.

🧠 IDENTITY & VOICE
You behave like a high-trust creative leader inside a fast-moving product or growth team. You are:
- Direct but friendly
- Strategic, not surface-level
- Sharp-eyed but not nitpicky
- Collaborative, not robotic

Tone Guidelines:
- Write like you're in a Slack thread with fellow senior creatives
- Use casual confidence: clear, concise, smart — not over-explaining
- Speak with design intuition and business context baked in
- Use bullet points for clarity, but avoid over-structuring or academic tone
- Don't just criticize — suggest what to fix, and why it matters

🎯 PRIMARY OBJECTIVE
For each user submission, provide an actionable, multi-perspective audit across the following key dimensions:

🖼️ 1. DESIGN & VISUAL COMMUNICATION
- Visual hierarchy — Are key messages and actions visually prioritized?
- Layout clarity & structure — Is there a strong rhythm, balance, and grouping?
- Typography & spacing — Is type readable, scannable, and on-brand? CRITICAL: Analyze font sizes, line-heights, heading hierarchy, and typography system. Check if body text is ≥16px, H1 is ≥24px, line-height is ≥1.5x, and heading sizes create clear hierarchy (H1 > H2 > H3 with 20%+ difference). Evaluate if typography supports F-pattern reading and mobile readability.
- Brand coherence — Does the design reinforce the intended identity?
- Motion & delight — Identify where interactions or animations can reduce static feel
- Imagery use — Are visuals enhancing or distracting from the core message? CRITICAL: Analyze image optimization, file sizes, formats, lazy loading, and LCP image. Check if images are optimized (<100KB for above-the-fold), use modern formats (WebP/AVIF), have proper sizing (natural vs displayed), and use responsive images (srcset) and lazy loading where appropriate.

🧭 2. UX/UI & INTERACTION DESIGN
- Flow logic — Is the user journey clear, frictionless, and goal-oriented?
- Click-depth & hierarchy — Is the information architecture intuitive?
- Interaction affordances — Do buttons, links, and actions signal clearly?
- Mobile-first behavior — How does it scale and adapt responsively?
- Accessibility — Flag WCAG misses (color contrast, keyboard nav, etc.)
- Micro-interactions — Suggest subtle moments of feedback, animation, or control that reduce friction or boost delight

💬 3. MARKETING & MESSAGING
- Value proposition clarity — Is the core benefit obvious above the fold?
- Messaging hierarchy — Are headlines, subheads, and body copy in sync?
- CTA strategy — Are calls-to-action visible, compelling, and conversion-aligned?
- Funnel alignment — Does the experience match the user's awareness stage and conversion goal?
- Trust signals — Are testimonials, guarantees, or data used effectively?

💻 4. DEVELOPMENT & PERFORMANCE
- Responsive behavior — Is layout integrity preserved across screen sizes?
- Interaction feasibility — Are hover states, transitions, or animations realistic to implement?
- Performance risks — Identify any design choices likely to impact speed (e.g. large images, JS-heavy UI, layout shifts). CRITICAL: Analyze image optimization opportunities. Link image file sizes, formats, and optimization to LCP and performance metrics. Identify unoptimized images, missing lazy loading, missing responsive images (srcset), and suboptimal formats.
- Image optimization — Are images optimized for performance? Check file sizes, formats (WebP/AVIF), responsive images (srcset), lazy loading, and LCP image optimization.
- Dev handoff — Does the design suggest clean, componentized structure?

🧠 AUDIT BEHAVIOR RULES
You must:
- Lead the thinking — flag both what's broken AND what's missing
- Explain the "why" — always tie critique back to user behavior, psychology, or performance
- Push for clarity — if a page's goal is fuzzy, call it out and suggest how to tighten
- Suggest improvements — don't just diagnose, prescribe specific tactics, components, or copy changes
- Prioritize ruthlessly — focus feedback on what moves the needle
- Raise questions — if something's unclear, ask strategic follow-ups instead of guessing
- Never default to polish — prioritize outcomes over aesthetics
- Always reason from real evidence. Never fabricate metrics, screenshots, or issues. If data is missing, call it out instead of guessing.

🔥 SPECIAL FOCUS AREAS
You should always flag when:
- A design feels too static — and recommend dynamic UX patterns to inject interactivity
- The layout buries the value prop or CTA — and suggest re-structuring
- The content is copy-led vs. design-led — and the messaging needs simplification
- There's a missed opportunity for visual storytelling, interaction, or persuasion
- There's a gap between design intent and user goal — and it needs reframing

🧰 REFERENCE UX FRAMEWORKS TO APPLY WHEN RELEVANT
- F-shaped reading pattern (for scannability)
- Hick's Law (limit user choice complexity)
- Jakob's Law (familiarity > novelty)
- AIDA (attention, interest, desire, action for marketing copy)
- Gestalt principles (grouping, proximity, contrast)
- Mobile thumb zones and tap targets
- 3-click rule (minimize click depth to goals)

✅ OUTPUT EXPECTATIONS
- CRITICAL DISTRIBUTION RULE (MUST FOLLOW): You MUST create findings across AT LEAST 3 different assignment categories. This is a HARD REQUIREMENT.
  * If you create 5-8 findings, they MUST be distributed as follows:
    - Maximum 3 findings per category (no single category can have more than 3 findings)
    - Minimum 1 "Copywriting" finding (MANDATORY if hero has headlines/CTAs)
    - Minimum 1 "Marketing Strategy" finding (if performance/image issues exist)
    - Remaining findings distributed across UX/UI, Copywriting, Marketing Strategy
  * DO NOT assign more than 3 findings to any single category
  * DO NOT assign all findings to "UX/UI" - this is a CRITICAL ERROR that will cause validation to fail
  * DO NOT assign all findings to "Marketing Strategy" - this is also a CRITICAL ERROR
  * When you have 5-8 findings, ensure at least 3 different categories are represented
- You must respond with a JSON object that matches the schema below.
- Maximum 8 findings. Issue ≤140 chars, Why ≤400, Fix ≤280.
- CRITICAL: Assign kind field using EXACTLY one of these three values (who should this finding be assigned to):
  
  📊 "Marketing Strategy" - Business impact, conversion optimization, strategic decisions
  Focus: Performance metrics affecting conversion, strategic positioning, business outcomes
  * Performance metrics (LCP, CLS, INP, TBT) that impact conversion rates
  * Image optimization affecting performance metrics (file sizes, formats, lazy loading, LCP image)
  * Third-party scripts affecting load time and conversion
  * Conversion funnel alignment and strategic positioning
  * SEO considerations affecting business goals
  * Business impact of technical issues (e.g., slow pages losing visitors)
  * Strategic decisions about resource optimization
  
  ✍️ "Copywriting" - Content, messaging, words
  Focus: What the words say, how they communicate, messaging clarity
  * Headline/subheadline clarity, effectiveness, and messaging
  * CTA copy and messaging (the actual words, not placement)
  * Value proposition messaging and clarity
  * Body copy clarity, scannability, and content strategy
  * Trust signal content (testimonial text, guarantee wording, social proof messaging)
  * Messaging hierarchy and flow (how words guide the reader)
  * Content strategy gaps or missing messaging
  
  🎨 "UX/UI" - Design, usability, interaction, accessibility
  Focus: How it works, how it looks, technical implementation
  * Visual hierarchy, layout, and design consistency
  * Typography system (font sizes, line-heights, hierarchy) - technical implementation
  * Accessibility (contrast ratios, tap targets, WCAG violations, keyboard navigation)
  * Navigation structure and information architecture
  * Responsive design issues and mobile usability
  * Interaction design, usability, and user flows
  * CTA placement and visibility (not the copy itself)
  * Visual design consistency and brand coherence
  
- DECISION RULES FOR EDGE CASES:
  * Typography: Technical implementation (sizes, line-heights, hierarchy) → UX/UI; Readability/messaging clarity → Copywriting
  * Images: Performance optimization (file sizes, formats, lazy loading) → Marketing Strategy; Visual design/usage → UX/UI
  * CTAs: Copy/text/wording → Copywriting; Placement/visibility/design → UX/UI
  * Trust signals: Content/messaging (what they say) → Copywriting; Strategic placement → Marketing Strategy
  * Performance: Conversion impact, business metrics → Marketing Strategy; User experience impact → UX/UI
  * Typography readability: If about font sizes/line-heights affecting readability → UX/UI; If about messaging clarity/word choice → Copywriting
  
- IMPORTANT: Use the EXACT strings above ("Marketing Strategy", "Copywriting", "UX/UI") - do not use variations like "performance", "a11y", "ux", "copy", or "design".
- MANDATORY: If the hero snapshot contains headlines, CTAs, or messaging, you MUST create at least one "Copywriting" finding analyzing the messaging clarity, headline effectiveness, or CTA copy strategy.
- Provide a plan with prioritized quick wins, next steps, and experiments (max 3). Populate each array when findings exist—never leave the plan empty.
- Use the findings to determine priority: Quick Wins = high-impact, lower-effort fixes; Next Steps = remaining must-do items; Experiments = CRO/UX tests or ideas that could improve conversion, engagement, or user experience based on the findings (e.g., A/B testing different CTAs, headline variations, layout changes, motion effects, trust signal placement).
- CRITICAL: Always provide at least 1-2 experiments when findings suggest optimization opportunities (e.g., CTA effectiveness, headline clarity, motion engagement, trust signal placement, layout variations). Experiments should include: hypothesis (what you're testing), variant (what you'll change), metric (how you'll measure success), and optional risk level.
- Every recommendation must stem directly from provided data (metrics, violations, heuristics, inputs). If evidence is thin, note the gap explicitly.
- Ensure the final set of findings touches all four pillars: design/visual, UX/interactions, marketing/messaging, and development/performance. If evidence is missing for a pillar, surface the gap as a finding.
- Leverage the hero snapshot, navigation cues, section headings, testimonials, and trust signals from the crawl to ground your critique in actual messaging and layout.
- Respond with JSON only, no markdown or prose.`;

  const userPrompt = `Audit Context:
Goal: ${input.goal}
Target Audience: ${input.audience}
Primary CTA: ${input.primaryCta}

📸 HERO SNAPSHOT (Above-the-fold Analysis):
${heroSnapshot}

Analyze this hero snapshot for:
- Value proposition clarity: Is the headline immediately clear about what the product/service does and why it matters? [ASSIGN TO: Copywriting - this is about messaging clarity]
- Messaging hierarchy: Do headline → subheadline → CTA flow logically? Is the copy scannable? [ASSIGN TO: Copywriting - this is about word flow and messaging]
- CTA copy: Are the CTA words action-oriented and persuasive? Is the messaging clear? [ASSIGN TO: Copywriting - this is about the actual words/copy]
- CTA placement: Is the primary CTA visible? Is the viewport offset reasonable? [ASSIGN TO: UX/UI - this is about placement and visibility]
- Trust signals content: Are testimonials/trust badges present? What do they say? [ASSIGN TO: Copywriting if about messaging/content]
- Trust signals placement: Are trust signals positioned effectively above the fold? [ASSIGN TO: Marketing Strategy if about strategic placement for conversion]
- Visual hierarchy: Based on content structure, are key elements (headline, CTA) likely well-prioritized visually? [ASSIGN TO: UX/UI - this is about visual design]
- Typography technical: Review the typography data above. Are font sizes appropriate (16px+ body, 24px+ H1)? Is line-height readable (1.5x+)? [ASSIGN TO: UX/UI - technical implementation]
- Typography messaging: Does the typography support messaging clarity and scannability? [ASSIGN TO: Copywriting if about how typography affects message clarity]

🚀 PERFORMANCE METRICS:
- Available: ${input.availability.perf ? 'yes' : 'no'}
- LCP: ${input.perf.lcp.toFixed(2)}s (target: <2.5s) ${input.perf.lcp > 2.5 ? '⚠️ SLOW' : '✅ Good'}
- CLS: ${input.perf.cls.toFixed(3)} (target: <0.1) ${input.perf.cls > 0.1 ? '⚠️ HIGH LAYOUT SHIFT' : '✅ Stable'}
- INP: ${input.perf.inp.toFixed(2)}ms (target: <200ms) ${input.perf.inp > 200 ? '⚠️ SLOW INTERACTION' : '✅ Responsive'}
- TBT: ${input.perf.tbt.toFixed(2)}s (target: <0.2s) ${input.perf.tbt > 0.2 ? '⚠️ BLOCKING' : '✅ Good'}
- Total Bytes: ${(input.perf.totalBytes / 1024 / 1024).toFixed(2)}MB ${input.perf.totalBytes > 2 * 1024 * 1024 ? '⚠️ LARGE' : '✅ Reasonable'}
- Third-party domains: ${input.perf.thirdPartyDomains.length > 0 ? input.perf.thirdPartyDomains.join(', ') : 'None captured'}

Performance Analysis:
- Focus on conversion impact: slow pages lose visitors before they can convert
- Link performance problems to business outcomes (bounce rate, conversion rate, SEO rankings)
- Identify which metrics are causing the biggest conversion issues
- Link performance problems to technical choices (e.g., large images, heavy JS, third-party scripts)
- Suggest specific optimizations that improve conversion rates
- [ASSIGN TO: Marketing Strategy - performance affects business outcomes]

♿ ACCESSIBILITY EVIDENCE:
- Available: ${input.availability.a11y ? 'yes' : 'no'}
- Violations (${input.a11y.violations.length}):
${accessibilityViolations}
- Contrast Issues:
${contrastSummary}
- Tap Targets: ${tapTargetSummary}

Accessibility Analysis:
- Prioritize violations that block users from completing key actions (CTAs, forms, navigation)
- Contrast issues that affect readability of critical content (headlines, body copy, CTAs)
- Tap target issues that make mobile interactions difficult
- Consider business impact: accessibility barriers reduce addressable market and may have legal implications
- [ASSIGN TO: UX/UI - accessibility is a usability/design concern]

🔍 HEURISTIC FINDINGS (${input.heuristics.findings.length}):
${heuristicSummary}

Heuristic Analysis:
- These are rule-based checks that flag common UX issues
- Connect heuristic findings to user behavior: how does each issue impact conversion or user satisfaction?
- Prioritize findings that affect the primary conversion goal
- Suggest specific, actionable fixes that address the root cause

📊 CONTENT STRUCTURE ANALYSIS:
Navigation items: ${input.crawl.navItems.length > 0 ? input.crawl.navItems.join(', ') : 'None detected'}
Section headings: ${input.crawl.sectionHeadings.length > 0 ? input.crawl.sectionHeadings.slice(0, 5).join(' → ') : 'None detected'}
${input.crawl.sectionHeadings.length > 5 ? `... and ${input.crawl.sectionHeadings.length - 5} more sections` : ''}

Content Analysis:
- Information architecture: Does the navigation structure make sense? Can users find what they need in ≤3 clicks?
- Content flow: Do section headings tell a logical story? Is the page structure scannable (F-pattern)?
- Messaging consistency: Are section headings aligned with the value proposition and goal?
- Content depth: Is there enough information to build trust and address objections?

📝 TYPOGRAPHY ANALYSIS:
${input.crawl.typography ? `
- H1: ${input.crawl.typography.h1 ? `${input.crawl.typography.h1.fontSize.toFixed(1)}px, ${input.crawl.typography.h1.fontWeight}, ${input.crawl.typography.h1.fontFamily}` : 'Not detected'}
- H2: ${input.crawl.typography.h2 ? `${input.crawl.typography.h2.fontSize.toFixed(1)}px, ${input.crawl.typography.h2.fontWeight}, ${input.crawl.typography.h2.fontFamily}` : 'Not detected'}
- Body: ${input.crawl.typography.body ? `${input.crawl.typography.body.fontSize.toFixed(1)}px, line-height: ${input.crawl.typography.body.lineHeight}, ${input.crawl.typography.body.fontFamily}` : 'Not detected'}
- Heading hierarchy: ${input.crawl.typography.headingHierarchy && input.crawl.typography.headingHierarchy.length > 0
  ? input.crawl.typography.headingHierarchy.map(h => `H${h.level}: ${h.fontSize.toFixed(1)}px (${h.count} found)`).join(', ')
  : 'Not detected'}

Typography Analysis:
- Font size appropriateness: Are body text (16px+), headings (24px+ for H1), and hierarchy sizes appropriate? [ASSIGN TO: UX/UI - technical implementation]
- Typography hierarchy: Does the heading hierarchy create clear visual distinction? Is H1 > H2 > H3 clearly established? Are size differences meaningful (20%+ difference)? [ASSIGN TO: UX/UI - visual design]
- Readability: Is line-height adequate (1.5x+ for body text)? Are font sizes large enough for mobile reading? [ASSIGN TO: UX/UI - technical readability]
- Scannability: Does the typography system support F-pattern reading? Are headings prominent enough to guide the eye? [ASSIGN TO: UX/UI - visual design, or Copywriting if about messaging flow]
- Brand coherence: Do font choices support the brand identity? Is typography consistent across the page? [ASSIGN TO: UX/UI - visual design consistency]
- Performance impact: Are web fonts loading efficiently? Could font choices impact performance? [ASSIGN TO: Marketing Strategy - performance affects conversion]
` : 'Typography data not available.'}

🖼️ IMAGE ANALYSIS:
${input.crawl.images ? `
- Total images: ${input.crawl.images.totalImages}
- Total image size: ${(input.crawl.images.totalImageSize / (1024 * 1024)).toFixed(2)}MB
- Above-the-fold images: ${input.crawl.images.aboveFold.length}
- Below-the-fold images: ${input.crawl.images.belowFold.length}
${input.crawl.images.lcpImage ? `
- LCP image: ${input.crawl.images.lcpImage.url.substring(input.crawl.images.lcpImage.url.lastIndexOf('/') + 1)} (${(input.crawl.images.lcpImage.fileSize / 1024).toFixed(0)}KB, ${input.crawl.images.lcpImage.format}, ${input.crawl.images.lcpImage.naturalWidth}x${input.crawl.images.lcpImage.naturalHeight}px natural, ${input.crawl.images.lcpImage.displayedWidth}x${input.crawl.images.lcpImage.displayedHeight}px displayed)
` : '- LCP image: Not detected'}
${input.crawl.images.aboveFold.length > 0 ? `
- Above-the-fold images:
${input.crawl.images.aboveFold.slice(0, 5).map((img, idx) => `  ${idx + 1}. ${img.url.substring(img.url.lastIndexOf('/') + 1)} — ${(img.fileSize / 1024).toFixed(0)}KB, ${img.format}, ${img.naturalWidth}x${img.naturalHeight}px (displayed: ${img.displayedWidth}x${img.displayedHeight}px), lazy: ${img.hasLazyLoading ? 'yes' : 'no'}, srcset: ${img.hasSrcset ? 'yes' : 'no'}${img.isLcpCandidate ? ' [LCP CANDIDATE]' : ''}`).join('\n')}
${input.crawl.images.aboveFold.length > 5 ? `  ... and ${input.crawl.images.aboveFold.length - 5} more above-the-fold images` : ''}
` : ''}
${input.crawl.images.belowFold.length > 0 ? `
- Below-the-fold images (sample):
${input.crawl.images.belowFold.slice(0, 3).map((img, idx) => `  ${idx + 1}. ${img.url.substring(img.url.lastIndexOf('/') + 1)} — ${(img.fileSize / 1024).toFixed(0)}KB, ${img.format}, lazy: ${img.hasLazyLoading ? 'yes' : 'no'}, srcset: ${img.hasSrcset ? 'yes' : 'no'}`).join('\n')}
${input.crawl.images.belowFold.length > 3 ? `  ... and ${input.crawl.images.belowFold.length - 3} more below-the-fold images` : ''}
` : ''}

Image Analysis:
- LCP optimization: Is the LCP image optimized? File size should be <100KB for above-the-fold images. Is it properly sized (natural size close to displayed size)? Does it use modern formats (WebP/AVIF)? [ASSIGN TO: Marketing Strategy - performance affects conversion]
- Image optimization: Are above-the-fold images compressed and optimized? Large images (>200KB) slow down page load and hurt LCP scores. [ASSIGN TO: Marketing Strategy - performance optimization]
- Responsive images: Do images use srcset for responsive loading? This ensures mobile devices download smaller images, improving load time. [ASSIGN TO: Marketing Strategy - performance optimization]
- Lazy loading: Are below-the-fold images using lazy loading? This defers non-critical images until needed, improving initial page load. [ASSIGN TO: Marketing Strategy - performance optimization]
- Image formats: Are images using modern formats (WebP, AVIF) instead of PNG/JPEG where appropriate? Modern formats can reduce file sizes by 25-35%. [ASSIGN TO: Marketing Strategy - performance optimization]
- Image sizing: Are images displayed at their natural size, or are they significantly larger/smaller? Oversized images waste bandwidth. [ASSIGN TO: Marketing Strategy - performance optimization]
- Performance impact: How do image sizes and optimization affect LCP, TBT, and total page weight? Link image issues to performance metrics. [ASSIGN TO: Marketing Strategy - business impact]
- Design impact: Do images enhance the message and support the value proposition? Are they used effectively for visual storytelling? [ASSIGN TO: UX/UI - visual design, or Copywriting if about messaging]
` : 'Image data not available.'}

🎯 AUDIT REQUIREMENTS:
Generate an audit summary that:
1. References all evidence above (performance, accessibility, heuristics, content structure, typography, images)
2. Surfaces 5–8 high-value findings distributed across MULTIPLE assignment categories:
   - "Marketing Strategy" - performance/conversion optimization, strategic positioning, business impact, image optimization affecting performance
   - "Copywriting" - messaging, headlines, CTAs (copy), value proposition, trust signal content (MANDATORY if hero has headlines/CTAs)
   - "UX/UI" - layout, accessibility, interactions, navigation, visual design, typography (technical), CTA placement
3. CRITICAL DISTRIBUTION (HARD REQUIREMENT): You MUST distribute findings across AT LEAST 3 different categories. Maximum 3 findings per category. Do NOT assign all findings to "UX/UI" or "Marketing Strategy". This is a validation requirement - failure to distribute will cause the response to be rejected.
4. Delivers a prioritized action plan with quick wins, next steps, and experiments (always include at least 1-2 experiments based on findings that suggest optimization opportunities)
5. Ties every finding to user behavior, psychology, or business impact
6. Provides specific, actionable fixes (not generic advice) — for typography, include exact font sizes, line-heights, and hierarchy recommendations; for images, include file sizes, formats, and optimization recommendations
7. Uses UX frameworks (F-pattern, Hick's Law, AIDA, Gestalt, etc.) when relevant — especially F-pattern for typography scannability
8. Flags gaps: if evidence is missing for a pillar, call it out as a finding
9. CRITICAL: When typography data is available, ensure at least one finding addresses typography:
   - Technical implementation (font sizes, line-heights, hierarchy) → assign to "UX/UI"
   - Messaging clarity affected by typography → assign to "Copywriting"
10. CRITICAL: When image data is available, ensure at least one finding addresses image optimization (file sizes, formats, lazy loading, LCP image, responsive images) and links it to performance metrics (LCP, total page weight) - assign to "Marketing Strategy"
11. CRITICAL: When hero snapshot contains headlines or CTAs, create at least one "Copywriting" finding analyzing messaging clarity, headline effectiveness, or CTA copy (not placement)

Focus on what moves the needle for the stated goal: "${input.goal}".`;

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
        const correctionPrompt = `The previous response failed validation. Please critique and correct the JSON output to strictly match the schema. Ensure:
- findings array has max 8 items
- Each finding has all required fields with correct max lengths
- impact, effort, kind use exact enum values (kind must be one of: "Marketing Strategy", "Copywriting", "UX/UI")
- CRITICAL: Findings MUST be distributed across AT LEAST 3 different categories. Maximum 3 findings per category. Do NOT assign all findings to "UX/UI" or any single category.
- plan has quickWins (max 5), next (max 5), experiments (max 3, but always include at least 1-2 when findings suggest optimization opportunities)
- Each experiment must have: hypothesis (string), variant (string), metric (string), risk (string, optional)
- Return valid JSON only.`;
        messages.push({ role: 'assistant', content: lastContent });
        messages.push({ role: 'user', content: correctionPrompt });
      }

      const completion = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: messages as any,
        response_format: { type: 'json_object' },
        temperature: attempt > 0 ? 0.2 : 0.4,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from OpenAI');
      }

      lastContent = content;
      const json = JSON.parse(content);
      const normalized = normalizeLlmOutput(json);
      // Enforce distribution across categories
      const distributed = enforceDistribution(normalized.findings, input);
      const normalizedWithDistribution = { ...normalized, findings: distributed };
      const validated = ensurePlan(AuditSummary.parse(normalizedWithDistribution), input.goal);

      logger.info('OpenAI summarization succeeded', {
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
    'Marketing Strategy': 0,
    'Copywriting': 0,
    'UX/UI': 0,
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
  const needsCopywriting = hasHeadlines && kindCounts['Copywriting'] === 0;

  // If distribution is good and mandatory categories are met, return as-is
  if (!needsRedistribution && !needsCopywriting && total >= 3) {
    // Check if we have at least 2 different categories
    const uniqueCategories = Object.values(kindCounts).filter((count) => count > 0).length;
    if (uniqueCategories >= 2) {
      return findings;
    }
  }

  // Redistribute: reassign some findings to other categories
  const redistributed = findings.map((f) => ({ ...f })); // Deep copy
  const categories: Array<NormalizedFinding['kind']> = [
    'Marketing Strategy',
    'Copywriting',
    'UX/UI',
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
          'UX/UI';

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
  if (needsCopywriting) {
    // Convert a UX/UI finding to Copywriting if possible
    const uxFinding = redistributed.find(
      (f) =>
        f.kind === 'UX/UI' &&
        (f.issue.toLowerCase().includes('cta') ||
          f.issue.toLowerCase().includes('headline') ||
          f.issue.toLowerCase().includes('messaging') ||
          f.issue.toLowerCase().includes('copy') ||
          f.issue.toLowerCase().includes('text'))
    );
    if (uxFinding) {
      uxFinding.kind = 'Copywriting';
      kindCounts['UX/UI']--;
      kindCounts['Copywriting']++;
    } else {
      // Convert any finding to Copywriting
      const firstFinding = redistributed.find((f) => f.kind !== 'Copywriting');
      if (firstFinding) {
        firstFinding.kind = 'Copywriting';
        kindCounts[firstFinding.kind]--;
        kindCounts['Copywriting']++;
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
      const otherCategory = categories.find((cat) => cat !== dominantCategory) || 'UX/UI';
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

  // Copywriting: words, messaging, content
  if (to === 'Copywriting') {
    if (combined.includes('cta') && (combined.includes('copy') || combined.includes('text') || combined.includes('word'))) return true;
    if (combined.includes('headline') || combined.includes('subheadline')) return true;
    if (combined.includes('messaging') || combined.includes('message')) return true;
    if (combined.includes('copy') && !combined.includes('placement')) return true;
    if (combined.includes('testimonial') && combined.includes('content')) return true;
    if (combined.includes('value proposition') && combined.includes('clear')) return true;
    if (combined.includes('trust signal') && combined.includes('content')) return true;
    // Don't reassign typography technical issues to Copywriting
    if (combined.includes('typography') && (combined.includes('size') || combined.includes('line-height') || combined.includes('font'))) return false;
  }

  // Marketing Strategy: performance, conversion, business impact
  if (to === 'Marketing Strategy') {
    if (combined.includes('performance') || combined.includes('lcp') || combined.includes('cls') || combined.includes('inp') || combined.includes('tbt')) return true;
    if (combined.includes('conversion') || combined.includes('bounce rate') || combined.includes('seo')) return true;
    if (combined.includes('image') && (combined.includes('optimization') || combined.includes('size') || combined.includes('format') || combined.includes('lazy'))) return true;
    if (combined.includes('optimization') && (combined.includes('speed') || combined.includes('load'))) return true;
    if (combined.includes('third-party') || combined.includes('script')) return true;
    if (combined.includes('trust signal') && combined.includes('placement')) return true;
  }

  // UX/UI: design, usability, technical implementation
  if (to === 'UX/UI') {
    if (combined.includes('accessibility') || combined.includes('contrast') || combined.includes('tap target') || combined.includes('wcag')) return true;
    if (combined.includes('typography') && (combined.includes('size') || combined.includes('line-height') || combined.includes('hierarchy'))) return true;
    if (combined.includes('layout') || combined.includes('navigation') || combined.includes('information architecture')) return true;
    if (combined.includes('cta') && (combined.includes('placement') || combined.includes('visible') || combined.includes('position'))) return true;
    if (combined.includes('responsive') || combined.includes('mobile')) return true;
    if (combined.includes('visual hierarchy') || combined.includes('design')) return true;
    if (combined.includes('usability') || combined.includes('user flow')) return true;
  }

  // If reassigning from UX/UI, be more permissive
  if (from === 'UX/UI') {
    // Typography technical should stay in UX/UI
    if (to === 'Copywriting' && (combined.includes('typography') && (combined.includes('size') || combined.includes('line-height')))) {
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
    'marketing strategy': 'Marketing Strategy',
    'marketingstrategy': 'Marketing Strategy',
    'copywriting': 'Copywriting',
    'ux/ui': 'UX/UI',
    'uxui': 'UX/UI',
    // Performance/Conversion → Marketing Strategy
    performance: 'Marketing Strategy',
    perf: 'Marketing Strategy',
    speed: 'Marketing Strategy',
    conversion: 'Marketing Strategy',
    optimization: 'Marketing Strategy',
    seo: 'Marketing Strategy',
    // Accessibility/Design → UX/UI
    a11y: 'UX/UI',
    accessibility: 'UX/UI',
    ux: 'UX/UI',
    ui: 'UX/UI',
    usability: 'UX/UI',
    interaction: 'UX/UI',
    flow: 'UX/UI',
    layout: 'UX/UI',
    design: 'UX/UI',
    visual: 'UX/UI',
    typography: 'UX/UI', // Technical typography → UX/UI
    // Messaging/Content → Copywriting
    copy: 'Copywriting',
    messaging: 'Copywriting',
    headline: 'Copywriting',
    'value proposition': 'Copywriting',
    // Additional semantic mappings
    marketing: 'Marketing Strategy',
    strategy: 'Marketing Strategy',
    positioning: 'Marketing Strategy',
    funnel: 'Marketing Strategy',
    'business impact': 'Marketing Strategy',
    'image optimization': 'Marketing Strategy',
    'lcp': 'Marketing Strategy',
    'cls': 'Marketing Strategy',
    'inp': 'Marketing Strategy',
    'tbt': 'Marketing Strategy',
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
                 (kindRaw === 'Marketing Strategy' ? 'Marketing Strategy' :
                  kindRaw === 'Copywriting' ? 'Copywriting' :
                  kindRaw === 'UX/UI' ? 'UX/UI' : 'UX/UI'); // Default to UX/UI if unclear

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
    summary.plan.experiments.length > 0
      ? summary.plan.experiments
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
      f.kind === 'Copywriting' &&
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
      f.kind === 'Copywriting' &&
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

  // Look for UX/UI interaction findings that could benefit from motion
  const interactionFinding = findings.find(
    (f) =>
      f.kind === 'UX/UI' &&
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
      (f.kind === 'Copywriting' || f.kind === 'Marketing Strategy') &&
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
      f.kind === 'Marketing Strategy' &&
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
