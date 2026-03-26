export interface CrawlResult {
  screenshots: {
    desktop: string;
    mobile: string;
  };
  html: {
    desktop: string;
    mobile: string;
  };
  blocked?: {
    desktop?: boolean;
    mobile?: boolean;
  };
  selectors: {
    h1?: string;
    firstCta?: string;
    heroBbox?: { x: number; y: number; width: number; height: number };
  };
  elementCoordinates?: {
    [selector: string]: {
      x: number;
      y: number;
      width: number;
      height: number;
      viewport: string;
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
  reportJson: string;
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
        viewport: string;
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
      viewport: string;
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
      viewport: string;
    };
  }>;
  reportJson: string;
}

export interface HeuristicFinding {
  issue: string;
  why: string;
  fix: string;
  evidence?: string;
}

export interface HeuristicsResult {
  findings: HeuristicFinding[];
}

