'use client';

import Link from 'next/link';
import { Fragment, useState, useEffect, useCallback } from 'react';

type SalesContact = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  contactStatus: string;
  notes: string | null;
  createdAt: string;
};

type AuditRun = {
  id: string;
  target: string;
  status: string;
  createdAt: string;
  findingsCount: number;
  salesContacts: SalesContact[];
};

type Stats = {
  totalRuns: number;
  totalContacts: number;
  newLeads: number;
  contacted: number;
  noResponse: number;
  responded: number;
  closed: number;
};

type Props = {
  runs: AuditRun[];
  activeTab: string;
  stats: Stats;
};

const TABS = [
  { key: 'all',       label: 'All' },
  { key: 'completed', label: 'Completed' },
  { key: 'running',   label: 'Running' },
  { key: 'queued',    label: 'Queued' },
  { key: 'partial',   label: 'Partial' },
  { key: 'failed',    label: 'Failed' },
];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  completed: { bg: 'rgba(134, 239, 172, 0.15)', text: '#86efac' },
  running:   { bg: 'rgba(253, 224, 71, 0.15)',  text: '#fde047' },
  queued:    { bg: 'rgba(148, 163, 184, 0.15)', text: '#94a3b8' },
  partial:   { bg: 'rgba(251, 191, 36, 0.15)',  text: '#fbbf24' },
  failed:    { bg: 'rgba(248, 113, 113, 0.15)', text: '#f87171' },
};

const CONTACT_STATUSES = [
  { value: 'new_lead',    label: 'New Lead',    icon: '●', bg: 'rgba(148, 163, 184, 0.15)', text: '#94a3b8' },
  { value: 'contacted',   label: 'Contacted',   icon: '→', bg: 'rgba(96, 165, 250, 0.15)',  text: '#60a5fa' },
  { value: 'no_response', label: 'No Response', icon: '✗', bg: 'rgba(251, 191, 36, 0.15)',  text: '#fbbf24' },
  { value: 'responded',   label: 'Responded',   icon: '✓', bg: 'rgba(134, 239, 172, 0.15)', text: '#86efac' },
  { value: 'closed',      label: 'Closed',      icon: '★', bg: 'rgba(216, 255, 133, 0.15)', text: '#d8ff85' },
];

function StatusBadge({ status }: { status: string }) {
  const colors = STATUS_COLORS[status] ?? STATUS_COLORS.queued;
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {status}
    </span>
  );
}

function ContactStatusBadge({ status }: { status: string }) {
  const config = CONTACT_STATUSES.find((s) => s.value === status) ?? CONTACT_STATUSES[0];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: config.bg, color: config.text }}
    >
      <span className="text-[10px]">{config.icon}</span>
      {config.label}
    </span>
  );
}

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 fade-in duration-200">
      <div
        className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm shadow-lg"
        style={{ backgroundColor: '#162624', color: '#d8ff85', border: '1px solid #2a3a38' }}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        {message}
      </div>
    </div>
  );
}

export function AdminDashboard({ runs, activeTab, stats }: Props) {
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Record<string, SalesContact[]>>(() => {
    const map: Record<string, SalesContact[]> = {};
    for (const run of runs) {
      map[run.id] = run.salesContacts;
    }
    return map;
  });
  const [savingId, setSavingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const updateContact = async (
    contactId: string,
    runId: string,
    data: { contactStatus?: string; notes?: string }
  ) => {
    setSavingId(contactId);
    try {
      const res = await fetch(`/api/admin/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update');

      setContacts((prev) => ({
        ...prev,
        [runId]: prev[runId].map((c) =>
          c.id === contactId ? { ...c, ...data } : c
        ),
      }));

      const label = data.contactStatus
        ? CONTACT_STATUSES.find((s) => s.value === data.contactStatus)?.label
        : null;
      setToast(label ? `Status updated to "${label}"` : 'Notes saved');
    } catch (err) {
      console.error('Error updating contact:', err);
      setToast('Failed to save — please try again');
    } finally {
      setSavingId(null);
    }
  };

  const clearToast = useCallback(() => setToast(null), []);

  // Derive stats from live contacts state so they update instantly
  const allContacts = Object.values(contacts).flat();
  const liveStats = {
    totalRuns: runs.length,
    totalContacts: allContacts.length,
    newLeads: allContacts.filter((c) => c.contactStatus === 'new_lead').length,
    contacted: allContacts.filter((c) => c.contactStatus === 'contacted').length,
    noResponse: allContacts.filter((c) => c.contactStatus === 'no_response').length,
    responded: allContacts.filter((c) => c.contactStatus === 'responded').length,
    closed: allContacts.filter((c) => c.contactStatus === 'closed').length,
  };

  const statCards = [
    { label: 'Total Audits', value: liveStats.totalRuns, color: '#f7f9f2' },
    { label: 'Leads', value: liveStats.totalContacts, color: '#d8ff85' },
    { label: 'New', value: liveStats.newLeads, color: '#94a3b8' },
    { label: 'Contacted', value: liveStats.contacted, color: '#60a5fa' },
    { label: 'No Response', value: liveStats.noResponse, color: '#fbbf24' },
    { label: 'Responded', value: liveStats.responded, color: '#86efac' },
    { label: 'Closed', value: liveStats.closed, color: '#d8ff85' },
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a211f' }}>
      {/* Toast */}
      {toast && <Toast message={toast} onDone={clearToast} />}

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-normal mb-1" style={{ color: '#f7f9f2' }}>
            Admin Dashboard
          </h1>
          <p className="text-sm" style={{ color: '#6b7c79' }}>
            Manage audit runs and track sales contacts
          </p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-7 gap-3 mb-8">
          {statCards.map((card) => (
            <div
              key={card.label}
              className="rounded-xl p-4"
              style={{ backgroundColor: '#162624' }}
            >
              <div className="text-2xl font-medium mb-1" style={{ color: card.color }}>
                {card.value}
              </div>
              <div className="text-xs" style={{ color: '#6b7c79' }}>
                {card.label}
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div
          className="flex gap-1 p-1 mb-6 rounded-xl w-fit"
          style={{ backgroundColor: '#162624' }}
        >
          {TABS.map((tab) => {
            const isActive = tab.key === activeTab;
            const href = tab.key === 'all' ? '/admin' : `/admin?status=${tab.key}`;
            return (
              <Link
                key={tab.key}
                href={href}
                className="px-4 py-2 text-sm rounded-lg transition-all"
                style={{
                  backgroundColor: isActive ? '#d8ff85' : 'transparent',
                  color: isActive ? '#0a211f' : '#6b7c79',
                  fontWeight: isActive ? 500 : 400,
                }}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        {/* Table */}
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#162624' }}>
          <table className="w-full text-sm" style={{ color: '#e2e8f0' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2a3a38' }}>
                <th className="text-left px-6 py-3.5 font-medium text-xs uppercase tracking-wider" style={{ color: '#6b7c79' }}>
                  Target
                </th>
                <th className="text-left px-6 py-3.5 font-medium text-xs uppercase tracking-wider" style={{ color: '#6b7c79' }}>
                  Status
                </th>
                <th className="text-left px-6 py-3.5 font-medium text-xs uppercase tracking-wider" style={{ color: '#6b7c79' }}>
                  Date
                </th>
                <th className="text-center px-6 py-3.5 font-medium text-xs uppercase tracking-wider" style={{ color: '#6b7c79' }}>
                  Findings
                </th>
                <th className="text-left px-6 py-3.5 font-medium text-xs uppercase tracking-wider" style={{ color: '#6b7c79' }}>
                  Contact
                </th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const runContacts = contacts[run.id] ?? [];
                const latestContact = runContacts[0] ?? null;
                const isExpanded = expandedRunId === run.id;
                const hasContact = latestContact !== null;

                return (
                  <Fragment key={run.id}>
                    <tr
                      className="transition-colors cursor-pointer"
                      style={{
                        borderBottom: isExpanded ? 'none' : '1px solid #2a3a38',
                        backgroundColor: isExpanded ? '#1a2f2d' : 'transparent',
                      }}
                      onMouseEnter={(e) => {
                        if (!isExpanded) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isExpanded) e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                      onClick={() =>
                        hasContact ? setExpandedRunId(isExpanded ? null : run.id) : undefined
                      }
                    >
                      <td className="px-6 py-4">
                        <Link
                          href={`/audits/${run.id}`}
                          className="hover:underline text-sm"
                          style={{ color: '#d8ff85' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {run.target.replace(/^https?:\/\//, '')}
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={run.status} />
                      </td>
                      <td className="px-6 py-4 text-xs" style={{ color: '#6b7c79' }}>
                        {new Date(run.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-6 py-4 text-center text-xs">
                        {run.findingsCount > 0 ? (
                          <span className="font-medium" style={{ color: '#e2e8f0' }}>
                            {run.findingsCount}
                          </span>
                        ) : (
                          <span style={{ color: '#4a5a58' }}>0</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {hasContact ? (
                          <div className="flex items-center gap-2">
                            <ContactStatusBadge status={latestContact.contactStatus} />
                            <span className="text-xs truncate max-w-[120px]" style={{ color: '#6b7c79' }}>
                              {latestContact.name}
                            </span>
                            <svg
                              className={`w-3.5 h-3.5 ml-auto transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                              style={{ color: '#6b7c79' }}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        ) : (
                          <span className="text-xs" style={{ color: '#3a4a48' }}>No contact</span>
                        )}
                      </td>
                    </tr>

                    {/* Expanded panel */}
                    {isExpanded && runContacts.length > 0 && (
                      <tr key={`${run.id}-detail`}>
                        <td
                          colSpan={5}
                          className="px-6 pb-4 pt-0"
                          style={{
                            backgroundColor: '#1a2f2d',
                            borderBottom: '1px solid #2a3a38',
                          }}
                        >
                          <div className="space-y-3">
                            {runContacts.map((contact) => (
                              <ContactCard
                                key={contact.id}
                                contact={contact}
                                runId={run.id}
                                isSaving={savingId === contact.id}
                                onUpdate={updateContact}
                              />
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {runs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <div className="text-sm mb-1" style={{ color: '#6b7c79' }}>
                      No audit runs found
                    </div>
                    <div className="text-xs" style={{ color: '#3a4a48' }}>
                      Audits will appear here once created
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ── Contact Card ─────────────────────────────────────── */

function ContactCard({
  contact,
  runId,
  isSaving,
  onUpdate,
}: {
  contact: SalesContact;
  runId: string;
  isSaving: boolean;
  onUpdate: (contactId: string, runId: string, data: { contactStatus?: string; notes?: string }) => void;
}) {
  const [notes, setNotes] = useState(contact.notes ?? '');
  const [notesChanged, setNotesChanged] = useState(false);

  const currentIdx = CONTACT_STATUSES.findIndex((s) => s.value === contact.contactStatus);

  return (
    <div
      className="rounded-xl p-5"
      style={{ backgroundColor: '#162624', border: '1px solid #2a3a38' }}
    >
      {/* Top: contact info */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {/* Avatar circle */}
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0"
            style={{ backgroundColor: '#2a3a38', color: '#d8ff85' }}
          >
            {contact.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="text-sm font-medium" style={{ color: '#f7f9f2' }}>
              {contact.name}
            </div>
            <div className="flex items-center gap-3 text-xs" style={{ color: '#6b7c79' }}>
              <a
                href={`mailto:${contact.email}`}
                className="hover:underline"
                style={{ color: '#94a3b8' }}
                onClick={(e) => e.stopPropagation()}
              >
                {contact.email}
              </a>
              {contact.phone && (
                <a
                  href={`tel:${contact.phone}`}
                  className="hover:underline"
                  style={{ color: '#94a3b8' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {contact.phone}
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isSaving && (
            <div
              className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: '#d8ff85', borderTopColor: 'transparent' }}
            />
          )}
          <span className="text-xs" style={{ color: '#4a5a58' }}>
            {new Date(contact.createdAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        </div>
      </div>

      {/* Pipeline status selector */}
      <div className="mb-4">
        <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: '#4a5a58' }}>
          Status
        </div>
        <div className="flex gap-2 flex-wrap">
          {CONTACT_STATUSES.map((s) => {
            const isActive = contact.contactStatus === s.value;
            return (
              <button
                key={s.value}
                onClick={() => onUpdate(contact.id, runId, { contactStatus: s.value })}
                disabled={isSaving}
                className="px-3.5 py-2 text-xs rounded-lg transition-all cursor-pointer"
                style={{
                  backgroundColor: isActive ? s.bg : '#0a211f',
                  color: isActive ? s.text : '#6b7c79',
                  border: `1px solid ${isActive ? s.text + '50' : '#2a3a38'}`,
                  fontWeight: isActive ? 500 : 400,
                  opacity: isSaving ? 0.6 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.borderColor = s.text + '40';
                    e.currentTarget.style.color = s.text;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.borderColor = '#2a3a38';
                    e.currentTarget.style.color = '#6b7c79';
                  }
                }}
              >
                <span className="mr-1.5">{s.icon}</span>
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Notes */}
      <div className="relative">
        <textarea
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            setNotesChanged(e.target.value !== (contact.notes ?? ''));
          }}
          placeholder="Add notes..."
          rows={2}
          className="w-full px-3 py-2.5 text-xs rounded-lg resize-none focus:outline-none transition-colors"
          style={{
            backgroundColor: '#0a211f',
            color: '#e2e8f0',
            border: `1px solid ${notesChanged ? '#d8ff8560' : '#2a3a38'}`,
          }}
        />
        {notesChanged && (
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => {
                onUpdate(contact.id, runId, { notes });
                setNotesChanged(false);
              }}
              disabled={isSaving}
              className="px-3 py-1.5 text-xs font-medium rounded-lg transition-all hover:opacity-90"
              style={{ backgroundColor: '#d8ff85', color: '#0a211f' }}
            >
              Save
            </button>
            <button
              onClick={() => {
                setNotes(contact.notes ?? '');
                setNotesChanged(false);
              }}
              className="px-3 py-1.5 text-xs rounded-lg transition-all"
              style={{ color: '#6b7c79' }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
