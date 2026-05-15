'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useRef } from 'react';
import { AuditTable } from './AuditTable';
import { AuditChat, type AuditChatRef } from './AuditChat';
import { FindingsPlan } from './FindingsPlan';

type AuditStatus = 'queued' | 'running' | 'partial' | 'completed' | 'failed';

type Pass = {
  title: string;
  detail: string;
  category?: 'Technical SEO' | 'On-Page SEO' | 'Performance' | 'Links';
  evidence?: string;
};

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
    scaleAuthority?: string[];
    experiments: Array<{ hypothesis: string; variant: string; metric: string; risk?: string }>;
  };
  passes?: Pass[];
};

type Artifact = { type: string; path: string; meta: Record<string, unknown> | null };

type AuditRun = {
  id: string;
  target: string;
  status: AuditStatus;
  startedAt: string | null;
  completedAt: string | null;
  summaryJson: Summary | null;
  fallbackFindings: Summary['findings'];
  stats: { findingsCount: number; artifactsCount: number; highImpactFindings: number };
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

function normalizeKind(kind: string): 'Technical SEO' | 'On-Page SEO' | 'Performance' | 'Links' {
  const k = kind.toLowerCase().trim();
  if (k === 'technicalseo' || k === 'technical seo') return 'Technical SEO';
  if (k === 'onpageseo' || k === 'on-page seo' || k === 'on page seo') return 'On-Page SEO';
  if (k === 'performance' || k === 'perf' || k === 'speed') return 'Performance';
  if (k === 'links' || k === 'link') return 'Links';
  if (k === 'marketing strategy' || k === 'marketingstrategy') return 'Technical SEO';
  if (['copywriting','copy','messaging','headline','cta'].includes(k)) return 'On-Page SEO';
  if (['ux/ui','uxui','a11y','accessibility','ux','ui','usability','design','visual'].includes(k)) return 'Performance';
  if (['motion','animation','transition','generalist','general'].includes(k)) return 'Performance';
  return 'Performance';
}

function shortHost(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return url; }
}

function lighthouseScore(value: number | undefined, thresholds: { good: number; warn: number }) {
  if (value === undefined || value === null) return 'unknown';
  if (value <= thresholds.good) return 'good';
  if (value <= thresholds.warn) return 'warn';
  return 'bad';
}

export function AuditRunViewer({ runId, initialRun, screenshotUrls: initialScreenshotUrls, blockedStatus }: Props) {
  const [run, setRun] = useState<AuditRun>(initialRun);
  const [screenshotUrls, setScreenshotUrls] = useState<Record<string, string>>(initialScreenshotUrls || {});
  const [blockedStatusState, setBlockedStatusState] = useState<Record<string, boolean>>(blockedStatus || {});
  const [error, setError] = useState<string | null>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const chatRef = useRef<AuditChatRef>(null);
  const prevFindingsCount = useRef(0);
  const stablePollCount = useRef(0);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      try {
        const response = await fetch(`/api/audits/${runId}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
        const data = (await response.json()) as AuditRun;
        if (!active) return;
        setRun(data);
        if (data.screenshotUrls) setScreenshotUrls((prev) => ({ ...prev, ...data.screenshotUrls }));
        if (data.blockedStatus) setBlockedStatusState(data.blockedStatus);
        setError(null);

        const isDone = data.status === 'completed' || data.status === 'partial' || data.status === 'failed';
        const currentFindings = data.fallbackFindings?.length || 0;
        if (!isDone) {
          prevFindingsCount.current = 0;
          stablePollCount.current = 0;
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        } else if (currentFindings === 0) {
          stablePollCount.current = 0;
          timer = setTimeout(poll, 2000);
        } else if (currentFindings === prevFindingsCount.current) {
          stablePollCount.current += 1;
          if (stablePollCount.current < 2) timer = setTimeout(poll, 2000);
        } else {
          prevFindingsCount.current = currentFindings;
          stablePollCount.current = 0;
          timer = setTimeout(poll, 2000);
        }
      } catch {
        if (active) {
          setError('Connection lost while checking the audit progress. Retrying…');
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      }
    };
    poll();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [runId]);

  const isAuditDone = run.status === 'completed' || run.status === 'partial' || run.status === 'failed';
  const hasSummary = Boolean(run.summaryJson);

  const findingsToRender = useMemo(() => {
    if (!isAuditDone) return [];
    const dbFindings = run.fallbackFindings.map((f) => ({ ...f, kind: normalizeKind(f.kind || 'Performance') }));
    return dbFindings.sort((a, b) => {
      const order: Record<string, number> = { High: 3, Medium: 2, Low: 1 };
      const diff = (order[b.impact] || 0) - (order[a.impact] || 0);
      if (diff !== 0) return diff;
      return a.issue.localeCompare(b.issue);
    });
  }, [run.fallbackFindings, isAuditDone]);

  const findingsByKind = useMemo(() => {
    const groups: Record<string, typeof findingsToRender> = { 'Technical SEO': [], 'On-Page SEO': [], 'Performance': [], 'Links': [] };
    findingsToRender.forEach(f => { (groups[f.kind] || groups['Performance']).push(f); });
    return groups;
  }, [findingsToRender]);

  const availableTabs = useMemo(() => {
    return (['Technical SEO','On-Page SEO','Performance','Links'] as const).filter(k => findingsByKind[k].length > 0);
  }, [findingsByKind]);

  const [activeTab, setActiveTab] = useState<string>(() => availableTabs[0] || '');
  if (availableTabs.length > 0 && (!activeTab || !availableTabs.includes(activeTab as any))) {
    setActiveTab(availableTabs[0]);
  }
  const currentTabFindings = (findingsByKind[activeTab as keyof typeof findingsByKind] || []) as typeof findingsToRender;

  const progressStages = useMemo(() => {
    const stages = [
      { name: 'AI Search', completed: false },
      { name: 'Technical Infrastructure', completed: false },
      { name: 'Brand Authority', completed: false },
    ];
    if (isAuditDone) return stages.map(s => ({ ...s, completed: true }));
    const hasScreenshots = run.artifacts?.some((a) => a.type === 'screenshot') || false;
    const hasAxe = run.artifacts?.some((a) => {
      const path = a.path?.toString().toLowerCase() || '';
      const meta = a.meta as any;
      return path.includes('axe') || (meta?.violationsCount !== undefined || meta?.contrastIssuesCount !== undefined);
    }) || false;
    stages[0].completed = hasScreenshots;
    stages[1].completed = hasAxe;
    stages[2].completed = hasSummary;
    return stages;
  }, [run.artifacts, hasSummary, isAuditDone]);

  const lighthouseArtifact = run.artifacts.find(a => a.type === 'json' && (a.meta as any)?.lcp !== undefined);
  const lighthouse = (lighthouseArtifact?.meta as any) || null;

  const handleDownloadPdf = async () => {
    setIsDownloadingPdf(true);
    setError(null);
    try {
      const pdfResponse = await fetch(`/api/reports/${runId}/pdf`);
      if (!pdfResponse.ok) {
        const err = await pdfResponse.json().catch(() => ({ error: 'PDF not available' }));
        throw new Error(err.error || 'Failed to download PDF');
      }
      const blob = await pdfResponse.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const clean = (run.target || 'audit').replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/[^a-z0-9]/gi, '-');
      a.download = `firon-audit-${clean}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to download PDF. Please try again.';
      setError(`PDF Download Error: ${msg}`);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  // ============== IN-PROGRESS STATE ==============
  if (!isAuditDone || findingsToRender.length === 0) {
    const currentStage = progressStages.find(s => !s.completed);
    const stageLabel = currentStage
      ? currentStage.name === 'AI Search' ? 'Connecting to AI search engines'
        : currentStage.name === 'Technical Infrastructure' ? 'Analyzing technical infrastructure'
        : 'Compiling brand authority'
      : 'Compiling findings';
    return (
      <div className="ed-col">
        <header className="ed-head" style={{ textAlign: 'center' }}>
          <div className="ed-eyebrow" style={{ justifyContent: 'center' }}>
            <span className="dot" style={{ background: 'var(--accent)' }} />
            Audit in progress
          </div>
          <h1 className="ed-display">Running your AI readiness audit.</h1>
          <p className="ed-lede" style={{ marginLeft: 'auto', marginRight: 'auto' }}>
            {stageLabel}. This usually takes 60 seconds — we&apos;ll redirect you the moment your report is ready.
          </p>
        </header>
        <div className="ed-progress">
          {progressStages.map((stage, i) => {
            const isActive = !stage.completed && progressStages.findIndex(s => !s.completed) === i;
            return (
              <div key={stage.name} className={'ed-progress-stage' + (stage.completed ? ' done' : isActive ? ' active' : '')}>
                <div className={'ed-progress-bar' + (stage.completed ? ' done' : isActive ? ' active' : '')} />
                <span className="ed-progress-label">{stage.name}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ============== FAILED STATE ==============
  if (run.status === 'failed') {
    return (
      <div className="ed-col">
        <header className="ed-head" style={{ textAlign: 'center' }}>
          <div className="ed-eyebrow" style={{ justifyContent: 'center' }}>
            <span className="dot" style={{ background: 'var(--neg)' }} />
            Audit failed
          </div>
          <h1 className="ed-display">Something went wrong.</h1>
          <p className="ed-lede" style={{ marginLeft: 'auto', marginRight: 'auto' }}>
            The audit didn&apos;t complete. Please retry, or contact the team if this keeps happening.
          </p>
          <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center' }}>
            <Link href="/" className="ed-btn" style={{ width: 'auto' }}>Run another audit</Link>
          </div>
        </header>
      </div>
    );
  }

  // ============== COMPLETED REPORT ==============
  const lcp = lighthouse?.lcp as number | undefined;
  const cls = lighthouse?.cls as number | undefined;
  const inp = lighthouse?.inp as number | undefined;
  const tbt = lighthouse?.tbt as number | undefined;
  const reportDate = run.completedAt ? new Date(run.completedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';

  return (
    <div className="ed-with-rail">
      <div className="ed-col-report">
        <header className="ed-head">
          <div className="ed-eyebrow">
            <span className="dot" />
            AI Readiness Report{reportDate ? ` · ${reportDate}` : ''}
          </div>
          <h1 className="ed-display">
            How <em>{shortHost(run.target)}</em> reads to AI agents.
          </h1>
          <p className="ed-lede">
            We crawled your site the way modern AI search engines do, ran a full technical audit, and
            graded {run.stats.findingsCount} {run.stats.findingsCount === 1 ? 'issue' : 'issues'}
            {run.stats.highImpactFindings > 0 ? ` — ${run.stats.highImpactFindings} high-impact` : ''}.
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 24, flexWrap: 'wrap' }}>
            <button onClick={handleDownloadPdf} disabled={isDownloadingPdf} className="ed-btn" style={{ width: 'auto' }}>
              {isDownloadingPdf ? 'Preparing PDF…' : 'Download report'}
            </button>
            <a href={run.target} target="_blank" rel="noopener noreferrer"
              className="ed-btn" style={{ width: 'auto', background: 'transparent', borderColor: 'var(--line)', color: 'var(--text)' }}>
              Open audited site ↗
            </a>
          </div>
        </header>

        {error && <div className="ed-error">{error}</div>}

        {/* 01 — The snapshot */}
        {(screenshotUrls?.desktop || lighthouse) && (
          <section className="ed-section">
            <div className="ed-chapter">
              <span className="ed-chapter-num">01</span>
              <h2 className="ed-chapter-title">The snapshot</h2>
            </div>
            {screenshotUrls?.desktop ? (
              <div className="ed-screenshot" style={{ marginBottom: 28 }}>
                <img src={screenshotUrls.desktop} alt={`${shortHost(run.target)} screenshot`} />
              </div>
            ) : blockedStatusState?.desktop ? (
              <div className="ed-screenshot" style={{ marginBottom: 28 }}>
                <div className="blocked">
                  <span>No preview available</span>
                  <span className="sub">The site blocked our crawler</span>
                </div>
              </div>
            ) : null}
            {lighthouse && (
              <div className="ed-stats">
                <div className="ed-stat">
                  <div className={'num ' + lighthouseScore(lcp, { good: 2.5, warn: 4 })}>
                    {lcp !== undefined ? lcp.toFixed(1) : '—'}<span className="unit">s</span>
                  </div>
                  <div className="lbl">Largest contentful paint</div>
                  <div className="target">Target ≤ 2.5s</div>
                </div>
                <div className="ed-stat">
                  <div className={'num ' + lighthouseScore(cls, { good: 0.1, warn: 0.25 })}>
                    {cls !== undefined ? cls.toFixed(2) : '—'}
                  </div>
                  <div className="lbl">Cumulative layout shift</div>
                  <div className="target">Target ≤ 0.1</div>
                </div>
                <div className="ed-stat">
                  <div className={'num ' + lighthouseScore(inp, { good: 200, warn: 500 })}>
                    {inp !== undefined ? Math.round(inp) : '—'}<span className="unit">ms</span>
                  </div>
                  <div className="lbl">Interaction to next paint</div>
                  <div className="target">Target ≤ 200ms</div>
                </div>
                {tbt !== undefined && (
                  <div className="ed-stat">
                    <div className={'num ' + lighthouseScore(tbt, { good: 200, warn: 600 })}>
                      {Math.round(tbt)}<span className="unit">ms</span>
                    </div>
                    <div className="lbl">Total blocking time</div>
                    <div className="target">Target ≤ 200ms</div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* 02 — What you do well */}
        {(run.summaryJson?.passes?.length ?? 0) > 0 && (
          <section className="ed-section">
            <div className="ed-chapter">
              <span className="ed-chapter-num">02</span>
              <h2 className="ed-chapter-title">What you do well</h2>
            </div>
            <div className="ed-prose" style={{ marginBottom: 20 }}>
              <p>The fundamentals we verified are already in place. Keep these as you iterate.</p>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
              {run.summaryJson!.passes!.map((p, i) => (
                <li key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 16px', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--bg-1)' }}>
                  <span aria-hidden style={{ flexShrink: 0, marginTop: 3, width: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: 'rgba(52,211,153,0.12)', color: 'var(--pos)', fontSize: 12, fontWeight: 700 }}>✓</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <span style={{ color: 'var(--text)', fontSize: 14, fontWeight: 500 }}>{p.title}</span>
                      {p.category && (
                        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-4)' }}>{p.category}</span>
                      )}
                    </div>
                    <p style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.5, color: 'var(--text-2)' }}>{p.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 03 — What we found */}
        {findingsToRender.length > 0 && (
          <section className="ed-section">
            <div className="ed-chapter">
              <span className="ed-chapter-num">03</span>
              <h2 className="ed-chapter-title">What we found</h2>
            </div>
            <div className="ed-prose" style={{ marginBottom: 24 }}>
              <p>
                {run.stats.highImpactFindings > 0 && <><strong>{run.stats.highImpactFindings} high-impact</strong> {run.stats.highImpactFindings === 1 ? 'issue' : 'issues'} to address first. </>}
                Issues are grouped by category and sorted by impact. Click <em>Explain this</em> on any
                finding to get a plain-English walkthrough in the chat.
              </p>
            </div>
            {availableTabs.length > 1 && (
              <div className="ed-tabs">
                {availableTabs.map((tab) => {
                  const count = findingsByKind[tab].length;
                  return (
                    <button key={tab} onClick={() => setActiveTab(tab)} className={'ed-tab' + (activeTab === tab ? ' active' : '')}>
                      {tab}
                      <span className="count">{count}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <AuditTable
              findings={currentTabFindings.map(f => ({
                issue: f.issue, why: f.why, fix: f.fix, impact: f.impact, effort: f.effort, kind: f.kind,
                evidenceRefs: f.evidenceRefs || [],
              }))}
              onExplainFinding={(finding) => {
                const msg = `Can you explain this finding to me: "${finding.issue}". Why does it matter and how should I fix it?`;
                chatRef.current?.sendMessage(msg);
              }}
            />
          </section>
        )}

        {/* 03 — Your action plan */}
        {run.summaryJson?.plan && <FindingsPlan plan={run.summaryJson.plan} />}

        {/* 05 — What we couldn't see (locked) */}
        {findingsToRender.length > 0 && (
          <section className="ed-section">
            <div className="ed-chapter">
              <span className="ed-chapter-num">05</span>
              <h2 className="ed-chapter-title">What we couldn&apos;t see</h2>
            </div>
            <div className="ed-locked">
              <div className="ed-locked-blur" />
              <div style={{ position: 'relative', maxWidth: 620, margin: '0 auto' }}>
                <div className="ed-eyebrow" style={{ justifyContent: 'center', color: 'var(--accent)' }}>
                  <span className="dot" style={{ background: 'var(--accent)' }} />
                  Deep-dive only
                </div>
                <h3 className="ed-display" style={{ fontSize: 'clamp(22px, 2.8vw, 30px)', marginBottom: 12 }}>
                  Off-page authority &amp; competitor market share.
                </h3>
                <p className="ed-prose" style={{ margin: '0 auto 24px' }}>
                  This automated scan checks your technical foundation, but it can&apos;t see your Domain
                  Authority, Backlink Velocity, or branded vs non-branded traffic mix. A manual deep-dive
                  surfaces exactly how much share you&apos;re losing to competitors.
                </p>
                <button onClick={() => chatRef.current?.openLeadForm()} className="ed-btn" style={{ width: 'auto' }}>
                  Speak to an analyst
                </button>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Right rail chat — unchanged behavior, restyled wrapper */}
      {isAuditDone && (
        <div className="ed-chat-rail">
          <AuditChat
            ref={chatRef}
            runId={runId}
            findings={findingsToRender.map(f => ({ issue: f.issue, why: f.why, fix: f.fix, impact: f.impact, effort: f.effort, kind: f.kind }))}
            summary={run.summaryJson}
            stats={run.stats}
            target={run.target}
            status={run.status}
          />
        </div>
      )}
    </div>
  );
}
