'use client';

import { Badge } from './Badge';

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
  const getImpactStyle = (impact: string) => {
    switch (impact) {
      case 'High':   return { color: '#FF6B6B', backgroundColor: 'rgba(255, 107, 107, 0.15)' };
      case 'Medium': return { color: '#FBBF24', backgroundColor: 'rgba(251, 191, 36, 0.15)' };
      case 'Low':    return { color: '#4ADE80', backgroundColor: 'rgba(74, 222, 128, 0.15)' };
      default:       return { color: '#888888', backgroundColor: 'rgba(136, 136, 136, 0.15)' };
    }
  };

  const getEffortStyle = (effort: string) => {
    switch (effort) {
      case 'Small':  return { color: '#4ADE80', backgroundColor: 'rgba(74, 222, 128, 0.15)' };
      case 'Medium': return { color: '#FBBF24', backgroundColor: 'rgba(251, 191, 36, 0.15)' };
      case 'Large':  return { color: '#FF6B6B', backgroundColor: 'rgba(255, 107, 107, 0.15)' };
      default:       return { color: '#888888', backgroundColor: 'rgba(136, 136, 136, 0.15)' };
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {findings.map((finding, idx) => {
          return (
            <div
              key={idx}
              id={`finding-${idx}`}
              className="relative rounded-2xl hover:shadow-lg hover:-translate-y-1 transition-all duration-300 ease-in-out flex flex-col h-full"
              style={{ backgroundColor: '#0F0F0F', border: '1px solid #212121' }}
            >
              <div className="p-4 flex flex-col flex-1">
                {/* Impact and Effort badges */}
                <div className="flex items-center gap-2 mb-3 flex-wrap" onClick={(e) => e.stopPropagation()}>
                  <Badge className="text-[8px] uppercase font-light tracking-[0.2em] px-2 py-0.5 rounded-full" style={getImpactStyle(finding.impact)}>
                    {finding.impact} Impact
                  </Badge>
                  <Badge className="text-[8px] uppercase font-light tracking-[0.2em] px-2 py-0.5 rounded-full" style={getEffortStyle(finding.effort)}>
                    {finding.effort} Effort
                  </Badge>
                </div>

                {/* Divider */}
                <div className="border-t mb-3" style={{ borderColor: '#212121' }}></div>

                {/* Header with title */}
                <div className="mb-3 h-14">
                  <h3 className="text-lg font-normal leading-tight line-clamp-2" style={{ color: '#F5F5F5' }}>
                    {finding.issue}
                  </h3>
                </div>

                {/* Why section */}
                <div className="mb-4 flex-1">
                  <div>
                    <p className="text-[10px] font-light uppercase tracking-wide mb-1" style={{ color: '#888888' }}>
                      Why this matters
                    </p>
                    <p className="text-sm leading-relaxed line-clamp-3" style={{ color: '#CCCCCC' }}>
                      {finding.why}
                    </p>
                  </div>
                </div>

                {/* Footer with button */}
                <div
                  className="pt-3 border-t flex items-center justify-start"
                  style={{ borderColor: '#212121' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {onExplainFinding && (
                    <div className="flex justify-start">
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onExplainFinding(finding);
                        }}
                        className="group inline-flex text-xs rounded-full transition-all duration-300 font-medium items-center justify-center overflow-hidden"
                        style={{ 
                          backgroundColor: '#FB3B24',
                          color: '#ffffff',
                          width: '2rem',
                          height: '2rem',
                          minWidth: '2rem',
                          maxWidth: '2rem',
                          padding: '0',
                          position: 'relative'
                        }}
                        onMouseEnter={(e) => {
                          const button = e.currentTarget;
                          // Use requestAnimationFrame to ensure smooth transition
                          requestAnimationFrame(() => {
                            button.style.maxWidth = '200px';
                            button.style.width = 'auto';
                            button.style.height = 'auto';
                            button.style.minWidth = 'auto';
                            button.style.paddingLeft = '0.75rem';
                            button.style.paddingRight = '0.75rem';
                            button.style.paddingTop = '0.375rem';
                            button.style.paddingBottom = '0.375rem';
                          });
                        }}
                        onMouseLeave={(e) => {
                          const button = e.currentTarget;
                          requestAnimationFrame(() => {
                            button.style.maxWidth = '2rem';
                            button.style.width = '2rem';
                            button.style.height = '2rem';
                            button.style.minWidth = '2rem';
                            button.style.padding = '0';
                          });
                        }}
                      >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0" style={{ display: 'block' }}>
                        <path d="M10 6.25C9.68617 6.25 9.40552 6.4454 9.29661 6.73972L8.78077 8.13378C8.08054 10.0261 7.79598 10.7489 7.27245 11.2725C6.74893 11.796 6.02612 12.0805 4.13378 12.7808L2.73972 13.2966C2.4454 13.4055 2.25 13.6862 2.25 14C2.25 14.3138 2.4454 14.5945 2.73972 14.7034L4.13378 15.2192C6.02612 15.9195 6.74893 16.204 7.27245 16.7275C7.79598 17.2511 8.08054 17.9739 8.78077 19.8662L9.29661 21.2603C9.40552 21.5546 9.68617 21.75 10 21.75C10.3138 21.75 10.5945 21.5546 10.7034 21.2603L11.2192 19.8662C11.9195 17.9739 12.204 17.2511 12.7275 16.7275C13.2511 16.204 13.9739 15.9195 15.8662 15.2192L17.2603 14.7034C17.5546 14.5945 17.75 14.3138 17.75 14C17.75 13.6862 17.5546 13.4055 17.2603 13.2966L15.8662 12.7808C13.9739 12.0805 13.2511 11.796 12.7275 11.2725C12.204 10.7489 11.9195 10.0261 11.2192 8.13378L10.7034 6.73972C10.5945 6.4454 10.3138 6.25 10 6.25Z" fill="#ffffff"/>
                        <path d="M18 2.25C17.6862 2.25 17.4055 2.4454 17.2966 2.73972L17.0755 3.33717C16.7618 4.18495 16.6705 4.38548 16.528 4.528C16.3855 4.67053 16.185 4.76183 15.3372 5.07553L14.7397 5.29661C14.4454 5.40552 14.25 5.68617 14.25 6C14.25 6.31383 14.4454 6.59448 14.7397 6.70339L15.3372 6.92447C16.185 7.23817 16.3855 7.32947 16.528 7.47199C16.6705 7.61452 16.7618 7.81505 17.0755 8.66283L17.2966 9.26028C17.4055 9.5546 17.6862 9.75 18 9.75C18.3138 9.75 18.5945 9.5546 18.7034 9.26028L18.9245 8.66283C19.2382 7.81505 19.3295 7.61452 19.472 7.47199C19.6145 7.32947 19.8151 7.23817 20.6628 6.92447L21.2603 6.70339C21.5546 6.59448 21.75 6.31383 21.75 6C21.75 5.68617 21.5546 5.40552 21.2603 5.29661L20.6628 5.07553C19.8151 4.76183 19.6145 4.67053 19.472 4.528C19.3295 4.38548 19.2382 4.18495 18.9245 3.33717L18.7034 2.73972C18.5945 2.4454 18.3138 2.25 18 2.25Z" fill="#ffffff"/>
                      </svg>
                      <span className="whitespace-nowrap opacity-0 w-0 ml-0 group-hover:opacity-100 group-hover:w-auto group-hover:ml-1.5 transition-all duration-300">Explain this to me</span>
                      </button>
                    </div>
                  </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

