'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useRef } from 'react';
import { AuditTable } from './AuditTable';
import { Badge } from './Badge';
import { AuditChat, type AuditChatRef } from './AuditChat';
import { FindingsPlan } from './FindingsPlan';

type AuditStatus = 'queued' | 'running' | 'partial' | 'completed' | 'failed';

type Summary = {
  findings: Array<{
    issue: string;
    why: string;
    fix: string;
    impact: 'High' | 'Medium' | 'Low';
    effort: 'Small' | 'Medium' | 'Large';
    kind: 'Technical SEO' | 'On-Page SEO' | 'Performance' | 'Links';
    evidenceRefs?: string[];
  }>;
  plan: {
    quickWins: string[];
    next: string[];
    experiments: Array<{
      hypothesis: string;
      variant: string;
      metric: string;
      risk?: string;
    }>;
  };
};

type Artifact = {
  type: string;
  path: string;
  meta: Record<string, unknown> | null;
};

type AuditRun = {
  id: string;
  target: string;
  status: AuditStatus;
  startedAt: string | null;
  completedAt: string | null;
  summaryJson: Summary | null;
  fallbackFindings: Summary['findings'];
  stats: {
    findingsCount: number;
    artifactsCount: number;
    highImpactFindings: number;
  };
  artifacts: Artifact[];
  screenshotUrls?: Record<string, string>;
  blockedStatus?: Record<string, boolean>;
};

type Props = {
  runId: string;
  initialRun: AuditRun;
  screenshotUrls?: Record<string, string>;
  elementCoordinates?: Record<string, { x: number; y: number; width: number; height: number; viewport: string }>;
  blockedStatus?: Record<string, boolean>;
};

const POLL_INTERVAL_MS = 5000;

const statusColors: Record<AuditStatus, string> = {
  queued: 'bg-gray-100 text-gray-800 border-gray-200',
  running: 'bg-blue-100 text-blue-800 border-blue-200',
  partial: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  completed: 'bg-green-100 text-green-800 border-green-200',
  failed: 'bg-red-100 text-red-800 border-red-200',
};

const statusLabels: Record<AuditStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  partial: 'Completed with warnings',
  completed: 'Completed',
  failed: 'Failed',
};

const statusMessages: Record<AuditStatus, string> = {
  queued: 'Waiting for a worker slot.',
  running: 'We are crawling the site and running audits.',
  partial: 'The audit finished, but some checks failed. Review the report for details.',
  completed: 'All checks finished and the summary is ready.',
  failed: 'The audit failed. Check the worker logs for more information.',
};

// Normalize kind values to ensure they use the new SEO category display values
function normalizeKind(kind: string): 'Technical SEO' | 'On-Page SEO' | 'Performance' | 'Links' {
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

export function AuditRunViewer({ runId, initialRun, screenshotUrls: initialScreenshotUrls, elementCoordinates, blockedStatus }: Props) {
  // Debug: log blocked status
  console.log('AuditRunViewer blockedStatus:', blockedStatus);
  const [run, setRun] = useState<AuditRun>(initialRun);
  const [screenshotUrls, setScreenshotUrls] = useState<Record<string, string>>(initialScreenshotUrls || {});
  const [blockedStatusState, setBlockedStatusState] = useState<Record<string, boolean>>(blockedStatus || {});
  const [isPolling, setIsPolling] = useState(initialRun.status === 'running' || initialRun.status === 'queued');
  const [error, setError] = useState<string | null>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [showPdfEmailForm, setShowPdfEmailForm] = useState(false);
  const [pdfEmailInput, setPdfEmailInput] = useState('');
  const chatRef = useRef<AuditChatRef>(null);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const response = await fetch(`/api/audits/${runId}`, {
          cache: 'no-store',
        });
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        const data = (await response.json()) as AuditRun;
        if (!active) {
          return;
        }
        setRun(data);
        if (data.screenshotUrls) {
          setScreenshotUrls((prev) => ({ ...prev, ...data.screenshotUrls }));
        }
        if (data.blockedStatus) {
          setBlockedStatusState(data.blockedStatus);
        }
        setError(null);

        if (data.status === 'running' || data.status === 'queued') {
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        } else if (isPolling) {
          // Audit just finished — wait a moment for all findings to be written, then fetch final data
          setIsPolling(false);
          setTimeout(async () => {
            try {
              const finalResp = await fetch(`/api/audits/${runId}`, { cache: 'no-store' });
              if (finalResp.ok) {
                const finalData = (await finalResp.json()) as AuditRun;
                setRun(finalData);
                if (finalData.screenshotUrls) setScreenshotUrls(prev => ({ ...prev, ...finalData.screenshotUrls }));
              }
            } catch {}
          }, 3000);
        }
      } catch (err) {
        console.error('Failed to poll audit status', err);
        if (active) {
          setError('Connection lost while checking the audit progress. Retrying…');
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      }
    };

    // Always fetch once on mount to get latest data
    poll();

    return () => {
      active = false;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [runId]);

  const hasSummary = Boolean(run.summaryJson);
  const hasFindings = Boolean(run.summaryJson && run.summaryJson.findings && run.summaryJson.findings.length > 0);
  const fallbackHasFindings = run.fallbackFindings.length > 0;
  
  // Merge all findings: database findings (heuristics, Axe, LLM) + summaryJson findings (AI curated)
  // Database findings are the source of truth and include ALL findings from all sources
  // SummaryJson findings are AI-curated but we still want to show all database findings
  const isAuditDone = run.status === 'completed' || run.status === 'partial' || run.status === 'failed';

  const findingsToRender = useMemo(() => {
    // Only show findings once the audit is fully done — prevents partial results from showing
    if (!isAuditDone) return [];

    const dbFindings = run.fallbackFindings.map((f, index) => ({
      ...f,
      kind: normalizeKind(f.kind || 'Performance'),
      _index: index,
    }));

    return dbFindings.sort((a, b) => {
      const impactOrder: Record<string, number> = { High: 3, Medium: 2, Low: 1 };
      const impactDiff = (impactOrder[b.impact] || 0) - (impactOrder[a.impact] || 0);
      if (impactDiff !== 0) return impactDiff;
      return a.issue.localeCompare(b.issue);
    });
  }, [run.fallbackFindings, isAuditDone]);

  // Group findings by kind (Assign To)
  const findingsByKind = useMemo(() => {
    const groups: Record<string, typeof findingsToRender> = {
      'Technical SEO': [],
      'On-Page SEO': [],
      'Performance': [],
      'Links': [],
    };

    findingsToRender.forEach(finding => {
      const kind = finding.kind || 'Performance';
      if (groups[kind]) {
        groups[kind].push(finding);
      } else {
        // Fallback to Performance for any unknown kinds
        groups['Performance'].push(finding);
      }
    });

    return groups;
  }, [findingsToRender]);

  // Get all available tabs (kinds that have findings) - Technical SEO always first
  const availableTabs = useMemo(() => {
    const allTabs = (['Technical SEO', 'On-Page SEO', 'Performance', 'Links'] as const).filter(
      kind => findingsByKind[kind].length > 0
    );
    // Sort so Technical SEO always appears first
    return allTabs.sort((a, b) => {
      if (a === 'Technical SEO') return -1;
      if (b === 'Technical SEO') return 1;
      return 0; // Keep original order for others
    });
  }, [findingsByKind]);

  // Active tab — initialize synchronously from available tabs
  const [activeTab, setActiveTab] = useState<string>(() => availableTabs[0] || '');

  // Update active tab if current selection becomes invalid
  if (availableTabs.length > 0 && (!activeTab || !availableTabs.includes(activeTab as any))) {
    setActiveTab(availableTabs[0]);
  }

  // Get current tab findings
  const currentTabFindings = useMemo(() => {
    const kind = activeTab as keyof typeof findingsByKind;
    return (findingsByKind[kind] || []) as typeof findingsToRender;
  }, [activeTab, findingsByKind]);

  // Calculate progress stages based on artifacts and status
  const progressStages = useMemo(() => {
    const stages = [
      { name: 'Crawl', completed: false },
      { name: 'Performance', completed: false },
      { name: 'Technical SEO', completed: false },
      { name: 'SEO Analysis', completed: false },
      { name: 'AI Summary', completed: false },
    ];

    if (run.status === 'completed' || run.status === 'partial' || run.status === 'failed') {
      return stages.map(s => ({ ...s, completed: true }));
    }

    // Check which artifacts exist to determine completed stages
    const hasScreenshots = run.artifacts?.some((a: Artifact) => a.type === 'screenshot' || a.type?.toString().toLowerCase() === 'screenshot') || false;
    const hasLighthouse = run.artifacts?.some((a: Artifact) => {
      const path = a.path?.toString().toLowerCase() || '';
      const meta = a.meta as any;
      return path.includes('lighthouse') || (meta?.lcp !== undefined || meta?.cls !== undefined || meta?.inp !== undefined);
    }) || false;
    const hasAxe = run.artifacts?.some((a: Artifact) => {
      const path = a.path?.toString().toLowerCase() || '';
      const meta = a.meta as any;
      return path.includes('axe') || (meta?.violationsCount !== undefined || meta?.contrastIssuesCount !== undefined);
    }) || false;
    // Heuristics findings are Performance findings that aren't from Axe (no contrast/tap target issues)
    const hasHeuristics = run.fallbackFindings.some(f => {
      const issueLower = f.issue.toLowerCase();
      return f.kind === 'Performance' &&
             !issueLower.includes('contrast') &&
             !issueLower.includes('tap target') &&
             !issueLower.includes('accessibility violation');
    }) || false;
    
    stages[0].completed = hasScreenshots; // Crawl
    stages[1].completed = hasLighthouse; // Performance
    stages[2].completed = hasAxe; // Technical SEO
    stages[3].completed = hasHeuristics; // SEO Analysis
    stages[4].completed = hasSummary; // AI Summary

    return stages;
  }, [run.status, run.artifacts, run.fallbackFindings, hasSummary]);

  // Only show progress bar when audit is actively in progress (queued or running)
  // Hide it when completed, partial, or failed (results are shown instead)
  const showProgressBar = run.status === 'queued' || run.status === 'running';

  const sortedScreenshots = useMemo(() => {
    if (!screenshotUrls) {
      return [];
    }
    return Object.entries(screenshotUrls)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([viewport, url]) => ({ viewport, url }));
  }, [screenshotUrls]);

  const handleDownloadPdf = () => {
    // Show email form first
    setShowPdfEmailForm(true);
  };

  const handlePdfEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pdfEmailInput.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pdfEmailInput)) {
      setError('Please enter a valid email address');
      return;
    }

    setIsDownloadingPdf(true);
    setError(null);
    
    try {
      // Send email with PDF
      const emailResponse = await fetch(`/api/audits/${runId}/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: pdfEmailInput.trim() }),
      });

      if (!emailResponse.ok) {
        const errorData = await emailResponse.json().catch(() => ({ error: 'Failed to send email' }));
        throw new Error(errorData.error || 'Failed to send email');
      }

      // Also download the PDF
      const pdfResponse = await fetch(`/api/reports/${runId}/pdf`);
      if (!pdfResponse.ok) {
        let errorMessage = 'Failed to generate PDF';
        try {
          const errorData = await pdfResponse.json();
          errorMessage = errorData.details || errorData.error || errorMessage;
        } catch {
          errorMessage = pdfResponse.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }
      
      const blob = await pdfResponse.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-report-${runId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setShowPdfEmailForm(false);
      setPdfEmailInput('');
    } catch (error) {
      console.error('Error downloading PDF:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to download PDF. Please try again.';
      setError(`PDF Download Error: ${errorMessage}`);
    } finally {
      setIsDownloadingPdf(false);
    }
  };


  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0A0A0A' }}>
      <div className="flex h-screen overflow-hidden">
        {/* Main content area - with right padding for chat only when audit is complete */}
        <div className={`flex-1 overflow-y-auto scrollbar-hide ${showProgressBar ? 'pr-0' : 'pr-0 lg:pr-[432px]'}`}>
          {showProgressBar ? (
            /* Centered layout when audit is running */
            <div className="flex flex-col items-center justify-center min-h-screen">
              <div className="mb-12">
                <img src="/Logo.svg" alt="Logo" className="h-8" />
              </div>
              {/* Progress Bar - Show only when audit is running */}
              <div className="text-center">
                <div className="flex items-center justify-center mb-6">
                  <h2 className="text-lg font-semibold" style={{ color: '#ffffff' }}>Progress</h2>
          </div>
                
                {/* Current Stage Text */}
                <p className="text-sm text-center mb-6" style={{ color: '#888888' }}>
                  {(() => {
                    const currentStage = progressStages.find(s => !s.completed);
                    if (!currentStage) return 'Finalizing audit report...';
                    if (currentStage.name === 'Crawl') return 'Collecting data from the website...';
                    if (currentStage.name === 'Performance') return 'Analyzing performance metrics...';
                    if (currentStage.name === 'Technical SEO') return 'Checking technical SEO issues...';
                    if (currentStage.name === 'SEO Analysis') return 'Analyzing SEO and GEO signals...';
                    if (currentStage.name === 'AI Summary') return 'Generating AI-powered SEO summary...';
                    return 'Processing...';
                  })()}
                </p>
                
                {/* Segmented Progress Bar */}
                <div className="flex items-center justify-center gap-3 mb-4">
                  {progressStages.map((stage, index) => {
                    const isActive = !stage.completed && progressStages.findIndex(s => !s.completed) === index;
                    return (
                      <div key={stage.name} className="flex flex-col items-center">
                        <div
                          className="w-32 h-2 rounded-full transition-all duration-500 relative overflow-hidden"
                          style={{
                            backgroundColor: stage.completed ? '#FB3B24' : isActive ? '#212121' : '#0F0F0F',
                          }}
                        >
                          {isActive && (
                            <div
                              className="absolute inset-0 rounded-full"
                              style={{
                                background: 'linear-gradient(90deg, transparent, rgba(251, 59, 36, 0.4), transparent)',
                                animation: 'shimmer 2s infinite',
                                transform: 'translateX(-100%)',
                              }}
                            />
                          )}
                        </div>
                        <span
                          className="text-xs mt-2 font-medium transition-all duration-300"
                          style={{
                            color: stage.completed ? '#FB3B24' : isActive ? '#FB3B24' : '#666666',
                            fontWeight: isActive ? 600 : 500,
                          }}
                        >
                          {stage.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
                
                {/* Message below progress bar */}
                <p className="text-sm text-center mt-6" style={{ color: '#666666' }}>
                  Analyzing your website... this may take a few minutes
                </p>
              </div>
            </div>
          ) : (
            /* Normal layout when audit is complete */
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
        {/* Header - Centered when running, normal layout when complete */}
        {false ? (
          <div className="flex justify-center">
            <img src="/Logo.svg" alt="Logo" className="h-8" />
          </div>
        ) : (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <img src="/Logo.svg" alt="Logo" className="h-8" />
          </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:justify-end">
              {(run.status === 'completed' || run.status === 'partial' || run.status === 'failed') && (
              <div className="flex flex-row gap-2">
                  <button
                    onClick={() => {
                      console.log('Download Audit button clicked, chatRef:', chatRef.current);
                      if (chatRef.current) {
                        chatRef.current.openLeadForm();
                      } else {
                        console.error('chatRef.current is null');
                      }
                    }}
                    className="inline-flex items-center justify-center px-4 py-3 text-sm font-normal border border-transparent rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all hover:opacity-90"
                    style={{ height: '42px', boxSizing: 'border-box', backgroundColor: '#FB3B24', color: '#ffffff' }}
                  >
                    Download Audit
                  </button>
                {showPdfEmailForm && (
                  <form onSubmit={handlePdfEmailSubmit} className="flex gap-2 items-center">
                    <input
                      type="email"
                      value={pdfEmailInput}
                      onChange={(e) => setPdfEmailInput(e.target.value)}
                      placeholder="your@email.com"
                      required
                      className="min-w-[300px] px-3 text-sm bg-transparent border-0 border-b border-b-gray-400 rounded-none focus:outline-none focus:border-b-gray-300"
                      style={{ color: '#ffffff', paddingTop: '0.75rem', paddingBottom: '0.75rem', height: '42px', boxSizing: 'border-box', lineHeight: '1.5' }}
                      disabled={isDownloadingPdf}
                    />
                    <button
                      type="submit"
                      disabled={isDownloadingPdf || !pdfEmailInput.trim()}
                      className="px-4 py-3 text-sm font-normal rounded-full disabled:cursor-not-allowed transition-all hover:opacity-90"
                      style={{ backgroundColor: (isDownloadingPdf || !pdfEmailInput.trim()) ? '#0F0F0F' : '#FB3B24', color: (isDownloadingPdf || !pdfEmailInput.trim()) ? '#666666' : '#ffffff', height: '42px', boxSizing: 'border-box' }}
                    >
                      {isDownloadingPdf ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 inline" style={{ color: isDownloadingPdf ? '#666666' : '#ffffff' }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Sending...
                        </>
                      ) : (
                        'Send & Download'
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowPdfEmailForm(false);
                        setPdfEmailInput('');
                      }}
                      className="text-sm hover:text-white transition-colors ml-auto"
                      style={{ color: '#888888' }}
                      disabled={isDownloadingPdf}
                    >
                      Cancel
                    </button>
                  </form>
                )}
                </div>
              )}
            </div>
          </div>
        )}
        
              {/* Divider */}
              <div className="border-b mb-16" style={{ borderColor: '#0F0F0F' }}></div>

        {/* Show content only when audit is complete */}
        {(run.status === 'completed' || run.status === 'partial' || run.status === 'failed') && (
          <>
            {/* Header Screenshot + Lighthouse Results - Side by Side */}
            {screenshotUrls?.desktop && (
          <div className="mb-12 pt-16">
            <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div>
                <h2 className="text-5xl font-light mb-1" style={{ color: '#ffffff' }}>Performance Overview</h2>
                <p className="text-base font-light max-w-5xl line-clamp-2" style={{ color: '#888888' }}>
                  Visual preview and key performance metrics
                </p>
              </div>
              <div className="flex-shrink-0 text-right">
                <p className="text-gray-300 text-xs font-light uppercase mb-1" style={{ letterSpacing: '0.15em' }}>Website Audited</p>
                <a 
                  href={run.target} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="font-normal text-white hover:underline transition-colors cursor-pointer inline-block" 
                  style={{ color: '#ffffff' }} 
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#FB3B24'; }} 
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#ffffff'; }}
                >
                  {run.target}
                </a>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: Header Screenshot (no pins) - Show only top 500px of full page screenshot */}
              <div 
                className="overflow-hidden" 
                style={{ 
                  backgroundColor: '#0A0A0A',
                  height: '500px',
                  overflow: 'hidden',
                  position: 'relative',
                  width: '100%',
                  borderRadius: '1rem'
                }}
              >
                {screenshotUrls.desktop ? (
                  blockedStatusState?.desktop ? (
                    <div className="flex flex-col items-center justify-center h-full" style={{ color: '#888888', border: '1px solid #0F0F0F' }}>
                      <p className="text-sm font-medium">No Preview Available</p>
                      <p className="text-xs mt-1 opacity-75">Access to this website was blocked</p>
                    </div>
                  ) : (
                    <div style={{ width: '100%', height: '500px', overflow: 'hidden' }}>
                      <img
                        src={screenshotUrls.desktop}
                        alt="Website header"
                        style={{ 
                          width: '100%',
                          height: 'auto',
                          display: 'block',
                          margin: 0,
                          padding: 0
                        }}
                        onError={(e) => {
                          console.error('Failed to load screenshot:', screenshotUrls.desktop);
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                  )
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-400">
                    Screenshot loading...
                  </div>
                )}
                  </div>

              {/* Right: Lighthouse Results */}
              {(() => {
                // Debug: Log all artifacts to see what we have
                if (process.env.NODE_ENV === 'development') {
                  console.log('[Core Web Vitals] All artifacts:', run.artifacts);
                  console.log('[Core Web Vitals] Artifacts count:', run.artifacts?.length || 0);
                  run.artifacts?.forEach((a: any, idx: number) => {
                    console.log(`[Core Web Vitals] Artifact ${idx}:`, {
                      type: a.type,
                      path: a.path,
                      hasMeta: !!a.meta,
                      metaType: typeof a.meta,
                      metaKeys: a.meta ? Object.keys(a.meta) : [],
                      metaLcp: a.meta?.lcp,
                      metaCls: a.meta?.cls,
                      metaInp: a.meta?.inp,
                    });
                  });
                }

                // Find Lighthouse artifact - check meta for lighthouse metrics (lcp, cls, inp)
                // The artifact type is 'json' and meta contains lcp, cls, inp, tbt
                const lighthouseArtifact = run.artifacts?.find(
                  (a: any) => {
                    if (!a) return false;
                    
                    // Check type (handle both string and enum)
                    const artifactType = a.type?.toString().toLowerCase();
                    if (artifactType !== 'json') return false;
                    
                    // Check if meta contains lighthouse metrics
                    if (a.meta && typeof a.meta === 'object' && a.meta !== null) {
                      // Check for numeric lighthouse metrics (they should be numbers, not null/undefined)
                      const lcp = a.meta.lcp;
                      const cls = a.meta.cls;
                      const inp = a.meta.inp;
                      
                      const hasLcp = typeof lcp === 'number' && !isNaN(lcp);
                      const hasCls = typeof cls === 'number' && !isNaN(cls);
                      const hasInp = typeof inp === 'number' && !isNaN(inp);
                      
                      if (hasLcp || hasCls || hasInp) {
                        if (process.env.NODE_ENV === 'development') {
                          console.log('[Core Web Vitals] Found Lighthouse artifact by metrics:', a);
                        }
                        return true;
                      }
                    }
                    
                    // Fallback: check if path contains lighthouse
                    const artifactPath = a.path?.toString().toLowerCase() || '';
                    if (artifactPath.includes('lighthouse')) {
                      if (process.env.NODE_ENV === 'development') {
                        console.log('[Core Web Vitals] Found Lighthouse artifact by path:', a);
                      }
                      return true;
                    }
                    return false;
                  }
                );
                
                if (process.env.NODE_ENV === 'development') {
                  console.log('[Core Web Vitals] Lighthouse artifact found:', lighthouseArtifact);
                }
                
                const lighthouseMetrics = lighthouseArtifact?.meta as any;
                
                if (process.env.NODE_ENV === 'development') {
                  console.log('[Core Web Vitals] Lighthouse metrics:', lighthouseMetrics);
                }

                // Check if we have valid metrics (including 0, which is valid)
                const hasValidMetrics = lighthouseMetrics && (
                  (typeof lighthouseMetrics.lcp === 'number' && !isNaN(lighthouseMetrics.lcp)) ||
                  (typeof lighthouseMetrics.cls === 'number' && !isNaN(lighthouseMetrics.cls)) ||
                  (typeof lighthouseMetrics.inp === 'number' && !isNaN(lighthouseMetrics.inp))
                );

                if (!lighthouseArtifact || !hasValidMetrics) {
                  // Show placeholder if no Lighthouse data yet
                  if (process.env.NODE_ENV === 'development') {
                    console.log('[Core Web Vitals] No valid metrics found. Artifact:', lighthouseArtifact, 'Metrics:', lighthouseMetrics);
                    console.log('[Core Web Vitals] Audit status:', run.status);
                    console.log('[Core Web Vitals] All artifact types:', run.artifacts?.map((a: any) => a.type));
                    console.log('[Core Web Vitals] SummaryJson:', run.summaryJson);
                  }
                  
                  // Check if audit is partial (some jobs may have failed)
                  const isPartial = run.status === 'partial';
                  
                  // Check if there's a Lighthouse error in summaryJson
                  const lighthouseError = run.summaryJson && typeof run.summaryJson === 'object' && 'lighthouseError' in run.summaryJson
                    ? (run.summaryJson as any).lighthouseError
                    : null;
                  
                  return (
                    <div className="rounded-lg p-6 shadow-lg" style={{ backgroundColor: '#F5F5F5' }}>
                      <h3 className="text-xl font-light mb-4" style={{ color: '#0A0A0A' }}>Core Web Vitals</h3>
                      <div className="text-sm" style={{ color: '#666666' }}>
                        {isPartial
                          ? 'Lighthouse analysis failed. The audit completed with partial results.'
                          : run.status === 'failed'
                          ? 'Lighthouse analysis failed. Check the audit error details.'
                          : 'Lighthouse results are not available. The Lighthouse job may have failed silently.'}
                      </div>
                      {lighthouseError && (
                        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                          <p className="text-xs font-medium text-red-800 mb-1">Lighthouse Error:</p>
                          <p className="text-xs text-red-700">{lighthouseError.message}</p>
                          {lighthouseError.stack && (
                            <details className="mt-2">
                              <summary className="text-xs text-red-600 cursor-pointer">Show stack trace</summary>
                              <pre className="text-xs text-red-600 mt-1 whitespace-pre-wrap break-words overflow-x-auto">
                                {lighthouseError.stack}
                              </pre>
                            </details>
                )}
              </div>
            )}
                      {isPartial && !lighthouseError && (
                        <div className="mt-3 text-xs" style={{ color: '#666666' }}>
                          <p>Tip: Check the worker terminal logs for more details about the Lighthouse failure.</p>
          </div>
                      )}
        </div>
                  );
                }

                const getScoreColor = (value: number, threshold: number, isLowerBetter: boolean = true) => {
                  const isGood = isLowerBetter ? value <= threshold : value >= threshold;
                  return isGood ? '#4ADE80' : '#ff9595';
                };

                return (
                  <div style={{ height: '500px', display: 'flex', flexDirection: 'column' }}>
                    <div className="grid grid-cols-2 gap-4 flex-1">
                      {/* LCP Card */}
                      <div className="rounded-xl p-5 flex flex-col" style={{ backgroundColor: '#0F0F0F', border: '1px solid #212121' }}>
                        <div className="text-sm uppercase tracking-wider mb-1" style={{ color: '#ffffff' }}>LCP</div>
                        <div className="text-sm mb-2" style={{ color: '#666666' }}>How long it takes for the main content to appear</div>
                        <div className="mt-auto">
                          <div 
                            className="text-6xl font-light mb-1"
                            style={{ color: getScoreColor(lighthouseMetrics.lcp, 2.5) }}
                          >
                            {lighthouseMetrics.lcp?.toFixed(2)}s
          </div>
                          <div className="text-sm mt-1" style={{ color: '#212121' }}>
                            Target: &lt;2.5s
                          </div>
                        </div>
                      </div>

                      {/* CLS Card */}
                      <div className="rounded-xl p-5 flex flex-col" style={{ backgroundColor: '#0F0F0F', border: '1px solid #212121' }}>
                        <div className="text-sm uppercase tracking-wider mb-1" style={{ color: '#ffffff' }}>CLS</div>
                        <div className="text-sm mb-2" style={{ color: '#666666' }}>How much the page shifts while loading</div>
                        <div className="mt-auto">
                          <div 
                            className="text-6xl font-light mb-1"
                            style={{ color: getScoreColor(lighthouseMetrics.cls, 0.1) }}
                          >
                            {lighthouseMetrics.cls?.toFixed(3)}
            </div>
                          <div className="text-sm mt-1" style={{ color: '#212121' }}>
                            Target: &lt;0.1
                          </div>
                        </div>
                      </div>

                      {/* INP Card */}
                      <div className="rounded-xl p-5 flex flex-col" style={{ backgroundColor: '#0F0F0F', border: '1px solid #212121' }}>
                        <div className="text-sm uppercase tracking-wider mb-1" style={{ color: '#ffffff' }}>INP</div>
                        <div className="text-sm mb-2" style={{ color: '#666666' }}>How responsive the page feels when you interact with it</div>
                        <div className="mt-auto">
                          <div 
                            className="text-6xl font-light mb-1"
                            style={{ color: getScoreColor(lighthouseMetrics.inp, 200) }}
                          >
                            {lighthouseMetrics.inp?.toFixed(0)}ms
            </div>
                          <div className="text-sm mt-1" style={{ color: '#212121' }}>
                            Target: &lt;200ms
                          </div>
                        </div>
                      </div>

                      {/* TBT Card */}
                      {lighthouseMetrics.tbt ? (
                        <div className="rounded-xl p-5 flex flex-col" style={{ backgroundColor: '#0F0F0F', border: '1px solid #212121' }}>
                          <div className="text-sm uppercase tracking-wider mb-1" style={{ color: '#ffffff' }}>TBT</div>
                          <div className="text-sm mb-2" style={{ color: '#666666' }}>How long the page is blocked from responding</div>
                          <div className="mt-auto">
                            <div 
                              className="text-6xl font-light mb-1"
                              style={{ color: getScoreColor(lighthouseMetrics.tbt, 200) }}
                            >
                              {lighthouseMetrics.tbt?.toFixed(0)}ms
                            </div>
                            <div className="text-sm mt-1" style={{ color: '#212121' }}>
                              Target: &lt;200ms
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl p-5 flex flex-col" style={{ backgroundColor: '#0F0F0F', border: '1px solid #212121' }}>
                          <div className="text-xs uppercase tracking-wider mb-1" style={{ color: '#666666' }}>Total Size</div>
                          <div className="mt-auto">
                            <div className="text-6xl font-light mb-1" style={{ color: '#4ADE80' }}>
                              {(lighthouseMetrics.totalBytes / 1024 / 1024).toFixed(2)} MB
                            </div>
                            <div className="text-sm" style={{ color: '#666666' }}>
                              Page Size
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}


        {error && (
          <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
            {error}
          </div>
        )}

        {/* Show findings if we have any (from database) - even before summary is ready */}
        {fallbackHasFindings || hasFindings ? (
          <div className="space-y-8">
            <section className="space-y-6">
              <div className="mb-6 mt-24">
                <div>
                  <h2 className="text-5xl font-light mb-1" style={{ color: '#ffffff' }}>Findings</h2>
                  {hasSummary && run.summaryJson && (
                    <p className="text-base font-light max-w-5xl line-clamp-2" style={{ color: '#888888' }}>
                      {run.stats.highImpactFindings > 0 && `${run.stats.highImpactFindings} high-impact ${run.stats.highImpactFindings === 1 ? 'issue' : 'issues'} found. `}
                      {findingsToRender.length > 0 && `This audit identified ${findingsToRender.length} SEO ${findingsToRender.length === 1 ? 'issue' : 'issues'} across technical health, on-page optimization, performance, and link structure. `}
                      <br />
                      Review the findings below to prioritize fixes and improve your search&nbsp;visibility.
                    </p>
                  )}
                </div>
              </div>

              {/* Tabs for different assignment types - show when there are multiple categories */}
              {availableTabs.length > 1 && (
                <div className="border-b border-gray-600 mb-6">
                  <nav className="-mb-px flex space-x-8 overflow-x-auto scrollbar-hide" aria-label="Tabs">
                    {availableTabs.map((tab) => {
                      const tabFindings = findingsByKind[tab] || [];
                      const isActive = activeTab === tab;
                      
                      return (
                        <button
                          key={tab}
                          onClick={() => setActiveTab(tab)}
                          className={`
                            whitespace-nowrap py-4 px-1 border-b-2 font-light text-xs uppercase
                            ${isActive
                              ? ''
                              : 'border-transparent hover:border-[#FB3B24]'
                            }
                          `}
                          style={{ 
                            letterSpacing: '0.15em', 
                            color: isActive ? '#ffffff' : '#777777',
                            borderBottomColor: isActive ? '#FB3B24' : undefined
                          }}
                        >
                          {tab.toUpperCase()}
                          {tabFindings.length > 0 && (
                            <span className={`
                              ml-2 py-0.5 px-2.5 rounded-full text-xs font-medium
                              ${isActive
                                ? ''
                                : 'text-gray-400'
                              }
                            `}
                            style={isActive ? { backgroundColor: 'rgba(251, 59, 36, 0.2)', color: '#FB3B24' } : { backgroundColor: '#0F0F0F' }}
                            >
                              {tabFindings.length}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </nav>
                </div>
              )}

              {/* Show category label when there's only one tab */}
              {availableTabs.length === 1 && activeTab && (
                <div className="mb-4">
                  <p className="text-xs font-light text-white uppercase" style={{ letterSpacing: '0.15em' }}>
                    Assign To: {activeTab.toUpperCase()}
                  </p>
                </div>
              )}

              {/* Current tab findings - show findings for active tab, or all if single category */}
              {(() => {
                // Determine which findings to show
                const findingsToShow = availableTabs.length === 1 
                  ? findingsToRender 
                  : (activeTab ? currentTabFindings : []);
                
                const findingsToShowCount = findingsToShow.length;
                
                if (findingsToShowCount === 0) {
                  return (
                    <div className="text-center py-12 text-gray-400">
                      No findings in this category
                    </div>
                  );
                }
                
                return (
                  <>
                    <AuditTable
                      findings={findingsToShow.map(f => ({
                        issue: f.issue,
                        why: f.why,
                        fix: f.fix,
                        impact: f.impact,
                        effort: f.effort,
                        kind: f.kind,
                        evidenceRefs: f.evidenceRefs || [],
                      }))}
                      onExplainFinding={(finding) => {
                        const message = `Can you explain this finding to me: "${finding.issue}". Why does it matter and how should I fix it?`;
                        chatRef.current?.sendMessage(message);
                      }}
                    />
                  </>
                );
              })()}
            </section>

            {/* Action Plan — Firon's Three-Phase Methodology */}
            {run.summaryJson?.plan && (
              <FindingsPlan plan={run.summaryJson.plan} />
            )}

            {/* Locked Premium Data Section */}
            {isAuditDone && findingsToRender.length > 0 && (
              <div className="mt-12 relative">
                <div className="rounded-xl p-8 relative overflow-hidden" style={{ backgroundColor: '#0F0F0F', border: '1px solid #212121' }}>
                  {/* Blur overlay */}
                  <div className="absolute inset-0 backdrop-blur-[2px]" style={{ backgroundColor: 'rgba(15, 15, 15, 0.4)' }} />

                  {/* Blurred fake data behind */}
                  <div className="opacity-30 select-none pointer-events-none">
                    <div className="grid grid-cols-3 gap-4 mb-6">
                      <div className="rounded-lg p-4" style={{ backgroundColor: '#0A0A0A' }}>
                        <div className="text-xs mb-1" style={{ color: '#666666' }}>Domain Authority</div>
                        <div className="text-3xl font-light" style={{ color: '#FB3B24' }}>██</div>
                      </div>
                      <div className="rounded-lg p-4" style={{ backgroundColor: '#0A0A0A' }}>
                        <div className="text-xs mb-1" style={{ color: '#666666' }}>Backlink Trust Flow</div>
                        <div className="text-3xl font-light" style={{ color: '#FBBF24' }}>██</div>
                      </div>
                      <div className="rounded-lg p-4" style={{ backgroundColor: '#0A0A0A' }}>
                        <div className="text-xs mb-1" style={{ color: '#666666' }}>Competitor Gap</div>
                        <div className="text-3xl font-light" style={{ color: '#4ADE80' }}>██ keywords</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="rounded-lg p-4" style={{ backgroundColor: '#0A0A0A' }}>
                        <div className="text-xs mb-1" style={{ color: '#666666' }}>Branded vs Non-Branded Traffic</div>
                        <div className="h-4 rounded-full" style={{ backgroundColor: '#212121' }}><div className="h-4 rounded-full w-1/3" style={{ backgroundColor: '#FB3B24' }} /></div>
                      </div>
                      <div className="rounded-lg p-4" style={{ backgroundColor: '#0A0A0A' }}>
                        <div className="text-xs mb-1" style={{ color: '#666666' }}>Backlink Velocity (30d)</div>
                        <div className="h-4 rounded-full" style={{ backgroundColor: '#212121' }}><div className="h-4 rounded-full w-2/3" style={{ backgroundColor: '#FBBF24' }} /></div>
                      </div>
                    </div>
                  </div>

                  {/* Lock overlay content */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: 'rgba(251, 59, 36, 0.15)' }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect x="3" y="11" width="18" height="11" rx="2" stroke="#FB3B24" strokeWidth="2"/>
                        <path d="M7 11V7C7 4.23858 9.23858 2 12 2C14.7614 2 17 4.23858 17 7V11" stroke="#FB3B24" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    </div>
                    <h3 className="text-xl font-medium mb-2" style={{ color: '#ffffff' }}>Off-Page Authority &amp; Competitor Market Share</h3>
                    <p className="text-sm max-w-lg mb-6" style={{ color: '#888888' }}>
                      This automated scan checks your technical foundation. However, it cannot extract your proprietary Domain Authority, Backlink Velocity, or Branded vs. Non-Branded traffic splits. To see exactly how much market share you are losing to competitors, request a Deep-Dive Manual Audit.
                    </p>
                    <a
                      href="https://fironmarketing.com/audit"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-6 py-3 text-sm font-medium rounded-full transition-all hover:opacity-90"
                      style={{ backgroundColor: '#FB3B24', color: '#ffffff' }}
                    >
                      Unlock Enterprise Data — Speak to an Analyst
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : null}
            
            {/* Failed status message - show when audit failed */}
            {run.status === 'failed' && (
          <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm text-center">
            <p className="text-lg font-medium mb-2" style={{ color: '#0A0A0A' }}>Audit Failed</p>
                <p className="text-gray-600 mb-4">
              The audit failed. Please retry or check the worker logs.
            </p>
                {run.summaryJson && typeof run.summaryJson === 'object' && 'error' in run.summaryJson ? (
                  <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-left">
                    <p className="text-sm font-medium text-red-800 mb-2">Error Details:</p>
                    <div className="text-xs text-red-700 whitespace-pre-wrap break-words">
                      {(run.summaryJson as any).error?.message || JSON.stringify((run.summaryJson as any).error, null, 2)}
                    </div>
                    {(run.summaryJson as any).error?.stack && (
                      <details className="mt-2">
                        <summary className="text-xs text-red-600 cursor-pointer">Show stack trace</summary>
                        <pre className="text-xs text-red-600 mt-2 whitespace-pre-wrap break-words">
                          {(run.summaryJson as any).error.stack}
                        </pre>
                      </details>
                    )}
          </div>
        ) : (
                  <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-left">
                    <p className="text-sm font-medium text-yellow-800 mb-2">No error details available</p>
                    <p className="text-xs text-yellow-700">
                      Check the worker terminal logs for more information about what went wrong.
            </p>
          </div>
        )}
          </div>
            )}
          </>
        )}
            </div>
          )}
        </div>

        {/* Chat panel - Fixed on right side, full height with margins - Only show when audit is complete */}
        {(run.status === 'completed' || run.status === 'partial' || run.status === 'failed') && (
        <div className="hidden lg:block fixed right-4 top-4 bottom-4 w-[400px] rounded-3xl flex-shrink-0 z-40 shadow-lg overflow-hidden" style={{ backgroundColor: '#0F0F0F', border: '1px solid #212121' }}>
          <AuditChat
            ref={chatRef}
            runId={runId}
            findings={findingsToRender.map(f => ({
              issue: f.issue,
              why: f.why,
              fix: f.fix,
              impact: f.impact,
              effort: f.effort,
              kind: f.kind,
            }))}
            summary={run.summaryJson}
            stats={run.stats}
            target={run.target}
            status={run.status}
          />
        </div>
        )}
      </div>
    </div>
  );
}

