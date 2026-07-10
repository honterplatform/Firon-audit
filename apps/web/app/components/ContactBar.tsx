'use client';

import { useEffect, useState } from "react";

const REVENUE_OPTIONS = [
  { value: "under_5m", label: "Under $5M" },
  { value: "five_to_10m", label: "$5M – $10M" },
  { value: "over_10m", label: "Over $10M" },
] as const;

export function ContactBar() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="contact-bar" role="region" aria-label="Contact Firon team">
        <div className="contact-bar-inner">
          <div className="contact-bar-text">
            Want Firon&apos;s team running this
            <span className="contact-bar-flourish"> for you</span>?{" "}
            <span className="contact-bar-sub">
              We run the same toolkit on agency clients end to end.
            </span>
          </div>
          <button type="button" className="contact-bar-btn" onClick={() => setOpen(true)}>
            Talk to our team
          </button>
        </div>
      </div>
      {open && <ContactModal onClose={() => setOpen(false)} />}
    </>
  );
}

function ContactModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [revenue, setRevenue] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const ready =
    name.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    revenue;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(), email: email.trim(),
          revenueRange: revenue, toolSource: "ai-readiness-audit",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message || data?.error || `Request failed (${res.status}).`);
        return;
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="contact-modal-bd" onClick={onClose}>
      <div className="contact-modal" onClick={(e) => e.stopPropagation()}>
        <div className="contact-modal-hd">
          <div>
            <h3>{done ? "Got it." : "Talk to our team"}</h3>
            <p className="sub">
              {done
                ? "We'll be in touch within 24 hours."
                : "Tell us a bit about your business and we'll reach out within 24 hours."}
            </p>
          </div>
          <button type="button" className="contact-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        {done ? (
          <div className="contact-modal-body">
            <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.55, margin: 0 }}>
              Thanks {name.split(" ")[0]} — your message landed in our inbox. Someone from the
              Firon team will email <strong style={{ color: "var(--text)" }}>{email}</strong> shortly.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="contact-modal-body">
            <div className="contact-field">
              <label htmlFor="contact-name">Your name</label>
              <input id="contact-name" type="text" value={name}
                onChange={(e) => setName(e.target.value)} placeholder="Jane Doe"
                disabled={submitting} autoFocus required />
            </div>
            <div className="contact-field">
              <label htmlFor="contact-email">Work email</label>
              <input id="contact-email" type="email" value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="jane@company.com"
                disabled={submitting} required />
            </div>
            <div className="contact-field">
              <label>Annual revenue</label>
              <div className="contact-revenue">
                {REVENUE_OPTIONS.map((opt) => (
                  <button key={opt.value} type="button"
                    className={"contact-revenue-opt" + (revenue === opt.value ? " on" : "")}
                    onClick={() => setRevenue(opt.value)} disabled={submitting}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {error && <div className="contact-error">{error}</div>}
            <div className="contact-modal-foot">
              <button type="button" className="contact-modal-cancel" onClick={onClose} disabled={submitting}>
                Cancel
              </button>
              <button type="submit" className="contact-modal-submit" disabled={!ready || submitting}>
                {submitting ? "Sending…" : "Send"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
