<div align="center">

# WritBase

**MCP-native task management for AI agent fleets**

A control plane for AI agents and human supervisors. Persistent task registry with scoped permissions, inter-agent delegation, and full provenance — all accessible via MCP.

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/dynreadme/writbase/ci.yml?label=CI)](https://github.com/dynreadme/writbase/actions)
[![MCP Compatible](https://img.shields.io/badge/MCP-compatible-green.svg)](https://modelcontextprotocol.io)

</div>

---

## Why WritBase?

AI agents need a shared, persistent task registry — not ephemeral in-memory state that vanishes between sessions. WritBase gives your agent fleet:

- **One source of truth** — Tasks live in Postgres, not scattered across files and chat threads
- **Scoped permissions** — Each agent gets exactly the access it needs, nothing more
- **Full provenance** — Every change is recorded: who, what, when, and why
- **Inter-agent delegation** — Agents can assign tasks to each other with depth limits and cycle detection
- **MCP-native** — Agents connect via the Model Context Protocol, no custom integration needed

## Quickstart

### 1. Deploy WritBase

The fastest path uses [Supabase Cloud](https://supabase.com) (free tier: 500MB DB, 50K MAUs, 500K Edge Function invocations — no credit card, no Docker):

```bash
# Clone and install
git clone https://github.com/dynreadme/writbase.git
cd writbase && npm install

# Create a free Supabase project at supabase.com/dashboard
# Then link, push schema, and deploy the MCP server:
supabase link --project-ref <your-project-ref>
supabase db push
supabase functions deploy mcp-server --no-verify-jwt

# Start the dashboard
cp .env.example .env.local
# Edit .env.local with your Supabase project URL and publishable key
npm run dev
```

See the [Deployment Guide](docs/deployment.md) for production deployment, Vercel hosting, and self-hosted Supabase options.

### 2. Create an Agent Key

Sign up at your WritBase dashboard, create a project, then create an agent key from the Agent Keys page. You'll receive a key in the format `wb_<key_id>_<secret>` — save it, it's shown only once.

### 3. Connect Your MCP Client

**Claude Code:**
```bash
claude mcp add writbase \
  --transport http \
  --url https://<project-ref>.supabase.co/functions/v1/mcp-server/mcp \
  --header "Authorization: Bearer wb_<key_id>_<secret>"
```

See the [MCP Config Reference](docs/mcp-config-reference.md) for Cursor, Windsurf, VS Code, and other clients.

## MCP Tools

### Worker Tools (all agents)

| Tool | Description |
|------|-------------|
| `info` | Agent identity, permissions, and system metadata |
| `get_tasks` | List tasks with filtering, pagination, and full-text search |
| `add_task` | Create a task in permitted scope |
| `update_task` | Update a task with optimistic concurrency control |

### Manager Tools (manager agents only)

| Tool | Description |
|------|-------------|
| `manage_agent_keys` | Create, update, deactivate, rotate agent keys |
| `manage_agent_permissions` | Grant/revoke permissions with subset enforcement |
| `get_provenance` | Query the append-only audit log |
| `manage_projects` | Create, rename, archive projects |
| `manage_departments` | Create, rename, archive departments |
| `subscribe` | Register webhooks for task event notifications |
| `discover_agents` | Find agents by capability and skill |

## Features

- **Multi-tenant workspaces** — Signup auto-provisions an isolated workspace
- **Dynamic MCP schema** — Tool visibility and parameter enums adapt per agent's role and permissions
- **5 permission types** — `can_read`, `can_create`, `can_update`, `can_assign`, `can_comment`
- **Project + department scoping** — Permissions are granted per (project, department) pair
- **Optimistic concurrency** — Version-based conflict detection prevents silent overwrites
- **Cursor pagination** — Efficient traversal of large task sets
- **Rate limiting** — Per-agent-key request throttling
- **Request logging** — Every MCP call logged with latency, status, and agent context

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│  MCP Client │────▶│  Edge Function   │────▶│   Postgres   │
│  (Agent)    │◀────│  (Hono + MCP SDK)│◀────│  (Supabase)  │
└─────────────┘     └──────────────────┘     └──────────────┘
                           │
                    ┌──────┴──────┐
                    │  Next.js 16 │
                    │  Dashboard  │
                    └─────────────┘
```

- **Backend**: Supabase (Postgres + Edge Functions with Deno runtime)
- **Transport**: Streamable HTTP (MCP SDK)
- **Frontend**: Next.js 16 (App Router) + Tailwind CSS
- **Auth**: Supabase Auth (humans) + SHA-256 agent keys (agents)

## Deployment Options

| | Supabase Cloud (recommended) | Self-Hosted Supabase |
|---|---|---|
| Setup | Create project → `supabase db push` → done | Docker Compose (5 containers) |
| Cost | [Free tier](https://supabase.com/pricing): 500MB DB, 50K MAUs | Your infrastructure |
| Dashboard | Deploy to Vercel (free) | Self-host Next.js |
| Updates | Automatic platform updates | Manual |
| Control | Supabase-managed | Full |

See [docs/deployment.md](docs/deployment.md) for detailed setup instructions.

## Documentation

- [Quickstart](docs/quickstart.md) — Connect Claude Code in 5 minutes
- [Deployment Guide](docs/deployment.md) — Supabase Cloud, Vercel, and self-hosted setup
- [Core Concepts](docs/concepts.md) — Permissions, provenance, error codes, delegation
- [MCP Config Reference](docs/mcp-config-reference.md) — Client configs for Claude Code, Cursor, VS Code, Windsurf

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, testing, and PR guidelines.

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## License

Apache 2.0 — see [LICENSE](LICENSE).
