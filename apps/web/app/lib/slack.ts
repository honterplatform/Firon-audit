export async function notifySlack(message: string, blocks?: any[]) {
  const url = process.env.SLACK_WEBHOOK_URL;
  console.log('Slack webhook URL present:', !!url);
  if (!url) {
    console.warn('SLACK_WEBHOOK_URL not set, skipping notification');
    return;
  }
  try {
    const payload = blocks ? { blocks, text: message || 'New notification' } : { text: message };
    console.log('Sending Slack payload:', JSON.stringify(payload).substring(0, 200));
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await resp.text();
    console.log('Slack response:', resp.status, text);
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
// slack 1775059932
