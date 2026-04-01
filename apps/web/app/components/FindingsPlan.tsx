'use client';

interface Plan {
  quickWins: string[];
  next: string[];
  scaleAuthority?: string[];
  experiments?: Array<{
    hypothesis: string;
    variant: string;
    metric: string;
    risk?: string;
  }>;
}

interface FindingsPlanProps {
  plan: Plan;
}

export function FindingsPlan({ plan }: FindingsPlanProps) {
  const phase3Items = plan.scaleAuthority ?? [];
  const hasContent = plan.quickWins.length > 0 || plan.next.length > 0 || phase3Items.length > 0;
  if (!hasContent) return null;

  return (
    <div className="mt-12 space-y-6">
      <h2 className="text-3xl font-light" style={{ color: '#ffffff' }}>Action Plan</h2>
      <p className="text-sm" style={{ color: '#888888' }}>
        Firon&apos;s three-phase methodology to fix your SEO liabilities and build lasting search authority.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Phase 1 */}
        {plan.quickWins.length > 0 && (
          <div className="rounded-xl p-5" style={{ backgroundColor: '#0F0F0F', border: '1px solid #212121' }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-medium px-2 py-1 rounded-full" style={{ backgroundColor: 'rgba(251, 59, 36, 0.15)', color: '#FB3B24' }}>Phase 1</span>
            </div>
            <h3 className="text-lg font-medium mb-1" style={{ color: '#ffffff' }}>Infrastructure Sprint</h3>
            <p className="text-xs mb-4" style={{ color: '#666666' }}>Fix the technical foundation. Deploy the Velocity Engine.</p>
            <ul className="space-y-2">
              {plan.quickWins.map((item, i) => (
                <li key={i} className="flex gap-2 text-sm" style={{ color: '#CCCCCC' }}>
                  <span style={{ color: '#FB3B24' }}>→</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Phase 2 */}
        {plan.next.length > 0 && (
          <div className="rounded-xl p-5" style={{ backgroundColor: '#0F0F0F', border: '1px solid #212121' }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-medium px-2 py-1 rounded-full" style={{ backgroundColor: 'rgba(251, 191, 36, 0.15)', color: '#FBBF24' }}>Phase 2</span>
            </div>
            <h3 className="text-lg font-medium mb-1" style={{ color: '#ffffff' }}>AEO &amp; GEO</h3>
            <p className="text-xs mb-4" style={{ color: '#666666' }}>Structured data overhaul. AI-optimized content. Trust engineering.</p>
            <ul className="space-y-2">
              {plan.next.map((item, i) => (
                <li key={i} className="flex gap-2 text-sm" style={{ color: '#CCCCCC' }}>
                  <span style={{ color: '#FBBF24' }}>→</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Phase 3 */}
        {phase3Items.length > 0 && (
          <div className="rounded-xl p-5" style={{ backgroundColor: '#0F0F0F', border: '1px solid #212121' }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-medium px-2 py-1 rounded-full" style={{ backgroundColor: 'rgba(74, 222, 128, 0.15)', color: '#4ADE80' }}>Phase 3</span>
            </div>
            <h3 className="text-lg font-medium mb-1" style={{ color: '#ffffff' }}>Scale &amp; Authority</h3>
            <p className="text-xs mb-4" style={{ color: '#666666' }}>Content clusters. AI advertising. Authority amplification.</p>
            <ul className="space-y-2">
              {phase3Items.map((item, i) => (
                <li key={i} className="flex gap-2 text-sm" style={{ color: '#CCCCCC' }}>
                  <span style={{ color: '#4ADE80' }}>→</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
