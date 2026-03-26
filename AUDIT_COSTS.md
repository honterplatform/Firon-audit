# Audit Cost Analysis

## Cost Breakdown Per Audit

### 1. OpenAI API Costs (Primary Cost)

#### Summarization (Required per audit)
- **Model**: `gpt-4o-mini`
- **Pricing**: 
  - Input: $0.15 per 1M tokens
  - Output: $0.60 per 1M tokens

**Token Usage Estimate:**
- System prompt: ~2,500 tokens (persona, instructions, schema)
- User prompt: ~3,000-8,000 tokens (varies by website complexity)
  - Hero snapshot content
  - Performance metrics (LCP, CLS, INP, TBT)
  - Accessibility violations
  - Heuristic findings
  - Typography data
  - Image analysis data
  - Content structure
- Output: ~2,000-3,500 tokens (5-8 findings + action plan)

**Average Cost per Audit:**
- Input: ~6,500 tokens = $0.000975
- Output: ~2,500 tokens = $0.0015
- **Total: ~$0.0025 per audit** (typically succeeds on first attempt)
- With retries (max 2): ~$0.003-0.007 per audit (rare)

**Cost per 1,000 audits: ~$2.50 - $7.00**

#### Chat Interface (Optional, per message)
- **Model**: `gpt-4o-mini`
- **Cost per message**: ~$0.0009
  - System prompt: ~800 tokens
  - User message + context: ~2,000 tokens
  - Output: ~1,000 tokens

**Cost per 10 chat messages: ~$0.009**

### 2. Infrastructure Costs (Minimal)

#### Supabase (Database + Storage)
- **Database**: PostgreSQL (free tier: 500MB, typically sufficient)
- **Storage**: Screenshots, HTML snapshots, JSON reports
  - Average per audit: ~2-5MB (desktop + mobile screenshots, HTML, Lighthouse report)
  - Free tier: 1GB storage
  - **Cost**: $0/month (free tier) or minimal if exceeding

#### Redis (BullMQ Queue)
- **Usage**: Job queue for audit processing
- **Cost**: $0 (local Redis) or ~$5-10/month (managed Redis like Upstash free tier)

#### Compute/Server
- **Worker**: Processes audit jobs (local or cloud)
- **Web App**: Next.js application (local or Vercel free tier)
- **Cost**: $0 (local development) or minimal (Vercel free tier: 100GB bandwidth)

### 3. Total Cost Per Audit

**Base Audit Cost:**
- OpenAI summarization: **~$0.0025 - $0.007** (depending on retries)
- Infrastructure: **~$0** (free tiers typically sufficient)
- **Total: ~$0.0025 - $0.007 per audit**

**With Chat Usage:**
- Base audit: $0.0025 - $0.007
- 10 chat messages: $0.009
- **Total: ~$0.0115 - $0.016 per audit with chat**

### 4. Cost Scaling

**Per 1,000 Audits:**
- Without chat: **~$2.50 - $7.00**
- With chat (10 messages per audit): **~$11.50 - $16.00**

**Per 10,000 Audits:**
- Without chat: **~$25 - $70**
- With chat: **~$115 - $160**

**Per 100,000 Audits:**
- Without chat: **~$250 - $700**
- With chat: **~$1,150 - $1,600**

### 5. Cost Optimization Opportunities

1. **Cache similar audits**: If the same URL is audited multiple times, cache results
2. **Reduce prompt size**: Truncate very long content (hero snapshots, violation lists)
3. **Batch processing**: Process multiple audits in parallel to optimize API calls
4. **Use cheaper models**: Already using `gpt-4o-mini` (cheapest GPT-4 variant)
5. **Limit chat context**: Reduce conversation history tokens (currently limited to last 10 messages)

### 6. Cost Monitoring

To monitor costs:
1. **OpenAI Dashboard**: Track API usage and costs
2. **Set usage limits**: Configure spending limits in OpenAI dashboard
3. **Log token usage**: Add logging to track actual token usage per audit
4. **Alert on spikes**: Set up alerts for unexpected cost increases

### 7. Current Implementation Status

✅ **Already Optimized:**
- Using `gpt-4o-mini` (cheapest GPT-4 variant)
- Limiting findings to 8 max
- Limiting chat history to last 10 messages
- Limiting findings context to top 20 in chat
- Retry logic prevents unnecessary retries (max 2)

⚠️ **Potential Optimizations:**
- Add token usage logging
- Cache audit results for identical URLs
- Truncate very long content (accessibility violations, image lists)
- Implement rate limiting for chat API

### 8. Example Cost Scenarios

**Small Team (100 audits/month):**
- Cost: ~$0.25 - $0.70/month
- With chat: ~$1.15 - $1.60/month

**Medium Team (1,000 audits/month):**
- Cost: ~$2.50 - $7.00/month
- With chat: ~$11.50 - $16.00/month

**Large Team (10,000 audits/month):**
- Cost: ~$25 - $70/month
- With chat: ~$115 - $160/month

## Conclusion

**Primary cost driver**: OpenAI API calls for summarization
**Cost per audit**: ~$0.0025 - $0.007 (less than 1 cent)
**Scalability**: Very cost-effective even at scale
**Infrastructure**: Minimal (free tiers typically sufficient)

The audit system is highly cost-effective, with the primary cost being OpenAI API calls. At scale, costs remain low, making it feasible for high-volume usage.

