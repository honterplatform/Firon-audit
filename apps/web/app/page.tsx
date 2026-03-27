'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    target: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Normalize URL: add https:// if no protocol is present
      let normalizedUrl = formData.target.trim();
      if (normalizedUrl && !normalizedUrl.match(/^https?:\/\//i)) {
        normalizedUrl = `https://${normalizedUrl}`;
      }

      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const response = await fetch('/api/audits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          target: normalizedUrl,
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        try {
          const data = await response.json();
          // Show detailed error message if available
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

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0A0A0A' }}>
      <div className="flex flex-col items-center justify-center min-h-screen px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <div className="mb-12">
          <img src="/Logo.svg" alt="Logo" className="h-8" />
        </div>

        {/* Form Container */}
        <div className="w-full max-w-md space-y-6">
          {error && (
            <div className="mb-4 p-4 rounded-xl" style={{ backgroundColor: '#3a1f1f', border: '1px solid #ff6b6b' }}>
              <p className="text-sm" style={{ color: '#ff9595' }}>{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="target" className="block text-sm font-medium mb-2" style={{ color: '#888888' }}>
                Website URL
              </label>
              <input
                type="text"
                id="target"
                required
                value={formData.target}
                onChange={(e) => setFormData({ ...formData, target: e.target.value })}
                className="w-full px-4 py-3 rounded-xl focus:outline-none transition-all"
                style={{
                  backgroundColor: '#0F0F0F',
                  border: '1px solid #212121',
                  color: '#ffffff',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#FB3B24';
                  e.target.style.backgroundColor = '#212121';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#212121';
                  e.target.style.backgroundColor = '#0F0F0F';
                }}
                placeholder="example.com"
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !formData.target.trim()}
              className="w-full py-3 px-4 rounded-full font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: loading || !formData.target.trim() ? '#2A2A2A' : '#FB3B24',
                color: loading || !formData.target.trim() ? '#666666' : '#ffffff',
                boxSizing: 'border-box',
                height: '48px',
              }}
            >
              {loading ? 'Creating Audit...' : 'Create Audit'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

