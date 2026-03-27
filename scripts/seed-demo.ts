const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const run = await prisma.auditRun.create({
    data: {
      target: 'https://fironmarketing.com',
      status: 'completed',
      startedAt: new Date(),
      completedAt: new Date(),
      inputsJson: {
        target: 'https://fironmarketing.com',
        fidelity: 'full',
      },
      summaryJson: {
        findings: [
          {
            issue: 'Hero section lacks a clear value proposition',
            why: 'Visitors need to understand what Firon offers within 3 seconds of landing. The current hero is visually strong but the headline is too vague to drive conversions.',
            fix: 'Rewrite the hero headline to focus on the specific outcome clients get — e.g. "We build marketing systems that generate leads on autopilot"',
            impact: 'High',
            effort: 'Small',
            kind: 'Copywriting',
            evidenceRefs: [],
          },
          {
            issue: 'No social proof visible above the fold',
            why: 'Trust signals like client logos, testimonials, or case study metrics dramatically increase conversion rates. Without them, visitors bounce before scrolling.',
            fix: 'Add a row of client logos or a short testimonial directly below the hero section, visible without scrolling.',
            impact: 'High',
            effort: 'Small',
            kind: 'Marketing Strategy',
            evidenceRefs: [],
          },
          {
            issue: 'Primary CTA button has low contrast and unclear action',
            why: 'The main call-to-action blends into the page and uses generic text. Users need a visually prominent button with specific language about what happens next.',
            fix: 'Increase the CTA button size and contrast. Change text from generic "Get Started" to something specific like "Book a Free Strategy Call".',
            impact: 'Medium',
            effort: 'Small',
            kind: 'UX/UI',
            evidenceRefs: [],
          },
          {
            issue: 'Services section doesn\'t connect to client outcomes',
            why: 'Listing services without tying them to results makes Firon look like every other agency. Visitors want to know what they\'ll achieve, not just what you do.',
            fix: 'Reframe each service as a benefit. Instead of "SEO Services" → "Get found by your ideal customers with SEO that drives qualified traffic".',
            impact: 'Medium',
            effort: 'Medium',
            kind: 'Copywriting',
            evidenceRefs: [],
          },
        ],
        plan: {
          quickWins: [
            'Rewrite hero headline with a clear value proposition',
            'Add client logos below the fold',
            'Update CTA button copy and increase contrast',
          ],
          next: [
            'Reframe services as client outcomes',
            'Add case study metrics to build trust',
          ],
          experiments: [
            {
              hypothesis: 'A specific headline will increase scroll depth by 20%',
              variant: 'Test outcome-focused headline vs current',
              metric: 'Scroll depth and CTA click rate',
            },
          ],
        },
      },
      findings: {
        create: [
          {
            issue: 'Hero section lacks a clear value proposition',
            why: 'Visitors need to understand what Firon offers within 3 seconds of landing. The current hero is visually strong but the headline is too vague to drive conversions.',
            fix: 'Rewrite the hero headline to focus on the specific outcome clients get — e.g. "We build marketing systems that generate leads on autopilot"',
            impact: 'High',
            effort: 'Small',
            kind: 'Copywriting',
          },
          {
            issue: 'No social proof visible above the fold',
            why: 'Trust signals like client logos, testimonials, or case study metrics dramatically increase conversion rates. Without them, visitors bounce before scrolling.',
            fix: 'Add a row of client logos or a short testimonial directly below the hero section, visible without scrolling.',
            impact: 'High',
            effort: 'Small',
            kind: 'MarketingStrategy',
          },
          {
            issue: 'Primary CTA button has low contrast and unclear action',
            why: 'The main call-to-action blends into the page and uses generic text. Users need a visually prominent button with specific language about what happens next.',
            fix: 'Increase the CTA button size and contrast. Change text from generic "Get Started" to something specific like "Book a Free Strategy Call".',
            impact: 'Medium',
            effort: 'Small',
            kind: 'UXUI',
          },
          {
            issue: 'Services section doesn\'t connect to client outcomes',
            why: 'Listing services without tying them to results makes Firon look like every other agency. Visitors want to know what they\'ll achieve, not just what you do.',
            fix: 'Reframe each service as a benefit. Instead of "SEO Services" → "Get found by your ideal customers with SEO that drives qualified traffic".',
            impact: 'Medium',
            effort: 'Medium',
            kind: 'Copywriting',
          },
        ],
      },
    },
  });

  console.log(`Demo audit created: ${run.id}`);
  console.log(`View at: http://localhost:5001/audits/${run.id}`);
}

main().catch(console.error);
