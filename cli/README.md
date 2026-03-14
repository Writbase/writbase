# WritBase CLI

Self-hosted operator toolkit for WritBase — agent-first task management.

## Quick Start

```bash
npx writbase init       # Interactive setup
npx writbase migrate    # Apply database schema
npx writbase key create # Create your first agent key
npx writbase status     # Verify everything works
```

## Prerequisites

- **Node.js 18+**
- **Supabase CLI** — [Install guide](https://supabase.com/docs/guides/cli)
- A Supabase project (hosted or local)

## Commands

### `writbase init`

Interactive setup wizard. Detects local Supabase instances, validates credentials, and writes a `.env` file.

Handles three scenarios:
- **Hosted Supabase** — prompts for URL, service role key, and database URL
- **Local Supabase** — auto-detects credentials via `supabase status`
- **No project yet** — offers to run `supabase init` + `supabase start`

### `writbase migrate`

Applies all WritBase database migrations using `supabase migration up`.

```bash
writbase migrate            # Apply migrations
writbase migrate --dry-run  # Preview without applying
```

Bundles migrations from the WritBase repo and runs them against your database via a temporary project structure. No files are created in your working directory.

### `writbase key create`

Interactive agent key creation. Prompts for name, role (worker/manager), and optional project/department scoping.

```bash
writbase key create
# Key name: my-agent
# Role: worker
# ✓ Agent key created
# ⚠ Save this key now — it cannot be retrieved later:
#   wb_<uuid>_<secret>
```

### `writbase key list`

List all agent keys in the workspace.

```bash
writbase key list
```

### `writbase key rotate <name-or-id>`

Generate a new secret for an existing key. The old secret stops working immediately.

```bash
writbase key rotate my-agent
```

### `writbase key deactivate <name-or-id>`

Deactivate a key. Supports lookup by name or ID prefix.

```bash
writbase key deactivate my-agent
```

### `writbase status`

Health check — validates connection and shows resource counts.

```bash
writbase status
# ✓ Connected to Supabase
# ℹ Workspace: <uuid>
#
#  Resource   │ Count
# ────────────┼───────
#  Agent Keys │ 3
#  Tasks      │ 42
#  Projects   │ 2
```

## Environment Variables

WritBase CLI reads from `.env` in the current directory:

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (full admin access) |
| `DATABASE_URL` | Direct Postgres connection string |
| `WRITBASE_WORKSPACE_ID` | UUID of the workspace to operate on |

## Troubleshooting

### pg_cron notice on local dev

Some migrations reference `pg_cron` which isn't available locally. These are conditional and will be skipped — the notice is expected.

### Finding DATABASE_URL

In the Supabase dashboard: **Settings → Database → Connection string → URI**. If the password contains special characters, it must be percent-encoded.

### Migration errors

If `writbase migrate` fails, ensure:
1. The Supabase CLI is installed and up to date
2. `DATABASE_URL` is correct and the database is accessible
3. Run with `--dry-run` first to preview changes
