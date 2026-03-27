import Anthropic from '@anthropic-ai/sdk';

let cachedClient: Anthropic | null = null;

export function createAnthropicClient(): Anthropic {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

// Keep old export name for backwards compat during migration
export const createOpenAIClient = createAnthropicClient as any;
