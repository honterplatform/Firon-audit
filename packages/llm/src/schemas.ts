import { z } from 'zod';

export const Finding = z.object({
  issue: z.string().max(140),
  why: z.string().max(400),
  fix: z.string().max(280),
  impact: z.enum(['High', 'Medium', 'Low']),
  effort: z.enum(['Small', 'Medium', 'Large']),
  kind: z.enum(['Marketing Strategy', 'Copywriting', 'UX/UI']),
  evidenceRefs: z.array(z.string()).max(4),
});

export const Plan = z.object({
  quickWins: z.array(z.string()).max(5),
  next: z.array(z.string()).max(5),
  experiments: z.array(z.object({
    hypothesis: z.string(),
    variant: z.string(),
    metric: z.string(),
    risk: z.string().optional(),
  })).max(3),
});

export const AuditSummary = z.object({
  findings: z.array(Finding).max(8),
  plan: Plan,
});

export type FindingType = z.infer<typeof Finding>;
export type PlanType = z.infer<typeof Plan>;
export type AuditSummaryType = z.infer<typeof AuditSummary>;

