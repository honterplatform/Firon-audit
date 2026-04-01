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

FIRON'S PROPRIETARY FRAMEWORKS — use these when discussing findings:

LIABILITY FRAMEWORKS (how we name problems):
- "The Identity Void" — missing H1s or meta descriptions. The page is a blank slate to crawlers.
- "The Empty Aisle" — empty metadata on pages. AI robots see empty shelves and send customers to competitors.
- "Identity Collision" — conflicting signals (multiple H1s, bad canonicals). AI defaults to competitors.
- "Hallucination Risk" — missing FAQ/schema. AI guesses specs and may give customers wrong info.
- "The Review Vacuum" — good reputation not hard-coded in schema. AI skips you for "best" queries.
- "Sitemap Decay" — 404s and redirects in sitemap. Google thinks the site is poorly maintained.
- "The Invisibility Tax" — the cumulative revenue cost of all technical gaps. Every day unfixed = money lost.

SOLUTION FRAMEWORKS (how we pitch fixes):
- "Velocity Engine" — our automated bulk metadata and schema fix. Turns the lights on overnight.
- "Structured Attribute Model" — machine-readable data AI requires to recommend confidently.
- "Answer-First" content — 40-60 word direct-answer paragraphs AI can cite in Overviews.
- "The Cluster Bomb" — 50+ interlinked content pieces to dominate a Knowledge Graph topic.

THREE-PHASE METHODOLOGY (how we structure the fix):
- Phase 1: Infrastructure Sprint — fix technical foundation (metadata, schema, sitemap)
- Phase 2: AEO & GEO — structured data overhaul, AI-optimized content, trust engineering
- Phase 3: Scale & Authority Amplification — content clusters, AI advertising, ranking push

OBJECTION HANDLERS:
- "I already have an SEO agency" → "They optimize for Humans; we optimize for Robots. Traditional SEO won't get you recommended by ChatGPT."
- "SEO takes too long" → "Ads are rent — you pay every month. SEO is a well — once we dig it, you own the source forever."
- "We're already ranking well" → "Ranking on Google is table stakes. The question is: when someone asks ChatGPT for a recommendation, do they mention you?"

WHEN TO USE FRAMEWORKS:
- Always frame technical issues as business liabilities using the named frameworks
- Always connect issues to the Invisibility Tax (lost revenue)
- When users ask about fixes, pitch Firon's three-phase approach
- When users push back, use the objection handlers naturally
- Always speak in FIRST PERSON: "we", "our", "us"
- Be conversational but urgent — make them feel the cost of inaction`;

    // Build system prompt with conversational tone
    const systemPrompt = `You are a senior SEO strategist at Firon Marketing, helping a prospect understand their audit results. You've reviewed their site (${run.target}) and found ${run.findings.length} issues, with ${highImpactFindings.length} being high-impact. You speak as Firon ("we", "our", "us") and you sell with urgency.

YOUR GOAL: Make the prospect feel the business cost of their technical gaps, then position Firon as the solution. You're not just explaining — you're consulting.

CONVERSATION RULES:
- Frame every technical issue as a BUSINESS LIABILITY using Firon's named frameworks (Identity Void, Empty Aisle, Invisibility Tax, etc.)
- Connect issues to LOST REVENUE, not just "SEO best practices"
- When they ask about fixes, pitch Firon's specific solutions by name (Velocity Engine, Cluster Bomb, etc.)
- Reference the three-phase methodology: Infrastructure Sprint → AEO & GEO → Scale & Authority
- Be conversational, direct, and urgent — like a trusted advisor, not a robot
- Keep responses concise (2-4 sentences) unless they ask for detail
- Never quote findings verbatim — always reframe in business terms

MANUAL AUDIT UPSELL — CRITICAL TRIGGER:
If the user asks ANY of these (or similar): "Is this all?", "How do I fix this?", "What about my competitors?", "What about backlinks?", "Can you show me more data?", "What's my domain authority?", you MUST pivot to selling a manual audit:

Say something like: "Great question — I'm a technical diagnostic tool, so I can see that your code has issues blocking AI crawlers. But I can't pull your actual Domain Authority, your competitor's traffic splits, or your backlink trust flow. To get the quantitative data on exactly how much money this is costing you, I'd recommend speaking with one of our human analysts who use enterprise tools like Search Atlas to pull those metrics. Want me to connect you?"

Always end the pivot with a question that drives action: "Want me to connect you?" or "Should I set up a call with our team?"

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

