'use client';

interface Plan {
  quickWins: string[];
  next: string[];
  experiments: Array<{
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
  // Hidden per user request - action plan, next steps, and experiments are not displayed
  return null;
}

