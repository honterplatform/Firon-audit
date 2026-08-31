'use client';

// Client-side gate. Renders children when the firon_tool_access cookie is
// present, otherwise renders the "Book a call" card with an inline access-code
// entry. The server always independently validates the cookie on any
// scan-triggering endpoint via requireToolAccess, so this component is a UX
// convenience, not the security boundary.

import { useEffect, useState, type ReactNode } from 'react';

const COOKIE_NAME = 'firon_tool_access';
const CAL_URL = 'https://cal.com/alex-firon/30min';

function hasAccessCookie(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie
    .split(';')
    .some((c) => c.trim().startsWith(COOKIE_NAME + '='));
}

export function FironOnly({ children }: { children: ReactNode }) {
  // 'checking' avoids a flash of the gate for cookie-holders on first paint.
  const [state, setState] = useState<'checking' | 'ok' | 'gated'>('checking');

  useEffect(() => {
    setState(hasAccessCookie() ? 'ok' : 'gated');
  }, []);

  if (state === 'checking') return null;
  if (state === 'ok') return <>{children}</>;
  return <GateCard />;
}

function GateCard() {
  const [showCode, setShowCode] = useState(false);
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || submitting) return;
    setSubmitting(true);
    setErrMsg(null);
    try {
      const res = await fetch('/api/auth/tool', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ passcode: code.trim() }),
      });
      if (!res.ok) {
        setErrMsg('That code did not work. Try again.');
        setSubmitting(false);
        return;
      }
      window.location.reload();
    } catch {
      setErrMsg('Could not verify. Try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="ed-col" style={{ paddingTop: 80, paddingBottom: 60 }}>
      <div
        style={{
          background: 'var(--bg-1)',
          borderRadius: 'var(--r-lg)',
          padding: 40,
          textAlign: 'center',
        }}
      >
        <div className="ed-eyebrow" style={{ justifyContent: 'center' }}>
          <span className="dot" />
          Client access only
        </div>
        <h1
          className="ed-display"
          style={{
            fontSize: 'clamp(24px, 3vw, 32px)',
            marginBottom: 12,
          }}
        >
          This tool is for Firon Marketing clients.
        </h1>
        <p className="ed-lede" style={{ margin: '0 auto 28px' }}>
          Book 15 minutes with our founder Alex Jordan and we&apos;ll walk you through it live.
        </p>
        <a
          href={CAL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="ed-btn"
          style={{ width: 'auto', display: 'inline-flex' }}
        >
          Book your call
        </a>

        <div style={{ marginTop: 28 }}>
          {!showCode ? (
            <button
              type="button"
              onClick={() => setShowCode(true)}
              style={{
                background: 'transparent',
                border: 0,
                color: 'var(--text-3)',
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'inherit',
                textDecoration: 'underline',
                padding: 0,
              }}
            >
              Enter access code
            </button>
          ) : (
            <form
              onSubmit={submit}
              style={{
                display: 'flex',
                gap: 8,
                justifyContent: 'center',
                flexWrap: 'wrap',
                maxWidth: 360,
                margin: '0 auto',
              }}
            >
              <input
                type="password"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Access code"
                autoFocus
                disabled={submitting}
                className="ed-input"
                style={{ maxWidth: 220 }}
              />
              <button
                type="submit"
                disabled={!code.trim() || submitting}
                className="ed-btn"
                style={{ width: 'auto' }}
              >
                {submitting ? 'Checking...' : 'Unlock'}
              </button>
              {errMsg && (
                <div className="ed-error" style={{ width: '100%', marginTop: 8 }}>
                  {errMsg}
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
