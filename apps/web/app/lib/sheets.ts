// Google Sheet append helper. Mirrors the pattern used by the Firon Labs
// sister project so both apps write into the same shared workbook. The
// Apps Script doPost(e) on the receiving end validates the shared secret,
// looks up the target tab, and appends the row.
//
// Fire-and-forget by design. Never throw. Never delay the primary flow.
// Callers should invoke with `void` and continue immediately.

export async function appendToSheet(sheetName: string, row: unknown[]): Promise<void> {
  const url = process.env.SHEETS_WEBHOOK_URL;
  const secret = process.env.SHEETS_WEBHOOK_SECRET;
  if (!url || !secret) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret, sheet: sheetName, row }),
      redirect: 'follow',
      signal: controller.signal,
    });
  } catch {
    // fire-and-forget; swallow all errors so the caller's primary flow
    // (DB write, Slack notify, queue enqueue) is never blocked or broken
    // by a Sheets outage.
  } finally {
    clearTimeout(timer);
  }
}
