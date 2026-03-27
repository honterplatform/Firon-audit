import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@audit/db';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await context.params;
    const body = await request.json();
    const { message, conversationHistory } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Fetch audit run with findings and artifacts
    const run = await prisma.auditRun.findUnique({
      where: { id: runId },
      include: {
        findings: {
          orderBy: [
            { impact: 'desc' },
            { createdAt: 'asc' },
          ],
        },
        artifacts: true,
      },
    });

    if (!run) {
      return NextResponse.json(
        { error: 'Audit run not found' },
        { status: 404 }
      );
    }

    // Parse summary if it exists
    const summary = run.summaryJson as any;

    // Build a natural, conversational summary of findings
    const highImpactFindings = run.findings.filter(f => f.impact === 'High').slice(0, 15);
    
    // Create natural language summaries grouped by theme
    const findingsByKind = highImpactFindings.reduce((acc, f) => {
      if (!acc[f.kind]) acc[f.kind] = [];
      acc[f.kind].push(f);
      return acc;
    }, {} as Record<string, typeof highImpactFindings>);

    // Build a conversational overview
    let findingsOverview = `I found ${run.findings.length} issues on the site. The most critical ones (${highImpactFindings.length} high-impact) include: `;
    
    const kindSummaries: string[] = [];
    for (const [kind, findings] of Object.entries(findingsByKind)) {
      if (findings.length > 0) {
        const issues = findings.map(f => f.issue).join(', ');
        kindSummaries.push(`${findings.length} ${kind} issue${findings.length > 1 ? 's' : ''} like "${issues}"`);
      }
    }
    findingsOverview += kindSummaries.join(', ') + '. ';
    
    // Add a few key details in natural language (not structured)
    const keyDetails = highImpactFindings.slice(0, 5).map(f => {
      return `One issue is "${f.issue}" - ${f.why.toLowerCase()} The fix is to ${f.fix.toLowerCase()}.`;
    }).join(' ');
    
    const allFindingsSummary = findingsOverview + keyDetails;
    
    // Store full findings for reference (but formatted more naturally)
    const findingsReference = run.findings.slice(0, 20).map((f, idx) => {
      return `Issue ${idx + 1}: ${f.issue}. Why it matters: ${f.why} How to fix: ${f.fix}. Impact: ${f.impact}, Effort: ${f.effort}, Team: ${f.kind}.`;
    }).join('\n');

    // Build action plan context in natural language
    let actionPlanContext = '';
    if (summary?.plan) {
      const plan = summary.plan;
      const quickWins = plan.quickWins?.length > 0 ? `Quick wins include: ${plan.quickWins.slice(0, 3).join(', ')}.` : '';
      const nextSteps = plan.next?.length > 0 ? `Next steps: ${plan.next.slice(0, 3).join(', ')}.` : '';
      actionPlanContext = `${quickWins} ${nextSteps}`.trim();
    }

    // Firon Marketing knowledge base
    const companyInfo = `ABOUT FIRON MARKETING (YOU ARE PART OF THE FIRON TEAM):
You are an SEO expert at Firon Marketing. Firon is a performance media agency that engineers growth for the AI era. We unify Paid Media and GEO (Generative Engine Optimization) with Business Intelligence tools to secure contribution margins in the future economy.

We specialize in Shopify Plus & Subscription DTC brands, working with high-growth e-commerce and SaaS founders seeking sustainable, profitable scaling.

OUR THREE CORE SERVICES:

1. PAID MEDIA — "The Growth Engine"
Full-funnel campaigns on Meta, Google, and beyond — optimized for profit, not vanity metrics. We care about what hits your bottom line, not what looks good in a dashboard. We use a "Profitability Protocol" focused on acquisition, conversion, and retention.

2. AI SEARCH & VISIBILITY (GEO) — "Recommendation Engineering"
Search is changing fast. AI tools like ChatGPT and Perplexity are becoming how people find brands. Most companies aren't showing up. We make sure you do. We evaluate brands across Clarity (is your data architecture readable by LLM crawlers?), Credibility (do you have authoritative proof?), and Reputation (does the internet trust you enough for AI recommendation?).

3. DATA & BUSINESS INTELLIGENCE — "The Unified Truth"
We connect ad spend to actual revenue so you can see what's working and stop guessing. One clear picture, no black boxes. We build custom BI infrastructure in your own Google Cloud environment — owned assets, not rented dashboards.

OUR DIFFERENTIATORS:
- We optimize for profit (contribution margin), not ROAS or vanity metrics
- Senior people start to finish — no juniors, no handoffs
- Growth that holds up — sustainable, compounding returns
- Capital deployment with predictable, scalable returns

OUR TEAM:
- Alexander Jordan (Founder, CEO): 15+ years scaling brands, focused on sustainable revenue models
- Cassie Chernin (Head of Growth): 12+ years performance marketing, 8-figure scale experience
- Derick (Head of SEO): 12+ years engineering visibility, pioneer of the Agentic Commerce Protocol (ACP)

PROVEN RESULTS:
- 97K+ leads acquired at $1.13 CPL (beat $1.20 target)
- 650% traffic growth (40K to 300K monthly users)
- 1,500+ top-3 keyword rankings

OUR FREE AUDIT:
We offer a free audit that shows exactly where spend is leaking and where the biggest opportunities are. No pitch deck, no fluff — just an honest look at what's working and what isn't.

WHEN TO MENTION FIRON SERVICES:
Naturally offer our services when users ask about implementing fixes, need help with SEO/GEO, paid media, or data infrastructure. Always speak in FIRST PERSON: "we", "our", "us". Keep mentions conversational and only when it genuinely adds value.`;

    // Build system prompt with conversational tone
    const systemPrompt = `You are an SEO expert at Firon Marketing, helping a client understand their SEO audit results. You've reviewed their site (${run.target}) and found ${run.findings.length} SEO issues, with ${highImpactFindings.length} being high-impact. You represent Firon — when you mention services or capabilities, speak in first person ("we", "our", "us"). You know Firon's full service offering and can recommend relevant services when appropriate.

IMPORTANT: You are having a CONVERSATION, not reading from a report.
- DO NOT copy findings verbatim or use structured bullet points
- DO synthesize information naturally and explain it like you're talking to a friend
- DO use casual, conversational language ("Here's what I found...", "The main SEO issue is...", "You should prioritize...")
- DO explain things in plain English, not technical documentation format
- DO reference findings naturally when relevant, but don't just list them
- DO provide context and reasoning, not just facts

AUDIT OVERVIEW (synthesize this naturally in your responses):
${allFindingsSummary}

FULL FINDINGS REFERENCE (use this when you need specific details, but always explain naturally):
${findingsReference}
${actionPlanContext ? `\n\nAction plan: ${actionPlanContext}` : ''}

${companyInfo}

When the user asks questions:
- Keep responses CONCISE and to the point - aim for 2-4 sentences maximum, only expand if the question requires detailed explanation
- Answer naturally and conversationally, as if you're explaining your SEO analysis over coffee
- NEVER quote findings verbatim - always paraphrase and explain in your own words
- Synthesize multiple SEO findings into coherent insights and themes
- Provide practical, actionable SEO advice in plain language
- Explain the "why" behind recommendations in accessible terms
- Use examples, analogies, and real-world comparisons when helpful (but keep them brief)
- Show enthusiasm about quick wins and be empathetic about challenges
- If asked about specific findings, explain them naturally: "So there's this SEO issue where..." instead of "Finding #3: Issue: ..."
- Connect findings to search visibility, rankings, and business impact in relatable terms
- When relevant, naturally offer our services in FIRST PERSON (e.g., "We can help you implement this" or "Our team can tackle this for you"), but only when it genuinely adds value to the conversation
- Always use "we", "our", "us" - never third person
- PRIORITIZE BREVITY: Get to the point quickly, avoid unnecessary elaboration

CRITICAL: Write like you're talking to a friend, not like you're reading from a database. Use natural transitions, conversational phrases, and personal insights.`;

    // Build conversation messages
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    // Add conversation history (last 10 messages to avoid token limits)
    const recentHistory = (conversationHistory || []).slice(-10);
    for (const msg of recentHistory) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    // Add current message
    messages.push({ role: 'user', content: message });

    // Call Claude
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const systemMsg = messages.find(m => m.role === 'system')?.content || '';
    const claudeMessages = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const completion = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: systemMsg,
      messages: claudeMessages,
      temperature: 0.85,
    });

    const textBlock = completion.content.find(b => b.type === 'text');
    const response = textBlock?.text || 'I apologize, but I could not generate a response.';

    return NextResponse.json({ response });
  } catch (error) {
    console.error('Chat API error:', error);

    // Handle specific error cases
    if (error instanceof Error) {
      if (error.message.includes('ANTHROPIC_API_KEY')) {
        return NextResponse.json(
          { error: 'Anthropic API key is not configured. Please check your environment variables.' },
          { status: 500 }
        );
      }
      if (error.message.includes('not found')) {
        return NextResponse.json(
          { error: 'Audit run not found' },
          { status: 404 }
        );
      }
    }
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process chat message. Please try again.' },
      { status: 500 }
    );
  }
}

