'use client';

interface Finding {
  issue: string;
  why: string;
  fix: string;
  impact: 'High' | 'Medium' | 'Low';
  effort: 'Small' | 'Medium' | 'Large';
  kind: 'Technical SEO' | 'On-Page SEO' | 'Performance' | 'Links';
}

interface AuditTableProps {
  findings: Finding[];
  onExplainFinding?: (finding: Finding) => void;
}

export function AuditTable({ findings, onExplainFinding }: AuditTableProps) {
  return (
    <div className="ed-findings">
      {findings.map((finding, idx) => (
        <article key={idx} id={`finding-${idx}`} className="ed-finding">
          <div className="ed-finding-meta">
            <span className={'ed-pill impact-' + finding.impact.toLowerCase()}>{finding.impact} Impact</span>
            <span className={'ed-pill effort-' + finding.effort.toLowerCase()}>{finding.effort} Effort</span>
          </div>
          <h3 className="ed-finding-title">{finding.issue}</h3>
          <div className="ed-finding-section">
            <span className="ed-finding-label">Why it matters</span>
            <p className="ed-finding-body">{finding.why}</p>
          </div>
          {finding.fix && (
            <div className="ed-finding-section">
              <span className="ed-finding-label">Fix</span>
              <p className="ed-finding-body">{finding.fix}</p>
            </div>
          )}
          {onExplainFinding && (
            <div className="ed-finding-foot">
              <button onClick={() => onExplainFinding(finding)} className="ed-finding-explain">
                Explain this →
              </button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
