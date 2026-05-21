import { NextResponse } from "next/server";
import { prisma, ContactRevenueRange } from "@audit/db";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_REVENUE = new Set<string>(Object.values(ContactRevenueRange));

const REVENUE_LABELS: Record<ContactRevenueRange, string> = {
  under_5m: "Under $5M",
  five_to_10m: "$5M – $10M",
  over_10m: "Over $10M",
};

async function notifySlack(payload: {
  name: string;
  email: string;
  revenueRange: ContactRevenueRange;
  toolSource: string;
}): Promise<boolean> {
  const webhookUrl = process.env.SLACK_LEADS_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("[contact] SLACK_LEADS_WEBHOOK_URL not set — skipping Slack notification");
    return false;
  }
  const slackPayload = {
    text: `New audit lead — ${payload.name} (${payload.email})`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: "🔥 New Firon Labs lead", emoji: true } },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Name*\n${payload.name}` },
          { type: "mrkdwn", text: `*Email*\n${payload.email}` },
          { type: "mrkdwn", text: `*Revenue*\n${REVENUE_LABELS[payload.revenueRange]}` },
          { type: "mrkdwn", text: `*Tool*\nAI Readiness Audit` },
        ],
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `From audit.fironmarketing.com · ${new Date().toLocaleString()}` },
        ],
      },
    ],
  };
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(slackPayload),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[contact] Slack webhook failed: ${res.status} ${body}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[contact] Slack webhook error:", e);
    return false;
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const emailRaw = typeof body.email === "string" ? body.email.trim() : "";
    const revenueRange = typeof body.revenueRange === "string" ? body.revenueRange : "";
    const toolSource =
      typeof body.toolSource === "string" && body.toolSource.trim()
        ? body.toolSource.trim()
        : "ai-readiness-audit";

    if (!name || name.length < 2) {
      return NextResponse.json({ error: "invalid_name", message: "Please enter your name." }, { status: 400 });
    }
    if (!EMAIL_REGEX.test(emailRaw)) {
      return NextResponse.json({ error: "invalid_email", message: "Enter a valid work email." }, { status: 400 });
    }
    if (!VALID_REVENUE.has(revenueRange)) {
      return NextResponse.json({ error: "invalid_revenue", message: "Pick a revenue range." }, { status: 400 });
    }

    const email = emailRaw.toLowerCase();
    const slackOk = await notifySlack({
      name, email, revenueRange: revenueRange as ContactRevenueRange, toolSource,
    });

    await prisma.contactLead.create({
      data: {
        name, email,
        revenueRange: revenueRange as ContactRevenueRange,
        toolSource,
        slackNotified: slackOk,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { status: "error", message: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
