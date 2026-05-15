'use client';

interface Plan {
  quickWins: string[];
  next: string[];
  scaleAuthority?: string[];
  experiments?: Array<{ hypothesis: string; variant: string; metric: string; risk?: string }>;
}

interface FindingsPlanProps { plan: Plan; }

export function FindingsPlan({ plan }: FindingsPlanProps) {
  const phases = [
    { num: 1, tag: 'Phase 1', title: 'Infrastructure sprint', sub: 'Fix the technical foundation first.', items: plan.quickWins },
    { num: 2, tag: 'Phase 2', title: 'AEO & GEO', sub: 'Structured data, AI-optimized content, trust signals.', items: plan.next },
    { num: 3, tag: 'Phase 3', title: 'Scale & authority', sub: 'Content clusters, AI advertising, authority amplification.', items: plan.scaleAuthority ?? [] },
  ].filter(p => p.items.length > 0);

  if (phases.length === 0) return null;

  return (
    <section className="ed-section">
      <div className="ed-chapter">
        <span className="ed-chapter-num">04</span>
        <h2 className="ed-chapter-title">Your action plan</h2>
      </div>
      <div className="ed-prose" style={{ marginBottom: 24 }}>
        <p>
          Firon&apos;s three-phase methodology — sequenced so each phase compounds on the one before.
          Start with Phase 1; don&apos;t skip ahead.
        </p>
      </div>
      <div className="ed-phases">
        {phases.map((p) => (
          <div key={p.num} className="ed-phase" data-phase={p.num}>
            <div className="ed-phase-tag">{p.tag}</div>
            <h3 className="ed-phase-title">{p.title}</h3>
            <p className="ed-phase-sub">{p.sub}</p>
            <ul className="ed-phase-list">
              {p.items.map((item, i) => <li key={i}><span>{item}</span></li>)}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
