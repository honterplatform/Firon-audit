export interface AuditInput {
  target: string;
  goal: string;
  audience: string;
  primaryCta: string;
  fidelity: 'quick' | 'full';
  callbackUrl?: string;
}

export interface CrawlResult {
  screenshots: {
    desktop: string; // storage path
    mobile: string;
  };
  html: {
    desktop: string;
    mobile: string;
  };
  selectors: {
    h1?: string;
    firstCta?: string;
    heroBbox?: { x: number; y: number; width: number; height: number };
  };
  elementCoordinates?: {
    // Map of selector to bounding box coordinates (relative to full page screenshot)
    [selector: string]: {
      x: number;
      y: number;
      width: number;
      height: number;
      viewport: 'desktop' | 'mobile';
    };
  };
  content: {
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
  };
}

export interface LighthouseResult {
  lcp: number;
  cls: number;
  inp: number;
  tbt: number;
  totalBytes: number;
  thirdPartyDomains: string[];
  reportJson: string; // storage path
}

export interface AxeResult {
  violations: Array<{
    id: string;
    description: string;
    nodes: Array<{
      html: string;
      target: string[];
      coordinates?: {
        x: number;
        y: number;
        width: number;
        height: number;
        viewport: 'desktop' | 'mobile';
      };
    }>;
  }>;
  contrastIssues: Array<{
    selector: string;
    ratio: number;
    text: string;
    coordinates?: {
      x: number;
      y: number;
      width: number;
      height: number;
      viewport: 'desktop' | 'mobile';
    };
  }>;
  tapTargetIssues: Array<{
    selector: string;
    size: number;
    coordinates?: {
      x: number;
      y: number;
      width: number;
      height: number;
      viewport: 'desktop' | 'mobile';
    };
  }>;
  reportJson: string; // storage path
}

export interface HeuristicsResult {
  findings: Array<{
    issue: string;
    why: string;
    fix: string;
    evidence?: string;
  }>;
}

export interface SummarizeInput {
  perf: LighthouseResult;
  a11y: AxeResult;
  heuristics: HeuristicsResult;
  goal: string;
  audience: string;
  primaryCta: string;
  crawl: CrawlResult['content'];
  availability: {
    perf: boolean;
    a11y: boolean;
    heuristics: boolean;
  };
}

export interface JobData {
  runId: string;
  target: string;
  inputs: AuditInput;
}

export interface CrawlJobData extends JobData {
  // Additional crawl-specific data if needed
}

export interface LighthouseJobData extends JobData {
  crawlResult: CrawlResult;
}

export interface AxeJobData extends JobData {
  crawlResult: CrawlResult;
}

export interface HeuristicsJobData extends JobData {
  crawlResult: CrawlResult;
}

export interface SummarizeJobData extends JobData {
  crawlResult: CrawlResult;
  perfResult?: LighthouseResult;
  a11yResult?: AxeResult;
  heuristicsResult?: HeuristicsResult;
}

export interface ReportJobData extends JobData {
  summaryJson: any;
}

export interface NotifyJobData extends JobData {
  callbackUrl: string;
  summaryJson: any;
}

