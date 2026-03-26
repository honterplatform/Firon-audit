# UX/UI Audit Platform

Evidence-first audits for URLs using Playwright screenshots, Lighthouse, axe-core, and deterministic UX heuristics. AI summarizes findings to strict JSON with Zod validation, and reports can be rendered as HTML or exported as PDF.

## Deploy to Railway (recommended)

Everything runs on one Railway project — web app, worker, Postgres, Redis. See [DEPLOY.md](DEPLOY.md) for the full step-by-step guide.

## Deploy with Docker Compose (self-hosted)

Run everything on a single VPS or local machine.

1. **Copy environment file:**
   ```bash
   cp .env.example .env
   # Edit .env and set your OPENAI_API_KEY and POSTGRES_PASSWORD
   ```

2. **Start everything:**
   ```bash
   docker compose up -d
   ```

3. **Run database migrations:**
   ```bash
   docker compose exec web pnpm db:push
   ```

4. **Open the app:** http://localhost:5001

## Local Development

1. **Install dependencies:**
   ```bash
   pnpm install
   pnpm exec playwright install chromium
   ```

2. **Set up environment:**
   ```bash
   cp .env.example .env
   # Edit .env — you need at least DATABASE_URL, REDIS_URL, OPENAI_API_KEY
   ```

3. **Initialize database:**
   ```bash
   pnpm db:push
   ```

4. **Start dev servers:**
   ```bash
   pnpm dev
   ```
   Runs Next.js on http://localhost:5001 and the worker process.

## Running an Audit

```bash
curl -X POST http://localhost:5001/api/audits \
  -H "Content-Type: application/json" \
  -d '{
    "target": "https://example.com",
    "goal": "Increase conversion rate",
    "audience": "Small business owners",
    "primaryCta": "Start free trial",
    "fidelity": "full"
  }'
```

## Environment Variables

See [.env.example](.env.example) for all options. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `OPENAI_API_KEY` | Yes | OpenAI API key for AI summaries |
| `STORAGE_PROVIDER` | No | `local` (default), `supabase`, or `s3` |
| `APP_BASE_URL` | No | Base URL (default: http://localhost:5001) |

## Project Structure

```
/apps
  /web          - Next.js 15 app with API routes and dashboard
  /worker       - BullMQ worker with job processors
/packages
  /db           - Prisma schema and client
  /plugins      - Crawl, Lighthouse, axe, heuristics plugins
  /llm          - OpenAI integration with Zod schemas
  /pipeline     - Storage providers, PDF, contracts, logger
  /ui           - Shared UI components
```

## Job Pipeline

1. `run:crawl` — Screenshots and HTML snapshots (Playwright)
2. `run:lighthouse` — Performance metrics
3. `run:axe` — Accessibility violations
4. `run:heuristics` — Deterministic UX checks
5. `run:summarize` — AI summarization with Zod validation
6. `run:report` — Generate report artifacts
7. `run:notify` — Send webhook (if callbackUrl provided)

Jobs run in parallel where possible, with the orchestrator waiting for completion before summarization.

## Alternative Deployments

You can also deploy the components separately:
- **Web app** → Vercel, Railway, any Node.js host
- **Worker** → Railway, Fly.io, any Docker host
- **Database** → Supabase, Neon, any PostgreSQL
- **Redis** → Upstash, Redis Cloud, any Redis instance
- **Storage** → Local filesystem, Supabase Storage, AWS S3

## Development Commands

- `pnpm dev` — Start web + worker
- `pnpm build` — Build all packages
- `pnpm typecheck` — Type check everything
- `pnpm db:studio` — Open Prisma Studio
- `pnpm db:push` — Push schema to database
