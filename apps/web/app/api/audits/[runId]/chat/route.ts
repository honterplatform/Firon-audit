import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@audit/db';
import { createOpenAIClient } from '@audit/llm';

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

    // Company information - customize this for your brand
    const companyInfo = `ABOUT US:
You are representing an SEO audit and digital marketing services company. We help teams improve their search engine visibility through expert SEO optimization, technical audits, and content strategy.

SERVICES WE OFFER:
- Technical SEO audits & site health optimization
- On-Page optimization (meta tags, headings, content structure)
- Core Web Vitals optimization & page speed improvements
- Link building strategy & backlink analysis
- Content SEO & keyword strategy

WHEN TO MENTION OUR SERVICES:
Naturally offer our services when users ask about implementing fixes, need SEO help, or want professional search optimization assistance.

Always speak in FIRST PERSON: "we", "our", "us". Keep mentions conversational and only when it genuinely adds value.`;

    // Build system prompt with conversational tone
    const systemPrompt = `You are a friendly and knowledgeable SEO expert helping a client understand their SEO audit results. You've reviewed their site (${run.target}) and found ${run.findings.length} SEO issues, with ${highImpactFindings.length} being high-impact. When you mention services or capabilities, speak in first person ("we", "our", "us").

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

    // Call OpenAI with more conversational settings
    const client = createOpenAIClient();
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages as any,
      temperature: 0.85, // Higher temperature for more natural, varied responses
      max_tokens: 500, // Reduced for more concise responses
    });

    const response = completion.choices[0]?.message?.content || 'I apologize, but I could not generate a response.';

    return NextResponse.json({ response });
  } catch (error) {
    console.error('Chat API error:', error);
    
    // Handle specific error cases
    if (error instanceof Error) {
      if (error.message.includes('OPENAI_API_KEY')) {
        return NextResponse.json(
          { error: 'OpenAI API key is not configured. Please check your environment variables.' },
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

