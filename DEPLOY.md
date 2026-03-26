# Deploy to Railway

Everything runs on Railway: web app, worker, Postgres, and Redis — one project, one bill.

## Prerequisites

- Railway account: https://railway.app (Hobby plan ~$5/mo)
- GitHub repo with this code pushed
- OpenAI API key: https://platform.openai.com/api-keys

## Step 1: Create a Railway project

1. Go to https://railway.app → **New Project**
2. Choose **Deploy from GitHub repo**
3. Select your repository

Railway will create one service automatically. We'll configure it as the **web app** and add the rest.

## Step 2: Add Postgres and Redis

In your Railway project:

1. Click **+ New** → **Database** → **PostgreSQL**
2. Click **+ New** → **Database** → **Redis**

Railway auto-provisions both and makes `DATABASE_URL` and `REDIS_URL` available to your services.

## Step 3: Configure the web app service

Click on the service Railway created from your repo, go to **Settings**:

- **Build Command:**
  ```
  pnpm install --no-frozen-lockfile && pnpm --filter @audit/db db:generate && pnpm --filter @audit/db build && pnpm --filter @audit/pipeline build && pnpm --filter @audit/llm build && pnpm --filter @audit/plugins build && pnpm --filter @audit/ui build && pnpm --filter @audit/web build
  ```

- **Start Command:**
  ```
  pnpm --filter @audit/web start
  ```

Go to **Variables** and add:

```
OPENAI_API_KEY=sk-your-key-here
STORAGE_PROVIDER=local
LOCAL_STORAGE_DIR=./data/uploads
AUTH_SECRET=<generate with: openssl rand -base64 32>
```

Then connect the Postgres and Redis add-ons to this service (Railway will inject `DATABASE_URL` and `REDIS_URL` automatically).

Go to **Settings** → **Networking** → **Generate Domain** to get a public URL.

Once you have the URL, add these variables:

```
APP_BASE_URL=https://your-web-service.up.railway.app
NEXTAUTH_URL=https://your-web-service.up.railway.app
```

## Step 4: Add the worker service

1. In your project, click **+ New** → **GitHub Repo** → select the same repo
2. This creates a second service. Go to **Settings**:

- **Build Command:**
  ```
  pnpm install --no-frozen-lockfile && pnpm --filter @audit/db db:generate && pnpm --filter @audit/db build && pnpm --filter @audit/pipeline build && pnpm --filter @audit/llm build && pnpm --filter @audit/plugins build && pnpm --filter @audit/worker build && pnpm --filter @audit/plugins exec playwright install chromium
  ```

- **Start Command:**
  ```
  pnpm --filter @audit/worker start
  ```

Go to **Variables** and add the same variables:

```
OPENAI_API_KEY=sk-your-key-here
STORAGE_PROVIDER=local
LOCAL_STORAGE_DIR=./data/uploads
APP_BASE_URL=https://your-web-service.up.railway.app
```

Connect the same Postgres and Redis add-ons to this service too.

**Important:** The worker does NOT need a public domain — it runs in the background processing jobs from Redis.

## Step 5: Run database migration

After the first deploy, open the web service's **Settings** and use the **Railway CLI** or the built-in terminal:

```bash
pnpm db:push
```

Or locally, with the Railway CLI:

```bash
npm i -g @railway/cli
railway login
railway link
railway run pnpm db:push
```

## Step 6: Verify

1. Open your web app URL — you should see the homepage
2. Create a test audit
3. Check the worker service logs — you should see it pick up the job

## Architecture on Railway

```
┌─────────────────────────────────┐
│         Railway Project          │
│                                  │
│  ┌──────────┐   ┌──────────┐   │
│  │  Web App  │   │  Worker   │   │
│  │ (Next.js) │   │ (BullMQ)  │   │
│  └─────┬─────┘   └─────┬─────┘   │
│        │               │          │
│  ┌─────┴───────────────┴─────┐   │
│  │         Redis             │   │
│  │      (job queue)          │   │
│  └───────────────────────────┘   │
│                                  │
│  ┌───────────────────────────┐   │
│  │       PostgreSQL          │   │
│  │      (database)           │   │
│  └───────────────────────────┘   │
└─────────────────────────────────┘
```

## Costs

- **Railway Hobby Plan:** $5/mo base + usage
- **Typical total:** $5-15/mo depending on audit volume
- **OpenAI:** ~$0.003 per audit (negligible)

## Troubleshooting

**Build fails:**
- Check that all env vars are set
- Check build logs for specific errors

**Worker not processing jobs:**
- Make sure worker's `REDIS_URL` points to the same Redis as the web app
- Check worker logs in Railway dashboard

**Storage issues:**
- For Railway, `local` storage uses the service's filesystem (ephemeral)
- For persistent storage, switch to `s3` or use Railway's volume feature
