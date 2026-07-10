'use client';

import { useTheme } from './ThemeProvider';

const TOP_BAR_CSS = `
  .firon-doc-top {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 16px;
    padding: 9px 18px;
    background: var(--bg);
    position: sticky; top: 0; z-index: 8;
    font-family: var(--font-geist-sans), system-ui, -apple-system, sans-serif;
    font-size: 13px;
    min-height: 48px;
    color: var(--text);
    transition: background-color .15s, color .15s;
  }
  .firon-doc-top *, .firon-doc-top *::before, .firon-doc-top *::after { box-sizing: border-box; }
  .firon-doc-top .left { justify-self: start; min-width: 0; overflow: hidden; display: flex; align-items: center; }
  .firon-doc-top .right { justify-self: end; display: flex; align-items: center; gap: 6px; flex-shrink: 0; }

  .firon-doc-top .brand-logo {
    display: block; width: 90px; height: auto; flex-shrink: 0;
    margin-right: 10px;
  }

  .firon-doc-top .back-btn {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 10px; border-radius: var(--r-md);
    border: 1px solid var(--line);
    background: var(--bg-1);
    color: var(--text-3);
    font-size: 13px; font-weight: 500;
    text-decoration: none; flex-shrink: 0;
    transition: color .15s, background .15s, border-color .15s;
  }
  .firon-doc-top .back-btn:hover {
    color: var(--text);
    background: var(--bg-2);
    border-color: var(--line-2);
  }

  .firon-doc-top .sep { color: var(--text-4); display: inline-flex; align-items: center; margin: 0 4px; }
  .firon-doc-top .crumbs { display: flex; align-items: center; gap: 8px; min-width: 0; flex-wrap: nowrap; }
  .firon-doc-top .crumb {
    color: var(--text-3); font-size: 13px; text-decoration: none;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px;
  }
  .firon-doc-top a.crumb:hover { color: var(--text-2); }
  .firon-doc-top .crumb.here { color: var(--text); font-weight: 500; }

  .firon-doc-top .toolbar {
    justify-self: center; display: flex; align-items: center; gap: 6px; flex-shrink: 0;
  }
  .firon-doc-top .toolbar-item {
    position: relative; display: grid; place-items: center;
    width: 32px; height: 32px; border-radius: var(--r-md);
    background: var(--bg-1); border: 1px solid var(--line);
    color: var(--text-3); text-decoration: none;
    transition: color .15s, background .15s, border-color .15s;
  }
  .firon-doc-top .toolbar-item:hover {
    color: var(--text); background: var(--bg-2); border-color: var(--line-2);
  }
  .firon-doc-top .toolbar-item[data-active="true"] {
    color: var(--accent); background: var(--bg-3);
    border-color: rgba(251,59,36,0.35);
  }
  .firon-doc-top .toolbar-item .tooltip {
    position: absolute; top: calc(100% + 10px); left: 50%;
    transform: translateX(-50%) translateY(-4px); white-space: nowrap;
    padding: 5px 9px; background: var(--bg-3); color: var(--text);
    border: 1px solid var(--line-2); border-radius: var(--r-sm);
    font-size: 12px; font-weight: 500; opacity: 0; pointer-events: none;
    transition: opacity .12s, transform .12s;
    box-shadow: 0 4px 14px rgba(0,0,0,0.4); z-index: 20;
  }
  .firon-doc-top .toolbar-item:hover .tooltip { opacity: 1; transform: translateX(-50%) translateY(0); }

  .firon-doc-top .theme-toggle {
    display: grid; place-items: center;
    width: 32px; height: 32px; border-radius: var(--r-md);
    background: var(--bg-1); border: 1px solid var(--line);
    color: var(--text-3); cursor: pointer; font-family: inherit;
    transition: color .15s, background .15s, border-color .15s;
  }
  .firon-doc-top .theme-toggle:hover {
    color: var(--text); background: var(--bg-2); border-color: var(--line-2);
  }

  .firon-doc-top .auth-btn {
    display: inline-flex; align-items: center; gap: 7px;
    padding: 5px 11px; font-size: 12.5px; font-weight: 500;
    border-radius: var(--r-md); border: 1px solid var(--line);
    background: var(--bg-1); color: var(--text);
    text-decoration: none; cursor: pointer; font-family: inherit;
  }
  .firon-doc-top .auth-btn:hover { background: var(--bg-2); }
  .firon-doc-top .auth-btn.primary {
    background: var(--accent); border-color: var(--accent); color: #fff;
  }
  .firon-doc-top .auth-btn.primary:hover { background: var(--accent-hover); border-color: var(--accent-hover); }

  @media (max-width: 768px) {
    .firon-doc-top {
      grid-template-columns: 1fr auto;
      grid-template-rows: auto auto;
      gap: 10px 8px; padding: 10px 14px; min-height: 0;
    }
    .firon-doc-top .left { grid-row: 1; grid-column: 1; }
    .firon-doc-top .right { grid-row: 1; grid-column: 2; gap: 4px; }
    .firon-doc-top .toolbar { grid-row: 2; grid-column: 1 / -1; justify-self: center; gap: 5px; }
    .firon-doc-top .brand-logo { width: 78px; margin-right: 8px; }
    .firon-doc-top .crumb { font-size: 12.5px; max-width: 140px; }
    .firon-doc-top .auth-btn { padding: 4px 9px; font-size: 12px; }
  }
  @media (max-width: 480px) {
    .firon-doc-top .back-btn-text { display: none; }
  }
`;

export function FironTopBar() {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: TOP_BAR_CSS }} />
      <header className="firon-doc-top">
        <div className="left">
          <a href="https://fironmarketing.com" aria-label="fironmarketing.com" title="fironmarketing.com" style={{ display: 'inline-flex', alignItems: 'center' }}>
            <img className="brand-logo" data-invert-on-light src="https://labs.fironmarketing.com/fironlabs.svg" alt="Firon Labs" />
          </a>
          <a href="https://labs.fironmarketing.com" className="back-btn" aria-label="Back to Firon Labs" title="Back to Firon Labs">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
            <span className="back-btn-text">Back to Labs</span>
          </a>
          <span className="sep">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
          </span>
          <nav className="crumbs" aria-label="Breadcrumb">
            <span className="crumb here">AI Readiness Audit</span>
          </nav>
        </div>

        <nav className="toolbar" aria-label="Tools">
          <a href="https://labs.fironmarketing.com/competitor-scorecard" className="toolbar-item" aria-label="Competitor Scorecard">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><rect x="7" y="13" width="3" height="6" /><rect x="12" y="9" width="3" height="10" /><rect x="17" y="5" width="3" height="14" /></svg>
            <span className="tooltip">Competitor Scorecard</span>
          </a>
          <a href="https://labs.fironmarketing.com/reddit-listening" className="toolbar-item" aria-label="Reddit Listening">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M16 11a1.5 1.5 0 1 1-2.6 1M10.6 12a1.5 1.5 0 1 1-2.6-1" /><path d="M8.5 14.5c1 1 2.2 1.4 3.5 1.4s2.5-.4 3.5-1.4" /><circle cx="17.5" cy="7.5" r="1.2" /><path d="M14 7.5l3-1" /></svg>
            <span className="tooltip">Reddit Listening</span>
          </a>
          <a href="https://audit.fironmarketing.com" className="toolbar-item" data-active="true" aria-label="AI Readiness Audit">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
            <span className="tooltip">AI Readiness Audit</span>
          </a>
          <a href="https://labs.fironmarketing.com/pillar-cluster" className="toolbar-item" aria-label="Pillar Cluster">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="18" r="2.5" /><circle cx="12" cy="12" r="2.5" /><path d="M8 8l3 3M16 8l-3 3M8 16l3-3M16 16l-3-3" /></svg>
            <span className="tooltip">Pillar Cluster</span>
          </a>
          <a href="https://labs.fironmarketing.com/pillar-analyzer" className="toolbar-item" aria-label="Pillar Analyzer">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v4H4zM6 8v12M10 8v12M14 8v12M18 8v12M3 20h18" /></svg>
            <span className="tooltip">Pillar Analyzer</span>
          </a>
          <a href="https://labs.fironmarketing.com/llm-perception" className="toolbar-item" aria-label="LLM Perception">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M8 10h8M8 14h5" /><circle cx="12" cy="3" r="1" /><path d="M12 4v1" /></svg>
            <span className="tooltip">LLM Perception</span>
          </a>
          <a href="https://labs.fironmarketing.com/aio-checker" className="toolbar-item" aria-label="AIO Checker">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="6" /><path d="M21 21l-5.2-5.2M11 8v6M8 11h6" /></svg>
            <span className="tooltip">AIO Checker</span>
          </a>
        </nav>

        <div className="right">
          <button type="button" onClick={toggle} className="theme-toggle" aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'} title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}>
            {isDark ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
            )}
          </button>
          <a href="https://labs.fironmarketing.com" className="auth-btn">Open Labs</a>
        </div>
      </header>
    </>
  );
}
