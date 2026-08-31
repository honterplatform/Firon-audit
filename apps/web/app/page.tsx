'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FironOnly } from './components/FironOnly';

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    target: '',
    email: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      let normalizedUrl = formData.target.trim();
      if (normalizedUrl && !normalizedUrl.match(/^https?:\/\//i)) {
        normalizedUrl = `https://${normalizedUrl}`;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch('/api/audits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: normalizedUrl,
          email: formData.email.trim(),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        try {
          const data = await response.json();
          const errorMessage = data.message || data.error || 'Failed to create audit';
          const errorDetails = data.details ? ` (${data.details})` : '';
          setError(errorMessage + errorDetails);
        } catch {
          setError(`Failed to create audit (${response.status} ${response.statusText})`);
        }
        setLoading(false);
        return;
      }

      const data = await response.json();
      router.push(`/audits/${data.runId}`);
    } catch (err) {
      let errorMessage = 'An error occurred while creating the audit';
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          errorMessage = 'Request timed out. Please check your Redis connection and try again.';
        } else {
          errorMessage = err.message;
        }
      }
      setError(errorMessage);
      setLoading(false);
      console.error('Error creating audit:', err);
    }
  };

  const ready = formData.target.trim().length > 0 && formData.email.trim().length > 0;

  return (
    <FironOnly>
    <div className="ed-col">
      <header className="ed-head">
        <div className="ed-eyebrow">
          <span className="dot" />
          AI Readiness Audit · 60-second deep-dive
        </div>
        <h1 className="ed-display">
          See how AI agents view your business <em>today.</em>
        </h1>
        <p className="ed-lede">
          Drop your URL and your work email. We crawl your site through the same lens AI search agents do
          and email you a full diagnostic report in about a minute.
        </p>
      </header>

      <form onSubmit={handleSubmit}>
        {error && <div className="ed-error">{error}</div>}

        <div className="ed-field">
          <label htmlFor="target" className="ed-label">Website URL</label>
          <input
            type="text"
            id="target"
            required
            value={formData.target}
            onChange={(e) => setFormData({ ...formData, target: e.target.value })}
            className="ed-input"
            placeholder="https://yourwebsite.com"
            disabled={loading}
          />
        </div>

        <div className="ed-field">
          <label htmlFor="email" className="ed-label">Work email</label>
          <input
            type="email"
            id="email"
            required
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="ed-input"
            placeholder="name@company.com"
            disabled={loading}
          />
          <p className="ed-hint">
            We&apos;ll email you the full diagnostic report and redirect you as soon as it&apos;s ready.
          </p>
        </div>

        <button
          type="submit"
          disabled={loading || !ready}
          className="ed-btn"
          style={{ marginTop: 10 }}
        >
          {loading ? 'Generating report…' : 'Generate my AI readiness report'}
        </button>
      </form>
    </div>
    </FironOnly>
  );
}
