import React from 'react';
import type { AuditSummaryType } from '@audit/llm';

interface AuditReportProps {
  summary: AuditSummaryType;
  runId: string;
  target: string;
}

export function AuditReport({ summary, runId, target }: AuditReportProps) {
  return (
    <div className="audit-report">
      <h1>UX/UI Audit Report</h1>
      <p>Target: {target}</p>
      <p>Run ID: {runId}</p>

      <section>
        <h2>Findings</h2>
        <table>
          <thead>
            <tr>
              <th>Issue</th>
              <th>Why</th>
              <th>Fix</th>
              <th>Impact</th>
              <th>Effort</th>
              <th>Kind</th>
            </tr>
          </thead>
          <tbody>
            {summary.findings.map((finding, idx) => (
              <tr key={idx}>
                <td>{finding.issue}</td>
                <td>{finding.why}</td>
                <td>{finding.fix}</td>
                <td>{finding.impact}</td>
                <td>{finding.effort}</td>
                <td>{finding.kind}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

