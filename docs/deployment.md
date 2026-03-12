# Deployment Guide

## Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [Supabase CLI](https://supabase.com/docs/guides/cli) v2+
- A [Supabase](https://supabase.com) account and project

## Supabase Cloud (Recommended)

### 1. Create a Supabase Project

Create a new project at [supabase.com/dashboard](https://supabase.com/dashboard). Note your:
- **Project Reference ID** (Settings > General)
- **Database Password** (set during creation)
- **Project URL** (`https://<project-ref>.supabase.co`)
- **Anon Key** (Settings > API)

### 2. Clone and Install

```bash
git clone https://github.com/dynreadme/writbase.git
cd writbase
npm install
```

### 3. Link Supabase Project

```bash
supabase link --project-ref <your-project-ref>
```

You'll need a [Supabase access token](https://supabase.com/dashboard/account/tokens).

### 4. Push Database Migrations

```bash
supabase db push
```

This applies all 20 migrations to create the schema, RLS policies, functions, and triggers. Some migrations include conditional `pg_cron` setup — these are skipped automatically if `pg_cron` is not available on your plan.

### 5. Deploy Edge Functions

```bash
supabase functions deploy mcp-server --no-verify-jwt
```

The `--no-verify-jwt` flag is required because the MCP endpoint uses agent key authentication, not Supabase JWT auth.

**Important**: If you see a `deno.lock` file in the repository, do NOT commit it. Deno >=2.6 generates lockfile v5 which is incompatible with the Supabase Edge Runtime (Deno 2.1.4). Delete any generated `deno.lock` and let the runtime resolve dependencies from `deno.json`.

### 6. Set Edge Function Secrets

```bash
supabase secrets set ALLOWED_ORIGINS="https://your-domain.com"
supabase secrets set ENVIRONMENT="production"
```

### 7. Verify MCP Endpoint

```bash
curl -sf https://<project-ref>.supabase.co/functions/v1/mcp-server/health
```

Expected response: `{"status":"ok","service":"writbase-mcp-server","request_id":"..."}`

### 8. Deploy Next.js Dashboard

**Option A: Vercel (Recommended)**

Connect your repository to [Vercel](https://vercel.com). It auto-deploys on every push to `main`.

Set these environment variables in Vercel:
- `NEXT_PUBLIC_SUPABASE_URL` = `https://<project-ref>.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your Supabase anon key

**Option B: Self-hosted**

```bash
# Create .env.local
echo "NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co" > .env.local
echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>" >> .env.local

# Build and start
npm run build
npm start
```

### 9. Sign Up

Visit your dashboard URL, sign up with email and password. A workspace is automatically created for you.

## CI/CD Pipeline

The repository includes GitHub Actions workflows:

- **CI** (`.github/workflows/ci.yml`): Runs on all pushes and PRs — format check, lint, build, test (Node.js + Deno)
- **Deploy** (`.github/workflows/deploy.yml`): Runs on push to `main` — CI checks, then deploys Supabase migrations and Edge Functions

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI access token |
| `SUPABASE_PROJECT_REF` | Your project reference ID |
| `SUPABASE_DB_PASSWORD` | Database password |

The deploy workflow handles Supabase only. Next.js deployment is handled by the Vercel GitHub integration.

## Advanced: Self-Hosted Supabase

For full control, you can self-host Supabase using Docker Compose. This runs ~11 containers (Postgres, Auth, Storage, Realtime, etc.).

Refer to the [Supabase self-hosting guide](https://supabase.com/docs/guides/self-hosting/docker) for setup. Key caveats:

- **pg_cron**: Not included in default Docker setup. Migrations 00012, 00015, 00016 will be skipped (conditional `DO` blocks).
- **Edge Runtime**: Uses Deno 2.1.4. Ensure `deno.lock` is not present (see note above).
- **DNS/TLS**: You'll need to configure HTTPS for MCP clients that require secure transport.

## Environment Variables Reference

| Variable | Where | Required | Description |
|----------|-------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Next.js | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Next.js | Yes | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions | Auto | Set automatically by Supabase |
| `ALLOWED_ORIGINS` | Edge Functions | Production | Comma-separated allowed CORS origins |
| `ENVIRONMENT` | Edge Functions | No | Set to "production" for production |
| `SENTRY_DSN` | Edge Functions | No | Sentry DSN for error tracking |
