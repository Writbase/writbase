# Deployment Guide

## Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [Supabase CLI](https://supabase.com/docs/guides/cli) v2+
- A [Supabase](https://supabase.com) account and project

## Supabase Cloud (Recommended)

The [Supabase free tier](https://supabase.com/pricing) includes everything WritBase needs — no credit card, no Docker:
- 500MB database storage
- 50,000 monthly active users
- 500,000 Edge Function invocations
- Unlimited API requests
- Auto-pauses after 7 days of inactivity (wakes on next request)

### 1. Create a Supabase Project

Create a new project at [supabase.com/dashboard](https://supabase.com/dashboard). Note your:
- **Project Reference ID** (Settings > General)
- **Database Password** (set during creation)
- **Project URL** (`https://<project-ref>.supabase.co`)
- **Publishable Key** (Settings > API, also called "anon key")

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
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = your Supabase anon/publishable key

**Option B: Self-hosted**

```bash
# Create .env.local
echo "NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co" > .env.local
echo "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<your-anon-key>" >> .env.local

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

## Self-Hosted Supabase

### Minimal Profile (5 containers)

WritBase only uses 5 of Supabase's ~13 services. You can run a minimal deployment on a 2GB VPS:

| Service | Container | Role |
|---------|-----------|------|
| `db` | Postgres 17 | Database (tasks, permissions, audit log) |
| `auth` | GoTrue | User signup/login for the dashboard |
| `rest` | PostgREST | Auto-generated REST API from Postgres schema |
| `kong` | Kong | API gateway — routes all traffic through `:8000` |
| `edge_runtime` | Deno Edge Runtime | Hosts the MCP server Edge Function |

**Not required by WritBase** (safe to omit):
- `realtime` — WritBase uses webhooks, not Realtime subscriptions
- `storage` — No file uploads
- `studio` — Database admin UI (use `psql` or any Postgres client instead)
- `imgproxy` — Image transformation (depends on Storage)
- `analytics` / `logflare` / `vector` — WritBase has its own `request_log` table
- `supavisor` — Connection pooler (disabled in WritBase config)
- `postgres-meta` — Metadata API for Studio
- `inbucket` — Fake SMTP for local email testing

### Setup

1. **Clone the official Supabase Docker setup**:

   ```bash
   git clone --depth 1 https://github.com/supabase/supabase
   cd supabase/docker
   cp .env.example .env
   ```

2. **Generate secrets** and edit `.env`:
   - `POSTGRES_PASSWORD` — strong random password
   - `JWT_SECRET` — 32+ character secret for JWT signing
   - `ANON_KEY` / `SERVICE_ROLE_KEY` — generate with `supabase init` or the [JWT generator](https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys)

3. **Start only required services**:

   ```bash
   docker compose up db auth rest kong edge_runtime -d
   ```

4. **Apply WritBase schema**: From your WritBase directory:

   ```bash
   # Point to your self-hosted instance
   supabase db push --db-url postgresql://postgres:<password>@<host>:5432/postgres
   ```

5. **Deploy the MCP Edge Function**: Copy the function to the Edge Runtime's functions directory, or use the Supabase CLI:

   ```bash
   supabase functions deploy mcp-server --no-verify-jwt --project-ref <self-hosted-ref>
   ```

6. **Deploy the Next.js dashboard**:

   ```bash
   cp .env.example .env.local
   # Edit .env.local:
   #   NEXT_PUBLIC_SUPABASE_URL=http://<host>:8000
   #   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<your-anon-key>
   npm run build && npm start
   ```

### Kong Routing

Kong exposes all services through a single port (`:8000`):
- `:8000/auth/v1/*` → GoTrue (authentication)
- `:8000/rest/v1/*` → PostgREST (database API)
- `:8000/functions/v1/*` → Edge Runtime (MCP server)

### Caveats

- **pg_cron**: Not included in Docker setup. Migrations 00012, 00015, 00016 are skipped automatically (conditional `DO` blocks).
- **Edge Runtime**: Uses Deno 2.1.4. Ensure `deno.lock` is not present (see note in Cloud section above).
- **DNS/TLS**: Configure HTTPS for MCP clients that require secure transport. Use a reverse proxy (nginx, Caddy) in front of Kong.
- **Email confirmation**: GoTrue defaults to requiring email confirmation. For testing, set `GOTRUE_MAILER_AUTOCONFIRM=true` in the GoTrue environment.
- **No Studio UI**: Without Studio, manage the database via `psql`, pgAdmin, or any Postgres client.

## Environment Variables Reference

| Variable | Where | Required | Description |
|----------|-------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Next.js | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Next.js | Yes | Supabase anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions | Auto | Set automatically by Supabase |
| `ALLOWED_ORIGINS` | Edge Functions | Production | Comma-separated allowed CORS origins |
| `ENVIRONMENT` | Edge Functions | No | Set to "production" for production |
| `SENTRY_DSN` | Edge Functions | No | Sentry DSN for error tracking |
