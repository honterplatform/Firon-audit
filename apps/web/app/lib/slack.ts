const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

export async function notifySlack(message: string, blocks?: any[]) {
  if (!SLACK_WEBHOOK_URL) return;
  try {
    await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-type': 'application/json' },
      body: JSON.stringify(blocks ? { blocks } : { text: message }),
    });
  } catch (e) {
    console.error('Slack notification failed:', e);
  }
}

export function auditLeadAlert(data: { name?: string; email: string; phone?: string; target: string; runId: string; type: 'lead' | 'sales' }) {
  const emoji = data.type === 'sales' ? '🔥' : '📩';
  const label = data.type === 'sales' ? 'Sales Contact Request' : 'New Lead Captured';

  return notifySlack('', [
    {
      type: 'header',
      text: { type: 'plain_text', text: `${emoji} ${label}` },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Name:*\n${data.name || 'Not provided'}` },
        { type: 'mrkdwn', text: `*Email:*\n${data.email}` },
        ...(data.phone ? [{ type: 'mrkdwn', text: `*Phone:*\n${data.phone}` }] : []),
        { type: 'mrkdwn', text: `*Website Audited:*\n${data.target}` },
      ],
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View Audit' },
          url: `${process.env.APP_BASE_URL || 'https://auditweb-production-ce4e.up.railway.app'}/audits/${data.runId}`,
        },
      ],
    },
  ]);
}

export function auditCompletedAlert(data: { target: string; runId: string; findingsCount: number }) {
  return notifySlack(`✅ Audit completed for *${data.target}* — ${data.findingsCount} findings. <${process.env.APP_BASE_URL || 'https://auditweb-production-ce4e.up.railway.app'}/audits/${data.runId}|View Audit>`);
}
