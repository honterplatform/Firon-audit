import { Resend } from 'resend';

const FROM_ADDRESS = process.env.EMAIL_FROM || 'Firon Marketing <reports@fironmarketing.com>';
const APP_URL = process.env.APP_BASE_URL || 'https://audit.fironmarketing.com';

let resendClient: Resend | null = null;

function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!resendClient) resendClient = new Resend(apiKey);
  return resendClient;
}

export async function sendAuditReportEmail(opts: {
  to: string;
  target: string;
  runId: string;
  findingsCount: number;
  highImpactCount: number;
}): Promise<{ ok: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn('RESEND_API_KEY not set, skipping email');
    return { ok: false, error: 'RESEND_API_KEY not configured' };
  }

  const reportUrl = `${APP_URL}/audits/${opts.runId}`;
  const cleanTarget = opts.target.replace(/^https?:\/\//, '').replace(/\/$/, '');

  // Try to fetch the PDF to attach
  let pdfAttachment: { filename: string; content: string } | null = null;
  try {
    const pdfResp = await fetch(`${APP_URL}/api/reports/${opts.runId}/pdf`, {
      headers: { 'Accept': 'application/pdf' },
    });
    if (pdfResp.ok) {
      const buffer = Buffer.from(await pdfResp.arrayBuffer());
      const fileSafeTarget = cleanTarget.replace(/[^a-z0-9]/gi, '-');
      pdfAttachment = {
        filename: `firon-audit-${fileSafeTarget}.pdf`,
        content: buffer.toString('base64'),
      };
    } else {
      console.warn('PDF generation failed for email attachment, sending email without PDF');
    }
  } catch (e) {
    console.warn('Could not fetch PDF for email attachment:', e);
  }

  try {
    const sendArgs: any = {
      from: FROM_ADDRESS,
      to: opts.to,
      subject: `Your AI Readiness Report for ${cleanTarget} is ready`,
      html: buildReportEmailHtml({ ...opts, reportUrl, cleanTarget }),
    };
    if (pdfAttachment) {
      sendArgs.attachments = [pdfAttachment];
    }

    const result = await resend.emails.send(sendArgs);

    if (result.error) {
      console.error('Resend error:', result.error);
      return { ok: false, error: JSON.stringify(result.error) };
    }
    return { ok: true };
  } catch (e) {
    console.error('Failed to send email:', e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function buildReportEmailHtml(opts: {
  cleanTarget: string;
  reportUrl: string;
  findingsCount: number;
  highImpactCount: number;
}): string {
  const { cleanTarget, reportUrl, findingsCount, highImpactCount } = opts;
  const logoUrl = `${APP_URL}/Logo.svg`;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Your AI Readiness Report</title>
</head>
<body style="margin:0; padding:0; background:#0A0A0A; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#E0E0E0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0A0A0A;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; background:#0F0F0F; border:1px solid #212121; border-radius:16px; overflow:hidden;">
          <tr>
            <td align="center" style="padding:32px 32px 8px 32px;">
              <img src="${logoUrl}" alt="Firon Marketing" width="120" style="display:block; margin:0 auto; height:auto;" />
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 16px 32px;">
              <h1 style="margin:0 0 8px 0; font-size:24px; font-weight:500; color:#ffffff;">Your AI Readiness Report is Ready</h1>
              <p style="margin:0; font-size:14px; color:#888888; line-height:1.5;">We just finished analyzing <strong style="color:#ffffff;">${cleanTarget}</strong>.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 24px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0A0A0A; border:1px solid #212121; border-radius:12px;">
                <tr>
                  <td style="padding:20px; text-align:center;">
                    <div style="font-size:36px; font-weight:300; color:#FB3B24; line-height:1;">${highImpactCount}</div>
                    <div style="font-size:12px; color:#888888; margin-top:6px; text-transform:uppercase; letter-spacing:0.05em;">High-Impact Issues</div>
                  </td>
                  <td style="padding:20px; text-align:center; border-left:1px solid #212121;">
                    <div style="font-size:36px; font-weight:300; color:#ffffff; line-height:1;">${findingsCount}</div>
                    <div style="font-size:12px; color:#888888; margin-top:6px; text-transform:uppercase; letter-spacing:0.05em;">Total Findings</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 32px 32px;">
              <p style="margin:0 0 24px 0; font-size:14px; color:#CCCCCC; line-height:1.6;">
                Inside the report, you'll find the technical liabilities costing you visibility in AI search, your three-phase fix plan, and the specific moves that will move the needle.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${reportUrl}" style="display:inline-block; padding:14px 28px; background:#FB3B24; color:#ffffff; text-decoration:none; border-radius:999px; font-size:14px; font-weight:500;">View Your Full Report</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px; background:#0A0A0A; border-top:1px solid #212121;">
              <p style="margin:0 0 8px 0; font-size:13px; color:#888888; line-height:1.5;">
                Want to go deeper? Our team can pull your Domain Authority, backlink trust flow, and keyword-level competitor gap analysis using enterprise tools.
              </p>
              <p style="margin:0; font-size:13px; color:#888888; line-height:1.5;">
                Just reply to this email and we'll set up a call.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px; background:#0A0A0A; text-align:center; border-top:1px solid #212121;">
              <p style="margin:0; font-size:12px; color:#666666;">— The Firon Marketing Team</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
